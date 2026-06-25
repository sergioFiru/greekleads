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

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
