// Pro-rata close-out (D-09), the TS twin of contracts/pot-hub/src/prorata.rs (contracts-spec §3.9):
//   share_i = floor(B × c_i / C); dust = B \u2212 Σ share_i (0 ≤ dust < n); share_L += dust (L = last
//   contributor); payouts = [(account, share_i) in join order if share_i > 0]; Σ payouts == B.
// B = 0 (or C = 0) → nothing to refund (null). Shared vectors V1-V7: src/math/vectors/prorata.json
// (= contracts/tests/vectors/prorata.json).
// hub 1.2.0 `closeSplit` (= prorata.rs close_split): what the close pays. Pro-rata when anyone added money
// (gifts are part of B); EQUAL when nobody did (a gifts-only Pot): weight 1 each, dust to the last member
// in join order. Shared vectors: src/math/vectors/close-split.json (= contracts/tests/vectors/close-split.json).

export interface Contribution<A extends string = string> {
  account: A
  contributed: bigint
}

export interface Payout<A extends string = string> {
  account: A
  amount: bigint
}

export interface ProrataResult<A extends string = string> {
  /** join order, zero payouts omitted (NEP-141 rejects 0) */
  payouts: Payout<A>[]
  dust: bigint
  dustTo: A
}

/**
 * Returns null when there is nothing to refund (balance 0 or no contributions). If
 * `lastContributor` is missing or isn't a contributor, the dust goes to the last contributor in
 * join order with c > 0 (the hub never hits that case: last_contributor always has c > 0).
 */
export function prorata<A extends string>(balance: bigint, contributions: readonly Contribution<A>[], lastContributor?: A | null): ProrataResult<A> | null {
  if (balance < 0n) throw new Error("prorata: negative balance")
  const total = contributions.reduce((t, c) => {
    if (c.contributed < 0n) throw new Error("prorata: negative contribution")
    return t + c.contributed
  }, 0n)
  if (balance === 0n || total === 0n) return null
  const shares = contributions.map((c) => (balance * c.contributed) / total)
  const dust = balance - shares.reduce((t, s) => t + s, 0n)
  let li = lastContributor == null ? -1 : contributions.findIndex((c) => c.account === lastContributor && c.contributed > 0n)
  if (li < 0) {
    for (let i = contributions.length - 1; i >= 0; i--) {
      if ((contributions[i] as Contribution<A>).contributed > 0n) {
        li = i
        break
      }
    }
  }
  shares[li] = (shares[li] as bigint) + dust
  const payouts: Payout<A>[] = []
  contributions.forEach((c, i) => {
    const amount = shares[i] as bigint
    if (amount > 0n) payouts.push({ account: c.account, amount })
  })
  return { payouts, dust, dustTo: (contributions[li] as Contribution<A>).account }
}

/** "Your share" (frontend-architecture §3.7): floor(balance × mine / total). */
export function shareOf(balance: bigint, mine: bigint, total: bigint): bigint {
  return total === 0n ? 0n : (balance * mine) / total
}

/**
 * hub 1.2.0 close split. `members` = every Active member in join order with their contribution.
 * Pro-rata when any contribution > 0; otherwise an equal split (the dust < n to the last member).
 * null when the balance is 0 or there is no member.
 */
export function closeSplit<A extends string>(balance: bigint, members: readonly Contribution<A>[], lastContributor?: A | null): ProrataResult<A> | null {
  if (members.some((m) => m.contributed > 0n)) return prorata(balance, members, lastContributor)
  return prorata(
    balance,
    members.map((m) => ({ account: m.account, contributed: 1n })),
    null,
  )
}

/** "prorata" | "equal": which rule closeSplit applies to these members. */
export const closeSplitKind = (members: readonly Contribution[]): "prorata" | "equal" =>
  members.some((m) => m.contributed > 0n) ? "prorata" : "equal"
