"""
shared_favicon_domain_report.py — list every LIVE favicon (company_favicons,
status='ok') whose image was fetched from a domain shared by other companies
(read-only, no writes).

Why this is a NEW signal, distinct from shared_domain_report.py's email-based
one: that earlier cleanup (cleanup_shared_domain_favicons.py) only ever
touched favicons that came from `website_source = 'discovered'` — our OWN
enrichment guess — and only when the company's EMAIL domain was shared. It
never looked at favicons fetched from the company's officially registered
ΓΕΜΗ `url` field. Turns out thousands of small firms register their
bookkeeper's / tax-SaaS provider's / company-formation-agent's templated
micro-site as their own official website (e.g. isologismos.work,
ike-greece.gr, taxplus.gr) — same "shared vendor site mistaken for the firm's
own identity" bug as the ACS courier case, just via `url` instead of
`discovered_url`, and via the favicon's source_url domain instead of email.

A separate, genuinely different bucket also shows up in this same query:
generic PLATFORM/CDN favicons (WordPress's s0.wp.com, Wix, Squarespace,
Google's gstatic.com globe icon, GoDaddy Website Builder, Framer, Facebook
page icons, …). Those ARE the company's real site — just hosted on a
platform without a custom favicon set — so they're excluded from this report
by default via PLATFORM_DOMAINS below; they're a generic-but-not-wrong icon,
a separate judgment call from the vendor-site bug this script targets.

Domain grouping is done in Python (urlparse on company_favicons.source_url),
not SQL, since Postgres has no built-in URL-host extractor.

Output: tools/shared_favicon_domains.csv
    domain, n_companies, ar_gemi, co_name_el, source_url, url, discovered_url,
    website_source, status_descr

Run from the scripts/ directory:
    python one_time/shared_favicon_domain_report.py
    python one_time/shared_favicon_domain_report.py --min=5   # default 5
"""
import csv
import os
import sys
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlparse

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")
DSN = os.getenv("DATABASE_URL")
if not DSN:
    sys.exit("DATABASE_URL not found in scripts/.env")

MIN_SHARED = next(
    (int(a.split("=", 1)[1]) for a in sys.argv if a.startswith("--min=")), 5
)
OUT_CSV = Path(__file__).parent.parent.parent / "tools" / "shared_favicon_domains.csv"

# Generic hosting-platform / CDN domains — technically the company's own site,
# just with a default (not custom) favicon. Left out of the "vendor bug" report
# on purpose; a separate decision from the one this script is for.
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


def main():
    print("Connecting…")
    conn = psycopg2.connect(DSN, connect_timeout=30)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    print("Reading live favicons with a source_url…")
    cur.execute("""
        SELECT f.ar_gemi, f.source_url, c.co_name_el, c.url, c.discovered_url,
               c.website_source, c.status_descr
        FROM company_favicons f
        JOIN companies c ON c.ar_gemi = f.ar_gemi
        WHERE f.status = 'ok' AND f.source_url IS NOT NULL
    """)
    rows = cur.fetchall()
    conn.close()
    print(f"  {len(rows):,} live favicon rows.")

    domains: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        dom = domain_of(r["source_url"])
        if dom and dom not in PLATFORM_DOMAINS:
            domains[dom].append(r)

    qualifying = {d: rs for d, rs in domains.items() if len(rs) >= MIN_SHARED}
    total_companies = sum(len(rs) for rs in qualifying.values())
    print(f"\nVendor domains shared by >= {MIN_SHARED} companies: {len(qualifying):,}")
    print(f"Companies covered:                            {total_companies:,}")
    print(f"(Platform/CDN domains excluded from this report: {len(PLATFORM_DOMAINS):,} allow-listed)")

    OUT_CSV.parent.mkdir(exist_ok=True)
    with open(OUT_CSV, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow([
            "domain", "n_companies", "ar_gemi", "co_name_el", "source_url",
            "url", "discovered_url", "website_source", "status_descr",
        ])
        for dom in sorted(qualifying, key=lambda d: -len(qualifying[d])):
            rs = qualifying[dom]
            for r in sorted(rs, key=lambda r: r["co_name_el"] or ""):
                writer.writerow([
                    dom, len(rs), r["ar_gemi"], r["co_name_el"], r["source_url"],
                    r["url"], r["discovered_url"], r["website_source"], r["status_descr"],
                ])

    print(f"\nTop 20 shared vendor domains:")
    for dom in sorted(qualifying, key=lambda d: -len(qualifying[d]))[:20]:
        print(f"  {len(qualifying[dom]):5,}  {dom}")

    print(f"\nSaved: {OUT_CSV}")


if __name__ == "__main__":
    main()
