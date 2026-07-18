"""
financial_runner.py — Railway entry point for the financial statements crawler.

Runs continuously: fetches GEMI document lists for ΑΕ/ΕΠΕ/ΙΚΕ companies,
downloads financial PDFs (subject IDs 4/8/78/79), uploads to Cloudflare R2.

Resumable via DB tables:
  financial_ar_gemi_scanned  — companies whose doc list we've already fetched
  financial_docs             — individual PDFs (downloaded_at = success, parse_error = failure)

Rate limit: 8 req/min via GEMI_FINANCIAL_API_KEY (7.6 s between calls).

Railway setup:
  Start command : python financial_runner.py
  Root directory: scripts/
  Env vars needed:
    DATABASE_URL            (auto-linked by Railway)
    GEMI_FINANCIAL_API_KEY
    R2_ACCESS_KEY_ID
    R2_SECRET_ACCESS_KEY
    R2_ENDPOINT             https://<account_id>.r2.cloudflarestorage.com
    R2_BUCKET               greekleads-financials
"""

import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import boto3
import psycopg2
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
log = logging.getLogger("financial")

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

API_KEY        = os.getenv("GEMI_FINANCIAL_API_KEY")
BASE_URL       = "https://opendata-api.businessportal.gr/api/opendata/v1"
FINANCIAL_IDS  = {4, 8, 78, 79}
RATE_INTERVAL  = 7.6          # seconds between every API call (keeps us ≤ 8/min)
REQUEST_TIMEOUT = 90
BATCH_SIZE     = 500          # companies fetched from DB at a time

# Only companies that are legally required to file financial statements.
# DB stores abbreviations: ΑΕ, ΙΚΕ, ΕΠΕ  (~187k active companies)
LEGAL_TYPE_FILTER = """
    AND legal_type_descr IN ('ΑΕ', 'ΙΚΕ', 'ΕΠΕ')
"""

# ---------------------------------------------------------------------------
# Rate-limited GEMI API
# ---------------------------------------------------------------------------

_last_req_time = 0.0


def gemi_get(path, params=None, stream=False):
    global _last_req_time
    wait = RATE_INTERVAL - (time.time() - _last_req_time)
    if wait > 0:
        time.sleep(wait)
    _last_req_time = time.time()
    resp = requests.get(
        f"{BASE_URL}{path}",
        headers={"api_key": API_KEY},
        params=params,
        timeout=REQUEST_TIMEOUT,
        stream=stream,
    )
    resp.raise_for_status()
    return resp


def fetch_doc_list(ar_gemi):
    resp = gemi_get(f"/companies/{ar_gemi}/documents")
    data = resp.json()
    if isinstance(data, list):
        return data
    return data.get("decision") or data.get("decisions") or []


def download_pdf_bytes(kak):
    resp = gemi_get(
        "/downloadFile",
        params={"key": "assemblyDecision", "elementId": kak},
        stream=True,
    )
    return b"".join(resp.iter_content(8192))


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


def upload_to_r2(s3, bucket, key, data: bytes):
    s3.put_object(Bucket=bucket, Key=key, Body=data, ContentType="application/pdf")


# ---------------------------------------------------------------------------
# DB
# ---------------------------------------------------------------------------

def get_conn():
    return psycopg2.connect(os.getenv("DATABASE_URL"), connect_timeout=30)


def ensure_tables(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS financial_ar_gemi_scanned (
                ar_gemi    BIGINT PRIMARY KEY,
                scanned_at TIMESTAMPTZ DEFAULT NOW(),
                doc_count  INT DEFAULT 0
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS financial_docs (
                kak          TEXT PRIMARY KEY,
                ar_gemi      BIGINT NOT NULL,
                subject_id   INT,
                date_filed   TEXT,
                summary      TEXT,
                r2_key       TEXT,
                downloaded_at TIMESTAMPTZ,
                parse_error  TEXT
            )
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS financial_docs_ar_gemi_idx
            ON financial_docs (ar_gemi)
        """)
    conn.commit()


def next_batch(conn):
    """Return up to BATCH_SIZE ar_gemis not yet in financial_ar_gemi_scanned."""
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT c.ar_gemi
            FROM companies c
            LEFT JOIN financial_ar_gemi_scanned s ON s.ar_gemi = c.ar_gemi
            WHERE s.ar_gemi IS NULL
              AND c.status_descr = 'Ενεργή'
              {LEGAL_TYPE_FILTER}
            ORDER BY c.ar_gemi
            LIMIT {BATCH_SIZE}
        """)
        return [row[0] for row in cur.fetchall()]


def already_downloaded_kaks(conn, ar_gemi):
    """Return the set of kaks already successfully downloaded for this company."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT kak FROM financial_docs WHERE ar_gemi = %s AND downloaded_at IS NOT NULL",
            (ar_gemi,),
        )
        return {row[0] for row in cur.fetchall()}


def record_success(conn, ar_gemi, kak, subject_id, date_filed, summary, r2_key):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO financial_docs
                (ar_gemi, kak, subject_id, date_filed, summary, r2_key, downloaded_at)
            VALUES (%s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (kak) DO UPDATE SET
                r2_key        = EXCLUDED.r2_key,
                downloaded_at = NOW(),
                parse_error   = NULL
        """, (ar_gemi, kak, subject_id, date_filed, (summary or "")[:500] or None, r2_key))
    conn.commit()


