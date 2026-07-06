'use client'
import { useState } from 'react'

interface KadActivity {
  type: string
  activity: { id: string; descr: string }
}

const KAD_SECTORS: Record<string, string> = {
  '01': 'Γεωργία', '02': 'Δασοκομία', '03': 'Αλιεία',
  '05': 'Εξόρυξη άνθρακα', '06': 'Αντλ. πετρελαίου', '07': 'Εξόρυξη μεταλλ.',
  '08': 'Λοιπά ορυχεία', '09': 'Υπηρ. εξόρυξης',
  '10': 'Βιομ. τροφίμων', '11': 'Ποτοποιία', '12': 'Καπνοβιομηχανία',
  '13': 'Κλωστ/φαντουργία', '14': 'Ένδυση', '15': 'Δερμάτινα',
  '16': 'Ξυλεία', '17': 'Χαρτοβιομηχανία', '18': 'Εκτυπώσεις',
  '19': 'Διύλιση', '20': 'Χημική', '21': 'Φαρμακευτική',
  '22': 'Πλαστικά', '23': 'Μη μεταλλικά', '24': 'Βασικά μέταλλα',
  '25': 'Μεταλλικά', '26': 'Ηλεκτρονικά', '27': 'Ηλεκτρολογικά',
  '28': 'Μηχανήματα', '29': 'Αυτοκίνητα', '30': 'Λοιπός εξοπλ.',
  '31': 'Έπιπλα', '32': 'Λοιπή βιομ.', '33': 'Επισκευές',
  '35': 'Ενέργεια', '36': 'Νερό', '37': 'Αποχέτευση',
  '38': 'Απόβλητα', '39': 'Απορρύπανση',
  '41': 'Κατ. κτιρίων', '42': 'Τεχνικά έργα', '43': 'Ειδ. κατασκευές',
  '45': 'Εμπόριο οχημάτων', '46': 'Χονδρεμπόριο', '47': 'Λιανεμπόριο',
  '49': 'Χερσ. μεταφορές', '50': 'Πλωτές μεταφ.', '51': 'Αεροπορικές',
  '52': 'Αποθήκευση', '53': 'Ταχυδρομεία',
  '55': 'Καταλύματα', '56': 'Εστίαση',
  '58': 'Εκδόσεις', '59': 'Κινηματογράφος', '60': 'Ραδιοτηλεόραση',
  '61': 'Τηλεπικοινωνίες', '62': 'Πληροφορική', '63': 'Ψηφιακές υπηρ.',
  '64': 'Χρηματ/κές υπηρ.', '65': 'Ασφαλίσεις', '66': 'Συναφείς χρημ.',
  '68': 'Ακίνητα',
  '69': 'Νομικές & Λογιστ.', '70': 'Διοίκηση επιχ.', '71': 'Αρχιτεκτονική',
  '72': 'Έρευνα & Ανάπτυξη', '73': 'Διαφήμιση', '74': 'Λοιπές επιστ.',
  '75': 'Κτηνιατρική',
  '77': 'Ενοικίαση', '78': 'Εύρεση εργασίας', '79': 'Τουρισμός',
  '80': 'Ασφάλεια', '81': 'Υπηρ. κτιρίων', '82': 'Γραφειακές υπηρ.',
  '84': 'Δημ. διοίκηση', '85': 'Εκπαίδευση',
  '86': 'Υγεία', '87': 'Νοσοκομεία', '88': 'Κοιν. υπηρεσίες',
  '90': 'Τέχνες', '91': 'Μουσεία', '92': 'Τυχερά παιχν.', '93': 'Αθλητισμός',
  '94': 'Οργανώσεις', '95': 'Επισκ. Η/Υ', '96': 'Λοιπές υπηρ.',
  '97': 'Νοικοκυριά', '99': 'Εξωεδαφικές',
}

const PALETTE = [
  '#1A4A8A', '#0F766E', '#D97706', '#7C3AED',
  '#B42318', '#0369A1', '#047857', '#A16207',
]

