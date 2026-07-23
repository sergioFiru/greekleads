# GreekLeads — Project Tracker

## The Vision
A **Greek B2B lead intelligence platform**. We sell **prospects — potential
clients** — on subscription. We are not selling GEMI data displayed more nicely.

The GEMI registry plays two roles: it is the **trust moat** (Greek buyers
distrust scraped lead lists, so "επίσημα δεδομένα ΓΕΜΗ" is the reason to buy
here instead of from a spreadsheet vendor) and the **SEO surface** (company
pages at `/etaireies/[ar_gemi]` feed the funnel). The paid value is targeting +
enrichment + export: find a segment, get reachable contacts, put them in a CRM.

Phase 1: validated data access — search, filter, export. Phase 2+: enrichment
(verified emails/phones/websites), sector intelligence, CRM features.

## Phases
- **Phase 1 (current):** Search + filter + export. Paywall after 2 pages. Deployed.
- **Phase 2:** Live contact enrichment (email SMTP verify, phone carrier check, website scraping).
- **Phase 3:** Warm signals (new company alerts per industry, status change tracking).
- **Phase 4:** Full CRM + saved lists + team features.

---

## Tech Stack

| Layer | Technology | Hosting |
|---|---|---|
| Frontend + API routes | Next.js (App Router, TypeScript) | Vercel |
| Python workers (bots) | Python 3, psycopg2 | Railway |
| Database | PostgreSQL | Railway |
| Auth | Clerk (configured, placeholder keys for now) | — |
| Payments | Stripe (configured, placeholder keys for now) | — |
| Domain | greekleads.gr (custom domain on Vercel) | — |

---

## Database

- **~1.67M companies** from the GEMI registry (live count via `/api/stats`)
- Hosted on Railway PostgreSQL
- Connection: `DATABASE_URL` env var (Railway internal + Vercel env var)
- Indexes: GIN on `activities`, trigram on `email` / `phone` / `url` / `afm`
  (`tools/add_search_indexes.py`), B-tree on `status_descr`,
  `prefecture_descr`, `legal_type_descr`, `incorporation_date`, `primary_kad`
- ⚠️ **No trigram index on `co_name_el`** — company-name search measured
  **~2.2s** (July 2026). `tools/add_name_index.py` adds it (CONCURRENTLY,
  `IF NOT EXISTS`); **not yet run**. Earlier versions of this doc claimed the
  index existed — it does not.

### Measured query costs (July 2026, local → Railway)
| Query | Time |
|---|---|
| Unfiltered `COUNT(*)` (all companies) | ~2.3s |
| Company name `ILIKE` (no trigram index) | ~2.2s |
| Any filtered segment (νομός / ΚΑΔ / μορφή) | 0.3–0.9s |
| People search `count=4+` (HAVING on join) | ~6.2s |

### Key Fields Per Company
`ar_gemi`, `afm`, `co_name_el`, `co_names_en`, `co_titles_el/en`, `objective`, `municipality_descr`, `prefecture_descr`, `city`, `street`, `zip_code`, `email`, `phone`, `fax`, `url`, `legal_type_descr`, `status_descr`, `is_branch`, `incorporation_date`, `last_status_change`, `activities` (JSONB — KAD codes), `persons` (JSONB — directors), `capital`, `gemi_fetched_at`, social columns (`instagram_url`, `facebook_url`, `linkedin_url`, `twitter_url`, `tiktok_url`, `youtube_url`, `website_scanned_at`)

### Data gotchas
- `municipality_descr` is a **combined** `"ΔΗΜΟΣ / ΝΟΜΟΣ"` string, not just the
  municipality.
- `'Inadequate Info'` is a real placeholder value in `municipality_descr`,
  `prefecture_descr` and `legal_type_descr`. It renders as
  `"Inadequate Info / Inadequate Info"` and must be matched as a **substring**
  (`ILIKE '%Inadequate Info%'`), not with an exact `NULLIF`. Currently only
  suppressed in `/api/suggest` — **likely leaking in other views**.
