export const dynamic = 'force-dynamic'

import Link from 'next/link'
import TopNav from '@/components/TopNav'
import LiveExhibit from '@/components/LiveExhibit'
import Footer from '@/components/Footer'
import Icon from '@/components/Icon'
import HeroSearchBar from '@/components/HeroSearchBar'
import { CountUp } from '@/components/CountUp'
import { queryOne } from '@/lib/db'

async function getTotalCompanies(): Promise<number> {
  try {
    const row = await queryOne<{ total: string }>(
      "SELECT reltuples::bigint AS total FROM pg_class WHERE relname = 'companies'"
    )
    return parseInt(row?.total ?? '0', 10)
  } catch { return 0 }
}

async function getTotalPersonRoles(): Promise<number> {
  try {
    const row = await queryOne<{ total: string }>(
      "SELECT reltuples::bigint AS total FROM pg_class WHERE relname = 'company_persons'"
    )
    return parseInt(row?.total ?? '0', 10)
  } catch { return 0 }
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
  { name: 'Pelagos Maritime Group ΑΕ',  legal: 'ΑΕ',  city: 'Πειραιάς',     year: 2014, email: true,  phone: true,  web: true  },
  { name: 'Helleniq Cloud Systems ΙΚΕ', legal: 'ΙΚΕ', city: 'Αθήνα',        year: 2020, email: true,  phone: false, web: true  },
  { name: 'Mediterra Pharma ΕΠΕ',       legal: 'ΕΠΕ', city: 'Πάτρα',        year: 2009, email: false, phone: true,  web: false },
  { name: 'Aegean Bistro Holdings ΑΕ',  legal: 'ΑΕ',  city: 'Θεσσαλονίκη', year: 2016, email: true,  phone: true,  web: true  },
  { name: 'Kyklades Hospitality ΑΕ',    legal: 'ΑΕ',  city: 'Ηράκλειο',     year: 2007, email: false, phone: true,  web: true  },
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
  const [total, totalRoles] = await Promise.all([getTotalCompanies(), getTotalPersonRoles()])
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

            <div>
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

              <h1 style={{
                margin: 0, fontSize: 64, lineHeight: 1.02,
                letterSpacing: '-0.03em', fontWeight: 600, color: 'var(--text-primary)',
              }}>
                Κάθε ελληνική<br />
                επιχείρηση &amp;<br />
                <span style={{ color: 'var(--accent)' }}>στέλεχος, live.</span>
              </h1>

              <p style={{
                fontSize: 16.5, lineHeight: 1.55, color: 'var(--text-secondary)',
                marginTop: 22, maxWidth: 540,
              }}>
                {fmtTotal} εταιρείες, εκατοντάδες χιλιάδες στελέχη & εταίροι — με ιστορικό ρόλων, επαφές και Scout AI που βρίσκει leads από φυσική γλώσσα.
              </p>

              <HeroSearchBar />

              <div style={{ marginTop: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span className="hp-live-dot" />
                  25 δωρεάν εξαγωγές κάθε μήνα — χωρίς κάρτα
                </span>
                <span style={{ width: 1, height: 12, background: 'var(--border)', display: 'inline-block' }} />
                <Link href="/pricing" style={{ color: 'var(--accent)', fontSize: 12.5, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  Δείτε τιμές <Icon name="chevron-right" size={11} />
                </Link>
              </div>

              <div style={{ marginTop: 30, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Αναζήτηση σε</span>
                {[
                  { l: fmtTotal + ' εταιρείες', icon: 'building' as const },
                  { l: '650K+ στελέχη',          icon: 'users'    as const },
                  { l: '653K emails',             icon: 'mail'     as const },
                  { l: '667K τηλέφωνα',           icon: 'phone'    as const },
                ].map((chip, i) => (
                  <span key={i} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    height: 22, padding: '0 9px', borderRadius: 6,
                    border: '0.5px solid var(--border)', background: '#fff',
                    fontSize: 11.5, color: 'var(--text-primary)',
                  }}>
                    <Icon name={chip.icon} size={11} stroke={1.6} style={{ color: 'var(--text-muted)' }} />
                    {chip.l}
                  </span>
                ))}
              </div>
            </div>

            <div className="hp-crop-wrap">
              <span className="hp-crop-mark hp-crop-tl" />
              <span className="hp-crop-mark hp-crop-tr" />
              <span className="hp-crop-mark hp-crop-bl" />
              <span className="hp-crop-mark hp-crop-br" />

              <div className="hp-social-icon" style={{
                top: 18, right: -52,
                background: 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fd5949 45%, #d6249f 60%, #285AEB 90%)',
                '--fd': '3.4s', '--dl': '0s', '--fr': '-4deg',
              } as React.CSSProperties}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </div>
              <div className="hp-social-icon" style={{
                bottom: 40, right: -52, background: '#0A66C2',
                '--fd': '4.1s', '--dl': '-1.2s', '--fr': '3deg',
              } as React.CSSProperties}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              </div>
              <div className="hp-social-icon" style={{
                top: 50, left: -52, background: '#1877F2',
                '--fd': '3.8s', '--dl': '-0.6s', '--fr': '4deg',
              } as React.CSSProperties}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </div>
              <div className="hp-social-icon" style={{
                bottom: 18, left: -52, background: '#000',
                '--fd': '4.4s', '--dl': '-2s', '--fr': '-3deg',
              } as React.CSSProperties}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </div>

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
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0,
          }}>
            {[
              { raw: total,                 dur: 1600, ft: 'million' as const, label: 'Εγγεγραμμένες εταιρείες', note: '100% ΓΕΜΗ' },
              { raw: totalRoles || 750000,  dur: 1400, ft: 'locale'  as const, label: 'Εγγραφές ρόλων & στελεχών', note: 'Πλήρες ιστορικό' },
              { raw: 653340,                dur: 1200, ft: 'locale'  as const, label: 'Επαληθευμένα emails',       note: 'SMTP verified' },
              { raw: 667195,                dur: 1200, ft: 'locale'  as const, label: 'Αριθμοί τηλεφώνου',         note: 'Carrier verified' },
            ].map((stat, i) => (
              <div key={i} style={{ padding: '0 22px', borderLeft: i === 0 ? 'none' : '0.5px solid var(--border)' }}>
                <div className="mono" style={{ fontSize: 22, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                  <CountUp value={stat.raw} formatType={stat.ft} duration={stat.dur} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{stat.label}</div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{stat.note}</div>
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
              Αναζήτηση εταιρειών
            </div>
            <h2 style={{ margin: 0, fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Ένας πίνακας ερευνητικής ποιότητας, όχι μια λίστα ονομάτων.
            </h2>
            <p style={{ margin: '12px 0 0', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55, maxWidth: 580 }}>
              Φιλτράρετε ολόκληρο το μητρώο ανά τοποθεσία, κλάδο ΚΑΔ, νομική μορφή και κατάσταση. Κάθε εταιρεία ανοίγει σε πλήρες profile.
            </p>
          </div>

          <div style={{
            marginTop: 28, position: 'relative',
            borderRadius: 10, border: '0.5px solid var(--border-strong)',
            background: '#fff', overflow: 'hidden',
            boxShadow: '0 4px 24px rgba(26,35,50,0.04)',
          }}>
            <div style={{
              height: 32, background: '#F2F1ED',
              borderBottom: '0.5px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px',
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

            <div style={{
              padding: '12px 16px', background: '#FAFAF7',
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

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Εταιρεία', 'Enrichment', ''].map((h, i) => (
                    <th key={i} style={{
                      textAlign: i === 2 ? 'right' : 'left',
                      fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)',
                      padding: i === 0 ? '8px 12px 8px 16px' : i === 2 ? '8px 16px 8px 12px' : '8px 12px',
                      borderBottom: '0.5px solid var(--border)',
                      background: '#FAFAF7', textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>{h}</th>
                  ))}
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
                            border: '0.5px solid', display: 'inline-flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: 12, fontWeight: 600, letterSpacing: '0.02em',
                          }}>
                            {initials(c.name)}
                          </span>
                          <div>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>{c.name}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>
                              {c.legal} · {c.city} · <span className="mono">{c.year}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <span className="badge badge-gemi"><Icon name="verified" size={10} stroke={1.6} />ΓΕΜΗ</span>
                          {c.email  && <span className="badge badge-neutral"><Icon name="mail"  size={10} stroke={1.6} /></span>}
                          {c.phone  && <span className="badge badge-neutral"><Icon name="phone" size={10} stroke={1.6} /></span>}
                          {c.web    && <span className="badge badge-neutral"><Icon name="globe" size={10} stroke={1.6} /></span>}
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

            <div style={{
              height: 60, background: 'linear-gradient(to bottom, rgba(255,255,255,0), #fff)',
              marginTop: -60, position: 'relative', pointerEvents: 'none',
            }} />
          </div>

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
            <Link href="/search" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              Ανοίξτε την αναζήτηση <Icon name="arrow-up-right" size={12} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── PEOPLE & NETWORKS ──────────────────────────────── */}
      <section style={{ padding: '80px 28px', background: 'var(--app-bg)', borderTop: '0.5px solid var(--border)', borderBottom: '0.5px solid var(--border)' }}>
        <div className="hp-container">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>

            {/* LEFT — text */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, fontWeight: 500 }}>
                Δίκτυο ανθρώπων
              </div>
              <h2 style={{ margin: 0, fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                Βρείτε το σωστό πρόσωπο,<br />όχι μόνο την εταιρεία.
              </h2>
              <p style={{ margin: '16px 0 0', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Κάθε CEO, Διαχειριστής και εταίρος έχει το δικό του profile — με πλήρες χρονολόγιο ρόλων από κάθε εταιρεία στην οποία εμφανίστηκε, ποσοστά συμμετοχής και contact intelligence.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: '24px 0 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { icon: 'trend-up' as const, text: 'Χρονολόγιο ρόλων — ποιος ήταν πού και πότε' },
                  { icon: 'users'    as const, text: 'Μετοχικό ποσοστό ανά εταιρεία & ρόλο' },
                  { icon: 'mail'     as const, text: 'Contact intelligence από κοινά emails & τηλέφωνα' },
                ].map((pt, i) => (
                  <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, fontSize: 14 }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                      background: '#EEF4FF', color: '#1A4A8A', border: '0.5px solid #C0D0E8',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon name={pt.icon} size={13} stroke={1.6} />
                    </span>
                    <span style={{ paddingTop: 5, color: 'var(--text-primary)' }}>{pt.text}</span>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 28 }}>
                <Link href="/people" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  Αναζητήστε στελέχη <Icon name="arrow-up-right" size={13} />
                </Link>
              </div>
            </div>

            {/* RIGHT — person profile mockup */}
            <div style={{
              borderRadius: 12, border: '0.5px solid var(--border-strong)',
              background: '#fff', overflow: 'hidden',
              boxShadow: '0 4px 28px rgba(26,35,50,0.07)',
            }}>
              {/* Header */}
              <div style={{ padding: '18px 20px 16px', borderBottom: '0.5px solid var(--border)', background: 'var(--app-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 8, flexShrink: 0,
                    background: '#EEF4FF', color: '#1A4A8A', border: '0.5px solid #C0D0E8',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, fontWeight: 600, letterSpacing: '0.04em',
                  }}>ΓΚ</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>ΓΕΩΡΓΙΟΣ ΚΩΝΣΤΑΝΤΙΝΙΔΗΣ</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <span className="badge badge-gemi" style={{ fontSize: 10 }}>ΓΕΜΗ ✓</span>
                      <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>Αθήνα · Ενεργός από 2009</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
                  {[
                    { label: 'Εταιρείες', val: '4' },
                    { label: 'Ενεργοί ρόλοι', val: '2' },
                    { label: 'Μεγ. μετοχή', val: '50%' },
                  ].map((s, i) => (
                    <div key={i} style={{ textAlign: 'center', padding: '8px', background: '#fff', borderRadius: 6, border: '0.5px solid var(--border)' }}>
                      <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)' }}>{s.val}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Gantt timeline */}
              <div style={{ padding: '14px 20px 0' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  Χρονολόγιο ρόλων
                </div>
                {[
                  { label: 'ΑΛΦΑ ΤΕΧΝΟΛΟΓΙΕΣ ΑΕ', left: 0,  width: 100, active: true,  color: '#2563A8', role: 'CEO'          },
                  { label: 'ΒΗΤΑ ΣΥΣΤΗΜΑΤΑ ΕΠΕ',   left: 15, width: 45,  active: false, color: '#CFD6DE', role: 'Εταίρος 50%'  },
                  { label: 'ΓΑΜΑ SOLUTIONS ΙΚΕ',   left: 55, width: 45,  active: true,  color: '#8A5A00', role: 'Εταίρος 25%'  },
                ].map((bar, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 8 }}>
                    <div style={{
                      width: 148, fontSize: 11, color: 'var(--text-secondary)',
                      flexShrink: 0, paddingRight: 10,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {bar.label}
                    </div>
                    <div style={{ flex: 1, height: 20, background: '#F2F1ED', borderRadius: 4, position: 'relative', overflow: 'visible' }}>
                      <div style={{
                        position: 'absolute',
                        left: `${bar.left}%`, width: `${bar.width}%`,
                        top: 0, bottom: 0, background: bar.color,
                        borderRadius: 4, display: 'flex', alignItems: 'center', paddingLeft: 7,
                        overflow: 'hidden',
                      }}>
                        <span style={{ fontSize: 10.5, color: bar.active ? '#fff' : '#6B7280', fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {bar.role}
                        </span>
                        {bar.active && (
                          <span style={{ marginLeft: 'auto', marginRight: 5, fontSize: 9.5, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap' }}>→ now</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', marginLeft: 148, paddingBottom: 12, marginTop: 4 }}>
                  {['2009', '2013', '2017', '2021', '2025'].map((y, i) => (
                    <div key={y} style={{ flex: 1, textAlign: i === 0 ? 'left' : 'center', fontSize: 9.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {y}
                    </div>
                  ))}
                </div>
              </div>

              {/* Contact strip */}
              <div style={{ padding: '10px 20px', background: '#FAFAF7', borderTop: '0.5px solid var(--border)', display: 'flex', gap: 16, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="mail" size={11} stroke={1.6} style={{ color: 'var(--text-muted)' }} />
                  g.konstan…@company.gr
                </span>
                <span style={{ width: 1, height: 12, background: 'var(--border)', display: 'inline-block' }} />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="phone" size={11} stroke={1.6} style={{ color: 'var(--text-muted)' }} />
                  +30 210 123 ••••
                </span>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── SCOUT AI ─────────────────────────────────────────── */}
      <section style={{ padding: '80px 28px', background: 'var(--nav-bg)' }}>
        <div className="hp-container">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>

            {/* LEFT — chat mockup */}
            <div style={{
              borderRadius: 12, border: '0.5px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.04)', overflow: 'hidden',
            }}>
              <div style={{
                padding: '12px 16px', borderBottom: '0.5px solid rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 6, background: 'var(--accent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name="search" size={12} stroke={1.8} style={{ color: '#fff' }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(232,237,245,0.9)' }}>Scout AI</span>
                <span style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'var(--accent)', color: '#fff', letterSpacing: '0.04em', fontWeight: 500 }}>Beta</span>
              </div>

              <div style={{ padding: '16px 16px 0' }}>
                {/* User message */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                  <div style={{
                    maxWidth: '85%', background: 'var(--accent)',
                    borderRadius: '10px 10px 2px 10px', padding: '9px 13px',
                  }}>
                    <div style={{ fontSize: 12.5, color: '#fff', lineHeight: 1.45 }}>
                      βρες τεχνολογικές startup στη Θεσσαλονίκη με επαληθευμένο email
                    </div>
                  </div>
                </div>

                {/* Scout response */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 6, background: 'rgba(255,255,255,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
                  }}>
                    <Icon name="search" size={11} stroke={1.8} style={{ color: 'rgba(232,237,245,0.7)' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11.5, color: 'rgba(232,237,245,0.55)', marginBottom: 8 }}>
                      Εντοπίστηκαν φίλτρα — εφαρμόζω:
                    </div>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
                      {['ΚΑΔ: 62 (Τεχνολογία)', 'Νομός: Θεσσαλονίκης', 'Email: Verified'].map(t => (
                        <span key={t} style={{
                          fontSize: 11, padding: '3px 8px', borderRadius: 4,
                          background: 'rgba(255,255,255,0.07)', color: 'rgba(232,237,245,0.8)',
                          border: '0.5px solid rgba(255,255,255,0.12)',
                        }}>{t}</span>
                      ))}
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(232,237,245,0.9)' }}>
                      Βρέθηκαν <span style={{ color: '#fff', fontWeight: 600 }}>127</span> εταιρείες.
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ padding: '12px 16px 16px' }}>
                <div style={{
                  background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, height: 36, display: 'flex', alignItems: 'center', padding: '0 12px',
                }}>
                  <span style={{ fontSize: 12, color: 'rgba(232,237,245,0.25)' }}>Ρωτήστε τον Scout…</span>
                </div>
              </div>
            </div>

            {/* RIGHT — text */}
            <div>
              <div style={{ fontSize: 11, color: 'rgba(232,237,245,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, fontWeight: 500 }}>
                AI-Powered Search
              </div>
              <h2 style={{ margin: 0, fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2, color: 'var(--nav-text-active)' }}>
                Πληκτρολογήστε.<br />Βρίσκει μόνος.
              </h2>
              <p style={{ margin: '16px 0 0', fontSize: 14, color: 'var(--nav-text-muted)', lineHeight: 1.6 }}>
                Ο Scout AI κατανοεί ελληνικές ερωτήσεις, εξάγει κλάδο, γεωγραφία και κριτήρια εμπλουτισμού — και εφαρμόζει αυτόματα τα σωστά φίλτρα.
              </p>
              <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  '"εστιατόρια με Facebook αλλά χωρίς website"',
                  '"logistics ΑΕ στη Θεσσαλονίκη ιδρύθηκαν μετά το 2015"',
                  '"tech ΙΚΕ στην Αττική με email"',
                ].map((q, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                      background: 'rgba(255,255,255,0.07)', border: '0.5px solid rgba(255,255,255,0.12)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, color: 'rgba(232,237,245,0.4)', fontFamily: 'var(--font-mono)',
                    }}>{i + 1}</span>
                    <span style={{ fontSize: 12.5, color: 'rgba(232,237,245,0.55)', fontStyle: 'italic', lineHeight: 1.4 }}>{q}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 28 }}>
                <Link href="/search" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: '#fff', color: 'var(--nav-bg)', fontWeight: 500,
                  height: 38, padding: '0 18px', borderRadius: 6, fontSize: 13, textDecoration: 'none',
                }}>
                  Δοκιμάστε τον Scout <Icon name="arrow-up-right" size={13} />
                </Link>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── DATA SOURCES ───────────────────────────────────── */}
      <section style={{ padding: '80px 28px', background: 'var(--app-bg)', borderTop: '0.5px solid var(--border)', borderBottom: '0.5px solid var(--border)' }}>
        <div className="hp-container">
          <div style={{ maxWidth: 680, marginBottom: 32 }}>
            <div style={{ fontSize: 11, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, fontWeight: 500 }}>
              Η πηγή των δεδομένων
            </div>
            <h2 style={{ margin: 0, fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Τέσσερις πηγές. Ένα ενοποιημένο αρχείο.
            </h2>
            <p style={{ margin: '12px 0 0', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55, maxWidth: 580 }}>
              Κάθε εγγραφή βασίζεται σε επίσημα δεδομένα μητρώου, εμπλουτισμένα με επαληθευμένες επαφές και — σύντομα — social media presence.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
            {[
              {
                tag: 'Πρωτεύουσα πηγή', tagClass: 'badge-gemi',
                title: 'Μητρώο ΓΕΜΗ',
                desc: 'Ημερήσια ενημέρωση από το Γενικό Εμπορικό Μητρώο — νομική πηγή αλήθειας για κάθε εταιρεία, στελέχη και εταίρους.',
                stats: [{ k: 'Κάλυψη', v: '100%' }, { k: 'Latency', v: '< 24h' }, { k: 'Πεδία', v: '47' }],
                icon: 'verified' as const, soon: false,
              },
              {
                tag: 'Enrichment', tagClass: 'badge-neutral',
                title: 'Email & Τηλέφωνο',
                desc: 'Emails επαληθεύονται μέσω SMTP handshake, τηλέφωνα μέσω carrier lookup. Bounced records αποκλείονται αυτόματα.',
                stats: [{ k: 'Emails', v: '653.340' }, { k: 'Τηλέφωνα', v: '667.195' }, { k: 'Suppression', v: 'Active' }],
                icon: 'mail' as const, soon: false,
              },
              {
                tag: 'Enrichment', tagClass: 'badge-neutral',
                title: 'Web Presence',
                desc: 'Websites κάθε εταιρείας — επαληθευμένα με HTTP check. Φιλτράρετε μόνο εταιρείες με web παρουσία.',
                stats: [{ k: 'Websites', v: '76.220' }, { k: 'Κάλυψη', v: '6%' }, { k: 'Refresh', v: 'Weekly' }],
                icon: 'globe' as const, soon: false,
              },
              {
                tag: 'Έρχεται σύντομα', tagClass: 'badge-neutral',
                title: 'Social Media Enrichment',
                desc: 'Instagram, Facebook, LinkedIn και Twitter/X για κάθε ελληνική εταιρεία. Ψηφιακό αποτύπωμα και social presence — σε production σύντομα.',
                stats: [{ k: 'Instagram', v: '—' }, { k: 'Facebook', v: '—' }, { k: 'LinkedIn', v: '—' }],
                icon: 'users' as const, soon: true,
              },
            ].map((s, i) => (
              <div key={i} className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14, opacity: s.soon ? 0.85 : 1, position: 'relative', overflow: 'hidden' }}>
                {s.soon && (
                  <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, background: 'repeating-linear-gradient(-45deg, transparent, transparent 6px, rgba(0,0,0,0.015) 6px, rgba(0,0,0,0.015) 12px)', pointerEvents: 'none' }} />
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className={`badge ${s.tagClass}`} style={s.soon ? { background: '#F5F0E8', color: '#7A5C1E', borderColor: '#E0D0A8' } : {}}>
                    {s.soon && '⚡ '}{s.tag}
                  </span>
                  {s.soon ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[
                        { bg: 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fd5949 45%, #d6249f 60%, #285AEB 90%)' },
                        { bg: '#1877F2' },
                        { bg: '#0A66C2' },
                        { bg: '#000' },
                      ].map((icon, j) => (
                        <span key={j} style={{
                          width: 22, height: 22, borderRadius: 5, background: icon.bg,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          opacity: 0.5,
                        }} />
                      ))}
                    </div>
                  ) : (
                    <span style={{
                      width: 28, height: 28, borderRadius: 6,
                      background: '#F2F1ED', color: 'var(--text-secondary)',
                      border: '0.5px solid var(--border)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon name={s.icon} size={14} stroke={1.6} />
                    </span>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{s.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{s.desc}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: '0.5px solid var(--row-divider)', paddingTop: 12 }}>
                  {s.stats.map((st, j) => (
                    <div key={j} style={{ borderLeft: j === 0 ? 'none' : '0.5px solid var(--row-divider)', paddingLeft: j === 0 ? 0 : 12 }}>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{st.k}</div>
                      <div className="mono" style={{ fontSize: 13, fontWeight: 500, color: s.soon ? 'var(--text-muted)' : 'var(--text-primary)', marginTop: 3 }}>{st.v}</div>
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
          <div style={{ maxWidth: 680, marginBottom: 32 }}>
            <div style={{ fontSize: 11, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, fontWeight: 500 }}>
              Για ποιους είναι
            </div>
            <h2 style={{ margin: 0, fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Μία πλατφόρμα. Τρεις δουλειές.
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {[
              {
                who: 'Sales teams',
                title: 'Χτίστε prospect lists χωρίς εικασίες.',
                body: 'Κόψτε την ελληνική αγορά ανά κλάδο, μέγεθος και γεωγραφία. Βρείτε τον υπεύθυνο αποφάσεων και εξάγετε στο CRM σας σε ένα κλικ.',
                points: ['Λίστες ανά κλάδο & νομό', 'Profiles στελεχών & CEOs', 'CSV για HubSpot / Salesforce'],
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
                body: 'Αναζητήστε προμηθευτές, διανομείς ή αγοραστές σε συγκεκριμένο νομό ή κλάδο ΚΑΔ με πλήρη στοιχεία επικοινωνίας.',
                points: ['10K+ κλάδοι ΚΑΔ', '56 νομοί', 'Φίλτρα νομικής μορφής'],
                icon: 'table' as const,
              },
            ].map((c, i) => (
              <div key={i} className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Για {c.who}</span>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.3 }}>{c.title}</h3>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{c.body}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {c.points.map(pt => (
                    <li key={pt} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
                      <span style={{
                        width: 14, height: 14, borderRadius: 7,
                        background: 'var(--gemi-bg)', color: 'var(--gemi-text)', border: '0.5px solid var(--gemi-border)',
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
      <section style={{ padding: '60px 28px', background: 'var(--app-bg)', borderTop: '0.5px solid var(--border)', borderBottom: '0.5px solid var(--border)' }}>
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
              Εξερευνήστε κλάδους <Icon name="arrow-up-right" size={12} />
            </Link>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Κλάδος', 'Εταιρείες'].map((h, i) => (
                    <th key={i} style={{
                      textAlign: i === 0 ? 'left' : 'right',
                      fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)',
                      padding: i === 0 ? '8px 12px 8px 18px' : '8px 18px 8px 12px',
                      borderBottom: '0.5px solid var(--border)', background: '#FAFAF7',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>{h}</th>
                  ))}
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

      {/* ── PRICING TEASER ─────────────────────────────────── */}
      <section style={{ padding: '80px 28px' }}>
        <div className="hp-container">
          <div style={{ maxWidth: 680, marginBottom: 28 }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {[
              { name: 'Free',       price: '€0',    note: '/ μήνα',            blurb: '25 εξαγωγές το μήνα, για πάντα.', cta: 'Ξεκινήστε δωρεάν',       primary: false, highlight: false },
              { name: 'Pro',        price: '€49',   note: '/ χρήστη / μήνα',   blurb: 'Επαληθευμένες επαφές + 1.000 credits / μήνα.', cta: 'Δοκιμή 14 ημερών', primary: true, highlight: true },
              { name: 'Enterprise', price: 'Custom', note: '',                  blurb: 'Volume credits, SSO, REST API.',   cta: 'Επικοινωνήστε μαζί μας', primary: false, highlight: false },
            ].map(p => (
              <div key={p.name} className="card" style={{
                padding: 22, display: 'flex', flexDirection: 'column', gap: 12,
                borderColor: p.highlight ? 'var(--accent)' : 'var(--border)',
                borderWidth: p.highlight ? '1px' : '0.5px', position: 'relative',
              }}>
                {p.highlight && (
                  <span style={{
                    position: 'absolute', top: -10, left: 18,
                    background: 'var(--accent)', color: '#fff',
                    fontSize: 10, fontWeight: 500, padding: '3px 9px',
                    borderRadius: 4, letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>Πιο δημοφιλές</span>
                )}
                <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span className="mono" style={{ fontSize: 28, fontWeight: 500 }}>{p.price}</span>
                  {p.note && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.note}</span>}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, minHeight: 36 }}>{p.blurb}</div>
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
      <section style={{ padding: '0 28px 80px' }}>
        <div className="hp-container">
          <div style={{
            background: 'var(--nav-bg)', borderRadius: 12,
            padding: '56px 48px', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ maxWidth: 560, position: 'relative', zIndex: 2 }}>
              <span style={{ fontSize: 11, color: 'rgba(232,237,245,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Ξεκινήστε δωρεάν
              </span>
              <h2 style={{
                margin: '10px 0 14px', fontSize: 32, fontWeight: 600,
                color: 'var(--nav-text-active)', letterSpacing: '-0.02em', lineHeight: 1.15,
              }}>
                Τα επόμενα 25 leads σας είναι μια αναζήτηση μακριά.
              </h2>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--nav-text-muted)', lineHeight: 1.55 }}>
                Δημιουργήστε λογαριασμό, αναζητήστε χωρίς περιορισμό και εξάγετε τις πρώτες 25 εταιρείες κάθε μήνα — δωρεάν.
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
                <Link href="/search" style={{
                  background: '#fff', color: 'var(--nav-bg)', fontWeight: 500,
                  height: 38, padding: '0 18px',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  borderRadius: 6, fontSize: 13, textDecoration: 'none',
                }}>
                  Δωρεάν λογαριασμός <Icon name="arrow-up-right" size={13} />
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
