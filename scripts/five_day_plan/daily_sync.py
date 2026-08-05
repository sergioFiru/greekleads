"""
daily_sync.py — 5-Day-Plan daily lead sync.

A completely separate business/component from the GreekLeads live-watcher
bots — different Railway service, no shared code path. It reuses only the
GreekLeads Postgres DB as a READ-ONLY lead source; all of its own state
(who's been added, when, their Instantly lead ID) lives in a different
Postgres database entirely: the Supabase project "5-day-plan-tracking".

What it does, once per run:
  1. Pull YESTERDAY's newly incorporated firms from GreekLeads matching the
     target profile (see ELIGIBILITY below).
  2. Cap the batch at DAILY_ADD_COUNT.
  3. If adding that batch would push the campaign over CAMPAIGN_CAP, delete
     the oldest already-added leads (by our own added_at, not Instantly's)
     to make exactly enough room — no more.
  4. Add the new batch to the Instantly campaign, personalized with the
     firm's δ.τ. brand name.
  5. Record everything in Supabase so a firm is NEVER contacted twice, even
     across restarts.

ELIGIBILITY (agreed 2026-08-05):
  - incorporation_date = yesterday
  - legal_type_descr <> 'ΑΤΟΜΙΚΗ'           (sole proprietors excluded)
  - url AND discovered_url both empty       (genuinely has no website)
  - main KAD activity is NOT food delivery  (53200200 excluded)
  - has an email
  - has a δ.τ. (co_titles_el) DISTINCT from its legal name — used as the
    {{personalization}} variable. Firms with no brand name are skipped for
    now (not "no brand → fall back to legal name" — deliberately excluded).

CONFIG (change these, not the logic, when the Instantly plan/inboxes grow):
  DAILY_ADD_COUNT = 60   (2 inboxes x 30/day, hardcoded 2026-08-05)
  CAMPAIGN_CAP     = 1000 (Instantly Growth plan lead cap)

Run manually to test:
    python daily_sync.py            # does the real thing
    python daily_sync.py --dry-run  # prints what it WOULD do, writes nothing
"""
import os
import sys
import time
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

from instantly_client import InstantlyClient

load_dotenv(Path(__file__).parent / ".env")

GREEKLEADS_DB_URL = os.environ["DATABASE_URL"]          # read-only source
SUPABASE_DB_URL   = os.environ["SUPABASE_DB_URL"]        # our own state
INSTANTLY_API_KEY = os.environ["INSTANTLY_API_KEY"]
CAMPAIGN_ID       = os.getenv("INSTANTLY_CAMPAIGN_ID", "0d851348-2979-4bd4-b623-c9ce25b00f3e")

DAILY_ADD_COUNT = int(os.getenv("DAILY_ADD_COUNT", "60"))
CAMPAIGN_CAP    = int(os.getenv("CAMPAIGN_CAP", "1000"))
EXCLUDE_KAD     = {"53200200"}  # food delivery — see PROJECT.md sector analysis

DRY_RUN = "--dry-run" in sys.argv
SLEEP_BETWEEN_CALLS = 0.3  # seconds, be polite to the API


def main_kad(activities):
    """Same logic used elsewhere in GreekLeads: prefer the current (dtTo IS
    NULL) main activity; fall back to any 'Κύρια' entry."""
    if not activities:
        return None
    for a in activities:
        if a.get("type") == "Κύρια" and a.get("dtTo") is None:
            return (a.get("activity") or {}).get("id")
    for a in activities:
        if a.get("type") == "Κύρια":
            return (a.get("activity") or {}).get("id")
    return None


def brand_name(co_titles_el, legal_name):
    """First δ.τ. that differs from the legal name, or None. Mirrors
    web/lib/brand.ts so the two stay conceptually in sync."""
    if not co_titles_el:
        return None
    legal = (legal_name or "").strip().lower()
    for t in co_titles_el:
        v = (t or "").strip()
        if v and v.lower() != legal:
            return v
    return None


