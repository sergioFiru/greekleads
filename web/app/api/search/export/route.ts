import { NextRequest, NextResponse } from 'next/server'
import { queryNoParallel } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { limitsFor } from '@/lib/entitlements'
import { buildWhere, hasActiveFilter, type SearchFilters } from '@/lib/searchQuery'

/**
 * POST /api/search/export
 *
 * "Select all N matching" export. The browser never holds the rows — it holds a
 * flag plus the filters — so the CSV is built here, straight from the same
 * buildWhere() the search uses. If the two ever drifted, the export would
 * contain different companies than the search that produced it.
 *
 * Body: { filters: SearchFilters, excluded?: string[] }
 *   excluded = rows the user unticked after hitting "select all".
 *
 * Capped by entitlements.maxBulkAdd — the same ceiling that governs bulk list
 * adds — because an unbounded SELECT over a 1.6M-row table is both slow and a
 * file nothing can open.
 */
export async function POST(req: NextRequest) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const limits = limitsFor(user.plan)
  if (!limits.canExportCsv) {
    return NextResponse.json({ error: 'not_entitled', plan: user.plan }, { status: 403 })
  }

  try {
    const body = await req.json()
    const filters: SearchFilters = body.filters ?? {}
    if (!hasActiveFilter(filters)) {
      return NextResponse.json({ error: 'no_filters' }, { status: 400 })
    }

    // bigint column: digits only, so an unticked id can never reach the query
    // as anything but a number.
    const excluded: string[] = (Array.isArray(body.excluded) ? body.excluded : [])
      .map((v: unknown) => String(v).trim())
      .filter((v: string) => /^\d+$/.test(v))

    const { sql: where, params } = buildWhere(filters)
    // buildWhere numbers its placeholders from $1, so ours come after.
    const exclIdx = params.length + 1
    const limIdx  = params.length + 2

    // The bulk cap is a real number on every plan (never Infinity) — see the
    // maxBulkAdd note in entitlements.ts.
    const cap = limits.maxBulkAdd

    const rows = await queryNoParallel<{
      ar_gemi: string
      co_name_el: string
      legal_type_descr: string | null
      prefecture_descr: string | null
      municipality_descr: string | null
      status_descr: string | null
      year_founded: number | null
      email: string | null
      phone: string | null
      url: string | null
    }>(
      `SELECT
         c.ar_gemi::text,
         c.co_name_el,
         c.legal_type_descr,
         c.prefecture_descr,
         c.municipality_descr,
         c.status_descr,
         EXTRACT(YEAR FROM c.incorporation_date)::int AS year_founded,
         NULLIF(c.email, '') AS email,
         NULLIF(c.phone, '') AS phone,
         COALESCE(NULLIF(c.url, ''), NULLIF(c.discovered_url, '')) AS url
       FROM companies c
       ${where ? `${where} AND` : 'WHERE'} NOT (c.ar_gemi = ANY($${exclIdx}::bigint[]))
       ORDER BY c.ar_gemi
       LIMIT $${limIdx}`,
      [...params, excluded, cap],
      60_000
    )

    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = [
      ['ΑΡΓΕΜΗ','Επωνυμία','Νομική Μορφή','Νομός','Δήμος','Κατάσταση','Έτος','Email','Τηλέφωνο','Website'].join(','),
      ...rows.map(r => [
        r.ar_gemi,
        esc(r.co_name_el),
        esc(r.legal_type_descr),
        esc(r.prefecture_descr),
        esc(r.municipality_descr),
        esc(r.status_descr),
        r.year_founded ?? '',
        r.email ?? '',
        r.phone ?? '',
        r.url ?? '',
      ].join(',')),
    ].join('\n')

    // BOM so Excel on a Greek Windows opens it as UTF-8 rather than cp1253.
    return new NextResponse('﻿' + csv, {
      headers: {
        'Content-Type': 'text/csv;charset=utf-8',
        'Content-Disposition': 'attachment; filename="greekleads-export.csv"',
        // Lets the client tell "capped" from "that was all of them".
        'X-Row-Count': String(rows.length),
        'X-Row-Cap': String(cap),
      },
    })
  } catch (err) {
    console.error('[/api/search/export]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
