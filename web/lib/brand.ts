/**
 * Distinct trade names (ΓΕΜΗ διακριτικός τίτλος) that differ from the legal name.
 * The registry stores these in co_titles_el / co_titles_en (JSONB arrays). They
 * are often what people actually search — a sole proprietor "ΣΙΜΟΠΟΥΛΟΥ ΙΩΑΝΝΑ"
 * trades as "GROOMIE" — so surfacing them is the brand-name SEO capture.
 */
export function brandTitles(
  titles: string[] | null | undefined,
  legalName: string | null,
): string[] {
  if (!titles?.length) return []
  const legal = (legalName ?? '').trim().toLowerCase()
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of titles) {
    const v = (t ?? '').trim()
    if (!v) continue
    const key = v.toLowerCase()
    if (key === legal || seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out
}
