"""
compare_financial_models.py — measure extraction error rate + A/B two models.

Built 2026-08-12 after a real test run of financial_ai_extractor.py caught a
silent 1000x decimal-scale error on one field (total_assets extracted as
60.58 instead of 60,575.64) that the model never flagged as low-confidence —
it just returned a wrong number. This script exists to answer two questions
from that finding:
  1. How often does this actually happen? (via check_plausibility — an
     accounting-identity sanity check, not proof of an error, but a strong
     signal worth counting across a real sample)
  2. Is google/gemini-2.5-pro (same family, stronger/pricier) meaningfully
     more reliable than google/gemini-2.5-flash (current default), or is
     this a Gemini-family issue that would need a different lab (Claude)
     to actually fix?

Runs BOTH models against the SAME real documents, merges each model's
results per fiscal year (financial_ai_extractor.merge_extractions), runs
the plausibility check on each, and reports where the two models actually
disagree on a field (a real empirical signal — if they disagree, at least
one is wrong, no ground truth needed to know that much).

Nothing is written to the DB — print-only, same as test_financial_ai_extraction.py.

Run from the scripts/ directory:
    python one_time/compare_financial_models.py                    # 15 companies
    python one_time/compare_financial_models.py --companies 25
"""

import argparse
import os
import sys
from collections import defaultdict
from pathlib import Path

import boto3
import psycopg2
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent.parent))
from financial_ai_extractor import extract_financials, merge_extractions, check_plausibility  # noqa: E402

load_dotenv(Path(__file__).parent.parent / ".env")

MODEL_A = "google/gemini-2.5-flash"
MODEL_B = "google/gemini-2.5-pro"

# Fields worth comparing for disagreement — skip employee_count (least likely
# to disagree meaningfully) and notes (free text, not comparable).
NUMERIC_FIELDS = [
    "revenue", "total_assets", "equity", "profit_before_tax", "net_profit",
    "gross_profit", "cost_of_sales", "inventory", "cash_and_equivalents",
    "receivables", "total_liabilities",
]


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


def pick_companies(conn, n):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT ar_gemi FROM financial_docs
            WHERE downloaded_at IS NOT NULL
            GROUP BY ar_gemi ORDER BY COUNT(*) DESC LIMIT %s
        """, (n,))
        return [str(r[0]) for r in cur.fetchall()]


def docs_for_company(conn, ar_gemi, max_docs):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT kak, r2_key, date_filed FROM financial_docs
            WHERE ar_gemi = %s AND downloaded_at IS NOT NULL
            ORDER BY date_filed DESC NULLS LAST LIMIT %s
        """, (ar_gemi, max_docs))
        return cur.fetchall()


def fmt(v):
    return f"{v:,.2f}" if isinstance(v, float) else str(v)


