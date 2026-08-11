'use client'

import { useState } from 'react'
import shapesData from '@/lib/greecePrefectureShapes.json'

interface PrefectureShape { name: string; path: string; cx: number; cy: number }
interface ShapesFile { svgWidth: number; svgHeight: number; prefectures: PrefectureShape[] }

const SHAPES = shapesData as ShapesFile

// Blue-family ramp, log-scaled — Attica (~350k) and the smallest prefecture
// (~1.2k) are ~300x apart, so a linear scale would make everything but Attica
// look identical. Floor is deliberately not near-white: a paper-thin pastel
// map was the exact complaint being fixed here, so even the lowest tier of
// prefecture keeps real color presence against the card background.
const STOP_LOW  : [number, number, number] = [186, 210, 236]  // soft slate-blue, not near-white
const STOP_MID  : [number, number, number] = [37, 99, 168]    // --accent
const STOP_HIGH: [number, number, number] = [12, 27, 51]      // deep ink-blue

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

function colorFor(t: number): string {
  const [a, b, lt] = t <= 0.5
    ? [STOP_LOW, STOP_MID, t / 0.5]
    : [STOP_MID, STOP_HIGH, (t - 0.5) / 0.5]
  const r = Math.round(lerp(a[0], b[0], lt))
  const g = Math.round(lerp(a[1], b[1], lt))
  const bl = Math.round(lerp(a[2], b[2], lt))
  return `rgb(${r},${g},${bl})`
}

export default function PrefectureMap({ counts }: { counts: Record<string, number> }) {
  const [hovered, setHovered] = useState<string | null>(null)

  const values = SHAPES.prefectures.map(p => counts[p.name] || 0).filter(v => v > 0)
  const hasData = values.length > 0
  const minV = hasData ? Math.min(...values) : 1
  const maxV = hasData ? Math.max(...values) : 1
  const logSpan = Math.log(maxV) - Math.log(minV)

  function tFor(v: number) {
    if (!v || logSpan <= 0) return 0
    return Math.max(0, Math.min(1, (Math.log(v) - Math.log(minV)) / logSpan))
  }

  // Render the hovered shape last so it paints above its neighbors (SVG
  // stacks by DOM order, not z-index) — sorting the array is the React-native
  // way to do this instead of manually reparenting a DOM node.
  const ordered = [...SHAPES.prefectures].sort((a, b) =>
    (a.name === hovered ? 1 : 0) - (b.name === hovered ? 1 : 0)
  )

  const hoveredShape = hovered ? SHAPES.prefectures.find(p => p.name === hovered) : null
  const hoveredCount = hovered ? counts[hovered] || 0 : 0

  return (
    <div className="pm-card">
      <div className="pm-hd">
        <span className="pm-dot" />
        <span className="pm-t">Επιχειρήσεις ανά νομό</span>
      </div>

      <div className="pm-body">
        <svg
          className={`pm-svg${hovered ? ' has-hover' : ''}`}
          viewBox={`0 0 ${SHAPES.svgWidth} ${SHAPES.svgHeight}`}
          role="img"
          aria-label="Χάρτης ενεργών επιχειρήσεων ανά νομό"
        >
          <defs>
            <linearGradient id="pm-sheen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.10" />
            </linearGradient>
          </defs>
          <g>
            {ordered.map(p => {
              const v = counts[p.name] || 0
              const isHovered = p.name === hovered
              return (
                <path
                  key={p.name}
                  d={p.path}
                  className={`pm-shape${isHovered ? ' is-hovered' : ''}`}
                  fill={colorFor(tFor(v))}
                  onMouseEnter={() => setHovered(p.name)}
                  onMouseLeave={() => setHovered(h => (h === p.name ? null : h))}
                />
              )
            })}
          </g>
          {/* Non-interactive sheen pass, same paths, blended for a soft
              top-lit/embossed feel instead of flat illustration fills. */}
          <g className="pm-sheen-layer" aria-hidden="true">
            {SHAPES.prefectures.map(p => (
              <path key={p.name} d={p.path} fill="url(#pm-sheen)" />
            ))}
          </g>
        </svg>

        {hoveredShape && (
          <div
            className="pm-tooltip"
            style={{
              left: `${(hoveredShape.cx / SHAPES.svgWidth) * 100}%`,
              top: `${(hoveredShape.cy / SHAPES.svgHeight) * 100}%`,
            }}
          >
            <div className="pm-tooltip-name">{hoveredShape.name}</div>
            <div className="pm-tooltip-count">{hoveredCount.toLocaleString('el-GR')} επιχειρήσεις</div>
          </div>
        )}
      </div>

      <div className="pm-legend">
        <span className="pm-legend-label">Λιγότερες</span>
        <span className="pm-legend-ramp" />
        <span className="pm-legend-label">Περισσότερες</span>
      </div>
    </div>
  )
}
