# Financial Statements — Collection & Extraction Plan

_Written 2026-08-19. Supersedes the "Financial Statements (Phase 2)" status in
PROJECT.md, which was written 2026-08-06 and is now stale._

**Status: AWAITING APPROVAL — no code written yet.**

---

## 1. Where we actually are (measured 2026-08-19, not estimated)

PROJECT.md says "36,544/188,230 scanned (19.4%), paused". That is out of date.
The existence sweep **completed**.

| Metric | Value |
|---|---:|
| Companies scanned for filings | **188,468** |
| Still unscanned | 41 |
| Companies that have filings | **51,581** |
| Companies confirmed to have none | 136,887 |
| Total documents discovered | **915,368** |
| Documents already in R2 | 251,513 |
| Companies already downloaded | 10,401 |
| **Documents still to download (all years)** | **663,855** |
| Rows in `financial_statements` (extracted) | 54 (6 companies) |

### The addressable universe — important expectation-setting

```
1,676,820   companies in DB
  996,810   active
  169,992   active ΑΕ / ΙΚΕ / ΕΠΕ   (only these have a filing requirement)
   51,581   actually have filings          <-- the real ceiling
```

Financials will exist for **51,581 companies = 30.3% of active capital
companies = 5.2% of all active firms**. ΟΕ / ΕΕ / ΑΤΟΜΙΚΗ do not publish
financial statements, so they will never have this data. Any UI or marketing
copy must not imply broader coverage than this.

Recency is good: **94.6%** of filing companies have a 2023-or-later filing, so
a 3-year window loses very little.

---

## 2. Decisions (locked 2026-08-19)

| # | Decision | Choice |
|---|---|---|
| 1 | Scope | **Last 3 filing years (2023+), unknown-type docs KEPT** |
| 2 | Throughput | **Single IP** — no proxy pool |
| 3 | Sequencing | **Calibrate cost before committing to bulk extraction** |

---

## 3. Key technical findings (all verified this session)

### 3.1 Playwright is not required

`publicity.businessportal.gr` exposes two endpoints that work with plain HTTP —
no browser, no cookies, no session, no reCAPTCHA token:

```
POST /api/company/details
     body: {"query":{"arGEMI":"<id>"},"token":null,"language":"el"}

GET  /api/download/financial/<doc_id>?companyId=<ar_gemi>
```

The page's JS wraps the details call in `grecaptcha.ready()` with
`action: "companyDetailsLoad"`, but **the token is not enforced server-side** —
`token: null` returns 200 with the identical payload.

Gotcha: `query` must be the **object** `{"arGEMI":"..."}`. A bare string
returns `400 Bad request`. This is likely why the direct route was never found
and Playwright was used instead.

Verified download (clean shell, no cookies, no prior details call):

```
http=200  bytes=394716  time=0.587s
Content-Type: application/pdf
starts %PDF: True   has EOF marker: True   pages: 2
```

Caveat: ~50 successful downloads observed, all PDFs. The crawler also handles
xlsx/doc; none appeared in sampling. Those paths are unverified.

### 3.2 The rate limit is per-IP and concurrency does not help

nginx `limit_req` on the host. Measured:

```
conc=1  paced 1/s   30s   ok=16  429=0    ->  0.53 ok/s
conc=1  paced 2/s   30s   ok=21  429=0    ->  0.70 ok/s
conc=1  paced 5/s   30s   ok=22  429=10   ->  0.73 ok/s
conc=3  sustained   45s   ok=29  429=11   ->  0.64 ok/s
conc=10 burst             ok=1   429=29   ->  no gain
```

Raising concurrency converts requests into 429s at an identical success rate.

**Cross-validated against the real crawler's own history** (5 full days):

```
Jul 19  41,296 docs  0.478/s
Jul 20  41,180       0.477/s
Jul 21  39,924       0.462/s
Jul 22  41,004       0.475/s
Jul 23  49,635       0.574/s
```

Benchmark (0.53–0.73/s) and 252,448 real downloads (0.46–0.57/s) agree.
**Planning figure: 0.5–0.75 requests/sec, single IP.**

Note: `PW_DL_RATE` currently defaults to 1.2/s, which is ABOVE the ceiling —
the deployed crawler has been paying for 429 retries. The new service should
target ~0.6/s.

### 3.3 Document type and year are knowable BEFORE downloading

The details payload includes both:

```json
{ "id": 2257178,
  "bal_date": "2025-10-02T11:50:10.317",
  "bal_file_system_file_path": "~/uploads/02/126448702000/ΕΚΘΕΣΗ ΑΕ.pdf" }
```

plus `referencePeriod` per period. So the year filter costs nothing.

The 3-docs-per-fiscal-year pattern is three DIFFERENT documents (sample n=614
docs across 35 companies):

| Type | Share | Has our 6 fields? |
|---|---:|---|
| ΙΣΟΛΟΓΙΣΜΟΣ (balance sheet) | 19.7% | assets, equity |
| ΚΑΧ (income statement) | 14.3% | revenue, profits |
| ΟΙΚ. ΚΑΤΑΣΤΑΣΕΙΣ (combined) | 10.9% | all |
| ΠΡΟΣΑΡΤΗΜΑ (notes) | 19.9% | no |
| ΕΚΘΕΣΗ (manager/auditor report) | 12.2% | no |
| admin (πρακτικά, αποφάσεις) | 3.3% | no |
| **unclassifiable by filename** | **19.7%** | unknown |

