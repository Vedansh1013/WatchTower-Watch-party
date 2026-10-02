import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const { Pool } = pg
const schemaFile = fileURLToPath(new URL('./migrations/001_auth.sql', import.meta.url))

export function prepareDatabaseUrl(value) {
  const connectionString = String(value || '').trim()

  try {
    const url = new URL(connectionString)
    const isRenderPostgres = url.hostname.endsWith('.render.com') && url.hostname.includes('-postgres.render.com')

    // Render's external Postgres endpoint requires TLS. Its dashboard normally
    // supplies sslmode=require, but adding it here keeps local setup reliable
    // when a copied connection URL does not include the query parameter.
    if (isRenderPostgres && !url.searchParams.has('sslmode')) {
      url.searchParams.set('sslmode', 'require')
    }

    return url.toString()
  } catch {
    return connectionString
  }
}

export function createDatabasePool() {
  const connectionString = prepareDatabaseUrl(process.env.DATABASE_URL)

  if (!connectionString) {
    throw new Error('DATABASE_URL is missing. Add your PostgreSQL connection URL to .env before starting Watchtower.')
  }

  const pool = new Pool({
    connectionString,
    max: Math.min(Math.max(Number(process.env.DB_POOL_MAX) || 10, 1), 20),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })

  pool.on('error', (error) => {
    console.error('Unexpected PostgreSQL pool error:', error)
  })

  return pool
}

export async function initialiseDatabase(pool) {
  const schema = await readFile(schemaFile, 'utf8')
  const statements = schema.split(';').map((statement) => statement.trim()).filter(Boolean)
  for (const statement of statements) {
    await pool.query(statement)
  }
}

export async function verifyDatabase(pool) {
  await pool.query('SELECT 1 AS connected')
}
