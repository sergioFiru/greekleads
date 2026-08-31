// ── Plan limits — the single source of truth ──────────────────────────
//
// Every gate in the app (UI and API) reads from this file. Adding a tier is one
// key here plus a label in PLAN_LABELS; adding a capability is one field on
// PlanLimits plus one line per tier.
//
// Rule: never hard-code a limit in a component or a route. Import from here.
//
// WHY 'anon' IS A PLAN
// Anonymous used to be the *absence* of a plan, so every gate had to ask
// `isPaid` and a signed-in free user was therefore treated exactly like a
// stranger — signing up bought nothing. Making 'anon' a real row means one
// lookup governs every visitor and that whole bug class disappears.
//
// WHY CAPS, NOT BOOLEANS
// Pricing rule: tiers differ by caps, seats and access — not by locking core
// features. So export is `maxExportRows: number`, not `canExportCsv: boolean`.
// A number can express "a little" and a boolean cannot.
//
// NO UNLIMITED TIER
// Pricing rule: "No unlimited access at any tier." Nothing here is Infinity.
// `isUnlimited` is kept as a guard so that if a future tier ever does go
// unbounded, it still cannot reach a SQL LIMIT or a UI counter.

export type PlanName = 'anon' | 'free' | 'individual' | 'agency' | 'enterprise'

/** Tiers that correspond to money changing hands. */
export const PAID_PLANS: readonly PlanName[] = ['individual', 'agency', 'enterprise']

export interface PlanLimits {
  /**
   * How many pages of search results are reachable. PAGE_SIZE (50) rows each,
   * so 5 pages = 250 rows. The anon value is the floor the search route checks
   * before it pays for an auth lookup.
   */
  maxSearchPages: number
  /** How many lists the user may own. */
  maxLists: number
  /** Ceiling on members in any one list. */
  maxMembersPerList: number
  /** How many saved filter sets the user may keep. */
  maxSavedSearches: number
  /**
   * Hard ceiling on a single "add all results" operation, independent of
   * maxMembersPerList. An unbounded INSERT..SELECT over a 1.6M-row table is a
   * very slow query and produces a list nothing can render, so even the largest
   * plans get a per-operation cap. Past this, narrowing the filters is the
   * honest answer.
   */
  maxBulkAdd: number
  /** Rows per CSV export. 0 means the tier has no export at all. */
  maxExportRows: number
  /** "Bring it Alive" — auto-add newly incorporated matches. Not built yet. */
  canBringAlive: boolean
  /** Push a list to Instantly / HubSpot, and API access. Not built yet. */
  canIntegrate: boolean
}

export const PLANS: Record<PlanName, PlanLimits> = {
  // Not signed in. Two pages is the SEO/taster allowance; page 3 asks for an
  // account, which is the conversion trigger.
  anon: {
    maxSearchPages:      2,
    maxLists:            0,
    maxMembersPerList:   0,
    maxSavedSearches:    0,
    maxBulkAdd:          0,
    maxExportRows:       0,
    canBringAlive:       false,
    canIntegrate:        false,
  },
  // Signed in, not paying. Enough to be genuinely useful — 250 rows and one
  // working list — so that creating an account is worth the friction.
  free: {
    maxSearchPages:      5,
    maxLists:            1,
    maxMembersPerList:   50,
    maxSavedSearches:    3,
    maxBulkAdd:          50,
    maxExportRows:       0,
    canBringAlive:       false,
    canIntegrate:        false,
  },
  // €75/yr — solo professionals, occasional use. A real research tool, but
  // deliberately NOT an extraction tool: no CSV export. Extraction is the
  // reason the Agency tier exists.
  individual: {
    maxSearchPages:      40,
    maxLists:            3,
    maxMembersPerList:   1_000,
    maxSavedSearches:    10,
    maxBulkAdd:          1_000,
    maxExportRows:       0,
    canBringAlive:       false,
    canIntegrate:        false,
  },
  // €100/mo — the core revenue tier. Where extraction lives.
  agency: {
    maxSearchPages:      200,
    maxLists:            25,
    maxMembersPerList:   5000,
    maxSavedSearches:    100,
    maxBulkAdd:          5000,
    maxExportRows:       5000,
    canBringAlive:       true,
    canIntegrate:        false,
  },
  // Contact-us, priced per deal. Differs from Agency by API and integrations,
  // not by owning features nobody else has.
  //
  // TODO: enterprise is negotiated per customer, so these caps will eventually
  // need per-customer overrides on the subscriptions row rather than constants
  // here. Generous fixed defaults are fine until the first deal closes.
  enterprise: {
    maxSearchPages:      1_000,
    maxLists:            200,
    maxMembersPerList:   100_000,
    maxSavedSearches:    500,
    maxBulkAdd:          25_000,
    maxExportRows:       100_000,
    canBringAlive:       true,
    canIntegrate:        true,
  },
}

export const PLAN_LABELS: Record<PlanName, string> = {
  anon:       'Επισκέπτης',
  free:       'Δωρεάν',
  individual: 'Individual',
  agency:     'Agency',
  enterprise: 'Enterprise',
}

export function limitsFor(plan: PlanName): PlanLimits {
  return PLANS[plan] ?? PLANS.anon
}

/** True for the tiers that are actually being paid for. */
export function isPaidPlan(plan: PlanName): boolean {
  return PAID_PLANS.includes(plan)
}

/**
 * The smallest page allowance across all plans. The search route checks this
 * before spending an auth lookup — anything at or below it is reachable by
 * everyone, so there is nothing to verify.
 */
export const MIN_SEARCH_PAGES = Math.min(
  ...Object.values(PLANS).map(p => p.maxSearchPages)
)

/**
 * Rows per page of search results. Lives here rather than in auth.ts because
 * every page cap above is meaningless without it — `maxSearchPages` only means
 * something once you know a page is 50 rows. auth.ts re-exports it so existing
 * importers keep working.
 */
export const PAGE_SIZE = 50

/** "5 σελίδες (250 εγγραφές)" — keeps pages and rows from ever disagreeing. */
export function pagesLabel(pages: number): string {
  const rows = pages * PAGE_SIZE
  return `${formatLimit(pages)} σελίδες (${formatLimit(rows)} εγγραφές)`
}

/** `Infinity` must never reach a SQL LIMIT or a UI counter. */
export function isUnlimited(n: number): boolean {
  return !Number.isFinite(n)
}

/** Renders a limit for display: 50 → "50", Infinity → "απεριόριστες". */
export function formatLimit(n: number, unlimited = 'απεριόριστες'): string {
  return isUnlimited(n) ? unlimited : n.toLocaleString('el-GR')
}

/**
 * How many more rows may be written into a list, given what it already holds.
 * Clamped at 0 so a full list can never produce a negative SQL LIMIT.
 */
export function remainingCapacity(plan: PlanName, currentMembers: number): number {
  const max = limitsFor(plan).maxMembersPerList
  if (isUnlimited(max)) return limitsFor(plan).maxBulkAdd
  return Math.max(0, max - currentMembers)
}
