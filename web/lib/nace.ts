// ── NACE / ΚΑΔ sector grouping ────────────────────────────────────────
//
// `activities[].activity.id` is an 8-digit NACE-derived ΚΑΔ. The first two
// digits are the NACE *division* (~88 of them), and divisions roll up into 21
// *sections* (A–U). Grouping is therefore mechanical — we never hand-map any of
// the 10.773 distinct Greek descriptions.
//
// Ranges are inclusive. Divisions 04, 34 and 89 do not exist in NACE; a code
// that falls in no range is reported as 'X' (Μη ταξινομημένο) rather than being
// silently dropped, so the section shares always sum to the headline total.

export interface Section {
  key: string
  label: string
  /** Inclusive [from, to] division ranges. */
  ranges: [number, number][]
  color: string
}

export const SECTIONS: Section[] = [
  { key: 'A', label: 'Γεωργία & αλιεία',            ranges: [[1, 3]],              color: '#6E8B3D' },
  { key: 'B', label: 'Ορυχεία & λατομεία',           ranges: [[5, 9]],              color: '#8A6D3B' },
  { key: 'C', label: 'Μεταποίηση',                   ranges: [[10, 33]],            color: '#2F6F8F' },
  { key: 'D', label: 'Ενέργεια & φυσικό αέριο',      ranges: [[35, 35]],            color: '#C68A12' },
  { key: 'E', label: 'Ύδρευση & απόβλητα',           ranges: [[36, 39]],            color: '#3E8C84' },
  { key: 'F', label: 'Κατασκευές',                   ranges: [[41, 43]],            color: '#A85A2A' },
  { key: 'G', label: 'Εμπόριο',                      ranges: [[45, 47]],            color: '#2563A8' },
  { key: 'H', label: 'Μεταφορά & αποθήκευση',        ranges: [[49, 53]],            color: '#54789E' },
  { key: 'I', label: 'Τουρισμός & εστίαση',          ranges: [[55, 56]],            color: '#B0453A' },
  { key: 'J', label: 'Πληροφορική & επικοινωνίες',   ranges: [[58, 63]],            color: '#4A5BA8' },
  { key: 'K', label: 'Χρηματοοικονομικά & ασφάλειες',ranges: [[64, 66]],            color: '#1F6B4A' },
  { key: 'L', label: 'Ακίνητη περιουσία',            ranges: [[68, 68]],            color: '#8A5A12' },
  { key: 'M', label: 'Επαγγελματικές & τεχνικές',    ranges: [[69, 75]],            color: '#6B4E9E' },
  { key: 'N', label: 'Διοικητικές υπηρεσίες',        ranges: [[77, 82]],            color: '#7A7F88' },
  { key: 'O', label: 'Δημόσια διοίκηση',             ranges: [[84, 84]],            color: '#5A6472' },
  { key: 'P', label: 'Εκπαίδευση',                   ranges: [[85, 85]],            color: '#1A7A9E' },
  { key: 'Q', label: 'Υγεία & κοινωνική μέριμνα',    ranges: [[86, 88]],            color: '#2E8B57' },
  { key: 'R', label: 'Τέχνες & ψυχαγωγία',           ranges: [[90, 93]],            color: '#C2185B' },
  { key: 'S', label: 'Άλλες υπηρεσίες',              ranges: [[94, 96]],            color: '#8C7B6B' },
  { key: 'T', label: 'Νοικοκυριά ως εργοδότες',      ranges: [[97, 98]],            color: '#9E8B4A' },
  { key: 'U', label: 'Εξωχώριοι οργανισμοί',         ranges: [[99, 99]],            color: '#7E7E7E' },
  { key: 'X', label: 'Μη ταξινομημένο',              ranges: [],                    color: '#B4B0A6' },
]

export const SECTION_MAP = new Map(SECTIONS.map(s => [s.key, s]))

/** Division number (1–99) → section key. Built once at module load. */
const DIVISION_TO_SECTION = new Map<number, string>()
for (const s of SECTIONS) {
  for (const [from, to] of s.ranges) {
    for (let d = from; d <= to; d++) DIVISION_TO_SECTION.set(d, s.key)
  }
}

/** '56101000' → 'I'. Anything unrecognised lands in 'X', never dropped. */
export function sectionOfKad(kad: string | null | undefined): string {
  if (!kad) return 'X'
  const div = parseInt(String(kad).slice(0, 2), 10)
  if (!Number.isFinite(div)) return 'X'
  return DIVISION_TO_SECTION.get(div) ?? 'X'
}

export function sectionLabel(key: string): string {
  return SECTION_MAP.get(key)?.label ?? key
}

export function sectionColor(key: string): string {
  return SECTION_MAP.get(key)?.color ?? '#B4B0A6'
}

/**
 * The ΚΑΔ division prefixes a section covers, as 2-digit strings — used to build
 * the `/search` link behind each sector bar so a chart converts into a prospect
 * list.
 */
export function divisionsOfSection(key: string): string[] {
  const s = SECTION_MAP.get(key)
  if (!s) return []
  const out: string[] = []
  for (const [from, to] of s.ranges) {
    for (let d = from; d <= to; d++) out.push(String(d).padStart(2, '0'))
  }
  return out
}

/**
 * Inverse of divisionsOfSection: given the divisions carried in a ?kad_prefix
 * URL, name the sector for display in a filter pill. Falls back to a count so
 * a hand-edited or partial list still reads sensibly rather than showing
 * "undefined".
 */
export function sectionNameForDivisions(divisions: string[]): string {
  if (!divisions.length) return ''
  const keys = new Set(divisions.map(d => sectionOfKad(d + '000000')))
  if (keys.size === 1) {
    const only = Array.from(keys)[0]
    const full = divisionsOfSection(only)
    // Only claim the section name when the whole section is selected.
    if (full.length === divisions.length) return sectionLabel(only)
  }
  return `${divisions.length} κλάδοι ΚΑΔ`
}
