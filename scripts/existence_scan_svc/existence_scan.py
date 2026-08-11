"""
existence_scan.py — continuous Railway worker version of
scripts/one_time/financial_existence_scan.py.

Same job, same logic, same target table (financial_ar_gemi_scanned): loads
each company's page on businessportal.gr, reads the /api/company/details
response the Railway download-crawler (scripts/playwright_svc) also reads,
counts how many filed documents it lists, and writes that count. Never
downloads a document. Whatever this finds is picked up immediately by the
company-page "Οικονομικά" tab, and playwright_svc will just skip these
companies (already scanned) if it's ever resumed for real downloads.

Difference from the one_time/ version: that one is a manual, run-it-yourself
local sweep — this one is meant to run forever on Railway. Once it clears
the current backlog it sleeps (SLEEP_SECONDS) and re-queries, since new
companies get added continuously by the live-registry-watcher bots. Progress
logging is plain newline-per-update (not a \r-rewritten single line) since
Railway's log viewer doesn't render carriage returns as an updating line —
it would otherwise flood the log with one line per completed company.

Env vars (set in the Railway service dashboard, not committed):
    DATABASE_URL    — required, same GreekLeads Postgres as everything else
    WORKERS         — optional, default 6 (parallel browser contexts)
    SLEEP_SECONDS   — optional, default 3600 (re-poll interval once caught up)
"""

import asyncio
import os
import sys
import time

import psycopg2
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout

PORTAL       = "https://publicity.businessportal.gr"
NAV_TIMEOUT  = 30_000  # ms
API_TIMEOUT  = 25_000  # ms
WORKERS      = int(os.environ.get("WORKERS", "6"))
SLEEP_SECONDS = int(os.environ.get("SLEEP_SECONDS", "3600"))
LOG_EVERY    = 50  # print a status line every N completed companies

_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

_STOP = object()


# ── DB ───────────────────────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)


def ensure_table(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS financial_ar_gemi_scanned (
                ar_gemi      BIGINT PRIMARY KEY,
                scanned_at   TIMESTAMPTZ DEFAULT NOW(),
                docs_found   INT DEFAULT 0,
                has_failures BOOLEAN DEFAULT FALSE
            )
        """)
    conn.commit()


def get_counts(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM companies
            WHERE status_descr = 'Ενεργή'
              AND legal_type_descr IN ('ΑΕ', 'ΙΚΕ', 'ΕΠΕ')
        """)
        total = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM financial_ar_gemi_scanned")
        done = cur.fetchone()[0]
    return total, done


def fetch_unscanned(conn, size):
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT c.ar_gemi
            FROM companies c
            LEFT JOIN financial_ar_gemi_scanned s ON s.ar_gemi = c.ar_gemi
            WHERE c.status_descr = 'Ενεργή'
              AND c.legal_type_descr IN ('ΑΕ', 'ΙΚΕ', 'ΕΠΕ')
              AND (s.ar_gemi IS NULL OR s.has_failures = TRUE)
            ORDER BY (s.ar_gemi IS NOT NULL) ASC, c.ar_gemi ASC
            LIMIT {size}
        """)
        return [str(row[0]) for row in cur.fetchall()]


def mark_scanned(conn, ar_gemi, docs_found, has_failures=False):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO financial_ar_gemi_scanned (ar_gemi, docs_found, has_failures)
            VALUES (%s, %s, %s)
            ON CONFLICT (ar_gemi) DO UPDATE SET
                scanned_at   = NOW(),
                docs_found   = EXCLUDED.docs_found,
                has_failures = EXCLUDED.has_failures
        """, (int(ar_gemi), docs_found, has_failures))
    conn.commit()


# ── Per-company check (existence only — no download, ever) ──────────────────

