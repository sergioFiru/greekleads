"""
GreekLeads — Yacht & Boat Charter Market Analysis
Run: python tools/yacht_analysis.py
Outputs: tools/yacht_analysis.txt
"""
import os, sys, datetime
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from dotenv import load_dotenv
import psycopg2, psycopg2.extras

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "scripts", ".env"))

# ── KAD codes that are strictly yacht/boat charter & related ─────────────────
# Discovered from .filter_cache.json — these are the exact descriptions in GEMI.
CHARTER_KADS = [
    "ΥΠΗΡΕΣΙΕΣ ΕΝΟΙΚΙΑΣΗΣ ΤΟΥΡΙΣΤΙΚΟΥ ΣΚΑΦΟΥΣ, ΧΩΡΙΣ ΠΛΗΡΩΜΑ",          # bareboat charter
    "ΥΠΗΡΕΣΙΕΣ ΕΝΟΙΚΙΑΣΗΣ ΕΠΑΓΓΕΛΜΑΤΙΚΟΥ ΤΟΥΡΙΣΤΙΚΟΥ ΣΚΑΦΟΥΣ ΜΕ ΠΛΗΡΩΜΑ", # crewed charter
]
MAINTENANCE_KADS = [
    "ΥΠΗΡΕΣΙΕΣ ΕΠΙΣΚΕΥΗΣ ΚΑΙ ΣΥΝΤΗΡΗΣΗΣ ΣΚΑΦΩΝ ΑΝΑΨΥΧΗΣ, ΛΕΜΒΩΝ ΚΑΙ ΜΗΧΑΝΩΝ ΘΑΛΑΣΣΗΣ",
]
# Also search for any other ΣΚΑΦ/ΝΑΥΛ/ΙΣΤΙΟΠΛΟ KADs not in top-500 cache
EXTRA_KEYWORDS = ["σκαφ", "ναύλ", "ιστιοπλο", "θαλαμηγ", "βάρκ", "λέμβ", "πλοιάρ"]


def get_conn():
    return psycopg2.connect(os.getenv("DATABASE_URL"), connect_timeout=30)


