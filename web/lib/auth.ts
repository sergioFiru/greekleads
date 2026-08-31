import { type PlanName, isPaidPlan } from './entitlements'

// Re-exported so the many existing `from '@/lib/auth'` importers keep working;
// the definition lives with the page caps it belongs to.
export { PAGE_SIZE } from './entitlements'

// Clerk auth helpers — gracefully degrade when keys are placeholders
const clerkConfigured =
  !!process.env.CLERK_SECRET_KEY &&
  !process.env.CLERK_SECRET_KEY.startsWith('sk_test_placeholder')

export interface AuthState {
  userId: string | null
  /** Which entitlements row applies. Keys into PLANS in lib/entitlements.ts. */
  plan: PlanName
  /** Kept as a derived convenience so existing callers keep working. */
  isPaid: boolean
  isLoggedIn: boolean
}

/**
 * Signed-out visitors resolve to the 'anon' plan, NOT 'free'. A free account is
 * a strictly better thing to have than no account (5 pages vs 2), and that only
 * works if the two are distinguishable. See the note in entitlements.ts.
 */
const ANON: AuthState = { userId: null, plan: 'anon', isPaid: false, isLoggedIn: false }

export async function getAuth(): Promise<AuthState> {
  if (!clerkConfigured) return ANON

  try {
    const { auth } = await import('@clerk/nextjs/server')
    const { userId } = await auth()
    if (!userId) return ANON

    // Entitlements come from OUR database, not from Clerk metadata.
    //
    // Clerk publicMetadata is a mirror the webhook keeps up to date for the
    // client-side session claim, but it is not authoritative: it is editable
    // from the Clerk dashboard, it can lag a webhook, and it couples revenue
    // state to the auth vendor. billing_subscriptions is the record of what was
    // actually paid for, so that is what gates access. One indexed lookup.
    //
    // planForUser never throws — a database blip degrades to 'free' rather than
    // 500-ing every authenticated page.
    const { planForUser } = await import('./billing')
    const plan = await planForUser(userId)

    return { userId, plan, isPaid: isPaidPlan(plan), isLoggedIn: true }
  } catch {
    return ANON
  }
}

/**
 * For API routes that must have an owner. Returns null when signed out so the
 * caller can 401 — every CRM route starts with this.
 */
export async function requireUser(): Promise<{ userId: string; plan: PlanName } | null> {
  const { userId, plan } = await getAuth()
  return userId ? { userId, plan } : null
}
