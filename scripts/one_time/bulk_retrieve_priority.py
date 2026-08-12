"""
bulk_retrieve_priority.py — one-time backfill: pre-populate financial_statements
for a priority batch of companies via the already-built retrieve_svc, so their
company pages render financials instantly for real visitors instead of showing
the on-demand Retrieve button (which only starts extracting once a visitor
actually clicks it, taking minutes).

Priority = active ΑΕ/ΙΚΕ/ΕΠΕ companies with a recognizable trade name
(co_titles_el — the same brand signal already used for SEO), that already have
public filings (financial_ar_gemi_scanned.docs_found > 0), not yet in
financial_statements — sorted by declared share capital DESC. That's the best
available proxy for "prominent, likely to be searched" since there's no real
page-view data to rank by yet. Deliberately NO legal-type filter: ΑΕ naturally
dominates a capital sort (much higher historical minimum capital) without
artificially excluding a large ΙΚΕ or ΕΠΕ. Confirmed with the user 2026-08-12.

Budget: BUDGET_EUR / COST_PER_DOC (real average from actual OpenRouter
billing — $0.001407/doc for Gemini 2.5 Flash, from the 2026-08-12 CSV
analysis, not published per-token pricing) = a document budget, spent by
walking the priority list until the running total of each company's
ALREADY-KNOWN doc count (docs_found, from the existence scanner — no
guessing) would exceed it.

Runs sequentially, one company at a time, through the same POST /retrieve +
poll /retrieve/{job_id} flow the frontend button uses — zero new extraction
logic, 100% reuse of retrieve_svc. Sequential on purpose, not concurrent:
most of this batch doesn't have docs downloaded yet, so it'll trigger
retrieve_svc's live Playwright discovery+download step, and
scripts/playwright_svc's own proven-safe rate (1.2 downloads/sec, tuned
against real 429s) is a COMBINED rate across whatever's hitting
businessportal.gr at once — running several companies through that step in
parallel here would multiply it. Slower (rough estimate: order of a day,
maybe more, unattended) but doesn't risk the source site rate-limiting or
banning the crawler.

Resumable: the priority query always excludes companies already in
financial_statements, so stop with Ctrl+C anytime and rerun to continue —
though the ranked list can shift slightly between runs if
financial_ar_gemi_scanned changed in between (the continuous existence
scanner is always running); that's expected, not a bug.

Env (scripts/.env):
    DATABASE_URL      — required
    RETRIEVE_SVC_URL  — required, the retrieve_svc Railway service's public URL
    BUDGET_EUR        — optional, default 50

Run from the scripts/ directory:
    PYTHONIOENCODING=utf-8 py one_time/bulk_retrieve_priority.py
"""

import os
import sys
import time
from pathlib import Path

import psycopg2
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

DATABASE_URL = os.environ["DATABASE_URL"]
RETRIEVE_SVC_URL = os.environ.get("RETRIEVE_SVC_URL", "").rstrip("/")

COST_PER_DOC = 0.001407  # real average, Gemini 2.5 Flash — see 2026-08-12 OpenRouter billing CSV analysis
BUDGET_EUR = float(os.environ.get("BUDGET_EUR", "50"))
BUDGET_DOCS = int(BUDGET_EUR / COST_PER_DOC)

POLL_SECONDS = 5
JOB_TIMEOUT_SECONDS = 30 * 60  # bail on a single company after 30 min rather than hang forever


def get_conn():
    return psycopg2.connect(DATABASE_URL, connect_timeout=30)


