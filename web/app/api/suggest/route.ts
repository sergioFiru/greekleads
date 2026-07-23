import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

// Lightweight typeahead for the homepage hero.
// Deliberately narrow: no counts, no facets, no joins — just enough columns to
// render a suggestion row and link straight to the company page.
// Backed by idx_companies_co_name_el_trgm (see tools/add_name_index.py).

export interface Suggestion {
  ar_gemi: string
  name: string
  legal_type: string | null
  place: string | null
  status: string | null
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()

  // Trigram matching needs 3 chars to be selective; below that a scan would
  // return half the table.
  if (q.length < 3) {
    return NextResponse.json({ results: [] })
  }

  try {
    const results = await query<Suggestion>(
      `SELECT
         c.ar_gemi::text                AS ar_gemi,
         c.co_name_el                   AS name,
         NULLIF(c.legal_type_descr, 'Inadequate Info')  AS legal_type,
         -- 'Inadequate Info' is a placeholder the registry uses for unknown
         -- values, and municipality_descr is a combined 'ΔΗΜΟΣ / ΝΟΜΟΣ' string,
         -- so it shows up as 'Inadequate Info / Inadequate Info'. Match on the
         -- substring rather than the whole value, or it leaks into the UI.
         COALESCE(
           CASE WHEN c.municipality_descr ILIKE '%Inadequate Info%'
                  OR c.municipality_descr = '' THEN NULL
                ELSE c.municipality_descr END,
           CASE WHEN c.prefecture_descr ILIKE '%Inadequate Info%'
                THEN NULL ELSE c.prefecture_descr END
         ) AS place,
         c.status_descr                 AS status
       FROM companies c
       WHERE c.co_name_el ILIKE $1
       ORDER BY
         -- exact prefix matches first, then shortest names (usually the
         -- parent/best-known entity), then alphabetical for stability
         (c.co_name_el ILIKE $2) DESC,
         length(c.co_name_el) ASC,
         c.co_name_el ASC
       LIMIT 6`,
      [`%${q}%`, `${q}%`]
    )

    return NextResponse.json({ results })
  } catch (err) {
    console.error('[/api/suggest]', err)
    return NextResponse.json({ results: [], error: String(err) }, { status: 500 })
  }
}
