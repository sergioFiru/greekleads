#!/usr/bin/env python3
"""
Index for «Ίδρυση (νεότερα)» — newest companies first.

THE PROBLEM
-----------
add_sort_indexes.py fixed the default order and the name order. The DATE order
was left behind, and it is the one a prospector actually wants: new companies
are new prospects.

Measured 2026-10-08, page 1 over active companies:

    social (default)   0,19s   index order
    name A-Z           0,19s   index order
    newest first       1,06s   STILL SORTING

companies already has TWO indexes on incorporation_date — and neither helps:

    idx_companies_incorporation        (incorporation_date)
    idx_companies_incorporation_date   (incorporation_date)

They are identical to each other, so one is pure waste. More importantly a
plain btree is ASC NULLS LAST, and reading it backwards yields
DESC NULLS FIRST — which is not what `ORDER BY incorporation_date DESC NULLS
LAST` asks for, so Postgres sorts anyway. Neither index can serve either
direction here, because neither carries ar_gemi as the tie-breaker.

Proved on a 50.000-row sample inside a rolled-back transaction before writing
this: with a DESC NULLS LAST index the Sort step disappears.

Run from the repo root:  python tools/add_date_sort_index.py

Optional cleanup, OFF by default because dropping an index on a live database
is destructive:

  python tools/add_date_sort_index.py --drop-duplicates

That removes idx_companies_incorporation (keeping idx_companies_incorporation_date,
which other code may name) plus idx_companies_co_name_el_trgm, which is byte
for byte the same as idx_companies_co_name_trgm. Both are disk and write cost
on 1,69M rows for no query benefit.
"""
import argparse
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

INDEX = 'idx_companies_date_sort'
DUPLICATES = ['idx_companies_incorporation', 'idx_companies_co_name_el_trgm']


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
    ap = argparse.ArgumentParser()
    ap.add_argument('--drop-duplicates', action='store_true',
                    help='also drop two indexes that duplicate others exactly')
    args = ap.parse_args()

    conn = psycopg2.connect(DSN, connect_timeout=30)
    conn.autocommit = True      # CONCURRENTLY cannot run in a transaction
    cur = conn.cursor()

    cur.execute("""SELECT c.relname FROM pg_class c JOIN pg_index i ON i.indexrelid = c.oid
                   WHERE c.relname = %s AND NOT i.indisvalid""", (INDEX,))
    if cur.fetchone():
        print(f'  {INDEX} exists but is INVALID — an earlier run was interrupted.')
        print(f'  Drop it first:  DROP INDEX {INDEX};')
        conn.close()
        sys.exit(1)

    print('Building the date-sort index CONCURRENTLY — writes keep working.\n')
    stop = threading.Event()
    t = threading.Thread(target=spinner, args=(INDEX, stop), daemon=True)
    t.start()
    try:
        cur.execute(
            f'CREATE INDEX CONCURRENTLY IF NOT EXISTS {INDEX} '
            f'ON companies (incorporation_date DESC NULLS LAST, ar_gemi)')
    finally:
        stop.set()
        t.join()

    cur.execute('SELECT pg_size_pretty(pg_relation_size(%s))', (INDEX,))
    print(f'\n  {INDEX}: {cur.fetchone()[0]}')

    print('Refreshing planner statistics...')
    cur.execute('ANALYZE companies')

    cur.execute("""EXPLAIN SELECT ar_gemi FROM companies
                   WHERE status_descr = 'Ενεργή'
                   ORDER BY incorporation_date DESC NULLS LAST, ar_gemi LIMIT 50""")
    plan = '\n'.join(r[0] for r in cur.fetchall())
    print(f'\nPlanner check — newest first: '
          f'{"STILL SORTING" if "Sort" in plan else "index order, fixed"}')

    if args.drop_duplicates:
        print('\nDropping exact duplicates:')
        for name in DUPLICATES:
            cur.execute('SELECT 1 FROM pg_class WHERE relname = %s', (name,))
            if not cur.fetchone():
                print(f'  {name:34s} already gone')
                continue
            cur.execute('SELECT pg_size_pretty(pg_relation_size(%s))', (name,))
            size = cur.fetchone()[0]
            # CONCURRENTLY so no query waits on an ACCESS EXCLUSIVE lock.
            cur.execute(f'DROP INDEX CONCURRENTLY IF EXISTS {name}')
            print(f'  {name:34s} dropped ({size} reclaimed)')
    else:
        print('\nTwo indexes duplicate others exactly and are pure disk + write cost:')
        for name in DUPLICATES:
            cur.execute('SELECT pg_size_pretty(pg_relation_size(%s))', (name,))
            r = cur.fetchone()
            if r:
                print(f'  {name:34s} {r[0]}')
        print('  Re-run with --drop-duplicates to remove them.')

    conn.close()
    print('\nDone.')


if __name__ == '__main__':
    main()
