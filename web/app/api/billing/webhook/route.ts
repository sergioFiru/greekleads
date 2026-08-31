import { NextRequest, NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe, stripeConfigured, planForPriceId } from '@/lib/stripe'
import {
  claimEvent,
  linkCustomer,
  upsertSubscription,
  userIdForCustomer,
  releaseEvent,
  planForUser,
  mirrorPlanToClerk,
} from '@/lib/billing'

/**
 * POST /api/billing/webhook — Stripe subscription lifecycle.
 *
 * This is where fulfilment happens. NOT the success page: a user who pays and
 * immediately closes the tab must still get their plan, and a renewal twelve
 * months from now has no page at all. Everything that changes entitlements
 * lands here.
 *
 * Node runtime, because signature verification needs the raw body and real
 * crypto. `await req.text()` gives us the unparsed payload — do not read
 * req.json() first, that consumes the stream and the signature will not verify.
 *
 * This route is deliberately NOT in the Clerk middleware matcher: Stripe posts
 * with no cookies, and the request is authenticated by the signature instead.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The subscription's price, plan and period, read from its first item. */
function readItem(sub: Stripe.Subscription) {
  // ⚠️ current_period_end lives on the ITEM, not the Subscription, since the
  // 2025-03-31 API. Reading sub.current_period_end silently yields undefined.
  const item = sub.items?.data?.[0]
  const priceId = item?.price?.id ?? null
  const periodEnd = item?.current_period_end ?? null
  return {
    priceId,
    plan: priceId ? planForPriceId(priceId) : null,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
  }
}

/**
 * Which of our users a subscription belongs to.
 *
 * Three sources, most to least trustworthy: metadata we set at checkout, the
 * session's client_reference_id, then our own customer mapping. Any one of them
 * being present is enough.
 */
async function resolveUserId(
  sub: Stripe.Subscription,
  session?: Stripe.Checkout.Session
): Promise<string | null> {
  const fromMeta = sub.metadata?.clerk_user_id
  if (fromMeta) return fromMeta

  const fromSession = session?.client_reference_id
  if (fromSession) return fromSession

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
  return customerId ? userIdForCustomer(customerId) : null
}

/** Write the subscription to Postgres, then refresh the Clerk mirror. */
async function applySubscription(
  sub: Stripe.Subscription,
  session?: Stripe.Checkout.Session
): Promise<void> {
  const userId = await resolveUserId(sub, session)
  if (!userId) {
    console.error('[billing.webhook] no user for subscription', sub.id)
    return
  }

  const { priceId, plan, currentPeriodEnd } = readItem(sub)
  if (!priceId || !plan) {
    // An unrecognised price must never resolve to a paid tier by guesswork —
    // most likely a price created by hand in the dashboard, or one whose env
    // var is not deployed. Log loudly and change nothing.
    console.error('[billing.webhook] unmapped price', priceId, 'on', sub.id)
    return
  }

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
  if (customerId) await linkCustomer(userId, customerId, null)

  await upsertSubscription({
    stripeSubscriptionId: sub.id,
    userId,
    stripeCustomerId: customerId ?? '',
    stripePriceId: priceId,
    plan,
    status: sub.status,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    currentPeriodEnd,
  })

  // Recompute from the database rather than assuming this subscription is the
  // user's only one — planForUser applies the status rules and picks the most
  // generous entitling plan.
  await mirrorPlanToClerk(userId, await planForUser(userId))
}

export async function POST(req: NextRequest) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'billing_unavailable' }, { status: 503 })
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || secret.includes('placeholder')) {
    console.error('[billing.webhook] STRIPE_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 400 })
  }

  const sc = stripe()
  let event: Stripe.Event
  try {
    const raw = await req.text()
    event = await sc.webhooks.constructEventAsync(raw, signature, secret)
  } catch (err) {
    // A bad signature is the one case we answer 400: Stripe should not retry a
    // payload we cannot authenticate.
    console.error('[billing.webhook] signature verification failed:', err)
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })
  }

  // Stripe does not promise exactly-once delivery and retries on any non-2xx.
  // Claiming the event id makes a redelivery a no-op instead of a double-apply.
  try {
    const fresh = await claimEvent(event.id, event.type)
    if (!fresh) {
      return NextResponse.json({ received: true, duplicate: true })
    }
  } catch (err) {
    // If the idempotency table is unreachable, fail loudly so Stripe retries
    // rather than processing an event we cannot record.
    console.error('[billing.webhook] claimEvent failed:', err)
    return NextResponse.json({ error: 'claim_failed' }, { status: 500 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription' || !session.subscription) break
        // Guard against an unpaid session: with asynchronous payment methods
        // 'completed' can arrive before the money does.
        if (session.payment_status === 'unpaid') break

        const subId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription.id
        const sub = await sc.subscriptions.retrieve(subId)
        await applySubscription(sub, session)
        break
      }

      // Fires for the initial creation, plan changes, renewals, dunning
      // transitions and cancellation-at-period-end. Same handler: we always
      // write current state rather than trying to diff.
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await applySubscription(event.data.object as Stripe.Subscription)
        break
      }

      // Recorded for visibility only — the entitlement change always arrives as
      // a customer.subscription.updated alongside it.
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice
        console.warn('[billing.webhook] payment failed for customer', inv.customer)
        break
      }

      default:
        break
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    // Release the claim before answering 500, or Stripe's retry would see the
    // event as already processed and the change would be lost permanently.
    // Claim-then-release: concurrent deliveries still cannot double-apply, but
    // a genuine failure remains retryable.
    await releaseEvent(event.id)
    console.error('[billing.webhook] handler failed for', event.type, err)
    return NextResponse.json({ error: 'handler_failed' }, { status: 500 })
  }
}
