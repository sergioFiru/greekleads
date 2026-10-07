#!/usr/bin/env python3
"""
Trim leading/trailing whitespace from company_persons.person_name.

WHY IT MATTERS
--------------
A person's page is /people/<encodeURIComponent(person_name)> and the route does
an EXACT match on the decoded slug. A trailing space survives encoding as %20,
so the URL is built correctly and then matches nothing: the profile 404s and is
unreachable by any route in the product. The MCP server and the /people
directory both exclude these names for that reason.

Measured 2026-10-07: 115 rows, 115 distinct names.

MERGES
------
7 of the 115 trim onto a name that ALREADY exists untrimmed. That is a merge,
not a rename — and it is the correct outcome, because 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΕΩΡΓΙΟΣ '
and 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΕΩΡΓΙΟΣ' are one human whose roles were split across two
spellings. After this they appear as one person with their company count
summed, which is what the registry means.

WHAT THIS DOES NOT TOUCH
------------------------
43.671 names contain INTERNAL double spaces (e.g. 'ΚΑΡΑΙΣΚΟΣ  ΝΙΚΟΛΑΟΣ').
btrim does not affect those and this script deliberately leaves them alone:
they still resolve, so nothing is broken, and collapsing internal whitespace
would change tens of thousands of slugs and merge names on a much larger scale.
That is a product decision, not a cleanup.

USAGE
  python scripts/one_time/fix_person_name_whitespace.py           # dry run
  python scripts/one_time/fix_person_name_whitespace.py --apply
"""
import argparse
import os
import sys

import psycopg2
from dotenv import load_dotenv

# The Windows console is cp1252 and cannot encode Greek; without this the
# script does its work and then dies on the summary, which reads as a failure.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding='utf-8')
    except (AttributeError, ValueError):
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(HERE, '..', '.env'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='write; without it, report only')
    args = ap.parse_args()

    dsn = os.getenv('DATABASE_URL')
    if not dsn:
        sys.exit('DATABASE_URL not found in scripts/.env')

    conn = psycopg2.connect(dsn, connect_timeout=30)
    conn.autocommit = False
    cur = conn.cursor()

    print('APPLY — rows will be written' if args.apply else 'DRY RUN — nothing will be written')

    cur.execute("""SELECT count(*), count(DISTINCT person_name)
                     FROM company_persons
                    WHERE person_name <> btrim(person_name)""")
    rows, names = cur.fetchone()
    print(f'\n  rows to fix     : {rows:,}')
    print(f'  distinct names  : {names:,}')

    cur.execute("""
        SELECT count(*) FROM (
            SELECT DISTINCT btrim(cp.person_name) AS t
            FROM company_persons cp
            WHERE cp.person_name <> btrim(cp.person_name)
              AND EXISTS (SELECT 1 FROM company_persons o
                          WHERE o.person_name = btrim(cp.person_name))
        ) x
    """)
    print(f'  ...merging into an existing name: {cur.fetchone()[0]:,}')

    if rows == 0:
        print('\n  Nothing to do.')
        conn.close()
        return

    cur.execute("""SELECT DISTINCT person_name FROM company_persons
                    WHERE person_name <> btrim(person_name) LIMIT 10""")
    print('\n  Samples (quoted so the whitespace shows):')
    for (n,) in cur.fetchall():
        print(f"    '{n}'  ->  '{n.strip()}'")

    if not args.apply:
        print('\n  DRY RUN — nothing written. Re-run with --apply to commit.')
        conn.close()
        return

    # Small enough for one statement; no batching or progress bar needed.
    cur.execute("""UPDATE company_persons
                      SET person_name = btrim(person_name)
                    WHERE person_name <> btrim(person_name)""")
    written = cur.rowcount
    conn.commit()
    print(f'\n  Written: {written:,} rows.')

    cur.execute("""SELECT count(*) FROM company_persons
                    WHERE person_name <> btrim(person_name)""")
    print(f'  Remaining mismatched: {cur.fetchone()[0]:,} (expect 0)')
    print('\n  Re-run scripts/one_time/build_people_rollup.py --apply so the')
    print('  /people directory picks up any newly reachable profiles.')
    conn.close()


if __name__ == '__main__':
    main()
