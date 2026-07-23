#!/usr/bin/env python3
"""
Yacht leads — OWNERS' NAMES only, for the firms that still had no website
after the external domain scan.

Input
  tools/yacht_leads.csv                     (from yacht_leads.py)
  ~/Downloads/domain_check_results.csv      (external scan)

Keeps ONLY leads whose email domain was scanned and came back as NOT having a
website. Free-mail (gmail/yahoo/…) and unscanned domains are excluded — the
filter is strictly "verified no website".

Then pulls the people behind each firm from company_persons.

Run from the repo root:
    python tools/yacht_owners.py

Output
    tools/yacht_owners.csv
"""
import csv
import os
import re
import sys
import time

import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "scripts", ".env"))
DSN = os.getenv("DATABASE_URL")
if not DSN:
    sys.exit("DATABASE_URL not found in scripts/.env")

HERE = os.path.dirname(__file__)
LEADS = os.path.join(HERE, "yacht_leads.csv")
SCAN = os.path.join(os.path.expanduser("~"), "Downloads", "domain_check_results.csv")
OUT = os.path.join(HERE, "yacht_owners.csv")

# Owner-ish roles first — for ΑΤΟΜΙΚΗ firms the owner is ΙΔΙΟΚΤΗΤΗΣ; for
# ΙΚΕ/ΑΕ the decision-maker is the διαχειριστής / διευθύνων σύμβουλος.
ROLE_RANK = [
    "ΙΔΙΟΚΤΗΤ", "ΔΙΑΧΕΙΡΙΣΤ", "ΔΙΕΥΘΥΝΩΝ", "ΠΡΟΕΔΡ", "ΕΤΑΙΡΟΣ", "ΜΕΤΟΧ",
]


def rank(role):
    r = (role or "").upper()
    for i, key in enumerate(ROLE_RANK):
        if key in r:
            return i
    return len(ROLE_RANK)


def bar(done, total, width=34):
    total = max(total, 1)
    frac = min(done / total, 1.0)
    filled = int(frac * width)
    sys.stdout.write(f"\r  [{'█'*filled}{'░'*(width-filled)}] {frac*100:5.1f}%  {done:,}/{total:,}")
    sys.stdout.flush()


def main():
    t0 = time.time()

    if not os.path.exists(SCAN):
        sys.exit(f"Scan file not found: {SCAN}")

    # ── domains that came back WITHOUT a website ─────────────────────────────
    dead = set()
    with open(SCAN, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            d = (row.get("domain") or "").strip().lower()
            # skip junk domains ("0", a phone number) that came from malformed emails
            if not d or "." not in d or re.fullmatch(r"[\d.]+", d):
                continue
            if (row.get("has_website") or "").strip().upper() != "YES":
                dead.add(d)
    print(f"Domains with no website after scan: {len(dead):,}")

    # ── leads on those domains ───────────────────────────────────────────────
    wanted = {}
    with open(LEADS, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            email = (row.get("email") or "").split(";")[0].split(",")[0].strip().lower()
            m = re.search(r"@([^@\s]+)$", email)
            if not m:
                continue
            dom = m.group(1).lstrip("www.")
            if dom in dead:
                wanted[row["ar_gemi"]] = row
    print(f"Leads on those domains:             {len(wanted):,}")
    if not wanted:
        sys.exit("Nothing matched — check the two input files.")

    # ── owners ───────────────────────────────────────────────────────────────
    print("\nFetching owners from company_persons...")
    conn = psycopg2.connect(DSN, connect_timeout=30)
    cur = conn.cursor()
    ids = list(wanted.keys())
    people = {}
    CHUNK = 500
    for i in range(0, len(ids), CHUNK):
        batch = ids[i:i + CHUNK]
        cur.execute(
            """
            SELECT cp.ar_gemi::text, cp.person_name, cp.role
            FROM company_persons cp
            WHERE cp.ar_gemi::text = ANY(%s)
              AND cp.dt_to IS NULL          -- current roles only
            """,
            (batch,),
        )
        for ar, name, role in cur.fetchall():
            people.setdefault(ar, []).append((name, role))
        bar(min(i + CHUNK, len(ids)), len(ids))
    print()
    cur.close()
    conn.close()

    # ── write: one row per OWNER ─────────────────────────────────────────────
    rows = []
    for ar, lead in wanted.items():
        for name, role in sorted(people.get(ar, []), key=lambda p: rank(p[1])):
            rows.append([
                name, role or "",
                lead.get("company", ""), lead.get("email", ""), lead.get("phone", ""),
                lead.get("prefecture", ""), lead.get("tier", ""), ar,
            ])

    rows.sort(key=lambda r: (r[6], r[0]))

    with open(OUT, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["owner", "role", "company", "email", "phone", "prefecture", "tier", "ar_gemi"])
        w.writerows(rows)

    no_people = sum(1 for ar in wanted if ar not in people)
    print("\n" + "=" * 58)
    print(f"  Companies (verified no website): {len(wanted):,}")
    print(f"  Owners found:                    {len(rows):,}")
    print(f"  Companies with no person listed: {no_people:,}")
    print(f"\n  Saved: {OUT}")
    print(f"  Took {time.time()-t0:.1f}s")


if __name__ == "__main__":
    main()
