"""
marketing_services_classifier.py — build a targeted list of Greek marketing
agencies / freelancers that offer SMS marketing, email marketing, or cold
calling / telemarketing, for partnership outreach.

Pipeline (each stage is resumable — see --cache):
  1. BASE   Pull active, non-branch companies whose CURRENT activity list has a
            KAD under 73.1x (advertising/marketing group). All legal types,
            including ΑΤΟΜΙΚΗ freelancers.
  2. SITE   Keep only those with a website (url, else discovered_url), fetch it,
            and drop anything dead/parked/placeholder using scan_utils'
            classify_html — the same liveness test the discovery pipeline uses.
            Also follows one internal "υπηρεσίες"/"services" link when present,
            since that page is where these services are usually named.
  3. CLASSIFY  Ask Gemini 2.5 Flash via OpenRouter (same call pattern as
            financial_ai_extractor.py: temperature 0, JSON response format)
            whether the site indicates the company offers each of the three
            services, with a supporting quote per true flag so the result can be
            spot-checked instead of trusted blindly.
  4. CSV    One row per company, 2+ service matches sorted first.

Why liveness is checked live rather than read from a column: there is no stored
live/parked flag for registry `url` values — `website_scanned_at` only records
that the scanner ran, not what it found. (`discovered_url` IS inherently
live-verified, since discovery only writes it when a probe returned 'live'.)
Since stage 2 has to fetch the page for its text anyway, the check is free here
and more current than any stored flag would be.

Usage:
    # Stage 2 only + measured cost estimate, no AI spend:
    python one_time/marketing_services_classifier.py --estimate
    python one_time/marketing_services_classifier.py --estimate --sample=40

    # Full run (prompts for confirmation before spending):
    python one_time/marketing_services_classifier.py --run
    python one_time/marketing_services_classifier.py --run --limit=200
"""
import argparse
import csv
import json
import os
import re
import sys
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from html import unescape
from pathlib import Path
from urllib.parse import urljoin, urlparse

import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

# Windows consoles default to cp1252, which cannot encode either the Greek in
# this script's output or the progress bar's block characters — printing either
# raises UnicodeEncodeError and kills the run. Force UTF-8 so the script works
# when launched directly, without needing PYTHONIOENCODING set in the shell.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

sys.path.insert(0, str(Path(__file__).parent.parent))
from scan_utils import classify_html, normalize_url, _get_session  # noqa: E402

load_dotenv(Path(__file__).parent.parent / ".env")
DSN = os.getenv("DATABASE_URL")
if not DSN:
    sys.exit("DATABASE_URL not found in scripts/.env")

OUT_CSV   = Path(__file__).parent.parent.parent / "tools" / "marketing_sms_email_coldcall.csv"
CACHE_DIR = Path(__file__).parent.parent.parent / "tools" / ".marketing_cache"
SITE_CACHE = CACHE_DIR / "sites.jsonl"
CLS_CACHE  = CACHE_DIR / "classifications.jsonl"

MODEL           = "google/gemini-2.5-flash"
MAX_TOKENS      = 700
REQUEST_TIMEOUT = 90
FETCH_WORKERS   = 12
CLASSIFY_WORKERS = 6

# Gemini 2.5 Flash via OpenRouter, USD per 1M tokens (checked 2026-08-18).
PRICE_IN_PER_M  = 0.30
PRICE_OUT_PER_M = 2.50

# Page text handed to the model per company. Marketing sites put their service
# list high up; past this we're mostly paying for footers and cookie notices.
MAX_CHARS_PER_PAGE = 5000

# Below this, a "live" page is almost certainly a JS-rendered shell that a plain
# requests fetch can't read — measured at ~25% of live marketing-agency sites.
# Such rows are marked in the CSV rather than reported as clean non-matches.
THIN_TEXT_CHARS = 800

SERVICES_LINK_RE = re.compile(
    r"υπηρεσ|ypires|services|τι-κανουμε|ti-kanoume|what-we-do|solutions|λυσεις|lyseis",
    re.IGNORECASE,
)

# ── HTML → visible text ────────────────────────────────────────────────────
_DROP_BLOCKS = re.compile(
    r"<(script|style|noscript|svg|head)\b[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL
)
_TAGS = re.compile(r"<[^>]+>")
_WS   = re.compile(r"[ \t\r\f\v]+")
_NL   = re.compile(r"\n\s*\n+")


