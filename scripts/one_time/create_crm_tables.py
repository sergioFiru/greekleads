"""
Create the Πελατολόγιο (CRM) tables: prospect lists, list membership and saved
searches. See CRM_PLAN.md §4.

Idempotent — every statement is IF NOT EXISTS, so re-running is safe and is the
intended way to apply this to a second environment (local vs Railway).

Usage:
    python scripts/one_time/create_crm_tables.py            # apply
    python scripts/one_time/create_crm_tables.py --dry-run  # print SQL only
    python scripts/one_time/create_crm_tables.py --verify   # report state only

Reads DATABASE_URL from the environment or web/.env.local.
"""

import os
import sys
import argparse
from pathlib import Path

import psycopg2

REPO_ROOT = Path(__file__).resolve().parents[2]

STATEMENTS = [
    # ── Saved filter sets (free and paid alike) ──────────────────────
    (
        "crm_saved_searches",
        """
        CREATE TABLE IF NOT EXISTS crm_saved_searches (
            id          bigserial   PRIMARY KEY,
            user_id     text        NOT NULL,
            name        text        NOT NULL,
            filters     jsonb       NOT NULL,
            scout_brief text,
            created_at  timestamptz NOT NULL DEFAULT now(),
            UNIQUE (user_id, name)
        )
        """,
    ),
    # ── Prospect lists ───────────────────────────────────────────────
    # is_live / live_filters / live_brief are written by the UI now but nothing
    # reads them yet: the "Bring it Alive" matcher is a later phase. Storing them
    # from day one means lists created today are ready when it ships.
    (
        "crm_lists",
        """
        CREATE TABLE IF NOT EXISTS crm_lists (
            id           bigserial   PRIMARY KEY,
            user_id      text        NOT NULL,
            name         text        NOT NULL,
            description  text,
            is_live      boolean     NOT NULL DEFAULT false,
            live_filters jsonb,
            live_brief   text,
            created_at   timestamptz NOT NULL DEFAULT now(),
            updated_at   timestamptz NOT NULL DEFAULT now(),
            UNIQUE (user_id, name)
        )
        """,
    ),
    # ── Membership ───────────────────────────────────────────────────
    # PK (list_id, ar_gemi) makes re-adding a company a no-op via
    # ON CONFLICT DO NOTHING -- people re-run searches and re-add overlaps.
    #
    # Deliberately NO foreign key on ar_gemi -> companies: the scrapers rewrite
    # that table constantly and an FK would make every list write contend with
    # the crawlers.
    (
        "crm_list_members",
        """
        CREATE TABLE IF NOT EXISTS crm_list_members (
            list_id  bigint      NOT NULL REFERENCES crm_lists(id) ON DELETE CASCADE,
            ar_gemi  bigint      NOT NULL,
            added_at timestamptz NOT NULL DEFAULT now(),
            added_by text        NOT NULL DEFAULT 'user',
            note     text,
            PRIMARY KEY (list_id, ar_gemi)
        )
        """,
    ),
    ("idx_crm_lists_user",   "CREATE INDEX IF NOT EXISTS idx_crm_lists_user   ON crm_lists(user_id)"),
    ("idx_crm_saved_user",   "CREATE INDEX IF NOT EXISTS idx_crm_saved_user   ON crm_saved_searches(user_id)"),
    ("idx_crm_members_list", "CREATE INDEX IF NOT EXISTS idx_crm_members_list ON crm_list_members(list_id)"),
]

TABLES = ["crm_saved_searches", "crm_lists", "crm_list_members"]


def load_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url

    env_path = REPO_ROOT / "web" / ".env.local"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")

    sys.exit("DATABASE_URL not set and not found in web/.env.local")


def verify(cur) -> None:
    print("\nCurrent state:")
    for table in TABLES:
        cur.execute("SELECT to_regclass(%s)", (f"public.{table}",))
        exists = cur.fetchone()[0] is not None
        if exists:
            cur.execute(f"SELECT COUNT(*) FROM {table}")
            print(f"  [OK]      {table:<22} {cur.fetchone()[0]:>8,} rows")
        else:
            print(f"  [MISSING] {table:<22}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Create the CRM tables.")
    ap.add_argument("--dry-run", action="store_true", help="print SQL, change nothing")
    ap.add_argument("--verify", action="store_true", help="report table state, change nothing")
    args = ap.parse_args()

    if args.dry_run:
        for _, sql in STATEMENTS:
            print(sql.strip() if "\n" in sql.strip() else sql.strip(), end=";\n\n")
        return

    url = load_database_url()
    conn = psycopg2.connect(url)
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
