# GreekLeads — Catch-Up Brief

_Last updated: 2026-07-24. Purpose: sync an external Claude project ("cofounder")
that's fallen behind. Self-contained — readable without the codebase. For the
full living spec see `PROJECT.md`; for a factual feature inventory see
`APP_INVENTORY.md`._

---

## 1. What GreekLeads is (30-second version)

A **Greek B2B lead-intelligence platform** built over the ΓΕΜΗ company registry
(**1,673,396 companies**). We sell **prospects — potential clients — on
subscription**, not "ΓΕΜΗ data shown more nicely."

Two data categories, monetized oppositely:
- **ΓΕΜΗ registry** (name, status, address, activity, official url) = a public
  **commodity** → its job is **SEO + trust**, kept free.
- **Our enrichment** (discovered websites, scraped socials, verified
  contactability, owner backfill, financials-to-come, tech stack) = **proprietary
  moat** → the paid product.

Model = Crunchbase/Apollo: free index that ranks in Google, paid intelligence
layer. **Subscription-first** (predictable cashflow), *not* pay-per-export.

Stack: Next.js (App Router, TS) on Vercel · PostgreSQL + Python workers on
Railway · Cloudflare R2 for docs · Clerk (wired, bypassed) · Stripe (not wired) ·
Scout AI = Gemini 2.5 Flash via OpenRouter.

---

## 2. What's live today

- Company search `/search` (filters, table, CSV export, 2-page paywall stub)
- Company pages `/etaireies/[ar_gemi]` (SEO surface: tabs, JSON-LD, similar cos)
- People search `/people` + profiles `/people/[slug]` (Gantt timeline, networks)
- Home hero (institutional/light design), Scout AI (NL → filters), live-firms feed
  (placeholder data), stats/suggest APIs
- Live Railway bots: `new_firms_watcher` (new ΓΕΜΗ regs) + `website_scanner`
- Auth (Clerk) and payments (Stripe) are **wired but OFF** (placeholder keys).

---

## 3. NEW since the cofounder last synced (the important part)

### 3.1 Website discovery — DONE, big win
Premise: many active firms have **no ΓΕΜΗ website but a custom-domain email**
(`info@acme.gr`) → probe that domain for a live site.

Bulk scan results (`tools/discovered_websites.csv`):

| | |
|---|---|
| Candidates scanned | 580,532 |
| Skipped (freemail email — gmail/otenet/etc., nothing to probe) | 465,408 (80%) |
| **Actually probed** (custom domain) | 115,124 |
| **🟢 LIVE websites found** | **75,884 — 66% of probed** |
| Placeholder / parked / dead | ~39k |

Plus **~99k social profiles** harvested from those live pages (FB 35,632 · IG
22,529 · LI 17,048 · YT 11,498 · X 8,926 · TikTok 3,548).

→ **~75,884 websites + ~99k socials that no ΓΕΜΗ-mirror competitor has.** This
*is* the proprietary Pro layer.

**Storage model (decided):** written to a NEW `discovered_url` column +
`website_source='discovered'` — ΓΕΜΗ's own `url` is never touched, so provenance
survives (powers the "βρέθηκε από το GreekLeads" label + the free/Pro gate).
Socials fill the social columns only where empty (COALESCE, never overwrite).
Upload script: `scripts/one_time/push_discovered_to_db.py`.

### 3.2 Live watcher now discovers websites too
`website_scanner` was extended to **two passes** per cycle:
1. (existing) social-scan firms that already have a ΓΕΜΗ url
2. (new) probe no-url + custom-domain firms → record `discovered_url` + socials

New column `discovered_scanned_at` tracks discovery attempts so nothing is
re-probed. Freemail is now filtered **in SQL** (lesson learned — see §5).

### 3.3 Tech-stack + marketing-stack scan — PLANNED (deferred)
Fingerprint every firm website (WhatWeb/Wappalyzer-style) from the HTML we
already download. Two buckets, both wanted:
- **Platform/CMS/ecommerce** (WordPress, WooCommerce, Shopify, Wix…) → sellable
  Pro filter: "every WooCommerce store in Greece".
- **Marketing stack** (GTM, Meta Pixel, GA…) → signals BOTH ways: has pixel+ads
  = budget/sophistication = premium lead; no tracking = target for a marketing
  agency.

Also turns Scout's "ecommerce firms" from a KAD *guess* into a *detected fact*.

