"""
GreekLeads — Customer Segmentation Dataset (Aug 2026)
Run: python tools/segmentation_analysis.py
Outputs: tools/segmentation_out/*.csv + tools/segmentation_out/SUMMARY.txt

One big pull of active, non-branch companies (ar_gemi, legal_type_descr,
current activities, website/social flags, capital) done ONCE; every Part
below is computed from that in-memory dataset plus a couple of small
supporting queries (financial-filing set, capital buckets, legal-type
totals). This keeps the whole run to a handful of DB round-trips instead
of one query per segment.
"""
import csv
import os
import sys
import time
from collections import defaultdict

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "scripts", ".env"))
DSN = os.getenv("DATABASE_URL")
if not DSN:
    sys.exit("DATABASE_URL not found in scripts/.env")

OUT_DIR = os.path.join(os.path.dirname(__file__), "segmentation_out")
os.makedirs(OUT_DIR, exist_ok=True)

ATOMIKI = "ΑΤΟΜΙΚΗ"


def get_conn():
    return psycopg2.connect(DSN, connect_timeout=30)


# ── Segment definitions ─────────────────────────────────────────────────────
# "prefix" matchers test the 8-digit KAD activity id with str.startswith().
# "descr" matchers test the Greek activity description (ILIKE-style substring,
# done in Python) because no clean KAD code isolates the persona.
PART1_SEGMENTS = [
    ("marketing_digital_731x",     "prefix", ["731"],              "Marketing/advertising/digital (KAD 73.1x)"),
    ("real_estate_683x",           "prefix", ["683"],               "Real estate agencies (KAD 68.3x)"),
    ("recruiting_staffing_781x",   "prefix", ["781"],               "Recruiting/staffing/HR (KAD 78.1x — 78.20 temp-staffing and a would-be 78.30 do not exist as separate codes in this KAD revision; 78.10 'employment placement agencies' is the only populated 78.1x code)"),
    ("insurance_agents_662x",      "prefix", ["662"],               "Insurance agents/brokers (KAD 66.2x)"),
    ("exporters_text",             "descr",  ["ΕΞΑΓΩΓ"],            "Exporters / import-export trading (NO clean KAD — see flag)"),
    ("events_conference_8230",     "prefix", ["8230"],              "Event & conference organizers (KAD 82.30)"),
    ("franchise_text",             "descr",  ["FRANCHISE", "ΔΙΚΑΙΟΧΡΗΣ"], "Franchise developers / franchise-model (NO clean KAD — see flag)"),
    ("b2b_saas_software_6210",     "prefix", ["6210"],              "B2B SaaS / software (KAD too broad — 62.10 used as closest code, see flag)"),
    ("industrial_equipment_466x",  "prefix", ["466"],               "Industrial equipment / machinery sellers (KAD 46.6x, wholesale of machinery & equipment)"),
]

WHOLESALE_PREFIX = "46"  # broken into individual 4-digit sub-codes separately

PART2_SEGMENTS = [
    ("banks_6419",          ["6419"], "Banks / monetary intermediation (KAD 64.19)"),
    ("leasing_6491",        ["6491"], "Financial leasing companies (KAD 64.91)"),
    ("other_credit_6492",   ["6492"], "Other credit-granting institutions / lenders (KAD 64.92)"),
    ("accounting_6920",     ["6920"], "Accounting, auditing, tax consultancy firms (KAD 69.20)"),
    ("legal_6910",          ["6910"], "Legal firms (KAD 69.10)"),
    ("holding_6421",        ["6421"], "Holding companies (KAD 64.21 — NOT 64.20 as guessed; 64.20 does not exist as a populated code in this KAD revision, 64.21 'activities of holding companies' does)"),
    ("fund_mgmt_6630",      ["6630"], "Investment/fund management firms (KAD 66.30)"),
    ("debt_collection_8291",["8291"], "Debt collection / credit bureaus (KAD 82.91)"),
]

