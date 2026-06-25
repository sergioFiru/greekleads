# GreekLeads — Project Tracker

## The Vision
A **Greek B2B lead intelligence platform**. Phase 1: validated data access tool — search, filter, and export every Greek company from the GEMI registry. Phase 2+: enrichment (emails, phones, websites verified), sector intelligence, CRM features.

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

- **~1.67M companies** from the GEMI registry
- Hosted on Railway PostgreSQL
- Connection: `DATABASE_URL` env var (Railway internal + Vercel env var)
- Indexes: GIN on `activities`, trigram on `co_name_el` + `municipality_descr`, B-tree on `status_descr`, `prefecture_descr`, `legal_type_descr`, `incorporation_date`

### Key Fields Per Company
`ar_gemi`, `afm`, `co_name_el`, `co_names_en`, `co_titles_el/en`, `objective`, `municipality_descr`, `prefecture_descr`, `city`, `street`, `zip_code`, `email`, `phone`, `fax`, `url`, `legal_type_descr`, `status_descr`, `is_branch`, `incorporation_date`, `last_status_change`, `activities` (JSONB — KAD codes), `persons` (JSONB — directors), `capital`, `gemi_fetched_at`

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
│   │   ├── page.tsx            ← Home page (AGORA design)
│   │   ├── search/page.tsx     ← Search page wrapper
│   │   ├── pricing/page.tsx    ← Pricing page
│   │   ├── globals.css         ← Design system (AGORA tokens + sp-* + hp-*)
│   │   └── api/
│   │       ├── search/         ← POST — filter + paginate companies
│   │       ├── filters/        ← GET — all filter options
│   │       ├── stream/         ← GET — live GEMI stream for LiveExhibit
│   │       └── company/[ar_gemi]/ ← GET — single company detail
│   ├── components/
│   │   ├── SearchPage.tsx      ← Full search UI (filters, table, pagination, export)
│   │   ├── CompanyPanel.tsx    ← Slide-in company detail panel
│   │   ├── LiveExhibit.tsx     ← Live GEMI stream widget (hero right side)
│   │   ├── LiveTicker.tsx      ← Scrolling ticker strip
│   │   ├── HeroSearchBar.tsx   ← Interactive hero search with suggestions
│   │   ├── TopNav.tsx          ← Navigation bar
│   │   ├── Footer.tsx          ← Site footer
│   │   ├── Paywall.tsx         ← Gate overlay for free users
│   │   └── Icon.tsx            ← SVG icon system
│   └── lib/
│       └── db.ts               ← PostgreSQL query helpers (pg pool)
├── scripts/                    ← Python workers (Railway)
│   ├── bots/
│   │   └── new_firms_watcher.py ← Polls GEMI every 10min for new companies
│   ├── one_time/
│   │   └── bulk_load.py        ← Initial 1.67M company load (done, don't re-run)
│   ├── runner.py               ← Railway entry point
│   ├── gemi.py                 ← GEMI API client
│   └── db.py                   ← PostgreSQL client for scripts
└── tools/                      ← Internal analysis scripts (local only)
    ├── leads.py                ← Internal lead explorer (Flask)
    ├── market_analysis.py      ← Industry breakdown report
    └── stats.py                ← DB statistics
```

---

## Design System (AGORA)

The web app follows the AGORA design system exactly:
- **Fonts:** IBM Plex Sans (UI) + IBM Plex Mono (numbers/code)
- **Palette:** warm off-white page bg (`#F7F6F3`), warm gray sidebar (`#F2F1ED`), blue accent (`#2563A8`), warm gray borders (`#DDDBD5`)
- **Borders:** `0.5px` throughout — characteristic thin borders
- **Cards:** white surface, `border-radius: 8px`, `border: 0.5px solid var(--border)`
- **CSS prefixes:** `sp-*` = search page, `hp-*` = home page

---

## Pages Built

### Home Page (`/`)
Sections: Hero (dotted grid backdrop + LiveExhibit with crop marks) → RegistryStrip (4 stats) → ProductPreview (browser chrome mockup) → DataSources (3 cards) → UseCases (3 cards) → SectorsTeaser (table) → CustomersStrip → PricingTeaser → BottomCTA (dark card with geometric SVG) → Footer

### Search Page (`/search`)
- Left sidebar (190px): filters — Data enrichment (open), Location, Κατάσταση (closed), Νομική Μορφή (closed), Κλάδος ΚΑΔ (open), Founded (open), Δήμος (open)
- Search bar with "More filters" + "Save search" buttons + active filter pills
- Results card: sort dropdown, icon buttons, company table with logo initials (warm palette), GEMI badge, enrichment icons
- Row checkboxes + bulk CSV export
- Numbered pagination
- Card footer: selection info + pagination + Export button
- Paywall overlay after page 2 (gate enforced server-side)

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
- [x] Home page (full marketing page, 9 sections)
- [x] Search page (full filter sidebar, results table, company panel, paywall)
- [x] `/api/search` — filtered + paginated search
- [x] `/api/filters` — all filter options
- [x] `/api/stream` — live GEMI stream data
- [x] `/api/company/[ar_gemi]` — company detail
- [x] LiveExhibit widget (real data from DB, polls every 4s)
- [x] Row selection + CSV export
- [x] Paywall gate (2-page free limit, server-enforced)
- [x] Company detail panel (slide-in)
- [x] Deployed to Vercel (web) + Railway (scripts)
- [x] Custom domain greekleads.gr on Vercel

## What's Next

- [ ] Activate Clerk auth (replace placeholder keys with real ones)
- [ ] Activate Stripe payments (replace placeholder keys, wire up export flow)
- [ ] Email provider (Resend / SendGrid) for auth emails
- [ ] Sector mapping — group KAD codes into ~12 broader sectors for the ΚΛΑΔΟΣ column
- [ ] Affiliate tracking link for influencer marketing
- [ ] LinkedIn enrichment bot (Phase 2)
- [ ] Contact verification bot — SMTP email check, carrier phone lookup (Phase 2)

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
