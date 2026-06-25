import { NextResponse } from 'next/server'
import filtersData from '@/lib/filters.json'

// Static filter data bundled with the app.
// To update: regenerate web/lib/filters.json and redeploy.
export async function GET() {
  return NextResponse.json(filtersData)
}
