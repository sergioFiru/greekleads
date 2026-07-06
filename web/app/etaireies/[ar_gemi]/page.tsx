import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { query, queryOne, queryWithTimeout } from '@/lib/db'
import TopNav from '@/components/TopNav'
import CompanyPage from '@/components/CompanyPage'
import type { CompanyData, PersonRow, SimilarCompany } from '@/components/CompanyPage'

async function getCompany(ar_gemi: string): Promise<CompanyData | null> {
  return queryOne<CompanyData>(
    `SELECT
      ar_gemi::text, afm, co_name_el, co_names_en, objective,
      city, street, street_number, zip_code, municipality_descr, prefecture_descr,
      email, phone, fax, url, legal_type_descr, gemi_office_descr, status_descr,
      is_branch, incorporation_date::text,
      activities, capital,
      linkedin_url, instagram_url, facebook_url, twitter_url, tiktok_url, youtube_url,
      primary_kad
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ar_gemi: string }>
}): Promise<Metadata> {
  const { ar_gemi } = await params
  const company = await getCompany(ar_gemi)
  if (!company) return { title: 'Εταιρεία | GreekLeads' }

  const name = company.co_name_el ?? `ΓΕΜΗ ${company.ar_gemi}`
  const city = company.city ?? company.prefecture_descr ?? 'Ελλάδα'
  const desc =
    company.objective?.slice(0, 155) ??
    `Πληροφορίες για ${name} — ΓΕΜΗ ${company.ar_gemi}, ${city}. Στοιχεία επικοινωνίας, διοικητικό συμβούλιο και δραστηριότητες.`

  return {
    title: `${name} | GreekLeads`,
    description: desc,
    openGraph: {
      title: name,
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

  const [persons, similar] = await Promise.all([
    getPersons(ar_gemi),
    getSimilar(ar_gemi, company.primary_kad, company.prefecture_descr),
  ])

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: company.co_name_el,
    identifier: [
      { '@type': 'PropertyValue', name: 'ΓΕΜΗ', value: company.ar_gemi },
      ...(company.afm ? [{ '@type': 'PropertyValue', name: 'ΑΦΜ', value: company.afm }] : []),
    ],
    ...(company.url ? { url: company.url } : {}),
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
        <CompanyPage company={company} persons={persons} similar={similar} />
      </div>
    </>
  )
}
