"""
bulk_load.py

One-time script — run it overnight to load all ~1.6M ΓΕΜΗ companies into the DB.

Estimated runtime: ~18 hours (rate limit: 8 req/min → 12s sleep between requests)
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

import psycopg2.extras
from dotenv import load_dotenv

# allow imports from scripts/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from gemi import fetch_companies
from db import get_conn, upsert_companies

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

def get_or_create_run(conn):
    """Return (log_id, resume_offset, already_added), or (None, None, None) if already done."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        # If a completed run exists, nothing to do
        cur.execute("""
            SELECT finished_at FROM sync_log
            WHERE script_name = 'bulk_load' AND status = 'completed'
            LIMIT 1
        """)
        row = cur.fetchone()
        if row:
            log.info(f"Bulk load already completed on {row['finished_at']}. Skipping to live updater.")
            return None, None, None

        # Resume an interrupted run
        cur.execute("""
            SELECT * FROM sync_log
            WHERE script_name = 'bulk_load'
              AND status IN ('running', 'paused', 'failed')
            ORDER BY started_at DESC
            LIMIT 1
        """)
        row = cur.fetchone()
        if row:
            log.info(f"Resuming from offset {row['last_offset']:,}  (sync_log id={row['id']})")
            return row["id"], row["last_offset"], row["records_added"]

        cur.execute("""
            INSERT INTO sync_log (script_name, status, last_offset, records_added)
            VALUES ('bulk_load', 'running', 0, 0)
            RETURNING *
        """)
        row = cur.fetchone()
    conn.commit()
    log.info(f"Fresh run started  (sync_log id={row['id']})")
    return row["id"], 0, 0


def save_progress(conn, log_id, offset, added, status="running", error=None):
    finished = datetime.now(timezone.utc) if status in ("completed", "failed") else None
    try:
        conn.rollback()  # clear any aborted transaction before writing
    except Exception:
        pass
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE sync_log SET
                last_offset       = %s,
                records_processed = %s,
                records_added     = %s,
                status            = %s,
                error_message     = %s,
                finished_at       = %s
            WHERE id = %s
        """, (offset, offset, added, status, error, finished, log_id))
    conn.commit()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run():
    db = get_conn()
    log_id, offset, total_added = get_or_create_run(db)
    if log_id is None:
        return  # already completed — hand off to runner.py via &&
    batch_num = 0

    log.info(f"BATCH_SIZE={BATCH_SIZE}  SLEEP={SLEEP_BETWEEN_REQUESTS}s  ~18h total runtime")
    log.info("Press Ctrl-C at any time — progress is saved automatically.\n")

    try:
        while True:
            # Retry forever — 5 quick attempts, then 5-minute pause, repeat
            data = None
            api_was_down = False
            while data is None:
                for attempt in range(1, 6):
                    try:
                        data = fetch_companies(sort="+arGemi", size=BATCH_SIZE, offset=offset)
                        if api_was_down:
                            log.info("API recovered — resuming.")
                        break
                    except (ConnectionError, Timeout, Exception) as e:
                        if attempt == 1:
                            log.warning(f"API unreachable: {e}")
                        api_was_down = True
                        time.sleep(30 * attempt)
                if data is None:
                    log.warning("Still unreachable after 5 attempts — waiting 5 min before retrying...")
                    time.sleep(300)

            companies = data.get("searchResults", [])

            if not companies:
                log.info("")
                log.info("=" * 56)
                log.info("  BULK LOAD COMPLETE")
                log.info(f"  {total_added:,} companies loaded into the database.")
                log.info("  Handing off to live updater (runner.py)...")
                log.info("=" * 56)
                log.info("")
                save_progress(db, log_id, offset, total_added, status="completed")
                break

            records = [map_company(c) for c in companies]
            upsert_companies(db, records)

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