- `legal_type_descr` stores short codes (`ΑΕ`, `ΙΚΕ`, `ΟΕ`, `ΕΕ`, `ΕΠΕ`,
  `ΑΤΟΜΙΚΗ`), not expanded names. 25 distinct values.
- `prefecture_descr` is uppercase and **unaccented** — e.g. `ΑΧΑΙΑΣ`, not
  `ΑΧΑΪΑΣ`. Hardcoded filter links must match exactly or return 0 rows.
- Greek uppercase drops accents, so deriving display labels via `toLowerCase()`
  produces misspellings (`ΑΘΗΝΩΝ` → "Αθηνων"). Use explicit label/value pairs.

---

## Monetization (Phase 1)
- **Free (no account):** browse up to 2 pages (100 records). No export.
- **Pro ~€49/mo:** full search access, 1,000 export credits/month.
- **Enterprise:** custom pricing, bulk credits, API access.
- Export: credit-based (per record or per download batch).
- Gate is enforced in `/api/search` — returns 403 after page 2 for unauthenticated users.
- `NEXT_PUBLIC_DISABLE_GATE=true` bypasses the gate for development.

---

## Project Structure

```
greekleads/
├── web/                        ← Next.js app (Vercel)
│   ├── app/
│   │   ├── page.tsx            ← Home page (hero + 13 sections)
│   │   ├── search/page.tsx     ← Company search wrapper
│   │   ├── etaireies/[ar_gemi]/page.tsx ← Company detail page (SEO surface)
│   │   ├── people/page.tsx     ← People search wrapper
│   │   ├── people/[slug]/page.tsx ← Person profile
│   │   ├── pricing/page.tsx    ← Pricing page
│   │   ├── sign-in/ sign-up/   ← Clerk catch-all routes
│   │   ├── globals.css         ← Design system + page-scoped prefixes
│   │   └── api/
│   │       ├── search/         ← POST — filter + paginate companies (gated)
│   │       ├── suggest/        ← GET — company typeahead for the hero
│   │       ├── filters/        ← GET — all filter options (static JSON)
│   │       ├── stats/          ← GET — live registry counts (1h cache)
│   │       ├── stream/         ← GET — live GEMI stream for LiveExhibit
│   │       ├── scout/          ← POST — NL → filters (Scout AI)
│   │       ├── company/[ar_gemi]/            ← GET — company detail
│   │       ├── company/[ar_gemi]/connections ← GET — network graph
│   │       ├── people/search/                ← GET — person search
│   │       ├── people/[slug]/                ← GET — person detail
│   │       └── people/[slug]/network/        ← GET — person network
│   ├── components/
│   │   ├── SearchPage.tsx      ← Company search UI (filters, table, export)
│   │   ├── PeopleSearch.tsx    ← People search UI
│   │   ├── PersonProfile.tsx   ← Person profile (Gantt timeline, contacts)
│   │   ├── CompanyPage.tsx     ← Company detail page body
│   │   ├── CompanyPanel.tsx / CompanyPreviewPanel.tsx ← Slide-in panels
│   │   ├── Scout.tsx           ← Scout AI slide-over + prompt bar
│   │   ├── ForceGraph.tsx / CompanyNetworkGraph.tsx / PersonNetworkGraph.tsx
│   │   ├── LiveExhibit.tsx     ← Live GEMI stream widget
│   │   ├── LiveTicker.tsx      ← Scrolling ticker strip
│   │   ├── TopNav.tsx / Footer.tsx / Paywall.tsx / Icon.tsx
│   │   └── BrandMark.tsx / CountUp.tsx / KadDonut.tsx / HomeNetworkSection.tsx
│   └── lib/
│       ├── db.ts               ← pg pool + query / queryOne / queryWithTimeout
│       ├── auth.ts             ← gate helpers (FREE_PAGE_LIMIT, PAGE_SIZE)
│       └── filters.json        ← bundled filter options (~1.4 MB)
├── scripts/                    ← Python workers (Railway)
│   ├── bots/
│   │   ├── new_firms_watcher.py ← Polls GEMI every 10min for new companies
│   │   └── website_scanner.py   ← Scans new company sites for socials (3min)
│   ├── one_time/
│   │   └── bulk_load.py        ← Initial 1.67M company load (done, don't re-run)
│   ├── playwright_svc/         ← Playwright financial doc crawler
│   ├── financial_runner.py / financial_parser.py ← Financial statements (WIP)
│   ├── scan_utils.py           ← Shared social-scan logic (bot + bulk)
│   ├── runner.py               ← Railway entry point
│   ├── gemi.py                 ← GEMI API client
│   └── db.py                   ← PostgreSQL client for scripts
└── tools/                      ← Internal scripts (local only, user runs them)
    ├── add_name_index.py       ← Trigram index on co_name_el (NOT YET RUN)
    ├── add_search_indexes.py   ← Trigram indexes on email/phone/url/afm
    ├── db_migrate.py           ← Index + column migrations
    ├── update_filters.py       ← Regenerates web/lib/filters.json
    ├── leads.py                ← Internal lead explorer (Flask)
    ├── market_analysis.py      ← Industry breakdown report
    └── stats.py                ← DB statistics
```

