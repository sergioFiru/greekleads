'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Icon from './Icon'
import Paywall from './Paywall'
import CompanyPanel from './CompanyPanel'

interface Company {
  ar_gemi: string
  co_name_el: string
  legal_type_descr: string
  prefecture_descr: string
  municipality_descr: string
  status_descr: string
  year_founded: number | null
  email: string | null
  phone: string | null
  url: string | null
}

interface FilterOptions {
  statuses: string[]
  prefectures: string[]
  legal_types: string[]
  activities: string[]
}

interface SearchState {
  name: string
  statuses: string[]
  prefectures: string[]
  municipality: string
  legal_types: string[]
  activities: string[]
  has_email: boolean
  has_phone: boolean
  has_website: boolean
  year_from: string
  year_to: string
}

const ATTICA = ['ΑΤΤΙΚΗΣ', 'ΑΘΗΝΩΝ', 'ΠΕΙΡΑΙΑ', 'ΑΝΑΤΟΛΙΚΗΣ ΑΤΤΙΚΗΣ', 'ΔΥΤΙΚΗΣ ΑΤΤΙΚΗΣ']

const EMPTY: SearchState = {
  name: '', statuses: ['Ενεργή'], prefectures: [], municipality: '',
  legal_types: [], activities: [],
  has_email: false, has_phone: false, has_website: false,
  year_from: '', year_to: '',
}

const GATE_DISABLED = process.env.NEXT_PUBLIC_DISABLE_GATE === 'true'
const FREE_PAGE_LIMIT = 2

// Warm institutional palette matching design system
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

// Sidebar filter group with chevron-left toggle
function FilterGroup({
  title, children, defaultOpen = true, active = false,
}: {
  title: string; children: React.ReactNode; defaultOpen?: boolean; active?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="sp-filter-group">
      <div className="sp-filter-header">
        <div className="sp-filter-toggle" onClick={() => setOpen(o => !o)}>
          <Icon
            name="chevron-right"
            size={11}
            style={{
              transform: open ? 'rotate(90deg)' : 'none',
              transition: 'transform .12s',
              color: 'var(--text-muted)',
            }}
          />
          <span className="sp-filter-toggle-title" style={active ? { color: 'var(--accent)' } : {}}>
            {title}
          </span>
        </div>
      </div>
      {open && <div>{children}</div>}
    </div>
  )
}

// Checkbox row with optional count on right
function CheckRow({
  checked, onChange, label, count,
}: {
  checked: boolean; onChange: () => void; label: string; count?: number
}) {
  return (
    <div className="sp-filter-row" onClick={onChange}>
      <span className="sp-filter-label-text">
        <span
          className="sp-chk"
          data-checked={checked ? 'true' : 'false'}
          onClick={e => { e.stopPropagation(); onChange() }}
        />
        <span>{label}</span>
      </span>
      {count !== undefined && (
        <span className="sp-filter-count">{count.toLocaleString('el-GR')}</span>
      )}
    </div>
  )
}

// Active filter pills
function FilterPills({
  pills, onRemove, onClearAll,
}: {
  pills: Array<{ id: string; key: string; value: string; remove: () => void }>
  onRemove: (id: string) => void
  onClearAll: () => void
}) {
  if (pills.length === 0) return null
  return (
    <div className="sp-pills-row">
      {pills.map(p => (
        <span key={p.id} className="sp-pill">
          <span className="sp-pill-label">{p.key}:</span>
          <span>{p.value}</span>
          <span className="sp-pill-x" onClick={() => onRemove(p.id)}>
            <Icon name="x" size={10} stroke={2} />
          </span>
        </span>
      ))}
      <button
        className="sp-btn sp-btn-ghost sp-btn-sm"
        style={{ color: 'var(--text-secondary)', fontSize: 12, padding: '0 6px' }}
        onClick={onClearAll}
      >
        Καθαρισμός όλων
      </button>
    </div>
  )
}

