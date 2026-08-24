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

// Hero headline figure only. Deliberately an estimate: an exact
// COUNT(*) on company_persons takes ~0.9s and COUNT(DISTINCT person_name) ~5s,
// far too slow to sit on a page load, while pg's own reltuples statistic lands
// within ~0.2% instantly. Rendered rounded to one decimal ("2,1 εκατ.") so the
// displayed value never implies more precision than it has.
async function getTotalPersonRoles(): Promise<number> {
  try {
    const row = await queryOne<{ n: string }>(
      `SELECT reltuples::bigint::text AS n FROM pg_class WHERE relname = 'company_persons'`
    )
    return parseInt(row?.n ?? '0', 10)
  } catch {
    return 0
  }
}

export default async function PeoplePage() {
  const [areas, total, personRoles] = await Promise.all([
    getAreas(),
    getTotalCompanies(),
    getTotalPersonRoles(),
  ])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopNav totalCompanies={total} />
      <Suspense>
        <PeopleSearch areas={areas} totalCompanies={total} totalPersonRoles={personRoles} />
      </Suspense>
    </div>
  )
}
