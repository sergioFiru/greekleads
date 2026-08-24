import { NextRequest, NextResponse } from 'next/server'
import { queryNoParallel } from '@/lib/db'
import { getAuth, FREE_PAGE_LIMIT, PAGE_SIZE } from '@/lib/auth'
import { buildWhere, hasActiveFilter, type SearchFilters } from '@/lib/searchQuery'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const filters: SearchFilters = body.filters ?? {}
    const page: number = Math.max(1, parseInt(String(body.page ?? '1'), 10))

    // Require at least one filter (match leads.py behaviour)
    if (!hasActiveFilter(filters)) {
      return NextResponse.json({ results: [], total: null, page, noFilter: true })
    }

    // Gate check
    const gateDisabled = process.env.NEXT_PUBLIC_DISABLE_GATE === 'true'
    if (!gateDisabled && page > FREE_PAGE_LIMIT) {
      const { isPaid } = await getAuth()
      if (!isPaid) return NextResponse.json({ gated: true }, { status: 403 })
    }

    const { sql: where, params } = buildWhere(filters)
    const offset = (page - 1) * PAGE_SIZE

    const [rows, countRow] = await Promise.all([
      queryNoParallel<{
        ar_gemi: string
        co_name_el: string
        co_titles_el: string[] | null
        legal_type_descr: string
        prefecture_descr: string
        municipality_descr: string
        status_descr: string
        year_founded: number | null
        email: string | null
        phone: string | null
        url: string | null
        discovered_url: string | null
        instagram_url: string | null
        facebook_url: string | null
        linkedin_url: string | null
        twitter_url: string | null
        tiktok_url: string | null
        youtube_url: string | null
        has_favicon: boolean
      }>(
        `SELECT
           c.ar_gemi,
           c.co_name_el,
           c.co_titles_el,
           c.legal_type_descr,
           c.prefecture_descr,
           c.municipality_descr,
           c.status_descr,
           EXTRACT(YEAR FROM c.incorporation_date)::int AS year_founded,
           NULLIF(c.email, '') AS email,
           NULLIF(c.phone, '') AS phone,
           NULLIF(c.url,   '') AS url,
           NULLIF(c.discovered_url, '') AS discovered_url,
           c.instagram_url, c.facebook_url, c.linkedin_url,
           c.twitter_url, c.tiktok_url, c.youtube_url,
           (fv.ar_gemi IS NOT NULL) AS has_favicon
         FROM companies c
         LEFT JOIN company_favicons fv ON fv.ar_gemi = c.ar_gemi AND fv.status = 'ok'
         ${where}
         ORDER BY (
           (c.instagram_url IS NOT NULL)::int +
           (c.facebook_url  IS NOT NULL)::int +
           (c.linkedin_url  IS NOT NULL)::int +
           (c.twitter_url   IS NOT NULL)::int +
           (c.tiktok_url    IS NOT NULL)::int +
           (c.youtube_url   IS NOT NULL)::int
         ) DESC, c.ar_gemi
         LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
        params
      ),
      queryNoParallel<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM companies c ${where}`,
        params
      ),
    ])

    const total = parseInt(countRow[0]?.cnt ?? '0', 10)
    return NextResponse.json({ results: rows, total, page })
  } catch (err) {
    console.error('[/api/search] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
