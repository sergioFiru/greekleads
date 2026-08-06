"""
financial_existence_scan.py — LOCAL, one-time sweep: which companies have public
financial filings at all? Never downloads a document.

Separate from scripts/playwright_svc/financial_playwright.py on purpose — that
script is the deployed Railway crawler (page-load + download + upload to R2) and
is not touched by this one. This is a throwaway local utility: run it on your own
machine while deciding whether/when to resume the real download crawl on Railway.

What it does: loads each company's page on businessportal.gr, reads the same
/api/company/details response the Railway crawler reads, counts how many filed
documents it lists, and writes that count to the SAME financial_ar_gemi_scanned
table the Railway crawler already uses (docs_found, has_failures) — so whatever
this script finds is immediately picked up by the company-page "Οικονομικά" tab,
and the Railway crawler will just skip these companies (already scanned) if it's
ever resumed for real downloads.

Resumable: the query below only pulls companies not yet in
financial_ar_gemi_scanned (or previously flagged has_failures), same as the
Railway crawler's own query — stop with Ctrl+C anytime, rerun to continue.

Requirements (local machine, not already in scripts/requirements.txt):
    pip install playwright
    playwright install chromium

Run from the scripts/ directory:
    python one_time/financial_existence_scan.py
    python one_time/financial_existence_scan.py --workers 8
    python one_time/financial_existence_scan.py --limit 50      # quick test first
"""

import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout

load_dotenv(Path(__file__).parent.parent / ".env")

PORTAL       = "https://publicity.businessportal.gr"
NAV_TIMEOUT  = 30_000  # ms
API_TIMEOUT  = 25_000  # ms

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
        return None  # real error — caller marks has_failures, retried next run

    doc_count = sum(
        len(files.get("balancesheet") or [])
        for period in financial_entries
        for files in (period.get("FilesAndAuditors") or [])
    )
    return doc_count


# ── Progress bar ──────────────────────────────────────────────────────────────

def bar(done, total, width=32):
    total = max(total, 1)
    pct = min(done / total, 1.0)
    filled = int(width * pct)
    return "█" * filled + "░" * (width - filled), pct * 100


# ── Worker ────────────────────────────────────────────────────────────────────

async def worker(worker_id, queue, browser, stats, total_target, already_done, session_start):
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

        elapsed = time.time() - session_start
        rate = stats["done"] / elapsed * 3600 if elapsed > 0 else 0
        total_done = already_done + stats["done"]
        remaining = max(total_target - total_done, 0)
        eta_h = remaining / rate if rate > 0 else 0
        b, pct = bar(total_done, total_target)

        sys.stdout.write(
            f"\r{b} {pct:5.1f}%  {total_done:,}/{total_target:,}  "
            f"found={stats['found']:,}  rate={rate:.0f}/hr  eta={eta_h:.1f}h   "
        )
        sys.stdout.flush()

    await ctx.close()
    conn.close()


# ── Main ─────────────────────────────────────────────────────────────────────

async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=6, help="parallel browser contexts (default 6 — this runs on your machine, not a server)")
    ap.add_argument("--limit", type=int, default=None, help="stop after N companies (quick test run)")
    args = ap.parse_args()

    init_conn = get_conn()
    ensure_table(init_conn)
    total_target, already_done = get_counts(init_conn)
    init_conn.close()

    remaining = max(total_target - already_done, 0)
    if args.limit:
        remaining = min(remaining, args.limit)

    print("=" * 60)
    print("  FINANCIAL EXISTENCE SCAN (local, existence-only, no downloads)")
    print(f"  Target companies (ΑΕ/ΙΚΕ/ΕΠΕ, active): {total_target:,}")
    print(f"  Already known:                         {already_done:,}")
    print(f"  This run will check:                   {remaining:,}{' (--limit)' if args.limit else ''}")
    print(f"  Workers:                                {args.workers}")
    print("=" * 60)

    if remaining == 0:
        print("Nothing to do — every ΑΕ/ΙΚΕ/ΕΠΕ company is already checked.")
        return

    stats = {"done": 0, "found": 0}
    session_start = time.time()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, args=["--disable-gpu"])

        queue: asyncio.Queue = asyncio.Queue(maxsize=args.workers * 4)
        workers = [
            asyncio.create_task(worker(i + 1, queue, browser, stats, total_target, already_done, session_start))
            for i in range(args.workers)
        ]

        refill_conn = get_conn()
        checked_this_run = 0
        try:
            while checked_this_run < remaining:
                batch_size = min(args.workers * 20, remaining - checked_this_run)
                batch = fetch_unscanned(refill_conn, batch_size)
                if not batch:
                    break
                for ar_gemi in batch:
                    await queue.put(ar_gemi)
                checked_this_run += len(batch)
                await queue.join()
        except KeyboardInterrupt:
            print("\n\nStopped — progress is saved, rerun the same command to continue.")
        finally:
            for _ in range(args.workers):
                await queue.put(_STOP)
            await asyncio.gather(*workers)
            await browser.close()
            refill_conn.close()

    print(f"\n\nDone this run: {stats['done']:,} checked, {stats['found']:,} have public filings.")


if __name__ == "__main__":
    asyncio.run(main())