# Which segments are "already had" (re-verify only) vs NEW (needs Part 5 readiness check)
ALREADY_HAD_PART1 = {"marketing_digital_731x", "real_estate_683x", "recruiting_staffing_781x", "insurance_agents_662x"}
ALREADY_HAD_PART2 = {"debt_collection_8291"}

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
    ("Other / Unclassified", []),
]


def classify_sector(descr: str) -> str:
    d = (descr or "").lower()
    for label, keywords in SECTOR_MAP:
        if not keywords:
            continue
        if any(k in d for k in keywords):
            return label
    return "Other / Unclassified"


# ── Stage 0: main pull ──────────────────────────────────────────────────────
MAIN_SQL = """
SELECT c.ar_gemi, c.legal_type_descr,
  (SELECT jsonb_agg(jsonb_build_object('id', a->'activity'->>'id',
                                        'descr', a->'activity'->>'descr',
                                        'type', a->>'type'))
   FROM jsonb_array_elements(c.activities) a WHERE a->>'dtTo' IS NULL) AS acts,
  NULLIF(c.url,'') AS url, NULLIF(c.discovered_url,'') AS discovered_url,
  NULLIF(c.instagram_url,'') AS ig, NULLIF(c.facebook_url,'') AS fb,
  NULLIF(c.linkedin_url,'') AS li, NULLIF(c.tiktok_url,'') AS tt
FROM companies c
WHERE c.status_descr = 'Ενεργή' AND COALESCE(c.is_branch,false) = false
"""


def fetch_main():
    print("Stage 0 — pulling active, non-branch companies (activities + digital flags)…")
    t0 = time.time()
    conn = get_conn()
    cur = conn.cursor(name="seg_cursor")  # server-side cursor, streams instead of buffering ~1M rows client-side
    cur.itersize = 20000
    cur.execute(MAIN_SQL)
    rows = []
    n = 0
    for r in cur:
        rows.append(r)
        n += 1
        if n % 100000 == 0:
            print(f"  …{n:,} rows ({time.time()-t0:.0f}s)")
    cur.close()
    conn.close()
    print(f"  {len(rows):,} rows in {time.time()-t0:.0f}s\n")
    return rows


class Company:
    __slots__ = ("ar_gemi", "legal_type", "codes", "descrs", "primary_descr",
                 "has_website", "has_social")

    def __init__(self, row):
        ar_gemi, legal_type, acts, url, disc_url, ig, fb, li, tt = row
        self.ar_gemi = ar_gemi
        self.legal_type = legal_type
        acts = acts or []
        self.codes = [a["id"] for a in acts if a.get("id")]
        self.descrs = [a["descr"] for a in acts if a.get("descr")]
        primary = next((a["descr"] for a in acts if a.get("type") == "Κύρια" and a.get("descr")), None)
        self.primary_descr = primary or (self.descrs[0] if self.descrs else "")
        self.has_website = bool(url or disc_url)
        self.has_social = bool(ig or fb or li or tt)

    def matches_prefix(self, prefixes):
        return any(c and any(c.startswith(p) for p in prefixes) for c in self.codes)

    def matches_descr(self, needles):
        return any(any(n in d.upper() for n in needles) for d in self.descrs)


def matches_segment(co, kind, needles):
    return co.matches_prefix(needles) if kind == "prefix" else co.matches_descr(needles)


