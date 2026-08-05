'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Icon from './Icon'
import Paywall from './Paywall'
import { ScoutPanel, ScoutPromptBar, ScoutSummaryBar, type ScoutRecipe } from './Scout'
import CompanyPreviewPanel from './CompanyPreviewPanel'

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
  discovered_url: string | null
  instagram_url: string | null
  facebook_url: string | null
  linkedin_url: string | null
  twitter_url: string | null
  tiktok_url: string | null
  youtube_url: string | null
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
  has_no_website: boolean
  has_instagram: boolean
  has_facebook: boolean
  has_linkedin: boolean
  has_twitter: boolean
  has_tiktok: boolean
  has_youtube: boolean
  year_from: string
  year_to: string
}

const ATTICA = ['ΑΤΤΙΚΗΣ', 'ΑΘΗΝΩΝ', 'ΠΕΙΡΑΙΑ', 'ΑΝΑΤΟΛΙΚΗΣ ΑΤΤΙΚΗΣ', 'ΔΥΤΙΚΗΣ ΑΤΤΙΚΗΣ']

const EMPTY: SearchState = {
  name: '', statuses: ['Ενεργή'], prefectures: [], municipality: '',
  legal_types: [], activities: [],
  has_email: false, has_phone: false, has_website: false, has_no_website: false,
  has_instagram: false, has_facebook: false, has_linkedin: false, has_twitter: false, has_tiktok: false, has_youtube: false,
  year_from: '', year_to: '',
}

const GATE_DISABLED = process.env.NEXT_PUBLIC_DISABLE_GATE === 'true'
const FREE_PAGE_LIMIT = 2

const SOCIAL_PLATFORMS = [
  { key: 'instagram_url', label: 'Instagram', icon: 'instagram',  color: '#E1306C' },
  { key: 'facebook_url',  label: 'Facebook',  icon: 'facebook',   color: '#1877F2' },
  { key: 'linkedin_url',  label: 'LinkedIn',  icon: 'linkedin',   color: '#0A66C2' },
  { key: 'twitter_url',   label: 'X / Twitter', icon: 'twitter-x', color: '#1D1D1B' },
  { key: 'tiktok_url',    label: 'TikTok',    icon: 'tiktok',     color: '#010101' },
  { key: 'youtube_url',   label: 'YouTube',   icon: 'youtube',    color: '#FF0000' },
] as const

