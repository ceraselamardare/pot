// Lease SQL (data-model §3.2). Pools ('relayer_key', 'treasury_key', 'mpc_slot') claim one free row with
// FOR UPDATE SKIP LOCKED in random order; single-flight named leases ('cron:reconcile', 'demo_signer:{a}', …)
// upsert with a WHERE on expiry. The lease table replaces advisory locks (PgBouncer transaction mode).
import { sql } from "drizzle-orm"
import type { DbOrTx } from "./client"

export interface PoolLease {
  name: string
  meta: Record<string, unknown> | null
}

export async function claimPoolLease(
  db: DbOrTx,
  pool: string,
  holder: string,
  ttlSec: number,
): Promise<PoolLease | null> {
  const res = await db.execute<{ name: string; meta: Record<string, unknown> | null }>(sql`
    UPDATE lease SET holder = ${holder}, until = now() + make_interval(secs => ${ttlSec})
    WHERE name = (
      SELECT name FROM lease
      WHERE starts_with(name, ${pool + ":"})
        AND (until IS NULL OR until < now())
      ORDER BY random() LIMIT 1
      FOR UPDATE SKIP LOCKED)
    RETURNING name, meta`)
  return res.rows[0] ?? null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Poll for a free pool member (api-spec §3.3: every 150 ms for up to 3 s). */
export async function claimPoolLeaseWait(
  db: DbOrTx,
  pool: string,
  holder: string,
  ttlSec: number,
  opts: { waitMs?: number; pollMs?: number } = {},
): Promise<PoolLease | null> {
  const deadline = Date.now() + (opts.waitMs ?? 3_000)
  for (;;) {
    const got = await claimPoolLease(db, pool, holder, ttlSec)
    if (got) return got
    if (Date.now() >= deadline) return null
    await sleep(opts.pollMs ?? 150)
  }
}

/** Release a lease; only the holder can. */
export async function releaseLease(db: DbOrTx, name: string, holder: string): Promise<boolean> {
  const res = await db.execute(sql`UPDATE lease SET holder = NULL, until = NULL WHERE name = ${name} AND holder = ${holder}`)
  return (res.rowCount ?? 0) > 0
}

/** Extend a held lease (long txs, MPC). */
export async function extendLease(db: DbOrTx, name: string, holder: string, ttlSec: number): Promise<boolean> {
  const res = await db.execute(
    sql`UPDATE lease SET until = now() + make_interval(secs => ${ttlSec}) WHERE name = ${name} AND holder = ${holder}`,
  )
  return (res.rowCount ?? 0) > 0
}

/** Single-flight named lease. Returns false when someone else holds it. */
export async function claimNamedLease(db: DbOrTx, name: string, holder: string, ttlSec: number): Promise<boolean> {
  const res = await db.execute(sql`
    INSERT INTO lease (name, holder, until) VALUES (${name}, ${holder}, now() + make_interval(secs => ${ttlSec}))
    ON CONFLICT (name) DO UPDATE SET holder = EXCLUDED.holder, until = EXCLUDED.until
    WHERE lease.until IS NULL OR lease.until < now()
    RETURNING name`)
  return res.rows.length > 0
}

/** The key's last broadcast nonce (only by the holder): the next holder signs above it even if its RPC lags. */
export async function setLastNonce(db: DbOrTx, name: string, holder: string, nonce: bigint): Promise<void> {
  await db.execute(sql`
    UPDATE lease SET meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('lastNonce', ${nonce.toString()}::text)
    WHERE name = ${name} AND holder = ${holder}`)
}

/**
 * Make the pool rows match the loaded keys: `pool:0..n-1` with `meta.publicKey`, and no rows beyond n.
 * Public keys only, never secrets (data-model §7). Idempotent; runs once per instance per pool.
 */
export async function ensurePoolRows(db: DbOrTx, pool: string, metas: Record<string, unknown>[]): Promise<void> {
  for (const [i, meta] of metas.entries()) {
    await db.execute(sql`
      INSERT INTO lease (name, meta) VALUES (${`${pool}:${i}`}, ${JSON.stringify(meta)}::jsonb)
      ON CONFLICT (name) DO UPDATE SET meta = EXCLUDED.meta
      WHERE lease.meta->>'publicKey' IS DISTINCT FROM EXCLUDED.meta->>'publicKey'`)
  }
  await db.execute(sql`
    DELETE FROM lease WHERE starts_with(name, ${pool + ":"})
      AND split_part(name, ':', 2) ~ '^[0-9]+$' AND split_part(name, ':', 2)::int >= ${metas.length}`)
}
