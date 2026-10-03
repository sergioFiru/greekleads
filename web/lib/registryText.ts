// ── ΓΕΜΗ placeholder scrubbing ─────────────────────────────────────────
//
// The registry writes the literal English string 'Inadequate Info' into fields
// it does not know, rather than leaving them NULL. Three columns carry it:
// `municipality_descr`, `prefecture_descr` and `legal_type_descr`.
//
// Two things make this harder than a NULLIF:
//
// 1. `municipality_descr` is a COMBINED "ΔΗΜΟΣ / ΝΟΜΟΣ" string, so the
//    placeholder can occupy one half, both halves, or none —
//    'Inadequate Info / Inadequate Info' and 'ΔΗΜΟΣ ΡΟΔΟΥ / Inadequate Info'
//    are both real. An exact match catches the first and misses the second.
// 2. It is user-visible on /etaireies/*, which is the SEO surface. Leaking
//    English filler onto an indexed Greek page is worse than showing nothing.
//
// Scrub at the API boundary, not in the component: every surface that reads a
// company row — page, search table, CSV export, person profile — then gets the
// same answer, and the raw column stays untouched for filtering.

/** The literal the registry writes for "we don't know". */
export const PLACEHOLDER = 'Inadequate Info'

/** Matches the placeholder anywhere, case-insensitively. */
const RE = /inadequate\s*info/i

/** A plain field: the placeholder (or blank) becomes null. */
export function cleanField(v: string | null | undefined): string | null {
  if (v == null) return null
  const t = v.trim()
  if (!t || RE.test(t)) return null
  return t
}

/**
 * `municipality_descr`, which is "ΔΗΜΟΣ / ΝΟΜΟΣ". Drops only the halves that
 * are placeholders, so a half-known value keeps the half we do know.
 *
 *   'Inadequate Info / Inadequate Info' → null
 *   'ΔΗΜΟΣ ΡΟΔΟΥ / Inadequate Info'     → 'ΔΗΜΟΣ ΡΟΔΟΥ'
 *   'ΔΗΜΟΣ ΡΟΔΟΥ / ΔΩΔΕΚΑΝΗΣΟΥ'         → unchanged
 */
export function cleanMunicipality(v: string | null | undefined): string | null {
  if (v == null) return null
  const parts = v.split('/').map(s => s.trim()).filter(s => s && !RE.test(s))
  if (!parts.length) return null
  // De-duplicate: 'ΑΘΗΝΑΙΩΝ / ΑΘΗΝΑΙΩΝ' reads as a mistake, not as detail.
  const uniq = parts.filter((s, i) => parts.findIndex(o => o.toLowerCase() === s.toLowerCase()) === i)
  return uniq.join(' / ')
}

/**
 * Scrub every placeholder-bearing column on a company-shaped row, in place of
 * remembering to call the right cleaner per field at each call site. Returns a
 * new object; unknown fields pass through untouched.
 */
export function cleanCompanyRow<T extends object>(row: T): T {
  const out = { ...row } as Record<string, unknown>
  if ('municipality_descr' in out) out.municipality_descr = cleanMunicipality(out.municipality_descr as string | null)
  if ('prefecture_descr'   in out) out.prefecture_descr   = cleanField(out.prefecture_descr as string | null)
  if ('legal_type_descr'   in out) out.legal_type_descr   = cleanField(out.legal_type_descr as string | null)
  return out as T
}
