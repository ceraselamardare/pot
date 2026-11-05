// CLI-4 (security audit 2026-11-04): a Pot's public pages (the public pay-in page /give/<slug> and its pay-in links
// /g/<slug>/<id>) show the Pot's name in big type and in link previews. A Pot called "NEAR Foundation", "Official
// Red Cross" or "Pot Support" would get an official-looking page to collect money with. Any Pot may keep any name among
// its members, but such a name can't get a PUBLIC page or pay-in link. Enforced on our server where a page is turned on
// / a link is made and again where they are read (server/features/gifts), mirrored in the mock world and pre-checked in
// the UI (components/payin) so people see why before they try.
//
// Matching: compatibility-fold the text (NFKC, so full-width and styled letters become plain), lowercase, undo common
// look-alike digits/symbols (0→o, 1→l and i, 3→e, 4/@→a, 5/$→s, 7→t), then look for each reserved phrase as whole
// words, and the longer ones also with the spaces taken out ("redcross", "nearfoundation"). Plain words that are also
// everyday English ("near", "pot", "support", "amazon", "aurora") only count in the exact phrases below, so "Pot luck",
// "Near the beach" and "Support Leo's surgery" stay fine.

export type ReservedWhy = "reserved_name"

/** Our own name and product words: refused only as the whole name or in these phrases. */
const OWN = [
  "pot",
  "pot app",
  "the pot app",
  "pot team",
  "pot support",
  "pot official",
  "official pot",
  "pot help",
  "pot admin",
  "pot security",
  "pot refunds",
  "pot payments",
]

/** Phrases that make a page look official, anywhere in the name. */
const OFFICIAL = [
  "official",
  "verified",
  "customer support",
  "customer service",
  "support team",
  "help desk",
  "helpdesk",
  "security team",
  "refund team",
  "admin team",
]

/** NEAR and the services around it (as phrases; "NEAR" alone is checked case-sensitively below). */
const ECOSYSTEM = [
  "near protocol",
  "near foundation",
  "near wallet",
  "near official",
  "near team",
  "near ai",
  "nearai",
  "near intents",
  "sputnik",
  "sputnik dao",
  "trezu",
  "hot wallet",
  "hot labs",
  "meteor wallet",
  "intear",
  "mynearwallet",
  "ref finance",
  "fastnear",
]

/** Well-known companies and payment brands people are scammed in the name of. */
const COMPANIES = [
  "usdc",
  "circle internet",
  "tether",
  "usdt",
  "coinbase",
  "binance",
  "kraken exchange",
  "metamask",
  "trust wallet",
  "phantom wallet",
  "ledger live",
  "trezor",
  "paypal",
  "venmo",
  "cash app",
  "cashapp",
  "zelle",
  "revolut",
  "stripe",
  "mastercard",
  "western union",
  "moneygram",
  "google",
  "apple pay",
  "apple support",
  "microsoft",
  "amazon support",
  "amazon pay",
  "facebook",
  "instagram",
  "whatsapp",
  "telegram",
  "tiktok",
  "openai",
  "chatgpt",
  "anthropic",
  "vercel",
  "github",
  "gofundme",
  "kickstarter",
  "patreon",
]

/** Charities and aid organisations (fake donation pages are the classic scam after a disaster). */
const CHARITIES = [
  "red cross",
  "red crescent",
  "unicef",
  "unhcr",
  "united nations",
  "world food programme",
  "world food program",
  "save the children",
  "oxfam",
  "doctors without borders",
  "medecins sans frontieres",
  "msf",
  "amnesty international",
  "greenpeace",
  "wwf",
  "world wildlife fund",
  "salvation army",
  "habitat for humanity",
  "st jude",
  "american cancer society",
  "cancer research uk",
  "direct relief",
  "care international",
  "caritas",
  "world vision",
  "charity water",
  "giving tuesday",
]

const ANYWHERE = [...OFFICIAL, ...ECOSYSTEM, ...COMPANIES, ...CHARITIES]

const LOOKALIKE: Record<string, string> = {
  "0": "o",
  "1": "l",
  "3": "e",
  "4": "a",
  "@": "a",
  "5": "s",
  $: "s",
  "7": "t",
  "|": "l",
  "!": "i",
}

/** Words of `s` after folding (also the 1→i reading, so "0ff1cial" and "p0t" match). */
function variants(s: string): string[][] {
  const base = s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // é → e
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[­​-‏⁠-⁤﻿]/g, "") // invisible characters
  const fold = (map: Record<string, string>) =>
    base
      .split("")
      .map((c) => map[c] ?? c)
      .join("")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(" ")
      .filter(Boolean)
  return [fold(LOOKALIKE), fold({ ...LOOKALIKE, "1": "i", "|": "i" })]
}

const hasPhrase = (words: string[], phrase: string): boolean => {
  const p = phrase.split(" ")
  for (let i = 0; i + p.length <= words.length; i++) if (p.every((w, j) => words[i + j] === w)) return true
  // the longer phrases also count written together or split differently ("redcross", "near foundation" as
  // "nearfoundation"), but only on word boundaries: "Linear AI" is not "near ai"
  const squashed = phrase.replace(/ /g, "")
  if (p.length < 2 || squashed.length < 6) return false
  for (let i = 0; i < words.length; i++) {
    let run = ""
    for (let j = i; j < words.length && run.length < squashed.length; j++) {
      run += words[j]
      if (run === squashed) return true
    }
  }
  return false
}

/** Does this text (a Pot's name, its slug or the page's one-liner) read like an official / brand page? */
export function isReservedPublicName(text: string | null | undefined): boolean {
  if (!text) return false
  // "NEAR" in capitals is the network's name; "near" in lower case is an everyday word
  if (/(^|[^A-Za-z])NEAR([^A-Za-z]|$)/.test(text.normalize("NFKC"))) return true
  for (const words of variants(text)) {
    const whole = words.join(" ")
    if (OWN.includes(whole)) return true
    if (ANYWHERE.some((p) => hasPhrase(words, p))) return true
  }
  return false
}

/** The public-page check for a Pot: its name, its slug (the page's address) and the members' one-liner. */
export function publicPageRefusal(p: { name: string; slug?: string | null; line?: string | null }): ReservedWhy | null {
  const slugWords = p.slug ? p.slug.replace(/-/g, " ") : null
  return isReservedPublicName(p.name) || isReservedPublicName(slugWords) || isReservedPublicName(p.line) ? "reserved_name" : null
}

/** The machine-readable refusal our API sends (400 bad_request, detail {field, why}); the UI matches on `why`. */
export const RESERVED_DETAIL = { field: "name", why: "reserved_name" } as const

/** Is this error our API's (or the mock's) reserved-name refusal? */
export const isReservedNameError = (e: unknown): boolean =>
  !!e && typeof e === "object" && (e as { detail?: { why?: unknown } }).detail?.why === RESERVED_DETAIL.why
