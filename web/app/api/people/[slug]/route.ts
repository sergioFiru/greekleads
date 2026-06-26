import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export interface CompanyRow {
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
}

export interface ContactSignal {
  type: 'email' | 'phone'
  value: string
  companies: string[]
  isPersonal: boolean
}

export interface PersonProfile {
  name: string
  stats: {
    total: number
    active: number
    stakes: number
    largestStake: number | null
  }
  companies: CompanyRow[]
  contacts: ContactSignal[]
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const name = decodeURIComponent(slug)

  try {
    const rows = await query<CompanyRow>(
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

    if (!rows.length) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const active = rows.filter(r => !r.dt_to).length
    const stakeRows = rows.filter(r => r.percentage != null && r.percentage > 0)
    const largestStake = stakeRows.length
      ? Math.max(...stakeRows.map(r => r.percentage!))
      : null

    // ContactIntelligence: detect emails/phones shared across 2+ companies
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

    const contacts: ContactSignal[] = [
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

    const profile: PersonProfile = {
      name,
      stats: { total: rows.length, active, stakes: stakeRows.length, largestStake },
      companies: rows,
      contacts,
    }

    return NextResponse.json(profile)
  } catch (err) {
    console.error('[/api/people/slug]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
