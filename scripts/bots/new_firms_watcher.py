"""
new_firms_watcher.py

Runs every 10 minutes. Checks for companies registered in ΓΕΜΗ since our
last seen arGemi and inserts them into the DB.
"""

import logging
from datetime import datetime, timezone

import psycopg2.extras

from db import upsert_companies

log = logging.getLogger(__name__)

NAME       = "new_firms_watcher"
INTERVAL   = 10   # minutes between runs
FETCH_SIZE = 200


def run(db, gemi):
    log.info(f"[{NAME}] Starting check...")
    start = datetime.now(timezone.utc)

    try:
        # 1. Get the highest arGemi we currently have in DB
        with db.cursor() as cur:
            cur.execute("SELECT MAX(ar_gemi) FROM companies")
            row = cur.fetchone()
        max_ar_gemi = row[0] or 0
        log.info(f"[{NAME}] Current max arGemi in DB: {max_ar_gemi}")

        # 2. Fetch the newest companies from ΓΕΜΗ
        data      = gemi.fetch_companies(sort="-arGemi", size=FETCH_SIZE, offset=0)
        companies = data.get("searchResults", [])

        # 3. Keep only those we haven't seen yet
        new_companies = [c for c in companies if c["arGemi"] > max_ar_gemi]

        if not new_companies:
            log.info(f"[{NAME}] No new firms.")
            return

        # 4. Insert them
        from one_time.bulk_load import map_company
        records = [map_company(c) for c in new_companies]
        upsert_companies(db, records)

        elapsed = (datetime.now(timezone.utc) - start).seconds
        log.info(f"[{NAME}] Added {len(new_companies)} new firm(s) in {elapsed}s")

        # 5. Log to sync_log
        with db.cursor() as cur:
            cur.execute("""
                INSERT INTO sync_log (script_name, status, records_added, finished_at)
                VALUES (%s, 'completed', %s, %s)
            """, (NAME, len(new_companies), datetime.now(timezone.utc)))
        db.commit()

    except Exception as exc:
        log.error(f"[{NAME}] Error: {exc}")
        try:
            db.rollback()
            with db.cursor() as cur:
                cur.execute("""
                    INSERT INTO sync_log (script_name, status, error_message, finished_at)
                    VALUES (%s, 'failed', %s, %s)
                """, (NAME, str(exc), datetime.now(timezone.utc)))
            db.commit()
        except Exception:
            pass
