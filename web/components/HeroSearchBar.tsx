'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Icon from './Icon'

const SUGGESTIONS = [
  { type: 'company', primary: 'Pelagos Maritime Group ΑΕ', secondary: 'ΑΕ · Πειραιάς · ΓΕΜΗ 044238900100', icon: 'building' },
  { type: 'company', primary: 'Mediterra Pharma ΕΠΕ',      secondary: 'ΕΠΕ · Πάτρα · ΓΕΜΗ 031840087000',    icon: 'building' },
  { type: 'filter',  primary: 'Τεχνολογία & IT στην Αττική', secondary: '9.418 εταιρείες',                    icon: 'filter'   },
  { type: 'filter',  primary: 'Κατασκευές Θεσσαλονίκη',     secondary: '4.280 εταιρείες',                    icon: 'filter'   },
] as const

export default function HeroSearchBar() {
  const [query, setQuery]     = useState('')
  const [focused, setFocused] = useState(false)
  const router                = useRouter()

  const filtered = query
    ? SUGGESTIONS.filter(s => s.primary.toLowerCase().includes(query.toLowerCase()))
    : SUGGESTIONS

  const go = () => router.push('/search')

  return (
    <div style={{ marginTop: 26, position: 'relative', maxWidth: 560 }}>
      <span style={{ position: 'absolute', left: 16, top: 18, color: 'var(--text-muted)', pointerEvents: 'none' }}>
        <Icon name="search" size={16} />
      </span>
      <input
        placeholder='Αναζητήστε "κατασκευές Αττική", ΑΦΜ, ΓΕΜΗ...'
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={e => { if (e.key === 'Enter') go() }}
        style={{
          width: '100%', height: 52,
          padding: '0 130px 0 44px',
          fontSize: 15,
          background: '#fff',
          border: '0.5px solid var(--border-strong)',
          borderRadius: 8,
          fontFamily: 'var(--font-sans)',
          color: 'var(--text-primary)',
          outline: 'none',
          boxShadow: focused ? '0 0 0 3px rgba(37,99,168,0.15)' : 'none',
          borderColor: focused ? 'var(--accent)' : 'var(--border-strong)',
          transition: 'box-shadow .12s, border-color .12s',
        }}
      />
      <button
        onClick={go}
        style={{
          position: 'absolute', right: 6, top: 8,
          height: 36, padding: '0 16px',
          background: 'var(--accent)', color: '#fff',
          border: '0.5px solid var(--accent)',
          borderRadius: 6, fontSize: 13, fontWeight: 500,
          fontFamily: 'var(--font-sans)', cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        Αναζήτηση
        <Icon name="arrow-up-right" size={12} />
      </button>

      {focused && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: 58, left: 0, right: 0,
          background: '#fff',
          border: '0.5px solid var(--border-strong)',
          borderRadius: 8,
          padding: 6,
          zIndex: 20,
          boxShadow: '0 12px 32px rgba(26,35,50,0.08)',
        }}>
          <div style={{ padding: '6px 10px', fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Προτάσεις
          </div>
          {filtered.map((s, i) => (
            <div
              key={i}
              onClick={go}
              style={{
                padding: '8px 10px',
                display: 'flex', alignItems: 'center', gap: 10,
                borderRadius: 6, cursor: 'pointer',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--row-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{
                width: 26, height: 26, borderRadius: 5, flexShrink: 0,
                background: s.type === 'company' ? 'var(--accent-light)' : '#F2F1ED',
                color: s.type === 'company' ? '#1A4A8A' : 'var(--text-secondary)',
                border: s.type === 'company' ? '0.5px solid #C0D0E8' : '0.5px solid var(--border)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name={s.icon} size={12} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{s.primary}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.secondary}</div>
              </div>
              <span style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {s.type}
              </span>
              <Icon name="chevron-right" size={12} style={{ color: 'var(--text-muted)' }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
