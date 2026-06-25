import TopNav from '@/components/TopNav'
import Footer from '@/components/Footer'
import Icon from '@/components/Icon'
import Link from 'next/link'

export const metadata = { title: 'Τιμολόγηση — GreekLeads' }

const plans = [
  {
    name: 'Δωρεάν',
    blurb: 'Εξερευνήστε το μητρώο χωρίς κόστος.',
    price: '€0',
    unit: '',
    featured: false,
    cta: 'Ξεκινήστε',
    ctaHref: '/sign-up',
    ctaStyle: 'btn-secondary',
    features: [
      { ok: true,  text: 'Αναζήτηση με φίλτρα' },
      { ok: true,  text: 'Πρόσβαση σε 2 σελίδες αποτελεσμάτων (100 εγγραφές)' },
      { ok: true,  text: 'Δεδομένα ΓΕΜΗ επαληθευμένα' },
      { ok: false, text: 'Απεριόριστη αναζήτηση' },
      { ok: false, text: 'Εξαγωγή CSV' },
    ],
  },
  {
    name: 'Πρόσβαση',
    blurb: 'Πλήρης αναζήτηση σε όλη τη βάση του ΓΕΜΗ.',
    price: '€5',
    unit: '/ μήνα',
    featured: true,
    cta: 'Εγγραφή — €5/μήνα',
    ctaHref: '/sign-up',
    ctaStyle: 'btn-primary',
    features: [
      { ok: true, text: 'Αναζήτηση με φίλτρα' },
      { ok: true, text: 'Απεριόριστη αναζήτηση — όλες οι εγγραφές' },
      { ok: true, text: 'Δεδομένα ΓΕΜΗ επαληθευμένα' },
      { ok: true, text: 'Φίλτρα: νομός, κλάδος, νομική μορφή, επαφές' },
      { ok: false, text: 'Εξαγωγή CSV (προσεχώς)' },
    ],
  },
  {
    name: 'Εξαγωγή',
    blurb: 'Κατεβάστε τη λίστα σας ως αρχείο CSV.',
    price: 'Σύντομα',
    unit: '',
    featured: false,
    cta: 'Ειδοποιήστε με',
    ctaHref: '/sign-up',
    ctaStyle: 'btn-secondary',
    features: [
      { ok: true, text: 'Όλα από το πλάνο Πρόσβασης' },
      { ok: true, text: 'Εξαγωγή CSV με Excel BOM' },
      { ok: true, text: 'Έως 50.000 εγγραφές ανά εξαγωγή' },
      { ok: true, text: 'Τιμή ανά λήψη (θα ανακοινωθεί)' },
    ],
  },
]

export default function PricingPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <TopNav />

      <main className="pricing-page">
        <div className="pricing-header">
          <span className="badge badge-gemi" style={{ marginBottom: 14 }}>
            <Icon name="verified" size={11} stroke={1.6} />
            Απλή τιμολόγηση
          </span>
          <h1 className="pricing-h1">Ξεκινήστε δωρεάν,<br />πληρώστε μόνο ό,τι χρειάζεστε</h1>
          <p className="pricing-sub">
            Δεν απαιτείται κάρτα για την εγγραφή. Ακύρωση ανά πάσα στιγμή.
          </p>
        </div>

        <div className="pricing-grid">
          {plans.map(plan => (
            <div key={plan.name} className={`plan-card ${plan.featured ? 'plan-card-featured' : ''}`}>
              {plan.featured && <div className="plan-featured-badge">ΔΗΜΟΦΙΛΕΣ</div>}
              <div className="plan-name">{plan.name}</div>
              <p className="plan-blurb">{plan.blurb}</p>
              <div className="plan-price-row">
                <span className="plan-price">{plan.price}</span>
                {plan.unit && <span className="plan-price-unit">{plan.unit}</span>}
              </div>
              <ul className="plan-features">
                {plan.features.map((f, i) => (
                  <li key={i} className="plan-feature">
                    {f.ok
                      ? <Icon name="check" size={14} stroke={2} className="plan-feature-check" />
                      : <Icon name="x" size={14} stroke={2} className="plan-feature-x" style={{ color: 'var(--text-muted)' }} />
                    }
                    <span style={{ color: f.ok ? 'var(--text-primary)' : 'var(--text-muted)' }}>{f.text}</span>
                  </li>
                ))}
              </ul>
              <Link href={plan.ctaHref} className={`btn ${plan.ctaStyle}`} style={{ width: '100%', justifyContent: 'center' }}>
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div style={{ marginTop: 64, maxWidth: 640, margin: '64px auto 0' }}>
          <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 24 }}>Συχνές Ερωτήσεις</h2>
          {[
            {
              q: 'Από πού προέρχονται τα δεδομένα;',
              a: 'Όλες οι εγγραφές προέρχονται από το ΓΕΜΗ (Γενικό Εμπορικό Μητρώο) — την επίσημη κυβερνητική βάση εταιρειών της Ελλάδας. Ενημερώνουμε σε πραγματικό χρόνο.',
            },
            {
              q: 'Τι περιλαμβάνει η δωρεάν πρόσβαση;',
              a: 'Μπορείτε να αναζητήσετε με όλα τα φίλτρα και να δείτε τις 2 πρώτες σελίδες αποτελεσμάτων (100 εγγραφές). Δεν απαιτείται λογαριασμός.',
            },
            {
              q: 'Μπορώ να ακυρώσω οποιαδήποτε στιγμή;',
              a: 'Ναι. Ακυρώστε από τις ρυθμίσεις λογαριασμού σας — η συνδρομή παραμένει ενεργή μέχρι το τέλος της χρεωμένης περιόδου.',
            },
            {
              q: 'Πότε θα είναι διαθέσιμη η εξαγωγή CSV;',
              a: 'Σύντομα. Εγγραφείτε για να ειδοποιηθείτε πρώτοι όταν ανοίξει.',
            },
          ].map((faq, i) => (
            <div key={i} style={{ padding: '20px 0', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 8 }}>{faq.q}</h3>
              <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{faq.a}</p>
            </div>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  )
}
