'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Icon from './Icon'

// Company-to-company jump bar, shown above the header card on /etaireies/[ar_gemi].
// Backed by /api/suggest (companies only, trigram on co_name_el, 6 rows).
// Same debounce/stale-response/keyboard contract as the homepage hero — kept as a
// separate component because the hero's input is entangled with Scout mode.

interface Suggestion {
  ar_gemi: string
  name: string
  legal_type: string | null
  place: string | null
  status: string | null
}

// Mirrors CompanyPage's LOGO_COLORS so a company's avatar tint is the same
// colour in the dropdown as on the page you land on.
const LOGO_COLORS = [
  { bg: '#EEF4FF', fg: '#1A4A8A', border: '#C0D0E8' },
  { bg: '#F1F0EA', fg: '#3D3527', border: '#D7D2C0' },
  { bg: '#EAF3EE', fg: '#1F5C42', border: '#B6D4C2' },
  { bg: '#F5EEEA', fg: '#7A3826', border: '#E0CCBE' },
  { bg: '#EEEEF5', fg: '#3D3A6E', border: '#C5C3DC' },
  { bg: '#F4F1E8', fg: '#5F4A1E', border: '#DAD0A8' },
]

function logoColor(arGemi: string) {
  let h = 0
  for (let i = 0; i < arGemi.length; i++) h = (h * 31 + arGemi.charCodeAt(i)) >>> 0
  return LOGO_COLORS[h % LOGO_COLORS.length]
}

function initialOf(name: string): string {
  const w = name.trim().split(/\s+/).filter(x => x.length > 1)
  return (w[0]?.[0] ?? name[0] ?? '—').toUpperCase()
}

export default function CompanyQuickSearch({ currentArGemi }: { currentArGemi?: string }) {
  const router = useRouter()
  const [query, setQuery]   = useState('')
  const [open, setOpen]     = useState(false)
  const [items, setItems]   = useState<Suggestion[]>([])
  const [busy, setBusy]     = useState(false)
  const [cursor, setCursor] = useState(-1)
  const boxRef = useRef<HTMLDivElement>(null)
  const seqRef = useRef(0)

  const trimmed = query.trim()

  useEffect(() => {
    if (trimmed.length < 3) { setItems([]); setBusy(false); return }
    setBusy(true)
    const seq = ++seqRef.current
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(trimmed)}`)
        const d = await r.json()
        if (seq !== seqRef.current) return   // drop stale keystroke responses
        setItems(d.results ?? [])
      } catch {
        if (seq === seqRef.current) setItems([])
      } finally {
        if (seq === seqRef.current) setBusy(false)
      }
    }, 180)
    return () => clearTimeout(t)
  }, [trimmed])

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  // You're already on one of these pages — offering it as a destination is a dead click.
  const results = currentArGemi ? items.filter(s => s.ar_gemi !== currentArGemi) : items

  const goToSearch = () =>
    router.push(trimmed ? `/search?name=${encodeURIComponent(trimmed)}` : '/search')

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setOpen(true)
      setCursor(c => Math.min(c + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setCursor(c => Math.max(c - 1, -1))
    } else if (e.key === 'Enter') {
      // A highlighted row wins; a bare Enter falls through to full results.
      if (cursor >= 0 && results[cursor]) router.push(`/etaireies/${results[cursor].ar_gemi}`)
      else goToSearch()
    }
  }

  const showDrop = open && trimmed.length >= 3

  return (
    <div className="cq" ref={boxRef}>
      <div className="cq-field">
        <span className="cq-icon"><Icon name="search" size={15} /></span>
        <input
          className="cq-input"
          placeholder="Αναζητήστε άλλη εταιρεία…"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); setCursor(-1) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          aria-label="Αναζήτηση άλλης εταιρείας"
        />
        {trimmed && (
          <button
            className="cq-clear"
            onClick={() => { setQuery(''); setItems([]); setCursor(-1) }}
            aria-label="Καθαρισμός"
            type="button"
          >
            <Icon name="x" size={13} />
          </button>
        )}
      </div>

      {showDrop && (
        <div className="cq-drop">
          {results.length > 0 ? results.map((s, i) => {
            const col      = logoColor(s.ar_gemi)
            const isActive = s.status?.toLowerCase().includes('ενεργ')
            const meta     = [s.legal_type, s.place].filter(Boolean).join(' · ')
            return (
              <Link
                key={s.ar_gemi}
                href={`/etaireies/${s.ar_gemi}`}
                className="cq-row"
                data-cursor={i === cursor ? 'true' : 'false'}
                onMouseEnter={() => setCursor(i)}
              >
                <span
                  className="cq-row-logo"
                  style={{ background: col.bg, color: col.fg, border: `1px solid ${col.border}` }}
                >
                  {initialOf(s.name)}
                </span>
                <span className="cq-row-body">
                  <span className="cq-row-name">{s.name}</span>
                  {meta && <span className="cq-row-meta">{meta}</span>}
                </span>
                <span className={`cq-tag${isActive ? '' : ' off'}`}>
                  {isActive ? 'Ενεργή' : 'Ανενεργή'}
                </span>
              </Link>
            )
          }) : (
            <div className="cq-empty">
              {busy ? 'Αναζήτηση…' : `Καμία εταιρεία για «${trimmed}»`}
            </div>
          )}
          <button className="cq-foot" onClick={goToSearch} type="button">
            <Icon name="search" size={12} />
            Όλα τα αποτελέσματα για «{trimmed}»
          </button>
        </div>
      )}
    </div>
  )
}
