'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import Icon from './Icon'

/**
 * Split button in the /search topbar: the left half saves the current filters,
 * the caret opens the list of what you already saved.
 *
 * This is where saved searches live now. Πελατολόγιο (/crm) is closed while the
 * lists half of it is unfinished, and a saved search is only ever useful on the
 * search page anyway — you save it here and you run it here, so sending the user
 * to a separate page and back was always a detour.
 *
 * Applying does NOT navigate: it hands the stored filter object back to
 * SearchPage, which owns the state and syncs it to the URL itself.
 */

interface SavedSearch {
  id: string
  name: string
  filters: Record<string, unknown>
  scout_brief: string | null
  created_at: string
}

export default function SavedSearchMenu({
  onSave,
  onApply,
  refreshToken,
}: {
  onSave: () => void
  onApply: (filters: Record<string, unknown>) => void
  /** Bumped by SearchPage after the save dialog closes, so the list is current. */
  refreshToken: number
}) {
  const [open, setOpen]         = useState(false)
  const [rows, setRows]         = useState<SavedSearch[]>([])
  const [limit, setLimit]       = useState<number | null>(null)
  const [authed, setAuthed]     = useState(true)
  const [loading, setLoading]   = useState(false)
  const [loadedOnce, setLoaded] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/crm/searches')
      if (r.status === 401) { setAuthed(false); setRows([]); return }
      setAuthed(true)
      const d = await r.json()
      setRows(d.searches ?? [])
      setLimit(typeof d.limit === 'number' ? d.limit : null)
    } catch {
      // A failed load leaves the menu empty rather than showing a stale list —
      // silently applying yesterday's filters would be worse than showing none.
      setRows([])
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [])

  // Load on first open, then again whenever a save happened.
  useEffect(() => { if (open) load() }, [open, load])
  useEffect(() => { if (refreshToken > 0 && loadedOnce) load() }, [refreshToken, loadedOnce, load])

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const remove = async (id: string) => {
    setRows(rs => rs.filter(r => r.id !== id))   // optimistic; reload restores on failure
    const r = await fetch(`/api/crm/searches/${id}`, { method: 'DELETE' })
    if (!r.ok) load()
  }

  const apply = (s: SavedSearch) => {
    onApply(s.filters)
    setOpen(false)
  }

  const atCap = limit != null && Number.isFinite(limit) && rows.length >= limit

  return (
    <div className="ssm" ref={wrapRef}>
      <button className="sp-btn sp-btn-secondary ssm-save" onClick={onSave}>
        <Icon name="bookmark" size={13} />
        Αποθήκευση αναζήτησης
      </button>
      <button
        className="sp-btn sp-btn-secondary ssm-caret"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Αποθηκευμένες αναζητήσεις"
        data-on={open ? 'true' : 'false'}
      >
        <Icon name="chevron-down" size={13} />
      </button>

      {open && (
        <div className="ssm-menu" role="menu">
          <div className="ssm-head">
            <span>Αποθηκευμένες αναζητήσεις</span>
            {authed && limit != null && Number.isFinite(limit) && (
              <span className="ssm-count">{rows.length}/{limit}</span>
            )}
          </div>

          {!authed ? (
            <div className="ssm-empty">
              <p>Συνδεθείτε για να αποθηκεύετε αναζητήσεις.</p>
              <Link href="/sign-in" className="sp-btn sp-btn-primary sp-btn-sm">Σύνδεση</Link>
            </div>
          ) : loading && rows.length === 0 ? (
            <div className="ssm-empty"><p>Φόρτωση…</p></div>
          ) : rows.length === 0 ? (
            <div className="ssm-empty">
              <p>Δεν έχετε αποθηκεύσει καμία αναζήτηση ακόμη. Ρυθμίστε τα φίλτρα και
                 πατήστε «Αποθήκευση αναζήτησης».</p>
            </div>
          ) : (
            <div className="ssm-list">
              {rows.map(s => (
                <div key={s.id} className="ssm-row">
                  <button className="ssm-row-main" onClick={() => apply(s)} role="menuitem">
                    <span className="ssm-row-name">{s.name}</span>
                    {s.scout_brief && <span className="ssm-row-brief">«{s.scout_brief}»</span>}
                  </button>
                  <button
                    className="ssm-row-x"
                    onClick={() => remove(s.id)}
                    aria-label={`Διαγραφή «${s.name}»`}
                    title="Διαγραφή"
                  ><Icon name="x" size={12} /></button>
                </div>
              ))}
            </div>
          )}

          {authed && atCap && (
            <div className="ssm-cap">
              Φτάσατε το όριο του πλάνου σας. <Link href="/pricing">Δείτε τα πλάνα</Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
