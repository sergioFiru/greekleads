'use client'
import Link from 'next/link'
import Icon from '../Icon'
import { divisionsOfSection } from '@/lib/nace'
import { pct } from '@/lib/format'

export interface SectorRow {
  key: string
  label: string
  color: string
  value: number
  share: number
  changePct: number | null
  rank: number
  rankChange: number | null
}

/**
 * Ranked sector mix.
 *
 * Every bar is a link into a filtered /search. That is the whole commercial
 * point of the statistics page: a chart the reader can turn into a prospect
 * list in one click. A stat page that doesn't convert is just a blog.
 */
export default function SectorBars({ rows }: { rows: SectorRow[] }) {
  const max = Math.max(1, ...rows.map(r => r.value))

  return (
    <div className="st-bars">
      {rows.map(r => {
        const divisions = divisionsOfSection(r.key)
        // 'X' (unclassified) has no ΚΑΔ range, so it is a row but not a link —
        // there is no honest search behind it.
        const href = divisions.length
          ? `/search?kad_prefix=${divisions.join(',')}`
          : null

        const body = (
          <>
            <span className="st-bar-rank">{r.rank}</span>
            <span className="st-bar-label" title={r.label}>{r.label}</span>
            <span className="st-bar-track">
              <span
                className="st-bar-fill"
                style={{ width: `${(r.value / max) * 100}%`, background: r.color }}
              />
            </span>
            <span className="st-bar-val">{r.value.toLocaleString('el-GR')}</span>
            <span className="st-bar-share">{pct(r.share)}</span>
            <span className="st-bar-move">
              {r.rankChange != null && r.rankChange !== 0 && (
                <span className={r.rankChange > 0 ? 'st-up' : 'st-down'}>
                  {r.rankChange > 0 ? '▲' : '▼'}{Math.abs(r.rankChange)}
                </span>
              )}
            </span>
          </>
        )

        return href ? (
          <Link key={r.key} href={href} className="st-bar st-bar-link"
                title={`Δείτε τις επιχειρήσεις: ${r.label}`}>
            {body}
            <Icon name="chevron-right" size={12} />
          </Link>
        ) : (
          <div key={r.key} className="st-bar st-bar-plain">{body}</div>
        )
      })}
    </div>
  )
}
