import type { Metadata } from 'next'
import TopNav from '@/components/TopNav'
import Footer from '@/components/Footer'
import StatisticsPage from '@/components/StatisticsPage'
import { buildStatistics } from '@/lib/statistics'

// This page is a top-of-funnel SEO asset: "πόσες επιχειρήσεις ιδρύθηκαν στην
// Ελλάδα" and "νέες επιχειρήσεις [νομός]" are recurring Greek searches with no
// good source. Fully public, no gate.
export const metadata: Metadata = {
  title: 'Νέες επιχειρήσεις στην Ελλάδα — Στατιστικά ΓΕΜΗ | GreekLeads',
  description:
    'Πόσες νέες επιχειρήσεις ιδρύονται στην Ελλάδα, σε ποιους κλάδους και σε ποιους νομούς. Ζωντανή ροή νέων καταχωρίσεων και ιστορικά στοιχεία από το ΓΕΜΗ.',
  alternates: { canonical: '/statistika' },
  openGraph: {
    title: 'Νέες επιχειρήσεις στην Ελλάδα — Στατιστικά ΓΕΜΗ',
    description:
      'Ιδρύσεις ανά μήνα, κλάδο και νομό, με ζωντανή ροή νέων καταχωρίσεων.',
    type: 'website',
  },
}

/**
 * Rebuilt hourly rather than per request.
 *
 * The underlying rollup is refreshed by a nightly bot, so a page regenerated
 * every hour is never meaningfully stale, and ISR keeps this a static document
 * that Googlebot gets instantly instead of a DB query on every crawl.
 */
export const revalidate = 3600

// '12m' must match StatisticsPage's own default period, or the component would
// immediately refetch and the server work would be wasted.
const INITIAL_PERIOD = '12m'

// Every page mounts its own TopNav -- there is no shared app layout.
export default async function Page() {
  // Computed on the server so the FIRST paint carries the numbers. Search
  // Console reported this page as "indexed without content" precisely because
  // it used to ship em-dashes and fetch the real values after hydration.
  // A failure here must not blank the page: the component falls back to
  // fetching client-side exactly as it did before.
  let initial = null
  try {
    const result = await buildStatistics(INITIAL_PERIOD)
    if (result.ready) initial = result as never
  } catch (err) {
    console.error('[/statistika] server-side stats failed, falling back to client fetch', err)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <TopNav />
      <StatisticsPage initial={initial} initialPeriod={INITIAL_PERIOD} />
      <Footer />
    </div>
  )
}