---

## Design System

**Design brief:** the product sells **leads / prospects**, not "GEMI data shown
nicely". The registry is the trust moat (Greek buyers distrust scraped lists)
and the SEO surface. Visual register must read **professional and trustworthy to
Greeks aged 20–50** — closer to a bank / Επιμελητήριο / taxisnet than a startup
landing page.

Explicitly rejected during the July 2026 redesign:
- Dark navy "financial terminal" hero → read as tech startup, untrustworthy to
  older users.
- Sparse white hero with a lone search box → read as empty/unfinished. The fix
  is structure and content density, not brightness.
- SaaS signals generally: glows, gradients, particles, baby-blue washes, and
  marketing CTAs ("25 δωρεάν εξαγωγές — χωρίς κάρτα").

Reference points: Crunchbase, G2, Clutch — light bg, one big headline, one
prominent search bar, minimal copy.

- **Fonts:** IBM Plex Sans (UI) + IBM Plex Mono (numbers/code)
- **Palette:** warm page bg (`#FAF9F5`), navy text (`#16233B`), muted
  (`#55647A` / `#8A93A3`), warm borders (`#E2E0D6` / `#D8D6CB`), blue accent
  (`#1B4B8F`), orange CTA (`#D6502F`), ΓΕΜΗ green (`#136B3E` on `#E8F6EE`)
- **Borders:** `1px solid #E2E0D6` on cards/panels. (Older `0.5px` borders
  survive in places — they render sub-pixel and read as "missing".)
- **Cards:** white surface, `border-radius: 8px`
- **CSS prefixes:** `hs-*` = home hero, `sp-*` = company search, `ps-*` = people
  search, plus shared `card` / `section-label` / `kv-row` / `stat-card` used by
  company + person pages

---

## Pages Built

### Home Page (`/`)
- **Hero (`hs-*`)** — brand lockup, headline "Βρες τους επόμενους πελάτες σου.",
  subline "Κάθε ελληνική επιχείρηση, έτοιμη για προσέγγιση.", a single
  **company-only** search bar with live typeahead (`/api/suggest`), one stat line
  from `/api/stats`, and a "Νέες εγγραφές" live card on the right.
  - The feed is **placeholder data** in `useFakeNewFirms()`. Swap that one hook
    for a socket/SSE off `new_firms_watcher.py`; the `NewFirm` shape
    (`ar_gemi`, `name`, `legal_type`, `city`, `ts`) is what the real feed emits.
- Then: ProductPreview → PeopleSection → NetworkSection → ScoutSection →
  SocialSection → ExportSection → UseCases → SectorsTeaser → Foundation →
  PricingTeaser → BottomCTA → Footer
- Dead code: `HeroBackdrop`, `ParticlesBackdrop`, `CropMarks` are defined but
  unreferenced (~110 lines).

