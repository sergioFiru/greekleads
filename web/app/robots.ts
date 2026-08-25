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
          '/sitemaps/',  // chunk files are reached via the index, not crawled as pages
          '/sign-in',
          '/sign-up',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
