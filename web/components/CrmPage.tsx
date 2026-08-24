'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Icon from './Icon'
import { STAGES } from '@/lib/crmColumns'

interface ListRow {
  id: string
  name: string
  description: string | null
  is_live: boolean
  member_count: number
  with_email: number
  with_phone: number
  stages: Record<string, number>
  updated_at: string
}

interface SavedSearch {
  id: string
  name: string
  filters: Record<string, unknown>
  scout_brief: string | null
  created_at: string
}

type Tab = 'lists' | 'searches'

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('el-GR', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Must match SearchPage's KAD_SESSION_KEY / KAD_URL_MAX — a saved search with
// hundreds of KAD codes would otherwise build a URL long enough to 431, which is
// exactly the handoff the Scout hero already solves this way.
const KAD_SESSION_KEY = 'gl_kad_filter'
const KAD_URL_MAX = 5

const FLAG_PARAMS: Array<[string, string]> = [
  ['has_email', 'email'],
  ['has_phone', 'phone'],
  ['has_website', 'website'],
  ['has_no_website', 'no_website'],
  ['has_instagram', 'instagram'],
  ['has_facebook', 'facebook'],
  ['has_linkedin', 'linkedin'],
  ['has_twitter', 'twitter'],
  ['has_tiktok', 'tiktok'],
  ['has_youtube', 'youtube'],
]

/**
 * Rebuilds a /search URL from a stored filter set. Param names mirror
 * SearchPage's parseParams() exactly — if those diverge, a saved search would
 * silently reopen with the wrong filters.
 *
 * Side effect: when the KAD list is long it is handed over via sessionStorage,
 * so call this from the click handler, not during render.
 */
function searchHref(filters: Record<string, unknown>): string {
  const p = new URLSearchParams()
  const arr = (k: string, v: unknown) => {
    if (Array.isArray(v)) v.forEach(x => p.append(k, String(x)))
  }
  if (filters.name) p.set('name', String(filters.name))
  arr('status', filters.statuses)
  arr('prefecture', filters.prefectures)
  arr('legal_type', filters.legal_types)
  if (filters.municipality) p.set('municipality', String(filters.municipality))
  if (filters.year_from)    p.set('year_from', String(filters.year_from))
  if (filters.year_to)      p.set('year_to', String(filters.year_to))
  for (const [key, param] of FLAG_PARAMS) if (filters[key]) p.set(param, '1')

  const acts = Array.isArray(filters.activities) ? (filters.activities as string[]) : []
  if (acts.length > KAD_URL_MAX) {
    try {
      sessionStorage.setItem(KAD_SESSION_KEY, JSON.stringify(acts))
      p.set('has_kad', '1')
    } catch {
      // sessionStorage unavailable — fall back to putting them in the URL and
      // accept the length rather than dropping the filter silently.
      acts.forEach(a => p.append('kad', a))
    }
  } else {
    acts.forEach(a => p.append('kad', a))
  }

  return `/search?${p.toString()}`
}

export default function CrmPage() {
  const router = useRouter()
  const [tab, setTab]         = useState<Tab>('lists')
  const [lists, setLists]     = useState<ListRow[]>([])
  const [searches, setSearches] = useState<SavedSearch[]>([])
  const [plan, setPlan]       = useState<'free' | 'paid'>('free')
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [lr, sr] = await Promise.all([fetch('/api/crm/lists'), fetch('/api/crm/searches')])
      const ld = await lr.json()
      const sd = await sr.json()
      setLists(ld.lists ?? [])
      setPlan(ld.plan ?? 'free')
      setSearches(sd.searches ?? [])
    } catch {
      setError('Δεν ήταν δυνατή η φόρτωση του πελατολογίου.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!menuFor) return
    const h = () => setMenuFor(null)
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [menuFor])

  const deleteList = async (id: string, name: string) => {
    // Removing a list is not recoverable — members go with it via CASCADE.
    if (!confirm(`Διαγραφή της λίστας «${name}»; Η ενέργεια δεν αναιρείται.`)) return
    await fetch(`/api/crm/lists/${id}`, { method: 'DELETE' })
    load()
  }

  const deleteSearch = async (id: string, name: string) => {
    if (!confirm(`Διαγραφή της αποθηκευμένης αναζήτησης «${name}»;`)) return
    await fetch(`/api/crm/searches/${id}`, { method: 'DELETE' })
    load()
  }

  const commitRename = async () => {
    if (!renaming) return
    const { id, value } = renaming
    setRenaming(null)
    if (!value.trim()) return
    await fetch(`/api/crm/lists/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: value.trim() }),
    })
    load()
  }

  return (
    <main className="crm">
      <div className="crm-head">
        <div>
          <h1 className="crm-h1">Πελατολόγιο</h1>
          <p className="crm-sub">
            Οι λίστες υποψήφιων πελατών και οι αποθηκευμένες αναζητήσεις σας.
          </p>
        </div>
        <Link href="/search" className="sp-btn sp-btn-primary">
          <Icon name="search" size={13} />
          Νέα αναζήτηση
        </Link>
      </div>

      <div className="crm-tabs">
        <button className={`crm-tab${tab === 'lists' ? ' on' : ''}`} onClick={() => setTab('lists')}>
          Λίστες {lists.length > 0 && <span className="crm-tab-count">{lists.length}</span>}
        </button>
        <button className={`crm-tab${tab === 'searches' ? ' on' : ''}`} onClick={() => setTab('searches')}>
          Αποθηκευμένες αναζητήσεις {searches.length > 0 && <span className="crm-tab-count">{searches.length}</span>}
        </button>
      </div>

      {error && <div className="std-error" style={{ maxWidth: 760 }}>{error}</div>}

      {loading ? (
        <div className="crm-empty">Φόρτωση…</div>
      ) : tab === 'lists' ? (
        lists.length === 0 ? (
          <div className="crm-empty-card">
            <div className="crm-empty-title">Δεν έχετε ακόμη λίστες</div>
            <p>
              Κάντε μια αναζήτηση, επιλέξτε εταιρείες και πατήστε «Αποθήκευση λίστας»
              για να δημιουργήσετε την πρώτη σας λίστα υποψήφιων πελατών.
            </p>
            <Link href="/search" className="sp-btn sp-btn-primary">Ξεκινήστε αναζήτηση</Link>
          </div>
        ) : (
          <div className="crm-table-wrap">
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Λίστα</th>
                  <th className="crm-num">Επαφές</th>
                  <th className="crm-num">Email</th>
                  <th className="crm-num">Τηλ.</th>
                  <th style={{ width: 190 }}>Pipeline</th>
                  <th>Ενημερώθηκε</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lists.map(l => (
                  // Whole row is the click target — a short list name is a tiny
                  // one. Interactive cells stopPropagation so they still win.
                  <tr
                    key={l.id}
                    className="crm-rowlink"
                    onClick={() => { if (!renaming) router.push(`/crm/${l.id}`) }}
                  >
                    <td>
                      {renaming?.id === l.id ? (
                        <input
                          className="std-input"
                          style={{ height: 30, fontSize: 13 }}
                          value={renaming.value}
                          autoFocus
                          onClick={e => e.stopPropagation()}
                          onChange={e => setRenaming({ id: l.id, value: e.target.value })}
                          onBlur={commitRename}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitRename()
                            if (e.key === 'Escape') setRenaming(null)
                          }}
                        />
                      ) : (
                        <div className="crm-tname">
                          <Link href={`/crm/${l.id}`} onClick={e => e.stopPropagation()}>{l.name}</Link>
                          {l.is_live && <span className="std-live-tag">Ζωντανή</span>}
                        </div>
                      )}
                    </td>
                    <td className="crm-num"><strong>{l.member_count.toLocaleString('el-GR')}</strong></td>
                    <td className="crm-num">{l.with_email.toLocaleString('el-GR')}</td>
                    <td className="crm-num">{l.with_phone.toLocaleString('el-GR')}</td>
                    <td>
                      {/* Proportional stage bar — the list's shape without opening it. */}
                      {l.member_count > 0 ? (
                        <div className="crm-pipe-bar sm" title={STAGES.map(s => `${s.label}: ${l.stages?.[s.key] ?? 0}`).join(', ')}>
                          {STAGES.map(s => {
                            const n = l.stages?.[s.key] ?? 0
                            if (!n) return null
                            return <div key={s.key} className="crm-pipe-seg" style={{ width: `${(n / l.member_count) * 100}%`, background: s.fg }} />
                          })}
                        </div>
                      ) : <span className="dg-empty">—</span>}
                    </td>
                    <td className="crm-date">{formatDate(l.updated_at)}</td>
                    <td className="crm-rowactions" onClick={e => e.stopPropagation()}>
                      <div className="crm-menu-wrap">
                        <button
                          className="sp-action-btn"
                          aria-label="Ενέργειες"
                          onClick={e => { e.stopPropagation(); setMenuFor(menuFor === l.id ? null : l.id) }}
                        >⋯</button>
                        {menuFor === l.id && (
                          <div className="crm-menu" onClick={e => e.stopPropagation()}>
                            <button onClick={() => { setMenuFor(null); setRenaming({ id: l.id, value: l.name }) }}>
                              Μετονομασία
                            </button>
                            <button className="danger" onClick={() => { setMenuFor(null); deleteList(l.id, l.name) }}>
                              Διαγραφή
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : searches.length === 0 ? (
        <div className="crm-empty-card">
          <div className="crm-empty-title">Καμία αποθηκευμένη αναζήτηση</div>
          <p>Αποθηκεύστε ένα σύνολο φίλτρων από τη σελίδα αναζήτησης για να το ξανατρέξετε με ένα κλικ.</p>
          <Link href="/search" className="sp-btn sp-btn-primary">Ξεκινήστε αναζήτηση</Link>
        </div>
      ) : (
        <div className="crm-grid">
          {searches.map(s => (
            <div key={s.id} className="crm-card">
              <div className="crm-card-top">
                <button className="crm-card-name" onClick={() => router.push(searchHref(s.filters))}>{s.name}</button>
                <span className="std-spacer" />
                <button
                  className="sp-action-btn"
                  aria-label="Διαγραφή"
                  onClick={() => deleteSearch(s.id, s.name)}
                ><Icon name="x" size={13} /></button>
              </div>
              {s.scout_brief && <div className="crm-brief">«{s.scout_brief}»</div>}
              <div className="crm-card-meta">Αποθηκεύτηκε {formatDate(s.created_at)}</div>
              <div className="crm-card-actions">
                <button className="sp-btn sp-btn-secondary sp-btn-sm" onClick={() => router.push(searchHref(s.filters))}>
                  Εκτέλεση αναζήτησης
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {plan === 'free' && !loading && (
        <div className="crm-upsell">
          Το δωρεάν πλάνο περιλαμβάνει 1 λίστα έως 50 επαφές.{' '}
          <Link href="/pricing">Δείτε τα πλάνα</Link> για απεριόριστες λίστες,
          ζωντανές λίστες και εξαγωγές.
        </div>
      )}
    </main>
  )
}
