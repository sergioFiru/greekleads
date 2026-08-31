'use client'
import { useState } from 'react'
import ContactDialog from './ContactDialog'
import Link from 'next/link'
import { useAuth } from '@clerk/nextjs'
import type { PlanName } from '@/lib/entitlements'

// Same guard as TopNav and app/layout.tsx: with no real publishable key there is
// no ClerkProvider and useAuth() would throw. NEXT_PUBLIC_* is inlined at build
// time, so this is a build-fixed constant — safe to branch the component tree
// on, since the hook then lives in a subcomponent and is never called
// conditionally.
const clerkConfigured =
  !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.includes('placeholder')

interface Props {
  plan: PlanName
  label: string
  className: string
  /** Non-purchasable tiers just link somewhere. */
  href?: string
  /** Open the enquiry form instead of Checkout or a link. */
  contact?: boolean
}

/**
 * The call-to-action on a pricing card.
 *
 * Signed out → send them to sign-up carrying the plan, so the account they
 * create is the one that gets charged. Signed in → straight into Stripe
 * Checkout. Doing it the other way round (checkout first, account after) leaves
 * a paid Stripe customer with no user to attach the subscription to.
 */
export default function PlanCta({ plan, label, className, href, contact }: Props) {
  if (contact) return <ContactCta plan={plan} label={label} className={className} />
  if (href) {
    return (
      <Link href={href} className={`btn ${className}`} style={{ width: '100%', justifyContent: 'center' }}>
        {label}
      </Link>
    )
  }
  if (!clerkConfigured) {
    return (
      <Link
        href={`/sign-up?plan=${plan}`}
        className={`btn ${className}`}
        style={{ width: '100%', justifyContent: 'center' }}
      >
        {label}
      </Link>
    )
  }
  return <CheckoutCta plan={plan} label={label} className={className} />
}

function ContactCta({ plan, label, className }: Omit<Props, 'href' | 'contact'>) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        className={`btn ${className}`}
        style={{ width: '100%', justifyContent: 'center' }}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      <ContactDialog open={open} onClose={() => setOpen(false)} plan={plan} />
    </>
  )
}

function CheckoutCta({ plan, label, className }: Omit<Props, 'href' | 'contact'>) {
  const { isLoaded, isSignedIn } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Until Clerk resolves, render the sign-up link. It is the correct
  // destination for the majority of visitors and it degrades safely — worst
  // case a signed-in user lands on sign-up and is bounced onward.
  if (!isLoaded || !isSignedIn) {
    return (
      <Link
        href={`/sign-up?plan=${plan}`}
        className={`btn ${className}`}
        style={{ width: '100%', justifyContent: 'center' }}
      >
        {label}
      </Link>
    )
  }

  const start = async () => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json().catch(() => ({}))
      if (data.url) {
        window.location.href = data.url
        return
      }
      setError(
        res.status === 503
          ? 'Οι πληρωμές δεν είναι ακόμη διαθέσιμες.'
          : 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.'
      )
    } catch {
      setError('Κάτι πήγε στραβά. Δοκιμάστε ξανά.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        onClick={start}
        disabled={busy}
        className={`btn ${className}`}
        style={{ width: '100%', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}
      >
        {busy ? 'Ανακατεύθυνση…' : label}
      </button>
      {error && (
        <p style={{ fontSize: 11.5, color: 'var(--danger, #B0453A)', marginTop: 8, textAlign: 'center' }}>
          {error}
        </p>
      )}
    </>
  )
}
