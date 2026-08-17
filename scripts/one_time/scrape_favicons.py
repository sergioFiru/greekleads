"""
scrape_favicons.py — one-time backfill: fetch a favicon for every active
company that has a website on file, upload it to R2, and record the result
in a new `company_favicons` table.

Scope: companies.status_descr ILIKE 'ενεργ%' AND url IS NOT NULL AND url != ''
— 80,028 companies as of 2026-08-14 (99,191 total incl. inactive).

Per company:
  1. Try {domain}/favicon.ico directly — works for a large fraction of sites
     and is a single request.
  2. If that isn't a real image (wrong content-type, HTML error page served
     with a 200, etc.), fetch the homepage and look for a declared
     <link rel="icon"|"shortcut icon"|"apple-touch-icon" href="..."> instead,
     resolved against the post-redirect URL.
  3. Sniff the actual bytes (magic numbers) to pick a real extension/content
     type rather than trusting the server's Content-Type header, and to
     reject anything that isn't actually an image (a very common failure
     mode: a "200 OK" HTML page served for a missing favicon.ico).
No HTML parser dependency (bs4 etc.) — a link-tag regex on the raw bytes is
enough for this and keeps the dependency list to what's already used
elsewhere in scripts/ (requests, psycopg2, boto3, python-dotenv).

Concurrent, not sequential: unlike the financial-statements backfill (which
deliberately serialized requests against a single shared source,
businessportal.gr), this hits 80k independent third-party domains — no
shared target to protect, so a thread pool is safe and the network-bound
work parallelizes well. DB writes and R2 uploads happen in the main thread
as each future completes, so nothing needs its own DB connection.

Resumable: the candidate query excludes ar_gemi already present in
company_favicons (success OR failure — rerun doesn't retry known failures;
that's a deliberate v1 simplification, not a bug), so Ctrl+C and rerun any
time to continue.

Env (scripts/.env):
    DATABASE_URL, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY — required
    R2_BUCKET   — optional, default greekleads-financials (reusing the
                  existing bucket under a favicons/ prefix, not a new one)
    WORKERS     — optional, default 24

Run from the scripts/ directory:
    PYTHONIOENCODING=utf-8 py one_time/scrape_favicons.py
"""

import base64
import os
import re
import socket
import sys
import time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, FIRST_COMPLETED, wait
from concurrent.futures import TimeoutError as FutureTimeoutError
from urllib.parse import unquote_to_bytes, urljoin, urlsplit

import boto3
import psycopg2
import requests
import urllib3
from dotenv import load_dotenv

# Pass 2 found real, broken TLS certs on a meaningful slice of target sites
# (expired certs, hostname-mismatched certs) — browsers just show a
# click-through warning and load the site anyway; requests' strict
# verification rejects them outright. get_with_ssl_fallback() below retries
# without verification in that case, which is the right tradeoff here: worst
# case is a wrong/stale favicon, never anything sensitive.
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

load_dotenv(Path(__file__).parent.parent / ".env")

# NOTE: socket.setdefaulttimeout() does NOT bound DNS resolution
# (socket.getaddrinfo) — it only applies to a socket's connect/send/recv
# once one exists. If a domain's DNS server silently drops queries instead
# of actively refusing, getaddrinfo() can block for a genuinely long time,
# and a blocked OS-level call can't be interrupted from another Python
# thread. That's what actually wedged the run: enough of the fixed worker
# pool's threads landed on one of these and never came back, so the pool
# ran out of usable workers. HARD_TASK_TIMEOUT below is the real fix — see
# process_bounded().
socket.setdefaulttimeout(30)

DATABASE_URL = os.environ["DATABASE_URL"]
BUCKET = os.environ.get("R2_BUCKET", "greekleads-financials")
WORKERS = int(os.environ.get("WORKERS", "15"))
HARD_TASK_TIMEOUT = 45  # seconds — absolute ceiling per company, enforced independently of what's hanging inside it

