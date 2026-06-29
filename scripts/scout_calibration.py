import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import os, psycopg2, psycopg2.extras
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def count_with_keywords(keywords, extra_conds=None):
    kw_cond = " OR ".join(f"primary_kad ILIKE '%{k}%'" for k in keywords)
    where = f"status_descr = 'Ενεργή' AND primary_kad IS NOT NULL AND ({kw_cond})"
    if extra_conds:
        where += f" AND {extra_conds}"
    cur.execute(f"SELECT COUNT(*) AS cnt FROM companies WHERE {where}")
    return cur.fetchone()["cnt"]

def top_kads(keywords, limit=12):
    kw_cond = " OR ".join(f"primary_kad ILIKE '%{k}%'" for k in keywords)
    cur.execute(f"""
        SELECT primary_kad, COUNT(*) AS cnt FROM companies
        WHERE status_descr = 'Ενεργή' AND primary_kad IS NOT NULL AND ({kw_cond})
        GROUP BY primary_kad ORDER BY cnt DESC LIMIT {limit}
    """)
    return cur.fetchall()

SEP = "=" * 65

# ── SCENARIO 1: Accounting software ─────────────────────────
print(SEP)
print("S1: πουλάω λογισμικό διαχείρισης σε λογιστικά γραφεία")
print(SEP)
ideal_kw = ["ΛΟΓΙΣΤ", "ΦΟΡΟΤΕΧΝ", "ΕΛΕΓΚΤ", "ΟΡΚΩΤ"]
print(f"Ideal keywords: {ideal_kw}")
print(f"Ideal count:    {count_with_keywords(ideal_kw):,}")
print("Top KADs:")
for r in top_kads(ideal_kw): print(f"  {r['cnt']:>6,}  {r['primary_kad'][:70]}")

# ── SCENARIO 2: Hotel renovation ────────────────────────────
print(f"\n{SEP}")
print("S2: πουλάω ανακαίνιση και επίπλωση σε ξενοδοχεία και καταλύματα")
print(SEP)
ideal_kw = ["ΞΕΝΟΔΟΧ", "ΚΑΤΑΛΥΜ", "ΕΝΟΙΚΙΑΖ", "ΤΟΥΡΙΣΜ", "RESORT"]
print(f"Ideal keywords: {ideal_kw}")
print(f"Ideal count:    {count_with_keywords(ideal_kw):,}")
print("Top KADs:")
for r in top_kads(ideal_kw): print(f"  {r['cnt']:>6,}  {r['primary_kad'][:70]}")

# ── SCENARIO 3: Coffee + consumables in Thessaloniki ────────
print(f"\n{SEP}")
print("S3: πουλάω καφέ και αναλώσιμα σε εστιατόρια στη Θεσσαλονίκη")
print(SEP)
ideal_kw = ["ΕΣΤΙΑΤ", "ΚΑΦΕ", "ΕΠΙΣΙΤΙΣ", "ΕΣΤΙΑΣΗ", "ΤΑΒΕΡΝ", "ΜΠΑΡ"]
print(f"Ideal keywords: {ideal_kw}")
print(f"Ideal count (all GR): {count_with_keywords(ideal_kw):,}")
print(f"Ideal count (Thessaloniki only): {count_with_keywords(ideal_kw, 'prefecture_descr = ' + chr(39) + 'ΘΕΣΣΑΛΟΝΙΚΗΣ' + chr(39)):,}")
print("Top KADs:")
for r in top_kads(ideal_kw): print(f"  {r['cnt']:>6,}  {r['primary_kad'][:70]}")

# ── SCENARIO 4: Solar panels for industry ───────────────────
print(f"\n{SEP}")
print("S4: πουλάω φωτοβολταϊκά σε βιομηχανίες και μεγάλες επιχειρήσεις")
print(SEP)
ideal_kw = ["ΒΙΟΜΗΧΑΝ", "ΠΑΡΑΓΩΓ", "ΜΕΤΑΛΛ", "ΧΗΜΙΚ", "ΤΡΟΦΙΜ", "ΠΛΑΣΤΙΚ", "ΧΑΡΤ", "ΚΛΩΣΤ"]
print(f"Ideal keywords: {ideal_kw}")
print(f"Ideal count:    {count_with_keywords(ideal_kw):,}")
print("Top KADs:")
for r in top_kads(ideal_kw, 8): print(f"  {r['cnt']:>6,}  {r['primary_kad'][:70]}")
# Also show what ΦΩΤΟΒΟΛΤ alone gives (what the agent might do)
cur.execute("SELECT COUNT(*) AS cnt FROM companies WHERE status_descr='Ενεργή' AND primary_kad ILIKE '%ΦΩΤΟΒΟΛΤ%'")
print(f"  (ΦΩΤΟΒΟΛΤ alone = {cur.fetchone()['cnt']:,} — these are SELLERS not buyers)")

# ── SCENARIO 5: SEO / digital for e-commerce ────────────────
print(f"\n{SEP}")
print("S5: πουλάω SEO και digital marketing σε e-commerce καταστήματα")
print(SEP)
ideal_kw = ["ΛΙΑΝΙΚ", "ΗΛΕΚΤΡΟΝ", "ΕΜΠΟΡΙΟ", "ΚΑΤΑΣΤΗΜ"]
print(f"Ideal keywords: {ideal_kw}")
print(f"Ideal count:    {count_with_keywords(ideal_kw):,}")
# Narrow: online retail specifically
ideal_kw_narrow = ["ΗΛΕΚΤΡΟΝ", "ΔΙΑΔΙΚΤ", "ONLINE", "E-COMMERCE"]
print(f"Narrow (online-only) keywords: {ideal_kw_narrow}")
print(f"Narrow count: {count_with_keywords(ideal_kw_narrow):,}")
print("Top KADs (broad):")
for r in top_kads(ideal_kw, 8): print(f"  {r['cnt']:>6,}  {r['primary_kad'][:70]}")

conn.close()
print(f"\n{SEP}")
print("Done.")
