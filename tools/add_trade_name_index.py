#!/usr/bin/env python3
"""
Add a trigram GIN index on companies.co_titles_el::text — the trade name
(διακριτικός τίτλος) branch of the search bar.

THE PROBLEM THIS SOLVES
-----------------------
The search box matches ONE input against six columns with OR:

    co_name_el OR co_titles_el::text OR email OR phone OR url OR afm

Five of those have trigram indexes. `co_titles_el::text` has none, and Postgres
can only combine OR branches with a BitmapOr when EVERY branch is indexable.
One unindexed branch therefore poisons all six: the planner gives up and
sequentially scans all 1,69M companies on every search.

Measured 2026-10-07, searching "ORIGAMI":

    each indexed branch alone          0,18s
    co_titles_el::text alone           0,99s
    all six OR'd together              1,73s    reads 461.445 blocks
    same query minus co_titles_el      0,19s    reads       166 blocks

That is 2.781x fewer blocks. The one branch costs 1,55s and contributes 5 rows.
It is also why a search for "ORIGAMI" — 19 results — took 4,61s in production.

WHY AN EXPRESSION INDEX WORKS HERE
----------------------------------
co_titles_el is jsonb (NOT text[], which is worth saying because it looks like
an array). An index on an expression requires that expression to be IMMUTABLE,
and `jsonb_out` is immutable — checked in pg_proc, not assumed. So
`(co_titles_el::text)` can be indexed directly, and it matches the expression
the query already writes, character for character. No query change needed.

WHAT IT COSTS
-------------
505.840 rows carry a non-empty trade name; the rest are `[]`, which still gets
indexed. Expect a sizeable index — the script reports the real number when it
finishes. Built CONCURRENTLY so writes are never blocked.

Run from the repo root:  python tools/add_trade_name_index.py

Safe to re-run: IF NOT EXISTS. If an earlier run was interrupted, Postgres
leaves an INVALID index behind that still costs disk and is never used — this
script detects that and tells you to drop it first.
"""
import os
import sys
import threading
import time

import psycopg2
from dotenv import load_dotenv

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding='utf-8')
    except (AttributeError, ValueError):
        pass

load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'scripts', '.env'))
DSN = os.getenv('DATABASE_URL')
if not DSN:
    sys.exit('DATABASE_URL not found in scripts/.env')

INDEX = 'idx_companies_co_titles_trgm'

STEPS = [
    ('pg_trgm extension', 'CREATE EXTENSION IF NOT EXISTS pg_trgm'),
    ('co_titles_el trigram index',
     f'CREATE INDEX CONCURRENTLY IF NOT EXISTS {INDEX} '
     f'ON companies USING GIN ((co_titles_el::text) gin_trgm_ops)'),
]


def spinner(label, stop):
    """CREATE INDEX emits no progress events, so show elapsed time instead."""
    frames = '|/-\\'
    t0 = time.time()
    i = 0
    while not stop.is_set():
        el = int(time.time() - t0)
        sys.stdout.write(f'\r  {frames[i % 4]} {label}... {el // 60:02d}:{el % 60:02d} elapsed')
        sys.stdout.flush()
        i += 1
        time.sleep(0.25)
    el = int(time.time() - t0)
    sys.stdout.write(f'\r  * {label}... done in {el // 60:02d}:{el % 60:02d}        \n')
    sys.stdout.flush()


def main():
    print('Connecting...')
    conn = psycopg2.connect(DSN, connect_timeout=30)
    conn.autocommit = True   # CONCURRENTLY cannot run inside a transaction
    cur = conn.cursor()

    # An interrupted CONCURRENTLY build leaves an invalid index that IF NOT
    # EXISTS will happily skip over, so the script would claim success while
    # the planner keeps ignoring it.
    cur.execute("""
        SELECT c.relname FROM pg_class c
        JOIN pg_index i ON i.indexrelid = c.oid
        WHERE c.relname = %s AND NOT i.indisvalid
    """, (INDEX,))
    if cur.fetchone():
        print(f'\n  {INDEX} exists but is INVALID — a previous run was interrupted.')
        print(f'  Drop it first:  DROP INDEX {INDEX};')
        conn.close()
        sys.exit(1)

    print(f'\nRunning {len(STEPS)} step(s). The index build is the slow one;')
    print('CONCURRENTLY means writes keep working throughout.\n')

    for label, sql in STEPS:
        stop = threading.Event()
        t = threading.Thread(target=spinner, args=(label, stop), daemon=True)
        t.start()
        try:
            cur.execute(sql)
        finally:
            stop.set()
            t.join()

    cur.execute('SELECT pg_size_pretty(pg_relation_size(%s))', (INDEX,))
    print(f'\nIndex size on disk: {cur.fetchone()[0]}')

    print('Refreshing planner statistics...')
    cur.execute('ANALYZE companies')

    # Prove it is actually used, rather than just reporting that it was built.
    cur.execute("""
        EXPLAIN (FORMAT TEXT)
        SELECT count(*) FROM companies c
        WHERE (c.co_name_el ILIKE '%ORIGAMI%' OR c.co_titles_el::text ILIKE '%ORIGAMI%'
               OR c.email ILIKE '%ORIGAMI%' OR c.phone ILIKE '%ORIGAMI%'
               OR c.url ILIKE '%ORIGAMI%' OR c.afm ILIKE '%ORIGAMI%')
    """)
    plan = '\n'.join(r[0] for r in cur.fetchall())
    used = INDEX in plan
    seq = 'Seq Scan' in plan
    print(f'\nPlanner check on a real search-bar query:')
    print(f'  uses {INDEX}: {"YES" if used else "NO"}')
    print(f'  falls back to a seq scan   : {"YES — something is wrong" if seq else "no"}')

    conn.close()
    print('\nDone.' if used and not seq else '\nDone, but check the plan above.')


if __name__ == '__main__':
    main()
