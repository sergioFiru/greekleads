import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import os, json, psycopg2, psycopg2.extras, requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
conn = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

OPENROUTER_API_KEY = os.environ["OPENROUTER_API_KEY"]

PREFECTURES = [
  'ΑΘΗΝΩΝ','ΑΙΤΩΛΟΑΚΑΡΝΑΝΙΑΣ','ΑΝΑΤΟΛΙΚΗΣ ΑΤΤΙΚΗΣ','ΑΡΓΟΛΙΔΑΣ','ΑΡΚΑΔΙΑΣ',
  'ΑΡΤΑΣ','ΑΤΤΙΚΗΣ','ΑΧΑΙΑΣ','ΒΟΙΩΤΙΑΣ','ΓΡΕΒΕΝΩΝ','ΔΡΑΜΑΣ',
  'ΔΥΤΙΚΗΣ ΑΤΤΙΚΗΣ','ΔΩΔΕΚΑΝΗΣΟΥ','ΕΒΡΟΥ','ΕΥΒΟΙΑΣ','ΕΥΡΥΤΑΝΙΑΣ',
  'ΖΑΚΥΝΘΟΥ','ΗΛΕΙΑΣ','ΗΜΑΘΙΑΣ','ΗΡΑΚΛΕΙΟΥ','ΘΕΣΠΡΩΤΙΑΣ','ΘΕΣΣΑΛΟΝΙΚΗΣ',
  'ΙΩΑΝΝΙΝΩΝ','ΚΑΒΑΛΑΣ','ΚΑΡΔΙΤΣΑΣ','ΚΑΣΤΟΡΙΑΣ','ΚΕΡΚΥΡΑΣ','ΚΕΦΑΛΛΗΝΙΑΣ',
  'ΚΙΛΚΙΣ','ΚΟΖΑΝΗΣ','ΚΟΡΙΝΘΙΑΣ','ΚΥΚΛΑΔΩΝ','ΛΑΚΩΝΙΑΣ','ΛΑΡΙΣΑΣ',
  'ΛΑΣΙΘΙΟΥ','ΛΕΣΒΟΥ','ΛΕΥΚΑΔΑΣ','ΜΑΓΝΗΣΙΑΣ','ΜΕΣΣΗΝΙΑΣ','ΞΑΝΘΗΣ',
  'ΠΕΙΡΑΙΑ','ΠΕΛΛΗΣ','ΠΙΕΡΙΑΣ','ΠΡΕΒΕΖΑΣ','ΡΕΘΥΜΝΗΣ','ΡΟΔΟΠΗΣ',
  'ΣΑΜΟΥ','ΣΕΡΡΩΝ','ΤΡΙΚΑΛΩΝ','ΦΘΙΩΤΙΔΑΣ','ΦΛΩΡΙΝΑΣ','ΦΩΚΙΔΑΣ',
  'ΧΑΛΚΙΔΙΚΗΣ','ΧΑΝΙΩΝ','ΧΙΟΥ',
]
LEGAL_TYPES = ['ΑΕ','ΕΠΕ','ΙΚΕ','ΟΕ','ΕΕ','ΑΤΟΜΙΚΗ','Κοιν.Σ.Επ.','Συνεταιρισμός']

