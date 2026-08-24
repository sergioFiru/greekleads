'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface CompanyChip {
  ar_gemi: string
  name: string
  status: string
  matched_email?: string | null
  matched_phone?: string | null
}

// Same detection used server-side (web/app/api/people/search/route.ts) to decide
// which search path ran — re-derived here so the UI knows whether to show the
// "why this result matched" contact line.
function isContactQuery(raw: string): boolean {
  return raw.includes('@') || /^[+\d][\d\s()+-]{4,}$/.test(raw)
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

// "2082399" → "2,1 εκατ." — the person-roles figure is a pg statistics estimate,
// so it's shown rounded rather than as a falsely exact number.
function compactMillions(n: number): string {
  return (
    (n / 1_000_000).toLocaleString('el-GR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }) + ' εκατ.'
  )
}

export default function PeopleSearch({
  areas,
  totalCompanies,
  totalPersonRoles,
}: {
  areas: string[]
  totalCompanies?: number
  totalPersonRoles?: number
}) {
  const searchParams = useSearchParams()
  const router       = useRouter()

  const [q, setQ]         = useState(() => searchParams.get('q') ?? '')
  const [area, setArea]   = useState(() => searchParams.get('area') ?? '')
  const [count, setCount] = useState(() => searchParams.get('count') ?? '')
  const [status, setStatus] = useState(() => searchParams.get('status') ?? '')
  const [results, setResults] = useState<PersonResult[] | null>(null)
  const [loading, setLoading] = useState(false)
  // Separate from `results` on purpose: `results` flips to [] the instant a search
  // resolves empty, but we don't want to SHOW "not found" that instantly — a normal
  // pause mid-typing (e.g. right after the "@" in an email, before the domain) would
  // otherwise flash a real "not found" message for a string the user hasn't finished
  // typing yet. showEmpty only flips true after a short settle delay, and gets
  // cancelled immediately (not on the next debounce cycle) by every keystroke.
  const [showEmpty, setShowEmpty] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef    = useRef<HTMLInputElement>(null)
  // Guards against the classic debounced-search race: without this, an earlier,
  // slower request can resolve AFTER a newer one and overwrite its results —
  // this is exactly what caused results to visibly flicker between stale and
  // current sets while typing. A stale response is simply ignored once a newer
  // request has started. (Tried AbortController first to also cancel the
  // stale network request outright — dropped it, it made Next's dev overlay
  // throw a visible "signal is aborted" runtime error on every supersede,
  // which was worse than the bandwidth it saved. This guard alone is
  // sufficient for correctness.)
  const requestIdRef = useRef(0)

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
      setShowEmpty(false)
      return
    }

    const requestId = ++requestIdRef.current

    setLoading(true)
    try {
      const raw = query.trim()
      const isEmailOrPhone = isContactQuery(raw)
      const p = new URLSearchParams({ q: isEmailOrPhone ? raw : raw.toUpperCase() })
      if (area)   p.set('area', area)
      if (count)  p.set('count', count)
      if (status) p.set('status', status)
      const res = await fetch(`/api/people/search?${p}`)
      const data = await res.json()
      if (requestId !== requestIdRef.current) return // a newer search has since started — drop this response
      const found = data.results ?? []
      setResults(found)
      if (found.length === 0) {
        // Only actually show "not found" if nothing newer has started by then —
        // gives a beat for the user to keep typing before we call it empty.
        setTimeout(() => {
          if (requestId === requestIdRef.current) setShowEmpty(true)
        }, 400)
      }
    } catch {
      if (requestId !== requestIdRef.current) return
      setResults([])
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Every keystroke immediately hides a stale "not found" message — don't wait
    // for a full new debounce+fetch cycle to clear it, that's the gap that let a
    // mid-typing pause look like a dead end.
    setShowEmpty(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(q, area, count, status), 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [q, area, count, status, search])

  const hasQuery    = q.trim().length >= 3
  const filterCount = [area, count, status].filter(Boolean).length

  return (
    <div className="ps-page" data-searching={hasQuery ? 'true' : 'false'}>

      {/* ── HERO ─────────────────────────────────────────────────────
          Idle, this band grows to fill the viewport and centres itself —
          the page IS the search. Once a query is live it collapses to a
          slim control bar (see .ps-page[data-searching] in globals.css)
          and hands the whole screen to the results. */}
      <div className="ps-hero">
        <div className="ps-hero-inner">
          <div className="ps-lede">
            <span className="ps-eyebrow">
              <span className="ps-eyebrow-dot" />
              Επίσημα δεδομένα ΓΕΜΗ
            </span>

            <h1 className="ps-title">
              Οι άνθρωποι πίσω από<br />
              <span className="ps-title-accent">κάθε ελληνική εταιρεία</span>
            </h1>
            <p className="ps-sub">
              Διευθύνοντες σύμβουλοι, μέτοχοι και νόμιμοι εκπρόσωποι — αναζητήστε
              με ονοματεπώνυμο, email ή τηλέφωνο και δείτε ολόκληρο το προφίλ τους.
            </p>

            {/* Scale of the dataset — the credibility line between the claim and the search */}
            <div className="ps-metrics">
              {!!totalPersonRoles && totalPersonRoles > 0 && (
                <div className="ps-metric">
                  <span className="ps-metric-val">{compactMillions(totalPersonRoles)}</span>
                  <span className="ps-metric-lbl">Θέσεις &amp; ρόλοι</span>
                </div>
              )}
              <div className="ps-metric">
                <span className="ps-metric-val">
                  {totalCompanies ? totalCompanies.toLocaleString('el-GR') : '1.670.000'}
                </span>
                <span className="ps-metric-lbl">Εταιρείες</span>
              </div>
              <div className="ps-metric">
                <span className="ps-metric-val">ΓΕΜΗ</span>
                <span className="ps-metric-lbl">Επίσημη πηγή</span>
              </div>
            </div>
          </div>

          {/* Search input */}
          <div className="ps-searchbar">
            <span className="ps-search-icon">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            </span>
            <input
              ref={inputRef}
              className="ps-search-input"
              type="text"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Όνομα στελέχους, email ή τηλέφωνο…"
              autoFocus
              onKeyDown={e => { if (e.key === 'Escape') setQ('') }}
            />
            {q && (
              <button
                className="ps-search-clear"
                onClick={() => { setQ(''); inputRef.current?.focus() }}
                aria-label="Καθαρισμός"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Seeds an empty search with a real query — replaces the old
              below-the-fold empty-state card, which duplicated what the
              placeholder and this row already say. */}
          <div className="ps-hints">
            <span className="ps-hints-lbl">Δοκιμάστε</span>
            {EXAMPLE_NAMES.map(name => (
              <button key={name} className="ps-hint" onClick={() => setQ(name)}>
                <span className="ps-hint-avatar" style={{ background: avatarColor(name) }}>
                  {initials(name)}
                </span>
                {name}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="ps-filters">
            <select
              className="ps-select"
              data-active={area ? 'true' : 'false'}
              value={area}
              onChange={e => setArea(e.target.value)}
            >
              <option value="">Όλη η Ελλάδα</option>
              {areas.map(a => <option key={a} value={a}>{a}</option>)}
            </select>

            <SegmentedControl
              label="Εταιρείες"
              options={COUNT_OPTIONS}
              value={count}
              onChange={setCount}
            />

            <SegmentedControl
              label=""
              options={STATUS_OPTIONS}
              value={status}
              onChange={setStatus}
            />

            {filterCount > 0 && (
              <button
                className="ps-seg-btn"
                style={{ border: '1px solid #E2E0D6', borderRadius: 7, background: '#fff' }}
                onClick={() => { setArea(''); setCount(''); setStatus('') }}
              >
                Καθαρισμός ({filterCount})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── RESULTS ──────────────────────────────────────────── */}
      <div className="ps-results">
        <div className="ps-results-inner">

          {hasQuery && loading && <SkeletonList />}

          {hasQuery && !loading && results !== null && results.length === 0 && showEmpty && (
            <div className="ps-none">
              <span className="ps-none-icon">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
              </span>
              <p className="ps-none-title">Δεν βρέθηκαν στελέχη για «{q.trim()}»</p>
              <p className="ps-none-text">
                Δοκιμάστε το επώνυμο μόνο του, ή χαλαρώστε τα φίλτρα.
              </p>
            </div>
          )}

          {hasQuery && !loading && results && results.length > 0 && (
            <>
              <div className="ps-results-hd">
                <span className="ps-results-count">
                  {results.length} {results.length === 1 ? 'στέλεχος' : 'στελέχη'}{' '}
                  <span>για «{q.trim()}»</span>
                </span>
                {results.length >= 20 && (
                  <span className="ps-results-hint">Εμφανίζονται τα 20 πιο σχετικά</span>
                )}
              </div>

              <div className="ps-list">
                {results.map((p, i) => (
                  <PersonResultCard key={p.person_name} person={p} index={i} searchTerm={q.trim()} />
                ))}
              </div>
            </>
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
    <div className="ps-seg">
      {label && <span className="ps-seg-label">{label}:</span>}
      <div className="ps-seg-group">
        {options.map(opt => (
          <button
            key={opt.value}
            className="ps-seg-btn"
            data-active={value === opt.value ? 'true' : 'false'}
            data-default={opt.value === '' ? 'true' : 'false'}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function SkeletonList() {
  return (
    <>
      <div className="ps-results-hd">
        <span className="ps-skel" style={{ height: 13, width: 150, display: 'block' }} />
      </div>
      <div className="ps-list">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="ps-card" style={{ cursor: 'default' }}>
            <span className="ps-skel ps-skel-avatar" />
            <div className="ps-body">
              <span className="ps-skel" style={{ height: 14, width: '46%' }} />
              <span className="ps-skel" style={{ height: 12, width: '68%' }} />
              <div className="ps-chips">
                <span className="ps-skel" style={{ height: 19, width: 104, borderRadius: 5 }} />
                <span className="ps-skel" style={{ height: 19, width: 82,  borderRadius: 5 }} />
              </div>
            </div>
            <div className="ps-stat">
              <span className="ps-skel" style={{ height: 21, width: 26 }} />
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// Wraps the searched substring in <mark> so it's visually obvious *why* this
// email/phone matched, not just that it did.
function Highlighted({ value, needle }: { value: string; needle: string }) {
  const idx = value.toLowerCase().indexOf(needle.toLowerCase())
  if (idx === -1) return <>{value}</>
  return (
    <>
      {value.slice(0, idx)}
      <mark className="ps-match-hl">{value.slice(idx, idx + needle.length)}</mark>
      {value.slice(idx + needle.length)}
    </>
  )
}

function PersonResultCard({ person, index, searchTerm }: { person: PersonResult; index: number; searchTerm: string }) {
  const color = avatarColor(person.person_name)
  const ini   = initials(person.person_name)

  // Deduplicate by ar_gemi (person may hold multiple roles in the same company)
  const uniqueCompanies = person.companies.filter(
    (c, i, arr) => arr.findIndex(x => x.ar_gemi === c.ar_gemi) === i
  )
  const chips     = uniqueCompanies.slice(0, 3)
  const remaining = uniqueCompanies.length - chips.length
  const allPast   = person.active_count === 0

  // Shows exactly which contact value matched and why this person is in the
  // results. The backend now populates matched_email/matched_phone whenever a
  // company's contact info happens to contain the search term, regardless of
  // which path found the person — a NAME match can still be "because of" an
  // email (e.g. "barnadavid98" matches BARNA PAUL-DAVID by name, but his email
  // is literally barnadavid98@gmail.com) — so this isn't gated on isContactQuery
  // anymore, just on whether the backend actually found a matching value.
  const matchedEmails = Array.from(new Set(uniqueCompanies.map(c => c.matched_email).filter((v): v is string => !!v)))
  const matchedPhones = Array.from(new Set(uniqueCompanies.map(c => c.matched_phone).filter((v): v is string => !!v)))

  return (
    <Link
      href={`/people/${encodeURIComponent(person.person_name)}`}
      className="ps-card ps-anim"
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
    >
      <span className="ps-avatar" style={{ background: color }}>{ini}</span>

      <div className="ps-body">
        <div className="ps-name-row">
          <span className="ps-name">{person.person_name}</span>
          {person.prefectures?.length > 0 && (
            <span className="ps-region">{person.prefectures.slice(0, 2).join(' · ')}</span>
          )}
        </div>

        {person.primary_role && person.primary_company && (
          <p className="ps-role">
            <b>{person.primary_role}</b> <em>σε</em> {person.primary_company}
          </p>
        )}

        {(matchedEmails.length > 0 || matchedPhones.length > 0) && (
          <p className="ps-matched">
            {matchedEmails.map(v => (
              <span key={v} className="ps-matched-item">
                Email: <Highlighted value={v} needle={searchTerm} />
              </span>
            ))}
            {matchedPhones.map(v => (
              <span key={v} className="ps-matched-item">
                Τηλ.: <Highlighted value={v} needle={searchTerm} />
              </span>
            ))}
          </p>
        )}

        {chips.length > 0 && (
          <div className="ps-chips">
            {chips.map(c => (
              <span key={c.ar_gemi} className="ps-chip" title={c.name}>
                <span
                  className="ps-chip-dot"
                  style={{ background: c.status === 'Ενεργή' ? '#2E9E5B' : '#C5C3BE' }}
                />
                <span className="ps-chip-text">{c.name}</span>
              </span>
            ))}
            {remaining > 0 && (
              <span className="ps-chip ps-chip-more">+{remaining} ακόμα</span>
            )}
          </div>
        )}
      </div>

      <div className="ps-stat">
        <span className="ps-stat-num" data-dim={allPast ? 'true' : 'false'}>
          {person.company_count}
        </span>
        <span className="ps-stat-lbl">
          {person.company_count === 1 ? 'εταιρεία' : 'εταιρείες'}
        </span>
        {person.active_count > 0 && (
          <span className="ps-stat-active">{person.active_count} ενεργ.</span>
        )}
      </div>
    </Link>
  )
}
