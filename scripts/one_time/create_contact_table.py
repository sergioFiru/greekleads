"""
Create contact_requests -- enquiries from the pricing page.

Until Stripe is live on the Greek IKE, the Agency tier has no checkout: the CTA
opens a form and the submission lands here. This is the sales inbox.

No email provider is configured yet (Resend/SendGrid is still on the roadmap),
so submissions are stored only. Read them with:

    python scripts/one_time/create_contact_table.py --inbox

Idempotent -- safe to re-run.

Usage:
    python scripts/one_time/create_contact_table.py            # apply
    python scripts/one_time/create_contact_table.py --inbox    # read submissions
    python scripts/one_time/create_contact_table.py --dry-run
"""

import os
import sys
import argparse
from pathlib import Path

import psycopg2
import psycopg2.extras

REPO_ROOT = Path(__file__).resolve().parents[2]

STATEMENTS = [
    (
        "contact_requests",
        """
        CREATE TABLE IF NOT EXISTS contact_requests (
            id         bigserial   PRIMARY KEY,
            name       text        NOT NULL,
            email      text        NOT NULL,
            company    text,
            phone      text,
            message    text,
            -- Which tier they were looking at when they clicked.
            plan       text,
            -- Clerk user id when they were signed in, else NULL.
            user_id    text,
            handled    boolean     NOT NULL DEFAULT false,
            created_at timestamptz NOT NULL DEFAULT now()
        )
        """,
    ),
    (
        "idx_contact_requests_new",
        "CREATE INDEX IF NOT EXISTS idx_contact_requests_new ON contact_requests(handled, created_at DESC)",
    ),
]


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


def inbox(cur) -> None:
    cur.execute(
        """
        SELECT id, name, email, company, phone, plan, message, handled, created_at
          FROM contact_requests
         ORDER BY handled ASC, created_at DESC
         LIMIT 50
        """
    )
    rows = cur.fetchall()
    if not rows:
        print("\nNo enquiries yet.")
        return
    for r in rows:
        flag = "   " if r["handled"] else ">> "
        print(f"\n{flag}#{r['id']}  {r['created_at']:%Y-%m-%d %H:%M}  [{r['plan'] or '-'}]")
        print(f"    {r['name']}  <{r['email']}>")
        if r["company"]:
            print(f"    {r['company']}")
        if r["phone"]:
            print(f"    {r['phone']}")
        if r["message"]:
            print(f"    {r['message']}")
    print(f"\n{sum(1 for r in rows if not r['handled'])} unhandled.")


def main() -> None:
    ap = argparse.ArgumentParser(description="Create the contact_requests table.")
    ap.add_argument("--dry-run", action="store_true", help="print SQL, change nothing")
    ap.add_argument("--inbox", action="store_true", help="read submissions")
    args = ap.parse_args()

    if args.dry_run:
        for _, sql in STATEMENTS:
            print(sql.strip(), end=";\n\n")
        return

    conn = psycopg2.connect(load_database_url())
    conn.autocommit = True
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            if args.inbox:
                inbox(cur)
                return
            total = len(STATEMENTS)
            for n, (label, sql) in enumerate(STATEMENTS, 1):
                print(f"[{'#' * n}{'-' * (total - n)}] {n}/{total}  {label} ...", flush=True)
                cur.execute(sql)
            print("\nDone.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
