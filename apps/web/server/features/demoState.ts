// GET /api/demo/state (X-08; api-spec §2.8): the public JSON twin for judges. Chain reads for the reference
// (and tonight's shared) Pot, DB counts for the pool, ready-to-run near-cli-rs 0.30.1 view commands.
import "server-only"
import { desc, eq, inArray, sql } from "drizzle-orm"
import type { Db } from "@/db/client"
import { appUser, demoPot } from "@/db/schema"
import type { HubReader } from "../chain/hub"
import type { Config } from "../config"

export interface DemoPotPublic {
  potId: string
  slug: string
  name: string
  balance: string
  members: { account: string; name: string; contributed: string }[]
  requests: { proposalId: number; requester: string; amount: string; category: string; status: string }[]
  explorerUrl: string
}

async function potPublic(db: Db, hub: HubReader, cfg: Config, potId: string): Promise<DemoPotPublic | null> {
  const v = await hub.getPot(potId).catch(() => null)
  if (!v) return null
  const [members, balance, requests] = await Promise.all([
    hub.getMembers(potId).catch(() => []),
    hub.ftBalanceOf(cfg.usdcId, potId).catch(() => 0n),
    hub.getRequests(potId, Math.max(0, v.request_count - 10), 10).catch(() => []),
  ])
  const accounts = members.map((m) => m.account_id)
  const names = accounts.length
    ? await db.select({ a: appUser.nearAccount, n: appUser.displayName }).from(appUser).where(inArray(appUser.nearAccount, accounts))
    : []
  const byAccount = new Map(names.map((x) => [x.a, x.n]))
  return {
    potId,
    slug: v.slug,
    name: v.name,
    balance: balance.toString(),
    members: members.map((m) => ({ account: m.account_id, name: byAccount.get(m.account_id) ?? m.account_id.split(".")[0]!, contributed: m.contributed })),
    requests: requests
      .filter((r) => r.proposal_id !== null)
      .map((r) => ({ proposalId: r.proposal_id!, requester: r.requester, amount: r.amount, category: r.category, status: r.status })),
    explorerUrl: `${cfg.explorerUrl}/address/${potId}`,
  }
}

export async function demoState(deps: { db: Db; hub: HubReader; cfg: Config }): Promise<Record<string, unknown>> {
  const { db, hub, cfg } = deps
  const ref = cfg.demoReferencePot
  const sharedRow = (
    await db.select().from(demoPot).where(eq(demoPot.kind, "shared")).orderBy(desc(demoPot.createdAt)).limit(1)
  )[0]
  const counts = await db.execute<{ ready: number; leased: number }>(sql`
    SELECT count(*) FILTER (WHERE state = 'ready')::int AS ready, count(*) FILTER (WHERE state = 'leased')::int AS leased
    FROM demo_pot WHERE kind = 'pool'`)
  const [reference, shared] = await Promise.all([
    ref ? potPublic(db, hub, cfg, ref) : Promise.resolve(null),
    sharedRow?.potId ? potPublic(db, hub, cfg, sharedRow.potId) : Promise.resolve(null),
  ])
  const net = `network-config ${cfg.network} now`
  return {
    network: cfg.network,
    hubId: cfg.hubId,
    usdcId: cfg.usdcId,
    reference,
    ...(shared ? { shared } : {}),
    pool: {
      ready: counts.rows[0]?.ready ?? 0,
      leased: counts.rows[0]?.leased ?? 0,
      target: Number(process.env.DEMO_POOL_TARGET ?? 6),
    },
    commands: {
      getPolicy: `near contract call-function as-read-only ${ref ?? `<pot>.${cfg.hubId}`} get_policy json-args {} ${net}`,
      getPot: `near contract call-function as-read-only ${cfg.hubId} get_pot json-args '{"pot":"${ref ?? `<pot>.${cfg.hubId}`}"}' ${net}`,
      listKeys: `near account list-keys ${cfg.hubId} ${net}`,
    },
  }
}
