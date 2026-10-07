#!/usr/bin/env python3
"""
Create `scout_usage` — the anonymous quota counter for /api/scout.

WHY IT EXISTS
-------------
/api/scout was completely open: no auth check, and not in the Clerk middleware
matcher. Every call runs a brief through Gemini via OpenRouter, so an open
endpoint is not just an abuse surface, it is a direct bill. The site now takes
organic traffic.

The gate is "one free run, then sign up", which needs a counter that survives a
visitor clearing their cookies — so it is server-side, not localStorage.

WHY POSTGRES AND NOT MEMORY
---------------------------
Vercel runs the route as serverless functions across many instances; an
in-process counter would reset constantly and count a fraction of real usage.
There is no KV store in this stack, and the database is already a dependency of
every request on this route.

WHY A HASH AND NOT THE IP
-------------------------
An IP address is personal data under GDPR. We never need to know WHICH address
ran a brief, only whether THIS one has already had its free run today, and a
salted SHA-256 answers that without storing anything identifying. The salt lives
in SCOUT_IP_SALT; changing it resets every counter, which is a safe failure.

Rows expire by date, so the table stays small — one row per distinct visitor per
day — and old days can be deleted whenever.

USAGE
  python scripts/one_time/create_scout_usage_table.py            # dry run
  python scripts/one_time/create_scout_usage_table.py --apply
"""
import argparse
import os
import sys

import psycopg2
from dotenv import load_dotenv

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding='utf-8')
    except (AttributeError, ValueError):
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(HERE, '..', '.env'))

DDL = [
    ("scout_usage table", """
        CREATE TABLE IF NOT EXISTS scout_usage (
            ip_hash    text    NOT NULL,
            day        date    NOT NULL,
            runs       integer NOT NULL DEFAULT 0,
            first_seen timestamptz NOT NULL DEFAULT now(),
            last_seen  timestamptz NOT NULL DEFAULT now(),
            PRIMARY KEY (ip_hash, day)
        )
    """),
    # Makes "delete everything older than N days" an index scan rather than a
    # sequential one once this table has a year of traffic in it.
    ("day index", """
        CREATE INDEX IF NOT EXISTS scout_usage_day_idx ON scout_usage (day)
    """),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='create it; without this, report only')
    args = ap.parse_args()

    dsn = os.getenv('DATABASE_URL')
    if not dsn:
        sys.exit('DATABASE_URL not found in scripts/.env')

    conn = psycopg2.connect(dsn, connect_timeout=30)
    conn.autocommit = False
    cur = conn.cursor()

    cur.execute("SELECT to_regclass('public.scout_usage')")
    exists = cur.fetchone()[0] is not None
    print(f"scout_usage currently: {'EXISTS' if exists else 'missing'}")

    if not args.apply:
        print('\nDRY RUN — would run:')
        for name, _ in DDL:
            print(f'  - {name}')
        print('\nRe-run with --apply to create it.')
        conn.close()
        return

    for name, sql in DDL:
        cur.execute(sql)
        print(f'  ok  {name}')
    conn.commit()

    cur.execute("SELECT count(*) FROM scout_usage")
    print(f"\nDone. Rows: {cur.fetchone()[0]:,}")
    print('\nSet SCOUT_IP_SALT in .env.local and in Vercel — any long random')
    print('string. Without it the route falls back to a build-time default and')
    print('logs a warning; the gate still works, the hashes are just weaker.')
    conn.close()


if __name__ == '__main__':
    main()
