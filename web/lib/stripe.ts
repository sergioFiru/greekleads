import Stripe from 'stripe'
import type { PlanName } from './entitlements'
import { TIERS } from './pricing'

/**
 * The Stripe client.
 *
 * Instantiated per-module rather than via the deprecated global api-key pattern
 * (`stripe.api_key = ...`), which is removed in current SDKs.
 *
 * apiVersion is PINNED. Stripe ships breaking changes behind version strings,
 * so leaving it unset means an upgrade can silently change response shapes
 * under a running integration. Bump it deliberately, with the changelog open.
 */
export const STRIPE_API_VERSION = '2026-07-29.dahlia' as const

let client: Stripe | null = null

export function stripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key || key.includes('placeholder')) {
      throw new Error('STRIPE_SECRET_KEY is not configured')
    }
    client = new Stripe(key, {
      apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
      appInfo: { name: 'GreekLeads', url: 'https://www.greekleads.gr' },
    })
  }
  return client
}

/** True when real Stripe keys are present — lets routes 503 instead of crash. */
export function stripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY
  return !!key && !key.includes('placeholder')
}

// ── Plan ⇄ Price ──────────────────────────────────────────────────────
//
// Price ids live in env, not in code, so test and live can differ without a
// deploy. TIERS names the env var per plan; this resolves it in both
// directions. The webhook needs price → plan (Stripe tells us what was bought);
// checkout needs plan → price.

/** The Stripe Price id for a purchasable plan, or null if not purchasable. */
export function priceIdFor(plan: PlanName): string | null {
  if (plan === 'anon' || plan === 'free' || plan === 'enterprise') return null
  const envName = TIERS[plan]?.stripePriceEnv
  if (!envName) return null
  const id = process.env[envName]
  return id && !id.includes('placeholder') ? id : null
}

/**
 * Which entitlements tier a Stripe Price grants.
 *
 * Returns null for an unrecognised price — which is the safe answer. An old or
 * hand-created price must never silently resolve to a paid tier; the webhook
 * logs it and leaves the user where they were rather than guessing.
 */
export function planForPriceId(priceId: string): PlanName | null {
  for (const plan of ['individual', 'agency'] as const) {
    if (priceIdFor(plan) === priceId) return plan
  }
  return null
}

/** Plans that can actually be bought through Checkout right now. */
export function purchasablePlans(): PlanName[] {
  return (['individual', 'agency'] as const).filter(p => priceIdFor(p) !== null)
}

/**
 * The Stripe product tax code for the subscription products.
 *
 * txcd_10103001 is "Software as a service (SaaS)". Set on the PRODUCT in the
 * Stripe dashboard, not here — this constant exists so the value is documented
 * in one place and can be checked against the account.
 *
 * ⚠️ Confirm with your accountant that this is the correct classification
 * before the first live charge. A Nontaxable code (txcd_00000000) causes
 * automatic_tax to collect zero tax with no error, indistinguishable from a
 * missing registration.
 */
export const SAAS_TAX_CODE = 'txcd_10103001'
