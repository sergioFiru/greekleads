import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

/**
 * GET /api/statistics/feed — the live registry feed.
 *
 * Ordered by `gemi_fetched_at` (when the record reached us), NOT by
 * `incorporation_date` (when the firm was founded). Those are different clocks:
 * measured median lag between them is 30 days, p90 is 81. Ordering by founding
 * date would produce a "live" feed that sat still for weeks at a time, so the
 * feed is labelled «Μόλις καταχωρήθηκαν» and shows both dates — what arrived,
 * and how old it is.
 *
 * Deliberately not cached: this is the one part of the page that is supposed to
 * move.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await query<{
      ar_gemi: string
      co_name_el: string
      legal_type_descr: string | null
      prefecture_descr: string | null
      city: string | null
      incorporation_date: string | null
      gemi_fetched_at: string
      kad: string | null
      kad_descr: string | null
      has_favicon: boolean
    }>(
      `SELECT c.ar_gemi::text,
              c.co_name_el,
              c.legal_type_descr,
              c.prefecture_descr,
              c.city,
              c.incorporation_date::text,
              c.gemi_fetched_at::text,
              -- primary_kad is a backfilled column and is null on the newest
              -- rows -- exactly the ones this feed shows -- so the activity
              -- comes from the JSONB, which is the source of truth.
              (SELECT a->'activity'->>'id'    FROM jsonb_array_elements(c.activities) a
                WHERE a->>'type' = 'Κύρια' AND a->>'dtTo' IS NULL LIMIT 1) AS kad,
              (SELECT a->'activity'->>'descr' FROM jsonb_array_elements(c.activities) a
                WHERE a->>'type' = 'Κύρια' AND a->>'dtTo' IS NULL LIMIT 1) AS kad_descr,
              (fv.ar_gemi IS NOT NULL) AS has_favicon
       FROM companies c
       LEFT JOIN company_favicons fv ON fv.ar_gemi = c.ar_gemi AND fv.status = 'ok'
       WHERE c.gemi_fetched_at IS NOT NULL
         -- Junk guard: ΓΕΜΗ carries incorporation_date = 9999-01-01 on a few
         -- rows, which would render as a firm founded in the year 9999.
         AND (c.incorporation_date IS NULL OR c.incorporation_date <= CURRENT_DATE)
       ORDER BY c.gemi_fetched_at DESC
       LIMIT 24`
    )

    return NextResponse.json({ items: rows })
  } catch (err) {
    console.error('[/api/statistics/feed]', err)
    return NextResponse.json({ items: [] }, { status: 200 })
  }
}
