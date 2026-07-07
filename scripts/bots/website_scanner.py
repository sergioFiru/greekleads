"""
website_scanner.py

Scans websites of companies that have a URL but haven't been scanned yet
(website_scanned_at IS NULL). Updates social media columns directly in the DB.

Runs every 3 minutes, 20 companies per batch.
Never rescans — website_scanned_at is set on every attempt regardless of result.
"""

import logging
import time
from datetime import datetime, timezone

import psycopg2.extras

from scan_utils import scan_site

log = logging.getLogger(__name__)

NAME       = "website_scanner"
INTERVAL   = 3    # minutes
BATCH_SIZE = 20
SLEEP_BETWEEN = 0.3  # seconds between requests

SOCIAL_MAP = {
    "instagram": "instagram_url",
    "facebook":  "facebook_url",
    "linkedin":  "linkedin_url",
    "twitter":   "twitter_url",
    "tiktok":    "tiktok_url",
    "youtube":   "youtube_url",
}


def run(db, gemi):
    log.info(f"[{NAME}] Starting scan batch...")

    try:
        with db.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT ar_gemi, co_name_el, url
                FROM companies
                WHERE url IS NOT NULL
                  AND trim(url) != ''
                  AND website_scanned_at IS NULL
                ORDER BY ar_gemi
                LIMIT %s
            """, (BATCH_SIZE,))
            batch = cur.fetchall()

        if not batch:
            log.info(f"[{NAME}] No unscanned companies with URLs.")
            return

        log.info(f"[{NAME}] Scanning {len(batch)} companies...")
        scanned = 0
        socials_found = 0

        for row in batch:
            ar_gemi = row["ar_gemi"]
            result  = scan_site(row["url"])

            updates = {"website_scanned_at": datetime.now(timezone.utc)}
            for scan_key, col in SOCIAL_MAP.items():
                val = result.get(scan_key)
                if val:
                    updates[col] = val

            if len(updates) > 1:
                socials_found += 1

            set_clause = ", ".join(
                f"{k} = COALESCE({k}, %({k})s)" if k != "website_scanned_at"
                else f"{k} = %({k})s"
                for k in updates
            )
            updates["ar_gemi"] = ar_gemi

            with db.cursor() as cur:
                cur.execute(
                    f"UPDATE companies SET {set_clause} WHERE ar_gemi = %(ar_gemi)s",
                    updates,
                )
            db.commit()

            scanned += 1
            time.sleep(SLEEP_BETWEEN)

        log.info(f"[{NAME}] Done. {scanned} scanned, {socials_found} had socials.")

        with db.cursor() as cur:
            cur.execute("""
                INSERT INTO sync_log (script_name, status, records_added, finished_at)
                VALUES (%s, 'completed', %s, %s)
            """, (NAME, socials_found, datetime.now(timezone.utc)))
        db.commit()

    except Exception as exc:
        log.error(f"[{NAME}] Error: {exc}")
        try:
            db.rollback()
        except Exception:
            pass
