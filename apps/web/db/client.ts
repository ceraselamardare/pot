// Runtime DB client (data-model §6): one small pg.Pool per instance, attached to Vercel Fluid with
// attachDatabasePool so idle clients close before the instance suspends. The pool is created lazily so
// importing this module never opens a connection (builds, unit tests).
import "server-only"
import { attachDatabasePool } from "@vercel/functions"
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

export type Db = NodePgDatabase<typeof schema>
/** A Db or a transaction handle (both expose select/insert/update/execute). */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0]

let pool: Pool | undefined
let db: Db | undefined

export function createDb(connectionString: string, max = 5): { db: Db; pool: Pool } {
  const p = new Pool({ connectionString, max, idleTimeoutMillis: 5_000 })
  return { db: drizzle(p, { schema }), pool: p }
}

export function getDb(): Db {
  if (db) return db
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set")
  const created = createDb(url)
  pool = created.pool
  attachDatabasePool(pool)
  db = created.db
  return db
}

/** Tests inject their own client (pot_test). */
export function setDbForTests(next: Db | undefined): void {
  db = next
}

export { schema }
