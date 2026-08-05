# GreekLeads — App Overview & Capabilities

_A capability-first brief: what the platform is, what it can do today, and what
it will do. For status-by-status detail (✅ live / 🟡 built-off / 🎭 mock /
🔵 planned) see `APP_INVENTORY.md`; for recent decisions see `COFOUNDER_BRIEF.md`;
for the living spec see `PROJECT.md`. Written 2026-07-24._

---

## In one line

**A Greek B2B lead-intelligence platform** over the ΓΕΜΗ company registry
(1,673,396 companies): find companies and the people behind them, understand and
connect them, describe your target market in plain Greek and let an AI build the
list, enrich it with data ΓΕΜΗ doesn't have, and export it — sold on
subscription.

Positioning: **not** "ΓΕΜΗ shown nicely." The registry is the free, trust-
building, SEO-ranking front door; the money is in the **proprietary enrichment
layer** nobody else has.

---

## The data it sits on (the asset)

| Asset | Scale | Notes |
|---|---|---|
| **Companies** (full ΓΕΜΗ registry) | 1,673,396 | identity, ΑΦΜ, legal form, status, incorporation, capital, location, contact, full KAD activity list |
| **Active companies** | ~1.05M | `status = Ενεργή` |
| **With email/phone** | ~978k | contactability |
| **People** (`company_persons`) | directors + officers + shareholders + **~1.12M sole-proprietor owners** | name, role, company, from/to dates |
| **Brand / trade names** (δ.τ.) | **500,694 Greek (30%)** + 253k Latin | `co_titles_el/en` — registered distinctive title, often ≠ legal name |
| **Discovered websites** | **75,884** | sites ΓΕΜΗ never had, found via email-domain probing (66% hit rate on testable firms) |
| **Discovered socials** | **~99k** | FB/IG/LinkedIn/YT/X/TikTok harvested from those sites |
| **Financial documents** | collecting → Cloudflare R2 | ~187k active ΑΕ/ΙΚΕ/ΕΠΕ targeted; not parsed/shown yet |

The bottom four rows are **proprietary** — self-generated, not in the public
registry. That's the moat.

---

## What it can do TODAY

### 1. Search & target companies
The core tool (`/search`). Filter 1.67M companies by:
- name / ΓΕΜΗ number / ΑΦΜ
- status, prefecture (56, Attica shortcut), legal form, activity (KAD)
- **contactability** (has email / phone / website / *no* website)
- social presence, founding-year range, municipality

Results are a paginated, sortable table with per-row preview panels. **Select
rows → export to CSV.** This is the "build a prospect list" workflow.

### 2. AI targeting — "Scout"
Describe *what you sell and to whom* in plain Greek; Scout (Gemini 2.5 Flash)
translates it into real filters (sectors → KAD codes, regions, legal forms,
contact requirements), returns a **live count** of matching companies, and drops
you into `/search` with those filters applied. Available on the home hero and
inside the search page.

### 3. Investigate a company
A full profile page per company (`/etaireies/[ar_gemi]`, also the public SEO
page): identity, status & capital, location, all activities, similar companies,
directors/officers, contact + social links, and a **network graph** of connected
people and companies.

### 4. Investigate a person
People search (`/people`) by name/email/phone, and a full person profile
(`/people/[slug]`): every role they hold across companies, a **Gantt-style
timeline** of those roles over time, contact signals, and their **network
graph**. Powered by the people table including the 1.12M sole-proprietor owners.

### 5. Map relationships
Force-directed network graphs on both company and person pages — who is
connected to whom through shared directorships and ownership.

### 6. Export
Row-selection → CSV of the chosen companies. (The extraction step of the
prospecting workflow.)

### 7. Enrich itself continuously (background)
Live Railway workers, always running:
- **`new_firms_watcher`** — adds newly registered ΓΕΜΗ companies every ~10 min.
- **`website_scanner`** — two passes: scans known company sites for socials, AND
  (new) probes no-website firms with a custom-domain email to *discover* their
  site + socials. This is what grows the proprietary layer over time.

---

## Built but currently OFF

- **Accounts (Clerk)** — fully wired, running on placeholder keys, so auth is
  bypassed and everyone is treated as anonymous/free.
- **Payments (Stripe)** — not connected.
- **The paywall** — logic exists (`/api/search` 403s free users after 2 pages)
  but with auth off it just gates everyone as anonymous.
- **Financial documents** — actively being downloaded to R2, but **not parsed
  into numbers and not shown** anywhere yet. Biggest gap between "collected" and
  "usable."
- Home-page marketing sections + the "Νέες εγγραφές" feed are **mock/demo data**,
  not live features.

---

## What it WILL do (planned capabilities)

- **Show financials** — parse revenue / assets / equity / profit from the
  collected PDFs and render them on company pages (a paid signal).
- **Statistics & live-feed page** (`/statistika`) — today's registrations +
  historical trends + AI narrative, every stat linking into a filtered search.
  Public, top-of-funnel, SEO.
- **Tech-stack + marketing-stack filter** — detect each site's platform
  (Shopify/WooCommerce/Wix…) and marketing tools (GTM/Meta Pixel/GA…) →
  filter "every WooCommerce store in Greece" or "sites with no tracking."
  (webappanalyzer, backend-only, results stored as facts.)
- **Brand-name / SEO capture** — surface the δ.τ. trade names (30% free, already
  in DB) + AI-extract the rest, so GreekLeads ranks when someone searches a
  *brand*, not just a legal name (the listafirme.ro goal).
- **Contact verification** — SMTP email + phone validation → "verified
  reachable" as a premium field.
- **Monitoring / warm signals** — new-company alerts per industry, status-change
  tracking, saved lists, CRM/team features.
- **MCP server** — expose search/lookup as tools for AI agents (deferred).

---

## How it makes money

**Subscription-first** (predictable recurring revenue), *not* pay-per-export.
Field-level gating on the proprietary layer:

| | Free | Pro (~€49) | Enterprise |
|---|---|---|---|
| ΓΕΜΗ registry, search, profiles | ✅ | ✅ | ✅ |
| Discovered websites & socials | 🔒 teased | ✅ | ✅ |
| Verified contactability, export | 🔒 | ✅ | ✅ |
| Financials, tech stack, people networks | — | limited | ✅ |
| Bulk export / API | — | — | ✅ |

**UX principle — "depth, not doors":** one app, everyone uses the same UI; the
paid user just sees it "filled in." Proprietary fields are **locked** (not
blurred) with a visible label ("🔒 Ιστότοπος βρέθηκε — Ξεκλείδωσε"); only the
long tail of a result list is blurred (for volume). Free must feel complete (the
whole registry), never crippled.

---

## Why it wins (the moat)

1. **Proprietary enrichment** — discovered websites, socials, tech stack,
   financials, verified contactability, people networks: self-generated data no
   competitor mirroring ΓΕΜΗ has.
2. **SEO compounding** — 1.67M unique company pages, each carrying data (brand
   names, discovered sites, socials, financials) the ΓΕΜΗ-mirror sites lack →
   Google reasons to rank us first, funneling free traffic into the paid layer.
3. **AI-native targeting** — Scout turns "who I sell to" into a list, lowering
   the skill floor vs. traditional filter-heavy lead tools.

**The loop:** free registry ranks in Google → visitors funnel into search →
proprietary enrichment is the thing worth paying for → subscription revenue funds
more enrichment → deeper moat + more SEO surface.