def record_failure(conn, ar_gemi, kak, subject_id, date_filed, summary, err):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO financial_docs
                (ar_gemi, kak, subject_id, date_filed, summary, parse_error)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (kak) DO UPDATE SET parse_error = EXCLUDED.parse_error
        """, (ar_gemi, kak, subject_id, date_filed, (summary or "")[:500] or None, str(err)[:500]))
    conn.commit()


def mark_scanned(conn, ar_gemi, doc_count):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO financial_ar_gemi_scanned (ar_gemi, doc_count)
            VALUES (%s, %s)
            ON CONFLICT (ar_gemi) DO NOTHING
        """, (ar_gemi, doc_count))
    conn.commit()


# ---------------------------------------------------------------------------
# Core logic
# ---------------------------------------------------------------------------

def process_company(ar_gemi, conn, s3, bucket):
    """
    Fetch doc list, download new financial PDFs to R2, record results.
    Returns (financial_count, new_downloads).
    Raises on unrecoverable error.
    """
    docs = fetch_doc_list(ar_gemi)
    financial = [d for d in docs if int(d.get("decisionSubjectID") or 0) in FINANCIAL_IDS]

    if not financial:
        return 0, 0

    done_kaks = already_downloaded_kaks(conn, ar_gemi)
    new_downloads = 0

    for d in financial:
        kak = str(d.get("kak") or "").strip()
        if not kak or kak in done_kaks:
            continue

        subject_id = d.get("decisionSubjectID")
        date_filed = d.get("dateRegistrated") or None
        summary    = d.get("summary") or ""
        r2_key     = f"financials/{ar_gemi}/{kak}.pdf"

        try:
            pdf_bytes = download_pdf_bytes(kak)
            upload_to_r2(s3, bucket, r2_key, pdf_bytes)
            record_success(conn, ar_gemi, kak, subject_id, date_filed, summary, r2_key)
            done_kaks.add(kak)
            new_downloads += 1
        except Exception as e:
            log.warning("ar_gemi=%s kak=%s download/upload error: %s", ar_gemi, kak, e)
            record_failure(conn, ar_gemi, kak, subject_id, date_filed, summary, e)

    return len(financial), new_downloads


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main():
    if not API_KEY:
        log.error("GEMI_FINANCIAL_API_KEY not set — exiting")
        sys.exit(1)

    bucket = os.getenv("R2_BUCKET", "greekleads-financials")
    s3     = make_s3()

    # Verify R2 on startup
    try:
        s3.head_bucket(Bucket=bucket)
        log.info("R2 bucket '%s' reachable — OK", bucket)
    except Exception as e:
        log.error("Cannot reach R2 bucket '%s': %s", bucket, e)
        sys.exit(1)

    conn = get_conn()
    ensure_tables(conn)

    # Startup counts
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM financial_ar_gemi_scanned")
        already_done = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM financial_docs WHERE downloaded_at IS NOT NULL")
        pdfs_stored = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM companies")
        total_companies = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM companies WHERE status_descr = 'Ενεργή'")
        active_companies = cur.fetchone()[0]
        cur.execute(f"""
            SELECT COUNT(*) FROM companies
            WHERE status_descr = 'Ενεργή'
            {LEGAL_TYPE_FILTER}
        """)
        total_target = cur.fetchone()[0]
        cur.execute("""
            SELECT legal_type_descr, COUNT(*) AS n
            FROM companies
            WHERE status_descr = 'Ενεργή' AND legal_type_descr IS NOT NULL
            GROUP BY legal_type_descr
            ORDER BY n DESC
            LIMIT 15
        """)
        top_legal_types = cur.fetchall()

    remaining = max(total_target - already_done, 0)
    pct_done  = already_done / total_target * 100 if total_target else 0
    eta_days  = (remaining * RATE_INTERVAL) / 86400

    log.info("=" * 60)
    log.info("  FINANCIAL CRAWLER STARTING")
    log.info("  All companies:     %s", f"{total_companies:,}")
    log.info("  Active (Ενεργή):   %s", f"{active_companies:,}")
    log.info("  AE/EPE/IKE target: %s", f"{total_target:,}")
    log.info("  Already scanned:   %s  (%.1f%%)", f"{already_done:,}", pct_done)
    log.info("  Remaining:         %s", f"{remaining:,}")
    log.info("  PDFs in R2:        %s", f"{pdfs_stored:,}")
    log.info("  ETA (at 8 req/min): %.1f days", eta_days)
    log.info("  Top legal_type_descr values in DB:")
    for descr, cnt in top_legal_types:
        log.info("    %s  →  %s", f"{cnt:>8,}", repr(descr))
    log.info("=" * 60)

    total_scanned      = 0
    total_docs         = 0
    total_dl           = 0
    consecutive_errors = 0
    session_start      = time.time()
    LOG_EVERY          = 1

    while True:
        # Fetch next batch of unscanned companies
        try:
            batch = next_batch(conn)
        except Exception as e:
            log.error("DB error fetching next batch: %s — retrying in 60s", e)
            time.sleep(60)
            try:
                conn = get_conn()
            except Exception:
                pass
            continue

        if not batch:
            log.info("All target companies scanned. Sleeping 1 hour before re-check.")
            time.sleep(3600)
            continue

        for ar_gemi in batch:
            try:
                fin_count, new_dl = process_company(ar_gemi, conn, s3, bucket)
                mark_scanned(conn, ar_gemi, fin_count)

                total_scanned += 1
                total_docs    += fin_count
                total_dl      += new_dl
                consecutive_errors = 0

                if total_scanned % LOG_EVERY == 0:
                    overall_done = already_done + total_scanned
                    pct          = overall_done / total_target * 100 if total_target else 0
                    elapsed      = time.time() - session_start
                    rate_per_hr  = total_scanned / elapsed * 3600 if elapsed > 0 else 0
                    remaining_n  = total_target - overall_done
                    eta_h        = remaining_n / rate_per_hr if rate_per_hr > 0 else 0
                    log.info(
                        "progress  %s/%s (%.1f%%)  "
                        "session: scanned=%s docs=%s dl=%s  "
                        "rate=%.0f/hr  eta=%.1fh",
                        f"{overall_done:,}", f"{total_target:,}", pct,
                        f"{total_scanned:,}", f"{total_docs:,}", f"{total_dl:,}",
                        rate_per_hr, eta_h,
                    )

            except requests.HTTPError as e:
                status = e.response.status_code if e.response is not None else "?"
                if status == 429:
                    log.warning("Rate limited (429) — sleeping 60s")
                    time.sleep(60)
                elif status in (502, 503, 504):
                    log.warning("GEMI gateway error (%s) — sleeping 30s", status)
                    time.sleep(30)
                else:
                    log.warning("ar_gemi=%s HTTP %s — skipping", ar_gemi, status)
                    mark_scanned(conn, ar_gemi, 0)

                consecutive_errors += 1
                if consecutive_errors >= 20:
                    log.error("20 consecutive errors — sleeping 5 min")
                    time.sleep(300)
                    consecutive_errors = 0

            except Exception as e:
                log.warning("ar_gemi=%s unexpected error: %s — skipping", ar_gemi, e)
                mark_scanned(conn, ar_gemi, 0)
                consecutive_errors += 1

                # Reconnect if DB connection dropped
                try:
                    conn.cursor().execute("SELECT 1")
                except Exception:
                    log.info("DB connection lost — reconnecting")
                    try:
                        conn = get_conn()
                    except Exception as dbe:
                        log.error("DB reconnect failed: %s — sleeping 30s", dbe)
                        time.sleep(30)


if __name__ == "__main__":
    main()
