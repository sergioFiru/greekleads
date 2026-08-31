/**
 * Display formatting for ΓΕΜΗ company names, for <title> and meta description.
 *
 * WHY THIS EXISTS (measured, Aug 2026)
 * Google was rendering our company titles as
 *   `origami ventures μονοπροσωπη ιδιωτικη κεφαλαιουχικη εταιρεια`
 * i.e. lowercased and unaccented. That is NOT a bug in our code — nothing here
 * ever lowercased anything. It is Google rewriting a title it judged too long
 * and too shouty. fundamenta's `ORIGAMI VENTURES ΜΟΝΟΠΡΟΣΩΠΗ Ι.Κ.Ε.` in the
 * same SERP was left alone, because it is short and abbreviated.
 *
 * So the fix is not "stop lowercasing" — it is "give Google a title it will not
 * want to rewrite": abbreviate the legal-form boilerplate, and de-shout Latin
 * brand words.
 *
 * WHAT WE DELIBERATELY DO NOT DO
 * We do not lowercase Greek. 980.858 of 1.053.852 active names are stored ALL
 * CAPS and only 60.634 carry any accent — because **uppercase Greek correctly
 * omits accents**. `ΚΕΦΑΛΑΙΟΥΧΙΚΗ` is right; `κεφαλαιουχικη` is a misspelling.
 * Since accents cannot be reconstructed for arbitrary company names, lowercasing
 * Greek would turn a million correct names into a million misspelt ones.
 *
 * Legal-form boilerplate is the exception: it is a small fixed vocabulary, so it
 * can be replaced with a correctly accented abbreviation safely.
 */

/**
 * Trailing legal-form phrases → accented abbreviation.
 *
 * Order matters: longest first, so 'ΜΟΝΟΠΡΟΣΩΠΗ ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ' is not eaten
 * by the 'ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ' rule.
 *
 * ΕΤΑΙΡΕΙΑ and ΕΤΑΙΡΙΑ are both live in the registry (the second is a common
 * registrar spelling), hence ΕΤΑΙΡ(Ε)?ΙΑ throughout.
 *
 * Counts are active companies whose co_name_el ends with the phrase.
 */
const LEGAL_FORM_RULES: [RegExp, string][] = [
  [/(?:^|\s)ΜΟΝΟΠΡΟΣΩΠΗ\s+ΙΔΙΩΤΙΚΗ\s+ΚΕΦΑΛΑΙΟΥΧΙΚΗ\s+ΕΤΑΙΡ(?:Ε)?ΙΑ\s*$/u, 'Μονοπρόσωπη Ι.Κ.Ε.'],   // 13.030
  [/(?:^|\s)ΙΔΙΩΤΙΚΗ\s+ΚΕΦΑΛΑΙΟΥΧΙΚΗ\s+ΕΤΑΙΡ(?:Ε)?ΙΑ\s*$/u, 'Ι.Κ.Ε.'],                             // 12.960
  [/(?:^|\s)ΜΟΝΟΠΡΟΣΩΠΗ\s+ΕΤΑΙΡ(?:Ε)?ΙΑ\s+ΠΕΡΙΟΡΙΣΜΕΝΗΣ\s+ΕΥΘΥΝΗΣ\s*$/u, 'Μονοπρόσωπη Ε.Π.Ε.'],     // 4.444
  [/(?:^|\s)ΕΤΑΙΡ(?:Ε)?ΙΑ\s+ΠΕΡΙΟΡΙΣΜΕΝΗΣ\s+ΕΥΘΥΝΗΣ\s*$/u, 'Ε.Π.Ε.'],                               // 3.818
  [/(?:^|\s)ΜΟΝΟΠΡΟΣΩΠΗ\s+ΑΝΩΝΥΜ(?:Η|ΟΣ)\s+ΕΤΑΙΡ(?:Ε)?ΙΑ\s*$/u, 'Μονοπρόσωπη Α.Ε.'],                 // 3.665
  [/(?:^|\s)ΑΝΩΝΥΜ(?:Η|ΟΣ)\s+ΕΤΑΙΡ(?:Ε)?ΙΑ\s*$/u, 'Α.Ε.'],                                          // 10.995
  [/(?:^|\s)ΕΤΕΡΟΡΡΥΘΜ(?:Η|ΟΣ)\s+ΕΤΑΙΡ(?:Ε)?ΙΑ\s*$/u, 'Ε.Ε.'],                                      // 7.311
  [/(?:^|\s)ΟΜΟΡΡΥΘΜ(?:Η|ΟΣ)\s+ΕΤΑΙΡ(?:Ε)?ΙΑ\s*$/u, 'Ο.Ε.'],                                        // 4.917
]

