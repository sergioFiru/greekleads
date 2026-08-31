'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import ForceGraph, { GraphNode, GraphLink, NODE_COLOR } from './ForceGraph'
import type { ConnectionRow } from '@/app/api/company/[ar_gemi]/connections/route'

export default function CompanyNetworkGraph({
  arGemi,
  companyName,
}: {
  arGemi: string
  companyName: string
}) {
  const [nodes, setNodes]     = useState<GraphNode[]>([])
  const [links, setLinks]     = useState<GraphLink[]>([])
  const [loading, setLoading] = useState(true)
  const [empty, setEmpty]     = useState(false)

  useEffect(() => {
    fetch(`/api/company/${arGemi}/connections`)
      .then(r => r.json())
      .then((rows: ConnectionRow[]) => {
        const nd: GraphNode[] = []
        const lk: GraphLink[] = []

        // Center: current company
        nd.push({
          id: arGemi,
          label: companyName,
          fullLabel: companyName,
          type: 'center',
        })

        const seenPersons   = new Set<string>()
        const seenCompanies = new Set<string>()

        for (const row of rows) {
          const personId = `p:${row.person_name}`

          if (!seenPersons.has(personId)) {
            seenPersons.add(personId)
            nd.push({
              id:        personId,
              label:     row.person_name,
              fullLabel: row.person_name,
              type:      'person',
              href:      `/people/${encodeURIComponent(row.person_name)}`,
              role:      row.person_role,
            })
            lk.push({ source: arGemi, target: personId })
          }

          if (row.linked_ar_gemi) {
            const companyId = `c:${row.linked_ar_gemi}`
            if (!seenCompanies.has(companyId)) {
              seenCompanies.add(companyId)
              const isActive = row.linked_status?.toLowerCase().includes('ενεργ') ?? false
              nd.push({
                id:        companyId,
                label:     row.linked_name ?? '',
                fullLabel: row.linked_name ?? row.linked_ar_gemi,
                type:      isActive ? 'company_active' : 'company_inactive',
                href:      `/etaireies/${row.linked_ar_gemi}`,
                role:      row.linked_role,
              })
            }
            lk.push({ source: personId, target: companyId, dashed: true })
          }
        }

        setNodes(nd)
        setLinks(lk)
        setEmpty(nd.length <= 1)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [arGemi, companyName])

  if (loading) {
    return (
      <div className="card" style={{ padding: '20px 22px' }}>
        <div className="section-label" style={{ marginBottom: 14 }}>Δίκτυο συνδέσεων</div>
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Φόρτωση δικτύου…
        </div>
      </div>
    )
  }

  if (empty) {
    return (
      <div className="card" style={{ padding: '20px 22px' }}>
        <div className="section-label" style={{ marginBottom: 10 }}>Δίκτυο συνδέσεων</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, paddingTop: 6 }}>
          Δεν βρέθηκαν κοινά στελέχη με άλλες εταιρείες.
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div className="section-label">Δίκτυο συνδέσεων</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
            Στελέχη που δραστηριοποιούνται και σε άλλες εταιρείες
          </div>
        </div>
        <div className="cp-net-legend">
          {[
            { color: NODE_COLOR.center,           label: 'Εταιρεία' },
            { color: NODE_COLOR.person,           label: 'Στελέχη' },
            { color: NODE_COLOR.company_active,   label: 'Συνδεδεμένες' },
            { color: NODE_COLOR.company_inactive, label: 'Ανενεργές' },
          ].map(({ color, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
              {label}
            </span>
          ))}
        </div>
      </div>
      {/* A 344px force-directed graph with 20 nodes is unreadable on a phone —
          labels overlap whatever you do to them. The same data reads better as
          a list, so swap by CSS rather than shrinking something that cannot
          work at that size. Both are rendered; only one is displayed. */}
      <div className="cp-net-graph">
        <ForceGraph nodes={nodes} links={links} height={400} />
      </div>

      <ul className="cp-net-list">
        {nodes.filter(n => n.type !== 'center').map(n => (
          <li key={n.id} className="cp-net-item">
            <span className="cp-net-dot" style={{ background: NODE_COLOR[n.type] }} />
            <span className="cp-net-body">
              {n.href
                ? <Link href={n.href} className="cp-net-name">{n.fullLabel}</Link>
                : <span className="cp-net-name">{n.fullLabel}</span>}
              {n.role && <span className="cp-net-role">{n.role}</span>}
            </span>
          </li>
        ))}
      </ul>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
        Κάντε κλικ σε κόμβο για μετάβαση · σύρτε για αναδιάταξη
      </div>
    </div>
  )
}
