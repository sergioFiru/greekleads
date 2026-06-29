import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

// Cache total count for 30s to avoid COUNT(*) on every poll
let cachedTotal = 0
let cacheExpiry = 0

export async function GET() {
  try {
    const now = Date.now()

    if (now > cacheExpiry) {
      const row = await queryOne<{ total: string }>('SELECT reltuples::bigint AS total FROM pg_class WHERE relname = \'companies\'')
      cachedTotal = parseInt(row?.total ?? '0', 10)
      cacheExpiry = now + 30_000
    }

    const [last24hRow, recent] = await Promise.all([
      queryOne<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM companies WHERE gemi_fetched_at > NOW() - INTERVAL '24 hours'`
      ),
      query<{
        ar_gemi: string
        co_name_el: string
        legal_type_descr: string
        prefecture_descr: string
        gemi_fetched_at: string
      }>(
        `SELECT ar_gemi, co_name_el, legal_type_descr, prefecture_descr, gemi_fetched_at
         FROM companies
         WHERE gemi_fetched_at IS NOT NULL
         ORDER BY gemi_fetched_at DESC
         LIMIT 20`
      ),
    ])

    return NextResponse.json({
      total: cachedTotal,
      last24h: parseInt(last24hRow?.cnt ?? '0', 10),
      recent,
    })
  } catch (err) {
    console.error('[/api/stream]', err)
    return NextResponse.json({ total: 0, last24h: 0, recent: [] }, { status: 200 })
  }
}
