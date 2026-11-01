// Atomic quota check-and-increment (data-model §3.1). All of a request's counters run in ONE transaction:
// if any statement returns no row the transaction rolls back, nothing is consumed, and the caller gets the
// counter that tripped. Tested with concurrent callers in db/quota.test.ts.
import { sql } from "drizzle-orm"
import type { DbOrTx } from "./client"

export type QuotaPeriod = "day" | "minute"

export interface QuotaCharge {
  /** 'user:{uuid}' | 'visitor:{hash}' | 'ip:{hmac}' | 'ipnet:{hmac}' | 'pot:{dao}' | 'proposal:{dao}:{id}' | 'account:{id}' | 'global' */
  subject: string
  /** a family ('contribute', 'spend', …) or a counter ('relay_yocto', 'burst', …) */
  action: string
  /** increment: 1, or a yocto / base-unit amount */
  amount: bigint
  /** inclusive upper bound for the bucket after the increment */
  limit: bigint
  period?: QuotaPeriod
  /** carried back to the caller to pick the error (family, cause); never used in SQL */
  tag?: string
}

export type QuotaResult = { ok: true; values: bigint[] } | { ok: false; failed: QuotaCharge; index: number }

const periodSql = (p: QuotaPeriod) =>
  p === "minute"
    ? sql`date_trunc('minute', now())`
    : sql`(date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc')`

class QuotaExceeded extends Error {
  constructor(
    readonly charge: QuotaCharge,
    readonly index: number,
  ) {
    super("quota exceeded")
  }
}

async function chargeOne(tx: DbOrTx, c: QuotaCharge): Promise<bigint | null> {
  const res = await tx.execute<{ n: string }>(sql`
    INSERT INTO quota_usage (subject, action, period_start, n)
    VALUES (${c.subject}, ${c.action}, ${periodSql(c.period ?? "day")}, ${c.amount.toString()}::numeric)
    ON CONFLICT (subject, action, period_start)
    DO UPDATE SET n = quota_usage.n + EXCLUDED.n
    WHERE quota_usage.n + EXCLUDED.n <= ${c.limit.toString()}::numeric
    RETURNING n`)
  const row = res.rows[0]
  if (!row) return null
  // A first insert bypasses the WHERE: enforce the limit for it too (an increment larger than the limit).
  const n = BigInt(row.n)
  return n <= c.limit ? n : null
}

const key = (c: QuotaCharge) => `${c.subject}\u0000${c.action}\u0000${c.period ?? "day"}`

/** Charge every counter or none. A charge whose first insert already exceeds its limit also fails. */
export async function chargeQuotas(db: DbOrTx, charges: QuotaCharge[]): Promise<QuotaResult> {
  if (charges.length === 0) return { ok: true, values: [] }
  // A fixed lock order (subject, action, period) so concurrent multi-counter charges can't deadlock.
  const ordered = charges
    .map((c, i) => ({ c, i }))
    .sort((a, b) => key(a.c).localeCompare(key(b.c)))
  try {
    const values = await db.transaction(async (tx) => {
      const out: bigint[] = new Array<bigint>(charges.length)
      for (const { c, i } of ordered) {
        const n = await chargeOne(tx, c)
        if (n === null) throw new QuotaExceeded(c, i)
        out[i] = n
      }
      return out
    })
    return { ok: true, values }
  } catch (e) {
    if (e instanceof QuotaExceeded) return { ok: false, failed: e.charge, index: e.index }
    throw e
  }
}

/** Correct a pre-charge to the actual amount (delta may be negative); no limit check. */
export async function adjustQuota(
  db: DbOrTx,
  subjects: string[],
  action: string,
  delta: bigint,
  period: QuotaPeriod = "day",
): Promise<void> {
  if (delta === 0n || subjects.length === 0) return
  await db.execute(sql`
    UPDATE quota_usage SET n = GREATEST(n + ${delta.toString()}::numeric, 0)
    WHERE subject IN (${sql.join(
      subjects.map((s) => sql`${s}`),
      sql`, `,
    )}) AND action = ${action} AND period_start = ${periodSql(period)}`)
}

/** Current value of a counter (0 when the bucket doesn't exist). */
export async function readQuota(db: DbOrTx, subject: string, action: string, period: QuotaPeriod = "day") {
  const res = await db.execute<{ n: string }>(sql`
    SELECT n FROM quota_usage WHERE subject = ${subject} AND action = ${action} AND period_start = ${periodSql(period)}`)
  return BigInt(res.rows[0]?.n ?? "0")
}

/** Start of the next UTC day (resetsAt for daily quotas). */
export function nextUtcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
}