def ensure_schema(sb_conn):
    """Safety net so this script is portable to a fresh Supabase project too
    — the real schema already exists (created 2026-08-05), this just makes
    a fresh environment self-sufficient."""
    with sb_conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS campaign_leads (
                id                BIGSERIAL PRIMARY KEY,
                ar_gemi           BIGINT NOT NULL UNIQUE,
                company_name      TEXT NOT NULL,
                brand_name        TEXT NOT NULL,
                email             TEXT NOT NULL,
                prefecture        TEXT,
                legal_type        TEXT,
                instantly_lead_id TEXT,
                added_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                archived_at       TIMESTAMPTZ
            )
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS campaign_leads_active_idx
            ON campaign_leads (added_at) WHERE archived_at IS NULL
        """)
    sb_conn.commit()


def fetch_eligible(gl_conn, already_today: set[int]) -> list[dict]:
    with gl_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT ar_gemi, co_name_el, co_titles_el, email,
                   prefecture_descr, legal_type_descr, activities
            FROM companies
            WHERE incorporation_date = CURRENT_DATE - INTERVAL '1 day'
              AND legal_type_descr <> 'ΑΤΟΜΙΚΗ'
              AND (url IS NULL OR trim(url) = '')
              AND (discovered_url IS NULL OR trim(discovered_url) = '')
              AND email IS NOT NULL AND trim(email) <> ''
            ORDER BY ar_gemi
        """)
        rows = cur.fetchall()

    out = []
    for r in rows:
        ar_gemi = r["ar_gemi"]
        if ar_gemi in already_today:
            continue
        if main_kad(r["activities"]) in EXCLUDE_KAD:
            continue
        brand = brand_name(r["co_titles_el"], r["co_name_el"])
        if not brand:
            continue  # no distinct brand name — skip for now, per 2026-08-05 decision
        out.append({
            "ar_gemi": ar_gemi,
            "company_name": r["co_name_el"],
            "brand_name": brand,
            "email": r["email"].strip(),
            "prefecture": r["prefecture_descr"],
            "legal_type": r["legal_type_descr"],
        })
    return out


def run():
    print(f"[5day] Starting daily sync{' (DRY RUN)' if DRY_RUN else ''}...")
    gl_conn = psycopg2.connect(GREEKLEADS_DB_URL, connect_timeout=30)
    sb_conn = psycopg2.connect(SUPABASE_DB_URL, connect_timeout=30)
    ensure_schema(sb_conn)

    # Guard against an accidental same-day double-run — only checks TODAY's
    # rows, so this stays cheap no matter how large the table grows.
    with sb_conn.cursor() as cur:
        cur.execute("SELECT ar_gemi FROM campaign_leads WHERE added_at::date = CURRENT_DATE")
        already_today = {row[0] for row in cur.fetchall()}

    eligible = fetch_eligible(gl_conn, already_today)
    batch = eligible[:DAILY_ADD_COUNT]
    print(f"[5day] Eligible today: {len(eligible)}  ->  batch: {len(batch)}")

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
    print(f"[5day] Active in campaign: {active_count}  ->  removing: {len(to_remove)}")

    if DRY_RUN:
        for lead in batch:
            print(f"  WOULD ADD    {lead['ar_gemi']}  {lead['company_name'][:40]:40}  brand={lead['brand_name']}")
        for ar_gemi, lead_id in to_remove:
            print(f"  WOULD REMOVE {ar_gemi}  (instantly_lead_id={lead_id})")
        print("[5day] --dry-run: nothing written.")
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
        print(f"[5day] Removed {len(to_remove)} aged-out leads from Instantly.")

    added = 0
    for lead in batch:
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
        except Exception as e:
            print(f"[5day] FAILED to add ar_gemi={lead['ar_gemi']}: {e}")
        time.sleep(SLEEP_BETWEEN_CALLS)

    print(f"[5day] Done. Added {added}/{len(batch)}, removed {len(to_remove)}.")
    gl_conn.close()
    sb_conn.close()


if __name__ == "__main__":
    run()
