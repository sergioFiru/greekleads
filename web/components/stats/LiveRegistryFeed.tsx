'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import CompanyFavicon from '../CompanyFavicon'
import { sectionOfKad, sectionLabel, sectionColor } from '@/lib/nace'

interface FeedItem {
  ar_gemi: string
  co_name_el: string
  legal_type_descr: string | null
  prefecture_descr: string | null
  city: string | null
  incorporation_date: string | null
  gemi_fetched_at: string
  kad: string | null
  kad_descr: string | null
  has_favicon: boolean
}

/**
 * «Μόλις καταχωρήθηκαν» — the live registry feed.
 *
 * Ordered by when the record reached us, not by founding date, and labelled as
 * such. The two clocks are ~30 days apart at the median, so calling this "newly
 * founded" would be wrong; each row shows the founding date separately.
 */
export default function LiveRegistryFeed() {
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const seen = useRef<Set<string>>(new Set())

  useEffect(() => {
    let alive = true

    const load = async () => {
      try {
        const r = await fetch('/api/statistics/feed')
        const d = await r.json()
        if (!alive) return

        const incoming: FeedItem[] = d.items ?? []
        // Highlight only what is genuinely new since the last poll — on the
        // first load everything is "new", which would flash the whole list.
        if (seen.current.size > 0) {
          const added = incoming.filter(i => !seen.current.has(i.ar_gemi)).map(i => i.ar_gemi)
          if (added.length) {
            setFresh(new Set(added))
            setTimeout(() => { if (alive) setFresh(new Set()) }, 4000)
          }
        }
        incoming.forEach(i => seen.current.add(i.ar_gemi))
        setItems(incoming)
      } catch {
        /* a failed poll just leaves the previous list on screen */
      } finally {
        if (alive) setLoading(false)
      }
    }

    load()
    const id = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const ago = (ts: string) => {
    const mins = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000))
    if (mins < 60) return `${mins}′`
    const h = Math.round(mins / 60)
    if (h < 24) return `${h}ω`
    return `${Math.round(h / 24)}η`
  }

  const founded = (d: string | null) =>
    d ? new Date(d + 'T00:00:00Z').toLocaleDateString('el-GR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—'

  return (
    <div className="st-feed">
      <div className="st-feed-head">
        <span className="st-pulse" aria-hidden />
        <span className="st-feed-title">Μόλις καταχωρήθηκαν</span>
      </div>

      <div className="st-feed-list">
        {loading && items.length === 0 &&
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="st-feed-item st-feed-skel">
              <div className="sp-skel" style={{ width: 26, height: 26, borderRadius: 6 }} />
              <div style={{ flex: 1 }}>
                <div className="sp-skel" style={{ height: 11, width: '70%', borderRadius: 6 }} />
                <div className="sp-skel" style={{ height: 9, width: '40%', borderRadius: 6, marginTop: 6 }} />
              </div>
            </div>
          ))}

        {items.map(it => {
          const sec = sectionOfKad(it.kad)
          return (
            <Link
              key={it.ar_gemi}
              href={`/etaireies/${it.ar_gemi}`}
              className={`st-feed-item${fresh.has(it.ar_gemi) ? ' st-feed-new' : ''}`}
            >
              <CompanyFavicon
                arGemi={it.ar_gemi}
                hasFavicon={it.has_favicon}
                className="st-feed-logo"
                fallback={
                  <span className="st-feed-initial" style={{ background: sectionColor(sec) }}>
                    {it.co_name_el.trim().charAt(0)}
                  </span>
                }
              />
              <span className="st-feed-body">
                <span className="st-feed-name">{it.co_name_el}</span>
                <span className="st-feed-meta">
                  {it.legal_type_descr && <span className="st-chip">{it.legal_type_descr}</span>}
                  {it.kad && (
                    <span className="st-chip" style={{ color: sectionColor(sec) }}
                          title={it.kad_descr ?? undefined}>
                      {sectionLabel(sec)}
                    </span>
                  )}
                  <span className="st-feed-place">{it.city || it.prefecture_descr || ''}</span>
                </span>
                <span className="st-feed-founded">Ίδρυση {founded(it.incorporation_date)}</span>
              </span>
              <span className="st-feed-ago">{ago(it.gemi_fetched_at)}</span>
            </Link>
          )
        })}
      </div>

      <p className="st-feed-foot">
        Σειρά με βάση τη στιγμή που η καταχώριση έφτασε στο GreekLeads — όχι την
        ημερομηνία ίδρυσης.
      </p>
    </div>
  )
}
