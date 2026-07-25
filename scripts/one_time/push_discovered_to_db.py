"""
push_discovered_to_db.py

Uploads the websites discovered by scripts/discover_websites.py into the
companies table — the proprietary "we found it, ΓΕΜΗ didn't" enrichment layer.

Source : tools/discovered_websites.csv  (status == 'live' rows only)
Writes : companies.discovered_url   ← the found site  (NEW column, kept SEPARATE
                                       from ΓΕΜΗ's `url` so provenance survives —
                                       powers the "βρέθηκε από το GreekLeads"
                                       label + the free/Pro gate)
         companies.website_source  ← 'discovered'      (NEW column)
         companies.{instagram,facebook,linkedin,twitter,tiktok,youtube}_url
                                     ← socials harvested from the live page

Rules:
  - Only 'live' rows are uploaded. skipped / no-response / placeholder / parked
    are ignored — they are not real websites.
  - COALESCE everywhere — an existing value is NEVER overwritten. That makes the
    script idempotent and safe to re-run.
  - ΓΕΜΗ's own `url` column is never touched.
  - No interaction with the social scanner bot: it selects only firms whose
    `url` is non-empty, and we write to `discovered_url`, leaving `url` empty.

Columns are NOT created here (ALTER TABLE on the live 1.67M-row table can block
on locks). Run the migration first — it uses a lock_timeout and fails fast:
    python scripts/migrate_discovery_columns.py

Run from the scripts/ directory:
    python one_time/push_discovered_to_db.py
    python one_time/push_discovered_to_db.py --dry-run    # count only, no writes
"""

import csv
import os
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

CSV_PATH   = Path(__file__).parent.parent.parent / "tools" / "discovered_websites.csv"
BATCH_SIZE = 1_000
DRY_RUN    = "--dry-run" in sys.argv

# Statuses that mean the firm was actually PROBED (not a freemail skip). All of
# these should be stamped discovered_scanned_at so the live bot never re-probes
# the bulk-scanned backlog — only 'live' firms get a discovered_url written.
PROBED_STATUSES = {"live", "no-response", "placeholder", "parked"}

# CSV social key  ->  companies column
SOCIAL_FIELDS = [
    ("instagram", "instagram_url"),
    ("facebook",  "facebook_url"),
    ("linkedin",  "linkedin_url"),
    ("twitter",   "twitter_url"),
    ("tiktok",    "tiktok_url"),
    ("youtube",   "youtube_url"),
]

# order of the VALUES tuple / UPDATE join
VALUE_COLS = ["ar_gemi", "discovered_url", "website_source"] + [c for _, c in SOCIAL_FIELDS]


def bar(done, total, width=40):
    total = max(total, 1)
    pct = done / total
    filled = int(width * pct)
    return "█" * filled + "░" * (width - filled), pct


REQUIRED_COLS = ["discovered_url", "website_source", "discovered_scanned_at"]


def require_columns(conn):
    """Fast metadata check (no lock) that the migration has been run."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'companies' AND column_name = ANY(%s)
        """, (REQUIRED_COLS,))
        have = {r[0] for r in cur.fetchall()}
    missing = [c for c in REQUIRED_COLS if c not in have]
    if missing:
        conn.close()
        sys.exit(
            "\nMissing column(s): " + ", ".join(missing) +
            "\nRun the migration first (it fails fast on locks):"
            "\n    python scripts/migrate_discovery_columns.py\n"
        )


