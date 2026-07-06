"""
rescan_retry.py

Re-scans entries from web_scan_retry.json (produced by build_retry_list.py).
Always fetches the root domain (strips any path from the stored URL).

On completion, patches web_scan_results.json in place — replacing the old
error / stale-path entry with the new result.

Run from the scripts/ directory:
    python one_time/rescan_retry.py
"""

import json
import re
import sys
import os
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from pathlib import Path
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

RETRY_JSON    = Path(__file__).parent.parent / "web_scan_retry.json"
RESULTS_JSON  = Path(__file__).parent.parent / "web_scan_results.json"
PROGRESS_JSON = Path(__file__).parent.parent / "web_scan_retry_progress.json"

CONNECT_TIMEOUT = 5
READ_TIMEOUT    = 8
HARD_TIMEOUT    = 18
MAX_BYTES       = 512_000
SLEEP_BETWEEN   = 0.3
SAVE_EVERY      = 50

# ── Copy of extract / scan helpers from web_scraper.py ─────────────────────

PATTERNS = {
    "instagram": re.compile(
        r'(?:https?:)?//(?:www\.)?instagram\.com/(?!p/|reel/|explore/)([A-Za-z0-9_.]{1,30})/?',
        re.IGNORECASE,
    ),
    "facebook": re.compile(
        r'(?:https?:)?//(?:www\.)?facebook\.com/(?!sharer|share|dialog|plugins)([A-Za-z0-9_.%-]{3,})/?',
        re.IGNORECASE,
    ),
    "linkedin": re.compile(
        r'(?:https?:)?//(?:www\.)?linkedin\.com/(?:company|in)/([A-Za-z0-9_%-]+)/?',
        re.IGNORECASE,
    ),
    "twitter": re.compile(
        r'(?:https?:)?//(?:www\.)?(?:twitter|x)\.com/(?!share|intent|home)([A-Za-z0-9_]{1,15})/?',
        re.IGNORECASE,
    ),
    "tiktok": re.compile(
        r'(?:https?:)?//(?:www\.)?tiktok\.com/@([A-Za-z0-9_.]{1,30})/?',
        re.IGNORECASE,
    ),
    "youtube": re.compile(
        r'(?:https?:)?//(?:www\.)?youtube\.com/(?:@|channel/|c/|user/)([A-Za-z0-9_%-]+)/?',
        re.IGNORECASE,
    ),
}

EMAIL_RE = re.compile(r'[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}')
PHONE_RE = re.compile(r'(?<!\d)(?:\+30|0030)?[\s\-.]?([26]\d[\s\-.]?\d{3}[\s\-.]?\d{4})(?!\d)')
EMAIL_BLACKLIST = {
    "example.com", "domain.com", "email.com", "mail.com",
    "youremail.com", "company.com", "sentry.io", "wixpress.com",
    "google.com", "facebook.com", "instagram.com",
}


def normalize_root(raw: str) -> str:
    raw = raw.strip()
    if not raw:
        return ""
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw.lstrip("/")
    try:
        p = urlparse(raw)
    except ValueError:
        return ""
    if not p.netloc:
        return ""
    return f"{p.scheme}://{p.netloc}"


def extract_all(html: str) -> dict:
    found = {}
    for platform, pattern in PATTERNS.items():
        matches = pattern.findall(html)
        if matches:
            handle = next(
                (m for m in matches if len(m) > 2 and m.lower() not in ("pages", "groups", "hashtag")),
                None,
            )
            if handle:
                domain = {
                    "instagram": "instagram.com", "facebook": "facebook.com",
                    "linkedin": "linkedin.com",   "twitter": "x.com",
                    "tiktok": "tiktok.com",        "youtube": "youtube.com",
                }[platform]
                prefix = "@" if platform in ("instagram", "twitter", "tiktok", "youtube") else ""
                found[platform] = f"https://www.{domain}/{prefix}{handle}"

    emails = set()
    for m in EMAIL_RE.finditer(html):
        addr = m.group(0).lower()
        domain = addr.split("@")[-1]
        if domain not in EMAIL_BLACKLIST and not addr.endswith((".png", ".jpg", ".gif", ".svg")):
            emails.add(addr)
    if emails:
        found["emails"] = sorted(emails)

    phones = set()
    for m in PHONE_RE.finditer(html):
        digits = re.sub(r'[\s\-.]', '', m.group(1))
        if len(digits) == 10:
            phones.add(digits)
    if phones:
        found["phones"] = sorted(phones)

    return found


