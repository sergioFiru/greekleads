import { NextRequest, NextResponse } from 'next/server'
import { buildStatistics, type PeriodKey } from '@/lib/statistics'

// Thin wrapper. The computation lives in lib/statistics.ts so /statistika can
// server-render the first period by calling it directly instead of fetching
// this endpoint over HTTP — see the note there.
//
// This route still exists because the page's period switcher (7d/30d/90d/12m/
// all) fetches it on every change after hydration.
export const revalidate = 900

export async function GET(req: NextRequest) {
  const key = (req.nextUrl.searchParams.get('period') ?? '30d') as PeriodKey
  const result = await buildStatistics(key)
  const failed = !result.ready && 'error' in result && result.error
  return NextResponse.json(result, { status: failed ? 500 : 200 })
}
