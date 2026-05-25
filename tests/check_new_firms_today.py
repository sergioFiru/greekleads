"""
check_new_firms_today.py

Every CHECK_INTERVAL_MINUTES, fetches companies sorted by -incorporationDate,
skips garbage dates (future years), collects all firms with incorporationDate = today,
stops when it hits a valid past date.

Compares the set of arGemi numbers between checks.
If new ones appear → DB is live-updated, not a daily batch.

Rate limit: 8 req/min. We sleep 8s between paginated requests if needed.
"""

import time
import requests
from datetime import date, datetime

API_KEY = "WTUvCLAtgKAYTZ2rnDBC47B9A4ZEeDdZ"
BASE_URL = "https://opendata-api.businessportal.gr/api/opendata/v1"
CHECK_INTERVAL_MINUTES = 10
MAX_PAGES = 20  # safety cap


def get_today_firms():
    today = date.today().isoformat()
    current_year = date.today().year
    found = {}  # arGemi -> company dict
    offset = 0

    for page in range(MAX_PAGES):
        resp = requests.get(
            f"{BASE_URL}/companies",
            headers={"api_key": API_KEY},
            params={
                "resultsSortBy": "-incorporationDate",
                "resultsSize": 200,
                "resultsOffset": offset,
            },
            timeout=15,
        )
        resp.raise_for_status()
        companies = resp.json().get("searchResults", [])

        if not companies:
            break

        done = False
        for c in companies:
            d = c.get("incorporationDate", "")
            if not d:
                continue
            year = int(d[:4]) if d[:4].isdigit() else 9999

            if year > current_year:
                continue          # garbage date, skip
            if d == today:
                found[c["arGemi"]] = c
            elif d < today:
                done = True       # passed today's entries, stop
                break

        if done:
            break

        offset += 200
        if page < MAX_PAGES - 1:
            time.sleep(8)

    return today, found


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")


def run():
    log(f"Starting. Checking every {CHECK_INTERVAL_MINUTES} min. Ctrl-C to stop.\n")
    prev = None

    while True:
        log("Fetching...")
        try:
            today, current = get_today_firms()

            log(f"Firms with incorporationDate = {today}: {len(current)}")

            if prev is None:
                log("Baseline set. Waiting for next check to compare.")
            else:
                new = set(current) - set(prev)
                if new:
                    log(f"*** {len(new)} NEW firm(s) appeared! DB is LIVE. ***")
                    for argemi in new:
                        c = current[argemi]
                        log(f"    arGemi={argemi}  date={c.get('incorporationDate')}")
                else:
                    log("No new firms since last check.")

            prev = current

        except Exception as e:
            log(f"ERROR: {e}")

        print()
        log(f"Sleeping {CHECK_INTERVAL_MINUTES} min...")
        time.sleep(CHECK_INTERVAL_MINUTES * 60)


if __name__ == "__main__":
    run()
