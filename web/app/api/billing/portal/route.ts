import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { SITE_URL } from '@/lib/site'
import { stripe, stripeConfigured } from '@/lib/stripe'
import { customerIdForUser } from '@/lib/billing'

/**
 * POST /api/billing/portal
 *
 * Opens Stripe's Customer Portal so a subscriber can update their card, change
 * plan, download invoices and cancel — without us building any of it, and
 * without anyone having to email us to stop paying.
 *
 * The portal's own configuration (what it allows) lives in the Stripe
 * dashboard: Settings → Billing → Customer portal.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'billing_unavailable' }, { status: 503 })
  }

  try {
    const customerId = await customerIdForUser(user.userId)
    if (!customerId) {
      // Never bought anything — there is no billing to manage.
      return NextResponse.json({ error: 'no_customer' }, { status: 404 })
    }

    const session = await stripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${SITE_URL}/crm`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[/api/billing/portal]', err)
    return NextResponse.json({ error: 'portal_failed' }, { status: 500 })
  }
}
