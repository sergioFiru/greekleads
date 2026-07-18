"""
financial_playwright.py — Railway service: scrape businessportal.gr for financial PDFs.

Replaces financial_runner.py (GEMI API, 8 req/min) with Playwright + Chromium.
Loads each company page, intercepts the /api/company/details JSON response to get
pre-filtered financial file IDs, then downloads PDFs directly to R2.

Speed: 3 parallel browser contexts ≈ 500+ companies/hr (~16 days for 187k).

Railway setup:
  Root dir  : scripts/playwright_svc/     ← Railway detects Dockerfile here
  Env vars  : DATABASE_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
              R2_ENDPOINT, R2_BUCKET
"""

import asyncio
import logging
import os
import sys
import time
from pathlib import Path

import boto3
import psycopg2
import requests as http_requests
from dotenv import load_dotenv
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout

# .env lives one level up (scripts/) — used for local dev only; Railway uses env vars
load_dotenv(Path(__file__).parent.parent / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
log = logging.getLogger("pw_runner")

# ── Config ──────────────────────────────────────────────────────────────────────
WORKERS     = 3
BATCH_SIZE  = 60      # companies fetched per DB refill (20 per worker)
PORTAL      = "https://publicity.businessportal.gr"
BUCKET      = os.getenv("R2_BUCKET", "greekleads-financials")
NAV_TIMEOUT = 30_000  # ms per page navigation
API_TIMEOUT = 25_000  # ms waiting for /api/company/details response

_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# ── DB ───────────────────────────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(os.getenv("DATABASE_URL"), connect_timeout=30)


def ensure_tables(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS financial_ar_gemi_scanned (
                ar_gemi    BIGINT PRIMARY KEY,
                scanned_at TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        # Add columns if table was created by the old runner
        cur.execute("""
            ALTER TABLE financial_ar_gemi_scanned
            ADD COLUMN IF NOT EXISTS docs_found INT DEFAULT 0
        """)
        cur.execute("""
            ALTER TABLE financial_ar_gemi_scanned
            ADD COLUMN IF NOT EXISTS has_failures BOOLEAN DEFAULT FALSE
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS financial_docs (
                kak           TEXT PRIMARY KEY,
                ar_gemi       BIGINT NOT NULL,
                date_filed    TEXT,
                r2_key        TEXT,
                downloaded_at TIMESTAMPTZ
            )
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS financial_docs_ar_gemi_idx
            ON financial_docs (ar_gemi)
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


def fetch_unscanned(conn, size: int) -> list:
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT c.ar_gemi
            FROM companies c
            LEFT JOIN financial_ar_gemi_scanned s
                   ON s.ar_gemi = c.ar_gemi::bigint
            WHERE c.status_descr  = 'Ενεργή'
              AND c.legal_type_descr IN ('ΑΕ', 'ΙΚΕ', 'ΕΠΕ')
              AND (s.ar_gemi IS NULL OR s.has_failures = TRUE)
            ORDER BY (s.ar_gemi IS NOT NULL) ASC, c.ar_gemi ASC
            LIMIT {size}
        """)
        return [str(row[0]) for row in cur.fetchall()]


def mark_scanned(conn, ar_gemi: str, docs_found: int, has_failures: bool = False):
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


def record_doc(conn, kak: str, ar_gemi: str, date_filed: str, r2_key: str):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO financial_docs (kak, ar_gemi, date_filed, r2_key, downloaded_at)
            VALUES (%s, %s, %s, %s, NOW())
            ON CONFLICT (kak) DO UPDATE SET
                r2_key = EXCLUDED.r2_key, downloaded_at = NOW()
        """, (kak, int(ar_gemi), date_filed, r2_key))
    conn.commit()


# ── R2 ───────────────────────────────────────────────────────────────────────────

def make_s3():
    return boto3.client(
        "s3",
        endpoint_url=os.getenv("R2_ENDPOINT"),
        aws_access_key_id=os.getenv("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("R2_SECRET_ACCESS_KEY"),
        region_name="auto",
    )


def upload_to_r2(s3, key: str, data: bytes):
    s3.put_object(Bucket=BUCKET, Key=key, Body=data, ContentType="application/pdf")


# ── PDF download with retry on 429 ───────────────────────────────────────────────

async def download_pdf(doc_id: int, ar_gemi: str, session: http_requests.Session) -> bytes:
    url = f"{PORTAL}/api/download/financial/{doc_id}?companyId={ar_gemi}"
    for attempt in range(5):
        r = session.get(url, timeout=60)
        if r.status_code == 429:
            wait = min(2 ** attempt, 30)  # 1, 2, 4, 8, 16 → cap at 30s
            await asyncio.sleep(wait)
            continue
        r.raise_for_status()
        if not r.content or r.content[:4] != b"%PDF":
            raise ValueError(f"Not a PDF ({len(r.content)} bytes)")
        return r.content
    raise Exception(f"429 after 5 retries: doc_id={doc_id}")


# ── Per-company processing ───────────────────────────────────────────────────────

DOWNLOAD_GAP = 2.5  # seconds between PDF download requests (rate-limit guard)

async def process_company(
    ar_gemi: str,
    page,
    s3,
    conn,
    http_session: http_requests.Session,
) -> tuple:
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
        pass  # no financial data or page error — mark scanned with 0 docs
    except Exception as e:
        log.warning("ar_gemi=%s  page error: %s", ar_gemi, e)

    docs_downloaded = 0
    docs_failed     = 0
    first_doc       = True
    for period in financial_entries:
        for files in (period.get("FilesAndAuditors") or []):
            for doc in (files.get("balancesheet") or []):
                doc_id   = doc.get("id")
                bal_date = (doc.get("bal_date") or "")[:10]
                if not doc_id:
                    continue

                kak    = str(doc_id)
                r2_key = f"financials/{ar_gemi}/{kak}.pdf"

                if not first_doc:
                    await asyncio.sleep(DOWNLOAD_GAP)
                first_doc = False

                try:
                    pdf = await download_pdf(doc_id, ar_gemi, http_session)
                    upload_to_r2(s3, r2_key, pdf)
                    record_doc(conn, kak, ar_gemi, bal_date, r2_key)
                    docs_downloaded += 1
                except Exception as e:
                    log.warning("ar_gemi=%s  doc_id=%s  err: %s", ar_gemi, doc_id, e)
                    docs_failed += 1

    has_failures = docs_failed > 0
    mark_scanned(conn, ar_gemi, docs_downloaded, has_failures)
    return docs_downloaded, has_failures


# ── Worker ───────────────────────────────────────────────────────────────────────

_STOP = object()


async def worker(
    worker_id: int,
    queue: asyncio.Queue,
    browser,
    s3,
    stats: dict,
    total_target: int,
    already_done: int,
    session_start: float,
):
    conn = get_conn()
    http_session = http_requests.Session()
    http_session.headers["User-Agent"] = _UA

    ctx = await browser.new_context(
        user_agent=_UA,
        viewport={"width": 1280, "height": 720},
        locale="el-GR",
        timezone_id="Europe/Athens",
    )
    await ctx.add_init_script(
        "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"
    )
    page = await ctx.new_page()
    log.info("worker-%d  ready", worker_id)

    while True:
        item = await queue.get()
        if item is _STOP:
            queue.task_done()
            break

        ar_gemi = item
        t0 = time.time()
        has_fail = False
        try:
            docs, has_fail = await process_company(ar_gemi, page, s3, conn, http_session)
        except Exception as e:
            log.error("worker-%d  ar_gemi=%s  unexpected: %s", worker_id, ar_gemi, e)
            docs     = 0
            has_fail = True
            try:
                conn.rollback()
            except Exception:
                pass
            try:
                conn = get_conn()
            except Exception:
                pass
            try:
                mark_scanned(conn, ar_gemi, 0, has_failures=True)
            except Exception:
                pass

        queue.task_done()

        stats["done"] += 1
        stats["docs"] += docs
        session_done = stats["done"]

        elapsed    = time.time() - session_start
        rate       = session_done / elapsed * 3600 if elapsed > 0 else 0
        total_done = already_done + session_done
        pct        = total_done / total_target * 100 if total_target else 0
        remaining  = max(total_target - total_done, 0)
        eta_h      = remaining / rate if rate > 0 else 0

        log.info(
            "w%d  ar_gemi=%-14s  docs=%d%s  t=%.1fs  "
            "overall=%s/%s (%.1f%%)  rate=%.0f/hr  eta=%.1fh",
            worker_id, ar_gemi, docs, " [FAIL]" if has_fail else "",
            time.time() - t0,
            f"{total_done:,}", f"{total_target:,}", pct,
            rate, eta_h,
        )

    await ctx.close()
    conn.close()
    http_session.close()
    log.info("worker-%d  stopped", worker_id)


# ── Main ─────────────────────────────────────────────────────────────────────────

async def main():
    s3 = make_s3()
    try:
        s3.head_bucket(Bucket=BUCKET)
        log.info("R2 '%s' reachable — OK", BUCKET)
    except Exception as e:
        log.error("R2 unreachable: %s", e)
        sys.exit(1)

    init_conn = get_conn()
    ensure_tables(init_conn)
    total_target, already_done = get_counts(init_conn)
    init_conn.close()

    log.info("=" * 60)
    log.info("  PLAYWRIGHT FINANCIAL CRAWLER")
    log.info("  Target:          %s", f"{total_target:,}")
    log.info("  Already scanned: %s", f"{already_done:,}")
    log.info("  Remaining:       %s", f"{max(total_target - already_done, 0):,}")
    log.info("  Workers:         %d", WORKERS)
    log.info("=" * 60)

    stats = {"done": 0, "docs": 0}
    session_start = time.time()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
                "--disable-gpu",
                "--no-zygote",
                "--disable-extensions",
                "--disable-background-networking",
                "--disable-default-apps",
                "--mute-audio",
            ],
        )
        log.info("Chromium launched (headless)")

        queue: asyncio.Queue = asyncio.Queue(maxsize=WORKERS * 4)

        worker_tasks = [
            asyncio.create_task(
                worker(i + 1, queue, browser, s3, stats, total_target, already_done, session_start)
            )
            for i in range(WORKERS)
        ]

        refill_conn = get_conn()
        while True:
            batch = fetch_unscanned(refill_conn, BATCH_SIZE)
            if not batch:
                log.info("All companies scanned — waiting 10 min for new ones")
                await asyncio.sleep(600)
                continue

            for ar_gemi in batch:
                await queue.put(ar_gemi)

            await queue.join()

        for _ in range(WORKERS):
            await queue.put(_STOP)
        await asyncio.gather(*worker_tasks)
        await browser.close()
        refill_conn.close()


if __name__ == "__main__":
    asyncio.run(main())
