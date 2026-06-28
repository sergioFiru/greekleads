import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import os, psycopg2, psycopg2.extras
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Clean query — only KAD codes that are genuinely marine/boat related
# Excludes: ΕΚΣΚΑΦ (excavation catches ΣΚΑΦ), ΛΑΜΑΡΙΝ (sheet metal catches ΜΑΡΙΝ)
cur.execute("""
    SELECT primary_kad, COUNT(*) AS cnt
    FROM companies
    WHERE status_descr = 'Ενεργή'
      AND primary_kad IS NOT NULL
      AND (
        -- Boats & yachts
        primary_kad ILIKE '%ΣΚΑΦ%'
        OR primary_kad ILIKE '%YACHT%'
        OR primary_kad ILIKE '%ΙΣΤΙΟΠΛΟ%'
        -- Maritime / nautical (but not ΜΑΡΜΑΡΙΝΩΝ or ΛΑΜΑΡΙΝΩΝ)
        OR (primary_kad ILIKE '%ΝΑΥΤ%' AND primary_kad NOT ILIKE '%ΑΕΡΟΝΑΥΤ%')
        OR (primary_kad ILIKE '%ΠΛΟΙ%')
        OR (primary_kad ILIKE '%ΜΑΡΙΝ%' AND primary_kad NOT ILIKE '%ΛΑΜΑΡΙΝ%' AND primary_kad NOT ILIKE '%ΜΑΡΜΑΡΙΝ%')
        -- Sea / marine activity (not excavation, not tiles)
        OR (primary_kad ILIKE '%ΘΑΛΑΣΣ%')
        OR (primary_kad ILIKE '%ΑΛΙΕ%' AND primary_kad NOT ILIKE '%ΑΛΙΕΥΤΗΡΙ%')
        OR primary_kad ILIKE '%ΕΛΛΙΜΕΝ%'
        OR primary_kad ILIKE '%CHARTER%'
        OR primary_kad ILIKE '%ΚΡΟΥΑΖΙΕΡ%'
        OR primary_kad ILIKE '%ΥΔΑΤΟΔΡΟΜ%'
      )
      -- Exclude clear false positives
      AND primary_kad NOT ILIKE '%ΕΚΣΚΑΦ%'
      AND primary_kad NOT ILIKE '%ΑΕΡΟΣΚΑΦ%'
      AND primary_kad NOT ILIKE '%ΛΑΜΑΡΙΝΩΝ%'
      AND primary_kad NOT ILIKE '%ΜΑΡΜΑΡΙΝΩΝ%'
      AND primary_kad NOT ILIKE '%ΠΛΑΚΩΝ%'
      AND primary_kad NOT ILIKE '%ΣΩΛΗΝΩΣ%'
      AND primary_kad NOT ILIKE '%ΣΥΓΚΟΙΝΩΝΙΑΚ%'
      AND primary_kad NOT ILIKE '%ΑΕΡΟΠΛΑΝ%'
      AND primary_kad NOT ILIKE '%ΑΕΡΟΤΑ%'
    GROUP BY primary_kad
    ORDER BY cnt DESC
""")
rows = cur.fetchall()
total = sum(r["cnt"] for r in rows)
print(f"Total clean marine prospects: {total:,}\n")

# Tier breakdown
tier1_kw = ["ΕΝΟΙΚΙΑΣ", "CHARTER", "ΕΚΔΡΟΜ", "ΠΕΡΙΗΓ", "ΘΑΛΑΣΣΙΩΝ ΣΠΟΡ", "ΠΑΙΧΝΙΔΙΑ ΘΑΛΑΣΣ", "ΣΤΑΘΜΕΥΣ", "ΦΥΛΑΞ", "ΚΑΘΑΡΙΣΜ", "ΧΡΩΜΑΤΙΣΜ"]
tier2_kw = ["ΕΠΙΣΚΕΥ", "ΣΥΝΤΗΡ", "ΝΑΥΠΗΓ", "ΕΛΛΙΜΕΝ", "ΤΟΥΡΙΣΤΙΚΩΝ ΛΙΜΑΝ", "ΜΑΡΙΝ", "ΥΠΟΒΡΥΧ"]
tier3_kw = ["ΑΛΙΕ", "ΕΜΠΟΡΙΟ", "ΑΝΤΙΠΡΟΣΩΠ", "ΔΙΑΧΕΙΡ", "ΝΑΥΤΙΛ"]

t1, t2, t3 = 0, 0, 0
for r in rows:
    kad = r["primary_kad"]
    cnt = r["cnt"]
    if any(k in kad for k in tier1_kw):
        t1 += cnt
    elif any(k in kad for k in tier2_kw):
        t2 += cnt
    else:
        t3 += cnt

print(f"Tier 1 — Boat operators (charter, excursions, water sports, storage, cleaning): {t1:,}")
print(f"Tier 2 — Marine services (repair, shipyards, marinas): {t2:,}")
print(f"Tier 3 — Adjacent (fishing, traders, agents, management): {t3:,}")

