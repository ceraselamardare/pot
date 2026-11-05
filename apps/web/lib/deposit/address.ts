// CLI-10 (security audit 2026-11-04): the "from another app" deposit address comes from our server (which got it from
// 1Click). Before the browser shows it or its QR, it checks the address has the shape of an address on the network the
// person picked, and that the QR encodes that same address. A wrong-network or swapped address would send someone's
// coins where they can't come back from, so a failed check hides the address entirely (components/features/deposit).
// Shape checks only: they catch a mix-up or a crude swap, not a well-formed address of the attacker's (that needs the
// server; see notes/frontend.md "Security fixes (2026-11-05)").
import type { XcChain } from "./types"

const B58 = "[1-9A-HJ-NP-Za-km-z]"
const EVM = /^0x[0-9a-fA-F]{40}$/

/** One pattern per network (the networks `XcChain` lists). */
export const ADDRESS_SHAPE: Record<XcChain, RegExp> = {
  base: EVM,
  arb: EVM,
  eth: EVM,
  pol: EVM,
  op: EVM,
  avax: EVM, // the C-chain
  sol: new RegExp(`^${B58}{32,44}$`),
  sui: /^0x[0-9a-fA-F]{64}$/,
  aptos: /^0x[0-9a-fA-F]{1,64}$/,
  // user-friendly (base64url, 48 chars) or raw `workchain:hex`
  ton: /^(?:[A-Za-z0-9_-]{48}|-?[0-9]:[0-9a-fA-F]{64})$/,
  tron: new RegExp(`^T${B58}{33}$`),
  xrp: new RegExp(`^r${B58}{24,34}$`),
  // bech32 / bech32m (bc1…) or legacy base58 (1… / 3…)
  btc: new RegExp(`^(?:bc1[02-9ac-hj-np-z]{11,71}|[13]${B58}{25,34})$`),
  doge: new RegExp(`^[DA9]${B58}{25,34}$`),
  // transparent addresses (t1… / t3…)
  zec: new RegExp(`^t[13]${B58}{33}$`),
}

export interface AddressToCheck {
  mode: "real" | "simulated"
  chain: XcChain
  depositAddress: string
  qrText: string
  depositMemo?: string | null
}

/** Is this real deposit address safe to show? (A simulated one is never sent to: always fine.) */
export function depositAddressLooksRight(d: AddressToCheck): boolean {
  if (d.mode === "simulated") return true
  const shape = ADDRESS_SHAPE[d.chain]
  if (!shape || !shape.test(d.depositAddress)) return false
  // the QR must carry this exact address (bare, or as a payment URI like `ethereum:<address>?…`)
  const a = d.depositAddress
  const scheme = /^[a-z][a-z0-9+.-]*:/i.exec(d.qrText)?.[0] ?? null
  const asUri = !!scheme && d.qrText.startsWith(scheme + a) && /^([?@/]|$)/.test(d.qrText.slice(scheme.length + a.length))
  if (d.qrText !== a && !asUri) return false
  // a memo / tag (XRP, TON…) is short plain text; on XRP it's a number
  if (d.depositMemo) {
    if (d.depositMemo.length > 128 || /[\u0000-\u001f\u007f]/.test(d.depositMemo)) return false
    if (d.chain === "xrp" && !/^[0-9]{1,10}$/.test(d.depositMemo)) return false
  }
  return true
}
