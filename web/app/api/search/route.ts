import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { getAuth, FREE_PAGE_LIMIT, PAGE_SIZE } from '@/lib/auth'

interface SearchFilters {
  name?: string
  statuses?: string[]
  prefectures?: string[]
  municipality?: string
  legal_types?: string[]
  activities?: string[]
  has_email?: boolean
  has_phone?: boolean
  has_website?: boolean
  has_no_website?: boolean
  has_instagram?: boolean
  has_facebook?: boolean
  has_linkedin?: boolean
  has_twitter?: boolean
  has_tiktok?: boolean
  has_youtube?: boolean
  year_from?: string
  year_to?: string
}


function buildWhere(f: SearchFilters): { sql: string; params: unknown[] } {
  const conds: string[] = []
  const params: unknown[] = []
  let i = 1

  if (f.name?.trim()) {
    const name  = f.name.trim()
    const words = name.split(/\s+/).filter(Boolean)
    if (words.length > 1) {
      // All words must appear in co_name_el (any order), or exact phrase in other fields
      const wordConds = words.map(() => `c.co_name_el ILIKE $${i++}`).join(' AND ')
      words.forEach(w => params.push(`%${w}%`))
      const exactIdx = i++
      params.push(`%${name}%`)
      conds.push(`((${wordConds}) OR c.email ILIKE $${exactIdx} OR c.phone ILIKE $${exactIdx} OR c.url ILIKE $${exactIdx} OR c.afm ILIKE $${exactIdx})`)
    } else {
      conds.push(`(c.co_name_el ILIKE $${i} OR c.email ILIKE $${i} OR c.phone ILIKE $${i} OR c.url ILIKE $${i} OR c.afm ILIKE $${i})`)
      i++
      params.push(`%${name}%`)
    }
  }
  if (f.statuses?.length) {
    const ph = f.statuses.map(() => `$${i++}`).join(', ')
    conds.push(`c.status_descr IN (${ph})`)
    params.push(...f.statuses)
  }
  if (f.prefectures?.length) {
    const ph = f.prefectures.map(() => `$${i++}`).join(', ')
    conds.push(`c.prefecture_descr IN (${ph})`)
    params.push(...f.prefectures)
  }
  if (f.municipality?.trim()) {
    conds.push(`c.municipality_descr ILIKE $${i++}`)
    params.push(`%${f.municipality.trim()}%`)
  }
  if (f.legal_types?.length) {
    const ph = f.legal_types.map(() => `$${i++}`).join(', ')
    conds.push(`c.legal_type_descr IN (${ph})`)
    params.push(...f.legal_types)
  }
  if (f.activities?.length) {
    const ph = f.activities.map(() => `$${i++}`).join(', ')
    conds.push(`c.primary_kad IN (${ph})`)
    params.push(...f.activities)
  }
  if (f.has_email)      conds.push(`(c.email IS NOT NULL AND c.email != '')`)
  if (f.has_phone)      conds.push(`(c.phone IS NOT NULL AND c.phone != '')`)
  if (f.has_website)    conds.push(`(c.url IS NOT NULL AND c.url != '')`)
  if (f.has_no_website) conds.push(`(c.url IS NULL OR c.url = '')`)
  if (f.has_instagram)  conds.push(`c.instagram_url IS NOT NULL`)
  if (f.has_facebook)   conds.push(`c.facebook_url  IS NOT NULL`)
  if (f.has_linkedin)   conds.push(`c.linkedin_url  IS NOT NULL`)
  if (f.has_twitter)    conds.push(`c.twitter_url   IS NOT NULL`)
  if (f.has_tiktok)     conds.push(`c.tiktok_url    IS NOT NULL`)
  if (f.has_youtube)    conds.push(`c.youtube_url   IS NOT NULL`)
  if (f.year_from) {
    const yr = parseInt(f.year_from, 10)
    if (!isNaN(yr)) { conds.push(`EXTRACT(YEAR FROM c.incorporation_date) >= $${i++}`); params.push(yr) }
  }
  if (f.year_to) {
    const yr = parseInt(f.year_to, 10)
    if (!isNaN(yr)) { conds.push(`EXTRACT(YEAR FROM c.incorporation_date) <= $${i++}`); params.push(yr) }
  }

  return {
    sql: conds.length ? `WHERE ${conds.join(' AND ')}` : '',
    params,
  }
}

function hasActiveFilter(f: SearchFilters): boolean {
  return !!(
    f.name?.trim() || f.municipality?.trim() ||
    f.has_email || f.has_phone || f.has_website || f.has_no_website ||
    f.has_instagram || f.has_facebook || f.has_linkedin || f.has_twitter || f.has_tiktok || f.has_youtube ||
    f.statuses?.length || f.prefectures?.length || f.legal_types?.length ||
    f.activities?.length || f.year_from || f.year_to
  )
}

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
      query<{
        ar_gemi: string
        co_name_el: string
        legal_type_descr: string
        prefecture_descr: string
        municipality_descr: string
        status_descr: string
        year_founded: number | null
        email: string | null
        phone: string | null
        url: string | null
        instagram_url: string | null
        facebook_url: string | null
        linkedin_url: string | null
        twitter_url: string | null
        tiktok_url: string | null
        youtube_url: string | null
      }>(
        `SELECT
           c.ar_gemi,
           c.co_name_el,
           c.legal_type_descr,
           c.prefecture_descr,
           c.municipality_descr,
           c.status_descr,
           EXTRACT(YEAR FROM c.incorporation_date)::int AS year_founded,
           NULLIF(c.email, '') AS email,
           NULLIF(c.phone, '') AS phone,
           NULLIF(c.url,   '') AS url,
           c.instagram_url, c.facebook_url, c.linkedin_url,
           c.twitter_url, c.tiktok_url, c.youtube_url
         FROM companies c
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
      queryOne<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM companies c ${where}`,
        params
      ),
    ])

    const total = parseInt(countRow?.cnt ?? '0', 10)
    return NextResponse.json({ results: rows, total, page })
  } catch (err) {
    console.error('[/api/search] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