### Search Page (`/search`)
- Left sidebar (260px card): Στοιχεία επικοινωνίας, Κοινωνικά δίκτυα, Τοποθεσία,
  Κατάσταση, Νομική Μορφή, Κλάδος ΚΑΔ, Έτος Ίδρυσης, Δήμος
- Scout AI prompt bar + search input + active filter pills
- Results table: ΕΤΑΙΡΕΙΑ | ΝΟΜΙΚΗ ΜΟΡΦΗ | ΣΤΟΙΧΕΙΑ | ΙΔΡΥΣΗ | ΕΝΕΡΓΕΙΕΣ
- Row checkboxes + bulk CSV export, numbered pagination, table/card view toggle
- Paywall overlay after page 2 (gate enforced server-side)

### Company Page (`/etaireies/[ar_gemi]`)
Header card → tabs (Επισκόπηση / Άνθρωποι / Δραστηριότητες / Παρόμοιες / Δίκτυο).
Overview = 4 stat cards + two-column info cards. Label/value rows use `.kv-row`
(flex, right-aligned bold values) — the label/value weight contrast is what makes
it scannable.

### People Search (`/people`, `/people/[slug]`)
Centered column. Hero with ΓΕΜΗ badge + search + area/count/status filters;
result cards show avatar, role, company chips with status dots, and a divided
right rail with company count + active badge. Empty state explains the dataset
(no query needed). Profile page has a Gantt timeline + network graph.

### Pricing Page (`/pricing`)
- 3 tiers: Free / Pro / Enterprise

---

## Search Filters Available
| Filter | Type | Notes |
|---|---|---|
| Name | Text search | Trigram index on co_name_el |
| Κατάσταση | Multi-checkbox | Ενεργή, Λύση, etc. |
| Τοποθεσία (Prefecture) | Multi-checkbox + search | 56 prefectures, Attica shortcut |
| Νομική Μορφή | Multi-checkbox | ΑΕ, ΙΚΕ, ΕΠΕ, etc. |
| Κλάδος ΚΑΔ | Search + add chips | Primary KAD only |
| Data enrichment | Checkboxes | has_email, has_phone, has_website |
| Founded | Year range | year_from / year_to |
| Δήμος | Text search | municipality_descr |

---

## Environment Variables

### Vercel (web app)
| Variable | Description |
|---|---|
| `DATABASE_URL` | Railway PostgreSQL connection string |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk auth (placeholder for now) |
| `CLERK_SECRET_KEY` | Clerk auth (placeholder for now) |
| `NEXT_PUBLIC_DISABLE_GATE` | Set `true` to bypass paywall in dev |

### Railway (scripts)
| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (auto-linked) |
| `GEMI_API_KEY` | GEMI API key |

---

## What's Done

