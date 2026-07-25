"""
clear_branch_discoveries.py

Branch entities (is_branch = true) are sub-registrations of a parent company —
a chain like ΑΛΦΑ-ΒΗΤΑ ΒΑΣΙΛΟΠΟΥΛΟΣ has hundreds of them. The website-discovery
scan wrongly enriched EACH branch with the parent's site + socials (they share
one @domain email), which floods the "most-enriched-first" search sort with
duplicate chain rows.

This clears the discovered enrichment on BRANCH rows only:
    discovered_url, website_source, and the 6 social_url columns → NULL
  WHERE is_branch = TRUE AND website_source = 'discovered'

Kept untouched:
  - independent firms (is_branch = false) — all 63k+ real discoveries stay
  - parent entities — they aren't branches
  - discovered_scanned_at — left set so nothing gets re-probed (and the scanners
    now skip branches anyway)

Safe to re-run (targets only rows that still have website_source='discovered').
Run from scripts/:
    python one_time/clear_branch_discoveries.py --dry-run
    python one_time/clear_branch_discoveries.py
"""
import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

BATCH_SIZE = 1_000
DRY_RUN = "--dry-run" in sys.argv

SOCIAL_COLS = ["instagram_url", "facebook_url", "linkedin_url",
               "twitter_url", "tiktok_url", "youtube_url"]


def bar(done, total, width=40):
    total = max(total, 1)
    pct = done / total
    filled = int(width * pct)
    return "█" * filled + "░" * (width - filled), pct


def main():
    conn = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
    with conn.cursor() as cur:
        cur.execute("""
            SELECT ar_gemi FROM companies
            WHERE is_branch = TRUE AND website_source = 'discovered'
            ORDER BY ar_gemi
        """)
        ids = [r[0] for r in cur.fetchall()]

    print(f"Branch rows with discovered enrichment: {len(ids):,}")
    if DRY_RUN:
        print("--dry-run: nothing changed.")
        conn.close()
        return
    if not ids:
        print("Nothing to clean.")
        conn.close()
        return

    set_clause = "discovered_url = NULL, website_source = NULL, " + \
        ", ".join(f"{c} = NULL" for c in SOCIAL_COLS)
    update_sql = f"UPDATE companies SET {set_clause} WHERE ar_gemi = ANY(%s)"

    print(f"Clearing in batches of {BATCH_SIZE:,}…\n")
    b, pct = bar(0, len(ids))
    sys.stdout.write(f"\r[{b}] {pct:5.1%}  0/{len(ids):,}")
    sys.stdout.flush()

    done = 0
    for i in range(0, len(ids), BATCH_SIZE):
        chunk = ids[i:i + BATCH_SIZE]
        with conn.cursor() as cur:
            cur.execute(update_sql, (chunk,))
        conn.commit()
        done += len(chunk)
        b, pct = bar(done, len(ids))
        sys.stdout.write(f"\r[{b}] {pct:5.1%}  {done:,}/{len(ids):,}")
        sys.stdout.flush()

    conn.close()
    print(f"\n\nDone. Cleared discovered enrichment from {done:,} branch rows. "
          f"Independent-firm discoveries were left untouched.")


if __name__ == "__main__":
    main()
