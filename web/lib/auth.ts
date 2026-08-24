import type { PlanName } from './entitlements'

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

const ANON: AuthState = { userId: null, plan: 'free', isPaid: false, isLoggedIn: false }

export async function getAuth(): Promise<AuthState> {
  if (!clerkConfigured) return ANON

  try {
    const { auth } = await import('@clerk/nextjs/server')
    const { userId, sessionClaims } = await auth()
    if (!userId) return ANON

    // Clerk stores the tier in public metadata; anything we don't recognise is
    // treated as free rather than trusted, so a typo can't grant entitlements.
    const raw = (sessionClaims?.metadata as Record<string, unknown> | undefined)?.plan
    const plan: PlanName = raw === 'paid' ? 'paid' : 'free'

    return { userId, plan, isPaid: plan === 'paid', isLoggedIn: true }
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

export const FREE_PAGE_LIMIT = 2
export const PAGE_SIZE = 50
