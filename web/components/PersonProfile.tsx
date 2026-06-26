'use client'
import { useState } from 'react'
import Link from 'next/link'
import CompanyPanel from './CompanyPanel'
import type { PersonProfile, CompanyRow, ContactSignal } from '@/app/api/people/[slug]/route'

const AVATAR_COLORS = [
  '#1A6FA8', '#0A6640', '#8B2222', '#6B4C9B', '#B86B10',
  '#1A5F7A', '#2D6A4F', '#7B2D8B', '#9B4A1A', '#1A4A8B',
]

function avatarColor(name: string) {
  const h = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0)
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return (parts[0][0] ?? '?').toUpperCase()
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

function parseYear(d: unknown): number | null {
  if (!d) return null
  if (d instanceof Date) return d.getFullYear()
  const y = parseInt(String(d).slice(0, 4))
  return isNaN(y) ? null : y
}

function formatDate(d: unknown): string {
  if (!d) return '—'
  if (d instanceof Date) return d.toISOString().slice(0, 7)
  return String(d).slice(0, 7)
}

const CURRENT_YEAR = 2026

export default function PersonProfile({ profile }: { profile: PersonProfile }) {
  const [tab, setTab] = useState<'all' | 'active' | 'past'>('all')
  const [panelArGemi, setPanelArGemi] = useState<string | null>(null)
  const color = avatarColor(profile.name)
  const ini = initials(profile.name)

  const { stats, companies, contacts } = profile

  // Unique prefectures across all companies
  const prefectures = [...new Set(
    companies
      .filter(c => c.prefecture_descr)
      .map(c => c.prefecture_descr!)
  )]

  // Companies for table tab
  const tabCompanies =
    tab === 'active' ? companies.filter(c => !c.dt_to) :
    tab === 'past'   ? companies.filter(c => !!c.dt_to) :
    companies

  // Timeline data: only rows with a start year
  const timelineRows = companies
    .map(c => ({ ...c, startYear: parseYear(c.dt_from), endYear: parseYear(c.dt_to) }))
    .filter(c => c.startYear !== null) as (CompanyRow & { startYear: number; endYear: number | null })[]

  const minYear = timelineRows.length
    ? Math.min(...timelineRows.map(r => r.startYear))
    : CURRENT_YEAR - 5
  const span = CURRENT_YEAR - minYear || 1

  // Personal contacts (shared across 2+ companies)
  const personalContacts = contacts.filter(c => c.isPersonal)
  const otherContacts = contacts.filter(c => !c.isPersonal)

  return (
    <div style={{ flex: 1, background: 'var(--app-bg)', overflowY: 'auto' }}>
      {panelArGemi && (
        <CompanyPanel arGemi={panelArGemi} onClose={() => setPanelArGemi(null)} />
      )}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 24px 64px' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
          <Link href="/people" style={{ color: 'var(--accent)' }}>Πρόσωπα</Link>
          <span>/</span>
          <span style={{ color: 'var(--text-primary)' }}>{profile.name}</span>
        </div>

        {/* Header card */}
        <div style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '24px',
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
            {/* Avatar */}
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 22, fontWeight: 700, flexShrink: 0,
              letterSpacing: '0.02em',
            }}>
              {ini}
            </div>

            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>
                {profile.name}
              </h1>
              {/* Prefecture badges */}
              {prefectures.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {prefectures.slice(0, 4).map(p => (
                    <span key={p} className="badge badge-neutral">{p}</span>
                  ))}
                  {prefectures.length > 4 && (
                    <span className="badge badge-neutral">+{prefectures.length - 4}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Stat cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12,
            marginTop: 20,
            borderTop: '1px solid var(--row-divider)',
            paddingTop: 20,
          }}>
            <StatCard label="Σύνολο εταιρειών" value={stats.total} />
            <StatCard label="Ενεργοί ρόλοι" value={stats.active} accent />
            <StatCard label="Συμμετοχές" value={stats.stakes} />
            <StatCard
              label="Μεγαλύτερη συμμετοχή"
              value={stats.largestStake != null ? `${stats.largestStake}%` : '—'}
            />
          </div>
        </div>

        {/* Involvement timeline */}
        {timelineRows.length > 0 && (
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '20px 24px',
            marginBottom: 16,
          }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Χρονολόγιο Εμπλοκής</h2>

            {/* Year axis */}
            <div style={{ paddingLeft: 180, marginBottom: 8 }}>
              <div style={{ position: 'relative', height: 16 }}>
                {Array.from({ length: Math.min(8, span + 1) }, (_, i) => {
                  const yr = minYear + Math.round(i * span / Math.min(7, span))
                  const pct = (yr - minYear) / span * 100
                  return (
                    <span key={yr} style={{
                      position: 'absolute',
                      left: `${pct}%`,
                      transform: 'translateX(-50%)',
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {yr}
                    </span>
                  )
                })}
              </div>
            </div>

            {/* Bars */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {timelineRows.map((row, i) => {
                const left = (row.startYear - minYear) / span * 100
                const end = row.endYear ?? CURRENT_YEAR
                const width = Math.max(1, (end - row.startYear) / span * 100)
                const active = !row.dt_to

                return (
                  <div key={`${row.ar_gemi}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Company name */}
                    <div
                      onClick={() => setPanelArGemi(row.ar_gemi)}
                      style={{
                        width: 172, fontSize: 11.5, color: 'var(--accent)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        textAlign: 'right', flexShrink: 0,
                        cursor: 'pointer',
                      }}
                      title={row.co_name_el}
                    >
                      {row.co_name_el}
                    </div>

                    {/* Bar track */}
                    <div style={{ flex: 1, height: 20, position: 'relative', background: 'var(--app-bg)', borderRadius: 3 }}>
                      <div style={{
                        position: 'absolute',
                        left: `${Math.min(left, 99)}%`,
                        width: `${Math.min(width, 100 - Math.min(left, 99))}%`,
                        top: 0, bottom: 0,
                        background: active ? 'var(--accent)' : '#C5C3BE',
                        borderRadius: 3,
                        opacity: active ? 1 : 0.7,
                      }} />
                    </div>

                    {/* Role label */}
                    <div style={{
                      width: 80, fontSize: 10, color: 'var(--text-muted)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }} title={row.role ?? ''}>
                      {row.role}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingLeft: 180 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent)', display: 'inline-block' }} />
                Ενεργός
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: '#C5C3BE', display: 'inline-block' }} />
                Παλαιός
              </span>
            </div>
          </div>
        )}

        {/* Contact Intelligence */}
        {contacts.length > 0 && (
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '20px 24px',
            marginBottom: 16,
          }}>
            <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Contact Intelligence</h2>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Επαφές που εντοπίστηκαν στις εταιρείες αυτού του προσώπου
            </p>

            {personalContacts.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Πιθανώς Προσωπικές ({personalContacts.length})
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {personalContacts.map(c => <ContactRow key={c.value} contact={c} />)}
                </div>
              </div>
            )}

            {otherContacts.length > 0 && (
              <div>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Εταιρικές Επαφές ({otherContacts.length})
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {otherContacts.slice(0, 5).map(c => <ContactRow key={c.value} contact={c} />)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Companies table */}
        <div style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          overflow: 'hidden',
        }}>
          {/* Table header + tabs */}
          <div style={{
            padding: '16px 24px 0',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <h2 style={{ fontSize: 14, fontWeight: 600 }}>Εταιρείες</h2>
            <div style={{ display: 'flex', gap: 0 }}>
              {(['all', 'active', 'past'] as const).map((t, i) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: '8px 14px',
                    fontSize: 12.5,
                    fontWeight: tab === t ? 600 : 400,
                    background: 'transparent',
                    border: 'none',
                    borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                    color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    marginBottom: -1,
                  }}
                >
                  {t === 'all' ? `Όλες (${companies.length})` :
                   t === 'active' ? `Ενεργές (${stats.active})` :
                   `Παλαιές (${companies.length - stats.active})`}
                </button>
              ))}
            </div>
          </div>

          {/* Table rows */}
          <div>
            {tabCompanies.map((c, i) => (
              <div
                key={`${c.ar_gemi}-${i}`}
                onClick={() => setPanelArGemi(c.ar_gemi)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 140px 90px 80px',
                  gap: 12,
                  padding: '12px 24px',
                  borderBottom: i < tabCompanies.length - 1 ? '1px solid var(--row-divider)' : 'none',
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'background .1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--row-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <div>
                  <p style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 1 }}>{c.co_name_el}</p>
                  <p style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                    {c.legal_type_descr}
                    {c.prefecture_descr && ` · ${c.prefecture_descr}`}
                  </p>
                  {c.role && (
                    <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>{c.role}</p>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {formatDate(c.dt_from)}
                  {' → '}
                  {c.dt_to ? formatDate(c.dt_to) : 'σήμερα'}
                </div>
                <div>
                  {c.percentage != null && c.percentage > 0 && (
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
                      {c.percentage}%
                    </span>
                  )}
                </div>
                <div>
                  <span className={`badge ${!c.dt_to ? 'badge-active' : 'badge-neutral'}`}>
                    {!c.dt_to ? 'Ενεργός' : 'Παλαιός'}
                  </span>
                </div>
              </div>
            ))}

            {tabCompanies.length === 0 && (
              <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)', fontSize: 13 }}>
                Δεν υπάρχουν εγγραφές
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div style={{
      background: 'var(--app-bg)',
      borderRadius: 8,
      padding: '12px 14px',
      border: '0.5px solid var(--border)',
    }}>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </p>
      <p style={{
        fontSize: 22, fontWeight: 700,
        color: accent ? 'var(--accent)' : 'var(--text-primary)',
        fontFamily: typeof value === 'number' ? 'var(--font-mono)' : 'inherit',
      }}>
        {value}
      </p>
    </div>
  )
}

function ContactRow({ contact }: { contact: ContactSignal }) {
  const isEmail = contact.type === 'email'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 10px',
      background: contact.isPersonal ? 'var(--accent-light)' : 'var(--app-bg)',
      border: `0.5px solid ${contact.isPersonal ? 'rgba(37,99,168,0.2)' : 'var(--border)'}`,
      borderRadius: 6,
    }}>
      {/* Icon */}
      <div style={{
        width: 28, height: 28, borderRadius: 6,
        background: isEmail ? '#FEF3F2' : '#EAFAF3',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {isEmail ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EA4335" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0A6640" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 11.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.59 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 8.91a16 16 0 0 0 6 6l.81-.81a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {contact.value}
        </p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
          {contact.companies.slice(0, 2).join(', ')}
          {contact.companies.length > 2 && ` +${contact.companies.length - 2} ακόμα`}
        </p>
      </div>

      {contact.isPersonal && (
        <span style={{
          fontSize: 10.5, fontWeight: 600,
          color: 'var(--accent)',
          background: 'rgba(37,99,168,0.1)',
          borderRadius: 4, padding: '2px 6px',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          Πιθανώς προσωπική
        </span>
      )}
    </div>
  )
}
