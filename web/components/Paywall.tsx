'use client'
import Link from 'next/link'
import Icon from './Icon'

export default function Paywall() {
  return (
    <div className="paywall-blur">
      <div className="paywall-card fadein">
        <div className="paywall-icon">
          <Icon name="lock" size={20} stroke={1.5} />
        </div>
        <h2 className="paywall-title">Δείτε όλα τα αποτελέσματα</h2>
        <p className="paywall-sub">
          Οι δωρεάν χρήστες βλέπουν τις 2 πρώτες σελίδες.
          Αποκτήστε πρόσβαση σε όλες τις εταιρείες του ΓΕΜΗ για μόνο:
        </p>
        <div className="paywall-price">€5</div>
        <div className="paywall-price-label">/ μήνα · Ακύρωση ανά πάσα στιγμή</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Link href="/sign-up" className="btn btn-primary" style={{ justifyContent: 'center', padding: '10px 20px', fontSize: 14 }}>
            Εγγραφή — €5/μήνα
          </Link>
          <Link href="/sign-in" className="btn btn-ghost" style={{ justifyContent: 'center', fontSize: 13 }}>
            Έχετε ήδη λογαριασμό; Σύνδεση
          </Link>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 16 }}>
          Περιλαμβάνει πλήρη αναζήτηση · Χωρίς εξαγωγή
        </p>
      </div>
    </div>
  )
}
