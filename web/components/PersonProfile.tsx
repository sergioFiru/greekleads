'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { PersonProfile, CompanyRow, ContactSignal } from '@/app/api/people/[slug]/route'

// ── Helpers ────────────────────────────────────────────────────

const TINTS = [
  { bg: '#EEF1F5', fg: '#1A2332' },
  { bg: '#EEF4FF', fg: '#1A4A8A' },
  { bg: '#EAF3EE', fg: '#1F5C42' },
  { bg: '#F4F1E8', fg: '#5F4A1E' },
  { bg: '#F1F0EA', fg: '#3D3527' },
]

function personTint(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return TINTS[h % TINTS.length]
}

function personInitials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

function parseYear(d: unknown): number | null {
  if (!d) return null
  if (d instanceof Date) return d.getFullYear()
  const y = parseInt(String(d).slice(0, 4))
  return isNaN(y) ? null : y
}

function fmtPeriodPart(d: unknown): string {
  if (!d) return '?'
  if (d instanceof Date) return d.toISOString().slice(0, 7)
  return String(d).slice(0, 7)
}

function formatPeriod(from: unknown, to: unknown): string {
  return `${fmtPeriodPart(from)} → ${to ? fmtPeriodPart(to) : 'σήμερα'}`
}

// Infer role type from category/role strings for timeline coloring
function getRoleType(category: string | null, role: string | null): string {
  const cat = (category ?? '').toLowerCase()
  const r = (role ?? '').toLowerCase()
  if (cat.includes('εταιρ') || r.includes('εταιρ') || r.includes('μέτοχ') || r.includes('μετοχ')) return 'shareholder'
  if (cat.includes('ιδρυτ') || r.includes('ιδρυτ')) return 'founder'
  if (cat.includes('νομ') || r.includes('νόμιμ') || r.includes('νομιμ') || r.includes('εκπρόσωπ') || r.includes('εκπροσωπ')) return 'legal'
  if (cat.includes('μελ') || cat.includes('πρόεδρ') || cat.includes('προεδρ') || cat.includes('αντ') || r.includes('μέλος') || r.includes('μελος') || r.includes('πρόεδρ') || r.includes('προεδρ')) return 'board'
  return 'officer'
}

const ROLE_STYLES: Record<string, { bar: string; label: string }> = {
  officer:     { bar: '#2563A8', label: 'Στέλεχος' },
  board:       { bar: '#64748B', label: 'ΔΣ' },
  shareholder: { bar: '#8A5A00', label: 'Εταίρος' },
  founder:     { bar: '#0A6640', label: 'Ιδρυτής' },
  legal:       { bar: '#64748B', label: 'Εκπρόσωπος' },
}

const STATUS_DOT: Record<string, string> = {
  active:  '#0A6640',
  default: '#B42318',
}

const NOW_YEAR = new Date().getFullYear()

// ── Avatar ─────────────────────────────────────────────────────

function PersonAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const t = personTint(name)
  const radius = size <= 34 ? 6 : size <= 50 ? 8 : 10
  return (
    <span style={{
      width: size, height: size, borderRadius: radius,
      background: t.bg, color: t.fg,
      border: '0.5px solid var(--border)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size <= 34 ? 11 : size <= 50 ? 16 : 22,
      fontWeight: 700, flexShrink: 0, letterSpacing: '0.02em',
    }}>
      {personInitials(name)}
    </span>
  )
}

// ── Company logo initial (same style as company page) ──────────

const LOGO_COLORS = [
  { bg: '#EEF4FF', fg: '#1A4A8A', border: '#C0D0E8' },
  { bg: '#F1F0EA', fg: '#3D3527', border: '#D7D2C0' },
  { bg: '#EAF3EE', fg: '#1F5C42', border: '#B6D4C2' },
  { bg: '#F5EEEA', fg: '#7A3826', border: '#E0CCBE' },
  { bg: '#EEEEF5', fg: '#3D3A6E', border: '#C5C3DC' },
  { bg: '#F4F1E8', fg: '#5F4A1E', border: '#DAD0A8' },
]
function coLogoColor(ar_gemi: string) {
  let h = 0
  for (const c of ar_gemi) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return LOGO_COLORS[h % LOGO_COLORS.length]
}
function coInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(w => w.length > 1)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// ── Timeline ───────────────────────────────────────────────────