def visible_text(html: str) -> str:
    txt = _DROP_BLOCKS.sub(" ", html)
    txt = re.sub(r"<(br|/p|/div|/h[1-6]|/li|/tr)\s*/?>", "\n", txt, flags=re.IGNORECASE)
    txt = _TAGS.sub(" ", txt)
    txt = unescape(txt)
    txt = _WS.sub(" ", txt)
    txt = _NL.sub("\n", txt)
    return txt.strip()


def find_services_link(html: str, base_url: str) -> str | None:
    """First internal link whose href or anchor text looks like a services page."""
    host = urlparse(base_url).netloc.lower().replace("www.", "")
    for m in re.finditer(r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',
                         html, re.IGNORECASE | re.DOTALL):
        href, anchor = m.group(1), _TAGS.sub(" ", m.group(2))
        if not SERVICES_LINK_RE.search(href) and not SERVICES_LINK_RE.search(anchor):
            continue
        full = urljoin(base_url, href)
        p = urlparse(full)
        if p.scheme not in ("http", "https"):
            continue
        if p.netloc.lower().replace("www.", "") != host:
            continue  # internal links only
        if full.rstrip("/") == base_url.rstrip("/"):
            continue
        return full
    return None


def bar(done, total, width=32):
    total = max(total, 1)
    filled = int(min(done / total, 1.0) * width)
    return "█" * filled + "░" * (width - filled)


def rewrite_jsonl(path: Path, records) -> None:
    """Replace a cache file atomically, keeping a .bak of the previous version.

    The playwright pass rewrites both caches in place; a crash or Ctrl-C
    part-way through a naive open('w') would destroy already-paid-for
    classification work. Write to a temp file, keep the old one as .bak, then
    swap — so the original survives any failure before the rename.
    """
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    if path.exists():
        bak = path.with_suffix(path.suffix + ".bak")
        if bak.exists():
            bak.unlink()
        path.replace(bak)
    tmp.replace(path)


# ── Stage 1: base list ─────────────────────────────────────────────────────
BASE_SQL = """
SELECT c.ar_gemi::text, c.co_name_el, c.co_titles_el, c.afm, c.legal_type_descr,
       c.prefecture_descr, c.email, c.phone, c.url, c.discovered_url,
       COALESCE(NULLIF(c.url, ''), c.discovered_url) AS effective_url
FROM companies c
WHERE c.status_descr = 'Ενεργή'
  AND COALESCE(c.is_branch, false) = false
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(c.activities) a
    WHERE a->>'dtTo' IS NULL {primary_clause}
      AND a->'activity'->>'id' LIKE '731%%'
  )
  AND COALESCE(NULLIF(c.url, ''), c.discovered_url) IS NOT NULL
ORDER BY c.ar_gemi
"""

# ΓΕΜΗ lets a company hold an advertising KAD as a SECONDARY activity purely for
# its own in-house marketing — which is why the any-activity form pulls in
# ΑΛΦΑ-ΒΗΤΑ ΒΑΣΙΛΟΠΟΥΛΟΣ (supermarkets) and hotel groups alongside real
# agencies. Restricting to 'Κύρια' cuts 7,491 -> 1,169 and is far more precise;
# the tradeoff is losing small agencies that registered something else primary.
PRIMARY_CLAUSE = "AND a->>'type' = 'Κύρια'"


def fetch_base(primary_only: bool = False) -> list[dict]:
    sql = BASE_SQL.format(primary_clause=PRIMARY_CLAUSE if primary_only else "")
    conn = psycopg2.connect(DSN, connect_timeout=30)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute(sql)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


