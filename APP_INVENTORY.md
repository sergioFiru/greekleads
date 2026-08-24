# GreekLeads — App Inventory

_A factual list of what the application actually has, does, and offers — plus
what is planned. Not marketing copy. Verified against the codebase and live
database on 2026-08-18._

Legend:
- ✅ **Live** — built, working, using real data
- 🟡 **Built, not active/shown** — code exists but disabled, not surfaced, or barely populated
- 🎭 **Demo/mock** — visible in the UI but backed by fake/hardcoded data
- 🔵 **Planned** — agreed/scoped, not built

---

## 1. What it is

A web application over the **Greek General Commercial Registry (ΓΕΜΗ)**. It lets
you search ~1.68M Greek companies and the ~2.09M person-roles attached to them,
view a full profile for any company or person, see how they connect, read
extracted financial statements, describe a target audience in plain Greek and
have an AI translate it into filters, and export results to CSV.

---

## 2. What you can actually do with it today

The task-level answer, in the order a real user would hit them:

| I want to… | How | Status |
|---|---|---|
| Find companies matching precise criteria | `/search` — 11 filter groups (sector, location, size proxy, contactability, social presence, age) | ✅ |
| Describe my ideal customer in plain Greek and get a list | Scout AI, on the home hero and inside `/search` | ✅ |
| Look up one company by name / ΓΕΜΗ / ΑΦΜ | Home typeahead or `/search` text box | ✅ |
| Skim a company without leaving my results | Row "eye" button → slide-in preview panel (logo, capital, founding year, headcount, contact, socials, officers) | ✅ |
| Read a company's full dossier | `/etaireies/[ar_gemi]` — identity, people, activities, financials, similar firms, network graph | ✅ |
| See a company's revenue / assets / profit by year | "Οικονομικά" section on the company page | 🟡 works, only 6 firms populated |
| Pull financials for a company on demand | "Retrieve" button on the company page → background AI extraction job | ✅ pipeline works, gated on AI budget |
| Find a person and everything they're involved in | `/people` → `/people/[slug]` | ✅ |
| See a person's career as a timeline | Gantt-style role timeline on the person page | ✅ |
| See who connects to whom | Force-directed network graph on both company and person pages | ✅ |
| Reach the companies I found | Email / phone / website / social links throughout; CSV export of selected rows | ✅ |
| Sign in, save lists, pay | — | 🟡 auth wired but off, 🔵 lists, 🔵 payments |

---

## 3. Where it runs (stack)

| Layer | Tech | Host |
|---|---|---|
| Web app + API routes | Next.js 16 (App Router, TypeScript, React 18) | Vercel |
| Database | PostgreSQL (~1.68M companies) | Railway |
| Scheduled bots | Python 3 (`runner.py` + `scripts/bots/*`) | Railway |
| Standalone services | 4 containerised Python services (see §7) | Railway |
| Object storage | Cloudflare R2 — financial documents **and** company favicons | Cloudflare |
| Auth | Clerk — **wired, currently bypassed** (placeholder keys) | — |
| Payments | Stripe — **not wired yet** (placeholder keys) | — |
| AI (Scout) | Gemini 2.5 Flash via OpenRouter | — |
| AI (financial extraction) | OpenRouter, `retrieve_svc` | Railway |
| Domain | greekleads.gr | Vercel |

---

## 4. The data it holds

Eight tables. Live counts measured **2026-08-18**:

### ✅ `companies` — 1,676,701 rows
The full ΓΕΜΗ registry. Per company: identity (ΑΡΓΕΜΗ, ΑΦΜ, Greek/English name,
trade names, legal form, status, incorporation date, capital as JSONB), location
(municipality, prefecture, city, street, zip), contact (email, phone, fax,
website), activities (full KAD list as JSONB with primary/secondary and date
ranges), and six social URL columns.

| Slice | Count |
|---|---|
| Active (Ενεργή) | 1,052,648 |
| With email or phone | 981,660 |
| With a registered website (`url`) | 99,191 |
| With a GreekLeads-discovered website (`discovered_url`) | 37,184 |
| With at least one social profile | 56,555 |

### ✅ `company_persons` — 2,087,234 role rows
Directors, managers, shareholders, representatives, and — via a backfill of
~1.12M sole proprietorships — the owner (ΙΔΙΟΚΤΗΤΗΣ) of every ΑΤΟΜΙΚΗ firm.
Each row: person name, role, category, company, from/to date range.
~1.65M distinct person names.

