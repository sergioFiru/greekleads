'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Icon from '@/components/Icon'
import TopNav from '@/components/TopNav'

// ── TypeScript globals ──────────────────────────────────────────────
declare global {
  interface Window {
    particlesJS: (id: string, config: unknown) => void
    pJSDom: Array<{ pJS: { fn: { vendors: { destroypJS: () => void } } } }>
  }
}

// ── Static data ─────────────────────────────────────────────────────
const LOGO_COLORS = [
  { bg: '#EEF4FF', fg: '#1A4A8A', border: '#C0D0E8' },
  { bg: '#F1F0EA', fg: '#3D3527', border: '#D7D2C0' },
  { bg: '#EAF3EE', fg: '#1F5C42', border: '#B6D4C2' },
  { bg: '#F5EEEA', fg: '#7A3826', border: '#E0CCBE' },
  { bg: '#EEEEF5', fg: '#3D3A6E', border: '#C5C3DC' },
  { bg: '#F0F7F4', fg: '#1E4D3B', border: '#B8D8CC' },
]

const PREVIEW_COMPANIES = [
  { id: 'c001', name: 'Helleniq Cloud Systems', legal: 'IKE', city: 'Athens',       year: 2020, sectorLabel: 'Software & IT',          employees: 420,  revenue: 8.4   },
  { id: 'c002', name: 'Pelagos Maritime Group',  legal: 'AE',  city: 'Piraeus',      year: 2014, sectorLabel: 'Shipping & Logistics',    employees: 1240, revenue: 184.2 },
  { id: 'c003', name: 'Olympus Renewables',      legal: 'AE',  city: 'Athens',       year: 2018, sectorLabel: 'Energy & Utilities',      employees: 310,  revenue: 42.8  },
  { id: 'c004', name: 'Aegean Bistro Holdings',  legal: 'AE',  city: 'Thessaloniki', year: 2016, sectorLabel: 'Food & Beverage',         employees: 890,  revenue: 32.1  },
  { id: 'c005', name: 'Kyklades Hospitality',    legal: 'AE',  city: 'Santorini',    year: 2007, sectorLabel: 'Tourism & Hospitality',   employees: 1820, revenue: 61.4  },
]

const STREAM_EVENTS = [
  { co: 'Pelagos Maritime Group',   action: 'Revenue updated to €184.2M',        tag: 'financials', t: '04:12' },
  { co: 'Helleniq Cloud Systems',   action: 'Instagram + TikTok profiles linked', tag: 'social',     t: '04:11' },
  { co: 'Olympus Renewables',       action: 'Annual filing FY2024 indexed',       tag: 'filing',     t: '04:09' },
  { co: 'Thalia Fintech',           action: '3 board members cross-linked',       tag: 'network',    t: '04:07' },
  { co: 'Mediterra Pharma',         action: 'Verified phone +30 261… added',     tag: 'contact',    t: '04:05' },
  { co: 'Aegean Bistro Holdings',   action: 'Facebook page matched',              tag: 'social',     t: '04:02' },
  { co: 'Boreas Wind Operations',   action: 'New permit filed in ΓΕΜΗ',           tag: 'filing',     t: '03:58' },
  { co: 'Kyklades Hospitality',     action: 'Headcount revised to 380',           tag: 'financials', t: '03:55' },
  { co: 'Lyceum Software Labs',     action: 'Shared shareholder detected',        tag: 'network',    t: '03:51' },
  { co: 'Doric Construction Group', action: 'Subsidiary added (Doric Energy AE)', tag: 'event',      t: '03:47' },
]

const TAG_STYLES: Record<string, { bg: string; fg: string; border: string; label: string }> = {
  filing:     { bg: 'var(--gemi-bg)',      fg: 'var(--gemi-text)',      border: 'var(--gemi-border)',   label: 'FILING'     },
  social:     { bg: 'var(--li-bg)',        fg: 'var(--li-text)',        border: 'var(--li-border)',     label: 'SOCIAL'     },
  network:    { bg: '#F1ECFA',             fg: '#5B45A8',               border: '#D7CCEC',              label: 'NETWORK'    },
  contact:    { bg: '#F1F0EA',             fg: '#5F4A1E',               border: '#D7D2C0',              label: 'CONTACT'    },
  financials: { bg: 'var(--accent-light)', fg: 'var(--accent)',         border: 'var(--li-border)',     label: 'FINANCIALS' },
  event:      { bg: 'var(--subtle-bg)',    fg: 'var(--text-secondary)', border: 'var(--border)',        label: 'EVENT'      },
}

const SOCIAL_PLATFORMS = [
  { key: 'instagram', icon: 'instagram', color: '#C13584' },
  { key: 'facebook',  icon: 'facebook',  color: '#1877F2' },
  { key: 'twitter-x', icon: 'twitter-x', color: 'var(--text-primary)' },
  { key: 'tiktok',    icon: 'tiktok',    color: 'var(--text-primary)' },
  { key: 'youtube',   icon: 'youtube',   color: '#E0322B' },
]

// ── Helpers ─────────────────────────────────────────────────────────
function colorFor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return LOGO_COLORS[h % LOGO_COLORS.length]
}
function initialOf(name: string) {
  const words = name.trim().split(/\s+/).filter(w => w.length > 1)
  return words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
}
function fmtRevenue(m: number) { return m >= 1000 ? (m / 1000).toFixed(1) + 'B' : m.toFixed(1) }
function fmtInt(n: number) { return n.toLocaleString('en-US') }
function hashStr(s: string) {
  let h = 0
  for (let i = 0; i < (s || '').length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

// ── Sub-components ──────────────────────────────────────────────────
function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" fill="none">
      <rect x="1" y="1" width="12" height="12" stroke="#E8EDF5" strokeWidth="1.4" />
      <rect x="9" y="9" width="12" height="12" fill="#2563A8" />
    </svg>
  )
}

function CompanyLogo({ company }: { company: { id: string; name: string } }) {
  const col = colorFor(company.id)
  return (
    <span style={{
      width: 28, height: 28, borderRadius: 6, flexShrink: 0,
      background: col.bg, color: col.fg, border: `0.5px solid ${col.border}`,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
    }}>
      {initialOf(company.name)}
    </span>
  )
}

function GemiBadge() {
  return (
    <span className="badge badge-gemi">
      <Icon name="verified" size={10} stroke={1.6} />ΓΕΜΗ
    </span>
  )
}

function SectorBadge({ label }: { label: string }) {
  return <span className="badge badge-sector">{label}</span>
}

function SocialChip({ icon, color, size = 28, active = true }: { icon: string; color: string; size?: number; active?: boolean }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: 7,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      background: active ? 'var(--surface)' : 'var(--subtle-bg)',
      border: '0.5px solid var(--border)',
      color: active ? color : 'var(--text-muted)',
      opacity: active ? 1 : 0.45,
    }}>
      <Icon name={icon} size={Math.round(size * 0.52)} />
    </span>
  )
}

function RowSignals({ company }: { company: { id: string } }) {
  const h = hashStr(company.id)
  const socials = SOCIAL_PLATFORMS.filter((_, i) => ((h >> i) & 1) === 1).slice(0, 3)
  const hasEmail = (h & 0b1000) !== 0
  const hasPhone = (h & 0b10000) !== 0
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
      {socials.map(s => (
        <span key={s.key} title={s.key} style={{ color: s.color, display: 'inline-flex' }}>
          <Icon name={s.icon} size={13} />
        </span>
      ))}
      {hasEmail && <span title="Verified email" style={{ color: 'var(--gemi-text)', display: 'inline-flex' }}><Icon name="mail" size={12} stroke={1.7} /></span>}
      {hasPhone && <span title="Verified phone" style={{ color: 'var(--gemi-text)', display: 'inline-flex' }}><Icon name="phone" size={12} stroke={1.7} /></span>}
      {socials.length === 0 && !hasEmail && !hasPhone && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>}
    </div>
  )
}

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

function SectionHeader({ index, eyebrow, title, body, compact = false, center = false }: {
  index?: string; eyebrow?: string; title: string; body?: string; compact?: boolean; center?: boolean
}) {
  return (
    <div style={{ maxWidth: center ? 760 : (compact ? 560 : 700), margin: center ? '0 auto' : undefined, textAlign: center ? 'center' : 'left' }}>
      {eyebrow && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          justifyContent: center ? 'center' : 'flex-start',
          fontSize: 11, color: 'var(--accent)',
          textTransform: 'uppercase', letterSpacing: '0.1em',
          marginBottom: 16, fontWeight: 500,
        }}>
          {index && <span className="section-index">{index}</span>}
          {eyebrow}
        </div>
      )}
      <h2 style={{
        margin: 0,
        fontSize: compact ? 30 : 40,
        fontWeight: 600,
        letterSpacing: '-0.025em',
        lineHeight: 1.1,
        color: 'var(--text-primary)',
      }}>{title}</h2>
      {body && (
        <p style={{
          margin: center ? '16px auto 0' : '16px 0 0',
          fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 600,
        }}>{body}</p>
      )}
    </div>
  )
}

function ScoutGlyph({ size = 28 }: { size?: number }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: 6,
      background: 'var(--accent-light)', border: '0.5px solid var(--li-border)',
      color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <Icon name="sparkle" size={Math.round(size * 0.6)} stroke={1.6} />
    </span>
  )
}

function ScoutChips({ label, items }: { label: string; items: string[] }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginBottom: 7, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: 58, flexShrink: 0 }}>{label}</span>
      <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {items.map((it, i) => <span key={i} className="badge badge-sector" style={{ height: 19 }}>{it}</span>)}
      </span>
    </div>
  )
}

// ── LIVE EXHIBIT ─────────────────────────────────────────────────────
interface HomeStats {
  companies?: number
  active?: number
  withContact?: number
  withSocial?: number
}

