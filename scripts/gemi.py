"""
ΓΕΜΗ API client. Single place for all API calls.
Rate limit: 8 req/min — callers are responsible for sleeping between calls.
"""

import os
import requests

BASE_URL = "https://opendata-api.businessportal.gr/api/opendata/v1"
TIMEOUT  = 60


def _get(path, params=None):
    resp = requests.get(
        f"{BASE_URL}{path}",
        headers={"api_key": os.getenv("GEMI_API_KEY")},
        params=params,
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def fetch_companies(sort="+arGemi", size=200, offset=0):
    return _get("/companies", {
        "resultsSortBy": sort,
        "resultsSize":   size,
        "resultsOffset": offset,
    })


def fetch_company(ar_gemi):
    return _get(f"/companies/{ar_gemi}")
