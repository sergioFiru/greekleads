# 5-Day-Plan — Daily Lead Sync

_A separate business/component from GreekLeads itself. Sells an "online
presence in 5 days" package (website/e-shop/marketing) to newly incorporated
Greek firms with zero web presence. Built 2026-08-05. Shares the Railway
account with GreekLeads but has no shared code path, DB, or process with the
GreekLeads live-watcher bots._

---

## What it does

Once per day, a standalone script:
1. Pulls **yesterday's** newly incorporated firms from the **GreekLeads
   Postgres DB** (read-only source — never writes there).
2. Filters to the target profile (below).
3. Adds up to **60/day** to an **Instantly.ai** cold-email campaign, personalized
   with the firm's registered brand name (δ.τ.).
4. If adding today's batch would push the campaign over its **1,000-lead cap**,
   deletes just enough of the oldest already-added leads to make room.
5. Records every lead permanently in its own **Supabase** database, so a firm
   is never contacted twice — even across restarts, redeploys, or migrations
   to a bigger Instantly plan later.

## Target profile (eligibility)

A firm from yesterday's incorporations qualifies if **all** of:
- Legal form is **not** `ΑΤΟΜΙΚΗ` (sole proprietors excluded)
- Has **no website at all** — both `url` (ΓΕΜΗ) and `discovered_url` (our own
  enrichment) are empty
- Main KAD activity is **not** food delivery (`53200200` excluded — see
  PROJECT.md's new-firms sector analysis, this is the single most common
  specific activity among new registrations and not a fit for this offer)
- Has an **email**
- Has a **distinct δ.τ. brand name** (`co_titles_el` differs from the legal
  name) — firms without one are **skipped entirely for now** (not
  "fall back to legal name"), since the brand name is the personalization hook

Measured 2026-08-05: of a typical day's eligible pool (~152 firms after the
first four filters), **~55% (83) had a distinct brand name** — so the real
daily batch will vary and often run under 60, not hit it every day.

## Architecture

| Piece | Lives where | Role |
|---|---|---|
| GreekLeads `companies` table | Railway Postgres (existing) | Read-only lead source |
| `campaign_leads` table | **Supabase** project `5-day-plan-tracking` (ref `rkqgkbwdvslcazspffov`) | This script's own state: who's been added, when, their Instantly lead ID, whether removed |
| "New Firms 60" campaign | **Instantly.ai** (workspace "5 Days") | Where leads actually go; ID `0d851348-2979-4bd4-b623-c9ce25b00f3e` |

**Why a separate Supabase DB instead of a table in GreekLeads' own Postgres:**
user's explicit call — "different component of a different business," and
keeps the two businesses' data cleanly separated even though they share a
Railway account.

**`campaign_leads` schema:**
```sql
create table campaign_leads (
  id                bigserial primary key,
  ar_gemi           bigint not null unique,   -- never re-contact the same firm
  company_name      text not null,
  brand_name        text not null,            -- what's used for personalization
  email             text not null,
  prefecture        text,
  legal_type        text,
  instantly_lead_id text,
  added_at          timestamptz not null default now(),
  archived_at       timestamptz               -- NULL = currently active/in-campaign
);
create index campaign_leads_active_idx on campaign_leads (added_at) where archived_at is null;
```
⚠️ RLS is disabled on this table (Supabase advisory). Not an active risk since
access is via a direct Postgres connection string, not the public REST/anon
API — but revisit if this project's anon key is ever used client-side.

## Files (in `scripts/five_day_plan/` — self-contained, own Procfile/requirements, same pattern as `playwright_svc`)

