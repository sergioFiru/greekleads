'use client'
import Link from 'next/link'
import Icon from './Icon'

function HomeBullets({ items }: { items: string[] }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0 0', display: 'flex', flexDirection: 'column', gap: 9 }}>
      {items.map((p, i) => (
        <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          <span style={{
            width: 15, height: 15, borderRadius: 8,
            background: 'var(--gemi-bg)', color: 'var(--gemi-text)', border: '0.5px solid var(--gemi-border)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
          }}>
            <Icon name="check" size={9} stroke={2.4} />
          </span>
          <span>{p}</span>
        </li>
      ))}
    </ul>
  )
}

type NodeKey = 'you' | 'co1' | 'co2' | 'co3' | 'other'

interface NodeDef {
  x: number; y: number; label: string; type: 'person' | 'company'; primary?: boolean
}

const NODES: Record<NodeKey, NodeDef> = {
  you:   { x: 90,  y: 150, label: 'Δ. Κωνσταντινίδης', type: 'person',  primary: true },
  co1:   { x: 300, y: 64,  label: 'Pelagos Maritime',   type: 'company' },
  co2:   { x: 330, y: 150, label: 'Nereus Logistics',    type: 'company' },
  co3:   { x: 300, y: 236, label: 'Aiolos Bulk A.E.',    type: 'company' },
  other: { x: 520, y: 150, label: 'Μ. Βλάχου',          type: 'person' },
}

const EDGES: [NodeKey, NodeKey, string][] = [
  ['you',   'co1',   'Διευθ. Σύμβ.'],
  ['you',   'co2',   'Εταίρος'],
  ['you',   'co3',   'Πρόεδρος ΔΣ'],
  ['other', 'co1',   'ΔΣ'],
  ['other', 'co3',   'ΔΣ'],
]

function NetworkGraph() {
  return (
    <div style={{ background: 'var(--app-bg)' }}>
      <svg viewBox="0 0 610 300" style={{ width: '100%', display: 'block' }}>
        {EDGES.map(([a, b, lbl], i) => {
          const A = NODES[a], B = NODES[b]
          const shared = a === 'other'
          return (
            <g key={i}>
              <line
                x1={A.x} y1={A.y} x2={B.x} y2={B.y}
                stroke={shared ? 'var(--accent)' : 'var(--border-strong)'}
                strokeWidth={shared ? 1.6 : 1}
                strokeDasharray={shared ? '4 3' : undefined}
              />
              <text
                x={(A.x + B.x) / 2} y={(A.y + B.y) / 2 - 4}
                textAnchor="middle" fontSize="9"
                fill="var(--text-muted)"
                style={{ fontFamily: 'var(--font-mono)' }}
              >{lbl}</text>
            </g>
          )
        })}
        {(Object.entries(NODES) as [NodeKey, NodeDef][]).map(([k, n]) => {
          const isPerson = n.type === 'person'
          const r = n.primary ? 26 : 22
          const iconFill = n.primary ? '#fff' : isPerson ? 'var(--accent)' : 'var(--text-secondary)'
          return (
            <g key={k} style={{ cursor: 'pointer' }}>
              <circle
                cx={n.x} cy={n.y} r={r}
                fill={n.primary ? 'var(--accent)' : '#fff'}
                stroke={isPerson ? 'var(--accent)' : 'var(--border-strong)'}
                strokeWidth="1.2"
              />
              {isPerson ? (
                /* Person glyph: head + shoulders */
                <g stroke={iconFill} strokeWidth="1.5" fill="none" strokeLinecap="round">
                  <circle cx={n.x} cy={n.y - 4} r="4.5" />
                  <path d={`M${n.x - 7},${n.y + 9} Q${n.x},${n.y + 4} ${n.x + 7},${n.y + 9}`} />
                </g>
              ) : (
                /* Building glyph */
                <g stroke={iconFill} strokeWidth="1.3" fill="none" strokeLinecap="round">
                  <rect x={n.x - 7} y={n.y - 7} width={14} height={14} rx="1" />
                  <path d={`M${n.x - 3},${n.y + 7}V${n.y - 1}h6V${n.y + 7}`} />
                  <line x1={n.x - 5} y1={n.y - 3} x2={n.x - 3} y2={n.y - 3} />
                  <line x1={n.x + 3} y1={n.y - 3} x2={n.x + 5} y2={n.y - 3} />
                </g>
              )}
              <text
                x={n.x} y={n.y + r + 13}
                textAnchor="middle" fontSize="11"
                fontWeight={n.primary ? 600 : 500}
                fill="var(--text-primary)"
                style={{ fontFamily: 'var(--font-sans)' }}
              >{n.label}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default function HomeNetworkSection() {
  return (
    <section style={{ padding: '80px 28px', background: '#fff', borderTop: '0.5px solid var(--border)', borderBottom: '0.5px solid var(--border)' }}>
      <div className="hp-container">
        <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.1fr', gap: 56, alignItems: 'center' }}>

          {/* Left — text */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, fontWeight: 500 }}>
              Συνδεδεμένα δεδομένα
            </div>
            <h2 style={{ margin: 0, fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Οι συνδέσεις είναι το προϊόν.
            </h2>
            <p style={{ margin: '16px 0 0', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Κάθε εταιρεία συνδέεται με τα στελέχη της. Κάθε πρόσωπο συνδέεται με τις άλλες εταιρείες του. Ακολουθείστε τις ακμές και τα μοτίβα αναδύονται μόνα τους — κοινοί διευθυντές, εταιρικοί όμιλοι, πολλαπλές θέσεις.
            </p>
            <HomeBullets items={[
              'Εταιρεία → διευθυντές & μέτοχοι',
              'Πρόσωπο → κάθε εταιρεία που αγγίζει',
              'Κοινά μέλη ΔΣ αποκαλύπτουν ομίλους',
              'Μία θέση στο ΔΣ = πολλαπλές γνωριμίες',
            ]} />
            <div style={{ marginTop: 28 }}>
              <Link href="/people" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="users" size={13} stroke={1.6} />
                Εξερευνήστε συνδέσεις
                <Icon name="arrow-up-right" size={12} />
              </Link>
            </div>
          </div>

          {/* Right — network graph card */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', boxShadow: '0 12px 36px rgba(26,35,50,0.06)' }}>
            <div style={{ padding: '11px 16px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Icon name="users" size={14} stroke={1.7} style={{ color: 'var(--accent)' }} />
                Χάρτης σχέσεων
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>1 πρόσωπο · 3 εταιρείες</span>
            </div>

            <NetworkGraph />

            <div style={{ padding: '11px 16px', background: 'var(--subtle-bg2)', borderTop: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text-secondary)' }}>
              <span className="badge badge-amber" style={{ height: 18 }}>
                <Icon name="sparkle" size={10} stroke={1.6} />Insight
              </span>
              Κωνσταντινίδης και Βλάχου μοιράζονται{' '}
              <span className="mono" style={{ color: 'var(--text-primary)' }}>2</span>{' '}
              ΔΣ — πιθανώς εταιρικός όμιλος.
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}