/** Already-abbreviated forms, normalised to the dotted accented spelling. */
const ABBREV_RULES: [RegExp, string][] = [
  [/(?:^|\s)Ι\.?Κ\.?Ε\.?\s*$/u, 'Ι.Κ.Ε.'],
  [/(?:^|\s)Α\.?Ε\.?\s*$/u, 'Α.Ε.'],
  [/(?:^|\s)Ε\.?Π\.?Ε\.?\s*$/u, 'Ε.Π.Ε.'],
  [/(?:^|\s)Ο\.?Ε\.?\s*$/u, 'Ο.Ε.'],
  [/(?:^|\s)Ε\.?Ε\.?\s*$/u, 'Ε.Ε.'],
]

/** legal_type_descr → the abbreviation to append when the name lacks one. */
const LEGAL_TYPE_ABBREV: Record<string, string> = {
  'ΑΕ': 'Α.Ε.',
  'ΙΚΕ': 'Ι.Κ.Ε.',
  'ΕΠΕ': 'Ε.Π.Ε.',
  'ΟΕ': 'Ο.Ε.',
  'ΕΕ': 'Ε.Ε.',
}

/**
 * Greek letters that have an identical-looking Latin counterpart. Registry text
 * mixes them constantly — real δ.τ. values in the data include `SIDE A.E.`
 * (Latin A, Latin E) and `ΖΑΒΙΤΣΑ ΕΝΕΡΓΕΙΑΚΗ Μ.EΠΕ` (Latin E inside Greek).
 * Without folding these, a legal form is invisible to any Greek-only pattern.
 */
const LATIN_TO_GREEK: Record<string, string> = {
  A: 'Α', B: 'Β', E: 'Ε', Z: 'Ζ', H: 'Η', I: 'Ι', K: 'Κ', M: 'Μ',
  N: 'Ν', O: 'Ο', P: 'Ρ', T: 'Τ', X: 'Χ', Y: 'Υ',
}

/**
 * True when the name already ends in a legal-form marker, in ANY of the spellings
 * the registry actually uses.
 *
 * Regexes over the raw string are not enough: `Μ.Ε.Π.Ε.` glues the μονοπρόσωπη
 * prefix on with no space, and `A.E.` is written in Latin. So normalise the last
 * token instead — drop dots, fold homoglyphs, allow a leading Μ — and compare.
 * Getting this wrong appends a second suffix: `ZV Greece Μ.Ε.Π.Ε. Ε.Π.Ε.`
 */
function hasLegalForm(s: string): boolean {
  const tail = s.trim().split(/\s+/).pop() ?? ''
  const norm = tail
    .replace(/[.\s]/g, '')
    .toUpperCase()
    .split('')
    .map(ch => LATIN_TO_GREEK[ch] ?? ch)
    .join('')
  // Optional leading Μ = μονοπρόσωπη.
  return /^Μ?(?:ΙΚΕ|ΑΕ|ΕΠΕ|ΟΕ|ΕΕ)$/u.test(norm)
}

/**
 * De-shout an ALL-CAPS Latin word: ORIGAMI → Origami.
 *
 * Only words of 4+ letters, so short strings that are almost always acronyms
 * (LFS, DIS, ATM) keep their capitals rather than becoming "Lfs".
 * Greek tokens are returned untouched — see the header note on accents.
 */