def disagreements(merged_a: dict, merged_b: dict, tolerance_pct=0.03, tolerance_abs=2000.0) -> list[str]:
    out = []
    for f in NUMERIC_FIELDS:
        a, b = merged_a.get(f), merged_b.get(f)
        if a is None or b is None:
            continue  # one model didn't find it — not a disagreement, just different coverage
        diff = abs(a - b)
        if diff > max(tolerance_abs, tolerance_pct * max(abs(a), abs(b), 1)):
            out.append(f"{f}: {MODEL_A.split('/')[-1]}={fmt(a)}  vs  {MODEL_B.split('/')[-1]}={fmt(b)}")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--companies", type=int, default=15)
    ap.add_argument("--max-docs-per-company", type=int, default=3)
    args = ap.parse_args()

    conn = get_conn()
    s3 = make_s3()
    bucket = os.environ.get("R2_BUCKET", "greekleads-financials")

    companies = pick_companies(conn, args.companies)
    print(f"Comparing {MODEL_A} vs {MODEL_B} across {len(companies)} companies, "
          f"up to {args.max_docs_per_company} docs each.\n")

    # Tallies for the final "how often does this happen" answer.
    total_years = 0
    plaus_fail_a = plaus_fail_b = 0
    years_with_disagreement = 0
    hard_errors_a = hard_errors_b = 0

    for ar_gemi in companies:
        with conn.cursor() as cur:
            cur.execute("SELECT co_name_el FROM companies WHERE ar_gemi = %s", (ar_gemi,))
            row = cur.fetchone()
        name = row[0] if row else "?"
        docs = docs_for_company(conn, ar_gemi, args.max_docs_per_company)
        if not docs:
            continue
        print(f"=== ar_gemi={ar_gemi}  {name}  ({len(docs)} docs) ===")

        by_year_a, by_year_b = defaultdict(list), defaultdict(list)

        for kak, r2_key, date_filed in docs:
            ext = r2_key.rsplit(".", 1)[-1]
            try:
                obj = s3.get_object(Bucket=bucket, Key=r2_key)
                file_bytes = obj["Body"].read()
            except Exception as e:
                print(f"  [{kak}] R2 fetch failed: {e}")
                continue

            fname = r2_key.rsplit("/", 1)[-1]
            ra = extract_financials(file_bytes, ext, filename=fname, model=MODEL_A)
            rb = extract_financials(file_bytes, ext, filename=fname, model=MODEL_B)

            if ra.get("error"):
                hard_errors_a += 1
            if rb.get("error"):
                hard_errors_b += 1

            print(f"  [{kak}] A(flash) found={ra.get('found')} fy={ra.get('fiscal_year')} err={ra.get('error')}")
            print(f"  [{kak}] B(pro)   found={rb.get('found')} fy={rb.get('fiscal_year')} err={rb.get('error')}")

            if ra.get("found") and not ra.get("error") and ra.get("fiscal_year") is not None:
                by_year_a[ra["fiscal_year"]].append(ra)
            if rb.get("found") and not rb.get("error") and rb.get("fiscal_year") is not None:
                by_year_b[rb["fiscal_year"]].append(rb)

        years = sorted(set(by_year_a) | set(by_year_b), reverse=True)
        for fy in years:
            total_years += 1
            ma = merge_extractions(by_year_a[fy]) if by_year_a[fy] else {f: None for f in NUMERIC_FIELDS} | {"source_count": 0}
            mb = merge_extractions(by_year_b[fy]) if by_year_b[fy] else {f: None for f in NUMERIC_FIELDS} | {"source_count": 0}

            wa = check_plausibility(ma) if by_year_a[fy] else []
            wb = check_plausibility(mb) if by_year_b[fy] else []
            if wa:
                plaus_fail_a += 1
            if wb:
                plaus_fail_b += 1

            diffs = disagreements(ma, mb)
            if diffs:
                years_with_disagreement += 1

            print(f"  --- fiscal_year={fy} ---")
            print(f"      A(flash): assets={fmt(ma.get('total_assets'))}  equity={fmt(ma.get('equity'))}  "
                  f"revenue={fmt(ma.get('revenue'))}  net_profit={fmt(ma.get('net_profit'))}")
            if wa:
                print(f"      A(flash) PLAUSIBILITY WARNING: {'; '.join(wa)}")
            print(f"      B(pro):   assets={fmt(mb.get('total_assets'))}  equity={fmt(mb.get('equity'))}  "
                  f"revenue={fmt(mb.get('revenue'))}  net_profit={fmt(mb.get('net_profit'))}")
            if wb:
                print(f"      B(pro) PLAUSIBILITY WARNING: {'; '.join(wb)}")
            if diffs:
                print(f"      MODEL DISAGREEMENT: {'; '.join(diffs)}")
        print()

    print("=" * 70)
    print(f"Fiscal-year rows compared: {total_years}")
    print(f"Hard errors (bad JSON / HTTP) — A(flash): {hard_errors_a}   B(pro): {hard_errors_b}")
    print(f"Plausibility-check failures — A(flash): {plaus_fail_a}/{total_years}   B(pro): {plaus_fail_b}/{total_years}")
    print(f"Fiscal-year rows where the two models meaningfully disagree: {years_with_disagreement}/{total_years}")


if __name__ == "__main__":
    main()