// The live registry feed, moved out of the hero into its own band so the
// search bar is the only focal point above the fold.
function LiveFeedSection({ totalCompanies }: { totalCompanies: number }) {
  return (
    <section className="home-screen hero-feed">
      <div className="hero-feed-inner">
        <div className="hero-feed-hd">
          <div>
            <h2 className="hero-feed-title">Ζωντανή ροή μητρώου</h2>
            <p className="hero-feed-sub">
              Νέες εγγραφές και μεταβολές, όπως καταχωρούνται στο ΓΕΜΗ.
            </p>
          </div>
          <Link
            href="/search"
            style={{
              fontSize: 13, fontWeight: 600, color: '#1B4B8F',
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5,
            }}
          >
            Εξερευνήστε το μητρώο <Icon name="chevron-right" size={12} />
          </Link>
        </div>
        <LiveExhibit initialCount={totalCompanies} />
      </div>
    </section>
  )
}

function LiveExhibit({ initialCount }: { initialCount: number }) {
  const [tick, setTick] = useState(0)
  const [counter, setCounter] = useState(initialCount)

  useEffect(() => {
    setCounter(initialCount)
  }, [initialCount])

  useEffect(() => {
    const i = setInterval(() => {
      setTick(t => t + 1)
      setCounter(c => c + Math.floor(Math.random() * 3) + 1)
    }, 2200)
    return () => clearInterval(i)
  }, [])

  const visible = Array.from({ length: 6 }, (_, i) => STREAM_EVENTS[(tick + i) % STREAM_EVENTS.length])

  return (
    <div style={{
      background: 'var(--surface)', border: '0.5px solid var(--border-strong)',
      borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--hero-card-shadow)',
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: '0.5px solid var(--border)',
        background: 'var(--nav-bg)', color: 'var(--nav-text-active)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            width: 8, height: 8, borderRadius: 4, background: '#3EB57A',
            boxShadow: '0 0 0 3px rgba(62,181,122,0.22)',
            animation: 'agora-pulse 1.6s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 11.5, fontWeight: 500, letterSpacing: '0.06em' }}>ΖΩΝΤΑΝΗ ΡΟΗ ΓΕΜΗ</span>
        </div>
        <span style={{ fontSize: 10.5, color: 'var(--nav-text-muted)', fontFamily: 'var(--font-mono)' }}>
          2026-07-02 · 04:12 EET
        </span>
      </div>

      <div style={{
        padding: '16px 16px 14px', borderBottom: '0.5px solid var(--row-divider)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Καταχωρημένες επιχειρήσεις</div>
          <div className="mono" style={{
            fontSize: 26, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.01em',
            fontVariantNumeric: 'tabular-nums', marginTop: 2,
          }}>{counter.toLocaleString('en-US')}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Τελευταίες 24 ώρες</div>
          <div className="mono" style={{ fontSize: 15, fontWeight: 500, color: 'var(--gemi-text)', marginTop: 2 }}>+1.284 εγγραφές</div>
        </div>
      </div>

      <div style={{ padding: '4px 0' }}>
        {visible.map((e, i) => {
          const ts = TAG_STYLES[e.tag]
          return (
            <div key={`${tick}-${i}`} style={{
              padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10,
              borderTop: i === 0 ? 'none' : '0.5px solid var(--row-divider)',
              opacity: 1 - (i * 0.08),
              animation: i === 0 ? 'agora-streamin .5s ease-out' : undefined,
            }}>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)', width: 38, flexShrink: 0 }}>{e.t}</span>
              <span style={{
                fontSize: 9.5, fontWeight: 500, padding: '1px 6px', borderRadius: 3,
                background: ts.bg, color: ts.fg, border: `0.5px solid ${ts.border}`,
                letterSpacing: '0.04em', width: 78, textAlign: 'center', flexShrink: 0,
              }}>{ts.label}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.co}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.action}</div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{
        padding: '10px 14px', background: 'var(--subtle-bg2)', borderTop: '0.5px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)',
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="verified" size={11} stroke={1.6} style={{ color: 'var(--gemi-text)' }} />
          Πηγή · <span className="mono" style={{ color: 'var(--text-primary)' }}>business.gov.gr/gemi</span>
        </span>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>ροή · 14 γεγονότα/λεπτό</span>
      </div>
    </div>
  )
}

// ── HERO BACKDROP ────────────────────────────────────────────────────
function HeroBackdrop() {
  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      backgroundImage: 'radial-gradient(circle, var(--hero-dot) 0.7px, transparent 0.7px)',
      backgroundSize: '26px 26px', backgroundPosition: 'center top',
      opacity: 'var(--hero-dot-opacity)' as unknown as number,
      maskImage: 'linear-gradient(to bottom, #000 20%, transparent 92%)',
      WebkitMaskImage: 'linear-gradient(to bottom, #000 20%, transparent 92%)',
    }} />
  )
}

// ── PARTICLES BACKDROP ───────────────────────────────────────────────
const particleConfig = (dot: string, line: string, dotOp = 0.6, lineOp = 0.5) => ({
  particles: {
    number: { value: 72, density: { enable: true, value_area: 900 } },
    color: { value: dot },
    shape: { type: 'circle' },
    opacity: { value: dotOp, random: true, anim: { enable: true, speed: 0.5, opacity_min: dotOp * 0.3, sync: false } },
    size: { value: 2.6, random: true },
    line_linked: { enable: true, distance: 138, color: line, opacity: lineOp, width: 1 },
    move: { enable: true, speed: 0.9, direction: 'none', random: true, straight: false, out_mode: 'out', bounce: false },
  },
  interactivity: {
    detect_on: 'window',
    events: { onhover: { enable: true, mode: 'grab' }, onclick: { enable: false }, resize: true },
    modes: { grab: { distance: 170, line_linked: { opacity: 0.6 } } },
  },
  retina_detect: true,
})

function ParticlesBackdrop() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) return
    let cancelled = false, tries = 0
    const destroy = () => {
      if (window.pJSDom?.length) {
        try { window.pJSDom.forEach(d => d.pJS.fn.vendors.destroypJS()) } catch {}
        window.pJSDom = []
      }
    }
    const build = () => {
      const el = document.getElementById('agora-particles')
      if (cancelled || !window.particlesJS || !el) return
      destroy()
      const dark = document.documentElement.getAttribute('data-theme') === 'dark'
      window.particlesJS('agora-particles', dark
        ? particleConfig('#6BA6EE', '#5B93DE', 0.6, 0.5)
        : particleConfig('#3E7DC4', '#6B98D0', 0.42, 0.32))
      requestAnimationFrame(() => { try { window.dispatchEvent(new Event('resize')) } catch {} })
    }
    const tick = () => {
      const el = document.getElementById('agora-particles')
      if ((window.particlesJS as unknown) && el && el.clientHeight > 0) build()
      else if (tries++ < 120) setTimeout(tick, 50)
    }
    tick()
    const obs = new MutationObserver(() => build())
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    let ro: ResizeObserver | null = null
    const roEl = document.getElementById('agora-particles')
    if (window.ResizeObserver && roEl) {
      let last = 0
      ro = new ResizeObserver(() => {
        const h = roEl.clientHeight
        if (h > 0 && Math.abs(h - last) > 4) {
          last = h
          if (window.pJSDom?.length) {
            try { window.dispatchEvent(new Event('resize')) } catch {}
          } else build()
        }
      })
      ro.observe(roEl)
    }
    return () => { cancelled = true; obs.disconnect(); if (ro) ro.disconnect(); destroy() }
  }, [])

  return (
    <div id="agora-particles" aria-hidden style={{
      position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
      maskImage: 'linear-gradient(to bottom, #000 38%, transparent 92%)',
      WebkitMaskImage: 'linear-gradient(to bottom, #000 38%, transparent 92%)',
    }} />
  )
}

// ── CROP MARKS ───────────────────────────────────────────────────────
function CropMarks() {
  return (
    <div style={{ position: 'absolute', inset: -18, pointerEvents: 'none' }} aria-hidden>
      {([
        { top: 0,        left: 0,        sides: ['t','l'] },
        { top: 0,        right: 0,       sides: ['t','r'] },
        { bottom: 0,     left: 0,        sides: ['b','l'] },
        { bottom: 0,     right: 0,       sides: ['b','r'] },
      ] as Array<{ top?: number; right?: number; bottom?: number; left?: number; sides: string[] }>).map((c, i) => (
        <span key={i} style={{
          position: 'absolute',
          top: c.top, left: c.left, right: c.right, bottom: c.bottom,
          width: 14, height: 14,
          borderTop:    c.sides.includes('t') ? '0.5px solid var(--border-strong)' : 'none',
          borderBottom: c.sides.includes('b') ? '0.5px solid var(--border-strong)' : 'none',
          borderLeft:   c.sides.includes('l') ? '0.5px solid var(--border-strong)' : 'none',
          borderRight:  c.sides.includes('r') ? '0.5px solid var(--border-strong)' : 'none',
        }} />
      ))}
    </div>
  )
}

// ── HERO ─────────────────────────────────────────────────────────────

interface Suggestion {
  ar_gemi: string
  name: string
  legal_type: string | null
  place: string | null
  status: string | null
}

interface NewFirm {
  ar_gemi: string
  name: string
  legal_type: string
  city: string
  ts: number          // epoch ms of registration
}

interface ScoutResult {
  filters: {
    prefectures: string[]
    legal_types: string[]
    has_email: boolean
    has_phone: boolean
    has_website: boolean
    has_no_website: boolean
    statuses: string[]
    activities: string[]
  }
  explanation: string
  summary: string
  result_count: number
  activity_keywords: string[]
}

