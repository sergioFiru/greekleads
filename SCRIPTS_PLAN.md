# GreekLeads — Scripts System Plan

## Overview

Two separate deployments:
- **`app/`** → Vercel (Next.js frontend + API routes)
- **`scripts/`** → Railway (Python workers, runs 24/7)

The scripts system is a collection of bots, each doing one job, all scheduled by a single runner process on Railway.

---

## Folder Structure

```
scripts/
├── bots/
│   ├── __init__.py
│   ├── new_firms_watcher.py     ← live now
│   ├── linkedin_enricher.py     ← future
│   ├── contact_finder.py        ← future
│   └── financial_enricher.py   ← future
├── one_time/
│   └── bulk_load.py             ← run locally overnight
├── db.py                        ← Supabase client
├── gemi.py                      ← ΓΕΜΗ API client
├── runner.py                    ← Railway entry point
├── requirements.txt
├── Procfile
└── .env.example
```

---

## How to Add a New Bot

1. Create `scripts/bots/your_bot.py` with this structure:

```python
NAME     = "your_bot_name"
INTERVAL = 60  # minutes between runs

def run(db, gemi):
    # db  = Supabase client (already authenticated)
    # gemi = ΓΕΜΗ API client
    pass
```

2. Add two lines to `runner.py`:

```python
from bots import your_bot       # import line
BOTS = [..., your_bot]          # register line
```

That's it. Railway picks it up on next deploy.

---

## Bots Planned

| Bot | Job | Interval | Status |
|---|---|---|---|
| `new_firms_watcher` | Detects and stores newly registered ΓΕΜΗ companies | 10 min | Live |
| `linkedin_enricher` | Finds LinkedIn company pages for stored firms | 60 min | Future |
| `contact_finder` | Finds email/phone from company website | 60 min | Future |
| `financial_enricher` | Pulls financial data (revenue, employees) | Daily | Future |
| `status_checker` | Detects companies that changed status (dissolved, etc.) | Daily | Future |

---

## Database Schema

### `companies`
Stores every ΓΕΜΗ company. Primary key: `ar_gemi` (BIGINT).

Key fields for the app:
- `co_name_el` — Greek company name
- `afm` — Tax number
- `prefecture_descr`, `municipality_descr`, `city` — Location
- `incorporation_date` — When founded
- `legal_type_descr` — ΑΕ, ΙΚΕ, ΟΕ, etc.
- `status_descr` — Active, dissolved, etc.
- `activities` — ΚΑΔ codes (JSONB array)
- `persons` — People linked to the company (JSONB array)
- `email`, `url` — Contact info (often empty from ΓΕΜΗ)
- `is_branch` — False = HQ, True = branch
- `linkedin_url`, `linkedin_enriched` — Enrichment fields (filled by bots)

### `sync_log`
One row per bot run. Used for:
- Monitoring bot health
- Resuming the bulk_load if interrupted
- Debugging failures

---

## One-Time Bulk Load

Run locally — do NOT run on Railway.

```bash
cd scripts
pip install -r requirements.txt
cp .env.example .env          # fill in credentials
python one_time/bulk_load.py
```

- Fetches all ~1.6M companies, 200 at a time, sorted by `+arGemi`
- Sleeps 8s between requests (rate limit: 8 req/min)
- Estimated runtime: **~18 hours**
- Auto-resumes if interrupted (Ctrl-C then re-run)
- Progress visible in Supabase `sync_log` table

---

## Railway Deployment

1. Push `scripts/` to GitHub
2. Create a new Railway project → connect repo
3. Set root directory to `scripts/`
4. Railway detects `Procfile` automatically → runs `python runner.py`
5. Add environment variables in Railway dashboard:
   - `GEMI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`

Railway keeps the worker alive 24/7. If it crashes, Railway restarts it automatically.

---

## Environment Variables

| Variable | Where to get it |
|---|---|
| `GEMI_API_KEY` | Your ΓΕΜΗ API key |
| `SUPABASE_URL` | Supabase project settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase project settings → API → service_role key |

---

## Rate Limits

ΓΕΜΗ API: **8 req/min**

- `bulk_load`: 1 req per 8s → uses the full limit during the load
- `new_firms_watcher`: 1 req per 10-min run → negligible
- Future bots that call ΓΕΜΗ must account for shared rate limit

When multiple bots run concurrently and both call ΓΕΜΗ, add a global rate limiter in `gemi.py`.

---

## Supabase Credentials Note

Use the **service_role** key in scripts (not the anon key). Scripts run server-side on Railway and need full DB access. Never expose the service_role key in the frontend app.