# --requeue-fixed-errors: clear out error rows caused by bugs that are now
# fixed (SSL verification, data: URI icons) so this run retries them as
# fresh candidates instead of skipping them per the resumability rule below.
REQUEUE_FIXED_ERRORS = "--requeue-fixed-errors" in sys.argv

REQUEST_TIMEOUT = (10, 20)  # (connect, read) seconds
MAX_HTML_SCAN_BYTES = 300_000
MAX_FAVICON_BYTES = 3_000_000
HEADERS = {
    "User-Agent": "GreekLeadsBot/1.0 (+https://greekleads.gr; one-time favicon fetch for public company websites)",
    "Accept": "image/*,text/html;q=0.8,*/*;q=0.5",
}

LINK_TAG_RE = re.compile(
    rb'<link\s[^>]*rel=["\']?(?:shortcut icon|icon|apple-touch-icon)["\']?[^>]*>',
    re.IGNORECASE,
)
HREF_RE = re.compile(rb'href=["\']([^"\']+)["\']', re.IGNORECASE)

# (magic bytes, extension, content-type) — checked in order
MAGIC_SNIFFERS = [
    (b"\x00\x00\x01\x00", "ico", "image/x-icon"),
    (b"\x89PNG\r\n\x1a\n", "png", "image/png"),
    (b"\xff\xd8\xff", "jpg", "image/jpeg"),
    (b"GIF87a", "gif", "image/gif"),
    (b"GIF89a", "gif", "image/gif"),
]


def get_conn():
    return psycopg2.connect(DATABASE_URL, connect_timeout=30)


