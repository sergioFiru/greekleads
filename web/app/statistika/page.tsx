import type { Metadata } from 'next'
import TopNav from '@/components/TopNav'
import Footer from '@/components/Footer'
import StatisticsPage from '@/components/StatisticsPage'

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

// Every page mounts its own TopNav -- there is no shared app layout.
export default function Page() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <TopNav />
      <StatisticsPage />
      <Footer />
    </div>
  )
}
