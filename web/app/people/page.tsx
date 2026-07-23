export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import TopNav from '@/components/TopNav'
import PeopleSearch from '@/components/PeopleSearch'
import { query, queryOne } from '@/lib/db'

export const metadata = {
  title: 'Αναζήτηση Στελεχών — GreekLeads',
}

async function getAreas(): Promise<string[]> {
  try {
    const rows = await query<{ prefecture_descr: string }>(
      `SELECT prefecture_descr
       FROM companies
       WHERE prefecture_descr IS NOT NULL AND prefecture_descr != ''
       GROUP BY prefecture_descr
       ORDER BY COUNT(*) DESC
       LIMIT 20`
    )
    return rows.map(r => r.prefecture_descr)
  } catch {
    return []
  }
}

async function getTotalCompanies(): Promise<number> {
  try {
    const row = await queryOne<{ total: string }>('SELECT COUNT(*)::text AS total FROM companies')
    return parseInt(row?.total ?? '0', 10)
  } catch {
    return 0
  }
}

export default async function PeoplePage() {
  const [areas, total] = await Promise.all([getAreas(), getTotalCompanies()])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopNav totalCompanies={total} />
      <Suspense><PeopleSearch areas={areas} totalCompanies={total} /></Suspense>
    </div>
  )
}
