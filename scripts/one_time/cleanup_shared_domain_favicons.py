"""
cleanup_shared_domain_favicons.py — undo the "wrong company, wrong favicon"
damage caused by discover_websites.py's email-domain-probe premise breaking
down for firms that register their ACCOUNTANT's/LAWYER's email instead of
their own (see shared_domain_report.py for the full explanation + a saved
list of every affected group, for later "assign to parent company" work).

Scope of THIS script — companies where:
  - website_source = 'discovered'   (never touches ΓΕΜΗ's own `url` field)
  - their email domain is shared by >= MIN_SHARED other companies (default 5,
    the threshold empirically checked against random samples in-session with
    zero false positives — legit shared corporate sites never showed up)

For each match:
  1. Delete its company_favicons R2 object (if status='ok')
  2. Delete its company_favicons row (ok or error — it re-enters the
     candidate pool naturally once discovered_url is null, no separate
     scraper exclusion needed)
  3. NULL discovered_url + website_source
     (discovered_scanned_at is left stamped on purpose, so the live
     website_scanner bot's pass 2 does NOT immediately re-probe and
     re-write the same wrong domain)

Read scan first, nothing destructive without --dry-run absent:
    python one_time/cleanup_shared_domain_favicons.py --dry-run
    python one_time/cleanup_shared_domain_favicons.py
    python one_time/cleanup_shared_domain_favicons.py --min=5   # default 5
"""
import os
import sys
from pathlib import Path

import boto3
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent.parent))
from scan_utils import FREEMAIL  # noqa: E402

load_dotenv(Path(__file__).parent.parent / ".env")
DSN = os.getenv("DATABASE_URL")
if not DSN:
    sys.exit("DATABASE_URL not found in scripts/.env")

DRY_RUN = "--dry-run" in sys.argv
MIN_SHARED = next(
    (int(a.split("=", 1)[1]) for a in sys.argv if a.startswith("--min=")), 5
)
BUCKET = os.environ.get("R2_BUCKET", "greekleads-financials")


def make_s3():
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def bar(done, total, width=32):
    total = max(total, 1)
    frac = min(done / total, 1.0)
    filled = int(frac * width)
    return "█" * filled + "░" * (width - filled)


def find_targets(conn):
    """Companies with website_source='discovered' whose email domain is
    shared by >= MIN_SHARED companies (any status, computed over the whole
    table — the parent/accountant relationship doesn't care about the child's
    own status_descr)."""
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            WITH dom AS (
                SELECT ar_gemi, lower(split_part(email, '@', 2)) AS domain
                FROM companies
                WHERE email IS NOT NULL AND email LIKE '%%@%%'
            ),
            shared AS (
                SELECT domain FROM dom
                WHERE domain <> '' AND domain <> ALL(%(freemail)s)
                GROUP BY domain
                HAVING count(*) >= %(min_shared)s
            )
            SELECT c.ar_gemi, c.co_name_el, dom.domain,
                   f.status AS favicon_status, f.r2_key
            FROM companies c
            JOIN dom ON dom.ar_gemi = c.ar_gemi
            JOIN shared ON shared.domain = dom.domain
            LEFT JOIN company_favicons f ON f.ar_gemi = c.ar_gemi
            WHERE c.website_source = 'discovered'
            ORDER BY dom.domain, c.ar_gemi
        """, {
            "min_shared": MIN_SHARED,
            "freemail": list(FREEMAIL),
        })
        return cur.fetchall()


def main():
    print("Connecting…")
    conn = psycopg2.connect(DSN, connect_timeout=30)

    print(f"Finding companies with a shared-domain (>= {MIN_SHARED} companies) "
          f"discovered_url…")
    rows = find_targets(conn)
    n_favicons = sum(1 for r in rows if r["favicon_status"] == "ok")
    domains = {r["domain"] for r in rows}
    print(f"  Companies to clear discovered_url on: {len(rows):,}")
    print(f"  Of which have a live (wrong) favicon: {n_favicons:,}")
    print(f"  Distinct shared domains involved:     {len(domains):,}")

    if DRY_RUN:
        print("\n--dry-run: nothing written.")
        conn.close()
        return
    if not rows:
        print("\nNothing to clean up.")
        conn.close()
        return

    s3 = make_s3()
    ar_gemis = [r["ar_gemi"] for r in rows]

    print(f"\nDeleting {n_favicons:,} R2 favicon objects:")
    deleted_r2 = 0
    for i, r in enumerate(rows):
        if r["favicon_status"] == "ok" and r["r2_key"]:
            try:
                s3.delete_object(Bucket=BUCKET, Key=r["r2_key"])
                deleted_r2 += 1
            except Exception as e:
                print(f"\n  [warn] R2 delete failed for {r['r2_key']}: {e}")
        if i % 200 == 0 or i == len(rows) - 1:
            sys.stdout.write(f"\r  [{bar(i + 1, len(rows))}] {i + 1:,}/{len(rows):,}  "
                              f"(deleted {deleted_r2:,})")
            sys.stdout.flush()
    print()

    print(f"\nDeleting company_favicons rows + clearing discovered_url for "
          f"{len(ar_gemis):,} companies…")
    with conn.cursor() as cur:
        cur.execute("DELETE FROM company_favicons WHERE ar_gemi = ANY(%s)", (ar_gemis,))
        deleted_rows = cur.rowcount
        cur.execute("""
            UPDATE companies
            SET discovered_url = NULL, website_source = NULL
            WHERE ar_gemi = ANY(%s)
        """, (ar_gemis,))
        updated = cur.rowcount
    conn.commit()
    conn.close()

    print(f"\nDone.")
    print(f"  R2 objects deleted:        {deleted_r2:,}")
    print(f"  company_favicons rows del: {deleted_rows:,}")
    print(f"  companies cleared:         {updated:,}")


if __name__ == "__main__":
    main()
