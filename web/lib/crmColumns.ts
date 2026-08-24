// ── CRM grid column catalogue ─────────────────────────────────────────
//
// The single definition of what the grid can show. The picker, the header, the
// cell renderer and the CSV export all read from here, so adding a column is
// one entry rather than four edits.
//
// `key` is what gets persisted in crm_lists.columns — never reuse or rename a
// key, or saved layouts will silently drop that column.

export type ColKind = 'text' | 'mono' | 'link' | 'email' | 'phone' | 'url' | 'date' | 'stage' | 'note' | 'badge' | 'social'

export interface ColDef {
  key: string
  label: string
  group: 'identity' | 'contact' | 'location' | 'business'
  kind: ColKind
  width: number
  /** Locked columns cannot be removed — without a name the row is unusable. */
  locked?: boolean
  /** Right-align numerics so they scan vertically. */
  numeric?: boolean
}

export const COLUMNS: ColDef[] = [
  // ── Identity & registry ────────────────────────────────────
  { key: 'co_name_el',        label: 'Επωνυμία',            group: 'identity', kind: 'link',  width: 280, locked: true },
  { key: 'stage',             label: 'Στάδιο',              group: 'business', kind: 'stage', width: 140, locked: true },
  { key: 'brand',             label: 'Διακριτικός τίτλος',  group: 'identity', kind: 'text',  width: 180 },
  { key: 'ar_gemi',           label: 'ΓΕΜΗ',                group: 'identity', kind: 'mono',  width: 130 },
  { key: 'afm',               label: 'ΑΦΜ',                 group: 'identity', kind: 'mono',  width: 110 },
  { key: 'legal_type_descr',  label: 'Νομική μορφή',        group: 'identity', kind: 'text',  width: 120 },
  { key: 'status_descr',      label: 'Κατάσταση',           group: 'identity', kind: 'badge', width: 110 },
  { key: 'year_founded',      label: 'Ίδρυση',              group: 'identity', kind: 'mono',  width: 80, numeric: true },
  { key: 'is_branch',         label: 'Υποκατάστημα',        group: 'identity', kind: 'text',  width: 110 },

  // ── Contact ────────────────────────────────────────────────
  { key: 'email',             label: 'Email',               group: 'contact',  kind: 'email', width: 220 },
  { key: 'phone',             label: 'Τηλέφωνο',            group: 'contact',  kind: 'phone', width: 140 },
  { key: 'website',           label: 'Website',             group: 'contact',  kind: 'url',   width: 200 },
  { key: 'fax',               label: 'Fax',                 group: 'contact',  kind: 'mono',  width: 130 },
  { key: 'linkedin_url',      label: 'LinkedIn',            group: 'contact',  kind: 'social', width: 90 },
  { key: 'instagram_url',     label: 'Instagram',           group: 'contact',  kind: 'social', width: 90 },
  { key: 'facebook_url',      label: 'Facebook',            group: 'contact',  kind: 'social', width: 90 },
  { key: 'twitter_url',       label: 'X / Twitter',         group: 'contact',  kind: 'social', width: 90 },
  { key: 'tiktok_url',        label: 'TikTok',              group: 'contact',  kind: 'social', width: 90 },
  { key: 'youtube_url',       label: 'YouTube',             group: 'contact',  kind: 'social', width: 90 },

  // ── Location ───────────────────────────────────────────────
  { key: 'prefecture_descr',  label: 'Νομός',               group: 'location', kind: 'text',  width: 150 },
  { key: 'municipality_descr',label: 'Δήμος',               group: 'location', kind: 'text',  width: 170 },
  { key: 'city',              label: 'Πόλη',                group: 'location', kind: 'text',  width: 130 },
  { key: 'address',           label: 'Διεύθυνση',           group: 'location', kind: 'text',  width: 200 },
  { key: 'zip_code',          label: 'Τ.Κ.',                group: 'location', kind: 'mono',  width: 80 },

  // ── Business & CRM ─────────────────────────────────────────
  { key: 'primary_kad',       label: 'ΚΑΔ',                 group: 'business', kind: 'mono',  width: 90 },
  { key: 'kad_descr',         label: 'Δραστηριότητα',       group: 'business', kind: 'text',  width: 260 },
  { key: 'capital',           label: 'Κεφάλαιο',            group: 'business', kind: 'mono',  width: 120, numeric: true },
  { key: 'note',              label: 'Σημείωση',            group: 'business', kind: 'note',  width: 220 },
  { key: 'last_contacted',    label: 'Τελ. επαφή',          group: 'business', kind: 'date',  width: 110 },
  { key: 'added_at',          label: 'Προστέθηκε',          group: 'business', kind: 'date',  width: 110 },
  { key: 'added_by',          label: 'Πηγή',                group: 'business', kind: 'text',  width: 100 },
]

export const GROUP_LABELS: Record<ColDef['group'], string> = {
  identity: 'Ταυτότητα & μητρώο',
  contact:  'Επικοινωνία',
  location: 'Τοποθεσία',
  business: 'Δραστηριότητα & CRM',
}

/** Shown when a list has no saved layout — the columns a salesperson needs first. */
export const DEFAULT_COLUMNS = [
  'co_name_el', 'stage', 'email', 'phone', 'website',
  'prefecture_descr', 'legal_type_descr', 'note',
]

export const COLUMN_MAP = new Map(COLUMNS.map(c => [c.key, c]))

/**
 * Saved layouts can contain keys that no longer exist (a column was removed in
 * a later release), so always resolve through this rather than trusting the
 * stored array. Locked columns are forced back in if a stale layout lacks them.
 */
export function resolveColumns(saved: unknown): ColDef[] {
  const keys = Array.isArray(saved) && saved.length
    ? (saved as unknown[]).map(String)
    : DEFAULT_COLUMNS
  const out: ColDef[] = []
  const seen = new Set<string>()
  for (const k of keys) {
    const def = COLUMN_MAP.get(k)
    if (def && !seen.has(k)) { out.push(def); seen.add(k) }
  }
  for (const def of COLUMNS) {
    if (def.locked && !seen.has(def.key)) { out.unshift(def); seen.add(def.key) }
  }
  return out
}

// ── Pipeline stages ───────────────────────────────────────────────────
// Keys are stored in crm_list_members.stage and constrained by a CHECK in the
// DB — keep the two in sync (scripts/one_time/add_crm_grid_columns.py).

export type StageKey = 'new' | 'contacted' | 'proposal' | 'customer' | 'lost'

export interface StageDef {
  key: StageKey
  label: string
  fg: string
  bg: string
  border: string
}

export const STAGES: StageDef[] = [
  { key: 'new',       label: 'Νέο',          fg: '#4A5468', bg: '#F1F0EA', border: '#DAD7CA' },
  { key: 'contacted', label: 'Επικοινωνία',  fg: '#1A4A8A', bg: '#EEF4FF', border: '#C0D0E8' },
  { key: 'proposal',  label: 'Πρόταση',      fg: '#8A5A12', bg: '#FFF4E0', border: '#EFD9AE' },
  { key: 'customer',  label: 'Πελάτης',      fg: '#136B3E', bg: '#E8F6EE', border: '#BEE4CC' },
  { key: 'lost',      label: 'Χαμένο',       fg: '#8A3520', bg: '#FDF3F0', border: '#E7C3BA' },
]

export const STAGE_MAP = new Map(STAGES.map(s => [s.key, s]))

export function stageOf(key: string | null | undefined): StageDef {
  return STAGE_MAP.get((key ?? 'new') as StageKey) ?? STAGES[0]
}
