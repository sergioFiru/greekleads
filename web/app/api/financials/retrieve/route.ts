import { NextRequest, NextResponse } from 'next/server'

// Proxies the company-page "Retrieve" button to the retrieve_svc Railway
// service. This route only ever kicks off a job (POST) or reads a job's
// current status (GET) — the actual extraction work (which can be a long
// chain of sequential OpenRouter calls, minutes for an outlier company like
// JUMBO's 78 documents) runs on Railway, not here, since this route runs as
// a Vercel serverless function with a hard execution timeout. Decided
// 2026-08-12: background-job + polling, not a synchronous blocking call.

function svcUrl() {
  const base = process.env.RETRIEVE_SVC_URL
  if (!base) throw new Error('RETRIEVE_SVC_URL not configured')
  return base.replace(/\/+$/, '')
}

export async function POST(req: NextRequest) {
  try {
    const { ar_gemi } = await req.json()
    if (!ar_gemi || !/^\d+$/.test(String(ar_gemi))) {
      return NextResponse.json({ error: 'ar_gemi required' }, { status: 400 })
    }

    const resp = await fetch(`${svcUrl()}/retrieve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ar_gemi: Number(ar_gemi) }),
    })

    if (!resp.ok) {
      const err = await resp.text()
      throw new Error(`retrieve_svc error ${resp.status}: ${err}`)
    }

    const data = await resp.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error('[/api/financials/retrieve POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const jobId = req.nextUrl.searchParams.get('job_id')
    if (!jobId) {
      return NextResponse.json({ error: 'job_id required' }, { status: 400 })
    }

    const resp = await fetch(`${svcUrl()}/retrieve/${encodeURIComponent(jobId)}`, {
      cache: 'no-store',
    })

    if (resp.status === 404) {
      return NextResponse.json({ error: 'job not found' }, { status: 404 })
    }
    if (!resp.ok) {
      const err = await resp.text()
      throw new Error(`retrieve_svc error ${resp.status}: ${err}`)
    }

    const data = await resp.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error('[/api/financials/retrieve GET]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