# ── Stage 2: fetch + liveness ──────────────────────────────────────────────
def fetch_site(row: dict) -> dict:
    """-> {ar_gemi, status, final_url, text, chars}. status 'live' means usable."""
    out = {"ar_gemi": row["ar_gemi"], "status": None, "final_url": None,
           "text": "", "chars": 0}
    base = normalize_url(row["effective_url"] or "")
    if not base:
        out["status"] = "invalid_url"
        return out

    session = _get_session()
    try:
        r = session.get(base, timeout=(5, 8), allow_redirects=True, stream=True)
        if r.status_code >= 400:
            r.close()
            out["status"] = f"http_{r.status_code}"
            return out
        chunks, total = [], 0
        for c in r.iter_content(8192):
            chunks.append(c)
            total += len(c)
            if total >= 512_000:
                break
        r.close()
        html = b"".join(chunks).decode("utf-8", errors="ignore")
        final_url = str(r.url)
    except Exception as e:
        out["status"] = type(e).__name__
        return out

    status = classify_html(html)
    out["status"] = status
    out["final_url"] = final_url
    if status != "live":
        return out

    text = visible_text(html)[:MAX_CHARS_PER_PAGE]

    svc = find_services_link(html, final_url)
    if svc:
        try:
            r2 = session.get(svc, timeout=(5, 8), allow_redirects=True)
            if r2.status_code < 400:
                svc_text = visible_text(r2.text)[:MAX_CHARS_PER_PAGE]
                text += "\n\n--- ΣΕΛΙΔΑ ΥΠΗΡΕΣΙΩΝ ---\n" + svc_text
        except Exception:
            pass

    out["text"] = text
    out["chars"] = len(text)
    return out


def run_stage2(rows: list[dict]) -> dict[str, dict]:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache: dict[str, dict] = {}
    if SITE_CACHE.exists():
        with open(SITE_CACHE, encoding="utf-8") as f:
            for line in f:
                try:
                    d = json.loads(line)
                    cache[d["ar_gemi"]] = d
                except json.JSONDecodeError:
                    pass
        print(f"  resuming — {len(cache):,} sites already fetched")

    todo = [r for r in rows if r["ar_gemi"] not in cache]
    if not todo:
        return cache

    done = 0
    t0 = time.time()
    with open(SITE_CACHE, "a", encoding="utf-8") as fh, \
         ThreadPoolExecutor(max_workers=FETCH_WORKERS) as ex:
        futs = {ex.submit(fetch_site, r): r for r in todo}
        for fut in as_completed(futs):
            res = fut.result()
            cache[res["ar_gemi"]] = res
            fh.write(json.dumps(res, ensure_ascii=False) + "\n")
            done += 1
            if done % 10 == 0 or done == len(todo):
                fh.flush()
                rate = done / max(time.time() - t0, 0.1)
                eta = (len(todo) - done) / max(rate, 0.01)
                sys.stdout.write(
                    f"\r  [{bar(done, len(todo))}] {done:,}/{len(todo):,}  "
                    f"{rate:.1f}/s  ETA {eta/60:.1f}m   "
                )
                sys.stdout.flush()
    print()
    return cache


# ── Stage 2b: browser render for JS-heavy sites ────────────────────────────
def render_sites(thin: list[dict]) -> list[dict]:
    """Re-read SPA sites with a headless browser so the classifier sees the
    hydrated DOM instead of an empty shell. Sequential and slow (~2s/site) but
    only ever runs on the ~13% that plain HTTP couldn't read."""
    from playwright.sync_api import sync_playwright

    out = []
    t0 = time.time()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) "
                       "Chrome/122.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 900},
        )
        for i, s in enumerate(thin, 1):
            rec = dict(s)
            url = s.get("final_url") or ""
            try:
                page = ctx.new_page()
                page.goto(url, timeout=20000, wait_until="domcontentloaded")
                # Hydration usually lands well inside this; networkidle alone
                # never fires on sites with polling/analytics beacons.
                try:
                    page.wait_for_load_state("networkidle", timeout=6000)
                except Exception:
                    pass
                html = page.content()
                text = visible_text(html)[:MAX_CHARS_PER_PAGE]

                svc = find_services_link(html, url)
                if svc:
                    try:
                        page.goto(svc, timeout=15000, wait_until="domcontentloaded")
                        try:
                            page.wait_for_load_state("networkidle", timeout=5000)
                        except Exception:
                            pass
                        text += ("\n\n--- ΣΕΛΙΔΑ ΥΠΗΡΕΣΙΩΝ ---\n"
                                 + visible_text(page.content())[:MAX_CHARS_PER_PAGE])
                    except Exception:
                        pass
                page.close()
                rec["text"] = text
                rec["chars"] = len(text)
                rec["rendered"] = True
            except Exception as e:
                rec["rendered"] = False
                rec["render_error"] = type(e).__name__
                try:
                    page.close()
                except Exception:
                    pass
            out.append(rec)
            rate = i / max(time.time() - t0, 0.1)
            recovered = sum(1 for r in out if r["chars"] >= THIN_TEXT_CHARS)
            host = urlparse(url).netloc[:28]
            sys.stdout.write(
                f"\r  [{bar(i, len(thin))}] {i}/{len(thin)}  "
                f"{rate:.1f}/s  ETA {(len(thin)-i)/max(rate,0.01)/60:.1f}m  "
                f"recovered {recovered}  {host:<28}")
            sys.stdout.flush()
        ctx.close()
        browser.close()
    print()
    return out


