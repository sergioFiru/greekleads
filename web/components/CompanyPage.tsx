'use client'
import { useState } from 'react'
import Link from 'next/link'
import KadDonut from './KadDonut'
import CompanyNetworkGraph from './CompanyNetworkGraph'

// ── Types ──────────────────────────────────────────────────────

interface KadActivity {
  dtTo: string | null
  dtFrom: string | null
  type: string
  activity: {
    id: string
    descr: string
    kadVersion: string
  }
}

interface CapitalEntry {
  currency: string
  capitalStock: number
}

export interface CompanyData {
  ar_gemi: string
  afm: string | null
  co_name_el: string | null
  co_names_en: string[] | null
  objective: string | null
  city: string | null
  street: string | null
  street_number: string | null
  zip_code: string | null
  municipality_descr: string | null
  prefecture_descr: string | null
  email: string | null
  phone: string | null
  fax: string | null
  url: string | null
  legal_type_descr: string | null
  gemi_office_descr: string | null
  status_descr: string | null
  is_branch: boolean | null
  incorporation_date: string | null
  activities: KadActivity[] | null
  capital: CapitalEntry[] | null
  linkedin_url: string | null
  instagram_url: string | null
  facebook_url: string | null
  twitter_url: string | null
  tiktok_url: string | null
  youtube_url: string | null
  primary_kad: string | null
}

export interface PersonRow {
  id: number
  ar_gemi: string
  person_name: string
  role: string | null
  category: string | null
  dt_from: string | null
  dt_to: string | null
  percentage: string | null
  is_rep_alone: boolean
  is_rep_in_common: boolean
}

export interface SimilarCompany {
  ar_gemi: string
  co_name_el: string | null
  legal_type_descr: string | null
  city: string | null
  prefecture_descr: string | null
  primary_kad: string | null
  email: string | null
  phone: string | null
  url: string | null
}

// ── Helpers ────────────────────────────────────────────────────

const LOGO_COLORS = [
  { bg: '#EEF4FF', fg: '#1A4A8A', border: '#C0D0E8' },
  { bg: '#F1F0EA', fg: '#3D3527', border: '#D7D2C0' },
  { bg: '#EAF3EE', fg: '#1F5C42', border: '#B6D4C2' },
  { bg: '#F5EEEA', fg: '#7A3826', border: '#E0CCBE' },
  { bg: '#EEEEF5', fg: '#3D3A6E', border: '#C5C3DC' },
  { bg: '#F4F1E8', fg: '#5F4A1E', border: '#DAD0A8' },
]

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(w => w.length > 1)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function logoColor(id: string) {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return LOGO_COLORS[h % LOGO_COLORS.length]
}

function formatDate(s: string | null): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch { return s }
}

function formatYear(s: string | null): string {
  return s ? s.slice(0, 4) : '—'
}

function formatCapital(capital: CapitalEntry[] | null): string | null {
  if (!capital?.length) return null
  const { capitalStock } = capital[0]
  if (!capitalStock) return null
  return `€${new Intl.NumberFormat('el-GR').format(capitalStock)}`
}

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

