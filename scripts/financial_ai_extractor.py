"""
financial_ai_extractor.py — extract structured financial data from a single
document using Gemini via OpenRouter. No regex, no pdfplumber text extraction:
PDFs go straight to Gemini as a native file (it reads scanned and digital pages
alike); the only exception is spreadsheets, which Gemini has no native "vision"
understanding of at all — those get their cells dumped to plain text first
(openpyxl), purely so there's something for Gemini to read, not as a shortcut.

Pure extraction module — no DB, no R2, no bulk loop. Meant to be called with
raw bytes for one document at a time, e.g. by scripts/one_time/
test_financial_ai_extraction.py right now, and later by the on-demand
"Retrieve" backend for the company-page button.

Returns the same 6 fields already live in the `financial_statements` table:
fiscal_year, revenue, total_assets, equity, profit_before_tax, net_profit.
"""

import base64
import json
import os
from io import BytesIO

import requests
from openpyxl import load_workbook

MODEL       = "google/gemini-2.5-flash"
MAX_TOKENS  = 8192  # Gemini 2.5's "thinking" tokens eat the budget silently if too low — Scout hit this at 2048
REQUEST_TIMEOUT = 90

FIELDS = ["fiscal_year", "revenue", "total_assets", "equity", "profit_before_tax", "net_profit"]

PROMPT = """Είσαι ειδικός στην ανάλυση ελληνικών δημοσιευμένων οικονομικών καταστάσεων \
(ΓΕΜΗ). Το έγγραφο που ακολουθεί είναι μία δημοσιευμένη οικονομική κατάσταση \
(ισολογισμός / κατάσταση αποτελεσμάτων) μιας ελληνικής εταιρείας. Μπορεί να είναι \
αυτοματοποιημένη καταχώριση (καθαρή μορφή, πίνακες) ή σκαναρισμένο/χειρόγραφο \
έγγραφο. Μπορεί επίσης να περιέχει στήλες σύγκρισης με προηγούμενη χρήση.

Εξήγαγε ΜΟΝΟ τα στοιχεία της ΚΥΡΙΑΣ / ΤΡΕΧΟΥΣΑΣ χρήσης του εγγράφου (όχι τη στήλη \
σύγκρισης προηγούμενης χρήσης, αν υπάρχει).

Επίστρεψε ΑΠΟΚΛΕΙΣΤΙΚΑ ένα JSON object με ακριβώς αυτά τα πεδία:
{
  "found": true/false,           // false ΜΟΝΟ αν το έγγραφο δεν είναι καθόλου οικονομική κατάσταση
  "fiscal_year": 2023,           // ακέραιος, το έτος της χρήσης στην οποία αναφέρεται (όχι έτος δημοσίευσης)
  "revenue": 4650000.0,          // Κύκλος εργασιών / Πωλήσεις (καθαρός)
  "total_assets": 3300000.0,     // Σύνολο ενεργητικού
  "equity": 1520000.0,           // Σύνολο καθαρής θέσης / Ίδια κεφάλαια
  "profit_before_tax": 408000.0, // Κέρδη/ζημίες προ φόρων
  "net_profit": 318000.0,        // Καθαρά κέρδη/ζημίες (μετά φόρων)
  "notes": ""                    // σύντομη σημείωση αν κάτι είναι ασαφές ή λείπει
}

Κανόνες μορφοποίησης — ΠΟΛΥ ΣΗΜΑΝΤΙΚΟ:
- Όλες οι χρηματικές τιμές ως ΚΑΘΑΡΟΙ ΑΡΙΘΜΟΙ (JSON number, όχι string), σε ευρώ, \
χωρίς σύμβολο €, χωρίς διαχωριστικά χιλιάδων. Μετέτρεψε την ελληνική μορφή \
(π.χ. "3.300.000,00") σε 3300000.0.
- Αρνητικές τιμές (ζημίες) ως αρνητικός αριθμός (π.χ. -94000.0), όχι σε παρένθεση.
- Αν ένα πεδίο δεν βρίσκεται καθόλου στο έγγραφο, βάλε null — ΜΗΝ μαντέψεις.
- Αν το έγγραφο δεν είναι οικονομική κατάσταση, βάλε "found": false και όλα τα \
υπόλοιπα πεδία null.
- Απάντησε ΜΟΝΟ με το JSON object, χωρίς κανένα άλλο κείμενο.
"""


def _headers():
    key = os.environ["OPENROUTER_API_KEY"]
    return {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def _call_openrouter(content) -> dict:
    """content: either a plain string, or an OpenRouter multi-part content list."""
    resp = requests.post(
        "https://openrouter.ai/api/v1/chat/completions",
        headers=_headers(),
        json={
            "model": MODEL,
            "messages": [{"role": "user", "content": content}],
            "max_tokens": MAX_TOKENS,
            "response_format": {"type": "json_object"},
        },
        timeout=REQUEST_TIMEOUT,
    )
    if resp.status_code != 200:
        return {"error": f"openrouter_http_{resp.status_code}: {resp.text[:300]}"}

    data = resp.json()
    try:
        raw = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        return {"error": f"unexpected_response_shape: {json.dumps(data)[:300]}"}

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {"error": f"non_json_reply: {raw[:300]}"}

    result = {f: parsed.get(f) for f in FIELDS}
    result["found"] = bool(parsed.get("found", True))
    result["notes"] = parsed.get("notes") or ""
    result["error"] = None
    return result


def _xlsx_to_text(xlsx_bytes: bytes) -> str:
    wb = load_workbook(BytesIO(xlsx_bytes), data_only=True, read_only=True)
    lines = []
    for sheet in wb.worksheets:
        lines.append(f"--- Φύλλο: {sheet.title} ---")
        for row in sheet.iter_rows(values_only=True):
            cells = ["" if v is None else str(v) for v in row]
            if any(c.strip() for c in cells):
                lines.append("\t".join(cells))
    return "\n".join(lines)


def extract_financials(file_bytes: bytes, ext: str, filename: str = "document") -> dict:
    """
    ext: 'pdf', 'xlsx', or 'xls' (case-insensitive, leading dot optional).
    Returns a dict with keys: found, fiscal_year, revenue, total_assets, equity,
    profit_before_tax, net_profit, notes, error (error is None on success).
    """
    ext = ext.lower().lstrip(".")

    if ext == "pdf":
        b64 = base64.b64encode(file_bytes).decode()
        content = [
            {"type": "text", "text": PROMPT},
            {"type": "file", "file": {
                "filename": filename,
                "file_data": f"data:application/pdf;base64,{b64}",
            }},
        ]
        return _call_openrouter(content)

    if ext == "xlsx":
        text = _xlsx_to_text(file_bytes)
        return _call_openrouter(PROMPT + "\n\n--- ΠΕΡΙΕΧΟΜΕΝΟ ΥΠΟΛΟΓΙΣΤΙΚΟΥ ΦΥΛΛΟΥ ---\n" + text)

    if ext == "xls":
        # Legacy binary Excel format — no real doc has shown up yet to test against
        # (all 252k downloaded so far are PDF). openpyxl can't read it; would need
        # xlrd<2.0. Not implemented until a real .xls actually appears.
        return {f: None for f in FIELDS} | {
            "found": False, "notes": "", "error": "xls_not_yet_implemented",
        }

    return {f: None for f in FIELDS} | {
        "found": False, "notes": "", "error": f"unsupported_ext:{ext}",
    }