### ✅ `company_favicons` — 125,623 rows (72,075 with `status='ok'`) — **new since last inventory**
Real company logos, scraped from each firm's website and stored in R2. Drives
the logo shown in search results, the preview panel, and the company page, with
a deterministic colour-coded initials avatar as fallback. Rows with a non-`ok`
status are remembered failures, so a rerun doesn't retry them.
⚠️ ~11,009 of the `ok` rows are known-wrong — see §11.

### 🟡 Financial data — **new since last inventory**, three tables
| Table | Rows | What it is |
|---|---|---|
| `financial_ar_gemi_scanned` | 188,468 | Companies checked for *whether* filings exist on businessportal.gr. 51,582 have at least one. |
| `financial_docs` | 252,448 | Actual filing documents downloaded to R2 (PDF/XLSX/XLS/DOC). |
| `financial_statements` | 54 | **Extracted numbers** — revenue, total assets, equity, profit before tax, net profit, by fiscal year (2007–2024 range so far). |

The gap between 252k downloaded documents and 54 extracted rows is the single
biggest "collected but not usable" item in the product. See §9.

### ✅ `retrieve_jobs` — 15 rows
Background-job records for the company-page "Retrieve" button. All 15 completed
successfully, zero errors — the pipeline is proven, just barely run.

### ✅ `sync_log`
Bookkeeping for the registry watcher.

---

## 5. Pages — what exists and what each does

### ✅ Home `/`
- **Hero** with a two-mode search toggle:
  - **Scout mode** — describe who you sell to in Greek; AI returns a live count of matching companies and a link into filtered results.
  - **Manual mode** — company-name typeahead (name / ΓΕΜΗ / ΑΦΜ) → company page or full search.
- **✅ Live registry feed** — `LiveTicker` / `LiveExhibit` poll `/api/stream`, which returns genuinely new companies by `gemi_fetched_at` plus a 24h count. *(Was placeholder rows at last inventory — now real.)*
- **✅ Live stat line + prefecture map** — `/api/stats`, a single filtered aggregate pass over the table, cached 1h.
- Below the hero: a series of **🎭 marketing sections** (product preview, sector tables, revenue figures, pricing teaser) — still hardcoded demo data.

### ✅ Company search `/search`
The core tool. Left filter sidebar + results table + export.
- **Filters:** name/ΓΕΜΗ/ΑΦΜ text, status, prefecture (56, with Attica shortcut), legal form, activity/ΚΑΔ, contact availability (has email / phone / website / no website), social presence per platform, founding-year range, municipality.
- **Scout AI** prompt bar built into the page (same agent as the hero).
- **Results:** paginated (50/page), table **and** card views, sortable.
  - **✅ Real company logos** via `CompanyFavicon` (new), initials fallback.
  - Enrichment strip: ΓΕΜΗ-verified badge, email/phone/website icons, a `GL` marker when the website was GreekLeads-discovered rather than registry-declared, and per-platform social icons. Fixed-width slots keep the divider column-aligned across every row.
- **Row selection → CSV export.**
- **✅ Company preview panel** — slide-in per row (redesigned 2026-08-18): real favicon, legal-form + status badges, a three-tile stat strip (capital / founding year / officer count), location, primary KAD, contact block with clickable socials, officer list with roles, and a link to the full profile.
- **Paywall:** free users gated after 2 pages (server-enforced). See §8.

### ✅ Company profile `/etaireies/[ar_gemi]`
Full page per company, and the public SEO surface. Header card + scroll-spy
sections, each shown only when it has data:
- **Επισκόπηση** — merged identity / status & capital / location card, stat tiles, objective, network graph, contact card with brand-coloured social badges.
- **Άνθρωποι** — directors/officers.
- **Δραστηριότητες** — KAD donut chart plus the activity list (primary shown by default, rest behind an expander).
- **✅ Οικονομικά** *(new)* — shown only for ΑΕ/ΙΚΕ/ΕΠΕ (the legal forms required to file). Renders extracted revenue/assets/equity/profit by fiscal year when present; otherwise offers the **Retrieve** button, which starts a background extraction job and polls it to completion.
- **Παρόμοιες** — similar companies by KAD prefix + prefecture.
- JSON-LD `Organization` schema with `alternateName` from trade names, for SEO.

### ✅ People search `/people` — **redesigned 2026-08-18**
Search directors/shareholders/owners by name, company email, or company phone.
- **Idle:** a full-viewport hero — headline, dataset scale (person-roles, companies, ΓΕΜΗ as source), a large search input, and clickable example searches. Nothing below the fold.
- **Searching:** the hero collapses to a slim control bar and results take the screen.
- Filters: area, number of companies, active/past status.
- Result cards: avatar, primary role, company chips with active/past dots, company count, and a highlighted "why this matched" line when the hit came from an email or phone.

