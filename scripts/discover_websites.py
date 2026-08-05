#!/usr/bin/env python3
"""
discover_websites.py — find websites ΓΕΜΗ doesn't know about.

Premise: many active firms have NO url in ΓΕΜΗ but DO have an email on a custom
domain (e.g. info@acme.gr). That domain very often hosts the firm's website.
So: probe http(s)://<email-domain> and, if a real site answers, record it.

Verified motivation: a manual check of ~440 "no website" yacht firms found ~24%
actually had a live site at their email domain.

Scope   : status = 'Ενεργή', url empty, email on a NON-freemail domain
Reads    : companies (READ-ONLY — nothing is written back to the database)
Saves    : tools/discovered_websites.csv  — every firm scanned + its verdict,
           plus any socials/phone harvested from a live page.

Each response is classified: live | parked | placeholder | no-response | error.
Only 'live' means a real website was found.

Resumable & local: progress is tracked from the CSV itself. Stop and restart any
time — firms already in the CSV are skipped. Nothing touches the DB except reads.

Run from the repo root:
    python scripts/discover_websites.py

Tune (env vars):
    DW_WORKERS   concurrent probes       (default 24)
    DW_BATCH     firms per fetch/flush   (default 300)
"""
import csv
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import psycopg2
import requests
from dotenv import load_dotenv

# reuse the shared scan logic (domain probe, freemail set, HTML classify/harvest)
sys.path.insert(0, str(Path(__file__).parent))
from scan_utils import email_domain, probe_domain  # noqa: E402

load_dotenv(Path(__file__).parent / ".env")
DSN = os.getenv("DATABASE_URL")
if not DSN:
    sys.exit("DATABASE_URL not found in scripts/.env")

WORKERS = int(os.getenv("DW_WORKERS", "24"))
BATCH   = int(os.getenv("DW_BATCH", "300"))
OUT_CSV = Path(__file__).parent.parent / "tools" / "discovered_websites.csv"

CSV_COLS = [
    "ar_gemi", "company", "email", "email_domain", "status", "discovered_url",
    "instagram", "facebook", "linkedin", "twitter", "tiktok", "youtube", "phone",
]

_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")


def bar(done, total, width=32):
    total = max(total, 1)
    frac = min(done / total, 1.0)
    filled = int(frac * width)
    return "█" * filled + "░" * (width - filled)


CANDIDATE_WHERE = """
    status_descr = 'Ενεργή'
    AND is_branch IS NOT TRUE
    AND (url IS NULL OR url = '')
    AND email IS NOT NULL AND email <> ''
"""


def count_candidates(conn):
    with conn.cursor() as cur:
        cur.execute(f"SELECT COUNT(*) FROM companies WHERE {CANDIDATE_WHERE}")
        return cur.fetchone()[0]


def fetch_batch(conn, after_ar_gemi, size):
    """Next `size` candidate firms with ar_gemi > after_ar_gemi (PK-ordered)."""
    with conn.cursor() as cur:
        cur.execute(f"""
            SELECT ar_gemi, co_name_el, email
            FROM companies
            WHERE {CANDIDATE_WHERE}
              AND ar_gemi > %s
            ORDER BY ar_gemi
            LIMIT %s
        """, (after_ar_gemi, size))
        return cur.fetchall()