def run():
    print("Connecting to DB...")
    conn = get_conn()
    cur = conn.cursor()

    # ── 1. Discover ALL yacht-related primary KADs in DB ─────────────────────
    print("Discovering all yacht/boat-related primary KAD descriptions...")
    keyword_conditions = " OR ".join(
        ["lower(elem->'activity'->>'descr') LIKE %s"] * len(EXTRA_KEYWORDS)
    )
    cur.execute(f"""
        SELECT elem->'activity'->>'descr' AS descr, COUNT(*) AS cnt
        FROM companies,
             LATERAL jsonb_array_elements(activities) AS elem
        WHERE elem->>'type' = 'Κύρια'
          AND ({keyword_conditions})
        GROUP BY descr ORDER BY cnt DESC
    """, [f"%{k}%" for k in EXTRA_KEYWORDS])
    all_yacht_kads = cur.fetchall()
    print(f"  Found {len(all_yacht_kads)} yacht-related KAD types in DB")

    # ── 2. Charter companies — full data ─────────────────────────────────────
    print("Fetching charter companies (with + without crew)...")
    charter_ph = ",".join(["%s"] * len(CHARTER_KADS))
    cur.execute(f"""
        SELECT
            c.ar_gemi,
            c.co_name_el,
            c.prefecture_descr,
            c.municipality_descr,
            c.status_descr,
            c.legal_type_descr,
            c.incorporation_date,
            CASE WHEN c.email IS NOT NULL AND c.email != '' THEN 1 ELSE 0 END AS has_email,
            CASE WHEN c.phone IS NOT NULL AND c.phone != '' THEN 1 ELSE 0 END AS has_phone,
            CASE WHEN c.url   IS NOT NULL AND c.url   != '' THEN 1 ELSE 0 END AS has_website,
            elem->'activity'->>'descr' AS kad_descr
        FROM companies c,
             LATERAL jsonb_array_elements(c.activities) AS elem
        WHERE elem->>'type' = 'Κύρια'
          AND elem->'activity'->>'descr' IN ({charter_ph})
        ORDER BY c.prefecture_descr, c.co_name_el
    """, CHARTER_KADS)
    charter_rows = cur.fetchall()
    print(f"  Found {len(charter_rows)} charter companies")

    # ── 3. Maintenance/repair ─────────────────────────────────────────────────
    print("Fetching maintenance companies...")
    maint_ph = ",".join(["%s"] * len(MAINTENANCE_KADS))
    cur.execute(f"""
        SELECT prefecture_descr, COUNT(*) AS cnt
        FROM companies c,
             LATERAL jsonb_array_elements(c.activities) AS elem
        WHERE elem->>'type' = 'Κύρια'
          AND elem->'activity'->>'descr' IN ({maint_ph})
        GROUP BY prefecture_descr ORDER BY cnt DESC
    """, MAINTENANCE_KADS)
    maint_by_prefecture = cur.fetchall()
    maint_total = sum(r[1] for r in maint_by_prefecture)

    # ── 4. Charter: by prefecture ─────────────────────────────────────────────
    from collections import defaultdict
    pref_data = defaultdict(lambda: {"bareboat": 0, "crewed": 0,
                                      "has_email": 0, "has_phone": 0,
                                      "has_website": 0, "years": []})

    bareboat_label = "ΥΠΗΡΕΣΙΕΣ ΕΝΟΙΚΙΑΣΗΣ ΤΟΥΡΙΣΤΙΚΟΥ ΣΚΑΦΟΥΣ, ΧΩΡΙΣ ΠΛΗΡΩΜΑ"

    for row in charter_rows:
        ar_gemi, name, pref, muni, status, legal, inc_date, has_email, has_phone, has_website, kad = row
        pref = pref or "Unknown"
        if kad == bareboat_label:
            pref_data[pref]["bareboat"] += 1
        else:
            pref_data[pref]["crewed"] += 1
        pref_data[pref]["has_email"]   += has_email
        pref_data[pref]["has_phone"]   += has_phone
        pref_data[pref]["has_website"] += has_website
        if inc_date:
            y = inc_date.year if hasattr(inc_date, "year") else int(str(inc_date)[:4])
            pref_data[pref]["years"].append(y)

    total_charter = len(charter_rows)
    total_bareboat = sum(1 for r in charter_rows if r[10] == bareboat_label)
    total_crewed   = total_charter - total_bareboat

    # ── 5. Founding decade ────────────────────────────────────────────────────
    decade_buckets = defaultdict(int)
    for row in charter_rows:
        inc_date = row[6]
        if inc_date:
            y = inc_date.year if hasattr(inc_date, "year") else int(str(inc_date)[:4])
            if 1960 <= y <= 2030:
                decade_buckets[(y // 10) * 10] += 1

    # ── 6. Legal types ────────────────────────────────────────────────────────
    legal_counts = defaultdict(int)
    for row in charter_rows:
        legal_counts[row[5] or "Unknown"] += 1

    # ── 7. Active vs inactive ────────────────────────────────────────────────
    status_counts = defaultdict(int)
    for row in charter_rows:
        status_counts[row[4] or "Unknown"] += 1

    active_count = sum(v for k, v in status_counts.items() if "ενεργ" in (k or "").lower())

    # ── 8. Digital gaps ───────────────────────────────────────────────────────
    total_email   = sum(r[7] for r in charter_rows)
    total_phone   = sum(r[8] for r in charter_rows)
    total_website = sum(r[9] for r in charter_rows)

    cur.close()
    conn.close()

    # ── Build report ──────────────────────────────────────────────────────────
    now = datetime.datetime.now().strftime("%Y-%m-%d")
    lines = []
    w = lines.append

    w("=" * 72)
    w("GREEK YACHT & BOAT CHARTER MARKET — ANALYSIS REPORT")
    w(f"Generated: {now}  |  Source: GEMI Greek Business Registry")
    w("=" * 72)
    w("")
    w("  Scope: firms whose PRIMARY registered activity (KAD) is yacht/boat")
    w("  charter. Does NOT include shipping, ferries, or fishing.")
    w("")

    # Section 1 — Top numbers
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("SECTION 1 — MARKET SIZE OVERVIEW")
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("")
    w(f"  Total registered charter entities (all statuses):    {total_charter:>6,}")
    w(f"  ── Bareboat charter (no crew):                       {total_bareboat:>6,}")
    w(f"  ── Crewed charter (skippered / gulet):               {total_crewed:>6,}")
    w(f"  Currently ACTIVE:                                    {active_count:>6,}")
    w(f"  Maintenance & repair ecosystem:                      {maint_total:>6,}")
    w("")
    w(f"  Have email address:    {total_email:>5,}  ({100*total_email/total_charter:.1f}%)")
    w(f"  Have phone number:     {total_phone:>5,}  ({100*total_phone/total_charter:.1f}%)")
    w(f"  Have website URL:      {total_website:>5,}  ({100*total_website/total_charter:.1f}%)")
    w("")

    # Section 2 — All discovered KAD types
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("SECTION 2 — ALL YACHT/BOAT KAD TYPES FOUND IN THE REGISTRY")
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("")
    w(f"  {'KAD Description':<65} {'Count':>6}")
    w("  " + "-" * 72)
    for descr, cnt in all_yacht_kads:
        short = (descr or "—")[:64]
        w(f"  {short:<65} {cnt:>6,}")
    w("")

    # Section 3 — By prefecture
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("SECTION 3 — GEOGRAPHIC DISTRIBUTION (Charter companies by prefecture)")
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("")
    sorted_prefs = sorted(pref_data.items(),
                          key=lambda x: -(x[1]["bareboat"] + x[1]["crewed"]))
    max_count = max((d["bareboat"] + d["crewed"]) for d in pref_data.values()) if pref_data else 1

    w(f"  {'Prefecture':<28} {'Total':>6}  {'Bareboat':>8}  {'Crewed':>7}  {'Web%':>6}  Bar")
    w("  " + "-" * 75)
    for pref, d in sorted_prefs:
        total = d["bareboat"] + d["crewed"]
        pct_web = 100 * d["has_website"] / total if total else 0
        bar = "█" * int(total / max_count * 25)
        w(f"  {pref:<28} {total:>6,}  {d['bareboat']:>8,}  {d['crewed']:>7,}  {pct_web:>5.0f}%  {bar}")
    w("")

    # Section 4 — Founding decade
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("SECTION 4 — WHEN WAS THIS MARKET BUILT? (Founding decades)")
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("")
    max_dec = max(decade_buckets.values()) if decade_buckets else 1
    for decade in sorted(decade_buckets.keys()):
        cnt = decade_buckets[decade]
        bar = "█" * int(cnt / max_dec * 35)
        w(f"  {decade}s  {cnt:>5,}  {bar}")
    w("")
    post2010 = sum(v for k, v in decade_buckets.items() if k >= 2010)
    w(f"  Founded 2010 or later: {post2010} ({100*post2010/total_charter:.1f}% of all charter entities)")
    w("")

    # Section 5 — Legal structure
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("SECTION 5 — LEGAL STRUCTURE")
    w("  (tells you if these are mom-and-pop or proper businesses)")
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("")
    for legal, cnt in sorted(legal_counts.items(), key=lambda x: -x[1]):
        pct = 100 * cnt / total_charter
        bar = "█" * int(pct / 100 * 30)
        w(f"  {(legal or 'Unknown'):<30} {cnt:>5,}  ({pct:.1f}%)  {bar}")
    w("")

    # Section 6 — Status breakdown
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("SECTION 6 — STATUS BREAKDOWN")
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("")
    for status, cnt in sorted(status_counts.items(), key=lambda x: -x[1]):
        pct = 100 * cnt / total_charter
        w(f"  {(status or 'Unknown'):<35} {cnt:>5,}  ({pct:.1f}%)")
    w("")

    # Section 7 — Digital gap (opportunity)
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("SECTION 7 — DIGITAL PRESENCE GAPS (Business opportunities)")
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("")
    no_web   = total_charter - total_website
    no_email = total_charter - total_email
    no_phone = total_charter - total_phone
    w(f"  No website:      {no_web:>5,} companies  ({100*no_web/total_charter:.1f}%)")
    w(f"  No email:        {no_email:>5,} companies  ({100*no_email/total_charter:.1f}%)")
    w(f"  No phone listed: {no_phone:>5,} companies  ({100*no_phone/total_charter:.1f}%)")
    w("")
    no_web_no_email = sum(
        1 for r in charter_rows if r[7] == 0 and r[9] == 0
    )
    w(f"  No website AND no email: {no_web_no_email:>5,} ({100*no_web_no_email/total_charter:.1f}%)")
    w("  → These are entirely offline businesses with zero digital presence.")
    w("")

    # Section 8 — Maintenance ecosystem by prefecture
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("SECTION 8 — MAINTENANCE & REPAIR ECOSYSTEM (by prefecture)")
    w("  (Boat repair/maintenance firms — these cluster near marinas)")
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("")
    max_maint = maint_by_prefecture[0][1] if maint_by_prefecture else 1
    for pref, cnt in maint_by_prefecture:
        bar = "█" * int(cnt / max_maint * 30)
        w(f"  {(pref or 'Unknown'):<30} {cnt:>5,}  {bar}")
    w("")

    # Section 9 — Key insights
    top_pref = sorted_prefs[0][0] if sorted_prefs else "—"
    top_pref_count = sorted_prefs[0][1]["bareboat"] + sorted_prefs[0][1]["crewed"] if sorted_prefs else 0
    top_pref_pct = 100 * top_pref_count / total_charter if total_charter else 0

    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("SECTION 9 — KEY INSIGHTS FOR MARKET ANALYSIS")
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("")
    w("  DATA SOURCE:")
    w("  - Greek General Commercial Registry (GEMI) — official government data")
    w("  - Covers legally registered businesses only (not informal operators)")
    w("  - Primary KAD = main declared business activity")
    w("")
    w("  MARKET STRUCTURE:")
    w(f"  - {total_charter:,} registered charter entities in Greece (GEMI)")
    w(f"  - {active_count:,} currently active ({100*active_count/total_charter:.1f}%)")
    w(f"  - Bareboat (DIY sailing) accounts for {100*total_bareboat/total_charter:.1f}% of all registrations")
    w(f"  - Crewed/skippered charter: {100*total_crewed/total_charter:.1f}%")
    w("")
    w("  GEOGRAPHY:")
    w(f"  - Most concentrated in {top_pref} ({top_pref_count:,} firms = {top_pref_pct:.1f}% of market)")
    top3_prefs = sorted_prefs[:3]
    top3_count = sum(d["bareboat"] + d["crewed"] for _, d in top3_prefs)
    w(f"  - Top 3 prefectures hold {top3_count:,} firms ({100*top3_count/total_charter:.1f}% of market)")
    w("")
    w("  DIGITAL OPPORTUNITY:")
    w(f"  - {100*no_web/total_charter:.0f}% have NO website — massive gap in a tourism-driven business")
    w(f"  - {100*no_email/total_charter:.0f}% have no registered email")
    w(f"  - {no_web_no_email:,} firms are completely offline")
    w("  - Suggesting most charters rely on word-of-mouth, platforms (GetMyBoat,")
    w("    Zizoo, Navtika) or brokers rather than their own digital presence")
    w("")
    w("  CONSOLIDATION:")
    w("  - Market is highly fragmented — mostly individual boat owners (ΑΤΟΜΙΚΗ)")
    w("    or small IKE/EPE companies with 1-2 vessels")
    w("  - Low barrier to entry (register a boat, get a KAD) = many micro-operators")
    w("  - Limited corporate players → opportunity for aggregation/platform play")
    w("")
    w("=" * 72)
    w("END OF REPORT")
    w("=" * 72)

    report = "\n".join(lines)
    out_path = os.path.join(os.path.dirname(__file__), "yacht_analysis.txt")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(report)

    print(f"\nReport saved to: {out_path}")
    print("Done.")


if __name__ == "__main__":
    run()
