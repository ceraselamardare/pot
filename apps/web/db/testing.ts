// Test-only DB helpers. Each test file gets its own Postgres schema in `pot_test`, built from the committed
// migration SQL, so files can run in parallel and truncate freely. Never imported by app code.
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import type { Db } from "./client"
import * as schema from "./schema"

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? "postgres://pot:pot@localhost:54329/pot_test"

const MIGRATIONS = fileURLToPath(new URL("./migrations", import.meta.url))

export function migrationStatements(schemaName: string): string[] {
  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
  return files.flatMap((f) =>
    readFileSync(join(MIGRATIONS, f), "utf8")
      .replaceAll('"public".', `"${schemaName}".`)
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean),
  )
}

export interface TestDb {
  db: Db
  pool: Pool
  schemaName: string
  close: () => Promise<void>
  truncate: () => Promise<void>
}

/** A fresh, migrated schema `t_<name>` with a pool whose search_path points at it. */
export async function createTestDb(name: string, max = 10): Promise<TestDb> {
  const schemaName = `t_${name.replace(/[^a-z0-9_]/gi, "_").toLowerCase()}`
  const admin = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 })
  try {
    await admin.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
    await admin.query(`CREATE SCHEMA "${schemaName}"`)
    await admin.query(`SET search_path TO "${schemaName}"`)
    for (const stmt of migrationStatements(schemaName)) await admin.query(stmt)
  } finally {
    await admin.end()
  }
  const pool = new Pool({
    connectionString: TEST_DATABASE_URL,
    max,
    options: `-c search_path=${schemaName}`,
  })
  const db = drizzle(pool, { schema })
  const tables = Object.values(schema)
    .filter((t): t is (typeof schema)["appUser"] => typeof t === "object" && t !== null && Symbol.for("drizzle:Name") in t)
    .map((t) => (t as unknown as Record<symbol, string>)[Symbol.for("drizzle:Name")])
  return {
    db,
    pool,
    schemaName,
    close: async () => {
      await pool.end()
    },
    truncate: async () => {
      await pool.query(`TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`)
    },
  }
}
