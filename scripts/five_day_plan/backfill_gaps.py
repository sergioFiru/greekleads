"""
backfill_gaps.py — 5-Day-Plan one-off backfill for missed days.

daily_sync.py only ever looks at "yesterday's" incorporations (see its
ELIGIBILITY docstring) and has no catch-up mechanism — if the scheduler
missed a day (Railway restart, deploy gap, crash), that day's cohort is
skipped forever. This script finds those gaps and adds them manually.

Eligibility is identical to daily_sync.py's (imported from there, not
duplicated, so the rules can never drift out of sync) EXCEPT the date
window: instead of "incorporation_date = yesterday" it's
"incorporated within the last N days" (default 30 — matches the outreach
copy's own "πρώτο τους μήνα" / first-month promise, so we don't email a
company that's been operating for a year with an incorporation-week offer).

De-dup is against ALL of campaign_leads (not just today, like daily_sync's
guard), since this is explicitly sweeping a wide date range that may
include days already partially covered.

Run manually:
    python backfill_gaps.py                # adds up to 60, real run
    python backfill_gaps.py --dry-run       # preview, writes nothing
    python backfill_gaps.py --count=100     # different batch size
    python backfill_gaps.py --days=14       # different lookback window
"""
import sys
import time

import psycopg2
import psycopg2.extras

from daily_sync import (
    GREEKLEADS_DB_URL, SUPABASE_DB_URL, INSTANTLY_API_KEY, CAMPAIGN_ID,
    CAMPAIGN_CAP, EXCLUDE_KAD, main_kad, brand_name, ensure_schema,
)
from instantly_client import InstantlyClient

DRY_RUN = "--dry-run" in sys.argv
SLEEP_BETWEEN_CALLS = 0.3


def arg(name: str, default: int) -> int:
    prefix = f"--{name}="
    for a in sys.argv:
        if a.startswith(prefix):
            return int(a[len(prefix):])
    return default


BACKFILL_COUNT = arg("count", 60)
LOOKBACK_DAYS = arg("days", 30)


def fetch_backfill_eligible(gl_conn, already: set[int], lookback_days: int) -> list[dict]:
    with gl_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT ar_gemi, co_name_el, co_titles_el, email,
                   prefecture_descr, legal_type_descr, activities, incorporation_date
            FROM companies
            WHERE incorporation_date >= CURRENT_DATE - %s * INTERVAL '1 day'
              AND incorporation_date < CURRENT_DATE - INTERVAL '1 day'
              AND legal_type_descr <> 'ΑΤΟΜΙΚΗ'
              AND (url IS NULL OR trim(url) = '')
              AND (discovered_url IS NULL OR trim(discovered_url) = '')
              AND email IS NOT NULL AND trim(email) <> ''
            ORDER BY incorporation_date ASC, ar_gemi ASC
        """, (lookback_days,))
        rows = cur.fetchall()

    out = []
    for r in rows:
        ar_gemi = r["ar_gemi"]
        if ar_gemi in already:
            continue
        if main_kad(r["activities"]) in EXCLUDE_KAD:
            continue
        brand = brand_name(r["co_titles_el"], r["co_name_el"])
        if not brand:
            continue
        out.append({
            "ar_gemi": ar_gemi,
            "company_name": r["co_name_el"],
            "brand_name": brand,
            "email": r["email"].strip(),
            "prefecture": r["prefecture_descr"],
            "legal_type": r["legal_type_descr"],
            "incorporation_date": r["incorporation_date"],
        })
    return out


def run():
    print(f"[backfill] Starting gap backfill{' (DRY RUN)' if DRY_RUN else ''}...")
    print(f"[backfill] lookback={LOOKBACK_DAYS}d  count={BACKFILL_COUNT}")

    gl_conn = psycopg2.connect(GREEKLEADS_DB_URL, connect_timeout=30)
    sb_conn = psycopg2.connect(SUPABASE_DB_URL, connect_timeout=30)
    ensure_schema(sb_conn)

    with sb_conn.cursor() as cur:
        cur.execute("SELECT ar_gemi FROM campaign_leads")
        already = {row[0] for row in cur.fetchall()}
    print(f"[backfill] Already contacted (all-time): {len(already)}")

    eligible = fetch_backfill_eligible(gl_conn, already, LOOKBACK_DAYS)
    batch = eligible[:BACKFILL_COUNT]
    print(f"[backfill] Eligible in window: {len(eligible)}  ->  batch: {len(batch)}")

    with sb_conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM campaign_leads WHERE archived_at IS NULL")
        active_count = cur.fetchone()[0]

    overflow = (active_count + len(batch)) - CAMPAIGN_CAP
    to_remove = []
    if overflow > 0:
        with sb_conn.cursor() as cur:
            cur.execute("""
                SELECT ar_gemi, instantly_lead_id FROM campaign_leads
                WHERE archived_at IS NULL AND instantly_lead_id IS NOT NULL
                ORDER BY added_at ASC LIMIT %s
            """, (overflow,))
            to_remove = cur.fetchall()
    print(f"[backfill] Active in campaign: {active_count}  ->  removing: {len(to_remove)}")

    if DRY_RUN:
        for lead in batch:
            print(f"  WOULD ADD    {lead['ar_gemi']}  {lead['incorporation_date']}  "
                  f"{lead['company_name'][:40]:40}  brand={lead['brand_name']}")
        for ar_gemi, lead_id in to_remove:
            print(f"  WOULD REMOVE {ar_gemi}  (instantly_lead_id={lead_id})")
        print("[backfill] --dry-run: nothing written.")
        gl_conn.close()
        sb_conn.close()
        return

    client = InstantlyClient(INSTANTLY_API_KEY)

    if to_remove:
        client.bulk_delete(CAMPAIGN_ID, [lead_id for _, lead_id in to_remove])
        remove_ids = [ar_gemi for ar_gemi, _ in to_remove]
        with sb_conn.cursor() as cur:
            cur.execute(
                "UPDATE campaign_leads SET archived_at = NOW() WHERE ar_gemi = ANY(%s)",
                (remove_ids,)
            )
        sb_conn.commit()
        print(f"[backfill] Removed {len(to_remove)} aged-out leads from Instantly.")

    added = 0
    for i, lead in enumerate(batch, 1):
        try:
            result = client.create_lead(
                campaign_id=CAMPAIGN_ID,
                email=lead["email"],
                company_name=lead["company_name"],
                personalization=lead["brand_name"],
                custom_variables={
                    "ar_gemi": str(lead["ar_gemi"]),
                    "prefecture": lead["prefecture"] or "",
                    "legal_type": lead["legal_type"] or "",
                },
            )
            with sb_conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO campaign_leads
                        (ar_gemi, company_name, brand_name, email, prefecture, legal_type, instantly_lead_id)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (ar_gemi) DO NOTHING
                """, (
                    lead["ar_gemi"], lead["company_name"], lead["brand_name"], lead["email"],
                    lead["prefecture"], lead["legal_type"], result.get("id"),
                ))
            sb_conn.commit()
            added += 1
            print(f"[{i}/{len(batch)}] ADDED  ar_gemi={lead['ar_gemi']}  brand={lead['brand_name']}")
        except Exception as e:
            print(f"[{i}/{len(batch)}] FAILED ar_gemi={lead['ar_gemi']}: {e}")
        time.sleep(SLEEP_BETWEEN_CALLS)

    print(f"[backfill] Done. Added {added}/{len(batch)}, removed {len(to_remove)}.")
    gl_conn.close()
    sb_conn.close()


if __name__ == "__main__":
    run()
