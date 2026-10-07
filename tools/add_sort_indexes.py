#!/usr/bin/env python3
"""
Indexes for the /search result ordering.

WHY
---
The result list is ordered by a COMPUTED social score — how many of the six
social columns are non-null. No ordinary index can serve a computed expression,
so Postgres was building the score for every matching row and sorting all of
them to show 50:

    ORDER BY ar_gemi        0,36s     <- index order, stops early
    ORDER BY social score   1,61s     <- computes and sorts everything

Verified on a 50.000-row sample before writing this: Postgres accepts an index
on that exact expression (every part of it is IMMUTABLE), the planner uses it
for the ORDER BY, and the plan loses its Sort step entirely — it reads in index
order.

The sort dropdown also became real on 2026-10-07. It used to sort client-side
over the 50 rows already on screen, which looked like a global sort and was not.
Sorting by name now needs a btree on co_name_el: the two GIN trigram indexes on
that column serve ILIKE, and cannot serve ORDER BY.

WHAT IT CREATES
  idx_companies_social_sort   the social score, matching the ORDER BY exactly
  idx_companies_co_name_sort  btree on co_name_el, for «Όνομα (A → Ω)»

incorporation_date already has a btree, so the founding-date orders are covered.

Run from the repo root:  python tools/add_sort_indexes.py

CONCURRENTLY, so writes are never blocked. Safe to re-run (IF NOT EXISTS), and
it refuses to proceed over an INVALID index left by an interrupted build —
IF NOT EXISTS would otherwise skip it and report success while the planner kept
ignoring it.
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

SOCIAL_EXPR = """((instagram_url IS NOT NULL)::int + (facebook_url IS NOT NULL)::int
                + (linkedin_url IS NOT NULL)::int + (twitter_url IS NOT NULL)::int
                + (tiktok_url IS NOT NULL)::int + (youtube_url IS NOT NULL)::int)"""

STEPS = [
    ('idx_companies_social_sort',
     f'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_social_sort '
     f'ON companies (({SOCIAL_EXPR}) DESC, ar_gemi)'),
    ('idx_companies_co_name_sort',
     'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_co_name_sort '
     'ON companies (co_name_el, ar_gemi)'),
]


def spinner(label, stop):
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
    conn.autocommit = True        # CONCURRENTLY cannot run in a transaction
    cur = conn.cursor()

    names = [n for n, _ in STEPS]
    cur.execute("""
        SELECT c.relname FROM pg_class c
        JOIN pg_index i ON i.indexrelid = c.oid
        WHERE c.relname = ANY(%s) AND NOT i.indisvalid
    """, (names,))
    invalid = [r[0] for r in cur.fetchall()]
    if invalid:
        print('\n  These exist but are INVALID (an earlier run was interrupted):')
        for n in invalid:
            print(f'    DROP INDEX {n};')
        conn.close()
        sys.exit(1)

    print(f'\nBuilding {len(STEPS)} index(es) CONCURRENTLY — writes keep working.\n')
    for label, sql in STEPS:
        stop = threading.Event()
        t = threading.Thread(target=spinner, args=(label, stop), daemon=True)
        t.start()
        try:
            cur.execute(sql)
        finally:
            stop.set()
            t.join()

    print()
    for n in names:
        cur.execute('SELECT pg_size_pretty(pg_relation_size(%s))', (n,))
        print(f'  {n:30s} {cur.fetchone()[0]}')

    print('\nRefreshing planner statistics...')
    cur.execute('ANALYZE companies')

    # Report rather than assume: an index that exists but is not chosen is
    # just disk.
    checks = [
        ('default social order', f"""
            EXPLAIN SELECT ar_gemi FROM companies
            WHERE status_descr = 'Ενεργή'
            ORDER BY ({SOCIAL_EXPR}) DESC, ar_gemi LIMIT 50"""),
        ('name order', """
            EXPLAIN SELECT ar_gemi FROM companies
            WHERE status_descr = 'Ενεργή'
            ORDER BY co_name_el ASC, ar_gemi LIMIT 50"""),
    ]
    print('\nPlanner check:')
    for label, sql in checks:
        cur.execute(sql)
        plan = '\n'.join(r[0] for r in cur.fetchall())
        sort = 'Sort' in plan
        print(f'  {label:22s} sort step: {"STILL SORTING" if sort else "none — reads in index order"}')

    conn.close()
    print('\nDone.')


if __name__ == '__main__':
    main()
