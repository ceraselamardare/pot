// /llms.txt (llmstxt.org): a short, factual Markdown summary of Pot for AI assistants and agents. Its page list comes
// from the marketing registry (lib/marketing/pages.ts), so it can't drift from the sitemap. It isn't UI copy (no t()),
// and it may name the tech plainly. Keep every claim inside the product's limits (docs/limitations.md): a testnet
// preview with test dollars, no cash-out, Google sign-in only on local builds, other networks simulated.
import { t } from "@/i18n/t"
import { MARKETING_PAGES } from "./pages"
import { absoluteUrl, SITE } from "./site"

/** A link-list line; `path` is a site path or an absolute URL (kept as is). */
const link = (name: string, path: string, note: string) => `- [${name}](${absoluteUrl(path)}): ${note}`

export function llmsTxt(): string {
  const pages = (where: "main" | "optional") =>
    MARKETING_PAGES.filter((p) => p.llms === where).map((p) => link(t(p.titleKey), p.path, t(p.descriptionKey)))
  const optional = pages("optional")

  return [
    `# ${SITE.name}`,
    "",
    "> Pot is a phone web app for money a group shares: a trip, a club or a team. Everyone adds dollars to one Pot. Small spends that fit the group's rules go through on their own; bigger ones need an OK from another member or a majority of the group. When the Pot closes, everyone gets back their share of what's left. Pot is a preview on NEAR testnet with test dollars: no real money moves.",
    "",
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
    "- Money is a USDC-style test token, shown as dollars.",
    "- Sign-in on the live site: a NEAR wallet (NEAR Connect). Google and email sign-in (NEAR Auth) are built but work only on a local build for now.",
    "- Adding money from other networks (NEAR Intents 1Click) is simulated on testnet; only the price quotes are real.",
    "- Receipts are read privately by NEAR AI Cloud, in a secure enclave.",
    "",
    "## Limits",
    "",
    "- Testnet preview with test dollars (\"demo dollars\"). Nothing runs on mainnet and no real money is involved.",
    "- No cash-out yet: after a close, each person's share stays in their Pot balance.",
    "- Not available: card top-ups, Apple sign-in, email or Telegram notifications, a store app.",
    "- Pot names, amounts, members and requests are public on chain. People's display names and pictures, notes, comments and receipts are for members only.",
    "- Free for users during the preview, with daily limits on free actions. There is no pricing.",
    "",
    "## Pages",
    "",
    ...pages("main"),
    "",
    "## Project",
    "",
    link("Source code", SITE.repo, "the app, API, relayer and SDK (AGPL-3.0) and the contracts (MIT)"),
    `- Made by ${SITE.founder}, solo builder, for NEAR HACKATHON 2026 (tracks: social, realworld).`,
    "- Contracts on NEAR testnet: the hub `pots.potprev.testnet`; a reference Pot `lisbon-trip.pots.potprev.testnet`.",
    ...(optional.length ? ["", "## Optional", "", ...optional] : []),
    "",
  ].join("\n")
}
