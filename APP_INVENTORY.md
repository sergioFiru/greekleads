# GreekLeads — App Inventory

_A factual list of what the application actually has, does, and offers — plus
what is planned. Not marketing copy. Verified against the codebase on
2026-07-23._

Legend:
- ✅ **Live** — built, working, using real data
- 🟡 **Built, not active/shown** — code exists but disabled or not surfaced to users
- 🎭 **Demo/mock** — visible in the UI but backed by fake/hardcoded data
- 🔵 **Planned** — agreed/scoped, not built

---

## 1. What it is

A web application over the **Greek General Commercial Registry (ΓΕΜΗ)**. It lets
you search ~1.67M Greek companies and the people attached to them, view a full
profile for any company or person, see how they connect, describe a target
audience in plain Greek and have an AI translate it into filters, and export
results to CSV.

---

## 2. Where it runs (stack)

| Layer | Tech | Host |
|---|---|---|
| Web app + API routes | Next.js (App Router, TypeScript, React) | Vercel |
| Database | PostgreSQL (~1.67M companies) | Railway |
| Background workers | Python 3 (psycopg2, Playwright) | Railway |
| Document storage | Cloudflare R2 (financial PDFs) | Cloudflare |
| Auth | Clerk — **wired, currently bypassed** (placeholder keys) | — |
| Payments | Stripe — **not wired yet** (placeholder keys) | — |
| AI (Scout) | Gemini 2.5 Flash via OpenRouter | — |
| Domain | greekleads.gr | Vercel |

---

## 3. The data it holds

**✅ Companies — ~1.67M rows**, the full ΓΕΜΗ registry. Per company:
- Identity: ΑΡΓΕΜΗ, ΑΦΜ, Greek/English name, legal form, status, incorporation date, capital
- Location: municipality, prefecture, city, street, zip
- Contact: email, phone, fax, website
- Activities: full KAD (activity code) list as JSONB, with primary/secondary and date ranges
- Social: Instagram, Facebook, LinkedIn, Twitter/X, TikTok, YouTube URLs (scraped)

**✅ People — `company_persons` table.** Directors, managers, shareholders,
representatives, and — via a backfill of ~1.12M sole proprietorships — the owner
(ΙΔΙΟΚΤΗΤΗΣ) of every ΑΤΟΜΙΚΗ firm. Each row has person name, role, company, and
a from/to date range.

**Rough live counts (measured this session):**
- Companies total: ~1,672,700
- Active (Ενεργή): ~1,048,700
- With email or phone: ~977,800
- With at least one social profile: **16,793** (small — scraping is early)

**🟡 Financial documents** — being collected to R2 (see §6/§7). **Not stored in
a queryable table and not shown anywhere in the app yet.**

---

## 4. Pages — what exists and what each does

### ✅ Home `/`
- **Hero** with a two-mode search toggle:
  - **Scout mode** — describe who you sell to in Greek; AI returns a live count of matching companies and a link into filtered results.
  - **Manual mode** — company-name typeahead (name / ΓΕΜΗ / ΑΦΜ) → company page or full search.
  - A live stat line (real counts) and a "Νέες εγγραφές" feed card.
- Below the hero: a series of **🎭 marketing sections** (product preview, people, network, sectors, pricing teaser, etc.) — these are **mockups with hardcoded demo data**, not live features.

### ✅ Company search `/search`
The core tool. Left filter sidebar + results table + export.
- **Filters:** name/ΓΕΜΗ/ΑΦΜ text, status, prefecture (56, with Attica shortcut), legal form, activity/ΚΑΔ, contact availability (has email / phone / website / no website), social presence, founding-year range, municipality.
- **Scout AI** prompt bar built into the page (same agent as the hero).
- **Results:** paginated table (50/page) with company logo initials, legal form, ΓΕΜΗ-verified badge, contact/enrichment icons, founding year. Table and card views. Sortable.
- **Row selection → CSV export** of the selected companies.
- **Company preview** slide-in panel per row.
- **Paywall:** free users are gated after 2 pages (server-enforced). See §8.

### ✅ Company profile `/etaireies/[ar_gemi]`
Full page per company (also the public SEO surface). Header card + tabs, tabs only shown when they have data:
- **Επισκόπηση** — identity, status & capital, location, primary activity, objective, 4 stat cards.
- **Άνθρωποι** — directors/officers table.
- **Δραστηριότητες** — all KAD activity codes.
- **Παρόμοιες** — similar companies.
- **Δίκτυο** — force-directed graph of connected people & companies.
- Contact block with social links.

### ✅ People search `/people`
Search directors/shareholders/owners by name (or email/phone).
- Filters: area, number of companies, active/past status.
- Result cards: avatar, primary role, company chips with active/past dots, company count.
- Empty state explains the dataset.

### ✅ Person profile `/people/[slug]`
Full page per person:
- Stat cards (companies, active roles, etc.).
- **Role timeline** — a Gantt-style view of their roles across companies over time.
- **Contact intelligence** — reachable contact signals.
- **Network graph** of the person's company connections.

