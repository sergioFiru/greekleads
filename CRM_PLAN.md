# Πελατολόγιο (CRM) — Lists, Saved Searches & "Bring it Alive"

_Written 2026-08-19._

**Status: APPROVED 2026-08-19. Phases 1-3 BUILT (2026-08-20). Phase 4 (polish) open.**
Tables created; Clerk configured with real keys.

---

## 1. What this replaces

Two buttons in `components/SearchPage.tsx` currently render but do nothing —
neither has an `onClick`:

| Line | Button | Today | After |
|---|---|---|---|
| 739 | `Αποθήκευση αναζήτησης` (topbar) | dead | opens the dialog, **Αναζήτηση** tab |
| 1059 | `Αποθήκευση λίστας` (footer, appears when rows are selected) | dead | opens the dialog, **Λίστα** tab |

Both open the *same* dialog — only the default tab differs, based on whether
the user has rows selected.

---

## 2. Decisions (locked 2026-08-19)

| # | Decision | Choice |
|---|---|---|
| 1 | Clerk | **Set up real keys now**, build against a real `userId` |
| 2 | Section name / URL | **Πελατολόγιο → `/crm`** |
| 3 | Gating | **Single `lib/entitlements.ts` file** |
| 4 | Free tier | **1 list, capped at 50 prospects** |
| 5 | Add-all-results | **Yes — server-side, capped** (see §11) |
| 6 | Per-prospect notes | **In v1** |
| 7 | `/pricing` | **Leave untouched** until tiers are final |

---

## 3. Clerk — what you do, what I do

`@clerk/nextjs` v7.5.8 is already installed and wired: `middleware.ts`,
`app/layout.tsx` (`ClerkProvider`), `app/sign-in/[[...sign-in]]`,
`app/sign-up/[[...sign-up]]`, and `lib/auth.ts`.

