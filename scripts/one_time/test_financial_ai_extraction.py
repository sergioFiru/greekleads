"""
test_financial_ai_extraction.py — LOCAL test driver for financial_ai_extractor.py.

Pulls a handful of already-downloaded documents from R2 for a few real
companies, runs the Gemini extraction on each, and prints the results for you
to eyeball. Nothing is written to the DB unless you pass --write.

This is just for testing the extraction quality on real documents before this
becomes part of anything bigger (the manual "Retrieve" button, or a bulk
backfill) — no bulk scanning happens here.

Run from the scripts/ directory:
    python one_time/test_financial_ai_extraction.py                     # 3 companies, print only
    python one_time/test_financial_ai_extraction.py --ar-gemi 241301000 # one specific company
    python one_time/test_financial_ai_extraction.py --write             # also save results to financial_statements
"""

import argparse
import os
import sys
from pathlib import Path

import boto3
import psycopg2
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent.parent))
from financial_ai_extractor import extract_financials  # noqa: E402

load_dotenv(Path(__file__).parent.parent / ".env")


def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)


def make_s3():
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def pick_companies(conn, n, ar_gemi=None):
    with conn.cursor() as cur:
        if ar_gemi:
            cur.execute("SELECT DISTINCT ar_gemi FROM financial_docs WHERE ar_gemi = %s AND downloaded_at IS NOT NULL", (ar_gemi,))
        else:
            # companies with the most downloaded docs — best multi-year test cases
            cur.execute("""
                SELECT ar_gemi FROM financial_docs
                WHERE downloaded_at IS NOT NULL
                GROUP BY ar_gemi ORDER BY COUNT(*) DESC LIMIT %s
            """, (n,))
        return [str(r[0]) for r in cur.fetchall()]


def docs_for_company(conn, ar_gemi):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT kak, r2_key, date_filed FROM financial_docs
            WHERE ar_gemi = %s AND downloaded_at IS NOT NULL
            ORDER BY date_filed DESC NULLS LAST
        """, (ar_gemi,))
        return cur.fetchall()


def upsert_statement(conn, kak, ar_gemi, result):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO financial_statements
                (kak, ar_gemi, fiscal_year, revenue, total_assets, equity, profit_before_tax, net_profit, parsed_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (kak) DO UPDATE SET
                fiscal_year = EXCLUDED.fiscal_year, revenue = EXCLUDED.revenue,
                total_assets = EXCLUDED.total_assets, equity = EXCLUDED.equity,
                profit_before_tax = EXCLUDED.profit_before_tax, net_profit = EXCLUDED.net_profit,
                parsed_at = NOW()
        """, (kak, int(ar_gemi), result["fiscal_year"], result["revenue"], result["total_assets"],
              result["equity"], result["profit_before_tax"], result["net_profit"]))
    conn.commit()


def mark_doc_error(conn, kak, error):
    with conn.cursor() as cur:
        cur.execute("UPDATE financial_docs SET parse_error = %s WHERE kak = %s", (error[:500], kak))
    conn.commit()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ar-gemi", type=int, default=None, help="test one specific company instead of picking automatically")
    ap.add_argument("--companies", type=int, default=3, help="how many companies to test (ignored if --ar-gemi given)")
    ap.add_argument("--max-docs-per-company", type=int, default=3, help="cap docs tested per company, to keep this cheap")
    ap.add_argument("--write", action="store_true", help="also upsert successful results into financial_statements")
    args = ap.parse_args()

    conn = get_conn()
    s3 = make_s3()
    bucket = os.environ.get("R2_BUCKET", "greekleads-financials")

    companies = pick_companies(conn, args.companies, args.ar_gemi)
    if not companies:
        print("No companies found with downloaded documents.")
        return

    print(f"Testing {len(companies)} companies, up to {args.max_docs_per_company} docs each. write={args.write}\n")

    total, ok, failed = 0, 0, 0
    for ar_gemi in companies:
        with conn.cursor() as cur:
            cur.execute("SELECT co_name_el FROM companies WHERE ar_gemi = %s", (ar_gemi,))
            row = cur.fetchone()
        name = row[0] if row else "?"
        docs = docs_for_company(conn, ar_gemi)[: args.max_docs_per_company]
        print(f"=== ar_gemi={ar_gemi}  {name}  ({len(docs)} docs) ===")

        for kak, r2_key, date_filed in docs:
            total += 1
            ext = r2_key.rsplit(".", 1)[-1]
            try:
                obj = s3.get_object(Bucket=bucket, Key=r2_key)
                file_bytes = obj["Body"].read()
            except Exception as e:
                print(f"  [{kak}] R2 fetch failed: {e}")
                failed += 1
                continue

            result = extract_financials(file_bytes, ext, filename=r2_key.rsplit("/", 1)[-1])

            if result.get("error"):
                print(f"  [{kak}] date_filed={date_filed}  ERROR: {result['error']}")
                failed += 1
                if args.write:
                    mark_doc_error(conn, kak, result["error"])
                continue

            if not result["found"]:
                print(f"  [{kak}] date_filed={date_filed}  found=False (not a financial statement?)  notes={result['notes']}")
                failed += 1
                if args.write:
                    mark_doc_error(conn, kak, "not_a_financial_statement")
                continue

            ok += 1
            print(
                f"  [{kak}] date_filed={date_filed}  fiscal_year={result['fiscal_year']}  "
                f"revenue={result['revenue']}  net_profit={result['net_profit']}  "
                f"assets={result['total_assets']}  equity={result['equity']}  "
                f"pbt={result['profit_before_tax']}"
                + (f"  notes={result['notes']}" if result["notes"] else "")
            )
            if args.write:
                upsert_statement(conn, kak, ar_gemi, result)

        print()

    print(f"Done. {total} docs tested — {ok} extracted, {failed} failed/not-found.")
    if args.write:
        print("Results written to financial_statements — check the company page(s) above.")
    else:
        print("Nothing written (pass --write to save results and see them on the real company page).")


if __name__ == "__main__":
    main()
