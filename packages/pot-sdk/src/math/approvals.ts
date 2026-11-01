// k of n (kb/sputnik-dao.md R7, test U-04): a RoleWeight Group with threshold Ratio(num, den)
// needs max(quorum, min(floor(n·num/den) + 1, n)) approvals (or rejections), n = the role size
// at evaluation time. Pot policies use [1, 2] with quorum "1" (D-04): 1→1, 2→2, 3→2, 5→3, 6→4,
// 30→16, 40→21. The contract's approvals_needed(member_count) is the same formula.

export function approvalsNeeded(n: number, threshold: readonly [number, number] | number = [1, 2], quorum = 1): number {
  if (!Number.isInteger(n) || n < 0) throw new Error("approvalsNeeded: n must be a non-negative integer")
  const weight = typeof threshold === "number" ? Math.min(threshold, n) : Math.min(Math.floor((n * threshold[0]) / threshold[1]) + 1, n)
  return Math.max(quorum, weight)
}

export interface VoteTally {
  approve: number
  reject: number
}

/** The status Sputnik would compute for one RoleWeight Group after a vote. */
export function tallyStatus(t: VoteTally, n: number, threshold: readonly [number, number] | number = [1, 2], quorum = 1): "Approved" | "Rejected" | "InProgress" {
  const k = approvalsNeeded(n, threshold, quorum)
  if (t.approve >= k) return "Approved"
  if (t.reject >= k) return "Rejected"
  return "InProgress"
}