SYSTEM_PROMPT = '\n'.join([
  'You are Scout, an AI prospecting agent for GreekLeads — a database of 1.67 million Greek companies from GEMI (Greek company registry).',
  '',
  'The user describes what they sell and who they want to target. Your job is to return the MAXIMUM number of relevant prospects by choosing the right sector keywords.',
  '',
  '## RULE 1 — Keywords describe BUYERS, never the product',
  'activity_keywords must describe the INDUSTRY of the companies being sold TO — never the product or service being sold.',
  'Examples:',
  '- Selling accounting software TO accountants → keywords: "ΛΟΓΙΣΤ", "ΦΟΡΟΤΕΧΝ", "ΕΛΕΓΚΤ" (accounting firms). NOT "ΛΟΓΙΣΜΙΚ" (that is the product category, not the buyer).',
  '- Selling coffee TO cafes and restaurants → keywords: "ΕΣΤΙΑΤ", "ΚΑΦΕ", "ΕΠΙΣΙΤΙΣ", "ΤΑΒΕΡΝ", "ΜΠΑΡ", "ΕΣΤΙΑΣΗ".',
  '- Selling renovation services TO hotels → keywords: "ΞΕΝΟΔΟΧ", "ΚΑΤΑΛΥΜ", "ΤΟΥΡΙΣΜ", "ΕΝΟΙΚΙΑΖ".',
  '',
  '## RULE 2 — Never use the product as a buyer keyword',
  'Companies that produce or sell the same product you are selling are competitors or irrelevant — they are not buyers.',
  'Examples:',
  '- Selling solar panels TO factories → buyers are ΒΙΟΜΗΧΑΝ, ΜΕΤΑΛΛ, ΠΑΡΑΓΩΓ, ΧΗΜΙΚ, ΚΛΩΣΤ (industrial energy consumers). Do NOT use "ΦΩΤΟΒΟΛΤ" — those are solar energy producers, not buyers.',
  '- Selling cleaning products TO boat owners → buyers are ΣΚΑΦ, ΝΑΥΤ, CHARTER, ΑΛΙΕ. Do NOT add "ΚΑΘΑΡΙΣΜ" companies — those are cleaning service providers, not buyers.',
  '- Selling software TO IT companies is unusual — if that is the target, use "ΠΛΗΡΟΦΟΡΙΚ", "ΛΟΓΙΣΜΙΚ". But if selling software TO accountants, do NOT use "ΛΟΓΙΣΜΙΚ".',
  '',
  '## RULE 3 — Legal types filter by registration form, not company size',
  'ΑΕ/ΕΠΕ/ΙΚΕ are legal registration types — they do NOT reliably indicate company size.',
  'NEVER filter by legal_types because the user says "large", "big", "small", or "medium" companies.',
  'Leave legal_types empty unless the user explicitly names a legal form (e.g. "only AE companies", "μόνο ανώνυμες εταιρείες").',
  '',
  '## RULE 4 — Digital/web/SEO: use broad retail and service keywords',
  'Almost no Greek company registers under an "e-commerce" or "online" KAD code in GEMI.',
  'When selling digital services (SEO, web design, digital marketing, social media, e-commerce solutions):',
  '- Target ALL retail and service companies as potential buyers: "ΛΙΑΝΙΚ", "ΕΜΠΟΡΙΟ", "ΚΑΤΑΣΤΗΜ", plus relevant verticals.',
  '- has_no_website: true ONLY when selling website CREATION (the prospect has no site yet). For SEO/marketing, leave false — companies with sites also need SEO.',
  '',
  '## RULE 5 — Geography and enrichment defaults',
  'Geography (prefectures): DEFAULT = empty (= all of Greece). Add ONLY if user explicitly names a city, island, or region.',
  'Legal types: DEFAULT = empty. See Rule 3.',
  'has_email / has_phone: ALWAYS false by default. Setting either removes 40-60% of results. Set true ONLY if the user explicitly says they want only companies with email/phone.',
  '',
  '## RULE 6 — Be generous with keywords',
  'Provide 6-8 keyword fragments. Short fragments match more KAD variants. Think broadly — adjacent sectors that also buy this product.',
  '',
  '## CRITICAL OUTPUT RULES',
  '1. filters.activities MUST always be an empty array — never put KAD strings there.',
  '2. activity_keywords: SHORT Greek uppercase fragments only, max 15 characters each.',
  '3. has_email and has_phone MUST be false unless the user explicitly demands contact filtering.',
  '',
  '## Available prefectures (use EXACTLY as shown):',
  ', '.join(PREFECTURES),
  'Notes: ΑΤΤΙΚΗΣ = greater Athens area. Athens specifically: ΑΘΗΝΩΝ, ΑΤΤΙΚΗΣ, ΠΕΙΡΑΙΑ, ΑΝΑΤΟΛΙΚΗΣ ΑΤΤΙΚΗΣ, ΔΥΤΙΚΗΣ ΑΤΤΙΚΗΣ',
  '',
  '## Available legal types (use EXACTLY as shown):',
  'ΑΕ, ΕΠΕ, ΙΚΕ, ΟΕ, ΕΕ, ΑΤΟΜΙΚΗ, Κοιν.Σ.Επ., Συνεταιρισμός',
  '',
  '## Sector keyword reference (Greek uppercase fragments — describe BUYER industries):',
  '- Accounting firms (buy accounting software, office supplies): "ΛΟΓΙΣΤ", "ΦΟΡΟΤΕΧΝ", "ΕΛΕΓΚΤ", "ΟΡΚΩΤ"',
  '- Hotels & accommodation (buy renovation, linen, food, tech): "ΞΕΝΟΔΟΧ", "ΚΑΤΑΛΥΜ", "ΕΝΟΙΚΙΑΖ", "RESORT"',
  '- Restaurants, cafes, bars (buy food, coffee, supplies, POS): "ΕΣΤΙΑΤ", "ΚΑΦΕ", "ΕΠΙΣΙΤΙΣ", "ΕΣΤΙΑΣΗ", "ΤΑΒΕΡΝ", "ΜΠΑΡ"',
  '- Retail shops (buy SEO, software, fixtures, supplies): "ΛΙΑΝΙΚ", "ΕΜΠΟΡΙΟ", "ΚΑΤΑΣΤΗΜ"',
  '- Manufacturing & industry (buy energy, machinery, B2B): "ΒΙΟΜΗΧΑΝ", "ΠΑΡΑΓΩΓ", "ΜΕΤΑΛΛ", "ΧΗΜΙΚ", "ΠΛΑΣΤΙΚ", "ΚΛΩΣΤ"',
  '- Construction companies (buy materials, tools, software): "ΚΑΤΑΣΚΕΥ", "ΟΙΚΟΔΟΜ", "ΕΡΓΟΛΑΒ", "ΤΕΧΝΙΚ"',
  '- Yachts/marine (buy cleaning, fuel, parts, charter services): "ΣΚΑΦ", "ΝΑΥΤ", "ΠΛΟΙ", "ΘΑΛΑΣΣ", "CHARTER", "ΑΛΙΕ", "ΕΛΛΙΜΕΝ"',
  '- IT companies (buy SaaS, infrastructure, dev tools): "ΠΛΗΡΟΦΟΡΙΚ", "ΛΟΓΙΣΜΙΚ", "ΥΠΟΛΟΓΙΣΤ", "ΨΗΦΙΑΚ"',
  '- Healthcare (buy medical supplies, software, equipment): "ΙΑΤΡ", "ΝΟΣΟΚ", "ΦΑΡΜΑΚ", "ΚΛΙΝΙΚ", "ΟΔΟΝΤ"',
  '- Transport/logistics (buy tracking, fuel, software): "ΜΕΤΑΦΟΡ", "ΑΠΟΘΗΚ", "ΔΙΑΜΕΤΑΦΟΡ", "ΦΟΡΤΗΓ"',
  '- Agriculture (buy equipment, chemicals, seeds): "ΓΕΩΡΓ", "ΑΓΡΟΤ", "ΚΤΗΝΟΤΡ"',
  '- Real estate (buy CRM, signage, photography): "ΑΚΙΝΗΤ", "ΜΕΣΙΤ"',
  '- Automotive repair (buy parts, tools, software): "ΑΥΤΟΚΙΝΗΤ", "ΕΠΙΣΚΕΥ", "ΣΥΝΕΡΓΕΙ"',
  '- Beauty salons (buy products, equipment, software): "ΚΟΜΜΩΤ", "ΑΙΣΘΗΤ", "ΕΥΕΞΙ", "SPA"',
  '- Security companies (buy equipment, vetting): "ΑΣΦΑΛΕΙ", "ΦΥΛΑΞ"',
  '- Tourism/travel (buy software, supplies, services): "ΤΟΥΡΙΣΜ", "ΤΑΞΙΔ", "ΠΡΑΚΤΟΡ"',
  '',
  '## Output',
  'Respond ONLY with valid JSON, no markdown fences:',
  '{',
  '  "filters": {',
  '    "prefectures": [],',
  '    "legal_types": [],',
  '    "has_email": false,',
  '    "has_phone": false,',
  '    "has_website": false,',
  '    "has_no_website": false,',
  '    "statuses": ["Ενεργή"],',
  '    "activities": []',
  '  },',
  '  "activity_keywords": ["ΕΣΤΙΑΤ", "ΚΑΦΕ", "ΕΠΙΣΙΤΙΣ", "ΤΑΒΕΡΝ", "ΜΠΑΡ", "ΕΣΤΙΑΣΗ"],',
  '  "explanation": "2-3 sentences in Greek explaining your choices",',
  '  "summary": "Short Greek summary e.g. Εστιαση & Καφε - Πανελλαδικα"',
  '}',
])

