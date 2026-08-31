// ── Public prices — the single source of truth for money ──────────────
//
// Same rule as entitlements.ts: never write a price into a component. The
// paywall, the pricing page and (later) the Stripe Price lookup all read here,
// so a change lands everywhere at once.
//
// ⚠️ VAT: these are the amounts BEFORE ΦΠΑ. Greek B2B convention quotes πλέον
// ΦΠΑ, and Stripe Checkout adds 24% at payment time via automatic_tax. Any
// surface that shows a price to a customer must say so — see VAT_NOTE.
//
// ⚠️ When these numbers change, the Stripe Price objects must be recreated —
// a Price is immutable, you cannot edit its amount. Existing subscribers stay
// on the old Price until migrated.

import type { PlanName } from './entitlements'

export interface Tier {
  plan: PlanName
  /** Amount in euro, excluding ΦΠΑ. null = not publicly priced. */
  amount: number | null
  /** Billing period, for display. */
  period: 'μήνα' | 'έτος' | null
  /** Stripe Price id, resolved from env so test and live can differ. */
  stripePriceEnv: string | null
}

export const TIERS: Record<Exclude<PlanName, 'anon'>, Tier> = {
  free: {
    plan: 'free',
    amount: 0,
    period: null,
    stripePriceEnv: null,
  },
  individual: {
    plan: 'individual',
    amount: 75,
    period: 'έτος',
    stripePriceEnv: 'STRIPE_PRICE_INDIVIDUAL_YEARLY',
  },
  agency: {
    plan: 'agency',
    amount: 100,
    period: 'μήνα',
    stripePriceEnv: 'STRIPE_PRICE_AGENCY_MONTHLY',
  },
  // Priced per deal — no public number and no Stripe object. The CTA starts a
  // conversation instead of a checkout.
  enterprise: {
    plan: 'enterprise',
    amount: null,
    period: null,
    stripePriceEnv: null,
  },
}

export const VAT_NOTE = 'Οι τιμές δεν περιλαμβάνουν ΦΠΑ 24%.'

/**
 * Where Enterprise enquiries land. Enterprise is priced per deal, so its CTA
 * starts a conversation rather than a checkout.
 *
 * TODO: confirm this mailbox actually exists before launch — a dead contact
 * address on the only sales-led tier is worse than no tier at all.
 */
export const CONTACT_EMAIL = 'info@greekleads.gr'

/** "€100 / μήνα", or "Κατόπιν επικοινωνίας" when unpriced. */
export function formatPrice(tier: Tier): string {
  if (tier.amount === null) return 'Κατόπιν επικοινωνίας'
  if (tier.amount === 0)    return '€0'
  return `€${tier.amount}${tier.period ? ` / ${tier.period}` : ''}`
}
