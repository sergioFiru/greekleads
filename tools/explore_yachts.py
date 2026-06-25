"""Quick probe — find all yacht/boat-related KAD descriptions in DB."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
from dotenv import load_dotenv
import psycopg2
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "scripts", ".env"))

conn = psycopg2.connect(os.getenv("DATABASE_URL"), connect_timeout=30)
cur = conn.cursor()

keywords = [
    "σκάφ", "ναύλ", "ιστιοπλο", "θαλαμηγ", "μαρίν", "marina",
    "αναψυχ", "yacht", "yachting", "εκναύλ", "πλοιάρ", "βάρκ",
    "τουριστικ πλο", "ιστιοφόρ", "μηχανοκίνητ σκαφ", "ενοικίαση σκαφ",
]

print("Scanning all primary KAD descriptions for yacht/boat terms...\n")

for kw in keywords:
    cur.execute("""
        SELECT elem->'activity'->>'descr' AS descr, COUNT(*) AS cnt
        FROM companies,
             LATERAL jsonb_array_elements(activities) AS elem
        WHERE elem->>'type' = 'Κύρια'
          AND lower(elem->'activity'->>'descr') LIKE %s
        GROUP BY descr
        ORDER BY cnt DESC
    """, (f"%{kw.lower()}%",))
    rows = cur.fetchall()
    if rows:
        print(f"── keyword: '{kw}' ──")
        for descr, cnt in rows:
            print(f"  [{cnt:>5}]  {descr}")
        print()

cur.close()
conn.close()
print("Done.")
