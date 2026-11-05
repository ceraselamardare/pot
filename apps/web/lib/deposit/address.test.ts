// CLI-10 (security audit 2026-11-04): the deposit address is checked against the picked network's shape, and the QR
// must encode the same address, before the browser shows either.
import { describe, expect, it } from "vitest"
import { depositAddressLooksRight, type AddressToCheck } from "./address"

const real = (chain: AddressToCheck["chain"], depositAddress: string, extra: Partial<AddressToCheck> = {}): AddressToCheck => ({
  mode: "real",
  chain,
  depositAddress,
  qrText: depositAddress,
  ...extra,
})

const GOOD: [AddressToCheck["chain"], string][] = [
  ["base", "0x8a1F2b3C4d5E6f708192A3b4C5d6E7f809102a3B"],
  ["eth", "0x0000000000000000000000000000000000000001"],
  ["sol", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"],
  ["sui", `0x${"ab".repeat(32)}`],
  ["aptos", `0x${"1f".repeat(32)}`],
  ["ton", "EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2"],
  ["ton", `0:${"ab".repeat(32)}`],
  ["tron", "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7"],
  ["xrp", "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"],
  ["btc", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"],
  ["btc", "1BoatSLRHtKNngkdXEeobR76b53LETtpyT"],
  ["doge", "DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L"],
  ["zec", "t1Rv4exT7bqhZqi2j7xz8bUHDMxwosrjADU"],
]

describe("depositAddressLooksRight (CLI-10)", () => {
  it.each(GOOD)("a real %s address is shown", (chain, a) => expect(depositAddressLooksRight(real(chain, a))).toBe(true))

  it("a wrong-network address is hidden (an EVM address offered for Solana, a Solana one for Base, …)", () => {
    expect(depositAddressLooksRight(real("sol", "0x8a1F2b3C4d5E6f708192A3b4C5d6E7f809102a3B"))).toBe(false)
    expect(depositAddressLooksRight(real("base", "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"))).toBe(false)
    expect(depositAddressLooksRight(real("btc", "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7"))).toBe(false)
    expect(depositAddressLooksRight(real("base", "0x8a1F2b3C4d5E6f708192A3b4C5d6E7f809102a3"))).toBe(false) // one short
    expect(depositAddressLooksRight(real("base", "0x8a1F2b3C4d5E6f708192A3b4C5d6E7f809102a3B "))).toBe(false)
    expect(depositAddressLooksRight(real("base", ""))).toBe(false)
  })

  it("the QR must carry the same address (bare or as a payment URI)", () => {
    const a = "0x8a1F2b3C4d5E6f708192A3b4C5d6E7f809102a3B"
    expect(depositAddressLooksRight(real("base", a, { qrText: `ethereum:${a}@8453` }))).toBe(true)
    expect(depositAddressLooksRight(real("base", a, { qrText: "0x0000000000000000000000000000000000000001" }))).toBe(false)
    expect(depositAddressLooksRight(real("base", a, { qrText: `ethereum:${a}0000` }))).toBe(false)
    expect(depositAddressLooksRight(real("base", a, { qrText: `${a}` }))).toBe(true)
  })

  it("a memo is short plain text (a number on XRP)", () => {
    const x = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh"
    expect(depositAddressLooksRight(real("xrp", x, { depositMemo: "123456" }))).toBe(true)
    expect(depositAddressLooksRight(real("xrp", x, { depositMemo: "abc" }))).toBe(false)
    expect(depositAddressLooksRight(real("ton", "EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2", { depositMemo: "x\u0000" }))).toBe(
      false,
    )
  })

  it("a simulated address (test money, never sent to) is always shown", () => {
    expect(
      depositAddressLooksRight({ mode: "simulated", chain: "base", depositAddress: "SIMULATED-base-5k1a2c3e", qrText: "TEST ONLY" }),
    ).toBe(true)
  })
})