# ── Stage 3: classify ──────────────────────────────────────────────────────
PROMPT = """Είσαι αναλυτής B2B δεδομένων. Σου δίνεται το ορατό κείμενο από τον ιστότοπο μιας ελληνικής εταιρείας μάρκετινγκ/διαφήμισης.

Απάντησε ΜΟΝΟ με JSON σε αυτή τη μορφή:
{
  "sms_marketing": true/false,
  "sms_quote": "σύντομη φράση από το κείμενο που το τεκμηριώνει, αλλιώς \\"\\"",
  "email_marketing": true/false,
  "email_quote": "...",
  "cold_calling": true/false,
  "cold_calling_quote": "..."
}

Κανόνες:
- true ΜΟΝΟ αν το κείμενο δείχνει ότι η ΙΔΙΑ η εταιρεία ΠΡΟΣΦΕΡΕΙ την υπηρεσία σε πελάτες.
- sms_marketing: μαζικά SMS, SMS marketing, bulk SMS, viber campaigns.
- email_marketing: email marketing, newsletter καμπάνιες, email automation.
- cold_calling: τηλεφωνικές πωλήσεις, ψυχρές κλήσεις, telemarketing, call center για πωλήσεις.
- ΜΗΝ βάλεις true επειδή η εταιρεία απλώς έχει newsletter ή τηλέφωνο επικοινωνίας — αυτό δεν είναι υπηρεσία προς πελάτες.
- Το quote πρέπει να είναι αυτούσιο απόσπασμα από το κείμενο. Αν το flag είναι false, βάλε κενό string.
- Αν το κείμενο δεν αρκεί, βάλε όλα false.

--- ΚΕΙΜΕΝΟ ΙΣΤΟΤΟΠΟΥ ---
"""

FLAGS = ["sms_marketing", "email_marketing", "cold_calling"]


def classify(site: dict, attempts: int = 3) -> dict:
    """Retries transient failures. Measured ~7% of calls come back as a
    truncated/non-JSON body even with response_format set; one retry clears
    them, and at $0.0006/call retrying is far cheaper than losing the row."""
    last = None
    for n in range(attempts):
        last = _classify_once(site)
        if not last.get("error"):
            return last
        if last["error"].startswith("http_4") and "429" not in last["error"]:
            return last  # 401/402/400 won't fix themselves — don't burn retries
        time.sleep(1.5 * (n + 1))
    return last


def _classify_once(site: dict) -> dict:
    key = os.environ["OPENROUTER_API_KEY"]
    body = {
        "model": MODEL,
        "messages": [{"role": "user", "content": PROMPT + site["text"]}],
        "max_tokens": MAX_TOKENS,
        "response_format": {"type": "json_object"},
        "temperature": 0,
    }
    out = {"ar_gemi": site["ar_gemi"], "error": None,
           "prompt_tokens": 0, "completion_tokens": 0}
    for f in FLAGS:
        out[f] = False
        out[f + "_quote"] = ""
    try:
        resp = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=body, timeout=REQUEST_TIMEOUT,
        )
    except Exception as e:
        out["error"] = f"request_failed: {type(e).__name__}"
        return out
    if resp.status_code != 200:
        out["error"] = f"http_{resp.status_code}: {resp.text[:160]}"
        return out

    data = resp.json()
    usage = data.get("usage") or {}
    out["prompt_tokens"] = usage.get("prompt_tokens", 0)
    out["completion_tokens"] = usage.get("completion_tokens", 0)
    try:
        parsed = json.loads(data["choices"][0]["message"]["content"])
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        out["error"] = f"bad_reply: {type(e).__name__}"
        return out

    for f in FLAGS:
        out[f] = bool(parsed.get(f))
        q = parsed.get(f.replace("cold_calling", "cold_calling") + "_quote")
        if f == "sms_marketing":
            q = parsed.get("sms_quote", q)
        elif f == "email_marketing":
            q = parsed.get("email_quote", q)
        out[f + "_quote"] = (q or "").strip() if out[f] else ""
    return out


