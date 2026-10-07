// The three web/lib imports below are RELATIVE on purpose, not aliased.
// tsx resolves tsconfig `paths` from the CURRENT WORKING DIRECTORY, so an
// @/lib alias works when launched from mcp/ and fails with
// "Cannot find package '@/lib'" when Claude Desktop launches the server from
// somewhere else. A relative specifier has no such dependency.
import { z } from 'zod'
import { query, queryOne } from './db.js'
import { buildWhere, type SearchFilters } from '../../web/lib/searchQuery.js'
import { sectionOfKad, sectionLabel } from '../../web/lib/nace.js'
import { cleanCompanyRow } from '../../web/lib/registryText.js'
import { FULL_CONTEXT, DATASET_OVERVIEW, CRITICAL_CAVEATS, FIELD_GUIDE } from './context.js'

// ── Tool definitions ───────────────────────────────────────────────────
//
// Descriptions are written FOR A MODEL, not for a docs page: they say what the
// tool returns, what it will not do, and which caveat bites if the caller gets
// it wrong. A tool description is the only thing standing between a model and
// a confidently wrong answer about 1,69M companies.

export interface Tool {
  name: string
  description: string
  schema: z.ZodTypeAny
  run: (args: never) => Promise<unknown>
}

const MAX_ROWS = 50

// ── describe_dataset ───────────────────────────────────────────────────

const describeDataset: Tool = {
  name: 'describe_dataset',
  description:
    'Explain what the GreekLeads/ΓΕΜΗ dataset contains, its scale, its field ' +
    'semantics and the ten ways it will produce a wrong answer if misread. ' +
    'CALL THIS FIRST in any session that will interpret or present results — ' +
    'several fields do not mean what their names suggest (municipality_descr ' +
    'holds two fields, prefecture_descr is unaccented, "Inadequate Info" is a ' +
    'real value rather than null, and a third of "active" companies never ' +
    'traded). Takes no arguments and does not hit the database.',
  schema: z.object({
    section: z
      .enum(['all', 'overview', 'caveats', 'fields'])
      .default('all')
      .describe('Which part to return. "all" is the default and is short enough to read fully.'),
  }),
  run: async ({ section }: { section: 'all' | 'overview' | 'caveats' | 'fields' }) => ({
    all: FULL_CONTEXT,
    overview: DATASET_OVERVIEW,
    caveats: CRITICAL_CAVEATS,
    fields: FIELD_GUIDE,
  }[section]),
}

// ── search_companies ───────────────────────────────────────────────────