def fetch_priority_list(conn) -> list:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT ar_gemi FROM (
                SELECT c.ar_gemi, s.docs_found,
                       SUM(s.docs_found) OVER (
                           ORDER BY COALESCE((c.capital->0->>'capitalStock')::numeric, 0) DESC, c.ar_gemi ASC
                       ) AS running_docs
                FROM companies c
                JOIN financial_ar_gemi_scanned s ON s.ar_gemi = c.ar_gemi
                WHERE c.status_descr = 'Ενεργή'
                  AND c.legal_type_descr IN ('ΑΕ', 'ΙΚΕ', 'ΕΠΕ')
                  AND c.co_titles_el IS NOT NULL AND jsonb_array_length(c.co_titles_el) > 0
                  AND s.docs_found > 0
                  AND NOT EXISTS (SELECT 1 FROM financial_statements fs WHERE fs.ar_gemi = c.ar_gemi)
            ) t
            WHERE running_docs <= %s
            ORDER BY running_docs
        """, (BUDGET_DOCS,))
        return [str(row[0]) for row in cur.fetchall()]


def already_done(conn, ar_gemi: str) -> bool:
    # Live re-check — a previous interrupted run, or someone manually clicking
    # the button on this company in the meantime, may have already covered it.
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM financial_statements WHERE ar_gemi = %s LIMIT 1", (ar_gemi,))
        return cur.fetchone() is not None


def retrieve_one(ar_gemi: str):
    """Returns (success: bool, message: str)."""
    try:
        resp = requests.post(f"{RETRIEVE_SVC_URL}/retrieve", json={"ar_gemi": int(ar_gemi)}, timeout=30)
        resp.raise_for_status()
        job_id = resp.json()["job_id"]
    except Exception as e:
        return False, f"failed to start job: {e}"

    started = time.time()
    while time.time() - started < JOB_TIMEOUT_SECONDS:
        time.sleep(POLL_SECONDS)
        try:
            r = requests.get(f"{RETRIEVE_SVC_URL}/retrieve/{job_id}", timeout=30)
            r.raise_for_status()
            job = r.json()
        except Exception as e:
            return False, f"failed to poll job: {e}"

        if job["status"] == "done":
            years = len((job.get("result") or {}).get("fiscal_years", []))
            return True, f"{years} fiscal year(s) written"
        if job["status"] == "error":
            return False, job.get("error") or "unknown error"

    return False, "timed out after 30 min"


def main():
    if not RETRIEVE_SVC_URL:
        print("RETRIEVE_SVC_URL not set in scripts/.env", file=sys.stderr)
        sys.exit(1)

    conn = get_conn()
    priority = fetch_priority_list(conn)
    total = len(priority)

    print("=" * 60)
    print("  BULK RETRIEVE — priority financials backfill")
    print(f"  Budget:            EUR {BUDGET_EUR:.0f}  (~{BUDGET_DOCS:,} documents)")
    print(f"  Companies queued:  {total:,}")
    print(f"  retrieve_svc:      {RETRIEVE_SVC_URL}")
    print("=" * 60)

    if total == 0:
        print("Nothing to do.")
        conn.close()
        return

    ok_count = fail_count = skip_count = 0

    try:
        for i, ar_gemi in enumerate(priority, 1):
            if already_done(conn, ar_gemi):
                skip_count += 1
                print(f"[{i}/{total}] ar_gemi={ar_gemi}  SKIP (already retrieved)")
                continue

            t0 = time.time()
            ok, msg = retrieve_one(ar_gemi)
            elapsed = time.time() - t0

            if ok:
                ok_count += 1
                print(f"[{i}/{total}] ar_gemi={ar_gemi}  OK    {msg}  ({elapsed:.0f}s)")
            else:
                fail_count += 1
                print(f"[{i}/{total}] ar_gemi={ar_gemi}  FAIL  {msg}  ({elapsed:.0f}s)")

            done = ok_count + fail_count + skip_count
            print(f"    progress: {done}/{total} ({done / total * 100:.1f}%)  "
                  f"ok={ok_count} fail={fail_count} skip={skip_count}")
    except KeyboardInterrupt:
        print("\n\nStopped — progress is saved (each company is written as it finishes), rerun to continue.")
    finally:
        conn.close()

    print("=" * 60)
    print(f"Done this run: ok={ok_count} fail={fail_count} skip={skip_count} / {total}")


if __name__ == "__main__":
    main()
