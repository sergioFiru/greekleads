#!/usr/bin/env python3
"""
Create a READ-ONLY Postgres role, for handing the MCP server to someone else.

WHY
---
The stdio MCP needs DATABASE_URL, and the one in scripts/.env connects as
`postgres` — a SUPERUSER. Giving that to another person gives them full write
access to the production database: they can DROP TABLE companies, by accident
or otherwise, and the website goes with it.

This role can SELECT and nothing else. The worst a holder can do is run a slow
query, which the MCP already caps with a statement timeout.

WHAT IT GRANTS
  CONNECT on the database
  USAGE   on schema public
  SELECT  on every existing table
  SELECT  on every table created LATER (via ALTER DEFAULT PRIVILEGES — without
          this, the role silently loses access to anything added afterwards,
          which would look like a broken MCP months from now)

It does NOT grant INSERT, UPDATE, DELETE, TRUNCATE, or any DDL.

USAGE
  python scripts/one_time/create_readonly_role.py            # dry run
  python scripts/one_time/create_readonly_role.py --apply
  python scripts/one_time/create_readonly_role.py --apply --rotate

--rotate changes the password of an existing role, which is how you revoke
access from someone later: rotate, and their copy stops working.
"""
import argparse
import os
import secrets
import sys
import urllib.parse

import psycopg2
from dotenv import load_dotenv

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding='utf-8')
    except (AttributeError, ValueError):
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(HERE, '..', '.env'))

ROLE = 'greekleads_readonly'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true', help='create it; without this, report only')
    ap.add_argument('--rotate', action='store_true',
                    help='generate a new password for an existing role (revokes old copies)')
    args = ap.parse_args()

    dsn = os.getenv('DATABASE_URL')
    if not dsn:
        sys.exit('DATABASE_URL not found in scripts/.env')

    conn = psycopg2.connect(dsn, connect_timeout=30)
    conn.autocommit = True
    cur = conn.cursor()

    cur.execute('SELECT 1 FROM pg_roles WHERE rolname = %s', (ROLE,))
    exists = cur.fetchone() is not None
    cur.execute('SELECT current_database()')
    dbname = cur.fetchone()[0]

    print(f'role {ROLE}: {"EXISTS" if exists else "missing"}')
    if exists and not args.rotate and args.apply:
        print('\n  Already there. Re-running only re-applies the grants (harmless).')
        print('  To issue a NEW password — which invalidates the old one — add --rotate.')

    if not args.apply:
        print('\nDRY RUN — would:')
        print(f'  CREATE ROLE {ROLE} LOGIN PASSWORD <generated>')
        print(f'  GRANT CONNECT ON DATABASE {dbname}')
        print('  GRANT USAGE ON SCHEMA public')
        print('  GRANT SELECT ON ALL TABLES IN SCHEMA public')
        print('  ALTER DEFAULT PRIVILEGES ... GRANT SELECT ON TABLES')
        print('\nRe-run with --apply.')
        conn.close()
        return

    password = None
    if not exists:
        password = secrets.token_urlsafe(24)
        cur.execute(f'CREATE ROLE {ROLE} LOGIN PASSWORD %s', (password,))
        print(f'  created {ROLE}')
    elif args.rotate:
        password = secrets.token_urlsafe(24)
        cur.execute(f'ALTER ROLE {ROLE} WITH PASSWORD %s', (password,))
        print(f'  rotated the password for {ROLE} — any copy using the old one stops working')

    cur.execute(f'GRANT CONNECT ON DATABASE {dbname} TO {ROLE}')
    cur.execute(f'GRANT USAGE ON SCHEMA public TO {ROLE}')
    cur.execute(f'GRANT SELECT ON ALL TABLES IN SCHEMA public TO {ROLE}')
    # Without this, tables created after today are invisible to the role and the
    # MCP starts failing on queries that used to work.
    cur.execute(f'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO {ROLE}')
    print('  grants applied (SELECT only, including future tables)')

    if password:
        parsed = urllib.parse.urlparse(dsn)
        host, port = parsed.hostname, parsed.port or 5432
        url = f'postgresql://{ROLE}:{urllib.parse.quote(password)}@{host}:{port}/{dbname}'
        print('\n' + '=' * 70)
        print('CONNECTION STRING — shown ONCE, it is not stored anywhere:')
        print(f'\n{url}\n')
        print('=' * 70)
        print('Send this to your friend over something private, not email.')
        print('To revoke later:  python scripts/one_time/create_readonly_role.py --apply --rotate')
    else:
        print('\n  No new password issued. Add --rotate if you need one.')

    # Prove the restriction rather than trusting the GRANTs were right.
    print('\nVerifying the role really is read-only...')
    cur.execute("""SELECT has_table_privilege(%s, 'companies', 'SELECT'),
                          has_table_privilege(%s, 'companies', 'INSERT'),
                          has_table_privilege(%s, 'companies', 'UPDATE'),
                          has_table_privilege(%s, 'companies', 'DELETE')""",
                (ROLE, ROLE, ROLE, ROLE))
    sel, ins, upd, dele = cur.fetchone()
    print(f'  SELECT {sel}   INSERT {ins}   UPDATE {upd}   DELETE {dele}')
    ok = sel and not (ins or upd or dele)
    print('  ' + ('OK — read-only.' if ok else '*** NOT read-only, do not share this ***'))

    conn.close()


if __name__ == '__main__':
    main()
