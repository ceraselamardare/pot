// The /demo explainer's data access (05 §7): the committed, deterministic dataset generated from @pot/sdk's
// MockChain (app/demo/_data/demo-script.json, `pnpm gen:demo`) plus small pure readers over it. Server components
// only import this module (the JSON stays out of the client bundle; client parts get plain props). No chain, no
// clock, no randomness.
import script from "@/app/demo/_data/demo-script.json"
import type { AppScene, Beat, Card, Chapter, ChapterN, DemoScript, Persona, Receipt, SimTx } from "@/app/demo/_data/types"
import { t } from "@/i18n/t"
import type { PersonVM } from "@/lib/client/mock/types"

export const SCRIPT = script as unknown as DemoScript

export const CHAPTERS = [1, 2, 3, 4, 5, 6] as const satisfies readonly ChapterN[]

export function isChapterN(n: number): n is ChapterN {
  return (CHAPTERS as readonly number[]).includes(n)
}

export function getChapter(n: ChapterN): Chapter {
  const c = SCRIPT.chapters.find((x) => x.n === n)
  if (!c) throw new Error(`demo: no chapter ${n}`)
  return c
}

// ---------------------------------------------------------------------------------------------------------
// The cast

export const PERSONAS: readonly Persona[] = ["maya", "sam", "leo"]
const JOIN: Record<Persona, number> = { maya: 0, sam: 1, leo: 2 }

export function personName(p: Persona): string {
  return t(`demo.cast.${p}`)
}

export function personVM(p: Persona): PersonVM {
  const name = personName(p)
  return { id: p, name, initials: name.slice(0, 1).toUpperCase(), joinIndex: JOIN[p] }
}

export function isPersona(a: string): a is Persona {
  return (PERSONAS as readonly string[]).includes(a)
}

export type Party = { kind: "person"; persona: Persona } | { kind: "hub" | "relayer" | "usdc" | "pot" | "faucet" | "system" | "other" }

export function partyOf(account: string): Party {
  const ids = SCRIPT.ids
  for (const p of PERSONAS) if (ids.people[p] === account) return { kind: "person", persona: p }
  if (account === ids.hub) return { kind: "hub" }
  if (account === ids.relayer) return { kind: "relayer" }
  if (account === ids.usdc) return { kind: "usdc" }
  if (account === ids.pot) return { kind: "pot" }
  if (account === ids.faucet) return { kind: "faucet" }
  if (account === "system") return { kind: "system" }
  return { kind: "other" }
}

/** "Maya", "Pot Hub", "Relayer", "USDC (test)", "Lisbon Trip"… */
export function partyName(account: string): string {
  const p = partyOf(account)
  if (p.kind === "person") return personName(p.persona)
  if (p.kind === "other") return account
  return t(`demo.party.${p.kind}`)
}

export function personaOf(account: string): Persona | null {
  const p = partyOf(account)
  return p.kind === "person" ? p.persona : null
}

// ---------------------------------------------------------------------------------------------------------
// Beats

export function txById(c: Chapter, id: string): SimTx | undefined {
  return c.txs.find((x) => x.id === id)
}

/** Every card a beat carries, in order (`card` then `cards`). */
export function beatCards(b: Beat): Card[] {
  return [...(b.card ? [b.card] : []), ...(b.cards ?? [])]
}

/** The phone screen at beat index `i` (the dataset sets `app` on every beat; older beats fall back). */
export function sceneAt(c: Chapter, i: number): AppScene {
  for (let j = Math.min(i, c.beats.length - 1); j >= 0; j--) {
    const s = c.beats[j]!.app
    if (s) return s
  }
  return { scene: "pot" }
}

const same = (a: AppScene, b: AppScene) => JSON.stringify(a) === JSON.stringify(b)

/** The tap on the phone's primary happened and its screen is still up: show its busy state, not the button. */
export function tappedAt(c: Chapter, i: number): boolean {
  let j = i - 1
  const cur = sceneAt(c, i)
  while (j >= 0 && same(sceneAt(c, j), cur)) {
    if (c.beats[j]!.tap) return true
    j--
  }
  return false
}

/** The index of the first beat that points at each transaction (when it "happens" in the story). */
export function txFirstBeat(c: Chapter): Map<string, number> {
  const m = new Map<string, number>()
  c.beats.forEach((b, i) => {
    for (const card of beatCards(b)) if ("tx" in card && !m.has(card.tx)) m.set(card.tx, i)
    if (b.receipts && !m.has(b.receipts.tx)) m.set(b.receipts.tx, i)
  })
  return m
}

/** The last beat whose receipts name `txId` (that slice also offers the gas refunds). */
export function lastRouteBeat(c: Chapter, txId: string): number {
  let last = -1
  c.beats.forEach((b, i) => {
    if (b.receipts?.tx === txId) last = i
  })
  return last
}

/** The beat whose `signed` card shows this transaction's delegate (the relayer card links back to it). */
export function signedBeat(c: Chapter, txId: string): number {
  return c.beats.findIndex((b) => beatCards(b).some((card) => card.type === "signed" && card.tx === txId))
}

/** "transfer" / "add_member" / "call": the Sputnik kind's family. */
export function kindFamily(kind: unknown): "transfer" | "add_member" | "call" | "other" {
  if (kind && typeof kind === "object") {
    if ("Transfer" in kind) return "transfer"
    if ("AddMemberToRole" in kind) return "add_member"
    if ("FunctionCall" in kind) return "call"
  }
  return "other"
}

// ---------------------------------------------------------------------------------------------------------
// Numbers

const YOCTO = 10n ** 24n

/** "0.05", "0.00125", "1 yocto" style NEAR from a yocto string. */
export function nearOf(yocto: string): string {
  const v = BigInt(yocto)
  if (v === 0n) return "0"
  if (v < 10n ** 15n) return `${v} yocto`
  const whole = v / YOCTO
  const frac = (v % YOCTO).toString().padStart(24, "0").replace(/0+$/, "").slice(0, 5)
  return frac ? `${whole}.${frac}` : `${whole}`
}

/** "300 Tgas" from a gas string (whole Tgas). */
export function tgasOf(gas: string): number {
  return Math.round(Number(BigInt(gas) / 10n ** 9n) / 1000)
}

/** "u-7k2m9qxa.users…", "sim-7Kq2…x9Lp": the full value stays in the title and the raw view. */
export function shortHash(h: string): string {
  if (h.length <= 16) return h
  const head = h.startsWith("sim-") ? 8 : 5
  return `${h.slice(0, head)}…${h.slice(-4)}`
}

export function realReceipts(x: SimTx): Receipt[] {
  return x.receipts.filter((r) => !r.refund)
}

/** micro-USDC of `account` in a snapshot (0 when absent). */
export function usdcOf(balances: Record<string, { usdc: string }>, account: string): bigint {
  return BigInt(balances[account]?.usdc ?? "0")
}