export default function SearchPage() {
  const [filters, setFilters] = useState<SearchState>(EMPTY)
  const [results, setResults] = useState<Company[]>([])
  const [total, setTotal]     = useState<number | null>(null)
  const [page, setPage]       = useState(1)
  const [loading, setLoading] = useState(false)
  const [gated, setGated]     = useState(false)
  const [selectedArGemi, setSelectedArGemi] = useState<string | null>(null)
  const [filterOptions, setFilterOptions]   = useState<FilterOptions>({ statuses: [], prefectures: [], legal_types: [], activities: [] })
  const [activitySearch, setActivitySearch] = useState('')
  const [kadOpen, setKadOpen] = useState(false)
  const [kadPos, setKadPos]   = useState({ top: 0, left: 0 })
  const kadInputRef  = useRef<HTMLInputElement>(null)
  const kadDropRef   = useRef<HTMLDivElement>(null)
  const [prefSearch, setPrefSearch] = useState('')
  const [prefOpen, setPrefOpen]     = useState(false)
  const [prefPos, setPrefPos]       = useState({ top: 0, left: 0 })
  const prefInputRef = useRef<HTMLInputElement>(null)
  const prefDropRef  = useRef<HTMLDivElement>(null)
  const sidebarRef   = useRef<HTMLElement>(null)
  const [legalShowAll, setLegalShowAll] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sortBy, setSortBy]     = useState('-name')

  useEffect(() => {
    fetch('/api/filters')
      .then(r => r.json())
      .then(setFilterOptions)
      .catch(err => console.error('[SearchPage] Failed to load filters:', err))
  }, [])

  const search = useCallback(async (f: SearchState, p: number) => {
    setLoading(true); setGated(false)
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: f, page: p }),
      })
      if (res.status === 403) { setGated(true); setLoading(false); return }
      const data = await res.json()
      if (data.error) console.error('[SearchPage] API error:', data.error)
      setResults(data.results ?? [])
      setTotal(data.total ?? null)
    } catch (err) {
      console.error('[SearchPage] Fetch error:', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    setPage(1)
    const delay = filters.name ? 200 : 400
    const id = setTimeout(() => search(filters, 1), delay)
    return () => clearTimeout(id)
  }, [filters, search])

  useEffect(() => {
    if (page === 1) return
    search(filters, page)
  }, [page])

  const totalPages         = total != null ? Math.ceil(total / 50) : null
  const effectiveTotalPages = totalPages
    ? GATE_DISABLED ? totalPages : Math.min(totalPages, FREE_PAGE_LIMIT)
    : null

  const toggleStatus = (s: string) =>
    setFilters(f => ({ ...f, statuses: f.statuses.includes(s) ? f.statuses.filter(x => x !== s) : [...f.statuses, s] }))
  const toggleLegal  = (l: string) =>
    setFilters(f => ({ ...f, legal_types: f.legal_types.includes(l) ? f.legal_types.filter(x => x !== l) : [...f.legal_types, l] }))
  const togglePref   = (p: string) =>
    setFilters(f => ({ ...f, prefectures: f.prefectures.includes(p) ? f.prefectures.filter(x => x !== p) : [...f.prefectures, p] }))

  const openPref = () => {
    if (prefInputRef.current && sidebarRef.current) {
      const sb = sidebarRef.current.getBoundingClientRect()
      const r  = prefInputRef.current.getBoundingClientRect()
      setPrefPos({ top: r.top, left: sb.right + 8 })
    }
    setPrefOpen(true)
  }
  const addPrefecture    = (p: string) => { if (!filters.prefectures.includes(p)) setFilters(f => ({ ...f, prefectures: [...f.prefectures, p] })) }
  const removePrefecture = (p: string) => setFilters(f => ({ ...f, prefectures: f.prefectures.filter(x => x !== p) }))

  const openKad = () => {
    if (kadInputRef.current && sidebarRef.current) {
      const sb = sidebarRef.current.getBoundingClientRect()
      const r  = kadInputRef.current.getBoundingClientRect()
      setKadPos({ top: r.top, left: sb.right + 8 })
    }
    setKadOpen(true)
  }
  const addActivity    = (a: string) => { if (!filters.activities.includes(a)) setFilters(f => ({ ...f, activities: [...f.activities, a] })); setActivitySearch(''); setKadOpen(false) }
  const removeActivity = (a: string) => setFilters(f => ({ ...f, activities: f.activities.filter(x => x !== a) }))

  useEffect(() => {
    if (!kadOpen) return
    const h = (e: MouseEvent) => {
      if (!kadInputRef.current?.contains(e.target as Node) && !kadDropRef.current?.contains(e.target as Node))
        { setKadOpen(false); setActivitySearch('') }
    }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [kadOpen])

  useEffect(() => {
    if (!prefOpen) return
    const h = (e: MouseEvent) => {
      if (!prefInputRef.current?.contains(e.target as Node) && !prefDropRef.current?.contains(e.target as Node))
        { setPrefOpen(false); setPrefSearch('') }
    }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [prefOpen])

  const filteredActivities = filterOptions.activities
    .filter(a => !filters.activities.includes(a) && (activitySearch.trim() === '' || a.toLowerCase().includes(activitySearch.toLowerCase())))

  const showAtticaAll = !ATTICA.every(p => filters.prefectures.includes(p)) &&
    (prefSearch.trim() === '' || 'αττικη'.includes(prefSearch.toLowerCase()) || prefSearch.toLowerCase().includes('αττ'))

  const filteredPrefectures = filterOptions.prefectures
    .filter(p => prefSearch.trim() === '' || p.toLowerCase().includes(prefSearch.toLowerCase()))

  // Row selection
  const toggleOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  const allOnPage = results.length > 0 && results.every(r => selected.has(r.ar_gemi))
  const someOnPage = results.some(r => selected.has(r.ar_gemi)) && !allOnPage
  const selectAll = (v: boolean) => {
    setSelected(prev => {
      const s = new Set(prev)
      if (v) results.forEach(r => s.add(r.ar_gemi))
      else   results.forEach(r => s.delete(r.ar_gemi))
      return s
    })
  }

  const exportSelected = () => {
    const rows = results.filter(r => selected.has(r.ar_gemi))
    if (rows.length === 0) return
    const esc = (v: string) => `"${(v ?? '').replace(/"/g, '""')}"`
    const csv = [
      ['ΑΡΓΕΜΗ','Επωνυμία','Νομική Μορφή','Νομός','Δήμος','Κατάσταση','Έτος','Email','Τηλέφωνο','Website'].join(','),
      ...rows.map(r => [r.ar_gemi, esc(r.co_name_el), esc(r.legal_type_descr), esc(r.prefecture_descr), esc(r.municipality_descr), esc(r.status_descr), r.year_founded ?? '', r.email ?? '', r.phone ?? '', r.url ?? ''].join(','))
    ].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'greekleads-export.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  // Sort results client-side
  const sortedRows = useMemo(() => {
    const desc = sortBy.startsWith('-')
    const key  = desc ? sortBy.slice(1) : sortBy
    return [...results].sort((a, b) => {
      const av = (a as any)[key], bv = (b as any)[key]
      if (av == null) return 1; if (bv == null) return -1
      if (typeof av === 'string') return desc ? bv.localeCompare(av) : av.localeCompare(bv)
      return desc ? bv - av : av - bv
    })
  }, [results, sortBy])

  // Build pills for active filters
  const pills = [
    ...filters.prefectures.map(k => ({ id: `loc-${k}`, key: 'Τοποθεσία', value: k, remove: () => removePrefecture(k) })),
    ...filters.statuses.map(k => ({ id: `st-${k}`, key: 'Κατάσταση', value: k, remove: () => toggleStatus(k) })),
    ...filters.legal_types.map(k => ({ id: `lt-${k}`, key: 'Τύπος', value: k, remove: () => toggleLegal(k) })),
    ...filters.activities.map(k => ({ id: `act-${k}`, key: 'ΚΑΔ', value: k.length > 40 ? k.slice(0, 40) + '…' : k, remove: () => removeActivity(k) })),
    filters.has_email   ? { id: 'email', key: 'Επαφές', value: 'Email',     remove: () => setFilters(f => ({ ...f, has_email:   false })) } : null,
    filters.has_phone   ? { id: 'phone', key: 'Επαφές', value: 'Τηλέφωνο', remove: () => setFilters(f => ({ ...f, has_phone:   false })) } : null,
    filters.has_website ? { id: 'web',   key: 'Επαφές', value: 'Website',   remove: () => setFilters(f => ({ ...f, has_website: false })) } : null,
    filters.municipality ? { id: 'mun', key: 'Δήμος', value: filters.municipality, remove: () => setFilters(f => ({ ...f, municipality: '' })) } : null,
    filters.year_from    ? { id: 'yf',  key: 'Από',   value: filters.year_from,    remove: () => setFilters(f => ({ ...f, year_from: '' })) } : null,
    filters.year_to      ? { id: 'yt',  key: 'Έως',   value: filters.year_to,      remove: () => setFilters(f => ({ ...f, year_to:   '' })) } : null,
  ].filter(Boolean) as Array<{ id: string; key: string; value: string; remove: () => void }>

  const removePill = (id: string) => { const p = pills.find(x => x.id === id); if (p) p.remove() }
  const clearAll   = () => setFilters(EMPTY)

  const TOP_PREF  = 7
  const TOP_LEGAL = 7
  const topPrefs  = filterOptions.prefectures.slice(0, TOP_PREF)
  const topLegals = filterOptions.legal_types.slice(0, TOP_LEGAL)
  const extraPrefs  = filters.prefectures.filter(p => !topPrefs.includes(p))
  const extraLegals = filters.legal_types.filter(l => !topLegals.includes(l) && !legalShowAll)

  // Pagination
  const getPaginationPages = (): (number | '…')[] => {
    if (!effectiveTotalPages || effectiveTotalPages <= 1) return []
    if (effectiveTotalPages <= 7) return Array.from({ length: effectiveTotalPages }, (_, i) => i + 1)
    const pages: (number | '…')[] = [1]
    if (page > 3) pages.push('…')
    for (let p = Math.max(2, page - 1); p <= Math.min(effectiveTotalPages - 1, page + 1); p++) pages.push(p)
    if (page < effectiveTotalPages - 2) pages.push('…')
    pages.push(effectiveTotalPages)
    return pages
  }

  const startRow = total != null && total > 0 ? (page - 1) * 50 + 1 : 0
  const endRow   = total != null ? Math.min(page * 50, total) : 0

  return (
    <div className="sp-layout">

      {/* ── SIDEBAR ── */}
      <aside className="sp-sidebar" ref={sidebarRef}>
        <div className="sp-sidebar-hd">
          <span className="sp-sidebar-title">Filters</span>
          {pills.length > 0 && (
            <button className="sp-reset-btn" onClick={clearAll}>Reset</button>
          )}
        </div>

        <FilterGroup title="Data enrichment" defaultOpen active={filters.has_email || filters.has_phone || filters.has_website}>
          <CheckRow label="Verified email"  checked={filters.has_email}   onChange={() => setFilters(f => ({ ...f, has_email:   !f.has_email }))} />
          <CheckRow label="Phone number"    checked={filters.has_phone}   onChange={() => setFilters(f => ({ ...f, has_phone:   !f.has_phone }))} />
          <CheckRow label="Website"         checked={filters.has_website} onChange={() => setFilters(f => ({ ...f, has_website: !f.has_website }))} />
        </FilterGroup>

        <FilterGroup title="Location" defaultOpen active={filters.prefectures.length > 0}>
          {topPrefs.map(p => (
            <CheckRow key={p} checked={filters.prefectures.includes(p)} onChange={() => togglePref(p)} label={p} />
          ))}
          {extraPrefs.map(p => (
            <CheckRow key={p} checked onChange={() => removePrefecture(p)} label={p} />
          ))}
          {filterOptions.prefectures.length > TOP_PREF && (
            <input
              ref={prefInputRef}
              className="sp-filter-input"
              placeholder={`Εμφάνιση όλων ${filterOptions.prefectures.length} →`}
              value={prefSearch}
              onFocus={openPref}
              onChange={e => { setPrefSearch(e.target.value); openPref() }}
              onKeyDown={e => { if (e.key === 'Escape') { setPrefOpen(false); setPrefSearch('') } }}
              autoComplete="off"
            />
          )}
        </FilterGroup>

        <FilterGroup title="Κατάσταση" defaultOpen={false} active={filters.statuses.length > 0}>
          {filterOptions.statuses.map(s => (
            <CheckRow key={s} checked={filters.statuses.includes(s)} onChange={() => toggleStatus(s)} label={s} />
          ))}
        </FilterGroup>

        <FilterGroup title="Νομική Μορφή" defaultOpen={false} active={filters.legal_types.length > 0}>
          {(legalShowAll ? filterOptions.legal_types : topLegals).map(l => (
            <CheckRow key={l} checked={filters.legal_types.includes(l)} onChange={() => toggleLegal(l)} label={l} />
          ))}
          {!legalShowAll && extraLegals.map(l => (
            <CheckRow key={l} checked onChange={() => toggleLegal(l)} label={l} />
          ))}
          {filterOptions.legal_types.length > TOP_LEGAL && !legalShowAll && (
            <button className="sp-show-all" onClick={() => setLegalShowAll(true)}>
              Show all {filterOptions.legal_types.length} →
            </button>
          )}
        </FilterGroup>

        <FilterGroup title="Κλάδος (ΚΑΔ)" defaultOpen active={filters.activities.length > 0}>
          {filters.activities.map(a => (
            <div key={a} className="sp-kad-chip">
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} title={a}>
                {a.length > 38 ? a.slice(0, 38) + '…' : a}
              </span>
              <button className="sp-kad-rm" onMouseDown={e => { e.preventDefault(); removeActivity(a) }}>×</button>
            </div>
          ))}
          <input
            ref={kadInputRef}
            className="sp-filter-input"
            placeholder="Αναζήτηση ΚΑΔ..."
            value={activitySearch}
            onFocus={openKad}
            onChange={e => { setActivitySearch(e.target.value); openKad() }}
            onKeyDown={e => {
              if (e.key === 'Escape') { setKadOpen(false); setActivitySearch('') }
              else if (e.key === 'Enter' && filteredActivities.length > 0) addActivity(filteredActivities[0])
            }}
            autoComplete="off"
          />
        </FilterGroup>

        <FilterGroup title="Founded" defaultOpen active={!!(filters.year_from || filters.year_to)}>
          <div className="sp-year-row">
            <input className="sp-filter-input" placeholder="Από" value={filters.year_from} onChange={e => setFilters(f => ({ ...f, year_from: e.target.value }))} />
            <input className="sp-filter-input" placeholder="Έως" value={filters.year_to}   onChange={e => setFilters(f => ({ ...f, year_to:   e.target.value }))} />
          </div>
        </FilterGroup>

        <FilterGroup title="Δήμος" defaultOpen active={!!filters.municipality.trim()}>
          <input
            className="sp-filter-input"
            placeholder="Αναζήτηση δήμου..."
            value={filters.municipality}
            onChange={e => setFilters(f => ({ ...f, municipality: e.target.value }))}
          />
        </FilterGroup>
      </aside>

      {/* ── DETAIL PANEL ── */}
      {selectedArGemi && (
        <CompanyPanel arGemi={selectedArGemi} onClose={() => setSelectedArGemi(null)} />
      )}

      {/* ── FLOATING KAD DROPDOWN ── */}
      {kadOpen && filteredActivities.length > 0 && (
        <div ref={kadDropRef} className="kad-dropdown" style={{ top: kadPos.top, left: kadPos.left }}>
          {filteredActivities.map(a => (
            <div key={a} className="kad-drop-item" onMouseDown={e => { e.preventDefault(); addActivity(a) }}>{a}</div>
          ))}
        </div>
      )}

      {/* ── FLOATING PREFECTURE DROPDOWN ── */}
      {prefOpen && (showAtticaAll || filteredPrefectures.length > 0) && (
        <div ref={prefDropRef} className="kad-dropdown" style={{ top: prefPos.top, left: prefPos.left }}>
          {showAtticaAll && (
            <div className="kad-drop-item kad-drop-check" style={{ fontWeight: 600, borderBottom: '1px solid var(--border)' }}
              onMouseDown={e => { e.preventDefault(); setFilters(f => ({ ...f, prefectures: [...f.prefectures.filter(p => !ATTICA.includes(p)), ...ATTICA] })) }}>
              <span className="chk" data-checked={ATTICA.every(p => filters.prefectures.includes(p)) ? 'true' : ATTICA.some(p => filters.prefectures.includes(p)) ? 'mixed' : 'false'} />
              Αττική (όλη)
            </div>
          )}
          {filteredPrefectures.map(p => {
            const checked = filters.prefectures.includes(p)
            return (
              <div key={p} className="kad-drop-item kad-drop-check"
                onMouseDown={e => { e.preventDefault(); checked ? removePrefecture(p) : addPrefecture(p) }}>
                <span className="chk" data-checked={checked ? 'true' : 'false'} />
                {p}
              </div>
            )
          })}
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <main className="sp-main">

        {/* Search bar row */}
        <div className="sp-topbar">
          <div className="sp-topbar-row1">
            <div className="sp-search-wrap">
              <span className="sp-search-icon"><Icon name="search" size={14} /></span>
              <input
                className="sp-search-input"
                placeholder="Search by company name, ΓΕΜΗ number, VAT, or keyword"
                value={filters.name}
                onChange={e => setFilters(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <button className="sp-btn sp-btn-secondary">
              <Icon name="filter" size={13} />
              More filters
            </button>
            <button className="sp-btn sp-btn-secondary">
              <Icon name="bookmark" size={13} />
              Save search
            </button>
            {total != null && (
              <span className="sp-match-count">
                <strong>{total.toLocaleString('el-GR')}</strong>
                {' companies match'}
                {selected.size > 0 && <> · <strong>{selected.size}</strong> selected</>}
              </span>
            )}
          </div>
          <FilterPills pills={pills} onRemove={removePill} onClearAll={clearAll} />
        </div>

        {/* Results card */}
        <div className="sp-card-wrap">
          <div className="sp-card">

            {/* Card header */}
            <div className="sp-card-header">
              <div className="sp-card-header-left">
                <span className="sp-card-title">Results</span>
                {total != null && !loading && total > 0 && (
                  <span className="sp-card-sub">
                    Showing <span className="mono">{startRow}–{endRow}</span> of <span className="mono">{total.toLocaleString('el-GR')}</span>
                  </span>
                )}
                {loading && <span className="sp-card-sub">Searching…</span>}
                {total === 0 && !loading && <span className="sp-card-sub">No results</span>}
              </div>
              <div className="sp-card-header-right">
                <span className="sp-sort-label">Sort</span>
                <select
                  className="sp-sort-select"
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                >
                  <option value="co_name_el">Όνομα (A → Ω)</option>
                  <option value="-co_name_el">Όνομα (Ω → A)</option>
                  <option value="-year_founded">Ίδρυση (νεότερα)</option>
                  <option value="year_founded">Ίδρυση (παλαιότερα)</option>
                </select>
                <span className="sp-v-divider" />
                <button className="sp-icon-btn sp-icon-btn--active" title="Table view">
                  <Icon name="table" size={14} />
                </button>
                <button className="sp-icon-btn" title="Settings">
                  <Icon name="settings" size={14} />
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="sp-table-scroll">
              {gated && !GATE_DISABLED ? (
                <div style={{ position: 'relative' }}>
                  <div style={{ filter: 'blur(3px)', pointerEvents: 'none', opacity: 0.4 }}>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} style={{ height: 56, borderBottom: '0.5px solid var(--row-divider)' }} />
                    ))}
                  </div>
                  <Paywall />
                </div>
              ) : (
                <table className="sp-table">
                  <thead>
                    <tr>
                      <th className="sp-th-check">
                        <span
                          className="sp-chk"
                          data-checked={allOnPage ? 'true' : someOnPage ? 'indeterminate' : 'false'}
                          onClick={() => selectAll(!allOnPage)}
                          style={{ cursor: 'pointer' }}
                        />
                      </th>
                      <th className="sp-th-company">Company</th>
                      <th className="sp-th-enrich">Enrichment</th>
                      <th className="sp-th-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.length === 0 && !loading && (
                      <tr>
                        <td colSpan={4}>
                          <div className="sp-empty">
                            {total === 0
                              ? 'No results match the current filters'
                              : 'Use filters or search to find companies'
                            }
                          </div>
                        </td>
                      </tr>
                    )}
                    {sortedRows.map(c => {
                      const isSel    = selected.has(c.ar_gemi)
                      const isOpen   = selectedArGemi === c.ar_gemi
                      const col      = logoColor(c.ar_gemi)
                      const initials = getInitials(c.co_name_el)
                      const isActive = c.status_descr?.toLowerCase().includes('ενεργ')
                      const meta     = [
                        c.legal_type_descr ?? null,
                        c.municipality_descr || c.prefecture_descr || null,
                        c.year_founded ? `Founded ${c.year_founded}` : null,
                      ].filter(Boolean).join(' · ')

                      return (
                        <tr
                          key={c.ar_gemi}
                          data-selected={isSel || isOpen ? 'true' : 'false'}
                          onClick={() => setSelectedArGemi(c.ar_gemi)}
                        >
                          <td className="sp-td-check" onClick={e => toggleOne(c.ar_gemi, e)}>
                            <span className="sp-chk" data-checked={isSel ? 'true' : 'false'} />
                          </td>

                          <td>
                            <div className="sp-company-cell">
                              <span
                                className="sp-logo"
                                style={{ background: col.bg, color: col.fg, borderColor: col.border }}
                              >
                                {initials}
                              </span>
                              <div style={{ minWidth: 0 }}>
                                <div className="sp-co-name">{c.co_name_el}</div>
                                {meta && <div className="sp-co-meta">{meta}</div>}
                              </div>
                            </div>
                          </td>

                          <td onClick={e => e.stopPropagation()}>
                            <div className="sp-enrich-row">
                              <span className="sp-badge sp-badge-gemi" title="Πηγή: επίσημο μητρώο ΓΕΜΗ">
                                <Icon name="verified" size={11} stroke={1.6} />
                                ΓΕΜΗ
                              </span>
                              {c.email && (
                                <a href={`mailto:${c.email}`} className="sp-badge sp-badge-neutral" title={c.email} onClick={e => e.stopPropagation()}>
                                  <Icon name="mail" size={10} stroke={1.6} />
                                </a>
                              )}
                              {c.phone && (
                                <span className="sp-badge sp-badge-neutral" title={c.phone}>
                                  <Icon name="phone" size={10} stroke={1.6} />
                                </span>
                              )}
                              {c.url && (
                                <a
                                  href={c.url.startsWith('http') ? c.url : `https://${c.url}`}
                                  className="sp-badge sp-badge-neutral"
                                  title={c.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <Icon name="globe" size={10} stroke={1.6} />
                                </a>
                              )}
                              {!isActive && (
                                <span className="sp-badge sp-badge-inactive">Ανενεργή</span>
                              )}
                            </div>
                          </td>

                          <td className="sp-td-actions" onClick={e => e.stopPropagation()}>
                            <button className="sp-action-btn" title="Open profile" onClick={() => setSelectedArGemi(c.ar_gemi)}>
                              <Icon name="eye" size={14} />
                            </button>
                            <button className="sp-action-btn" title="Export" onClick={() => { setSelected(prev => { const s = new Set(prev); s.add(c.ar_gemi); return s }) }}>
                              <Icon name="download" size={14} />
                            </button>
                            <button className="sp-action-btn" title="More">
                              <Icon name="more" size={14} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="sp-card-footer">
              <div className="sp-footer-left">
                {selected.size > 0 ? (
                  <>
                    <span><span className="mono" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{selected.size}</span> selected</span>
                    <button className="sp-btn sp-btn-secondary sp-btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
                    <button className="sp-btn sp-btn-secondary sp-btn-sm">
                      <Icon name="bookmark" size={12} />
                      Save as list
                    </button>
                  </>
                ) : (
                  <span>Select rows to export or save as a list</span>
                )}
              </div>
              <div className="sp-footer-right">
                {effectiveTotalPages && effectiveTotalPages > 1 && !gated && (
                  <div className="sp-pagination">
                    <button className="sp-page-btn" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))} aria-label="Previous">
                      <Icon name="chevron-left" size={13} />
                    </button>
                    {getPaginationPages().map((p, i) =>
                      p === '…' ? (
                        <span key={`d${i}`} className="sp-page-dots">…</span>
                      ) : (
                        <button
                          key={p}
                          className="sp-page-btn"
                          data-active={p === page ? 'true' : 'false'}
                          onClick={() => setPage(p as number)}
                        >
                          {p}
                        </button>
                      )
                    )}
                    <button className="sp-page-btn" disabled={page >= effectiveTotalPages} onClick={() => setPage(p => p + 1)} aria-label="Next">
                      <Icon name="chevron-right" size={13} />
                    </button>
                  </div>
                )}
                <button
                  className="sp-btn sp-btn-primary"
                  disabled={selected.size === 0}
                  onClick={exportSelected}
                >
                  <Icon name="download" size={13} />
                  Export selected ({selected.size})
                </button>
              </div>
            </div>
          </div>
          <div className="sp-card-spacer" />
        </div>

      </main>
    </div>
  )
}
