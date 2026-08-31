import { query, queryOne } from './db'
import type { PlanName } from './entitlements'

/**
 * Billing reads and writes. Postgres is the source of truth for what a user is
 * entitled to; Clerk's publicMetadata is a mirror maintained for the client-side
 * session claim only.
 */

/**
 * Stripe statuses that actually grant entitlements.
 *
 * 'past_due' is deliberately INCLUDED: Stripe retries a failed payment for days
 * (dunning), and cutting someone off the hour their card blips is both hostile
 * and bad for recovery. They keep access while Stripe retries; if it ultimately
 * fails Stripe moves them to 'unpaid' or 'canceled' and access ends then.
 *
 * 'incomplete' is EXCLUDED: that is a subscription whose very first payment has
 * not succeeded. Granting on it would let a failed card buy a month.
 */
const ENTITLING_STATUSES = ['trialing', 'active', 'past_due'] as const

export interface SubscriptionRow {
  stripe_subscription_id: string
  user_id: string
  stripe_customer_id: string
  stripe_price_id: string
  plan: PlanName
  status: string
  cancel_at_period_end: boolean
  current_period_end: string | null
  /** 'stripe' for a real subscription, 'manual' for a granted one. */
  source: string
}

/**
 * The plan a user is entitled to, straight from Postgres.
 *
 * Runs on every authenticated request, so it is a single indexed lookup on
 * (user_id, status). Returns 'free' when there is no entitling subscription —
 * never throws, because a database blip must degrade to the free tier rather
 * than 500 the whole app.
 *
 * If a user somehow holds two entitling subscriptions, the most generous wins:
 * they paid for both, and taking away what they bought is the wrong failure.
 */
export async function planForUser(userId: string): Promise<PlanName> {
  try {
    const rows = await query<{ plan: string }>(
      `SELECT plan
         FROM billing_subscriptions
        WHERE user_id = $1
          AND status = ANY($2::text[])
        ORDER BY CASE plan
                   WHEN 'enterprise' THEN 3
                   WHEN 'agency'     THEN 2
                   WHEN 'individual' THEN 1
                   ELSE 0
                 END DESC
        LIMIT 1`,
      [userId, ENTITLING_STATUSES]
    )
    const plan = rows[0]?.plan
    return plan === 'individual' || plan === 'agency' || plan === 'enterprise'
      ? plan
      : 'free'
  } catch (err) {
    console.error('[billing.planForUser]', err)
    return 'free'
  }
}

/** The full subscription row, for the billing settings screen. */
export async function subscriptionForUser(userId: string): Promise<SubscriptionRow | null> {
  return queryOne<SubscriptionRow>(
    `SELECT stripe_subscription_id, user_id, stripe_customer_id, stripe_price_id,
            plan, status, cancel_at_period_end, current_period_end::text, source
       FROM billing_subscriptions
      WHERE user_id = $1
      ORDER BY (status = ANY($2::text[])) DESC, created_at DESC
      LIMIT 1`,
    [userId, ENTITLING_STATUSES]
  )
}

/** The Stripe customer id for a user, if one has been created. */
export async function customerIdForUser(userId: string): Promise<string | null> {
  const row = await queryOne<{ stripe_customer_id: string }>(
    `SELECT stripe_customer_id FROM billing_customers WHERE user_id = $1`,
    [userId]
  )
  return row?.stripe_customer_id ?? null
}

/**
 * Record the user ⇄ customer mapping.
 *
 * ON CONFLICT DO NOTHING on the primary key: if two checkout attempts race, the
 * first mapping stands and the second caller re-reads it. Creating a second
 * Stripe customer for the same user splits their billing history permanently,
 * so the write must never overwrite.
 */
export async function linkCustomer(
  userId: string,
  stripeCustomerId: string,
  email: string | null
): Promise<void> {
  await query(
    `INSERT INTO billing_customers (user_id, stripe_customer_id, email)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, stripeCustomerId, email]
  )
}

/** Insert or update a subscription. Called only from the webhook. */
export async function upsertSubscription(row: {
  stripeSubscriptionId: string
  userId: string
  stripeCustomerId: string
  stripePriceId: string
  plan: PlanName
  status: string
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: Date | null
}): Promise<void> {
  await query(
    `INSERT INTO billing_subscriptions (
       stripe_subscription_id, user_id, stripe_customer_id, stripe_price_id,
       plan, status, cancel_at_period_end, current_period_end, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (stripe_subscription_id) DO UPDATE SET
       stripe_price_id      = EXCLUDED.stripe_price_id,
       plan                 = EXCLUDED.plan,
       status               = EXCLUDED.status,
       cancel_at_period_end = EXCLUDED.cancel_at_period_end,
       current_period_end   = EXCLUDED.current_period_end,
       updated_at           = now()`,
    [
      row.stripeSubscriptionId,
      row.userId,
      row.stripeCustomerId,
      row.stripePriceId,
      row.plan,
      row.status,
      row.cancelAtPeriodEnd,
      row.currentPeriodEnd,
    ]
  )
}

/** Which user a Stripe customer belongs to — the webhook's reverse lookup. */
export async function userIdForCustomer(stripeCustomerId: string): Promise<string | null> {
  const row = await queryOne<{ user_id: string }>(
    `SELECT user_id FROM billing_customers WHERE stripe_customer_id = $1`,
    [stripeCustomerId]
  )
  return row?.user_id ?? null
}

/**
 * Claim a Stripe event id.
 *
 * Returns true the first time an event is seen and false on every retry.
 * Stripe does not promise exactly-once delivery, so without this a redelivered
 * checkout.session.completed would be applied twice.
 */
export async function claimEvent(eventId: string, type: string): Promise<boolean> {
  const rows = await query<{ stripe_event_id: string }>(
    `INSERT INTO billing_events (stripe_event_id, type)
     VALUES ($1, $2)
     ON CONFLICT (stripe_event_id) DO NOTHING
     RETURNING stripe_event_id`,
    [eventId, type]
  )
  return rows.length > 0
}

/**
 * Release a claimed event so Stripe's retry can process it.
 *
 * Must be called whenever handling fails after claimEvent succeeded — otherwise
 * the retry sees the claim, treats the event as already done, and the change is
 * lost permanently. Claim-then-release keeps concurrent deliveries from
 * double-applying while still letting a genuine failure be retried.
 */
export async function releaseEvent(eventId: string): Promise<void> {
  try {
    await query(`DELETE FROM billing_events WHERE stripe_event_id = $1`, [eventId])
  } catch (err) {
    console.error('[billing.releaseEvent]', err)
  }
}

/**
 * Mirror the resolved plan into Clerk publicMetadata.
 *
 * Best-effort only. Postgres is authoritative and getAuth() reads it, so a
 * failure here costs nothing but a stale client-side claim — it must never
 * fail the webhook, because Stripe would then retry an event we already applied.
 */
export async function mirrorPlanToClerk(userId: string, plan: PlanName): Promise<void> {
  try {
    const { clerkClient } = await import('@clerk/nextjs/server')
    const clerk = await clerkClient()
    await clerk.users.updateUserMetadata(userId, { publicMetadata: { plan } })
  } catch (err) {
    console.error('[billing.mirrorPlanToClerk] non-fatal:', err)
  }
}
