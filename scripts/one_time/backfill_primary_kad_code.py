"""
backfill_primary_kad_code.py — add and populate companies.primary_kad_code.

WHY
    `companies.primary_kad` does NOT hold a ΚΑΔ code. It holds the Greek
    description ('ΛΙΑΝΙΚΟ ΕΜΠΟΡΙΟ ΕΙΔΩΝ ΠΑΝΤΟΠΩΛΕΙΟΥ'), which is why any filter
    of the form LEFT(primary_kad, 2) = '68' matches exactly zero rows.

    The numeric code only exists inside the `activities` JSONB. Reading it at
    query time works but costs ~13s for a filtered COUNT over 1.67M rows —
    over the search endpoint's 15s timeout. So it gets denormalised here, into
    an indexed column, which takes the same count to milliseconds.

    Secondary benefit: `primary_kad` is ~90% populated and null on the very
    newest firms, so the existing activity filter silently under-matches
    recently founded companies. This column is derived from the JSONB, which is
    complete.

WHAT IT WRITES
    primary_kad_code — the 8-digit ΚΑΔ of the firm's CURRENT primary activity
    (type='Κύρια' AND dtTo IS NULL). NULL where the firm has no open primary
    activity; those firms are the 'Μη ταξινομημένο' bucket on /statistika.

    Plus an index on LEFT(primary_kad_code, 2) — the NACE division — because
    that is the shape every sector filter uses.

GOTCHA
    A firm carries both its kad_2008 and kad_2026 activity, the old one closed
    via dtTo. Without `dtTo IS NULL` you get the obsolete code about half the
    time.

USAGE
    python scripts/one_time/backfill_primary_kad_code.py           # run it
    python scripts/one_time/backfill_primary_kad_code.py --verify  # report only

Idempotent and resumable: it walks ar_gemi in batches and only writes rows whose
value actually changes, so re-running after an interruption is safe and cheap.
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

BATCH = 20_000
STATEMENT_TIMEOUT = "600s"

# ── DDL ───────────────────────────────────────────────────────────────
# ALTER TABLE needs ACCESS EXCLUSIVE. If anything is holding even a read lock
# on `companies`, the ALTER queues -- and because an ACCESS EXCLUSIVE request
# queues AHEAD of every later reader, the whole table stops serving until it
# gets its turn. That is exactly how a first attempt at this script took the
# site down: a bot connection sat `idle in transaction` for 50 minutes holding
# ACCESS SHARE, and every page query piled up behind the waiting ALTER.
#
# Two defences, both mandatory:
#   1. LOCK_TIMEOUT -- the ALTER gives up in seconds instead of queueing.
#   2. preflight()  -- refuse to start while a stale transaction holds the
#      table, and say which pid to deal with.
LOCK_TIMEOUT = "4s"

ALTER_SQL = "ALTER TABLE companies ADD COLUMN IF NOT EXISTS primary_kad_code text"

# CONCURRENTLY never takes ACCESS EXCLUSIVE, so readers and writers keep working
# while the index builds. It cannot run inside a transaction block, hence
# autocommit, and it must NOT inherit lock_timeout or it aborts partway and
# leaves an INVALID index behind.
INDEXES = [
    ("companies_primary_kad_div_idx",
     """CREATE INDEX CONCURRENTLY IF NOT EXISTS companies_primary_kad_div_idx
        ON companies (LEFT(primary_kad_code, 2))
        WHERE primary_kad_code IS NOT NULL"""),
    ("companies_primary_kad_code_idx",
     """CREATE INDEX CONCURRENTLY IF NOT EXISTS companies_primary_kad_code_idx
        ON companies (primary_kad_code)
        WHERE primary_kad_code IS NOT NULL"""),
]


def preflight(cur):
    """Report anything holding a lock on `companies` that would stall the ALTER."""
    cur.execute("""
        SELECT a.pid,
               a.state,
               round(EXTRACT(EPOCH FROM (now() - a.xact_start)))::int AS xact_age,
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
    print("  BLOCKED: these connections hold a lock on `companies` inside an")
    print("  idle transaction. The ALTER cannot proceed, and attempting it would")
    print("  stall every query against the table:")
    print("")
    for pid, state, age, q in rows:
        print("    pid {}  {}  {}s".format(pid, state, age))
        print("      last: {}".format(q))
    print("")
    print("  Clear them first, then re-run. Either restart the Railway worker,")
    print("  or terminate the connection directly:")
    print("      SELECT pg_terminate_backend({});".format(rows[0][0]))
    return False

UPDATE_SQL = """
UPDATE companies c
SET primary_kad_code = sub.code
FROM (
    SELECT c2.ar_gemi,
           (SELECT a->'activity'->>'id'
              FROM jsonb_array_elements(c2.activities) a
             WHERE a->>'type' = 'Κύρια'
               AND a->>'dtTo' IS NULL
             LIMIT 1) AS code
    FROM companies c2
    WHERE c2.ar_gemi > %s
    ORDER BY c2.ar_gemi
    LIMIT %s
) sub
WHERE c.ar_gemi = sub.ar_gemi
  -- Only write rows that actually change, so a re-run is nearly free.
  AND c.primary_kad_code IS DISTINCT FROM sub.code
"""

