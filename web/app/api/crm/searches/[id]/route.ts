import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { requireUser } from '@/lib/auth'

// DELETE /api/crm/searches/[id] — ownership asserted in the WHERE clause.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await params

  try {
    const gone = await queryOne<{ id: string }>(
      `DELETE FROM crm_saved_searches
       WHERE id = $1::bigint AND user_id = $2
       RETURNING id::text`,
      [id, user.userId]
    )
    if (!gone) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/crm/searches/[id] DELETE]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
