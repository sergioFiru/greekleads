"""
financial_downloader.py — Phase 1: Download GEMI financial PDFs to Cloudflare R2.

Fetches document lists for each ΑΕ/ΕΠΕ/ΙΚΕ company from the GEMI API,
downloads PDFs (subject IDs 4, 8, 78, 79), and uploads them to R2.

Resumable: progress is tracked in two DB tables:
  - financial_ar_gemi_scanned  → which companies we've already queried
  - financial_docs              → which PDFs we've downloaded (+ failures)

Rate limit: 8 req/min (GEMI_FINANCIAL_API_KEY). Script enforces 7.6 s
between every API call automatically.

Usage:
    cd scripts
    python one_time/financial_downloader.py
    python one_time/financial_downloader.py --limit 100          # test run
    python one_time/financial_downloader.py --all-legal-types    # include ΑΤΟΜΙΚΗ etc.

Required env vars (scripts/.env):
    GEMI_FINANCIAL_API_KEY, DATABASE_URL,
    R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET
"""

import argparse
import io
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import boto3
import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv
from tqdm import tqdm

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

load_dotenv(Path(__file__).parent.parent / ".env")

API_KEY        = os.getenv("GEMI_FINANCIAL_API_KEY")
BASE_URL       = "https://opendata-api.businessportal.gr/api/opendata/v1"
FINANCIAL_IDS  = {4, 8, 78, 79}
RATE_INTERVAL  = 7.6   # seconds between API calls → ≤ 8 req/min with buffer
REQUEST_TIMEOUT = 90

_last_req_time = 0.0


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

def _rate_limited_get(path, params=None, stream=False):
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
    resp = _rate_limited_get(f"/companies/{ar_gemi}/documents")
    data = resp.json()
    if isinstance(data, list):
        return data
    return data.get("decision") or data.get("decisions") or []


def download_pdf_bytes(kak):
    resp = _rate_limited_get(
        "/downloadFile",
        params={"key": "assemblyDecision", "elementId": kak},
        stream=True,
    )
    return b"".join(resp.iter_content(8192))


# ---------------------------------------------------------------------------
# R2 / S3
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
# DB helpers
# ---------------------------------------------------------------------------

def get_conn():
    return psycopg2.connect(os.getenv("DATABASE_URL"), connect_timeout=30)


