'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Icon from './Icon'

const LOGO_COLORS = [
  { bg: '#EEF4FF', fg: '#1A4A8A', border: '#C0D0E8' },
  { bg: '#F1F0EA', fg: '#3D3527', border: '#D7D2C0' },
  { bg: '#EAF3EE', fg: '#1F5C42', border: '#B6D4C2' },
  { bg: '#F5EEEA', fg: '#7A3826', border: '#E0CCBE' },
  { bg: '#EEEEF5', fg: '#3D3A6E', border: '#C5C3DC' },
  { bg: '#F4F1E8', fg: '#5F4A1E', border: '#DAD0A8' },
]

function logoColor(id: string) {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return LOGO_COLORS[h % LOGO_COLORS.length]
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(w => w.length > 1)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

interface CapitalEntry { capitalStock?: number; currency?: string }

interface CompanyDetail {
  ar_gemi: string
  co_name_el: string
  legal_type_descr: string | null
  status_descr: string | null
  prefecture_descr: string | null
  municipality_descr: string | null
  city: string | null
  email: string | null
  phone: string | null
  url: string | null
  incorporation_date: string | null
  primary_kad: string | null
  capital: CapitalEntry[] | null
  instagram_url: string | null
  facebook_url: string | null
  linkedin_url: string | null
  twitter_url: string | null
  tiktok_url: string | null
  youtube_url: string | null
}

const PANEL_SOCIALS = [
  { key: 'instagram_url' as const, label: 'Instagram',   icon: 'instagram',  color: '#E1306C' },
  { key: 'facebook_url'  as const, label: 'Facebook',    icon: 'facebook',   color: '#1877F2' },
  { key: 'linkedin_url'  as const, label: 'LinkedIn',    icon: 'linkedin',   color: '#0A66C2' },
  { key: 'twitter_url'   as const, label: 'X / Twitter', icon: 'twitter-x',  color: '#1D1D1B' },
  { key: 'tiktok_url'    as const, label: 'TikTok',      icon: 'tiktok',     color: '#010101' },
  { key: 'youtube_url'   as const, label: 'YouTube',     icon: 'youtube',    color: '#FF0000' },
]

function formatCapital(capital: CapitalEntry[] | null): string | null {
  const stock = capital?.[0]?.capitalStock
  if (!stock) return null
  return `€${new Intl.NumberFormat('el-GR').format(stock)}`
}

interface Member {
  person_name: string
  role: string | null
  category: string | null
  dt_to: string | null
}

interface PanelData extends CompanyDetail {
  members: Member[]
}

export default function CompanyPreviewPanel({
  arGemi,
  onClose,
}: {
  arGemi: string | null
  onClose: () => void
}) {
  const [data, setData] = useState<PanelData | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!arGemi) { setData(null); return }
    setLoading(true)
    setData(null)
    fetch(`/api/company/${arGemi}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [arGemi])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  const isOpen = !!arGemi

  return (
    <>
      {isOpen && <div className="co-panel-backdrop" onClick={onClose} />}
      <div className="co-panel" data-open={isOpen ? 'true' : 'false'}>
        {loading && (
          <div className="co-panel-loading">
            <div className="co-panel-skel co-panel-skel-logo" />
            <div style={{ flex: 1 }}>
              <div className="co-panel-skel co-panel-skel-name" />
              <div className="co-panel-skel co-panel-skel-meta" />
            </div>
          </div>
        )}
        {!loading && data && <PanelContent data={data} onClose={onClose} />}
      </div>
    </>
  )
}

function PanelContent({ data, onClose }: { data: PanelData; onClose: () => void }) {
  const col      = logoColor(data.ar_gemi)
  const initials = getInitials(data.co_name_el)
  const isActive = data.status_descr?.toLowerCase().includes('ενεργ')
  const location = [data.city ?? data.municipality_descr, data.prefecture_descr].filter(Boolean).join(', ')
  const year     = data.incorporation_date?.slice(0, 4)
  const websiteUrl = data.url?.startsWith('http') ? data.url : data.url ? `https://${data.url}` : null

  const currentMembers = data.members.filter(m => !m.dt_to)
  const shownMembers   = currentMembers.length > 0 ? currentMembers : data.members

  return (
    <div className="co-panel-inner">
      {/* Header */}
      <div className="co-panel-header">
        <span
          className="co-panel-logo"
          style={{ background: col.bg, color: col.fg, borderColor: col.border }}
        >
          {initials}
        </span>
        <div className="co-panel-hd-text">
          <div className="co-panel-name">{data.co_name_el}</div>
          <div className="co-panel-meta">
            {data.legal_type_descr && <span>{data.legal_type_descr}</span>}
            {data.status_descr && (
              <span className={`co-panel-status ${isActive ? 'active' : 'inactive'}`}>
                ● {data.status_descr}
              </span>
            )}
          </div>
        </div>
        <button className="co-panel-close" onClick={onClose} title="Close">
          <Icon name="x" size={14} />
        </button>
      </div>

      {/* Body */}
      <div className="co-panel-body">

        {/* Location + Year */}
        {(location || year) && (
          <div className="co-panel-section">
            <div className="co-panel-row">
              <Icon name="map-pin" size={13} />
              <span>{[location, year ? `Ίδρυση ${year}` : null].filter(Boolean).join(' · ')}</span>
            </div>
          </div>
        )}

        {/* Primary KAD */}
        {data.primary_kad && (
          <div className="co-panel-section">
            <div className="co-panel-row">
              <Icon name="tag" size={13} />
              <span className="co-panel-kad">{data.primary_kad}</span>
            </div>
          </div>
        )}

        {/* Contact */}
        {(data.email || data.phone || websiteUrl) && (
          <div className="co-panel-section">
            {data.email && (
              <div className="co-panel-row">
                <Icon name="mail" size={13} />
                <a href={`mailto:${data.email}`} className="co-panel-link">{data.email}</a>
              </div>
            )}
            {data.phone && (
              <div className="co-panel-row">
                <Icon name="phone" size={13} />
                <a href={`tel:${data.phone}`} className="co-panel-link">{data.phone}</a>
              </div>
            )}
            {websiteUrl && (
              <div className="co-panel-row">
                <Icon name="globe" size={13} />
                <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="co-panel-link">
                  {data.url}
                </a>
              </div>
            )}
          </div>
        )}

        {/* Socials */}
        {PANEL_SOCIALS.some(s => data[s.key]) && (
          <div className="co-panel-section">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {PANEL_SOCIALS.map(s => data[s.key] ? (
                <Icon key={s.key} name={s.icon} size={20} style={{ color: s.color, flexShrink: 0 }} />
              ) : null)}
            </div>
          </div>
        )}

        {/* Members */}
        {shownMembers.length > 0 && (
          <div className="co-panel-section">
            <div className="co-panel-section-title">Στελέχη</div>
            {shownMembers.slice(0, 5).map((m, i) => (
              <div key={i} className="co-panel-member">
                <span className="co-panel-member-name">{m.person_name}</span>
                <span
                  className="co-panel-member-role"
                  style={m.dt_to ? { opacity: 0.45 } : undefined}
                >
                  {m.role ?? m.category ?? ''}
                </span>
              </div>
            ))}
            {shownMembers.length > 5 && (
              <div className="co-panel-more">+ {shownMembers.length - 5} ακόμα</div>
            )}
          </div>
        )}

        {/* Capital */}
        {formatCapital(data.capital) && (
          <div className="co-panel-section">
            <div className="co-panel-row" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Μετοχικό κεφάλαιο: <strong style={{ marginLeft: 4, color: 'var(--text-secondary)' }}>{formatCapital(data.capital)}</strong>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="co-panel-footer">
        <Link href={`/etaireies/${data.ar_gemi}`} className="co-panel-full-btn">
          Πλήρες προφίλ
          <Icon name="arrow-right" size={13} />
        </Link>
      </div>
    </div>
  )
}
