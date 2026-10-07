import { createHash } from 'node:crypto'
import { query, queryOne } from '@/lib/db'

// ── Anonymous quota for /api/scout ─────────────────────────────────────
//
// Scout is the conversion demo: a visitor from Google describes who they sell
// to, sees a real prospect count, and that is the moment worth asking them to
// sign up. Gating it before the first run removes the thing that converts.
//
// So: one real run, then the wall. The count has to be server-side — a
// localStorage counter is cleared with the cookies, and every run costs an
// OpenRouter call.

/** Free runs an anonymous visitor gets per day. */
export const ANON_SCOUT_RUNS = 1

/**
 * An IP address is personal data under GDPR, and we never need to know WHICH
 * address ran a brief — only whether THIS one has already had its free run
 * today. A salted hash answers that and stores nothing identifying.
 *
 * Rotating SCOUT_IP_SALT resets every counter, which is a safe way to fail.
 */
function hashIp(ip: string): string {
  const salt = process.env.SCOUT_IP_SALT
  if (!salt) {
    console.warn('[scoutQuota] SCOUT_IP_SALT not set — using a weak default salt')
  }
  return createHash('sha256').update(`${salt ?? 'greekleads-dev-salt'}:${ip}`).digest('hex')
}

/**
 * The caller's IP as the platform reports it.
 *
 * x-forwarded-for is a CHAIN — "client, proxy1, proxy2" — and the client is
 * first. Taking the whole header would make every distinct proxy path look
 * like a different visitor and hand out a free run each time.
 */
export function clientIp(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  return headers.get('x-real-ip')?.trim() || 'unknown'
}

export interface QuotaResult {
  allowed: boolean
  used: number
  limit: number
}

/**
 * Count one anonymous run and say whether it was allowed.
 *
 * The INSERT ... ON CONFLICT does the read and the write in ONE statement, so
 * two requests racing from the same IP cannot both see "0 used" and both pass.
 * `runs` is returned AFTER incrementing, so the first run comes back as 1.
 *
 * Fails OPEN: if the table is missing or the database is unreachable, the run
 * is allowed. A visitor hitting a wall because of our outage is worse than one
 * extra Gemini call, and the table may legitimately not exist yet.
 */
export async function consumeAnonScoutRun(ip: string): Promise<QuotaResult> {
  const ipHash = hashIp(ip)
  try {
    const row = await queryOne<{ runs: number }>(
      `INSERT INTO scout_usage (ip_hash, day, runs)
            VALUES ($1, CURRENT_DATE, 1)
       ON CONFLICT (ip_hash, day)
       DO UPDATE SET runs = scout_usage.runs + 1, last_seen = now()
         RETURNING runs`,
      [ipHash],
    )
    const used = row?.runs ?? 1
    return { allowed: used <= ANON_SCOUT_RUNS, used, limit: ANON_SCOUT_RUNS }
  } catch (err) {
    console.error('[scoutQuota] quota check failed, allowing the run:', err)
    return { allowed: true, used: 0, limit: ANON_SCOUT_RUNS }
  }
}

/**
 * Give a consumed run back.
 *
 * The quota is spent BEFORE the Gemini call, which is right for cost control —
 * two concurrent requests must not both pass a "have you used it?" check. But
 * it means a failure on OpenRouter's side burns the visitor's only free run and
 * shows them an error, which is the worst possible first impression and not
 * hypothetical: an empty OpenRouter balance has blocked work on this project
 * before.
 *
 * Floors at zero so a double refund cannot hand out extra runs.
 */
export async function refundAnonScoutRun(ip: string): Promise<void> {
  const ipHash = hashIp(ip)
  try {
    await query(
      `UPDATE scout_usage
          SET runs = GREATEST(runs - 1, 0)
        WHERE ip_hash = $1 AND day = CURRENT_DATE`,
      [ipHash],
    )
  } catch (err) {
    console.error('[scoutQuota] refund failed:', err)
  }
}

/** Housekeeping: one row per visitor per day adds up. Call from a bot, not a request. */
export async function pruneScoutUsage(olderThanDays = 30): Promise<number> {
  const rows = await query<{ n: string }>(
    `WITH gone AS (
       DELETE FROM scout_usage WHERE day < CURRENT_DATE - $1::int RETURNING 1
     ) SELECT count(*)::text AS n FROM gone`,
    [olderThanDays],
  )
  return parseInt(rows[0]?.n ?? '0', 10)
}
