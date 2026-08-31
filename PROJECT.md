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
- [x] Sitemap + robots.txt (Phase 0) — live; index built. See **[`SEO_PLAN.md`](SEO_PLAN.md)**
- [ ] Verify the property in Google Search Console + Bing Webmaster Tools, submit `/sitemap.xml`
- [ ] Watch the Tier A indexation ratio for 3–4 weeks, then decide whether to widen `TIER_A`
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

## Planned: Scout v2 — ΚΑΔ vocabulary table + tool loop (designed Aug 2026, not built)

### Why Scout v1 is at its limit

Scout today is a **one-shot text→JSON translator**: brief → Gemini 2.5 Flash with a
~100-line static system prompt → filters + Greek keyword stems → `primary_kad ~* '\mSTEM'`
→ COUNT. Every bug so far (ΕΚΣΚΑΦΩΝ, ΦΩΤΟΒΟΛΤ-as-buyer, legal-type-as-size,
has_email by reflex) was patched by **adding another paragraph to the prompt**.
That approach is out of road. The real gaps are structural:

1. **No tools, no loop.** It guesses stems, and the COUNT happens *after* it has
   already answered. It never sees its own result and cannot react to it.
2. **It cannot ask a question.** The schema has exactly one shape (a recipe), so
   every ambiguity is silently resolved by guessing.
3. **Its knowledge of the data is 17 hand-typed lines** in the prompt. Anything
   off that list (marble, wood, printing, vets, gyms…) is invented from
   pretraining and hoped to exist in ΓΕΜΗ's vocabulary.
4. **It optimises the wrong objective** — the prompt literally says "return the
   MAXIMUM number of relevant prospects".
5. **It reads `primary_kad`** (the stale description column) not
   `primary_kad_code`, and ignores secondary activities entirely.
6. **It reaches 8 of ~20 filters.** No year range, municipality, kad_prefix or
   social filters — so "νεοσύστατες στη Γλυφάδα με Instagram" is unreachable.

Agreed plan, in order: (1) `kad_vocab` table → (2) tool loop → (3) let it ask
questions → (4) target band instead of "maximum" → (5) show the chosen ΚΑΔ list
with per-code counts and checkboxes → (6) wire the missing filters → (7) stream +
log briefs as an eval set → (8) stronger model for the planning turn.

### Measured facts about the ΚΑΔ vocabulary (probed Aug 2026, not assumed)

- **The live vocabulary is 9.507 codes.** Filter `dtTo IS NULL` +
  `kadVersion='kad_2026'` and code→descr is **strictly 1:1** (9.507 codes,
  9.507 pairs). No ambiguity.
- ⚠️ **`kad_2008` and `kad_2026` reuse the same 8-digit code for different
  activities.** `19200000` = luggage in one, petroleum refining in the other;
  `13101000` = iron ore vs wool grease. Across all history: 21.032 distinct
  codes, 22.452 code/descr pairs, 14.267 distinct descriptions. **Any code-based
  logic must pin kadVersion.** Harmless today only because of the split below.
- **Open activity is ~100% kad_2026**: of 8.482.111 open rows, 8.482.051 are
  kad_2026 and **60** are kad_2008. Historically it is near-even (8,5M vs 6,5M),
  so the collision bites only on closed activities.
- **Firms register at every depth** — this kills any "normalise to 4-digit class"
  idea. 8-digit 4.896 codes/597.163 firms · 6-digit 3.842/307.770 ·
  4-digit 512/199.788 · 3-digit 246/55.540 · 2-digit 11/20.857.
  **76.397 firms sit shallower than class**, so a code is a *point*: a firm on
  `41000000` is NOT inside `41100000`. Prefix rollup is for aggregation only.
- Structure: 87 divisions → 288 groups → 770 classes → 4.612 categories → 9.507 codes.
- **Half the vocabulary is long tail**: 1.703 codes have zero primary firms,
  3.309 have 1–9. All 9.507 have ≥1 firm somewhere.
