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
    dot_count   = s.count(".")
    comma_count = s.count(",")

    # English decimal: single dot, no comma, ≤2 digits after dot (e.g. "371628.32")
    if dot_count == 1 and comma_count == 0 and len(s.split(".")[1]) <= 2:
        try:
            v = float(s)
            return -v if neg else v
        except:
            return None

    # US format: comma=thousands, period=decimal (e.g. "1,290,871.83", "845,368.27")
    # Last separator is a period AND ≤2 digits after it AND at least one comma before it
    if dot_count == 1 and comma_count >= 1:
        last_dot_pos = s.rfind(".")
        after_dot = s[last_dot_pos + 1:]
        last_comma_pos = s.rfind(",")
        if len(after_dot) <= 2 and last_comma_pos < last_dot_pos:
            s_us = s.replace(",", "")  # remove thousands commas, keep decimal dot
            try:
                v = float(s_us)
                return -v if neg else v
            except:
                pass

    # Greek format: 1.234.567,89 → remove dots, replace comma with dot
    s = s.replace(".", "").replace(",", ".")
    try:
        v = float(s)
        return -v if neg else v
    except:
        return None


_NUM_RE = re.compile(r"-?[\d]+(?:[.,][\d]+)*")


def _significant_nums(segment: str):
    """Return list of significant financial numbers (not single digits/years) from segment."""
    out = []
    for raw in _NUM_RE.findall(segment):
        v = parse_num(raw)
        if v is None:
            continue
        # Skip bare year integers (1900-2100) with no decimal component
        if 1900 <= v <= 2100 and "," not in raw and "." not in raw:
            continue
        if abs(v) > 1 or "," in raw or "." in raw:
            out.append(v)
    return out


def _first_num(segment: str):
    nums = _significant_nums(segment)
    return nums[0] if nums else None


def _two_nums(segment: str):
    nums = _significant_nums(segment)
    return (nums[0] if nums else None), (nums[1] if len(nums) > 1 else None)


def _find_value(text: str, patterns: list):
    """Try each pattern; return (after_label_segment, match) for first that has a number."""
    for pat in patterns:
        for m in pat.finditer(text):
            line_end = text.find("\n", m.end())
            after = text[m.end(): line_end if line_end != -1 else m.end() + 300]
            if _significant_nums(after):
                return after, m
    return None, None