def load_resume():
    """Return (done_ids set, high-water ar_gemi) from an existing CSV, if any."""
    done, high = set(), 0
    if not OUT_CSV.exists():
        return done, high
    with open(OUT_CSV, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            try:
                g = int(row["ar_gemi"])
            except (ValueError, KeyError, TypeError):
                continue
            done.add(g)
            high = max(high, g)
    return done, high


def process_one(item):
    """(ar_gemi, name, email) -> CSV row dict. Runs in a worker thread."""
    ar_gemi, name, email = item
    session = requests.Session()
    session.headers["User-Agent"] = _UA
    try:
        dom = email_domain(email)
        if not dom:
            return {"ar_gemi": ar_gemi, "company": name, "email": email,
                    "email_domain": "", "status": "skipped", "discovered_url": ""}
        res = probe_domain(dom, session)
        h = res["harvest"]
        return {
            "ar_gemi": ar_gemi, "company": name, "email": email,
            "email_domain": dom, "status": res["status"],
            "discovered_url": res["url"] if res["status"] == "live" else "",
            "instagram": h.get("instagram", ""), "facebook": h.get("facebook", ""),
            "linkedin": h.get("linkedin", ""), "twitter": h.get("twitter", ""),
            "tiktok": h.get("tiktok", ""), "youtube": h.get("youtube", ""),
            "phone": (h.get("phones") or [""])[0],
        }
    finally:
        session.close()


def final_stats():
    """Count outcomes from the whole CSV (accurate across resumes)."""
    tally = {}
    with open(OUT_CSV, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            st = row.get("status", "?")
            tally[st] = tally.get(st, 0) + 1
    return tally


def main():
    t0 = time.time()
    print("Connecting (read-only)…")
    conn = psycopg2.connect(DSN, connect_timeout=30)

    total = count_candidates(conn)
    done_ids, cursor = load_resume()
    already = len(done_ids)
    print(f"Candidates (active, no url, custom-domain email): {total:,}")
    if already:
        print(f"Resuming — {already:,} already in CSV, continuing from ar_gemi > {cursor:,}")
    print(f"Saving to: {OUT_CSV}\n")

    if already >= total:
        print("Nothing to do — all candidates already scanned.")
        conn.close()
        _print_summary(total)
        return

    OUT_CSV.parent.mkdir(exist_ok=True)
    new_file = not OUT_CSV.exists()
    f = open(OUT_CSV, "a", newline="", encoding="utf-8-sig")
    writer = csv.DictWriter(f, fieldnames=CSV_COLS, extrasaction="ignore")
    if new_file:
        writer.writeheader()

    tally = {"live": 0, "parked": 0, "placeholder": 0, "no-response": 0, "skipped": 0}
    session_done = 0

    try:
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            while True:
                batch = fetch_batch(conn, cursor, BATCH)
                if not batch:
                    break
                cursor = batch[-1][0]  # advance high-water mark

                # skip any already recorded (only possible right at a resume seam)
                todo = [b for b in batch if b[0] not in done_ids]
                if todo:
                    for rowd in pool.map(process_one, todo):
                        writer.writerow(rowd)
                        done_ids.add(rowd["ar_gemi"])
                        tally[rowd["status"]] = tally.get(rowd["status"], 0) + 1
                    f.flush()
                    session_done += len(todo)

                overall = already + session_done
                elapsed = time.time() - t0
                rate = session_done / elapsed * 3600 if elapsed else 0
                eta_h = (total - overall) / rate if rate else 0
                sys.stdout.write(
                    f"\r  [{bar(overall, total)}] {overall:,}/{total:,}  "
                    f"live={tally['live']:,} park={tally['parked']:,} "
                    f"place={tally['placeholder']:,} none={tally['no-response']:,}  "
                    f"{rate:,.0f}/hr  eta={eta_h:,.1f}h   "
                )
                sys.stdout.flush()
    finally:
        f.close()
        conn.close()
        print()

    _print_summary(total, elapsed=time.time() - t0, session_done=session_done)


def _print_summary(total, elapsed=None, session_done=None):
    t = final_stats()
    scanned   = sum(t.values())
    had_site  = t.get("live", 0)
    parked    = t.get("parked", 0)
    placeh    = t.get("placeholder", 0)
    responded = had_site + parked + placeh
    pct_site  = had_site / scanned * 100 if scanned else 0
    pct_resp  = responded / scanned * 100 if scanned else 0

    print("=" * 60)
    print("  RESULTS")
    print("=" * 60)
    print(f"  Firms scanned:          {scanned:,}")
    print(f"  HAD A WEBSITE (live):   {had_site:,}   ({pct_site:.1f}%)")
    print(f"  Responded but not real: {parked + placeh:,}   "
          f"(parked {parked:,} / placeholder {placeh:,})")
    print(f"  Any response at all:    {responded:,}   ({pct_resp:.1f}%)")
    print(f"  Dead / no response:     {t.get('no-response', 0):,}")
    print(f"  Skipped / error:        {t.get('skipped', 0) + t.get('error', 0):,}")
    print("-" * 60)
    print(f"  → {had_site:,} websites ΓΕΜΗ didn't have — saved locally, NOT in the DB")
    print(f"  → File: {OUT_CSV}")
    if elapsed:
        print(f"  → This run: {session_done:,} scanned in {elapsed/60:.1f} min "
              f"({session_done/(elapsed/3600):,.0f}/hr)")


if __name__ == "__main__":
    main()
