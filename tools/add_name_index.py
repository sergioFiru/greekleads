#!/usr/bin/env python3
"""
Add a trigram GIN index on companies.co_name_el so company-name search
(ILIKE '%foo%') can use an index instead of a sequential scan.

Why: the homepage typeahead and /search name filter both do a leading-wildcard
ILIKE on co_name_el. Without a trigram index Postgres must scan all ~1.67M
rows (measured ~2.2s per query). With it, lookups drop to well under 200ms.

pg_trgm and the email/phone/url/afm indexes already exist — see
tools/add_search_indexes.py. This adds the one that was missing.

Run from the repo root:  python tools/add_name_index.py

Safe to re-run: uses IF NOT EXISTS. Uses CONCURRENTLY so the table is never
locked for writes; the build takes a few minutes on 1.67M rows.
"""
import os
import sys
import threading
import time

import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'scripts', '.env'))
DSN = os.getenv('DATABASE_URL')
if not DSN:
    sys.exit("DATABASE_URL not found in scripts/.env")

STEPS = [
    ("pg_trgm extension",
     "CREATE EXTENSION IF NOT EXISTS pg_trgm"),
    ("co_name_el trigram index",
     "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_co_name_el_trgm "
     "ON companies USING GIN (co_name_el gin_trgm_ops)"),
]


def spinner(label, stop_event):
    """Elapsed-time progress ticker — CREATE INDEX gives no progress events."""
    frames = "|/-\\"
    start = time.time()
    i = 0
    while not stop_event.is_set():
        elapsed = int(time.time() - start)
        mins, secs = divmod(elapsed, 60)
        sys.stdout.write(f"\r  {frames[i % 4]} {label}... {mins:02d}:{secs:02d} elapsed")
        sys.stdout.flush()
        i += 1
        time.sleep(0.25)
    elapsed = int(time.time() - start)
    mins, secs = divmod(elapsed, 60)
    sys.stdout.write(f"\r  * {label}... done in {mins:02d}:{secs:02d}        \n")
    sys.stdout.flush()


def main():
    print("Connecting to DB...")
    conn = psycopg2.connect(DSN, connect_timeout=30)
    conn.autocommit = True  # CONCURRENTLY cannot run inside a transaction
    cur = conn.cursor()

    print(f"Running {len(STEPS)} step(s). The index build is the slow one.\n")
    for label, sql in STEPS:
        stop = threading.Event()
        t = threading.Thread(target=spinner, args=(label, stop), daemon=True)
        t.start()
        try:
            cur.execute(sql)
        finally:
            stop.set()
            t.join()

    # Report resulting index size so the disk cost is visible.
    cur.execute("""
        SELECT pg_size_pretty(pg_relation_size('idx_companies_co_name_el_trgm'))
    """)
    size = cur.fetchone()[0]
    print(f"\nIndex size on disk: {size}")

    print("Refreshing planner statistics...")
    cur.execute("ANALYZE companies")

    conn.close()
    print("\nDone. Company-name search is now index-backed.")


if __name__ == '__main__':
    main()
