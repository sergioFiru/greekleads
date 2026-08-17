'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import KadDonut from './KadDonut'
import CompanyNetworkGraph from './CompanyNetworkGraph'
import CompanyFavicon from './CompanyFavicon'
import { brandTitles } from '@/lib/brand'

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
  co_titles_el: string[] | null
  co_titles_en: string[] | null
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
  discovered_url: string | null
  website_source: string | null
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
  has_favicon: boolean
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

export interface FinancialYearRow {
  fiscal_year: number
  revenue: number | null
  total_assets: number | null
  equity: number | null
  profit_before_tax: number | null
  net_profit: number | null
}

export interface FinancialsData {
  docs_found: number
  has_failures: boolean
  scanned_at: string | null
  years: FinancialYearRow[]
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

function formatEUR(n: number | null): string {
  if (n == null) return '—'
  return `${new Intl.NumberFormat('el-GR').format(Math.round(n))} €`
}

// Compact axis/bar labels: 5.120.000 → "5,12Μ", 389.000 → "389Κ"
function formatCompact(n: number | null): string {
  if (n == null) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString('el-GR', { maximumFractionDigits: 2 })}Μ`
  if (abs >= 1_000) return `${Math.round(n / 1_000)}Κ`
  return `${Math.round(n)}`
}

function pctDelta(curr: number | null, prev: number | null): number | null {
  if (curr == null || prev == null || prev === 0) return null
  return ((curr - prev) / Math.abs(prev)) * 100
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

// dt_to is a term-end date, not a departure flag — a board member with a
// *future* dt_to (e.g. a 3-year mandate that hasn't expired yet) is still
// serving. Only a dt_to already in the past means "former".
function isPersonActive(p: PersonRow): boolean {
  if (!p.dt_to) return true
  const end = new Date(p.dt_to)
  return isNaN(end.getTime()) || end.getTime() > Date.now()
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
  activities,
}: {
  company: CompanyData
  persons: PersonRow[]
  activities: KadActivity[]
}) {
  const [objectiveExpanded, setObjectiveExpanded] = useState(false)
  const address = buildAddress(company)
  const capital = formatCapital(company.capital)
  const isActive = company.status_descr?.toLowerCase().includes('ενεργ')
  const activePeople = persons.filter(isPersonActive)
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
                : company.discovered_url
                  ? <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, maxWidth: '100%', overflow: 'hidden' }}>
                      <span className="gl-found" style={{ flexShrink: 0 }}><span className="gl-mark">GL</span>βρέθηκε από το GreekLeads</span>
                      <a href={ensureHttp(company.discovered_url)} target="_blank" rel="noopener noreferrer"
                        style={{ color: 'var(--accent)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {displayUrl(company.discovered_url)}
                      </a>
                    </span>
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
                      borderTop: i > 0 ? '1px solid var(--row-divider)' : 'none',
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
  const active = persons.filter(isPersonActive)
  const former = persons.filter(p => !isPersonActive(p))
  return (
    <>
      <PeopleTable rows={active} title={`Ενεργά μέλη (${active.length})`} />
      <PeopleTable rows={former} title={`Πρώην μέλη (${former.length})`} />
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
          <div key={i} style={{ padding: '16px 22px', borderTop: i > 0 ? '1px solid var(--row-divider)' : 'none', opacity: isOld ? 0.6 : 1 }}>
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

// ── Financials Tab ─────────────────────────────────────────────

function sparkPoints(values: (number | null)[]): string | undefined {
  const nums = values.filter((v): v is number => v != null)
  if (nums.length < 2) return undefined
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const range = max - min || 1
  const n = values.length
  const pts: string[] = []
  values.forEach((v, i) => {
    if (v == null) return
    const x = (i / (n - 1)) * 100
    const y = 25 - ((v - min) / range) * 22
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`)
  })
  return pts.length >= 2 ? pts.join(' ') : undefined
}

