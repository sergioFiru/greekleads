/**
 * Canonical origin for anything that must emit an absolute URL — sitemaps,
 * robots.txt, JSON-LD, OpenGraph.
 *
 * Hardcoded fallback rather than a required env var: a sitemap that silently
 * emits `undefined/etaireies/123` is worse than one pinned to the real domain,
 * and this value changes roughly never.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://greekleads.gr'
).replace(/\/$/, '')
