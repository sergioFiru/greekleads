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
- [ ] Tech-stack + marketing-stack scan (Phase 2) — see the dedicated Planned section below (webappanalyzer, backend-only ruleset, store results as a Pro filter)

---

## Live Feed + Statistics Page (`/statistika`) — BUILT (v1, Aug 2026)

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

### Decisions taken (Aug 2026)
- Route: **`/statistika`**, fully public, no gate. Linked from TopNav.
- Architecture: **`stats_rollup` + `stats_meta`**, built by
  `scripts/one_time/build_stats_rollup.py` (manual backfill) and refreshed
  nightly by `scripts/bots/stats_rollup.py` via runner.py. The page never
  touches `companies`.
- Sector grouping: `lib/nace.ts` maps NACE divisions → 21 sections. Unmatched
  codes land in an explicit 'X — Μη ταξινομημένο' bucket so shares always sum.
- Sector/region/legal bars link into `/search`, using a new **`kad_prefix`**
  filter added to `lib/searchQuery.ts`.

### Data-quality findings that shaped the page (measured, not assumed)
- `incorporation_date` 99,6% populated, but junk exists: 50 future-dated rows
  (max `9999-01-01`) and 39 pre-1900. `last_status_change` max is `9009-12-14`.
  The rollup clamps everything to `[HISTORY_FROM, CURRENT_DATE]`.
- **Our copy of ΓΕΜΗ lags.** p90 ingest lag for a newly founded firm is
  **81 days** (median 30), and a month keeps filling for weeks after it ends —
  August read 1.942 against a ~6.500 baseline. Anything inside a 90-day tail is
  therefore marked provisional, drawn hatched, and **excluded from every
  percentage change**. Without this the page would render our pipeline lag as a
  collapse in Greek company formation.
- Closures lag even harder — the last three months read 2, 10, 8 against a
  ~2.500/month baseline. Net growth is shown but flagged.
- **`primary_kad` holds the Greek DESCRIPTION, not a ΚΑΔ code** (e.g.
  'ΛΙΑΝΙΚΟ ΕΜΠΟΡΙΟ ΕΙΔΩΝ ΠΑΝΤΟΠΩΛΕΙΟΥ'). Any `LEFT(primary_kad, 2) = '68'`
  filter matches zero rows. It is also ~90% populated and **null on the newest
  firms**. The numeric code lives only in the `activities` JSONB, so it is now
  denormalised into **`companies.primary_kad_code`** by
  `scripts/one_time/backfill_primary_kad_code.py` and indexed on
  `LEFT(...,2)`; reading the JSONB at query time costs ~13s on a filtered
  COUNT, over the search endpoint's 15s timeout. The nightly stats_rollup bot
  tops the column up for newly ingested firms.
- Full month × sector rollup: 23.082 rows in 14,8s — comfortably a nightly job.

### Still open
- Tier 2 (cohort survival, lifespan, capital) and Tier 4 (Scout narrative) not
  built. Legal-form-over-time is a flat list for now, not a time series.
- The existing `activities` search filter also reads `primary_kad`, so it
  under-matches the newest firms — same root cause, separate fix.

---

## Financial Statements (Phase 2) — in progress

> **⚠️ 2026-08-19: see [`FINANCIALS_PLAN.md`](FINANCIALS_PLAN.md) — it is the
> current source of truth and supersedes the status below.** The existence sweep
> **completed** (188,468 scanned, not the 36,544/19.4% stated below). Verified
> that the portal's `/api/company/details` and `/api/download/financial`
> endpoints work over **plain HTTP with no Playwright, no cookies, no reCAPTCHA
> token** — so the Chromium crawler can be replaced by a plain `requests`
> service. Measured the portal's rate ceiling at **0.5–0.75 req/s, per-IP**
> (concurrency gives zero gain), cross-validated against 5 days of the real
> crawler's own throughput. Plan approved-pending: last-3-years scope
> (~314k docs, ~228k still to download), single IP, ~4–6.5 days, then AI
> extraction gated behind a cost-calibration run.
>
> **Coverage ceiling worth remembering:** only **51,581** companies have any
> filings at all — 30.3% of active ΑΕ/ΙΚΕ/ΕΠΕ, 5.2% of all active firms. Do not
> over-claim this in product copy.