const searchCompanies: Tool = {
  name: 'search_companies',
  description:
    'Find Greek companies by any combination of name, region, legal form, ' +
    'ΚΑΔ activity, founding year and contactability. Returns at most ' +
    `${MAX_ROWS} companies plus the TOTAL number matching, so you can report a ` +
    'market size honestly without paging. ' +
    'Defaults to active companies and EXCLUDES the 11.141 registered-but-never-' +
    'traded shells (ΚΑΔ division 00) — pass include_dormant to get them. ' +
    'Region values are UPPERCASE AND UNACCENTED (ΑΧΑΙΑΣ, not ΑΧΑΪΑΣ) and legal ' +
    'forms are short codes (ΑΕ, ΙΚΕ, ΟΕ, ΕΕ, ΕΠΕ, ΑΤΟΜΙΚΗ). If a filter ' +
    'returns nothing, suspect an accent or a legal-type code before concluding ' +
    'the companies do not exist.',
  schema: z.object({
    name: z.string().optional().describe('Company name, ΑΦΜ or ΓΕΜΗ number. Partial names match.'),
    prefectures: z.array(z.string()).optional()
      .describe('Νομός names, UPPERCASE UNACCENTED, e.g. ["ΑΤΤΙΚΗΣ","ΘΕΣΣΑΛΟΝΙΚΗΣ"].'),
    municipality: z.string().optional()
      .describe('Matches inside the combined "ΔΗΜΟΣ / ΝΟΜΟΣ" string.'),
    legal_types: z.array(z.string()).optional()
      .describe('Short codes only: ΑΕ, ΙΚΕ, ΟΕ, ΕΕ, ΕΠΕ, ΑΤΟΜΙΚΗ.'),
    statuses: z.array(z.string()).optional()
      .describe('Defaults to ["Ενεργή"] (active). Pass others to widen.'),
    activities: z.array(z.string()).optional()
      .describe('ΚΑΔ activity descriptions in Greek, matched as text.'),
    kad_prefix: z.array(z.string()).optional()
      .describe('Two-digit ΚΑΔ divisions, e.g. ["56","55"] for food service and accommodation.'),
    year_from: z.string().optional().describe('Earliest founding year, e.g. "2020".'),
    year_to: z.string().optional().describe('Latest founding year.'),
    has_email: z.boolean().optional().describe('Only companies with an email on file.'),
    has_phone: z.boolean().optional(),
    has_website: z.boolean().optional(),
    has_no_website: z.boolean().optional().describe('Inverse — useful for finding firms to sell a website to.'),
    include_dormant: z.boolean().optional()
      .describe('Include ΚΑΔ division 00 «ΕΛΛΕΙΨΗ ΔΡΑΣΤΗΡΙΟΤΗΤΑΣ» shells. Off by default.'),
    limit: z.number().int().min(1).max(MAX_ROWS).default(20),
  }),
  run: async (args: Record<string, unknown>) => {
    const { limit = 20, ...rest } = args as { limit?: number } & Record<string, unknown>
    const filters: SearchFilters = {
      statuses: ['Ενεργή'],
      ...(rest as SearchFilters),
    }
    const { sql: where, params } = buildWhere(filters)

    const rows = await query<Record<string, unknown>>(
      `SELECT c.ar_gemi::text, c.afm, c.co_name_el, c.co_titles_el,
              c.legal_type_descr, c.status_descr,
              c.prefecture_descr, c.municipality_descr, c.city,
              EXTRACT(YEAR FROM c.incorporation_date)::int AS year_founded,
              c.primary_kad_code, c.primary_kad,
              c.email, c.phone, c.url, c.discovered_url
         FROM companies c
         ${where}
        ORDER BY c.ar_gemi
        LIMIT ${Math.min(limit, MAX_ROWS)}`,
      params,
    )

    // The count is the point: a model asked "how many X are there" must not
    // answer from the length of a truncated page.
    const totalRow = await queryOne<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM companies c ${where}`,
      params,
      25_000,
    )
    const total = parseInt(totalRow?.n ?? '0', 10)

    return {
      total_matching: total,
      returned: rows.length,
      truncated: total > rows.length,
      note: total > rows.length
        ? `Showing ${rows.length} of ${total.toLocaleString('el-GR')}. The total is exact; the list is a sample.`
        : undefined,
      companies: rows.map(r => ({
        ...cleanCompanyRow(r),
        sector: sectionLabel(sectionOfKad(String(r.primary_kad_code ?? ''))),
        profile_url: `https://www.greekleads.gr/etaireies/${r.ar_gemi}`,
      })),
    }
  },
}

// ── get_company ────────────────────────────────────────────────────────

const getCompany: Tool = {
  name: 'get_company',
  description:
    'Full registry profile for one company by its ΓΕΜΗ number, including its ' +
    'current and historical ΚΑΔ activities and the people on record. Use this ' +
    'after search_companies when a question is about a specific company. ' +
    'Returns null if the ΓΕΜΗ number does not exist — ΓΕΜΗ numbers are not ' +
    'guessable, so get them from a search rather than constructing them.',
  schema: z.object({
    ar_gemi: z.string().describe('The ΓΕΜΗ number, digits only, e.g. "179604901000".'),
  }),
  run: async ({ ar_gemi }: { ar_gemi: string }) => {
    if (!/^\d+$/.test(ar_gemi)) {
      return { error: 'ar_gemi must be digits only.' }
    }
    const company = await queryOne<Record<string, unknown>>(
      `SELECT ar_gemi::text, afm, co_name_el, co_names_en, co_titles_el, co_titles_en,
              objective, legal_type_descr, status_descr,
              prefecture_descr, municipality_descr, city, street, street_number, zip_code,
              email, phone, fax, url, discovered_url,
              incorporation_date::text, last_status_change::text, capital,
              primary_kad_code, primary_kad, activities,
              instagram_url, facebook_url, linkedin_url, twitter_url, tiktok_url, youtube_url
         FROM companies WHERE ar_gemi = $1::bigint`,
      [ar_gemi],
    )
    if (!company) return null

    const people = await query<Record<string, unknown>>(
      `SELECT person_name, role, category, dt_from::text, dt_to::text
         FROM company_persons
        WHERE ar_gemi = $1
        ORDER BY (dt_to IS NULL) DESC, dt_from DESC NULLS LAST
        LIMIT 40`,
      [ar_gemi],
    )

    return {
      ...cleanCompanyRow(company),
      sector: sectionLabel(sectionOfKad(String(company.primary_kad_code ?? ''))),
      profile_url: `https://www.greekleads.gr/etaireies/${ar_gemi}`,
      people,
      people_note: people.length === 40 ? 'Truncated at 40 people.' : undefined,
    }
  },
}