**Filename classification is only ~80% reliable and MUST NOT be used as a hard
filter.** Residual failures are abbreviations (`ΕΚΘ.ΔΙΑΧ.`, `ΟΙΚ ΚΑΤΑΣ`),
transliterations (`isologismos2013.pdf`), and Latin/Greek homoglyph mixing
(`OIKON.KATAΣΤΑΣΕΙΣ` uses Latin O/I/K/A). Accent-stripping plus homoglyph
mapping still left 19.7% unplaced. Per decision #1, **unknowns are kept.**

Year filtering, by contrast, is exact.

### 3.4 ~54% of documents are scanned images

Sample of 13 PDFs: **7 had zero extractable text**. Average **1.31 pages**
(median 1, max 3).

This confirms the regex parser (`analyze_financials.py` / `financial_parser.py`)
was structurally unable to work, and validates the AI-only approach.

---

## 4. Scope maths

Year distribution measured across **all 252,448 real documents** (not a sample):
filings from 2023 onward are **34.3%** of the corpus.

| Scope | Documents |
|---|---:|
| Everything | 915,368 |
| **Last 3 years (CHOSEN)** | **~313,971** |
| of which still need downloading | **~227,700** |
| already in R2, extract only | ~86,600 |

### Download phase (single IP)

| | Value |
|---|---:|
| Details calls needed (doc IDs not stored) | 41,180 |
| Documents to download | ~227,700 |
| **Total requests** | **~268,900** |
| At 0.75 req/s | **4.1 days** |
| At 0.48 req/s | **6.5 days** |
| R2 storage added (~330 KB avg) | **~75 GB** |
| R2 cost | ~$1.15/month extra |

Note: `financial_ar_gemi_scanned` stores only the doc COUNT, not doc IDs — so
all 41,180 remaining companies need a fresh details call before downloading.

### Extraction phase

Gemini 2.5 Flash via OpenRouter — **$0.30/M input, $2.50/M output** (confirmed
2026-08-19).

Per document: ~1.31 pages × 258 tokens + ~300 prompt = **~640 input tokens**.
Output is the unknown: the 6-field JSON is ~150 tokens, but Gemini's *thinking*
tokens bill as output at $2.50/M, and previously blew past a 2048 cap on this
exact task.

| Docs | Low ($0.00082/doc) | High ($0.00269/doc) |
|---:|---:|---:|
| ~203,000 | **$167** | **$546** |
| ~314,000 | $257 | $845 |

**The 3× spread is entirely thinking tokens. Phase 0 exists to collapse it.**

### End-to-end

~4–6.5 days downloading + ~1 day extracting = **6–8 days** before numbers
appear on company pages.

---

## 5. Phases

### Phase 0 — Calibration (~$0.30, ~30 min) [DO FIRST]

Run the existing `scripts/financial_ai_extractor.py` over ~200 real R2
documents, deliberately mixed digital and scanned.

Report: actual tokens/doc (input, output, thinking separately), actual $/doc,
extrapolated total, and extraction accuracy against manual spot-checks.

**Gate: no bulk extraction spend until this reports back.**

### Phase 1 — HTTP collector

**New file** `scripts/http_svc/financial_http.py` — NOT an edit to the deployed
`scripts/playwright_svc/financial_playwright.py`, per the standing rule about
not modifying production scripts for new work.

- `requests.Session`, no Playwright, no Chromium, no Dockerfile complexity
- POST details → filter by `referencePeriod` >= (current year − 3)
- Keep unknown-type documents (decision #1)
- One global rate limiter, target ~0.6 req/s
- Exponential backoff on 429
- Resumable via `financial_ar_gemi_scanned` / `financial_docs`
- Progress bar (standing requirement)
- Records doc IDs so a re-run never re-fetches details

### Phase 2 — Backfill downloads

~228k documents, 4–6.5 days continuous, +75 GB R2. Run on Railway (RAM now
trivial without Chromium) or locally.

### Phase 3 — Bulk extraction

At the scope and cost Phase 0 establishes. Writes into `financial_statements`.
The `/etaireies/[ar_gemi]` "Οικονομικά" tab already renders this — no UI work.

---

## 6. Open risks

1. **Undocumented endpoint.** `token: null` works today; the portal could start
   enforcing reCAPTCHA at any time. Keep `financial_playwright.py` as a
   fallback rather than deleting it. (Not a new exposure — the existing crawler
   already calls the same internal endpoint.)
2. **Shared vs separate rate-limit zones.** Unverified whether
   `/api/company/details` and `/api/download/financial` share one nginx zone.
   Plan assumes shared (pessimistic). If separate, downloads finish nearer
   4 days than 6.5.
3. **xlsx/doc paths unverified** over direct HTTP (none encountered in sampling).
4. **Thinking-token cost** — the single biggest cost unknown; Phase 0 resolves it.
5. **Coverage expectation** — 51,581 companies is the ceiling, ~5% of active
   firms. Must not be over-claimed in product copy.

---

## 7. Commands (for the user to run — never auto-run)

To be filled in as each phase's script is written.

```
# Phase 0
python scripts/one_time/financial_extraction_calibration.py --sample=200

# Phase 1/2
python scripts/http_svc/financial_http.py --dry-run
python scripts/http_svc/financial_http.py

# Phase 3
python scripts/one_time/financial_bulk_extract.py --dry-run
```
