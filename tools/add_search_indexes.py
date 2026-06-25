#!/usr/bin/env python3
"""
Add trigram indexes on email, phone, url, afm for fast multi-field search.
Run from the repo root:  python tools/add_search_indexes.py
"""
import os, sys
import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'scripts', '.env'))
DSN = os.getenv('DATABASE_URL')
if not DSN:
    sys.exit("DATABASE_URL not found in scripts/.env")

INDEXES = [
    ("pg_trgm extension",       "CREATE EXTENSION IF NOT EXISTS pg_trgm"),
    ("email trigram index",     "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_email_trgm ON companies USING GIN (email gin_trgm_ops)"),
    ("phone trigram index",     "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_phone_trgm ON companies USING GIN (phone gin_trgm_ops)"),
    ("url trigram index",       "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_url_trgm  ON companies USING GIN (url  gin_trgm_ops)"),
    ("afm trigram index",       "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_companies_afm_trgm  ON companies USING GIN (afm  gin_trgm_ops)"),
]

print("Connecting to DB...")
conn = psycopg2.connect(DSN, connect_timeout=30)
conn.autocommit = True  # CONCURRENTLY requires autocommit
cur = conn.cursor()

for label, sql in INDEXES:
    print(f"  → {label}...", end=" ", flush=True)
    cur.execute(sql)
    print("done")

conn.close()
print("\nAll indexes created. Multi-field search is now fast.")