- [x] PostgreSQL on Railway with 1.67M companies
- [x] DB indexes for fast filtered search
- [x] `new_firms_watcher.py` — live bot adding new GEMI registrations every 10 min
- [x] Next.js web app with AGORA design system
- [x] Home page — complete AGORA rewrite (`page.tsx`, 13 sections, scroll-snap, dark mode, particles.js)
- [x] Search page (full filter sidebar, results table, company panel, paywall)
- [x] `/api/search` — filtered + paginated search (word-order-insensitive name search)
- [x] `/api/filters` — all filter options
- [x] `/api/stream` — live GEMI stream data
- [x] `/api/company/[ar_gemi]` — company detail
- [x] LiveExhibit widget (real data from DB, polls every 4s)
- [x] Row selection + CSV export
- [x] Paywall gate (2-page free limit, server-enforced)
- [x] Company detail panel (slide-in)
- [x] Deployed to Vercel (web) + Railway (scripts)
- [x] Custom domain greekleads.gr on Vercel
- [x] Individual company pages `/etaireies/[ar_gemi]` — full detail page with persons table, similar companies
- [x] People Search `/people` + `/people/[slug]` — search by name, profile page with Gantt timeline, ContactIntelligence
- [x] Company network graph — `/api/company/[ar_gemi]/connections` + `CompanyNetworkGraph` (force-directed, persons + linked companies)
- [x] Scout AI agent — slide-over chat on /search, Gemini Flash 2.5 picks filters from natural language
- [x] `queryWithTimeout` in `web/lib/db.ts` — prevents Railway proxy from killing long queries
- [x] Railway live watcher fix — `runner.py` now reconnects per-job (was crashing every 10min on idle connection)
- [x] `website_scanner` bot — scans new company websites for socials every 3 min, never rescans (`website_scanned_at` column)
- [x] `scan_utils.py` — shared scan logic (extract_all, scan_site, PATTERNS) used by bot + bulk scraper
- [x] Social URL bug fixes — removed erroneous `@` prefix from Instagram/Twitter URLs; fixed LinkedIn URLs missing `/company/` path (5,590 DB rows patched); regex updated so new scans are correct
- [x] ΑΤΟΜΙΚΗ persons backfill — `sync_persons` now inserts `co_name_el` as `ΙΔΙΟΚΤΗΤΗΣ` for sole proprietorships; full backfill of 1,121,499 firms run directly via Python (Railway console LIMIT 100 workaround)
- [x] Live company count — `/api/stats` endpoint (`COUNT(*)` on companies); home page fetches on mount (replaced hardcoded 1,284,940); search page switched from stale `pg_class.reltuples` to real count; `LiveExhibit` seeds counter from live DB value
- [x] `.gitignore` encoding fix — file was UTF-16 so git never honoured the `.env` rule; rewritten as UTF-8; `scripts/.env` untracked
- [x] Home hero rebuilt as a directory landing (`hs-*`) — brand lockup, "Βρες τους επόμενους πελάτες σου", company-only typeahead, live stat line, "Νέες εγγραφές" card
- [x] `/api/suggest` — lightweight company typeahead (6 rows, prefix-ranked)
- [x] `/api/stats` — expanded to companies / active / withContact / withSocial in one table pass, `revalidate = 3600`
- [x] Search page restyled to the institutional design (sidebar card, ΝΟΜΙΚΗ ΜΟΡΦΗ column, 1px borders)
- [x] Company page readability pass — bold right-aligned values, real section headers, bordered cards, social pills
- [x] People search redesign — hero, skeletons, richer result cards, dataset-explaining empty state
- [x] Full Greek translation of home page + people pages

## What's Next

- [ ] **Run `python tools/add_name_index.py`** — trigram index on `co_name_el`; takes name search / hero typeahead from ~2.2s to <200ms
- [ ] Wire the hero "Νέες εγγραφές" card to the real watcher (websocket/SSE) — replaces `useFakeNewFirms()` only
- [ ] **Gate hero Scout behind signup** — submitting a brief from the homepage will prompt account creation before the `/api/scout` call fires. This is the intended conversion trigger *and* the abuse control, so no separate rate limiting is planned. Currently **open/ungated** in dev.
- [ ] Audit `'Inadequate Info'` leakage across all views (only `/api/suggest` handles it)
- [ ] Remove dead `HeroBackdrop` / `ParticlesBackdrop` / `CropMarks` from `page.tsx`
- [ ] Speed up people search `count=4+` (~6.2s — HAVING over the full join)
- [ ] Activate Clerk auth (replace placeholder keys with real ones)
- [ ] Activate Stripe payments (replace placeholder keys, wire up export flow)
- [ ] Email provider (Resend / SendGrid) for auth emails
- [ ] Sector mapping — group KAD codes into ~12 broader sectors for the ΚΛΑΔΟΣ column
- [ ] Affiliate tracking link for influencer marketing
- [ ] Sitemap.xml generation for SEO
- [ ] LinkedIn enrichment bot (Phase 2)
- [ ] Contact verification bot — SMTP email check, carrier phone lookup (Phase 2)

---

## Planned: Live Feed + Statistics Page (`/statistika`)

A combined **live registry feed + business statistics + AI analysis** page.
Idea: see what was registered today and in which industries, then zoom out to
30d / 3m / 1y / all-time for historical trends.