async def check_company(ar_gemi, page):
    url = f"{PORTAL}/company/{ar_gemi}"
    financial_entries = []
    try:
        async with page.expect_response(
            lambda r: "/api/company/details" in r.url and r.status == 200,
            timeout=API_TIMEOUT,
        ) as resp_future:
            await page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT)
        resp = await resp_future.value
        data = await resp.json()
        payload = ((data.get("companyInfo") or {}).get("payload")) or {}
        financial_entries = payload.get("companyFinancial") or []
    except PlaywrightTimeout:
        pass  # no financial data, or the page never returned it — 0 docs
    except Exception:
        return None  # real error — caller marks has_failures, retried next pass

    doc_count = sum(
        len(files.get("balancesheet") or [])
        for period in financial_entries
        for files in (period.get("FilesAndAuditors") or [])
    )
    return doc_count


# ── Worker ────────────────────────────────────────────────────────────────────

async def worker(worker_id, queue, browser, stats):
    conn = get_conn()
    ctx = await browser.new_context(user_agent=_UA, viewport={"width": 1280, "height": 720})
    page = await ctx.new_page()

    while True:
        item = await queue.get()
        if item is _STOP:
            queue.task_done()
            break

        ar_gemi = item
        docs = await check_company(ar_gemi, page)
        has_fail = docs is None
        try:
            mark_scanned(conn, ar_gemi, docs or 0, has_fail)
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
            conn = get_conn()
            try:
                mark_scanned(conn, ar_gemi, docs or 0, has_fail)
            except Exception:
                pass

        queue.task_done()
        stats["done"] += 1
        if docs:
            stats["found"] += 1
        if stats["done"] % LOG_EVERY == 0:
            elapsed = time.time() - stats["pass_start"]
            rate = stats["done"] / elapsed * 3600 if elapsed > 0 else 0
            print(
                f"[existence_scan] pass progress: {stats['done']:,} checked "
                f"this pass, {stats['found']:,} found, rate={rate:.0f}/hr",
                flush=True,
            )

    await ctx.close()
    conn.close()


# ── One full pass over whatever's currently unscanned ───────────────────────

async def run_pass():
    init_conn = get_conn()
    ensure_table(init_conn)
    total_target, already_done = get_counts(init_conn)
    init_conn.close()

    remaining = max(total_target - already_done, 0)
    print("=" * 60, flush=True)
    print("[existence_scan] Starting pass", flush=True)
    print(f"[existence_scan] Target (ΑΕ/ΙΚΕ/ΕΠΕ, active): {total_target:,}", flush=True)
    print(f"[existence_scan] Already known: {already_done:,}", flush=True)
    print(f"[existence_scan] To check this pass: {remaining:,}", flush=True)
    print(f"[existence_scan] Workers: {WORKERS}", flush=True)
    print("=" * 60, flush=True)

    if remaining == 0:
        return 0

    stats = {"done": 0, "found": 0, "pass_start": time.time()}

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, args=["--disable-gpu"])

        queue: asyncio.Queue = asyncio.Queue(maxsize=WORKERS * 4)
        workers = [asyncio.create_task(worker(i + 1, queue, browser, stats)) for i in range(WORKERS)]

        refill_conn = get_conn()
        checked_this_pass = 0
        try:
            while checked_this_pass < remaining:
                batch_size = min(WORKERS * 20, remaining - checked_this_pass)
                batch = fetch_unscanned(refill_conn, batch_size)
                if not batch:
                    break
                for ar_gemi in batch:
                    await queue.put(ar_gemi)
                checked_this_pass += len(batch)
                await queue.join()
        finally:
            for _ in range(WORKERS):
                await queue.put(_STOP)
            await asyncio.gather(*workers)
            await browser.close()
            refill_conn.close()

    print(
        f"[existence_scan] Pass done: {stats['done']:,} checked, "
        f"{stats['found']:,} have public filings.",
        flush=True,
    )
    return stats["done"]


# ── Main: run forever, sleeping between passes ──────────────────────────────

async def main():
    while True:
        try:
            await run_pass()
        except Exception as e:
            print(f"[existence_scan] Pass crashed: {e!r} — sleeping before retry", flush=True)

        print(
            f"[existence_scan] Sleeping {SLEEP_SECONDS}s before re-checking for "
            f"newly-registered companies…",
            flush=True,
        )
        sys.stdout.flush()
        await asyncio.sleep(SLEEP_SECONDS)


if __name__ == "__main__":
    asyncio.run(main())
