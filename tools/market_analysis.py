"""
GreekLeads — Market Analysis Generator
Run: python tools/market_analysis.py
Outputs: tools/market_analysis.txt
"""
import os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from dotenv import load_dotenv
import psycopg2, psycopg2.extras

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "scripts", ".env"))

# ── KAD sector groupings ──────────────────────────────────────────────────────
# Maps a display label to a list of substrings that match KAD descriptions.
# Order matters: first match wins.
SECTOR_MAP = [
    ("Food & Beverage (Restaurants, Cafes, Catering)",
     ["εστιατόρι", "καφε", "καφέ", "ταβέρν", "τροφίμ", "ποτ", "αρτοποι", "ζαχαρο",
      "catering", "εκτροφ", "μπαρ", "snack", "φαγητ"]),
    ("Retail Trade (Shops, Non-food)",
     ["λιανικ", "εμπόριο λιανικής", "κατάστημα", "πώληση", "πωλήσεων"]),
    ("Wholesale & Import/Export",
     ["χονδρικ", "εισαγωγ", "εξαγωγ", "εμπόριο χονδρικής"]),
    ("Construction & Real Estate",
     ["κατασκευ", "οικοδομ", "ανακαίνιση", "δόμηση", "αστικ ακίνητ", "ακίνητ"]),
    ("Professional Services (Legal, Accounting, Consulting)",
     ["λογιστ", "δικηγορ", "συμβουλ", "σύμβουλ", "νομικ", "ελεγκτ", "ορκωτ"]),
    ("Transport & Logistics",
     ["μεταφορ", "logistics", "αποθήκευ", "courier", "ταξί", "ταξιδ"]),
    ("Health & Medical",
     ["ιατρ", "φαρμακ", "νοσοκομ", "κλινικ", "οδοντ", "φυσικοθεραπ", "ψυχολ", "νοσηλ"]),
    ("Education & Training",
     ["εκπαίδ", "φροντιστήρ", "σχολ", "ακαδημ", "κατάρτιση", "παιδαγωγ"]),
    ("IT & Technology",
     ["πληροφορ", "λογισμικ", "τεχνολογ", "software", "hardware", "διαδίκτυ",
      "ηλεκτρον", "τηλεπικοινων", "προγραμματ"]),
    ("Tourism & Accommodation",
     ["τουρισμ", "ξενοδοχ", "ενοικιαζόμενα", "διαμονή", "camping", "ταξιδ"]),
    ("Manufacturing & Industry",
     ["βιομηχαν", "παραγωγ", "επεξεργασ", "εργοστάσ", "μεταλλ", "πλαστικ",
      "χημικ", "κλωστοϋφαντ", "υφαντ", "ξυλ", "χαρτ", "εκτύπωσ"]),
    ("Agriculture, Fishing & Forestry",
     ["γεωργ", "αγροτ", "κτηνοτροφ", "αλιε", "θαλάσσ", "δασ", "φυτ"]),
    ("Beauty & Personal Care",
     ["κομμωτήρ", "κουρε", "αισθητ", "nail", "ινστιτούτο ομορφιάς", "σπα", "spa"]),
    ("Auto & Vehicles",
     ["αυτοκίνητ", "όχημ", "επισκευ αυτ", "συνεργε", "ανταλλακτ", "μοτοσικλ",
      "εκμίσθωση αυτ", "οχημάτ"]),
    ("Financial Services & Insurance",
     ["ασφαλ", "χρηματ", "τράπεζ", "επενδυτ", "χρηματοδ", "αμοιβαί"]),
    ("Cleaning & Facilities",
     ["καθαρισμ", "απολύμανσ", "φύλαξη", "security", "συντήρηση κτιρ"]),
    ("Media, Arts & Entertainment",
     ["μέσα ενημέρ", "διαφήμιση", "εκδοτ", "τηλεόρ", "ραδιοφ", "μουσικ",
      "θέατρ", "κινηματ", "τέχνη", "φωτογρ"]),
    ("Utilities & Energy",
     ["ηλεκτρισμ", "ενέργει", "φυσικό αέριο", "νερό", "αποχέτ", "ανανεώσιμ"]),
    ("Other / Unclassified", []),  # catch-all
]


def get_conn():
    return psycopg2.connect(os.getenv("DATABASE_URL"), connect_timeout=30)


def classify(descr: str) -> str:
    d = descr.lower()
    for label, keywords in SECTOR_MAP:
        if not keywords:
            continue
        if any(k in d for k in keywords):
            return label
    return "Other / Unclassified"


