'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import Icon from './Icon'
import {
  COLUMNS, GROUP_LABELS, COLUMN_MAP, resolveColumns, stageOf, STAGES,
  type ColDef, type StageKey,
} from '@/lib/crmColumns'

export interface GridRow {
  ar_gemi: string
  co_name_el: string | null
  co_titles_el: string[] | null
  afm: string | null
  legal_type_descr: string | null
  status_descr: string | null
  is_branch: boolean | null
  year_founded: number | null
  prefecture_descr: string | null
  municipality_descr: string | null
  city: string | null
  address: string | null
  zip_code: string | null
  email: string | null
  phone: string | null
  fax: string | null
  url: string | null
  discovered_url: string | null
  linkedin_url: string | null
  instagram_url: string | null
  facebook_url: string | null
  twitter_url: string | null
  tiktok_url: string | null
  youtube_url: string | null
  primary_kad: string | null
  capital: Array<{ currency: string; capitalStock: number }> | null
  activities: Array<{ type: string; activity: { id: string; descr: string } }> | null
  note: string | null
  stage: string
  last_contacted: string | null
  added_by: string
  added_at: string
}

const SOCIAL_ICONS: Record<string, string> = {
  linkedin_url: 'linkedin', instagram_url: 'instagram', facebook_url: 'facebook',
  twitter_url: 'twitter-x', tiktok_url: 'tiktok', youtube_url: 'youtube',
}

