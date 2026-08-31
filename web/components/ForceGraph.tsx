'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { SimulationNodeDatum } from 'd3'

export type NodeType = 'center' | 'person' | 'company_active' | 'company_inactive' | 'codirector'

export interface GraphNode extends SimulationNodeDatum {
  id: string
  label: string
  fullLabel: string
  type: NodeType
  href?: string
  role?: string | null
}

export interface GraphLink {
  source: string
  target: string
  dashed?: boolean
}

/** Exported so the mobile connection list can use the same colour key. */
export const NODE_COLOR: Record<NodeType, string> = {
  center:           '#1A4A8A',
  person:           '#D97706',
  company_active:   '#0F766E',
  company_inactive: '#94A3B8',
  codirector:       '#7C3AED',
}

const NODE_STYLE: Record<NodeType, { r: number; fill: string; text: string }> = {
  center:           { r: 30, fill: '#1A4A8A', text: '#fff' },
  person:           { r: 21, fill: '#D97706', text: '#fff' },
  company_active:   { r: 18, fill: '#0F766E', text: '#fff' },
  company_inactive: { r: 18, fill: '#94A3B8', text: '#fff' },
  codirector:       { r: 14, fill: '#7C3AED', text: '#fff' },
}

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s
}

export default function ForceGraph({
  nodes,
  links,
  height = 420,
}: {
  nodes: GraphNode[]
  links: GraphLink[]
  height?: number
}) {
  const svgRef   = useRef<SVGSVGElement>(null)
  const tipRef   = useRef<HTMLDivElement>(null)
  const router   = useRouter()

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return

    let stopped = false

    import('d3').then((d3) => {
      if (stopped || !svgRef.current) return

      const svgEl = svgRef.current
      const w = svgEl.getBoundingClientRect().width || 640
      // On a phone the SVG is ~344px. A 20-character label centred under a node
      // near the edge is drawn straight off the canvas, so shorten labels and
      // keep nodes away from the sides.
      const narrow = w < 520
      const labelChars = narrow ? 10 : 20
      const padX = narrow ? 40 : 62

      // Deep-copy so D3 can mutate freely
      const nd = nodes.map(n => ({ ...n })) as (GraphNode & { x: number; y: number })[]
      const ld = links.map(l => ({ ...l }))

      const svg = d3.select(svgEl)
      svg.selectAll('*').remove()
      svg.attr('viewBox', `0 0 ${w} ${height}`)

      const defs = svg.append('defs')
      defs.append('filter').attr('id', 'gfx-shadow')
        .append('feDropShadow')
        .attr('dx', 0).attr('dy', 1)
        .attr('stdDeviation', 2)
        .attr('flood-color', 'rgba(0,0,0,0.14)')

      const linkG = svg.append('g')
      const nodeG = svg.append('g')

      const simulation = d3.forceSimulation(nd)
        .force('link', d3.forceLink(ld).id((d: any) => d.id).distance((l: any) => {
          const t = (l.target as GraphNode).type
          return t === 'codirector' ? 70 : t === 'center' ? 120 : 110
        }))
        .force('charge', d3.forceManyBody().strength(-280))
        .force('center', d3.forceCenter(w / 2, height / 2).strength(0.4))
        .force('collide', d3.forceCollide((d: any) => NODE_STYLE[d.type as NodeType].r + 12))
        .force('x', d3.forceX(w / 2).strength(0.04))
        .force('y', d3.forceY(height / 2).strength(0.04))

      const linkSel = linkG.selectAll<SVGLineElement, typeof ld[0]>('line')
        .data(ld).enter().append('line')
        .attr('stroke', '#CBD5E1')
        .attr('stroke-width', (d) => d.dashed ? 1 : 1.8)
        .attr('stroke-dasharray', (d) => d.dashed ? '5,3' : null)
        .attr('stroke-opacity', 0.8)

      const nodeSel = nodeG.selectAll<SVGGElement, typeof nd[0]>('g')
        .data(nd).enter().append('g')
        .style('cursor', (d) => d.href ? 'pointer' : 'grab')
        .attr('filter', 'url(#gfx-shadow)')
        .call(
          d3.drag<SVGGElement, typeof nd[0]>()
            // Mouse only. With touch enabled, a swipe that starts on a node
            // drags the node instead of scrolling the page — on a phone that
            // traps the reader in the middle of the article.
            .filter((event: any) => !event.touches && event.button === 0)
            .on('start', (event, d) => {
              if (!event.active) simulation.alphaTarget(0.3).restart()
              d.fx = d.x; d.fy = d.y
            })
            .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
            .on('end',  (event, d) => {
              if (!event.active) simulation.alphaTarget(0)
              d.fx = null; d.fy = null
            })
        )

      nodeSel.each(function (d) {
        const g   = d3.select(this)
        const cfg = NODE_STYLE[d.type]

        // Outer glow for center node
        if (d.type === 'center') {
          g.append('circle')
            .attr('r', cfg.r + 5)
            .attr('fill', '#1A4A8A')
            .attr('opacity', 0.15)
        }

        g.append('circle')
          .attr('r', cfg.r)
          .attr('fill', cfg.fill)
          .attr('stroke', '#fff')
          .attr('stroke-width', 2)

        // Initials inside
        g.append('text')
          .text(initials(d.fullLabel))
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('fill', cfg.text)
          .attr('font-size', d.type === 'center' ? 13 : d.type === 'codirector' ? 9 : 11)
          .attr('font-weight', 700)
          .attr('font-family', 'system-ui, -apple-system, sans-serif')
          .style('pointer-events', 'none')
          .style('user-select', 'none')

        // Label below (skip for co-directors to reduce clutter)
        if (d.type !== 'codirector') {
          const label = g.append('text')
            .text(truncate(d.fullLabel, labelChars))
            .attr('text-anchor', 'middle')
            .attr('y', cfg.r + 13)
            .attr('fill', '#374151')
            .attr('font-size', 10)
            .attr('font-family', 'system-ui, -apple-system, sans-serif')
            .style('pointer-events', 'none')
            .style('user-select', 'none')
          // Measured once here rather than per tick — getComputedTextLength
          // forces layout and there are 60 ticks a second.
          const node = label.node()
          ;(d as any).labelHalf = node ? node.getComputedTextLength() / 2 : 0
        }
      })

      // Tooltip
      const tip = d3.select(tipRef.current!)

      nodeSel
        .on('mouseover', (_ev, d) => {
          tip.style('display', 'block')
            .html(
              `<strong style="font-size:12px">${d.fullLabel}</strong>` +
              (d.role ? `<br/><span style="font-size:11px;color:#64748b">${d.role}</span>` : '')
            )
        })
        .on('mousemove', (ev) => {
          const rect = svgEl.getBoundingClientRect()
          tip.style('left', (ev.clientX - rect.left + 14) + 'px')
             .style('top',  (ev.clientY - rect.top  - 36) + 'px')
        })
        .on('mouseout', () => tip.style('display', 'none'))
        .on('click', (_ev, d) => { if (d.href) router.push(d.href) })

      simulation.on('tick', () => {
        // Keep every node (and therefore its label) inside the canvas.
        nd.forEach((d: any) => {
          const r = NODE_STYLE[d.type as NodeType].r
          // The margin is whichever is wider: the circle, or half its label.
          const m = Math.min(Math.max(r, (d.labelHalf ?? 0) + 2), w / 2 - 8)
          d.x = Math.max(m, Math.min(w - m, d.x ?? w / 2))
          d.y = Math.max(r + 8, Math.min(height - r - 20, d.y ?? height / 2))
        })

        linkSel
          .attr('x1', (d: any) => d.source.x)
          .attr('y1', (d: any) => d.source.y)
          .attr('x2', (d: any) => d.target.x)
          .attr('y2', (d: any) => d.target.y)

        nodeSel.attr('transform', (d: any) => `translate(${d.x ?? 0},${d.y ?? 0})`)
      })

      return () => { simulation.stop() }
    })

    return () => { stopped = true }
  }, [nodes, links, height, router])

  return (
    <div style={{ position: 'relative' }}>
      <svg ref={svgRef} style={{ width: '100%', display: 'block', height }} />
      <div ref={tipRef} style={{
        display: 'none', position: 'absolute',
        background: '#fff', border: '0.5px solid var(--border)',
        borderRadius: 6, padding: '7px 11px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        pointerEvents: 'none', maxWidth: 220, zIndex: 20,
        lineHeight: 1.5,
      }} />
    </div>
  )
}
