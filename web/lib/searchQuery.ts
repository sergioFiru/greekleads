// Shared search predicate builder.
//
// Extracted verbatim from app/api/search/route.ts so the CRM "add all results"
// endpoint can insert straight from a filter set without paging the rows through
// the browser. Both callers MUST use the same builder — if they drift, a list
// built from "add all" would silently contain different companies than the
// search that produced it.
//
// Every value is a bound parameter ($1, $2, ...); nothing is interpolated.

export interface SearchFilters {
  name?: string
  statuses?: string[]
  prefectures?: string[]
  municipality?: string
  legal_types?: string[]
  activities?: string[]
  /**
   * NACE division prefixes ('56', '41', ...). Used by /statistika so a sector
   * bar links straight into the matching search — the whole chart-to-prospect
   * -list path depends on it.
   */
  kad_prefix?: string[]
  has_email?: boolean
  has_phone?: boolean
  has_website?: boolean
  has_no_website?: boolean
  has_instagram?: boolean
  has_facebook?: boolean
  has_linkedin?: boolean
  has_twitter?: boolean
  has_tiktok?: boolean
  has_youtube?: boolean
  year_from?: string
  year_to?: string
}


export function buildWhere(f: SearchFilters): { sql: string; params: unknown[] } {
  const conds: string[] = []
  const params: unknown[] = []
  let i = 1

  if (f.name?.trim()) {
    const name  = f.name.trim()
    const words = name.split(/\s+/).filter(Boolean)
    if (words.length > 1) {
      // All words must appear in co_name_el (any order), or exact phrase in other fields
      const wordConds = words.map(() => `c.co_name_el ILIKE $${i++}`).join(' AND ')
      words.forEach(w => params.push(`%${w}%`))
      const exactIdx = i++
      params.push(`%${name}%`)
      conds.push(`((${wordConds}) OR c.co_titles_el::text ILIKE $${exactIdx} OR c.email ILIKE $${exactIdx} OR c.phone ILIKE $${exactIdx} OR c.url ILIKE $${exactIdx} OR c.afm ILIKE $${exactIdx})`)
    } else {
      conds.push(`(c.co_name_el ILIKE $${i} OR c.co_titles_el::text ILIKE $${i} OR c.email ILIKE $${i} OR c.phone ILIKE $${i} OR c.url ILIKE $${i} OR c.afm ILIKE $${i})`)
      i++
      params.push(`%${name}%`)
    }
  }
  if (f.statuses?.length) {
    const ph = f.statuses.map(() => `$${i++}`).join(', ')
    conds.push(`c.status_descr IN (${ph})`)
    params.push(...f.statuses)
  }
  if (f.prefectures?.length) {
    const ph = f.prefectures.map(() => `$${i++}`).join(', ')
    conds.push(`c.prefecture_descr IN (${ph})`)
    params.push(...f.prefectures)
  }
  if (f.municipality?.trim()) {
    conds.push(`c.municipality_descr ILIKE $${i++}`)
    params.push(`%${f.municipality.trim()}%`)
  }
  if (f.legal_types?.length) {
    const ph = f.legal_types.map(() => `$${i++}`).join(', ')
    conds.push(`c.legal_type_descr IN (${ph})`)
    params.push(...f.legal_types)
  }
  if (f.activities?.length) {
    const ph = f.activities.map(() => `$${i++}`).join(', ')
    conds.push(`c.primary_kad IN (${ph})`)
    params.push(...f.activities)
  }
  if (f.kad_prefix?.length) {
    // Two-digit NACE divisions, matching how the /statistika rollup groups
    // sectors.
    //
    // This reads primary_kad_CODE, not primary_kad -- the latter holds the
    // Greek description ('ΛΙΑΝΙΚΟ ΕΜΠΟΡΙΟ...'), so LEFT(primary_kad,2) matches
    // nothing at all. The code column is denormalised out of the activities
    // JSONB by scripts/one_time/backfill_primary_kad_code.py and indexed on
    // LEFT(...,2); reading the JSONB directly here costs ~13s on a filtered
    // COUNT, over this endpoint's timeout.
    const clean = f.kad_prefix.filter(v => /^[0-9]{2}$/.test(v))
    if (clean.length) {
      conds.push(`LEFT(c.primary_kad_code, 2) = ANY($${i++}::text[])`)
      params.push(clean)
    }
  }
  if (f.has_email)      conds.push(`(c.email IS NOT NULL AND c.email != '')`)
  if (f.has_phone)      conds.push(`(c.phone IS NOT NULL AND c.phone != '')`)
  if (f.has_website)    conds.push(`(c.url IS NOT NULL AND c.url != '')`)
  if (f.has_no_website) conds.push(`(c.url IS NULL OR c.url = '')`)
  if (f.has_instagram)  conds.push(`c.instagram_url IS NOT NULL`)
  if (f.has_facebook)   conds.push(`c.facebook_url  IS NOT NULL`)
  if (f.has_linkedin)   conds.push(`c.linkedin_url  IS NOT NULL`)
  if (f.has_twitter)    conds.push(`c.twitter_url   IS NOT NULL`)
  if (f.has_tiktok)     conds.push(`c.tiktok_url    IS NOT NULL`)
  if (f.has_youtube)    conds.push(`c.youtube_url   IS NOT NULL`)
  if (f.year_from) {
    const yr = parseInt(f.year_from, 10)
    if (!isNaN(yr)) { conds.push(`EXTRACT(YEAR FROM c.incorporation_date) >= $${i++}`); params.push(yr) }
  }
  if (f.year_to) {
    const yr = parseInt(f.year_to, 10)
    if (!isNaN(yr)) { conds.push(`EXTRACT(YEAR FROM c.incorporation_date) <= $${i++}`); params.push(yr) }
  }

  return {
    sql: conds.length ? `WHERE ${conds.join(' AND ')}` : '',
    params,
  }
}

export function hasActiveFilter(f: SearchFilters): boolean {
  return !!(
    f.name?.trim() || f.municipality?.trim() ||
    f.has_email || f.has_phone || f.has_website || f.has_no_website ||
    f.has_instagram || f.has_facebook || f.has_linkedin || f.has_twitter || f.has_tiktok || f.has_youtube ||
    f.statuses?.length || f.prefectures?.length || f.legal_types?.length ||
    f.activities?.length || f.kad_prefix?.length || f.year_from || f.year_to
  )
}
