'use client'
import Link from 'next/link'
import Icon from './Icon'
import { PLANS } from '@/lib/entitlements'
import { TIERS, VAT_NOTE } from '@/lib/pricing'

/**
 * Two different walls, because they convert differently.
 *
 * 'signup'  — an anonymous visitor past page 2. The ask is a free account, and
 *             the honest pitch is that it is free and doubles what they can see
 *             (2 pages → 5). Asking a stranger for €100 here converts nobody.
 * 'upgrade' — a signed-in free user past page 5. They have already committed
 *             once; now it is a price conversation.
 *
 * Numbers come from entitlements.ts and pricing.ts — never typed in here.
 */
export type GateReason = 'signup' | 'upgrade'

export default function Paywall({ reason = 'signup' }: { reason?: GateReason }) {
  if (reason === 'signup') {
    return (
      <div className="paywall-blur">
        <div className="paywall-card fadein">
          <div className="paywall-icon">
            <Icon name="lock" size={20} stroke={1.5} />
          </div>
          <h2 className="paywall-title">Συνεχίστε με δωρεάν λογαριασμό</h2>
          <p className="paywall-sub">
            Οι επισκέπτες βλέπουν τις {PLANS.anon.maxSearchPages} πρώτες σελίδες.
            Με έναν δωρεάν λογαριασμό βλέπετε {PLANS.free.maxSearchPages} — και
            μπορείτε να αποθηκεύετε λίστες και αναζητήσεις.
          </p>
          <div className="paywall-price">Δωρεάν</div>
          <div className="paywall-price-label">Χωρίς κάρτα · Σε 30 δευτερόλεπτα</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Link
              href="/sign-up"
              className="btn btn-primary"
              style={{ justifyContent: 'center', padding: '10px 20px', fontSize: 14 }}
            >
              Δημιουργία δωρεάν λογαριασμού
            </Link>
            <Link href="/sign-in" className="btn btn-ghost" style={{ justifyContent: 'center', fontSize: 13 }}>
              Έχετε ήδη λογαριασμό; Σύνδεση
            </Link>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 16 }}>
            Πλήρη προφίλ εταιρειών · Δεδομένα ΓΕΜΗ
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="paywall-blur">
      <div className="paywall-card fadein">
        <div className="paywall-icon">
          <Icon name="lock" size={20} stroke={1.5} />
        </div>
        <h2 className="paywall-title">Δείτε όλα τα αποτελέσματα</h2>
        <p className="paywall-sub">
          Το δωρεάν πλάνο φτάνει ως τη σελίδα {PLANS.free.maxSearchPages}. Με το
          Agency έχετε {PLANS.agency.maxSearchPages.toLocaleString('el-GR')} σελίδες,
          εξαγωγή CSV και παρακολούθηση νέων εγγραφών.
        </p>
        <div className="paywall-price">€{TIERS.agency.amount}</div>
        <div className="paywall-price-label">/ {TIERS.agency.period} · Ακύρωση ανά πάσα στιγμή</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Link
            href="/pricing"
            className="btn btn-primary"
            style={{ justifyContent: 'center', padding: '10px 20px', fontSize: 14 }}
          >
            Δείτε τα πλάνα
          </Link>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 16 }}>
          {VAT_NOTE}
        </p>
      </div>
    </div>
  )
}
