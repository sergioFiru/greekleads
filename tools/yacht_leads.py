#!/usr/bin/env python3
"""
GreekLeads — Yacht / boat lead list for selling an ONLINE PRESENCE package
(website, Google Business Profile, SEO, email).

Target segment:
  * primary KAD is yacht / boat related (charter, excursions, marina services…)
  * status = Ενεργή (active)
  * HAS an email      → we have a way to reach them
  * has NO website    → that is the thing we are selling

Run from the repo root:
    python tools/yacht_leads.py

Outputs:
    tools/yacht_leads.csv        (UTF-8 BOM so Excel opens Greek correctly)

Notes
-----
Read-only. Safe to re-run.

WHY AN EXPLICIT KAD LIST: a naive "σκαφ" keyword match is badly wrong, because
the Greek stem appears inside unrelated words:
    ΕΚΣΚΑΦΩΝ      = excavation   (13.207 firms — earth-moving contractors!)
    ΑΕΡΟΣΚΑΦΩΝ    = aircraft
    ΔΙΑΣΤΗΜΟΠΛΟΙΩΝ = spacecraft
The previous tools/yacht_analysis.py discovery query hit exactly this and its
report lists excavation companies as the single biggest "yacht" category.
So: include-patterns below, then hard exclude-patterns.
"""
import csv
import os
import sys
import time

import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "scripts", ".env"))
DSN = os.getenv("DATABASE_URL")
if not DSN:
    sys.exit("DATABASE_URL not found in scripts/.env")

OUT_CSV = os.path.join(os.path.dirname(__file__), "yacht_leads.csv")

# ── Segment definition ───────────────────────────────────────────────────────
# tier A = sells directly to tourists  → needs a website the most, pays the most
# tier B = marina-side services        → still customer-facing, slower sale
# tier C = retail / brokerage / builds → lower urgency
TIERS = {
    "A": [
        "%ΕΝΟΙΚΙΑΣΗΣ ΤΟΥΡΙΣΤΙΚΟΥ ΣΚΑΦΟΥΣ%",
        "%ΕΝΟΙΚΙΑΣΗΣ ΕΠΑΓΓΕΛΜΑΤΙΚΟΥ ΤΟΥΡΙΣΤΙΚΟΥ ΣΚΑΦΟΥΣ%",
        "%ΣΚΑΦΩΝ ΕΚΔΡΟΜΩΝ ΚΑΙ ΠΕΡΙΗΓΗΣΕΩΝ%",
        "%ΕΝΟΙΚΙΑΣΗΣ ΠΛΟΙΩΝ ΨΥΧΑΓΩΓΙΑΣ%",
        "%ΜΕΤΑΦΟΡΩΝ ΕΠΙΒΑΤΩΝ ΜΕ ΘΑΛΑΜΗΓΟ%",
        "%ΕΝΟΙΚΙΑΣΗΣ ΣΚΑΦΩΝ ΘΑΛΑΣΣΙΑΣ ΚΑΙ ΑΚΤΟΠΛΟΪΚΗΣ ΜΕΤΑΦΟΡΑΣ%",
        "%ΧΡΗΜΑΤΟΔΟΤΙΚΗΣ ΜΙΣΘΩΣΗΣ Η ΕΝΟΙΚΙΑΣΗΣ ΣΚΑΦΩΝ%",
    ],
    "B": [
        "%ΕΠΙΣΚΕΥΗΣ ΚΑΙ ΣΥΝΤΗΡΗΣΗΣ ΣΚΑΦΩΝ ΑΝΑΨΥΧΗΣ%",
        "%ΣΤΑΘΜΕΥΣΗΣ ΚΑΙ ΦΥΛΑΞΗΣ ΣΚΑΦΩΝ%",
        "%ΕΚΠΑΙΔΕΥΣΗΣ ΣΤΗΝ ΟΔΗΓΗΣΗ ΤΑΧΥΠΛΟΩΝ ΣΚΑΦΩΝ%",
        "%ΜΕΤΑΤΡΟΠΗΣ, ΑΝΑΚΑΤΑΣΚΕΥΗΣ ΚΑΙ ΕΞΟΠΛΙΣΜΟΥ ΣΚΑΦΩΝ%",
        "%ΕΦΟΔΙΑΣΜΟΥ ΣΚΑΦΩΝ ΑΝΑΨΥΧΗΣ%",
        "%ΑΝΕΛΚΥΣΗΣ ΚΑΙ ΚΑΘΕΛΚΥΣΗΣ ΣΚΑΦΩΝ%",
    ],
    "C": [
        "%ΕΜΠΟΡΙΟ ΑΛΛΩΝ ΣΚΑΦΩΝ ΓΙΑ ΑΝΑΨΥΧΗ%",
        "%ΕΜΠΟΡΙΟ ΦΟΥΣΚΩΤΩΝ ΣΚΑΦΩΝ%",
        "%ΠΩΛΗΣΗ ΣΚΑΦΩΝ ΑΝΑΨΥΧΗ%",
        "%ΝΑΥΠΗΓΗΣΗ ΣΚΑΦΩΝ ΑΝΑΨΥΧΗΣ ΚΑΙ ΑΘΛΗΤΙΣΜΟΥ%",
        "%ΝΑΥΠΗΓΗΣΗ ΦΟΥΣΚΩΤΩΝ ΣΚΑΦΩΝ%",
    ],
}

# Anything matching these is NOT a boat business, regardless of the above.
EXCLUDE = [
    "%ΕΚΣΚΑΦ%",        # excavation / earth-moving
    "%ΑΕΡΟΣΚΑΦ%",      # aircraft
    "%ΔΙΑΣΤΗΜ%",       # spacecraft
    "%ΣΤΡΑΤΙΩΤΙΚ%",    # military
]

