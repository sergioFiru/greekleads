import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import os, psycopg2, psycopg2.extras
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

cur.execute("SELECT COUNT(DISTINCT primary_kad) AS total FROM companies WHERE primary_kad IS NOT NULL")
print("Total distinct KADs:", cur.fetchone()["total"])

scenarios = [
    ("S4 industrial", ["ΒΙΟΜΗΧΑΝ","ΠΑΡΑΓΩΓ","ΜΕΤΑΛΛ","ΧΗΜΙΚ","ΤΡΟΦΙΜ","ΠΛΑΣΤΙΚ","ΚΛΩΣΤ"]),
    ("S5 retail",     ["ΛΙΑΝΙΚ","ΗΛΕΚΤΡΟΝ","ΕΜΠΟΡΙΟ","ΚΑΤΑΣΤΗΜ"]),
    ("S3 F&B",        ["ΕΣΤΙΑΤ","ΚΑΦΕ","ΕΠΙΣΙΤΙΣ","ΕΣΤΙΑΣΗ","ΤΑΒΕΡΝ","ΜΠΑΡ"]),
    ("S3+RETAIL",     ["ΕΣΤΙΑΤ","ΚΑΦΕ","ΕΠΙΣΙΤΙΣ","ΕΣΤΙΑΣΗ","ΤΑΒΕΡΝ","ΜΠΑΡ","ΛΙΑΝΙΚ","ΕΜΠΟΡΙΟ"]),
]

for label, kw in scenarios:
    parts = [f"primary_kad ILIKE '%{k}%'" for k in kw]
    cond = " OR ".join(parts)
    cur.execute(f"SELECT COUNT(DISTINCT primary_kad) AS cnt FROM companies WHERE primary_kad IS NOT NULL AND ({cond})")
    n = cur.fetchone()["cnt"]
    print(f"{label}: {n} distinct KADs  {'<-- hits 150 LIMIT' if n > 150 else ''}")

conn.close()
