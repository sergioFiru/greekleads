# GreekLeads — Scripts System Plan

## Overview

Two separate deployments:
- **`web/`** → Vercel (Next.js frontend + API routes)
- **`scripts/`** → Railway (Python workers, runs 24/7)

The scripts system is a collection of bots, each doing one job, all scheduled by a single runner process on Railway. Database is Railway PostgreSQL — accessed directly via psycopg2 (no Supabase).

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
│   └── bulk_load.py             ← DONE — do NOT re-run
├── db.py                        ← PostgreSQL client (psycopg2)
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
    # db   = psycopg2 connection (Railway PostgreSQL)
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

## Bots

| Bot | Job | Interval | Status |
|---|---|---|---|
| `new_firms_watcher` | Detects and stores newly registered ΓΕΜΗ companies | 10 min | Live |
| `linkedin_enricher` | Finds LinkedIn company pages for stored firms | 60 min | Future |
| `contact_finder` | Finds email/phone from company website | 60 min | Future |
| `financial_enricher` | Pulls financial data (revenue, employees) | Daily | Future |
| `status_checker` | Detects companies that changed status (dissolved, etc.) | Daily | Future |

---

## Database

**Railway PostgreSQL** — psycopg2 direct connection via `DATABASE_URL`.

### `companies`
Stores every ΓΕΜΗ company. Primary key: `ar_gemi` (BIGINT). ~1.67M rows.

Key fields:
- `co_name_el` — Greek company name
- `afm` — Tax number
- `prefecture_descr`, `municipality_descr`, `city` — Location
- `incorporation_date` — When founded
- `legal_type_descr` — ΑΕ, ΙΚΕ, ΟΕ, etc.
- `status_descr` — Active, dissolved, etc.
- `activities` — ΚΑΔ codes (JSONB array)
- `persons` — People linked to the company (JSONB array)
- `email`, `phone`, `fax`, `url` — Contact info (often empty from ΓΕΜΗ)
- `is_branch` — False = HQ, True = branch
- `gemi_fetched_at` — Timestamp of when the record was fetched
- `linkedin_url`, `linkedin_enriched` — Enrichment fields (filled by future bots)

### `sync_log`
One row per bot run. Used for monitoring bot health, resuming interrupted loads, and debugging failures.

---

## One-Time Bulk Load

**Already done — do NOT re-run.** The 1.67M company load is complete.

If ever needed again (fresh DB):
```bash
cd scripts
pip install -r requirements.txt
cp .env.example .env          # fill in DATABASE_URL + GEMI_API_KEY
python one_time/bulk_load.py
```

- Fetches all companies from ΓΕΜΗ, 200 at a time, sorted by `+arGemi`
- Sleeps 8s between requests (rate limit: 8 req/min)
- Auto-resumes if interrupted (Ctrl-C then re-run — uses sync_log to track progress)

---

## Railway Deployment

Scripts are deployed on Railway as a separate service from the web app.

1. Push `scripts/` to GitHub
2. Railway service → connect repo → set root directory to `scripts/`
3. Railway detects `Procfile` automatically → runs `python runner.py`
4. Environment variables in Railway dashboard:
   - `DATABASE_URL` — auto-linked when PostgreSQL is attached to the service
   - `GEMI_API_KEY` — ΓΕΜΗ API key

Railway keeps the worker alive 24/7. If it crashes, Railway restarts it automatically.

---

## Environment Variables

| Variable | Where to get it | Used by |
|---|---|---|
| `DATABASE_URL` | Railway dashboard (auto-linked PostgreSQL) | scripts + web |
| `GEMI_API_KEY` | ΓΕΜΗ developer portal | scripts only |

The web app (Vercel) also needs `DATABASE_URL` set manually in Vercel → Settings → Environment Variables.

---

## Rate Limits

ΓΕΜΗ API: **8 req/min**

- `bulk_load`: 1 req per 8s → uses the full limit during the load
- `new_firms_watcher`: 1 req per 10-min run → negligible
- Future bots that call ΓΕΜΗ must account for the shared rate limit

When multiple bots run concurrently and both call ΓΕΜΗ, add a global rate limiter in `gemi.py`.