IDEAL = {
  "S1": {"label": "πουλάω λογισμικό διαχείρισης σε λογιστικά γραφεία", "ideal_kw": ["ΛΟΓΙΣΤ","ΦΟΡΟΤΕΧΝ","ΕΛΕΓΚΤ","ΟΡΚΩΤ"], "prefecture": None},
  "S2": {"label": "πουλάω ανακαίνιση και επίπλωση σε ξενοδοχεία και καταλύματα", "ideal_kw": ["ΞΕΝΟΔΟΧ","ΚΑΤΑΛΥΜ","ΕΝΟΙΚΙΑΖ","ΤΟΥΡΙΣΜ","RESORT"], "prefecture": None},
  "S3": {"label": "πουλάω καφέ και αναλώσιμα σε εστιατόρια στη Θεσσαλονίκη", "ideal_kw": ["ΕΣΤΙΑΤ","ΚΑΦΕ","ΕΠΙΣΙΤΙΣ","ΕΣΤΙΑΣΗ","ΤΑΒΕΡΝ","ΜΠΑΡ"], "prefecture": "ΘΕΣΣΑΛΟΝΙΚΗΣ"},
  "S4": {"label": "πουλάω φωτοβολταϊκά σε βιομηχανίες και μεγάλες επιχειρήσεις", "ideal_kw": ["ΒΙΟΜΗΧΑΝ","ΠΑΡΑΓΩΓ","ΜΕΤΑΛΛ","ΧΗΜΙΚ","ΤΡΟΦΙΜ","ΠΛΑΣΤΙΚ","ΚΛΩΣΤ"], "prefecture": None},
  "S5": {"label": "πουλάω SEO και digital marketing σε e-commerce καταστήματα", "ideal_kw": ["ΛΙΑΝΙΚ","ΗΛΕΚΤΡΟΝ","ΕΜΠΟΡΙΟ","ΚΑΤΑΣΤΗΜ"], "prefecture": None},
}

