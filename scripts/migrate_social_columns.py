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
    ("instagram_url", "text"),
    ("facebook_url",  "text"),
    ("twitter_url",   "text"),
    ("tiktok_url",    "text"),
    ("youtube_url",   "text"),
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
    AND column_name IN ('linkedin_url','instagram_url','facebook_url','twitter_url','tiktok_url','youtube_url')
    ORDER BY column_name
""")
print("\nSocial columns in schema:")
for row in cur.fetchall():
    print(f"  {row[0]}")

conn.close()
print("\nDone.")
