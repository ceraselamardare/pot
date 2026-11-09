// /llms.txt (llmstxt.org): a short, factual Markdown summary of Pot for AI assistants and agents. Its page list comes
// from the marketing registry (lib/marketing/pages.ts), so it can't drift from the sitemap. It isn't UI copy (no t()),
// and it may name the tech plainly. It describes the full product; keep every claim inside the product's limits
// (docs/limitations.md): no cash-out, Google sign-in only on local builds. Which network this build runs on is one
// neutral status line (testnet builds only), the machine-readable twin of the Testnet badge, and nothing else says
// "testnet" except the contract addresses, which are literal names on that network.
import { t } from "@/i18n/t"
import { isTestnetBuild } from "@/lib/network"
import { MARKETING_PAGES } from "./pages"
import { absoluteUrl, SITE } from "./site"

/** A link-list line; `path` is a site path or an absolute URL (kept as is). */
const link = (name: string, path: string, note: string) => `- [${name}](${absoluteUrl(path)}): ${note}`

/** The status line on a testnet build (the Testnet badge, for machines). */
export const LLMS_TESTNET_STATUS = "Status: currently running on NEAR testnet; mainnet is next."

export function llmsTxt(): string {
  const pages = (where: "main" | "optional") =>
    MARKETING_PAGES.filter((p) => p.llms === where).map((p) => link(t(p.titleKey), p.path, t(p.descriptionKey)))
  const optional = pages("optional")

  return [
    `# ${SITE.name}`,
    "",
    "> Pot is a phone web app for money a group shares: a trip, a club or a team. Everyone adds dollars to one Pot. Small spends that fit the group's rules go through on their own; bigger ones need an OK from another member or a majority of the group. When the Pot closes, everyone gets back their share of what's left.",
    "",
    ...(isTestnetBuild() ? [LLMS_TESTNET_STATUS, ""] : []),
    `Tagline: "${t("app.description")}" Website: ${absoluteUrl("/")} (also called usepot).`,
    "",
    "## How it works",
    "",
    "1. Start a Pot and keep or change its rules. Defaults: anyone can spend up to $100 at a time, and $200 in total, without asking; one OK from another member covers spends up to $300; anything bigger needs more than half the group.",
    "2. Share one invite link or QR code in the group chat. Friends see the Pot and its rules before they sign in.",
    "3. Everyone adds money.",
    "4. Each spend is checked against the rules: small ones are approved at once, bigger ones wait for approvals. Requests expire after 7 days.",
    "5. Close the Pot with the group's approval. What's left goes back to each person in proportion to what they put in.",
    "",
    "Also: limits that grow with trust, a goal with a date (all or nothing), pay-in links for people outside the group, paying anyone by link, private receipt reading, comments, a public record with CSV export, push notifications, and install to the Home Screen. Up to 40 people per Pot.",
    "",
    "## Under the hood",
    "",
    "- Each Pot is its own Sputnik DAO on NEAR Protocol. The Pot Hub contract holds the rules and approves small spends on its own; bigger ones need members' approvals.",
    "- People hold 0 NEAR: Pot relays their actions as NEP-366 meta transactions and pays the network costs.",
    "- Money is held in USDC and shown as dollars.",
    "- Sign-in on the live site: a NEAR wallet (NEAR Connect). Google and email sign-in (NEAR Auth) are built but work only on a local build for now.",
    "- People can also add money from other networks, through NEAR Intents 1Click.",
    "- Receipts are read privately by NEAR AI Cloud, in a secure enclave.",
    "",
    "## Limits",
    "",
    "- No cash-out: after a close, each person's share stays in their Pot balance.",
    "- Not available: card top-ups, Apple sign-in, email or Telegram notifications, a store app.",
    "- Pot names, amounts, members and requests are public on chain. People's display names and pictures, notes, comments and receipts are for members only.",
    "- Free for users: Pot covers the running costs, with daily limits on free actions.",
    "",
    "## Pages",
    "",
    ...pages("main"),
    "",
    "## Project",
    "",
    link("Source code", SITE.repo, "the app, API, relayer and SDK (AGPL-3.0) and the contracts (MIT)"),
    `- Made by ${SITE.founder}, solo builder, for NEAR HACKATHON 2026 (tracks: social, realworld).`,
    "- Contracts on NEAR testnet: the hub `pots.potprev.testnet`; a reference Pot `reference-trip-2gzw.pots.potprev.testnet`, where the whole story ran on chain (live proofs: `node scripts/verify-proofs.mjs` in the repository).",
    ...(optional.length ? ["", "## Optional", "", ...optional] : []),
    "",
  ].join("\n")
}
