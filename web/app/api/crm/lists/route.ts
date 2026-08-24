import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { limitsFor, isUnlimited } from '@/lib/entitlements'

export interface CrmListRow {
  id: string
  name: string
  description: string | null
  is_live: boolean
  member_count: number
  with_email: number
  with_phone: number
  /** Stage key -> count, for the pipeline bar on the index. */
  stages: Record<string, number>
  updated_at: string
}

// GET /api/crm/lists — every list the caller owns, with headline counts.
export async function GET() {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const rows = await query<CrmListRow>(
      `SELECT
         l.id::text,
         l.name,
         l.description,
         l.is_live,
         COALESCE(m.member_count, 0)::int AS member_count,
         COALESCE(m.with_email,   0)::int AS with_email,
         COALESCE(m.with_phone,   0)::int AS with_phone,
         COALESCE(
           -- Counts per stage, grouped properly. Doing this inside the LATERAL
           -- above would aggregate one row per member, not per stage.
           (SELECT jsonb_object_agg(t.stage, t.n)
            FROM (SELECT stage, COUNT(*) AS n
                  FROM crm_list_members
                  WHERE list_id = l.id
                  GROUP BY stage) t),
           '{}'::jsonb
         ) AS stages,
         l.updated_at::text
       FROM crm_lists l
       LEFT JOIN LATERAL (
         -- Counted in one pass per list rather than two correlated subqueries.
         SELECT COUNT(*) AS member_count,
                COUNT(*) FILTER (WHERE c.email IS NOT NULL AND c.email <> '') AS with_email,
                COUNT(*) FILTER (WHERE c.phone IS NOT NULL AND c.phone <> '') AS with_phone
         FROM crm_list_members lm
         LEFT JOIN companies c ON c.ar_gemi = lm.ar_gemi
         WHERE lm.list_id = l.id
       ) m ON true
       WHERE l.user_id = $1
       ORDER BY l.updated_at DESC`,
      [user.userId]
    )
    return NextResponse.json({ lists: rows, plan: user.plan })
  } catch (err) {
    console.error('[/api/crm/lists GET]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// POST /api/crm/lists — create a list. Enforces maxLists.
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const name = String(body.name ?? '').trim()
    if (!name) {
      return NextResponse.json({ error: 'Δώστε όνομα λίστας.' }, { status: 400 })
    }
    if (name.length > 120) {
      return NextResponse.json({ error: 'Το όνομα είναι πολύ μεγάλο.' }, { status: 400 })
    }

    // The dialog also greys out "create" at the cap, but that is cosmetic —
    // this is the check that actually holds.
    const limits = limitsFor(user.plan)
    if (!isUnlimited(limits.maxLists)) {
      const row = await queryOne<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM crm_lists WHERE user_id = $1`,
        [user.userId]
      )
      if (parseInt(row?.cnt ?? '0', 10) >= limits.maxLists) {
        return NextResponse.json(
          { error: 'limit', limit: limits.maxLists, plan: user.plan },
          { status: 403 }
        )
      }
    }

    const created = await queryOne<{ id: string }>(
      `INSERT INTO crm_lists (user_id, name, description, is_live, live_filters, live_brief)
       VALUES ($1, $2, $3, false, $4, $5)
       ON CONFLICT (user_id, name) DO NOTHING
       RETURNING id::text`,
      [
        user.userId,
        name,
        body.description ? String(body.description).slice(0, 500) : null,
        // "Bring it Alive" is inert in v1: the recipe is stored so lists made
        // today work the moment the matcher ships, but is_live stays false.
        body.filters ? JSON.stringify(body.filters) : null,
        body.brief ? String(body.brief).slice(0, 2000) : null,
      ]
    )

    if (!created) {
      return NextResponse.json({ error: 'Υπάρχει ήδη λίστα με αυτό το όνομα.' }, { status: 409 })
    }
    return NextResponse.json({ id: created.id, name })
  } catch (err) {
    console.error('[/api/crm/lists POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
