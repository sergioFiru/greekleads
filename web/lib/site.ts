/**
 * Canonical origin for anything that must emit an absolute URL — sitemaps,
 * robots.txt, JSON-LD, OpenGraph, canonical tags.
 *
 * MUST include `www`. Vercel 308-redirects the apex to www, so a non-www value
 * here makes every one of the ~80k sitemap <loc> entries redirect, and puts the
 * sitemap host at odds with the canonical tag — a split signal that stops a new
 * domain consolidating authority.
 *
 * Hardcoded fallback rather than a required env var: a sitemap that silently
 * emits `undefined/etaireies/123` is worse than one pinned to the real domain,
 * and this value changes roughly never.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || 'https://www.greekleads.gr'
).replace(/\/$/, '')
