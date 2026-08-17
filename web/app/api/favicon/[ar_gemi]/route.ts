import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { queryOne } from '@/lib/db'
import { getR2Client, R2_BUCKET } from '@/lib/r2'

// Server-side proxy for company favicons stored in R2 (see
// scripts/one_time/scrape_favicons.py). The R2 bucket also holds private
// financial documents, so it isn't public — this route streams just the
// one object a request asks for, using the existing private credentials.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ar_gemi: string }> }
) {
  const { ar_gemi } = await params

  const row = await queryOne<{ r2_key: string; content_type: string | null }>(
    `SELECT r2_key, content_type FROM company_favicons WHERE ar_gemi = $1::bigint AND status = 'ok'`,
    [ar_gemi]
  )
  if (!row?.r2_key) {
    return new NextResponse(null, { status: 404 })
  }

  try {
    const obj = await getR2Client().send(
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: row.r2_key })
    )
    const bytes = await obj.Body?.transformToByteArray()
    if (!bytes) return new NextResponse(null, { status: 404 })

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': row.content_type || 'image/x-icon',
        // Favicons are keyed by ar_gemi with content-addressed writes (the
        // scraper never revises an existing row without a fresh fetch), so
        // long-lived immutable caching is safe.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