def ensure_table(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS company_favicons (
                ar_gemi      BIGINT PRIMARY KEY,
                r2_key       TEXT,
                content_type TEXT,
                source_url   TEXT,
                status       TEXT NOT NULL,
                error        TEXT,
                fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """)
    conn.commit()


def fetch_candidates(conn) -> list:
    # Pass 1 only looked at c.url (the official ΓΕΜΗ registry field), which
    # is often empty even when GreekLeads' own enrichment already found a
    # real, working site (c.discovered_url) — that silently skipped ~63.8k
    # active companies with a genuine website on file. Falls back to
    # discovered_url whenever url is empty.
    with conn.cursor() as cur:
        cur.execute("""
            SELECT c.ar_gemi, COALESCE(NULLIF(c.url, ''), c.discovered_url) AS effective_url
            FROM companies c
            WHERE c.status_descr ILIKE 'ενεργ%%'
              AND (
                (c.url IS NOT NULL AND c.url != '')
                OR (c.discovered_url IS NOT NULL AND c.discovered_url != '')
              )
              -- discovered_url enrichment has a bug (separate from this script) where a
              -- company's @yahoo.*/@ymail.com email got misread as "their website" and
              -- resolved to a generic Yahoo mail/search page, e.g. mail.yahoo.com,
              -- de.yahoo.com, it.search.yahoo.com — not the company's actual site. Left
              -- unfiltered, several of these fetched Yahoo's own real favicon.ico and
              -- displayed it as that COMPANY's logo. Excluded here rather than fixed at
              -- the enrichment source since that's out of scope for this script.
              AND COALESCE(NULLIF(c.url, ''), c.discovered_url) NOT ILIKE '%%yahoo.%%'
              AND NOT EXISTS (SELECT 1 FROM company_favicons f WHERE f.ar_gemi = c.ar_gemi)
        """)
        return [(row[0], row[1]) for row in cur.fetchall()]


def requeue_fixed_errors(conn):
    with conn.cursor() as cur:
        cur.execute("""
            DELETE FROM company_favicons
            WHERE status = 'error'
              AND (
                error ILIKE '%%SSLError%%' OR error ILIKE '%%CERTIFICATE%%' OR error ILIKE '%%certificate%%'
                OR error ILIKE '%%data:%%'
              )
        """)
        n = cur.rowcount
    conn.commit()
    print(f"[requeue] Cleared {n:,} old SSL/data-URI error rows — will be retried this run.")


def make_s3():
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def sniff_image(content: bytes):
    """Returns (ext, content_type) if content looks like a real image, else None."""
    if not content or len(content) > MAX_FAVICON_BYTES:
        return None
    for magic, ext, ct in MAGIC_SNIFFERS:
        if content.startswith(magic):
            return ext, ct
    head = content[:200].lstrip().lower()
    if head.startswith(b"<svg") or (head.startswith(b"<?xml") and b"<svg" in content[:2000].lower()):
        return "svg", "image/svg+xml"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "webp", "image/webp"
    return None


def decode_data_uri(uri: str) -> bytes | None:
    """A declared <link rel="icon" href="data:..."> embeds the image inline
    instead of pointing at a URL — session.get() can't fetch a data: URI at
    all (raised 'No connection adapters were found for data:...'), it has to
    be decoded directly."""
    try:
        header, _, payload = uri.partition(",")
        if ";base64" in header:
            return base64.b64decode(payload)
        return unquote_to_bytes(payload)
    except Exception:
        return None


def get_with_ssl_fallback(session: requests.Session, url: str, **kwargs) -> requests.Response:
    """Real, broken TLS certs (expired, hostname-mismatched) are common
    enough among these 80k independent third-party domains that browsers'
    click-through-the-warning behavior is worth matching here — retry once
    with verification off rather than losing the favicon entirely."""
    try:
        return session.get(url, **kwargs)
    except requests.exceptions.SSLError:
        return session.get(url, verify=False, **kwargs)


def normalize_url(raw: str) -> str:
    raw = raw.strip()
    if "://" not in raw:
        raw = "https://" + raw
    return raw


def find_declared_icon(base_url: str, html: bytes) -> str | None:
    for tag in LINK_TAG_RE.findall(html[:MAX_HTML_SCAN_BYTES]):
        m = HREF_RE.search(tag)
        if m:
            return urljoin(base_url, m.group(1).decode("utf-8", "ignore"))
    return None


def process(ar_gemi: int, raw_url: str) -> dict:
    """Returns a result dict — never raises."""
    base = normalize_url(raw_url)
    try:
        domain = urlsplit(base).netloc
        if not domain:
            return {"ar_gemi": ar_gemi, "status": "error", "error": "unparseable url", "source_url": raw_url}
    except Exception as e:
        return {"ar_gemi": ar_gemi, "status": "error", "error": f"unparseable url: {e}", "source_url": raw_url}

    # Fresh Session per company (cheap at this volume) so we can cap
    # redirects — the default 30-hop ceiling times a 20s read timeout is a
    # worst case of ~10 minutes for one company, which is what was actually
    # making runs look stuck.
    session = requests.Session()
    session.max_redirects = 5

    # 1) direct /favicon.ico
    # Broad except, not requests.RequestException: malformed hosts (real
    # example hit: "www.melodym..gr", a double dot) raise
    # urllib3.exceptions.LocationParseError, which ISN'T a RequestException
    # subclass and was propagating straight out of this function uncaught —
    # since fetch_candidates() has no ORDER BY, the run hit the same bad URL
    # at the same point on every restart and silently died there every time.
    # 80k scraped URLs from real company data will always contain some
    # garbage requests can't even build a request out of; nothing from here
    # down should ever be allowed to escape process().
    try:
        r = get_with_ssl_fallback(session, f"https://{domain}/favicon.ico", headers=HEADERS,
                                   timeout=REQUEST_TIMEOUT, allow_redirects=True)
        if r.ok:
            sniffed = sniff_image(r.content)
            if sniffed:
                return {"ar_gemi": ar_gemi, "status": "ok", "content": r.content,
                        "ext": sniffed[0], "content_type": sniffed[1], "source_url": r.url}
    except Exception:
        pass

    # 2) homepage <link rel="icon"> fallback
    try:
        r = get_with_ssl_fallback(session, base, headers=HEADERS, timeout=REQUEST_TIMEOUT, allow_redirects=True)
        if not r.ok:
            return {"ar_gemi": ar_gemi, "status": "error",
                    "error": f"homepage HTTP {r.status_code}", "source_url": raw_url}
        icon_url = find_declared_icon(r.url, r.content)
        if not icon_url:
            return {"ar_gemi": ar_gemi, "status": "error",
                    "error": "no favicon.ico and no <link icon> declared", "source_url": r.url}

        if icon_url.startswith("data:"):
            decoded = decode_data_uri(icon_url)
            sniffed = sniff_image(decoded) if decoded else None
            if not sniffed:
                return {"ar_gemi": ar_gemi, "status": "error",
                        "error": "data: URI declared icon isn't a real image", "source_url": r.url}
            return {"ar_gemi": ar_gemi, "status": "ok", "content": decoded,
                    "ext": sniffed[0], "content_type": sniffed[1], "source_url": r.url}

        ir = get_with_ssl_fallback(session, icon_url, headers=HEADERS, timeout=REQUEST_TIMEOUT, allow_redirects=True)
        if not ir.ok:
            return {"ar_gemi": ar_gemi, "status": "error",
                    "error": f"declared icon HTTP {ir.status_code}", "source_url": icon_url}
        sniffed = sniff_image(ir.content)
        if not sniffed:
            return {"ar_gemi": ar_gemi, "status": "error",
                    "error": "declared icon isn't a real image", "source_url": icon_url}
        return {"ar_gemi": ar_gemi, "status": "ok", "content": ir.content,
                "ext": sniffed[0], "content_type": sniffed[1], "source_url": ir.url}
    except Exception as e:
        return {"ar_gemi": ar_gemi, "status": "error", "error": str(e)[:300], "source_url": raw_url}
    finally:
        session.close()


# A stuck DNS lookup blocks the OS-level thread it's running on and can't be
# interrupted — so process() itself, run directly on one of the fixed
# WORKERS threads, can permanently consume that thread. Instead, run it on
# a throwaway thread from this much larger, expendable pool, and enforce
# HARD_TASK_TIMEOUT on the *result*, not on process() internally. If a
# lookup really does hang, the throwaway thread leaks (harmless — it'll
# exit whenever the OS resolver eventually gives up) but the real worker
# calling this is guaranteed to move on within HARD_TASK_TIMEOUT.
_leak_pool = ThreadPoolExecutor(max_workers=500)


def process_bounded(ar_gemi: int, raw_url: str) -> dict:
    fut = _leak_pool.submit(process, ar_gemi, raw_url)
    try:
        return fut.result(timeout=HARD_TASK_TIMEOUT)
    except FutureTimeoutError:
        return {"ar_gemi": ar_gemi, "status": "error",
                "error": f"hard timeout after {HARD_TASK_TIMEOUT}s (likely a DNS lookup that never returned)",
                "source_url": raw_url}
    except Exception as e:
        # Safety net: process() is now broad-except and shouldn't raise, but
        # this is exactly the mistake that killed the whole run last time
        # (one bad URL, one uncaught exception type) — nothing from 80k
        # rows of real scraped URLs should ever be allowed to propagate
        # this far and take the process down again.
        return {"ar_gemi": ar_gemi, "status": "error",
                "error": f"unexpected: {e}"[:300], "source_url": raw_url}


def upsert_result(conn, s3, result: dict):
    r2_key = None
    if result["status"] == "ok":
        r2_key = f"favicons/{result['ar_gemi']}.{result['ext']}"
        try:
            s3.put_object(Bucket=BUCKET, Key=r2_key, Body=result["content"],
                           ContentType=result["content_type"])
        except Exception as e:
            result = {"ar_gemi": result["ar_gemi"], "status": "error",
                      "error": f"r2 upload failed: {e}", "source_url": result.get("source_url")}
            r2_key = None

    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO company_favicons (ar_gemi, r2_key, content_type, source_url, status, error, fetched_at)
            VALUES (%s, %s, %s, %s, %s, %s, now())
            ON CONFLICT (ar_gemi) DO UPDATE SET
                r2_key = EXCLUDED.r2_key, content_type = EXCLUDED.content_type,
                source_url = EXCLUDED.source_url, status = EXCLUDED.status,
                error = EXCLUDED.error, fetched_at = now()
        """, (result["ar_gemi"], r2_key, result.get("content_type"),
              result.get("source_url"), result["status"], result.get("error")))
    conn.commit()


def print_progress(done: int, total: int, ok: int, fail: int, started: float):
    # Plain print() with a real trailing newline, not a \r-overwriting line —
    # \r-based bars turned out not to render at all in some PowerShell setups
    # (nothing showed up even though the process was — separately — also
    # genuinely stuck; see HARD_TASK_TIMEOUT). A scrolling log is less
    # pretty but actually shows up everywhere.
    elapsed = time.time() - started
    rate = done / elapsed if elapsed > 0 else 0
    remaining = (total - done) / rate if rate > 0 else 0
    eta_m, eta_s = divmod(int(remaining), 60)
    print(f"  {done:,}/{total:,} ({done / total * 100:5.1f}%)  "
          f"ok={ok:,} fail={fail:,}  {rate:5.1f}/s  ETA {eta_m}m{eta_s:02d}s", flush=True)


def main():
    conn = get_conn()
    ensure_table(conn)
    if REQUEUE_FIXED_ERRORS:
        requeue_fixed_errors(conn)
    candidates = fetch_candidates(conn)
    total = len(candidates)

    print("=" * 60)
    print("  FAVICON SCRAPE — active companies with a website")
    print(f"  Candidates queued: {total:,}")
    print(f"  Workers:           {WORKERS}")
    print(f"  R2 bucket:         {BUCKET} (favicons/ prefix)")
    print("=" * 60)

    if total == 0:
        print("Nothing to do.")
        conn.close()
        return

    s3 = make_s3()
    ok_count = fail_count = 0
    started = time.time()
    last_print = 0.0

    try:
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            # process_bounded, not process directly: a stuck DNS lookup can't
            # be interrupted, so running it straight on one of these fixed
            # WORKERS threads would let it permanently consume that thread.
            # process_bounded hands the real work to a throwaway pool and
            # enforces HARD_TASK_TIMEOUT on the result instead, so this pool
            # can never actually run out of usable workers.
            futures = {pool.submit(process_bounded, ar_gemi, url): ar_gemi for ar_gemi, url in candidates}
            pending = set(futures)
            done_count = 0
            # wait() in a loop instead of as_completed(): as_completed blocks
            # silently until the next future finishes, so if every in-flight
            # request happens to be a slow straggler at once, there'd be no
            # way to tell "still working" from "hung". A 10s poll window
            # prints a heartbeat instead.
            while pending:
                finished, pending = wait(pending, timeout=10, return_when=FIRST_COMPLETED)
                if not finished:
                    print(f"    still working — {len(pending)} in flight, "
                          f"waiting on slow responses...", flush=True)
                    last_print = time.time()
                    continue
                for future in finished:
                    done_count += 1
                    result = future.result()
                    upsert_result(conn, s3, result)
                    if result["status"] == "ok":
                        ok_count += 1
                    else:
                        fail_count += 1
                now = time.time()
                if now - last_print >= 2 or not pending:
                    print_progress(done_count, total, ok_count, fail_count, started)
                    last_print = now
    except KeyboardInterrupt:
        print("\n\nStopped — each company is written as it finishes, rerun to continue.")
    finally:
        conn.close()

    elapsed = time.time() - started
    print()
    print("=" * 60)
    print(f"Done this run: ok={ok_count:,} fail={fail_count:,} / {ok_count + fail_count:,} "
          f"in {elapsed / 60:.1f} min")


if __name__ == "__main__":
    main()
