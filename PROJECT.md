# GreekLeads / AGORA — Project Tracker

## The Vision
A **Greek B2B lead marketplace + CRM** (working name: AGORA).
Phase 1: validate the idea with a simple paid data access tool.
Phase 2: live enrichment (LinkedIn profiles, Greek directories like XO, etc.).
Phase 3: warm lead signals (LinkedIn post scanning, new company alerts per industry).
Phase 4: full CRM features.

## Monetization Model (Phase 1)
- **Free (no account):** browse search results, but only 2 pages (100 records) visible. No export.
- **€5/month plan:** full search access, unlimited browsing. No export.
- **Export:** fixed price per export (TBD — e.g. €X per 1,000 records or per download).
- Distribution: affiliate partnership with a Greek influencer (marketing/business niche).

## Data We Have Now (from GEMI)
All data comes from the Greek General Commercial Registry (GEMI).
Fields per company:
- ar_gemi, afm, co_name_el (Greek name), co_names_en (English names)
- co_titles_el/en (trade names)
- objective (company purpose)
- municipality, prefecture, city, street, zip
- email, phone, fax, url (website)
- legal_type (ΑΕ, ΙΚΕ, ΕΠΕ, ΑΤΟΜΙΚΗ, ΟΕ, ΕΕ...)
- status (Ενεργή, Λύση, Διαγραφή...)
- is_branch, auto_registered
- incorporation_date, last_status_change
- activities (JSONB array — primary KAD + secondary KADs)
- persons (JSONB — directors/shareholders)
- capital, stocks, branches

## Pages / Structure (MVP)

### 1. Landing Page (Home)
- Hero with live counter of companies in DB (animated, connects to Python live updater)
- Short pitch — what AGORA is
- 2-3 key data highlights (e.g. "850,000+ active firms", "all 56 prefectures", etc.)
- CTA to Explore or Sign Up
- KEEP SIMPLE — no massive feature lists

### 2. Explore (Search & Filter)
- Filters: name, status, prefecture, municipality, legal type, activity/KAD, has_email, has_phone, has_website, year range, company type (HQ/branch)
- Results table: company name, prefecture, legal type, status, KAD, phone, email, website icon
- **Gate:** logged-out users see max 2 pages (100 records). After that → paywall prompt.
- Export button → triggers payment flow if not on paid plan
- Click company → detail panel/modal

### 3. Pricing
- Free tier (limited browsing)
- €5/month (full access, no export)
- Export pricing (per download or per record batch)
- Simple, 2-3 column layout

### 4. Login / Register
- Simple email + password (or magic link?)
- After login → check subscription status

### 5. Dashboard (logged in)
- Saved searches / lists
- Export history
- Account/billing info

## Tech Stack (decided)
- **Backend:** Python / Flask (already have leads.py as foundation)
- **DB:** PostgreSQL on Railway (existing)
- **Auth:** TBD (see open questions)
- **Payments:** TBD (see open questions)
- **Frontend:** Embedded HTML/CSS/JS in Flask (current pattern) OR separate frontend

## Infrastructure Already Built
- [x] PostgreSQL DB on Railway with ~850K+ companies from GEMI
- [x] `scripts/bots/new_firms_watcher.py` — live updater bot (adds new GEMI companies)
- [x] `scripts/one_time/bulk_load.py` — initial bulk loader
- [x] `tools/leads.py` — internal lead explorer (Flask, filters, CSV export, pagination)
- [x] DB indexes: GIN on activities, trigram on co_name_el + municipality, B-tree on status/prefecture/legal_type/incorporation_date
- [x] File-based filter cache (`.filter_cache.json`) — all filter options pre-loaded
- [x] `tools/market_analysis.py` — generates industry market report
- [x] `tools/yacht_analysis.py` — yacht market niche report

## Open Questions (need answers before building)
1. **Auth system** — roll our own (email+password in DB) or use a service (Supabase Auth, Clerk, Auth0)?
2. **Payments** — Stripe? Viva Wallet (Greek)? Other? Who handles subscriptions + one-off exports?
3. **Domain** — greekleads.gr is mentioned. Do we host under that domain from day 1?
4. **Live counter in hero** — should it show total companies, or only "active" companies, or companies added today/this week?
5. **Export pricing** — flat fee per download? Per record? Tiers?
6. **Email for magic link / notifications** — do we have an email provider set up? (Mailgun, Resend, SendGrid?)
7. **Hosting** — Flask app deployed where? Railway (already have it)? Separate server?
8. **Design reference** — need user to describe the key sections from AGORA HTML design (file is unreadable by tools)