def ensure_tracking_table(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS financial_ar_gemi_scanned (
                ar_gemi    BIGINT PRIMARY KEY,
                scanned_at TIMESTAMPTZ DEFAULT NOW(),
                doc_count  INT DEFAULT 0
            )
        """)
    conn.commit()


# ---------------------------------------------------------------------------
# Core processing
# ---------------------------------------------------------------------------

def process_company(ar_gemi, conn, s3, bucket, downloaded_kaks):
    """
    Fetch doc list for ar_gemi, download any unseen financial PDFs to R2,
    record results in financial_docs.

    Returns (financial_doc_count, new_downloads, error_string_or_None).
    """
    try:
        all_docs = fetch_doc_list(ar_gemi)
    except Exception as e:
        return 0, 0, f"list_error:{e}"

    financial = [
        d for d in all_docs
        if int(d.get("decisionSubjectID") or 0) in FINANCIAL_IDS
    ]

    new_downloads = 0

    for d in financial:
        kak = str(d.get("kak") or "").strip()
        if not kak or kak in downloaded_kaks:
            continue

        r2_key      = f"financials/{ar_gemi}/{kak}.pdf"
        subject_id  = d.get("decisionSubjectID")
        date_filed  = d.get("dateRegistrated") or None
        summary     = (d.get("summary") or "")[:500] or None

        try:
            pdf_bytes = download_pdf_bytes(kak)
            upload_to_r2(s3, bucket, r2_key, pdf_bytes)
        except Exception as e:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO financial_docs
                        (ar_gemi, kak, subject_id, date_filed, summary, parse_error)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (kak) DO UPDATE SET parse_error = EXCLUDED.parse_error
                """, (ar_gemi, kak, subject_id, date_filed, summary, str(e)[:500]))
            conn.commit()
            continue

        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO financial_docs
                    (ar_gemi, kak, subject_id, date_filed, summary, r2_key, downloaded_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (kak) DO UPDATE SET
                    r2_key       = EXCLUDED.r2_key,
                    downloaded_at = NOW(),
                    parse_error   = NULL
            """, (ar_gemi, kak, subject_id, date_filed, summary, r2_key))
        conn.commit()

        downloaded_kaks.add(kak)
        new_downloads += 1

    return len(financial), new_downloads, None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Download GEMI financial PDFs → R2")
    parser.add_argument("--limit", type=int, default=0,
                        help="Stop after N companies (default 0 = all)")
    parser.add_argument("--all-legal-types", action="store_true",
                        help="Query every company, not just ΑΕ/ΕΠΕ/ΙΚΕ")
    args = parser.parse_args()

    if not API_KEY:
        print("ERROR: GEMI_FINANCIAL_API_KEY not set in scripts/.env")
        sys.exit(1)

    bucket = os.getenv("R2_BUCKET", "greekleads-financials")
    s3     = make_s3()
    conn   = get_conn()

    ensure_tracking_table(conn)

    # ------------------------------------------------------------------
    # Load already-scanned ar_gemis and already-downloaded kaks
    # ------------------------------------------------------------------
    with conn.cursor() as cur:
        cur.execute("SELECT ar_gemi FROM financial_ar_gemi_scanned")
        already_scanned = {row[0] for row in cur.fetchall()}

    with conn.cursor() as cur:
        cur.execute("SELECT kak FROM financial_docs WHERE downloaded_at IS NOT NULL")
        downloaded_kaks = {row[0] for row in cur.fetchall()}

    # ------------------------------------------------------------------
    # Determine target companies
    # ------------------------------------------------------------------
    legal_filter = ""
    if not args.all_legal_types:
        legal_filter = """
            AND legal_type_descr IN ('ΑΕ', 'ΙΚΕ', 'ΕΠΕ')
        """

    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT ar_gemi FROM companies
            WHERE status_descr = 'Ενεργή'
            {legal_filter}
            ORDER BY ar_gemi
        """)
        all_target = [row[0] for row in cur.fetchall()]

    to_process = [g for g in all_target if g not in already_scanned]
    if args.limit:
        to_process = to_process[: args.limit]

    # ------------------------------------------------------------------
    # Summary + ETA
    # ------------------------------------------------------------------
    print(f"\nTarget companies:      {len(all_target):>10,}")
    print(f"Already scanned:       {len(already_scanned):>10,}")
    print(f"To process this run:   {len(to_process):>10,}")
    print(f"Known downloaded docs: {len(downloaded_kaks):>10,}")
    print(f"Rate: {RATE_INTERVAL}s/req → 8 req/min")
    eta_hours = (len(to_process) * RATE_INTERVAL) / 3600
    print(f"ETA (listing only):    {eta_hours:.1f} hr\n")

    # Verify R2 is reachable before starting
    try:
        s3.head_bucket(Bucket=bucket)
        print(f"R2 bucket '{bucket}' — OK\n")
    except Exception as e:
        print(f"ERROR: Cannot reach R2 bucket '{bucket}': {e}")
        sys.exit(1)

    # ------------------------------------------------------------------
    # Main loop
    # ------------------------------------------------------------------
    stats = {"scanned": 0, "docs_found": 0, "downloaded": 0, "errors": 0}

    with tqdm(to_process, unit="co", dynamic_ncols=True) as pbar:
        for ar_gemi in pbar:
            doc_count, new_dl, err = process_company(
                ar_gemi, conn, s3, bucket, downloaded_kaks
            )

            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO financial_ar_gemi_scanned (ar_gemi, doc_count)
                    VALUES (%s, %s)
                    ON CONFLICT (ar_gemi) DO NOTHING
                """, (ar_gemi, doc_count))
            conn.commit()

            stats["scanned"]   += 1
            stats["docs_found"] += doc_count
            stats["downloaded"] += new_dl
            if err:
                stats["errors"] += 1

            pbar.set_postfix(
                scanned  = f"{stats['scanned']:,}",
                docs     = f"{stats['docs_found']:,}",
                dl       = f"{stats['downloaded']:,}",
                err      = stats["errors"],
            )

    print(
        f"\nFinished."
        f"  Scanned: {stats['scanned']:,}"
        f"  Docs found: {stats['docs_found']:,}"
        f"  Downloaded: {stats['downloaded']:,}"
        f"  Errors: {stats['errors']:,}"
    )
    conn.close()


if __name__ == "__main__":
    main()