Collect financial statement documents, store on Cloudflare R2, extract structured
numbers (revenue, profit, assets, equity) with Gemini, surface them on company
pages. Status as of 2026-08-06 (**stale — see the note above**):

**Collection — Playwright crawler, not the GEMI API.** The original
`GEMI_FINANCIAL_API_KEY` / 8-req/min plan was replaced by
`scripts/playwright_svc/financial_playwright.py`, a headless-Chromium crawler
against `publicity.businessportal.gr` (much faster: ~500+/hr vs ~60-70/hr).
Target = active ΑΕ/ΙΚΕ/ΕΠΕ (188,230 — the legal-filing-requirement companies).
**Paused since 2026-07-24** to cut Railway cost (no native pause — the
deployment was removed; fully resumable via the `financial_ar_gemi_scanned`
table). Progress frozen at **36,544/188,230 scanned (19.4%)**, **252,448
documents already in R2** (all PDF so far — the crawler also detects
xlsx/xls/doc but none have appeared yet), 10,401 companies confirmed to have
filings, 26,143 confirmed not to, 151,686 still unknown.

**Existence-only sweep (2026-08-06)** — a separate LOCAL script,
`scripts/one_time/financial_existence_scan.py`, checks the 151,686 unknown
companies without downloading anything (skips the download-rate-limiter
bottleneck entirely, so it's far faster — hours not weeks). Writes into the
same `financial_ar_gemi_scanned` table the Railway crawler uses. **Does not
touch `financial_playwright.py`** — kept as a separate file on purpose (editing
the deployed crawler in place for a one-off task was tried and reverted, see
`[[feedback_script_execution]]`). User is running this now.

**Extraction — AI-only, via OpenRouter, not pdfplumber/regex.**
`scripts/financial_ai_extractor.py`: PDFs go straight to `google/gemini-2.5-flash`
as native file input (Gemini reads scanned and digital pages alike, no OCR step
needed); xlsx gets its cells dumped to plain text via `openpyxl` first (Gemini
has no native spreadsheet vision, unlike PDF — confirmed against Google's own
docs) and then goes through the same prompt. One JSON-schema prompt either way,
Greek-number-format-aware, asks for exactly the 6 fields the live
`financial_statements` table already has: `fiscal_year, revenue, total_assets,
equity, profit_before_tax, net_profit`. `max_tokens=8192` (Scout hit a
truncation bug at 2048 from Gemini's "thinking" tokens — same fix applied
here). The old regex parser (`analyze_financials.py` / `financial_parser.py`,
~70-80% accuracy, silently 0% on the ~50% scanned-image docs) is superseded by
this, not used.

Test driver: `scripts/one_time/test_financial_ai_extraction.py` — pulls a few
real R2 docs, runs extraction, prints results; `--write` optionally saves into
`financial_statements` so results show up on the real company page. **Not yet
run** — waiting on an OpenRouter balance top-up.

**Not yet built:** the actual on-demand "Retrieve" backend (a small Railway
HTTP service wrapping page-load + the AI extractor, called by the company-page
button) and bulk backfill of the 252k already-downloaded docs — both
deliberately deferred until the extractor's been validated on real documents.

**Company-page UI — live.** `/etaireies/[ar_gemi]` has a real "Οικονομικά" tab
(only shown for ΑΕ/ΙΚΕ/ΕΠΕ), four states driven by real DB data: unchecked /
none found / found-but-not-retrieved (button visible, disabled, "Σύντομα" tag)
/ retrieved (stat cards + YoY deltas + sparklines + two small-multiple bar
charts, revenue and net profit kept on separate scales — never dual-axis + full
history table). See `CompanyPage.tsx`'s `FinancialsTab`.

**Legal-form filter caveat:** ΑΕ/ΙΚΕ/ΕΠΕ-only is a legal-category assumption
(Greece's *κεφαλαιουχικές εταιρείες* have a ΓΕΜΗ publication requirement; ΟΕ/ΕΕ/
ΑΤΟΜΙΚΗ don't) — reasonably solid under Greek company law, but **not
empirically verified** against businessportal.gr. A verification attempt hit
the API's session requirements + rate-limiting before getting a clean answer;
not blocking, just an open unknown.

---

## Planned: Tech-Stack + Marketing-Stack Scan (Phase 2 enrichment)

Fingerprint the tech stack of every firm website we know (ΓΕΜΗ urls + our
discovered ones) — a WhatWeb/Wappalyzer-style detector. Agreed 2026-07-24,
deferred (build **after** the current business-logic/features work).

**What it detects** — read from the HTML we *already download* in the scan
pipeline (`scripts/discover_websites.py`, live `website_scanner`, `scan_utils`).
Signals: `<meta name=generator>`, script src URLs (`cdn.shopify.com`,
`wp-content/plugins/woocommerce`), HTTP headers (`X-Powered-By`, `Server`,
platform `Set-Cookie` names). Two buckets, **both** wanted:
1. **Platform / CMS / ecommerce** — WordPress, WooCommerce, Shopify, Wix,
   Squarespace, Magento, PrestaShop, Joomla, Webflow, …
2. **Marketing stack** — GTM, Meta Pixel, Google Analytics, …

**Why it's valuable**
- Another proprietary layer nobody mirroring ΓΕΜΗ has → a **sellable Pro
  filter**: "every WooCommerce store in Greece", "Wix sites to upsell a real
  store".
- Marketing-stack signal cuts **both ways**: pixel + GTM + GA → spends on ads →
  budget/sophistication → premium lead; a site with **no** tracking →
  unsophisticated → prime target for a marketing agency.
- Turns Scout's "ecommerce firms" from a **KAD guess** into a **detected fact**.

**Data source — `enthec/webappanalyzer`** (the community fork maintaining
Wappalyzer's fingerprints after Wappalyzer went commercial/closed Aug 2023;
active, ~251 fingerprints as of 2026). Python wrapper option:
`PigeonSec/py-wappalyzer` (uses enthec as base).

⚠️ **LICENSE — GPLv3, not AGPL. Must respect:**
- GPLv3 copyleft triggers on **distribution**, *not* on running as a network
  service (the "SaaS gap" AGPL exists to close). So run the ruleset
  **backend-only** (batch scanner) → **no obligation to open-source GreekLeads**;
  full ruleset usable server-side.
- ❌ **Never** bundle the fingerprint JSON/regexes into the Next.js frontend
  shipped to browsers, and **never** expose an API returning the raw ruleset —
  that is distribution → copyleft.
- ✅ **Store only the RESULTS** ("firm X → Shopify + Meta Pixel"). Results are
  **facts about third-party companies** — not copyrightable, not a derivative
  work — so **populating our DB with them is fine**, and they're ours to index,
  filter, gate behind Pro, and sell. (A GPL scanner no more makes its output GPL
  than a GPL compiler makes your program GPL.)
- Not legal advice; cheap to get a one-off "backend-only, results-in-DB"
  confirmation before launch, but this is the mainstream GPLv3 reading.

**Open decisions (when we build):**
- [ ] Storage shape — normalized `technologies` set per company, categorized
  (cms / ecommerce / analytics / payment / hosting / marketing)
- [ ] Re-scan cadence — stacks change (Wix→Shopify); not one-and-done; dovetails
  with the monitoring roadmap
- [ ] Which filter categories to surface first

This also feeds the **Digital adoption** statistics (Tier 3 of the stats page).

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
- 2026-07-24: Planned tech-stack + marketing-stack scan (Phase 2 enrichment) — verified `enthec/webappanalyzer` is GPLv3 (not AGPL); confirmed backend-only use doesn't trigger copyleft and detection results are storable facts; documented as a Pro-gated filter
- 2026-08-06: Site-wide card/divider depth polish (`.card` shadow, 1px row dividers replacing near-invisible 0.5px)
- 2026-08-06: Company page redesign — left sidebar tab nav replaced with a horizontal top tab bar (`cp-tabbar`/`cp-tab`)
- 2026-08-06: Built the "Οικονομικά" tab on `/etaireies/[ar_gemi]` — real 4-state UI (unchecked / none found / found-not-retrieved / retrieved with dynamic multi-year charts + history table) wired to `financial_ar_gemi_scanned` + `financial_statements`; verified against real ar_gemi examples for all 4 states
- 2026-08-06: Built `scripts/one_time/financial_existence_scan.py` — local, existence-only sweep (no downloads) for the 151,686 not-yet-checked ΑΕ/ΙΚΕ/ΕΠΕ companies; kept fully separate from the deployed `financial_playwright.py` after an in-place edit was tried and reverted (see `[[feedback_script_execution]]`)
- 2026-08-06: Built `scripts/financial_ai_extractor.py` — AI-only extraction (no pdfplumber/regex) via `google/gemini-2.5-flash` on OpenRouter; PDFs as native file input, xlsx bridged to text via `openpyxl` (Gemini has no native spreadsheet vision); plus a local test driver (`test_financial_ai_extraction.py`). Not yet run — pending an OpenRouter balance top-up
- 2026-08-19: Financials pipeline re-planned end-to-end → **[`FINANCIALS_PLAN.md`](FINANCIALS_PLAN.md)** (awaiting approval, no code written). Findings: existence sweep is **complete** (188,468 scanned / 51,581 with filings / 915,368 docs discovered, vs the 19.4% PROJECT.md claimed); portal endpoints work over **plain HTTP — no Playwright/cookies/reCAPTCHA** (`query` must be the object `{"arGEMI":"…"}`, a bare string 400s); rate ceiling measured at **0.5–0.75 req/s per-IP with concurrency giving zero gain**, cross-validated against 5 days of the deployed crawler's real throughput (0.46–0.57/s); `PW_DL_RATE=1.2` has been above the ceiling all along. Doc types split ΙΣΟΛΟΓΙΣΜΟΣ/ΚΑΧ/ΠΡΟΣΑΡΤΗΜΑ per fiscal year, but filename classification is only ~80% reliable (Greek accents + Latin/Greek homoglyphs) so it must not be a hard filter; ~54% of PDFs are scanned images. Scope locked: last 3 years, unknowns kept, single IP

- 2026-08-20: Built the **Πελατολόγιο (CRM)** — see **[`CRM_PLAN.md`](CRM_PLAN.md)**. New tables `crm_lists` / `crm_list_members` / `crm_saved_searches` (`scripts/one_time/create_crm_tables.py`, idempotent); `lib/entitlements.ts` is the single source of truth for plan limits (free = 1 list / 50 members / 3 saved searches); `getAuth()` widened to return `plan` and gained `requireUser()`; **Clerk keys are now real** (were `placeholder`, so every visitor was anonymous). `buildWhere()` extracted from `/api/search` to `lib/searchQuery.ts` so "add all N results" inserts server-side via `INSERT..SELECT` without paging rows through the browser. Five `/api/crm/*` routes, all scoping ownership in the SQL `WHERE`. `SaveToDialog` wired to both previously-dead "Αποθήκευση" buttons on `/search`; `/crm` index + `/crm/[id]` detail with per-prospect notes and CSV export. "Ζωντανή λίστα" (Bring it Alive) ships as a **visible-but-disabled** toggle that persists `is_live`/`live_filters` — the matcher engine is NOT built. Instantly/HubSpot buttons are disabled placeholders. Clerk v7 has no `SignedIn`/`SignedOut` exports (v6 API) — TopNav uses `useAuth()` inside child components instead. **Fixed a pre-existing export bug**: `selected` was a `Set<string>` while CSV export filtered `results` (current page only), silently dropping cross-page selections; it is now a `Map<string, Company>` holding full rows.
- 2026-08-20: Fixed intermittent `could not resize shared memory segment "/PostgreSQL.NNN": No space left on device` on `/search`. **Not a full disk** (DB is 5.6GB) — `/PostgreSQL.NNN` is a POSIX shm object and `dynamic_shared_memory_type=posix`, so parallel workers allocate in `/dev/shm` (64MB in a container). Filter combos plan as `Parallel Bitmap Heap Scan` over a `BitmapAnd` of three index scans (~716k + 1.07M + 1.34M rows); the shared ~3.1M-pointer bitmap requested 12.6MB and `/dev/shm` was full under concurrency. Added `queryNoParallel()` to `web/lib/db.ts` (sets `max_parallel_workers_per_gather=0` + statement_timeout per connection, RESETs both in `finally` since the pool reuses connections); used by `/api/search` (rows + count) and the CRM add-all `INSERT..SELECT`. Serial plans build the bitmap in private backend memory, where this cannot occur. Measured 617ms → ~990-1380ms. **Do NOT raise `work_mem` to fix this** — the shared bitmap may grow up to `work_mem`, so a bigger value asks `/dev/shm` for a LARGER segment and fails more often. Related symptoms seen: `work_mem=4MB` causes lossy bitmaps (`lossy=57944`, 207,069 rows rechecked) and 156GB of cumulative temp-file writes.
- 2026-08-20: **CRM rebuilt as an Excel-style data grid.** `/crm/[id]` is now `CrmDataGrid` — sticky header + frozen name column, 30 columns across 4 groups from a DB-persisted per-list layout (`crm_lists.columns`), sort, quick-filter, row selection, bulk actions, inline note editing, and a pipeline stage per prospect (`crm_list_members.stage` + `last_contacted`, CHECK-constrained: new/contacted/proposal/customer/lost). `lib/crmColumns.ts` is the single column catalogue — the picker, header, cell renderer and CSV all read from it, and `resolveColumns()` drops stale keys so an old saved layout can never break the grid. `/crm` index rebuilt from cards into a dense table with a proportional pipeline bar per list. Schema via `scripts/one_time/add_crm_grid_columns.py` (idempotent). Gotcha fixed in review: the index stage breakdown was first written as `jsonb_object_agg(stage, 1)` inside the per-list LATERAL, which aggregates one row per member and reports 1 for every stage — replaced with a grouped subquery.
- 2026-08-20: Select-all on /search now asks "all N matching" vs "just this page" — virtual flag (`allMatching` + `excluded`), never materialises rows; new `POST /api/search/export` builds the CSV server-side from `buildWhere`, capped by `entitlements.maxBulkAdd`; bulk list-add honours the same exclusions
- 2026-08-21: Built /statistika — live registry feed, period KPIs, formation chart with provisional tail, sector mix, prefecture map, digital-presence panel; stats_rollup tables + nightly bot; lib/nace.ts sector map; kad_prefix search filter
- 2026-08-21: /statistika redesign — editorial layout (masthead, feed+figure+chart hero, ruled sections); found and fixed that primary_kad stores descriptions not codes (sector links returned 0 results) via new denormalised primary_kad_code column; Greek decimal separator on all percentages
- 2026-08-21: Fixed idle-in-transaction leak in scripts/db.py get_conn() + runner.py make_job() — cached worker connection held ACCESS SHARE on companies for ~50min, blocking DDL and autovacuum; migrations now preflight for stale txns, use lock_timeout and CREATE INDEX CONCURRENTLY
