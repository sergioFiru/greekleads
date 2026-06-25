import Link from 'next/link'
import TopNav from '@/components/TopNav'
import LiveExhibit from '@/components/LiveExhibit'
import Footer from '@/components/Footer'
import Icon from '@/components/Icon'
import HeroSearchBar from '@/components/HeroSearchBar'
import { queryOne } from '@/lib/db'

async function getTotalCompanies(): Promise<number> {
  try {
    const row = await queryOne<{ total: string }>('SELECT COUNT(*) AS total FROM companies')
    return parseInt(row?.total ?? '0', 10)
  } catch {
    return 0
  }
}

const SECTORS = [
  { label: 'Ναυτιλία & Logistics',    companies: 8420  },
  { label: 'Τουρισμός & Φιλοξενία',  companies: 41280 },
  { label: 'Κατασκευές & Ακίνητα',   companies: 24120 },
  { label: 'Εστίαση & Τρόφιμα',      companies: 31840 },
  { label: 'Βιομηχανία',              companies: 14820 },
  { label: 'Λιανικό Εμπόριο',        companies: 62140 },
  { label: 'Ενέργεια & Utilities',    companies: 1820  },
  { label: 'Φάρμακα & Υγεία',        companies: 6240  },
  { label: 'Τεχνολογία & IT',         companies: 9418  },
  { label: 'Χρηματοοικονομικά',       companies: 3120  },
]

const PREVIEW_ROWS = [
  { name: 'Pelagos Maritime Group ΑΕ',  legal: 'ΑΕ',  city: 'Πειραιάς',       year: 2014, email: true,  phone: true,  web: true  },
  { name: 'Helleniq Cloud Systems ΙΚΕ', legal: 'ΙΚΕ', city: 'Αθήνα',          year: 2020, email: true,  phone: false, web: true  },
  { name: 'Mediterra Pharma ΕΠΕ',       legal: 'ΕΠΕ', city: 'Πάτρα',          year: 2009, email: false, phone: true,  web: false },
  { name: 'Aegean Bistro Holdings ΑΕ',  legal: 'ΑΕ',  city: 'Θεσσαλονίκη',   year: 2016, email: true,  phone: true,  web: true  },
  { name: 'Kyklades Hospitality ΑΕ',    legal: 'ΑΕ',  city: 'Ηράκλειο',       year: 2007, email: false, phone: true,  web: true  },
]

const LOGO_COLORS = [
  { bg: '#EEF4FF', fg: '#1A4A8A', border: '#C0D0E8' },
  { bg: '#F1F0EA', fg: '#3D3527', border: '#D7D2C0' },
  { bg: '#EAF3EE', fg: '#1F5C42', border: '#B6D4C2' },
  { bg: '#F5EEEA', fg: '#7A3826', border: '#E0CCBE' },
  { bg: '#EEEEF5', fg: '#3D3A6E', border: '#C5C3DC' },
]

function logoColor(name: string) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return LOGO_COLORS[h % LOGO_COLORS.length]
}

