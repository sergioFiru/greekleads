'use client'
import { useMemo, useState } from 'react'
import { scaleLinear, scaleBand } from 'd3-scale'

export interface ChartPoint {
  period: string
  births: number
  deaths: number
  provisional: boolean
}

/**
 * The formation time series.
 *
 * The important behaviour here is the provisional tail. Our copy of ΓΕΜΗ lags
 * (p90 ingest lag 81 days), so the most recent bars are still filling in.
 * Drawing them like the rest would show a cliff that looks like Greek company
 * formation collapsing, which is an artifact of our pipeline, not a fact about
 * the economy. Provisional bars are therefore drawn hatched and muted, with an
 * explicit note — never silently.
 */
export default function FormationChart({
  data,
  grain,
  height = 300,
}: {
  data: ChartPoint[]
  grain: 'day' | 'month'
  height?: number
}) {
  const [hover, setHover] = useState<number | null>(null)

  const PAD = { top: 16, right: 16, bottom: 30, left: 52 }
  const W = 900
  const H = height

  const { x, y, ticks, maxV } = useMemo(() => {
    const maxV = Math.max(1, ...data.map(d => d.births))
    const x = scaleBand<string>()
      .domain(data.map(d => d.period))
      .range([PAD.left, W - PAD.right])
      .padding(data.length > 60 ? 0.12 : 0.24)
    const y = scaleLinear().domain([0, maxV]).nice(4).range([H - PAD.bottom, PAD.top])
    return { x, y, ticks: y.ticks(4), maxV }
  // PAD is a module-level constant object rebuilt each render; its values never
  // change, so it is intentionally not a dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, H])

  const fmtLabel = (p: string) => {
    const d = new Date(p + 'T00:00:00Z')
    return grain === 'day'
      ? d.toLocaleDateString('el-GR', { day: '2-digit', month: 'short', timeZone: 'UTC' })
      : d.toLocaleDateString('el-GR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
  }

  // Enough labels to orient, never so many they collide.
  const labelEvery = Math.max(1, Math.ceil(data.length / 12))
  const hasProvisional = data.some(d => d.provisional)

  return (
    <div className="st-chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="st-chart" role="img"
           aria-label="Νέες επιχειρήσεις ανά περίοδο">
        <defs>
          {/* Hatch marks the bars we know are incomplete. */}
          <pattern id="st-hatch" width="6" height="6" patternUnits="userSpaceOnUse"
                   patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--accent-light)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--accent)" strokeWidth="2" opacity="0.45" />
          </pattern>
        </defs>

        {/* gridlines */}
        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)}
                  stroke="var(--row-divider)" strokeWidth="1" />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="st-axis">
              {t.toLocaleString('el-GR')}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const bx = x(d.period) ?? 0
          const bw = x.bandwidth()
          const by = y(d.births)
          const bh = Math.max(1, y(0) - by)
          return (
            <g key={d.period}
               onMouseEnter={() => setHover(i)}
               onMouseLeave={() => setHover(null)}>
              {/* full-height hit area so thin bars are still hoverable */}
              <rect x={bx} y={PAD.top} width={bw} height={H - PAD.top - PAD.bottom}
                    fill="transparent" />
              <rect
                x={bx} y={by} width={bw} height={bh} rx={Math.min(2, bw / 3)}
                fill={d.provisional ? 'url(#st-hatch)' : 'var(--accent)'}
                opacity={hover === null || hover === i ? 1 : 0.45}
              />
            </g>
          )
        })}

        {/* x labels */}
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={d.period} x={(x(d.period) ?? 0) + x.bandwidth() / 2}
                  y={H - PAD.bottom + 16} textAnchor="middle" className="st-axis">
              {fmtLabel(d.period)}
            </text>
          ) : null
        )}

        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)}
              stroke="var(--border-strong)" strokeWidth="1" />
      </svg>

      {hover !== null && data[hover] && (
        <div className="st-tip"
             style={{ left: `${(((x(data[hover].period) ?? 0) + x.bandwidth() / 2) / W) * 100}%` }}>
          <div className="st-tip-date">{fmtLabel(data[hover].period)}</div>
          <div className="st-tip-val">
            {data[hover].births.toLocaleString('el-GR')} νέες
          </div>
          {data[hover].provisional && (
            <div className="st-tip-note">εκκρεμεί καταχώριση</div>
          )}
        </div>
      )}

      {hasProvisional && (
        <div className="st-legend">
          <span className="st-legend-item">
            <span className="st-swatch" style={{ background: 'var(--accent)' }} />
            Ολοκληρωμένα στοιχεία
          </span>
          <span className="st-legend-item">
            <span className="st-swatch st-swatch-hatch" />
            Εκκρεμεί καταχώριση — τα στοιχεία συμπληρώνονται ακόμη
          </span>
        </div>
      )}
      <span className="sr-only">Μέγιστη τιμή {maxV.toLocaleString('el-GR')}</span>
    </div>
  )
}
