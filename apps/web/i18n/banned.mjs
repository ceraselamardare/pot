// The jargon list (D-44, frontend-architecture §9.3): the plan's "Never show" table + ux-spec §1.2.
// Shared by i18n/lint-copy.mjs (layer 1, en.json values) and eslint.config.mjs (layer 2, TSX literals).
// Matching is case-insensitive with word boundaries, except "NEAR", which is case-sensitive so the
// English word "near" passes.

/** Case-insensitive banned patterns (regex source, no flags). */
export const BANNED_CI = [
  "DAO",
  "multisig",
  "treasury",
  "proposals?",
  "votes?",
  "voting",
  "council",
  "quorum",
  "bond",
  "gas",
  "fees?",
  "yocto(?:NEAR)?",
  "storage(?: deposit)?",
  "relayer",
  "sponsored",
  "wallets?",
  "account ?IDs?",
  "address(?! bar)",
  "addresses",
  "testnet",
  "tx",
  "hash(?:es)?",
  "transaction hash",
  "blocks?",
  "USDC",
  "Sputnik",
  "Trezu",
  "blockchain",
  "crypto",
  "tokens?",
  "seed phrase",
  "private key",
  "signatures?",
  "sign(?:ing)? transactions?",
  "bot",
  "policy",
  "contracts?",
  "cap",
  "budget",
  "allowance",
  "deposits?",
  "transfer_call",
  "settle(?:ment)?",
  "pro-?rata",
  "chain",
  "networks?",
  "bridge",
  "swap",
  "intents?",
  "Rulebot",
  "on-?chain",
  "organizers",
  // "Snap the receipt" (2026-11-01): say "read privately" / "a sealed computer", never the machinery
  "AI",
  "TEEs?",
  "LLMs?",
  "OCR",
  "attestations?",
  "enclaves?",
]

/** Case-sensitive banned patterns. */
export const BANNED_CS = ["NEAR"]

/** Key prefixes that may use the words above (ux-spec §1.2 + D-20). */
export const ALLOW_PREFIXES = [
  "advanced.",
  "xc.",
  "demo.",
  "legal.",
  "notif.bot.",
  // The landing's "Under the hood" section for judges (D-44 exemption, like `demo.`/`advanced.`). It is the only
  // part of `/` that may name the tech (NEAR, Sputnik DAO, USDC, relayer…); every other `home.*` key is linted.
  "home.tech.",
]

/**
 * Exact keys that may use them. `signin.wallet.only` ("Continue with a NEAR wallet", 2026-11-03 site update): the
 * sign-in dialog's one marigold on builds where a NEAR wallet is the only way in (NEAR Auth flagged off); the same
 * exemption D-20 gave `landing.more.wallet` for the same option. `uc.common.signin_today` ("Sign in with a NEAR wallet
 * today; Google sign-in is coming.", the use-case pages' FAQ, 2026-11-06): the marketing pages must say how sign-in
 * works on the live site today (product.md §3: Google sign-in isn't on there yet), and that option is named so.
 */
export const ALLOW_KEYS = ["add.usdc_note", "landing.more.wallet", "advanced.wallet", "signin.wallet.only", "uc.common.signin_today"]

export const BANNED_CI_RE = new RegExp(`\\b(?:${BANNED_CI.join("|")})\\b`, "i")
export const BANNED_CS_RE = new RegExp(`\\b(?:${BANNED_CS.join("|")})\\b`)

/** The banned word in `text`, or null. */
export function findBanned(text) {
  const a = BANNED_CI_RE.exec(text)
  if (a) return a[0]
  const b = BANNED_CS_RE.exec(text)
  return b ? b[0] : null
}

/** Is this key (plural suffix ignored) allowed to use banned words? */
export function isAllowlisted(key) {
  const base = key.split("#")[0]
  return ALLOW_KEYS.includes(base) || ALLOW_PREFIXES.some((p) => base.startsWith(p))
}