## Checklist — Phase 1 MVP

### Foundation
- [ ] Decide auth approach
- [ ] Decide payments approach
- [ ] Set up Flask app structure (routes, blueprints, sessions)
- [ ] Set up user table in PostgreSQL

### Pages
- [ ] Landing page (hero + live counter + pitch + CTA)
- [ ] Explore page (full filter/search, gated at 2 pages)
- [ ] Pricing page
- [ ] Login / Register page
- [ ] Dashboard (basic — saved searches, billing status)

### Features
- [ ] Session/auth middleware (protect routes, check plan)
- [ ] Paywall gate on search results (2 page limit for free/unauth)
- [ ] Export flow (check subscription → charge → deliver CSV)
- [ ] Live counter widget connected to `new_firms_watcher.py`
- [ ] Company detail modal/panel

### Launch
- [ ] Deploy to Railway (or other)
- [ ] Set up domain
- [ ] Set up affiliate tracking link for influencer
- [ ] Soft launch

## Design Notes (from AGORA HTML — extracted from HL.zip source files)
- Color scheme: dark navy (#1A2332) + blue accent (#2563A8) + light text (#E8EDF5), light page bg (#FAFAF7/#fff)
- Brand name: AGORA | Logo: two offset squares (geometric, institutional)
- Headline: "The Greek business registry, prospect-ready."
- Sub: "AGORA fuses the entire ΓΕΜΗ registry with LinkedIn profiles, verified work emails, and three years of financial filings — so your team stops scraping and starts selling."
- Nav pages: Home | Search | Lists | Sectors | Pricing  (+  Sign in / Start free)
- Nav shows live counter: "1,284,940 companies indexed" + green dot "ΓΕΜΗ sync"

### Home page sections (design has 9 — MVP will slim down):
  1. Hero — headline + search bar (left) + LiveExhibit widget (right) ← KEEP
  2. RegistryStrip — stats bar ← maybe keep (simple)
  3. ProductPreview — screenshot of search UI ← skip for MVP
  4. DataSources — where data comes from ← slim version (1 paragraph)
  5. UseCases — who uses it ← skip or 2 bullet points
  6. SectorsTeaser — ← skip
  7. CustomersStrip — testimonials ← skip (no customers yet)
  8. PricingTeaser — ← keep (link to pricing page)
  9. BottomCTA + Footer ← keep

### LiveExhibit widget (the one the user likes):
  - Dark header bar: "LIVE · ΓΕΜΗ STREAM" + green pulsing dot
  - Counter: total companies indexed (big number, increments every ~2s)
  - "Last 24h: +1,284 records" (right side)
  - 6 rotating stream rows: [time] [TAG] company name + action
  - Tags in design: FILING, LINKEDIN, CONTACT, FINANCIALS, EVENT
  - MVP tags (what we actually have): FILING (new GEMI registration), STATUS CHANGE
  - Source footer: "business.gov.gr/gemi · 14 events/min"
  - Counter + stream data comes from new_firms_watcher.py

### Search page:
  - Left sidebar: filters (sector, location, employee range, enrichment type, revenue range)
  - Right: results table with company rows
  - Active filter pills at top
  - Bulk actions: Export CSV, Save as List

### Pricing (design — heavy, 4 tiers + credit packs + FAQ):
  - Free: €0, 25 credits, 100 companies/month
  - Starter: €49/mo, 500 credits
  - Business: €149/mo, 2,500 credits (highlighted)
  - Enterprise: custom
  MVP simplification: Free (2 pages) | €5/mo (full browse) | Export (fixed price)

### Pages NOT building for MVP:
  - Lists (saved lead lists) — later
  - Sectors (sector analysis view) — later (we have market_analysis.py output for this)
  - Company detail page — simplified modal/panel

## Session Log
- 2026-06-05: Built internal lead explorer (`tools/leads.py`) — Flask app with filters, search, CSV export
- 2026-06-05: Added DB indexes (GIN, trigram) for fast search
- 2026-06-05: Added file-based filter cache — zero DB queries on startup
- 2026-06-05: Activity filter now uses primary KAD only (type='Κύρια')
- 2026-06-17: Built `tools/market_analysis.py` — industry breakdown report
- 2026-06-17: Built `tools/yacht_analysis.py` — yacht market niche report
- 2026-06-17: Started planning AGORA public MVP app
