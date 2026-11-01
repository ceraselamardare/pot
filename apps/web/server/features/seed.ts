// B-08 / B-12 `seedDemoPot` (api-spec §5.2, D-33, D-61): builds a demo Pot in the D-61 seeded state
// ($450, Maya + Sam + Leo, $150 each, no spends) THROUGH THE RELAY PIPELINE: the personas sign delegates
// with DEMO_PERSONA_KEY, the relayer submits them, so the hub sponsors every call exactly as for a visitor.
// Each step checks the chain first, so a re-run resumes where a previous one stopped.
//
// kinds: `reference` (fixed maya/sam/leo, slug lisbon-trip, never leased), `pool` (maya-<k>…, lisbon-<k>),
// `shared` (fresh maya-<k>…, lisbon-<yyyymmdd>). Step 9 (deleting the reference personas' only key, rev4
// H-5) is NOT done here: preview keeps the keys (notes/deploy.md); prod C-13 runs it before the README freeze.
import "server-only"
import { desc, eq } from "drizzle-orm"
import { type ActionIntentWire } from "@pot/sdk"
import { inviteKeyFromSeed, signJoin } from "@pot/sdk/sign"
import { actions } from "near-api-js"
import type { Db } from "@/db/client"
import { demoPot, relayLog } from "@/db/schema"
import { relayerAvailable, sponsorAllows, sponsorLevel } from "../chain/balance"
import type { HubReader } from "../chain/hub"
import type { PoolKey } from "../chain/keys"
import { viewAccessKey, viewAccount, viewFunction } from "../chain/near"
import { burnt, firstFailure, failureText, statusFailure } from "../chain/outcome"
import type { RpcClient } from "../chain/rpc"
import { ApiError, unavailable } from "../http/errors"
import type { RelayDeps, RelayResponse } from "../relay/pipeline"
import { createAccount, registerToken, serverRow } from "../session/onboard"
import { crockford, hmac, newRequestId, sha256Hex } from "../util/crypto"
import { ensurePersonaUser, personaRelay, type DemoIntent, type Persona } from "./demo"

export type SeedKind = "reference" | "pool" | "shared"
export const SEED_AMOUNT = 150_000_000n // $150 per persona (D-61)
const TGAS = 1_000_000_000_000n
const PERSONAS: Persona[] = ["maya", "sam", "leo"]

export interface SeedDeps extends RelayDeps {
  personaKey: PoolKey
  secret: string
  log?: (line: string) => void
}

export interface SeedPlan {
  kind: SeedKind
  slug: string
  potId: string
  personas: Record<Persona, string>
}

export interface SeedResult extends SeedPlan {
  demoPotId: string
  invitePk: string
  txs: { step: string; txHash: string }[]
  balance: string
  members: number
}

/** Account names and slug for a kind (api-spec §5.2 "Kinds"). */
export function seedPlan(kind: SeedKind, cfg: { hubId: string; relayerAccountId: string }, opts: { k?: string; slug?: string } = {}): SeedPlan {
  const k = opts.k ?? crockford(4)
  const suffix = kind === "reference" ? "" : `-${k}`
  const slug =
    opts.slug ??
    (kind === "reference" ? "lisbon-trip" : kind === "shared" ? `lisbon-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}` : `lisbon-${k}`)
  const personas = Object.fromEntries(PERSONAS.map((p) => [p, `${p}${suffix}.${cfg.relayerAccountId}`])) as Record<Persona, string>
  return { kind, slug, potId: `${slug}.${cfg.hubId}`, personas }
}

/** The invite seed is derived, never stored (api-spec §5.2 step 4): HMAC(APP_HMAC_SECRET, "demo-invite|<pot>"). */
export function seedInvite(secret: string, potId: string) {
  return inviteKeyFromSeed(hmac(secret, `demo-invite|${potId}`).slice(0, 32))
}

