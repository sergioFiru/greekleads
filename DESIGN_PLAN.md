# GreekLeads Design Plan

## Product Positioning
Not a simple directory. A B2B leads intelligence platform — subscription plans, people/director connections, social profiles, verified contacts, future CRM. Think **Greek ICAP for the modern era**, or **Greek Kompass**. The sophistication stays; the visual language needs to shift from American startup SaaS to European institutional data platform.

## Target Audience
- 20-year-old startup founder finding leads
- 50-year-old business owner finding suppliers/clients
Both must trust it immediately.

## Reference Sites Reviewed
- **kariera.gr** — white bg, navy + red, Greek throughout, search-first, no animations. Trustworthy but it's a job board (not a template to copy, just a trust reference)
- **jobfind.gr** — orange/amber accent, white bg, dark nav, Greek, very familiar portal feel
- **xe.gr** — orange brand, functional, trusted for 20+ years
- **fundamenta.gr** (competitor) — light blue-gray gradient, centered logo + search (Google-style), mostly Greek, company data cards shown immediately, rounded humanist font. Found the sweet spot between modern and Greek. Closest benchmark — but we have more features.

## Core Problem
The site currently uses **American startup visual language** (Apollo.io / Clearbit energy):
- Animated dot-matrix network background
- Dark navy SaaS navbar
- English hero text
- "LIVE · ΓΕΜΗ STREAM" dark widget
- Numbered SaaS feature marketing sections (01–08)
- "sourcing layer for your outreach stack" copy
- AGORA vs GreekLeads naming inconsistency
- Cool gray off-white background (#e8e8e0 feel)

Target language: **European institutional data platform** (D&B / Kompass / ICAP), not startup SaaS.

## Homepage Changes (Priority Order)

### 1. Background & atmosphere (biggest impact)
- Kill the dot-matrix animation completely
- Replace with clean white or very soft blue-gray gradient (Fundamenta-style: `#f0f4f8` → white)

### 2. Hero text → Greek first
- Current: *"Every Greek company. Everyone behind them. One connected map."*
- Target: Short, direct, Greek. e.g. *"Κάθε ελληνική εταιρεία. Ένα μητρώο."*
- Subheadline in Greek too; English secondary for international users

### 3. Navbar
- Change from dark (#1a1a2e) to white with navy text, or soft institutional navy
- Feels institutional not SaaS-dark

### 4. Live stream widget
- Restyle from dark to white/light card
- Or replace with grid of real company data cards (like Fundamenta does)

### 5. Accent color
- Shift CTA button from cold blue → warmer navy + amber accent
- Greeks respond to amber/orange (kariera, jobfind, xe all use it)

### 6. Stats row → Greek labels
- "Active legal entities" → "Ενεργές εταιρείες"
- "Directors & shareholders" → "Διευθυντές & μέτοχοι"
- etc.

### 7. ΓΕΜΗ badge — make more prominent
- #1 trust signal for Greek audience, a 50-year-old sees "ΓΕΜΗ" and trusts it
- Currently small, needs to be hero-level prominent

### 8. Fix naming: AGORA vs GreekLeads
- Copy says "Find and qualify leads in AGORA" but navbar says GREEKLEADS
- Pick one name, use it everywhere

## Per-Page Observations

### Navbar (all pages)
- Dark navy (#1a1a2e) on every page — feels like a SaaS dashboard, not an institutional directory
- Logo reads "GREEKLEADS" but product copy says "AGORA" — fix this inconsistency
- Nav items: Home · Companies · People · Pricing | Σύνδεση | Ξεκινήστε δωρεάν
- The blue "Ξεκινήστε δωρεάν" CTA button is the right instinct but the dark bar undercuts it
- Fix: white or very light navbar with navy text, navy brand color. One name everywhere.

### Homepage (/)
- Animated dot-matrix network background — kills trust, screams startup
- English hero headline dominates above the fold
- Dark "LIVE · ΓΕΜΗ STREAM" widget in a black card — adds noise, subtracts trust
- Feature grid uses 01–08 numbering and SaaS copy ("sourcing layer for your outreach stack")
- Stats row labels are in English ("Active legal entities", "Directors & shareholders")
- ΓΕΜΗ badge exists but is visually small — trust signal wasted
- Fix: See Homepage Changes section above

### Companies Search (/search)
- Search bar + filter sidebar works well functionally
- Page background matches the off-white of the homepage — consistency is good
- Results cards show company name, legal type, location, status — clean
- Filter chips (legal type, region, status) are functional but styled in flat gray — no visual hierarchy
- No breadcrumb or clear page title — user arrives from nav with no context header
- Fix: Add a clear Greek page heading ("Αναζήτηση Εταιρειών"). Lift the filter chips visually.
  No big structural changes needed — the layout is solid.

### Company Profile (/etaireies/[ar_gemi])
- Header: company name + badge tags + location. Good information density.
- Stats row shows key numbers (employees, capital, etc.)
- Contact section (email, phone, website) — but locked/gated info could be clearer
- People section shows directors/shareholders with role tags — this is the product differentiator, make it more prominent
- Financial documents section exists — another differentiator
- Design is actually the most polished of all pages — clean card layout
- Fix: Add a "verified from ΓΕΜΗ" banner. Make the people/directors section visually stand out more.
  Possibly an amber accent for the "key people" section header to draw the eye there.

### People Search (/people)
- Empty state with placeholder name chips ("Παπαδόπουλος", "Γεωργίου", etc.) — good UX
- The chips don't navigate on click (they're just labels) — missed opportunity
- Input box works but has no example query hint in the placeholder
- When empty, the page is just a search box floating in white space — feels unfinished
- Fix: Make example chips clickable (trigger search). Add a short Greek subtitle under the
  search box explaining what this page does. Show 3–4 example person cards below to
  demonstrate the product value before user searches.

### Person Profile (/people/[slug])
- Best page on the site — genuinely impressive depth:
  1. Header: name + ΓΕΜΗ badge + location tags + "Ενεργός από 2022" + "7 ενεργοί ρόλοι"
  2. Stats row: total companies / active roles / shareholdings / largest stake
  3. Gantt timeline chart (ΧΡΟΝΟΛΟΓΙΟ ΕΜΠΛΟΚΗΣ) — beautiful, shows career history
  4. Company network graph — interactive, shows co-directors and connections
  5. CONTACT INTELLIGENCE — emails/phones found across the person's companies, labeled "Πιθανώς προσωπικές"
  6. Full company list with role tags
- The same dark navbar makes this page feel inconsistent with the data richness below it
- "CONTACT INTELLIGENCE" is English in a Greek product — consider "Στοιχεία Επικοινωνίας" or keep English as a feature brand
- The network graph is a strong differentiator — make it more prominent, not buried after the Gantt
- Fix: Minor tweaks only. This page works. Surface the network graph earlier. Consider a "lock" UI
  for contact data on free plan (shows blurred contacts with "Unlock with Πρόσβαση" prompt).

### Pricing (/pricing)
- Greek headline: "Ξεκινήστε δωρεάν, πληρώστε μόνο ό,τι χρειάζεστε" — correct, keep it
- 3-tier layout: ΔΩΡΕΑΝ (€0) | ΠΡΟΣΒΑΣΗ (€5/μήνα, highlighted ΔΗΜΟΦΙΛΕΣ) | ΕΞΑΓΩΓΗ (Σύντομα)
- Layout is clean and clear — the best-designed page after the person profile
- Background is the same off-white — consistent
- The "ΕΞΑΓΩΓΗ" tier says "Σύντομα" with no price — hides potential revenue, makes the tier look unfinished
- No comparison of People/person data in the pricing — that's a differentiator worth selling here
- Fix: Add "Δεδομένα Προσώπων" as a line item in plan comparison. Give ΕΞΑΓΩΓΗ a real price
  or at least "από €X/μήνα" placeholder. Consider adding a 4th tier for "People Intelligence"
  when CRM/contacts feature launches.

## Implementation Priority (after homepage)
1. **Navbar** — single biggest trust impact; touches all pages; 30-min change
2. **Homepage** — kill animation, Greek hero, ΓΕΜΗ prominent; listed above
3. **People Search empty state** — make chips clickable, add example cards
4. **Pricing** — add person data line item, price the ΕΞΑΓΩΓΗ tier
5. **Person profile** — lock UI for contact data on free plan (upsell prompt)
6. **Company profile** — amber accent on key-people section
7. **All pages** — pick one name (GREEKLEADS or AGORA) and use it everywhere

## Notes
- Keep product sophistication (plans, people data, CRM roadmap) — that's the differentiator vs fundamenta
- Do NOT dumb it down like a simple portal
- Do NOT copy kariera/jobfind aesthetic — that's too simple for a data product
- Fundamenta is the closest tone reference; we should match their trustworthiness while communicating more depth
