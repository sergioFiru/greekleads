import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne, queryNoParallel } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { limitsFor, remainingCapacity } from '@/lib/entitlements'
import { buildWhere, hasActiveFilter, type SearchFilters } from '@/lib/searchQuery'

/** Confirms the list exists AND belongs to the caller, and reports its size. */
async function ownedList(id: string, userId: string) {
  return queryOne<{ id: string; member_count: string }>(
    `SELECT l.id::text,
            (SELECT COUNT(*) FROM crm_list_members m WHERE m.list_id = l.id) AS member_count
     FROM crm_lists l
     WHERE l.id = $1::bigint AND l.user_id = $2`,
    [id, userId]
  )
}

/**
 * POST /api/crm/lists/[id]/members
 *
 * Two modes:
 *   { ar_gemis: string[] }        — add specific companies (the selection)
 *   { filters: SearchFilters }    — add every company matching a search
 *
 * The filters mode never sends company rows to the browser: it inserts straight
 * from a SELECT, using the same buildWhere() the search endpoint uses, so a list
 * built this way contains exactly what the search showed.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const list = await ownedList(id, user.userId)
    if (!list) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const current = parseInt(list.member_count, 10)
    const limits  = limitsFor(user.plan)
    const room    = Math.min(remainingCapacity(user.plan, current), limits.maxBulkAdd)

    if (room <= 0) {
      return NextResponse.json(
        { error: 'limit', limit: limits.maxMembersPerList, current, plan: user.plan },
        { status: 403 }
      )
    }

    const body = await req.json()

    // ── Mode A: an explicit set of companies ──────────────────────
    if (Array.isArray(body.ar_gemis)) {
      const ids = body.ar_gemis
        .map((v: unknown) => String(v).trim())
        .filter((v: string) => /^\d+$/.test(v))     // bigint column: digits only
      if (!ids.length) return NextResponse.json({ error: 'no_companies' }, { status: 400 })

      const truncated = ids.length > room
      const slice     = ids.slice(0, room)

      const inserted = await query<{ ar_gemi: string }>(
        `INSERT INTO crm_list_members (list_id, ar_gemi, added_by)
         SELECT $1::bigint, x::bigint, 'user' FROM unnest($2::text[]) AS x
         ON CONFLICT (list_id, ar_gemi) DO NOTHING
         RETURNING ar_gemi::text`,
        [id, slice]
      )

      await query(`UPDATE crm_lists SET updated_at = now() WHERE id = $1::bigint`, [id])
      return NextResponse.json({
        added: inserted.length,
        requested: ids.length,
        // Duplicates are not an error — re-adding an overlapping search result
        // is normal — but the UI says so rather than implying everything landed.
        skipped: slice.length - inserted.length,
        truncated,
        room,
      })
    }

    // ── Mode B: everything matching a filter set ──────────────────
    if (body.filters) {
      const filters = body.filters as SearchFilters
      if (!hasActiveFilter(filters)) {
        return NextResponse.json({ error: 'no_filters' }, { status: 400 })
      }

      // Rows the user unticked after choosing "select all N matching".
      const excluded: string[] = (Array.isArray(body.excluded) ? body.excluded : [])
        .map((v: unknown) => String(v).trim())
        .filter((v: string) => /^\d+$/.test(v))

      const { sql: where, params: whereParams } = buildWhere(filters)
      // buildWhere numbers its placeholders from $1, so ours have to come after.
      const listIdx = whereParams.length + 1
      const exclIdx = whereParams.length + 2
      const limIdx  = whereParams.length + 3

      // Same filter predicate as /api/search, so the same parallel-bitmap
      // /dev/shm failure applies — and a bulk insert needs a longer timeout.
      const inserted = await queryNoParallel<{ ar_gemi: string }>(
        // The LIMIT lives in a subquery so it unambiguously bounds the SELECT
        // rather than sitting next to ON CONFLICT.
        // Note: ON CONFLICT DO NOTHING means companies already in the list still
        // consume the limit, so a re-run over an overlapping segment can add
        // fewer than `room` rows. The response reports what actually landed.
        `INSERT INTO crm_list_members (list_id, ar_gemi, added_by)
         SELECT $${listIdx}::bigint, s.ar_gemi, 'user'
         FROM (
           SELECT c.ar_gemi
           FROM companies c
           ${where ? `${where} AND` : 'WHERE'} NOT (c.ar_gemi = ANY($${exclIdx}::bigint[]))
           ORDER BY c.ar_gemi
           LIMIT $${limIdx}
         ) s
         ON CONFLICT (list_id, ar_gemi) DO NOTHING
         RETURNING ar_gemi::text`,
        [...whereParams, id, excluded, room],
        60_000
      )

      await query(`UPDATE crm_lists SET updated_at = now() WHERE id = $1::bigint`, [id])
      return NextResponse.json({ added: inserted.length, room, mode: 'filters' })
    }

    return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  } catch (err) {
    console.error('[/api/crm/lists/[id]/members POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// PATCH — update note / stage / last_contacted on one member, or set the stage
// on many at once (the grid's bulk action).
const VALID_STAGES = new Set(['new', 'contacted', 'proposal', 'customer', 'lost'])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const body = await req.json()

    // Accept one id or many, so the single-cell edit and the bulk stage change
    // are the same code path.
    const targets = (Array.isArray(body.ar_gemis) ? body.ar_gemis : [body.ar_gemi])
      .map((v: unknown) => String(v ?? '').trim())
      .filter((v: string) => /^\d+$/.test(v))
    if (!targets.length) return NextResponse.json({ error: 'bad_ar_gemi' }, { status: 400 })

    const sets: string[] = []
    const vals: unknown[] = []
    let i = 1

    if ('note' in body) {
      sets.push(`note = $${i++}`)
      vals.push(body.note ? String(body.note).slice(0, 2000) : null)
    }
    if ('stage' in body) {
      const stage = String(body.stage)
      // The DB has a CHECK constraint too; this just returns a clean 400
      // instead of a 500 from a constraint violation.
      if (!VALID_STAGES.has(stage)) {
        return NextResponse.json({ error: 'bad_stage' }, { status: 400 })
      }
      sets.push(`stage = $${i++}`)
      vals.push(stage)
    }
    if ('last_contacted' in body) {
      sets.push(`last_contacted = $${i++}::date`)
      vals.push(body.last_contacted || null)
    }

    if (!sets.length) return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 })

    vals.push(id, user.userId, targets)

    const updated = await query<{ ar_gemi: string }>(
      `UPDATE crm_list_members lm SET ${sets.join(', ')}
       FROM crm_lists l
       WHERE lm.list_id = l.id
         AND l.id = $${i++}::bigint
         AND l.user_id = $${i++}
         AND lm.ar_gemi = ANY($${i}::bigint[])
       RETURNING lm.ar_gemi::text`,
      vals
    )
    if (!updated.length) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    await query(`UPDATE crm_lists SET updated_at = now() WHERE id = $1::bigint`, [id])
    return NextResponse.json({ updated: updated.length })
  } catch (err) {
    console.error('[/api/crm/lists/[id]/members PATCH]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// DELETE — remove one or more companies from the list.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const body = await req.json()
    const ids = (Array.isArray(body.ar_gemis) ? body.ar_gemis : [body.ar_gemi])
      .map((v: unknown) => String(v ?? '').trim())
      .filter((v: string) => /^\d+$/.test(v))
    if (!ids.length) return NextResponse.json({ error: 'no_companies' }, { status: 400 })

    const removed = await query<{ ar_gemi: string }>(
      `DELETE FROM crm_list_members lm
       USING crm_lists l
       WHERE lm.list_id = l.id
         AND l.id = $1::bigint
         AND l.user_id = $2
         AND lm.ar_gemi = ANY($3::bigint[])
       RETURNING lm.ar_gemi::text`,
      [id, user.userId, ids]
    )

    await query(`UPDATE crm_lists SET updated_at = now() WHERE id = $1::bigint`, [id])
    return NextResponse.json({ removed: removed.length })
  } catch (err) {
    console.error('[/api/crm/lists/[id]/members DELETE]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
