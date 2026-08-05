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


# ---------------------------------------------------------------------------
# Website discovery — probe a firm's EMAIL DOMAIN for a website ΓΕΜΗ doesn't
# have. Shared by scripts/discover_websites.py (bulk one-off) and the live
# website_scanner bot (pass 2). Premise: an active firm with no url but an
# email on its own domain (info@acme.gr) very often hosts a site at that domain.
# ---------------------------------------------------------------------------

# Free / ISP / webmail domains — an email here tells us nothing about a website.
FREEMAIL = {
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.gr", "yahoo.co.uk",
    "hotmail.com", "hotmail.gr", "hotmail.co.uk", "outlook.com", "outlook.com.gr",
    "live.com", "msn.com", "icloud.com", "me.com", "mac.com", "aol.com",
    "mail.com", "gmx.com", "gmx.net", "yandex.com", "yandex.ru", "protonmail.com",
    "proton.me", "zoho.com", "hol.gr", "in.gr", "freemail.gr", "otenet.gr",
    "ath.forthnet.gr", "forthnet.gr", "windowslive.com", "vodafone.gr",
    "wind.gr", "cyta.gr", "hellasnet.gr", "internet.gr", "acn.gr",
}

_PARKED_SIGNS = [
    "domain is for sale", "this domain may be for sale", "buy this domain",
    "domain parking", "sedoparking", "parkingcrew", "bodis.com", "afternic",
    "hugedomains", "domain for sale", "παρκαρισμ", "προς πώληση",
]
_PLACEHOLDER_SIGNS = [
    "under construction", "coming soon", "υπό κατασκευή", "σύντομα κοντά σας",
    "default web page", "apache2 ubuntu default", "welcome to nginx",
    "iis windows", "index of /", "it works!", "test page for the apache",
    "site not configured", "website coming soon", "plesk",
]

_EMAIL_DOMAIN_RE = re.compile(r"@([A-Za-z0-9.\-]+\.[A-Za-z]{2,})")


def email_domain(email: str):
    """First email's domain, lowercased. None if unusable or freemail."""
    if not email:
        return None
    m = _EMAIL_DOMAIN_RE.search(email)
    if not m:
        return None
    dom = m.group(1).lower().strip(".")
    if dom in FREEMAIL or dom.count(".") > 3:
        return None
    return dom


def classify_html(html: str) -> str:
    """live | parked | placeholder — only 'live' is a real website."""
    low = html[:20000].lower()
    if any(s in low for s in _PARKED_SIGNS):
        return "parked"
    if any(s in low for s in _PLACEHOLDER_SIGNS):
        return "placeholder"
    if len(html.strip()) < 200:
        return "placeholder"
    return "live"


def probe_domain(domain: str, session: requests.Session = None) -> dict:
    """Try https then http on the bare domain.
    Returns {status: live|parked|placeholder|no-response, url, harvest}.
    harvest (socials/emails/phones) is populated only when status == 'live'.
    """
    if session is None:
        session = _get_session()
    for scheme in ("https://", "http://"):
        base = normalize_url(scheme + domain)
        if not base:
            continue
        try:
            r = session.get(
                base, timeout=(CONNECT_TIMEOUT, READ_TIMEOUT),
                allow_redirects=True, stream=True,
            )
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError,
                requests.exceptions.TooManyRedirects):
            continue
        except Exception:
            continue

        if r.status_code >= 400:
            r.close()
            continue

        chunks, total = [], 0
        try:
            for c in r.iter_content(8192):
                chunks.append(c)
                total += len(c)
                if total >= MAX_BYTES:
                    break
        except Exception:
            pass
        finally:
            r.close()

        html = b"".join(chunks).decode("utf-8", errors="ignore")
        status = classify_html(html)
        harvest = extract_all(html) if status == "live" else {}
        return {"status": status, "url": str(r.url), "harvest": harvest}

    return {"status": "no-response", "url": None, "harvest": {}}
