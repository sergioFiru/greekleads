'use client'
import { useEffect, useState } from 'react'
import ForceGraph, { GraphNode, GraphLink } from './ForceGraph'
import type { NetworkRow } from '@/app/api/people/[slug]/network/route'

export default function PersonNetworkGraph({ name }: { name: string }) {
  const [nodes, setNodes]     = useState<GraphNode[]>([])
  const [links, setLinks]     = useState<GraphLink[]>([])
  const [loading, setLoading] = useState(true)
  const [empty, setEmpty]     = useState(false)

  useEffect(() => {
    fetch(`/api/people/${encodeURIComponent(name)}/network`)
      .then(r => r.json())
      .then((rows: NetworkRow[]) => {
        const nd: GraphNode[] = []
        const lk: GraphLink[] = []

        const PERSON_ID = `person:${name}`
        nd.push({
          id:        PERSON_ID,
          label:     name,
          fullLabel: name,
          type:      'center',
        })

        const seenCompanies  = new Set<string>()
        const seenCodeirs    = new Set<string>()

        for (const row of rows) {
          const coId = `c:${row.ar_gemi}`

          if (!seenCompanies.has(coId)) {
            seenCompanies.add(coId)
            const isActive = !row.dt_to
            nd.push({
              id:        coId,
              label:     row.co_name_el,
              fullLabel: row.co_name_el,
              type:      isActive ? 'company_active' : 'company_inactive',
              href:      `/etaireies/${row.ar_gemi}`,
              role:      row.role,
            })
            lk.push({ source: PERSON_ID, target: coId })
          }

          if (row.co_person) {
            const codirId = `d:${row.co_person}`
            if (!seenCodeirs.has(`${coId}:${codirId}`)) {
              seenCodeirs.add(`${coId}:${codirId}`)

              if (!nd.find(n => n.id === codirId)) {
                nd.push({
                  id:        codirId,
                  label:     row.co_person,
                  fullLabel: row.co_person,
                  type:      'codirector',
                  href:      `/people/${encodeURIComponent(row.co_person)}`,
                  role:      row.co_role,
                })
              }
              lk.push({ source: coId, target: codirId, dashed: true })
            }
          }
        }

        setNodes(nd)
        setLinks(lk)
        setEmpty(nd.length <= 1)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [name])

  if (loading) {
    return (
      <div className="card" style={{ padding: '20px 22px', marginBottom: 16 }}>
        <div className="section-label" style={{ marginBottom: 14 }}>Δίκτυο επαφών</div>
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Φόρτωση δικτύου…
        </div>
      </div>
    )
  }

  if (empty) return null

  const companyCount   = nodes.filter(n => n.type === 'company_active' || n.type === 'company_inactive').length
  const codirectorCount = nodes.filter(n => n.type === 'codirector').length

  return (
    <div className="card" style={{ padding: '20px 22px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div className="section-label">Δίκτυο επαφών</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
            {companyCount} εταιρείες · {codirectorCount} κοινά στελέχη
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-secondary)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {[
            { color: '#1A4A8A', label: 'Πρόσωπο' },
            { color: '#0F766E', label: 'Ενεργές εταιρείες' },
            { color: '#94A3B8', label: 'Παλ. εταιρείες' },
            { color: '#7C3AED', label: 'Κοινά στελέχη' },
          ].map(({ color, label }) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
              {label}
            </span>
          ))}
        </div>
      </div>
      <ForceGraph nodes={nodes} links={links} height={380} />
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
        Κάντε κλικ σε κόμβο για μετάβαση · σύρτε για αναδιάταξη
      </div>
    </div>
  )
}
