"""
website_scanner.py

Two passes per cycle:

  Pass 1 — SOCIAL SCAN (original behaviour)
    Firms that HAVE a ΓΕΜΗ url but haven't been scanned (website_scanned_at IS
    NULL). Scans the url, fills social columns. Stamps website_scanned_at.

  Pass 2 — WEBSITE DISCOVERY (new)
    Active firms with NO ΓΕΜΗ url but a CUSTOM-DOMAIN email (freemail excluded
    in SQL). Probes the email domain; if a live site answers, records it in
    `discovered_url` (+ website_source='discovered', ΓΕΜΗ's `url` untouched) and
    harvests socials from that page. Stamps discovered_scanned_at on every
    attempt so a firm is never re-probed.

Runs every 3 minutes. Never overwrites an existing value (COALESCE); the
stamp columns are the only fields written unconditionally.

Requires columns from migrate_discovery_columns.py:
  discovered_url, website_source, discovered_scanned_at.
"""

import logging
import time
from datetime import datetime, timezone

import psycopg2.extras

from scan_utils import scan_site, probe_domain, email_domain, FREEMAIL

log = logging.getLogger(__name__)

NAME       = "website_scanner"
INTERVAL   = 3    # minutes
BATCH_SIZE = 20   # pass 1: url firms per cycle
DISCOVER_BATCH = 12   # pass 2: no-url firms probed per cycle (kept modest —
                      # each probe is 2 requests; bounds the cycle's wall time)
SLEEP_BETWEEN = 0.3   # seconds between requests

SOCIAL_MAP = {
    "instagram": "instagram_url",
    "facebook":  "facebook_url",
    "linkedin":  "linkedin_url",
    "twitter":   "twitter_url",
    "tiktok":    "tiktok_url",
    "youtube":   "youtube_url",
}


def _write(db, ar_gemi, updates, stamp_col):
    """Apply `updates` to one company. `stamp_col` is set unconditionally;
    every other column is COALESCE'd so an existing value is never overwritten."""
    set_clause = ", ".join(
        f"{k} = %({k})s" if k == stamp_col else f"{k} = COALESCE({k}, %({k})s)"
        for k in updates
    )
    params = dict(updates, ar_gemi=ar_gemi)
    with db.cursor() as cur:
        cur.execute(
            f"UPDATE companies SET {set_clause} WHERE ar_gemi = %(ar_gemi)s",
            params,
        )
    db.commit()


def _log_sync(db, script_name, added):
    with db.cursor() as cur:
        cur.execute("""
            INSERT INTO sync_log (script_name, status, records_added, finished_at)
            VALUES (%s, 'completed', %s, %s)
        """, (script_name, added, datetime.now(timezone.utc)))
    db.commit()


# ---------------------------------------------------------------------------
# Pass 1 — social scan of firms that already have a ΓΕΜΗ url
# ---------------------------------------------------------------------------
def _scan_url_firms(db):
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
        log.info(f"[{NAME}] pass1: no unscanned companies with URLs.")
        return

    log.info(f"[{NAME}] pass1: scanning {len(batch)} url firms...")
    socials_found = 0

    for row in batch:
        result = scan_site(row["url"])
        updates = {"website_scanned_at": datetime.now(timezone.utc)}
        for scan_key, col in SOCIAL_MAP.items():
            val = result.get(scan_key)
            if val:
                updates[col] = val
        if len(updates) > 1:
            socials_found += 1
        _write(db, row["ar_gemi"], updates, "website_scanned_at")
        time.sleep(SLEEP_BETWEEN)

    log.info(f"[{NAME}] pass1: done. {len(batch)} scanned, {socials_found} had socials.")
    _log_sync(db, NAME, socials_found)


# ---------------------------------------------------------------------------
# Pass 2 — discover websites for firms with no ΓΕΜΗ url but a custom-domain email
# ---------------------------------------------------------------------------
def _discover_no_url_firms(db):
    with db.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT ar_gemi, co_name_el, email
            FROM companies
            WHERE (url IS NULL OR trim(url) = '')
              AND is_branch IS NOT TRUE
              AND email IS NOT NULL AND trim(email) <> ''
              AND discovered_scanned_at IS NULL
              AND lower(split_part(email, '@', 2)) <> ALL(%s)
            ORDER BY ar_gemi
            LIMIT %s
        """, (list(FREEMAIL), DISCOVER_BATCH))
        batch = cur.fetchall()

    if not batch:
        log.info(f"[{NAME}] pass2: no unscanned no-url custom-domain firms.")
        return

    log.info(f"[{NAME}] pass2: probing {len(batch)} email domains...")
    sites_found = 0

    for row in batch:
        updates = {"discovered_scanned_at": datetime.now(timezone.utc)}
        dom = email_domain(row["email"])  # authoritative freemail/validity gate

        if dom:
            res = probe_domain(dom)
            if res["status"] == "live":
                updates["discovered_url"] = res["url"]
                updates["website_source"] = "discovered"
                harvest = res["harvest"]
                for scan_key, col in SOCIAL_MAP.items():
                    val = harvest.get(scan_key)
                    if val:
                        updates[col] = val
                sites_found += 1
            time.sleep(SLEEP_BETWEEN)

        _write(db, row["ar_gemi"], updates, "discovered_scanned_at")

    log.info(f"[{NAME}] pass2: done. {len(batch)} probed, {sites_found} live sites found.")
    _log_sync(db, "website_discoverer", sites_found)


def run(db, gemi):
    log.info(f"[{NAME}] Starting scan batch...")

    # Each pass is isolated so a failure in one doesn't skip the other.
    try:
        _scan_url_firms(db)
    except Exception as exc:
        log.error(f"[{NAME}] pass1 error: {exc}")
        try:
            db.rollback()
        except Exception:
            pass

    try:
        _discover_no_url_firms(db)
    except Exception as exc:
        log.error(f"[{NAME}] pass2 error: {exc}")
        try:
            db.rollback()
        except Exception:
            pass