function fmtDate(v: string | null): string {
  if (!v) return ''
  return new Date(v).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function fmtCapital(cap: GridRow['capital']): string {
  if (!Array.isArray(cap) || !cap.length) return ''
  const eur = cap.find(c => c.currency === 'EUR') ?? cap[0]
  if (!eur?.capitalStock) return ''
  return eur.capitalStock.toLocaleString('el-GR', { maximumFractionDigits: 0 }) + ' €'
}

function mainActivity(row: GridRow): string {
  const acts = Array.isArray(row.activities) ? row.activities : []
  const main = acts.find(a => (a.type ?? '').toUpperCase().includes('ΚΥΡΙΑ')) ?? acts[0]
  return main?.activity?.descr ?? ''
}

/** Plain text for sorting, filtering and CSV — never for rendering. */
export function cellText(row: GridRow, key: string): string {
  switch (key) {
    case 'brand':    return (row.co_titles_el ?? []).join(' · ')
    case 'website':  return row.url ?? row.discovered_url ?? ''
    case 'capital':  return fmtCapital(row.capital)
    case 'kad_descr':return mainActivity(row)
    case 'stage':    return stageOf(row.stage).label
    case 'is_branch':return row.is_branch ? 'Ναι' : ''
    case 'added_by': return row.added_by === 'live' ? 'Αυτόματα' : 'Χειροκίνητα'
    case 'added_at':
    case 'last_contacted': return fmtDate(row[key] as string | null)
    default: {
      const v = (row as unknown as Record<string, unknown>)[key]
      return v == null ? '' : String(v)
    }
  }
}

export default function CrmDataGrid({
  rows, columns, onColumnsChange, onPatch, onRemove, listName,
}: {
  rows: GridRow[]
  columns: string[]
  onColumnsChange: (keys: string[]) => void
  onPatch: (arGemis: string[], patch: Record<string, unknown>) => void
  onRemove: (arGemis: string[]) => void
  listName: string
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sort, setSort]         = useState<{ key: string; desc: boolean }>({ key: 'added_at', desc: true })
  const [q, setQ]               = useState('')
  const [stageFilter, setStageFilter] = useState<StageKey | null>(null)
  const [pickerOpen, setPickerOpen]   = useState(false)
  const [editing, setEditing]   = useState<{ ar: string; key: string; value: string } | null>(null)
  const [stageMenu, setStageMenu] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  const cols = useMemo(() => resolveColumns(columns), [columns])

  useEffect(() => {
    if (!pickerOpen && !stageMenu) return
    const h = (e: MouseEvent) => {
      if (pickerOpen && !pickerRef.current?.contains(e.target as Node)) setPickerOpen(false)
      if (stageMenu) setStageMenu(null)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [pickerOpen, stageMenu])

  // ── filter + sort ────────────────────────────────────────────
  const view = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let out = rows
    if (stageFilter) out = out.filter(r => (r.stage ?? 'new') === stageFilter)
    if (needle) {
      // Search across the columns actually on screen — searching hidden fields
      // would return rows with no visible reason for matching.
      out = out.filter(r => cols.some(c => cellText(r, c.key).toLowerCase().includes(needle)))
    }
    const def = COLUMN_MAP.get(sort.key)
    const sorted = [...out].sort((a, b) => {
      if (def?.numeric) {
        const av = parseFloat(cellText(a, sort.key).replace(/[^\d.-]/g, '')) || 0
        const bv = parseFloat(cellText(b, sort.key).replace(/[^\d.-]/g, '')) || 0
        return sort.desc ? bv - av : av - bv
      }
      const av = cellText(a, sort.key), bv = cellText(b, sort.key)
      // Blanks always sort last regardless of direction — an empty Email column
      // at the top of a descending sort is never what anyone wants.
      if (!av && bv) return 1
      if (av && !bv) return -1
      return sort.desc ? bv.localeCompare(av, 'el') : av.localeCompare(bv, 'el')
    })
    return sorted
  }, [rows, q, stageFilter, sort, cols])

  const allShown = view.length > 0 && view.every(r => selected.has(r.ar_gemi))
  const toggleAll = () => {
    setSelected(prev => {
      const s = new Set(prev)
      if (allShown) view.forEach(r => s.delete(r.ar_gemi))
      else view.forEach(r => s.add(r.ar_gemi))
      return s
    })
  }

  const stageCounts = useMemo(() => {
    const m: Record<string, number> = {}
    rows.forEach(r => { const k = r.stage ?? 'new'; m[k] = (m[k] ?? 0) + 1 })
    return m
  }, [rows])

  const toggleColumn = (key: string) => {
    const def = COLUMN_MAP.get(key)
    if (def?.locked) return
    const next = columns.includes(key)
      ? columns.filter(k => k !== key)
      : [...columns, key]
    onColumnsChange(next)
  }

  const commitEdit = () => {
    if (!editing) return
    const { ar, key, value } = editing
    setEditing(null)
    onPatch([ar], { [key]: value.trim() || null })
  }

  const exportCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
    const csv = [
      cols.map(c => esc(c.label)).join(','),
      ...view.map(r => cols.map(c => esc(cellText(r, c.key))).join(',')),
    ].join('\n')
    // Excel on Greek Windows needs the BOM or the accents come out mangled.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${listName.replace(/[^\wΆ-ώ\-]+/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── cell renderer ────────────────────────────────────────────
  const renderCell = (row: GridRow, col: ColDef) => {
    const text = cellText(row, col.key)

    if (col.kind === 'stage') {
      const st = stageOf(row.stage)
      return (
        <div className="dg-stage-wrap">
          <button
            className="dg-stage"
            style={{ background: st.bg, color: st.fg, borderColor: st.border }}
            onClick={e => { e.stopPropagation(); setStageMenu(stageMenu === row.ar_gemi ? null : row.ar_gemi) }}
          >
            <span className="dg-stage-dot" style={{ background: st.fg }} />
            {st.label}
            <Icon name="chevron-down" size={10} />
          </button>
          {stageMenu === row.ar_gemi && (
            <div className="dg-stage-menu" onClick={e => e.stopPropagation()}>
              {STAGES.map(s => (
                <button
                  key={s.key}
                  onClick={() => { setStageMenu(null); onPatch([row.ar_gemi], { stage: s.key }) }}
                >
                  <span className="dg-stage-dot" style={{ background: s.fg }} />
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )
    }

    if (col.kind === 'note') {
      if (editing?.ar === row.ar_gemi && editing.key === 'note') {
        return (
          <input
            className="dg-edit"
            value={editing.value}
            autoFocus
            onChange={e => setEditing({ ...editing, value: e.target.value })}
            onBlur={commitEdit}
            onKeyDown={e => {
              if (e.key === 'Enter') commitEdit()
              if (e.key === 'Escape') setEditing(null)
            }}
          />
        )
      }
      return (
        <button
          className={`dg-note${text ? '' : ' empty'}`}
          onClick={e => { e.stopPropagation(); setEditing({ ar: row.ar_gemi, key: 'note', value: row.note ?? '' }) }}
        >
          {text || '+'}
        </button>
      )
    }

    if (!text) return <span className="dg-empty">—</span>

    switch (col.kind) {
      case 'link':
        return <Link href={`/etaireies/${row.ar_gemi}`} className="dg-link">{text}</Link>
      case 'email':
        return <a href={`mailto:${text}`} className="dg-link" title={text}>{text}</a>
      case 'phone':
        return <a href={`tel:${text}`} className="dg-link dg-mono">{text}</a>
      case 'url':
        return (
          <a href={text.startsWith('http') ? text : `https://${text}`} target="_blank" rel="noopener noreferrer" className="dg-link" title={text}>
            {text.replace(/^https?:\/\//, '').replace(/\/$/, '')}
          </a>
        )
      case 'social':
        return (
          <a href={text} target="_blank" rel="noopener noreferrer" className="dg-social" title={text}>
            <Icon name={SOCIAL_ICONS[col.key] ?? 'globe'} size={13} />
          </a>
        )
      case 'badge': {
        const on = text.toLowerCase().includes('ενεργ')
        return <span className={`dg-badge${on ? ' on' : ''}`}>{text}</span>
      }
      case 'mono':
        return <span className="dg-mono">{text}</span>
      default:
        return <span title={text}>{text}</span>
    }
  }

  return (
    <div className="dg-wrap">
      {/* ── toolbar ── */}
      <div className="dg-toolbar">
        <div className="dg-search">
          <Icon name="search" size={13} />
          <input
            placeholder="Φιλτράρισμα στη λίστα…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          {q && <button onClick={() => setQ('')} aria-label="Καθαρισμός"><Icon name="x" size={12} /></button>}
        </div>

        <div className="dg-stagefilters">
          <button className={`dg-chip${stageFilter === null ? ' on' : ''}`} onClick={() => setStageFilter(null)}>
            Όλα <span>{rows.length}</span>
          </button>
          {STAGES.map(s => (
            <button
              key={s.key}
              className={`dg-chip${stageFilter === s.key ? ' on' : ''}`}
              onClick={() => setStageFilter(stageFilter === s.key ? null : s.key)}
              style={stageFilter === s.key ? { background: s.bg, color: s.fg, borderColor: s.border } : undefined}
            >
              <span className="dg-stage-dot" style={{ background: s.fg }} />
              {s.label} <span>{stageCounts[s.key] ?? 0}</span>
            </button>
          ))}
        </div>

        <span className="std-spacer" />

        <div className="dg-picker-wrap" ref={pickerRef}>
          <button className="sp-btn sp-btn-secondary sp-btn-sm" onClick={() => setPickerOpen(v => !v)}>
            <Icon name="columns" size={13} />
            Στήλες <span className="dg-count">{cols.length}</span>
          </button>
          {pickerOpen && (
            <div className="dg-picker">
              <div className="dg-picker-head">Εμφάνιση στηλών</div>
              {(['identity', 'contact', 'location', 'business'] as const).map(g => (
                <div key={g} className="dg-picker-group">
                  <div className="dg-picker-glabel">{GROUP_LABELS[g]}</div>
                  {COLUMNS.filter(c => c.group === g).map(c => (
                    <label key={c.key} className={`dg-picker-item${c.locked ? ' locked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={columns.includes(c.key) || !!c.locked}
                        disabled={!!c.locked}
                        onChange={() => toggleColumn(c.key)}
                      />
                      {c.label}
                      {c.locked && <span className="dg-lock">κλειδωμένη</span>}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <button className="sp-btn sp-btn-secondary sp-btn-sm" onClick={exportCsv} disabled={!view.length}>
          <Icon name="download" size={13} /> CSV
        </button>
      </div>

      {/* ── bulk action bar ── */}
      {selected.size > 0 && (
        <div className="dg-bulk">
          <strong>{selected.size}</strong> επιλεγμένα
          <span className="dg-bulk-sep" />
          <span className="dg-bulk-label">Ορισμός σταδίου:</span>
          {STAGES.map(s => (
            <button
              key={s.key}
              className="dg-bulk-stage"
              style={{ background: s.bg, color: s.fg, borderColor: s.border }}
              onClick={() => { onPatch(Array.from(selected), { stage: s.key }); setSelected(new Set()) }}
            >{s.label}</button>
          ))}
          <span className="std-spacer" />
          <button className="dg-bulk-remove" onClick={() => { onRemove(Array.from(selected)); setSelected(new Set()) }}>
            Αφαίρεση
          </button>
          <button className="dg-bulk-clear" onClick={() => setSelected(new Set())}>Καθαρισμός</button>
        </div>
      )}

      {/* ── grid ── */}
      <div className="dg-scroll">
        <table className="dg">
          <thead>
            <tr>
              <th className="dg-th-check">
                <input type="checkbox" checked={allShown} onChange={toggleAll} aria-label="Επιλογή όλων" />
              </th>
              {cols.map((c, i) => (
                <th
                  key={c.key}
                  className={`${i === 0 ? 'dg-sticky' : ''}${c.numeric ? ' dg-num' : ''}`}
                  style={{ width: c.width, minWidth: c.width }}
                  onClick={() => setSort(s => ({ key: c.key, desc: s.key === c.key ? !s.desc : false }))}
                >
                  {c.label}
                  {sort.key === c.key && (
                    <Icon name={sort.desc ? 'chevron-down' : 'chevron-up'} size={11} />
                  )}
                </th>
              ))}
              <th className="dg-th-actions" />
            </tr>
          </thead>
          <tbody>
            {view.map(r => {
              const sel = selected.has(r.ar_gemi)
              return (
                <tr key={r.ar_gemi} data-selected={sel ? 'true' : 'false'}>
                  <td className="dg-td-check">
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() => setSelected(prev => {
                        const s = new Set(prev)
                        s.has(r.ar_gemi) ? s.delete(r.ar_gemi) : s.add(r.ar_gemi)
                        return s
                      })}
                      aria-label={r.co_name_el ?? r.ar_gemi}
                    />
                  </td>
                  {cols.map((c, i) => (
                    <td
                      key={c.key}
                      className={`${i === 0 ? 'dg-sticky' : ''}${c.numeric ? ' dg-num' : ''}`}
                      style={{ width: c.width, minWidth: c.width }}
                    >
                      {renderCell(r, c)}
                    </td>
                  ))}
                  <td className="dg-td-actions">
                    <button onClick={() => onRemove([r.ar_gemi])} title="Αφαίρεση από τη λίστα">
                      <Icon name="x" size={12} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {view.length === 0 && (
          <div className="dg-none">
            {rows.length === 0
              ? 'Η λίστα είναι κενή.'
              : 'Καμία εγγραφή δεν ταιριάζει με το φίλτρο.'}
          </div>
        )}
      </div>

      <div className="dg-foot">
        {view.length.toLocaleString('el-GR')}
        {view.length !== rows.length && ` από ${rows.length.toLocaleString('el-GR')}`} εγγραφές
      </div>
    </div>
  )
}
