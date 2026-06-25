#!/usr/bin/env python3
"""
DB migration: fast-search indexes for GreekLeads.
Run from the repo root:  python tools/db_migrate.py
"""

import os, sys, time, threading
import psycopg2
from dotenv import load_dotenv

try:
    from tqdm import tqdm
except ImportError:
    print("Installing tqdm...")
    os.system(f'"{sys.executable}" -m pip install tqdm -q')
    from tqdm import tqdm

# ── Config ────────────────────────────────────────────────────────────────────

load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'scripts', '.env'))
DSN = os.getenv('DATABASE_URL')
if not DSN:
    sys.exit("DATABASE_URL not found in scripts/.env")

BATCH_SIZE = 5_000

# ── DB helpers ────────────────────────────────────────────────────────────────

def connect(autocommit=False, max_attempts=20):
    """Connect to Railway PostgreSQL, retrying if DB is in recovery."""
    for attempt in range(1, max_attempts + 1):
        try:
            c = psycopg2.connect(
                DSN,
                keepalives=1,
                keepalives_idle=30,
                keepalives_interval=10,
                keepalives_count=5,
                connect_timeout=30,
            )
            c.autocommit = autocommit
            return c
        except psycopg2.OperationalError as e:
            if attempt == max_attempts:
                raise
            wait = min(60, 10 * attempt)
            print(f"\n  [{attempt}/{max_attempts}] DB not ready — retrying in {wait}s")
            print(f"  ({str(e).strip()[:120]})")
            time.sleep(wait)

def index_exists(cur, name):
    cur.execute(
        "SELECT 1 FROM pg_indexes WHERE tablename='companies' AND indexname=%s",
        (name,)
    )
    return bool(cur.fetchone())

def column_exists(cur, col):
    cur.execute(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name='companies' AND column_name=%s",
        (col,)
    )
    return bool(cur.fetchone())

# ── Index creation with progress bar ─────────────────────────────────────────

def _monitor_index(label, done):
    """Background thread: shows progress from pg_stat_progress_create_index."""
    try:
        mc = connect(autocommit=True)
        cur = mc.cursor()
    except Exception:
        return
    bar = tqdm(
        total=100, desc=label, unit='%',
        bar_format='{l_bar}{bar}| {n_fmt}/{total_fmt}%  elapsed={elapsed}  {postfix}',
        ncols=90,
    )
    last = 0
    while not done.is_set():
        try:
            cur.execute("""
                SELECT phase, blocks_done, blocks_total
                FROM pg_stat_progress_create_index
                WHERE relid = 'companies'::regclass
                ORDER BY pid DESC LIMIT 1
            """)
            row = cur.fetchone()
            if row:
                phase, bd, bt = row
                bar.set_postfix_str(phase or '')
                if bt and bt > 0 and bd is not None:
                    pct = min(99, int(bd / bt * 100))
                    if pct > last:
                        bar.update(pct - last)
                        last = pct
        except Exception:
            pass
        time.sleep(0.8)
    bar.update(100 - last)
    bar.close()
    try:
        cur.close()
        mc.close()
    except Exception:
        pass

def create_index(label, idx_name, sql):
    done = threading.Event()
    t = threading.Thread(target=_monitor_index, args=(label, done), daemon=True)
    t.start()
    try:
        c = connect(autocommit=True)
        c.cursor().execute(sql)
        c.close()
    finally:
        done.set()
        t.join(timeout=10)
    print(f"  ✓ {label}")

# ── Step 1: indexes on description columns ───────────────────────────────────

def step_descr_indexes():
    print("\n[Step 1/3] B-tree indexes on filter columns")
    c = connect(autocommit=True)
    cur = c.cursor()
    for idx_name, col, label in [
        ('idx_companies_status_descr',    'status_descr',    'status_descr index'),
        ('idx_companies_prefecture_descr','prefecture_descr','prefecture_descr index'),
        ('idx_companies_legal_type_descr','legal_type_descr','legal_type_descr index'),
    ]:
        if index_exists(cur, idx_name):
            print(f"  ✓ {label} — already exists, skipping")
        else:
            create_index(label, idx_name,
                f"CREATE INDEX CONCURRENTLY {idx_name} ON companies ({col})")
    cur.close()
    c.close()

# ── Step 2: populate primary_kad column ──────────────────────────────────────

UPDATE_SQL = """
    WITH batch AS (
        SELECT ar_gemi FROM companies WHERE primary_kad IS NULL LIMIT %s
    )
    UPDATE companies c
    SET primary_kad = COALESCE(
        (
            SELECT elem->'activity'->>'descr'
            FROM jsonb_array_elements(c.activities) elem
            WHERE elem->>'type' = 'Κύρια'
            LIMIT 1
        ),
        ''
    )
    FROM batch WHERE c.ar_gemi = batch.ar_gemi
"""

def step_primary_kad():
    print("\n[Step 2/3] primary_kad column")

    c = connect()
    cur = c.cursor()
    if not column_exists(cur, 'primary_kad'):
        print("  Adding column...", end=' ', flush=True)
        cur.execute("ALTER TABLE companies ADD COLUMN primary_kad TEXT")
        c.commit()
        print("done")
    else:
        print("  Column already exists")

    cur.execute("SELECT COUNT(*) FROM companies WHERE primary_kad IS NULL")
    remaining = cur.fetchone()[0]
    cur.close()
    c.close()

    if remaining == 0:
        print("  Already fully populated — skipping")
        return

    print(f"  {remaining:,} rows to populate in batches of {BATCH_SIZE:,}")
    print("  Each batch ~600KB WAL; auto-checkpoint recycles it — no disk pressure")

    with tqdm(
        total=remaining, unit='rows',
        bar_format='{l_bar}{bar}| {n_fmt}/{total_fmt} rows  [{elapsed}<{remaining}  {rate_fmt}]',
        ncols=90,
    ) as bar:
        finished = False
        while not finished:
            # Outer loop: get a fresh connection each time Railway drops us
            c = connect()   # retries up to 20× with increasing backoff
            cur = c.cursor()
            try:
                # Inner loop: run batches until connection dies
                while True:
                    cur.execute(UPDATE_SQL, (BATCH_SIZE,))
                    n = cur.rowcount
                    c.commit()
                    if n == 0:
                        finished = True
                        break
                    bar.update(n)
            except (psycopg2.OperationalError, psycopg2.InterfaceError):
                bar.write("  Connection dropped — waiting 20s before reconnecting...")
                time.sleep(20)
            finally:
                try: cur.close()
                except Exception: pass
                try: c.close()
                except Exception: pass

    print("  ✓ primary_kad populated")

# ── Step 3: index on primary_kad ─────────────────────────────────────────────

def step_primary_kad_index():
    print("\n[Step 3/3] Index on primary_kad")
    c = connect(autocommit=True)
    cur = c.cursor()
    if index_exists(cur, 'idx_companies_primary_kad'):
        print("  ✓ Index already exists, skipping")
    else:
        create_index(
            'primary_kad index',
            'idx_companies_primary_kad',
            "CREATE INDEX CONCURRENTLY idx_companies_primary_kad ON companies (primary_kad)"
        )
    cur.close()
    c.close()

# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print("=" * 60)
    print("  GreekLeads DB Migration — fast-search indexes")
    print("=" * 60)
    step_descr_indexes()
    step_primary_kad()
    step_primary_kad_index()
    print("\n" + "=" * 60)
    print("  Migration complete. Queries are now near-instant.")
    print("=" * 60)