# ── main ─────────────────────────────────────────────────────────────────
def main():
    rows = fetch_main()
    companies = [Company(r) for r in rows]
    total_active_nonbranch = len(companies)
    atomiki = [c for c in companies if c.legal_type == ATOMIKI]
    non_atomiki = [c for c in companies if c.legal_type != ATOMIKI]
    print(f"Total active non-branch: {total_active_nonbranch:,}  "
          f"({len(atomiki):,} ΑΤΟΜΙΚΗ / {len(non_atomiki):,} non-ΑΤΟΜΙΚΗ)\n")

    segment_members = {}  # name -> set of ar_gemi (ALL active non-branch matching, any legal type)

    # ── PART 1 ──────────────────────────────────────────────────────────────
    print("PART 1 — sales/prospecting segments")
    part1_rows = []
    for name, kind, needles, label in PART1_SEGMENTS:
        matched = [c for c in companies if matches_segment(c, kind, needles)]
        segment_members[name] = {c.ar_gemi for c in matched}
        non_atom = sum(1 for c in matched if c.legal_type != ATOMIKI)
        with_atom = len(matched)
        flag = "RE-VERIFY (already had)" if name in ALREADY_HAD_PART1 else "NEW"
        print(f"  {label:<90} non-ΑΤΟΜΙΚΗ {non_atom:>7,}   +ΑΤΟΜΙΚΗ {with_atom:>7,}   [{flag}]")
        part1_rows.append({
            "segment": label, "kad_basis": ",".join(needles), "match_type": kind,
            "status": flag, "non_atomiki_count": non_atom, "atomiki_included_count": with_atom,
            "atomiki_only_count": with_atom - non_atom,
        })

    # Wholesale 46.xx — individual 4-digit sub-codes
    print("\n  Wholesale/distributors — KAD 46.xx by 4-digit sub-code:")
    sub_counts = defaultdict(lambda: {"non_atom": set(), "atom": set()})
    for c in companies:
        for code in c.codes:
            if code and code.startswith(WHOLESALE_PREFIX) and len(code) >= 4:
                sub = code[:4]
                if c.legal_type == ATOMIKI:
                    sub_counts[sub]["atom"].add(c.ar_gemi)
                else:
                    sub_counts[sub]["non_atom"].add(c.ar_gemi)
    wholesale_all_ar_gemi = set()
    wholesale_rows = []
    for sub in sorted(sub_counts):
        na = len(sub_counts[sub]["non_atom"])
        ao = len(sub_counts[sub]["atom"])
        wholesale_all_ar_gemi |= sub_counts[sub]["non_atom"] | sub_counts[sub]["atom"]
        wholesale_rows.append({"kad_4digit": sub, "non_atomiki_count": na,
                                "atomiki_only_count": ao, "atomiki_included_count": na + ao})
        print(f"    {sub}  non-ΑΤΟΜΙΚΗ {na:>6,}   ΑΤΟΜΙΚΗ {ao:>6,}   total {na+ao:>6,}")
    segment_members["wholesale_46xx"] = wholesale_all_ar_gemi
    with open(os.path.join(OUT_DIR, "part1_wholesale_46xx_subcodes.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["kad_4digit", "non_atomiki_count", "atomiki_only_count", "atomiki_included_count"])
        w.writeheader()
        w.writerows(wholesale_rows)

    with open(os.path.join(OUT_DIR, "part1_sales_prospecting_segments.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["segment", "kad_basis", "match_type", "status",
                                           "non_atomiki_count", "atomiki_included_count", "atomiki_only_count"])
        w.writeheader()
        w.writerows(part1_rows)
        w.writerow({"segment": "Wholesale/distributors (KAD 46.xx, ALL sub-codes combined)",
                     "kad_basis": "46", "match_type": "prefix", "status": "NEW",
                     "non_atomiki_count": len(wholesale_all_ar_gemi & {c.ar_gemi for c in non_atomiki}),
                     "atomiki_included_count": len(wholesale_all_ar_gemi),
                     "atomiki_only_count": len(wholesale_all_ar_gemi & {c.ar_gemi for c in atomiki})})

    # ── PART 2 ──────────────────────────────────────────────────────────────
    print("\nPART 2 — risk/compliance/due-diligence segments (institutional, non-ΑΤΟΜΙΚΗ by nature)")
    part2_rows = []
    for name, needles, label in PART2_SEGMENTS:
        matched = [c for c in non_atomiki if c.matches_prefix(needles)]
        segment_members[name] = {c.ar_gemi for c in matched}
        flag = "RE-VERIFY (already had)" if name in ALREADY_HAD_PART2 else "NEW"
        print(f"  {label:<90} count {len(matched):>7,}   [{flag}]")
        part2_rows.append({"segment": label, "kad_basis": ",".join(needles),
                            "status": flag, "count_non_atomiki": len(matched)})
    with open(os.path.join(OUT_DIR, "part2_risk_compliance_segments.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["segment", "kad_basis", "status", "count_non_atomiki"])
        w.writeheader()
        w.writerows(part2_rows)

    # ── PART 3 ──────────────────────────────────────────────────────────────
    print("\nPART 3 — solo/individual (ΑΤΟΜΙΚΗ) population")
    print(f"  Total active ΑΤΟΜΙΚΗ: {len(atomiki):,}")
    sector_counts = defaultdict(int)
    for c in atomiki:
        sector_counts[classify_sector(c.primary_descr)] += 1
    part3_rows = []
    for label, cnt in sorted(sector_counts.items(), key=lambda x: -x[1]):
        pct = 100 * cnt / len(atomiki)
        print(f"    {label:<55} {cnt:>7,}  ({pct:4.1f}%)")
        part3_rows.append({"sector": label, "count": cnt, "pct_of_all_atomiki": round(pct, 2)})
    with open(os.path.join(OUT_DIR, "part3_atomiki_sector_split.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["sector", "count", "pct_of_all_atomiki"])
        w.writeheader()
        w.writerows(part3_rows)

    # ΑΤΟΜΙΚΗ within the Part-1 tight-ICP sectors (dedup union across those segments)
    icp_names = [n for n, *_ in PART1_SEGMENTS] + ["wholesale_46xx"]
    icp_atom_by_segment = []
    icp_atom_union = set()
    atom_ids = {c.ar_gemi for c in atomiki}
    for name in icp_names:
        s = segment_members[name] & atom_ids
        icp_atom_union |= s
        icp_atom_by_segment.append({"segment": name, "atomiki_count": len(s)})
    print(f"\n  ΑΤΟΜΙΚΗ within Part-1 sales/prospecting sectors (deduped union): {len(icp_atom_union):,}")
    with open(os.path.join(OUT_DIR, "part3_atomiki_in_icp_sectors.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["segment", "atomiki_count"])
        w.writeheader()
        w.writerows(icp_atom_by_segment)
        w.writerow({"segment": "DEDUPED UNION (this is the 'smaller price tier' population)",
                    "atomiki_count": len(icp_atom_union)})

    # ── PART 4 ──────────────────────────────────────────────────────────────
    print("\nPART 4 — the long tail")
    all_part1_part2_names = [n for n, *_ in PART1_SEGMENTS] + ["wholesale_46xx"] + [n for n, *_ in PART2_SEGMENTS]
    covered_non_atom = set()
    for name in all_part1_part2_names:
        covered_non_atom |= (segment_members[name] & {c.ar_gemi for c in non_atomiki})
    long_tail_count = total_active_nonbranch - len(atomiki) - len(covered_non_atom)
    print(f"  Total active non-branch:                         {total_active_nonbranch:>9,}")
    print(f"  minus ALL ΑΤΟΜΙΚΗ (fully counted in Part 3):     -{len(atomiki):>9,}")
    print(f"  minus non-ΑΤΟΜΙΚΗ matching any Part1/2 segment:  -{len(covered_non_atom):>9,}")
    print(f"  = LONG TAIL (free/general tier ceiling):         {long_tail_count:>9,}")
    with open(os.path.join(OUT_DIR, "part4_long_tail.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["metric", "count"])
        w.writerow(["total_active_non_branch", total_active_nonbranch])
        w.writerow(["all_atomiki_active", len(atomiki)])
        w.writerow(["non_atomiki_matching_any_part1_or_part2_segment", len(covered_non_atom)])
        w.writerow(["long_tail_ceiling", long_tail_count])

    # ── PART 5 — data readiness on NEW segments only ────────────────────────
    print("\nPART 5 — data readiness cross-check (NEW segments only)")
    new_segment_names = (
        [(n, l) for n, k, needles, l in PART1_SEGMENTS if n not in ALREADY_HAD_PART1] +
        [("wholesale_46xx", "Wholesale/distributors (KAD 46.xx, all sub-codes)")] +
        [(n, l) for n, needles, l in PART2_SEGMENTS if n not in ALREADY_HAD_PART2]
    )
    by_ar_gemi = {c.ar_gemi: c for c in companies}
    fin_set = fetch_financial_set()
    part5_rows = []
    for name, label in new_segment_names:
        ids = segment_members[name]
        n = len(ids)
        if n == 0:
            continue
        with_web = sum(1 for i in ids if by_ar_gemi[i].has_website)
        with_soc = sum(1 for i in ids if by_ar_gemi[i].has_social)
        with_fin = sum(1 for i in ids if i in fin_set)
        print(f"  {label:<75} n={n:>7,}  web {with_web:>6,} ({100*with_web/n:4.1f}%)  "
              f"social {with_soc:>6,} ({100*with_soc/n:4.1f}%)  filing {with_fin:>6,} ({100*with_fin/n:4.1f}%)")
        part5_rows.append({
            "segment": label, "count": n,
            "with_website": with_web, "pct_website": round(100*with_web/n, 1),
            "with_social": with_soc, "pct_social": round(100*with_soc/n, 1),
            "with_financial_filing": with_fin, "pct_financial_filing": round(100*with_fin/n, 1),
        })
    with open(os.path.join(OUT_DIR, "part5_data_readiness_new_segments.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["segment", "count", "with_website", "pct_website",
                                           "with_social", "pct_social",
                                           "with_financial_filing", "pct_financial_filing"])
        w.writeheader()
        w.writerows(part5_rows)
    print("  NOTE: 'financial filing found' is only ever populated for ΑΕ/ΙΚΕ/ΕΠΕ — the financial")
    print("  scan pipeline never checked ΟΕ/ΕΕ/ΑΤΟΜΙΚΗ, so any segment with those legal forms will")
    print("  under-read here even if some of those firms do file (rare, but happens).")

    # ── PART 6 — size proxy ──────────────────────────────────────────────────
    print("\nPART 6 — company size proxy")
    legal_rows, capital_rows = fetch_size_proxy()
    with open(os.path.join(OUT_DIR, "part6_legal_type_distribution.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["legal_type_descr", "count", "pct_of_active"])
        w.writeheader()
        w.writerows(legal_rows)
    for r in legal_rows:
        print(f"  {r['legal_type_descr']:<10} {r['count']:>9,}  ({r['pct_of_active']}%)")
    with open(os.path.join(OUT_DIR, "part6_capital_buckets.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=["bucket", "count", "min_eur"])
        w.writeheader()
        w.writerows(capital_rows)
    print("  Capital bucket distribution written (ΑΕ/ΙΚΕ/ΕΕ/ΟΕ only — see coverage caveat in summary; ΕΠΕ excluded, only 13% populated)")

    write_summary(total_active_nonbranch, len(atomiki), len(non_atomiki), long_tail_count)
    print(f"\nAll CSVs written to: {OUT_DIR}")


def fetch_financial_set():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT ar_gemi FROM financial_ar_gemi_scanned WHERE docs_found > 0")
    s = {r[0] for r in cur.fetchall()}
    conn.close()
    return s


def fetch_size_proxy():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT legal_type_descr, COUNT(*)
        FROM companies WHERE status_descr = 'Ενεργή'
        GROUP BY legal_type_descr ORDER BY 2 DESC
    """)
    rows = cur.fetchall()
    total = sum(c for _, c in rows)
    legal_rows = [{"legal_type_descr": lt or "(null)", "count": c,
                    "pct_of_active": round(100 * c / total, 2)} for lt, c in rows]

    cur.execute("""
        SELECT
          CASE
            WHEN cap < 1000 THEN '01_< 1,000'
            WHEN cap < 5000 THEN '02_1,000-4,999'
            WHEN cap < 10000 THEN '03_5,000-9,999'
            WHEN cap < 25000 THEN '04_10,000-24,999'
            WHEN cap < 50000 THEN '05_25,000-49,999'
            WHEN cap < 100000 THEN '06_50,000-99,999'
            WHEN cap < 500000 THEN '07_100,000-499,999'
            WHEN cap < 1000000 THEN '08_500,000-999,999'
            ELSE '09_>= 1,000,000'
          END AS bucket,
          COUNT(*), MIN(cap)
        FROM (
          SELECT ((capital->0)->>'capitalStock')::numeric AS cap
          FROM companies
          WHERE status_descr = 'Ενεργή'
            AND legal_type_descr IN ('ΑΕ','ΙΚΕ','ΟΕ','ΕΕ')
            AND jsonb_array_length(capital) > 0
            AND (capital->0)->>'capitalStock' IS NOT NULL
        ) sub
        GROUP BY bucket ORDER BY bucket
    """)
    capital_rows = [{"bucket": b, "count": c, "min_eur": float(m)} for b, c, m in cur.fetchall()]
    conn.close()
    return legal_rows, capital_rows


def write_summary(total, atom, non_atom, long_tail):
    path = os.path.join(OUT_DIR, "SUMMARY.txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write("GreekLeads — Customer Segmentation Dataset\n")
        f.write("=" * 60 + "\n\n")
        f.write(f"Total active non-branch companies: {total:,}\n")
        f.write(f"  ΑΤΟΜΙΚΗ:      {atom:,}\n")
        f.write(f"  non-ΑΤΟΜΙΚΗ:  {non_atom:,}\n")
        f.write(f"Long-tail / free-tier ceiling (Part 4): {long_tail:,}\n\n")
        f.write("KAD CODES CORRECTED FROM THE ORIGINAL GUESS:\n")
        f.write("  - Holding companies: 64.20 does not exist as a populated code in this\n")
        f.write("    KAD revision. Corrected to 64.21 'ΥΠΗΡΕΣΙΕΣ ΕΤΑΙΡΕΙΩΝ ΧΑΡΤΟΦΥΛΑΚΙΟΥ'.\n")
        f.write("  - B2B SaaS/software: 62.01/62.02 do not exist as separate codes here;\n")
        f.write("    everything sits under 62.10. Used 62.10 as the closest code, but it\n")
        f.write("    also catches general custom-software shops and freelance devs, not\n")
        f.write("    just SaaS businesses — cannot isolate the SaaS business model from KAD\n")
        f.write("    alone.\n")
        f.write("  - Recruiting/HR: a would-be 78.30 'other HR activities' code does not\n")
        f.write("    exist in this KAD revision; only 78.10 (placement agencies) and 78.20\n")
        f.write("    (temp staffing) are populated. 78.1x as specified = 78.10 only.\n\n")
        f.write("SEGMENTS WITH NO CLEAN KAD (description-text matched instead):\n")
        f.write("  - Exporters / import-export: export activity is embedded as a suffix\n")
        f.write("    on dozens of product-specific wholesale codes (46.24, 46.31-46.49,\n")
        f.write("    46.90, ...), not one dedicated code. Matched on activity description\n")
        f.write("    containing 'ΕΞΑΓΩΓ' across ANY current activity. This over-counts\n")
        f.write("    (catches secondary/rarely-used export lines) and under-counts (misses\n")
        f.write("    exporters who never registered an export-specific KAD line at all).\n")
        f.write("  - Franchise developers: no dedicated code. 77.40 covers trademark/IP\n")
        f.write("    licensing broadly (not franchise-specific) and 70.20 (management\n")
        f.write("    consultancy) has one franchise-granting sub-description. Matched on\n")
        f.write("    'FRANCHISE' / 'ΔΙΚΑΙΟΧΡΗΣ' in the description. Most real franchisors\n")
        f.write("    register under their core retail/service KAD, not a franchise-specific\n")
        f.write("    one, so this segment is very likely a significant undercount.\n")


if __name__ == "__main__":
    main()