function deShoutLatin(token: string): string {
  // Dotted acronyms (S.P.S., A.B.C.) keep their capitals — lowercasing gives
  // "S.p.s.", which is worse than shouting.
  if (token.includes('.')) return token
  if (token.length < 4) return token
  if (!/^[A-Z][A-Z0-9&'’-]*$/u.test(token)) return token
  return token.charAt(0) + token.slice(1).toLowerCase()
}

/**
 * A company name as it should appear in a title: legal-form boilerplate
 * abbreviated, Latin brand words de-shouted, whitespace collapsed.
 */
export function displayName(raw: string | null | undefined): string {
  let s = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return ''

  // The patterns swallow the separating space, so put one back and trim — that
  // stops a name that IS only a legal form from gaining a leading space.
  for (const [re, abbrev] of LEGAL_FORM_RULES) {
    if (re.test(s)) { s = s.replace(re, ` ${abbrev}`).trim(); break }
  }
  for (const [re, abbrev] of ABBREV_RULES) {
    if (re.test(s)) { s = s.replace(re, ` ${abbrev}`).trim(); break }
  }

  return s.split(' ').map(deShoutLatin).join(' ').trim()
}

export interface TitleInput {
  co_name_el: string | null
  co_titles_el?: string[] | null
  legal_type_descr?: string | null
  ar_gemi: string
}

const NAME_MAX = 58

/** Cut at a word boundary rather than mid-word, and only when that helps. */
function truncateWords(str: string, max: number): string {
  if (str.length <= max) return str
  const cut = str.slice(0, max)
  const at = cut.lastIndexOf(' ')
  return (at > max * 0.6 ? cut.slice(0, at) : cut).trimEnd() + '…'
}

/**
 * The <title> for a company page.
 *
 * The δ.τ. wins when present (364.023 active companies have one) because it is
 * what people actually type — nobody googles "ΣΙΜΟΠΟΥΛΟΥ ΙΩΑΝΝΑ", they google
 * "GROOMIE". The legal name is still on the page, in the h1 and in JSON-LD.
 */
export function companyTitle(c: TitleInput): string {
  const brand = (c.co_titles_el ?? []).map(t => (t ?? '').trim()).find(Boolean)
  let name = displayName(brand || c.co_name_el) || `ΓΕΜΗ ${c.ar_gemi}`

  // A δ.τ. often omits the legal form; add it so the title still identifies the
  // entity type, which is what the SERP competitors show.
  const abbrev = c.legal_type_descr ? LEGAL_TYPE_ABBREV[c.legal_type_descr] : undefined
  if (abbrev && !hasLegalForm(name)) name = `${name} ${abbrev}`

  // Truncate the descriptive part but keep the legal form — it is the shortest
  // and most identifying token, and lopping it produces "… Μονοπρόσωπη…".
  if (name.length > NAME_MAX) {
    const parts = name.split(' ')
    const suffix = hasLegalForm(name)
      ? parts.slice(name.match(/Μονοπρόσωπη\s\S+$/u) ? -2 : -1).join(' ')
      : ''
    const base = suffix ? name.slice(0, -suffix.length).trim() : name
    const room = NAME_MAX - (suffix ? suffix.length + 1 : 0)
    name = suffix ? `${truncateWords(base, room)} ${suffix}` : truncateWords(base, NAME_MAX)
  }

  return `${name} — ΓΕΜΗ ${c.ar_gemi} | GreekLeads`
}

export interface DescriptionInput {
  co_name_el: string | null
  co_titles_el?: string[] | null
  city?: string | null
  prefecture_descr?: string | null
  afm?: string | null
  email?: string | null
  phone?: string | null
  url?: string | null
  discovered_url?: string | null
  has_persons?: boolean
  has_social?: boolean
}

/** ΓΕΜΗ writes this literal placeholder into location fields. */
const PLACEHOLDER = 'Inadequate Info'

/** Google renders roughly this many characters of a description. */
const DESC_MAX = 155

function place(c: DescriptionInput): string {
  const parts = [c.city, c.prefecture_descr]
    .map(v => (v ?? '').trim())
    .filter(v => v && v !== PLACEHOLDER)
  // city and prefecture are frequently the same word (ΑΘΗΝΑ / ΑΘΗΝΩΝ-ish); one
  // is enough and two would waste snippet characters.
  const uniq = parts.filter((v, i) => i === 0 || v.toLowerCase() !== parts[0].toLowerCase())
  return uniq.slice(0, 2).join(', ')
}

/**
 * The meta description.
 *
 * Only promises what this company actually has: claiming "ιδιοκτήτες" on a page
 * with no people, or "social profiles" on one with none, is the fastest way to
 * teach Google our descriptions are noise and get them rewritten.
 *
 * Owners/directors leads the list wherever it exists — it is the one thing
 * 11888 and fundamenta do not show in their snippets.
 */
export function companyDescription(c: DescriptionInput): string {
  const brand = (c.co_titles_el ?? []).map(t => (t ?? '').trim()).find(Boolean)
  const name = displayName(brand || c.co_name_el) || 'την επιχείρηση'
  const where = place(c)

  const has: string[] = []
  if (c.has_persons) has.push('ιδιοκτήτες και στελέχη')
  if (c.afm) has.push('ΑΦΜ')
  if (c.email || c.phone) has.push('στοιχεία επικοινωνίας')
  if (c.url || c.discovered_url) has.push('ιστότοπος')
  if (c.has_social) has.push('social profiles')

  const head = where ? `${truncateWords(name, 46)} (${where})` : truncateWords(name, 46)
  const tail = ' Ενημερωμένα δεδομένα από το ΓΕΜΗ.'

  // Google shows ~155 characters. Rather than truncate mid-promise, drop whole
  // items off the end until it fits — the list is already in priority order,
  // with owners/directors first because that is the differentiator.
  let list = [...has]
  let out = ''
  do {
    const joined = list.length ? `: ${list.join(', ')}` : ''
    out = `Πλήρη στοιχεία για ${head}${joined}.${tail}`
    if (out.length <= DESC_MAX || list.length === 0) break
    list = list.slice(0, -1)
  } while (true)

  return out
}
