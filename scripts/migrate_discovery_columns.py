"""
migrate_discovery_columns.py

Adds the columns the website-discovery layer needs:
  - discovered_url        text        — a website we found at the firm's email
                                        domain (ΓΕΜΗ's own `url` is left alone)
  - website_source        text        — 'discovered' marks a discovered_url
  - discovered_scanned_at timestamptz — stamped on every discovery ATTEMPT so the
                                        live bot never re-probes the same firm

Safe to run repeatedly (ADD COLUMN IF NOT EXISTS). Run from scripts/:
    python migrate_discovery_columns.py
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import os, psycopg2
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
conn.autocommit = True
cur = conn.cursor()

# Fail fast if the table is locked rather than queuing forever
cur.execute("SET lock_timeout = '5s'")

columns = [
    ("discovered_url",        "text"),
    ("website_source",        "text"),
    ("discovered_scanned_at", "timestamptz"),
]

for col, dtype in columns:
    print(f"  Adding {col} ...", end=" ", flush=True)
    try:
        cur.execute(f"ALTER TABLE companies ADD COLUMN IF NOT EXISTS {col} {dtype}")
        print("ok")
    except psycopg2.errors.LockNotAvailable:
        print("FAILED — table is locked, try again when traffic is lower")
        conn.close()
        sys.exit(1)

cur.execute("""
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'companies'
    AND column_name IN ('discovered_url','website_source','discovered_scanned_at')
    ORDER BY column_name
""")
print("\nDiscovery columns in schema:")
for row in cur.fetchall():
    print(f"  {row[0]}")

conn.close()
print("\nDone.")