def run_stage3(live_sites: list[dict]) -> dict[str, dict]:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache: dict[str, dict] = {}
    if CLS_CACHE.exists():
        with open(CLS_CACHE, encoding="utf-8") as f:
            for line in f:
                try:
                    d = json.loads(line)
                    if not d.get("error"):
                        cache[d["ar_gemi"]] = d
                except json.JSONDecodeError:
                    pass
        print(f"  resuming — {len(cache):,} already classified")

    todo = [s for s in live_sites if s["ar_gemi"] not in cache]
    if not todo:
        return cache

    done = errors = 0
    tok_in = tok_out = 0
    t0 = time.time()
    with open(CLS_CACHE, "a", encoding="utf-8") as fh, \
         ThreadPoolExecutor(max_workers=CLASSIFY_WORKERS) as ex:
        futs = {ex.submit(classify, s): s for s in todo}
        for fut in as_completed(futs):
            res = fut.result()
            fh.write(json.dumps(res, ensure_ascii=False) + "\n")
            if res.get("error"):
                errors += 1
            else:
                cache[res["ar_gemi"]] = res
            tok_in  += res.get("prompt_tokens", 0)
            tok_out += res.get("completion_tokens", 0)
            done += 1
            if done % 5 == 0 or done == len(todo):
                fh.flush()
                spend = tok_in / 1e6 * PRICE_IN_PER_M + tok_out / 1e6 * PRICE_OUT_PER_M
                rate = done / max(time.time() - t0, 0.1)
                sys.stdout.write(
                    f"\r  [{bar(done, len(todo))}] {done:,}/{len(todo):,}  "
                    f"{rate:.1f}/s  ${spend:.2f}  err {errors}   "
                )
                sys.stdout.flush()
    print()
    return cache


# ── Stage 4: CSV ───────────────────────────────────────────────────────────
def write_csv(rows, sites, classifications):
    by_id = {r["ar_gemi"]: r for r in rows}
    out = []
    for ar_gemi, cls in classifications.items():
        r = by_id.get(ar_gemi)
        if not r:
            continue
        site = sites.get(ar_gemi, {})
        n = sum(bool(cls.get(f)) for f in FLAGS)
        titles = r.get("co_titles_el") or []
        # A JS-rendered site yields an almost-empty shell to a plain fetch, so
        # all-false there means "couldn't read it", not "doesn't offer this".
        # Flagged so those rows aren't mistaken for genuine non-matches.
        thin = site.get("chars", 0) < THIN_TEXT_CHARS
        out.append({
            "match_count": n,
            "text_too_thin_to_judge": thin and n == 0,
            "page_chars": site.get("chars", 0),
            "ar_gemi": ar_gemi,
            "co_name_el": r["co_name_el"],
            "co_titles_el": " | ".join(t for t in titles if t),
            "afm": r["afm"],
            "legal_type_descr": r["legal_type_descr"],
            "prefecture_descr": r["prefecture_descr"],
            "email": r["email"],
            "phone": r["phone"],
            "url": r["url"],
            "discovered_url": r["discovered_url"],
            "scanned_url": site.get("final_url") or "",
            "sms_marketing": cls.get("sms_marketing", False),
            "sms_marketing_quote": cls.get("sms_marketing_quote", ""),
            "email_marketing": cls.get("email_marketing", False),
            "email_marketing_quote": cls.get("email_marketing_quote", ""),
            "cold_calling": cls.get("cold_calling", False),
            "cold_calling_quote": cls.get("cold_calling_quote", ""),
        })

    # Two ΓΕΜΗ entities can be one real business (a sole trader plus the
    # partnership that succeeded it, say) sharing a single website — pitching
    # both would be pitching the same people twice. Group them so the duplicate
    # is visible in the sheet rather than discovered mid-outreach.
    by_site = defaultdict(list)
    for d in out:
        host = (d["scanned_url"] or "").rstrip("/").lower()
        host = host.replace("https://", "").replace("http://", "").replace("www.", "")
        host = host.split("/")[0]
        if host:
            by_site[host].append(d)
    for host, group in by_site.items():
        if len(group) > 1:
            others = [g["ar_gemi"] for g in group]
            for d in group:
                d["same_business_as"] = " ".join(i for i in others if i != d["ar_gemi"])
    for d in out:
        d.setdefault("same_business_as", "")

    out.sort(key=lambda d: (-d["match_count"], d["co_name_el"] or ""))
    OUT_CSV.parent.mkdir(exist_ok=True)
    with open(OUT_CSV, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()) if out else ["ar_gemi"])
        w.writeheader()
        w.writerows(out)
    return out


