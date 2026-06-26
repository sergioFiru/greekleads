import { notFound } from 'next/navigation'
import TopNav from '@/components/TopNav'
import PersonProfile from '@/components/PersonProfile'
import type { PersonProfile as PersonProfileType } from '@/app/api/people/[slug]/route'
import { query } from '@/lib/db'

interface Props {
  params: Promise<{ slug: string }>
}

async function getProfile(name: string): Promise<PersonProfileType | null> {
  try {
    const rows = await query<{
      ar_gemi: string
      role: string | null
      category: string | null
      dt_from: string | null
      dt_to: string | null
      percentage: number | null
      co_name_el: string
      legal_type_descr: string | null
      status_descr: string | null
      prefecture_descr: string | null
      municipality_descr: string | null
      email: string | null
      phone: string | null
      url: string | null
    }>(
      `SELECT
        cp.ar_gemi, cp.role, cp.category, cp.dt_from, cp.dt_to, cp.percentage,
        c.co_name_el, c.legal_type_descr, c.status_descr,
        c.prefecture_descr, c.municipality_descr,
        NULLIF(c.email, '') AS email,
        NULLIF(c.phone, '') AS phone,
        NULLIF(c.url,   '') AS url
      FROM company_persons cp
      JOIN companies c ON c.ar_gemi = cp.ar_gemi::bigint
      WHERE cp.person_name = $1
      ORDER BY (cp.dt_to IS NULL) DESC, cp.dt_from DESC NULLS LAST`,
      [name]
    )

    if (!rows.length) return null

    const active = rows.filter(r => !r.dt_to).length
    const stakeRows = rows.filter(r => r.percentage != null && r.percentage > 0)
    const largestStake = stakeRows.length
      ? Math.max(...stakeRows.map(r => r.percentage!))
      : null

    const emailMap = new Map<string, string[]>()
    const phoneMap = new Map<string, string[]>()

    for (const r of rows) {
      if (r.email) {
        const key = r.email.toLowerCase().trim()
        if (!emailMap.has(key)) emailMap.set(key, [])
        emailMap.get(key)!.push(r.co_name_el)
      }
      if (r.phone) {
        const key = r.phone.replace(/\s+/g, '').trim()
        if (!phoneMap.has(key)) phoneMap.set(key, [])
        phoneMap.get(key)!.push(r.co_name_el)
      }
    }

    const contacts = [
      ...Array.from(emailMap.entries()).map(([value, companies]) => ({
        type: 'email' as const,
        value,
        companies,
        isPersonal: companies.length >= 2,
      })),
      ...Array.from(phoneMap.entries()).map(([value, companies]) => ({
        type: 'phone' as const,
        value,
        companies,
        isPersonal: companies.length >= 2,
      })),
    ].sort((a, b) => b.companies.length - a.companies.length)

    return {
      name,
      stats: { total: rows.length, active, stakes: stakeRows.length, largestStake },
      companies: rows,
      contacts,
    }
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const name = decodeURIComponent(slug)
  return {
    title: `${name} — GreekLeads`,
  }
}

export default async function PersonPage({ params }: Props) {
  const { slug } = await params
  const name = decodeURIComponent(slug)
  const profile = await getProfile(name)

  if (!profile) notFound()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopNav />
      <PersonProfile profile={profile} />
    </div>
  )
}