def ideal_count(keywords, prefecture=None):
    cond = " OR ".join(f"primary_kad ILIKE '%{k}%'" for k in keywords)
    where = f"status_descr = 'Ενεργή' AND primary_kad IS NOT NULL AND ({cond})"
    if prefecture:
        where += f" AND prefecture_descr = '{prefecture}'"
    cur.execute(f"SELECT COUNT(*) AS cnt FROM companies WHERE {where}")
    return int(cur.fetchone()["cnt"])

def resolve_keywords_to_kads(keywords):
    if not keywords:
        return []
    cond = " OR ".join(f"primary_kad ILIKE $%s" % (i+1) for i in range(len(keywords)))
    # Use parameterized query
    placeholders = " OR ".join([f"primary_kad ILIKE %s"] * len(keywords))
    params = [f"%{k}%" for k in keywords]
    cur.execute(
        f"SELECT DISTINCT primary_kad FROM companies WHERE ({placeholders}) AND primary_kad IS NOT NULL LIMIT 5000",
        params
    )
    return [r["primary_kad"] for r in cur.fetchall()]

def db_count(kads, filters):
    conds = ["status_descr = 'Ενεργή'"]
    params = []
    if kads:
        placeholders = ",".join(["%s"] * len(kads))
        conds.append(f"primary_kad IN ({placeholders})")
        params.extend(kads)
    if filters.get("prefectures"):
        placeholders = ",".join(["%s"] * len(filters["prefectures"]))
        conds.append(f"prefecture_descr IN ({placeholders})")
        params.extend(filters["prefectures"])
    if filters.get("legal_types"):
        placeholders = ",".join(["%s"] * len(filters["legal_types"]))
        conds.append(f"legal_type_descr IN ({placeholders})")
        params.extend(filters["legal_types"])
    if filters.get("has_email"):  conds.append("email IS NOT NULL AND email != ''")
    if filters.get("has_phone"):  conds.append("phone IS NOT NULL AND phone != ''")
    if filters.get("has_website"):   conds.append("url IS NOT NULL AND url != ''")
    if filters.get("has_no_website"): conds.append("(url IS NULL OR url = '')")
    where = " AND ".join(conds)
    cur.execute(f"SELECT COUNT(*) AS cnt FROM companies WHERE {where}", params)
    return int(cur.fetchone()["cnt"])

def call_scout(user_message):
    resp = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://greekleads.gr",
            "X-Title": "GreekLeads Scout Test",
        },
        json={
            "model": "google/gemini-2.5-flash",
            "max_tokens": 2048,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
        },
        timeout=30,
    )
    resp.raise_for_status()
    raw = resp.json()["choices"][0]["message"]["content"].strip()
    # strip markdown fences if present
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return json.loads(raw)