function useAnimatedCount(target: number | null, duration = 700) {
  const [display, setDisplay] = useState(0)
  const prevRef = useRef(0)
  const rafRef  = useRef<number>()
  useEffect(() => {
    if (target === null) return
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const from = prevRef.current
    const to   = target
    const t0   = performance.now()
    const tick = (now: number) => {
      const t    = Math.min((now - t0) / duration, 1)
      const ease = 1 - Math.pow(1 - t, 3)
      setDisplay(Math.round(from + (to - from) * ease))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else prevRef.current = to
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [target, duration])
  return display
}

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

// URL ↔ filter state helpers
const KAD_SESSION_KEY = 'gl_kad_filter'
const KAD_URL_MAX = 5  // beyond this, store in sessionStorage to avoid 431 errors

function parseParams(p: URLSearchParams): SearchState {
  let activities: string[]
  if (p.has('has_kad')) {
    try {
      const stored = sessionStorage.getItem(KAD_SESSION_KEY)
      activities = stored ? JSON.parse(stored) : []
    } catch {
      activities = []
    }
  } else {
    activities = p.getAll('kad')
  }
  return {
    name:         p.get('name') ?? '',
    statuses:     p.getAll('status').length > 0 ? p.getAll('status') : ['Ενεργή'],
    prefectures:  p.getAll('prefecture'),
    municipality: p.get('municipality') ?? '',
    legal_types:  p.getAll('legal_type'),
    activities,
    has_email:      p.has('email'),
    has_phone:      p.has('phone'),
    has_website:    p.has('website'),
    has_no_website: p.has('no_website'),
    has_instagram:  p.has('instagram'),
    has_facebook:   p.has('facebook'),
    has_linkedin:   p.has('linkedin'),
    has_twitter:    p.has('twitter'),
    has_tiktok:     p.has('tiktok'),
    has_youtube:    p.has('youtube'),
    year_from: p.get('year_from') ?? '',
    year_to:   p.get('year_to')   ?? '',
  }
}

function buildParams(f: SearchState, page: number, sort: string): URLSearchParams {
  const p = new URLSearchParams()
  if (f.name)          p.set('name', f.name)
  f.statuses.forEach(s    => p.append('status',     s))
  f.prefectures.forEach(s => p.append('prefecture', s))
  f.legal_types.forEach(s => p.append('legal_type', s))
  if (f.activities.length > KAD_URL_MAX) {
    try { sessionStorage.setItem(KAD_SESSION_KEY, JSON.stringify(f.activities)) } catch {}
    p.set('has_kad', '1')
  } else {
    f.activities.forEach(s => p.append('kad', s))
  }
  if (f.municipality)   p.set('municipality', f.municipality)
  if (f.has_email)      p.set('email',    '1')
  if (f.has_phone)      p.set('phone',    '1')
  if (f.has_website)    p.set('website',  '1')
  if (f.has_no_website) p.set('no_website', '1')
  if (f.has_instagram)  p.set('instagram', '1')
  if (f.has_facebook)   p.set('facebook',  '1')
  if (f.has_linkedin)   p.set('linkedin',  '1')
  if (f.has_twitter)    p.set('twitter',   '1')
  if (f.has_tiktok)     p.set('tiktok',    '1')
  if (f.has_youtube)    p.set('youtube',   '1')
  if (f.year_from)      p.set('year_from', f.year_from)
  if (f.year_to)        p.set('year_to',   f.year_to)
  if (page > 1)         p.set('page', String(page))
  if (sort !== '-name') p.set('sort', sort)
  return p
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
  checked, onChange, label, count, icon,
}: {
  checked: boolean; onChange: () => void; label: string; count?: number; icon?: React.ReactNode
}) {
  return (
    <div className="sp-filter-row" onClick={onChange}>
      <span className="sp-filter-label-text">
        <span
          className="sp-chk"
          data-checked={checked ? 'true' : 'false'}
          onClick={e => { e.stopPropagation(); onChange() }}
        />
        {icon && <span style={{ display: 'inline-flex', alignItems: 'center', marginRight: 5 }}>{icon}</span>}
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
  const searchParams = useSearchParams()
  const router       = useRouter()

  const [filters, setFilters] = useState<SearchState>(() => parseParams(searchParams))
  const [results, setResults] = useState<Company[]>([])
  const [total, setTotal]     = useState<number | null>(null)
  const [page, setPage]       = useState(() => parseInt(searchParams.get('page') ?? '1', 10))
  const [loading, setLoading] = useState(false)
  const [gated, setGated]     = useState(false)
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ statuses: [], prefectures: [], legal_types: [], activities: [] })
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
  const [sortBy, setSortBy]     = useState(() => searchParams.get('sort') ?? '-name')
  const [scoutOpen, setScoutOpen]       = useState(false)
  const [scoutSummary, setScoutSummary] = useState<string | null>(null)
  const [resultsKey, setResultsKey]     = useState(0)
  const [previewArGemi, setPreviewArGemi] = useState<string | null>(null)
  const [viewMode, setViewMode]           = useState<'table' | 'card'>('table')
  const filterResetRef = useRef(false)

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
      setResultsKey(k => k + 1)
    } catch (err) {
      console.error('[SearchPage] Fetch error:', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    filterResetRef.current = true
    setPage(1)
    setLoading(true)
    const delay = filters.name ? 200 : 400
    const id = setTimeout(() => { filterResetRef.current = false; search(filters, 1) }, delay)
    return () => { clearTimeout(id); filterResetRef.current = false }
  }, [filters, search])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (filterResetRef.current) { filterResetRef.current = false; return }
    search(filters, page)
  }, [page])

  // Sync filter state → URL (debounced for text input)
  const urlSyncRef = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    clearTimeout(urlSyncRef.current)
    const delay = filters.name ? 300 : 0
    urlSyncRef.current = setTimeout(() => {
      const params = buildParams(filters, page, sortBy)
      router.replace(`/search?${params.toString()}`, { scroll: false })
    }, delay)
    return () => clearTimeout(urlSyncRef.current)
  }, [filters, page, sortBy, router])

  const totalPages          = total != null ? Math.ceil(total / 50) : null
  const effectiveTotalPages = totalPages

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
    ...(filters.activities.length > 3
      ? [{ id: 'act-all', key: 'ΚΑΔ', value: `${filters.activities.length} κλάδοι`, remove: () => setFilters(f => ({ ...f, activities: [] })) }]
      : filters.activities.map(k => ({ id: `act-${k}`, key: 'ΚΑΔ', value: k.length > 40 ? k.slice(0, 40) + '…' : k, remove: () => removeActivity(k) }))
    ),
    filters.has_email      ? { id: 'email',     key: 'Επαφές', value: 'Email',          remove: () => setFilters(f => ({ ...f, has_email:      false })) } : null,
    filters.has_phone      ? { id: 'phone',     key: 'Επαφές', value: 'Τηλέφωνο',      remove: () => setFilters(f => ({ ...f, has_phone:      false })) } : null,
    filters.has_website    ? { id: 'web',       key: 'Επαφές', value: 'Website',        remove: () => setFilters(f => ({ ...f, has_website:    false })) } : null,
    filters.has_no_website ? { id: 'noweb',     key: 'Επαφές', value: 'Χωρίς website', remove: () => setFilters(f => ({ ...f, has_no_website: false })) } : null,
    filters.has_instagram  ? { id: 'instagram', key: 'Social', value: 'Instagram',      remove: () => setFilters(f => ({ ...f, has_instagram:  false })) } : null,
    filters.has_facebook   ? { id: 'facebook',  key: 'Social', value: 'Facebook',       remove: () => setFilters(f => ({ ...f, has_facebook:   false })) } : null,
    filters.has_linkedin   ? { id: 'linkedin',  key: 'Social', value: 'LinkedIn',       remove: () => setFilters(f => ({ ...f, has_linkedin:   false })) } : null,
    filters.has_twitter    ? { id: 'twitter',   key: 'Social', value: 'X / Twitter',    remove: () => setFilters(f => ({ ...f, has_twitter:    false })) } : null,
    filters.has_tiktok     ? { id: 'tiktok',    key: 'Social', value: 'TikTok',         remove: () => setFilters(f => ({ ...f, has_tiktok:     false })) } : null,
    filters.has_youtube    ? { id: 'youtube',   key: 'Social', value: 'YouTube',        remove: () => setFilters(f => ({ ...f, has_youtube:    false })) } : null,
    filters.municipality ? { id: 'mun', key: 'Δήμος', value: filters.municipality, remove: () => setFilters(f => ({ ...f, municipality: '' })) } : null,
    filters.year_from    ? { id: 'yf',  key: 'Από',   value: filters.year_from,    remove: () => setFilters(f => ({ ...f, year_from: '' })) } : null,
    filters.year_to      ? { id: 'yt',  key: 'Έως',   value: filters.year_to,      remove: () => setFilters(f => ({ ...f, year_to:   '' })) } : null,
  ].filter(Boolean) as Array<{ id: string; key: string; value: string; remove: () => void }>

  const removePill = (id: string) => { const p = pills.find(x => x.id === id); if (p) p.remove() }
  const clearAll   = () => { setFilters(EMPTY); setScoutSummary(null) }

  const applyScoutRecipe = useCallback((recipe: ScoutRecipe) => {
    setFilters(prev => ({
      ...prev,
      prefectures:   recipe.filters.prefectures,
      legal_types:   recipe.filters.legal_types,
      has_email:     recipe.filters.has_email,
      has_phone:     recipe.filters.has_phone,
      has_website:   recipe.filters.has_website,
      has_no_website: recipe.filters.has_no_website,
      statuses:      recipe.filters.statuses.length ? recipe.filters.statuses : ['Ενεργή'],
      activities:    recipe.filters.activities,
    }))
    setScoutSummary(recipe.summary)
  }, [])

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

  const animatedTotal = useAnimatedCount(total)
  const startRow = total != null && total > 0 ? (page - 1) * 50 + 1 : 0
  const endRow   = total != null ? Math.min(page * 50, total) : 0

  return (
    <>
    <div className="sp-breadcrumb">
      <Link href="/">Αρχική</Link>
      <span>/</span>
      <span>Κατάλογος εταιρειών</span>
    </div>
    <div className="sp-layout">

      {/* ── SIDEBAR ── */}
      <aside className="sp-sidebar" ref={sidebarRef}>
        <div className="sp-sidebar-hd">
          <span className="sp-sidebar-title">Φίλτρα</span>
          {pills.length > 0 && (
            <button className="sp-reset-btn" onClick={clearAll}>Καθαρισμός</button>
          )}
        </div>

        <FilterGroup title="Στοιχεία επικοινωνίας" defaultOpen active={filters.has_email || filters.has_phone || filters.has_website || filters.has_no_website}>
          <CheckRow label="Επαληθευμένο email"  checked={filters.has_email}      onChange={() => setFilters(f => ({ ...f, has_email:      !f.has_email }))} />
          <CheckRow label="Τηλέφωνο"             checked={filters.has_phone}      onChange={() => setFilters(f => ({ ...f, has_phone:      !f.has_phone }))} />
          <CheckRow label="Ιστότοπος"            checked={filters.has_website}    onChange={() => setFilters(f => ({ ...f, has_website:    !f.has_website,    has_no_website: false }))} />
          <CheckRow label="Χωρίς ιστότοπο"       checked={filters.has_no_website} onChange={() => setFilters(f => ({ ...f, has_no_website: !f.has_no_website, has_website:    false }))} />
        </FilterGroup>

        <FilterGroup title="Κοινωνικά δίκτυα" active={filters.has_instagram || filters.has_facebook || filters.has_linkedin || filters.has_twitter || filters.has_tiktok || filters.has_youtube}>
          {([
            { key: 'has_instagram', label: 'Instagram', icon: 'instagram', color: '#E1306C' },
            { key: 'has_facebook',  label: 'Facebook',  icon: 'facebook',  color: '#1877F2' },
            { key: 'has_linkedin',  label: 'LinkedIn',  icon: 'linkedin',  color: '#0A66C2' },
            { key: 'has_twitter',   label: 'X / Twitter', icon: 'twitter-x', color: '#1D1D1B' },
            { key: 'has_tiktok',    label: 'TikTok',    icon: 'tiktok',    color: '#010101' },
            { key: 'has_youtube',   label: 'YouTube',   icon: 'youtube',   color: '#FF0000' },
          ] as const).map(s => (
            <CheckRow
              key={s.key}
              label={s.label}
              icon={<Icon name={s.icon} size={13} style={{ color: filters[s.key] ? s.color : 'var(--text-muted)' }} />}
              checked={filters[s.key]}
              onChange={() => setFilters(f => ({ ...f, [s.key]: !f[s.key] }))}
            />
          ))}
        </FilterGroup>

        <FilterGroup title="Τοποθεσία" defaultOpen active={filters.prefectures.length > 0}>
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
              Εμφάνιση όλων {filterOptions.legal_types.length} →
            </button>
          )}
        </FilterGroup>

        <FilterGroup title="Κλάδος (ΚΑΔ)" defaultOpen active={filters.activities.length > 0}>
          {filters.activities.length > 5 ? (
            <div className="sp-kad-chip">
              <span style={{ flex: 1 }}>{filters.activities.length} ΚΑΔ επιλεγμένοι</span>
              <button className="sp-kad-rm" onMouseDown={e => { e.preventDefault(); setFilters(f => ({ ...f, activities: [] })) }}>×</button>
            </div>
          ) : (
            filters.activities.map(a => (
              <div key={a} className="sp-kad-chip">
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} title={a}>
                  {a.length > 38 ? a.slice(0, 38) + '…' : a}
                </span>
                <button className="sp-kad-rm" onMouseDown={e => { e.preventDefault(); removeActivity(a) }}>×</button>
              </div>
            ))
          )}
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

        <FilterGroup title="Έτος Ίδρυσης" defaultOpen active={!!(filters.year_from || filters.year_to)}>
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
          {/* Scout prompt / summary bar */}
          {scoutSummary ? (
            <ScoutSummaryBar
              summary={scoutSummary}
              onRefine={() => setScoutOpen(true)}
              onClear={() => { setScoutSummary(null); setFilters(EMPTY) }}
            />
          ) : (
            <ScoutPromptBar onClick={() => setScoutOpen(true)} />
          )}

          <div className="sp-topbar-row1">
            <div className="sp-search-wrap">
              <span className="sp-search-icon"><Icon name="search" size={14} /></span>
              <input
                className="sp-search-input"
                placeholder="Αναζήτηση εταιρείας, αριθμός ΓΕΜΗ, ΑΦΜ..."
                value={filters.name}
                onChange={e => setFilters(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <button className="sp-btn sp-btn-secondary">
              <Icon name="bookmark" size={13} />
              Αποθήκευση αναζήτησης
            </button>
            {total != null && (
              <span className="sp-match-count">
                <strong>{animatedTotal.toLocaleString('el-GR')}</strong>
                {' εταιρείες'}
                {selected.size > 0 && <> · <strong>{selected.size}</strong> επιλεγμένα</>}
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
                <span className="sp-card-title">Αποτελέσματα</span>
                {total != null && !loading && total > 0 && (
                  <span className="sp-card-sub">
                    Εμφάνιση <span className="mono">{startRow}–{endRow}</span> από <span className="mono">{total.toLocaleString('el-GR')}</span>
                  </span>
                )}
                {loading && <span className="sp-card-sub">Αναζήτηση…</span>}
                {total === 0 && !loading && <span className="sp-card-sub">Κανένα αποτέλεσμα</span>}
              </div>
              <div className="sp-card-header-right">
                <span className="sp-sort-label">Ταξινόμηση</span>
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
                <button
                  className={`sp-icon-btn ${viewMode === 'table' ? 'sp-icon-btn--active' : ''}`}
                  title="Table view"
                  onClick={() => setViewMode('table')}
                >
                  <Icon name="table" size={14} />
                </button>
                <button
                  className={`sp-icon-btn ${viewMode === 'card' ? 'sp-icon-btn--active' : ''}`}
                  title="Card view"
                  onClick={() => setViewMode('card')}
                >
                  <Icon name="grid" size={14} />
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="sp-table-scroll" style={{ display: viewMode === 'card' ? 'none' : undefined }}>
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
                      <th className="sp-th-company">Εταιρεία</th>
                      <th className="sp-th-legal">Νομική Μορφή</th>
                      <th className="sp-th-enrich">Στοιχεία</th>
                      <th className="sp-th-year">Ίδρυση</th>
                      <th className="sp-th-actions">Ενέργειες</th>
                    </tr>
                  </thead>
                  <tbody key={resultsKey}>
                    {loading && Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="sp-skel-row">
                        <td className="sp-td-check">
                          <div className="sp-skel" style={{ width: 14, height: 14, borderRadius: 3 }} />
                        </td>
                        <td>
                          <div className="sp-company-cell">
                            <div className="sp-skel sp-skel-logo" />
                            <div style={{ flex: 1 }}>
                              <div className="sp-skel sp-skel-name" />
                              <div className="sp-skel sp-skel-meta" />
                            </div>
                          </div>
                        </td>
                        <td className="sp-td-legal"><div className="sp-skel" style={{ height: 20, width: 52, borderRadius: 4 }} /></td>
                        <td><div className="sp-skel sp-skel-badges" /></td>
                        <td className="sp-td-year"><div className="sp-skel" style={{ height: 12, width: 36, marginLeft: 'auto' }} /></td>
                        <td className="sp-td-actions"><div className="sp-skel sp-skel-actions" /></td>
                      </tr>
                    ))}
                    {!loading && sortedRows.length === 0 && (
                      <tr>
                        <td colSpan={6}>
                          <div className="sp-empty">
                            {total === 0
                              ? 'Δεν βρέθηκαν αποτελέσματα για τα επιλεγμένα φίλτρα'
                              : 'Χρησιμοποιήστε φίλτρα ή αναζήτηση για να βρείτε εταιρείες'
                            }
                          </div>
                        </td>
                      </tr>
                    )}
                    {!loading && sortedRows.map((c, idx) => {
                      const isSel    = selected.has(c.ar_gemi)
                      const col      = logoColor(c.ar_gemi)
                      const initials = getInitials(c.co_name_el)
                      const isActive = c.status_descr?.toLowerCase().includes('ενεργ')
                      const meta     = [
                        c.municipality_descr || c.prefecture_descr || null,
                      ].filter(Boolean).join(' · ')

                      return (
                        <tr
                          key={c.ar_gemi}
                          className="sp-row-enter"
                          style={{ animationDelay: `${idx * 18}ms`, cursor: 'pointer' }}
                          data-selected={isSel ? 'true' : 'false'}
                          onClick={() => router.push(`/etaireies/${c.ar_gemi}`)}
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

                          <td className="sp-td-legal">
                            {c.legal_type_descr && (
                              <span className="sp-badge-legal">{c.legal_type_descr}</span>
                            )}
                          </td>

                          <td className="sp-td-enrich" onClick={e => e.stopPropagation()}>
                            <div className="sp-enrich-row" style={{ justifyContent: 'center' }}>
                              <span className="sp-badge sp-badge-gemi" title="Πηγή: επίσημο μητρώο ΓΕΜΗ">
                                <Icon name="verified" size={11} stroke={1.6} />
                                ΓΕΜΗ
                              </span>
                              {c.email && (
                                <span className="sp-badge sp-badge-neutral" title={c.email}>
                                  <Icon name="mail" size={10} stroke={1.6} />
                                </span>
                              )}
                              {c.phone && (
                                <span className="sp-badge sp-badge-neutral" title={c.phone}>
                                  <Icon name="phone" size={10} stroke={1.6} />
                                </span>
                              )}
                              {c.url && (
                                <span className="sp-badge sp-badge-neutral" title={c.url}>
                                  <Icon name="globe" size={10} stroke={1.6} />
                                </span>
                              )}
                              {!c.url && c.discovered_url && (
                                <span className="sp-badge sp-badge-found" title={`Ιστότοπος βρέθηκε από το GreekLeads: ${c.discovered_url}`} style={{ padding: '0 4px' }}>
                                  <span className="gl-mark">GL</span>
                                </span>
                              )}
                              {SOCIAL_PLATFORMS.some(p => c[p.key]) && (
                                <span style={{ width: '0.5px', height: 12, background: 'var(--border)', flexShrink: 0 }} />
                              )}
                              {SOCIAL_PLATFORMS.map(p => c[p.key] ? (
                                <Icon key={p.key} name={p.icon} size={15} style={{ color: p.color, flexShrink: 0 }} />
                              ) : null)}
                              {!isActive && (
                                <span className="sp-badge sp-badge-inactive">Ανενεργή</span>
                              )}
                            </div>
                          </td>

                          <td className="sp-td-year">
                            {c.year_founded ?? '—'}
                          </td>

                          <td className="sp-td-actions" onClick={e => e.stopPropagation()}>
                            <button className="sp-action-btn" title="Preview" onClick={() => setPreviewArGemi(c.ar_gemi)}>
                              <Icon name="eye" size={14} />
                            </button>
                            <button className="sp-action-btn" title="Export" onClick={() => { setSelected(prev => { const s = new Set(prev); s.add(c.ar_gemi); return s }) }}>
                              <Icon name="download" size={14} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Card grid */}
            {viewMode === 'card' && (
              <div className="sp-cards-grid">
                {loading && Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="sp-card-item">
                    <div className="sp-skel" style={{ width: 36, height: 36, borderRadius: 8, marginBottom: 10 }} />
                    <div className="sp-skel" style={{ height: 13, width: '80%', marginBottom: 6 }} />
                    <div className="sp-skel" style={{ height: 11, width: '55%', marginBottom: 10 }} />
                    <div className="sp-skel" style={{ height: 18, width: '60%', borderRadius: 10 }} />
                  </div>
                ))}
                {!loading && sortedRows.map((c, idx) => {
                  const isSel    = selected.has(c.ar_gemi)
                  const col      = logoColor(c.ar_gemi)
                  const initials = getInitials(c.co_name_el)
                  const isActive = c.status_descr?.toLowerCase().includes('ενεργ')
                  const meta     = [
                    c.legal_type_descr ?? null,
                    c.municipality_descr || c.prefecture_descr || null,
                  ].filter(Boolean).join(' · ')

                  return (
                    <div
                      key={c.ar_gemi}
                      className="sp-card-item sp-row-enter"
                      style={{ animationDelay: `${idx * 14}ms`, cursor: 'pointer' }}
                      data-selected={isSel ? 'true' : 'false'}
                      onClick={() => router.push(`/etaireies/${c.ar_gemi}`)}
                    >
                      <span
                        className="sp-logo"
                        style={{ background: col.bg, color: col.fg, borderColor: col.border, width: 36, height: 36, borderRadius: 8, fontSize: 12 }}
                      >
                        {initials}
                      </span>
                      <div className="sp-card-item-name">{c.co_name_el}</div>
                      {meta && <div className="sp-card-item-meta">{meta}</div>}
                      <div className="sp-enrich-row" style={{ marginTop: 8 }}>
                        <span className="sp-badge sp-badge-gemi" title="ΓΕΜΗ">
                          <Icon name="verified" size={10} stroke={1.6} />ΓΕΜΗ
                        </span>
                        {c.email && <span className="sp-badge sp-badge-neutral" title={c.email}><Icon name="mail" size={9} stroke={1.6} /></span>}
                        {c.phone && <span className="sp-badge sp-badge-neutral" title={c.phone}><Icon name="phone" size={9} stroke={1.6} /></span>}
                        {c.url && <span className="sp-badge sp-badge-neutral" title={c.url}><Icon name="globe" size={9} stroke={1.6} /></span>}
                        {!c.url && c.discovered_url && <span className="sp-badge sp-badge-found" title={`Ιστότοπος βρέθηκε από το GreekLeads: ${c.discovered_url}`} style={{ padding: '0 4px' }}><span className="gl-mark" style={{ width: 13, height: 13 }}>GL</span></span>}
                        {SOCIAL_PLATFORMS.map(p => c[p.key] ? (
                          <Icon key={p.key} name={p.icon} size={12} style={{ color: p.color, flexShrink: 0 }} />
                        ) : null)}
                        {!isActive && <span className="sp-badge sp-badge-inactive">Ανενεργή</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Footer */}
            <div className="sp-card-footer">
              <div className="sp-footer-left">
                {selected.size > 0 ? (
                  <>
                    <span><span className="mono" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{selected.size}</span> επιλεγμένα</span>
                    <button className="sp-btn sp-btn-secondary sp-btn-sm" onClick={() => setSelected(new Set())}>Καθαρισμός</button>
                    <button className="sp-btn sp-btn-secondary sp-btn-sm">
                      <Icon name="bookmark" size={12} />
                      Αποθήκευση λίστας
                    </button>
                  </>
                ) : (
                  <span>Επιλέξτε γραμμές για εξαγωγή CSV</span>
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
                  Εξαγωγή ({selected.size})
                </button>
              </div>
            </div>
          </div>
          <div className="sp-card-spacer" />
        </div>

      </main>

      <CompanyPreviewPanel arGemi={previewArGemi} onClose={() => setPreviewArGemi(null)} />

      <ScoutPanel
        open={scoutOpen}
        onClose={() => setScoutOpen(false)}
        onApply={applyScoutRecipe}
      />
    </div>
    </>
  )
}
