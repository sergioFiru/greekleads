"""
build_retry_list.py

Reads web_scan_results.json and produces web_scan_retry.json — a list of
entries that should be re-scanned:

  1. connection_error  — domain unreachable (network blip, DNS, SSL)
  2. path_url         — DB URL contains a path/subpage; the root homepage
                        should be scanned instead and the URL updated in DB

Run from the scripts/ directory:
    python one_time/build_retry_list.py
"""

import json
import sys
from pathlib import Path
from urllib.parse import urlparse

RESULTS_JSON = Path(__file__).parent.parent / "web_scan_results.json"
RETRY_JSON   = Path(__file__).parent.parent / "web_scan_retry.json"


def root_url(raw: str) -> str:
    raw = raw.strip()
    if not raw:
        return ""
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw.lstrip("/")
    try:
        p = urlparse(raw)
    except ValueError:
        return ""
    if not p.netloc:
        return ""
    return f"{p.scheme}://{p.netloc}"


def has_path(url: str) -> bool:
    raw = url.strip()
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw.lstrip("/")
    try:
        p = urlparse(raw)
        return bool(p.path and p.path not in ("", "/"))
    except Exception:
        return False


def main():
    if not RESULTS_JSON.exists():
        print(f"Not found: {RESULTS_JSON}")
        sys.exit(1)

    with RESULTS_JSON.open(encoding="utf-8") as f:
        data = json.load(f)

    print(f"Total results: {len(data):,}")

    retry = []

    for row in data:
        url = row.get("url", "")
        error = row.get("error")

        if error == "connection_error":
            retry.append({
                "ar_gemi":      row["ar_gemi"],
                "name":         row.get("name", ""),
                "url":          url,
                "root_url":     root_url(url),
                "retry_reason": "connection_error",
            })
        elif not error and has_path(url):
            retry.append({
                "ar_gemi":      row["ar_gemi"],
                "name":         row.get("name", ""),
                "url":          url,
                "root_url":     root_url(url),
                "retry_reason": "path_url",
            })

    conn_errors = sum(1 for r in retry if r["retry_reason"] == "connection_error")
    path_urls   = sum(1 for r in retry if r["retry_reason"] == "path_url")

    print(f"  connection_error entries: {conn_errors:,}")
    print(f"  path_url entries:         {path_urls:,}")
    print(f"  Total retry list:         {len(retry):,}")

    with RETRY_JSON.open("w", encoding="utf-8") as f:
        json.dump(retry, f, ensure_ascii=False, indent=2)

    print(f"\nWritten → {RETRY_JSON}")


if __name__ == "__main__":
    main()