- **Secondary activities are a 7× larger surface than Scout touches today** —
  8,48M open activity rows over 1,18M firms with an open primary (~7 each).
- **Description search is mandatory, prefixes are not enough**: `ΜΑΡΜΑΡ` spans
  five divisions — 08 quarrying, 23 cutting, 43 installation, 46 wholesale,
  47 retail.
- **`00010000 ΕΛΛΕΙΨΗ ΔΡΑΣΤΗΡΙΟΤΗΤΑΣ` is the 9th largest primary code in Greece
  (11.864 firms; 12.598 across division 00).** Registered-but-dormant shells,
  currently landing in `nace.ts`'s 'X' bucket and counted as prospects everywhere.
- **Division 45 does not exist in Greek ΚΑΔ 2026.** Vehicle sales/repair live in
  95, which `nace.ts` maps to *S — Άλλες υπηρεσίες*, so every car repair shop in
  the country files under "other services" rather than Εμπόριο on `/statistika`.
- Environment: PostgreSQL **18.6**; `pg_trgm` 1.6 installed; **`vector` 0.8.6
  available but not installed**; we connect as `postgres` with CREATE privilege.
  `unaccent` available — deliberately skipped, normalisation is done in Python so
  it matches the frontend's JS `norm()` exactly.
- The full per-code aggregate ran in **20,5 s** — comfortably a nightly job.

### Decisions taken (Aug 2026)

- **Grain: codes only** (9.507 rows), rollup by prefix at query time. No
  synthetic class/group/division rows, no subtree count columns.
- **Coverage: keep everything, flag it.** Division 00 gets `is_dormant`; the
  1.703 zero-primary codes stay and are visible via `primary_firms = 0`. The
  search tool excludes them by default. The table stays a faithful mirror of ΓΕΜΗ.
- **Retrieval: hybrid.** GIN trigram on `descr_norm` **+** vector, fused with
  reciprocal-rank fusion. Trigram gives a precision floor and a working fallback
  when the embedding call fails; vectors cover synonyms trigram cannot reach.
- **Embeddings from day one**, `gemini-embedding-001` (Matryoshka) at **768 dims**
  — enough for 9.507 short Greek phrases and keeps the HNSW index tiny.
  ⚠️ **OpenRouter has no embeddings endpoint**, so this needs a *new direct
  Google AI Studio key*, in `scripts/.env` **and** in Vercel — the query must be
  embedded per request, putting a third-party call (~100–200 ms) on the critical
  path of `/api/scout`.
- **HNSW, not IVFFlat** — at 9.507 rows IVFFlat's clustering buys nothing and
  needs `lists` tuning.
- **Build: `scripts/one_time/build_kad_vocab.py`** (with progress bar, user runs
  it) for the initial build; refresh folded into the nightly
  `scripts/bots/stats_rollup.py`, mirroring how `primary_kad_code` is topped up.
- **`aliases` left empty in v1** — measure what hybrid search actually misses
  before guessing synonyms.

