import { NextRequest, NextResponse } from 'next/server'
import { queryNoParallel } from '@/lib/db'
import { getAuth, PAGE_SIZE } from '@/lib/auth'
import { limitsFor, MIN_SEARCH_PAGES } from '@/lib/entitlements'
import { buildWhere, hasActiveFilter, type SearchFilters } from '@/lib/searchQuery'
import { cleanCompanyRow } from '@/lib/registryText'

// ── Sort orders ────────────────────────────────────────────────────────
//
// A LOOKUP, never interpolation. The value arrives from the client, and
// ORDER BY cannot be parameterised — so anything not in this map is ignored
// rather than reaching SQL.
//
// Until 2026-10-07 the ORDER BY was hardcoded to the social score and the
// dropdown sorted CLIENT-SIDE, over only the 50 rows already on screen. Picking
// «Όνομα (A → Ω)» on 354.218 results alphabetised whatever the social sort had
// chosen, which looks like a global sort and is not.
//
// Every order ends with c.ar_gemi. Without a unique tie-breaker, rows that
// compare equal can land in a different position on each query, so a row can
// appear on two pages or on none — a paginated export would silently duplicate
// and drop companies.
const SOCIAL_SCORE = `(
           (c.instagram_url IS NOT NULL)::int +
           (c.facebook_url  IS NOT NULL)::int +
           (c.linkedin_url  IS NOT NULL)::int +
           (c.twitter_url   IS NOT NULL)::int +
           (c.tiktok_url    IS NOT NULL)::int +
           (c.youtube_url   IS NOT NULL)::int
         )`

const SORT_ORDERS: Record<string, string> = {
  // The default: most online presence first, as the best proxy we have for
  // "most worth contacting". Backed by an expression index matching it exactly.
  social:          `${SOCIAL_SCORE} DESC, c.ar_gemi`,
  'co_name_el':    'c.co_name_el ASC, c.ar_gemi',
  '-co_name_el':   'c.co_name_el DESC, c.ar_gemi',
  // NULLS LAST both ways: a company with no founding date is missing data, not
  // the oldest or the newest company in Greece.
  'year_founded':  'c.incorporation_date ASC NULLS LAST, c.ar_gemi',
  '-year_founded': 'c.incorporation_date DESC NULLS LAST, c.ar_gemi',
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const filters: SearchFilters = body.filters ?? {}
    const page: number = Math.max(1, parseInt(String(body.page ?? '1'), 10))
    const orderBy = SORT_ORDERS[String(body.sort ?? 'social')] ?? SORT_ORDERS.social

    // Require at least one filter (match leads.py behaviour)
    if (!hasActiveFilter(filters)) {
      return NextResponse.json({ results: [], total: null, page, noFilter: true })
    }

    // Gate check.
    //
    // The page allowance is per plan (entitlements.ts): anon 2, free 5, paid
    // tiers far more. MIN_SEARCH_PAGES is the floor every visitor gets, so any
    // page at or below it skips the auth lookup entirely and the common case
    // stays fast.
    const gateDisabled = process.env.NEXT_PUBLIC_DISABLE_GATE === 'true'
    if (!gateDisabled && page > MIN_SEARCH_PAGES) {
      const { plan, isLoggedIn } = await getAuth()
      const maxPages = limitsFor(plan).maxSearchPages
      if (page > maxPages) {
        // 'signup' and 'upgrade' are different walls with different copy and
        // very different conversion rates — the client needs to know which.
        return NextResponse.json(
          { gated: true, reason: isLoggedIn ? 'upgrade' : 'signup', plan, maxPages },
          { status: 403 }
        )
      }
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
         ORDER BY ${orderBy}
         LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
        params
      ),
      queryNoParallel<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM companies c ${where}`,
        params
      ),
    ])

    const total = parseInt(countRow[0]?.cnt ?? '0', 10)
    // Scrubbed here rather than in the table component so the CSV export —
    // which is built from these same rows — cannot ship English filler to a
    // customer's CRM.
    return NextResponse.json({ results: rows.map(cleanCompanyRow), total, page })
  } catch (err) {
    console.error('[/api/search] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
