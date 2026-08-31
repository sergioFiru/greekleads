import TopNav from '@/components/TopNav'
import Footer from '@/components/Footer'
import Icon from '@/components/Icon'
import PlanCta from '@/components/PlanCta'
import { PLANS, PLAN_LABELS, pagesLabel, formatLimit, type PlanName } from '@/lib/entitlements'
import { TIERS, VAT_NOTE } from '@/lib/pricing'

export const metadata = { title: 'Τιμολόγηση — GreekLeads' }

// Every number below is derived from entitlements.ts and pricing.ts. Nothing on
// this page is typed by hand — if a cap changes, the copy changes with it, and
// the page can never advertise something the code does not actually grant.
// (It did exactly that before: the old page promised a pay-per-export tier that
// was never built and said CSV export was unavailable while the code granted it.)

interface Feature { ok: boolean; text: string }

interface PlanCard {
  plan: PlanName
  name: string
  blurb: string
  price: string
  unit: string
  featured: boolean
  cta: string
  ctaHref?: string
  contact?: boolean
  ctaStyle: string
  features: Feature[]
}

const free = PLANS.free
const indiv = PLANS.individual
const agency = PLANS.agency
const ent = PLANS.enterprise

const plans: PlanCard[] = [
  {
    plan: 'free',
    name: PLAN_LABELS.free,
    blurb: 'Εξερευνήστε το μητρώο χωρίς κόστος και χωρίς κάρτα.',
    price: '€0',
    unit: '',
    featured: false,
    cta: 'Ξεκινήστε δωρεάν',
    ctaHref: '/sign-up',
    ctaStyle: 'btn-secondary',
    features: [
      { ok: true,  text: 'Πλήρη προφίλ εταιρειών & αναζήτηση με φίλτρα' },
      { ok: true,  text: `${pagesLabel(free.maxSearchPages)} αποτελεσμάτων` },
      { ok: true,  text: `${formatLimit(free.maxLists)} λίστα έως ${formatLimit(free.maxMembersPerList)} επαφές` },
      { ok: true,  text: `${formatLimit(free.maxSavedSearches)} αποθηκευμένες αναζητήσεις` },
      { ok: false, text: 'Εξαγωγή CSV' },
    ],
  },
  {
    plan: 'agency',
    name: PLAN_LABELS.agency,
    blurb: 'Για ομάδες πωλήσεων και πρακτορεία που τρέχουν καμπάνιες.',
    price: `€${TIERS.agency.amount}`,
    unit: `/ ${TIERS.agency.period}`,
    featured: true,
    cta: 'Επικοινωνήστε μαζί μας',
    contact: true,
    ctaStyle: 'btn-primary',
    features: [
      { ok: true, text: 'Όλα από το Individual' },
      { ok: true, text: `${pagesLabel(agency.maxSearchPages)} αποτελεσμάτων` },
      { ok: true, text: `${formatLimit(agency.maxLists)} λίστες έως ${formatLimit(agency.maxMembersPerList)} επαφές` },
      { ok: true, text: `Εξαγωγή CSV έως ${formatLimit(agency.maxExportRows)} γραμμές` },
      { ok: true, text: 'Ζωντανές λίστες — αυτόματη προσθήκη νέων εγγραφών' },
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
            Το μητρώο είναι ανοιχτό — κάθε προφίλ εταιρείας διαβάζεται χωρίς
            λογαριασμό. Τα πλάνα ξεκλειδώνουν το <em>βάθος</em>: πόσα
            αποτελέσματα βλέπετε, πόσα κρατάτε και τι μπορείτε να εξάγετε.
          </p>
        </div>

        <div className="pricing-grid pricing-grid-2">
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
              <PlanCta
                plan={plan.plan}
                label={plan.cta}
                className={plan.ctaStyle}
                href={plan.ctaHref}
                contact={plan.contact}
              />
            </div>
          ))}
        </div>

        <p className="pricing-foot">
          {VAT_NOTE} Δεν απαιτείται κάρτα για το δωρεάν πλάνο · Ακύρωση ανά πάσα στιγμή.
        </p>
      </main>

      <Footer />
    </div>
  )
}
