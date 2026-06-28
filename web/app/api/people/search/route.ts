import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q = (searchParams.get('q') ?? '').trim()
  const area = searchParams.get('area') ?? ''
  const status = searchParams.get('status') ?? ''
  const count = searchParams.get('count') ?? ''

  if (!q || q.length < 3) {
    return NextResponse.json({ results: [] })
  }

  const params: unknown[] = [q]
  let i = 2

  const areaJoin = area ? `AND c.prefecture_descr = $${i++}` : ''
  if (area) params.push(area)

  const statusFilter =
    status === 'active' ? 'AND cp.dt_to IS NULL' :
    status === 'past'   ? 'AND cp.dt_to IS NOT NULL' : ''

  const countHaving =
    count === '1'   ? 'HAVING COUNT(DISTINCT cp.ar_gemi) = 1' :
    count === '2-3' ? 'HAVING COUNT(DISTINCT cp.ar_gemi) BETWEEN 2 AND 3' :
    count === '4+'  ? 'HAVING COUNT(DISTINCT cp.ar_gemi) >= 4' : ''

  try {
    const results = await query<{
      person_name: string
      company_count: number
      active_count: number
      primary_role: string | null
      primary_company: string | null
      companies: Array<{ ar_gemi: string; name: string; status: string }>
      prefectures: string[]
    }>(
      `SELECT
        cp.person_name,
        COUNT(DISTINCT cp.ar_gemi)::int                                                    AS company_count,
        COUNT(DISTINCT cp.ar_gemi) FILTER (WHERE cp.dt_to IS NULL)::int                   AS active_count,
        (array_agg(cp.role        ORDER BY (cp.dt_to IS NULL) DESC, cp.dt_from DESC NULLS LAST))[1] AS primary_role,
        (array_agg(c.co_name_el   ORDER BY (cp.dt_to IS NULL) DESC, cp.dt_from DESC NULLS LAST))[1] AS primary_company,
        jsonb_agg(
          jsonb_build_object('ar_gemi', cp.ar_gemi, 'name', c.co_name_el, 'status', c.status_descr)
          ORDER BY (cp.dt_to IS NULL) DESC, cp.dt_from DESC NULLS LAST
        )                                                                                  AS companies,
        array_agg(DISTINCT c.prefecture_descr) FILTER (WHERE c.prefecture_descr IS NOT NULL)
                                                                                           AS prefectures,
        MAX(word_similarity($1, cp.person_name))                                           AS sim
      FROM company_persons cp
      JOIN companies c ON c.ar_gemi = cp.ar_gemi::bigint
      WHERE (
        $1 <% cp.person_name
        OR cp.person_name ILIKE '%' || $1 || '%'
        OR c.email ILIKE '%' || $1 || '%'
        OR c.phone ILIKE '%' || $1 || '%'
      )
        ${areaJoin}
        ${statusFilter}
      GROUP BY cp.person_name
      ${countHaving}
      ORDER BY sim DESC
      LIMIT 20`,
      params
    )

    return NextResponse.json({ results })
  } catch (err) {
    console.error('[/api/people/search]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