function initials(name: string) {
  const w = name.trim().split(/\s+/).filter(x => x.length > 1)
  return w.length >= 2 ? (w[0][0] + w[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
}

function fmtInt(n: number) {
  return n.toLocaleString('el-GR')
}

export default async function HomePage() {
  const total = await getTotalCompanies()
  const fmtTotal = total > 0
    ? (total / 1_000_000).toFixed(2).replace('.', ',') + 'M+'
    : '1,28M+'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <TopNav totalCompanies={total} />

      {/* ── HERO ──────────────────────────────────────────── */}
      <section className="hp-hero-section">
        <div className="hp-hero-backdrop" aria-hidden="true" />

        <div className="hp-container">
          <div className="hp-hero-grid">

            {/* LEFT */}
            <div>
              {/* Eyebrow row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22, flexWrap: 'wrap' }}>
                <span className="badge badge-gemi" style={{ height: 22, padding: '0 9px' }}>
                  <Icon name="verified" size={11} stroke={1.6} />
                  Επίσημα δεδομένα ΓΕΜΗ
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-secondary)' }}>
                  <span style={{ width: 4, height: 4, borderRadius: 2, background: 'var(--text-muted)', display: 'inline-block' }} />
                  <span className="mono" style={{ color: 'var(--text-primary)' }}>Live</span> ενημέρωση μητρώου
                </span>
              </div>

              {/* Headline */}
              <h1 style={{
                margin: 0,
                fontSize: 64,
                lineHeight: 1.02,
                letterSpacing: '-0.03em',
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}>
                Κάθε ελληνική<br />
                επιχείρηση,<br />
                <span style={{ color: 'var(--accent)' }}>prospect-ready.</span>
              </h1>

              <p style={{
                fontSize: 16.5,
                lineHeight: 1.55,
                color: 'var(--text-secondary)',
                marginTop: 22,
                maxWidth: 540,
              }}>
                Ολόκληρο το μητρώο ΓΕΜΗ — {fmtTotal} εταιρείες, email, τηλέφωνο, website.
                Φιλτράρετε, αναζητήστε και εξάγετε leads για τον κλάδο σας.
              </p>

              {/* Search bar — client component for interactivity */}
              <HeroSearchBar />

              {/* Sub-CTA row */}
              <div style={{ marginTop: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span className="hp-live-dot" />
                  25 δωρεάν εξαγωγές κάθε μήνα — χωρίς κάρτα
                </span>
                <span style={{ width: 1, height: 12, background: 'var(--border)', display: 'inline-block' }} />
                <Link href="/pricing" style={{ color: 'var(--accent)', fontSize: 12.5, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  Δείτε τιμές
                  <Icon name="chevron-right" size={11} />
                </Link>
              </div>

              {/* "Search across" chips */}
              <div style={{ marginTop: 30, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Αναζήτηση σε
                </span>
                {[
                  { l: fmtTotal + ' εταιρείες', icon: 'building' as const },
                  { l: '188K emails',            icon: 'mail'     as const },
                  { l: '94K τηλέφωνα',          icon: 'phone'    as const },
                  { l: '76K websites',           icon: 'globe'    as const },
                ].map((chip, i) => (
                  <span key={i} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: 22, padding: '0 9px',
                    borderRadius: 6,
                    border: '0.5px solid var(--border)',
                    background: '#fff',
                    fontSize: 11.5, color: 'var(--text-primary)',
                  }}>
                    <Icon name={chip.icon} size={11} stroke={1.6} style={{ color: 'var(--text-muted)' }} />
                    {chip.l}
                  </span>
                ))}
              </div>
            </div>

            {/* RIGHT — live exhibit with crop marks */}
            <div className="hp-crop-wrap">
              <span className="hp-crop-mark hp-crop-tl" />
              <span className="hp-crop-mark hp-crop-tr" />
              <span className="hp-crop-mark hp-crop-bl" />
              <span className="hp-crop-mark hp-crop-br" />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <LiveExhibit />
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── REGISTRY STRIP ─────────────────────────────────── */}
      <section style={{ padding: '0 28px 48px' }}>
        <div className="hp-container">
          <div className="card" style={{
            padding: '18px 22px',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 0,
          }}>
            {[
              { value: fmtTotal,     label: 'Εγγεγραμμένες εταιρείες',  note: '100% ΓΕΜΗ' },
              { value: '188.440',    label: 'Επαληθευμένα emails',        note: 'SMTP verified' },
              { value: '94.220',     label: 'Αριθμοί τηλεφώνου',         note: 'Carrier verified' },
              { value: '56',         label: 'Νομοί Ελλάδας',             note: 'Πλήρης κάλυψη' },
            ].map((stat, i) => (
              <div key={i} style={{
                padding: '0 22px',
                borderLeft: i === 0 ? 'none' : '0.5px solid var(--border)',
              }}>
                <div className="mono" style={{ fontSize: 22, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                  {stat.label}
                </div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {stat.note}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRODUCT PREVIEW ────────────────────────────────── */}
      <section style={{ padding: '16px 28px 80px' }}>
        <div className="hp-container">
          <div style={{ maxWidth: 680 }}>
            <div style={{ fontSize: 11, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, fontWeight: 500 }}>
              Το προϊόν
            </div>
            <h2 style={{ margin: 0, fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Ένας πίνακας ερευνητικής ποιότητας, όχι μια λίστα ονομάτων.
            </h2>
            <p style={{ margin: '12px 0 0', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55, maxWidth: 580 }}>
              Φιλτράρετε ολόκληρο το μητρώο ανά τοποθεσία, κλάδο ΚΑΔ, νομική μορφή και κατάσταση. Κάθε γραμμή εξάγεται καθαρά.
            </p>
          </div>

          <div style={{
            marginTop: 28,
            position: 'relative',
            borderRadius: 10,
            border: '0.5px solid var(--border-strong)',
            background: '#fff',
            overflow: 'hidden',
            boxShadow: '0 4px 24px rgba(26,35,50,0.04)',
          }}>
            {/* Browser chrome */}
            <div style={{
              height: 32,
              background: '#F2F1ED',
              borderBottom: '0.5px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '0 12px',
            }}>
              <div style={{ display: 'flex', gap: 5 }}>
                {['#D0CEC8', '#D0CEC8', '#D0CEC8'].map((c, i) => (
                  <span key={i} style={{ width: 9, height: 9, borderRadius: 5, background: c }} />
                ))}
              </div>
              <div style={{
                flex: 1, height: 18, background: '#fff', borderRadius: 4,
                border: '0.5px solid var(--border)',
                display: 'inline-flex', alignItems: 'center', padding: '0 8px',
                fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
              }}>
                greekleads.gr/search?sector=software&location=attiki&status=ενεργη
              </div>
            </div>

            {/* Filter pill row */}
            <div style={{
              padding: '12px 16px',
              background: '#FAFAF7',
              borderBottom: '0.5px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Φίλτρα:</span>
              <span className="pill"><span className="pill-label">Κλάδος:</span> Τεχνολογία & IT</span>
              <span className="pill"><span className="pill-label">Τοποθεσία:</span> Αττική</span>
              <span className="pill"><span className="pill-label">Κατάσταση:</span> Ενεργή</span>
              <span className="pill"><span className="pill-label">Email:</span> Verified</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                <span className="mono" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>284</span> εταιρείες
              </span>
            </div>

            {/* Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', padding: '8px 12px 8px 16px', borderBottom: '0.5px solid var(--border)', background: '#FAFAF7', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Εταιρεία
                  </th>
                  <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', padding: '8px 12px', borderBottom: '0.5px solid var(--border)', background: '#FAFAF7', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Enrichment
                  </th>
                  <th style={{ textAlign: 'right', fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', padding: '8px 16px 8px 12px', borderBottom: '0.5px solid var(--border)', background: '#FAFAF7', textTransform: 'uppercase', letterSpacing: '0.04em' }} />
                </tr>
              </thead>
              <tbody>
                {PREVIEW_ROWS.map((c, idx) => {
                  const col = logoColor(c.name)
                  return (
                    <tr key={idx} style={{ borderTop: idx === 0 ? 'none' : '0.5px solid var(--row-divider)', cursor: 'default' }}>
                      <td style={{ padding: '10px 12px 10px 16px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{
                            width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                            background: col.bg, color: col.fg, borderColor: col.border,
                            border: '0.5px solid',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 600, letterSpacing: '0.02em',
                          }}>
                            {initials(c.name)}
                          </span>
                          <div>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>{c.name}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>
                              {c.legal} · {c.city} · Founded <span className="mono">{c.year}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                          <span className="badge badge-gemi">
                            <Icon name="verified" size={10} stroke={1.6} />
                            ΓΕΜΗ
                          </span>
                          {c.email && (
                            <span className="badge badge-neutral">
                              <Icon name="mail" size={10} stroke={1.6} />
                            </span>
                          )}
                          {c.phone && (
                            <span className="badge badge-neutral">
                              <Icon name="phone" size={10} stroke={1.6} />
                            </span>
                          )}
                          {c.web && (
                            <span className="badge badge-neutral">
                              <Icon name="globe" size={10} stroke={1.6} />
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 16px 10px 12px', textAlign: 'right', verticalAlign: 'middle' }}>
                        <Icon name="chevron-right" size={14} style={{ color: 'var(--text-muted)' }} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Fade overlay — peek effect */}
            <div style={{
              height: 60,
              background: 'linear-gradient(to bottom, rgba(255,255,255,0), #fff)',
              marginTop: -60,
              position: 'relative',
              pointerEvents: 'none',
            }} />
          </div>
        </div>
      </section>

      {/* ── DATA SOURCES ───────────────────────────────────── */}
      <section style={{
        padding: '60px 28px',
        background: 'var(--app-bg)',
        borderTop: '0.5px solid var(--border)',
        borderBottom: '0.5px solid var(--border)',
      }}>
        <div className="hp-container">
          <div style={{ maxWidth: 680 }}>
            <div style={{ fontSize: 11, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, fontWeight: 500 }}>
              Η πηγή των δεδομένων
            </div>
            <h2 style={{ margin: 0, fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Τρεις ανεξάρτητες πηγές. Ένα ενοποιημένο αρχείο.
            </h2>
            <p style={{ margin: '12px 0 0', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55, maxWidth: 580 }}>
              Δεν κάνουμε scraping από Google. Κάθε εγγραφή βασίζεται σε επίσημα δεδομένα μητρώου, εμπλουτισμένα με επαληθευμένες επαφές.
            </p>
          </div>

          <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {[
              {
                tag: 'Πρωτεύουσα πηγή', tagClass: 'badge-gemi',
                title: 'Μητρώο ΓΕΜΗ',
                desc: 'Ημερήσια ενημέρωση από το Γενικό Εμπορικό Μητρώο — η νομική πηγή αλήθειας για κάθε ελληνική εταιρεία, στελέχη και υποβολές.',
                stats: [{ k: 'Κάλυψη', v: '100%' }, { k: 'Latency', v: '< 24h' }, { k: 'Πεδία', v: '47' }],
                icon: 'verified' as const,
              },
              {
                tag: 'Enrichment', tagClass: 'badge-neutral',
                title: 'Email & Τηλέφωνο',
                desc: 'Emails επαληθεύονται μέσω SMTP handshake και αριθμοί τηλεφώνου μέσω carrier lookup. Τα bounced records αποκλείονται αυτόματα.',
                stats: [{ k: 'Email accuracy', v: '94.1%' }, { k: 'Phone accuracy', v: '88.6%' }, { k: 'Suppression', v: 'Active' }],
                icon: 'mail' as const,
              },
              {
                tag: 'Enrichment', tagClass: 'badge-neutral',
                title: 'Web Presence',
                desc: 'Websites, κοινωνικά δίκτυα και ψηφιακό αποτύπωμα κάθε εταιρείας. Φιλτράρετε μόνο εταιρείες με web παρουσία.',
                stats: [{ k: 'Websites', v: '76.220' }, { k: 'Κάλυψη', v: '6%' }, { k: 'Refresh', v: 'Weekly' }],
                icon: 'globe' as const,
              },
            ].map((s, i) => (
              <div key={i} className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className={`badge ${s.tagClass}`}>{s.tag}</span>
                  <span style={{
                    width: 28, height: 28, borderRadius: 6,
                    background: '#F2F1ED', color: 'var(--text-secondary)',
                    border: '0.5px solid var(--border)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon name={s.icon} size={14} stroke={1.6} />
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{s.desc}</div>
                </div>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                  borderTop: '0.5px solid var(--row-divider)',
                  paddingTop: 12,
                }}>
                  {s.stats.map((st, j) => (
                    <div key={j} style={{ borderLeft: j === 0 ? 'none' : '0.5px solid var(--row-divider)', paddingLeft: j === 0 ? 0 : 12 }}>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{st.k}</div>
                      <div className="mono" style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginTop: 3 }}>{st.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── USE CASES ──────────────────────────────────────── */}
      <section style={{ padding: '80px 28px' }}>
        <div className="hp-container">
          <div style={{ maxWidth: 680 }}>
            <div style={{ fontSize: 11, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, fontWeight: 500 }}>
              Για ποιους είναι
            </div>
            <h2 style={{ margin: 0, fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Μία πλατφόρμα. Τρεις δουλειές.
            </h2>
          </div>
          <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {[
              {
                who: 'Sales teams',
                title: 'Χτίστε prospect lists χωρίς εικασίες.',
                body: 'Κόψτε την ελληνική αγορά ανά κλάδο, μέγεθος και γεωγραφία. Εξάγετε στο CRM σας σε ένα κλικ.',
                points: ['Λίστες ανά κλάδο & νομό', 'Email & τηλέφωνο επαφών', 'CSV για HubSpot / Salesforce'],
                icon: 'users' as const,
              },
              {
                who: 'Ερευνητές & αναλυτές',
                title: 'Sector benchmarks με μονοχρωματική βεβαιότητα.',
                body: 'Παρακολουθήστε ανταγωνιστικά σύνολα, τάσεις ανάπτυξης και κλαδική ανάλυση σε οποιοδήποτε τμήμα της ελληνικής οικονομίας.',
                points: ['Κλαδικά αθροίσματα', 'Custom watchlists', 'Bulk CSV export'],
                icon: 'trend-up' as const,
              },
              {
                who: 'Import / Export',
                title: 'Βρείτε εμπορικούς εταίρους ανά κλάδο.',
                body: 'Αναζητήστε προμηθευτές, διανομείς ή αγοραστές σε συγκεκριμένο νομό ή κλάδο ΚΑΔ. Πλήρη στοιχεία επικοινωνίας.',
                points: ['10K+ κλάδοι ΚΑΔ', '56 νομοί', 'Φίλτρα νομικής μορφής'],
                icon: 'table' as const,
              },
            ].map((c, i) => (
              <div key={i} className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Για {c.who}
                </span>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.3 }}>
                  {c.title}
                </h3>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  {c.body}
                </p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {c.points.map(pt => (
                    <li key={pt} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
                      <span style={{
                        width: 14, height: 14, borderRadius: 7,
                        background: 'var(--gemi-bg)', color: 'var(--gemi-text)',
                        border: '0.5px solid var(--gemi-border)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, marginTop: 1,
                      }}>
                        <Icon name="check" size={9} stroke={2.4} />
                      </span>
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTORS TEASER ─────────────────────────────────── */}
      <section style={{
        padding: '60px 28px',
        background: 'var(--app-bg)',
        borderTop: '0.5px solid var(--border)',
        borderBottom: '0.5px solid var(--border)',
      }}>
        <div className="hp-container">
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
            <div style={{ maxWidth: 560 }}>
              <div style={{ fontSize: 11, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, fontWeight: 500 }}>
                Κάθε κλάδος της ελληνικής οικονομίας
              </div>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                Macro μάτια. Drill σε κάθε κλάδο.
              </h2>
            </div>
            <Link href="/search" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              Εξερευνήστε κλάδους
              <Icon name="arrow-up-right" size={12} />
            </Link>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', padding: '8px 12px 8px 18px', borderBottom: '0.5px solid var(--border)', background: '#FAFAF7', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Κλάδος
                  </th>
                  <th style={{ textAlign: 'right', fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', padding: '8px 18px 8px 12px', borderBottom: '0.5px solid var(--border)', background: '#FAFAF7', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Εταιρείες
                  </th>
                </tr>
              </thead>
              <tbody>
                {SECTORS.map((s, i) => (
                  <tr key={s.label} style={{ borderTop: i === 0 ? 'none' : '0.5px solid var(--row-divider)', cursor: 'pointer' }}>
                    <td style={{ padding: '10px 12px 10px 18px', fontWeight: 500, fontSize: 13 }}>{s.label}</td>
                    <td style={{ textAlign: 'right', padding: '10px 18px 10px 12px' }} className="mono">{fmtInt(s.companies)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── CUSTOMERS STRIP ────────────────────────────────── */}
      <section style={{ padding: '60px 28px' }}>
        <div className="hp-container">
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Εμπιστεύονται μας ήδη sales, research και advisory teams
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14 }}>
            {['Marathon Ventures', 'Olympus Capital', 'Aegean Partners', 'Hellenic Advisory', 'Kyklades Group', 'Piraeus M&A'].map((c, i) => (
              <div key={i} style={{
                height: 56,
                border: '0.5px solid var(--border)',
                borderRadius: 8,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: '#fff',
                color: 'var(--text-secondary)',
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.02em',
                padding: '0 10px',
                textAlign: 'center',
                lineHeight: 1.2,
              }}>
                {c}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING TEASER ─────────────────────────────────── */}
      <section style={{
        padding: '60px 28px',
        background: 'var(--app-bg)',
        borderTop: '0.5px solid var(--border)',
        borderBottom: '0.5px solid var(--border)',
      }}>
        <div className="hp-container">
          <div style={{ maxWidth: 680 }}>
            <div style={{ fontSize: 11, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, fontWeight: 500 }}>
              Τιμολόγηση
            </div>
            <h2 style={{ margin: 0, fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Πληρώστε για credits, όχι για άδειες που δεν χρησιμοποιείτε.
            </h2>
            <p style={{ margin: '12px 0 0', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55, maxWidth: 580 }}>
              Κάθε πλάνο περιλαμβάνει πλήρη πρόσβαση στο μητρώο. Τα πληρωμένα πλάνα προσθέτουν email, τηλέφωνο και μεγαλύτερο όγκο εξαγωγών.
            </p>
          </div>

          <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {[
              { name: 'Free',       price: '€0',    note: '/ μήνα',        blurb: '25 εξαγωγές το μήνα, για πάντα.', cta: 'Ξεκινήστε δωρεάν', primary: false, highlight: false },
              { name: 'Pro',        price: '€49',   note: '/ χρήστη / μήνα', blurb: 'Επαληθευμένες επαφές + 1.000 credits / μήνα.', cta: 'Δοκιμή 14 ημερών', primary: true,  highlight: true  },
              { name: 'Enterprise', price: 'Custom', note: '',              blurb: 'Volume credits, SSO, REST API.', cta: 'Επικοινωνήστε μαζί μας', primary: false, highlight: false },
            ].map(p => (
              <div key={p.name} className="card" style={{
                padding: 22, display: 'flex', flexDirection: 'column', gap: 12,
                borderColor: p.highlight ? 'var(--accent)' : 'var(--border)',
                borderWidth: p.highlight ? '1px' : '0.5px',
                position: 'relative',
              }}>
                {p.highlight && (
                  <span style={{
                    position: 'absolute', top: -10, left: 18,
                    background: 'var(--accent)', color: '#fff',
                    fontSize: 10, fontWeight: 500,
                    padding: '3px 9px', borderRadius: 4,
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>
                    Πιο δημοφιλές
                  </span>
                )}
                <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span className="mono" style={{ fontSize: 28, fontWeight: 500 }}>{p.price}</span>
                  {p.note && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.note}</span>}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, minHeight: 36 }}>
                  {p.blurb}
                </div>
                <Link href="/search" className={`btn ${p.primary ? 'btn-primary' : 'btn-secondary'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Link href="/pricing" style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              Δείτε πλήρη σύγκριση λειτουργιών →
            </Link>
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ─────────────────────────────────────── */}
      <section style={{ padding: '80px 28px' }}>
        <div className="hp-container">
          <div style={{
            background: 'var(--nav-bg)',
            borderRadius: 12,
            padding: '56px 48px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{ maxWidth: 560, position: 'relative', zIndex: 2 }}>
              <span style={{ fontSize: 11, color: 'rgba(232,237,245,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Ξεκινήστε δωρεάν
              </span>
              <h2 style={{
                margin: '10px 0 14px',
                fontSize: 32, fontWeight: 600,
                color: 'var(--nav-text-active)',
                letterSpacing: '-0.02em', lineHeight: 1.15,
              }}>
                Τα επόμενα 25 leads σας είναι μια αναζήτηση μακριά.
              </h2>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--nav-text-muted)', lineHeight: 1.55 }}>
                Δημιουργήστε λογαριασμό, κάντε αναζήτηση χωρίς περιορισμό και εξάγετε τις πρώτες 25 εταιρείες — κάθε μήνα, δωρεάν.
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
                <Link href="/search" style={{
                  background: '#fff', color: 'var(--nav-bg)', fontWeight: 500,
                  height: 38, padding: '0 18px',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  borderRadius: 6, fontSize: 13, border: 'none',
                  textDecoration: 'none',
                }}>
                  Δωρεάν λογαριασμός
                  <Icon name="arrow-up-right" size={13} />
                </Link>
                <Link href="/pricing" style={{
                  background: 'transparent', color: 'var(--nav-text-active)',
                  border: '0.5px solid rgba(232,237,245,0.24)',
                  height: 38, padding: '0 18px',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  borderRadius: 6, fontSize: 13, textDecoration: 'none',
                }}>
                  Δείτε τιμολόγηση
                </Link>
              </div>
            </div>

            {/* Decorative geometric grid */}
            <div style={{
              position: 'absolute', right: -40, top: -40, bottom: -40,
              width: 380, opacity: 0.18, pointerEvents: 'none',
            }}>
              <svg width="100%" height="100%" viewBox="0 0 380 380" fill="none">
                {Array.from({ length: 12 }).map((_, i) =>
                  Array.from({ length: 12 }).map((__, j) => (
                    <rect
                      key={`${i}-${j}`}
                      x={i * 32 + 2} y={j * 32 + 2}
                      width={28} height={28}
                      stroke="#8FA3BC" strokeWidth="0.5"
                      fill={(i + j) % 7 === 0 ? '#2563A8' : 'transparent'}
                      fillOpacity={(i + j) % 7 === 0 ? 0.6 : 0}
                    />
                  ))
                )}
              </svg>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