// ── search_people ──────────────────────────────────────────────────────

const searchPeople: Tool = {
  name: 'search_people',
  description:
    'Find people on the ΓΕΜΗ register — directors, shareholders and legal ' +
    'representatives — by name, and see every company each is attached to. ' +
    'Greek names are stored ΕΠΩΝΥΜΟ ΟΝΟΜΑ ΠΑΤΡΩΝΥΜΟ (surname first) in ' +
    'uppercase. Matching is exact-prefix on the stored form, so search by ' +
    'surname when unsure. This is public registry data about real people: ' +
    'report roles and companies, and do not speculate beyond what is returned.',
  schema: z.object({
    name: z.string().min(2).describe('Full or partial name, e.g. "ΠΑΠΑΔΟΠΟΥΛΟΣ".'),
    limit: z.number().int().min(1).max(MAX_ROWS).default(15),
  }),
  run: async ({ name, limit = 15 }: { name: string; limit?: number }) => {
    const rows = await query<Record<string, unknown>>(
      `SELECT cp.person_name,
              count(DISTINCT cp.ar_gemi)::int AS companies,
              count(DISTINCT cp.ar_gemi) FILTER (WHERE c.status_descr = 'Ενεργή')::int AS active_companies,
              (array_agg(c.co_name_el ORDER BY (c.status_descr = 'Ενεργή') DESC, c.co_name_el))[1] AS sample_company
         FROM company_persons cp
         JOIN companies c ON c.ar_gemi::text = cp.ar_gemi
        WHERE cp.person_name ILIKE $1
        GROUP BY cp.person_name
        ORDER BY companies DESC
        LIMIT ${Math.min(limit, MAX_ROWS)}`,
      [name.trim() + '%'],
      25_000,
    )
    return {
      returned: rows.length,
      people: rows.map(r => ({
        ...r,
        profile_url: `https://www.greekleads.gr/people/${encodeURIComponent(String(r.person_name))}`,
      })),
    }
  },
}

// ── registry_statistics ────────────────────────────────────────────────

const registryStatistics: Tool = {
  name: 'registry_statistics',
  description:
    'How many companies were founded in Greece over a period, broken down by ' +
    'sector, region or legal form. Reads a pre-aggregated rollup, so it is ' +
    'fast where a live COUNT over 1,69M rows would not be. ' +
    'IMPORTANT: our ΓΕΜΗ copy lags — measured p90 of 81 days for a new firm — ' +
    'so the most recent ~3 months are incomplete and will rise. Say so when ' +
    'presenting recent figures.',
  schema: z.object({
    dimension: z.enum(['sector', 'prefecture', 'legal_type'])
      .describe('What to break the formations down by.'),
    months: z.number().int().min(1).max(120).default(12)
      .describe('How many months back from today.'),
    limit: z.number().int().min(1).max(40).default(15),
  }),
  run: async ({ dimension, months = 12, limit = 15 }: { dimension: string; months?: number; limit?: number }) => {
    const rows = await query<{ dim_value: string; total: string }>(
      `SELECT dim_value, SUM(value)::text AS total
         FROM stats_rollup
        WHERE grain = 'month'
          AND dimension = $1
          AND metric = 'births'
          AND period >= (CURRENT_DATE - ($2 || ' months')::interval)
        GROUP BY dim_value
        ORDER BY SUM(value) DESC
        LIMIT ${Math.min(limit, 40)}`,
      [dimension, String(months)],
      25_000,
    )

    // The sector dimension stores 4-digit ΚΑΔ classes; roll them to the ~21
    // named sections a person can actually reason about.
    if (dimension === 'sector') {
      const bySection = new Map<string, number>()
      for (const r of rows) {
        const key = sectionOfKad(r.dim_value.padEnd(8, '0'))
        bySection.set(key, (bySection.get(key) ?? 0) + Number(r.total))
      }
      return {
        dimension: 'sector',
        months,
        caveat: 'The last ~3 months are incomplete (p90 ingest lag 81 days).',
        results: Array.from(bySection.entries())
          .map(([key, formations]) => ({ sector: sectionLabel(key), formations }))
          .sort((a, b) => b.formations - a.formations),
      }
    }

    return {
      dimension,
      months,
      caveat: 'The last ~3 months are incomplete (p90 ingest lag 81 days).',
      results: rows.map(r => ({ value: r.dim_value, formations: Number(r.total) })),
    }
  },
}

export const TOOLS: Tool[] = [
  describeDataset,
  searchCompanies,
  getCompany,
  searchPeople,
  registryStatistics,
]
