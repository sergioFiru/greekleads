import { queryWithTimeout } from '@/lib/db'
import { SITE_URL } from '@/lib/site'

/**
 * Shared definition of what the sitemaps contain.
 *
 * SCOPE — deliberately NOT all 1.67M companies.
 * Tier A is active companies that have a website (~80k). Those pages carry data
 * no other ΓΕΜΗ mirror has, so they are the honest test of whether the
 * /etaireies template earns indexation at all. Submitting 1.67M near-duplicate
 * registry pages from a domain with no authority buys a very large
 * "Discovered – currently not indexed" number and a site-wide quality problem.
 * Widen TIER_A only once Search Console shows Tier A indexing well.
 *
 * PERFORMANCE — TIER_A must stay character-identical to the partial-index
 * predicate in scripts/one_time/add_sitemap_index.py. Drift there turns a
 * 0,1s index-only scan back into the 12s sequential scan this was built to
 * avoid, inside a serverless function Googlebot is waiting on.
 *
 * WHY ROUTE HANDLERS AND NOT app/sitemap.ts
 * Next's generateSitemaps emits the chunk files but never the <sitemapindex>
 * that ties them together, while still reserving /sitemap.xml for itself and
 * serving 404 there. Hand-rolling both ends is less machinery than working
 * around that.
 */
export const CHUNK = 50_000        // Google's hard limit per sitemap file
export const TIER_A = `status_descr = 'Ενεργή' AND url IS NOT NULL AND url <> ''`

/** Chunk 0 is the hub pages; 1..N are company pages. */
export function hubUrls(): { loc: string; priority: string }[] {
  return [
    { loc: `${SITE_URL}/`,           priority: '1.0' },
    { loc: `${SITE_URL}/statistika`, priority: '0.9' },
    { loc: `${SITE_URL}/people`,     priority: '0.7' },
    { loc: `${SITE_URL}/pricing`,    priority: '0.5' },
  ]
}

export async function companyChunkCount(): Promise<number> {
  const rows = await queryWithTimeout<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM companies WHERE ${TIER_A}`,
    undefined,
    20_000
  )
  return Math.ceil(Number(rows[0]?.n ?? 0) / CHUNK)
}

export function xmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // Sitemaps are re-read every few days at best, so a day-old copy costs
      // nothing and keeps this off the database on every crawl.
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800',
    },
  })
}
