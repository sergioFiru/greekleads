import { NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'

export async function GET() {
  const row = await queryOne<{ total: string }>(
    'SELECT COUNT(*)::text AS total FROM companies'
  )
  return NextResponse.json({ companies: parseInt(row?.total ?? '0', 10) })
}
