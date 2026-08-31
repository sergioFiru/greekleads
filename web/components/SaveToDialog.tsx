'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Icon from './Icon'

// One dialog behind both "Αποθήκευση" buttons on /search. Which tab opens first
// depends on whether the user has rows selected — see SearchPage.

interface ListRow {
  id: string
  name: string
  description: string | null
  is_live: boolean
  member_count: number
  with_email: number
  updated_at: string
}

interface Pill { id: string; key: string; value: string }

type Tab = 'search' | 'list'
import type { PlanName } from '@/lib/entitlements'

type Plan = PlanName

export default function SaveToDialog({
  open,
  onClose,
  defaultTab,
  filters,
  pills,
  selectedIds,
  allMatching,
  excludedIds,
  totalResults,
  scoutBrief,
}: {
  open: boolean
  onClose: () => void
  defaultTab: Tab
  filters: unknown
  pills: Pill[]
  selectedIds: string[]
  /** The user chose "select all N matching" — the rows are not in the browser. */
  allMatching: boolean
  /** Rows unticked after that choice. */
  excludedIds: string[]
  totalResults: number | null
  scoutBrief: string | null
}) {
  const [tab, setTab]         = useState<Tab>(defaultTab)
  const [lists, setLists]     = useState<ListRow[]>([])
  const [plan, setPlan]       = useState<Plan>('free')
  const [limits, setLimits]   = useState({ maxLists: 1, maxSavedSearches: 3, canBringAlive: false })
  const [savedCount, setSavedCount] = useState(0)
  const [authed, setAuthed]   = useState(true)
  const [loading, setLoading] = useState(false)

  const [listMode, setListMode]   = useState<'new' | 'existing'>('new')
  const [newName, setNewName]     = useState('')
  const [targetId, setTargetId]   = useState<string | null>(null)
  const [searchName, setSearchName] = useState('')
  const [bringAlive, setBringAlive] = useState(false)

  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone]   = useState<string | null>(null)

  useEffect(() => { if (open) setTab(defaultTab) }, [open, defaultTab])

  // Load lists + saved-search count whenever the dialog opens, so caps and
  // existing names are current rather than whatever was cached earlier.
  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [lr, sr] = await Promise.all([
        fetch('/api/crm/lists'),
        fetch('/api/crm/searches'),
      ])
      if (lr.status === 401 || sr.status === 401) { setAuthed(false); return }
      setAuthed(true)
      const ld = await lr.json()
      const sd = await sr.json()
      setLists(ld.lists ?? [])
      setPlan(ld.plan ?? 'free')
      setSavedCount((sd.searches ?? []).length)
      setLimits({
        maxLists:         ld.limits?.maxLists ?? 1,
        maxSavedSearches: sd.limit ?? 3,
        canBringAlive:    !!ld.limits?.canBringAlive,
      })
      // Land on "pick existing" when they already have lists — the common case
      // after the first one.
      if ((ld.lists ?? []).length > 0) {
        setListMode('existing')
        setTargetId(ld.lists[0].id)
      } else {
        setListMode('new')
      }
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

  const atListCap   = Number.isFinite(limits.maxLists) && lists.length >= limits.maxLists
  const atSearchCap = Number.isFinite(limits.maxSavedSearches) && savedCount >= limits.maxSavedSearches
  const canAlive    = limits.canBringAlive
  // In allMatching mode the selection is the filter set, so the count comes
  // from the server's total rather than from an array of ids.
  const selCount = allMatching
    ? Math.max(0, (totalResults ?? 0) - excludedIds.length)
    : selectedIds.length

  // ── actions ──────────────────────────────────────────────────

  const saveSearch = async () => {
    if (!searchName.trim() || busy) return
    setBusy(true); setError(null)
    try {
      const r = await fetch('/api/crm/searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: searchName.trim(), filters, brief: scoutBrief }),
      })
      const d = await r.json()
      if (!r.ok) {
        setError(d.error === 'limit'
          ? `Το δωρεάν πλάνο επιτρέπει ${d.limit} αποθηκευμένες αναζητήσεις.`
          : d.error ?? 'Κάτι πήγε στραβά.')
        return
      }
      setDone(`Η αναζήτηση «${d.name}» αποθηκεύτηκε.`)
      setSearchName('')
      setSavedCount(c => c + 1)
    } catch {
      setError('Κάτι πήγε στραβά.')
    } finally { setBusy(false) }
  }

  /** mode 'selected' sends the ids; mode 'all' sends the filters instead. */
  const addToList = async (mode: 'selected' | 'all') => {
    if (busy) return
    setBusy(true); setError(null)
    try {
      // Create first when the user is making a new list.
      let listId = targetId
      if (listMode === 'new') {
        if (!newName.trim()) { setError('Δώστε όνομα λίστας.'); return }
        const cr = await fetch('/api/crm/lists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newName.trim(),
            // Stored now so the list is ready when the matcher ships; is_live
            // stays false server-side regardless of this toggle in v1.
            filters: bringAlive ? filters : null,
            brief: bringAlive ? scoutBrief : null,
          }),
        })
        const cd = await cr.json()
        if (!cr.ok) {
          setError(cd.error === 'limit'
            ? `Το δωρεάν πλάνο επιτρέπει ${cd.limit} λίστα.`
            : cd.error ?? 'Κάτι πήγε στραβά.')
          return
        }
        listId = cd.id
      }
      if (!listId) { setError('Επιλέξτε λίστα.'); return }

      // allMatching has no id list to send, so it always goes through the
      // server-side filters path — carrying the exclusions with it.
      const payload = (mode === 'all' || allMatching)
        ? { filters, excluded: excludedIds }
        : { ar_gemis: selectedIds }
      const r = await fetch(`/api/crm/lists/${listId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await r.json()
      if (!r.ok) {
        setError(d.error === 'limit'
          ? `Η λίστα έφτασε το όριο των ${d.limit} επαφών του πλάνου σας.`
          : d.error ?? 'Κάτι πήγε στραβά.')
        return
      }

      // Say what actually landed. Duplicates and cap-truncation are normal
      // outcomes here, not errors, but silently under-adding would be a lie.
      const bits = [`${d.added} ${d.added === 1 ? 'εταιρεία προστέθηκε' : 'εταιρείες προστέθηκαν'}`]
      if (d.skipped)   bits.push(`${d.skipped} ήταν ήδη στη λίστα`)
      if (d.truncated) bits.push('συμπληρώθηκε το όριο του πλάνου')
      setDone(bits.join(' · '))
      await load()
      setListMode('existing')
    } catch {
      setError('Κάτι πήγε στραβά.')
    } finally { setBusy(false) }
  }

  // ── render ───────────────────────────────────────────────────

  return (
    <div className="std-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="std" role="dialog" aria-modal="true" aria-label="Αποθήκευση">

        <div className="std-head">
          <span className="std-title">Αποθήκευση</span>
          <button className="std-x" onClick={onClose} aria-label="Κλείσιμο"><Icon name="x" size={15} /></button>
        </div>

        <div className="std-tabs">
          <button className={`std-tab${tab === 'search' ? ' on' : ''}`} onClick={() => setTab('search')}>
            Ως αναζήτηση
          </button>
          <button className={`std-tab${tab === 'list' ? ' on' : ''}`} onClick={() => setTab('list')}>
            Σε λίστα
            {selCount > 0 && <span className="std-tab-count">{selCount}</span>}
          </button>
        </div>

        <div className="std-body">
          {!authed ? (
            <div className="std-signin">
              <p>Συνδεθείτε για να αποθηκεύσετε αναζητήσεις και λίστες.</p>
              <Link href="/sign-in" className="btn btn-primary">Σύνδεση</Link>
            </div>
          ) : loading ? (
            <div className="std-empty">Φόρτωση…</div>
          ) : tab === 'search' ? (
            <>
              <label className="std-label">Όνομα αναζήτησης</label>
              <input
                className="std-input"
                value={searchName}
                onChange={e => setSearchName(e.target.value)}
                placeholder="π.χ. Ξενοδοχεία Κρήτης με email"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') saveSearch() }}
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

              {atSearchCap && (
                <div className="std-cap">
                  Φτάσατε το όριο των {limits.maxSavedSearches} αποθηκευμένων αναζητήσεων του δωρεάν πλάνου.{' '}
                  <Link href="/pricing">Δείτε τα πλάνα</Link>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="std-modes">
                <button
                  className={`std-mode${listMode === 'new' ? ' on' : ''}`}
                  onClick={() => setListMode('new')}
                  disabled={atListCap}
                >
                  <Icon name="plus" size={12} /> Νέα λίστα
                </button>
                <button
                  className={`std-mode${listMode === 'existing' ? ' on' : ''}`}
                  onClick={() => setListMode('existing')}
                  disabled={lists.length === 0}
                >
                  Υπάρχουσα ({lists.length})
                </button>
              </div>

              {listMode === 'new' ? (
                atListCap ? (
                  <div className="std-cap">
                    Το δωρεάν πλάνο περιλαμβάνει {limits.maxLists} λίστα. Προσθέστε σε αυτή που έχετε,
                    ή <Link href="/pricing">αναβαθμίστε</Link> για απεριόριστες.
                  </div>
                ) : (
                  <>
                    <label className="std-label">Όνομα λίστας</label>
                    <input
                      className="std-input"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      placeholder="π.χ. Ξενοδοχεία Κρήτης"
                      autoFocus
                    />
                  </>
                )
              ) : (
                <div className="std-listpick">
                  {lists.map(l => (
                    <button
                      key={l.id}
                      className={`std-listrow${targetId === l.id ? ' on' : ''}`}
                      onClick={() => setTargetId(l.id)}
                    >
                      <span className="std-radio" data-on={targetId === l.id ? 'true' : 'false'} />
                      <span className="std-listrow-body">
                        <span className="std-listrow-name">{l.name}</span>
                        <span className="std-listrow-meta">
                          {l.member_count.toLocaleString('el-GR')} επαφές
                          {l.with_email > 0 && ` · ${l.with_email.toLocaleString('el-GR')} με email`}
                        </span>
                      </span>
                      {l.is_live && <span className="std-live-tag">Ζωντανή</span>}
                    </button>
                  ))}
                </div>
              )}

              {/* "Bring it Alive" — stored, not yet acted on. Deliberately
                  visible-but-disabled so the capability is discoverable. */}
              <div className={`std-alive${canAlive ? '' : ' locked'}`}>
                <div className="std-alive-head">
                  <Icon name="zap" size={13} />
                  <span className="std-alive-title">Ζωντανή λίστα</span>
                  <span className="std-soon">Προσεχώς</span>
                  <span className="std-spacer" />
                  <button
                    className="std-toggle"
                    data-on={bringAlive ? 'true' : 'false'}
                    onClick={() => canAlive && setBringAlive(v => !v)}
                    disabled
                    aria-label="Ζωντανή λίστα"
                  ><span /></button>
                </div>
                <div className="std-alive-desc">
                  Νέες εταιρείες που ταιριάζουν με αυτά τα φίλτρα θα προστίθενται αυτόματα στη λίστα.
                  {!canAlive && ' Διαθέσιμο στα επί πληρωμή πλάνα.'}
                </div>
              </div>
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

            {tab === 'search' ? (
              <button
                className="sp-btn sp-btn-primary"
                onClick={saveSearch}
                disabled={busy || atSearchCap || !searchName.trim()}
              >
                {busy ? 'Αποθήκευση…' : 'Αποθήκευση αναζήτησης'}
              </button>
            ) : (
              <>
                {!allMatching && totalResults != null && totalResults > selCount && (
                  <button
                    className="sp-btn sp-btn-secondary"
                    onClick={() => addToList('all')}
                    disabled={busy || (listMode === 'new' && atListCap)}
                    title="Προσθήκη όλων των εταιρειών που ταιριάζουν με τα φίλτρα"
                  >
                    Προσθήκη και των {totalResults.toLocaleString('el-GR')}
                  </button>
                )}
                <button
                  className="sp-btn sp-btn-primary"
                  onClick={() => addToList('selected')}
                  disabled={busy || selCount === 0 || (listMode === 'new' && atListCap)}
                >
                  {busy
                    ? 'Αποθήκευση…'
                    : `Προσθήκη ${selCount.toLocaleString('el-GR')} επιλεγμένων`}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
