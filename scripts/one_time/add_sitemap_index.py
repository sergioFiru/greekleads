"""
add_sitemap_index.py -- partial index backing the Tier A sitemap.

WHY
    /sitemap/[n].xml lists active companies that have a website:

        WHERE status_descr = 'Ενεργή' AND url IS NOT NULL AND url <> ''
        ORDER BY ar_gemi LIMIT 50000 OFFSET n*50000

    Measured without an index: 12,1s for the first chunk. That is served to
    Googlebot from a serverless function, so it must not be a full table scan --
    a timeout there means the sitemap 500s and Google stops trusting it.

    A partial index over just those ~80k rows makes it an index-only scan.
    INCLUDE (last_updated_at) keeps <lastmod> off the heap, so the whole chunk
    is answered from the index.

    Exact equality on 'Ενεργή' rather than ILIKE '%Ενεργ%': an index predicate
    must be immutable, and `=` unambiguously is.

SAFETY
    CREATE INDEX CONCURRENTLY takes only SHARE UPDATE EXCLUSIVE, so readers and
    writers keep working. But it WAITS for every transaction that predates it to
    finish -- a single connection sitting `idle in transaction` will stall it
    forever. Hence preflight(), same as backfill_primary_kad_code.py.

USAGE
    python scripts/one_time/add_sitemap_index.py
    python scripts/one_time/add_sitemap_index.py --verify

Idempotent: IF NOT EXISTS, safe to re-run.
"""

import os
import sys
import time
import argparse
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")
DSN = os.getenv("DATABASE_URL")
if not DSN:
    sys.exit("DATABASE_URL not found in scripts/.env")

INDEX_NAME = "companies_sitemap_idx"
PREDICATE = "status_descr = 'Ενεργή' AND url IS NOT NULL AND url <> ''"

DDL = """
CREATE INDEX CONCURRENTLY IF NOT EXISTS {name}
    ON companies (ar_gemi) INCLUDE (last_updated_at)
    WHERE {pred}
""".format(name=INDEX_NAME, pred=PREDICATE)


def preflight(cur):
    cur.execute("""
        SELECT a.pid,
               round(EXTRACT(EPOCH FROM (now() - a.xact_start)))::int,
               LEFT(regexp_replace(a.query, '\s+', ' ', 'g'), 70)
        FROM pg_locks l
        JOIN pg_stat_activity a ON a.pid = l.pid
        WHERE l.relation = 'companies'::regclass
          AND a.pid <> pg_backend_pid()
          AND a.state = 'idle in transaction'
        ORDER BY a.xact_start
    """)
    rows = cur.fetchall()
    if not rows:
        return True
    print("")
    print("  BLOCKED: idle transactions hold `companies`. CREATE INDEX")
    print("  CONCURRENTLY would wait on them indefinitely:")
    print("")
    for pid, age, q in rows:
        print("    pid {}  idle in transaction  {}s".format(pid, age))
        print("      last: {}".format(q))
    print("")
    print("  Restart the Railway worker, or:")
    print("      SELECT pg_terminate_backend({});".format(rows[0][0]))
    return False


def verify(cur):
    print("\nVerify:")
    cur.execute("""SELECT indisvalid, pg_size_pretty(pg_relation_size(i.indexrelid))
                   FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
                   WHERE c.relname = %s""", (INDEX_NAME,))
    row = cur.fetchone()
    if not row:
        print("  {} does not exist.".format(INDEX_NAME))
        return
    valid, size = row
    print("  {}  valid={}  size={}".format(INDEX_NAME, valid, size))
    if not valid:
        print("  INVALID -- a previous build was interrupted. Drop and re-run:")
        print("      DROP INDEX CONCURRENTLY {};".format(INDEX_NAME))
        return

    cur.execute("SELECT COUNT(*) FROM companies WHERE {}".format(PREDICATE))
    print("  {:,} rows in the sitemap set".format(cur.fetchone()[0]))

    t0 = time.time()
    cur.execute("""SELECT ar_gemi, last_updated_at FROM companies
                   WHERE {} ORDER BY ar_gemi LIMIT 50000""".format(PREDICATE))
    n = len(cur.fetchall())
    print("  first chunk: {:,} rows in {:.2f}s".format(n, time.time() - t0))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", action="store_true", help="report only, build nothing")
    args = ap.parse_args()

    conn = psycopg2.connect(DSN, connect_timeout=30)
    conn.autocommit = True
    cur = conn.cursor()

    if args.verify:
        verify(cur)
        conn.close()
        return

    print("Preflight:")
    if not preflight(cur):
        conn.close()
        sys.exit(1)
    print("  ok  no stale transactions on `companies`")

    print("")
    print("Building {} (concurrently -- a few minutes, the site stays up)..."
          .format(INDEX_NAME), flush=True)
    t0 = time.time()
    cur.execute(DDL)
    print("  ok  ({:.1f}s)".format(time.time() - t0))

    cur.execute("ANALYZE companies (ar_gemi, status_descr, url, last_updated_at)")
    verify(cur)
    conn.close()


if __name__ == "__main__":
    main()