# ── patterns (ordered by preference within each field) ───────────────────────
_P = {
    "revenue": [
        # accent-insensitive: κύκλος / κυκλος, εργασιών / εργασιων
        re.compile(r"κ[υύ]κλος\s+εργασι[ωώ]ν", re.IGNORECASE),
    ],
    "gross_profit": [
        re.compile(r"μικτ[οό]\s+αποτ[εέ]λεσμα", re.IGNORECASE),
        re.compile(r"μικτ[οό]\s+κ[εέ]ρδος", re.IGNORECASE),
    ],
    "ebit": [
        re.compile(r"αποτελ[εέ]σματα?\s+προ\s+τ[οό]κων\s+και\s+φ[οό]ρων", re.IGNORECASE),
        re.compile(r"κ[εέ]ρδη\s+προ\s+τ[οό]κων[,\s]+φ[οό]ρων", re.IGNORECASE),
    ],
    "profit_before_tax": [
        re.compile(r"αποτ[εέ]λεσμα\s+προ\s+φ[οό]ρων", re.IGNORECASE),
        re.compile(r"κ[εέ]ρδη[/\s]*ζημ[ίι][εέ]ς?\s+προ\s+φ[οό]ρων", re.IGNORECASE),
    ],
    "net_profit": [
        re.compile(r"αποτ[εέ]λεσμα\s+περι[οό]δου\s+μετ[άα]", re.IGNORECASE),
        re.compile(r"κ[εέ]ρδη[/\s]*ζημ[ίι][εέ]ς?\s+(?:χρ[ήη]σ(?:[εέ]ως?|[ηή]ς?)\s+)?μετ[άα]\s+φ[οό]ρ", re.IGNORECASE),
        re.compile(r"αποτ[εέ]λεσμα\s+χρ[ήη]σ(?:[εέ]ως?|[ηή]ς?)\s+μετ[άα]", re.IGNORECASE),
    ],
    "total_assets": [
        re.compile(r"σ[υύ]νολο\s+ενεργητικο[υύ]", re.IGNORECASE),
        re.compile(r"σ[υύ]νολο\s+περιουσιακ[ωώ]ν\s+στοιχε[ίι]ων", re.IGNORECASE),
        # simplified/abbreviated format: "Σύνολο Ενεργητικού" as standalone line
        re.compile(r"σ[υύ]νολο\s+ενεργητικ", re.IGNORECASE),
    ],
    "equity": [
        # "Σύνολο καθαρής θέσης" but NOT "...και υποχρεώσεων"
        re.compile(r"σ[υύ]νολο\s+καθαρ[ήη]ς\s+θ[εέ]σης(?!\s+και\s+υπο)", re.IGNORECASE),
        re.compile(r"κεφ[αά]λαια\s+και\s+αποθεματικ[αά]", re.IGNORECASE),
        re.compile(r"[ίι]δια\s+κεφ[αά]λαια(?!\s+μειοψ)", re.IGNORECASE),
    ],
    "cash": [
        re.compile(r"ταμειακ[αά]\s+διαθ[εέ]σιμα", re.IGNORECASE),
    ],
    "short_term_liabilities": [
        re.compile(r"σ[υύ]νολο\s+βραχυπρ[οό]θεσμ", re.IGNORECASE),
        re.compile(r"βραχυπρ[οό]θεσμες\s+υποχρε[ωώ]σεις", re.IGNORECASE),
    ],
    "long_term_liabilities": [
        re.compile(r"σ[υύ]νολο\s+μακροπρ[οό]θεσμ", re.IGNORECASE),
        re.compile(r"μακροπρ[οό]θεσμες\s+υποχρε[ωώ]σεις", re.IGNORECASE),
    ],
}


def extract_financials(pdf_bytes: bytes) -> dict:
    """
    Parse a GEMI financial PDF and return a dict with:
      revenue, prior_year_revenue, gross_profit, ebit,
      profit_before_tax, net_profit, total_assets, equity,
      cash, short_term_liabilities, long_term_liabilities,
      fiscal_year (int), fiscal_year_start, fiscal_year_end (DD/MM/YYYY strings)

    Returns empty dict if the PDF yields no text (scanned image / bad OCR).
    Current-year value is always the LEFT column; prior-year is the RIGHT column.
    """
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        raw = "\n".join(p.extract_text() or "" for p in pdf.pages)

    lines = [normalise_line(ln) for ln in raw.split("\n")]
    text  = "\n".join(lines)

    result: dict = {}

    for key, patterns in _P.items():
        seg, _ = _find_value(text, patterns)
        if seg is None:
            continue
        if key == "revenue":
            curr, prev = _two_nums(seg)
            if curr is not None:
                result["revenue"] = curr
            if prev is not None:
                result["prior_year_revenue"] = prev
        else:
            v = _first_num(seg)
            if v is not None:
                result[key] = v

    # Fiscal year dates from "χρήση 01/01/2023 έως 31/12/2023" or similar
    date_m = re.search(
        r"(?:χρήσ(?:ης?|εως?|η)|από)\s+"
        r"(\d{1,2}[/.]?\d{1,2}[/.]?\d{4})"
        r"\s*(?:[-–—]|έως|μέχρι)\s*"
        r"(\d{1,2}[/.]?\d{1,2}[/.]?\d{4})",
        text, re.IGNORECASE,
    )
    if date_m:
        result["fiscal_year_start"] = date_m.group(1).replace(".", "/")
        result["fiscal_year_end"]   = date_m.group(2).replace(".", "/")

    # Fiscal year integer — from "31/12/20XX" or "Φορολογικό έτος 20XX"
    fy_m = re.search(r"31/12/(20\d\d)", text)
    if not fy_m:
        fy_m = re.search(r"Φορολογικό\s+έτος[:\s]*(20\d\d)", text, re.IGNORECASE)
    if fy_m:
        result["fiscal_year"] = int(fy_m.group(1))

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