**Why it matters commercially** — three jobs at once:
1. **SEO engine.** "πόσες επιχειρήσεις ιδρύθηκαν στην Ελλάδα", "νέες επιχειρήσεις
   [νομός]", "στατιστικά ΓΕΜΗ" are recurring searches with no good Greek source.
2. **Authority / press.** Citable numbers → backlinks → domain authority.
3. **Lead generation.** Every statistic must link into a filtered `/search`, so a
   chart becomes a prospect list. That is the conversion path — a stat page that
   doesn't convert is just a blog.

### Data feasibility (verified July 2026)

`incorporation_date` is well populated and shows a real trend:

| Year | New registrations |
|---|---|
| 2019 | 45.409 |
| 2021 | 49.486 |
| 2023 | 64.466 |
| 2024 | 74.405 |
| 2025 | 83.452 |
| 2026 | 40.614 (partial — to July) |

≈ **+84% formation growth 2019 → 2025**. That single number is a publishable story.

**KAD codes are hierarchical and machine-groupable.** `activities` JSONB holds:
```json
{ "type": "Κύρια", "dtFrom": "2026-03-01", "dtTo": null,
  "activity": { "id": "93120000", "descr": "…", "kadVersion": "kad_2026" } }
```
`activity.id` is an 8-digit NACE-derived code. `LEFT(id,2)` = NACE division
(~88), which maps to ~21 sections. **Sector grouping is mechanical** — no manual
mapping of the 10.773 distinct descriptions. This largely supersedes the
"Sector mapping" item in What's Next.

⚠️ **Gotchas found:**
- `kadVersion` is versioned (`kad_2008` vs `kad_2026`). A firm carries both, the
  old one closed via `dtTo`. **Filter to `dtTo IS NULL`** or every firm
  double-counts.
- Activities are time-bounded (`dtFrom`/`dtTo`) — which also makes **sector
  migration** measurable (firms that changed activity).
- `primary_kad` was **empty** on the company sampled — the denormalized column
  may be incomplete. Verify coverage before relying on it; the JSONB is truth.

### Statistics to include

**Tier 1 — the spine**
- Live feed of today's registrations (reuses the watcher)
- New firms today / 7d / 30d / 3m / 1y / all-time, with % change vs prior period
- Sector mix per period (share + rank change) — "what got founded today"
- Closures / dissolutions per period (`status_descr` + `last_status_change`)
- **Net growth** (births − deaths) — the number nobody else publishes
- Geographic split by νομός / δήμος

**Tier 2 — historical depth**
- Formation time series by year/quarter/month, with seasonality (which months
  peak) and YoY overlays
- **Cohort survival** — % of firms founded in year X still active (a genuinely
  valuable, citable statistic)
- Average lifespan by sector and legal form
- Legal-form shift over time (the ΙΚΕ rise since 2012 is a real story)
- Capital: total registered per period, median by sector/region/legal form
- Fastest-growing and fastest-declining sectors
- Emerging activity codes (KAD values appearing for the first time)

**Tier 3 — unique to GreekLeads** (nobody else has this)
- **Digital adoption**: % of firms with website / Instagram / Facebook /
  LinkedIn, sliced by sector, region and founding year. Are new firms more
  digital? → directly monetisable: "sectors with the lowest web presence" *is* a
  prospect list for web agencies.
- **Contactability**: % reachable by email/phone per sector — sells the dataset.
- **People networks** (`company_persons`): serial founders, most-connected
  directors, average directors per firm, new directors entering the market.
- Sector migration (firms that switched primary activity).

**Tier 4 — AI analysis (Scout)**
- Daily/weekly narrative: "Σήμερα ιδρύθηκαν 142 επιχειρήσεις, 23% στον τουρισμό
  — +40% έναντι του μέσου όρου."
- Anomaly detection: unusual spikes per sector/region.
- "Τι σημαίνει για εσένα" — turn a trend into a prospecting suggestion with a
  link to the matching filtered search.
