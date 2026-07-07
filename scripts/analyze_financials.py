"""
analyze_financials.py — download and parse all financial PDFs for test firms.
"""
import io, sys, re, os, requests
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pdfplumber
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
API_KEY  = os.getenv("GEMI_FINANCIAL_API_KEY") or os.getenv("GEMI_API_KEY")
BASE_URL = "https://opendata-api.businessportal.gr/api/opendata/v1"
FINANCIAL_IDS = {4, 8, 78, 79}


def get_docs(ar_gemi):
    r = requests.get(f"{BASE_URL}/companies/{ar_gemi}/documents",
                     headers={"api_key": API_KEY}, timeout=30)
    r.raise_for_status()
    return r.json().get("decision", [])


def download_pdf(kak):
    r = requests.get(f"{BASE_URL}/downloadFile", headers={"api_key": API_KEY},
                     params={"key": "assemblyDecision", "elementId": kak},
                     timeout=60, stream=True)
    r.raise_for_status()
    return b"".join(r.iter_content(8192))


def normalise_line(line: str) -> str:
    """Collapse doubled chars only if the line looks fully doubled (bold PDF artifact)."""
    # A fully-doubled line has every char appear twice consecutively
    # Quick heuristic: if >60% of consecutive pairs are identical, collapse
    pairs = [(line[i], line[i+1]) for i in range(0, len(line)-1, 2) if i+1 < len(line)]
    if pairs and sum(1 for a, b in pairs if a == b) / len(pairs) > 0.6:
        return re.sub(r"(.)\1", r"\1", line)
    return line


def parse_num(s: str):
    s = s.strip().replace("−", "-")  # unicode minus
    neg = s.startswith("-")
    s = s.lstrip("-").strip()
    # Greek format: 1.234.567,89 → remove dots, replace comma with dot
    s = s.replace(".", "").replace(",", ".")
    try:
        v = float(s)
        return -v if neg else v
    except:
        return None


def last_number(line: str):
    """Return the last Greek-format number found on a line."""
    nums = re.findall(r"-?[\d]+(?:[.,][\d]+)*", line)
    if not nums:
        return None
    # Prefer numbers that look like currency (have comma or are large)
    for n in reversed(nums):
        v = parse_num(n)
        if v is not None and (abs(v) > 1 or "," in n or "." in n):
            return v
    return parse_num(nums[-1])


LABEL_PATTERNS = {
    "revenue":           re.compile(r"κύκλος\s+εργασιών", re.IGNORECASE),
    "total_assets":      re.compile(r"σύνολο\s+ενεργητικού", re.IGNORECASE),
    "equity":            re.compile(r"κεφάλαια\s+και\s+αποθεματικά", re.IGNORECASE),
    "profit_before_tax": re.compile(r"αποτέλεσμα\s+προ\s+φόρων", re.IGNORECASE),
    "net_profit":        re.compile(r"αποτέλεσμα\s+περιόδου\s+μετά", re.IGNORECASE),
}


def extract_financials(pdf_bytes):
    result = {}
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        raw = "\n".join(p.extract_text() or "" for p in pdf.pages)

    # Process line by line, normalising doubled chars per line
    lines = [normalise_line(ln) for ln in raw.split("\n")]
    text  = "\n".join(lines)

    for key, pat in LABEL_PATTERNS.items():
        m = pat.search(text)
        if m:
            # Take the rest of the line from the match
            line_end = text.find("\n", m.end())
            segment  = text[m.start(): line_end if line_end != -1 else m.start()+200]
            v = last_number(segment)
            if v is not None:
                result[key] = v

    # Fiscal year
    m = re.search(r"Φορολογικό έτος[:\s]*(20\d\d)", text, re.IGNORECASE)
    if not m:
        m = re.search(r"31/12/(20\d\d)", text)
    if m:
        result["period"] = m.group(1)

    return result


def analyze(ar_gemi):
    print(f"\n{'='*70}")
    print(f"  ar_gemi: {ar_gemi}")
    print(f"{'='*70}")

    docs = get_docs(ar_gemi)
    financial = [d for d in docs if int(d.get("decisionSubjectID") or 0) in FINANCIAL_IDS]
    print(f"  Financial docs: {len(financial)}\n")

    by_year = {}
    for d in sorted(financial, key=lambda x: x.get("dateRegistrated") or ""):
        kak  = str(d.get("kak"))
        date = d.get("dateRegistrated", "?")
        print(f"  kak={kak} ({date}) ... ", end="", flush=True)
        try:
            pdf_bytes = download_pdf(kak)
            data = extract_financials(pdf_bytes)
            year = data.get("period", "?")
            rev  = data.get("revenue")
            np_  = data.get("net_profit")
            print(f"year={year}  revenue={rev}  net_profit={np_}")
            # Latest kak per fiscal year wins
            if year not in by_year or kak > by_year[year]["_kak"]:
                data["_kak"]       = kak
                data["_filed"]     = date
                by_year[year] = data
        except Exception as e:
            print(f"ERROR: {e}")

    if not by_year:
        print("  No data extracted.")
        return

    print()
    header = f"{'Year':<6}  {'Revenue':>14}  {'Total Assets':>14}  {'Equity':>14}  {'Net Profit':>14}  Filed"
    print(header)
    print("-" * len(header))
    for year in sorted(by_year):
        d = by_year[year]
        def fmt(v):
            if v is None:
                return f"{'N/A':>14}"
            return f"{v:>14,.0f}"
        row = f"{year:<6}  {fmt(d.get('revenue'))}  {fmt(d.get('total_assets'))}  {fmt(d.get('equity'))}  {fmt(d.get('net_profit'))}  {d.get('_filed','?')}"
        print(row)


if __name__ == "__main__":
    for ar_gemi in ["176138701000", "8538701000"]:
        analyze(ar_gemi)
