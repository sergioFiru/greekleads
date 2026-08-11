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