// Must match SearchPage's KAD_SESSION_KEY / KAD_URL_MAX — the hero writes the
// handoff that SearchPage reads.
const SCOUT_KAD_KEY = 'gl_kad_filter'
const SCOUT_KAD_URL_MAX = 5

const SCOUT_EXAMPLES = [
  'Πουλάω λογισμικό σε λογιστικά γραφεία',
  'Ανακαινίσεις σε ξενοδοχεία στην Κρήτη',
  'Καφέ χονδρικής σε εστιατόρια και μπαρ',
]

// PLACEHOLDER DATA — swap for the live watcher feed.
// new_firms_watcher.py already polls ΓΕΜΗ every 10 min; when that is exposed
// over a socket/SSE, replace useFakeNewFirms() with the live subscription.
// The NewFirm shape above is what the real feed should emit.
const FAKE_NEW_FIRMS: Array<Omit<NewFirm, 'ts'>> = [
  { ar_gemi: '181240301000', name: 'ΑΙΓΑΙΟ ΤΕΧΝΙΚΗ ΙΚΕ',            legal_type: 'ΙΚΕ',     city: 'ΠΕΙΡΑΙΑΣ' },
  { ar_gemi: '181239802000', name: 'ΚΑΛΛΙΣΤΩ ΤΡΟΦΙΜΑ ΑΕ',           legal_type: 'ΑΕ',      city: 'ΘΕΣΣΑΛΟΝΙΚΗ' },
  { ar_gemi: '181238105000', name: 'ΔΕΛΦΟΙ ΣΥΜΒΟΥΛΕΥΤΙΚΗ ΟΕ',       legal_type: 'ΟΕ',      city: 'ΑΘΗΝΑ' },
  { ar_gemi: '181237409000', name: 'ΜΕΛΤΕΜΙ ΤΟΥΡΙΣΤΙΚΗ ΙΚΕ',        legal_type: 'ΙΚΕ',     city: 'ΡΟΔΟΣ' },
  { ar_gemi: '181236703000', name: 'ΠΑΠΠΑΣ ΓΕΩΡΓΙΟΣ',               legal_type: 'ΑΤΟΜΙΚΗ', city: 'ΛΑΡΙΣΑ' },
  { ar_gemi: '181235908000', name: 'ΟΛΥΜΠΟΣ ΕΝΕΡΓΕΙΑΚΗ ΑΕ',         legal_type: 'ΑΕ',      city: 'ΚΑΤΕΡΙΝΗ' },
  { ar_gemi: '181235204000', name: 'ΚΡΗΤΙΚΑ ΑΓΡΟΤΙΚΑ ΙΚΕ',          legal_type: 'ΙΚΕ',     city: 'ΗΡΑΚΛΕΙΟ' },
  { ar_gemi: '181234607000', name: 'ΝΑΥΣΙΚΑ ΝΑΥΤΙΛΙΑΚΗ ΕΠΕ',        legal_type: 'ΕΠΕ',     city: 'ΠΕΙΡΑΙΑΣ' },
  { ar_gemi: '181233901000', name: 'ΖΑΓΟΡΙ ΞΕΝΩΝΕΣ ΙΚΕ',            legal_type: 'ΙΚΕ',     city: 'ΙΩΑΝΝΙΝΑ' },
  { ar_gemi: '181233205000', name: 'ΑΤΤΙΚΗ ΨΗΦΙΑΚΗ ΑΕ',             legal_type: 'ΑΕ',      city: 'ΑΘΗΝΑ' },
]

function useFakeNewFirms(visible = 5) {
  const [items, setItems] = useState<NewFirm[]>([])
  const idx = useRef(0)

  useEffect(() => {
    const now = Date.now()
    // Seed with a few already-aged entries so the panel is never empty.
    setItems(
      FAKE_NEW_FIRMS.slice(0, visible).map((f, i) => ({ ...f, ts: now - (i + 1) * 96_000 }))
    )
    idx.current = visible

    const t = setInterval(() => {
      const next = FAKE_NEW_FIRMS[idx.current % FAKE_NEW_FIRMS.length]
      idx.current += 1
      setItems(prev => [{ ...next, ts: Date.now() }, ...prev].slice(0, visible))
    }, 5200)
    return () => clearInterval(t)
  }, [visible])

  return items
}