NEXT_CURSOR_SQL = """
SELECT MAX(ar_gemi) FROM (
    SELECT ar_gemi FROM companies WHERE ar_gemi > %s ORDER BY ar_gemi LIMIT %s
) s
"""


def bar(done, total, extra="", width=34):
    frac = min(1.0, done / total) if total else 1.0
    filled = int(width * frac)
    sys.stdout.write(
        "\r  [{}{}] {:>6.1f}%  {:>9,}/{:,}  {}".format(
            "#" * filled, "." * (width - filled), frac * 100, done, total, extra
        )
    )
    sys.stdout.flush()


def verify(cur):
    print("\nVerify:")
    cur.execute("""SELECT column_name FROM information_schema.columns
                   WHERE table_name='companies' AND column_name='primary_kad_code'""")
    if not cur.fetchone():
        print("  primary_kad_code does not exist -- run without --verify first.")
        return
    cur.execute("""
        SELECT COUNT(*) AS total,
               COUNT(primary_kad_code) AS filled,
               COUNT(*) FILTER (WHERE primary_kad_code IS NULL
                                  AND activities IS NOT NULL) AS null_with_acts
        FROM companies""")
    total, filled, null_acts = cur.fetchone()
    print("  {:,} rows, {:,} with a code ({:.1f}%)".format(
        total, filled, 100.0 * filled / total if total else 0))
    print("  {:,} have activities but no open primary ΚΑΔ "
          "(these are the 'Μη ταξινομημένο' bucket)".format(null_acts))
    cur.execute("""SELECT LEFT(primary_kad_code,2) d, COUNT(*)
                   FROM companies WHERE primary_kad_code IS NOT NULL
                   GROUP BY 1 ORDER BY 2 DESC LIMIT 5""")
    print("  busiest divisions:")
    for d, n in cur.fetchall():
        print("    {}  {:,}".format(d, n))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", action="store_true", help="report only, write nothing")
    args = ap.parse_args()

    conn = psycopg2.connect(DSN, connect_timeout=30)
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute("SET statement_timeout = '{}'".format(STATEMENT_TIMEOUT))

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
    print("Schema:")
    # Fail fast rather than queue: a waiting ACCESS EXCLUSIVE blocks every
    # reader that arrives behind it.
    cur.execute("SET lock_timeout = '{}'".format(LOCK_TIMEOUT))
    t0 = time.time()
    try:
        cur.execute(ALTER_SQL)
        conn.commit()
    except psycopg2.errors.LockNotAvailable:
        conn.rollback()
        print("  could not lock `companies` within {} -- something is using it."
              .format(LOCK_TIMEOUT))
        print("  Nothing was changed. Re-run when the table is quiet.")
        conn.close()
        sys.exit(1)
    print("  ok  column primary_kad_code  ({:.1f}s)".format(time.time() - t0))
    cur.execute("SET lock_timeout = 0")
    # A bare SET opens a transaction, and psycopg2 refuses to flip autocommit
    # inside one. Committing both closes it and makes the SET stick for the
    # rest of the session.
    conn.commit()

    # CONCURRENTLY requires autocommit and must not carry a lock_timeout.
    conn.autocommit = True
    for name, ddl in INDEXES:
        t0 = time.time()
        print("  building {} (concurrently, this can take a few minutes)..."
              .format(name), flush=True)
        cur.execute(ddl)
        print("  ok  {}  ({:.1f}s)".format(name, time.time() - t0))
    conn.autocommit = False

    cur.execute("SELECT COUNT(*), COALESCE(MAX(ar_gemi), 0) FROM companies")
    total, max_ar = cur.fetchone()
    print("\nBackfilling {:,} rows in batches of {:,}:".format(total, BATCH))

    cursor_at = 0
    done = 0
    written = 0
    t0 = time.time()

    while cursor_at < max_ar:
        cur.execute(UPDATE_SQL, (cursor_at, BATCH))
        written += cur.rowcount

        cur.execute(NEXT_CURSOR_SQL, (cursor_at, BATCH))
        nxt = cur.fetchone()[0]
        conn.commit()

        if nxt is None or nxt <= cursor_at:
            break
        cursor_at = nxt

        done += BATCH
        rate = done / max(0.001, time.time() - t0)
        eta = (total - done) / rate if rate else 0
        bar(min(done, total), total, "{:,} written · ETA {:.0f}s".format(written, eta))

    bar(total, total, "{:,} written".format(written))
    print("\nDone in {:.1f}s.".format(time.time() - t0))

    # The planner needs fresh stats on a brand-new column or it will keep
    # choosing a sequential scan.
    print("Analysing...")
    conn.commit()          # see the note above -- autocommit needs a clean txn
    conn.autocommit = True
    cur.execute("ANALYZE companies (primary_kad_code)")

    verify(cur)
    conn.close()


if __name__ == "__main__":
    main()
