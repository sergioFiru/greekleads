'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface CompanyChip {
  ar_gemi: string
  name: string
  status: string
}

interface PersonResult {
  person_name: string
  company_count: number
  active_count: number
  primary_role: string | null
  primary_company: string | null
  companies: CompanyChip[]
  prefectures: string[]
}

const AVATAR_COLORS = [
  '#1A6FA8', '#0A6640', '#8B2222', '#6B4C9B', '#B86B10',
  '#1A5F7A', '#2D6A4F', '#7B2D8B', '#9B4A1A', '#1A4A8B',
]

function avatarColor(name: string) {
  const h = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase()
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

const EXAMPLE_NAMES = ['ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΕΩΡΓΙΟΣ', 'ΟΙΚΟΝΟΜΟΥ ΝΙΚΟΛΑΟΣ', 'ΑΝΤΩΝΙΟΥ ΜΑΡΙΑ']

const COUNT_OPTIONS = [
  { label: 'Οποιοσδήποτε', value: '' },
  { label: '1', value: '1' },
  { label: '2–3', value: '2-3' },
  { label: '4+', value: '4+' },
]

const STATUS_OPTIONS = [
  { label: 'Όλοι', value: '' },
  { label: 'Ενεργός', value: 'active' },
  { label: 'Παλαιός', value: 'past' },
]

export default function PeopleSearch({ areas }: { areas: string[] }) {
  const searchParams = useSearchParams()
  const router       = useRouter()

  const [q, setQ]         = useState(() => searchParams.get('q') ?? '')
  const [area, setArea]   = useState(() => searchParams.get('area') ?? '')
  const [count, setCount] = useState(() => searchParams.get('count') ?? '')
  const [status, setStatus] = useState(() => searchParams.get('status') ?? '')
  const [results, setResults] = useState<PersonResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync state → URL so back navigation restores the search
  useEffect(() => {
    const p = new URLSearchParams()
    if (q.trim())  p.set('q', q.trim())
    if (area)      p.set('area', area)
    if (count)     p.set('count', count)
    if (status)    p.set('status', status)
    router.replace(`/people${p.toString() ? '?' + p.toString() : ''}`, { scroll: false })
  }, [q, area, count, status, router])

  const search = useCallback(async (query: string, area: string, count: string, status: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setResults(null)
      return
    }
    setLoading(true)
    try {
      const raw = query.trim()
      const isEmailOrPhone = raw.includes('@') || /^[+\d][\d\s()+-]{4,}$/.test(raw)
      const p = new URLSearchParams({ q: isEmailOrPhone ? raw : raw.toUpperCase() })
      if (area)   p.set('area', area)
      if (count)  p.set('count', count)
      if (status) p.set('status', status)
      const res = await fetch(`/api/people/search?${p}`)
      const data = await res.json()
      setResults(data.results ?? [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(q, area, count, status), 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [q, area, count, status, search])

  const hasQuery = q.trim().length >= 3

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Search header */}
      <div style={{
        background: 'var(--card-bg)',
        borderBottom: '1px solid var(--border)',
        padding: '40px 24px 24px',
      }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>
            Αναζήτηση Προσώπων
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
            Διευθυντές, μέτοχοι, εκπρόσωποι σε 1.67M εταιρείες ΓΕΜΗ
          </p>

          {/* Search input */}
          <div style={{ position: 'relative' }}>
            <svg
              width="18" height="18" viewBox="0 0 24 24" fill="none"
              stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            >
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Όνομα, email ή τηλέφωνο..."
              autoFocus
              style={{
                width: '100%',
                height: 48,
                paddingLeft: 42,
                paddingRight: 16,
                fontSize: 16,
                border: '1px solid var(--border-strong)',
                borderRadius: 8,
                background: '#fff',
                color: 'var(--text-primary)',
                outline: 'none',
                transition: 'border-color .12s, box-shadow .12s',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = 'var(--accent)'
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(37,99,168,0.12)'
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'var(--border-strong)'
                e.currentTarget.style.boxShadow = 'none'
              }}
            />
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Area select */}
            <select
              value={area}
              onChange={e => setArea(e.target.value)}
              style={{
                height: 34,
                padding: '0 28px 0 10px',
                fontSize: 13,
                border: '1px solid var(--border)',
                borderRadius: 6,
                background: '#fff',
                color: area ? 'var(--text-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
              }}
            >
              <option value="">Όλη η Ελλάδα</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>

            {/* Count segmented */}
            <SegmentedControl
              label="Εταιρείες"
              options={COUNT_OPTIONS}
              value={count}
              onChange={setCount}
            />

            {/* Status segmented */}
            <SegmentedControl
              label=""
              options={STATUS_OPTIONS}
              value={status}
              onChange={setStatus}
            />
          </div>
        </div>
      </div>

      {/* Results area */}
      <div style={{ flex: 1, background: 'var(--app-bg)', padding: '24px', overflowY: 'auto' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          {!hasQuery && (
            <EmptyState onExampleClick={name => setQ(name)} />
          )}

          {hasQuery && loading && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)', fontSize: 14 }}>
              Αναζήτηση...
            </div>
          )}

          {hasQuery && !loading && results !== null && results.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                Δεν βρέθηκαν αποτελέσματα για &ldquo;<strong>{q}</strong>&rdquo;
              </p>
            </div>
          )}

          {results && results.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                {results.length} αποτελέσματα
              </p>
              {results.map(p => (
                <PersonResultCard key={p.person_name} person={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SegmentedControl({
  label, options, value, onChange,
}: {
  label: string
  options: { label: string; value: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {label && <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{label}:</span>}
      <div style={{
        display: 'flex',
        background: '#fff',
        border: '1px solid var(--border)',
        borderRadius: 6,
        overflow: 'hidden',
      }}>
        {options.map((opt, i) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              padding: '5px 10px',
              fontSize: 12.5,
              fontWeight: value === opt.value ? 600 : 400,
              background: value === opt.value ? 'var(--accent)' : 'transparent',
              color: value === opt.value ? '#fff' : 'var(--text-secondary)',
              border: 'none',
              borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
              cursor: 'pointer',
              transition: 'background .1s, color .1s',
              whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function EmptyState({ onExampleClick }: { onExampleClick: (name: string) => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '56px 24px' }}>
      <div style={{
        width: 52, height: 52,
        borderRadius: '50%',
        background: 'var(--accent-light)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 16px',
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
          stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </div>
      <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Αναζητήστε ένα πρόσωπο</p>
      <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>
        Πληκτρολογήστε το όνομα ενός διευθυντή, μετόχου ή εκπροσώπου
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        {EXAMPLE_NAMES.map(name => (
          <button
            key={name}
            onClick={() => onExampleClick(name)}
            style={{
              padding: '6px 12px',
              fontSize: 12.5,
              fontWeight: 500,
              background: '#fff',
              border: '1px solid var(--border)',
              borderRadius: 20,
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              transition: 'border-color .1s, color .1s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--accent)'
              e.currentTarget.style.color = 'var(--accent)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  )
}

function PersonResultCard({ person }: { person: PersonResult }) {
  const color = avatarColor(person.person_name)
  const ini = initials(person.person_name)
  const isActive = person.active_count > 0

  // Deduplicate by ar_gemi (person may have multiple roles in same company)
  const uniqueCompanies = person.companies.filter(
    (c, i, arr) => arr.findIndex(x => x.ar_gemi === c.ar_gemi) === i
  )
  const chips = uniqueCompanies.slice(0, 4)
  const remaining = uniqueCompanies.length - chips.length

  return (
    <Link
      href={`/people/${encodeURIComponent(person.person_name)}`}
      style={{ textDecoration: 'none' }}
    >
      <div
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '14px 16px',
          display: 'flex',
          gap: 14,
          alignItems: 'flex-start',
          cursor: 'pointer',
          transition: 'border-color .12s, box-shadow .12s',
        }}
        onMouseEnter={e => {
          const el = e.currentTarget
          el.style.borderColor = 'var(--accent)'
          el.style.boxShadow = '0 2px 8px rgba(37,99,168,0.08)'
        }}
        onMouseLeave={e => {
          const el = e.currentTarget
          el.style.borderColor = 'var(--border)'
          el.style.boxShadow = 'none'
        }}
      >
        {/* Avatar */}
        <div style={{
          width: 44, height: 44, borderRadius: '50%',
          background: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 14, fontWeight: 700,
          flexShrink: 0,
          letterSpacing: '0.02em',
        }}>
          {ini}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
              {person.person_name}
            </span>
            {person.prefectures?.length > 0 && (
              <span style={{
                fontSize: 11, color: 'var(--text-secondary)',
                background: 'var(--app-bg)', border: '0.5px solid var(--border)',
                borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap',
              }}>
                {person.prefectures.slice(0, 2).join(', ')}
              </span>
            )}
          </div>

          {person.primary_role && person.primary_company && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              {person.primary_role}{' '}
              <span style={{ color: 'var(--text-muted)' }}>σε</span>{' '}
              {person.primary_company}
            </p>
          )}

          {/* Company chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {chips.map(c => {
              const chipActive = c.status === 'Ενεργή'
              return (
                <span key={c.ar_gemi} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px',
                  background: 'var(--app-bg)',
                  border: '0.5px solid var(--border)',
                  borderRadius: 4,
                  fontSize: 11.5,
                  color: 'var(--text-secondary)',
                  maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                    background: chipActive ? '#3EB57A' : '#C5C3BE',
                  }} />
                  {c.name}
                </span>
              )
            })}
            {remaining > 0 && (
              <span style={{
                padding: '2px 8px', background: 'var(--app-bg)',
                border: '0.5px solid var(--border)', borderRadius: 4,
                fontSize: 11.5, color: 'var(--text-muted)',
              }}>
                +{remaining} ακόμα
              </span>
            )}
          </div>
        </div>

        {/* Company count + status */}
        <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{
            fontSize: 18, fontWeight: 700, color: isActive ? 'var(--accent)' : 'var(--text-muted)',
          }}>
            {person.company_count}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            εταιρ.
          </span>
        </div>
      </div>
    </Link>
  )
}