def run():
    print("Connecting to DB...")
    conn = get_conn()
    cur = conn.cursor()

    # ── 1. Pull all primary KADs for active companies ─────────────────────────
    print("Fetching primary KAD data for active companies...")
    cur.execute("""
        SELECT
            c.ar_gemi,
            c.incorporation_date,
            CASE WHEN c.email IS NOT NULL AND c.email != '' THEN 1 ELSE 0 END AS has_email,
            CASE WHEN c.phone IS NOT NULL AND c.phone != '' THEN 1 ELSE 0 END AS has_phone,
            CASE WHEN c.url   IS NOT NULL AND c.url   != '' THEN 1 ELSE 0 END AS has_website,
            elem->'activity'->>'descr' AS kad_descr
        FROM companies c,
             LATERAL jsonb_array_elements(c.activities) AS elem
        WHERE c.status_descr ILIKE '%ενεργ%'
          AND jsonb_array_length(c.activities) > 0
          AND elem->>'type' = 'Κύρια'
    """)
    rows = cur.fetchall()
    print(f"  Got {len(rows):,} records")

    # ── 2. Aggregate by sector ────────────────────────────────────────────────
    from collections import defaultdict
    import datetime

    sectors = defaultdict(lambda: {
        "count": 0,
        "has_email": 0,
        "has_phone": 0,
        "has_website": 0,
        "years": [],
    })

    for ar_gemi, inc_date, has_email, has_phone, has_website, kad_descr in rows:
        if not kad_descr:
            kad_descr = ""
        sector = classify(kad_descr)
        s = sectors[sector]
        s["count"] += 1
        s["has_email"]   += has_email
        s["has_phone"]   += has_phone
        s["has_website"] += has_website
        if inc_date:
            s["years"].append(inc_date.year if hasattr(inc_date, "year") else int(str(inc_date)[:4]))

    # ── 3. Overall totals ─────────────────────────────────────────────────────
    print("Fetching overall totals...")
    cur.execute("""
        SELECT COUNT(*),
               SUM(CASE WHEN email IS NOT NULL AND email != '' THEN 1 ELSE 0 END),
               SUM(CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 ELSE 0 END),
               SUM(CASE WHEN url   IS NOT NULL AND url   != '' THEN 1 ELSE 0 END),
               MIN(incorporation_date),
               MAX(incorporation_date)
        FROM companies
        WHERE status_descr ILIKE '%ενεργ%'
    """)
    total_row = cur.fetchone()
    total_firms, total_email, total_phone, total_url, oldest_date, newest_date = total_row

    # ── 4. Founding year distribution (all active) ────────────────────────────
    print("Fetching founding year distribution...")
    cur.execute("""
        SELECT EXTRACT(YEAR FROM incorporation_date)::int AS yr, COUNT(*) AS cnt
        FROM companies
        WHERE status_descr ILIKE '%ενεργ%'
          AND incorporation_date IS NOT NULL
        GROUP BY yr ORDER BY yr
    """)
    year_dist = cur.fetchall()

    # ── 5. Top prefectures ────────────────────────────────────────────────────
    print("Fetching top prefectures...")
    cur.execute("""
        SELECT prefecture_descr, COUNT(*) AS cnt
        FROM companies
        WHERE status_descr ILIKE '%ενεργ%'
          AND prefecture_descr IS NOT NULL
        GROUP BY prefecture_descr
        ORDER BY cnt DESC
        LIMIT 15
    """)
    top_prefectures = cur.fetchall()

    # ── 6. Legal type breakdown ───────────────────────────────────────────────
    print("Fetching legal type breakdown...")
    cur.execute("""
        SELECT legal_type_descr, COUNT(*) AS cnt
        FROM companies
        WHERE status_descr ILIKE '%ενεργ%'
          AND legal_type_descr IS NOT NULL
        GROUP BY legal_type_descr
        ORDER BY cnt DESC
        LIMIT 15
    """)
    legal_types = cur.fetchall()

    cur.close()
    conn.close()

    # ── 7. Build founding decade buckets ─────────────────────────────────────
    decade_buckets = defaultdict(int)
    for yr, cnt in year_dist:
        if yr and 1900 <= yr <= 2030:
            decade = (yr // 10) * 10
            decade_buckets[decade] += cnt

    # ── 8. Write report ───────────────────────────────────────────────────────
    out_path = os.path.join(os.path.dirname(__file__), "market_analysis.txt")
    now = datetime.datetime.now().strftime("%Y-%m-%d")

    lines = []
    w = lines.append

    w("=" * 70)
    w("GREEK BUSINESS REGISTRY — MARKET ANALYSIS")
    w(f"Generated: {now}  |  Source: GEMI (greekleads.gr database)")
    w("=" * 70)
    w("")
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("SECTION 1 — OVERALL ACTIVE FIRMS SUMMARY")
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("")
    w(f"  Total active firms:          {total_firms:>10,}")
    w(f"  Have email address:          {total_email:>10,}  ({100*total_email/total_firms:.1f}%)")
    w(f"  Have phone number:           {total_phone:>10,}  ({100*total_phone/total_firms:.1f}%)")
    w(f"  Have website URL:            {total_url:>10,}  ({100*total_url/total_firms:.1f}%)")
    w(f"  Oldest incorporation:        {str(oldest_date)[:10]}")
    w(f"  Newest incorporation:        {str(newest_date)[:10]}")
    w("")

    # Founding decade distribution
    w("  Founding decade distribution (active firms only):")
    for decade in sorted(decade_buckets.keys()):
        cnt = decade_buckets[decade]
        bar = "█" * min(40, int(cnt / max(decade_buckets.values()) * 40))
        w(f"    {decade}s  {cnt:>8,}  {bar}")
    w("")

    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("SECTION 2 — FIRMS BY INDUSTRY SECTOR (Primary KAD)")
    w("  Note: each firm is counted once by its primary registered activity.")
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("")
    w(f"  {'Sector':<50} {'Firms':>8}  {'Email%':>7}  {'Phone%':>7}  {'Web%':>7}  {'Median Yr':>9}")
    w("  " + "-" * 95)

    # Sort sectors by count desc
    sorted_sectors = sorted(sectors.items(), key=lambda x: -x[1]["count"])

    for label, data in sorted_sectors:
        n = data["count"]
        if n == 0:
            continue
        pct_email   = 100 * data["has_email"]   / n
        pct_phone   = 100 * data["has_phone"]   / n
        pct_website = 100 * data["has_website"] / n
        years = data["years"]
        med_yr = sorted(years)[len(years) // 2] if years else "—"
        short = label[:49]
        w(f"  {short:<50} {n:>8,}  {pct_email:>6.1f}%  {pct_phone:>6.1f}%  {pct_website:>6.1f}%  {str(med_yr):>9}")

    w("")
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("SECTION 3 — DIGITAL FOOTPRINT GAPS BY SECTOR")
    w("  Sectors ranked by lowest website presence (opportunity score)")
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("")
    w(f"  {'Sector':<50} {'Firms':>8}  {'No Website':>10}  {'No Email':>9}")
    w("  " + "-" * 85)

    # Sort by website gap (lowest % website = biggest opportunity)
    gap_sorted = sorted(
        [(label, data) for label, data in sorted_sectors if data["count"] >= 100],
        key=lambda x: x[1]["has_website"] / x[1]["count"]
    )
    for label, data in gap_sorted:
        n = data["count"]
        no_web   = n - data["has_website"]
        no_email = n - data["has_email"]
        pct_no_web   = 100 * no_web   / n
        short = label[:49]
        w(f"  {short:<50} {n:>8,}  {no_web:>8,} ({pct_no_web:.0f}%)  {no_email:>7,}")

    w("")
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("SECTION 4 — TOP 15 PREFECTURES BY ACTIVE FIRM COUNT")
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("")
    for i, (pref, cnt) in enumerate(top_prefectures, 1):
        bar = "█" * int(cnt / top_prefectures[0][1] * 35)
        w(f"  {i:>2}. {(pref or 'Unknown'):<35} {cnt:>8,}  {bar}")
    w("")

    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("SECTION 5 — LEGAL STRUCTURE BREAKDOWN (Active Firms)")
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("")
    for lt, cnt in legal_types:
        pct = 100 * cnt / total_firms
        bar = "█" * int(pct / 100 * 35)
        w(f"  {(lt or 'Unknown'):<45} {cnt:>8,}  ({pct:.1f}%)  {bar}")
    w("")

    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("SECTION 6 — KEY OBSERVATIONS FOR MARKET ANALYSIS")
    w("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    w("")
    w("  DATA SOURCE:")
    w("  - Greek General Commercial Registry (GEMI) — official government data")
    w("  - Covers all legally registered active businesses in Greece")
    w("  - Primary KAD (Κύρια Δραστηριότητα) used for sector classification")
    w("")
    w("  DIGITAL GAP:")
    pct_no_web = 100 * (total_firms - total_url) / total_firms
    w(f"  - {pct_no_web:.0f}% of active Greek firms have NO website ({(total_firms - total_url):,} businesses)")
    pct_no_email = 100 * (total_firms - total_email) / total_firms
    w(f"  - {pct_no_email:.0f}% have NO registered email ({(total_firms - total_email):,} businesses)")
    w("  - Traditional sectors (food, retail, construction) show lowest digital adoption")
    w("")
    w("  SECTOR CONCENTRATION:")
    top3 = sorted_sectors[:3]
    for label, data in top3:
        pct = 100 * data["count"] / total_firms
        w(f"  - {label}: {data['count']:,} firms ({pct:.1f}% of all active businesses)")
    w("")
    w("  FIRM AGE:")
    recent = sum(cnt for yr, cnt in year_dist if yr and yr >= 2015)
    pct_recent = 100 * recent / total_firms
    w(f"  - {pct_recent:.1f}% of active firms were founded in 2015 or later")
    w("  - Significant wave of incorporations post-2010 despite economic crisis")
    w("")
    w("=" * 70)
    w("END OF REPORT")
    w("=" * 70)

    report = "\n".join(lines)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(report)

    print(f"\nReport saved to: {out_path}")
    print("Done.")


if __name__ == "__main__":
    run()