| File | Purpose |
|---|---|
| `daily_sync.py` | Core logic — fetch eligible, cap batch, remove-for-room, add, record. Run with `--dry-run` to preview with zero writes. |
| `instantly_client.py` | Thin wrapper over 2 real Instantly v2 endpoints (verified against developer.instantly.ai + the MCP tool's generated schema, not guessed): `POST /leads` (add), `DELETE /leads` (bulk delete, scoped by `campaign_id`) |
| `scheduler.py` | Always-on process for Railway. Runs `daily_sync.run()` once/day at **19:00 Europe/Athens**, timezone-aware via `zoneinfo` (DST-safe — a static UTC cron would drift an hour twice a year) |
| `requirements.txt` / `Procfile` | `worker: python scheduler.py` |

## Config (change these values, not the logic, as the business scales)

```python
DAILY_ADD_COUNT = 60    # 2 inboxes × 30/day, hardcoded 2026-08-05 — bump manually
CAMPAIGN_CAP    = 1000  # Instantly Growth plan lead cap
EXCLUDE_KAD     = {"53200200"}  # food delivery
```
When the user upgrades to the 25k-lead Instantly plan + 5 more inboxes, only
these two numbers change — no logic changes needed. (Note: the 25k addon was
seen **blocked** on the current Growth plan — "advanced_outreach_plan_required"
— so that upgrade may need a plan-tier change, not just an addon purchase.)

## Verified facts (as of 2026-08-05, via Instantly API)

- Workspace: **"5 Days"**, org `2e0c2cb1-4ec7-4dea-8728-430506c2dafe`
- 2 inboxes: `sergio.firulescu@sergiofirulescu.com`, `sergio@sergiofirulescu.com`
  — both `daily_limit: 40` in Instantly's own settings, but usage capped at
  30/inbox by our own config; both still in warmup (expected, ongoing)
- Campaign **"New Firms 60"**: working-hours schedule 09:00–18:00 Mon–Fri,
  timezone `Asia/Nicosia` (same clock as Athens) — this is why leads are
  uploaded 18:00–00:00 the evening before: Instantly picks them up fresh at
  the next working-hours window
- Campaign was in **Draft** status when built — must be flipped to Active for
  real sending to occur (adding leads via API works regardless of status)

## Decisions made this session (in order)

1. Hardcoded daily count = **60** (30/inbox × 2), not dynamic from Instantly's
   API — user will bump manually when inboxes are added
2. Timing: uploads happen **18:00–00:00 Athens/Bucharest**, exact time within
   the window doesn't matter — picked 19:00 as the fixed run time
3. User creates the Instantly campaign manually (not via API)
4. Eligibility = non-ΑΤΟΜΙΚΗ + no website + not food-delivery + has email +
   has distinct brand name (all five, hard filters — not soft ranking)
5. Personalization = **brand name** (δ.τ.), not a person/owner name
6. Originally speced "archive to a separate Instantly list" for aged-out
   leads — **simplified mid-build to a straight delete** (Supabase still
   keeps the permanent history record either way; only the Instantly-side
   archive-list mechanism was dropped)
7. Tracking/state storage = **Supabase** (new project `5-day-plan-tracking`),
   not a table in the GreekLeads DB

## Status as of end of this session

- ✅ Supabase schema created and confirmed
- ✅ Script written, byte-compiled, and **dry-run tested against real GreekLeads
  data** (83 eligible, 60 batch — matches manual verification exactly)
- ✅ Supabase connection issue (IPv6-only direct host) diagnosed and fixed —
  must use the **Session Pooler** connection string, not "Direct connection"
- ✅ Real (non-dry-run) local test run completed successfully by the user —
  confirmed working end-to-end against the live Instantly API
- ⬜ **Not yet deployed to Railway** — instructions given (commit + push
  `scripts/five_day_plan/`, new Railway service with root dir
  `scripts/five_day_plan`, set `DATABASE_URL` / `SUPABASE_DB_URL` /
  `INSTANTLY_API_KEY` as Railway env vars — `.env` is gitignored so these
  must be set in Railway's dashboard, not committed)
- ⬜ Campaign still needs to be flipped from Draft → Active in Instantly
  before real sends will go out

## Known limitation, by design

The eligibility query is always **`incorporation_date = yesterday`** relative
to whenever it runs — there is **no catch-up mechanism**. If the scheduler
doesn't run on a given day (deploy timing gap, crash, etc.), that day's cohort
is permanently skipped, never retried.
