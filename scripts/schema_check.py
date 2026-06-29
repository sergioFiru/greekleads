import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import os, psycopg2, psycopg2.extras, json
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

cur.execute("SELECT ar_gemi, co_name_el, capital FROM companies WHERE capital IS NOT NULL AND capital != 'null'::jsonb AND jsonb_typeof(capital) = 'array' AND jsonb_array_length(capital) > 0 LIMIT 1")
row = cur.fetchone()
if row:
    print("capital sample:", json.dumps(row["capital"], ensure_ascii=False)[:600])
else:
    print("capital: no non-empty arrays found, trying object type")
    cur.execute("SELECT ar_gemi, co_name_el, capital FROM companies WHERE capital IS NOT NULL AND capital != 'null'::jsonb LIMIT 2")
    for r in cur.fetchall():
        print(" ", r["co_name_el"], "->", json.dumps(r["capital"], ensure_ascii=False)[:300])

cur.execute("SELECT COUNT(*) as cnt FROM companies WHERE linkedin_url IS NOT NULL")
print("with linkedin_url:", cur.fetchone()["cnt"])

cur.execute("SELECT COUNT(*) as cnt FROM companies WHERE objective IS NOT NULL AND objective != ''")
print("with objective:", cur.fetchone()["cnt"])

cur.execute("SELECT ar_gemi, co_name_el, co_names_en FROM companies WHERE co_names_en IS NOT NULL AND co_names_en != 'null'::jsonb LIMIT 3")
for r in cur.fetchall():
    print("en name:", r["co_name_el"], "->", json.dumps(r["co_names_en"], ensure_ascii=False)[:150])

conn.close()
