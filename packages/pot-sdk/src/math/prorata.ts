// Pro-rata close-out (D-09), the TS twin of contracts/pot-hub/src/prorata.rs (contracts-spec §3.9):
//   share_i = floor(B × c_i / C); dust = B \u2212 Σ share_i (0 ≤ dust < n); share_L += dust (L = last
//   contributor); payouts = [(account, share_i) in join order if share_i > 0]; Σ payouts == B.
// B = 0 (or C = 0) → nothing to refund (null). Shared vectors V1-V7: src/math/vectors/prorata.json
// (= contracts/tests/vectors/prorata.json).

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
