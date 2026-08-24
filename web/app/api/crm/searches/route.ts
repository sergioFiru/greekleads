import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { limitsFor, isUnlimited } from '@/lib/entitlements'

export interface CrmSavedSearchRow {
  id: string
  name: string
  filters: Record<string, unknown>
  scout_brief: string | null
  created_at: string
}

// GET /api/crm/searches — the caller's saved filter sets.
export async function GET() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const rows = await query<CrmSavedSearchRow>(
      `SELECT id::text, name, filters, scout_brief, created_at::text
       FROM crm_saved_searches
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [user.userId]
    )
    return NextResponse.json({
      searches: rows,
      plan: user.plan,
      limit: limitsFor(user.plan).maxSavedSearches,
    })
  } catch (err) {
    console.error('[/api/crm/searches GET]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST /api/crm/searches — save the active filter set. Enforces maxSavedSearches.
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const name = String(body.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'Δώστε όνομα αναζήτησης.' }, { status: 400 })
    if (!body.filters) return NextResponse.json({ error: 'no_filters' }, { status: 400 })

    const limits = limitsFor(user.plan)
    if (!isUnlimited(limits.maxSavedSearches)) {
      const row = await queryOne<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM crm_saved_searches WHERE user_id = $1`,
        [user.userId]
      )
      if (parseInt(row?.cnt ?? '0', 10) >= limits.maxSavedSearches) {
        return NextResponse.json(
          { error: 'limit', limit: limits.maxSavedSearches, plan: user.plan },
          { status: 403 }
        )
      }
    }

    // Re-saving under an existing name updates it rather than 409-ing: renaming
    // is not what the user meant when they typed a name they already used.
    const saved = await queryOne<{ id: string }>(
      `INSERT INTO crm_saved_searches (user_id, name, filters, scout_brief)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, name)
       DO UPDATE SET filters = EXCLUDED.filters, scout_brief = EXCLUDED.scout_brief
       RETURNING id::text`,
      [
        user.userId,
        name.slice(0, 120),
        JSON.stringify(body.filters),
        body.brief ? String(body.brief).slice(0, 2000) : null,
      ]
    )
    return NextResponse.json({ id: saved?.id, name })
  } catch (err) {
    console.error('[/api/crm/searches POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
