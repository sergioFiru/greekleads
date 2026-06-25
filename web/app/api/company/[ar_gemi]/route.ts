import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ar_gemi: string }> }
) {
  try {
    const { ar_gemi } = await params
    const row = await queryOne(
      `SELECT ar_gemi, afm, co_name_el, co_names_en, co_titles_el, co_titles_en,
              legal_type_descr, status_descr,
              prefecture_descr, municipality_descr, city, street, street_number, zip_code,
              email, phone, fax, url, incorporation_date, activities, persons, capital, objective
       FROM companies WHERE ar_gemi = $1`,
      [ar_gemi]
    )
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(row)
  } catch (err) {
    console.error('[/api/company]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
