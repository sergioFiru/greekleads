import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

/**
 * robots.txt
 *
 * The one rule that matters here is `Disallow: /search`. Filtered search is an
 * effectively infinite URL space (status × prefecture × ΚΑΔ × capital × contact
 * flags × page), every combination of which returns a thin, near-duplicate list.
 * Left open, Googlebot spends its entire crawl budget there and never reaches
 * the company pages we actually want indexed.
 *
 * /people is different: the bare hub and the /people/[slug] profiles are real
 * content, so only the query-string variants are blocked.
 *
 * NEVER add /sitemaps/ here. Disallow blocks the crawler from FETCHING the
 * path, not just from indexing it -- so disallowing the chunk files makes the
 * sitemap index point at URLs the crawler is forbidden to read. Bing reported
 * exactly that: "Blocked by robots.txt", 0 URLs discovered.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/search',      // faceted-search crawl trap — see above
          '/people?',     // ?q= variants only; profiles stay crawlable
          '/crm',         // authenticated
          '/api/',
          '/sign-in',
          '/sign-up',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
