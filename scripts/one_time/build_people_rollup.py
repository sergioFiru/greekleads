#!/usr/bin/env python3
"""
Build `people_rollup` — the most-connected people in the ΓΕΜΗ registry.

WHY A TABLE AND NOT A QUERY ON THE PAGE
---------------------------------------
Measured 2026-10-03 against the live DB: ranking people by distinct company
count takes **12,3 s of execution** (14,7 s wall), reading 595k pages and
spilling 292k temp blocks:

  Limit (actual time=12258..12313 rows=40)
    Buffers: shared hit=17844 read=595209, temp read=292689 written=292999
  Execution Time: 12353.924 ms

That cannot sit on a page render — a Vercel function would time out, and even
behind ISR the first regeneration after each revalidate would hang. Same
conclusion the statistics page reached: read a rollup, never the raw rows.

WHAT IT IS FOR
--------------
/people was reported by Search Console as "Page indexed without content": the
server-rendered HTML was 712 characters of nav, headline and three hardcoded
example names, because results only exist after someone types. This table gives
the page real content on first paint.

It also fixes a second, quieter problem. Person profiles at /people/[slug] are
NOT in any sitemap, and the only path to them is the client-rendered search box
— so Googlebot could not discover a single one. The rendered list is the first
set of real internal links into them.

SAFETY
  * Default run is a DRY RUN; nothing is written without --apply.
  * Creates the table if absent; the refresh is delete-then-insert inside one
    transaction, so a reader never sees a half-built list.
  * Excludes names with stray whitespace (115 of them). Their slug does not
    round-trip through encodeURIComponent -> exact match, so linking to one
    would be a link to a 404.

USAGE
  python scripts/one_time/build_people_rollup.py            # dry run
  python scripts/one_time/build_people_rollup.py --apply
  python scripts/one_time/build_people_rollup.py --apply --top 1000
"""
import argparse
import os
import sys
import threading
import time

import psycopg2
from dotenv import load_dotenv

HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(HERE, '..', '.env'))

DEFAULT_TOP = 500

DDL = """
CREATE TABLE IF NOT EXISTS people_rollup (
    person_name       text PRIMARY KEY,
    companies         integer     NOT NULL,
    active_companies  integer     NOT NULL,
    sample_company    text,
    built_at          timestamptz NOT NULL DEFAULT now()
)
"""
DDL_INDEX = """
CREATE INDEX IF NOT EXISTS people_rollup_companies_idx
    ON people_rollup (companies DESC)
"""

# One pass over company_persons joined to companies. `active_companies` lets the
# page say something truer than a raw total: somebody listed on 200 dissolved
# shells is not the same as somebody running 200 live firms.
SELECT_SQL = """
SELECT cp.person_name,
       count(DISTINCT cp.ar_gemi)::int                                        AS companies,
       count(DISTINCT cp.ar_gemi) FILTER (WHERE c.status_descr = 'Ενεργή')::int AS active_companies,
       (array_agg(c.co_name_el ORDER BY (c.status_descr = 'Ενεργή') DESC,
                                        c.co_name_el))[1]                     AS sample_company
FROM company_persons cp
-- The cast goes on company_persons, NOT on companies. Casting
-- c.ar_gemi::text makes the companies PRIMARY KEY unusable and the planner
-- falls back to a parallel seq scan over 703.399 rows (measured 1,97s vs
-- 0,39s on a single surname). Fixing it here took the run from ~14,7s to ~10s
-- -- worth having, but NOT the bulk of the cost: this query groups over all
-- 2,1M rows, and that GROUP BY and sort is what dominates. The rollup table
-- earns its place either way.
JOIN companies c ON c.ar_gemi = cp.ar_gemi::bigint
WHERE cp.person_name IS NOT NULL
  AND cp.person_name <> ''
  AND cp.person_name = btrim(cp.person_name)
GROUP BY cp.person_name
ORDER BY companies DESC
LIMIT %s
"""


def spinner(label, stop):
    """The ranking query gives no progress events, so show elapsed time."""
    frames = '|/-\\'
    t0 = time.time()
    i = 0
    while not stop.is_set():
        el = int(time.time() - t0)
        sys.stdout.write(f"\r  {frames[i % 4]} {label}... {el // 60:02d}:{el % 60:02d} elapsed")
        sys.stdout.flush()
        i += 1
        time.sleep(0.25)
    el = int(time.time() - t0)
    sys.stdout.write(f"\r  * {label}... done in {el // 60:02d}:{el % 60:02d}        \n")
    sys.stdout.flush()


def bar(done, total, label='', width=38):
    frac = 0.0 if not total else min(1.0, done / total)
    full = int(frac * width)
    sys.stdout.write("\r  [{}{}] {:5.1f}%  {:>6,}/{:<6,} {}".format(
        '#' * full, '.' * (width - full), frac * 100, done, total, label[:30]))
    sys.stdout.flush()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='write; without it, report only')
    ap.add_argument('--top', type=int, default=DEFAULT_TOP,
                    help=f'how many people to keep (default {DEFAULT_TOP})')
    args = ap.parse_args()

    dsn = os.getenv('DATABASE_URL')
    if not dsn:
        sys.exit('DATABASE_URL not found in scripts/.env')

    print('Connecting...')
    conn = psycopg2.connect(dsn, connect_timeout=30)
    conn.autocommit = False
    cur = conn.cursor()

    print('APPLY — the table will be rebuilt' if args.apply
          else 'DRY RUN — nothing will be written')
    print(f'Keeping the top {args.top:,} people by company count.\n')

    if args.apply:
        cur.execute(DDL)
        cur.execute(DDL_INDEX)
        conn.commit()
        print('  table ready')

    stop = threading.Event()
    t = threading.Thread(target=spinner, args=('ranking people (expect ~15s)', stop), daemon=True)
    t.start()
    try:
        cur.execute(SELECT_SQL, (args.top,))
        rows = cur.fetchall()
    finally:
        stop.set()
        t.join()

    print(f"\n  {len(rows):,} people ranked\n")
    print('  Top 10:')
    for name, n, active, sample in rows[:10]:
        print(f"    {n:>4} ({active:>4} ενεργές)  {name[:36]:38s} {(sample or '')[:34]}")

    if not args.apply:
        print('\n  DRY RUN — nothing written. Re-run with --apply to commit.')
        conn.close()
        return

    # Delete-then-insert in ONE transaction: a reader must never catch the table
    # empty or half-filled.
    print()
    cur.execute('DELETE FROM people_rollup')
    for i, (name, n, active, sample) in enumerate(rows, start=1):
        cur.execute(
            """INSERT INTO people_rollup
                   (person_name, companies, active_companies, sample_company, built_at)
               VALUES (%s, %s, %s, %s, now())""",
            (name, n, active, sample),
        )
        if i % 25 == 0 or i == len(rows):
            bar(i, len(rows), 'inserting')
    conn.commit()
    print(f"\n\n  Written: {len(rows):,} rows.")
    conn.close()


if __name__ == '__main__':
    main()
