'use client'

// ── PostHog ────────────────────────────────────────────────────────────
//
// Wired by hand rather than with @posthog/wizard: the wizard requires Node
// >=22.22.0 and this machine runs 22.16.0, and a system-wide Node upgrade is a
// bigger change than these forty lines.
//
// Gated on NEXT_PUBLIC_POSTHOG_KEY, exactly like Microsoft Clarity in
// layout.tsx: without the key this renders nothing and loads nothing, so
// localhost and preview deploys never record into the production project. A
// handful of developer sessions is enough to skew funnels on a site with low
// early traffic.
//
// ⚠️ TWO THINGS THAT WOULD BREAK SEO IF DONE NAIVELY
//
// 1. `useSearchParams()` in a client component forces the whole route to render
//    dynamically unless it sits inside <Suspense>. /statistika and /pricing are
//    statically prerendered (`○` in the build output) and must stay that way, so
//    the pageview tracker is isolated in its own Suspense boundary and NOT
//    merged into the provider.
// 2. The provider must not defer children, or the server-rendered HTML that
//    Googlebot reads would arrive empty. PHProvider renders children
//    synchronously, which is why it is safe to wrap the whole app in it.

import { Suspense, useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
// EU cloud by default: the company and its customers are in Greece, so keeping
// behavioural data inside the EU avoids a transfer question we have no reason to
// take on. Override only if the project genuinely lives on US cloud.
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com'

/** Manual pageviews, because the App Router fires no browser navigation. */
function PostHogPageview() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!KEY) return
    const qs = searchParams?.toString()
    posthog.capture('$pageview', {
      $current_url: window.location.origin + pathname + (qs ? `?${qs}` : ''),
    })
  }, [pathname, searchParams])

  return null
}

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!KEY) return
    posthog.init(KEY, {
      api_host: HOST,
      // We send $pageview ourselves above; the automatic one misses App Router
      // navigations and double-counts the first load.
      capture_pageview: false,
      capture_pageleave: true,
      // Only build a person profile once someone signs in. Anonymous visitors
      // still produce events but no profile — far less personal data held for
      // the ~99% of traffic that is a one-off organic visit.
      person_profiles: 'identified_only',

      // ── Session replay masking ──────────────────────────────────────
      // The usual replay privacy worry is the VISITOR's own data. Here the
      // sharper risk points the other way: the page text IS third-party
      // personal data. /etaireies/* and /people/* display real company
      // directors' names, emails and phone numbers. Those people never visited
      // the site and never consented, so a replay of one visitor browsing a
      // profile would ship another person's contact details to PostHog.
      //
      // PostHog masks <input> values by default but NOT rendered page text, so
      // the defaults are not enough here.
      //
      // Masked STRUCTURALLY by link type rather than by tagging each render
      // site: `mailto:`/`tel:` is how a contact detail is always marked up, so
      // this keeps working for code nobody has written yet. `.ph-no-capture` is
      // PostHog's own convention and is added by hand to the person-name
      // renders, which are plain text with no such structural signal.
      session_recording: {
        maskTextSelector: 'a[href^="mailto:"], a[href^="tel:"], .ph-no-capture',
        maskAllInputs: true,
      },
    })
  }, [])

  if (!KEY) return <>{children}</>

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageview />
      </Suspense>
      {children}
    </PHProvider>
  )
}
