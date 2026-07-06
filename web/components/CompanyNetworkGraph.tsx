'use client'
import { useEffect, useState } from 'react'
import ForceGraph, { GraphNode, GraphLink } from './ForceGraph'
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
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-secondary)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {[
            { color: '#1A4A8A', label: 'Εταιρεία' },
            { color: '#D97706', label: 'Στελέχη' },
            { color: '#0F766E', label: 'Συνδεδεμένες' },
            { color: '#94A3B8', label: 'Ανενεργές' },
          ].map(({ color, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
              {label}
            </span>
          ))}
        </div>
      </div>
      <ForceGraph nodes={nodes} links={links} height={400} />
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
        Κάντε κλικ σε κόμβο για μετάβαση · σύρτε για αναδιάταξη
      </div>
    </div>
  )
}
