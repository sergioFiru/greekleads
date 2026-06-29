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

# ── Fresh scenarios — NOT the calibration set ─────────────────────────
SCENARIOS = [
  {
    "id": "S6",
    "prompt": "πουλάω CRM λογισμικό σε δικηγορικά γραφεία και συμβολαιογράφους",
    "my_keywords": ["ΔΙΚΗΓΟΡ", "ΣΥΜΒΟΛΑΙΟΓΡ", "ΝΟΜΙΚ"],
    "my_guess":    "15,000–25,000",
    "my_notes":    "Law firms + notaries; no legal_type filter; nationwide",
  },
  {
    "id": "S7",
    "prompt": "πουλάω αναλώσιμα και ιατρικό εξοπλισμό σε ιδιωτικές κλινικές και οδοντιατρεία",
    "my_keywords": ["ΙΑΤΡ", "ΟΔΟΝΤ", "ΚΛΙΝΙΚ", "ΦΥΣΙΟΘ", "ΝΟΣΟΚ"],
    "my_guess":    "40,000–60,000",
    "my_notes":    "All private healthcare; should NOT include pharmacies (different buyers)",
  },
  {
    "id": "S8",
    "prompt": "πουλάω βιολογικά και προϊόντα υγιεινής διατροφής σε ειδικά καταστήματα και delicatessen",
    "my_keywords": ["ΒΙΟΛΟΓ", "ΥΓΙΕΙΝΗ", "ΤΡΟΦΙΜ", "ΛΙΑΝΙΚ", "ΦΥΣΙΚ"],
    "my_guess":    "15,000–30,000",
    "my_notes":    "Specialty food retail; ΒΙΟΛΟΓ is the key differentiator",
  },
  {
    "id": "S9",
    "prompt": "πουλάω GPS tracking και λογισμικό διαχείρισης στόλου σε εταιρείες μεταφορών και courier",
    "my_keywords": ["ΜΕΤΑΦΟΡ", "ΦΟΡΤΗΓ", "ΔΙΑΜΕΤΑΦΟΡ", "ΤΑΧΥΔΡ", "ΑΠΟΘΗΚ", "LOGISTICS"],
    "my_guess":    "50,000–80,000",
    "my_notes":    "Transport/logistics buyers; GPS is the product — should NOT appear as keyword",
  },
  {
    "id": "S10",
    "prompt": "πουλάω λογισμικό μισθοδοσίας σε λογιστικά γραφεία και τμήματα HR μεγάλων εταιρειών",
    "my_keywords": ["ΛΟΓΙΣΤ", "ΦΟΡΟΤΕΧΝ", "ΕΛΕΓΚΤ", "ΟΡΚΩΤ"],
    "my_guess":    "18,000–25,000",
    "my_notes":    "Payroll software → buyers are accountants; 'HR dept of large companies' is vague, should NOT trigger legal_type filter",
  },
]

def ideal_count(keywords, prefecture=None):
    parts = [f"primary_kad ILIKE '%{k}%'" for k in keywords]
    cond = " OR ".join(parts)
    where = f"status_descr = 'Ενεργή' AND primary_kad IS NOT NULL AND ({cond})"
    if prefecture:
        where += f" AND prefecture_descr = '{prefecture}'"
    cur.execute(f"SELECT COUNT(*) AS cnt FROM companies WHERE {where}")
    return int(cur.fetchone()["cnt"])

def resolve_keywords_to_kads(keywords):
    if not keywords:
        return []
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
    if filters.get("has_email"):      conds.append("email IS NOT NULL AND email != ''")
    if filters.get("has_phone"):      conds.append("phone IS NOT NULL AND phone != ''")
    if filters.get("has_website"):    conds.append("url IS NOT NULL AND url != ''")
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
            "X-Title": "GreekLeads Scout Fresh Test",
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
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
    return json.loads(raw)

SEP = "=" * 72

