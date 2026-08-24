"""
cleanup_shared_favicon_domains.py — remove favicons fetched from a vendor
domain shared by >= MIN_SHARED other companies (same "shared vendor site
mistaken for the firm's own identity" bug as cleanup_shared_domain_favicons.py,
but caught via the favicon's source_url domain instead of email domain — see
shared_favicon_domain_report.py for the full explanation).

Scope of THIS script:
  - company_favicons.status = 'ok'
  - source_url's domain (host, www-stripped) is shared by >= MIN_SHARED other
    companies' live favicons, and is NOT in PLATFORM_DOMAINS (WordPress/Wix/
    Squarespace/etc. generic-but-real site icons — a separate, not-acted-on
    judgment call)

For each match:
  1. Delete its company_favicons R2 object
  2. Delete its company_favicons row

Deliberately does NOT touch companies.url / discovered_url / website_source —
unlike the email-domain cleanup, most of these favicons come from the
OFFICIALLY REGISTERED ΓΕΜΗ `url` field, which stays a valid contact link even
though its favicon is a generic vendor icon, not the firm's own logo. The
company just falls back to its letter-avatar until a real one is found.

Read scan first, nothing destructive without --dry-run absent:
    python one_time/cleanup_shared_favicon_domains.py --dry-run
    python one_time/cleanup_shared_favicon_domains.py
    python one_time/cleanup_shared_favicon_domains.py --min=5   # default 5
"""
import os
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse

import boto3
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")
DSN = os.getenv("DATABASE_URL")
if not DSN:
    sys.exit("DATABASE_URL not found in scripts/.env")

DRY_RUN = "--dry-run" in sys.argv
MIN_SHARED = next(
    (int(a.split("=", 1)[1]) for a in sys.argv if a.startswith("--min=")), 5
)
BUCKET = os.environ.get("R2_BUCKET", "greekleads-financials")

# Kept identical to shared_favicon_domain_report.py's allow-list — these are
# the company's real site, just with a default (not custom) favicon.
PLATFORM_DOMAINS = {
    "s0.wp.com", "i0.wp.com", "i1.wp.com", "i2.wp.com", "gstatic.com", "wix.com",
    "images.squarespace-cdn.com", "assets.squarespace.com", "img1.wsimg.com",
    "cdn.prod.website-files.com", "lh3.googleusercontent.com",
    "assets.builderassets.com", "framerusercontent.com", "assets.zyrosite.com",
    "outlook.live.com", "facebook.com", "files.websitestool.com",
    "img.ui-portal.de", "cdn.papaki.gr",
}


def domain_of(url: str) -> str:
    if not url:
        return ""
    try:
        netloc = urlparse(url if "//" in url else "http://" + url).netloc.lower().split(":")[0]
    except Exception:
        return ""
    return netloc[4:] if netloc.startswith("www.") else netloc


def make_s3():
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def bar(done, total, width=32):
    total = max(total, 1)
    frac = min(done / total, 1.0)
    filled = int(frac * width)
    return "█" * filled + "░" * (width - filled)


def find_targets(conn):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute("""
            SELECT ar_gemi, r2_key, source_url
            FROM company_favicons
            WHERE status = 'ok' AND source_url IS NOT NULL AND r2_key IS NOT NULL
        """)
        rows = cur.fetchall()

    by_domain: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        dom = domain_of(r["source_url"])
        if dom and dom not in PLATFORM_DOMAINS:
            by_domain[dom].append(r)

    targets = []
    for dom, rs in by_domain.items():
        if len(rs) >= MIN_SHARED:
            for r in rs:
                targets.append({**r, "domain": dom})
    return targets


def main():
    print("Connecting…")
    conn = psycopg2.connect(DSN, connect_timeout=30)

    print(f"Finding live favicons whose source domain is shared by "
          f">= {MIN_SHARED} companies (excluding platform/CDN allow-list)…")
    targets = find_targets(conn)
    domains = {t["domain"] for t in targets}
    print(f"  Favicons to remove:       {len(targets):,}")
    print(f"  Distinct vendor domains:  {len(domains):,}")

    if DRY_RUN:
        print("\n--dry-run: nothing written.")
        conn.close()
        return
    if not targets:
        print("\nNothing to clean up.")
        conn.close()
        return

    s3 = make_s3()
    ar_gemis = [t["ar_gemi"] for t in targets]

    print(f"\nDeleting {len(targets):,} R2 favicon objects:")
    deleted_r2 = 0
    for i, t in enumerate(targets):
        try:
            s3.delete_object(Bucket=BUCKET, Key=t["r2_key"])
            deleted_r2 += 1
        except Exception as e:
            print(f"\n  [warn] R2 delete failed for {t['r2_key']}: {e}")
        if i % 200 == 0 or i == len(targets) - 1:
            sys.stdout.write(f"\r  [{bar(i + 1, len(targets))}] {i + 1:,}/{len(targets):,}  "
                              f"(deleted {deleted_r2:,})")
            sys.stdout.flush()
    print()

    print(f"\nDeleting {len(ar_gemis):,} company_favicons rows…")
    with conn.cursor() as cur:
        cur.execute("DELETE FROM company_favicons WHERE ar_gemi = ANY(%s)", (ar_gemis,))
        deleted_rows = cur.rowcount
    conn.commit()
    conn.close()

    print(f"\nDone.")
    print(f"  R2 objects deleted:        {deleted_r2:,}")
    print(f"  company_favicons rows del: {deleted_rows:,}")


if __name__ == "__main__":
    main()
