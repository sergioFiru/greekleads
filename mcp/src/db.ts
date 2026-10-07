import { Pool, type QueryResultRow } from 'pg'
import { config } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// scripts/.env is the one place DATABASE_URL already lives for every other
// Railway service in this repo, so the MCP reads the same file rather than
// introducing a second copy that can go stale. On Railway the variable is set
// in the environment and this load is a no-op.
const here = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(here, '../../scripts/.env'), quiet: true })

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Locally it comes from scripts/.env; on Railway set it in the service variables.',
  )
}

/**
 * Small pool on purpose.
 *
 * An MCP client is one person asking one question at a time, not a website
 * under load, and Railway Postgres connections are a limited shared resource
 * that the web app and the bots are already using.
 */
export const pool = new Pool({
  connectionString,
  max: 4,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
})

/**
 * Every query goes through a statement timeout.
 *
 * Measured on this database: an unfiltered COUNT(*) is ~2.3s, people search
 * with a HAVING clause ~6.2s, and ranking people by company count 12.3s. A
 * model can and will ask for something unbounded, and without a cap that
 * becomes a hung tool call holding a connection the website also needs.
 */
export async function query<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  timeoutMs = 15_000,
): Promise<T[]> {
  const client = await pool.connect()
  try {
    // SET, not SET LOCAL: LOCAL only applies inside a transaction and is a
    // silent no-op outside one, which would have made this timeout decorative.
    // Session scope is safe here because every query sets it before running.
    await client.query(`SET statement_timeout = ${Math.floor(timeoutMs)}`)
    const res = await client.query<T>(sql, params as never[])
    return res.rows
  } finally {
    client.release()
  }
}

export async function queryOne<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  timeoutMs = 15_000,
): Promise<T | null> {
  const rows = await query<T>(sql, params, timeoutMs)
  return rows[0] ?? null
}
