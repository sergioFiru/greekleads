export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import TopNav from '@/components/TopNav'
import SearchPage from '@/components/SearchPage'
import { queryOne } from '@/lib/db'

export const metadata = {
  title: 'Αναζήτηση Εταιρειών — GreekLeads',
}

async function getTotalCompanies(): Promise<number> {
  try {
    const row = await queryOne<{ total: string }>('SELECT reltuples::bigint AS total FROM pg_class WHERE relname = \'companies\'')
    return parseInt(row?.total ?? '0', 10)
  } catch {
    return 0
  }
}

export default async function Search() {
  const total = await getTotalCompanies()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopNav totalCompanies={total} />
      <Suspense><SearchPage /></Suspense>
    </div>
  )
}
