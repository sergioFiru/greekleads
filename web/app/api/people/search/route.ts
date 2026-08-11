import { NextRequest, NextResponse } from 'next/server'
import { query, queryWithTrigramThreshold } from '@/lib/db'

interface PersonResult {
  person_name: string
  company_count: number
  active_count: number
  primary_role: string | null
  primary_company: string | null
  companies: Array<{
    ar_gemi: string
    name: string
    status: string
    matched_email?: string | null
    matched_phone?: string | null
  }>
  prefectures: string[]
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q = (searchParams.get('q') ?? '').trim()
  const area = searchParams.get('area') ?? ''
  const status = searchParams.get('status') ?? ''
  const count = searchParams.get('count') ?? ''

  if (!q || q.length < 3) {
    return NextResponse.json({ results: [] })
  }

  // Same detection the client already uses to decide whether to uppercase — re-derived
  // here rather than trusted from the client, so the query route is self-contained.
  const isEmailOrPhone = q.includes('@') || /^[+\d][\d\s()+-]{4,}$/.test(q)

  const statusFilter =
    status === 'active' ? 'AND cp.dt_to IS NULL' :
    status === 'past'   ? 'AND cp.dt_to IS NOT NULL' : ''

  const countHaving =
    count === '1'   ? 'HAVING COUNT(DISTINCT matched.ar_gemi) = 1' :
    count === '2-3' ? 'HAVING COUNT(DISTINCT matched.ar_gemi) BETWEEN 2 AND 3' :
    count === '4+'  ? 'HAVING COUNT(DISTINCT matched.ar_gemi) >= 4' : ''

