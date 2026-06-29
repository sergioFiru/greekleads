export const dynamic = 'force-dynamic'

import TopNav from '@/components/TopNav'
import PeopleSearch from '@/components/PeopleSearch'
import { query } from '@/lib/db'

export const metadata = {
  title: 'Αναζήτηση Προσώπων — GreekLeads',
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

export default async function PeoplePage() {
  const areas = await getAreas()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopNav />
      <PeopleSearch areas={areas} />
    </div>
  )
}