def load_live_rows():
    """Read the CSV → (live rows to upload, all probed ar_gemis, total rows).

    live rows    : status == 'live', carry discovered_url + socials → written.
    probed ids   : every firm actually probed (PROBED_STATUSES) → stamped
                   discovered_scanned_at so the live bot skips the backlog.

    Prints a running counter — the file is ~580k rows and parsing it is the
    first few seconds, so this keeps it from looking frozen.
    """
    rows = []
    probed_ids = []
    total = 0
    with open(CSV_PATH, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            total += 1
            if total % 25_000 == 0:
                sys.stdout.write(f"\r  reading CSV… {total:,} rows")
                sys.stdout.flush()
            status = r.get("status")
            try:
                ar_gemi = int(r["ar_gemi"])
            except (ValueError, KeyError, TypeError):
                continue
            if status in PROBED_STATUSES:
                probed_ids.append(ar_gemi)
            if status != "live":
                continue
            url = (r.get("discovered_url") or "").strip()
            if not url:
                continue
            row = {"ar_gemi": ar_gemi, "discovered_url": url, "website_source": "discovered"}
            for key, col in SOCIAL_FIELDS:
                row[col] = (r.get(key) or "").strip() or None
            rows.append(row)
    sys.stdout.write(f"\r  read {total:,} rows.            \n")
    sys.stdout.flush()
    return rows, probed_ids, total


def main():
    if not CSV_PATH.exists():
        sys.exit(f"Not found: {CSV_PATH}")

    print(f"Reading {CSV_PATH} …")
    rows, probed_ids, total = load_live_rows()

    socials_count = sum(1 for r in rows if any(r[c] for _, c in SOCIAL_FIELDS))
    print(f"Total rows in CSV:            {total:,}")
    print(f"Live websites to upload:      {len(rows):,}")
    print(f"  …of which carry ≥1 social:  {socials_count:,}")
    print(f"Probed firms to stamp:        {len(probed_ids):,}  (so the live bot skips them)")

    if DRY_RUN:
        print("\n--dry-run: nothing written.")
        return
    if not rows and not probed_ids:
        print("\nNothing to upload.")
        return

    print(f"\nWill push in batches of {BATCH_SIZE:,} (COALESCE — never overwrites).")

    print("Connecting…", flush=True)
    conn = psycopg2.connect(os.environ["DATABASE_URL"], connect_timeout=30)
    require_columns(conn)

    update_sql = """
        UPDATE companies AS c SET
          discovered_url = COALESCE(c.discovered_url, v.discovered_url),
          website_source = COALESCE(c.website_source, v.website_source),
          instagram_url  = COALESCE(c.instagram_url,  v.instagram_url),
          facebook_url   = COALESCE(c.facebook_url,   v.facebook_url),
          linkedin_url   = COALESCE(c.linkedin_url,   v.linkedin_url),
          twitter_url    = COALESCE(c.twitter_url,    v.twitter_url),
          tiktok_url     = COALESCE(c.tiktok_url,     v.tiktok_url),
          youtube_url    = COALESCE(c.youtube_url,    v.youtube_url)
        FROM (VALUES %s) AS v(
          ar_gemi, discovered_url, website_source,
          instagram_url, facebook_url, linkedin_url,
          twitter_url, tiktok_url, youtube_url
        )
        WHERE c.ar_gemi = v.ar_gemi
    """

    if rows:
        print(f"\nUploading {len(rows):,} discovered websites:")
        b, pct = bar(0, len(rows))
        sys.stdout.write(f"\r[{b}] {pct:5.1%}  0/{len(rows):,}")  # alive at 0%
        sys.stdout.flush()

    pushed = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        values = [tuple(r[c] for c in VALUE_COLS) for r in batch]
        with conn.cursor() as cur:
            psycopg2.extras.execute_values(cur, update_sql, values)
        conn.commit()

        pushed += len(batch)
        b, pct = bar(pushed, len(rows))
        sys.stdout.write(f"\r[{b}] {pct:5.1%}  {pushed:,}/{len(rows):,}")
        sys.stdout.flush()

    # Stamp discovered_scanned_at for EVERY probed firm (live + no-response +
    # placeholder + parked) so the live bot's pass 2 never re-probes the backlog.
    print(f"\n\nStamping discovered_scanned_at for {len(probed_ids):,} probed firms:")
    b, pct = bar(0, len(probed_ids))
    sys.stdout.write(f"\r[{b}] {pct:5.1%}  0/{len(probed_ids):,}")  # alive at 0%
    sys.stdout.flush()
    stamped = 0
    for i in range(0, len(probed_ids), BATCH_SIZE):
        chunk = probed_ids[i : i + BATCH_SIZE]
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE companies SET discovered_scanned_at = NOW() "
                "WHERE ar_gemi = ANY(%s) AND discovered_scanned_at IS NULL",
                (chunk,),
            )
        conn.commit()
        stamped += len(chunk)
        b, pct = bar(stamped, len(probed_ids))
        sys.stdout.write(f"\r[{b}] {pct:5.1%}  {stamped:,}/{len(probed_ids):,}")
        sys.stdout.flush()

    conn.close()
    print(f"\n\nDone. {pushed:,} discovered websites written to companies.discovered_url"
          f" (source='discovered'), socials filled where empty, "
          f"{len(probed_ids):,} firms stamped as discovery-scanned.")


if __name__ == "__main__":
    main()
