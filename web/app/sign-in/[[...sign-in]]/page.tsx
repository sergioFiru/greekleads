import TopNav from '@/components/TopNav'

export const metadata = { title: 'Σύνδεση — GreekLeads' }

const clerkConfigured =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.includes('placeholder')

export default function SignInPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <TopNav />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {clerkConfigured ? (
          // @ts-expect-error — Clerk component, loaded only when configured
          <ClerkSignIn />
        ) : (
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-strong)',
            borderRadius: 12,
            padding: '40px 36px',
            textAlign: 'center',
            maxWidth: 380,
          }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 10 }}>Σύνδεση</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Η αυθεντικοποίηση δεν έχει ρυθμιστεί ακόμα.
              Προσθέστε τα Clerk keys στο <code>.env.local</code>.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
