import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { limitsFor } from '@/lib/entitlements'

// Ownership is always asserted in the SQL WHERE (user_id = $n), never by
// trusting an id from the request — a list id alone must not grant access.

export interface CrmMemberRow {
  ar_gemi: string
  co_name_el: string | null
  co_titles_el: string[] | null
  afm: string | null
  legal_type_descr: string | null
  status_descr: string | null
  is_branch: boolean | null
  year_founded: number | null
  prefecture_descr: string | null
  municipality_descr: string | null
  city: string | null
  address: string | null
  zip_code: string | null
  email: string | null
  phone: string | null
  fax: string | null
  url: string | null
  discovered_url: string | null
  linkedin_url: string | null
  instagram_url: string | null
  facebook_url: string | null
  twitter_url: string | null
  tiktok_url: string | null
  youtube_url: string | null
  primary_kad: string | null
  capital: Array<{ currency: string; capitalStock: number }> | null
  activities: Array<{ type: string; activity: { id: string; descr: string } }> | null
  has_favicon: boolean
  note: string | null
  stage: string
  last_contacted: string | null
  added_by: string
  added_at: string
}

// GET /api/crm/lists/[id] — the list plus its members.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const list = await queryOne(
      `SELECT id::text, name, description, is_live, live_brief, columns,
              created_at::text, updated_at::text
       FROM crm_lists WHERE id = $1::bigint AND user_id = $2`,
      [id, user.userId]
    )
    if (!list) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const members = await query<CrmMemberRow>(
      `SELECT
         lm.ar_gemi::text,
         c.co_name_el,
         c.co_titles_el,
         c.afm,
         c.legal_type_descr,
         c.status_descr,
         c.is_branch,
         EXTRACT(YEAR FROM c.incorporation_date)::int AS year_founded,
         c.prefecture_descr,
         c.municipality_descr,
         c.city,
         NULLIF(TRIM(CONCAT_WS(' ', c.street, c.street_number)), '') AS address,
         c.zip_code,
         NULLIF(c.email, '')          AS email,
         NULLIF(c.phone, '')          AS phone,
         NULLIF(c.fax,   '')          AS fax,
         NULLIF(c.url,   '')          AS url,
         NULLIF(c.discovered_url, '') AS discovered_url,
         c.linkedin_url, c.instagram_url, c.facebook_url,
         c.twitter_url, c.tiktok_url, c.youtube_url,
         c.primary_kad,
         c.capital,
         c.activities,
         (fv.ar_gemi IS NOT NULL)     AS has_favicon,
         lm.note,
         lm.stage,
         lm.last_contacted::text,
         lm.added_by,
         lm.added_at::text
       FROM crm_list_members lm
       -- LEFT JOIN, not INNER: a company disappearing from the registry must
       -- not silently drop the row the user saved.
       LEFT JOIN companies c ON c.ar_gemi = lm.ar_gemi
       LEFT JOIN company_favicons fv ON fv.ar_gemi = lm.ar_gemi AND fv.status = 'ok'
       WHERE lm.list_id = $1::bigint
       ORDER BY lm.added_at DESC`,
      [id]
    )

    return NextResponse.json({
      list,
      members,
      plan: user.plan,
      limits: {
        maxMembersPerList: limitsFor(user.plan).maxMembersPerList,
        canBringAlive:     limitsFor(user.plan).canBringAlive,
        maxExportRows:     limitsFor(user.plan).maxExportRows,
        canIntegrate:      limitsFor(user.plan).canIntegrate,
      },
    })
  } catch (err) {
    console.error('[/api/crm/lists/[id] GET]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// PATCH /api/crm/lists/[id] — rename, re-describe, or toggle live.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const body = await req.json()
    const sets: string[] = []
    const vals: unknown[] = []
    let i = 1

    if (typeof body.name === 'string') {
      const name = body.name.trim()
      if (!name) return NextResponse.json({ error: 'Δώστε όνομα λίστας.' }, { status: 400 })
      sets.push(`name = $${i++}`); vals.push(name.slice(0, 120))
    }
    if ('description' in body) {
      sets.push(`description = $${i++}`)
      vals.push(body.description ? String(body.description).slice(0, 500) : null)
    }
    if (typeof body.is_live === 'boolean') {
      // The toggle is disabled in the UI for v1, but if a request arrives
      // anyway it must still respect the plan rather than trust the client.
      if (body.is_live && !limitsFor(user.plan).canBringAlive) {
        return NextResponse.json({ error: 'plan', plan: user.plan }, { status: 403 })
      }
      sets.push(`is_live = $${i++}`); vals.push(body.is_live)
    }

    if (Array.isArray(body.columns)) {
      // Stored as given; resolveColumns() on read drops anything stale, so a
      // layout saved by an older build can never break the grid.
      sets.push(`columns = $${i++}`)
      vals.push(JSON.stringify(body.columns.map(String)))
    }

    if (!sets.length) return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 })

    sets.push(`updated_at = now()`)
    vals.push(id, user.userId)

    const updated = await queryOne<{ id: string }>(
      `UPDATE crm_lists SET ${sets.join(', ')}
       WHERE id = $${i++}::bigint AND user_id = $${i}
       RETURNING id::text`,
      vals
    )
    if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/crm/lists/[id] PATCH]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// DELETE /api/crm/lists/[id] — members go with it via ON DELETE CASCADE.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const gone = await queryOne<{ id: string }>(
      `DELETE FROM crm_lists WHERE id = $1::bigint AND user_id = $2 RETURNING id::text`,
      [id, user.userId]
    )
    if (!gone) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/crm/lists/[id] DELETE]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