### ✅ Pricing `/pricing`
Three tiers: Free / Pro / Enterprise. (Display only — checkout not wired.)

### 🟡 Sign-in / Sign-up `/sign-in`, `/sign-up`
Clerk routes exist. Middleware activates Clerk **only when real keys are set** —
currently placeholder, so auth is effectively **off** and every visitor is
treated as anonymous/free.

---

## 5. What the AI (Scout) actually does

✅ Live. You describe what you sell and to whom, in Greek. Scout (Gemini 2.5
Flash) returns a set of **search filters** — prefectures, legal forms, KAD
sector keywords, contact requirements — plus a plain-Greek explanation and a
**count of matching companies**. Applying it drops you into `/search` with those
filters live.

- It maps free text → sector keyword fragments → real KAD codes in the DB.
- Runs on both the home hero and inside the search page.
- Round trip ~6s. Output varies run-to-run (LLM non-determinism).
- Keyword→KAD matching uses word-boundary matching (a recent fix; plain
  substring matching had catastrophic false positives on Greek stems).

---

## 6. Background workers (Railway, Python)

| Worker | ✅/status | What it does |
|---|---|---|
| `new_firms_watcher.py` | ✅ Live | Polls ΓΕΜΗ every ~10 min, inserts newly registered companies. |
| `website_scanner.py` | ✅ Live | Visits new companies' websites (~3 min cadence), extracts social-media links. Only scans firms that *have* a website. |
| `financial_playwright.py` | 🟡 Running | Crawls businessportal.gr with 3–5 headless-browser workers, downloads financial-statement documents (PDF/XLSX/XLS/DOC) to R2. ~12% done, ~34 days remaining, tunable via env vars. |

---

## 7. Data pipelines / enrichment

- **✅ Social enrichment** — website scanning fills the social URL columns. Coverage is still small (~17k firms).
- **✅ Owner backfill** — every sole-proprietorship now has its owner as a person record (~1.12M).
- **🟡 Financial collection** — statements being downloaded to R2 (§6). Not parsed into numbers and not shown in the app.

---

## 8. Access control & monetization (current reality)

- **Free tier logic exists and is enforced:** `/api/search` returns 403 after
  page 2 for unauthenticated users (`FREE_PAGE_LIMIT = 2`, `PAGE_SIZE = 50`).
- **Paid tier check exists:** a user with `plan = 'paid'` in Clerk metadata
  bypasses the gate.
- **But auth is currently bypassed** (placeholder Clerk keys), and **Stripe is
  not wired**, so today nobody actually logs in or pays — the gate is the only
  live limit and it treats everyone as anonymous.
- A dev flag (`NEXT_PUBLIC_DISABLE_GATE=true`) can turn the gate off entirely.

---

## 9. Collected/built but NOT yet offered to users

- **🟡 Financial statements** — being downloaded, but no parsing, no `financial_statements` table populated, nothing rendered. Biggest gap between "collected" and "usable."
- **🟡 Authentication & accounts** — fully wired, switched off.
- **🟡 Payments** — not connected.
- **🎭 Home-page marketing sections** — product preview, sector tables, "revenue" figures, live activity ticker: all hardcoded demo data.
- **🎭 Home "Νέες εγγραφές" feed** — placeholder rows, not yet connected to the live watcher.

---

## 10. Planned / not built (🔵)

- **Live Feed + Statistics page** (`/statistika`) — combined live registration feed + historical business statistics + AI analysis; every stat links into a filtered search. Rollup-table architecture scoped. (See PROJECT.md.)
- **Financial parsing** — extract revenue / assets / equity / profit from the collected PDFs (regex prototype exists; plan is to switch to Gemini for scanned/complex layouts) and surface on company pages.
- **Contact verification** — SMTP email check, phone validation.
- **Warm signals** — new-company alerts per industry, status-change tracking.
- **Saved lists / CRM features / team accounts.**
- **Sector grouping** — roll ~10.7k KAD codes into ~21 human sectors (now known to be mechanical via the NACE code prefix).
- **SEO** — sitemap, structured data expansion.
- **MCP server** — expose search/lookup as tools (deferred).

---

## 11. Honest caveats

- **Company-name search performance:** an index script (`tools/add_name_index.py`)
  was written and reportedly run; the speedup has **not been verified** end-to-end
  (dev server was unavailable at check time). Until confirmed, assume name search
  may still be slow (~2s).
- **`primary_kad` may be incomplete** — the denormalized column was empty on at
  least one sampled company; the JSONB `activities` field is the source of truth.
- **`'Inadequate Info'`** is a real placeholder value in the registry
  (municipality/prefecture/legal type) and leaks into some views; only
  suppressed in `/api/suggest` so far.
- **`municipality_descr`** is a combined `"ΔΗΜΟΣ / ΝΟΜΟΣ"` string, not a plain
  municipality.
