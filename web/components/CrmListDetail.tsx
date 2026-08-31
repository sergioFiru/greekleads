'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import Icon from './Icon'
import YubotoCta from './YubotoCta'
import CrmDataGrid, { type GridRow } from './CrmDataGrid'
import { DEFAULT_COLUMNS, STAGES, stageOf } from '@/lib/crmColumns'

interface ListMeta {
  id: string
  name: string
  description: string | null
  is_live: boolean
  live_brief: string | null
  columns: string[] | null
  updated_at: string
}

export default function CrmListDetail({ listId }: { listId: string }) {
  const [meta, setMeta]       = useState<ListMeta | null>(null)
  const [rows, setRows]       = useState<GridRow[]>([])
  const [columns, setColumns] = useState<string[]>(DEFAULT_COLUMNS)
  const [canAlive, setCanAlive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/crm/lists/${listId}`)
      if (r.status === 404) { setNotFound(true); return }
      const d = await r.json()
      setMeta(d.list)
      setRows(d.members ?? [])
      setColumns(Array.isArray(d.list?.columns) && d.list.columns.length ? d.list.columns : DEFAULT_COLUMNS)
      setCanAlive(!!d.limits?.canBringAlive)
    } finally {
      setLoading(false)
    }
  }, [listId])

  useEffect(() => { load() }, [load])

  // Column layout is per-list and lives in the DB, so it follows the user
  // across devices. Applied locally first so the grid never lags the click.
  const saveColumns = (keys: string[]) => {
    setColumns(keys)
    fetch(`/api/crm/lists/${listId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columns: keys }),
    }).catch(() => {})
  }

  const patchRows = async (arGemis: string[], patch: Record<string, unknown>) => {
    // Optimistic: an inline stage change must feel instantaneous. A failed
    // request is corrected by the reload.
    setRows(rs => rs.map(r => arGemis.includes(r.ar_gemi) ? { ...r, ...patch } as GridRow : r))
    await fetch(`/api/crm/lists/${listId}/members`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ar_gemis: arGemis, ...patch }),
    })
    load()
  }

  const removeRows = async (arGemis: string[]) => {
    setRows(rs => rs.filter(r => !arGemis.includes(r.ar_gemi)))
    await fetch(`/api/crm/lists/${listId}/members`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ar_gemis: arGemis }),
    })
    load()
  }

  const rename = async (name: string) => {
    setRenaming(null)
    if (!name.trim() || name === meta?.name) return
    setMeta(m => m ? { ...m, name: name.trim() } : m)
    await fetch(`/api/crm/lists/${listId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
  }

  const stats = useMemo(() => {
    const counts: Record<string, number> = {}
    rows.forEach(r => { const k = r.stage ?? 'new'; counts[k] = (counts[k] ?? 0) + 1 })
    return {
      total: rows.length,
      email: rows.filter(r => r.email).length,
      phone: rows.filter(r => r.phone).length,
      web:   rows.filter(r => r.url ?? r.discovered_url).length,
      counts,
    }
  }, [rows])

  if (notFound) {
    return (
      <main className="crm">
        <div className="crm-empty-card">
          <div className="crm-empty-title">Η λίστα δεν βρέθηκε</div>
          <p>Μπορεί να διαγράφηκε ή να μην σας ανήκει.</p>
          <Link href="/crm" className="sp-btn sp-btn-primary">Πίσω στο πελατολόγιο</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="crm crm-wide">
      <div className="crm-crumb">
        <Link href="/crm">Πελατολόγιο</Link>
        <span>/</span>
        <span>{meta?.name ?? '…'}</span>
      </div>

      <div className="crm-head">
        <div style={{ minWidth: 0 }}>
          <h1 className="crm-h1">
            {renaming !== null ? (
              <input
                className="std-input"
                style={{ fontSize: 22, fontWeight: 700, height: 40, maxWidth: 460 }}
                value={renaming}
                autoFocus
                onChange={e => setRenaming(e.target.value)}
                onBlur={() => rename(renaming)}
                onKeyDown={e => {
                  if (e.key === 'Enter') rename(renaming)
                  if (e.key === 'Escape') setRenaming(null)
                }}
              />
            ) : (
              <button className="crm-title-btn" onClick={() => setRenaming(meta?.name ?? '')} title="Μετονομασία">
                {meta?.name ?? 'Φόρτωση…'}
              </button>
            )}
            {meta?.is_live && <span className="std-live-tag" style={{ marginLeft: 10 }}>Ζωντανή</span>}
          </h1>

          {/* Pipeline bar — proportional, so a list's shape is readable at a glance. */}
          {stats.total > 0 && (
            <div className="crm-pipe">
              <div className="crm-pipe-bar">
                {STAGES.map(s => {
                  const n = stats.counts[s.key] ?? 0
                  if (!n) return null
                  return (
                    <div
                      key={s.key}
                      className="crm-pipe-seg"
                      style={{ width: `${(n / stats.total) * 100}%`, background: s.fg }}
                      title={`${s.label}: ${n}`}
                    />
                  )
                })}
              </div>
              <div className="crm-pipe-legend">
                {STAGES.filter(s => stats.counts[s.key]).map(s => (
                  <span key={s.key}>
                    <span className="dg-stage-dot" style={{ background: s.fg }} />
                    {s.label} <strong>{stats.counts[s.key]}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="crm-stats">
          <div><span>{stats.total.toLocaleString('el-GR')}</span>επαφές</div>
          <div><span>{stats.email.toLocaleString('el-GR')}</span>email</div>
          <div><span>{stats.phone.toLocaleString('el-GR')}</span>τηλέφωνο</div>
          <div><span>{stats.web.toLocaleString('el-GR')}</span>website</div>
        </div>

        <div className="crm-head-action">
          <YubotoCta emailCount={stats.email} listName={meta?.name ?? 'η λίστα'} />
        </div>
      </div>

      <div className="crm-actionbar">
        {/* Bring it Alive — persists is_live/live_filters, engine not built. */}
        <div className={`crm-alive-inline${canAlive ? '' : ' locked'}`}>
          <Icon name="zap" size={12} />
          <span>Ζωντανή λίστα</span>
          <button className="std-toggle" data-on={meta?.is_live ? 'true' : 'false'} disabled aria-label="Ζωντανή λίστα"><span /></button>
          <span className="std-soon">Προσεχώς</span>
        </div>
        <span className="std-spacer" />
        <Link href="/search" className="sp-btn sp-btn-primary sp-btn-sm">
          <Icon name="plus" size={12} /> Προσθήκη εταιρειών
        </Link>
      </div>

      {loading ? (
        <div className="crm-empty">Φόρτωση…</div>
      ) : rows.length === 0 ? (
        <div className="crm-empty-card">
          <div className="crm-empty-title">Η λίστα είναι κενή</div>
          <p>Αναζητήστε εταιρείες και προσθέστε τις σε αυτή τη λίστα.</p>
          <Link href="/search" className="sp-btn sp-btn-primary">Αναζήτηση εταιρειών</Link>
        </div>
      ) : (
        <CrmDataGrid
          rows={rows}
          columns={columns}
          onColumnsChange={saveColumns}
          onPatch={patchRows}
          onRemove={removeRows}
          listName={meta?.name ?? 'lista'}
        />
      )}
    </main>
  )
}