function polar(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
}

function arc(cx: number, cy: number, r1: number, r2: number, a1: number, a2: number) {
  const p1 = polar(cx, cy, r2, a1)
  const p2 = polar(cx, cy, r2, a2)
  const p3 = polar(cx, cy, r1, a2)
  const p4 = polar(cx, cy, r1, a1)
  const large = a2 - a1 > Math.PI ? 1 : 0
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${r2} ${r2} 0 ${large} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${r1} ${r1} 0 ${large} 0 ${p4.x} ${p4.y}`,
    'Z',
  ].join(' ')
}

export default function KadDonut({ activities }: { activities: KadActivity[] }) {
  const [hovered, setHovered] = useState<string | null>(null)

  if (!activities.length) return null

  // Group by 2-digit KAD prefix
  const counts = new Map<string, number>()
  for (const a of activities) {
    const code = a.activity.id.replace(/\./g, '').slice(0, 2)
    counts.set(code, (counts.get(code) ?? 0) + 1)
  }

  const total = activities.length
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])

  // Keep top 7, collapse rest into "Άλλα"
  const MAX_SLICES = 7
  const main = sorted.slice(0, MAX_SLICES)
  const rest = sorted.slice(MAX_SLICES)
  const restCount = rest.reduce((s, [, v]) => s + v, 0)

  const slices = [
    ...main.map(([code, count]) => ({
      code,
      label: KAD_SECTORS[code] ?? `ΚΑΔ ${code}`,
      count,
    })),
    ...(restCount > 0 ? [{ code: '__other', label: 'Άλλα', count: restCount }] : []),
  ]

  // SVG donut
  const CX = 90, CY = 90, OUTER = 78, INNER = 50
  const GAP = 0.015  // gap between slices in radians

  let angle = -Math.PI / 2
  const paths = slices.map((s, i) => {
    const sweep = (s.count / total) * 2 * Math.PI
    const a1 = angle + GAP / 2
    const a2 = angle + sweep - GAP / 2
    angle += sweep
    return { ...s, a1, a2, color: PALETTE[i % PALETTE.length] }
  })

  return (
    <div style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>

      {/* Donut */}
      <svg width={180} height={180} style={{ flexShrink: 0 }}>
        {paths.map((p) => {
          const isHov = hovered === p.code
          const scale = isHov ? 1.04 : 1
          return (
            <path
              key={p.code}
              d={arc(CX, CY, INNER, OUTER, p.a1, p.a2)}
              fill={p.color}
              opacity={hovered && !isHov ? 0.45 : 1}
              transform={`scale(${scale})`}
              style={{ transformOrigin: `${CX}px ${CY}px`, transition: 'opacity .15s, transform .15s', cursor: 'default' }}
              onMouseEnter={() => setHovered(p.code)}
              onMouseLeave={() => setHovered(null)}
            />
          )
        })}

        {/* Center label */}
        <text x={CX} y={CY - 6} textAnchor="middle" fontSize={22} fontWeight={700} fill="#1A2332">
          {total}
        </text>
        <text x={CX} y={CY + 12} textAnchor="middle" fontSize={10} fill="#64748B">
          δραστηριότητες
        </text>
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {paths.map((p) => {
          const isHov = hovered === p.code
          const pct = Math.round((p.count / total) * 100)
          return (
            <div
              key={p.code}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                opacity: hovered && !isHov ? 0.45 : 1,
                transition: 'opacity .15s',
                cursor: 'default',
              }}
              onMouseEnter={() => setHovered(p.code)}
              onMouseLeave={() => setHovered(null)}
            >
              <span style={{ width: 10, height: 10, borderRadius: 2, background: p.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#374151', flex: 1 }}>{p.label}</span>
              <span style={{ fontSize: 11, color: '#64748B', fontFamily: 'var(--font-mono)', marginLeft: 8 }}>
                {p.count} <span style={{ color: '#9CA3AF' }}>({pct}%)</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
