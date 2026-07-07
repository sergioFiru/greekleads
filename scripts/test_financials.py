"""
test_financials.py

Quick test: fetch financial statement documents for a few firms,
download one PDF, and print what we find.

Usage:
    python test_financials.py

Uses GEMI_FINANCIAL_API_KEY from .env (falls back to GEMI_API_KEY).
"""

import io
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import requests

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

load_dotenv(Path(__file__).parent / ".env")

API_KEY  = os.getenv("GEMI_FINANCIAL_API_KEY") or os.getenv("GEMI_API_KEY")
BASE_URL = "https://opendata-api.businessportal.gr/api/opendata/v1"
TIMEOUT  = 30

# Document types that are financial statements
FINANCIAL_SUBJECT_IDS = {4, 8, 78, 79}

SUBJECT_LABELS = {
    4:  "Ανακοίνωση δημοσίευσης ισολογισμού",
    8:  "Ανακοίνωση έγκρισης οικονομικών καταστάσεων",
    78: "Έγκριση οικονομικών καταστάσεων (ΓΣ)",
    79: "Έγκριση οικονομικών καταστάσεων (ΓΣ) - τύπος 2",
}

TEST_FIRMS = [
    "176138701000",
    "8538701000",
]


def get_documents(ar_gemi: str) -> list:
    resp = requests.get(
        f"{BASE_URL}/companies/{ar_gemi}/documents",
        headers={"api_key": API_KEY},
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    return data.get("decision", []) or data.get("decisions", []) or (data if isinstance(data, list) else [])


def download_pdf(kak: str, dest: Path) -> bool:
    resp = requests.get(
        f"{BASE_URL}/downloadFile",
        headers={"api_key": API_KEY},
        params={"key": "assemblyDecision", "elementId": kak},
        timeout=60,
        stream=True,
    )
    resp.raise_for_status()
    with dest.open("wb") as f:
        for chunk in resp.iter_content(chunk_size=8192):
            f.write(chunk)
    return True


def main():
    if not API_KEY:
        print("ERROR: No API key found. Set GEMI_FINANCIAL_API_KEY or GEMI_API_KEY in scripts/.env")
        sys.exit(1)

    print(f"Using API key: {API_KEY[:8]}...\n")

    first_pdf_kak  = None
    first_pdf_name = None

    for ar_gemi in TEST_FIRMS:
        print(f"{'='*60}")
        print(f"  ar_gemi: {ar_gemi}")
        print(f"{'='*60}")

        try:
            docs = get_documents(ar_gemi)
        except Exception as e:
            print(f"  ERROR fetching documents: {e}\n")
            continue

        print(f"  Total documents returned: {len(docs)}")

        # Show raw structure of first doc so we know the field names
        if docs:
            print(f"\n  First doc (raw keys): {list(docs[0].keys())}")
            print(f"  First doc sample:     {docs[0]}\n")

        financial = [
            d for d in docs
            if int(d.get("decisionSubjectID") or 0) in FINANCIAL_SUBJECT_IDS
        ]

        print(f"  Financial docs found: {len(financial)}")
        for d in sorted(financial, key=lambda x: x.get("dateRegistrated") or ""):
            subj_id = d.get("decisionSubjectID")
            kak     = d.get("kak")
            date    = d.get("dateRegistrated") or d.get("dateAnnounced") or "?"
            summary = d.get("summary") or ""
            label   = SUBJECT_LABELS.get(int(subj_id or 0), f"subjectID={subj_id}")
            print(f"    [{date}] {label}")
            print(f"             summary: {summary[:120]}")
            print(f"             kak={kak}  url={d.get('assemblyDecisionUrl') or '-'}")
            if first_pdf_kak is None and kak:
                first_pdf_kak  = str(kak)
                first_pdf_name = f"test_{ar_gemi}_{kak}.pdf"

        print()

    # Download the first PDF we found
    if first_pdf_kak:
        dest = Path(__file__).parent / first_pdf_name
        print(f"Downloading PDF (kak={first_pdf_kak}) → {dest.name} ...")
        try:
            download_pdf(first_pdf_kak, dest)
            size = dest.stat().st_size
            magic = dest.read_bytes()[:8]
            print(f"  Size:  {size:,} bytes")
            print(f"  Magic: {magic}")
            print(f"  Is PDF: {magic[:4] == b'%PDF'}")
        except Exception as e:
            print(f"  ERROR downloading: {e}")
    else:
        print("No financial PDFs found to download.")


if __name__ == "__main__":
    main()
