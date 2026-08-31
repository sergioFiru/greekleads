import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { SITE_URL } from '@/lib/site'
import { stripe, stripeConfigured, priceIdFor } from '@/lib/stripe'
import { customerIdForUser, linkCustomer } from '@/lib/billing'
import type { PlanName } from '@/lib/entitlements'

/**
 * POST /api/billing/checkout  { plan: 'individual' | 'agency' }
 *
 * Creates a Stripe Checkout Session and returns its URL for the client to
 * redirect to. Hosted Checkout rather than embedded Elements: it handles SCA/3DS
 * for European cards, address collection for tax, and VAT-ID entry, none of
 * which we want to reimplement.
 *
 * Fulfilment does NOT happen here or on the success page — it happens in the
 * webhook. A user who closes the tab after paying must still get their plan.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'billing_unavailable' }, { status: 503 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const plan = body.plan as PlanName

    const priceId = priceIdFor(plan)
    if (!priceId) {
      // Covers both an unknown plan and a purchasable one whose Price id is not
      // configured yet — the client gets the same answer either way.
      return NextResponse.json({ error: 'unknown_plan', plan }, { status: 400 })
    }

    const sc = stripe()

    // Reuse the customer if we have one, so a returning buyer keeps a single
    // billing history and their saved payment methods.
    let customerId = await customerIdForUser(user.userId)
    if (!customerId) {
      const customer = await sc.customers.create({
        metadata: { clerk_user_id: user.userId },
      })
      customerId = customer.id
      await linkCustomer(user.userId, customerId, null)
    }

    const session = await sc.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      // Carried into the webhook so we can map the session back to a user even
      // if the customer lookup ever fails.
      client_reference_id: user.userId,
      line_items: [{ price: priceId, quantity: 1 }],

      // NOTE: payment_method_types is deliberately omitted. Setting it disables
      // dynamic payment methods and locks out anything configured in the
      // dashboard later (SEPA, Apple/Google Pay), which costs conversion.

      // ── Tax ────────────────────────────────────────────────────────
      // Requires an ACTIVE Greek registration recorded in Stripe (Dashboard →
      // Tax → Locations) plus a head office address in Tax Settings. Without a
      // registration Stripe collects ZERO tax and raises NO error, and those
      // transactions cannot be corrected retroactively. Verify before go-live.
      automatic_tax: { enabled: true },
      // Collect ΑΦΜ / VAT number so cross-border EU B2B is reverse-charged
      // instead of being taxed as if it were a consumer sale.
      tax_id_collection: { enabled: true },
      // The customer already exists, so Checkout would reuse whatever address is
      // saved on it. 'auto' lets the address they type at checkout be the one
      // tax is calculated from.
      customer_update: { address: 'auto', name: 'auto' },

      subscription_data: {
        metadata: { clerk_user_id: user.userId, plan },
      },
      // Lets the Dashboard compare checkout flows. Suffix is a fixed random
      // label, not a per-session value.
      integration_identifier: 'greekleads-subscribe-qkzrvmta',

      success_url: `${SITE_URL}/crm?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/pricing?checkout=cancelled`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[/api/billing/checkout]', err)
    return NextResponse.json({ error: 'checkout_failed' }, { status: 500 })
  }
}
