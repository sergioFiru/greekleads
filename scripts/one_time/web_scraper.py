"""
web_scraper.py

Scans every active company website and extracts:
  - Social media links (Instagram, Facebook, LinkedIn, Twitter/X, TikTok, YouTube)
  - Email addresses found on the page
  - Phone numbers found on the page

Reads companies from the DB, saves results locally to web_scan_results.json.
Resume-safe: skips ar_gemi values already in the output file.

Run from scripts/ directory:
    python one_time/web_scraper.py
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
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

OUTPUT_JSON = Path(__file__).parent.parent / "web_scan_results.json"
CONNECT_TIMEOUT = 5    # seconds to establish connection
READ_TIMEOUT    = 8    # seconds between data chunks
HARD_TIMEOUT    = 18   # wall-clock limit per URL (kills SSL hangs)
MAX_BYTES       = 512_000  # stop reading after 500 KB
SLEEP_BETWEEN   = 0.3  # seconds between requests
SAVE_EVERY      = 50   # write JSON every N new results


# ---------------------------------------------------------------------------
# URL helpers
# ---------------------------------------------------------------------------

def normalize_url(raw: str) -> str:
    raw = raw.strip()
    if not raw:
        return ""
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw.lstrip("/")
    try:
        parsed = urlparse(raw)
    except ValueError:
        return ""
    if not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}"


# ---------------------------------------------------------------------------
# Extraction patterns
# ---------------------------------------------------------------------------

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

EMAIL_RE = re.compile(
    r'[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}',
)

# Greek landlines start with 2, mobiles with 6 — 10 digits total
PHONE_RE = re.compile(
    r'(?<!\d)(?:\+30|0030)?[\s\-.]?([26]\d[\s\-.]?\d{3}[\s\-.]?\d{4})(?!\d)',
)

# Noise: emails to skip (icons, images, share links, etc.)
EMAIL_BLACKLIST = {
    "example.com", "domain.com", "email.com", "mail.com",
    "youremail.com", "company.com", "sentry.io", "wixpress.com",
    "google.com", "facebook.com", "instagram.com",
}


def extract_all(html: str, base_url: str) -> dict:
    found = {}

    for platform, pattern in PATTERNS.items():
        matches = pattern.findall(html)
        if matches:
            # Take the first non-empty, non-generic handle
            handle = next(
                (m for m in matches if len(m) > 2 and m.lower() not in ("pages", "groups", "hashtag")),
                None,
            )
            if handle:
                domain = {
                    "instagram": "instagram.com",
                    "facebook": "facebook.com",
                    "linkedin": "linkedin.com",
                    "twitter": "x.com",
                    "tiktok": "tiktok.com",
                    "youtube": "youtube.com",
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


# ---------------------------------------------------------------------------
# Fetch + scan one URL
# ---------------------------------------------------------------------------

def scan_site(session: requests.Session, raw_url: str) -> dict:
    base_url = normalize_url(raw_url)
    if not base_url:
        return {"error": "invalid_url"}

    def _fetch():
        resp = session.get(
            base_url,
            timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
            allow_redirects=True,
            stream=True,
        )
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
        return extract_all(html, base_url)

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


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    # Load existing results for resume
    existing: dict[str, dict] = {}
    if OUTPUT_JSON.exists():
        with OUTPUT_JSON.open(encoding="utf-8") as f:
            for row in json.load(f):
                existing[row["ar_gemi"]] = row
        print(f"Resuming — {len(existing):,} already scanned.")

    # Fetch companies from DB
    conn = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("""
        SELECT ar_gemi, co_name_el, url
        FROM companies
        WHERE status_descr = 'Ενεργή'
          AND url IS NOT NULL
          AND trim(url) != ''
        ORDER BY ar_gemi
    """)
    companies = cur.fetchall()
    conn.close()

    total = len(companies)
    print(f"Active companies with a URL: {total:,}")
    print(f"To scan: {total - len(existing):,}\n")

    session = requests.Session()
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        )
    })

    results = dict(existing)
    scanned = 0

    for idx, row in enumerate(companies, start=1):
        ar_gemi = str(row["ar_gemi"])

        if ar_gemi in results:
            # Already done — just update progress bar
            _draw_bar(idx, total)
            continue

        sys.stdout.write(f"\r[scanning] {row['url'][:70]:<70}")
        sys.stdout.flush()
        found = scan_site(session, row["url"])

        results[ar_gemi] = {
            "ar_gemi":   ar_gemi,
            "name":      row["co_name_el"],
            "url":       row["url"],
            **found,
        }
        scanned += 1

        if scanned % SAVE_EVERY == 0:
            with OUTPUT_JSON.open("w", encoding="utf-8") as f:
                json.dump(list(results.values()), f, ensure_ascii=False, indent=2)

        _draw_bar(idx, total, extra=f"  new={scanned}")
        time.sleep(SLEEP_BETWEEN)

    # Final save
    with OUTPUT_JSON.open("w", encoding="utf-8") as f:
        json.dump(list(results.values()), f, ensure_ascii=False, indent=2)

    print(f"\n\nDone. {scanned:,} newly scanned. Results in: {OUTPUT_JSON}")


def _draw_bar(idx, total, extra=""):
    pct = idx / total
    filled = int(40 * pct)
    bar = "#" * filled + "-" * (40 - filled)
    sys.stdout.write(f"\r[{bar}] {idx}/{total}{extra}")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