SOCIAL_COLS = ["instagram_url", "facebook_url", "linkedin_url", "tiktok_url", "youtube_url"]


def bar(done, total, width=34, label=""):
    if total <= 0:
        total = 1
    frac = min(done / total, 1.0)
    filled = int(frac * width)
    sys.stdout.write(
        f"\r  [{'█' * filled}{'░' * (width - filled)}] {frac*100:5.1f}%  {done:,}/{total:,} {label}"
    )
    sys.stdout.flush()


def main():
    t0 = time.time()
    print("Connecting to DB...")
    conn = psycopg2.connect(DSN, connect_timeout=30)
    cur = conn.cursor()

    include_all = [p for pats in TIERS.values() for p in pats]
    inc_sql = " OR ".join(["elem->'activity'->>'descr' ILIKE %s"] * len(include_all))
    exc_sql = " AND ".join(["elem->'activity'->>'descr' NOT ILIKE %s"] * len(EXCLUDE))

    social_sel = ",\n               ".join(f"NULLIF(c.{s}, '') AS {s}" for s in SOCIAL_COLS)

    # dtTo IS NULL → only the CURRENT primary activity. GEMI keeps superseded
    # KAD rows (kad_2008 vs kad_2026) on the same company; without this filter
    # firms are counted twice and old activities resurface.
    sql = f"""
        SELECT DISTINCT ON (c.ar_gemi)
               c.ar_gemi::text,
               c.co_name_el,
               c.afm,
               NULLIF(c.email, '')  AS email,
               NULLIF(c.phone, '')  AS phone,
               c.municipality_descr,
               c.prefecture_descr,
               c.legal_type_descr,
               c.incorporation_date,
               elem->'activity'->>'descr' AS kad_descr,
               {social_sel}
        FROM companies c,
             LATERAL jsonb_array_elements(c.activities) AS elem
        WHERE elem->>'type' = 'Κύρια'
          AND elem->>'dtTo' IS NULL
          AND ({inc_sql})
          AND ({exc_sql})
          AND c.status_descr ILIKE 'ενεργ%%'
          AND c.email IS NOT NULL AND c.email <> ''
          AND (c.url IS NULL OR c.url = '')
        ORDER BY c.ar_gemi, elem->'activity'->>'descr'
    """

    print("Querying (large JSONB scan — expect ~10-60s)...")
    cur.execute(sql, include_all + EXCLUDE)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    print(f"  {len(rows):,} matching companies\n")

    def tier_of(kad):
        k = (kad or "").upper()
        for t, pats in TIERS.items():
            for p in pats:
                core = p.strip("%").upper()
                if core in k:
                    return t
        return "C"

    print("Building CSV...")
    header = [
        "tier", "priority", "company", "ar_gemi", "afm",
        "email", "phone",
        "municipality", "prefecture",
        "legal_type", "founded", "years_active",
        "kad", "socials", "social_urls",
    ]

    out = []
    this_year = time.localtime().tm_year
    for i, r in enumerate(rows, 1):
        (ar_gemi, name, afm, email, phone, muni, pref, legal, inc, kad, *socials) = r

        # 'Inadequate Info' is a GEMI placeholder; municipality_descr is a
        # combined 'ΔΗΜΟΣ / ΝΟΜΟΣ' string, so match it as a substring.
        def clean(v):
            if not v or "Inadequate Info" in str(v):
                return ""
            return v

        found_socials = [(SOCIAL_COLS[j].replace("_url", ""), s)
                         for j, s in enumerate(socials) if s]
        year = inc.year if inc and hasattr(inc, "year") else None

        t = tier_of(kad)
        # A firm already posting on social but with no website is the hottest
        # lead: proven intent to market online, no owned property to send
        # traffic to. That is the whole pitch.
        priority = 1 if found_socials else 2

        out.append([
            t, priority, name, ar_gemi, afm or "",
            email or "", phone or "",
            clean(muni), clean(pref),
            clean(legal), year or "", (this_year - year) if year else "",
            kad or "",
            ", ".join(n for n, _ in found_socials),
            " | ".join(u for _, u in found_socials),
        ])
        if i % 200 == 0 or i == len(rows):
            bar(i, len(rows), label="rows")
    print()

    # tier A first, then social-having leads, then oldest (established) firms
    out.sort(key=lambda x: (x[0], x[1], -(x[11] or 0)))

    with open(OUT_CSV, "w", newline="", encoding="utf-8-sig") as f:
        wtr = csv.writer(f)
        wtr.writerow(header)
        wtr.writerows(out)

    # ── Summary ──────────────────────────────────────────────────────────────
    from collections import Counter
    tier_counts = Counter(r[0] for r in out)
    pref_counts = Counter(r[8] or "—" for r in out)
    with_social = sum(1 for r in out if r[13])

    print("\n" + "=" * 62)
    print("YACHT / BOAT LEADS — active, has email, NO website")
    print("=" * 62)
    print(f"  Total leads:            {len(out):,}")
    print(f"  With social profiles:   {with_social:,}  <- warmest, pitch these first")
    print(f"  Without any socials:    {len(out) - with_social:,}")
    print()
    print("  By tier:")
    for t, lbl in [("A", "charter / excursions (tourist-facing)"),
                   ("B", "marina services / repair / schools"),
                   ("C", "retail / brokerage / boat building")]:
        print(f"    {t}  {tier_counts.get(t, 0):>5,}   {lbl}")
    print()
    print("  Top 12 prefectures:")
    for p, c in pref_counts.most_common(12):
        print(f"    {p:<28} {c:>5,}")
    print()
    print(f"  Saved: {OUT_CSV}")
    print(f"  Took {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
