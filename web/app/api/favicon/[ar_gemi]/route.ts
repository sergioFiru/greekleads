import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { query, queryOne } from '@/lib/db'
import { getR2Client, R2_BUCKET } from '@/lib/r2'

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

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

// Dev-only manual override: pick a favicon by pasting an image URL or
// uploading a file, bypassing the (often wrong) auto-scraped one. See
// FaviconPickerButton.tsx for the UI — this exists purely so the shared-domain
// favicon mess (see scripts/one_time/cleanup_shared_domain_favicons.py) can be
// fixed firm-by-firm by hand while curating, not as a production feature.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ar_gemi: string }> }
) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'dev only' }, { status: 404 })
  }
  const { ar_gemi } = await params

  const form = await req.formData()
  const file = form.get('file')
  const url = form.get('url')

  let bytes: Uint8Array
  let contentType: string
  let sourceUrl: string | null

  if (file instanceof File && file.size > 0) {
    bytes = new Uint8Array(await file.arrayBuffer())
    contentType = file.type || 'image/png'
    sourceUrl = `manual-upload:${file.name}`
  } else if (typeof url === 'string' && url.trim()) {
    let res: Response
    try {
      res = await fetch(url.trim())
    } catch {
      return NextResponse.json({ error: 'Η λήψη της εικόνας απέτυχε' }, { status: 400 })
    }
    if (!res.ok) {
      return NextResponse.json({ error: `Η λήψη απέτυχε (${res.status})` }, { status: 400 })
    }
    bytes = new Uint8Array(await res.arrayBuffer())
    contentType = res.headers.get('content-type')?.split(';')[0].trim() || 'image/png'
    sourceUrl = url.trim()
  } else {
    return NextResponse.json({ error: 'Δώστε URL ή αρχείο' }, { status: 400 })
  }

  if (bytes.length === 0) {
    return NextResponse.json({ error: 'Άδεια εικόνα' }, { status: 400 })
  }

  const ext = EXT_BY_CONTENT_TYPE[contentType] ?? 'png'
  const r2Key = `favicons/${ar_gemi}.${ext}`

  try {
    await getR2Client().send(
      new PutObjectCommand({ Bucket: R2_BUCKET, Key: r2Key, Body: bytes, ContentType: contentType })
    )
  } catch {
    return NextResponse.json({ error: 'Η αποθήκευση στο R2 απέτυχε' }, { status: 500 })
  }

  await query(
    `INSERT INTO company_favicons (ar_gemi, r2_key, content_type, source_url, status, error, fetched_at)
     VALUES ($1::bigint, $2, $3, $4, 'ok', NULL, now())
     ON CONFLICT (ar_gemi) DO UPDATE SET
       r2_key = EXCLUDED.r2_key, content_type = EXCLUDED.content_type,
       source_url = EXCLUDED.source_url, status = 'ok', error = NULL, fetched_at = now()`,
    [ar_gemi, r2Key, contentType, sourceUrl]
  )

  return NextResponse.json({ ok: true })
}
