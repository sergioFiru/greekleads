import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

// Cached for an hour: these are whole-table aggregates over ~1.67M rows and
// the numbers barely move day to day. Without this the homepage would pay for
// a full scan on every visit.
export const revalidate = 3600

// The 5 Attica sub-regions companies.prefecture_descr distinguishes (ΓΕΜΗ's
// own split) collapse into one bucket here — matches the single "ΑΤΤΙΚΗ" shape
// in lib/greecePrefectureShapes.json (splitting them on the hero map would be
// illegible slivers at that scale).
const ATTICA_PARTS = ['ΑΤΤΙΚΗΣ', 'ΑΘΗΝΩΝ', 'ΠΕΙΡΑΙΑ', 'ΑΝΑΤΟΛΙΚΗΣ ΑΤΤΙΚΗΣ', 'ΔΥΤΙΚΗΣ ΑΤΤΙΚΗΣ']

export async function GET() {
  try {
    // Single pass over the table — FILTER is far cheaper than separate COUNTs.
    const [row, prefRows] = await Promise.all([
      queryOne<{
        total: string
        active: string
        with_contact: string
        with_social: string
      }>(
        `SELECT
           COUNT(*)::text                                              AS total,
           COUNT(*) FILTER (WHERE status_descr ILIKE 'ενεργ%')::text   AS active,
           COUNT(*) FILTER (
             WHERE NULLIF(email, '') IS NOT NULL
                OR NULLIF(phone, '') IS NOT NULL
           )::text                                                     AS with_contact,
           COUNT(*) FILTER (
             WHERE NULLIF(instagram_url, '') IS NOT NULL
                OR NULLIF(facebook_url,  '') IS NOT NULL
                OR NULLIF(linkedin_url,  '') IS NOT NULL
                OR NULLIF(tiktok_url,    '') IS NOT NULL
           )::text                                                     AS with_social
         FROM companies`
      ),
      query<{ prefecture_descr: string; cnt: string }>(
        `SELECT prefecture_descr, COUNT(*)::text AS cnt
         FROM companies
         WHERE status_descr ILIKE 'ενεργ%' AND prefecture_descr IS NOT NULL
         GROUP BY prefecture_descr`
      ),
    ])

    const n = (v: string | undefined) => parseInt(v ?? '0', 10)

    const byPrefecture: Record<string, number> = {}
    let atticaTotal = 0
    for (const r of prefRows) {
      const name = r.prefecture_descr
      const cnt = n(r.cnt)
      if (ATTICA_PARTS.includes(name)) {
        atticaTotal += cnt
      } else if (name !== 'Inadequate Info') {
        byPrefecture[name] = cnt
      }
    }
    if (atticaTotal > 0) byPrefecture['ΑΤΤΙΚΗ'] = atticaTotal

    return NextResponse.json({
      companies:    n(row?.total),
      active:       n(row?.active),
      withContact:  n(row?.with_contact),
      withSocial:   n(row?.with_social),
      byPrefecture,
    })
  } catch (err) {
    console.error('[/api/stats]', err)
    return NextResponse.json({ companies: 0 }, { status: 500 })
  }
}
