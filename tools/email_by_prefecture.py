import psycopg2, os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'scripts', '.env'))
conn = psycopg2.connect(os.getenv('DATABASE_URL'), connect_timeout=15)
cur = conn.cursor()
cur.execute("""
    SELECT
        prefecture_descr,
        COUNT(*) AS total_active,
        COUNT(*) FILTER (WHERE email IS NOT NULL AND email != '') AS has_email,
        ROUND(COUNT(*) FILTER (WHERE email IS NOT NULL AND email != '') * 100.0 / COUNT(*), 1) AS pct
    FROM companies
    WHERE status_descr = 'Ενεργή'
      AND prefecture_descr IS NOT NULL
      AND prefecture_descr != 'Inadequate Info'
    GROUP BY prefecture_descr
    ORDER BY has_email DESC
""")
rows = cur.fetchall()
conn.close()

print(f"{'Νομός':<35} {'Ενεργές':>10} {'Με Email':>10} {'%':>6}")
print('-' * 65)
for r in rows:
    print(f"{r[0]:<35} {r[1]:>10,} {r[2]:>10,} {float(r[3]):>5.1f}%")
print('-' * 65)
total = sum(r[1] for r in rows)
with_email = sum(r[2] for r in rows)
print(f"{'ΣΥΝΟΛΟ':<35} {total:>10,} {with_email:>10,} {round(with_email*100/total,1):>5.1f}%")
