import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const clerkConfigured =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.includes('placeholder')

// When Clerk is configured, use its middleware — otherwise pass through
export default async function middleware(req: NextRequest) {
  if (!clerkConfigured) return NextResponse.next()

  const { clerkMiddleware } = await import('@clerk/nextjs/server')
  return clerkMiddleware()(req, {} as never)
}

/**
 * ALLOWLIST, not a blocklist — the matcher names the only routes that need
 * server-side auth, and nothing else ever reaches Clerk.
 *
 * WHY THIS MATTERS FOR SEO
 * Clerk performs a cross-origin "handshake" for clients it has not seen before,
 * answering with a 307 to <instance>.clerk.accounts.dev. Crawlers carry no
 * cookies, so they are exactly the clients that trigger it. With the previous
 * catch-all matcher, Googlebot requesting /etaireies/158161638000 was answered
 * with a 307 to a third-party domain instead of the page — observed in the
 * Vercel logs on 2026-08-27, user agent GoogleOther. A company page that
 * redirects off-site cannot be indexed.
 *
 * Only these need `auth()` on the server (verified by grepping @/lib/auth and
 * @clerk/nextjs/server):
 *   /crm, /crm/[id]          — the CRM pages
 *   /api/crm/*               — list + saved-search routes
 *   /api/search, /api/search/export — plan gating and export caps
 *   /sign-in, /sign-up       — Clerk's own flows
 *
 * TopNav calls useAuth(), but that is a CLIENT hook served by ClerkJS in the
 * browser; it does not need middleware to have run for the route.
 *
 * If you add a route that calls getAuth()/auth() server-side, add it here too —
 * otherwise Clerk throws "clerkMiddleware() was not run".
 *
 * NOTE: this is a mitigation, not the cure. Production is still running a Clerk
 * DEVELOPMENT instance (pk_test_… / prompt-beetle-62.clerk.accounts.dev), and
 * dev instances handshake far more aggressively than production ones. Moving to
 * a pk_live_ instance is the real fix.
 */
export const config = {
  matcher: [
    '/crm/:path*',
    '/api/crm/:path*',
    '/api/search/:path*',
    '/sign-in/:path*',
    '/sign-up/:path*',
    // Billing: checkout and portal call requireUser() and so need auth(). The
    // WEBHOOK is deliberately absent — Stripe posts with no cookies, it is
    // authenticated by its signature instead, and routing it through Clerk
    // would risk the same handshake redirect that was breaking Googlebot.
    '/api/billing/checkout',
    '/api/billing/portal',
    '/api/billing/status',
  ],
}