### Agreed schema

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE kad_vocab (
  code            char(8)     PRIMARY KEY,
  kad_version     text        NOT NULL DEFAULT 'kad_2026',
  descr           text        NOT NULL,
  descr_norm      text        NOT NULL,   -- NFD, marks stripped, ς→σ, uppercase

  division        char(2)     NOT NULL,
  group_code      char(3)     NOT NULL,
  class_code      char(4)     NOT NULL,
  category_code   char(6)     NOT NULL,
  depth           smallint    NOT NULL,   -- 2 | 3 | 4 | 6 | 8
  section         char(1)     NOT NULL,   -- A–U per nace.ts, 'X' if unmapped
  section_label   text        NOT NULL,

  primary_firms   integer     NOT NULL,   -- open kad_2026, type='Κύρια'
  primary_active  integer     NOT NULL,   -- + status_descr='Ενεργή'
  any_firms       integer     NOT NULL,
  any_active      integer     NOT NULL,

  with_email      integer     NOT NULL,   -- all four over primary_active
  with_phone      integer     NOT NULL,
  with_website    integer     NOT NULL,
  with_social     integer     NOT NULL,

  is_dormant      boolean     NOT NULL DEFAULT false,
  aliases         text[]      NOT NULL DEFAULT '{}',
  embedding       vector(768),

  built_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX kad_vocab_descr_trgm ON kad_vocab USING gin (descr_norm gin_trgm_ops);
CREATE INDEX kad_vocab_alias_gin  ON kad_vocab USING gin (aliases);
CREATE INDEX kad_vocab_embed_hnsw ON kad_vocab USING hnsw (embedding vector_cosine_ops);
CREATE INDEX kad_vocab_class      ON kad_vocab (class_code);
CREATE INDEX kad_vocab_division   ON kad_vocab (division);
```

### Next step when this resumes

Write `scripts/one_time/build_kad_vocab.py`. **Blocked on**: a Google AI Studio
key for `gemini-embedding-001`. Probe scripts used to establish all of the above
are in the session scratchpad (`kad_vocab_probe{,2,3}.py`).

---

## Session Log
- 2026-08-31: Company-page SEO pass (titles, meta, schema). New `web/lib/companyName.ts`.
  ROOT CAUSE WAS NOT THE BRIEF'S GUESS: nothing lowercased the title - it read co_name_el directly. Google REWROTE it because it was long and all-caps; fundamenta's short abbreviated caps title in the same SERP was left alone. Fix = abbreviate the legal-form boilerplate and de-shout Latin words so Google keeps our title.
  DELIBERATELY NOT lowercasing Greek: 980.858/1.053.852 active names are ALL CAPS and only 60.634 have accents, because uppercase Greek correctly omits them. Lowercasing would turn a million correct names into misspelt ones. Legal-form boilerplate is the exception (fixed vocabulary, safe to accent).
  Titles now prefer the d.t. (364.023 active companies have one) - people google the brand, not the legal name. Meta description replaced the old `objective` fallback (a legal blob identical across thousands of firms, which Google ignored) with a dynamic list that only promises fields the company actually has, owners/directors first (the differentiator vs 11888/fundamenta), budgeted to 155 chars by dropping whole items.
  BUGS FOUND WHILE VERIFYING AGAINST REAL ROWS:
   * `company_persons.ar_gemi` is TEXT, `companies.ar_gemi` is BIGINT - my new EXISTS would have 500'd EVERY company page. tsc and next build both passed; only running it caught this.
   * JS `\b` is an ASCII word boundary and Greek letters are not \w, so every legal-form regex silently no-opped. Replaced with (?:^|\s).
   * Homoglyphs: real d.t. values include `SIDE A.E.` (Latin A/E) and `Μ.EΠΕ`; plus `Μ.Ε.Π.Ε.` glues the monoprosopi prefix on with no space. Without folding these we appended a second suffix (`ZV Greece Μ.Ε.Π.Ε. Ε.Π.Ε.`). hasLegalForm now normalises the last token.
   * `S.P.S.` became `S.p.s.` - dotted acronyms are now left alone.
   * Meta-description concatenation `179604901000ORIGAMI` was NOT in the meta tag: the GEMI badge and the English-name span are adjacent flex children separated only by `gap:10`, i.e. CSS not text, so crawlers ran them together. Added a real separator text node.
   * `{arr.length && <x/>}` rendered a literal 0 when co_names_en was empty.
  Schema: alternateName was already shipped; ADDED `vatID` and `sameAs` (social profiles).
- 2026-08-30: PFA question closed - no customers expected before the IKE, so a Romanian VAT/OSS/e-Factura registration would be stood up and abandoned inside a month. Stripe goes live only on the Greek IKE. (Correction to the earlier entry: Stripe DOES support account-to-account migration - PCI data-migration request for payment methods, Billing Migration Toolkit for subscriptions, SEPA mandates carry over - but it is ~10 business days plus documented elevated post-migration declines, so it is disproportionate for a handful of customers.)
  BUG CLOSED: `exportSelected` in SearchPage built the CSV client-side from rows already in memory and never called /api/search/export, so **CSV export was ungated for everyone** despite the server enforcing maxExportRows. SearchPage now fetches /api/billing/status, locks the button to /pricing when maxExportRows is 0, slices the selection to the cap, and shows the cap in the button label. Server check unchanged - this is the UI half.
  New `scripts/one_time/grant_plan.py` - grant/revoke a plan with no Stripe (source='manual', synthetic stripe_* values, stable id manual_<user_id> so re-granting updates in place). Same table and same read path as a real subscription on purpose: a granted Agency user exercises exactly what a paying one does. Needed a new `billing_subscriptions.source` column - create_billing_tables.py gained an idempotent ALTER, so RE-RUN IT. `--list` / `--list-users` help find a Clerk user id.
- 2026-08-30: ENTITY BLOCKER FOUND. The existing Stripe account was created under a Romanian PFA and is therefore a RO account (hence RON). Stripe: "After activating a Stripe service on a live account, you can't change the business origin country. To use a different supported country, create a new account." Removing the business info does not change what the account is. Decision: DO NOT launch live on it. The Greek IKE (~Oct 2026) gets a brand-new Stripe account; billing through the RO PFA would mean 0% reverse-charge invoices from a Romanian entity to Greek customers (needing VIES-valid VAT numbers many small Greek firms lack), RO e-Factura instead of myDATA, and - since subscriptions cannot be moved between Stripe accounts - every subscriber re-entering their card at migration. Nothing is wasted by waiting: sandbox tax registrations never carry to live anyway, and the app is fully env-driven, so switching accounts is 4 env values and ZERO code changes.
  Built alongside: `web/scripts/setup-stripe.mjs` - idempotent Products/Prices creation (one Product per tier, EUR, tax_behavior=exclusive, tax_code txcd_10103001), refuses live keys without --live, dry-run by default, and REPORTS TAX STATE - warns loudly when there is no active registration. `/api/billing/status` + `components/BillingCard.tsx` on /crm: plan, status chip, renewal/expiry date, past_due warning, portal button. Polls for ~15s on ?checkout=success because Stripe redirects back before the webhook lands.
- 2026-08-29: Stripe subscriptions built (Stripe Tax route). SDK 16 -> 22.6; API version PINNED to 2026-07-29.dahlia. New `scripts/one_time/create_billing_tables.py` -> billing_customers / billing_subscriptions / billing_events (NOT YET RUN). Postgres is the source of truth: getAuth() now reads `billing_subscriptions` via lib/billing.ts, Clerk publicMetadata is only a mirror. Routes: /api/billing/checkout (hosted Checkout, automatic_tax + tax_id_collection + customer_update.address=auto, no payment_method_types), /api/billing/portal, /api/billing/webhook (signature-verified, Node runtime, deliberately OUT of the Clerk matcher). GOTCHA FOUND: `current_period_end` lives on the subscription ITEM, not the Subscription, since API 2025-03-31 - reading the old path stores null. Webhook idempotency is claim-then-RELEASE: claiming without releasing on failure would make Stripe's retry a silent no-op and lose the event permanently. past_due still grants access (dunning); incomplete does not. Env: STRIPE_PRICE_MONTHLY -> STRIPE_PRICE_INDIVIDUAL_YEARLY + STRIPE_PRICE_AGENCY_MONTHLY.
  BLOCKED ON (user): Greek VAT registration recorded in Stripe live mode BEFORE the first charge (automatic_tax silently collects EUR 0 with no registration, unfixable retroactively); create the two Products with tax_behavior=exclusive and tax code txcd_10103001 (confirm with accountant); webhook endpoint + signing secret; myDATA invoicing tool; confirm CONTACT_EMAIL mailbox exists.
- 2026-08-29: Rebuilt `/pricing` from GREEKLEADS_PRICING.md - four tiers (Dorean / Individual 75eur-yr / Agency 100eur-mo featured / Enterprise contact-us). Killed the rejected pay-per-export tier. Every number on the page is derived from entitlements.ts + pricing.ts, so the copy can no longer contradict the code. Enterprise CTA is a mailto (CONTACT_EMAIL in pricing.ts - VERIFY THE MAILBOX EXISTS). Paid CTAs point at /sign-up?plan=<tier> so the post-signup checkout handoff has a hook. CSS: 4-col grid, 2-up below 1080, 1-up below 640; page max-width 900->1180. `npx next build` clean, /pricing still statically prerendered.
- 2026-08-29: Auth/payments groundwork. Clerk moved to a PRODUCTION instance (clerk.greekleads.gr) - fixes the Googlebot 307 handshake at the root and lifts the 100-user dev cap. Rewrote `lib/entitlements.ts` for four tiers per GREEKLEADS_PRICING.md: added `anon` as a real plan key (a signed-in free user was previously treated exactly like a stranger, so signup bought nothing), replaced `canExportCsv:boolean` with `maxExportRows:number`, added `maxSearchPages`. Gate is now anon 2 pages -> signup wall, free 5 pages -> upgrade wall; /api/search returns `reason` so the client shows the right one. Removed three hard-coded limits that violated the single-source rule (SearchPage's duplicate FREE_PAGE_LIMIT, SaveToDialog's `plan==='paid' ? Infinity : 1`, CrmPage's literal '1 list / 50 contacts' and its now-false 'unlimited lists' promise). New `lib/pricing.ts` holds the public prices. Stripe still entirely unbuilt.
- 2026-08-29: Designed Scout v2 - probed the KAD vocabulary (9.507 live codes, kad_2008/kad_2026 code collision, firms at every depth, division 45 absent, 12.598 dormant shells); agreed the `kad_vocab` schema, hybrid trigram+vector retrieval, Gemini 768-dim embeddings. Build script not yet written.
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
- 2026-08-24: **SEO Phase 0 — sitemaps + robots.txt.** Neither existed before. `app/robots.ts` disallows `/search` (faceted search is an effectively infinite URL space that would eat the whole crawl budget), `/people?` query variants, `/crm`, `/api/`, auth pages. Sitemaps are **plain route handlers, not Next's metadata convention**: `generateSitemaps` emits the chunk files but never the `<sitemapindex>` that ties them together, while still reserving `/sitemap.xml` for itself and serving 404 there — so `app/sitemap.xml/route.ts` is the index and `app/sitemaps/[chunk]/route.ts` serves `/sitemaps/N.xml` (0 = hub pages, 1..N = companies, 50k each). `lib/sitemapScope.ts` is the single definition of `CHUNK` and `TIER_A`. **Scope is deliberately Tier A only — 80.032 active companies that have a website**, not all 1.67M: those pages carry data no ΓΕΜΗ mirror has, and dumping 1.67M near-duplicate registry pages from a domain with no authority buys a large "Discovered – currently not indexed" number and a site-wide quality problem. Widen `TIER_A` only once GSC shows Tier A indexing well. **Blocking:** the sitemap query is a 12s sequential scan without `scripts/one_time/add_sitemap_index.py` (partial index on `(ar_gemi) INCLUDE (last_updated_at)` `WHERE status_descr = 'Ενεργή' AND url IS NOT NULL AND url <> ''`); measured 51s to serve chunk 1 unindexed in dev, which would exceed the Vercel function limit. Predicate uses `=` not `ILIKE` because an index predicate must be immutable. Gotcha hit on the way: **Next 16 passes `generateSitemaps`' `id` as a Promise** — reading it unawaited yields NaN and every chunk silently serves the same four hub URLs.
- 2026-08-21: Fixed idle-in-transaction leak in scripts/db.py get_conn() + runner.py make_job() — cached worker connection held ACCESS SHARE on companies for ~50min, blocking DDL and autovacuum; migrations now preflight for stale txns, use lock_timeout and CREATE INDEX CONCURRENTLY
