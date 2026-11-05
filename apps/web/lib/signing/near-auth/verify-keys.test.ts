// GOV-7 (security audit 2026-11-04): after NEAR Auth makes a NEW account, the browser checks on its own RPC that the
// account holds exactly {the MPC key derived from its own ID token, this device's key}.
import { base64urlnopad } from "@scure/base"
import { describe, expect, it } from "vitest"
import { mpcConfig, tokenSubject, verifyNewAccountKeys } from "./verify-keys"

const MPC = "ed25519:Mpc1111111111111111111111111111111111111111"
const DEVICE = "ed25519:Dev1111111111111111111111111111111111111111"
const EVIL = "ed25519:Evi1111111111111111111111111111111111111111"
const ACCOUNT = "maya-4f2a.users.potprev.testnet"
const enc = (o: object) => base64urlnopad.encode(new TextEncoder().encode(JSON.stringify(o)))
const ID_TOKEN = `${enc({ alg: "RS256" })}.${enc({ iss: "https://login.testnet.fast-auth.com/", sub: "google-oauth2|123" })}.sig`

/** A fake RPC: `keys` answers view_access_key_list in turn (null = unknown account), the MPC view answers `mpc`. */
function fakeRpc(keys: (string[] | null)[], mpc: string | Error = MPC) {
  const calls: { method: string; args?: unknown }[] = []
  let i = 0
  return {
    calls,
    rpc: {
      async call<T>(_m: string, params: unknown): Promise<T> {
        calls.push({ method: "keys", args: params })
        const k = keys[Math.min(i++, keys.length - 1)]
        if (!k) throw new Error("UNKNOWN_ACCOUNT")
        return { keys: k.map((public_key) => ({ public_key, access_key: { nonce: 1, permission: "FullAccess" } })) } as T
      },
      async viewFunction<T>(contract: string, method: string, args: Record<string, unknown> = {}) {
        calls.push({ method, args: { contract, ...args } })
        if (mpc instanceof Error) throw mpc
        return { value: mpc as T, blockHeight: 1 }
      },
    },
  }
}

const run = (keys: (string[] | null)[], mpc?: string | Error) => {
  const f = fakeRpc(keys, mpc)
  return { f, p: verifyNewAccountKeys({ accountId: ACCOUNT, devicePublicKey: DEVICE, idToken: ID_TOKEN }, f.rpc, { waitMs: 1, tries: 4 }) }
}

describe("verifyNewAccountKeys (GOV-7)", () => {
  it("derives the MPC key from the ID token's own iss + sub (not from our server's answer)", async () => {
    const { f, p } = run([[MPC, DEVICE]])
    expect(await p).toEqual({ result: "ok" })
    expect(f.calls[0]).toEqual({
      method: "derived_public_key",
      args: {
        contract: "v1.signer-prod.testnet",
        path: "jwt#https://login.testnet.fast-auth.com/#google-oauth2|123",
        predecessor: "fast-auth.testnet",
        domain_id: 1,
      },
    })
  })

  it("an extra key (the server slipped one in) is refused at once", async () => {
    const { p } = run([[MPC, DEVICE, EVIL]])
    expect(await p).toEqual({ result: "mismatch", unexpected: [EVIL], missing: [] })
  })

  it("a swapped key is refused: the device key replaced, or the MPC key not the one NEAR Auth derives", async () => {
    expect(await run([[MPC, EVIL]]).p).toEqual({ result: "mismatch", unexpected: [EVIL], missing: [DEVICE] })
    expect(await run([[EVIL, DEVICE]]).p).toEqual({ result: "mismatch", unexpected: [EVIL], missing: [MPC] })
  })

  it("waits out RPC lag: the account not visible yet, then the right keys", async () => {
    expect(await run([null, null, [MPC, DEVICE]]).p).toEqual({ result: "ok" })
  })

  it("an account that exists without our keys (after the retries) is refused", async () => {
    expect(await run([[MPC]]).p).toEqual({ result: "mismatch", unexpected: [], missing: [DEVICE] })
  })

  it("can't check (RPC down, MPC view failing, a malformed token) → unverified, sign-in isn't blocked by an outage", async () => {
    expect(await run([null]).p).toEqual({ result: "unverified", why: "rpc" })
    expect(await run([[MPC, DEVICE]], new Error("down")).p).toEqual({ result: "unverified", why: "mpc" })
    const f = fakeRpc([[MPC, DEVICE]])
    expect(await verifyNewAccountKeys({ accountId: ACCOUNT, devicePublicKey: DEVICE, idToken: "not-a-jwt" }, f.rpc)).toEqual({
      result: "unverified",
      why: "token",
    })
  })

  it("reads iss/sub from the token; MPC defaults match the server's", () => {
    expect(tokenSubject(ID_TOKEN)).toEqual({ iss: "https://login.testnet.fast-auth.com/", sub: "google-oauth2|123" })
    expect(tokenSubject("a.b.c")).toBeNull()
    expect(mpcConfig({})).toEqual({ contract: "v1.signer-prod.testnet", predecessor: "fast-auth.testnet", domainId: 1 })
  })
})
