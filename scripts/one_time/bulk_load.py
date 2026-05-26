"""
bulk_load.py

One-time script — run it overnight to load all ~1.6M ΓΕΜΗ companies into Supabase.

Estimated runtime: ~18 hours (rate limit: 8 req/min → 8s sleep between requests)
Resume:           automatically resumes from last saved position if interrupted
Run:              python bulk_load.py
Stop safely:      Ctrl-C  (progress is saved, just re-run to continue)
"""

import os
import sys
import time
import logging
from datetime import datetime, timezone
from requests.exceptions import ConnectionError, Timeout

from dotenv import load_dotenv

# allow imports from scripts/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from gemi import fetch_companies
from db import get_client

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

BATCH_SIZE             = 200
SLEEP_BETWEEN_REQUESTS = 12   # seconds between requests
SAVE_PROGRESS_EVERY    = 10   # update sync_log every N batches


# ---------------------------------------------------------------------------
# Mapping
# ---------------------------------------------------------------------------

def _safe(obj, *keys):
    for k in keys:
        if not isinstance(obj, dict):
            return None
        obj = obj.get(k)
    return obj


def map_company(c: dict) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "ar_gemi":           c["arGemi"],
        "afm":               c.get("afm"),
        "co_name_el":        c.get("coNameEl"),
        "co_names_en":       c.get("coNamesEn")  or [],
        "co_titles_el":      c.get("coTitlesEl") or [],
        "co_titles_en":      c.get("coTitlesEn") or [],
        "objective":         c.get("objective"),
        "municipality_id":   _safe(c, "municipality", "id"),
        "municipality_descr":_safe(c, "municipality", "descr"),
        "prefecture_id":     _safe(c, "prefecture", "id"),
        "prefecture_descr":  _safe(c, "prefecture", "descr"),
        "city":              c.get("city"),
        "street":            c.get("street"),
        "street_number":     c.get("streetNumber"),
        "zip_code":          c.get("zipCode"),
        "po_box":            c.get("poBox"),
        "email":             c.get("email"),
        "phone":             c.get("phone"),
        "fax":               c.get("fax"),
        "url":               c.get("url"),
        "legal_type_id":     _safe(c, "legalType",   "id"),
        "legal_type_descr":  _safe(c, "legalType",   "descr"),
        "gemi_office_id":    _safe(c, "gemiOffice",  "id"),
        "gemi_office_descr": _safe(c, "gemiOffice",  "descr"),
        "status_id":         _safe(c, "status",      "id"),
        "status_descr":      _safe(c, "status",      "descr"),
        "is_branch":         c.get("isBranch",       False),
        "auto_registered":   c.get("autoRegistered", True),
        "incorporation_date":c.get("incorporationDate") or None,
        "last_status_change":c.get("lastStatusChange")  or None,
        "activities":        c.get("activities") or [],
        "persons":           c.get("persons")   or [],
        "capital":           c.get("capital")   or [],
        "stocks":            c.get("stocks")    or [],
        "branches":          c.get("branch")    or [],
        "gemi_fetched_at":   now,
        "last_updated_at":   now,
    }


# ---------------------------------------------------------------------------
# Sync log helpers
# ---------------------------------------------------------------------------

def get_or_create_run(db):
    """Return (log_id, resume_offset, already_added). Resumes if a paused run exists."""
    result = (
        db.table("sync_log")
        .select("*")
        .eq("script_name", "bulk_load")
        .in_("status", ["running", "paused", "failed"])
        .order("started_at", desc=True)
        .limit(1)
        .execute()
    )
    if result.data:
        entry = result.data[0]
        log.info(f"Resuming from offset {entry['last_offset']:,}  (sync_log id={entry['id']})")
        return entry["id"], entry["last_offset"], entry["records_added"]

    entry = db.table("sync_log").insert({
        "script_name":  "bulk_load",
        "status":       "running",
        "last_offset":  0,
        "records_added": 0,
    }).execute().data[0]
    log.info(f"Fresh run started  (sync_log id={entry['id']})")
    return entry["id"], 0, 0


def save_progress(db, log_id, offset, added, status="running", error=None):
    db.table("sync_log").update({
        "last_offset":        offset,
        "records_processed":  offset,
        "records_added":      added,
        "status":             status,
        "error_message":      error,
        "finished_at":        datetime.now(timezone.utc).isoformat() if status in ("completed", "failed") else None,
    }).eq("id", log_id).execute()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run():
    db = get_client()
    log_id, offset, total_added = get_or_create_run(db)
    batch_num = 0

    log.info(f"BATCH_SIZE={BATCH_SIZE}  SLEEP={SLEEP_BETWEEN_REQUESTS}s  ~18h total runtime")
    log.info("Press Ctrl-C at any time — progress is saved automatically.\n")

    try:
        while True:
            # Retry forever — 5 quick attempts, then 5-minute pause, repeat
            data = None
            round_num = 0
            while data is None:
                round_num += 1
                for attempt in range(1, 6):
                    try:
                        data = fetch_companies(sort="+arGemi", size=BATCH_SIZE, offset=offset)
                        break
                    except (ConnectionError, Timeout, Exception) as e:
                        wait = 30 * attempt
                        log.warning(f"Network error (round {round_num}, attempt {attempt}/5): {e}. Retrying in {wait}s...")
                        time.sleep(wait)
                if data is None:
                    log.warning(f"API still unreachable after 5 attempts. Waiting 5 min before next round...")
                    time.sleep(300)

            companies = data.get("searchResults", [])

            if not companies:
                log.info("No more results — bulk load complete!")
                save_progress(db, log_id, offset, total_added, status="completed")
                break

            records = [map_company(c) for c in companies]
            db.table("companies").upsert(records, on_conflict="ar_gemi").execute()

            total_added += len(records)
            offset      += len(companies)
            batch_num   += 1

            if batch_num % SAVE_PROGRESS_EVERY == 0:
                elapsed_h = batch_num * SLEEP_BETWEEN_REQUESTS / 3600
                remaining_batches = (1_664_407 - offset) / BATCH_SIZE
                eta_h = remaining_batches * SLEEP_BETWEEN_REQUESTS / 3600
                log.info(
                    f"Batch {batch_num:,} | offset={offset:,} | stored={total_added:,} | "
                    f"elapsed={elapsed_h:.1f}h | eta≈{eta_h:.1f}h"
                )
                save_progress(db, log_id, offset, total_added)

            time.sleep(SLEEP_BETWEEN_REQUESTS)

    except KeyboardInterrupt:
        log.info(f"\nStopped at offset {offset:,}. Run again to resume.")
        save_progress(db, log_id, offset, total_added, status="paused")

    except Exception as exc:
        log.error(f"Error at offset {offset:,}: {exc}")
        save_progress(db, log_id, offset, total_added, status="failed", error=str(exc))
        raise


if __name__ == "__main__":
    run()
