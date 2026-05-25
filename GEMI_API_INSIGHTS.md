# ΓΕΜΗ Open Data API — Insights & Notes

API docs: https://opendata-api.businessportal.gr/opendata/docs/
Base URL: `https://opendata-api.businessportal.gr/api/opendata/v1`
Auth: header `api_key: <your_key>`
Rate limit: **8 req/min**

---

## Endpoints

| Endpoint | What it does |
|---|---|
| `GET /companies` | Search companies by criteria (see filters below) |
| `GET /companies/{arGemi}` | Full profile of one company |
| `GET /companies/{arGemi}/documents` | Public documents (articles of incorporation, announcements) |
| `GET /metadata/activities` | All ΚΑΔ activity codes |
| `GET /metadata/prefectures` | All prefectures (νομοί) |
| `GET /metadata/municipalities` | All municipalities (δήμοι) |
| `GET /metadata/companyStatuses` | All company status codes |
| `GET /metadata/legalTypes` | All legal forms (ΑΕ, ΙΚΕ, ΕΠΕ, ΟΕ...) |
| `GET /metadata/gemiOffices` | All local ΓΕΜΗ offices |
| `GET /downloadFile?key=...&elementId=...` | Download a document file |
| `GET /health` | API health check |

---

## GET /companies filters

| Param | Type | Notes |
|---|---|---|
| `arGemi` | string | exact ΓΕΜΗ number |
| `afm` | string | exactly 9 digits |
| `name` | string | partial match, min 3 chars, searches Greek name + title |
| `legalTypes` | int[] | comma-separated IDs |
| `gemiOffices` | string[] | comma-separated IDs |
| `municipalities` | string[] | comma-separated IDs |
| `prefectures` | int[] | comma-separated IDs |
| `statuses` | int[] | comma-separated IDs |
| `isActive` | boolean | active/inactive |
| `activities` | string[] | ΚΑΔ codes, comma-separated |
| `resultsSortBy` | string | `+/-coName`, `+/-afm`, `+/-arGemi`, `+/-incorporationDate` |
| `resultsOffset` | int | pagination, starts at 0 |
| `resultsSize` | int | max 200 per request |

All filters use AND logic. Array params passed as comma-separated values.

**No date range filter exists** in the public API. The website has one internally but it is not exposed here.

---

## Company object fields

| Field | Notes |
|---|---|
| `arGemi` | ΓΕΜΗ registration number |
| `afm` | Tax number (ΑΦΜ) |
| `coNameEl` | Greek company name |
| `coNamesEn` | English name(s), array |
| `coTitlesEl/En` | Distinctive titles |
| `municipality`, `prefecture`, `city`, `street`, `streetNumber`, `zipCode` | Address |
| `email`, `url` | Contact info (often empty) |
| `phone` | Phone number — **present in both search and individual endpoints** (not documented in Swagger spec but confirmed in API responses) |
| `fax` | Fax number — same as above, usually null |
| `legalType` | Legal form object `{id, descr}` |
| `status` | Company status object `{id, descr}` |
| `incorporationDate` | Date the company was **founded** (not when it registered in ΓΕΜΗ) |
| `lastStatusChange` | Last status change date |
| `isBranch` | `false` = headquarters, `true` = branch |
| `branch` | Array of arGemi numbers of this company's branches |
| `activities` | Array of ΚΑΔ codes |
| `persons` | People linked to the company |
| `capital` | Capital stock info |
| `stocks` | Share info |
| `objective` | Company purpose/scope |
| `autoRegistered` | `false` = incomplete auto-registration, data may be sparse |

---

## arGemi number structure — KEY INSIGHT

Format: `[sequential base][3-digit suffix]`

**The suffix:**
- `000` = main entity (headquarters)
- `001`, `002`... = branch number

Examples:
```
7101000  →  base=7101,  suffix=000  →  headquarters
7107001  →  base=7107,  suffix=001  →  branch #1 of above
```

Branches get their **own independent base number** when registered.
The parent's `branch` array is what links them. They do NOT share a prefix.

**The base is sequential over time:**
- Low base = registered in ΓΕΜΗ early
- High base = registered recently

Observed progression:
```
arGemi range          registered around    notes
101000 - 1301000      1930s - 1951        oldest companies
~22 billion range     2004 - 2006         pre-ΓΕΜΗ era
~52-90 billion range  1982 - 2006         mixed dates (migration batch)
~137 billion range    2016
~167 billion range    2022 - 2023
~187 billion range    2025
~194 billion range    2026 (today)
```

**Why dates are mixed in the middle ranges:**
ΓΕΜΗ was created in **2012**. All pre-existing companies were migrated in bulk and assigned new arGemi numbers regardless of founding date. So a company founded in 1988 and one from 2002 could have similar arGemi numbers if they both registered in ΓΕΜΗ in the same migration batch.

For companies registered **after 2012**, arGemi assignment closely tracks registration date.

**Practical consequence:**
- Sorting by `-arGemi` reliably finds **recently registered** companies
- `incorporationDate` tells you when the company was **founded** — a different thing
- For "fresh new businesses", you want both: high arGemi AND recent incorporationDate

---

## Database facts

- **Total companies:** ~1,664,407 (as of May 2026)
- **Live-updated:** Yes — confirmed empirically. Firms appear within minutes of registration.
  - Observed: count grew from 11 → 13 firms on 2026-05-23 within ~25 minutes
- **New firms per day:** ~13 on a Friday afternoon (builds throughout the day, higher on weekdays)

---

## Garbage date problem

When sorting by `-incorporationDate`, the first ~45 results have corrupted future dates
(e.g. `9999-01-01`, `3017-03-03`). These are data quality issues in the source registry.

**How to handle:** skip any entry where `year > current_year`.
After those 45, valid dates appear in correct order.

---

## Bulk download estimate

To fetch all 1.6M companies:
- Max 200 per request → ~8,323 requests minimum
- Rate limit 8 req/min → ~480 req/hour
- Estimated time: **~17 hours** continuous

---

## Useful patterns

**Find all new firms registered today:**
```
GET /companies?resultsSortBy=-incorporationDate&resultsSize=200
→ skip garbage (year > current year)
→ collect where incorporationDate == today
→ stop at first valid date < today
```
All of today's firms fit within the first page (200 results) as of May 2026.

**Live monitor for new registrations:**
Run the above every N minutes. Compare sets of arGemi numbers.
New arGemi values = new firms registered since last check.

**Targeted lead list:**
```
GET /companies?activities=<KAD>&prefectures=<id>&isActive=true&resultsSize=200
```
Combine ΚΑΔ + geography + active status for industry+region specific lists.

**Filter out branches:**
Only process entries where `isBranch=false` (arGemi suffix = `000`).

---

## Open questions / things to investigate

- [ ] Does `incorporationDate` on the website filter by founding date or ΓΕΜΗ registration date?
- [ ] Are there undocumented query params (e.g. `dateFrom`, `incorporationDateFrom`)?
- [ ] What are the most common ΚΑΔ codes? (fetch `/metadata/activities` and analyze)
- [ ] How complete is the `email` / `url` / `persons` data in practice?
- [ ] Maximum number of branches a single company can have?