The only thing missing is real keys. `.env.local` currently has:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_placeholder…
CLERK_SECRET_KEY=sk_test_placeholder…
```

`lib/auth.ts` detects the `placeholder` prefix and short-circuits `getAuth()`
to `{ userId: null, isPaid: false, isLoggedIn: false }` — so **every visitor is
currently an anonymous free user**, and nothing can be owned by anyone.

### Your steps (5 minutes, one time)

1. Create an application at <https://dashboard.clerk.com> (Greek + English
   locales; email + Google sign-in is the usual pick).
2. Copy the two keys from **API Keys** into `web/.env.local`, replacing the
   placeholders.
3. Add the same two keys to the Railway/Vercel environment for production.

That's it — no code change needed on your side. `lib/auth.ts` starts returning
real user IDs the moment the keys stop saying `placeholder`.

### What I need to add to `lib/auth.ts`

`getAuth()` currently derives `isPaid` from `sessionClaims.metadata.plan ===
'paid'`. That stays, but I'll widen it to return the **plan name** rather than a
boolean, so the entitlements file can key off it:

```ts
{ userId, plan: 'free' | 'paid', isLoggedIn }
```

`isPaid` stays as a derived convenience so nothing that reads it today breaks.

---

## 4. Data model

Three new tables in the existing Railway Postgres (same DB as `companies` —
`crm_list_members.ar_gemi` needs to join against `companies.ar_gemi`, which is
`bigint`, so a separate database would make every list read a cross-DB problem).

There is no migration framework in this repo — tables are created by Python
scripts (`scripts/**/*.py` all use inline `CREATE TABLE IF NOT EXISTS`). I'll
follow that convention with a new one-time script you run yourself.

```sql
-- A saved filter set. Free and paid alike.
CREATE TABLE crm_saved_searches (
  id          bigserial PRIMARY KEY,
  user_id     text        NOT NULL,
  name        text        NOT NULL,
  filters     jsonb       NOT NULL,   -- the SearchState object
  scout_brief text,                   -- the natural-language prompt, if Scout built it
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

-- A prospect list.
CREATE TABLE crm_lists (
  id          bigserial PRIMARY KEY,
  user_id     text        NOT NULL,
  name        text        NOT NULL,
  description text,
  -- "Bring it Alive": stored in v1, acted on in a later phase.
  is_live     boolean     NOT NULL DEFAULT false,
  live_filters jsonb,                 -- filter recipe new firms get tested against
  live_brief   text,                  -- the Scout prompt, if that's how it was built
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

-- Membership. One row per company per list.
CREATE TABLE crm_list_members (
  list_id    bigint      NOT NULL REFERENCES crm_lists(id) ON DELETE CASCADE,
  ar_gemi    bigint      NOT NULL,
  added_at   timestamptz NOT NULL DEFAULT now(),
  added_by   text        NOT NULL DEFAULT 'user',  -- 'user' | 'live' (future auto-adds)
  note       text,
  PRIMARY KEY (list_id, ar_gemi)
);

CREATE INDEX idx_crm_lists_user   ON crm_lists(user_id);
CREATE INDEX idx_crm_saved_user   ON crm_saved_searches(user_id);
CREATE INDEX idx_crm_members_list ON crm_list_members(list_id);
```

Notes on the shape:

- **`PRIMARY KEY (list_id, ar_gemi)`** makes re-adding a company a no-op
  (`ON CONFLICT DO NOTHING`) rather than a duplicate — important because people
  will re-run a search and re-add overlapping results.
- **`added_by`** exists from day one so that when "Bring it Alive" ships, the UI
  can show *"3 νέες εταιρείες προστέθηκαν αυτόματα"* and distinguish them from
  hand-picked ones. Costs nothing now, expensive to backfill later.
- **No foreign key on `ar_gemi`** → `companies`. The scrapers rewrite that table
  constantly; an FK would make list writes contend with the crawlers.
- **`user_id` is `text`**, not a FK — Clerk owns identity, we only mirror the ID.

---

## 5. Entitlements

New file `web/lib/entitlements.ts` — the single place plan limits live:

```ts
export const PLANS = {
  free: {
    maxLists:          1,
    maxMembersPerList: 50,
    maxSavedSearches:  3,
    canBringAlive:     false,
    canExportCsv:      false,
    canIntegrate:      false,   // Instantly / HubSpot
  },
  paid: {
    maxLists:          Infinity,
    maxMembersPerList: Infinity,
    maxSavedSearches:  Infinity,
    canBringAlive:     true,
    canExportCsv:      true,
    canIntegrate:      true,
  },
} as const
```

**Your plans not being finalized is genuinely not a problem.** Every gate — UI
and API — reads from this object. When you decide the real tiers and limits, you
edit this one file; nothing else changes. Adding a third tier later means adding
one key here plus a label.

Limits are enforced in **both** places: the dialog greys out what you can't do
(so you can see the ceiling), and the API route re-checks before writing (so the
ceiling is real and not just cosmetic).

---

## 6. The dialog

New component `web/components/SaveToDialog.tsx`. Two tabs.

```
┌──────────────────────────────────────────────────────────┐
│  Αποθήκευση                                          ✕   │
│  ┌────────────────────┬──────────────────────────────┐   │
│  │  Ως αναζήτηση      │  Σε λίστα            (12)    │   │
│  └────────────────────┴──────────────────────────────┘   │
│                                                          │
│  ── tab: Σε λίστα ──                                     │
│  Όνομα λίστας                                            │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Ξενοδοχεία Κρήτης                                  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ή επιλέξτε υπάρχουσα:                                   │
│  ○ Λογιστικά γραφεία Αττικής            84 επαφές        │
│  ○ Ξενοδοχεία Κρήτης                    31 επαφές        │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ ⚡ Ζωντανή λίστα            [  ○──  ]   Προσεχώς   │  │
│  │ Νέες εταιρείες που ταιριάζουν με τα φίλτρα         │  │
│  │ θα προστίθενται αυτόματα.                          │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│                        [ Άκυρο ]  [ Αποθήκευση 12 ]      │
└──────────────────────────────────────────────────────────┘
```

**Tab «Ως αναζήτηση»** — name field + a read-only summary of the active filters
(reusing the existing `pills` array that `FilterPills` already computes). Saves
to `crm_saved_searches`. Available to free and paid.

**Tab «Σε λίστα»** — create-new or pick-existing, then save the selected
companies. Which companies: whatever is in SearchPage's `selected` map, which
persists across pagination — select on page 1, jump to page 3, select more, and
all of them land in the list.

_(Fixed 2026-08-19, ahead of this plan: `selected` was a `Set<string>` while CSV
export did `results.filter(...)` — the current page only — so any selection made
on another page was silently dropped from the export. It is now a
`Map<string, Company>` holding the full row, so both export and list-add see
every selected company regardless of page. `.has()`/`.size()` are identical on
Map, so the 9 read-only call sites were untouched.)_

**Add all results** — a second button in this tab, `Προσθήκη και των N`, when a
search is active. See §11.

**Free-tier behaviour in this tab:** the tab is fully visible and usable up to
the cap. At 1 existing list, "create new" greys out with an inline upgrade line;
past 50 members, the save button explains the cap. Per your design brief, we
lock fields rather than blur them — the user can see exactly what they'd get.

**The "Bring it Alive" toggle** renders in this dialog and on the list editor,
visibly marked `Προσεχώς`, disabled for everyone in v1. It writes `is_live` and
`live_filters` to the DB (so lists created now are ready when the engine lands),
but nothing consumes those columns yet.

---

## 7. The `/crm` page

New route `web/app/crm/page.tsx` + `web/components/CrmPage.tsx`. Server-rendered
list index, client components for the interactive parts. `TopNav` gains a
**Πελατολόγιο** link, shown only when logged in.

```
Πελατολόγιο
┌─ Λίστες ────────────────────────── Αποθηκευμένες αναζητήσεις ─┐

┌──────────────────────────────────────────────────────────────┐
│  Λογιστικά γραφεία Αττικής                    ⚡ Ζωντανή      │
│  84 επαφές · 61 με email · ενημερώθηκε 12 Αυγ                 │
│                              [ Άνοιγμα ]  [ Εξαγωγή ]  [ ⋯ ] │
├──────────────────────────────────────────────────────────────┤
│  Ξενοδοχεία Κρήτης                                           │
│  31 επαφές · 22 με email · ενημερώθηκε 4 Αυγ                  │
└──────────────────────────────────────────────────────────────┘
                                          [ + Νέα λίστα ]
```

Detail view `/crm/[id]` reuses the existing search result-row rendering
(`sp-card-item`, `CompanyFavicon`, the enrichment badges) so a list looks
identical to search results — same component vocabulary, no new visual language.
Per-row: remove from list, open company page, and a free-text note.

The **Εξαγωγή / integrations** area (Instantly, HubSpot, CSV) renders as a
disabled button group with a `Προσεχώς` tag. UI only, per your instruction.

---

## 8. API routes

| Route | Methods | Purpose |
|---|---|---|
| `/api/crm/lists` | GET, POST | index + create (enforces `maxLists`) |
| `/api/crm/lists/[id]` | GET, PATCH, DELETE | detail, rename / toggle live, delete |
| `/api/crm/lists/[id]/members` | POST, DELETE | bulk add / remove (enforces `maxMembersPerList`) |
| `/api/crm/searches` | GET, POST | saved searches |
| `/api/crm/searches/[id]` | DELETE | remove |

Every route starts with `getAuth()`, 401s on no `userId`, and **scopes every
query by `user_id`** — ownership is checked in the SQL `WHERE`, never by trusting
an ID from the request body.

---

## 9. Phases

**Phase 1 — foundation.** `entitlements.ts`, the `getAuth()` plan widening, the
table-creation script (you run it), and the five API routes. Nothing visible yet.

**Phase 2 — the dialog.** `SaveToDialog.tsx`, wired to both existing buttons.
This is the point where the feature becomes usable.

**Phase 3 — the `/crm` page.** Index, detail view, TopNav link, notes,
remove-from-list. Disabled integration placeholders.

**Phase 4 — polish.** Empty states, the upgrade prompts at each cap, `/pricing`
copy updated to mention Πελατολόγιο.

Deliberately **not** in scope: the Bring-it-Alive matching engine, CSV export,
and any Instantly/HubSpot integration.

---

## 10. Answers (2026-08-19)

1. **Add all N results — yes.** Recommendation accepted; design in §11 below.
2. **Per-prospect notes — in v1.** The `note` column is already in
   `crm_list_members`; the list detail view gets an inline editable note per row
   and a `PATCH /api/crm/lists/[id]/members` to persist it.
3. **`/pricing` — untouched.** No copy changes until the tiers are final. Note
   that the page currently advertises "Εξαγωγή CSV (προσεχώς)" on the €5 plan
   while CSV export already works client-side and is ungated — worth a look when
   you do revisit pricing, but out of scope here.

---

## 11. Add-all-results (decision #5)

**Why I recommend it.** The product's whole pitch is "filter a segment, work the
segment". A search returning 9,000 hotels is the *point* — and making someone
tick 50 checkboxes across 180 pages to act on it turns the best feature into the
most tedious one. Selection-only would be a v1 that undersells what the search
already does.

**Why it's cheap.** `buildWhere()` in `app/api/search/route.ts:27` is a
self-contained pure function returning `{ sql, params }`. I extract it verbatim
to `lib/searchQuery.ts` and import it from both routes — a pure refactor, no
behaviour change, and the search route keeps working identically. The add-all
then never sends company data to the browser at all:

```sql
INSERT INTO crm_list_members (list_id, ar_gemi, added_by)
SELECT c.ar_gemi, $1, 'user'
FROM companies c
WHERE <buildWhere output>
LIMIT $2
ON CONFLICT DO NOTHING;
```

One statement, server-side, no round-trip per company. This is a much smaller
job than I implied when I first raised the question.

**Caps.** `maxMembersPerList` from `entitlements.ts` is the ceiling, applied as
the `LIMIT` after subtracting existing members. Free stops at 50. For paid I'd
set a concrete per-operation cap rather than `Infinity` — **10,000** — because an
unbounded insert on a 1.6M-row table is a way to hand yourself a very slow query
and a list nobody can render. If a segment is bigger than that, the honest
answer is to narrow the filters.

**UI.** The dialog shows `Προσθήκη και των 9.412` alongside
`Προσθήκη 12 επιλεγμένων`, with the resulting count and any cap stated in plain
text before the user commits — no silent truncation.