**Data source: `enthec/webappanalyzer`** (community fork of Wappalyzer's
fingerprints, active, ~251 as of 2026). **License = GPLv3, NOT AGPL.** Key legal
point: GPLv3 copyleft triggers on **distribution**, not on running as a service.
So: run the ruleset **backend-only** (no obligation to open-source GreekLeads);
never ship the ruleset to browsers; **store only the RESULTS** ("firm X →
Shopify + Meta Pixel") — results are facts, ours to store/gate/sell. Populating
the DB with them is fine.

### 3.4 Brand-name capture (SEO) — PLANNED, big + partly free
The ΓΕΜΗ legal name isn't what people type. A sole proprietor is registered as a
person ("ΣΙΜΟΠΟΥΛΟΥ ΙΩΑΝΝΑ") but trades as a brand ("GROOMIE"). If the brand
isn't on the page, we rank for zero brand queries. Goal = be the first result
when anyone searches a Greek company/brand (like listafirme.ro).

Two layers:
- **Layer 1 — the διακριτικός τίτλος we ALREADY HAVE (free, do first).**
  `co_titles_el/en` is the registered trade name — **500,694 companies have a
  Greek δ.τ. (30%)**, 252,971 a Latin one (15%). No scan, no AI, official. We'd
  simply forgotten it existed. Surface it in the company-page + SEO pass.
- **Layer 2 — AI extraction** from scanned sites (`<title>`, OG `site_name`,
  schema.org name, logo alt) for the gaps, via Gemini Flash. Validate against
  domain/δ.τ. corroboration or it pollutes pages.

**Placement (SEO) — NOT keyword stuffing.** One prominent, structured mention:
`<title>` + H1 + meta description + schema.org **`alternateName`** (the canonical
"also known as" signal) + a natural δ.τ. line + on-site search indexing.
Repeating the brand "a few times" is rejected (no benefit, penalty risk).
Provenance flag `brand_source = 'gemi_dt' | 'website_ai'`.

### 3.5 Monetization sequencing — decided
**One app, capability-gated — NOT three codebases.** "Gate on depth, not doors":
everyone loads the same pages; a gate decides per field whether to show / lock /
blur, based on the user's `plan`.
- To **build + preview + evaluate** the Free/Pro/Enterprise experiences you need
  **neither Clerk nor Stripe** — just a `<Gate>` layer + a dev plan-switcher
  (stub the plan, flip between tiers).
- **Clerk** is needed to **launch** with real accounts (identity → real plan).
- **Stripe** is needed last, for self-serve paid upgrades (money → flips plan).

Recommended order: build the gate + switcher now → evaluate tiers → wire Clerk →
wire Stripe. Because the gate reads one `plan` variable, swapping stub→Clerk→
Stripe doesn't touch the gated UI.

---

## 4. Financials crawl — in progress, being paused for cost

Playwright/Chromium crawler pulling financial-statement docs from
businessportal.gr → Cloudflare R2. Target = active **ΑΕ/ΙΚΕ/ΕΠΕ** firms
(**187,693**). As of 2026-07-24: **36,405 done (19.4%)**, ~488 firms/hr, ETA
~310h (~13 days).

- **Fully resumable**: progress is in the `financial_ar_gemi_scanned` table,
  committed per-firm. Stop/restart any time — it skips done firms, retries
  failed ones. Safe to kill abruptly (idempotent R2 + upserts).
- **Being paused for now** to cut Railway cost (Railway has no per-service pause
  button → "remove the active deployment", redeploy to resume).
- **Known bug (fix later):** a page *timeout* is recorded as "0 docs, no
  failure" and never retried. When the crawl finishes, re-scan the `docs=0`
  firms that had a slow response time.

**Railway cost context:** memory-cost card was ~$32 for the cycle; ~6 GB running
= Postgres (~3 GB, normal caching) + the Chromium scraper (~3 GB); the light
bots ≈ 0. Pausing the scraper roughly halves memory cost. (Chromium is the RAM
hog — kill it when the crawl's done.)

---

## 5. Open threads / to-do

- [ ] Run the discovery DB rollout: `migrate_discovery_columns.py` →
  `push_discovered_to_db.py` (adds `discovered_url`, `website_source`,
  `discovered_scanned_at`; uploads 75,884 sites; stamps the backlog).
- [ ] Deploy the two-pass `website_scanner` to Railway.
- [ ] **Phone-extraction bug:** 0 phones harvested across all 75,884 live sites
  (socials worked, so `extract_all` ran) — regex/column needs a look; not yet
  fixed. When fixed, re-scan for phones.
- [ ] Build the gate abstraction (capability map + `usePlan()` + `<Gate>` +
  dev plan-switcher) so tiers can be evaluated pre-auth.
- [ ] Surface `discovered_url` + δ.τ. brand on company pages (with provenance
  label + Pro gate).
- [ ] Run `tools/add_name_index.py` (trigram on `co_name_el`; name search ~2.2s → <200ms) — UNVERIFIED whether run.
- [ ] Wire hero live-feed to the real watcher (replace `useFakeNewFirms()`).
- [ ] Eventually: Clerk on → Stripe on → then the paywall is real.
- [ ] Planned features not built: stats/live-feed page (`/statistika`),
  financials parsing + display, tech-stack scan, sitemap, brand-name capture.

---

## 6. Technical gotchas worth carrying over

- `municipality_descr` is a **combined** `"ΔΗΜΟΣ / ΝΟΜΟΣ"` string; `'Inadequate
  Info'` is a placeholder that must be **substring-matched**, not `NULLIF`'d.
- `legal_type_descr` = short codes (ΑΕ, ΙΚΕ, ΕΠΕ…). `prefecture_descr` is
  uppercase **and unaccented** (ΑΧΑΙΑΣ, not ΑΧΑΪΑΣ).
- KAD activity codes are versioned (`kad_2008` vs `kad_2026`) — filter
  `dtTo IS NULL` or every firm double-counts.
- Scout keyword→KAD uses **word-boundary** matching (not `ILIKE '%x%'`) — else
  ΣΚΑΦ matches ΕΚΣΚΑΦΩΝ (excavation, 13k firms) and yields ~50k bad leads.
- **Never `ALTER` the live 1.67M-row `companies` table without a
  `lock_timeout`** — it blocks indefinitely on a busy table and queues
  everything behind it. Migrations use `SET lock_timeout='5s'` and fail fast.
- Freemail filtering belongs in **SQL**, not post-fetch in Python (else you pull
  and process hundreds of thousands of un-probeable gmail firms for nothing).

---

## 7. The one-line strategy

Free ΓΕΜΗ index that ranks in Google (trust + SEO) → funnels into a paid
enrichment layer nobody else has (discovered sites, socials, tech stack,
financials, people networks, verified contactability) → sold on subscription for
predictable recurring revenue. Depth-not-doors gating, brand-name + provenance
SEO to own company/brand search results.
