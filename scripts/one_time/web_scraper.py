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
import sys
import os
import time
from pathlib import Path

import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv

from scan_utils import scan_site, normalize_url

load_dotenv(Path(__file__).parent.parent / ".env")

OUTPUT_JSON   = Path(__file__).parent.parent / "web_scan_results.json"
SLEEP_BETWEEN = 0.3   # seconds between requests
SAVE_EVERY    = 50    # write JSON every N new results


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
        found = scan_site(row["url"], session=session)

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
