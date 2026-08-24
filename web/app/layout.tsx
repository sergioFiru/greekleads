import type { Metadata } from 'next'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'

const clerkConfigured =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.includes('placeholder')

// Microsoft Clarity — session recordings and heatmaps.
// Gated on the env var so localhost and preview deploys never record into the
// production project: a handful of developer sessions is enough to skew rage-click
// and scroll-depth numbers on a site with low early traffic.
const clarityId = process.env.NEXT_PUBLIC_CLARITY_ID

export const metadata: Metadata = {
  title: 'GreekLeads — Greek Business Intelligence',
  description:
    'Search every active Greek company from the official ΓΕΜΗ registry. Filter by industry, location, legal type and export your leads.',
  openGraph: {
    title: 'GreekLeads',
    description: 'The Greek business registry, prospect-ready.',
    url: 'https://greekleads.gr',
    siteName: 'GreekLeads',
    locale: 'el_GR',
    type: 'website',
  },
}

async function MaybeClerk({ children }: { children: React.ReactNode }) {
  if (!clerkConfigured) return <>{children}</>
  const { ClerkProvider } = await import('@clerk/nextjs')
  return <ClerkProvider>{children}</ClerkProvider>
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="el">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        {clarityId && (
          // afterInteractive, not beforeInteractive: analytics must never sit on the
          // critical path of a page whose whole pitch is a fast search.
          <Script id="ms-clarity" strategy="afterInteractive">
            {`(function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "${clarityId}");`}
          </Script>
        )}
        <MaybeClerk>{children}</MaybeClerk>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
