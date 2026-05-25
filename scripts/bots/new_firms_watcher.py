"""
new_firms_watcher.py

Runs every 10 minutes. Checks for companies registered in ΓΕΜΗ since our
last seen arGemi and inserts them into Supabase.

This is the bot that keeps the database perpetually up to date after
the one-time bulk_load is done.
"""

import logging
import time
from datetime import datetime, timezone

log = logging.getLogger(__name__)

NAME     = "new_firms_watcher"
INTERVAL = 10   # minutes between runs
FETCH_SIZE = 200


def run(db, gemi):
    log.info(f"[{NAME}] Starting check...")
    start = datetime.now(timezone.utc)

    try:
        # 1. Get the highest arGemi we currently have in DB
        result = db.table("companies").select("ar_gemi").order("ar_gemi", desc=True).limit(1).execute()
        max_ar_gemi = result.data[0]["ar_gemi"] if result.data else 0
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
        db.table("companies").upsert(records, on_conflict="ar_gemi").execute()

        elapsed = (datetime.now(timezone.utc) - start).seconds
        log.info(f"[{NAME}] Added {len(new_companies)} new firm(s) in {elapsed}s")

        # 5. Log to sync_log
        db.table("sync_log").insert({
            "script_name":    NAME,
            "status":         "completed",
            "records_added":  len(new_companies),
            "finished_at":    datetime.now(timezone.utc).isoformat(),
        }).execute()

    except Exception as exc:
        log.error(f"[{NAME}] Error: {exc}")
        db.table("sync_log").insert({
            "script_name":   NAME,
            "status":        "failed",
            "error_message": str(exc),
            "finished_at":   datetime.now(timezone.utc).isoformat(),
        }).execute()