def scan_site(session: requests.Session, base_url: str) -> dict:
    def _fetch():
        resp = session.get(base_url, timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
                           allow_redirects=True, stream=True)
        if resp.status_code >= 400:
            resp.close()
            return {"error": f"http_{resp.status_code}"}
        chunks, total = [], 0
        for chunk in resp.iter_content(chunk_size=8192):
            chunks.append(chunk)
            total += len(chunk)
            if total >= MAX_BYTES:
                break
        resp.close()
        html = b"".join(chunks).decode("utf-8", errors="ignore")
        return extract_all(html)

    try:
        with ThreadPoolExecutor(max_workers=1) as ex:
            future = ex.submit(_fetch)
            try:
                return future.result(timeout=HARD_TIMEOUT)
            except FuturesTimeout:
                return {"error": "hard_timeout"}
    except requests.exceptions.Timeout:
        return {"error": "timeout"}
    except requests.exceptions.TooManyRedirects:
        return {"error": "too_many_redirects"}
    except requests.exceptions.ConnectionError:
        return {"error": "connection_error"}
    except Exception as e:
        return {"error": str(e)[:80]}


# ── Progress bar ────────────────────────────────────────────────────────────

def _draw_bar(idx, total, extra=""):
    pct = idx / total
    filled = int(40 * pct)
    bar = "█" * filled + "░" * (40 - filled)
    sys.stdout.write(f"\r[{bar}] {pct:5.1%}  {idx}/{total}{extra}  ")
    sys.stdout.flush()


# ── Main ────────────────────────────────────────────────────────────────────

def main():
    if not RETRY_JSON.exists():
        print(f"Retry list not found: {RETRY_JSON}")
        print("Run build_retry_list.py first.")
        sys.exit(1)

    with RETRY_JSON.open(encoding="utf-8") as f:
        retry_list = json.load(f)

    # Load existing results — keyed by ar_gemi
    results: dict[str, dict] = {}
    if RESULTS_JSON.exists():
        with RESULTS_JSON.open(encoding="utf-8") as f:
            for row in json.load(f):
                results[row["ar_gemi"]] = row

    # Load resume progress — set of ar_gemi already re-scanned this run
    done: set[str] = set()
    if PROGRESS_JSON.exists():
        with PROGRESS_JSON.open(encoding="utf-8") as f:
            done = set(json.load(f))
        print(f"Resuming — {len(done):,} already re-scanned, skipping.")

    total = len(retry_list)
    remaining = total - len(done)
    print(f"Entries to re-scan: {total:,}  (remaining: {remaining:,})")

    session = requests.Session()
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        )
    })

    improved = 0

    for idx, entry in enumerate(retry_list, start=1):
        ar_gemi    = entry["ar_gemi"]
        raw_url    = entry.get("root_url") or entry.get("url", "")
        base_url   = normalize_root(raw_url)
        reason     = entry.get("retry_reason", "")

        if not base_url or ar_gemi in done:
            _draw_bar(idx, total)
            continue

        sys.stdout.write(f"\r[scanning] {base_url[:70]:<70}")
        sys.stdout.flush()

        found = scan_site(session, base_url)

        old_had_error = bool(results.get(ar_gemi, {}).get("error"))
        new_has_error = bool(found.get("error"))

        if old_had_error and not new_has_error:
            improved += 1

        # For path_url entries, store the clean root URL instead of the path
        stored_url = base_url if reason == "path_url" else raw_url

        results[ar_gemi] = {
            "ar_gemi": ar_gemi,
            "name":    entry.get("name", ""),
            "url":     stored_url,
            **found,
        }
        done.add(ar_gemi)

        # Save progress after every entry so resume always works
        with PROGRESS_JSON.open("w", encoding="utf-8") as f:
            json.dump(list(done), f)

        # Flush results periodically (large file)
        if idx % SAVE_EVERY == 0:
            with RESULTS_JSON.open("w", encoding="utf-8") as f:
                json.dump(list(results.values()), f, ensure_ascii=False, indent=2)

        _draw_bar(idx, total, extra=f"  recovered={improved}")
        time.sleep(SLEEP_BETWEEN)

    with RESULTS_JSON.open("w", encoding="utf-8") as f:
        json.dump(list(results.values()), f, ensure_ascii=False, indent=2)

    # Clean up progress file — run is complete
    if PROGRESS_JSON.exists():
        PROGRESS_JSON.unlink()

    print(f"\n\nDone. {improved:,} previously-failing sites now have data.")
    print(f"Results patched in: {RESULTS_JSON}")


if __name__ == "__main__":
    main()
