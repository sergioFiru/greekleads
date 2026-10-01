'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Icon from './Icon'

// Behind "Αποθήκευση αναζήτησης" on /search.
//
// This used to be a two-tab dialog — "Ως αναζήτηση" and "Σε λίστα". Lists went
// with Πελατολόγιο when that was closed, so only the filter set is saved here
// now, and the saved ones are applied from SavedSearchMenu next door.

import type { PlanName } from '@/lib/entitlements'

interface Pill { id: string; key: string; value: string }

export default function SaveToDialog({
  open,
  onClose,
  filters,
  pills,
  totalResults,
  scoutBrief,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  filters: unknown
  pills: Pill[]
  totalResults: number | null
  scoutBrief: string | null
  /** Lets the topbar menu reload without waiting for its own next open. */
  onSaved: () => void
}) {
  const [plan, setPlan]     = useState<PlanName>('free')
  const [limit, setLimit]   = useState<number>(3)
  const [count, setCount]   = useState(0)
  const [authed, setAuthed] = useState(true)
  const [loading, setLoading] = useState(false)

  const [name, setName]   = useState('')
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone]   = useState<string | null>(null)

  // Reload the cap on every open, so it reflects a plan change or a deletion
  // made from the menu rather than whatever was cached earlier.
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/crm/searches')
      if (r.status === 401) { setAuthed(false); return }
      setAuthed(true)
      const d = await r.json()
      setCount((d.searches ?? []).length)
      setPlan(d.plan ?? 'free')
      if (typeof d.limit === 'number') setLimit(d.limit)
    } catch {
      setError('Δεν ήταν δυνατή η φόρτωση.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (open) { load(); setDone(null); setError(null) } }, [open, load])

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null

  const atCap = Number.isFinite(limit) && count >= limit

  const save = async () => {
    if (!name.trim() || busy) return
    setBusy(true); setError(null)
    try {
      const r = await fetch('/api/crm/searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), filters, brief: scoutBrief }),
      })
      const d = await r.json()
      if (!r.ok) {
        setError(d.error === 'limit'
          ? `Το πλάνο σας επιτρέπει ${d.limit} αποθηκευμένες αναζητήσεις.`
          : d.error ?? 'Κάτι πήγε στραβά.')
        return
      }
      setDone(`Η αναζήτηση «${d.name}» αποθηκεύτηκε.`)
      setName('')
      setCount(c => c + 1)
      onSaved()
    } catch {
      setError('Κάτι πήγε στραβά.')
    } finally { setBusy(false) }
  }

  return (
    <div className="std-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="std" role="dialog" aria-modal="true" aria-label="Αποθήκευση αναζήτησης">

        <div className="std-head">
          <span className="std-title">Αποθήκευση αναζήτησης</span>
          <button className="std-x" onClick={onClose} aria-label="Κλείσιμο"><Icon name="x" size={15} /></button>
        </div>

        <div className="std-body">
          {!authed ? (
            <div className="std-signin">
              <p>Συνδεθείτε για να αποθηκεύσετε αυτή την αναζήτηση.</p>
              <Link href="/sign-in" className="btn btn-primary">Σύνδεση</Link>
            </div>
          ) : loading ? (
            <div className="std-empty">Φόρτωση…</div>
          ) : (
            <>
              <label className="std-label">Όνομα αναζήτησης</label>
              <input
                className="std-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="π.χ. Ξενοδοχεία Κρήτης με email"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') save() }}
              />

              <div className="std-summary">
                <div className="std-label" style={{ marginBottom: 8 }}>Τα φίλτρα που αποθηκεύονται</div>
                {pills.length ? (
                  <div className="std-pills">
                    {pills.map(p => (
                      <span key={p.id} className="std-pill">
                        <span className="std-pill-k">{p.key}</span>{p.value}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="std-muted">Καμία ενεργή επιλογή φίλτρου.</div>
                )}
                {totalResults != null && (
                  <div className="std-muted" style={{ marginTop: 8 }}>
                    {totalResults.toLocaleString('el-GR')} εταιρείες αυτή τη στιγμή
                  </div>
                )}
              </div>

              {atCap && (
                <div className="std-cap">
                  Φτάσατε το όριο των {limit} αποθηκευμένων αναζητήσεων
                  {plan === 'free' ? ' του δωρεάν πλάνου' : ''}.{' '}
                  <Link href="/pricing">Δείτε τα πλάνα</Link>
                </div>
              )}
            </>
          )}

          {error && <div className="std-error">{error}</div>}
          {done  && <div className="std-done"><Icon name="check" size={13} />{done}</div>}
        </div>

        {authed && !loading && (
          <div className="std-foot">
            <button className="sp-btn sp-btn-secondary" onClick={onClose}>
              {done ? 'Κλείσιμο' : 'Άκυρο'}
            </button>
            <button
              className="sp-btn sp-btn-primary"
              onClick={save}
              disabled={busy || atCap || !name.trim()}
            >
              {busy ? 'Αποθήκευση…' : 'Αποθήκευση'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