### ✅ Person profile `/people/[slug]`
- Stat cards, **role timeline** (Gantt-style across companies over time),
  **contact intelligence**, and a **network graph** of company connections.

### ✅ Pricing `/pricing`
Three tiers: Free / Pro / Enterprise. Display only — checkout not wired.

### 🟡 Sign-in / Sign-up `/sign-in`, `/sign-up`
Clerk routes exist. Middleware activates Clerk **only when real keys are set** —
currently placeholder, so auth is effectively **off** and every visitor is
anonymous/free.

---

## 6. API routes

| Route | Purpose |
|---|---|
| `/api/search` | Main company search + the free-tier gate |
| `/api/suggest` | Company name typeahead |
| `/api/filters` | Filter dropdown options |
| `/api/scout` | Scout AI — plain Greek → filters + count |
| `/api/stats` | Homepage aggregates (cached 1h) |
| `/api/stream` | Live new-registration feed |
| `/api/company/[ar_gemi]` | Preview-panel payload |
| `/api/company/[ar_gemi]/connections` | Company network graph |
| `/api/people/search` | People search |
| `/api/people/[slug]` | Person profile |
| `/api/people/[slug]/network` | Person network graph |
| `/api/favicon/[ar_gemi]` | **New** — streams a favicon out of the private R2 bucket (GET). Also accepts POST to set one manually, **dev-only** (404s in production). |
| `/api/financials/retrieve` | **New** — proxies the Retrieve button to `retrieve_svc`: POST starts a job, GET polls it |

---

## 7. Background workers & Railway services

**Scheduled bots** (one Railway worker, `runner.py`, `Procfile: worker`):

| Bot | Status | What it does |
|---|---|---|
| `new_firms_watcher.py` | ✅ Live | Polls ΓΕΜΗ every ~10 min, inserts newly registered companies. |
| `website_scanner.py` | ✅ Live | Visits companies' websites (~3 min cadence), extracts social links; also probes email domains to discover unregistered websites. Now loads `shared_domain_blocklist.txt` and refuses to attribute a shared vendor domain to a client firm. |

**Standalone containerised services** (each its own Railway service + Dockerfile):

| Service | Status | What it does |
|---|---|---|
| `existence_scan_svc` | ✅ Live, continuous | Checks each company on businessportal.gr for *whether* filings exist and how many, writing `financial_ar_gemi_scanned`. Never downloads. Sleeps and re-queries when the backlog clears, since new companies arrive continuously. |
| `playwright_svc` | 🟡 Paused | Headless-Chromium crawler that downloads the actual filing documents to R2. Produced the 252k `financial_docs` rows. |
| `retrieve_svc` | ✅ Live | FastAPI service behind the Retrieve button. Background-job pattern (chosen because Vercel functions have a hard timeout and one company can mean minutes of sequential AI calls). Always processes a company's **full** fiscal-year history. |
| `bulk_retrieve_svc` | 🟡 Built, budget-gated | One-shot job that pre-populates `financial_statements` for a priority batch (active ΑΕ/ΙΚΕ/ΕΠΕ with a recognizable trade name and known filings, ranked by declared capital) so popular company pages render instantly instead of making a visitor click Retrieve. |

---

## 8. Data pipelines / enrichment

- **✅ Social enrichment** — website scanning fills the six social columns. Coverage 56,555 firms (up from ~17k at last inventory).
- **✅ Website discovery** — 37,184 firms have a `discovered_url` GreekLeads found rather than ΓΕΜΗ declaring it. Surfaced with a `GL` marker so it's never confused with registry data.
- **✅ Favicon scraping** *(new)* — `scripts/one_time/scrape_favicons.py` fetches each firm's favicon (tries `/favicon.ico`, then parses the HTML `<link>` tags), uploads to R2, records success **and** failure so reruns skip known-bad sites.
- **✅ Owner backfill** — every sole proprietorship has its owner as a person record (~1.12M).
- **🟡 Financial pipeline** — three stages, all built: *exists?* → *download* → *extract*. Stages 1 and 2 have run at scale (188k scanned, 252k documents); stage 3 has processed 6 companies.

---

## 9. Access control & monetization (current reality)

