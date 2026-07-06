import { NextResponse } from 'next/server'
import { queryWithTimeout } from '@/lib/db'

export interface ConnectionRow {
  person_name: string
  person_role: string | null
  linked_ar_gemi: string
  linked_name: string | null
  linked_status: string | null
  linked_role: string | null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ar_gemi: string }> }
) {
  const { ar_gemi } = await params
  try {
    const rows = await queryWithTimeout<ConnectionRow>(`
      SELECT
        cp.person_name,
        cp.role               AS person_role,
        cp2.ar_gemi::text     AS linked_ar_gemi,
        c2.co_name_el         AS linked_name,
        c2.status_descr       AS linked_status,
        cp2.role              AS linked_role
      FROM company_persons cp
      LEFT JOIN company_persons cp2
        ON  cp2.person_name = cp.person_name
        AND cp2.ar_gemi     != cp.ar_gemi
        AND cp2.dt_to        IS NULL
      LEFT JOIN companies c2
        ON  c2.ar_gemi = cp2.ar_gemi::bigint
      WHERE cp.ar_gemi = $1
        AND cp.dt_to   IS NULL
      ORDER BY cp.person_name, c2.co_name_el
      LIMIT 100
    `, [ar_gemi], 6000)

    return NextResponse.json(rows)
  } catch {
    return NextResponse.json([])
  }
}
