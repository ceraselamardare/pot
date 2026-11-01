// B-01 DB integration tests against the local pot_test database (infra/docker-compose.yml).
// data-model §3 patterns: quotas (20 concurrent callers vs a limit of 3 → exactly 3), multi-counter
// all-or-nothing, leases (A-18: 8 concurrent claims → 8 distinct keys, the 9th is busy), single-flight leases.
import { fileURLToPath } from "node:url"
import { sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Pool } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { claimAlert } from "./alert"
import {
  claimNamedLease,
  claimPoolLease,
  claimPoolLeaseWait,
  ensurePoolRows,
  extendLease,
  releaseLease,
} from "./lease"
import { adjustQuota, chargeQuotas, nextUtcDay, readQuota } from "./quota"
import { createTestDb, TEST_DATABASE_URL, type TestDb } from "./testing"

let t: TestDb

beforeAll(async () => {
  t = await createTestDb("db", 30)
})
afterAll(async () => {
  await t.close()
})
beforeEach(async () => {
  await t.truncate()
})

describe("migrations", () => {
  it("apply with drizzle's migrator to pot_test (idempotent, under an advisory lock)", async () => {
    const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 })
    const client = await pool.connect()
    try {
      await client.query("SELECT pg_advisory_lock(424242)")
      const db = drizzle(client)
      const folder = fileURLToPath(new URL("./migrations", import.meta.url))
      await migrate(db, { migrationsFolder: folder })
      await migrate(db, { migrationsFolder: folder }) // second run is a no-op
      const res = await client.query(
        "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('relay_log','quota_usage','lease','session','app_user','demo_pot')",
      )
      expect(res.rows[0].n).toBe(6)
    } finally {
      await client.query("SELECT pg_advisory_unlock(424242)")
      client.release()
      await pool.end()
    }
  })
})

describe("quotas (data-model §3.1)", () => {
  it("20 concurrent callers against a limit of 3 → exactly 3 succeed", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        chargeQuotas(t.db, [{ subject: "user:a", action: "create", amount: 1n, limit: 3n }]),
      ),
    )
    expect(results.filter((r) => r.ok)).toHaveLength(3)
    expect(await readQuota(t.db, "user:a", "create")).toBe(3n)
  })

  it("is all or nothing across counters: a later failure consumes nothing", async () => {
    await chargeQuotas(t.db, [{ subject: "global", action: "relays", amount: 5n, limit: 5n }])
    const r = await chargeQuotas(t.db, [
      { subject: "user:b", action: "contribute", amount: 1n, limit: 20n },
      { subject: "user:b", action: "relay_yocto", amount: 10n, limit: 100n },
      { subject: "global", action: "relays", amount: 1n, limit: 5n, tag: "global_cap" },
    ])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.failed.tag).toBe("global_cap")
      expect(r.index).toBe(2)
    }
    expect(await readQuota(t.db, "user:b", "contribute")).toBe(0n)
    expect(await readQuota(t.db, "user:b", "relay_yocto")).toBe(0n)
  })

  it("concurrent multi-counter charges with overlapping subjects never deadlock and respect the global cap", async () => {
    const runs = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        chargeQuotas(t.db, [
          { subject: `user:${i % 5}`, action: "vote", amount: 1n, limit: 100n },
          { subject: "global", action: "relay_yocto", amount: 1000n, limit: 10_000n },
          { subject: `pot:p${i % 3}`, action: "vote", amount: 1n, limit: 500n },
        ]),
      ),
    )
    expect(runs.filter((r) => r.ok)).toHaveLength(10)
    expect(await readQuota(t.db, "global", "relay_yocto")).toBe(10_000n)
    let users = 0n
    for (let i = 0; i < 5; i++) users += await readQuota(t.db, `user:${i}`, "vote")
    expect(users).toBe(10n)
  })

  it("an increment larger than the limit fails even on an empty bucket", async () => {
    const r = await chargeQuotas(t.db, [{ subject: "user:c", action: "faucet_usd", amount: 600n, limit: 500n }])
    expect(r.ok).toBe(false)
    expect(await readQuota(t.db, "user:c", "faucet_usd")).toBe(0n)
  })

  it("minute buckets are separate from day buckets", async () => {
    await chargeQuotas(t.db, [{ subject: "user:d", action: "burst", amount: 1n, limit: 20n, period: "minute" }])
    expect(await readQuota(t.db, "user:d", "burst", "minute")).toBe(1n)
    expect(await readQuota(t.db, "user:d", "burst", "day")).toBe(0n)
  })

  it("adjusts a yocto pre-charge to the actual cost for the user and global rows, never below 0", async () => {
    await chargeQuotas(t.db, [
      { subject: "user:e", action: "relay_yocto", amount: 3000n, limit: 10n ** 24n },
      { subject: "global", action: "relay_yocto", amount: 3000n, limit: 10n ** 24n },
    ])
    await adjustQuota(t.db, ["global", "user:e"], "relay_yocto", -2500n)
    expect(await readQuota(t.db, "user:e", "relay_yocto")).toBe(500n)
    expect(await readQuota(t.db, "global", "relay_yocto")).toBe(500n)
    await adjustQuota(t.db, ["user:e"], "relay_yocto", -9999n)
    expect(await readQuota(t.db, "user:e", "relay_yocto")).toBe(0n)
  })

  it("uses UTC day buckets (resetsAt = next UTC midnight)", async () => {
    await chargeQuotas(t.db, [{ subject: "user:f", action: "x", amount: 1n, limit: 9n }])
    const res = await t.db.execute<{ p: Date }>(sql`SELECT period_start AS p FROM quota_usage WHERE subject = 'user:f'`)
    const p = new Date(res.rows[0]!.p)
    expect(p.getUTCHours()).toBe(0)
    expect(p.getUTCMinutes()).toBe(0)
    expect(nextUtcDay(new Date("2026-11-03T23:59:59Z")).toISOString()).toBe("2026-11-04T00:00:00.000Z")
  })
})

