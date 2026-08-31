import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { subscriptionForUser } from '@/lib/billing'
import { limitsFor, PLAN_LABELS } from '@/lib/entitlements'
import { stripeConfigured } from '@/lib/stripe'
import { TIERS } from '@/lib/pricing'

/**
 * GET /api/billing/status — what the signed-in user is on, and what it costs.
 *
 * Read straight from Postgres, so it reflects the webhook rather than whatever
 * the session token was minted with. That matters right after checkout: the
 * Clerk claim can still say 'free' for a minute, and the user is looking at the
 * screen right then.
 */
export async function GET() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const sub = await subscriptionForUser(user.userId)

  return NextResponse.json({
    plan: user.plan,
    planLabel: PLAN_LABELS[user.plan],
    limits: limitsFor(user.plan),
    billingAvailable: stripeConfigured(),
    // The tier's public price, so the card can render "Agency · €100/μήνα"
    // rather than a bare English word in an otherwise Greek UI.
    price: user.plan in TIERS ? TIERS[user.plan as keyof typeof TIERS] : null,
    subscription: sub
      ? {
          status: sub.status,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          currentPeriodEnd: sub.current_period_end,
          // 'manual' grants have no Stripe customer, so there is no portal to
          // open and nothing will auto-renew. The card has to say so.
          source: sub.source,
        }
      : null,
  })
}
