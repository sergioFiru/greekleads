// Clerk auth helpers — gracefully degrade when keys are placeholders
const clerkConfigured =
  !!process.env.CLERK_SECRET_KEY &&
  !process.env.CLERK_SECRET_KEY.startsWith('sk_test_placeholder')

export async function getAuth(): Promise<{
  userId: string | null
  isPaid: boolean
  isLoggedIn: boolean
}> {
  if (!clerkConfigured) {
    return { userId: null, isPaid: false, isLoggedIn: false }
  }
  try {
    const { auth } = await import('@clerk/nextjs/server')
    const { userId, sessionClaims } = await auth()
    const isPaid = (sessionClaims?.metadata as Record<string, unknown>)?.plan === 'paid'
    return { userId, isPaid: !!isPaid, isLoggedIn: !!userId }
  } catch {
    return { userId: null, isPaid: false, isLoggedIn: false }
  }
}

export const FREE_PAGE_LIMIT = 2
export const PAGE_SIZE = 50
