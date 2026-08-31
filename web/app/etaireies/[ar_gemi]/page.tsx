import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { query, queryOne, queryWithTimeout } from '@/lib/db'
import { brandTitles } from '@/lib/brand'
import { companyTitle, companyDescription } from '@/lib/companyName'
import TopNav from '@/components/TopNav'
import CompanyPage from '@/components/CompanyPage'
import type { CompanyData, PersonRow, SimilarCompany, FinancialsData } from '@/components/CompanyPage'

const FINANCIAL_FILER_TYPES = new Set(['ΑΕ', 'ΙΚΕ', 'ΕΠΕ'])

async function getCompany(ar_gemi: string): Promise<CompanyData | null> {
  return queryOne<CompanyData>(
    `SELECT
      ar_gemi::text, afm, co_name_el, co_names_en, co_titles_el, co_titles_en, objective,
      city, street, street_number, zip_code, municipality_descr, prefecture_descr,
      email, phone, fax, url, discovered_url, website_source, legal_type_descr, gemi_office_descr, status_descr,
      is_branch, incorporation_date::text,
      activities, capital,
      linkedin_url, instagram_url, facebook_url, twitter_url, tiktok_url, youtube_url,
      primary_kad,
      EXISTS(SELECT 1 FROM company_favicons f WHERE f.ar_gemi = companies.ar_gemi AND f.status = 'ok') AS has_favicon,
      EXISTS(SELECT 1 FROM company_persons p WHERE p.ar_gemi = companies.ar_gemi::text) AS has_persons
    FROM companies WHERE ar_gemi = $1::bigint`,
    [ar_gemi]
  )
}

async function getPersons(ar_gemi: string): Promise<PersonRow[]> {
  return query<PersonRow>(
    `SELECT
      id, ar_gemi::text, person_name, role, category,
      dt_from::text, dt_to::text, percentage,
      is_rep_alone, is_rep_in_common
    FROM company_persons WHERE ar_gemi = $1
    ORDER BY dt_to IS NULL DESC, dt_from DESC NULLS LAST`,
    [ar_gemi]
  )
}

async function getSimilar(
  ar_gemi: string,
  kad: string | null,
  prefecture: string | null
): Promise<SimilarCompany[]> {
  if (!kad) return []
  const prefix = kad.slice(0, 4) + '%'

  try {
    if (prefecture) {
      const rows = await queryWithTimeout<SimilarCompany>(
        `SELECT ar_gemi::text, co_name_el, legal_type_descr, city, prefecture_descr, primary_kad, email, phone, url
         FROM companies
         WHERE status_descr = 'Ενεργή'
           AND primary_kad LIKE $1
           AND prefecture_descr = $2
           AND ar_gemi != $3::bigint
         LIMIT 4`,
        [prefix, prefecture, ar_gemi],
        4000
      )
      if (rows.length >= 4) return rows
    }

    return await queryWithTimeout<SimilarCompany>(
      `SELECT ar_gemi::text, co_name_el, legal_type_descr, city, prefecture_descr, primary_kad, email, phone, url
       FROM companies
       WHERE status_descr = 'Ενεργή'
         AND primary_kad LIKE $1
         AND ar_gemi != $2::bigint
       LIMIT 4`,
      [prefix, ar_gemi],
      4000
    )
  } catch {
    return []
  }
}