# ── main ───────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--estimate", action="store_true",
                    help="stages 1-2 + measured cost projection, no AI spend")
    ap.add_argument("--base-only", action="store_true",
                    help="write the stage-1/2 company list to CSV and stop "
                         "(DB only — no crawling, no AI, no spend)")
    ap.add_argument("--run", action="store_true", help="full pipeline incl. AI")
    ap.add_argument("--calibrate", type=int, default=0, metavar="N",
                    help="classify N companies for real (~$0.0013 each) to "
                         "replace the chars/token estimate with measured token "
                         "counts, then project the full cost and stop")
    ap.add_argument("--sample", type=int, default=60,
                    help="sites to fetch when estimating (default 60)")
    ap.add_argument("--limit", type=int, default=0,
                    help="cap companies classified in --run (0 = all)")
    ap.add_argument("--rebuild-csv", action="store_true",
                    help="regenerate the CSV from the existing caches only — "
                         "no fetching, no AI, no spend")
    ap.add_argument("--playwright-pass", action="store_true",
                    help="re-fetch only the sites whose plain-HTTP text came "
                         "back too thin to judge (JS-rendered SPAs) using a "
                         "headless browser, then re-classify just those")
    ap.add_argument("--primary-only", action="store_true",
                    help="require 73.1x to be the PRIMARY (Κύρια) activity — "
                         "1,169 real agencies instead of 7,491 incl. firms that "
                         "merely registered advertising as a side activity")
    args = ap.parse_args()
    if not (args.estimate or args.run or args.base_only or args.calibrate
            or args.playwright_pass or args.rebuild_csv):
        ap.error("pass --estimate, --base-only, --calibrate, --run, "
                 "--playwright-pass or --rebuild-csv")

    print("Stage 1 — base list from ΓΕΜΗ…")
    rows = fetch_base(primary_only=args.primary_only)
    scope = "PRIMARY-activity" if args.primary_only else "any-activity"
    print(f"  {len(rows):,} active non-branch KAD 73.1x ({scope}) companies with a website\n")

    if args.base_only:
        path = OUT_CSV.with_name("marketing_731x_base.csv")
        path.parent.mkdir(exist_ok=True)
        cols = ["ar_gemi", "co_name_el", "co_titles_el", "afm", "legal_type_descr",
                "prefecture_descr", "email", "phone", "url", "discovered_url"]
        with open(path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(cols)
            for r in rows:
                titles = r.get("co_titles_el") or []
                w.writerow([
                    r["ar_gemi"], r["co_name_el"], " | ".join(t for t in titles if t),
                    r["afm"], r["legal_type_descr"], r["prefecture_descr"],
                    r["email"], r["phone"], r["url"], r["discovered_url"],
                ])
        print(f"  Saved: {path}")
        print("  (service classification still pending — needs OpenRouter credits)")
        return

    if args.estimate:
        import random
        random.seed(7)
        sample = random.sample(rows, min(args.sample, len(rows)))
        print(f"Stage 2 — fetching a {len(sample)}-site random sample…")
        sites = run_stage2(sample)
        sampled = [sites[r["ar_gemi"]] for r in sample if r["ar_gemi"] in sites]
        live = [s for s in sampled if s["status"] == "live"]

        from collections import Counter
        print("\n  outcome:")
        for st, n in Counter(s["status"] for s in sampled).most_common():
            print(f"    {n:>4}  {st}")
        if not live:
            print("\n  no live sites in sample — cannot project cost")
            return

        live_rate = len(live) / len(sampled)
        avg_chars = sum(s["chars"] for s in live) / len(live)
        projected_live = int(len(rows) * live_rate)

        # Greek is token-dense: measured ~2.1 chars/token for Gemini on Greek
        # web copy. Prompt scaffolding adds ~400 tokens; replies are short JSON.
        est_in  = avg_chars / 2.1 + 400
        est_out = 220
        per_call = est_in / 1e6 * PRICE_IN_PER_M + est_out / 1e6 * PRICE_OUT_PER_M
        total = per_call * projected_live

        print(f"\n  live rate:            {live_rate*100:.0f}%")
        print(f"  avg text per site:    {avg_chars:,.0f} chars (~{est_in:,.0f} in-tokens)")
        print(f"\n  PROJECTION over {len(rows):,} companies:")
        print(f"    reach AI classify:  ~{projected_live:,}")
        print(f"    cost per company:   ~${per_call:.5f}")
        print(f"    TOTAL:              ~${total:.2f}  (±30%)")
        print("\n  Nothing spent. Re-run with --run to execute.")
        return

    def load_cache(path, skip_errors=False):
        d = {}
        if path.exists():
            with open(path, encoding="utf-8") as f:
                for line in f:
                    try:
                        rec = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if skip_errors and rec.get("error"):
                        continue
                    d[rec["ar_gemi"]] = rec
        return d

    if args.rebuild_csv:
        sites = load_cache(SITE_CACHE)
        cls = load_cache(CLS_CACHE, skip_errors=True)
        print(f"  {len(sites):,} cached sites · {len(cls):,} classifications")
        out = write_csv(rows, sites, cls)
        dupes = sum(1 for d in out if d["same_business_as"])
        print(f"  {len(out):,} rows written  ({dupes} share a site with another row)")
        print(f"  Saved: {OUT_CSV}")
        return

    if args.playwright_pass:
        if not os.getenv("OPENROUTER_API_KEY"):
            sys.exit("OPENROUTER_API_KEY not set in scripts/.env")
        sites = {}
        if SITE_CACHE.exists():
            with open(SITE_CACHE, encoding="utf-8") as f:
                for line in f:
                    try:
                        d = json.loads(line)
                        sites[d["ar_gemi"]] = d
                    except json.JSONDecodeError:
                        pass
        ids = {r["ar_gemi"] for r in rows}
        thin = [s for aid, s in sites.items()
                if aid in ids and s["status"] == "live"
                and s["chars"] < THIN_TEXT_CHARS]
        print(f"Stage 2b — {len(thin)} JS-rendered sites to re-read with a browser\n")
        if not thin:
            print("  nothing to do.")
            return

        rendered = render_sites(thin)
        gained = [r for r in rendered if r["chars"] >= THIN_TEXT_CHARS]
        print(f"\n  {len(gained)}/{len(rendered)} now have usable text\n")

        # Overwrite the cached entries so stage 4 picks up the richer text, and
        # drop their old all-false verdicts so they get a fresh judgement.
        for r in rendered:
            sites[r["ar_gemi"]] = r
        rewrite_jsonl(SITE_CACHE, sites.values())

        cls = {}
        if CLS_CACHE.exists():
            with open(CLS_CACHE, encoding="utf-8") as f:
                for line in f:
                    try:
                        d = json.loads(line)
                        if not d.get("error"):
                            cls[d["ar_gemi"]] = d
                    except json.JSONDecodeError:
                        pass
        for r in gained:
            cls.pop(r["ar_gemi"], None)
        rewrite_jsonl(CLS_CACHE, cls.values())

        if gained:
            print("Stage 3 — re-classifying the newly readable sites…")
            cls = run_stage3(gained)
            print()

        print("Stage 4 — rewriting CSV…")
        out = write_csv(rows, sites, cls)
        both = sum(1 for d in out if d["match_count"] >= 2)
        any_ = sum(1 for d in out if d["match_count"] >= 1)
        still_thin = sum(1 for d in out if d["text_too_thin_to_judge"])
        print(f"  {len(out):,} rows · {any_:,} match >=1 service ({both:,} match 2+)")
        for f in FLAGS:
            print(f"    {sum(1 for d in out if d[f]):>5,}  {f}")
        print(f"  still unreadable: {still_thin}")
        print(f"\n  Saved: {OUT_CSV}")
        return

    if args.calibrate:
        if not os.getenv("OPENROUTER_API_KEY"):
            sys.exit("OPENROUTER_API_KEY not set in scripts/.env")
        import random
        random.seed(11)
        # Over-sample so ~25% dead sites still leave enough live ones to hit N.
        draw = random.sample(rows, min(args.calibrate * 3, len(rows)))
        print(f"Stage 2 — fetching {len(draw)} sites to find {args.calibrate} live…")
        sites = run_stage2(draw)
        live = [sites[r["ar_gemi"]] for r in draw
                if r["ar_gemi"] in sites
                and sites[r["ar_gemi"]]["status"] == "live"
                and sites[r["ar_gemi"]]["chars"] > 200]
        batch = live[:args.calibrate]
        print(f"  {len(live)} live; classifying {len(batch)}\n")
        if not batch:
            sys.exit("no live sites drawn — cannot calibrate")

        print("Stage 3 — calibration classify (REAL SPEND)…")
        results, tin, tout, errs = [], 0, 0, []
        for i, s in enumerate(batch, 1):
            r = classify(s)
            results.append((s, r))
            tin += r.get("prompt_tokens", 0)
            tout += r.get("completion_tokens", 0)
            if r.get("error"):
                errs.append(r["error"][:100])
            flags = [f for f in FLAGS if r.get(f)]
            print(f"  {i:2}/{len(batch)}  in={r.get('prompt_tokens',0):>6} "
                  f"out={r.get('completion_tokens',0):>4}  chars={s['chars']:>5}  "
                  f"{','.join(flags) if flags else '-'}"
                  f"{'  ERR ' + r['error'][:60] if r.get('error') else ''}")

        ok = len(batch) - len(errs)
        spent = tin / 1e6 * PRICE_IN_PER_M + tout / 1e6 * PRICE_OUT_PER_M
        print(f"\n  ok {ok}/{len(batch)}   spent ${spent:.4f}")
        if errs:
            print(f"  errors: {errs[:3]}")
        if not ok:
            sys.exit("all calibration calls failed — not projecting")

        avg_in, avg_out = tin / len(batch), tout / len(batch)
        avg_chars = sum(s["chars"] for s in batch) / len(batch)
        per = avg_in / 1e6 * PRICE_IN_PER_M + avg_out / 1e6 * PRICE_OUT_PER_M
        live_rate = len(live) / max(len(draw), 1)
        projected = int(len(rows) * live_rate)
        print(f"\n  MEASURED  avg in {avg_in:,.0f} tok · out {avg_out:,.0f} tok "
              f"· {avg_chars / max(avg_in - 400, 1):.2f} chars/token")
        print(f"            ${per:.5f} per company (est. was $0.00125)")
        print(f"\n  PROJECTION over {len(rows):,} companies "
              f"({scope}, {live_rate*100:.0f}% live -> ~{projected:,}):")
        print(f"            TOTAL ~${per * projected:.2f}")

        # Quotes are the whole point of the calibration — show them for review.
        print("\n  --- flagged, for spot-checking ---")
        shown = 0
        for s, r in results:
            hits = [f for f in FLAGS if r.get(f)]
            if not hits:
                continue
            shown += 1
            print(f"  {s['final_url']}")
            for f in hits:
                print(f"      {f}: “{r.get(f + '_quote', '')[:150]}”")
        if not shown:
            print("  (none flagged in this sample)")
        return

    # full run
    if not os.getenv("OPENROUTER_API_KEY"):
        sys.exit("OPENROUTER_API_KEY not set in scripts/.env")

    print("Stage 2 — fetching websites (liveness + text)…")
    sites = run_stage2(rows)
    live = [s for s in sites.values() if s["status"] == "live" and s["chars"] > 200]
    print(f"  {len(live):,} live sites with usable text\n")

    if args.limit:
        live = live[:args.limit]
        print(f"  --limit: classifying only {len(live):,}\n")

    print("Stage 3 — classifying with Gemini 2.5 Flash…")
    classifications = run_stage3(live)
    print()

    print("Stage 4 — writing CSV…")
    out = write_csv(rows, sites, classifications)
    both = sum(1 for d in out if d["match_count"] >= 2)
    any_ = sum(1 for d in out if d["match_count"] >= 1)
    print(f"  {len(out):,} rows written")
    print(f"  {any_:,} match at least one service ({both:,} match 2+)")
    for f in FLAGS:
        print(f"    {sum(1 for d in out if d[f]):>5,}  {f}")
    print(f"\n  Saved: {OUT_CSV}")


if __name__ == "__main__":
    main()