- Generated once per period and **cached** — never per page view.

### Architecture (important)

Live aggregation is **not** viable: an unfiltered `COUNT(*)` already takes ~2.3s,
and these are `GROUP BY` over 1.67M rows with JSONB extraction.

→ **Nightly rollup tables**, written by a Railway job, e.g.
`stats_daily(day, dimension, dimension_value, metric, value)` covering
day × {sector, prefecture, legal_form, digital flags}. The page then reads small
pre-aggregated tables and renders instantly. Charts must never hit `companies`
directly.

### Open questions
- Route name: `/statistika` vs `/statistics` vs `/agora` (SEO — Greek likely wins)
- Public (SEO) vs gated? Recommend **fully public** — it is a top-of-funnel asset.
- Verify `last_status_change` coverage before promising closure/net-growth stats.

---

## Planned: Financial Statements (Phase 2)

Collect all financial statement PDFs from GEMI, store on Cloudflare R2, parse into structured financial data (revenue, profit, assets, equity), surface in the web app.

**API:** `GEMI_FINANCIAL_API_KEY` (second key, separate from polling key `GEMI_API_KEY`)
**Endpoint:** `GET /companies/{ar_gemi}/documents` → filter `decisionSubjectID` in `[4, 8, 78, 79]`
**Download:** `GET /downloadFile?key=assemblyDecision&elementId={kak}`

**Architecture (two-phase):**
1. **Download phase** — bulk script downloads all PDFs and stores to Cloudflare R2. Resumable via a `financial_docs` DB table tracking (ar_gemi, kak, r2_key, downloaded_at). Rate-limited to 8 req/min.
2. **Parse phase** — separate script reads PDFs from R2, extracts numbers, writes to `financial_statements` DB table. Re-runnable without re-downloading.

**Why two phases:** Parser is still being refined; separating download from parse means a parser fix = re-run locally, not re-download weeks of PDFs.

**Storage:** Cloudflare R2 (~$7/TB/month, free egress, S3-compatible)

**Parser approach (validated via test_financials.py / analyze_financials.py):**
- `pdfplumber` extracts text from B.5/B.6 ELP format PDFs reliably
- Automated filings ("Αυτοματοποιημένη Καταχώριση") parse cleanly; prefer over manual filings for same year
- Known gaps to fix: net profit label varies by format, 2015-era filings may be scanned images

**Fields to extract:** revenue (Κύκλος εργασιών), total assets (Σύνολο ενεργητικού), equity (Κεφάλαια και αποθεματικά), profit before tax, net profit, fiscal year

**Steps before building:**
- [ ] Set up Cloudflare R2 bucket + API token
- [ ] Finalize parser (fix net profit pattern, handle manual filing format)
- [ ] Create `financial_docs` and `financial_statements` DB tables
- [ ] Build download bot + parse script

---

## Planned: vrisko.gr Scrape

Scrape vrisko.gr for supplementary company data not available in GEMI (details TBD). Implementation approach to be defined by user.

---

