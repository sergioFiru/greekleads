"""
shared_domain_report.py — list every company whose email sits on a domain
shared with other companies (read-only, no writes).

Why: many small firms register their ACCOUNTANT's or LAWYER's email as their
official contact (e.g. kapin@kapin.gr used by dozens of unrelated shops, or
Germanos franchisees on a shared @germanos.gr address). That's a real, useful
signal — those companies likely share a "parent" (accountant/franchisor/law
firm) worth mapping — but it also means discover_websites.py's probe of that
email domain finds the PARENT's website, not the firm's own, which is why the
same favicon shows up on lots of unrelated company pages.

This script only reads and writes a CSV — it does not touch the database.
The actual favicon/discovered_url cleanup is a separate script:
    cleanup_shared_domain_favicons.py

Output: tools/shared_email_domains.csv
    domain, n_companies, ar_gemi, co_name_el, legal_type_descr, email,
    url, discovered_url, city, prefecture_descr, status_descr

Also (re)writes scripts/bots/shared_domain_blocklist.txt — domains shared by
>= BLOCKLIST_MIN companies (fixed at 5, independent of --min), one per line.
website_scanner.py's pass 2 loads this at startup and refuses to write a
discovered_url for any firm on one of these domains, so the same wrong-parent
match can't reappear. Redeploy the bot after regenerating this file.

Run from the scripts/ directory:
    python one_time/shared_domain_report.py
    python one_time/shared_domain_report.py --min=5   # default 3
"""
import csv
import os
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent.parent))
from scan_utils import FREEMAIL  # noqa: E402

load_dotenv(Path(__file__).parent.parent / ".env")
DSN = os.getenv("DATABASE_URL")
if not DSN:
    sys.exit("DATABASE_URL not found in scripts/.env")

MIN_SHARED = next(
    (int(a.split("=", 1)[1]) for a in sys.argv if a.startswith("--min=")), 3
)
OUT_CSV = Path(__file__).parent.parent.parent / "tools" / "shared_email_domains.csv"
BLOCKLIST_MIN = 5
BLOCKLIST_PATH = Path(__file__).parent.parent / "bots" / "shared_domain_blocklist.txt"


def bar(done, total, width=32):
    total = max(total, 1)
    frac = min(done / total, 1.0)
    filled = int(frac * width)
    return "█" * filled + "░" * (width - filled)


def main():
    print("Connecting…")
    conn = psycopg2.connect(DSN, connect_timeout=30)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    print("Reading companies with an email (this scans the full table, one pass)…")
    cur.execute("""
        SELECT ar_gemi, co_name_el, legal_type_descr, email, url, discovered_url,
               city, prefecture_descr, status_descr
        FROM companies
        WHERE email IS NOT NULL AND trim(email) <> ''
    """)

    domains: dict[str, list[dict]] = {}
    n = 0
    while True:
        rows = cur.fetchmany(50_000)
        if not rows:
            break
        for r in rows:
            n += 1
            if n % 200_000 == 0:
                sys.stdout.write(f"\r  scanned {n:,} rows…")
                sys.stdout.flush()
            email = (r["email"] or "").strip().lower()
            if "@" not in email:
                continue
            dom = email.rsplit("@", 1)[-1].strip(". ")
            if not dom or "." not in dom or dom in FREEMAIL:
                continue
            domains.setdefault(dom, []).append(r)
    conn.close()
    sys.stdout.write(f"\r  scanned {n:,} rows.            \n")

    qualifying = {d: rows for d, rows in domains.items() if len(rows) >= MIN_SHARED}
    total_companies = sum(len(rows) for rows in qualifying.values())
    print(f"\nDomains shared by >= {MIN_SHARED} companies: {len(qualifying):,}")
    print(f"Companies covered:                     {total_companies:,}")

    OUT_CSV.parent.mkdir(exist_ok=True)
    with open(OUT_CSV, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow([
            "domain", "n_companies", "ar_gemi", "co_name_el", "legal_type_descr",
            "email", "url", "discovered_url", "city", "prefecture_descr", "status_descr",
        ])
        for dom in sorted(qualifying, key=lambda d: -len(qualifying[d])):
            rows = qualifying[dom]
            for r in sorted(rows, key=lambda r: r["co_name_el"] or ""):
                writer.writerow([
                    dom, len(rows), r["ar_gemi"], r["co_name_el"], r["legal_type_descr"],
                    r["email"], r["url"], r["discovered_url"], r["city"],
                    r["prefecture_descr"], r["status_descr"],
                ])

    print(f"\nTop 20 shared domains:")
    for dom in sorted(qualifying, key=lambda d: -len(qualifying[d]))[:20]:
        print(f"  {len(qualifying[dom]):5,}  {dom}")

    print(f"\nSaved: {OUT_CSV}")

    blocklist = sorted(d for d, rows in domains.items() if len(rows) >= BLOCKLIST_MIN)
    with open(BLOCKLIST_PATH, "w", encoding="utf-8") as f:
        f.write(f"# auto-generated by shared_domain_report.py — domains shared by\n")
        f.write(f"# >= {BLOCKLIST_MIN} companies' emails. website_scanner.py pass 2\n")
        f.write(f"# refuses to write discovered_url for any of these. Regenerate by\n")
        f.write(f"# rerunning this script; redeploy the bot afterward.\n")
        for d in blocklist:
            f.write(d + "\n")
    print(f"Saved: {BLOCKLIST_PATH}  ({len(blocklist):,} domains, "
          f">= {BLOCKLIST_MIN} companies each)")


if __name__ == "__main__":
    main()
