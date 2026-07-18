"""
financial_parser.py — Railway service: extract financial data from PDFs in R2.

Reads financial_docs (already downloaded → R2) that haven't been parsed yet,
runs extract_financials() on each PDF, and stores results in financial_statements.

Runs in parallel with financial_runner.py (the downloader) — processes PDFs
as they land. No GEMI API rate limiting needed; reads straight from R2.

Railway setup:
  Start command : python financial_parser.py
  Root directory: scripts/
  Env vars needed:
    DATABASE_URL            (auto-linked by Railway)
    R2_ACCESS_KEY_ID
    R2_SECRET_ACCESS_KEY
    R2_ENDPOINT
    R2_BUCKET               greekleads-financials
"""

import io
import logging
import os
import sys
import time
from pathlib import Path

import boto3
import psycopg2
import pdfplumber  # noqa: F401  (imported here so missing dep fails fast)
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

# analyze_financials.py lives in the same directory
sys.path.insert(0, str(Path(__file__).parent))
from analyze_financials import extract_financials  # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
log = logging.getLogger("parser")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

BATCH_SIZE  = 200    # docs fetched from DB per iteration
SLEEP_BATCH = 0.5    # seconds between batches (be gentle on R2)

# ---------------------------------------------------------------------------
# R2
# ---------------------------------------------------------------------------