print(SEP)
print("SCOUT FRESH CALIBRATION — 5 new scenarios")
print(SEP)

results = []

for sc in SCENARIOS:
    print(f"\n{'─'*72}")
    print(f"{sc['id']}: {sc['prompt']}")
    print(f"{'─'*72}")

    # My prediction
    my_count = ideal_count(sc["my_keywords"])
    print(f"MY keywords:  {sc['my_keywords']}")
    print(f"MY count:     {my_count:,}   (my guess was {sc['my_guess']})")
    print(f"MY rationale: {sc['my_notes']}")

    # Agent
    try:
        parsed = call_scout(sc["prompt"])
    except Exception as e:
        print(f"  ERROR: {e}")
        results.append({"id": sc["id"], "my": my_count, "agent": None, "guess": sc["my_guess"]})
        continue

    kw = [k for k in (parsed.get("activity_keywords") or []) if isinstance(k, str) and len(k) <= 20]
    f  = parsed.get("filters", {})

    print(f"\nAGENT keywords:    {kw}")
    print(f"AGENT prefectures: {f.get('prefectures', [])}")
    print(f"AGENT legal_types: {f.get('legal_types', [])}")
    print(f"AGENT has_email:   {f.get('has_email')}  |  has_phone: {f.get('has_phone')}")
    print(f"AGENT explanation: {parsed.get('explanation','')[:200]}")

    # Bugs check
    bugs = []
    if f.get("legal_types"):
        bugs.append(f"BUG-Rule3: used legal_types={f['legal_types']} for size, not form")
    if f.get("has_email") or f.get("has_phone"):
        bugs.append(f"BUG-Rule5: enrichment filter set (shrinks results)")
    # Check if product keywords leaked in
    product_kw_map = {
        "S6": ["CRM", "ΛΟΓΙΣΜΙΚ", "ΠΛΗΡΟΦΟΡΙΚ"],
        "S9": ["GPS", "TRACKING", "ΕΝΤΟΠΙΣ"],
        "S10": ["ΜΙΣΘΟΔ", "ΠΑΡΟΧ"],
    }
    for bad in product_kw_map.get(sc["id"], []):
        if any(bad in k for k in kw):
            bugs.append(f"BUG-Rule2: '{bad}' is product keyword, not buyer")

    for b in bugs:
        print(f"  ⚠  {b}")

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

    ratio = agent_count / my_count if my_count > 0 else float("inf")
    gap   = agent_count - my_count
    print(f"\nKADs resolved: {len(kads)}")
    print(f"AGENT count:  {agent_count:,}   MY count: {my_count:,}   Gap: {gap:+,}   Ratio: {ratio:.2f}x")

    results.append({
        "id": sc["id"], "my": my_count, "agent": agent_count,
        "guess": sc["my_guess"], "keywords": kw, "bugs": bugs,
    })

# Summary
print(f"\n\n{SEP}")
print("SUMMARY — comparison of my analysis vs agent")
print(f"{'─'*72}")
print(f"{'':3} {'Scenario':<6} {'My guess':<22} {'My count':>10} {'Agent':>10} {'Ratio':>8}  Status")
print(f"{'─'*72}")
for r in results:
    if r["agent"] is None:
        print(f"    {r['id']:<6} {r['guess']:<22} {r['my']:>10,}  {'ERROR':>10}  {'':>8}")
        continue
    ratio = r["agent"] / r["my"] if r["my"] > 0 else float("inf")
    gap   = r["agent"] - r["my"]
    if 0.5 <= ratio <= 2.0:   status = "OK"
    elif ratio < 0.2 or ratio > 5.0: status = "CRITICAL"
    else:                     status = "WARN"
    bug_flag = " ⚠ BUG" if r.get("bugs") else ""
    print(f"    {r['id']:<6} {r['guess']:<22} {r['my']:>10,} {r['agent']:>10,} {ratio:>8.2f}x  {status}{bug_flag}")

conn.close()
print(SEP)
