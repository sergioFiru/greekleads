"""
scan_utils.py

Shared website scanning logic used by:
  - one_time/web_scraper.py  (bulk one-time scan)
  - bots/website_scanner.py  (live continuous scanner)
"""

import re
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from urllib.parse import urlparse

import requests

CONNECT_TIMEOUT = 5     # seconds to establish connection
READ_TIMEOUT    = 8     # seconds between data chunks
HARD_TIMEOUT    = 18    # wall-clock limit per URL (kills SSL hangs)
MAX_BYTES       = 512_000  # stop reading after 500 KB


def normalize_url(raw: str) -> str:
    raw = raw.strip()
    if not raw:
        return ""
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw.lstrip("/")
    try:
        parsed = urlparse(raw)
    except ValueError:
        return ""
    if not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}"


PATTERNS = {
    "instagram": re.compile(
        r'(?:https?:)?//(?:www\.)?instagram\.com/(?!p/|reel/|explore/)([A-Za-z0-9_.]{1,30})/?',
        re.IGNORECASE,
    ),
    "facebook": re.compile(
        r'(?:https?:)?//(?:www\.)?facebook\.com/(?!sharer|share|dialog|plugins)([A-Za-z0-9_.%-]{3,})/?',
        re.IGNORECASE,
    ),
    "linkedin": re.compile(
        r'(?:https?:)?//(?:www\.)?linkedin\.com/((?:company|in)/[A-Za-z0-9_%-]+)/?',
        re.IGNORECASE,
    ),
    "twitter": re.compile(
        r'(?:https?:)?//(?:www\.)?(?:twitter|x)\.com/(?!share|intent|home)([A-Za-z0-9_]{1,15})/?',
        re.IGNORECASE,
    ),
    "tiktok": re.compile(
        r'(?:https?:)?//(?:www\.)?tiktok\.com/@([A-Za-z0-9_.]{1,30})/?',
        re.IGNORECASE,
    ),
    "youtube": re.compile(
        r'(?:https?:)?//(?:www\.)?youtube\.com/(?:@|channel/|c/|user/)([A-Za-z0-9_%-]+)/?',
        re.IGNORECASE,
    ),
}

EMAIL_RE = re.compile(
    r'[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}',
)

PHONE_RE = re.compile(
    r'(?<!\d)(?:\+30|0030)?[\s\-.]?([26]\d[\s\-.]?\d{3}[\s\-.]?\d{4})(?!\d)',
)

EMAIL_BLACKLIST = {
    "example.com", "domain.com", "email.com", "mail.com",
    "youremail.com", "company.com", "sentry.io", "wixpress.com",
    "google.com", "facebook.com", "instagram.com",
}

_SESSION = None


def _get_session() -> requests.Session:
    global _SESSION
    if _SESSION is None:
        _SESSION = requests.Session()
        _SESSION.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            )
        })
    return _SESSION


def extract_all(html: str) -> dict:
    found = {}

    for platform, pattern in PATTERNS.items():
        matches = pattern.findall(html)
        if matches:
            handle = next(
                (m for m in matches if len(m) > 2 and m.lower() not in ("pages", "groups", "hashtag")),
                None,
            )
            if handle:
                domain = {
                    "instagram": "instagram.com",
                    "facebook":  "facebook.com",
                    "linkedin":  "linkedin.com",
                    "twitter":   "x.com",
                    "tiktok":    "tiktok.com",
                    "youtube":   "youtube.com",
                }[platform]
                prefix = "@" if platform in ("tiktok", "youtube") else ""
                found[platform] = f"https://www.{domain}/{prefix}{handle}"

    emails = set()
    for m in EMAIL_RE.finditer(html):
        addr = m.group(0).lower()
        domain = addr.split("@")[-1]
        if domain not in EMAIL_BLACKLIST and not addr.endswith((".png", ".jpg", ".gif", ".svg")):
            emails.add(addr)
    if emails:
        found["emails"] = sorted(emails)

    phones = set()
    for m in PHONE_RE.finditer(html):
        digits = re.sub(r'[\s\-.]', '', m.group(1))
        if len(digits) == 10:
            phones.add(digits)
    if phones:
        found["phones"] = sorted(phones)

    return found


def scan_site(raw_url: str, session: requests.Session = None) -> dict:
    if session is None:
        session = _get_session()

    base_url = normalize_url(raw_url)
    if not base_url:
        return {"error": "invalid_url"}

    def _fetch():
        resp = session.get(
            base_url,
            timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
            allow_redirects=True,
            stream=True,
        )
        if resp.status_code >= 400:
            resp.close()
            return {"error": f"http_{resp.status_code}"}
        chunks, total = [], 0
        for chunk in resp.iter_content(chunk_size=8192):
            chunks.append(chunk)
            total += len(chunk)
            if total >= MAX_BYTES:
                break
        resp.close()
        html = b"".join(chunks).decode("utf-8", errors="ignore")
        return extract_all(html)

    try:
        with ThreadPoolExecutor(max_workers=1) as ex:
            future = ex.submit(_fetch)
            try:
                return future.result(timeout=HARD_TIMEOUT)
            except FuturesTimeout:
                return {"error": "hard_timeout"}
    except requests.exceptions.Timeout:
        return {"error": "timeout"}
    except requests.exceptions.TooManyRedirects:
        return {"error": "too_many_redirects"}
    except requests.exceptions.ConnectionError:
        return {"error": "connection_error"}
    except Exception as e:
        return {"error": str(e)[:80]}
