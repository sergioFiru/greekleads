import { SITE_URL } from '@/lib/site'
import { companyChunkCount, xmlResponse } from '@/lib/sitemapScope'

/** The sitemap index — the single URL robots.txt points Google at. */
export const revalidate = 86400

export async function GET() {
  const chunks = await companyChunkCount()
  const lastmod = new Date().toISOString()

  const entries = Array.from({ length: chunks + 1 }, (_, i) =>
    `  <sitemap>\n` +
    `    <loc>${SITE_URL}/sitemaps/${i}.xml</loc>\n` +
    `    <lastmod>${lastmod}</lastmod>\n` +
    `  </sitemap>`
  ).join('\n')

  return xmlResponse(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${entries}\n` +
    `</sitemapindex>\n`
  )
}
