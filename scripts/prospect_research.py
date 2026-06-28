"""
prospect_research.py
Real prospect count for: selling cleaning packs to yachts/boats in Greece
"""
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import os
import psycopg2
import psycopg2.extras
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# 1. Discover all relevant KAD codes
print("=" * 70)
print("STEP 1 — KAD codes matching yacht / boat / marine / charter / sailing")
print("=" * 70)

keywords = [
    "ΣΚΑΦ", "ΝΑΥΤ", "ΠΛΟΙ", "ΘΑΛΑΣΣ", "CHARTER",
    "YACHT", "ΙΣΤΙΟΠΛΟ", "ΑΛΙΕ", "ΜΑΡΙΝ", "ΤΟΥΡΙΣΤ",
]

cur.execute("""
    SELECT primary_kad, COUNT(*) AS cnt
    FROM companies
    WHERE status_descr = 'Ενεργή'
      AND primary_kad IS NOT NULL
      AND (
        primary_kad ILIKE '%ΣΚΑΦ%' OR
        primary_kad ILIKE '%ΝΑΥΤ%' OR
        primary_kad ILIKE '%ΠΛΟΙ%' OR
        primary_kad ILIKE '%ΘΑΛΑΣΣ%' OR
        primary_kad ILIKE '%CHARTER%' OR
        primary_kad ILIKE '%YACHT%' OR
        primary_kad ILIKE '%ΙΣΤΙΟΠΛΟ%' OR
        primary_kad ILIKE '%ΑΛΙΕ%' OR
        primary_kad ILIKE '%ΜΑΡΙΝ%'
      )
    GROUP BY primary_kad
    ORDER BY cnt DESC
""")
rows = cur.fetchall()
total_direct = sum(r["cnt"] for r in rows)
print(f"\nTotal active companies across all marine KADs: {total_direct:,}\n")
for r in rows:
    print(f"  {r['cnt']:>5,}  {r['primary_kad'][:80]}")

# 2. Yacht charter specifically (the most direct)
print("\n" + "=" * 70)
print("STEP 2 — Yacht charter / boat rental (the core prospect)")
print("=" * 70)
cur.execute("""
    SELECT primary_kad, COUNT(*) AS cnt
    FROM companies
    WHERE status_descr = 'Ενεργή'
      AND primary_kad IS NOT NULL
      AND (
        primary_kad ILIKE '%ΕΝΟΙΚΙΑΣΗ%ΣΚΑΦ%' OR
        primary_kad ILIKE '%CHARTER%' OR
        primary_kad ILIKE '%YACHT%' OR
        primary_kad ILIKE '%ΕΚΜΙΣΘ%ΣΚΑΦ%' OR
        primary_kad ILIKE '%ΕΝΟΙΚΙΑΖ%ΣΚΑΦ%'
      )
    GROUP BY primary_kad
    ORDER BY cnt DESC
""")
charter = cur.fetchall()
for r in charter:
    print(f"  {r['cnt']:>5,}  {r['primary_kad'][:80]}")

# 3. Tourism operators with boats (also buy cleaning supplies)
print("\n" + "=" * 70)
print("STEP 3 — Sea tourism / excursion boats / water taxis")
print("=" * 70)
cur.execute("""
    SELECT primary_kad, COUNT(*) AS cnt
    FROM companies
    WHERE status_descr = 'Ενεργή'
      AND primary_kad IS NOT NULL
      AND (
        primary_kad ILIKE '%ΘΑΛΑΣΣ%ΤΟΥΡΙΣΜ%' OR
        primary_kad ILIKE '%ΤΟΥΡΙΣΤ%ΠΛΟΙ%' OR
        primary_kad ILIKE '%ΕΚΔΡΟΜ%ΠΛΟΙ%' OR
        primary_kad ILIKE '%ΥΔΑΤΟΔΡΟΜ%' OR
        primary_kad ILIKE '%ΘΑΛΑΣΣ%ΜΕΤΑΦΟΡ%'
      )
    GROUP BY primary_kad
    ORDER BY cnt DESC
""")
sea_tourism = cur.fetchall()
for r in sea_tourism:
    print(f"  {r['cnt']:>5,}  {r['primary_kad'][:80]}")

