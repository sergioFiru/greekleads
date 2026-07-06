import { NextRequest, NextResponse } from 'next/server'
import { queryOne, query } from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ar_gemi: string }> }
) {
  try {
    const { ar_gemi } = await params
    const [company, members] = await Promise.all([
      queryOne(
        `SELECT ar_gemi::text, afm, co_name_el, co_names_en, co_titles_el, co_titles_en,
                legal_type_descr, status_descr,
                prefecture_descr, municipality_descr, city, street, street_number, zip_code,
                email, phone, fax, url, incorporation_date::text, primary_kad,
                activities, capital, objective,
                instagram_url, facebook_url, linkedin_url, twitter_url, tiktok_url, youtube_url
         FROM companies WHERE ar_gemi = $1::bigint`,
        [ar_gemi]
      ),
      query(
        `SELECT person_name, role, category, dt_to::text
         FROM company_persons WHERE ar_gemi = $1
         ORDER BY (dt_to IS NULL) DESC, dt_from DESC NULLS LAST
         LIMIT 6`,
        [ar_gemi]
      ),
    ])
    if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ...company, members })
  } catch (err) {
    console.error('[/api/company]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