describe("leases (data-model §3.2, A-18)", () => {
  beforeEach(async () => {
    await ensurePoolRows(
      t.db,
      "relayer_key",
      Array.from({ length: 8 }, (_, i) => ({ publicKey: `ed25519:k${i}` })),
    )
  })

  it("8 concurrent claims get 8 distinct keys; the 9th is busy", async () => {
    const got = await Promise.all(
      Array.from({ length: 8 }, (_, i) => claimPoolLease(t.db, "relayer_key", `req${i}`, 30)),
    )
    const names = got.map((g) => g?.name)
    expect(names.every(Boolean)).toBe(true)
    expect(new Set(names).size).toBe(8)
    expect(got[0]?.meta).toHaveProperty("publicKey")
    const t0 = Date.now()
    const ninth = await claimPoolLeaseWait(t.db, "relayer_key", "req9", 30, { waitMs: 400, pollMs: 100 })
    expect(ninth).toBeNull()
    expect(Date.now() - t0).toBeGreaterThanOrEqual(380)
  })

  it("a released key can be claimed again; only the holder can release", async () => {
    const all = await Promise.all(
      Array.from({ length: 8 }, (_, i) => claimPoolLease(t.db, "relayer_key", `h${i}`, 30)),
    )
    const first = all[0]!
    expect(await releaseLease(t.db, first.name, "someone-else")).toBe(false)
    expect(await releaseLease(t.db, first.name, "h0")).toBe(true)
    const again = await claimPoolLeaseWait(t.db, "relayer_key", "h9", 30, { waitMs: 500 })
    expect(again?.name).toBe(first.name)
  })

  it("an expired lease is free again", async () => {
    const all = await Promise.all(
      Array.from({ length: 8 }, (_, i) => claimPoolLease(t.db, "relayer_key", `e${i}`, 30)),
    )
    await t.db.execute(sql`UPDATE lease SET until = now() - interval '1 second' WHERE name = ${all[3]!.name}`)
    const got = await claimPoolLease(t.db, "relayer_key", "late", 30)
    expect(got?.name).toBe(all[3]!.name)
    expect(await extendLease(t.db, got!.name, "late", 60)).toBe(true)
  })

  it("pools don't leak into each other ('_' is not a wildcard)", async () => {
    await ensurePoolRows(t.db, "mpc_slot", [{}, {}])
    await ensurePoolRows(t.db, "relayer_kex", [{}])
    const got = await Promise.all(Array.from({ length: 3 }, (_, i) => claimPoolLease(t.db, "mpc_slot", `m${i}`, 60)))
    expect(got.filter(Boolean).map((g) => g!.name).sort()).toEqual(["mpc_slot:0", "mpc_slot:1"])
  })

  it("ensurePoolRows shrinks the pool when keys are removed", async () => {
    await ensurePoolRows(t.db, "relayer_key", [{ publicKey: "ed25519:a" }, { publicKey: "ed25519:b" }])
    const res = await t.db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM lease WHERE starts_with(name, 'relayer_key:')`,
    )
    expect(res.rows[0]!.n).toBe(2)
  })

  it("a named single-flight lease has exactly one holder under concurrency", async () => {
    const wins = await Promise.all(
      Array.from({ length: 15 }, (_, i) => claimNamedLease(t.db, "cron:reconcile", `run${i}`, 900)),
    )
    expect(wins.filter(Boolean)).toHaveLength(1)
  })
})

describe("alerts (data-model §3.4)", () => {
  it("sends at most once per hour per key", async () => {
    const r = await Promise.all(Array.from({ length: 5 }, () => claimAlert(t.db, "relayer_low")))
    expect(r.filter(Boolean)).toHaveLength(1)
    await t.db.execute(sql`UPDATE alert_state SET last_sent_at = now() - interval '61 minutes'`)
    expect(await claimAlert(t.db, "relayer_low")).toBe(true)
  })
})
