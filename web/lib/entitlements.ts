// ── Plan limits — the single source of truth ──────────────────────────
//
// Every gate in the app (UI and API) reads from this file. When the real tiers
// and prices are settled, edit PLANS and nothing else changes; adding a third
// tier is one key here plus a label in PLAN_LABELS.
//
// Rule: never hard-code a limit in a component or a route. Import from here.

export type PlanName = 'free' | 'paid'

export interface PlanLimits {
  /** How many lists the user may own. */
  maxLists: number
  /** Ceiling on members in any one list. */
  maxMembersPerList: number
  /** How many saved filter sets the user may keep. */
  maxSavedSearches: number
  /**
   * Hard ceiling on a single "add all results" operation, independent of
   * maxMembersPerList. An unbounded INSERT..SELECT over a 1.6M-row table is a
   * very slow query and produces a list nothing can render, so even unlimited
   * plans get a per-operation cap. Past this, narrowing the filters is the
   * honest answer.
   */
  maxBulkAdd: number
  /** "Bring it Alive" — auto-add newly incorporated matches. Not built yet. */
  canBringAlive: boolean
  canExportCsv: boolean
  /** Push a list to Instantly / HubSpot. Not built yet. */
  canIntegrate: boolean
}

export const PLANS: Record<PlanName, PlanLimits> = {
  free: {
    maxLists:          1,
    maxMembersPerList: 50,
    maxSavedSearches:  3,
    maxBulkAdd:        50,
    canBringAlive:     false,
    canExportCsv:      false,
    canIntegrate:      false,
  },
  paid: {
    maxLists:          Infinity,
    maxMembersPerList: Infinity,
    maxSavedSearches:  Infinity,
    maxBulkAdd:        10_000,
    canBringAlive:     true,
    canExportCsv:      true,
    canIntegrate:      true,
  },
}

export const PLAN_LABELS: Record<PlanName, string> = {
  free: 'Δωρεάν',
  paid: 'Πρόσβαση',
}

export function limitsFor(plan: PlanName): PlanLimits {
  return PLANS[plan] ?? PLANS.free
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
