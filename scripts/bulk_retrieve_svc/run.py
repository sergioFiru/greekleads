"""
run.py — Railway one-time job: pre-populate financial_statements for a
priority batch of companies via the already-built retrieve_svc, so their
company pages render financials instantly for real visitors instead of
showing the on-demand Retrieve button (which only starts extracting once a
visitor actually clicks it, taking minutes).

Same script as scripts/one_time/bulk_retrieve_priority.py, packaged as its
own Railway service (self-contained per the established pattern — see
scripts/existence_scan_svc, scripts/playwright_svc) so it runs unattended on
Railway instead of needing a laptop to stay on for the ~day-plus this takes.
No Playwright/browser dependency here at all — this only makes HTTP calls to
retrieve_svc (which does the actual Playwright work) and reads/writes
Postgres, so it uses a plain python:3.11-slim base image, not the Playwright
one.

Priority = active ΑΕ/ΙΚΕ/ΕΠΕ companies with a recognizable trade name
(co_titles_el — the same brand signal already used for SEO), that already
have public filings (financial_ar_gemi_scanned.docs_found > 0), not yet in
financial_statements — sorted by declared share capital DESC. Best available
proxy for "prominent, likely to be searched" since there's no real page-view
data to rank by yet. Deliberately NO legal-type filter: ΑΕ naturally
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
parallel here would multiply it. Slower (order of a day, maybe more) but
doesn't risk the source site rate-limiting or banning the crawler.

Resumable: the priority query always excludes companies already in
financial_statements, so this is safe to stop and restart anytime — each
company's result is committed as soon as it finishes. Runs to completion
once and exits — this is a one-time backfill, not a perpetual worker, so set
this Railway service's Restart Policy to "Never" (or "On Failure") rather
than "Always", otherwise Railway will just re-run it in a loop once it exits
clean.

Env vars (Railway service dashboard):
    DATABASE_URL      — required, same GreekLeads Postgres as everything else
    RETRIEVE_SVC_URL  — required, retrieve_svc's public Railway URL
    BUDGET_EUR        — optional, default 50
"""

import os
import sys
import time

import psycopg2
import requests

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
        print("RETRIEVE_SVC_URL not set", file=sys.stderr, flush=True)
        sys.exit(1)

    conn = get_conn()
    priority = fetch_priority_list(conn)
    total = len(priority)

    print("=" * 60, flush=True)
    print("  BULK RETRIEVE — priority financials backfill", flush=True)
    print(f"  Budget:            EUR {BUDGET_EUR:.0f}  (~{BUDGET_DOCS:,} documents)", flush=True)
    print(f"  Companies queued:  {total:,}", flush=True)
    print(f"  retrieve_svc:      {RETRIEVE_SVC_URL}", flush=True)
    print("=" * 60, flush=True)

    if total == 0:
        print("Nothing to do.", flush=True)
        conn.close()
        return

    ok_count = fail_count = skip_count = 0

    for i, ar_gemi in enumerate(priority, 1):
        if already_done(conn, ar_gemi):
            skip_count += 1
            print(f"[{i}/{total}] ar_gemi={ar_gemi}  SKIP (already retrieved)", flush=True)
            continue

        t0 = time.time()
        ok, msg = retrieve_one(ar_gemi)
        elapsed = time.time() - t0

        if ok:
            ok_count += 1
            print(f"[{i}/{total}] ar_gemi={ar_gemi}  OK    {msg}  ({elapsed:.0f}s)", flush=True)
        else:
            fail_count += 1
            print(f"[{i}/{total}] ar_gemi={ar_gemi}  FAIL  {msg}  ({elapsed:.0f}s)", flush=True)

        done = ok_count + fail_count + skip_count
        print(f"    progress: {done}/{total} ({done / total * 100:.1f}%)  "
              f"ok={ok_count} fail={fail_count} skip={skip_count}", flush=True)

    conn.close()
    print("=" * 60, flush=True)
    print(f"Done: ok={ok_count} fail={fail_count} skip={skip_count} / {total}", flush=True)


if __name__ == "__main__":
    main()
