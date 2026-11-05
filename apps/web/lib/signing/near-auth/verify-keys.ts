// GOV-7 (security audit 2026-11-04): our server creates a NEAR Auth person's account and chooses its keys
// (server/session/service.ts finishOnboarding: [the MPC key, this device's key]). A compromised server could slip in a
// key of its own and later move the person's money. So, right after a NEW account is made, this browser checks it
// itself, with read-only views on its own RPCs (FastNEAR → dRPC; never the deprecated near.org endpoint):
//  - the MPC key is derived independently from the MPC contract (`derived_public_key` for `jwt#<iss>#<sub>`, read from
//    the ID token this browser received from NEAR Auth, not from our server's answer);
//  - the account's access keys must be exactly { that MPC key, this device's key }.
// Extra or wrong keys → "mismatch": the sign-in is refused (client.ts ends the session and drops this device's key).
// Keys not visible yet (RPC lag) are retried for a few seconds; if the RPCs can't answer at all the check is
// "unverified" and sign-in goes on (an outage must not lock people out; nothing about the account is trusted less).
// Returning people on a new device are not checked here: their account legitimately holds their other devices' keys.
import { base64urlnopad } from "@scure/base"
import type { RpcClient } from "@pot/sdk"

export interface MpcConfig {
  contract: string
  predecessor: string
  domainId: number
}

/** The same MPC defaults as the server (server/config.ts `mpc`); NEXT_PUBLIC_* overrides for other networks. */
export function mpcConfig(env: Record<string, string | undefined> = process.env): MpcConfig {
  return {
    contract: env.NEXT_PUBLIC_MPC_CONTRACT_ID || "v1.signer-prod.testnet",
    predecessor: env.NEXT_PUBLIC_FAST_AUTH_CONTRACT_ID || "fast-auth.testnet",
    domainId: 1,
  }
}

/** iss + sub from the ID token NEAR Auth gave this browser (the payload only: the server already verified it). */
export function tokenSubject(idToken: string): { iss: string; sub: string } | null {
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64urlnopad.decode(idToken.split(".")[1] ?? ""))) as {
      iss?: unknown
      sub?: unknown
    }
    return typeof payload.iss === "string" && typeof payload.sub === "string" ? { iss: payload.iss, sub: payload.sub } : null
  } catch {
    return null
  }
}

export type KeyCheck =
  { result: "ok" } | { result: "mismatch"; unexpected: string[]; missing: string[] } | { result: "unverified"; why: string }

type Rpc = Pick<RpcClient, "call" | "viewFunction">

async function keyList(rpc: Rpc, accountId: string): Promise<string[] | null> {
  try {
    const r = await rpc.call<{ keys?: { public_key: string }[] }>("query", {
      request_type: "view_access_key_list",
      finality: "optimistic",
      account_id: accountId,
    })
    return (r?.keys ?? []).map((k) => k.public_key)
  } catch {
    return null // unknown account (not visible yet) or the RPC is down
  }
}

export async function verifyNewAccountKeys(
  p: { accountId: string; devicePublicKey: string; idToken: string },
  rpc: Rpc,
  opts: { mpc?: MpcConfig; tries?: number; waitMs?: number } = {},
): Promise<KeyCheck> {
  const mpc = opts.mpc ?? mpcConfig()
  const tries = opts.tries ?? 10
  const waitMs = opts.waitMs ?? 500
  const who = tokenSubject(p.idToken)
  if (!who) return { result: "unverified", why: "token" }
  let mpcKey: string
  try {
    const v = await rpc.viewFunction<string>(mpc.contract, "derived_public_key", {
      path: `jwt#${who.iss}#${who.sub}`,
      predecessor: mpc.predecessor,
      domain_id: mpc.domainId,
    })
    if (typeof v.value !== "string" || !v.value.startsWith("ed25519:")) return { result: "unverified", why: "mpc" }
    mpcKey = v.value
  } catch {
    return { result: "unverified", why: "mpc" }
  }
  const expected = new Set([mpcKey, p.devicePublicKey])
  let last: string[] | null = null
  for (let i = 0; i < tries; i++) {
    if (i) await new Promise((r) => setTimeout(r, waitMs))
    last = await keyList(rpc, p.accountId)
    if (!last) continue
    const unexpected = last.filter((k) => !expected.has(k))
    // a key we didn't ask for never goes away by waiting: refuse at once
    if (unexpected.length) return { result: "mismatch", unexpected, missing: [...expected].filter((k) => !last!.includes(k)) }
    if ([...expected].every((k) => last!.includes(k))) return { result: "ok" }
  }
  // the account exists but our keys never showed up: someone else's account, or keys swapped
  if (last) return { result: "mismatch", unexpected: [], missing: [...expected].filter((k) => !last!.includes(k)) }
  return { result: "unverified", why: "rpc" }
}