  try {
    const results = isEmailOrPhone
      ? await searchByContact(q, area, statusFilter, countHaving)
      : await searchByName(q, area, statusFilter, countHaving)

    return NextResponse.json({ results })
  } catch (err) {
    console.error('[/api/people/search]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── Name search ────────────────────────────────────────────────────────────
//
// Root cause of the old ~13s query: a single WHERE clause OR'd conditions across
// BOTH company_persons and companies at once, which meant Postgres could not use
// either table's index to narrow rows before the join — it had to sequential-scan
// and hash-join the full 2.1M / 1.7M row tables first, THEN filter.
//
// Fixed by: (1) never combining a person_name condition with an email/phone
// condition in one WHERE — this path only ever touches company_persons first;
// (2) matching multi-word names word-order-insensitively via per-word
// `ILIKE ... AND ILIKE ...` (same trick already used for company name search)
// instead of the `<%` word-similarity operator as a FILTER — `<%` alone matched
// 42k+ rows for a common surname before anything else even ran. word_similarity
// is still used, but only for ORDER BY ranking over the now-small matched set.
//
// Shared tail for both the primary and fallback name queries below — identical
// ranking/aggregation, only the `matched` CTE's WHERE differs between them.
function nameRankAndSelect(countHaving: string): string {
  return `
    ranked AS (
      SELECT person_name, MAX(sim) AS best_sim
      FROM matched
      GROUP BY person_name
      ${countHaving}
      ORDER BY best_sim DESC
      LIMIT 20
    )
    SELECT
      m.person_name,
      COUNT(DISTINCT m.ar_gemi)::int                                                    AS company_count,
      COUNT(DISTINCT m.ar_gemi) FILTER (WHERE m.dt_to IS NULL)::int                    AS active_count,
      (array_agg(m.role       ORDER BY (m.dt_to IS NULL) DESC, m.dt_from DESC NULLS LAST))[1] AS primary_role,
      (array_agg(m.co_name_el ORDER BY (m.dt_to IS NULL) DESC, m.dt_from DESC NULLS LAST))[1] AS primary_company,
      jsonb_agg(
        jsonb_build_object(
          'ar_gemi', m.ar_gemi, 'name', m.co_name_el, 'status', m.status_descr,
          'matched_email', m.matched_email, 'matched_phone', m.matched_phone
        )
        ORDER BY (m.dt_to IS NULL) DESC, m.dt_from DESC NULLS LAST
      )                                                                                  AS companies,
      array_agg(DISTINCT m.prefecture_descr) FILTER (WHERE m.prefecture_descr IS NOT NULL) AS prefectures
    FROM matched m
    JOIN ranked r ON r.person_name = m.person_name
    GROUP BY m.person_name, r.best_sim
    ORDER BY r.best_sim DESC
    LIMIT 20`
}

async function searchByName(rawQ: string, area: string, statusFilter: string, countHaving: string) {
  // Strip digits before matching: real names essentially never contain them
  // (checked: 680 of 2,086,348 person_names do, 0.03% — data-entry noise, not
  // real usage), but a query DOES often carry leftover digits — e.g. someone
  // pastes the local part of an email ("barnadavid98") without the "@domain"
  // that would have routed it to the email search path instead. Left in, those
  // digits pollute the trigram fuzzy fallback's similarity scoring enough to
  // rank unrelated "DAVID ..." names above the actual target, or push it out of
  // the top 20 entirely. Falls back to the raw query if stripping empties it
  // (e.g. someone genuinely searches a bare number).
  const stripped = rawQ.replace(/[0-9]/g, ' ').replace(/\s+/g, ' ').trim()
  const q = stripped.length >= 2 ? stripped : rawQ

  const words = q.split(/\s+/).filter(Boolean)
  const params: unknown[] = [q, ...words]
  const wordConds = words.map((_, i) => `cp.person_name ILIKE '%' || $${i + 2} || '%'`).join(' AND ')

  let areaJoin = ''
  if (area) {
    params.push(area)
    areaJoin = `AND c.prefecture_descr = $${params.length}`
  }

  // Carried through on EVERY tier below, not just the email/phone search path —
  // a name match can still coincidentally be "why" a company's contact info is
  // relevant (e.g. "barnadavid98" matches BARNA PAUL-DAVID by name here, but his
  // email is literally barnadavid98@gmail.com — without this the UI would show
  // no highlighted email for a match that's obviously email-shaped, only once
  // the user typed the full "@domain" to route to searchByContact instead).
  // Compared against rawQ (digits intact), not the digit-stripped `q` used for
  // name matching — an email's local part legitimately contains digits.
  params.push(rawQ)
  const rawQIdx = params.length

  const primary = await query<PersonResult>(
    `WITH matched AS (
      SELECT cp.id, cp.ar_gemi, cp.person_name, cp.role, cp.dt_from, cp.dt_to,
             c.co_name_el, c.status_descr, c.prefecture_descr,
             CASE WHEN c.email ILIKE '%' || $${rawQIdx} || '%' THEN c.email END AS matched_email,
             CASE WHEN c.phone ILIKE '%' || $${rawQIdx} || '%' THEN c.phone END AS matched_phone,
             word_similarity($1, cp.person_name) AS sim
      FROM company_persons cp
      JOIN companies c ON c.ar_gemi = cp.ar_gemi::bigint
      WHERE (${wordConds})
        ${statusFilter}
        ${areaJoin}
    ),
    ${nameRankAndSelect(countHaving)}`,
    params
  )
  if (primary.length > 0) return primary

  // Tier 2 — only for a single word with no internal space (e.g. "barnadavid"
  // typed for "BARNA PAUL-DAVID ΤΟΥ DORIN"). Try every plausible place the
  // missing space could be and require BOTH halves to be exact substrings —
  // same precise AND logic as the primary path, just guessing the split point.
  // This is why it beats plain fuzzy matching: every hit is a genuine substring
  // match, so nothing unrelated (e.g. some other "...DAVID..." name) can qualify
  // just because it shares characters — it has to actually contain "BARNA".
  if (words.length === 1 && q.length >= 6) {
    const word = words[0]
    const MIN_PART = 3
    const splitConds: string[] = []
    const splitParams: unknown[] = [q]
    for (let i = MIN_PART; i <= word.length - MIN_PART; i++) {
      const idx = splitParams.length + 1
      splitConds.push(`(cp.person_name ILIKE '%' || $${idx} || '%' AND cp.person_name ILIKE '%' || $${idx + 1} || '%')`)
      splitParams.push(word.slice(0, i), word.slice(i))
    }

    if (splitConds.length > 0) {
      let splitAreaJoin = ''
      if (area) {
        splitParams.push(area)
        splitAreaJoin = `AND c.prefecture_descr = $${splitParams.length}`
      }
      splitParams.push(rawQ)
      const splitRawQIdx = splitParams.length

      const split = await query<PersonResult>(
        `WITH matched AS (
          SELECT cp.id, cp.ar_gemi, cp.person_name, cp.role, cp.dt_from, cp.dt_to,
                 c.co_name_el, c.status_descr, c.prefecture_descr,
                 CASE WHEN c.email ILIKE '%' || $${splitRawQIdx} || '%' THEN c.email END AS matched_email,
                 CASE WHEN c.phone ILIKE '%' || $${splitRawQIdx} || '%' THEN c.phone END AS matched_phone,
                 word_similarity($1, cp.person_name) AS sim
          FROM company_persons cp
          JOIN companies c ON c.ar_gemi = cp.ar_gemi::bigint
          WHERE (${splitConds.join(' OR ')})
            ${statusFilter}
            ${splitAreaJoin}
        ),
        ${nameRankAndSelect(countHaving)}`,
        splitParams
      )
      if (split.length > 0) return split
    }
  }

  // Tier 3 (last resort) — only runs when nothing above found anything, so it
  // never costs anything on a normal successful search. Broadest and least
  // precise: genuine fuzzy/typo tolerance via a lowered pg_trgm threshold.
  // "BARNADAVID" vs. "BARNA PAUL-DAVID ΤΟΥ DORIN" scores only 0.45
  // word_similarity — below pg_trgm's default 0.6 cutoff — so it needs an
  // explicitly lowered threshold to match at all. Still index-accelerated
  // (queryWithTrigramThreshold uses the `<%` operator, not a raw
  // word_similarity() comparison — the latter can't use the trigram GIN index
  // and forced a 2.9s full table scan when tested).
  const fbParams: unknown[] = [q]
  let fbAreaJoin = ''
  if (area) {
    fbParams.push(area)
    fbAreaJoin = `AND c.prefecture_descr = $${fbParams.length}`
  }
  fbParams.push(rawQ)
  const fbRawQIdx = fbParams.length

  return queryWithTrigramThreshold<PersonResult>(
    `WITH matched AS (
      SELECT cp.id, cp.ar_gemi, cp.person_name, cp.role, cp.dt_from, cp.dt_to,
             c.co_name_el, c.status_descr, c.prefecture_descr,
             CASE WHEN c.email ILIKE '%' || $${fbRawQIdx} || '%' THEN c.email END AS matched_email,
             CASE WHEN c.phone ILIKE '%' || $${fbRawQIdx} || '%' THEN c.phone END AS matched_phone,
             word_similarity($1, cp.person_name) AS sim
      FROM company_persons cp
      JOIN companies c ON c.ar_gemi = cp.ar_gemi::bigint
      WHERE $1 <% cp.person_name
        ${statusFilter}
        ${fbAreaJoin}
    ),
    ${nameRankAndSelect(countHaving)}`,
    fbParams,
    0.4
  )
}

// ── Email / phone search ─────────────────────────────────────────────────────
//
// Same cross-table-OR problem as the name path, fixed the same way: find matching
// companies FIRST (companies.email / companies.phone are both trigram-indexed and
// this narrows to a handful of rows), then join OUT to company_persons.
//
// The join is written `cp.ar_gemi = mc.ar_gemi::text` — casting the SMALL matched-
// companies side, not company_persons. Casting the 2.1M-row side (as the old query
// did for the name path) forces a full scan; casting the small side lets Postgres
// use the existing plain btree index on company_persons.ar_gemi for a cheap nested
// loop instead (verified: 1.35s → 49ms).
async function searchByContact(q: string, area: string, statusFilter: string, countHaving: string) {
  const params: unknown[] = [q]
  let areaFilter = ''
  if (area) {
    params.push(area)
    areaFilter = `AND c.prefecture_descr = $${params.length}`
  }

  return query<PersonResult>(
    `WITH matched_companies AS (
      -- Carry through ONLY the field that actually matched (not both), so the
      -- UI can show *why* this company is in the results, not just that it is.
      SELECT c.ar_gemi, c.co_name_el, c.status_descr, c.prefecture_descr,
             (c.email ILIKE '%' || $1 || '%') AS matched_email,
             (c.phone ILIKE '%' || $1 || '%') AS matched_phone,
             c.email, c.phone
      FROM companies c
      WHERE (c.email ILIKE '%' || $1 || '%' OR c.phone ILIKE '%' || $1 || '%')
        ${areaFilter}
    ),
    matched AS (
      SELECT cp.ar_gemi, cp.person_name, cp.role, cp.dt_from, cp.dt_to,
             mc.co_name_el, mc.status_descr, mc.prefecture_descr,
             CASE WHEN mc.matched_email THEN mc.email ELSE NULL END AS matched_email,
             CASE WHEN mc.matched_phone THEN mc.phone ELSE NULL END AS matched_phone
      FROM matched_companies mc
      JOIN company_persons cp ON cp.ar_gemi = mc.ar_gemi::text
      WHERE 1=1 ${statusFilter}
    ),
    ranked AS (
      SELECT person_name, COUNT(DISTINCT ar_gemi) AS cnt
      FROM matched
      GROUP BY person_name
      ${countHaving}
      ORDER BY cnt DESC, person_name ASC
      LIMIT 20
    )
    SELECT
      m.person_name,
      COUNT(DISTINCT m.ar_gemi)::int                                                    AS company_count,
      COUNT(DISTINCT m.ar_gemi) FILTER (WHERE m.dt_to IS NULL)::int                    AS active_count,
      (array_agg(m.role       ORDER BY (m.dt_to IS NULL) DESC, m.dt_from DESC NULLS LAST))[1] AS primary_role,
      (array_agg(m.co_name_el ORDER BY (m.dt_to IS NULL) DESC, m.dt_from DESC NULLS LAST))[1] AS primary_company,
      jsonb_agg(
        jsonb_build_object(
          'ar_gemi', m.ar_gemi, 'name', m.co_name_el, 'status', m.status_descr,
          'matched_email', m.matched_email, 'matched_phone', m.matched_phone
        )
        ORDER BY (m.dt_to IS NULL) DESC, m.dt_from DESC NULLS LAST
      )                                                                                  AS companies,
      array_agg(DISTINCT m.prefecture_descr) FILTER (WHERE m.prefecture_descr IS NOT NULL) AS prefectures
    FROM matched m
    JOIN ranked r ON r.person_name = m.person_name
    GROUP BY m.person_name, r.cnt
    ORDER BY r.cnt DESC, m.person_name ASC
    LIMIT 20`,
    params
  )
}