## Session Log
- 2026-06-05: Built internal lead explorer (`tools/leads.py`) — Flask, filters, CSV export
- 2026-06-05: Added DB indexes (GIN, trigram, B-tree)
- 2026-06-05: Activity filter uses primary KAD only (type='Κύρια')
- 2026-06-17: Built `tools/market_analysis.py` and `tools/yacht_analysis.py`
- 2026-06-17: Started planning AGORA public MVP app
- 2026-06-22: Built Next.js web app — full AGORA design system implementation
- 2026-06-22: Home page: hero, live exhibit, stats, features, sectors, CTA
- 2026-06-22: Search page: sidebar filters, results table, company panel, paywall
- 2026-06-22: All API routes: search, filters, stream, company detail
- 2026-06-24: Redesigned home page to match AGORA home.jsx exactly (light theme, dotted grid hero, RegistryStrip, ProductPreview, DataSources, UseCases, SectorsTeaser, PricingTeaser, BottomCTA)
- 2026-06-24: Redesigned search page to match AGORA search.jsx exactly (sp-* design tokens, warm logo colors, GEMI badge, crop marks, filter pills)
- 2026-06-25: Deployed to Vercel, connected Railway PostgreSQL via DATABASE_URL
- 2026-06-25: Fixed Next.js 15/16 async params API in route handler
- 2026-06-25: Fixed LiveExhibit width stability (long names no longer resize widget)
- 2026-06-25: Reordered sidebar filters: Data enrichment first (open), KAD open, Founded open, Δήμος open, Κατάσταση closed
- 2026-06-28: Built individual company pages `/etaireies/[ar_gemi]` with full detail, persons table, similar companies
- 2026-06-28: Built People Search `/people` + `/people/[slug]` — `company_persons` table, Gantt timeline, ContactIntelligence
- 2026-06-28: Built Scout AI agent — slide-over panel on /search, Gemini Flash 2.5 via OpenRouter
- 2026-07-01: Added `queryWithTimeout` to `web/lib/db.ts`; fixed company page 42s query (missing `idx_companies_primary_kad`)
- 2026-07-01: Built company network graph — `/api/company/[ar_gemi]/connections` + ForceGraph component
- 2026-07-01: Fixed Scout truncated JSON (max_tokens 2048→8192 for Gemini 2.5 Flash thinking tokens)
- 2026-07-01: Fixed search word-order insensitivity (per-word ILIKE AND chain)
- 2026-07-07: Complete home page rewrite — AGORA design, 13 sections, scroll-snap, dark mode, particles.js
- 2026-07-07: Fixed Railway live watcher idle connection crash — runner.py now calls get_conn() per-job
- 2026-07-07: Built website_scanner bot — scans new firm URLs for socials (3 min interval, 20/batch, website_scanned_at tracks what's done)
- 2026-07-13: Fixed social URL bugs — Instagram/Twitter `@` prefix removed; LinkedIn missing `/company/` path fixed (regex + 5,590 DB rows)
- 2026-07-13: ΑΤΟΜΙΚΗ persons full backfill — 1,121,499 sole proprietor owners inserted into company_persons via direct Python connection (bypassing Railway console LIMIT 100)
- 2026-07-13: Live company count — `/api/stats` route, home page dynamic fetch, search page real COUNT(*), LiveExhibit seeded from DB
- 2026-07-13: Fixed scripts/.gitignore UTF-16 encoding → UTF-8; scripts/.env fully untracked
- 2026-07-20: Search page restyled — sidebar as bordered card, added ΝΟΜΙΚΗ ΜΟΡΦΗ column, 1px borders, institutional type scale
- 2026-07-20: Company page readability — `.kv-row` to flex/right-aligned bold values, `.section-label` to navy 12/700, `.card` to 1px borders, new `.social-pill`; fixed `.stat-label` collision with the homepage nav stat rule
- 2026-07-20: People search redesign (`ps-*`) — hero, shape-matched skeletons, richer cards, capability empty state; fixed segmented-control defaults reading as active filters; fixed chip ellipsis (text-overflow needs its own block box inside a flex container)
- 2026-07-20: Home hero rebuilt (`hs-*`) after three rejected directions (registry-light, dark terminal, ICP segment builder). Final = Crunchbase/G2/Clutch register: brand lockup, big headline, one company-only search, stat line, live "Νέες εγγραφές" card (placeholder data)
- 2026-07-20: Added `/api/suggest`; expanded `/api/stats` with real active/contact/social counts — the old hardcoded homepage figures were wrong (claimed 1.284.940 companies vs 1.672.7xx actual, and 326.400 "with social" vs 16.793 actual)
- 2026-07-20: Discovered `'Inadequate Info'` placeholder + combined `ΔΗΜΟΣ / ΝΟΜΟΣ` format in `municipality_descr`; fixed in `/api/suggest`
- 2026-07-20: Wrote `tools/add_name_index.py` (not yet run) after measuring name search at ~2.2s — the trigram index on `co_name_el` this doc previously claimed does not exist
