"""
main.py — Railway service backing the company-page "Retrieve" button.

FastAPI app, background-job pattern (chosen 2026-08-12 because the web app's
API routes run as Vercel serverless functions with a hard execution timeout —
a single company's extraction can be a long chain of sequential OpenRouter
calls, seconds for a typical company but minutes for an outlier like JUMBO's
78 documents, so a synchronous call from Vercel risks timing out):

  POST /retrieve {ar_gemi}  -> creates a row in retrieve_jobs, kicks off
                                processing in the background, returns
                                {job_id, status: "queued"} immediately.
  GET  /retrieve/{job_id}   -> returns the job's current row (status/result/
                                error). Frontend polls this.

Per team decision 2026-08-12 ("we scan all the years"): a Retrieve always
processes a company's FULL fiscal-year history, never just recent years.

Flow for one company (process_ar_gemi_sync):
  1. Check financial_docs for already-downloaded documents.
  2. If none exist, do a live single-company Playwright check (same
     businessportal.gr /api/company/details endpoint scripts/playwright_svc
     and scripts/existence_scan_svc read) to discover + download docs to R2,
     recording each in financial_docs — then re-check.
  3. Pull every document's bytes from R2, extract via
     financial_ai_extractor.extract_financials / extract_financials_from_zip,
     group by fiscal_year, merge_extractions() per year, check_plausibility(),
     upsert into financial_statements.

Env vars (Railway service dashboard):
    DATABASE_URL, OPENROUTER_API_KEY,
    R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET (optional,
    defaults to "greekleads-financials")
"""

import asyncio
import json
import os
import time
import uuid
import zipfile
from io import BytesIO

import boto3
import psycopg2
import psycopg2.extras
import requests
from fastapi import FastAPI, HTTPException
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
from pydantic import BaseModel

from financial_ai_extractor import (
    FIELDS,
    check_plausibility,
    extract_financials,
    extract_financials_from_zip,
    merge_extractions,
)

PORTAL = "https://publicity.businessportal.gr"
NAV_TIMEOUT = 30_000  # ms
API_TIMEOUT = 25_000  # ms
BUCKET = os.getenv("R2_BUCKET", "greekleads-financials")
DOWNLOAD_GAP_SECONDS = 0.8  # single company, on-demand — no need for the
# full multi-worker global rate limiter scripts/playwright_svc uses

_UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

app = FastAPI()


# ── DB ───────────────────────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)


