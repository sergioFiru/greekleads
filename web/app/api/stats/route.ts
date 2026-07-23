import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'

// Cached for an hour: these are whole-table aggregates over ~1.67M rows and
// the numbers barely move day to day. Without this the homepage would pay for
// a full scan on every visit.
export const revalidate = 3600

export async function GET() {
  try {
    // Single pass over the table — FILTER is far cheaper than separate COUNTs.
    const row = await queryOne<{
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
    )

    const n = (v: string | undefined) => parseInt(v ?? '0', 10)

    return NextResponse.json({
      companies:    n(row?.total),
      active:       n(row?.active),
      withContact:  n(row?.with_contact),
      withSocial:   n(row?.with_social),
    })
  } catch (err) {
    console.error('[/api/stats]', err)
    return NextResponse.json({ companies: 0 }, { status: 500 })
  }
}