function agoLabel(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 10) return 'τώρα'
  if (s < 60) return `${s}δ`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}λ`
  return `${Math.round(m / 60)}ω`
}

function Hero({ totalCompanies, stats }: { totalCompanies: number; stats: HomeStats }) {
  const router = useRouter()
  const [mode, setMode]     = useState<'scout' | 'manual'>('scout')
  const [query, setQuery]   = useState('')
  const [open, setOpen]     = useState(false)
  const [items, setItems]   = useState<Suggestion[]>([])
  const [busy, setBusy]     = useState(false)
  const [cursor, setCursor] = useState(-1)
  const boxRef = useRef<HTMLDivElement>(null)
  const seqRef = useRef(0)

  // Scout mode
  const [brief, setBrief]     = useState('')
  const [scouting, setScouting] = useState(false)
  const [recipe, setRecipe]   = useState<ScoutResult | null>(null)
  const [scoutErr, setScoutErr] = useState<string | null>(null)

  const newFirms = useFakeNewFirms(5)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(t)
  }, [])

  const trimmed = query.trim()

  // Company typeahead — companies only.
  useEffect(() => {
    if (trimmed.length < 3) { setItems([]); setBusy(false); return }
    setBusy(true)
    const seq = ++seqRef.current
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(trimmed)}`)
        const d = await r.json()
        if (seq !== seqRef.current) return   // drop stale keystroke responses
        setItems(d.results ?? [])
      } catch {
        if (seq === seqRef.current) setItems([])
      } finally {
        if (seq === seqRef.current) setBusy(false)
      }
    }, 180)
    return () => clearTimeout(t)
  }, [trimmed])

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const goToSearch = () =>
    router.push(trimmed ? `/search?name=${encodeURIComponent(trimmed)}` : '/search')

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setCursor(c => Math.min(c + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, -1)) }
    else if (e.key === 'Enter') {
      if (cursor >= 0 && items[cursor]) router.push(`/etaireies/${items[cursor].ar_gemi}`)
      else goToSearch()
    }
  }

  // ── Scout ──
  const runScout = async () => {
    const text = brief.trim()
    if (text.length < 8 || scouting) return
    setScouting(true); setScoutErr(null); setRecipe(null)
    try {
      const r = await fetch('/api/scout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: text }] }),
      })
      const d = await r.json()
      if (d.error) { setScoutErr(d.error); return }
      if (!d.filters) { setScoutErr('Ο Scout δεν κατάλαβε το αίτημα. Δοκίμασε πιο συγκεκριμένη περιγραφή.'); return }
      setRecipe(d as ScoutResult)
    } catch {
      setScoutErr('Κάτι πήγε στραβά. Δοκίμασε ξανά.')
    } finally {
      setScouting(false)
    }
  }

  // Hand Scout's filters to /search. The resolved KAD list routinely runs to
  // hundreds of values, which would blow the URL length limit, so SearchPage
  // reads them from sessionStorage when `has_kad=1` is present.
  const openScoutResults = () => {
    if (!recipe) return
    const f = recipe.filters
    const p = new URLSearchParams()
    ;(f.statuses?.length ? f.statuses : ['Ενεργή']).forEach(s => p.append('status', s))
    f.prefectures?.forEach(s => p.append('prefecture', s))
    f.legal_types?.forEach(s => p.append('legal_type', s))
    if (f.has_email)      p.set('email', '1')
    if (f.has_phone)      p.set('phone', '1')
    if (f.has_website)    p.set('website', '1')
    if (f.has_no_website) p.set('no_website', '1')

    const acts = f.activities ?? []
    if (acts.length > SCOUT_KAD_URL_MAX) {
      try {
        sessionStorage.setItem(SCOUT_KAD_KEY, JSON.stringify(acts))
        p.set('has_kad', '1')
      } catch {
        // sessionStorage unavailable — fall back to the broader segment rather
        // than a URL that would 431.
      }
    } else {
      acts.forEach(a => p.append('kad', a))
    }
    router.push(`/search?${p.toString()}`)
  }

  const showDrop = open && trimmed.length >= 3
  const active   = stats.active || 0
  const contact  = stats.withContact || 0

  return (
    <section className="hs">
      <div className="hs-inner">

        {/* ── LEFT ── */}
        <div>
          <div className="hs-brand">
            <span className="hs-brand-mark">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
                <rect x="2" y="2" width="9" height="9" fill="#fff" opacity="0.55" />
                <rect x="13" y="13" width="9" height="9" fill="#fff" />
              </svg>
            </span>
            <span className="hs-brand-name">GreekLeads</span>
            <span className="hs-brand-tag">Επιχειρηματικό μητρώο</span>
          </div>

          <h1 className="hs-title">Βρες τους επόμενους<br />πελάτες σου.</h1>

          <p className="hs-sub">
            Κάθε ελληνική επιχείρηση, έτοιμη για προσέγγιση.
          </p>

          <div className="hs-modes" role="tablist">
            <button
              className="hs-mode"
              data-on={mode === 'scout' ? 'true' : 'false'}
              onClick={() => setMode('scout')}
              role="tab"
              aria-selected={mode === 'scout'}
            >
              <Icon name="sparkle" size={13} />
              Βρες μου πελάτες
              <span className="hs-mode-badge">SCOUT AI</span>
            </button>
            <button
              className="hs-mode"
              data-on={mode === 'manual' ? 'true' : 'false'}
              onClick={() => { setMode('manual'); setRecipe(null); setScoutErr(null) }}
              role="tab"
              aria-selected={mode === 'manual'}
            >
              <Icon name="search" size={13} />
              Αναζήτηση εταιρείας
            </button>
          </div>

          <div className="hs-search" ref={boxRef}>
            <div className="hs-field">
              <span className="hs-ico">
                <Icon name={mode === 'scout' ? 'sparkle' : 'search'} size={19} />
              </span>

              {mode === 'scout' ? (
                <textarea
                  className="hs-input-scout"
                  placeholder="Περίγραψε τι πουλάς και σε ποιους…"
                  value={brief}
                  onChange={e => setBrief(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runScout() }
                  }}
                  rows={1}
                  aria-label="Περιγραφή πελατών για τον Scout"
                />
              ) : (
                <input
                  className="hs-input"
                  placeholder="Αναζήτησε επιχείρηση, ΓΕΜΗ ή ΑΦΜ…"
                  value={query}
                  onChange={e => { setQuery(e.target.value); setOpen(true); setCursor(-1) }}
                  onFocus={() => setOpen(true)}
                  onKeyDown={onKeyDown}
                  autoComplete="off"
                  aria-label="Αναζήτηση επιχείρησης"
                />
              )}

              {mode === 'scout' ? (
                <button
                  className="hs-btn"
                  onClick={runScout}
                  disabled={scouting || brief.trim().length < 8}
                  style={scouting || brief.trim().length < 8 ? { opacity: .55, cursor: 'not-allowed' } : undefined}
                >
                  {scouting ? 'Ψάχνει…' : 'Βρες πελάτες'}
                </button>
              ) : (
                <button className="hs-btn" onClick={goToSearch}>Αναζήτηση</button>
              )}
            </div>

            {mode === 'manual' && showDrop && (
              <div className="hs-drop">
                {items.length > 0 ? items.map((s, i) => {
                  const col      = colorFor(s.ar_gemi)
                  const isActive = s.status?.toLowerCase().includes('ενεργ')
                  const meta     = [s.legal_type, s.place].filter(Boolean).join(' · ')
                  return (
                    <Link
                      key={s.ar_gemi}
                      href={`/etaireies/${s.ar_gemi}`}
                      className="hs-row"
                      data-cursor={i === cursor ? 'true' : 'false'}
                      onMouseEnter={() => setCursor(i)}
                    >
                      <span className="hs-row-logo" style={{ background: col.bg, color: col.fg, border: `1px solid ${col.border}` }}>
                        {initialOf(s.name)}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="hs-row-name">{s.name}</span>
                        {meta && <span className="hs-row-meta">{meta}</span>}
                      </span>
                      <span
                        className="hs-tag"
                        style={isActive
                          ? { background: '#E8F6EE', color: '#136B3E', border: '1px solid #BEE4CC' }
                          : { background: '#F1EFE7', color: '#8A93A3', border: '1px solid #E2E0D6' }}
                      >
                        {isActive ? 'Ενεργή' : 'Ανενεργή'}
                      </span>
                    </Link>
                  )
                }) : (
                  <div className="hs-empty">
                    {busy ? 'Αναζήτηση…' : `Καμία επιχείρηση για «${trimmed}»`}
                  </div>
                )}
                <a className="hs-foot" onClick={goToSearch}>
                  <Icon name="search" size={13} />
                  Όλα τα αποτελέσματα για «{trimmed}»
                </a>
              </div>
            )}
          </div>

          {/* ── Scout: examples / working / result ── */}
          {mode === 'scout' && !recipe && !scouting && !scoutErr && (
            <div className="hs-examples">
              <span className="hs-examples-l">Δοκίμασε:</span>
              {SCOUT_EXAMPLES.map(x => (
                <button key={x} className="hs-example" onClick={() => setBrief(x)}>{x}</button>
              ))}
            </div>
          )}

          {mode === 'scout' && scouting && (
            <div className="hs-scout">
              <div className="hs-scout-busy">
                <span className="hs-spin" />
                Ο Scout διαβάζει 1,6 εκατ. επιχειρήσεις και επιλέγει κλάδους…
              </div>
            </div>
          )}

          {mode === 'scout' && scoutErr && !scouting && (
            <div className="hs-scout">
              <div className="hs-scout-err">{scoutErr}</div>
            </div>
          )}

          {mode === 'scout' && recipe && !scouting && (
            <div className="hs-scout">
              <div className="hs-scout-hd">
                <Icon name="sparkle" size={12} />
                Ο Scout βρήκε
              </div>
              <div className="hs-scout-body">
                <div>
                  <div className="hs-scout-n">{recipe.result_count.toLocaleString('el-GR')}</div>
                  <div className="hs-scout-l">πιθανοί πελάτες</div>
                  {recipe.summary && <div className="hs-scout-sum">{recipe.summary}</div>}
                </div>
                <button className="hs-scout-cta" onClick={openScoutResults}>
                  Δες τη λίστα
                  <Icon name="arrow-up-right" size={14} />
                </button>
              </div>
              {recipe.explanation && (
                <div className="hs-scout-why">{recipe.explanation}</div>
              )}
            </div>
          )}

          <div className="hs-stats">
            <span><b>{(active || totalCompanies).toLocaleString('el-GR')}</b> ενεργές επιχειρήσεις</span>
            <span className="hs-stats-dot">·</span>
            <span><b>{contact.toLocaleString('el-GR')}</b> με στοιχεία επικοινωνίας</span>
            <span className="hs-stats-dot">·</span>
            <span className="hs-stats-gemi">
              <Icon name="verified" size={13} stroke={1.9} />
              Επίσημα δεδομένα ΓΕΜΗ
            </span>
          </div>
        </div>

        {/* ── RIGHT: live registrations ── */}
        <aside className="hs-feed">
          <div className="hs-feed-hd">
            <span className="hs-feed-dot" />
            <span className="hs-feed-t">Νέες εγγραφές</span>
          </div>
          <div className="hs-feed-list">
            {newFirms.map((f, i) => (
              <Link
                key={`${f.ar_gemi}-${f.ts}`}
                href={`/etaireies/${f.ar_gemi}`}
                className="hs-feed-item"
                data-new={i === 0 ? 'true' : 'false'}
              >
                <span className="hs-feed-body">
                  <span className="hs-feed-name">{f.name}</span>
                  <span className="hs-feed-meta">{f.legal_type} · {f.city}</span>
                </span>
                <span className="hs-feed-time">{agoLabel(f.ts, now)}</span>
              </Link>
            ))}
          </div>
          <Link className="hs-feed-ft" href="/search">
            Δες όλες τις νέες εγγραφές
            <Icon name="chevron-right" size={12} />
          </Link>
        </aside>
      </div>
    </section>
  )
}

// ── PRODUCT PREVIEW ──────────────────────────────────────────────────
function ProductPreview({ onNavigate }: { onNavigate: (r: string) => void }) {
  return (
    <section className="home-screen" style={{ background: 'var(--surface)' }}>
      <div className="screen-inner">
        <SectionHeader
          index="01"
          eyebrow="Αναζήτηση εταιρειών"
          title="Μια πλήρης λίστα εταιρειών, όχι απλά σελιδοδείκτες."
          body="Φιλτράρετε 1,28 εκατ. εταιρείες του ΓΕΜΗ ανά κλάδο (ΚΑΔ), νομό, νομική μορφή και κατάσταση. Κάθε στήλη ταξινομείται. Κάθε αποτέλεσμα εξάγεται καθαρά."
        />

        <div style={{
          marginTop: 28, position: 'relative', borderRadius: 10,
          border: '0.5px solid var(--border-strong)', background: 'var(--surface)',
          overflow: 'hidden', boxShadow: '0 4px 24px rgba(26,35,50,0.04)',
        }}>
          {/* fake browser chrome */}
          <div style={{
            height: 32, background: 'var(--subtle-bg)', borderBottom: '0.5px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px',
          }}>
            <div style={{ display: 'flex', gap: 5 }}>
              {['#D0CEC8','#D0CEC8','#D0CEC8'].map((c, i) => <span key={i} style={{ width: 9, height: 9, borderRadius: 5, background: c }} />)}
            </div>
            <div style={{
              flex: 1, height: 18, background: 'var(--surface)', borderRadius: 4,
              border: '0.5px solid var(--border)', display: 'inline-flex', alignItems: 'center',
              padding: '0 8px', fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
            }}>agora.gr/search?kad=6201&prefecture=attiki&has=instagram,email</div>
          </div>

          {/* filter pill row */}
          <div style={{
            padding: '12px 16px', background: 'var(--subtle-bg2)', borderBottom: '0.5px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Filters:</span>
            <span className="pill"><span className="pill-label">Industry:</span> Software & IT (ΚΑΔ 62)</span>
            <span className="pill"><span className="pill-label">Prefecture:</span> Attiki</span>
            <span className="pill"><span className="pill-label">Has:</span> Instagram</span>
            <span className="pill"><span className="pill-label">Has:</span> Verified email</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              <span className="mono" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>284</span> companies match
            </span>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 16 }}>Company</th>
                <th>Sector</th>
                <th style={{ textAlign: 'right' }}>Employees</th>
                <th style={{ textAlign: 'right' }}>Revenue</th>
                <th>Signals</th>
                <th style={{ textAlign: 'right', paddingRight: 16 }}></th>
              </tr>
            </thead>
            <tbody>
              {PREVIEW_COMPANIES.map(c => (
                <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => onNavigate('search')}>
                  <td style={{ paddingLeft: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <CompanyLogo company={c} />
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{c.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                          {c.legal} · {c.city} · Founded <span className="mono">{c.year}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td><SectorBadge label={c.sectorLabel} /></td>
                  <td style={{ textAlign: 'right' }} className="mono">{fmtInt(c.employees)}</td>
                  <td style={{ textAlign: 'right' }} className="mono">€{fmtRevenue(c.revenue)}M</td>
                  <td>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                      <GemiBadge />
                      <RowSignals company={c} />
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', paddingRight: 16 }}>
                    <Icon name="chevron-right" size={14} style={{ color: 'var(--text-muted)' }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{
            height: 60,
            background: 'linear-gradient(to bottom, transparent, var(--surface))',
            marginTop: -60, position: 'relative', pointerEvents: 'none',
          }} />
        </div>
      </div>
    </section>
  )
}

// ── PEOPLE SECTION ───────────────────────────────────────────────────
function PeopleDemo({ onNavigate }: { onNavigate: (r: string) => void }) {
  const companies = [
    { name: 'Pelagos Maritime Group',      role: 'Διευθύνων Σύμβουλος',    own: '22.0%', status: 'active', dot: 'var(--gemi-text)'  },
    { name: 'Nereus Logistics',            role: 'Μέτοχος',                 own: '12.5%', status: 'active', dot: 'var(--gemi-text)'  },
    { name: 'Aiolos Bulk Carriers A.E.',   role: 'Πρόεδρος ΔΣ',            own: null,    status: 'past',   dot: 'var(--warn-text)'  },
    { name: 'Konstantinou Maritime EPE',   role: 'Διαχειριστής',            own: null,    status: 'past',   dot: 'var(--danger)'     },
  ]
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', boxShadow: '0 12px 36px rgba(26,35,50,0.06)' }}>
      <div style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14, borderBottom: '0.5px solid var(--border)', cursor: 'pointer' }} onClick={() => onNavigate('people')}>
        <span style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--accent-light)', color: 'var(--accent)', border: '0.5px solid var(--li-border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 600 }}>DK</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Δημήτριος Κωνσταντίνου</span>
            <span className="badge badge-neutral" style={{ fontWeight: 400 }}>Αττική</span>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>Διευθύνων Σύμβουλος · Pelagos Maritime Group</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ fontSize: 18, fontWeight: 500 }}>4</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>εταιρείες</div>
        </div>
      </div>
      <div>
        {companies.map((c, i) => (
          <div key={i} style={{ padding: '9px 18px', display: 'flex', alignItems: 'center', gap: 10, borderTop: i === 0 ? 'none' : '0.5px solid var(--row-divider)' }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: c.dot, flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{c.role}</span>
            <span className="mono" style={{ fontSize: 11.5, color: c.own ? 'var(--text-primary)' : 'var(--text-muted)', width: 44, textAlign: 'right' }}>{c.own || '—'}</span>
            <span className={`badge ${c.status === 'active' ? 'badge-active' : 'badge-neutral'}`} style={{ width: 52, justifyContent: 'center' }}>{c.status === 'active' ? 'Ενεργή' : 'Πρώην'}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 18px', background: 'var(--subtle-bg2)', borderTop: '0.5px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Inferred personal contact</span>
          <span className="badge badge-amber"><Icon name="sparkle" size={10} stroke={1.6} />Potentially personal</span>
        </div>
        <div className="mono" style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>d.konstantinou@gmail.com</div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 5, height: 5, borderRadius: 3, background: 'var(--gemi-text)', display: 'inline-block' }} />
          Seen at <span className="mono" style={{ color: 'var(--text-primary)' }}>3</span> of <span className="mono">4</span> companies · high confidence
        </div>
      </div>
    </div>
  )
}

