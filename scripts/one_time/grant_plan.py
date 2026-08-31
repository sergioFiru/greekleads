"""
Grant, revoke or inspect a plan for a user, without Stripe.

WHY THIS EXISTS
Three real cases need a plan that no Checkout Session produced:
  1. Testing the paid UI before Stripe is live (the immediate one).
  2. Founding customers paying by bank transfer -- "first 20 agencies, locked
     12 months" in GREEKLEADS_PRICING.md.
  3. Comped accounts.

Grants are written into billing_subscriptions with source='manual' and synthetic
stripe_* values, so they resolve through EXACTLY the same read path as a paying
subscriber (lib/billing.ts planForUser). No second code path, nothing to rot.

The Stripe webhook only ever touches rows keyed by a real stripe_subscription_id,
so a manual grant and a later real subscription can coexist -- planForUser picks
the most generous entitling plan.

Usage:
    python scripts/one_time/grant_plan.py --list
    python scripts/one_time/grant_plan.py --user-id user_xxx --plan agency
    python scripts/one_time/grant_plan.py --user-id user_xxx --plan agency --months 12
    python scripts/one_time/grant_plan.py --user-id user_xxx --revoke

Find a user id in the Clerk dashboard: Users -> click the user -> the id shown
as `user_...`. It is the same value stored in crm_lists.user_id, so
`--list-users` will also show anyone who has already created a list.

Reads DATABASE_URL from the environment or web/.env.local.
"""

import os
import sys
import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg2
import psycopg2.extras

REPO_ROOT = Path(__file__).resolve().parents[2]

# Must match PlanName in web/lib/entitlements.ts. 'anon' is deliberately absent:
# it is the signed-out pseudo-plan and can never be granted.
PLANS = ["free", "individual", "agency", "enterprise"]


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


def require_source_column(cur) -> None:
    cur.execute(
        """
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'billing_subscriptions' AND column_name = 'source'
        """
    )
    if cur.fetchone() is None:
        sys.exit(
            "billing_subscriptions.source is missing.\n"
            "Re-run: python scripts/one_time/create_billing_tables.py"
        )


def list_grants(cur) -> None:
    cur.execute(
        """
        SELECT user_id, plan, status, source, current_period_end, updated_at
          FROM billing_subscriptions
         ORDER BY updated_at DESC
         LIMIT 100
        """
    )
    rows = cur.fetchall()
    if not rows:
        print("\nNo subscriptions of any kind yet.")
        return
    print(f"\n{'user_id':<34} {'plan':<11} {'status':<10} {'source':<8} expires")
    print("-" * 86)
    for r in rows:
        exp = r["current_period_end"].strftime("%Y-%m-%d") if r["current_period_end"] else "-"
        print(f"{r['user_id']:<34} {r['plan']:<11} {r['status']:<10} {r['source']:<8} {exp}")


def list_users(cur) -> None:
    """Anyone who has touched the CRM — a practical way to find your own id."""
    cur.execute(
        """
        SELECT user_id, COUNT(*) AS lists, MAX(updated_at) AS last_seen
          FROM crm_lists GROUP BY user_id ORDER BY 3 DESC LIMIT 50
        """
    )
    rows = cur.fetchall()
    if not rows:
        print("\nNo users have created a list yet — get your id from the Clerk dashboard.")
        return
    print(f"\n{'user_id':<34} {'lists':>6}  last activity")
    print("-" * 70)
    for r in rows:
        print(f"{r['user_id']:<34} {r['lists']:>6}  {r['last_seen']:%Y-%m-%d %H:%M}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Grant or revoke a plan manually.")
    ap.add_argument("--user-id", help="Clerk user id, e.g. user_2abc...")
    ap.add_argument("--plan", choices=PLANS, help="plan to grant")
    ap.add_argument("--months", type=int, default=12, help="grant length in months (default 12)")
    ap.add_argument("--revoke", action="store_true", help="cancel this user's manual grant")
    ap.add_argument("--list", action="store_true", help="show all subscriptions")
    ap.add_argument("--list-users", action="store_true", help="show users who have created lists")
    args = ap.parse_args()

    conn = psycopg2.connect(load_database_url())
    conn.autocommit = True

    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            require_source_column(cur)

            if args.list_users:
                list_users(cur)
                return
            if args.list:
                list_grants(cur)
                return

            if not args.user_id:
                ap.error("--user-id is required (or use --list / --list-users)")

            # A stable synthetic id, so re-granting updates in place instead of
            # littering the table with one row per run.
            sub_id = f"manual_{args.user_id}"

            if args.revoke:
                cur.execute(
                    """
                    UPDATE billing_subscriptions
                       SET status = 'canceled', updated_at = now()
                     WHERE stripe_subscription_id = %s
                    """,
                    (sub_id,),
                )
                if cur.rowcount == 0:
                    print(f"No manual grant found for {args.user_id}.")
                else:
                    print(f"Revoked manual grant for {args.user_id}.")
                    print("They fall back to 'free' on their next request.")
                list_grants(cur)
                return

            if not args.plan:
                ap.error("--plan is required when granting")

            # 'free' is the absence of an entitling row, not a row saying free.
            if args.plan == "free":
                print("'free' is the default — revoking instead of granting.")
                cur.execute(
                    """
                    UPDATE billing_subscriptions
                       SET status = 'canceled', updated_at = now()
                     WHERE stripe_subscription_id = %s
                    """,
                    (sub_id,),
                )
                list_grants(cur)
                return

            expires = datetime.now(timezone.utc) + timedelta(days=30 * args.months)

            cur.execute(
                """
                INSERT INTO billing_subscriptions (
                    stripe_subscription_id, user_id, stripe_customer_id,
                    stripe_price_id, plan, status, cancel_at_period_end,
                    current_period_end, source, updated_at
                ) VALUES (%s, %s, '', 'manual', %s, 'active', false, %s, 'manual', now())
                ON CONFLICT (stripe_subscription_id) DO UPDATE SET
                    plan               = EXCLUDED.plan,
                    status             = 'active',
                    current_period_end = EXCLUDED.current_period_end,
                    updated_at         = now()
                """,
                (sub_id, args.user_id, args.plan, expires),
            )

            print(f"Granted '{args.plan}' to {args.user_id} until {expires:%Y-%m-%d}.")
            print("Entitlements read Postgres directly, so it applies on the next request —")
            print("no sign-out needed. (The Clerk metadata mirror stays stale; nothing reads it.)")
            list_grants(cur)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