function ensureHttp(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

function buildAddress(c: CompanyData): string | null {
  const parts: string[] = []
  if (c.street) parts.push(`${c.street}${c.street_number ? ' ' + c.street_number : ''}`)
  const cityLine = [c.zip_code, c.city].filter(Boolean).join(' ')
  if (cityLine) parts.push(cityLine)
  if (c.prefecture_descr) parts.push(c.prefecture_descr)
  return parts.length ? parts.join(', ') : null
}

function yearsInOperation(date: string | null): string | null {
  if (!date) return null
  const y = new Date().getFullYear() - parseInt(date.slice(0, 4))
  return y > 0 ? `${y} χρόνια` : null
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  main: 'Κύρια',
  secondary: 'Δευτερεύουσα',
  old_main: 'Πρώην Κύρια',
  old_secondary: 'Πρώην Δευτερεύουσα',
}

const SOCIALS = [
  { key: 'linkedin_url' as const, label: 'LinkedIn' },
  { key: 'instagram_url' as const, label: 'Instagram' },
  { key: 'facebook_url' as const, label: 'Facebook' },
  { key: 'twitter_url' as const, label: 'Twitter / X' },
  { key: 'tiktok_url' as const, label: 'TikTok' },
  { key: 'youtube_url' as const, label: 'YouTube' },
]

// ── KvRow ──────────────────────────────────────────────────────

function KvRow({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  if (!children) return null
  return (
    <div className="kv-row">
      <span className="kv-key">{label}</span>
      <span className="kv-val" style={mono ? { fontFamily: 'var(--font-mono)', fontSize: 12 } : undefined}>
        {children}
      </span>
    </div>
  )
}

// ── Overview ───────────────────────────────────────────────────

function OverviewTab({
  company,
  persons,
  similar,
  activities,
}: {
  company: CompanyData
  persons: PersonRow[]
  similar: SimilarCompany[]
  activities: KadActivity[]
}) {
  const [objectiveExpanded, setObjectiveExpanded] = useState(false)
  const address = buildAddress(company)
  const capital = formatCapital(company.capital)
  const isActive = company.status_descr?.toLowerCase().includes('ενεργ')
  const activePeople = persons.filter(p => !p.dt_to)
  const activeSocials = SOCIALS.filter(s => company[s.key])
  const mainActivity = activities.find(a => a.type === 'main')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <div className="stat-card">
          <div className="stat-label">Κεφάλαιο</div>
          <div className="stat-value" style={{ fontSize: capital ? 20 : 16, fontFamily: capital ? 'var(--font-mono)' : undefined }}>
            {capital ?? '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ενεργά στελέχη</div>
          <div className="stat-value">{activePeople.length || '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Δραστηριότητες</div>
          <div className="stat-value">{activities.length || '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Χρόνια λειτουργίας</div>
          <div className="stat-value">{yearsInOperation(company.incorporation_date) ?? '—'}</div>
        </div>
      </div>

      {/* Two-column content grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12, alignItems: 'start' }}>

        {/* Left */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>

          <div className="card" style={{ padding: '20px 22px' }}>
            <div className="section-label" style={{ marginBottom: 14 }}>Ταυτότητα εταιρείας</div>
            <KvRow label="Νομική μορφή">{company.legal_type_descr}</KvRow>
            <KvRow label="ΓΕΜΗ" mono>{company.ar_gemi}</KvRow>
            <KvRow label="ΑΦΜ" mono>{company.afm}</KvRow>
            {company.is_branch && <KvRow label="Τύπος">Υποκατάστημα</KvRow>}
            <KvRow label="Υπηρεσία ΓΕΜΗ">{company.gemi_office_descr}</KvRow>
          </div>

          <div className="card" style={{ padding: '20px 22px' }}>
            <div className="section-label" style={{ marginBottom: 14 }}>Κατάσταση & Κεφάλαιο</div>
            <KvRow label="Κατάσταση">
              <span className={`badge ${isActive ? 'badge-active' : 'badge-inactive'}`} style={{ fontSize: 11 }}>
                {company.status_descr}
              </span>
            </KvRow>
            <KvRow label="Ίδρυση"><span style={{ whiteSpace: 'nowrap' }}>{company.incorporation_date ? formatDate(company.incorporation_date) : null}</span></KvRow>
            <KvRow label="Κεφάλαιο">{capital}</KvRow>
          </div>

          <div className="card" style={{ padding: '20px 22px' }}>
            <div className="section-label" style={{ marginBottom: 14 }}>Τοποθεσία</div>
            <KvRow label="Διεύθυνση">{address}</KvRow>
            <KvRow label="Δήμος">{company.municipality_descr}</KvRow>
            <KvRow label="Νομός">{company.prefecture_descr}</KvRow>
          </div>

          {mainActivity && (
            <div className="card" style={{ padding: '20px 22px' }}>
              <div className="section-label" style={{ marginBottom: 14 }}>Κύρια δραστηριότητα</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.5, marginBottom: 10 }}>
                {mainActivity.activity.descr}
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-subtle)', padding: '2px 8px', borderRadius: 4, border: '0.5px solid var(--border)' }}>
                ΚΑΔ {mainActivity.activity.id}
              </span>
            </div>
          )}

          {company.objective && (
            <div className="card" style={{ padding: '20px 22px' }}>
              <div className="section-label" style={{ marginBottom: 10 }}>Σκοπός εταιρείας</div>
              <div style={{ position: 'relative', maxHeight: objectiveExpanded ? 'none' : 90, overflow: 'hidden' }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.75, margin: 0 }}>
                  {company.objective}
                </p>
                {!objectiveExpanded && (
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, height: 36,
                    background: 'linear-gradient(to bottom, rgba(255,255,255,0), #fff)',
                    pointerEvents: 'none',
                  }} />
                )}
              </div>
              {company.objective.length > 200 && (
                <button
                  onClick={() => setObjectiveExpanded(x => !x)}
                  style={{
                    marginTop: 6, background: 'none', border: 'none',
                    color: 'var(--accent)', cursor: 'pointer',
                    fontSize: 12, fontWeight: 500, padding: 0, display: 'block',
                  }}
                >
                  {objectiveExpanded ? 'Λιγότερα ↑' : 'Περισσότερα ↓'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>

          <div className="card" style={{ padding: '20px 22px' }}>
            <div className="section-label" style={{ marginBottom: 14 }}>Επικοινωνία</div>
            <KvRow label="Website">
              {company.url
                ? <a href={ensureHttp(company.url)} target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--accent)', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayUrl(company.url)}
                  </a>
                : null}
            </KvRow>
            <KvRow label="Email">
              {company.email
                ? <a href={`mailto:${company.email}`} style={{ color: 'var(--accent)', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{company.email}</a>
                : null}
            </KvRow>
            <KvRow label="Τηλέφωνο">
              {company.phone
                ? <a href={`tel:${company.phone}`} style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>{company.phone}</a>
                : null}
            </KvRow>
            <KvRow label="Φαξ">{company.fax}</KvRow>
            {activeSocials.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="section-label" style={{ marginBottom: 8 }}>Κοινωνικά δίκτυα</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {activeSocials.map(s => (
                    <a key={s.key} href={ensureHttp(company[s.key]!)} target="_blank" rel="noopener noreferrer"
                      className="social-pill">
                      {s.label}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {activePeople.length > 0 && (
            <div className="card" style={{ padding: '20px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                <span className="section-label">Ενεργά στελέχη</span>
                {persons.length > activePeople.length && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{persons.length - activePeople.length} πρώην</span>
                )}
              </div>
              {activePeople.map((p, i) => {
                const lc = logoColor(p.person_name)
                return (
                  <Link key={p.id} href={`/people/${encodeURIComponent(p.person_name)}`}
                    style={{
                      textDecoration: 'none', color: 'inherit',
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 0',
                      borderTop: i > 0 ? '0.5px solid var(--row-divider)' : 'none',
                    }}>
                    <div className="logo-initial lg"
                      style={{ background: lc.bg, color: lc.fg, border: `1px solid ${lc.border}`, flexShrink: 0 }}>
                      {getInitials(p.person_name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{p.person_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                        {[p.role, p.category].filter(Boolean).join(' · ')}
                        {p.percentage ? ` · ${p.percentage}%` : ''}
                      </div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                )
              })}
            </div>
          )}

          {similar.length > 0 && (
            <div className="card" style={{ padding: '20px 22px' }}>
              <div className="section-label" style={{ marginBottom: 14 }}>Παρόμοιες εταιρείες</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {similar.map((c, i) => {
                  const lc = logoColor(c.ar_gemi)
                  return (
                    <Link key={c.ar_gemi} href={`/etaireies/${c.ar_gemi}`}
                      style={{
                        textDecoration: 'none', color: 'inherit',
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 0',
                        borderTop: i > 0 ? '0.5px solid var(--row-divider)' : 'none',
                        minWidth: 0,
                      }}>
                      <div className="logo-initial lg"
                        style={{ background: lc.bg, color: lc.fg, border: `1px solid ${lc.border}`, flexShrink: 0 }}>
                        {getInitials(c.co_name_el ?? c.ar_gemi)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.co_name_el ?? '—'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                          {[c.legal_type_descr, c.city ?? c.prefecture_descr].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        {c.email && <span style={{ fontSize: 10, color: 'var(--active-text)', background: 'var(--active-bg)', border: '0.5px solid var(--active-border)', padding: '1px 5px', borderRadius: 3 }}>Email</span>}
                        {c.phone && <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--surface-subtle)', border: '0.5px solid var(--border)', padding: '1px 5px', borderRadius: 3 }}>Τηλ.</span>}
                        {c.url && <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--surface-subtle)', border: '0.5px solid var(--border)', padding: '1px 5px', borderRadius: 3 }}>Web</span>}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

// ── People Tab ─────────────────────────────────────────────────

function PeopleTable({ rows, title }: { rows: PersonRow[]; title: string }) {
  if (!rows.length) return null
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="section-label" style={{ marginBottom: 10 }}>{title}</div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Ονοματεπώνυμο</th>
              <th>Ρόλος</th>
              <th>Κατηγορία</th>
              <th style={{ textAlign: 'right' }}>Από</th>
              <th style={{ textAlign: 'right' }}>Έως</th>
              <th style={{ textAlign: 'right' }}>%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(p => {
              const lc = logoColor(p.person_name)
              return (
                <tr key={p.id}>
                  <td>
                    <Link href={`/people/${encodeURIComponent(p.person_name)}`}
                      style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="logo-initial lg"
                        style={{ background: lc.bg, color: lc.fg, border: `1px solid ${lc.border}`, flexShrink: 0 }}>
                        {getInitials(p.person_name)}
                      </div>
                      <div>
                        <span style={{ fontWeight: 500, color: 'var(--accent)' }}>{p.person_name}</span>
                        {(p.is_rep_alone || p.is_rep_in_common) && (
                          <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'var(--accent-light)', color: 'var(--accent)' }}>
                            {p.is_rep_alone ? 'Μόνος' : 'Κοινά'}
                          </span>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{p.role ?? '—'}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{p.category ?? '—'}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(p.dt_from)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{p.dt_to ? formatDate(p.dt_to) : '—'}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{p.percentage ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PeopleTab({ persons }: { persons: PersonRow[] }) {
  return (
    <>
      <PeopleTable rows={persons.filter(p => !p.dt_to)} title={`Ενεργά μέλη (${persons.filter(p => !p.dt_to).length})`} />
      <PeopleTable rows={persons.filter(p => p.dt_to)} title={`Πρώην μέλη (${persons.filter(p => p.dt_to).length})`} />
    </>
  )
}

// ── Activities Tab ─────────────────────────────────────────────

function ActivitiesTab({ activities }: { activities: KadActivity[] }) {
  const sorted = [...activities].sort((a, b) => {
    const order = ['main', 'secondary', 'old_main', 'old_secondary']
    return order.indexOf(a.type) - order.indexOf(b.type)
  })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {activities.length >= 2 && (
        <div className="card" style={{ padding: '20px 22px' }}>
          <div className="section-label" style={{ marginBottom: 16 }}>Κατανομή ανά κλάδο</div>
          <KadDonut activities={activities} />
        </div>
      )}
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {sorted.map((act, i) => {
        const isOld = act.type.startsWith('old_')
        const isMain = act.type === 'main'
        return (
          <div key={i} style={{ padding: '16px 22px', borderTop: i > 0 ? '0.5px solid var(--row-divider)' : 'none', opacity: isOld ? 0.6 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, flexShrink: 0, marginTop: 2,
                background: isMain ? 'var(--accent-light)' : 'var(--surface-subtle)',
                color: isMain ? 'var(--accent)' : 'var(--text-muted)',
                border: `0.5px solid ${isMain ? '#C0D0E8' : 'var(--border)'}`,
                textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                {ACTIVITY_TYPE_LABELS[act.type] ?? act.type}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4, lineHeight: 1.4 }}>{act.activity.descr}</div>
                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  <span>ΚΑΔ {act.activity.id}</span>
                  {act.dtFrom && <span>Από {formatDate(act.dtFrom)}</span>}
                  {act.dtTo && <span>Έως {formatDate(act.dtTo)}</span>}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
    </div>
  )
}

// ── Similar Tab ────────────────────────────────────────────────

function SimilarTab({ similar }: { similar: SimilarCompany[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
      {similar.map(c => {
        const lc = logoColor(c.ar_gemi)
        return (
          <Link key={c.ar_gemi} href={`/etaireies/${c.ar_gemi}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 10 }}>
                <div className="logo-initial lg"
                  style={{ background: lc.bg, color: lc.fg, border: `1px solid ${lc.border}`, flexShrink: 0 }}>
                  {getInitials(c.co_name_el ?? c.ar_gemi)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, marginBottom: 3,
                    overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {c.co_name_el ?? '—'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {[c.legal_type_descr, c.city ?? c.prefecture_descr].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {c.email && <span style={{ fontSize: 11, color: 'var(--active-text)', background: 'var(--active-bg)', border: '0.5px solid var(--active-border)', padding: '1px 6px', borderRadius: 3 }}>Email</span>}
                {c.phone && <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-subtle)', border: '0.5px solid var(--border)', padding: '1px 6px', borderRadius: 3 }}>Τηλ.</span>}
                {c.url && <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-subtle)', border: '0.5px solid var(--border)', padding: '1px 6px', borderRadius: 3 }}>Web</span>}
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────

export default function CompanyPage({
  company,
  persons,
  similar,
}: {
  company: CompanyData
  persons: PersonRow[]
  similar: SimilarCompany[]
}) {
  type TabId = 'overview' | 'people' | 'activities' | 'similar' | 'network'
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  const lc = logoColor(company.ar_gemi)
  const initials = getInitials(company.co_name_el ?? company.ar_gemi)
  const activities: KadActivity[] = Array.isArray(company.activities) ? company.activities : []
  const capital = formatCapital(company.capital)
  const isActive = company.status_descr?.toLowerCase().includes('ενεργ')
  const mainActivity = activities.find(a => a.type === 'main')

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: 'Επισκόπηση' },
    ...(persons.length > 0 ? [{ id: 'people' as TabId, label: 'Άνθρωποι', count: persons.length }] : []),
    ...(activities.length > 0 ? [{ id: 'activities' as TabId, label: 'Δραστηριότητες', count: activities.length }] : []),
    ...(similar.length > 0 ? [{ id: 'similar' as TabId, label: 'Παρόμοιες' }] : []),
    ...(persons.length > 0 ? [{ id: 'network' as TabId, label: 'Δίκτυο' }] : []),
  ]

  return (
    <main style={{ flex: 1, background: 'var(--page-bg)', overflowY: 'auto' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 32px 80px' }}>

        {/* Breadcrumb */}
        <div style={{ padding: '14px 0 16px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
          <Link href="/" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Αρχική</Link>
          <span>/</span>
          <Link href="/search" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>Εταιρείες</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-secondary)', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {company.co_name_el ?? company.ar_gemi}
          </span>
        </div>

        {/* Header card — full width */}
        <div className="card" style={{ padding: '26px 30px', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>
            <div className="logo-initial xl"
              style={{ background: lc.bg, color: lc.fg, border: `1.5px solid ${lc.border}`, flexShrink: 0 }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2, margin: 0 }}>
                  {company.co_name_el ?? '—'}
                </h1>
                <span className={`badge ${isActive ? 'badge-active' : 'badge-inactive'}`}>{company.status_descr ?? 'Άγνωστη'}</span>
                {company.legal_type_descr && <span className="badge badge-neutral">{company.legal_type_descr}</span>}
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
                <span className="badge badge-gemi" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                  ΓΕΜΗ {company.ar_gemi}
                </span>
                {company.co_names_en?.length && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    {company.co_names_en.join(' · ')}
                  </span>
                )}
              </div>

              {/* Meta strip */}
              <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                {company.incorporation_date && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Ίδρυση</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{formatYear(company.incorporation_date)}</div>
                  </div>
                )}
                {(company.city ?? company.prefecture_descr) && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Έδρα</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{company.city ?? company.prefecture_descr}</div>
                  </div>
                )}
                {capital && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Κεφάλαιο</div>
                    <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{capital}</div>
                  </div>
                )}
                {mainActivity && (
                  <div style={{ maxWidth: 300 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Δραστηριότητα</div>
                    <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {mainActivity.activity.descr}
                    </div>
                  </div>
                )}
                {company.email && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Email</div>
                    <a href={`mailto:${company.email}`} style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
                      {company.email}
                    </a>
                  </div>
                )}
                {company.phone && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Τηλ.</div>
                    <a href={`tel:${company.phone}`} style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none' }}>
                      {company.phone}
                    </a>
                  </div>
                )}
                {company.url && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Website</div>
                    <a href={ensureHttp(company.url)} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
                      {displayUrl(company.url)}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Body: left nav + right content */}
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>

          {/* ── Left sidebar nav ── */}
          <div style={{ width: 200, flexShrink: 0, position: 'sticky', top: 16 }}>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {tabs.map(tab => {
                const active = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', textAlign: 'left',
                      padding: '9px 14px', borderRadius: 7,
                      background: active ? 'var(--accent-light)' : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: active ? 600 : 400,
                      border: active ? '1px solid #C0D0E8' : '1px solid transparent',
                      cursor: 'pointer', fontSize: 13,
                      transition: 'background .1s, color .1s',
                    }}
                  >
                    <span>{tab.label}</span>
                    {tab.count != null && (
                      <span style={{
                        fontSize: 11, fontWeight: 500,
                        background: active ? 'rgba(26,74,138,0.12)' : 'var(--surface-subtle)',
                        color: active ? 'var(--accent)' : 'var(--text-muted)',
                        border: `0.5px solid ${active ? '#C0D0E8' : 'var(--border)'}`,
                        padding: '1px 6px', borderRadius: 10,
                      }}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                )
              })}
            </nav>
          </div>

          {/* ── Right content ── */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {activeTab === 'overview' && (
              <OverviewTab company={company} persons={persons} similar={similar} activities={activities} />
            )}
            {activeTab === 'people' && <PeopleTab persons={persons} />}
            {activeTab === 'activities' && activities.length > 0 && <ActivitiesTab activities={activities} />}
            {activeTab === 'similar' && <SimilarTab similar={similar} />}
            {activeTab === 'network' && (
              <CompanyNetworkGraph arGemi={company.ar_gemi} companyName={company.co_name_el ?? company.ar_gemi} />
            )}
          </div>

        </div>
      </div>
    </main>
  )
}