def ensure_tables(conn):
    with conn.cursor() as cur:
        # Same shape scripts/playwright_svc / scripts/existence_scan_svc use —
        # defensive only, these already exist in production.
        cur.execute("""
            CREATE TABLE IF NOT EXISTS financial_ar_gemi_scanned (
                ar_gemi      BIGINT PRIMARY KEY,
                scanned_at   TIMESTAMPTZ DEFAULT NOW(),
                docs_found   INT DEFAULT 0,
                has_failures BOOLEAN DEFAULT FALSE
            )
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
        cur.execute("""
            CREATE TABLE IF NOT EXISTS retrieve_jobs (
                job_id     TEXT PRIMARY KEY,
                ar_gemi    BIGINT NOT NULL,
                status     TEXT NOT NULL DEFAULT 'queued',
                result     JSONB,
                error      TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS retrieve_jobs_ar_gemi_idx
            ON retrieve_jobs (ar_gemi)
        """)
    conn.commit()


def cleanup_stale_jobs(conn):
    # If the service restarts mid-job, don't leave the frontend polling a job
    # that will never finish.
    with conn.cursor() as cur:
        cur.execute("""
            UPDATE retrieve_jobs SET status = 'error',
                error = 'service restarted mid-job', updated_at = NOW()
            WHERE status IN ('queued', 'running')
        """)
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


def fetch_existing_docs(conn, ar_gemi: str) -> list:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT kak, r2_key FROM financial_docs
            WHERE ar_gemi = %s AND r2_key IS NOT NULL
            ORDER BY kak
        """, (int(ar_gemi),))
        return cur.fetchall()


def upsert_financial_statement(conn, ar_gemi: str, fiscal_year: int, merged: dict,
                                source_kaks: list, warnings: list):
    employee_count = merged.get("employee_count")
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO financial_statements (
                ar_gemi, fiscal_year, revenue, total_assets, equity, profit_before_tax,
                net_profit, gross_profit, cost_of_sales, inventory, cash_and_equivalents,
                receivables, total_liabilities, employee_count, source_kaks, source_count,
                notes, plausibility_warnings, parsed_at
            ) VALUES (
                %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW()
            )
            ON CONFLICT (ar_gemi, fiscal_year) DO UPDATE SET
                revenue               = EXCLUDED.revenue,
                total_assets          = EXCLUDED.total_assets,
                equity                = EXCLUDED.equity,
                profit_before_tax     = EXCLUDED.profit_before_tax,
                net_profit            = EXCLUDED.net_profit,
                gross_profit          = EXCLUDED.gross_profit,
                cost_of_sales         = EXCLUDED.cost_of_sales,
                inventory             = EXCLUDED.inventory,
                cash_and_equivalents  = EXCLUDED.cash_and_equivalents,
                receivables           = EXCLUDED.receivables,
                total_liabilities     = EXCLUDED.total_liabilities,
                employee_count        = EXCLUDED.employee_count,
                source_kaks           = EXCLUDED.source_kaks,
                source_count          = EXCLUDED.source_count,
                notes                 = EXCLUDED.notes,
                plausibility_warnings = EXCLUDED.plausibility_warnings,
                parsed_at             = NOW()
        """, (
            int(ar_gemi), fiscal_year, merged.get("revenue"), merged.get("total_assets"),
            merged.get("equity"), merged.get("profit_before_tax"), merged.get("net_profit"),
            merged.get("gross_profit"), merged.get("cost_of_sales"), merged.get("inventory"),
            merged.get("cash_and_equivalents"), merged.get("receivables"),
            merged.get("total_liabilities"), int(employee_count) if employee_count is not None else None,
            source_kaks, merged.get("source_count"), merged.get("notes"), warnings,
        ))
    conn.commit()


# ── retrieve_jobs helpers ─────────────────────────────────────────────────────

def create_job(job_id: str, ar_gemi: str):
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO retrieve_jobs (job_id, ar_gemi, status) VALUES (%s, %s, 'queued')",
            (job_id, int(ar_gemi)),
        )
    conn.commit()
    conn.close()


def set_job_status(job_id: str, status: str):
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE retrieve_jobs SET status = %s, updated_at = NOW() WHERE job_id = %s",
            (status, job_id),
        )
    conn.commit()
    conn.close()


def set_job_result(job_id: str, status: str, result: dict | None = None, error: str | None = None):
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE retrieve_jobs SET status = %s, result = %s, error = %s, updated_at = NOW() WHERE job_id = %s",
            (status, json.dumps(result) if result is not None else None, error, job_id),
        )
    conn.commit()
    conn.close()


def _decode_result(val):
    if val is None or isinstance(val, (dict, list)):
        return val
    try:
        return json.loads(val)
    except (TypeError, ValueError):
        return val


def fetch_job(job_id: str) -> dict | None:
    conn = get_conn()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT job_id, ar_gemi, status, result, error, created_at, updated_at "
            "FROM retrieve_jobs WHERE job_id = %s",
            (job_id,),
        )
        row = cur.fetchone()
    conn.close()
    if not row:
        return None
    return {
        "job_id": row[0], "ar_gemi": str(row[1]), "status": row[2],
        "result": _decode_result(row[3]), "error": row[4],
        "created_at": row[5].isoformat(), "updated_at": row[6].isoformat(),
    }


# ── R2 ───────────────────────────────────────────────────────────────────────

def make_s3():
    return boto3.client(
        "s3",
        endpoint_url=os.getenv("R2_ENDPOINT"),
        aws_access_key_id=os.getenv("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("R2_SECRET_ACCESS_KEY"),
        region_name="auto",
    )


def download_from_r2(s3, key: str) -> bytes:
    return s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()


# ── File type detection (same as scripts/playwright_svc/financial_playwright.py) ──

_CT_EXT = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "doc",
    "application/zip": "zip",
}
_MAGIC_EXT = [
    (b"%PDF", "pdf"),
    (b"PK\x03\x04", "_zip_container"),  # xlsx/docx/zip all share this magic number
    (b"\xd0\xcf\x11\xe0", "xls"),
]


def _sniff_zip_container(content: bytes) -> str:
    try:
        names = set(zipfile.ZipFile(BytesIO(content)).namelist())
    except zipfile.BadZipFile:
        return "bin"
    if "xl/workbook.xml" in names:
        return "xlsx"
    if "word/document.xml" in names:
        return "docx"
    return "zip"


def _detect_ext(content: bytes, content_type: str) -> str:
    ct = (content_type or "").split(";")[0].strip().lower()
    if ct in _CT_EXT:
        return _CT_EXT[ct]
    for magic, ext in _MAGIC_EXT:
        if content[:len(magic)] == magic:
            return _sniff_zip_container(content) if ext == "_zip_container" else ext
    return "bin"


# ── Live single-company download (used only when financial_docs has nothing yet) ──

def download_doc_sync(doc_id, ar_gemi, session: requests.Session):
    url = f"{PORTAL}/api/download/financial/{doc_id}?companyId={ar_gemi}"
    for attempt in range(5):
        r = session.get(url, timeout=60)
        if r.status_code == 429:
            time.sleep(min(2 ** attempt, 30))
            continue
        r.raise_for_status()
        if not r.content:
            return None, None
        ext = _detect_ext(r.content, r.headers.get("Content-Type", ""))
        return r.content, ext
    raise Exception(f"429 after 5 retries: doc_id={doc_id}")


def live_download_docs_sync(ar_gemi: str, conn) -> int:
    url = f"{PORTAL}/company/{ar_gemi}"
    financial_entries = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=["--no-sandbox", "--disable-gpu"])
        try:
            ctx = browser.new_context(
                user_agent=_UA, viewport={"width": 1280, "height": 720},
                locale="el-GR", timezone_id="Europe/Athens",
            )
            page = ctx.new_page()
            try:
                with page.expect_response(
                    lambda r: "/api/company/details" in r.url and r.status == 200,
                    timeout=API_TIMEOUT,
                ) as resp_info:
                    page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT)
                data = resp_info.value.json()
                payload = ((data.get("companyInfo") or {}).get("payload")) or {}
                financial_entries = payload.get("companyFinancial") or []
            except PlaywrightTimeout:
                pass  # no financial data, or page never returned it
        finally:
            browser.close()

    s3 = make_s3()
    session = requests.Session()
    session.headers["User-Agent"] = _UA

    downloaded = 0
    has_failures = False
    for period in financial_entries:
        for files in (period.get("FilesAndAuditors") or []):
            for doc in (files.get("balancesheet") or []):
                doc_id = doc.get("id")
                bal_date = (doc.get("bal_date") or "")[:10]
                if not doc_id:
                    continue
                kak = str(doc_id)

                time.sleep(DOWNLOAD_GAP_SECONDS)
                try:
                    content, ext = download_doc_sync(doc_id, ar_gemi, session)
                    if content is None:
                        continue
                    r2_key = f"financials/{ar_gemi}/{kak}.{ext}"
                    s3.put_object(Bucket=BUCKET, Key=r2_key, Body=content, ContentType="application/pdf")
                    record_doc(conn, kak, ar_gemi, bal_date, r2_key)
                    downloaded += 1
                except Exception:
                    has_failures = True

    mark_scanned(conn, ar_gemi, downloaded, has_failures)
    return downloaded


# ── Extraction + merge + store for one company (always full history) ─────────

def process_ar_gemi_sync(ar_gemi: str) -> dict:
    conn = get_conn()
    ensure_tables(conn)

    existing = fetch_existing_docs(conn, ar_gemi)

    downloaded_new = 0
    if not existing:
        downloaded_new = live_download_docs_sync(ar_gemi, conn)
        existing = fetch_existing_docs(conn, ar_gemi)

    if not existing:
        conn.close()
        return {
            "ar_gemi": ar_gemi, "docs_used": 0, "docs_downloaded_now": downloaded_new,
            "fiscal_years": [], "message": "no financial documents found for this company",
        }

    s3 = make_s3()
    by_fiscal_year: dict = {}

    for kak, r2_key in existing:
        ext = r2_key.rsplit(".", 1)[-1].lower() if "." in r2_key else ""
        try:
            content = download_from_r2(s3, r2_key)
        except Exception:
            continue  # doc missing from R2 — skip, not fatal

        if ext == "zip":
            for result in extract_financials_from_zip(content, filename=r2_key):
                if result.get("found") and result.get("fiscal_year") is not None:
                    by_fiscal_year.setdefault(result["fiscal_year"], []).append((kak, result))
        elif ext in ("pdf", "xlsx", "docx"):
            result = extract_financials(content, ext, filename=r2_key)
            if result.get("found") and not result.get("error") and result.get("fiscal_year") is not None:
                by_fiscal_year.setdefault(result["fiscal_year"], []).append((kak, result))
        # xls / doc / bin — extractor doesn't support these yet, skipped silently

    fiscal_years_out = []
    for fiscal_year, group in sorted(by_fiscal_year.items(), reverse=True):
        results = [r for _, r in group]
        merged = merge_extractions(results)
        if not merged.get("found"):
            continue
        source_kaks = [kak for kak, r in group if r.get("found") and not r.get("error")]
        warnings = check_plausibility(merged)
        upsert_financial_statement(conn, ar_gemi, fiscal_year, merged, source_kaks, warnings)
        fiscal_years_out.append({
            "fiscal_year": fiscal_year,
            **{f: merged.get(f) for f in FIELDS if f != "fiscal_year"},
            "source_count": merged.get("source_count"),
            "plausibility_warnings": warnings,
        })

    conn.close()
    return {
        "ar_gemi": ar_gemi,
        "docs_used": len(existing),
        "docs_downloaded_now": downloaded_new,
        "fiscal_years": fiscal_years_out,
    }


# ── FastAPI app ──────────────────────────────────────────────────────────────

class RetrieveRequest(BaseModel):
    ar_gemi: int


@app.on_event("startup")
def on_startup():
    conn = get_conn()
    ensure_tables(conn)
    cleanup_stale_jobs(conn)
    conn.close()


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/retrieve")
async def start_retrieve(payload: RetrieveRequest):
    ar_gemi = str(payload.ar_gemi)
    job_id = str(uuid.uuid4())
    await asyncio.to_thread(create_job, job_id, ar_gemi)
    asyncio.create_task(run_job(job_id, ar_gemi))
    return {"job_id": job_id, "status": "queued"}


@app.get("/retrieve/{job_id}")
async def get_retrieve_status(job_id: str):
    job = await asyncio.to_thread(fetch_job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return job


async def run_job(job_id: str, ar_gemi: str):
    await asyncio.to_thread(set_job_status, job_id, "running")
    try:
        result = await asyncio.to_thread(process_ar_gemi_sync, ar_gemi)
        await asyncio.to_thread(set_job_result, job_id, "done", result, None)
    except Exception as e:
        await asyncio.to_thread(set_job_result, job_id, "error", None, str(e))
