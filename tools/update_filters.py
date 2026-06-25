#!/usr/bin/env python3
"""
Regenerate web/lib/filters.json with ALL distinct KAD activities.
Run from the repo root:  python tools/update_filters.py
"""
import os, sys, json
import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'scripts', '.env'))
DSN = os.getenv('DATABASE_URL')
if not DSN:
    sys.exit("DATABASE_URL not found in scripts/.env")

OUT = os.path.join(os.path.dirname(__file__), '..', 'web', 'lib', 'filters.json')

print("Connecting to DB...")
conn = psycopg2.connect(DSN, connect_timeout=30)
cur = conn.cursor()

print("Querying statuses...")
cur.execute("SELECT DISTINCT status_descr FROM companies WHERE status_descr IS NOT NULL ORDER BY status_descr")
statuses = [r[0] for r in cur.fetchall()]

print("Querying prefectures...")
cur.execute("SELECT DISTINCT prefecture_descr FROM companies WHERE prefecture_descr IS NOT NULL ORDER BY prefecture_descr")
prefectures = [r[0] for r in cur.fetchall()]

print("Querying legal types...")
cur.execute("""
    SELECT legal_type_descr FROM (
        SELECT legal_type_descr, COUNT(*) AS cnt
        FROM companies WHERE legal_type_descr IS NOT NULL
        GROUP BY legal_type_descr ORDER BY cnt DESC
    ) sub ORDER BY legal_type_descr
""")
legal_types = [r[0] for r in cur.fetchall()]

print("Querying ALL activities from primary_kad column...")
cur.execute("""
    SELECT DISTINCT primary_kad
    FROM companies
    WHERE primary_kad IS NOT NULL AND primary_kad != ''
    ORDER BY primary_kad
""")
activities = [r[0] for r in cur.fetchall()]

conn.close()

data = {
    "statuses": statuses,
    "prefectures": prefectures,
    "legal_types": legal_types,
    "activities": activities,
}

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"\nDone — {OUT}")
print(f"  {len(statuses)} statuses")
print(f"  {len(prefectures)} prefectures")
print(f"  {len(legal_types)} legal types")
print(f"  {len(activities)} activities  ← was 500, now all of them")
