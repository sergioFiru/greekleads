"""
Create the billing tables: the Stripe customer mapping and the subscription
state that entitlements are resolved from.

WHY POSTGRES IS THE SOURCE OF TRUTH
Plan used to be read from Clerk's publicMetadata. That works, but it makes
revenue state invisible to our own database -- you cannot answer "who is paying
and since when" with SQL, and it couples billing to the auth vendor. So the
webhook writes here, getAuth() reads here, and Clerk metadata is only a mirror
kept in sync for the client-side session claim. If the mirror ever drifts,
Postgres wins.

Idempotent -- every statement is IF NOT EXISTS, so re-running is safe and is the
intended way to apply this to a second environment (local vs Railway).

Usage:
    python scripts/one_time/create_billing_tables.py            # apply
    python scripts/one_time/create_billing_tables.py --dry-run  # print SQL only
    python scripts/one_time/create_billing_tables.py --verify   # report state only

Reads DATABASE_URL from the environment or web/.env.local.
"""

import os
import sys
import argparse
from pathlib import Path

import psycopg2

REPO_ROOT = Path(__file__).resolve().parents[2]

STATEMENTS = [
    # ── Clerk user  <->  Stripe customer ─────────────────────────────
    #
    # One Stripe customer per Clerk user, created lazily on first checkout.
    # UNIQUE on both columns: a user must never end up with two Stripe
    # customers (duplicate billing, split history) and a Stripe customer must
    # never map to two users.
    (
        "billing_customers",
        """
        CREATE TABLE IF NOT EXISTS billing_customers (
            user_id            text        PRIMARY KEY,
            stripe_customer_id text        NOT NULL UNIQUE,
            email              text,
            created_at         timestamptz NOT NULL DEFAULT now()
        )
        """,
    ),
    # ── Subscription state ───────────────────────────────────────────
    #
    # PK is the Stripe subscription id, not the user: a user can legitimately
    # have an old canceled row and a new active one, and we want the history.
    # `plan` is the resolved entitlements key ('individual' | 'agency' |
    # 'enterprise'), derived from price_id by the webhook so the read path never
    # has to know about Stripe ids.
    #
    # `status` is Stripe's own vocabulary, stored verbatim: trialing, active,
    # past_due, canceled, incomplete, incomplete_expired, unpaid, paused.
    # Only 'trialing' and 'active' grant entitlements -- see lib/billing.ts.
    #
    # `current_period_end` lets us show "renews on" and lets a canceled-at-
    # period-end subscription keep working until it actually lapses.
    (
        "billing_subscriptions",
        """
        CREATE TABLE IF NOT EXISTS billing_subscriptions (
            stripe_subscription_id text        PRIMARY KEY,
            user_id                text        NOT NULL,
            stripe_customer_id     text        NOT NULL,
            stripe_price_id        text        NOT NULL,
            plan                   text        NOT NULL,
            status                 text        NOT NULL,
            cancel_at_period_end   boolean     NOT NULL DEFAULT false,
            current_period_end     timestamptz,
            created_at             timestamptz NOT NULL DEFAULT now(),
            updated_at             timestamptz NOT NULL DEFAULT now()
        )
        """,
    ),
    # ── Webhook idempotency ──────────────────────────────────────────
    #
    # Stripe retries deliveries and does not promise exactly-once. Recording
    # every processed event id and skipping repeats is what stops a retried
    # checkout.session.completed from double-applying. Cheap insurance: one
    # INSERT .. ON CONFLICT DO NOTHING per event.
    (
        "billing_events",
        """
        CREATE TABLE IF NOT EXISTS billing_events (
            stripe_event_id text        PRIMARY KEY,
            type            text        NOT NULL,
            processed_at    timestamptz NOT NULL DEFAULT now()
        )
        """,
    ),
    # ── Manual grants ────────────────────────────────────────────────
    #
    # Not every subscription comes from Stripe. Founding customers paying by
    # bank transfer, comped accounts and our own test users all need a plan
    # without a Checkout Session. Those rows carry source='manual' and synthetic
    # stripe_* values, and are written by scripts/one_time/grant_plan.py.
    #
    # Kept in the same table on purpose: entitlements resolve from ONE place, so
    # a manually granted Agency user exercises exactly the same read path as a
    # paying one. A separate table would mean two code paths and one of them
    # would rot.
    (
        "billing_subscriptions.source",
        "ALTER TABLE billing_subscriptions ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'stripe'",
    ),
    # getAuth() runs this lookup on every authenticated request, so it must be
    # an index hit, never a scan.
    (
        "idx_billing_subs_user",
        "CREATE INDEX IF NOT EXISTS idx_billing_subs_user ON billing_subscriptions(user_id, status)",
    ),
    (
        "idx_billing_subs_customer",
        "CREATE INDEX IF NOT EXISTS idx_billing_subs_customer ON billing_subscriptions(stripe_customer_id)",
    ),
]

TABLES = ["billing_customers", "billing_subscriptions", "billing_events"]


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
            print(f"  [OK]      {table:<24} {cur.fetchone()[0]:>8,} rows")
        else:
            print(f"  [MISSING] {table:<24}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Create the billing tables.")
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
