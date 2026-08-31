'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import type { PlanName } from '@/lib/entitlements'

interface Status {
  plan: PlanName
  planLabel: string
  billingAvailable: boolean
  price: { amount: number | null; period: string | null } | null
  subscription: {
    status: string
    cancelAtPeriodEnd: boolean
    currentPeriodEnd: string | null
    source: string
  } | null
}

const STATUS_LABEL: Record<string, string> = {
  trialing: 'Δοκιμαστική περίοδος',
  active: 'Ενεργή',
  past_due: 'Εκκρεμεί πληρωμή',
  unpaid: 'Απλήρωτη',
  canceled: 'Ακυρωμένη',
  incomplete: 'Ημιτελής',
  incomplete_expired: 'Έληξε',
  paused: 'Σε παύση',
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('el-GR')
}

/**
 * Plan + billing panel on /crm.
 *
 * Also the landing spot after checkout. Stripe redirects back the instant the
 * payment clears, which is often BEFORE the webhook has been delivered and
 * processed — so on ?checkout=success we re-poll for a few seconds rather than
 * telling a paying customer they are still on the free plan.
 */
export default function BillingCard() {
  const params = useSearchParams()
  const justPaid = params.get('checkout') === 'success'

  const [status, setStatus] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(justPaid)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<Status | null> => {
    try {
      const res = await fetch('/api/billing/status')
      if (!res.ok) return null
      const d: Status = await res.json()
      setStatus(d)
      return d
    } catch {
      return null
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Poll only while we are expecting a webhook, and give up after ~15s rather
  // than hammering forever — the plan will be right on the next page load.
  useEffect(() => {
    if (!justPaid) return
    let tries = 0
    let stop = false
    const tick = async () => {
      if (stop) return
      const d = await load()
      tries += 1
      if (d && d.plan !== 'free' && d.plan !== 'anon') { setWaiting(false); return }
      if (tries >= 8) { setWaiting(false); return }
      setTimeout(tick, 2000)
    }
    const t = setTimeout(tick, 1500)
    return () => { stop = true; clearTimeout(t) }
  }, [justPaid, load])

  const openPortal = async () => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (d.url) { window.location.href = d.url; return }
      setError('Δεν ήταν δυνατό το άνοιγμα της διαχείρισης συνδρομής.')
    } catch {
      setError('Δεν ήταν δυνατό το άνοιγμα της διαχείρισης συνδρομής.')
    } finally {
      setBusy(false)
    }
  }

  if (!status) return null

  const paid = status.plan !== 'free' && status.plan !== 'anon'
  const sub = status.subscription
  // Granted rather than bought: no Stripe customer exists, so the portal would
  // 404, and nothing will auto-renew.
  const manual = sub?.source === 'manual'

  return (
    <div className="crm-billing">
      <div className="crm-billing-main">
        <div className="crm-billing-label">Πλάνο</div>
        <div className="crm-billing-plan">
          {waiting ? 'Ενεργοποίηση…' : status.planLabel}
          {!waiting && paid && !manual && status.price?.amount != null && (
            <span className="crm-billing-price">
              €{status.price.amount}{status.price.period ? ` / ${status.price.period}` : ''}
            </span>
          )}
          {sub && paid && (
            <span className={`crm-billing-status crm-billing-status-${sub.status}`}>
              {STATUS_LABEL[sub.status] ?? sub.status}
            </span>
          )}
        </div>

        {waiting && (
          <div className="crm-billing-note">
            Η πληρωμή ολοκληρώθηκε. Ενεργοποιούμε τη συνδρομή σας…
          </div>
        )}

        {!waiting && sub && paid && sub.currentPeriodEnd && (
          <div className="crm-billing-note">
            {manual
              ? `Ισχύει έως ${formatDate(sub.currentPeriodEnd)}.`
              : sub.cancelAtPeriodEnd
                ? `Λήγει στις ${formatDate(sub.currentPeriodEnd)} — δεν θα ανανεωθεί.`
                : `Ανανεώνεται στις ${formatDate(sub.currentPeriodEnd)}.`}
          </div>
        )}

        {!waiting && sub?.status === 'past_due' && (
          <div className="crm-billing-note crm-billing-warn">
            Η τελευταία πληρωμή απέτυχε. Η πρόσβασή σας συνεχίζεται όσο
            ξαναδοκιμάζουμε — ενημερώστε την κάρτα σας για να μη διακοπεί.
          </div>
        )}
      </div>

      <div className="crm-billing-actions">
        {paid && !manual && status.billingAvailable && (
          <button className="btn btn-secondary btn-sm" onClick={openPortal} disabled={busy}>
            {busy ? 'Άνοιγμα…' : 'Διαχείριση συνδρομής'}
          </button>
        )}
        {!paid && (
          <Link href="/pricing" className="btn btn-primary btn-sm">
            Δείτε τα πλάνα
          </Link>
        )}
      </div>

      {error && <div className="crm-billing-note crm-billing-warn">{error}</div>}
    </div>
  )
}