export async function seedDemoPot(deps: SeedDeps, plan: SeedPlan): Promise<SeedResult> {
  const { db, cfg, rpc, hub } = deps
  const log = deps.log ?? (() => undefined)
  const txs: SeedResult["txs"] = []
  const note = (step: string, txHash: string | undefined | null) => {
    if (txHash) {
      txs.push({ step, txHash })
      log(`  ${step}: ${cfg.explorerUrl}/txns/${txHash}`)
    }
  }
  const level = sponsorLevel(await relayerAvailable(rpc, cfg.relayerAccountId, 0), cfg.relayerThresholds)
  if (!sponsorAllows(level, "demo_seed")) throw unavailable("sponsor_low", 60_000)

  // the demo_pot row (state seeding → ready); the slug is unique
  let row = (await db.select().from(demoPot).where(eq(demoPot.slug, plan.slug)).limit(1))[0]
  if (!row)
    row = (
      await db
        .insert(demoPot)
        .values({ kind: plan.kind, slug: plan.slug, potId: plan.potId, personas: plan.personas, state: "seeding" })
        .returning()
    )[0]!
  const step = async (n: number) => {
    await db.update(demoPot).set({ seedStep: n }).where(eq(demoPot.id, row!.id))
  }

  try {
    // 1. persona accounts (relayer is the parent), each with DEMO_PERSONA_KEY as its only full-access key
    const users = {} as Record<Persona, { id: string }>
    for (const p of PERSONAS) {
      const account = plan.personas[p]
      if (!(await viewAccount(rpc, account, "optimistic"))) note(`create ${p}`, await createAccount(deps, account, [deps.personaKey.publicKey]))
      else if (!(await viewAccessKey(rpc, account, deps.personaKey.publicKey, "optimistic")))
        throw new ApiError("demo_forbidden", { detail: { why: "persona_exists_without_demo_key", account } })
      users[p] = await ensurePersonaUser(db, account, p)
    }
    await step(1)
    // 2. token registration (relayer pays)
    for (const p of PERSONAS) {
      const account = plan.personas[p]
      if (await hub.storageBalanceOf(cfg.usdcId, account)) continue
      const r = await registerToken(deps, account)
      if (!r.ok) throw new ApiError("account_setup_failed", { txHash: r.txHash })
      note(`register ${p}`, r.txHash)
    }
    await step(2)

    const pv0 = await hub.getPot(plan.potId, { fresh: true })
    const members0 = pv0 ? await hub.getMembers(plan.potId, { fresh: true }) : []
    const contributed = (a: string) => BigInt(members0.find((m) => m.account_id === a)?.contributed ?? "0")
    // 3. treasury → persona $150 each (only what is still missing for the contribution)
    for (const p of PERSONAS) {
      const account = plan.personas[p]
      const need = SEED_AMOUNT - contributed(account)
      if (need <= 0n) continue
      const have = await hub.ftBalanceOf(cfg.usdcId, account)
      if (have >= need) continue
      note(`fund ${p}`, await treasuryTransfer(deps, account, need - have, `seed:${plan.slug}:${p}`))
    }
    await step(3)

    const persona = (p: Persona) => ({
      userId: users[p].id,
      accountId: plan.personas[p],
      visitorHash: sha256Hex(`seed|${plan.slug}`).slice(0, 32),
      ipnetHash: sha256Hex(`seed-ipnet|${plan.slug}`).slice(0, 32),
    })
    const act = async (p: Persona, label: string, intent: DemoIntent): Promise<RelayResponse> => {
      const key = `seed${sha256Hex(`${plan.slug}|${label}`).slice(0, 12)}`
      const r = await personaRelay(deps, persona(p), intent, { requestId: newRequestId(), idempotencyKey: key, bodyHash: sha256Hex(key) })
      const b = r.body as { outcome?: string; txHash?: string; errorCode?: string; reason?: string; replayed?: boolean }
      if (r.status !== 200 || b.outcome !== "success")
        throw new Error(`seed ${label}: ${r.status} ${b.outcome ?? b.reason} ${b.errorCode ?? ""} ${b.txHash ?? ""}`.trim())
      if (!b.replayed) note(label, b.txHash)
      return r
    }
    const invite = seedInvite(deps.secret, plan.potId)

    // 4. Maya creates the Pot (preset trip, invite key, 🇵🇹, float = the hub minimum)
    if (!pv0) {
      await act("maya", "create_pot", {
        type: "create_pot",
        slug: plan.slug,
        name: "Lisbon Trip",
        preset: "trip",
        rules: null,
        invitePk: invite.publicKey,
        emoji: "🇵🇹",
      } as ActionIntentWire as DemoIntent)
      await waitFor(() => hub.getPot(plan.potId, { fresh: true }), (v) => !!v)
    }
    await step(4)
    const isMember = async (a: string) => (await hub.getMembers(plan.potId, { fresh: true })).some((m) => m.account_id === a && m.status === "active")
    const addMoney = async (p: Persona) => {
      const account = plan.personas[p]
      const m = (await hub.getMembers(plan.potId, { fresh: true })).find((x) => x.account_id === account)
      const missing = SEED_AMOUNT - BigInt(m?.contributed ?? "0")
      if (missing > 0n) await act(p, `add_money ${p}`, { type: "add_money", pot: plan.potId, amount: missing.toString() } as DemoIntent)
    }
    const join = async (p: Persona) => {
      const account = plan.personas[p]
      if (await isMember(account)) return
      const sig = signJoin(invite.seed, plan.potId, account)
      await act(p, `join ${p}`, { type: "join", pot: plan.potId, invitePk: sig.invitePk, signature: sig.signature } as DemoIntent)
      await waitFor(() => isMember(account), (v) => v)
    }
    // 5. Sam joins and adds $150; 6. Maya adds $150; 7. Leo joins and adds $150
    await join("sam")
    await addMoney("sam")
    await step(5)
    await addMoney("maya")
    await step(6)
    await join("leo")
    await addMoney("leo")
    await step(7)

    // 8. ready
    const balance = await waitFor(
      () => hub.ftBalanceOf(cfg.usdcId, plan.potId),
      (b) => b >= 3n * SEED_AMOUNT,
    )
    const members = await hub.getMembers(plan.potId, { fresh: true })
    await db
      .update(demoPot)
      .set({ state: "ready", seedStep: 8, seededAt: new Date(), seedError: null, potId: plan.potId })
      .where(eq(demoPot.id, row.id))
    return { ...plan, demoPotId: row.id, invitePk: invite.publicKey, txs, balance: balance.toString(), members: members.length }
  } catch (e) {
    await db
      .update(demoPot)
      .set({ seedError: String(e).slice(0, 500) })
      .where(eq(demoPot.id, row.id))
    throw e
  }
}