async function getFinancials(ar_gemi: string): Promise<FinancialsData | null> {
  // Legal-filing requirement (ΑΕ/ΙΚΕ/ΕΠΕ) is checked by the caller — this always
  // queries, but the tab is only shown when that gate passes.
  try {
    return await queryOne<FinancialsData>(
      `SELECT
        s.docs_found, s.has_failures, s.scanned_at::text,
        COALESCE(
          (SELECT json_agg(row_to_json(fs) ORDER BY fs.fiscal_year DESC)
           FROM (
             SELECT fiscal_year, revenue, total_assets, equity, profit_before_tax, net_profit
             FROM financial_statements WHERE ar_gemi = $1::bigint
           ) fs),
          '[]'::json
        ) AS years
      FROM financial_ar_gemi_scanned s
      WHERE s.ar_gemi = $1::bigint`,
      [ar_gemi]
    )
  } catch {
    return null
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ar_gemi: string }>
}): Promise<Metadata> {
  const { ar_gemi } = await params
  const company = await getCompany(ar_gemi)
  if (!company) return { title: 'Εταιρεία | GreekLeads' }

  const hasSocial = !!(
    company.linkedin_url || company.instagram_url || company.facebook_url ||
    company.twitter_url || company.tiktok_url || company.youtube_url
  )

  // Previously this preferred `company.objective` — the raw ΓΕΜΗ purpose
  // statement. That is a legal blob, identical across thousands of companies,
  // and Google was ignoring it and synthesising its own snippet instead.
  const title = companyTitle(company)
  const desc = companyDescription({ ...company, has_social: hasSocial })

  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: desc,
      type: 'website',
      locale: 'el_GR',
    },
    alternates: {
      canonical: `/etaireies/${ar_gemi}`,
    },
  }
}

export default async function CompanyPageRoute({
  params,
}: {
  params: Promise<{ ar_gemi: string }>
}) {
  const { ar_gemi } = await params

  const company = await getCompany(ar_gemi)
  if (!company) notFound()

  const showFinancials = !!company.legal_type_descr && FINANCIAL_FILER_TYPES.has(company.legal_type_descr)

  const [persons, similar, financials] = await Promise.all([
    getPersons(ar_gemi),
    getSimilar(ar_gemi, company.primary_kad, company.prefecture_descr),
    showFinancials ? getFinancials(ar_gemi) : Promise.resolve(null),
  ])

  // Trade names + English names → schema.org alternateName ("also known as").
  // This is the canonical brand-capture signal, stronger than any body-text mention.
  const altNames = Array.from(new Set([
    ...brandTitles(company.co_titles_el, company.co_name_el),
    ...brandTitles(company.co_titles_en, company.co_name_el),
    ...(company.co_names_en ?? []).map(s => (s ?? '').trim()).filter(Boolean),
  ]))

  // Social profiles are the canonical `sameAs` signal — they tie this page to
  // the entity's other web presences and are how Google reconciles a brand
  // across sources. Website is `url`, not sameAs.
  const sameAs = [
    company.linkedin_url, company.instagram_url, company.facebook_url,
    company.twitter_url, company.tiktok_url, company.youtube_url,
  ].filter((u): u is string => !!u)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: company.co_name_el,
    legalName: company.co_name_el,
    ...(altNames.length ? { alternateName: altNames.length === 1 ? altNames[0] : altNames } : {}),
    identifier: [
      { '@type': 'PropertyValue', name: 'ΓΕΜΗ', value: company.ar_gemi },
      ...(company.afm ? [{ '@type': 'PropertyValue', name: 'ΑΦΜ', value: company.afm }] : []),
    ],
    ...(company.afm ? { vatID: company.afm } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(company.url ? { url: company.url } : company.discovered_url ? { url: company.discovered_url } : {}),
    ...(company.email ? { email: company.email } : {}),
    ...(company.phone ? { telephone: company.phone } : {}),
    ...(company.incorporation_date
      ? { foundingDate: company.incorporation_date.slice(0, 4) }
      : {}),
    ...(company.objective ? { description: company.objective.slice(0, 500) } : {}),
    address: {
      '@type': 'PostalAddress',
      ...(company.street
        ? { streetAddress: `${company.street} ${company.street_number ?? ''}`.trim() }
        : {}),
      ...(company.city ? { addressLocality: company.city } : {}),
      ...(company.zip_code ? { postalCode: company.zip_code } : {}),
      addressCountry: 'GR',
    },
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <TopNav />
        <CompanyPage company={company} persons={persons} similar={similar} financials={financials} />
      </div>
    </>
  )
}
