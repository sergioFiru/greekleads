'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth, UserButton } from '@clerk/nextjs'
import BrandMark from './BrandMark'

// Same guard as app/layout.tsx: without a real publishable key there is no
// ClerkProvider mounted, and useAuth() would throw. NEXT_PUBLIC_* is inlined at
// build time, so this constant is fixed for the whole bundle — which is why it
// is safe to pick a different component tree from it (the hook lives inside
// AuthArea and is therefore never conditionally called).
const clerkConfigured =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.includes('placeholder')

const links = [
  { href: '/',        label: 'Αρχική' },
  { href: '/search',  label: 'Εταιρείες' },
  { href: '/people',  label: 'Στελέχη' },
  { href: '/statistika', label: 'Στατιστικά' },
  { href: '/pricing', label: 'Τιμές' },
]

function SignedOutCtas() {
  return (
    <>
      <Link href="/sign-in" className="btn btn-nav" style={{ fontWeight: 600, color: '#16233B' }}>Σύνδεση</Link>
      <Link href="/sign-up" className="btn btn-primary btn-cta" style={{ padding: '9px 16px', fontSize: 13.5 }}>
        Δοκιμάστε δωρεάν
      </Link>
    </>
  )
}

/** Right-hand auth area. Only rendered when Clerk is actually configured. */
function AuthArea() {
  const { isLoaded, isSignedIn } = useAuth()
  // Render nothing until Clerk resolves, rather than flashing "Σύνδεση" at
  // someone who is already signed in.
  if (!isLoaded) return <div style={{ width: 32 }} />
  return isSignedIn ? <UserButton /> : <SignedOutCtas />
}

function CrmLink({ active }: { active: boolean }) {
  const { isLoaded, isSignedIn } = useAuth()
  // Πελατολόγιο has nothing to show without an owner, so it stays hidden for
  // visitors rather than bouncing them into a sign-in wall.
  if (!isLoaded || !isSignedIn) return null
  return (
    <Link href="/crm" className="nav-link" data-active={active ? 'true' : 'false'}>
      Πελατολόγιο
    </Link>
  )
}

export default function TopNav({ totalCompanies }: { totalCompanies?: number }) {
  const path = usePathname()

  return (
    <nav className="topnav">
      <Link href="/" className="brand" style={{ textDecoration: 'none' }}>
        <span className="brand-mark"><BrandMark size={20} /></span>
        <span className="brand-word">GreekLeads</span>
      </Link>

      <div className="nav-links">
        {links.map(l => (
          <Link
            key={l.href}
            href={l.href}
            className="nav-link"
            data-active={path === l.href || (l.href !== '/' && path.startsWith(l.href)) ? 'true' : 'false'}
          >
            {l.label}
          </Link>
        ))}
        {clerkConfigured && <CrmLink active={path.startsWith('/crm')} />}
      </div>

      <div className="nav-spacer" />

      {totalCompanies != null && (
        <div className="nav-live">
          <span className="mono" style={{ color: '#16233B', fontWeight: 600, fontSize: 12 }}>
            {totalCompanies.toLocaleString('el-GR')}
          </span>
          <span>εταιρείες</span>
          <div className="nav-divider" />
          <span>ΓΕΜΗ</span>
          <span className="nav-live-dot" />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 16 }}>
        {clerkConfigured ? <AuthArea /> : <SignedOutCtas />}
      </div>
    </nav>
  )
}