# With contact info
cur.execute("""
    SELECT
      COUNT(*) FILTER (WHERE email IS NOT NULL AND email != '' OR phone IS NOT NULL AND phone != '') AS with_contact,
      COUNT(*) FILTER (WHERE email IS NOT NULL AND email != '') AS with_email
    FROM companies
    WHERE status_descr = 'Ενεργή'
      AND primary_kad IS NOT NULL
      AND (
        primary_kad ILIKE '%ΣΚΑΦ%' OR primary_kad ILIKE '%YACHT%' OR primary_kad ILIKE '%ΙΣΤΙΟΠΛΟ%'
        OR (primary_kad ILIKE '%ΝΑΥΤ%' AND primary_kad NOT ILIKE '%ΑΕΡΟΝΑΥΤ%')
        OR primary_kad ILIKE '%ΠΛΟΙ%'
        OR (primary_kad ILIKE '%ΜΑΡΙΝ%' AND primary_kad NOT ILIKE '%ΛΑΜΑΡΙΝ%' AND primary_kad NOT ILIKE '%ΜΑΡΜΑΡΙΝ%')
        OR primary_kad ILIKE '%ΘΑΛΑΣΣ%' OR primary_kad ILIKE '%ΑΛΙΕ%'
        OR primary_kad ILIKE '%ΕΛΛΙΜΕΝ%' OR primary_kad ILIKE '%CHARTER%'
        OR primary_kad ILIKE '%ΚΡΟΥΑΖΙΕΡ%' OR primary_kad ILIKE '%ΥΔΑΤΟΔΡΟΜ%'
      )
      AND primary_kad NOT ILIKE '%ΕΚΣΚΑΦ%' AND primary_kad NOT ILIKE '%ΑΕΡΟΣΚΑΦ%'
      AND primary_kad NOT ILIKE '%ΛΑΜΑΡΙΝΩΝ%' AND primary_kad NOT ILIKE '%ΜΑΡΜΑΡΙΝΩΝ%'
      AND primary_kad NOT ILIKE '%ΠΛΑΚΩΝ%' AND primary_kad NOT ILIKE '%ΣΩΛΗΝΩΣ%'
      AND primary_kad NOT ILIKE '%ΣΥΓΚΟΙΝΩΝΙΑΚ%' AND primary_kad NOT ILIKE '%ΑΕΡΟΠΛΑΝ%'
      AND primary_kad NOT ILIKE '%ΑΕΡΟΤΑ%'
""")
c = cur.fetchone()
print(f"\nWith email or phone: {c['with_contact']:,}")
print(f"With email only:     {c['with_email']:,}")
print(f"No contact info:     {total - c['with_contact']:,}")

# Top geographies
print("\nTop regions:")
cur.execute("""
    SELECT prefecture_descr, COUNT(*) AS cnt
    FROM companies
    WHERE status_descr = 'Ενεργή'
      AND primary_kad IS NOT NULL
      AND (
        primary_kad ILIKE '%ΣΚΑΦ%' OR primary_kad ILIKE '%YACHT%' OR primary_kad ILIKE '%ΙΣΤΙΟΠΛΟ%'
        OR (primary_kad ILIKE '%ΝΑΥΤ%' AND primary_kad NOT ILIKE '%ΑΕΡΟΝΑΥΤ%')
        OR primary_kad ILIKE '%ΠΛΟΙ%'
        OR (primary_kad ILIKE '%ΜΑΡΙΝ%' AND primary_kad NOT ILIKE '%ΛΑΜΑΡΙΝ%' AND primary_kad NOT ILIKE '%ΜΑΡΜΑΡΙΝ%')
        OR primary_kad ILIKE '%ΘΑΛΑΣΣ%' OR primary_kad ILIKE '%ΑΛΙΕ%'
        OR primary_kad ILIKE '%ΕΛΛΙΜΕΝ%' OR primary_kad ILIKE '%CHARTER%'
        OR primary_kad ILIKE '%ΚΡΟΥΑΖΙΕΡ%' OR primary_kad ILIKE '%ΥΔΑΤΟΔΡΟΜ%'
      )
      AND primary_kad NOT ILIKE '%ΕΚΣΚΑΦ%' AND primary_kad NOT ILIKE '%ΑΕΡΟΣΚΑΦ%'
      AND primary_kad NOT ILIKE '%ΛΑΜΑΡΙΝΩΝ%' AND primary_kad NOT ILIKE '%ΜΑΡΜΑΡΙΝΩΝ%'
      AND primary_kad NOT ILIKE '%ΠΛΑΚΩΝ%' AND primary_kad NOT ILIKE '%ΣΩΛΗΝΩΣ%'
      AND primary_kad NOT ILIKE '%ΣΥΓΚΟΙΝΩΝΙΑΚ%' AND primary_kad NOT ILIKE '%ΑΕΡΟΠΛΑΝ%'
      AND primary_kad NOT ILIKE '%ΑΕΡΟΤΑ%'
    GROUP BY prefecture_descr ORDER BY cnt DESC LIMIT 12
""")
for r in cur.fetchall():
    print(f"  {r['cnt']:>5,}  {r['prefecture_descr']}")

conn.close()
