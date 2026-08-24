"""
Adds pipeline tracking + per-list column layout to the CRM tables.

  crm_list_members.stage           text, default 'new'  (pipeline stage)
  crm_list_members.last_contacted  date
  crm_lists.columns                jsonb (the user's chosen grid columns)

Idempotent (ADD COLUMN IF NOT EXISTS) — safe to re-run, and that is how you
apply it to a second environment.

Usage:
    python scripts/one_time/add_crm_grid_columns.py
    python scripts/one_time/add_crm_grid_columns.py --verify
"""

import os
import sys
import argparse
from pathlib import Path

import psycopg2

REPO_ROOT = Path(__file__).resolve().parents[2]

# Pipeline stages. Keys are stored; the Greek labels live in the UI
# (web/lib/crmColumns.ts) so the DB never holds display text.
STAGES = ["new", "contacted", "proposal", "customer", "lost"]

STATEMENTS = [
    (
        "crm_list_members.stage",
        """
        ALTER TABLE crm_list_members
            ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'new'
        """,
    ),
    (
        "crm_list_members.stage CHECK",
        # Guards against a typo'd stage reaching the DB and rendering as a blank
        # cell forever. DROP first so re-running with an edited STAGES list works.
        """
        DO $$
        BEGIN
            ALTER TABLE crm_list_members DROP CONSTRAINT IF EXISTS crm_list_members_stage_chk;
            ALTER TABLE crm_list_members ADD CONSTRAINT crm_list_members_stage_chk
                CHECK (stage IN ('new','contacted','proposal','customer','lost'));
        END $$;
        """,
    ),
    (
        "crm_list_members.last_contacted",
        "ALTER TABLE crm_list_members ADD COLUMN IF NOT EXISTS last_contacted date",
    ),
    (
        "crm_lists.columns",
        "ALTER TABLE crm_lists ADD COLUMN IF NOT EXISTS columns jsonb",
    ),
    (
        "idx_crm_members_stage",
        "CREATE INDEX IF NOT EXISTS idx_crm_members_stage ON crm_list_members(list_id, stage)",
    ),
]


def load_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    env_path = REPO_ROOT / "web" / ".env.local"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("DATABASE_URL not set and not found in web/.env.local")


def verify(cur) -> None:
    print("\nCurrent state:")
    checks = [
        ("crm_list_members", "stage"),
        ("crm_list_members", "last_contacted"),
        ("crm_lists", "columns"),
    ]
    for table, col in checks:
        cur.execute(
            """SELECT data_type FROM information_schema.columns
               WHERE table_name = %s AND column_name = %s""",
            (table, col),
        )
        row = cur.fetchone()
        status = f"[OK]      {table}.{col:<16} {row[0]}" if row else f"[MISSING] {table}.{col}"
        print("  " + status)

    cur.execute("SELECT stage, COUNT(*) FROM crm_list_members GROUP BY stage ORDER BY 2 DESC")
    rows = cur.fetchall()
    if rows:
        print("\n  Stage distribution:")
        for stage, n in rows:
            print(f"    {stage:<12} {n:>8,}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Add CRM grid/pipeline columns.")
    ap.add_argument("--verify", action="store_true", help="report state, change nothing")
    args = ap.parse_args()

    conn = psycopg2.connect(load_database_url())
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            if args.verify:
                verify(cur)
                return

            total = len(STATEMENTS)
            for n, (label, sql) in enumerate(STATEMENTS, 1):
                bar = "#" * n + "-" * (total - n)
                print(f"[{bar}] {n}/{total}  {label} ...", flush=True)
                cur.execute(sql)

            print("\nDone.")
            verify(cur)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