- **Free tier is enforced:** `/api/search` returns 403 after page 2 for unauthenticated users (`FREE_PAGE_LIMIT = 2`, `PAGE_SIZE = 50`).
- **Paid tier check exists:** a user with `plan = 'paid'` in Clerk metadata bypasses the gate.
- **But auth is bypassed** (placeholder Clerk keys) and **Stripe is not wired**, so nobody logs in or pays today — the gate treats everyone as anonymous.
- Dev flag `NEXT_PUBLIC_DISABLE_GATE=true` disables the gate entirely.
- Design decision on record: gate proprietary enrichment, keep raw ΓΕΜΗ data free for SEO.

---

## 10. Collected/built but NOT yet offered to users

- **🟡 Financial statements — the biggest gap.** 252,448 documents sit in R2 and 51,582 companies are known to have filings, but only **6 companies / 54 year-rows** have been through AI extraction. Both the on-demand path (`retrieve_svc`) and the bulk path (`bulk_retrieve_svc`) are built and proven — the blocker is OpenRouter spend, not code.
- **🟡 Authentication & accounts** — fully wired, switched off.
- **🟡 Payments** — not connected.
- **🟡 Dev favicon picker** — `FaviconPickerButton` lets you override any firm's logo by URL or file upload from the search results. Deliberately dev-only (component and API both no-op outside development); it exists to hand-fix the shared-domain mess in §11.
- **🎭 Home marketing sections** — product preview, sector tables, revenue figures: still hardcoded.

---

## 11. Honest caveats & known data problems

- **⚠️ Shared-domain favicons (open issue).** Many small firms register their
  accountant's, lawyer's, or franchisor's email/website as their own. The
  website-discovery and favicon scrapers took those at face value, so the same
  logo appears on hundreds of unrelated companies.
  - Already cleaned: **36,443** companies had a wrong `discovered_url` cleared and **13,297** wrong favicons deleted (`cleanup_shared_domain_favicons.py`), and `website_scanner.py` now consults a 4,324-domain blocklist so it can't recur.
  - **Still outstanding:** a second wave found via the favicon's *source domain* rather than the email domain — **11,009 favicons across 744 vendor domains** (bookkeeping/tax-SaaS/company-formation portals like `ike-greece.gr`, `isol.emron.gr`, `isologismos.work`). `cleanup_shared_favicon_domains.py` is written and dry-run-verified but **has not been run**.
  - Deliberately excluded from that cleanup: ~3,478 favicons served from platform CDNs (WordPress, Wix, Squarespace, Google). Those are genuinely the firm's own site, just without a custom icon.
- **`primary_kad` may be incomplete** — the denormalized column was empty on at least one sampled company; the JSONB `activities` field is the source of truth.
- **`'Inadequate Info'`** is a real placeholder value in the registry (municipality / prefecture / legal type) and leaks into some views; only suppressed in `/api/suggest` so far.
- **`municipality_descr`** is a combined `"ΔΗΜΟΣ / ΝΟΜΟΣ"` string, not a plain municipality.
- **Company-name search performance** — an index script (`tools/add_name_index.py`) was written and reportedly run; the speedup has still **not been verified** end-to-end.
- **Person counts on the preview panel are capped** — `/api/company/[ar_gemi]` fetches at most 6 officers, so the panel's officer count renders as `6+` rather than a true total.
- **Scout output varies run-to-run** (LLM non-determinism); round trip ~6s.

---

## 12. Planned / not built (🔵)

- **Live Feed + Statistics page** (`/statistika`) — combined live registration feed + historical statistics + AI analysis; every stat links into a filtered search. Rollup-table architecture scoped.
- **Financial backfill at scale** — run `bulk_retrieve_svc` across the 51,582 companies with known filings (~€50 of AI spend for the priority batch).
- **Contact verification** — SMTP email check, phone validation.
- **Warm signals** — new-company alerts per industry, status-change tracking.
- **Saved lists / CRM features / team accounts.**
- **Sector grouping** — roll ~10.7k KAD codes into ~21 human sectors via the NACE code prefix.
- **Parent-company mapping** — the shared-domain data in `tools/shared_email_domains.csv` and `tools/shared_favicon_domains.csv` identifies which firms share an accountant/franchisor. That's a real relationship signal worth surfacing rather than only cleaning away.
- **SEO** — sitemap, structured-data expansion. (`public/llms.txt` already ships.)
- **Tech-stack fingerprinting** — detect CMS/ecommerce/marketing stack per firm site, gate as a Pro filter.
- **MCP server** — expose search/lookup as tools.
- **Chrome extension** — reverse-lookup the company behind the site you're viewing.
