// The /shared-account-with-friends worked example, "The Crew": five friends keep one Pot for their shared plans and
// put in DIFFERENT amounts, so the close-out shows the proportional share back (the /group-trip example has equal
// shares). Computed with the app's own rule and close-out math, like lib/marketing/group-trip.ts: previewSpend
// (lib/client/rules, the hub's decide() twin) says who approves each spend under a new Pot's defaults, and refunds
// (lib/client/refund, the hub's close_split twin) shares out what's left, worked in cents ("rounded down to the cent;
// any tiny remainder goes to whoever added money last"). Pure and build-time only. Asserted in shared-account.test.ts.
import { defaultExtras } from "@pot/sdk"
import { dollars, MICRO_PER_CENT, type Micro } from "@/lib/client/money"
import { refunds } from "@/lib/client/refund"
import { DEFAULT_RULES, previewSpend } from "@/lib/client/rules"
import type { Tier } from "./group-trip"

/** The five friends in join order (avatar colours member-1…5). Their names are en.json `uc.shared.cast.*`. */
export const CREW_CAST = ["jo", "ama", "dev", "kit", "lou"] as const
export type CrewPerson = (typeof CREW_CAST)[number]

/** What each person put in, in the order they added it (Lou added last, so the close's remainder goes to Lou). */
export const CREW_PUT_IN: Record<CrewPerson, Micro> = {
  jo: dollars(200),
  ama: dollars(200),
  dev: dollars(100),
  kit: dollars(150),
  lou: dollars(150),
}

export const CREW_RULES = DEFAULT_RULES
export const CREW_EXTRAS = defaultExtras({ ...DEFAULT_RULES, payeeAllowlist: [] })

/** The spends in the order they happen; each is paid to the member who asked (they bought or booked it). */
const SPENDS = [
  { id: "snacks", by: "kit", amount: dollars(45) },
  { id: "tickets", by: "ama", amount: dollars(250) },
  { id: "house", by: "jo", amount: dollars(420) },
] as const satisfies readonly { id: string; by: CrewPerson; amount: Micro }[]

export type CrewSpendId = (typeof SPENDS)[number]["id"]

export interface CrewSpend {
  id: CrewSpendId
  by: CrewPerson
  amount: Micro
  tier: Tier
  k: number
  n: number
  leftAfter: Micro
}

export interface CrewPot {
  people: number
  total: Micro
  spends: CrewSpend[]
  left: Micro
  lastContributor: CrewPerson
  shares: { id: CrewPerson; putIn: Micro; getsBack: Micro }[]
}

function compute(): CrewPot {
  const n = CREW_CAST.length
  const total = CREW_CAST.reduce((a, id) => a + CREW_PUT_IN[id], 0n)
  let balance = total
  const spends: CrewSpend[] = SPENDS.map((s) => {
    const p = previewSpend({
      amount: s.amount,
      balance,
      rules: CREW_RULES,
      memberCount: n,
      used: 0n,
      contributed: CREW_PUT_IN[s.by],
      oneOkUsed: 0n,
      receiverIsMember: true,
      extras: CREW_EXTRAS,
      trustLevel: 0,
    })
    if (p.path === "blocked" || p.path === "empty") throw new Error(`the crew: ${s.id} can't be spent (${p.reason})`)
    const tier: Tier = p.path === "instant" ? "instant" : (p.tier ?? "group")
    balance -= s.amount
    return { id: s.id, by: s.by, amount: s.amount, tier, k: p.k, n: p.n, leftAfter: balance }
  })
  const lastContributor = CREW_CAST[n - 1]!
  const back = refunds({
    balance,
    members: CREW_CAST.map((id) => ({ id, contributed: CREW_PUT_IN[id] })),
    lastContributor,
    unit: MICRO_PER_CENT,
  })
  return {
    people: n,
    total,
    spends,
    left: balance,
    lastContributor,
    shares: CREW_CAST.map((id) => ({ id, putIn: CREW_PUT_IN[id], getsBack: back.get(id) ?? 0n })),
  }
}

export const THE_CREW: CrewPot = compute()
