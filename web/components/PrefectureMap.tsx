'use client'

import { useState } from 'react'
import shapesData from '@/lib/greecePrefectureShapes.json'

interface PrefectureShape { name: string; path: string; cx: number; cy: number }
interface ShapesFile { svgWidth: number; svgHeight: number; prefectures: PrefectureShape[] }

const SHAPES = shapesData as ShapesFile

// Blue-family ramp, log-scaled — Attica (~350k) and the smallest prefecture
// (~1.2k) are ~300x apart, so a linear scale would make everything but Attica
// look identical. Most prefectures cluster near the low end of a log scale,
// so the floor's own saturation sets the map's overall impression — an
// earlier floor here (124,160,204, ~44% saturation) was noticeably duller
// than the mid/high stops (~64%), so the bulk of the map read muted next to
// them. Matched up to the same saturation family across all three stops.
const STOP_LOW  : [number, number, number] = [82, 144, 214]   // vivid, same hue family as --accent
const STOP_MID  : [number, number, number] = [37, 99, 168]    // --accent
const STOP_HIGH: [number, number, number] = [8, 25, 48]       // deep ink-blue

function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

function fmtCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return Math.round(n / 1_000) + 'k'
  return String(n)
}

function rgbFor(t: number): [number, number, number] {
  const [a, b, lt] = t <= 0.5
    ? [STOP_LOW, STOP_MID, t / 0.5]
    : [STOP_MID, STOP_HIGH, (t - 0.5) / 0.5]
  return [
    Math.round(lerp(a[0], b[0], lt)),
    Math.round(lerp(a[1], b[1], lt)),
    Math.round(lerp(a[2], b[2], lt)),
  ]
}

function colorFor(t: number): string {
  const [r, g, bl] = rgbFor(t)
  return `rgb(${r},${g},${bl})`
}

// Perceived luminance of the fill — decides label ink, not a fixed t cutoff,
// so it stays correct if the ramp above ever changes again.
function isDark([r, g, b]: [number, number, number]) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 140
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
    <div className="pm">
      <div className="pm-glow" aria-hidden />

      <div className="pm-content">
        <div className="pm-mapwrap">
        <svg
          className={`pm-svg${hovered ? ' has-hover' : ''}`}
          viewBox={`0 0 ${SHAPES.svgWidth} ${SHAPES.svgHeight}`}
          role="img"
          aria-label="Χάρτης ενεργών επιχειρήσεων ανά νομό"
        >
          <defs>
            <linearGradient id="pm-sheen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.06" />
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
          <g aria-hidden="true">
            {SHAPES.prefectures.map(p => {
              const v = counts[p.name] || 0
              if (!v) return null
              const isHovered = p.name === hovered
              const light = isDark(rgbFor(tFor(v)))
              return (
                <text
                  key={p.name}
                  x={p.cx}
                  y={p.cy}
                  className={`pm-shape-label${isHovered ? ' is-hovered' : ''}`}
                  fill={light ? '#F7F6F3' : '#16233B'}
                  stroke={light ? 'rgba(12,27,51,0.35)' : 'rgba(255,255,255,0.55)'}
                >
                  {fmtCount(v)}
                </text>
              )
            })}
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
      </div>
    </div>
  )
}
