import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export interface NetworkRow {
  ar_gemi: string
  co_name_el: string
  status_descr: string | null
  role: string | null
  dt_to: string | null
  co_person: string | null
  co_role: string | null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const name = decodeURIComponent(slug)

  try {
    // Get current companies for the person (max 10, current first)
    const companies = await query<{ ar_gemi: string; co_name_el: string; status_descr: string | null; role: string | null; dt_to: string | null }>(`
      SELECT cp.ar_gemi, c.co_name_el, c.status_descr, cp.role, cp.dt_to
      FROM company_persons cp
      JOIN companies c ON c.ar_gemi = cp.ar_gemi::bigint
      WHERE cp.person_name = $1
      ORDER BY (cp.dt_to IS NULL) DESC, cp.dt_from DESC NULLS LAST
      LIMIT 10
    `, [name])

    if (!companies.length) return NextResponse.json([])

    const arGemis = companies.map(c => c.ar_gemi)

    // Get co-directors for all those companies (max 4 per company)
    const codirs = await query<{ ar_gemi: string; co_person: string; co_role: string | null }>(`
      SELECT cp.ar_gemi, cp.person_name AS co_person, cp.role AS co_role
      FROM (
        SELECT cp.ar_gemi, cp.person_name, cp.role,
               ROW_NUMBER() OVER (PARTITION BY cp.ar_gemi ORDER BY cp.person_name) AS rn
        FROM company_persons cp
        WHERE cp.ar_gemi = ANY($1)
          AND cp.person_name != $2
          AND cp.dt_to IS NULL
      ) cp
      WHERE cp.rn <= 4
    `, [arGemis, name])

    const codirMap = new Map<string, { co_person: string; co_role: string | null }[]>()
    for (const r of codirs) {
      if (!codirMap.has(r.ar_gemi)) codirMap.set(r.ar_gemi, [])
      codirMap.get(r.ar_gemi)!.push({ co_person: r.co_person, co_role: r.co_role })
    }

    const rows: NetworkRow[] = []
    for (const c of companies) {
      const directors = codirMap.get(c.ar_gemi) ?? []
      if (directors.length === 0) {
        rows.push({ ...c, co_person: null, co_role: null })
      } else {
        for (const d of directors) {
          rows.push({ ...c, co_person: d.co_person, co_role: d.co_role })
        }
      }
    }

    return NextResponse.json(rows)
  } catch {
    return NextResponse.json([], { status: 500 })
  }
}
