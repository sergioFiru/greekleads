import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import TopNav from '@/components/TopNav'
import CrmPage from '@/components/CrmPage'
import { getAuth } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Πελατολόγιο | GreekLeads',
  // Private, per-user data — never index it.
  robots: { index: false, follow: false },
}

export default async function CrmRoute() {
  const { isLoggedIn } = await getAuth()
  if (!isLoggedIn) redirect('/sign-in')

  // Lists are fetched client-side: this page changes on every add/remove, so
  // server-rendering the rows would only mean a refresh to see your own edits.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <TopNav />
      <CrmPage />
    </div>
  )
}
