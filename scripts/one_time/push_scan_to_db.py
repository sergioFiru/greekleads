"""
push_scan_to_db.py

Reads web_scan_results.json and bulk-updates the companies table with
social media URLs found by the web scraper.

Rules:
  - Only processes entries with no "error" field.
  - Updates: instagram_url, facebook_url, linkedin_url, twitter_url,
             tiktok_url, youtube_url.
  - Uses COALESCE — never overwrites a column that already has a value.
  - Skips email / phone — GEMI values are more reliable.

Run from the scripts/ directory:
    python one_time/push_scan_to_db.py
"""

import json
import os
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

RESULTS_JSON = Path(__file__).parent.parent / "web_scan_results.json"
BATCH_SIZE   = 1_000

SOCIAL_FIELDS = [
    ("instagram", "instagram_url"),
    ("facebook",  "facebook_url"),
    ("linkedin",  "linkedin_url"),
    ("twitter",   "twitter_url"),
    ("tiktok",    "tiktok_url"),
    ("youtube",   "youtube_url"),
]


def main():
    if not RESULTS_JSON.exists():
        print(f"Not found: {RESULTS_JSON}")
        sys.exit(1)

    with RESULTS_JSON.open(encoding="utf-8") as f:
        data = json.load(f)

    # Only keep successful results that have at least one social field
    rows = []
    for entry in data:
        if entry.get("error"):
            continue
        row = {"ar_gemi": int(entry["ar_gemi"])}
        for scan_key, col in SOCIAL_FIELDS:
            row[col] = entry.get(scan_key) or None
        # Include only if at least one social was found
        if any(row[col] for _, col in SOCIAL_FIELDS):
            rows.append(row)

    total_successful = sum(1 for e in data if not e.get("error"))
    print(f"Total results:          {len(data):,}")
    print(f"Successful scans:       {total_successful:,}")
    print(f"Have ≥1 social URL:     {len(rows):,}")
    print(f"Will push in batches of {BATCH_SIZE:,}\n")

    conn = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)

    updated = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]

        values = [
            (
                r["ar_gemi"],
                r["instagram_url"],
                r["facebook_url"],
                r["linkedin_url"],
                r["twitter_url"],
                r["tiktok_url"],
                r["youtube_url"],
            )
            for r in batch
        ]

        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, """
                UPDATE companies AS c SET
                  instagram_url = COALESCE(c.instagram_url, v.instagram_url),
                  facebook_url  = COALESCE(c.facebook_url,  v.facebook_url),
                  linkedin_url  = COALESCE(c.linkedin_url,  v.linkedin_url),
                  twitter_url   = COALESCE(c.twitter_url,   v.twitter_url),
                  tiktok_url    = COALESCE(c.tiktok_url,    v.tiktok_url),
                  youtube_url   = COALESCE(c.youtube_url,   v.youtube_url)
                FROM (VALUES %s) AS v(
                  ar_gemi, instagram_url, facebook_url, linkedin_url,
                  twitter_url, tiktok_url, youtube_url
                )
                WHERE c.ar_gemi = v.ar_gemi
            """, values)
        conn.commit()

        updated += len(batch)
        pct = updated / len(rows)
        filled = int(40 * pct)
        bar = "█" * filled + "░" * (40 - filled)
        sys.stdout.write(f"\r[{bar}] {pct:5.1%}  {updated:,}/{len(rows):,}")
        sys.stdout.flush()

    conn.close()
    print(f"\n\nDone. {updated:,} companies updated.")


if __name__ == "__main__":
    main()
