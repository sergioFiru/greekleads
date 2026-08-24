import { Pool } from 'pg'

let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
  }
  return pool
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await getPool().connect()
  try {
    const result = await client.query(sql, params)
    return result.rows as T[]
  } finally {
    client.release()
  }
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

export async function queryWithTimeout<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
  timeoutMs = 5000
): Promise<T[]> {
  const client = await getPool().connect()
  try {
    await client.query(`SET statement_timeout = ${timeoutMs}`)
    const result = await client.query(sql, params)
    return result.rows as T[]
  } finally {
    await client.query('SET statement_timeout = 0').catch(() => {})
    client.release()
  }
}

// Lowers pg_trgm's word-similarity cutoff for one query, on one connection, then
// resets it — same pattern as queryWithTimeout above. The `<%` / `%>` operators
// only use the trigram GIN index (fast) when compared against this GUC; a plain
// `word_similarity(...) > threshold` function call in a WHERE clause does NOT use
// the index and forces a full table scan (measured: 2.9s vs 3.6ms for the same
// query, indexed). So this exists specifically to keep a lowered-threshold fuzzy
// match index-accelerated.
export async function queryWithTrigramThreshold<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] | undefined,
  threshold: number
): Promise<T[]> {
  const client = await getPool().connect()
  try {
    await client.query(`SET pg_trgm.word_similarity_threshold = ${threshold}`)
    const result = await client.query(sql, params)
    return result.rows as T[]
  } finally {
    await client.query('SET pg_trgm.word_similarity_threshold = 0.6').catch(() => {})
    client.release()
  }
}

/**
 * Runs a query with parallel workers disabled, plus a statement timeout.
 *
 * Why: the search filters produce plans like
 *
 *     Parallel Bitmap Heap Scan
 *       BitmapAnd
 *         Bitmap Index Scan prefecture   ~716k rows
 *         Bitmap Index Scan email        ~1.07M rows
 *         Bitmap Index Scan status       ~1.34M rows
 *
 * In a PARALLEL plan that combined ~3.1M-pointer bitmap has to live in shared
 * memory so every worker can read it. dynamic_shared_memory_type is 'posix', so
 * that means /dev/shm — which is 64MB in a container. Under concurrency it fills
 * and Postgres throws:
 *
 *     could not resize shared memory segment "/PostgreSQL.NNN" to N bytes:
 *     No space left on device
 *
 * which reads like a full disk but is nothing of the sort. Serially, the same
 * bitmap is built in the backend's own private memory, where this cannot happen.
 *
 * Cost: measured 617ms -> 990ms on a representative filtered COUNT. Slower, but
 * it always completes.
 *
 * NOTE: do NOT "fix" this by raising work_mem. The shared bitmap may grow up to
 * work_mem, so a larger value asks /dev/shm for a BIGGER segment and fails more
 * often, not less.
 */
export async function queryNoParallel<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
  timeoutMs = 15000
): Promise<T[]> {
  const client = await getPool().connect()
  try {
    await client.query(`SET max_parallel_workers_per_gather = 0`)
    await client.query(`SET statement_timeout = ${timeoutMs}`)
    const result = await client.query(sql, params)
    return result.rows as T[]
  } finally {
    // Pooled connections are reused, so both GUCs must be reset even on error —
    // otherwise every later query on this connection inherits them.
    await client.query('RESET max_parallel_workers_per_gather').catch(() => {})
    await client.query('SET statement_timeout = 0').catch(() => {})
    client.release()
  }
}