function RoleTimeline({ companies }: { companies: CompanyRow[] }) {
  const years = companies.map(c => parseYear(c.dt_from)).filter((y): y is number => y !== null)
  if (!years.length) return null

  const firstYear = Math.min(...years)
  const start = Math.floor(firstYear / 5) * 5
  const end = NOW_YEAR
  const span = Math.max(1, end - start)

  const ticks: number[] = []
  for (let y = start; y <= end; y += 5) ticks.push(y)
  if (ticks[ticks.length - 1] !== end) ticks.push(end)

  const pct = (year: number) => ((year - start) / span) * 100

  const LABEL_W = 188

  const ordered = [...companies].sort((a, b) => {
    const ay = parseYear(a.dt_from) ?? 0
    const by = parseYear(b.dt_from) ?? 0
    return ay - by
  })

  return (
    <div>
      {/* Year axis */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ width: LABEL_W, flexShrink: 0 }} />
        <div style={{ flex: 1, position: 'relative', height: 16 }}>
          {ticks.map(t => (
            <span key={t} style={{
              position: 'absolute', left: `${pct(t)}%`, transform: 'translateX(-50%)',
              fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
            }}>
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Rows */}
      <div style={{ position: 'relative' }}>
        {/* Vertical gridlines */}
        <div style={{ position: 'absolute', left: LABEL_W, right: 0, top: 0, bottom: 0, pointerEvents: 'none' }}>
          {ticks.map(t => (
            <span key={t} style={{
              position: 'absolute', left: `${pct(t)}%`, top: 0, bottom: 0,
              width: '0.5px', background: 'var(--row-divider)',
            }} />
          ))}
        </div>

        {ordered.map((c, i) => {
          const from = parseYear(c.dt_from) ?? start
          const to = c.dt_to ? (parseYear(c.dt_to) ?? end) : end
          const isActive = !c.dt_to
          const left = pct(from)
          const width = Math.max(1.5, pct(to) - left)
          const roleType = getRoleType(c.category, c.role)
          const rs = ROLE_STYLES[roleType] ?? ROLE_STYLES.officer
          const statusDot = isActive ? STATUS_DOT.active : STATUS_DOT.default

          return (
            <div key={`${c.ar_gemi}-${i}`} style={{ display: 'flex', alignItems: 'center', height: 34 }}>
              {/* Label */}
              <Link
                href={`/etaireies/${c.ar_gemi}`}
                style={{
                  width: LABEL_W, flexShrink: 0, paddingRight: 12,
                  display: 'flex', alignItems: 'center', gap: 7,
                  minWidth: 0, textDecoration: 'none',
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 3, background: statusDot, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.co_name_el}
                </span>
              </Link>

              {/* Track */}
              <div style={{ flex: 1, position: 'relative', height: '100%' }}>
                <div
                  title={`${c.role ?? ''} · ${fmtPeriodPart(c.dt_from)} – ${c.dt_to ? fmtPeriodPart(c.dt_to) : 'σήμερα'}${c.percentage ? ` · ${stripPct(c.percentage)}%` : ''}`}
                  style={{
                    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                    left: `${left}%`, width: `${width}%`,
                    height: 18, borderRadius: 4,
                    background: isActive ? rs.bar : '#CFD6DE',
                    opacity: isActive ? 1 : 0.85,
                    display: 'flex', alignItems: 'center',
                    paddingInline: 8, gap: 6,
                    overflow: 'hidden',
                    border: isActive ? 'none' : '0.5px solid #BFC7D0',
                  }}
                >
                  <span style={{ fontSize: 10.5, fontWeight: 500, color: isActive ? '#fff' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {rs.label}
                  </span>
                  {c.percentage && Number(width) > 14 && (
                    <span style={{ fontSize: 10, color: isActive ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
                      {stripPct(c.percentage)}%
                    </span>
                  )}
                  {isActive && (
                    <span style={{ marginLeft: 'auto', fontSize: 9.5, color: 'rgba(255,255,255,0.9)', whiteSpace: 'nowrap' }}>→ now</span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Connection table row ───────────────────────────────────────

function stripPct(v: string | null): string | null {
  return v ? String(v).replace(/%/g, '').trim() : null
}

function ConnectionRow({ c }: { c: CompanyRow }) {
  const lc = coLogoColor(c.ar_gemi)
  const isActive = !c.dt_to
  const isCoActive = c.status_descr?.toLowerCase().includes('ενεργ')
  const roleType = getRoleType(c.category, c.role)
  const rs = ROLE_STYLES[roleType] ?? ROLE_STYLES.officer
  const pct = stripPct(c.percentage)

  return (
    <tr>
      <td style={{ paddingLeft: 20 }}>
        <Link href={`/etaireies/${c.ar_gemi}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6, flexShrink: 0,
            background: lc.bg, color: lc.fg, border: `1px solid ${lc.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, letterSpacing: '-0.02em',
          }}>
            {coInitials(c.co_name_el ?? c.ar_gemi)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.co_name_el}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
              {[c.legal_type_descr, c.city ?? c.municipality_descr ?? c.prefecture_descr].filter(Boolean).join(' · ')}
            </div>
          </div>
        </Link>
      </td>
      <td style={{ maxWidth: 180 }}>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
          background: isActive ? 'rgba(37,99,168,0.1)' : 'var(--surface-subtle)',
          color: isActive ? rs.bar : 'var(--text-muted)',
          border: `0.5px solid ${isActive ? 'rgba(37,99,168,0.2)' : 'var(--border)'}`,
          display: 'inline-block', maxWidth: '100%',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }} title={c.role ?? c.category ?? undefined}>
          {c.role ?? c.category ?? '—'}
        </span>
      </td>
      <td style={{ textAlign: 'right' }}>
        {pct ? (
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            <span style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{pct}%</span>
            <span style={{ width: 56, height: 3, background: 'var(--surface-subtle)', borderRadius: 2, overflow: 'hidden', display: 'block' }}>
              <span style={{ display: 'block', width: `${Math.min(100, Number(pct))}%`, height: '100%', background: 'var(--accent)' }} />
            </span>
          </div>
        ) : <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>—</span>}
      </td>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
        {formatPeriod(c.dt_from, c.dt_to)}
      </td>
      <td>
        {isActive
          ? <span className="badge badge-active"><span style={{ width: 5, height: 5, borderRadius: 3, background: '#0A6640', display: 'inline-block' }} />Ενεργός</span>
          : <span className="badge badge-neutral">Παλαιός</span>}
      </td>
      <td style={{ paddingRight: 20 }}>
        <span className={`badge ${isCoActive ? 'badge-active' : 'badge-neutral'}`}>
          <span style={{ width: 5, height: 5, borderRadius: 3, background: isCoActive ? '#0A6640' : '#B42318', display: 'inline-block' }} />
          {c.status_descr ?? '—'}
        </span>
      </td>
    </tr>
  )
}

// ── Contact Intelligence ───────────────────────────────────────

function ContactIntelligence({ contacts }: { contacts: ContactSignal[] }) {
  if (!contacts.length) return null
  const personal = contacts.filter(c => c.isPersonal)
  const other = contacts.filter(c => !c.isPersonal)

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '14px 20px 12px 20px', borderBottom: '0.5px solid var(--border)' }}>
        <span className="section-label">Contact intelligence</span>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
          Επαφές που εντοπίστηκαν στις εταιρείες αυτού του προσώπου
        </div>
      </div>

      {personal.length > 0 && (
        <div style={{ padding: '16px 20px', borderBottom: '0.5px solid var(--row-divider)', background: 'var(--surface-subtle)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Πιθανώς Προσωπικές ({personal.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {personal.map(c => <ContactRow key={c.value} contact={c} />)}
          </div>
        </div>
      )}

      {other.length > 0 && (
        <div style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Εταιρικές Επαφές ({other.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {other.slice(0, 5).map(c => <ContactRow key={c.value} contact={c} />)}
          </div>
        </div>
      )}
    </div>
  )
}

function ContactRow({ contact }: { contact: ContactSignal }) {
  const isEmail = contact.type === 'email'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 10px',
      background: contact.isPersonal ? 'var(--accent-light)' : 'var(--surface-subtle)',
      border: `0.5px solid ${contact.isPersonal ? 'rgba(37,99,168,0.2)' : 'var(--border)'}`,
      borderRadius: 6,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6,
        background: isEmail ? '#FEF3F2' : '#EAFAF3',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {isEmail ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EA4335" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0A6640" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 11.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l.81-.81a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
          {contact.value}
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, margin: '2px 0 0' }}>
          {contact.companies.slice(0, 2).join(', ')}
          {contact.companies.length > 2 && ` +${contact.companies.length - 2} ακόμα`}
        </p>
      </div>
      {contact.isPersonal && (
        <span style={{
          fontSize: 10.5, fontWeight: 600, color: 'var(--accent)',
          background: 'rgba(37,99,168,0.1)', borderRadius: 4, padding: '2px 6px',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          Πιθανώς προσωπική
        </span>
      )}
    </div>
  )
}

// ── Stat card ──────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ fontFamily: 'var(--font-mono)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────

export default function PersonProfileComponent({ profile }: { profile: PersonProfile }) {
  const [filter, setFilter] = useState<'all' | 'active' | 'past'>('all')

  const { stats, companies, contacts } = profile

  const activeCompanies = companies.filter(c => !c.dt_to)
  const pastCompanies = companies.filter(c => c.dt_to)
  const stakeCompanies = companies.filter(c => c.percentage != null && Number(c.percentage) > 0)

  const prefectures = [...new Set(companies.filter(c => c.prefecture_descr).map(c => c.prefecture_descr!))]

  const firstYear = Math.min(...companies.map(c => parseYear(c.dt_from) ?? NOW_YEAR))

  const timelineRows = companies.filter(c => parseYear(c.dt_from) !== null)

  const shownCompanies =
    filter === 'active' ? activeCompanies :
    filter === 'past'   ? pastCompanies :
    companies

  const sorted = [...shownCompanies].sort((a, b) => {
    if ((!a.dt_to) !== (!b.dt_to)) return a.dt_to ? 1 : -1
    return Number(b.percentage ?? 0) - Number(a.percentage ?? 0)
  })

  return (
    <div style={{ flex: 1, background: 'var(--page-bg)', overflowY: 'auto' }}>

      {/* Breadcrumb bar */}
      <div style={{
        padding: '10px 28px', display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--card-bg)', borderBottom: '0.5px solid var(--border)',
        fontSize: 12, color: 'var(--text-secondary)',
      }}>
        <Link href="/people" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Πρόσωπα</Link>
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
          <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ color: 'var(--text-primary)' }}>{profile.name}</span>
        <div style={{ flex: 1 }} />
        <Link href="/people" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none',
          padding: '4px 10px', borderRadius: 6, border: '0.5px solid var(--border)',
          background: 'var(--surface-subtle)',
        }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Πίσω στην αναζήτηση
        </Link>
      </div>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 28px 60px' }}>

        {/* Header card */}
        <div className="card" style={{ padding: 24, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            <PersonAvatar name={profile.name} size={72} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                <h1 style={{ margin: 0, fontSize: 23, fontWeight: 600, letterSpacing: '-0.01em' }}>{profile.name}</h1>
                <span className="badge badge-gemi">ΓΕΜΗ</span>
                {prefectures.slice(0, 3).map(p => (
                  <span key={p} className="badge badge-neutral" style={{ fontWeight: 400 }}>{p}</span>
                ))}
                {prefectures.length > 3 && <span className="badge badge-neutral">+{prefectures.length - 3}</span>}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 20px', fontSize: 12, color: 'var(--text-secondary)' }}>
                {firstYear < NOW_YEAR && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" /><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1" strokeDasharray="1 2" /></svg>
                    Ενεργός στο ΓΕΜΗ από <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', marginLeft: 3 }}>{firstYear}</span>
                  </span>
                )}
                {activeCompanies.length > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M5 3V2m6 1V2M2 7h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{activeCompanies.length}</span> ενεργοί ρόλοι
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <StatCard label="Σύνολο εταιρειών" value={stats.total} sub="παρελθόν & παρόν" />
          <StatCard label="Ενεργοί ρόλοι" value={stats.active} sub={`${stats.total - stats.active} ολοκληρωμένοι`} />
          <StatCard label="Συμμετοχές" value={stats.stakes} sub="δηλωμένα ποσοστά" />
          <StatCard
            label="Μεγαλύτερη συμμετοχή"
            value={stats.largestStake != null ? `${stats.largestStake}%` : '—'}
            sub="σε μία οντότητα"
          />
        </div>

        {/* Timeline */}
        {timelineRows.length > 0 && (
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ padding: '14px 20px 12px 20px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span className="section-label">Χρονολόγιο εμπλοκής</span>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
                  Ρόλοι σε εταιρείες από <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{firstYear}</span> έως σήμερα
                </div>
              </div>
              {/* Legend */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                  <span style={{ width: 18, height: 8, borderRadius: 3, background: 'var(--accent)', display: 'inline-block' }} />Ενεργός
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                  <span style={{ width: 18, height: 8, borderRadius: 3, background: '#CFD6DE', display: 'inline-block' }} />Παλαιός
                </span>
              </div>
            </div>
            <div style={{ padding: '16px 20px 20px 20px' }}>
              <RoleTimeline companies={timelineRows} />
            </div>
          </div>
        )}

        {/* Contact Intelligence */}
        <ContactIntelligence contacts={contacts} />

        {/* Companies table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px 10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '0.5px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>Εταιρείες</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{shownCompanies.length}</span> εγγραφές
              </span>
            </div>
            {/* Segmented filter */}
            <div style={{ display: 'inline-flex', padding: 2, background: 'var(--surface-subtle)', borderRadius: 7, border: '0.5px solid var(--border)' }}>
              {([
                { id: 'all', label: `Όλες ${companies.length}` },
                { id: 'active', label: `Ενεργές ${activeCompanies.length}` },
                { id: 'past', label: `Παλαιές ${pastCompanies.length}` },
              ] as const).map(f => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  style={{
                    height: 24, padding: '0 12px', border: 'none', borderRadius: 5,
                    background: filter === f.id ? 'var(--card-bg)' : 'transparent',
                    color: filter === f.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    boxShadow: filter === f.id ? '0 0 0 0.5px var(--border)' : 'none',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 20 }}>Εταιρεία</th>
                <th>Ρόλος</th>
                <th style={{ textAlign: 'right' }}>Συμμετοχή</th>
                <th>Περίοδος</th>
                <th>Εμπλοκή</th>
                <th style={{ paddingRight: 20 }}>Κατάσταση εταιρείας</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c, i) => <ConnectionRow key={`${c.ar_gemi}-${i}`} c={c} />)}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: 13 }}>
                    Δεν υπάρχουν εγγραφές
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Attribution */}
        <div style={{
          marginTop: 14, padding: '9px 14px',
          background: 'var(--surface-subtle)', border: '0.5px solid var(--border)', borderRadius: 6,
          fontSize: 11.5, color: 'var(--text-secondary)',
          display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--accent)', marginTop: 1, flexShrink: 0 }}>
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8 7v4M8 5.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span>
            Στοιχεία από αρχεία διορισμών, πρακτικά ΔΣ και δηλώσεις μετόχων του ΓΕΜΗ.
            Τελευταία ενημέρωση <span style={{ fontFamily: 'var(--font-mono)' }}>2026-06-30</span>.
          </span>
        </div>

      </div>
    </div>
  )
}
