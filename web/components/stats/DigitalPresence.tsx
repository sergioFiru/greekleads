'use client'
import Link from 'next/link'
import { divisionsOfSection } from '@/lib/nace'
import { pct } from '@/lib/format'

export interface DigitalRow {
  key: string
  label: string
  color: string
  births: number
  websitePct: number
  socialPct: number
}

/**
 * Digital presence of newly founded firms, by sector.
 *
 * This is the panel nobody else can publish, and it is deliberately sorted
 * ascending: the sectors at the top are the ones founding companies without a
 * website. That is not a curiosity, it is a prospect list for a web agency —
 * so each row links to exactly that search (sector + no website).
 */
export default function DigitalPresence({ rows }: { rows: DigitalRow[] }) {
  if (!rows.length) {
    return <div className="st-empty">Δεν υπάρχουν αρκετά στοιχεία για αυτή την περίοδο.</div>
  }

  return (
    <div className="st-dig">
      {rows.map(r => {
        const divisions = divisionsOfSection(r.key)
        const href = divisions.length
          ? `/search?kad_prefix=${divisions.join(',')}&no_website`
          : null
        const inner = (
          <>
            <span className="st-dig-label">
              <span className="st-dot" style={{ background: r.color }} />
              {r.label}
            </span>
            <span className="st-dig-track">
              <span className="st-dig-fill" style={{ width: `${r.websitePct}%`, background: r.color }} />
              <span className="st-dig-social" style={{ width: `${r.socialPct}%` }} />
            </span>
            <span className="st-dig-pct">{pct(r.websitePct, 0)}</span>
            <span className="st-dig-n">{r.births.toLocaleString('el-GR')} νέες</span>
          </>
        )
        return href ? (
          <Link key={r.key} href={href} className="st-dig-row st-dig-link"
                title={`${r.label}: νέες επιχειρήσεις χωρίς website`}>
            {inner}
          </Link>
        ) : (
          <div key={r.key} className="st-dig-row">{inner}</div>
        )
      })}
      <div className="st-dig-key">
        <span><span className="st-swatch" style={{ background: 'var(--accent)' }} /> με website</span>
        <span><span className="st-swatch st-swatch-social" /> με κοινωνικά δίκτυα</span>
        <span className="st-dig-hint">Κάθε γραμμή οδηγεί στη λίστα των επιχειρήσεων χωρίς website.</span>
      </div>
    </div>
  )
}
