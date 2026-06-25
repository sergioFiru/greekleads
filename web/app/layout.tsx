import type { Metadata } from 'next'
import './globals.css'

const clerkConfigured =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
  !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.includes('placeholder')

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
        <MaybeClerk>{children}</MaybeClerk>
      </body>
    </html>
  )
}
