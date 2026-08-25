import { notFound } from 'next/navigation'
import { queryWithTimeout } from '@/lib/db'
import { SITE_URL } from '@/lib/site'
import { CHUNK, TIER_A, hubUrls, xmlResponse } from '@/lib/sitemapScope'

/** /sitemaps/0.xml = hub pages, /sitemaps/1.xml.. = company pages. */
export const revalidate = 86400

interface Row { ar_gemi: string; last_updated_at: Date | null }

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chunk: string }> }
) {
  const { chunk } = await params
  const m = /^(\d+)\.xml$/.exec(chunk)
  if (!m) notFound()
  const id = Number(m[1])

  if (id === 0) {
    const urls = hubUrls().map(u =>
      `  <url>\n    <loc>${u.loc}</loc>\n    <priority>${u.priority}</priority>\n  </url>`
    ).join('\n')
    return xmlResponse(urlset(urls))
  }

  const rows = await queryWithTimeout<Row>(
    `SELECT ar_gemi::text, last_updated_at
       FROM companies
      WHERE ${TIER_A}
      ORDER BY ar_gemi
      LIMIT $1 OFFSET $2`,
    [CHUNK, (id - 1) * CHUNK],
    20_000
  )

  const urls = rows.map(r => {
    const lastmod = r.last_updated_at
      ? `\n    <lastmod>${new Date(r.last_updated_at).toISOString()}</lastmod>`
      : ''
    return `  <url>\n    <loc>${SITE_URL}/etaireies/${r.ar_gemi}</loc>${lastmod}\n  </url>`
  }).join('\n')

  // An out-of-range id would otherwise serve a valid but empty <urlset>, which
  // Google reports as a sitemap error. 404 is the honest answer. Checked from
  // the rows we already fetched rather than a second COUNT query -- this route
  // is hit once per chunk and the count is the expensive half.
  if (!rows.length) notFound()

  return xmlResponse(urlset(urls))
}

function urlset(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${inner}\n</urlset>\n`
}
