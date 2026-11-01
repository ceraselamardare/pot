// Server signing keys from Secret env vars (api-spec §3.3, architecture §4.7). Parsed lazily, cached per
// instance, never logged, never written to the DB (lease.meta holds public keys only).
import "server-only"
import { KeyPair, type KeyPairString } from "near-api-js"

export interface PoolKey {
  publicKey: string
  keyPair: KeyPair
}

const cache = new Map<string, PoolKey[]>()

export function parseKeys(raw: string | undefined): PoolKey[] {
  if (!raw) return []
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((sk) => {
      const keyPair = KeyPair.fromString(sk as KeyPairString)
      return { publicKey: keyPair.getPublicKey().toString(), keyPair }
    })
}

/** RELAYER_KEYS (full access on RELAYER_ACCOUNT_ID), TREASURY_KEYS, DEMO_PERSONA_KEY. */
export function loadKeys(envVar: "RELAYER_KEYS" | "TREASURY_KEYS" | "DEMO_PERSONA_KEY"): PoolKey[] {
  const hit = cache.get(envVar)
  if (hit) return hit
  const keys = parseKeys(process.env[envVar])
  cache.set(envVar, keys)
  return keys
}

export function resetKeyCacheForTests(): void {
  cache.clear()
}