function PeopleSection({ onNavigate }: { onNavigate: (r: string) => void }) {
  return (
    <section className="home-screen" style={{ background: 'var(--page-bg)' }}>
      <div className="screen-inner">
        <div style={{ display: 'grid', gridTemplateColumns: '1.08fr 0.92fr', gap: 56, alignItems: 'center' }}>
          <PeopleDemo onNavigate={onNavigate} />
          <div>
            <SectionHeader
              index="02"
              eyebrow="Στελέχη · Μητρώο"
              title="Ακολουθήστε τους ανθρώπους πίσω από τις επιχειρήσεις."
              body="Αναζητήστε 4,1 εκατ. διευθυντές, μέλη ΔΣ και μετόχους με όνομα, ΑΦΜ, ρόλο ή επιχείρηση. Κάθε προφίλ δείχνει το χρονολόγιο των ρόλων του σε όλες τις εταιρείες."
            />
            <HomeBullets items={[
              'Κάθε στέλεχος και μέτοχος, ενεργός ή πρώην',
              'Χρονολόγιο ρόλων και ποσοστών συμμετοχής',
              'Επισήμανση επαφών που φαίνονται προσωπικές',
              'Απευθείας μετάβαση από στέλεχος σε εταιρεία',
            ]} />
            <button className="btn btn-secondary" style={{ marginTop: 24 }} onClick={() => onNavigate('people')}>
              <Icon name="users" size={13} stroke={1.6} /> Αναζήτηση στελεχών <Icon name="arrow-up-right" size={12} />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── NETWORK SECTION ──────────────────────────────────────────────────
function NetworkGraph({ onNavigate }: { onNavigate: (r: string) => void }) {
  const nodes: Record<string, { x: number; y: number; label: string; type: string; primary?: boolean }> = {
    you:    { x: 90,  y: 150, label: 'Δ. Κωνσταντίνου', type: 'person',  primary: true },
    pelagos:{ x: 300, y: 64,  label: 'Pelagos Maritime', type: 'company' },
    nereus: { x: 330, y: 150, label: 'Nereus Logistics',  type: 'company' },
    aiolos: { x: 300, y: 236, label: 'Aiolos Bulk A.E.',  type: 'company' },
    other:  { x: 520, y: 150, label: 'Μ. Βλάχου',         type: 'person' },
  }
  const edges: [string, string, string][] = [
    ['you','pelagos','Διευθ. Σύμβουλος'],
    ['you','nereus','Μέτοχος'],
    ['you','aiolos','Πρόεδρος'],
    ['other','pelagos','ΔΣ'],
    ['other','aiolos','ΔΣ'],
  ]
  return (
    <div style={{ background: 'var(--app-bg)' }}>
      <svg viewBox="0 0 610 300" style={{ width: '100%', display: 'block' }}>
        {edges.map(([a, b, lbl], i) => {
          const A = nodes[a], B = nodes[b]
          const shared = a === 'other'
          return (
            <g key={i}>
              <line x1={A.x} y1={A.y} x2={B.x} y2={B.y}
                stroke={shared ? 'var(--accent)' : 'var(--border-strong)'}
                strokeWidth={shared ? 1.6 : 1}
                strokeDasharray={shared ? '4 3' : undefined} />
              <text x={(A.x + B.x) / 2} y={(A.y + B.y) / 2 - 4}
                textAnchor="middle" fontSize="9.5"
                fill="var(--text-muted)" style={{ fontFamily: 'var(--font-mono)' }}>{lbl}</text>
            </g>
          )
        })}
        {Object.entries(nodes).map(([k, n]) => {
          const isPerson = n.type === 'person'
          const r = n.primary ? 26 : 22
          return (
            <g key={k} style={{ cursor: 'pointer' }} onClick={() => onNavigate(isPerson ? 'people' : 'search')}>
              <circle cx={n.x} cy={n.y} r={r}
                fill={n.primary ? 'var(--accent)' : 'var(--surface)'}
                stroke={isPerson ? 'var(--accent)' : 'var(--border-strong)'}
                strokeWidth="1.2" />
              <g transform={`translate(${n.x - 7}, ${n.y - 7})`}
                style={{ color: n.primary ? '#fff' : isPerson ? 'var(--accent)' : 'var(--text-secondary)' }}>
                <Icon name={isPerson ? 'users' : 'building'} size={14} stroke={1.7} />
              </g>
              <text x={n.x} y={n.y + r + 13} textAnchor="middle" fontSize="11"
                fontWeight={n.primary ? 600 : 500} fill="var(--text-primary)">{n.label}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function NetworkSection({ onNavigate }: { onNavigate: (r: string) => void }) {
  return (
    <section className="home-screen" style={{ background: 'var(--surface)' }}>
      <div className="screen-inner">
        <div style={{ display: 'grid', gridTemplateColumns: '0.92fr 1.08fr', gap: 56, alignItems: 'center' }}>
          <div>
            <SectionHeader
              index="03"
              eyebrow="Συνδεδεμένα δεδομένα"
              title="Οι συνδέσεις είναι το προϊόν."
              body="Κάθε επιχείρηση συνδέεται με τα στελέχη της. Κάθε στέλεχος συνδέεται με τις άλλες επιχειρήσεις του. Κοινά μέλη ΔΣ αποκαλύπτουν ομίλους εταιρειών."
            />
            <HomeBullets items={[
              'Επιχείρηση → στελέχη & μέτοχοι',
              'Στέλεχος → κάθε άλλη επιχείρησή του',
              'Κοινά στελέχη αποκαλύπτουν ομίλους',
              'Μία θέση σε ΔΣ γίνεται πολλές επαφές',
            ]} />
            <button className="btn btn-secondary" style={{ marginTop: 24 }} onClick={() => onNavigate('people')}>
              <Icon name="network" size={13} stroke={1.6} /> Δείτε τον χάρτη <Icon name="arrow-up-right" size={12} />
            </button>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden', boxShadow: '0 12px 36px rgba(26,35,50,0.06)' }}>
            <div style={{ padding: '11px 16px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Icon name="network" size={14} stroke={1.7} style={{ color: 'var(--accent)' }} />
                Χάρτης σχέσεων
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>1 άτομο · 3 εταιρείες · 5 σύνδεσμοι</span>
            </div>
            <NetworkGraph onNavigate={onNavigate} />
            <div style={{ padding: '11px 16px', background: 'var(--subtle-bg2)', borderTop: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text-secondary)' }}>
              <span className="badge badge-amber" style={{ height: 18 }}><Icon name="sparkle" size={10} stroke={1.6} />Insight</span>
              Κωνσταντίνου και Βλάχου μοιράζονται <span className="mono" style={{ color: 'var(--text-primary)' }}>2</span> ΔΣ — πιθανός όμιλος εταιρειών.
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── SCOUT SECTION ────────────────────────────────────────────────────
function ScoutSection({ onNavigate }: { onNavigate: (r: string) => void }) {
  return (
    <section className="home-screen" style={{ background: 'var(--page-bg)' }}>
      <div className="screen-inner">
        <div style={{ display: 'grid', gridTemplateColumns: '0.92fr 1.08fr', gap: 56, alignItems: 'center' }}>
          <div>
            <SectionHeader
              index="04"
              eyebrow="Scout · Αναζήτηση με ΤΝ"
              title="Ρωτήστε στα Ελληνικά ή στα Αγγλικά."
              body="Χωρίς κωδικούς ΚΑΔ, χωρίς σύνταξη φίλτρων. Περιγράψτε ποιον ψάχνετε και το Scout ρυθμίζει αυτόματα κλάδο, γεωγραφία, νομική μορφή και τα κριτήρια που χρειάζεστε."
            />
            <HomeBullets items={[
              'Κατανοεί Ελληνικά και Αγγλικά, απλή γλώσσα',
              'Αντιστοιχίζει λόγια σε ΚΑΔ και νομούς',
              'Διαβάζει ενδείξεις: κοινωνικά, email, τηλέφωνο',
              'Εφαρμόζει τα φίλτρα άμεσα στην αναζήτηση',
            ]} />
            <button className="btn btn-secondary" style={{ marginTop: 24 }} onClick={() => onNavigate('search')}>
              <Icon name="sparkle" size={13} stroke={1.6} /> Δοκιμάστε το Scout <Icon name="arrow-up-right" size={12} />
            </button>
          </div>

          {/* Scout demo card */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', boxShadow: '0 12px 36px rgba(26,35,50,0.06)' }}>
            <div style={{ padding: '11px 14px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <ScoutGlyph size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
                  Scout <span className="badge badge-amber" style={{ height: 16, fontSize: 9.5 }}>AI</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Βοηθός αναζήτησης πελατών</div>
              </div>
            </div>
            <div style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 14, background: 'var(--subtle-bg2)' }}>
              <div style={{ alignSelf: 'flex-end', maxWidth: '82%' }}>
                <div style={{ background: 'var(--accent)', color: '#fff', padding: '9px 12px', borderRadius: '10px 10px 2px 10px', fontSize: 13, lineHeight: 1.5 }}>
                  Εστιατόρια στην Αθήνα με Instagram αλλά χωρίς website.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 9 }}>
                <ScoutGlyph size={24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)' }}>
                    Εντάξει — εστιατόρια στην Αττική, ενεργά στο Instagram, χωρίς ιστότοπο. Φίλτρα εφαρμόστηκαν.
                  </div>
                  <div style={{ border: '0.5px solid var(--li-border)', borderRadius: 8, overflow: 'hidden', marginTop: 8, background: 'var(--surface)' }}>
                    <div style={{ padding: '9px 12px', background: 'var(--accent-light)', borderBottom: '0.5px solid var(--li-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--li-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Σύνθεση αναζήτησης</span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>≈ <span className="mono" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>612</span> αποτελέσματα</span>
                    </div>
                    <div style={{ padding: '12px 12px 6px' }}>
                      <ScoutChips label="Κλάδος"    items={['Τρόφιμα & Ποτά (ΚΑΔ 56)']} />
                      <ScoutChips label="Νομός"     items={['Αττική']} />
                      <ScoutChips label="Έχει"      items={['Instagram']} />
                      <ScoutChips label="Λείπει"    items={['Website']} />
                    </div>
                    <div style={{ padding: '2px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {[
                        ['Κλάδος.',     '"Εστιατόρια" → ΚΑΔ 56 — υπηρεσίες εστίασης.'],
                        ['Γεωγραφία.', '"Αθήνα" → νομός Αττικής.'],
                        ['Ενδείξεις.',  'Έχει Instagram· δεν έχει ιστότοπο στο αρχείο.'],
                      ].map((r, i) => (
                        <div key={i} style={{ display: 'flex', gap: 7, fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                          <Icon name="check" size={11} stroke={2} style={{ color: 'var(--gemi-text)', marginTop: 2, flexShrink: 0 }} />
                          <span><span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{r[0]}</span> {r[1]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ padding: '10px 14px', background: 'var(--surface)', borderTop: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text-secondary)' }}>
              <span style={{ width: 7, height: 7, borderRadius: 4, background: '#3EB57A', boxShadow: '0 0 0 3px rgba(62,181,122,0.18)', display: 'inline-block' }} />
              Filters applied to your search · refine by replying in chat
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── SOCIAL SECTION ───────────────────────────────────────────────────
function SocialSection({ onNavigate }: { onNavigate: (r: string) => void }) {
  const rows = [
    { name: 'Aegean Bistro Holdings', city: 'Athens',       on: ['instagram', 'facebook', 'tiktok'],            web: false },
    { name: 'Kyklades Hospitality',   city: 'Santorini',    on: ['instagram', 'facebook', 'youtube'],           web: true  },
    { name: 'Helleniq Cloud Systems', city: 'Athens',       on: ['twitter-x', 'youtube'],                       web: true  },
    { name: 'Mediterra Pharma',       city: 'Patras',       on: ['facebook'],                                   web: true  },
  ]
  return (
    <section className="home-screen" style={{ background: 'var(--surface)' }}>
      <div className="screen-inner">
        <div style={{ display: 'grid', gridTemplateColumns: '1.08fr 0.92fr', gap: 56, alignItems: 'center' }}>
          <div className="card" style={{ padding: 0, overflow: 'hidden', boxShadow: '0 12px 36px rgba(26,35,50,0.06)' }}>
            <div style={{ padding: '11px 16px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Social presence</span>
              <span className="pill" style={{ height: 22 }}><span className="pill-label">Has:</span> Instagram</span>
            </div>
            {rows.map((r, i) => (
              <div key={i} style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, borderTop: i === 0 ? 'none' : '0.5px solid var(--row-divider)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{r.city} · {r.web ? 'website on file' : 'no website'}</div>
                </div>
                <div style={{ display: 'flex', gap: 5 }}>
                  {SOCIAL_PLATFORMS.map(p => (
                    <SocialChip key={p.key} icon={p.icon} color={p.color} size={26} active={r.on.includes(p.key)} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div>
            <SectionHeader
              index="05"
              eyebrow="Κοινωνικά δίκτυα"
              title="Βρείτε επιχειρήσεις εκεί που εμφανίζονται."
              body="Σαρώνουμε ιστοσελίδες εταιρειών για να συνδέσουμε τα κοινωνικά τους προφίλ — Instagram, Facebook, X, TikTok και YouTube. Φιλτράρετε ανά παρουσία στα δίκτυα."
            />
            <HomeBullets items={[
              'Προφίλ από την ιστοσελίδα κάθε εταιρείας',
              'Φίλτρο παρουσίας — π.χ. έχει Instagram, χωρίς ιστότοπο',
              'Εντοπίστε καταναλωτικές επιχειρήσεις',
              'Επικοινωνήστε από το κανάλι που ελέγχουν',
            ]} />
            <button className="btn btn-secondary" style={{ marginTop: 24 }} onClick={() => onNavigate('search')}>
              <Icon name="instagram" size={13} /> Φίλτρο κοινωνικών <Icon name="arrow-up-right" size={12} />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── EXPORT SECTION ───────────────────────────────────────────────────
function ExportSection({ onNavigate }: { onNavigate: (r: string) => void }) {
  const tools = [
    { name: 'Instantly',  tint: '#2A6FDB' },
    { name: 'Apollo',     tint: '#5B45A8' },
    { name: 'HubSpot',    tint: '#E0662B' },
    { name: 'Salesforce', tint: '#1F8AC9' },
    { name: 'Pipedrive',  tint: '#1F8A5B' },
    { name: 'Lemlist',    tint: '#C0392B' },
  ]
  return (
    <section className="home-screen" style={{ background: 'var(--page-bg)' }}>
      <div className="screen-inner">
        <SectionHeader
          index="06" center
          eyebrow="Εξαγωγή & Συνδέσεις"
          title="Ο πυρήνας αναζήτησης για το stack σας."
          body="Βρείτε leads στο GreekLeads και εξάγετε σε CSV ή στα εργαλεία που ήδη χρησιμοποιείτε. Το GreekLeads βρίσκει τους leads· το stack σας τους επεξεργάζεται."
        />

        <div style={{ marginTop: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, flexWrap: 'wrap' }}>
          <div className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <BrandMark size={26} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>GreekLeads</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Επιλεγμένα leads</div>
            </div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
            <span style={{ width: 44, height: 1, background: 'var(--border-strong)', display: 'inline-block' }} />
            <Icon name="arrow-up-right" size={14} style={{ transform: 'rotate(45deg)' }} />
            <span style={{ width: 44, height: 1, background: 'var(--border-strong)', display: 'inline-block' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {tools.map(t => (
              <div key={t.name} className="card" style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 9, minWidth: 134 }}>
                <span style={{ width: 22, height: 22, borderRadius: 5, background: t.tint, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{t.name[0]}</span>
                <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)' }}>{t.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 22, textAlign: 'center', display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Icon name="download" size={13} stroke={1.6} /> CSV εξαγωγή σε κάθε πλάνο
          </span>
          <span style={{ width: 3, height: 3, borderRadius: 2, background: 'var(--border-strong)', display: 'inline-block' }} />
          <button onClick={() => onNavigate('lists')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            See lists & exports <Icon name="chevron-right" size={11} />
          </button>
        </div>
      </div>
    </section>
  )
}

// ── USE CASES ────────────────────────────────────────────────────────
function UseCases() {
  const cases = [
    {
      who: 'Sales & SDR teams',
      title: 'Χτίστε σχέδια αγοράς χωρίς εικασίες.',
      body: 'Κόψτε την ελληνική αγορά ανά κλάδο, νομό και μέγεθος. Πάρτε επαληθευμένες επαφές και εξάγετε λογαριασμούς στο CRM σας.',
      points: ['Χάρτες λογαριασμών ανά κλάδο & περιοχή', 'Επαληθευμένα emails & τηλέφωνα', 'Εξαγωγή σε HubSpot, Salesforce, Pipedrive'],
      icon: 'users',
    },
    {
      who: 'Agencies & outreach',
      title: 'Βρείτε ιδιοκτήτες εκεί που βρίσκονται.',
      body: 'Βρείτε επιχειρήσεις μέσω των κοινωνικών τους δικτύων — ιδανικό για τοπικές και καταναλωτικές εταιρείες — και εξάγετε λίστες στο εργαλείο αλληλογραφίας σας.',
      points: ['Φίλτρο κοινωνικής παρουσίας', 'Επαφές ιδιοκτητών & αποφασισάντων', 'Εξαγωγή σε Instantly, Apollo, Lemlist'],
      icon: 'share',
    },
    {
      who: 'M&A & έρευνα',
      title: 'Αξιολογήστε στόχους σε βάθος μητρώου.',
      body: 'Φιλτράρετε με βάση οικονομικά στοιχεία και μετοχική δομή, και ακολουθήστε το δίκτυο — κοινά στελέχη, κοινοί μέτοχοι, εταιρικοί όμιλοι.',
      points: ['3χρονο ιστορικό οικονομικών', 'Γράφος μετόχων & στελεχών', 'Χαρτογράφηση εταιρικών ομίλων'],
      icon: 'network',
    },
  ]
  return (
    <section className="home-screen" style={{ background: 'var(--surface)' }}>
      <div className="screen-inner">
        <SectionHeader index="07" center eyebrow="Για ποιους είναι" title="Μία πλατφόρμα. Τρεις ρόλοι." />
        <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {cases.map((c, i) => (
            <div key={i} className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{c.who}</span>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.3 }}>{c.title}</h3>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{c.body}</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {c.points.map(pt => (
                  <li key={pt} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: 7,
                      background: 'var(--gemi-bg)', color: 'var(--gemi-text)', border: '0.5px solid var(--gemi-border)',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
                    }}>
                      <Icon name="check" size={9} stroke={2.4} />
                    </span>
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── SECTORS TEASER ───────────────────────────────────────────────────
function SectorsTeaser({ onNavigate }: { onNavigate: (r: string) => void }) {
  const sectors = [
    { label: 'Ναυτιλία & Logistics',        companies: 8420,  revenue: 28.4, growth: 4.2  },
    { label: 'Τουρισμός & Φιλοξενία',      companies: 41280, revenue: 22.2, growth: 9.6  },
    { label: 'Κατασκευές & Ακίνητα',       companies: 24120, revenue: 18.9, growth: 6.1  },
    { label: 'Τρόφιμα & Ποτά',             companies: 31840, revenue: 14.2, growth: 3.4  },
    { label: 'Μεταποίηση',                 companies: 14820, revenue: 12.8, growth: 2.1  },
    { label: 'Λιανεμπόριο & Καταναλωτικά', companies: 62140, revenue: 11.4, growth: 1.8  },
    { label: 'Ενέργεια & Κοινής Ωφέλειας', companies: 1820,  revenue: 9.8,  growth: 11.4 },
    { label: 'Φαρμακευτικά & Υγεία',       companies: 6240,  revenue: 6.1,  growth: 5.8  },
    { label: 'Λογισμικό & IT',             companies: 9418,  revenue: 3.8,  growth: 18.2 },
    { label: 'Χρηματοοικονομικά & Ασφάλειες', companies: 3120,  revenue: 3.2,  growth: 4.4  },
  ]
  return (
    <section className="home-screen" style={{ background: 'var(--page-bg)' }}>
      <div className="screen-inner">
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
          <SectionHeader index="08" eyebrow="Κάθε κλάδος της ελληνικής οικονομίας" title="Μακρο ανάλυση. Εξερεύνηση σε κάθε κελί." compact />
          <button className="btn btn-secondary" onClick={() => onNavigate('sectors')}>
            Εξερεύνηση κλάδων <Icon name="arrow-up-right" size={12} />
          </button>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 18 }}>Κλάδος</th>
                <th style={{ textAlign: 'right' }}>Εταιρείες</th>
                <th style={{ textAlign: 'right' }}>Συνολικά έσοδα</th>
                <th style={{ textAlign: 'right', paddingRight: 18 }}>Ετήσια μεταβολή</th>
              </tr>
            </thead>
            <tbody>
              {sectors.map(s => (
                <tr key={s.label} style={{ cursor: 'pointer' }} onClick={() => onNavigate('sectors')}>
                  <td style={{ paddingLeft: 18, fontWeight: 500 }}>{s.label}</td>
                  <td style={{ textAlign: 'right' }} className="mono">{fmtInt(s.companies)}</td>
                  <td style={{ textAlign: 'right' }} className="mono">€{s.revenue.toFixed(1)}B</td>
                  <td style={{ textAlign: 'right', paddingRight: 18 }}>
                    <span className="mono" style={{ color: s.growth >= 5 ? 'var(--gemi-text)' : 'var(--text-primary)', fontWeight: 500 }}>+{s.growth.toFixed(1)}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

// ── FOUNDATION ───────────────────────────────────────────────────────
function SourceCard({ tag, tagColor, title, desc, stats, icon }: {
  tag: string; tagColor: 'gemi' | 'li' | 'neutral'; title: string; desc: string;
  stats: { k: string; v: string }[]; icon: string
}) {
  return (
    <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className={`badge ${tagColor === 'gemi' ? 'badge-gemi' : tagColor === 'li' ? 'badge-li' : 'badge-neutral'}`}>{tag}</span>
        <span style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--subtle-bg)', color: 'var(--text-secondary)', border: '0.5px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={14} stroke={1.6} />
        </span>
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{desc}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: '0.5px solid var(--row-divider)', paddingTop: 12 }}>
        {stats.map((s, i) => (
          <div key={i} style={{ borderLeft: i === 0 ? 'none' : '0.5px solid var(--row-divider)', paddingLeft: i === 0 ? 0 : 12 }}>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.k}</div>
            <div className="mono" style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginTop: 3 }}>{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Foundation() {
  return (
    <section className="home-screen" style={{ background: 'var(--page-bg)' }}>
      <div className="screen-inner">
        <SectionHeader
          index="09"
          eyebrow="Βασισμένο στο ΓΕΜΗ"
          title="Αγκυρωμένο στο επίσημο μητρώο. Όχι εικασίες."
          body="Όλα ξεκινούν από το Γενικό Εμπορικό Μητρώο — την επίσημη πηγή αλήθειας για κάθε ελληνική επιχείρηση. Πάνω σε αυτή τη βάση προσθέτουμε κοινωνικά προφίλ και επαληθευμένες επαφές."
        />
        <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <SourceCard
            tag="Πηγή αλήθειας" tagColor="gemi" title="Μητρώο ΓΕΜΗ" icon="verified"
            desc="Ημερήσιος συγχρονισμός με το ΓΕΜΗ: νομική κατάσταση, ίδρυση, καταχωρημένο κεφάλαιο, διεύθυνση, ΚΑΔ δραστηριότητες και κάθε διευθυντής ή μέτοχος."
            stats={[{ k: 'Κάλυψη', v: '100%' }, { k: 'Καθυστέρηση', v: '< 24ω' }, { k: 'Πεδία', v: '47' }]}
          />
          <SourceCard
            tag="Εμπλουτισμός" tagColor="li" title="Κοινωνικά προφίλ" icon="instagram"
            desc="Σαρώνουμε κάθε εταιρική ιστοσελίδα για να συνδέσουμε δημόσιους κοινωνικούς λογαριασμούς — Instagram, Facebook, X, TikTok και YouTube."
            stats={[{ k: 'Εταιρείες', v: '326χ' }, { k: 'Πλατφόρμες', v: '5' }, { k: 'Ανανέωση', v: 'Εβδομαδιαία' }]}
          />
          <SourceCard
            tag="Εμπλουτισμός" tagColor="neutral" title="Επαληθευμένα στοιχεία" icon="mail"
            desc="Emails και τηλέφωνα επαληθεύονται μέσω SMTP και carrier lookups. Επαναχρησιμοποιημένες προσωπικές επαφές σημαίνονται σε εταιρείες· αναπηδώντες αρχεία αποκλείονται."
            stats={[{ k: 'Ακρίβεια email', v: '94,1%' }, { k: 'Ακρίβεια τηλ.', v: '88,6%' }, { k: 'Αποκλεισμός', v: 'Ενεργός' }]}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 24, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <Icon name="verified" size={13} stroke={1.6} style={{ color: 'var(--gemi-text)' }} />
            Πηγή · <span className="mono" style={{ color: 'var(--text-secondary)' }}>business.gov.gr/gemi</span>
          </span>
          <span style={{ width: 3, height: 3, borderRadius: 2, background: 'var(--border-strong)', display: 'inline-block' }} />
          <span>Φιλοξενία EU · Αθήνα & Frankfurt</span>
          <span style={{ width: 3, height: 3, borderRadius: 2, background: 'var(--border-strong)', display: 'inline-block' }} />
          <span>Συμμόρφωση GDPR · μητρώο εξαίρεσης</span>
        </div>
      </div>
    </section>
  )
}

// ── PRICING TEASER ───────────────────────────────────────────────────
function PricingTeaser({ onNavigate }: { onNavigate: (r: string) => void }) {
  const plans = [
    { name: 'Δωρεάν',     price: '€0',     blurb: 'Εξερευνήστε το μητρώο. 25 εξαγωγές τον μήνα, για πάντα.',   cta: 'Ξεκινήστε δωρεάν',  ctaStyle: 'secondary', highlight: false },
    { name: 'Business',   price: '€149',   blurb: 'Επαληθευμένες επαφές, κοινωνικά, οικονομικά + 2.500 πόντοι.', cta: 'Δοκιμή 14 ημερών',  ctaStyle: 'primary',   highlight: true  },
    { name: 'Enterprise', price: 'Κατόπιν', blurb: 'Μεγάλος όγκος, SSO, REST API, αφιερωμένη υποστήριξη.',     cta: 'Επικοινωνήστε',      ctaStyle: 'secondary', highlight: false },
  ]
  return (
    <section className="home-screen" style={{ background: 'var(--surface)' }}>
      <div className="screen-inner">
        <SectionHeader
          index="10" center eyebrow="Τιμές"
          title="Πληρώστε για πόντους, όχι για θέσεις που δεν χρησιμοποιείτε."
          body="Κάθε πλάνο περιλαμβάνει πλήρη πρόσβαση στο μητρώο. Τα επί πληρωμή επίπεδα προσθέτουν εμπλουτισμό και όγκο εξαγωγών."
        />
        <div style={{ marginTop: 28, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {plans.map(p => (
            <div key={p.name} className="card" style={{
              padding: 22, display: 'flex', flexDirection: 'column', gap: 12,
              borderColor: p.highlight ? 'var(--accent)' : 'var(--border)',
              borderWidth: p.highlight ? '1px' : '0.5px', position: 'relative',
            }}>
              {p.highlight && (
                <span style={{
                  position: 'absolute', top: -10, left: 18,
                  background: 'var(--accent)', color: '#fff',
                  fontSize: 10, fontWeight: 500, padding: '3px 9px', borderRadius: 4,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>Δημοφιλές</span>
              )}
              <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span className="mono" style={{ fontSize: 28, fontWeight: 500 }}>{p.price}</span>
                {p.price.startsWith('€') && p.price !== '€0' && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>/ χρήστη / μήνα</span>
                )}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, minHeight: 36 }}>{p.blurb}</div>
              <button
                className={p.ctaStyle === 'primary' ? 'btn btn-primary' : 'btn btn-secondary'}
                onClick={() => onNavigate('pricing')}
              >{p.cta}</button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button className="btn btn-ghost" style={{ color: 'var(--accent)' }} onClick={() => onNavigate('pricing')}>
            Δείτε πλήρη σύγκριση χαρακτηριστικών →
          </button>
        </div>
      </div>
    </section>
  )
}

// ── BOTTOM CTA ───────────────────────────────────────────────────────
function BottomCTA({ onNavigate }: { onNavigate: (r: string) => void }) {
  return (
    <section className="home-screen" style={{ background: 'var(--page-bg)' }}>
      <div className="screen-inner" style={{ maxWidth: 1080, position: 'relative', background: 'var(--nav-bg)', borderRadius: 12, padding: '56px 48px', overflow: 'hidden' }}>
        <div style={{ maxWidth: 560, position: 'relative', zIndex: 2 }}>
          <span style={{ fontSize: 11, color: 'var(--nav-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Δωρεάν εγγραφή</span>
          <h2 style={{ margin: '10px 0 14px', fontSize: 32, fontWeight: 600, color: 'var(--nav-text-active)', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
            Τα επόμενα 25 leads σας είναι μία αναζήτηση μακριά.
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--nav-text-muted)', lineHeight: 1.55 }}>
            Δημιουργήστε λογαριασμό, κάντε απεριόριστη αναζήτηση και εξάγετε τις πρώτες 25 εταιρείες — κάθε μήνα, δωρεάν.
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
            <button className="btn" style={{ background: 'var(--cta-light)', color: 'var(--cta-light-text)', fontWeight: 500, height: 38, padding: '0 18px' }} onClick={() => onNavigate('search')}>
              Δωρεάν λογαριασμός <Icon name="arrow-up-right" size={13} />
            </button>
            <button className="btn" style={{ background: 'transparent', color: 'var(--nav-text-active)', border: '0.5px solid rgba(232,237,245,0.24)', height: 38, padding: '0 18px' }} onClick={() => onNavigate('pricing')}>
              Δείτε τις τιμές
            </button>
          </div>
        </div>
        <div style={{ position: 'absolute', right: -40, top: -40, bottom: -40, width: 380, opacity: 0.18, pointerEvents: 'none' }}>
          <svg width="100%" height="100%" viewBox="0 0 380 380" fill="none">
            {Array.from({ length: 12 }).map((_, i) =>
              Array.from({ length: 12 }).map((__, j) => (
                <rect key={`${i}-${j}`} x={i * 32 + 2} y={j * 32 + 2} width={28} height={28}
                  stroke="#8FA3BC" strokeWidth="0.5"
                  fill={(i + j) % 7 === 0 ? '#2563A8' : 'transparent'}
                  fillOpacity={(i + j) % 7 === 0 ? 0.6 : 0} />
              ))
            )}
          </svg>
        </div>
      </div>
    </section>
  )
}

// ── FOOTER ───────────────────────────────────────────────────────────
function FooterCol({ title, links, onNavigate }: { title: string; links: { l: string; href: string }[]; onNavigate: (r: string) => void }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>{title}</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {links.map((l, i) => (
          <li key={i}>
            <Link href={l.href} style={{ color: 'var(--text-secondary)', fontSize: 12.5 }}>{l.l}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function HomeFooter({ onNavigate }: { onNavigate: (r: string) => void }) {
  return (
    <footer style={{ padding: '40px 28px 32px', background: 'var(--app-bg)', borderTop: '0.5px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12.5 }}>
      <div style={{ maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr', gap: 24, paddingBottom: 28 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 12, color: 'var(--text-primary)' }}>
              <BrandMark size={20} />
              <span style={{ fontSize: 13, fontWeight: 600 }}>GreekLeads</span>
            </div>
            <div style={{ lineHeight: 1.55, maxWidth: 280 }}>
              Ελληνική επιχειρηματική ευφυΐα για ομάδες πωλήσεων, συμβούλους και ερευνητές.
            </div>
            <div style={{ marginTop: 14, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
              GreekLeads · Δεδομένα από ΓΕΜΗ · Αθήνα
            </div>
          </div>

          <FooterCol title="Προϊόν" onNavigate={onNavigate} links={[
            { l: 'Αναζήτηση εταιρειών', href: '/search' },
            { l: 'Αναζήτηση στελεχών',  href: '/people' },
            { l: 'Λίστες & εξαγωγές',   href: '/search' },
            { l: 'Κλάδοι',              href: '/search' },
            { l: 'Scout AI',            href: '/search' },
          ]} />
          <FooterCol title="Χρήσεις" onNavigate={onNavigate} links={[
            { l: 'Εύρεση leads',       href: '/' },
            { l: 'Outreach αντιπροσ.', href: '/' },
            { l: 'M&A & έρευνα',       href: '/' },
            { l: 'Ανάλυση αγοράς',     href: '/search' },
          ]} />
          <FooterCol title="Εταιρεία" onNavigate={onNavigate} links={[
            { l: 'Τιμές',      href: '/pricing' },
            { l: 'Σχετικά',    href: '/' },
            { l: 'Τύπος',      href: '/' },
            { l: 'Καριέρα',    href: '/' },
            { l: 'Επικοινωνία',href: '/' },
          ]} />
          <FooterCol title="Νομικά" onNavigate={onNavigate} links={[
            { l: 'Όροι χρήσης',        href: '/' },
            { l: 'Πολιτική απορρήτου', href: '/' },
            { l: 'GDPR & πηγές',       href: '/' },
            { l: 'Μητρώο εξαίρεσης',   href: '/' },
          ]} />
        </div>

        <div style={{
          borderTop: '0.5px solid var(--border)', paddingTop: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
          fontSize: 11.5, color: 'var(--text-muted)',
        }}>
          <div>© 2026 GreekLeads · Δεδομένα από ΓΕΜΗ</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: '#3EB57A', boxShadow: '0 0 0 3px rgba(62,181,122,0.18)', display: 'inline-block' }} />
              Όλα τα συστήματα λειτουργούν
            </span>
            <span>EN</span>
            <span>·</span>
            <span>ΕΛ</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

// ── HOME PAGE ────────────────────────────────────────────────────────
export default function HomePage() {
  const router = useRouter()
  const [totalCompanies, setTotalCompanies] = useState(1_670_000)
  const [stats, setStats] = useState<HomeStats>({})

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(d => {
        if (d.companies) setTotalCompanies(d.companies)
        setStats(d)
      })
      .catch(() => {})
  }, [])

  const navigate = (route: string) => {
    const routes: Record<string, string> = {
      search:  '/search',
      people:  '/people',
      sectors: '/search',
      pricing: '/pricing',
      lists:   '/search',
      home:    '/',
    }
    router.push(routes[route] ?? '/')
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <TopNav totalCompanies={totalCompanies} />
      <div className="home-scroll">
        <Hero totalCompanies={totalCompanies} stats={stats} />
        <ProductPreview onNavigate={navigate} />
        <PeopleSection onNavigate={navigate} />
        <NetworkSection onNavigate={navigate} />
        <ScoutSection onNavigate={navigate} />
        <SocialSection onNavigate={navigate} />
        <ExportSection onNavigate={navigate} />
        <UseCases />
        <SectorsTeaser onNavigate={navigate} />
        <Foundation />
        <PricingTeaser onNavigate={navigate} />
        <BottomCTA onNavigate={navigate} />
        <HomeFooter onNavigate={navigate} />
      </div>
    </div>
  )
}