function FinStatCard({
  label, value, delta, spark, sparkColor,
}: {
  label: string
  value: string
  delta: number | null
  spark?: string
  sparkColor?: string
}) {
  return (
    <div className="stat-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span className="stat-label">{label}</span>
        {delta != null && (
          <span className={`cp-fin-delta ${delta >= 0 ? 'up' : 'down'}`}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString('el-GR', { maximumFractionDigits: 1 })}%
          </span>
        )}
      </div>
      <div className="stat-value" style={{ fontFamily: 'var(--font-mono)' }}>{value}</div>
      {spark && (
        <div className="cp-fin-spark">
          <svg viewBox="0 0 100 28" preserveAspectRatio="none">
            <polygon points={`${spark} 100,28 0,28`} fill={sparkColor} opacity="0.1" />
            <polyline points={spark} fill="none" stroke={sparkColor} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </div>
  )
}

function RetrievedFinancials({ years }: { years: FinancialYearRow[] }) {
  // years arrives newest-first (for the table); charts read left-to-right chronologically.
  const chrono = [...years].reverse()
  const latest = years[0]
  const prior = years[1]

  const revenues = chrono.map(y => y.revenue ?? 0)
  const revMax = Math.max(1, ...revenues)

  const profits = chrono.map(y => y.net_profit ?? 0)
  const maxPos = Math.max(0, ...profits)
  const maxNeg = Math.max(0, ...profits.map(v => -v))
  const profitRange = maxPos + maxNeg || 1
  const baselinePct = (maxNeg / profitRange) * 100

  return (
    <div className="cp-fin">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <FinStatCard label="Κύκλος εργασιών" value={formatEUR(latest.revenue)}
          delta={pctDelta(latest.revenue, prior?.revenue ?? null)} />
        <FinStatCard label="Καθαρά κέρδη" value={formatEUR(latest.net_profit)}
          delta={pctDelta(latest.net_profit, prior?.net_profit ?? null)} />
        <FinStatCard label="Σύνολο ενεργητικού" value={formatEUR(latest.total_assets)}
          delta={pctDelta(latest.total_assets, prior?.total_assets ?? null)}
          spark={sparkPoints(chrono.map(y => y.total_assets))} sparkColor="var(--accent)" />
        <FinStatCard label="Ίδια κεφάλαια" value={formatEUR(latest.equity)}
          delta={pctDelta(latest.equity, prior?.equity ?? null)}
          spark={sparkPoints(chrono.map(y => y.equity))} sparkColor="var(--gemi-text)" />
      </div>

      <div className="card" style={{ padding: '20px 22px 18px' }}>
        <div className="cp-fin-chart-title" style={{ marginBottom: 2 }}>
          Κύκλος εργασιών <span className="unit">(€)</span>
        </div>
        <div className="cp-fin-chart">
          <div className="cp-fin-bars">
            {chrono.map((y, i) => (
              <div key={y.fiscal_year} className="cp-fin-bar-col">
                <div className="cp-fin-bar-val" style={{ bottom: `calc(${(revenues[i] / revMax) * 100}% + 5px)` }}>
                  {formatCompact(y.revenue)}
                </div>
                <div className="cp-fin-bar" style={{ bottom: 0, height: `${(revenues[i] / revMax) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="cp-fin-axis">
            {chrono.map(y => <span key={y.fiscal_year}>{y.fiscal_year}</span>)}
          </div>
        </div>

        <div className="cp-fin-divider" />

        <div className="cp-fin-chart-title" style={{ marginBottom: 2 }}>
          Καθαρά κέρδη <span className="unit">(€) — γραμμή μηδέν = ισοσκελισμός</span>
        </div>
        <div className="cp-fin-chart profit">
          <div className="cp-fin-bars">
            <div className="cp-fin-zero" style={{ bottom: `${baselinePct}%` }} />
            {chrono.map((y, i) => {
              const v = profits[i]
              const isLoss = v < 0
              const barH = (Math.abs(v) / profitRange) * 100
              const bottom = isLoss ? baselinePct - barH : baselinePct
              return (
                <div key={y.fiscal_year} className="cp-fin-bar-col">
                  {!isLoss && (
                    <div className="cp-fin-bar-val" style={{ bottom: `calc(${bottom + barH}% + 5px)` }}>
                      {formatCompact(y.net_profit)}
                    </div>
                  )}
                  <div
                    className={`cp-fin-bar ${isLoss ? 'profit-neg' : 'profit-pos'}`}
                    style={{ bottom: `${bottom}%`, height: `${barH}%` }}
                  />
                  {isLoss && (
                    <div className="cp-fin-bar-val loss" style={{ top: `calc(${100 - bottom}% + 6px)` }}>
                      Ζημιά {formatCompact(y.net_profit)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="cp-fin-axis">
            {chrono.map(y => (
              <span key={y.fiscal_year} className={(y.net_profit ?? 0) < 0 ? 'loss-yr' : undefined}>
                {y.fiscal_year}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '20px 22px 18px' }}>
        <div className="cp-fin-chart-title" style={{ marginBottom: 12 }}>Πλήρες ιστορικό, ανά οικονομική χρήση</div>
        <div className="cp-fin-table-scroll">
          <table className="data-table" style={{ minWidth: 620 }}>
            <thead>
              <tr>
                <th>Χρήση</th>
                <th style={{ textAlign: 'right' }}>Κύκλος εργασιών</th>
                <th style={{ textAlign: 'right' }}>Κέρδη προ φόρων</th>
                <th style={{ textAlign: 'right' }}>Καθαρά κέρδη</th>
                <th style={{ textAlign: 'right' }}>Περιθώριο</th>
                <th style={{ textAlign: 'right' }}>Σύνολο ενεργητικού</th>
                <th style={{ textAlign: 'right' }}>Ίδια κεφάλαια</th>
              </tr>
            </thead>
            <tbody>
              {years.map(y => {
                const margin = y.revenue && y.net_profit != null ? (y.net_profit / y.revenue) * 100 : null
                const neg = (y.net_profit ?? 0) < 0
                return (
                  <tr key={y.fiscal_year}>
                    <td style={{ fontWeight: 600 }}>{y.fiscal_year}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatEUR(y.revenue)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: (y.profit_before_tax ?? 0) < 0 ? 'var(--loss-ink)' : undefined }}>{formatEUR(y.profit_before_tax)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: neg ? 'var(--loss-ink)' : undefined }}>{formatEUR(y.net_profit)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{margin != null ? `${margin.toLocaleString('el-GR', { maximumFractionDigits: 1 })}%` : '—'}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatEUR(y.total_assets)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatEUR(y.equity)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="cp-fin-provenance">
          <span className="cp-fin-dot" />
          Πηγή: Δημοσιευμένες οικονομικές καταστάσεις ΓΕΜΗ
        </div>
      </div>
    </div>
  )
}

type RetrieveJobStatus = 'idle' | 'starting' | 'queued' | 'running' | 'error'

interface RetrieveFiscalYear {
  fiscal_year: number
  revenue: number | null
  total_assets: number | null
  equity: number | null
  profit_before_tax: number | null
  net_profit: number | null
}

function RetrieveButton({ arGemi, onDone, label }: { arGemi: string; onDone: (years: FinancialYearRow[]) => void; label?: string }) {
  const [status, setStatus] = useState<RetrieveJobStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => stopPolling, [stopPolling])

  const start = useCallback(async () => {
    setStatus('starting')
    setError(null)
    try {
      const resp = await fetch('/api/financials/retrieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ar_gemi: arGemi }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Αποτυχία εκκίνησης ανάκτησης')

      setStatus('queued')
      const jobId: string = data.job_id

      pollRef.current = window.setInterval(async () => {
        try {
          const r = await fetch(`/api/financials/retrieve?job_id=${encodeURIComponent(jobId)}`, { cache: 'no-store' })
          const job = await r.json()
          if (!r.ok) throw new Error(job.error || 'Σφάλμα κατά την παρακολούθηση ανάκτησης')

          if (job.status === 'running') {
            setStatus('running')
            return
          }
          if (job.status === 'done') {
            stopPolling()
            const fiscalYears: RetrieveFiscalYear[] = job.result?.fiscal_years ?? []
            if (fiscalYears.length === 0) {
              setStatus('error')
              setError(job.result?.message || 'Δεν βρέθηκαν εξαγώγιμα οικονομικά στοιχεία στα διαθέσιμα έγγραφα.')
              return
            }
            const years: FinancialYearRow[] = fiscalYears.map(fy => ({
              fiscal_year: fy.fiscal_year,
              revenue: fy.revenue,
              total_assets: fy.total_assets,
              equity: fy.equity,
              profit_before_tax: fy.profit_before_tax,
              net_profit: fy.net_profit,
            }))
            onDone(years)
            return
          }
          if (job.status === 'error') {
            stopPolling()
            setStatus('error')
            setError(job.error || 'Η ανάκτηση απέτυχε.')
          }
        } catch (e) {
          stopPolling()
          setStatus('error')
          setError(String(e))
        }
      }, 3000)
    } catch (e) {
      setStatus('error')
      setError(String(e))
    }
  }, [arGemi, onDone, stopPolling])

  const busy = status === 'starting' || status === 'queued' || status === 'running'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <button className="cp-fin-btn" onClick={start} disabled={busy}>
        {busy && <span className="cp-fin-btn-spinner" />}
        {status === 'running' ? 'Ανάκτηση σε εξέλιξη…'
          : status === 'queued' || status === 'starting' ? 'Εκκίνηση…'
          : label ?? 'Ανάκτηση οικονομικών στοιχείων'}
      </button>
      {error && <div className="cp-fin-error">{error}</div>}
    </div>
  )
}

function FinancialsTab({ data, arGemi }: { data: FinancialsData | null; arGemi: string }) {
  const [retrievedYears, setRetrievedYears] = useState<FinancialYearRow[] | null>(null)

  if (!data) {
    return (
      <div className="card" style={{ padding: '20px 22px' }}>
        <div className="cp-fin-placeholder">
          <span className="cp-fin-dot" />
          Δεν έχει ελεγχθεί ακόμη για δημόσια οικονομικά στοιχεία.
        </div>
      </div>
    )
  }

  if (data.docs_found === 0 && !retrievedYears) {
    return (
      <div className="card" style={{ padding: '20px 22px' }}>
        <div className="cp-fin-found">
          <span className="cp-fin-found-copy">
            Δεν βρέθηκαν δημόσια οικονομικά στοιχεία στο ΓΕΜΗ για αυτή την επιχείρηση κατά τον
            τελευταίο έλεγχο. Αν γνωρίζετε ότι υπάρχουν, ζητήστε νέο έλεγχο.
          </span>
          <RetrieveButton arGemi={arGemi} onDone={setRetrievedYears} label="Έλεγχος ξανά" />
        </div>
      </div>
    )
  }

  const years = retrievedYears ?? data.years

  if (years.length === 0) {
    return (
      <div className="card" style={{ padding: '20px 22px' }}>
        <div className="cp-fin-found">
          <span className="cp-fin-found-copy">Διαθέσιμα δημόσια οικονομικά στοιχεία.</span>
          <RetrieveButton arGemi={arGemi} onDone={setRetrievedYears} />
        </div>
      </div>
    )
  }

  return <RetrievedFinancials years={years} />
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

// ── Sticky section nav (scrollspy) ──────────────────────────────

type SectionId = 'overview' | 'people' | 'activities' | 'financials' | 'similar' | 'network'

function CompanyStickyNav({
  sections, activeSection, condensed, company, headlineRevenue,
}: {
  sections: { id: SectionId; label: string; count?: number }[]
  activeSection: SectionId
  condensed: boolean
  company: CompanyData
  headlineRevenue: number | null
}) {
  const isActive = company.status_descr?.toLowerCase().includes('ενεργ')
  return (
    <div className={`cp-stickynav${condensed ? ' condensed' : ''}`}>
      <div className="cp-stickynav-inner">
        {condensed && (
          <div className="cp-stickynav-id">
            <span className={`cp-stickynav-dot ${isActive ? 'on' : 'off'}`} />
            <span className="cp-stickynav-name">{company.co_name_el ?? company.ar_gemi}</span>
            {headlineRevenue != null && (
              <span className="cp-stickynav-rev">{formatEUR(headlineRevenue)}</span>
            )}
          </div>
        )}
        <nav className="cp-secnav">
          {sections.map(s => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={`cp-secnav-link${activeSection === s.id ? ' active' : ''}`}
            >
              <span>{s.label}</span>
              {s.count != null && <span className="cp-tab-count">{s.count}</span>}
            </a>
          ))}
        </nav>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────

const FINANCIAL_FILER_TYPES = new Set(['ΑΕ', 'ΙΚΕ', 'ΕΠΕ'])

export default function CompanyPage({
  company,
  persons,
  similar,
  financials,
}: {
  company: CompanyData
  persons: PersonRow[]
  similar: SimilarCompany[]
  financials?: FinancialsData | null
}) {
  const lc = logoColor(company.ar_gemi)
  const initials = getInitials(company.co_name_el ?? company.ar_gemi)
  const brands = brandTitles(company.co_titles_el, company.co_name_el)
  const activities: KadActivity[] = Array.isArray(company.activities) ? company.activities : []
  const capital = formatCapital(company.capital)
  const isActive = company.status_descr?.toLowerCase().includes('ενεργ')
  const mainActivity = activities.find(a => a.type === 'main')
  const showFinancials = !!company.legal_type_descr && FINANCIAL_FILER_TYPES.has(company.legal_type_descr)
  const headlineRevenue = financials?.years?.[0]?.revenue ?? null

  const sections: { id: SectionId; label: string; count?: number }[] = [
    { id: 'overview', label: 'Επισκόπηση' },
    ...(persons.length > 0 ? [{ id: 'people' as SectionId, label: 'Άνθρωποι', count: persons.length }] : []),
    ...(activities.length > 0 ? [{ id: 'activities' as SectionId, label: 'Δραστηριότητες', count: activities.length }] : []),
    ...(showFinancials ? [{ id: 'financials' as SectionId, label: 'Οικονομικά' }] : []),
    ...(similar.length > 0 ? [{ id: 'similar' as SectionId, label: 'Παρόμοιες' }] : []),
    ...(persons.length > 0 ? [{ id: 'network' as SectionId, label: 'Δίκτυο' }] : []),
  ]

  // ── Scroll-driven state: which section is active, has the header
  // scrolled out of view (→ show condensed identity in the sticky nav),
  // and has the network graph section ever been visible (→ mount the
  // graph — it fetches on mount, no point paying for that until scrolled to).
  const headerRef = useRef<HTMLDivElement>(null)
  const sectionEls = useRef<Map<SectionId, HTMLElement>>(new Map())
  const [activeSection, setActiveSection] = useState<SectionId>('overview')
  const [headerCondensed, setHeaderCondensed] = useState(false)
  const [networkMounted, setNetworkMounted] = useState(false)

  const setSectionRef = useCallback((id: SectionId) => (el: HTMLElement | null) => {
    if (el) sectionEls.current.set(id, el)
    else sectionEls.current.delete(id)
  }, [])

  useEffect(() => {
    // The page's outer wrapper is min-height:100vh (not a fixed height), so
    // this <main> never actually overflows itself — the window/document is
    // what scrolls, not <main>. TRIGGER_LINE sits just below TopNav (64px)
    // + the section nav (~48px). The active section is whichever section's
    // top has most recently crossed above that line — i.e. the largest top
    // that's still <= the line. (An IntersectionObserver with a shrunk
    // "band" was tried first and picked the wrong section for any tall,
    // multi-screen section like Overview: its top stays far above the
    // viewport — a very negative number — for as long as any part of it
    // still touches the band, which beat every section actually on screen.
    // Directly comparing real boundingClientRect tops avoids that.)
    const TRIGGER_LINE = 130

    let ticking = false
    function update() {
      ticking = false
      if (headerRef.current) {
        setHeaderCondensed(headerRef.current.getBoundingClientRect().bottom <= 112)
      }
      let best: SectionId | null = null
      let bestTop = -Infinity
      sectionEls.current.forEach((el, id) => {
        const top = el.getBoundingClientRect().top
        if (top <= TRIGGER_LINE && top > bestTop) { bestTop = top; best = id }
      })
      if (!best && sections.length) best = sections[0].id
      // A short final section (e.g. an empty-looking network graph with few
      // nodes) may never scroll far enough for its own top to cross
      // TRIGGER_LINE — the page runs out of scroll room first. Once we're
      // at the bottom of the document, force the last section active so it
      // still gets marked active (and, for the network graph, mounted).
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
      if (atBottom && sections.length) best = sections[sections.length - 1].id
      if (best) {
        setActiveSection(best)
        if (best === 'network') setNetworkMounted(true)
      }
    }
    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(update) }
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [sections.length])

  return (
    <main style={{ flex: 1, background: 'var(--page-bg)' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 32px' }}>

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
        <div ref={headerRef} className="card" style={{ padding: '26px 30px', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>
            <CompanyFavicon
              arGemi={company.ar_gemi}
              hasFavicon={company.has_favicon}
              className="logo-initial xl"
              style={{ background: lc.bg, border: `1.5px solid ${lc.border}`, flexShrink: 0, padding: 10 }}
              fallback={
                <div className="logo-initial xl"
                  style={{ background: lc.bg, color: lc.fg, border: `1.5px solid ${lc.border}`, flexShrink: 0 }}>
                  {initials}
                </div>
              }
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2, margin: 0 }}>
                  {company.co_name_el ?? '—'}
                </h1>
                <span className={`badge ${isActive ? 'badge-active' : 'badge-inactive'}`}>{company.status_descr ?? 'Άγνωστη'}</span>
                {company.legal_type_descr && <span className="badge badge-neutral">{company.legal_type_descr}</span>}
              </div>
              {brands.length > 0 && (
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  Διακριτικός τίτλος:{' '}
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{brands.join(' · ')}</span>
                </div>
              )}
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
                {(company.url || company.discovered_url) && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>Website</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <a href={ensureHttp((company.url || company.discovered_url)!)} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
                        {displayUrl((company.url || company.discovered_url)!)}
                      </a>
                      {!company.url && company.discovered_url && (
                        <span className="gl-found"><span className="gl-mark">GL</span>βρέθηκε από το GreekLeads</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ── Sticky section nav — full-bleed so its background spans the
          viewport like the site TopNav above it, content still lines up
          with the 1400px column via cp-stickynav-inner. ── */}
      <CompanyStickyNav
        sections={sections}
        activeSection={activeSection}
        condensed={headerCondensed}
        company={company}
        headlineRevenue={headlineRevenue}
      />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 32px 80px' }}>

        <section id="overview" data-section-id="overview" ref={setSectionRef('overview')} className="cp-section">
          <OverviewTab company={company} persons={persons} activities={activities} />
        </section>

        {persons.length > 0 && (
          <section id="people" data-section-id="people" ref={setSectionRef('people')} className="cp-section">
            <div className="cp-section-hd"><h2>Άνθρωποι</h2><span className="cp-tab-count">{persons.length}</span></div>
            <PeopleTab persons={persons} />
          </section>
        )}

        {activities.length > 0 && (
          <section id="activities" data-section-id="activities" ref={setSectionRef('activities')} className="cp-section">
            <div className="cp-section-hd"><h2>Δραστηριότητες</h2><span className="cp-tab-count">{activities.length}</span></div>
            <ActivitiesTab activities={activities} />
          </section>
        )}

        {showFinancials && (
          <section id="financials" data-section-id="financials" ref={setSectionRef('financials')} className="cp-section">
            <div className="cp-section-hd"><h2>Οικονομικά</h2></div>
            <FinancialsTab data={financials ?? null} arGemi={company.ar_gemi} />
          </section>
        )}

        {similar.length > 0 && (
          <section id="similar" data-section-id="similar" ref={setSectionRef('similar')} className="cp-section">
            <div className="cp-section-hd"><h2>Παρόμοιες εταιρείες</h2></div>
            <SimilarTab similar={similar} />
          </section>
        )}

        {persons.length > 0 && (
          <section id="network" data-section-id="network" ref={setSectionRef('network')} className="cp-section cp-section-last">
            <div className="cp-section-hd"><h2>Δίκτυο</h2></div>
            {networkMounted && (
              <CompanyNetworkGraph arGemi={company.ar_gemi} companyName={company.co_name_el ?? company.ar_gemi} />
            )}
          </section>
        )}
      </div>
    </main>
  )
}
