// Link keys and the claim signature, checked against the SDK and the contract: the browser's signature (WebCrypto,
// and the noble fallback) must be exactly what the hub's `env::ed25519_verify` accepts over
// `pot-claim:v1:<hub>:<pot>:<id>:<receiver>` (contracts/pot-hub/src/wave4.rs claim_link, types.rs CLAIM_DOMAIN).
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { base64Decode, base64Encode, claimMessage, claimMessageBytes, CLAIM_DOMAIN, secretToSeed, verifyClaimWebCrypto } from "@pot/sdk"
// eslint-disable-next-line no-restricted-imports -- the test compares the browser path with the signing chunk
import { signClaim, verifyClaim } from "@pot/sdk/sign"
import { ed25519 } from "@noble/curves/ed25519.js"
import { describe, expect, it } from "vitest"
import { SURF_LINKS } from "../mock/fixtures"
import { generateLinkKey, publicKeyOfSecret, signClaimLink } from "./keys"

const HUB = "pots.potprev.testnet"
const POT = "lisbon-trip.pots.potprev.testnet"
const ME = "alex-2b9e.users.potprev.testnet"

describe("the claim message", () => {
  it("is byte for byte the hub's format string", () => {
    const rs = readFileSync(join(__dirname, "../../../../../contracts/pot-hub/src/wave4.rs"), "utf8")
    const types = readFileSync(join(__dirname, "../../../../../contracts/pot-hub/src/types.rs"), "utf8")
    expect(rs).toContain('format!("{CLAIM_DOMAIN}:{hub}:{pot}:{request_id}:{receiver_id}")')
    expect(types).toContain('pub const CLAIM_DOMAIN: &str = "pot-claim:v1";')
    expect(CLAIM_DOMAIN).toBe("pot-claim:v1")
    expect(claimMessage(HUB, POT, 7, ME)).toBe(`pot-claim:v1:${HUB}:${POT}:7:${ME}`)
  })
})

describe("generateLinkKey / signClaimLink", () => {
  it("a fresh key: 43-char secret whose public key matches, a signature the SDK and the hub accept", async () => {
    const k = await generateLinkKey()
    expect(k.secret).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(k.pk).toMatch(/^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/)
    expect(await publicKeyOfSecret(k.secret)).toBe(k.pk)
    const sig = await signClaimLink(k.secret, HUB, POT, 7, ME)
    expect(sig).toMatch(/^[A-Za-z0-9+/]{86}==$/) // padded base64 of 64 bytes (the claim_link arg, relayer R14)
    expect(await verifyClaimWebCrypto(k.pk, HUB, POT, 7, ME, sig)).toBe(true)
    expect(verifyClaim(k.pk, HUB, POT, 7, ME, sig)).toBe(true) // near-api-js, the hub's ed25519
  })

  it("is the same signature as @pot/sdk/sign and raw noble (ed25519 is deterministic)", async () => {
    const sig = await signClaimLink(SURF_LINKS.open.secret, HUB, POT, 113, ME)
    expect(sig).toBe(signClaim(SURF_LINKS.open.secret, HUB, POT, 113, ME))
    const noble = base64Encode(ed25519.sign(claimMessageBytes(HUB, POT, 113, ME), secretToSeed(SURF_LINKS.open.secret)))
    expect(sig).toBe(noble)
    expect(base64Decode(sig)).toHaveLength(64)
  })

  it("is bound to the hub, the Pot, the request and the receiver (no replay, no redirect)", async () => {
    const sig = await signClaimLink(SURF_LINKS.open.secret, HUB, POT, 113, ME)
    const pk = SURF_LINKS.open.pk
    expect(verifyClaim(pk, HUB, POT, 113, ME, sig)).toBe(true)
    expect(verifyClaim(pk, "pots.other.testnet", POT, 113, ME, sig)).toBe(false)
    expect(verifyClaim(pk, HUB, "porto.pots.potprev.testnet", 113, ME, sig)).toBe(false)
    expect(verifyClaim(pk, HUB, POT, 112, ME, sig)).toBe(false)
    expect(verifyClaim(pk, HUB, POT, 113, "thief.testnet", sig)).toBe(false)
    expect(verifyClaim(SURF_LINKS.claimed.pk, HUB, POT, 113, ME, sig)).toBe(false)
  })

  it("the fixture secrets match their public keys (the seeded Surf Camp links)", async () => {
    for (const k of Object.values(SURF_LINKS)) expect(await publicKeyOfSecret(k.secret)).toBe(k.pk)
  })

  it("refuses a malformed secret", async () => {
    await expect(publicKeyOfSecret("nope")).rejects.toThrow()
    await expect(signClaimLink("nope", HUB, POT, 1, ME)).rejects.toThrow()
  })
})
