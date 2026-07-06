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
