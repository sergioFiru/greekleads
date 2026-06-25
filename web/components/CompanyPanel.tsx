'use client'
import { useEffect, useState } from 'react'
import Icon from './Icon'

interface Activity {
  type: string
  activity: { id: string; descr: string }
}

interface Person {
  personName?: string
  businessName?: string
  role?: string
  category?: string
  percentage?: string
  dtFrom?: string | null
  dtTo?: string | null
}

interface CompanyDetail {
  ar_gemi: string
  afm: string | null
  co_name_el: string
  co_names_en: string[] | string | null
  co_titles_el: string[] | null
  co_titles_en: string[] | null
  legal_type_descr: string | null
  status_descr: string | null
  prefecture_descr: string | null
  municipality_descr: string | null
  city: string | null
  street: string | null
  street_number: string | null
  zip_code: string | null
  email: string | null
  phone: string | null
  fax: string | null
  url: string | null
  incorporation_date: string | null
  activities: Activity[] | null
  persons: Person[] | null
  objective: string | null
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="dp-row">
      <span className="dp-label">{label}</span>
      <span className="dp-value">{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="dp-section">
      <div className="dp-section-title">{title}</div>
      {children}
    </div>
  )
}

export default function CompanyPanel({ arGemi, onClose }: { arGemi: string; onClose: () => void }) {
  const [detail, setDetail] = useState<CompanyDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [kadExpanded, setKadExpanded] = useState(false)

  useEffect(() => {
    setLoading(true)
    setDetail(null)
    fetch(`/api/company/${encodeURIComponent(arGemi)}`)
      .then(r => r.json())
      .then(d => { setDetail(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [arGemi])

  const isActive = detail?.status_descr?.toLowerCase().includes('ενεργ')
  const year = detail?.incorporation_date ? new Date(detail.incorporation_date).getFullYear() : null
  const address = [detail?.street, detail?.street_number].filter(Boolean).join(' ')
  const activities = Array.isArray(detail?.activities) ? detail.activities : []
  const persons = Array.isArray(detail?.persons) ? detail.persons : []

  const enName = Array.isArray(detail?.co_names_en)
    ? detail.co_names_en[0]
    : typeof detail?.co_names_en === 'string'
      ? detail.co_names_en
      : null

  return (
    <>
      <div className="dp-backdrop" onClick={onClose} />
      <div className="detail-panel">
        {/* Header */}
        <div className="dp-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            {loading
              ? <div className="dp-skeleton" style={{ width: '70%', height: 18, marginBottom: 6 }} />
              : <div className="dp-name">{detail?.co_name_el ?? '—'}</div>
            }
            {enName && <div className="dp-name-en">{enName}</div>}
            {(detail?.co_titles_el?.length || detail?.co_titles_en?.length) ? (
              <div className="dp-titles">
                {[...(detail.co_titles_el ?? []), ...(detail.co_titles_en ?? [])].map((t, i) => (
                  <span key={i} className="dp-title-chip">{t}</span>
                ))}
              </div>
            ) : null}
          </div>
          <button className="dp-close" onClick={onClose}>
            <Icon name="x" size={16} stroke={2} />
          </button>
        </div>

        {loading ? (
          <div className="dp-body">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="dp-skeleton" style={{ width: i % 3 === 0 ? '85%' : i % 3 === 1 ? '60%' : '72%', height: 13, marginBottom: 12 }} />
            ))}
          </div>
        ) : !detail ? (
          <div className="dp-body" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, paddingTop: 40 }}>
            Δεν βρέθηκαν στοιχεία
          </div>
        ) : (
          <div className="dp-body">
            {/* Status badges */}
            <div className="dp-badges">
              <span className={`badge ${isActive ? 'badge-active' : 'badge-neutral'}`}>
                {isActive && <span style={{ width: 5, height: 5, borderRadius: 3, background: 'var(--active-text)', display: 'inline-block' }} />}
                {detail.status_descr}
              </span>
              {detail.legal_type_descr && <span className="badge badge-neutral">{detail.legal_type_descr}</span>}
              {year && <span className="badge badge-neutral">Ίδρ. {year}</span>}
            </div>

            {/* Identifiers */}
            <div className="dp-section">
              <InfoRow label="ΑΡΓΕΜΗ" value={<span className="mono" style={{ fontSize: 12 }}>{detail.ar_gemi}</span>} />
              <InfoRow label="ΑΦΜ" value={detail.afm ? <span className="mono" style={{ fontSize: 12 }}>{detail.afm}</span> : null} />
            </div>

            {/* Location */}
            {(address || detail.city || detail.municipality_descr || detail.prefecture_descr) && (
              <Section title="Τοποθεσία">
                <InfoRow label="Διεύθυνση" value={address || null} />
                <InfoRow
                  label="Πόλη / Δήμος"
                  value={[detail.city, detail.municipality_descr].filter(Boolean).join(' · ') || null}
                />
                <InfoRow label="ΤΚ" value={detail.zip_code} />
                <InfoRow label="Νομός" value={detail.prefecture_descr} />
              </Section>
            )}

            {/* Contact */}
            {(detail.email || detail.phone || detail.fax || detail.url) && (
              <Section title="Επικοινωνία">
                <InfoRow label="Email" value={
                  detail.email
                    ? <a href={`mailto:${detail.email}`} className="dp-link">{detail.email}</a>
                    : null
                } />
                <InfoRow label="Τηλέφωνο" value={
                  detail.phone ? <span className="mono" style={{ fontSize: 12 }}>{detail.phone}</span> : null
                } />
                <InfoRow label="Fax" value={
                  detail.fax ? <span className="mono" style={{ fontSize: 12 }}>{detail.fax}</span> : null
                } />
                <InfoRow label="Website" value={
                  detail.url
                    ? <a href={detail.url.startsWith('http') ? detail.url : `https://${detail.url}`}
                         target="_blank" rel="noopener noreferrer" className="dp-link">
                        {detail.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                      </a>
                    : null
                } />
              </Section>
            )}

            {/* Persons */}
            {persons.length > 0 && (
              <Section title="Στελέχη">
                {persons.map((p, i) => {
                  const name = (p.personName ?? p.businessName ?? '—').trim()
                  const role = p.role ?? ''
                  const meta = [p.category, p.percentage].filter(Boolean).join(' · ')
                  return (
                    <div key={i} className="dp-person">
                      <div className="dp-person-name">{name}</div>
                      {role && <div className="dp-person-role">{role}</div>}
                      {meta && <div className="dp-person-role" style={{ opacity: 0.65, fontSize: 11 }}>{meta}</div>}
                    </div>
                  )
                })}
              </Section>
            )}

            {/* KAD Activities */}
            {activities.length > 0 && (
              <Section title="Κλάδοι ΚΑΔ">
                {(kadExpanded ? activities : activities.slice(0, 5)).map((a, i) => {
                  const isPrimary = a.type === 'Κύρια'
                  const code = a.activity?.id ?? '—'
                  const desc = a.activity?.descr ?? ''
                  return (
                    <div key={i} className={`dp-kad-row${isPrimary ? ' dp-kad-row--primary' : ''}`}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="dp-kad-code mono">{code}</span>
                        {isPrimary && <span className="dp-kad-badge">Κύρια</span>}
                      </div>
                      {desc && <div className="dp-kad-desc">{desc}</div>}
                    </div>
                  )
                })}
                {activities.length > 5 && (
                  <button className="dp-expand-btn" onClick={() => setKadExpanded(e => !e)}>
                    {kadExpanded
                      ? '▲ Λιγότερα'
                      : `▼ +${activities.length - 5} ακόμα κλάδοι`}
                  </button>
                )}
              </Section>
            )}

            {/* Objective */}
            {detail.objective && (
              <Section title="Σκοπός">
                <p className="dp-objective">{detail.objective}</p>
              </Section>
            )}
          </div>
        )}
      </div>
    </>
  )
}
