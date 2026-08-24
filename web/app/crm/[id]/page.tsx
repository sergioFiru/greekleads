import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import TopNav from '@/components/TopNav'
import CrmListDetail from '@/components/CrmListDetail'
import { getAuth } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Λίστα | GreekLeads',
  robots: { index: false, follow: false },
}

export default async function CrmListRoute({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { isLoggedIn } = await getAuth()
  if (!isLoggedIn) redirect('/sign-in')

  const { id } = await params

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <TopNav />
      <CrmListDetail listId={id} />
    </div>
  )
}