# 4. Fishing (trawlers, fishing boats — also use cleaning products)
print("\n" + "=" * 70)
print("STEP 4 — Fishing / fisheries (ΑΛΙΕ*)")
print("=" * 70)
cur.execute("""
    SELECT primary_kad, COUNT(*) AS cnt
    FROM companies
    WHERE status_descr = 'Ενεργή'
      AND primary_kad IS NOT NULL
      AND primary_kad ILIKE '%ΑΛΙΕ%'
    GROUP BY primary_kad
    ORDER BY cnt DESC
    LIMIT 10
""")
fishing = cur.fetchall()
total_fishing = sum(r["cnt"] for r in fishing)
print(f"Total fishing companies: {total_fishing:,}")
for r in fishing:
    print(f"  {r['cnt']:>5,}  {r['primary_kad'][:80]}")

# 5. Marina / port operators
print("\n" + "=" * 70)
print("STEP 5 — Marina / port operators")
print("=" * 70)
cur.execute("""
    SELECT primary_kad, COUNT(*) AS cnt
    FROM companies
    WHERE status_descr = 'Ενεργή'
      AND primary_kad IS NOT NULL
      AND (
        primary_kad ILIKE '%ΜΑΡΙΝ%' OR
        primary_kad ILIKE '%ΛΙΜΕΝ%' OR
        primary_kad ILIKE '%ΝΑΥΤΑΘΛ%'
      )
    GROUP BY primary_kad
    ORDER BY cnt DESC
""")
marinas = cur.fetchall()
for r in marinas:
    print(f"  {r['cnt']:>5,}  {r['primary_kad'][:80]}")

# 6. Geographic breakdown of yacht/charter companies
print("\n" + "=" * 70)
print("STEP 6 — Geographic distribution of marine/charter companies")
print("=" * 70)
cur.execute("""
    SELECT prefecture_descr, COUNT(*) AS cnt
    FROM companies
    WHERE status_descr = 'Ενεργή'
      AND primary_kad IS NOT NULL
      AND (
        primary_kad ILIKE '%ΣΚΑΦ%' OR
        primary_kad ILIKE '%ΝΑΥΤ%' OR
        primary_kad ILIKE '%ΠΛΟΙ%' OR
        primary_kad ILIKE '%ΘΑΛΑΣΣ%' OR
        primary_kad ILIKE '%CHARTER%' OR
        primary_kad ILIKE '%ΑΛΙΕ%'
      )
    GROUP BY prefecture_descr
    ORDER BY cnt DESC
    LIMIT 15
""")
geo = cur.fetchall()
for r in geo:
    print(f"  {r['cnt']:>5,}  {r['prefecture_descr']}")

# 7. With contact info
print("\n" + "=" * 70)
print("STEP 7 — Reachable subset (has email OR phone)")
print("=" * 70)
cur.execute("""
    SELECT COUNT(*) AS cnt
    FROM companies
    WHERE status_descr = 'Ενεργή'
      AND primary_kad IS NOT NULL
      AND (
        primary_kad ILIKE '%ΣΚΑΦ%' OR
        primary_kad ILIKE '%ΝΑΥΤ%' OR
        primary_kad ILIKE '%ΠΛΟΙ%' OR
        primary_kad ILIKE '%ΘΑΛΑΣΣ%' OR
        primary_kad ILIKE '%CHARTER%' OR
        primary_kad ILIKE '%ΑΛΙΕ%'
      )
      AND (
        (email IS NOT NULL AND email != '') OR
        (phone IS NOT NULL AND phone != '')
      )
""")
reachable = cur.fetchone()
print(f"  Has email or phone: {reachable['cnt']:,}")

cur.execute("""
    SELECT COUNT(*) AS cnt
    FROM companies
    WHERE status_descr = 'Ενεργή'
      AND primary_kad IS NOT NULL
      AND (
        primary_kad ILIKE '%ΣΚΑΦ%' OR
        primary_kad ILIKE '%ΝΑΥΤ%' OR
        primary_kad ILIKE '%ΠΛΟΙ%' OR
        primary_kad ILIKE '%ΘΑΛΑΣΣ%' OR
        primary_kad ILIKE '%CHARTER%' OR
        primary_kad ILIKE '%ΑΛΙΕ%'
      )
      AND email IS NOT NULL AND email != ''
""")
with_email = cur.fetchone()
print(f"  Has email only:     {with_email['cnt']:,}")

conn.close()
print("\nDone.")