def make_s3():
    return boto3.client(
        "s3",
        endpoint_url=os.getenv("R2_ENDPOINT"),
        aws_access_key_id=os.getenv("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("R2_SECRET_ACCESS_KEY"),
        region_name="auto",
    )


def download_from_r2(s3, bucket: str, key: str) -> bytes:
    obj = s3.get_object(Bucket=bucket, Key=key)
    return obj["Body"].read()


# ---------------------------------------------------------------------------
# DB
# ---------------------------------------------------------------------------

def get_conn():
    return psycopg2.connect(os.getenv("DATABASE_URL"), connect_timeout=30)


def ensure_tables(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS financial_statements (
                kak                    TEXT PRIMARY KEY,
                ar_gemi                BIGINT NOT NULL,
                date_filed             TEXT,
                fiscal_year            INT,
                fiscal_year_start      TEXT,
                fiscal_year_end        TEXT,
                revenue                NUMERIC,
                prior_year_revenue     NUMERIC,
                gross_profit           NUMERIC,
                ebit                   NUMERIC,
                profit_before_tax      NUMERIC,
                net_profit             NUMERIC,
                total_assets           NUMERIC,
                equity                 NUMERIC,
                cash                   NUMERIC,
                short_term_liabilities NUMERIC,
                long_term_liabilities  NUMERIC,
                fields_found           INT NOT NULL DEFAULT 0,
                parse_error            TEXT,
                parsed_at              TIMESTAMPTZ DEFAULT NOW()
            )
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS financial_statements_ar_gemi_idx
            ON financial_statements (ar_gemi)
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS financial_statements_fiscal_year_idx
            ON financial_statements (ar_gemi, fiscal_year)
        """)
    conn.commit()


def next_batch(conn):
    """Return up to BATCH_SIZE (kak, ar_gemi, date_filed, r2_key) not yet parsed."""
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT d.kak, d.ar_gemi, d.date_filed, d.r2_key
            FROM financial_docs d
            LEFT JOIN financial_statements s ON s.kak = d.kak
            WHERE d.downloaded_at IS NOT NULL
              AND d.r2_key IS NOT NULL
              AND s.kak IS NULL
            ORDER BY d.ar_gemi, d.kak
            LIMIT {BATCH_SIZE}
        """)
        return cur.fetchall()


def upsert_statement(conn, kak, ar_gemi, date_filed, data: dict, parse_error=None):
    fields = [
        "fiscal_year", "fiscal_year_start", "fiscal_year_end",
        "revenue", "prior_year_revenue", "gross_profit", "ebit",
        "profit_before_tax", "net_profit", "total_assets", "equity",
        "cash", "short_term_liabilities", "long_term_liabilities",
    ]
    fields_found = sum(1 for f in fields if data.get(f) is not None)

    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO financial_statements (
                kak, ar_gemi, date_filed,
                fiscal_year, fiscal_year_start, fiscal_year_end,
                revenue, prior_year_revenue, gross_profit, ebit,
                profit_before_tax, net_profit, total_assets, equity,
                cash, short_term_liabilities, long_term_liabilities,
                fields_found, parse_error, parsed_at
            ) VALUES (
                %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, NOW()
            )
            ON CONFLICT (kak) DO UPDATE SET
                fiscal_year            = EXCLUDED.fiscal_year,
                fiscal_year_start      = EXCLUDED.fiscal_year_start,
                fiscal_year_end        = EXCLUDED.fiscal_year_end,
                revenue                = EXCLUDED.revenue,
                prior_year_revenue     = EXCLUDED.prior_year_revenue,
                gross_profit           = EXCLUDED.gross_profit,
                ebit                   = EXCLUDED.ebit,
                profit_before_tax      = EXCLUDED.profit_before_tax,
                net_profit             = EXCLUDED.net_profit,
                total_assets           = EXCLUDED.total_assets,
                equity                 = EXCLUDED.equity,
                cash                   = EXCLUDED.cash,
                short_term_liabilities = EXCLUDED.short_term_liabilities,
                long_term_liabilities  = EXCLUDED.long_term_liabilities,
                fields_found           = EXCLUDED.fields_found,
                parse_error            = EXCLUDED.parse_error,
                parsed_at              = NOW()
        """, (
            kak, ar_gemi, date_filed,
            data.get("fiscal_year"), data.get("fiscal_year_start"), data.get("fiscal_year_end"),
            data.get("revenue"), data.get("prior_year_revenue"), data.get("gross_profit"),
            data.get("ebit"), data.get("profit_before_tax"), data.get("net_profit"),
            data.get("total_assets"), data.get("equity"), data.get("cash"),
            data.get("short_term_liabilities"), data.get("long_term_liabilities"),
            fields_found, parse_error,
        ))
    conn.commit()
    return fields_found


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------

def process_doc(kak, ar_gemi, date_filed, r2_key, s3, bucket, conn):
    """Download PDF from R2, extract financials, store. Returns fields_found."""
    try:
        pdf_bytes = download_from_r2(s3, bucket, r2_key)
    except Exception as e:
        upsert_statement(conn, kak, ar_gemi, date_filed, {}, parse_error=f"r2_error:{e}"[:500])
        return 0, "r2_err"

    try:
        data = extract_financials(pdf_bytes)
    except Exception as e:
        upsert_statement(conn, kak, ar_gemi, date_filed, {}, parse_error=f"parse_error:{e}"[:500])
        return 0, "parse_err"

    fields_found = upsert_statement(conn, kak, ar_gemi, date_filed, data)
    tag = "ok" if fields_found > 0 else "ocr_fail"
    return fields_found, tag


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    bucket = os.getenv("R2_BUCKET", "greekleads-financials")
    s3 = make_s3()

    try:
        s3.head_bucket(Bucket=bucket)
        log.info("R2 bucket '%s' reachable — OK", bucket)
    except Exception as e:
        log.error("Cannot reach R2 bucket: %s", e)
        sys.exit(1)

    conn = get_conn()
    ensure_tables(conn)

    # Startup counts
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM financial_docs WHERE downloaded_at IS NOT NULL")
        total_pdfs = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM financial_statements")
        already_parsed = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM financial_statements WHERE fields_found = 0")
        ocr_failures = cur.fetchone()[0]

    log.info("=" * 60)
    log.info("  FINANCIAL PARSER STARTING")
    log.info("  PDFs available:    %s", f"{total_pdfs:,}")
    log.info("  Already parsed:    %s", f"{already_parsed:,}")
    log.info("  OCR failures:      %s", f"{ocr_failures:,}")
    log.info("  Remaining:         %s", f"{max(total_pdfs - already_parsed, 0):,}")
    log.info("=" * 60)

    session_parsed  = 0
    session_fields  = 0
    session_ocr_fail = 0
    session_errors  = 0
    session_start   = time.time()

    while True:
        try:
            batch = next_batch(conn)
        except Exception as e:
            log.error("DB error fetching batch: %s — retrying in 30s", e)
            time.sleep(30)
            try:
                conn = get_conn()
            except Exception:
                pass
            continue

        if not batch:
            log.info("All downloaded PDFs parsed. Sleeping 10 min before re-check.")
            time.sleep(600)
            continue

        for kak, ar_gemi, date_filed, r2_key in batch:
            try:
                fields_found, tag = process_doc(kak, ar_gemi, date_filed, r2_key, s3, bucket, conn)
            except Exception as e:
                log.warning("kak=%s unexpected error: %s", kak, e)
                session_errors += 1
                try:
                    conn.rollback()
                except Exception:
                    pass
                # Reconnect if DB dropped
                try:
                    conn.cursor().execute("SELECT 1")
                except Exception:
                    try:
                        conn = get_conn()
                    except Exception:
                        pass
                continue

            session_parsed += 1
            session_fields += fields_found
            if tag == "ocr_fail":
                session_ocr_fail += 1

            elapsed     = time.time() - session_start
            rate_per_hr = session_parsed / elapsed * 3600 if elapsed > 0 else 0
            total_done  = already_parsed + session_parsed
            pct         = total_done / total_pdfs * 100 if total_pdfs else 0

            log.info(
                "kak=%-10s  ar_gemi=%-12s  fields=%2d  tag=%-9s  "
                "total=%s/%s (%.1f%%)  rate=%.0f/hr",
                kak, ar_gemi, fields_found, tag,
                f"{total_done:,}", f"{total_pdfs:,}", pct, rate_per_hr,
            )

        time.sleep(SLEEP_BATCH)


if __name__ == "__main__":
    main()