SEP = "=" * 70
print(SEP)
print("SCOUT CALIBRATION TEST — new system prompt")
print(SEP)

results = []

for sid, sc in IDEAL.items():
    print(f"\n{'─'*70}")
    print(f"{sid}: {sc['label']}")
    print(f"{'─'*70}")

    # Ideal
    ideal = ideal_count(sc["ideal_kw"], sc.get("prefecture"))
    print(f"Ideal ({', '.join(sc['ideal_kw'])}): {ideal:,}")

    # Call agent
    try:
        parsed = call_scout(sc["label"])
    except Exception as e:
        print(f"  ERROR calling Scout: {e}")
        results.append({"id": sid, "ideal": ideal, "agent": None, "keywords": [], "filters": {}})
        continue

    kw = [k for k in (parsed.get("activity_keywords") or []) if isinstance(k, str) and len(k) <= 20]
    f  = parsed.get("filters", {})

    print(f"Agent keywords:  {kw}")
    print(f"Agent prefectures: {f.get('prefectures', [])}")
    print(f"Agent legal_types: {f.get('legal_types', [])}")
    print(f"Agent has_email:   {f.get('has_email')}  |  has_phone: {f.get('has_phone')}")
    print(f"Agent explanation: {parsed.get('explanation', '')[:160]}")

    # Check for product-as-keyword bugs
    bugs = []
    bad_kw_s4 = [k for k in kw if "ΦΩΤΟΒΟΛΤ" in k]
    if sid == "S4" and bad_kw_s4:
        bugs.append(f"BUG: used {bad_kw_s4} (solar producers, not buyers!)")
    bad_kw_s1 = [k for k in kw if "ΛΟΓΙΣΜΙΚ" in k or "ΠΛΗΡΟΦΟΡΙΚ" in k]
    if sid == "S1" and bad_kw_s1:
        bugs.append(f"BUG: used {bad_kw_s1} (product category, not buyers!)")
    if f.get("legal_types") and sid == "S4":
        bugs.append(f"BUG: filtered by legal_types={f['legal_types']} (size ≠ legal type)")
    if bugs:
        for b in bugs: print(f"  ⚠  {b}")

    # Resolve KADs and count
    kads = resolve_keywords_to_kads(kw)
    agent_filters = {
        "prefectures": [p for p in f.get("prefectures", []) if p in PREFECTURES],
        "legal_types":  [l for l in f.get("legal_types", []) if l in LEGAL_TYPES],
        "has_email": f.get("has_email", False),
        "has_phone": f.get("has_phone", False),
        "has_website": f.get("has_website", False),
        "has_no_website": f.get("has_no_website", False),
    }
    agent_count = db_count(kads, agent_filters)

    gap = agent_count - ideal
    ratio = agent_count / ideal if ideal > 0 else float("inf")
    print(f"\nKADs resolved: {len(kads)}")
    print(f"Agent count:  {agent_count:,}   Ideal: {ideal:,}   Gap: {gap:+,}   Ratio: {ratio:.2f}x")

    results.append({"id": sid, "ideal": ideal, "agent": agent_count, "keywords": kw, "filters": agent_filters, "bugs": bugs})

# Summary table
print(f"\n\n{SEP}")
print("SUMMARY")
print(f"{'─'*70}")
print(f"{'Scenario':<8} {'Ideal':>10} {'Agent':>10} {'Gap':>10} {'Ratio':>8}  {'Status'}")
print(f"{'─'*70}")
for r in results:
    if r["agent"] is None:
        print(f"{r['id']:<8} {r['ideal']:>10,}  {'ERROR':>10}  {'':>10} {'':>8}  ERROR")
        continue
    gap = r["agent"] - r["ideal"]
    ratio = r["agent"] / r["ideal"] if r["ideal"] > 0 else float("inf")
    if 0.5 <= ratio <= 2.0:
        status = "OK"
    elif ratio < 0.1 or ratio > 5.0:
        status = "CRITICAL"
    else:
        status = "WARN"
    bug_flag = " ⚠ BUG" if r.get("bugs") else ""
    print(f"{r['id']:<8} {r['ideal']:>10,} {r['agent']:>10,} {gap:>+10,} {ratio:>8.2f}x  {status}{bug_flag}")

conn.close()
print(SEP)
