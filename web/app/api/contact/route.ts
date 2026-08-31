import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAuth } from '@/lib/auth'

/**
 * POST /api/contact — pricing-page enquiries.
 *
 * Public (no auth): the whole point is that someone who hasn't signed up can
 * still ask to buy. Deliberately NOT in the Clerk middleware matcher, so an
 * anonymous POST never triggers a handshake — getAuth() degrades to anon on its
 * own and just records who they were if they happened to be signed in.
 *
 * Submissions are stored only; there is no email provider configured yet. Read
 * them with: python scripts/one_time/create_contact_table.py --inbox
 */

const MAX = { name: 120, email: 200, company: 200, phone: 60, message: 2000 }

function clean(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))

    // Honeypot: a real person never fills a field they cannot see. Answer 200
    // so a bot cannot tell it was rejected and retry with the field blank.
    if (typeof body.website === 'string' && body.website.trim()) {
      return NextResponse.json({ ok: true })
    }

    const name = clean(body.name, MAX.name)
    const email = clean(body.email, MAX.email)
    const phone = clean(body.phone, MAX.phone)
    // Phone is required server-side as well — the browser's `required` is
    // trivially bypassed, and a lead nobody can call is not a lead.
    // Digits only for the length check: +30, spaces, dashes and parens vary.
    const digits = (phone ?? '').replace(/\D/g, '')
    if (
      !name ||
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      digits.length < 8
    ) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 })
    }

    // Best-effort: records the user when signed in, anon otherwise.
    const { userId } = await getAuth().catch(() => ({ userId: null }))

    await query(
      `INSERT INTO contact_requests (name, email, company, phone, message, plan, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        name,
        email,
        clean(body.company, MAX.company),
        phone,
        clean(body.message, MAX.message),
        clean(body.plan, 40),
        userId,
      ]
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/contact]', err)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