/** A treasury-pool `ft_transfer` (the faucet's path without the user quotas); relay_log op `faucet`. */
export async function treasuryTransfer(deps: SeedDeps, account: string, amount: bigint, key: string): Promise<string> {
  const { db, cfg } = deps
  const id = await serverRow(db, { op: "faucet", key, senderId: cfg.treasuryAccountId, receiverId: cfg.usdcId, methods: ["ft_transfer"] })
  const r = await deps.submitter.submit(
    {
      signerId: cfg.treasuryAccountId,
      receiverId: cfg.usdcId,
      actions: [actions.functionCall("ft_transfer", { receiver_id: account, amount: amount.toString(), memo: "Demo dollars (testnet)" }, 30n * TGAS, 1n)],
    },
    { pool: cfg.treasuryPool, holder: id, budgetMs: 20_000, busyCause: "treasury" },
  )
  if (r.kind === "pending") throw unavailable("treasury", 10_000, { txHash: r.txHash })
  const f = firstFailure(r.outcome)
  await db
    .update(relayLog)
    .set({
      status: f ? "failed" : "executed",
      outerTxHash: r.txHash,
      outcome: f ? "inner_failed" : "success",
      errorText: f ? failureText(statusFailure(f.outcome.status)) : null,
      costYocto: (burnt(r.outcome).yocto + 1n).toString(),
      finishedAt: new Date(),
    })
    .where(eq(relayLog.id, id))
  if (f) throw unavailable("treasury", 60_000, { txHash: r.txHash })
  return r.txHash
}

async function waitFor<T>(read: () => Promise<T>, ok: (v: T) => boolean, ms = 20_000): Promise<T> {
  const end = Date.now() + ms
  for (;;) {
    const v = await read().catch(() => undefined as T)
    if (v !== undefined && ok(v)) return v
    if (Date.now() > end) throw new Error("seed: chain state did not converge in time")
    await new Promise((r) => setTimeout(r, 700))
  }
}

/** Read helpers for scripts and the demo state: is the Pot in the seeded state? */
export async function seededState(rpc: RpcClient, hub: HubReader, usdcId: string, potId: string) {
  const [pv, members, balance] = await Promise.all([
    hub.getPot(potId, { fresh: true }),
    hub.getMembers(potId, { fresh: true }),
    viewFunction<string>(rpc, usdcId, "ft_balance_of", { account_id: potId }).catch(() => "0"),
  ])
  return { pot: pv, members, balance }
}

/** All demo_pot rows, newest first (scripts/seed-demo --status). */
export function demoPotRows(db: Db) {
  return db.select().from(demoPot).orderBy(desc(demoPot.createdAt))
}
