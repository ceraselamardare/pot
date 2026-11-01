# Pot submission plan (README, video, X post, JSON, mainnet clip)

> Owner: planner. Written 2026-10-21 for P1, Cerasela (P2) and the agents that draft the README and the submission payload.
> Binding inputs: [../kb/hackathon-rules.md](../kb/hackathon-rules.md) (live HACKATHON.md, the submission API, judges, criteria), [decisions.md](decisions.md) Rev 2 (D-52, D-61, D-63), [ux-spec.md](ux-spec.md) §6 (demo cast and numbers), [accounts-and-deploy.md](accounts-and-deploy.md) §2, §3.12, §4, [contracts-spec.md](contracts-spec.md) §8-§9, [api-spec.md](api-spec.md) §7, the original plan C2 and C8.
> **Humans decide and do:** project name, lead name, email, payout account, repo link, X post link, the `idea` text, consent, making the repo public, posting, and the POST itself (HACKATHON.md: agents never "guess, generate or fill in" these values, D-63). Agents only draft and check.
> Placeholders: `<app>` = production origin, `<root>` = team root (H-05), `<slug>` = a Pot slug. They are replaced with real values on Nov 12; the submitted README contains no placeholders.
> **Rev 3 review (2026-10-21, [review.md](review.md)):** the `deposit/submit` limitation; the pre-Leo Pot is made through the app; both video devices must act in the same Pot; relayer ≥ 10 NEAR on Nov 13.
> **Rev 4 (2026-10-21, [review-security.md](review-security.md) §7):** J-7 also shows the token's empty key table (locked Nov 2); the README's limitations and security notes gain the review's disclosures (§1.6, §1.1 row 13); the mainnet clip personas attach the hub's cost and the mainnet hub is locked right after the clip (§6).
> **Rev 6 (2026-10-21, brand; D-67, [../brand/README.md](../brand/README.md)):**
> - The README opens with the **lockup** and the brand tagline, and its video link is **`og-image.png`** (§1.1).
> - The video uses the lockup on its end card, the brand's link preview in the WhatsApp scene, and brand type and colours (§2).
> - Any Pot link on X unfurls as a large card from **`og-image.png`**, and the repo's social preview is set to it (§3, §5).
> - The product name is decided: "Pot" (H-06).

## 0. TL;DR

- The README is written **for a machine reader first**: what Pot is (2 lines), the problem (3 bullets), then **"Try it in 2 minutes" = J-1…J-8**, each "do X → see Y" with a non-UI twin (`curl`, a read-only `near` command, or a nearblocks link). E-10/E-11 run these steps as tests ([test-plan.md](test-plan.md) §5.3).
- **Numbers are the D-61 demo everywhere** (README, video, tests, hallway): $450 from Maya, Sam and Leo → $84 groceries instant → $366 → $300 boat needs 2 of 3 (Maya's approval counts) → Leo approves → $66 → close → **$22.00 each**.
- Video: **≤ 2:45** main cut and a **≤ 2:20** cut for X. The X post is posted by a human and says "Built at NEAR HACKATHON" with the video attached.
- Nov 13 (UTC): 08:00 checks → 10:00 repo public → 11:00 X post → 12:00 JSON printed and confirmed → POST → target 201 before 18:00 UTC. Nov 14 is buffer.

---

## 1. README outline (for AI judges)

### 1.1 Structure

| # | Section | Content | Owner |
|---|---|---|---|
| 1 | Title + one line | "Pot: group money that follows its own rules, on NEAR." No marketing words. Rev 6: the **lockup** comes first. Use `<picture>` with `docs/brand/logo/pot-lockup-on-dark.svg` for `(prefers-color-scheme: dark)` and `pot-lockup-on-light.svg` otherwise, at least 96 px wide (about 240 px), `alt="Pot"`. The line uses the brand tagline: "Pot: group chat money that follows its own rules, on NEAR." In text the name is "Pot"; only the logo is lowercase | P2 |
| 2 | What it is (2 sentences) + problem (3 bullets) | someone always fronts the trip money and chases debts; pooled-money apps pay out to one owner; split apps hold no money (competitors-ux-patterns.md) | P2 |
| 3 | **Try it in 2 minutes** (no install, no login) | J-1…J-8 (§1.2) | P1 + P2 |
| 4 | What a judge can't do from here | Google login is limited to `localhost:3000` until NEAR Auth whitelists our origin; push needs a phone; → watch the video (link). Rev 6: the link is `docs/brand/web/og-image.png` as a clickable image, with alt text "Pot demo video" | P2 |
| 5 | How it works | one diagram: browser device key → `/api/relay` (NEP-366) → Pot Hub `pots.<root>` → Sputnik DAO `<slug>.pots.<root>` → `usdc.<root>`; the trust model in 5 lines (architecture.md §2): nobody, including the server, can move Pot money alone | P1 |
| 6 | Track hints used | §1.3 table | P1 |
| 7 | NEAR features used | §1.4 list | P1 |
| 8 | Costs and sustainability | §1.5 (a judged criterion) | P1 |
| 9 | Limitations | §1.6 | both |
| 10 | Why web-first | §1.7 (condensed C2) | P2 |
| 11 | Screenshots | 4-6 PNGs with descriptive alt text (§1.8) | P2 |
| 12 | Repo map, tests, how to run locally | D-64 layout; `pnpm i && pnpm test`; `cd contracts && cargo test -p pot-tests`; env names from `.env.example` | P1 |
| 13 | Security notes | the honest limits (§1.6), INV-14 disclosure (until its key was deleted on Nov 12, whoever held the hub key could approve transfers and push DAO upgrades; the token key was deleted on Nov 2), key custody (custody keys never on the machine user that runs AI agents; demo keys only in hosting env vars), the hub sponsors only our relayer's calls (direct callers pay their own way), the relayer relays votes only on Pot-created proposals, relayer abuse controls, static security headers (rev4) | P1 |
| 14 | Licence, credits | OSS licence file; "Phase 0 research in `docs/kb`; throwaway spikes are not part of this repo" | P1 |

Writing rules: short sentences; every claim either links to a receipt (nearblocks), a command, or a file; no adjectives like "revolutionary"; "do X → see Y" verbs are literal UI labels.

### 1.2 Try it: J-1…J-8 (the executable judge script)

Each step has a hidden marker `<!-- J-n -->` that E-10/E-11 check. Amounts are the D-61 numbers.

| J | Do | See | Non-UI twin |
|---|---|---|---|
| J-1 | Open `https://<app>/demo` → **Show me how** (the simulated tour, `/demo`; the live persona demo moved to `/demo/live`, off by default) | Part 1 "Start a Pot": Maya picks Trip rules ("Create Pot") and gets one link to share; "This is a simulation" said once on the cover | part 1's **Under the hood**: `create_pot` to `pots.potprev.testnet`, the relayer's transaction, the receipts creating `lisbon-trip-7k2f.pots.potprev.testnet` with no access keys |
| J-2 | Next (or the phone's **Join Lisbon Trip** → **Add my $150 share**) through part 2, "Join and chip in" | now you're Leo: "Maya and Sam are in", "You're in!", then **$450 of $450 collected** | part 2's Under the hood: the invite signature `pot-join:v1:…`, `AddMemberToRole` proposal #1 (1 of 1), `ft_transfer_call` |
| J-3 | Part 3: tap **Get $84 back** in the phone | "Checking Pot rules…" (Next waits 1.2 s), then **"Approved by Pot rules"** with the one burst, then **"$84 sent to you"**; the Pot shows $366 | part 3's Under the hood: `request_spend`, proposal #2 (`Transfer`, `84000000`) approved by the 1-of-1 `rulebot` seat, real testnet links |
| J-4 | Part 4: **Ask the group** for $300, then (as Leo, after his lock-screen push) **Approve $300** | "This needs 2 of 3 approvals" → "1 of 2 approvals" (Maya's own counts) → "Approved! $300 is on its way to Maya"; the Pot shows **$66** | part 4's Under the hood: the `VoteApprove` votes, threshold `min(3 × 1 ÷ 2 + 1, 3) = 2` |
| J-5 | Part 5: **Ask the group to close**, then (as Sam) **Approve closing** → **Finish** | everyone put in $150, everyone **gets back $22.00**; "That's Pot." and **Start a real Pot** (`/pots?sheet=create`) | part 5's Under the hood: proposal #4 with three `ft_transfer`s, and the recap (11 signatures, 12 transactions) |
| J-6 | `curl -s https://<app>/demo/4` (no JavaScript) | the whole story as `<li id="step-1">`…`step-14` and five closed "Under the hood" `<details>`: "Approved by Pot rules", `request_spend`, `VoteApprove`, `84000000`, "Simulated", a nearblocks link | `https://<app>/demo/all`: the full technical read on one page |
| J-7 | Run the read-only commands below (no keys) | the reference Pot is a Sputnik DAO with roles `member` and `rulebot`, bond 0, quorum 1; it runs the official Sputnik code by global hash; it holds $450 in "USDC (test)"; nobody holds a key to the hub, the token (rev4) or the Pot | the commands themselves (accounts-and-deploy §4) |
| J-8 | `pnpm i && pnpm test` and `cd contracts && cargo test -p pot-tests` (arm64 Mac or Linux) | unit, property and sandbox tests pass on both Sputnik builds, with no keys and no network | CI badge |

J-7 command block (verbatim in the README; `npx -y near-cli-rs@0.30.1` works without an install; on a `-429`, use `network-config testnet-fastnear`):

```
ROOT=<root>.testnet; HUB=pots.$ROOT; POT=lisbon-trip.$HUB
near contract call-function as-read-only $POT get_policy json-args '{}' network-config testnet now
near contract call-function as-read-only $HUB get_pot json-args "{\"pot\":\"$POT\"}" network-config testnet now
near contract call-function as-read-only usdc.$ROOT ft_balance_of json-args "{\"account_id\":\"$POT\"}" network-config testnet now
near account view-account-summary $POT network-config testnet now
near contract call-function as-read-only $POT get_factory_info json-args '{}' network-config testnet now
near account list-keys $HUB network-config testnet now
near account list-keys usdc.$ROOT network-config testnet now
near account list-keys $POT network-config testnet now
```

### 1.3 Track hints used

| Hint (track) | Where in Pot | Proof in the README |
|---|---|---|
| **SPUTNIK DAO** (social) | every Pot is a Sputnik DAO created from the official code by global hash; a hardened two-role policy (members by majority, the hub as a 1-of-1 rulebot for capped spends and joins) | J-7 `get_policy`, `view-account-summary`, `get_factory_info` |
| **TREZU** (social) | mainnet clip: the mainnet Pot in Trezu (`https://trezu.app/<slug>.pots.<root>.near/requests` and `/members`). On testnet: explorer links and an in-app "On-chain rules" panel, because Trezu is mainnet-only (D-52) | link + screenshot; video timestamp |
| **NAMED ACCOUNTS** (social) | `u-<8>.users.<root>` accounts for people, `<slug>.pots.<root>` for Pots, all readable | J-7 ids |
| **STABLECOINS** (realworld) | everything is in dollars: "USDC (test)" (6 decimals) on testnet, Circle USDC in the mainnet clip | J-3 receipts; clip hashes |
| **NEAR INTENTS** (realworld) | "Add money from another wallet or exchange": a 1Click `FLEX_INPUT` deposit from Base, Arbitrum, Solana or Ethereum to the member's NEAR account, then into the Pot (simulated on testnet, real in the clip) | clip deposit address + NEAR tx hashes |
| **META TRANSACTIONS** (realworld) | every action is a NEP-366 delegate relayed by our relayer; users hold 0 NEAR | any J-3 receipt shows the relayer as signer and the member as sender |

Also say plainly why the Club and Team presets matter for `realworld` (club dues, team offsite budgets: "something a normal company could use tomorrow", hackathon-rules.md).

### 1.4 NEAR features used (README list)

NEP-366 meta transactions (delegate actions) with our own relayer · NEP-448 zero-balance accounts (users hold 0 NEAR) · global contracts (Sputnik code used by hash, `UseGlobalContract` in a creation batch) · sub-account factory (the hub creates `<slug>.pots.<root>`) · cross-contract calls with callbacks and `Promise::and` · NEP-141/NEP-145 fungible token with `ft_transfer_call` / `ft_on_transfer` · NEP-297 events · `env::ed25519_verify` for invite signatures · NEAR Auth (Auth0 login + MPC key derivation `v1.signer-prod.testnet`, Ed25519 domain) · NEP-413 sign-in for wallets · NEAR Connect · locked contracts (no access keys) · FastNEAR RPC and Transactions API.

### 1.5 Costs and sustainability

Numbers are testnet NEAR from [accounts-and-deploy.md](accounts-and-deploy.md) §2.1 and [contracts-spec.md](contracts-spec.md) §8.3-§8.4 (✅ measured, ⚠️ estimated). Gas price is 1e8 yocto/gas on both networks, so 1 Tgas = 0.0001 NEAR.

| Who pays | Item | NEAR |
|---|---|---|
| relayer | onboarding a user (account creation charge + USDC registration + gas) | 0.0085 ✅ |
| hub | a new Pot: DAO float 0.05 (testnet; 0.1 mainnet) + USDC registration + hub state | ≈ 0.061 ⚠️ |
| hub + relayer | a join | ≈ 0.009 + 0.002 ⚠️ |
| relayer | a contribution | ≈ 0.0011 ✅ |
| hub + relayer | an instant spend (storage prepay + gas) | ≈ 0.0085 + 0.003 ⚠️ |
| hub + relayer | a vote spend incl. 2 votes and `sync` | ≈ 0.0115 + 0.0033 ⚠️ |
| hub + relayer | a close for 3 members | ≈ 0.017 + 0.0033 ⚠️ |
| relayer | adding a new device (NEAR Auth MPC sign) | ≈ 0.0045 ✅ |

A whole Lisbon Trip lifecycle (3 people onboarded, 1 Pot, 2 joins, 3 contributions, 1 instant spend, 1 vote spend, 1 close) costs **≈ 0.17 NEAR**, of which ≈ 0.05 is burnt gas and account charges and ≈ 0.12 is storage staked in the DAO and the hub. At the NEAR price seen in the 1Click token list on 2026-10-21 (≈ $5.16, an assumption, prices move), that is under $1 per group trip.

**Sustainability (2-4 lines in the README):** costs scale with actions, not with balances, and are bounded by on-chain caps and the relayer's daily budget. Two revenue paths need no new contracts: (1) a small app fee on cross-chain deposits through 1Click's `appFees` (the spike saw 1Click split a partner fee 50/50), so a 20 bps fee on a $150 deposit ($0.30) covers a group's lifecycle after about three deposits; (2) paid Club and Team presets (organizations with recurring dues). Infrastructure runs on free tiers (Neon, FastNEAR keyless) plus Vercel Pro at $20 per seat.

### 1.6 Limitations (honest list)

- **Trezu is mainnet-only.** Testnet Pots show in the NEAR explorer and in the app's "On-chain rules" panel. On mainnet, Trezu shows our Pot's requests and members, but its **"required approvals" count is wrong** for Pot's two-role policy (it shows 3 for a 3-member Pot; the contract needs 2 members, or the rulebot alone for capped spends), its dashboard balance stays empty for DAOs outside `*.sputnik-dao.near`, and role names show raw (`member`, `rulebot`).
- **NEAR Auth origin whitelist.** The shared testnet login only accepts `http://localhost:3000`. Unless the NEAR Auth team whitelists our origin, the hosted app offers the demo personas and "I have a NEAR wallet" (NEAR Connect); Google login is shown on `localhost` in the video. (Update this line after G4.)
- **Custodial demo personas.** `/demo/live` personas (off unless `FLAG_DEMO_LIVE=true`; `/demo` is a simulation that signs nothing) sign with a server-held testnet key so judges can act without a login. They are labeled on every page and only hold test money. The reference Pot's personas hold no key at all, so nobody can change it (rev4). A client without JavaScript gets the read-only demo page, not a leased Pot (the app needs JavaScript).
- Test money: "USDC (test)" has no value; the faucet hands out "Demo dollars".
- A web app trusts the JavaScript it is served (true of every web wallet); hub rules cap what a compromised page could do: instant payouts only go to members, within the instant limit and the per-person limit.
- Members can't leave before close; refunds come at close. Pots are capped at 40 members. Requests expire after 7 days.
- Rev 4 (security review disclosures):
  - **A majority can do anything a Sputnik DAO allows**, immediately: move all the money, change members or the policy, upgrade the DAO. No minority can take funds.
  - **Invite links are bearer passes:** anyone holding one can join and vote. Links expire after 7 days and 10 joins by default, any member can make a new one, and a new member can't spend without asking before putting money in.
  - **Refunds are pro rata to everything a member ever put in**, so money added late subsidizes earlier spending (put in $150 after $384 of $450 was spent, get $54 back).
  - **What is public:** Pot names, amounts, members and every request are on chain, and slugs can be listed. Adding a device through NEAR Auth publishes the Google account id next to the Pot account in the MPC logs.
  - **A device key is a full-access key**; "Forget this device" deletes it in the browser, but it stays on the account until a remove-key flow exists.
  - A member removed directly in the DAO keeps some hub powers (inviting, proposing a close or a rules change) until the group revokes their invites.
  - A group-approved payout that fails while the Pot is closing can't be retried; its money is shared out at close.
- USDC sent straight to a Pot's account (not through the hub) isn't counted as anyone's contribution.
- On mainnet, Circle can blocklist an account; one blocklisted member would make the atomic close fail for everyone.
- 1Click: testnet uses a labeled simulator; refunds go to the member's NEAR Intents balance, and recovering them is future work. Pot doesn't call 1Click's optional `deposit/submit` (the app never asks for the origin tx hash), so detection relies on 1Click's own monitoring (rev3, implementation-plan §10 #28).
- Push needs the app installed on iOS; in-app browsers (Instagram, Telegram) can't install or sign in with Google.
- Plus every feature cut by flag at G5 (implementation-plan §1.5).

### 1.7 Why web-first (condensed C2)

"Store approval for a new crypto app takes from about 4 days (Apple: a 4.4-day median from first submission to approval in a 2026 sample, and only with an organization account) to over 14 days (Google Play's mandatory 12-tester, 14-day closed test for new personal accounts). Our window was 14 days, so we shipped an installable web app that works on any phone today. Native apps are on the roadmap." Plus one line: Telegram Mini Apps must use TON only, so Pot links from chats instead.

### 1.8 Screenshots (4-6, 390×844 @3x, alt text written for a screen reader and an AI judge)

1. Invite landing: "Maya invited you to Lisbon Trip", $300 of $450, trust sentence.
2. Pot screen: $450 hero, goal bar complete, feed.
3. The instant spend result: "Approved by Pot rules · $84 sent to you".
4. The Approve sheet: "Maya asks for $300 · Needs approval because it's over the $100 instant limit · 1 of 2".
5. The close refund table: $22.00 each.
6. The mainnet Pot in Trezu (if the clip ships), else the "On-chain rules" panel.

Rev 6: capture in **Day**, the brand's identity. Optionally make #4 (the Approve sheet) in **Night**, as on the brand's In-context board, to show both themes.

---
## 2. Demo video storyboard

Corrected numbers per ux-spec §6 and D-61: instant limit **$100**, per-person instant limit **$200**, **$** everywhere, "the group" (never "organizers"), Maya's own approval counts, so **Leo's approval is the 2nd of 2**. Recorded on Nov 12 (F-26) on an iPhone (Maya's views can be desktop at 390 px). A **backup cut** of the MVP flows is recorded on Nov 7 (X-11).

**Brand (rev6, D-67).** The brand mockups' "$400 boat" and "1 of 3" are illustrations; the numbers above win.
- The app is filmed in Day.
- Captions use Figtree and the few title cards Gabarito, in `ink` on `ground` or `on-brand` on marigold. No other colours.
- The WhatsApp scene shows the invite's link preview: the per-invite OG image (F-24), or `og-image.png` if F-24 is cut.
- The end card is the lockup (`pot-lockup-on-light.svg` on the Day ground `#faf9f6`), or the `og-image.png` frame. Keep a quarter-tile clear space around it.

### 2.1 Main cut (≤ 2:45)

| Time | Scene | On screen | Voice-over / caption (short) |
|---|---|---|---|
| 0:00-0:12 | Problem | a group chat: "who's holding the trip money?"; someone fronted $600 | "Every trip, one friend fronts the money and chases everyone after." |
| 0:12-0:32 | Maya creates and shares | Create: "Lisbon Trip" 🇵🇹 → Trip rules ("Up to $100 without asking · bigger spends need most of the group") → "Free: we cover the setup" → Share → WhatsApp | "A Pot is shared money with rules. Creating one is free." |
| 0:32-0:58 | **Leo joins** (moment 1) | WhatsApp link preview → landing "Maya invited you to Lisbon Trip · $300 of $450" → **Join with Google** (NEAR Auth; `localhost` unless whitelisted, caption says so) → "Setting up your Pot account…" → **"You're in!"** → Add my $150 share → goal bar completes **$450 of $450** | "No wallet, no seed phrase, no gas. Leo is in and paid in under 30 seconds." (timer overlay) |
| 0:58-1:14 | Real money from another chain (mainnet clip, sped up with a timer) | stepper: Base → "Waiting for your transfer" → "Converting to Pot dollars" → "Arrived" (≈ 30 s real) → "Added to the Pot"; label "Mainnet · real USDC · $20" | "On mainnet, friends add dollars from Base, Arbitrum or Solana through NEAR Intents." (If the clip is cut: drop this scene; the main cut gets 16 s back.) |
| 1:14-1:36 | **Instant spend** (moment 2) | Maya: Spend → $84 → Groceries → "Checking Pot rules…" (1.2 s) → **"Approved by Pot rules"** + burst → "$84 sent to you"; hero $366 | "Small, expected spends approve themselves. The rule is enforced on-chain, not by a person." |
| 1:36-2:02 | Group vote with push | Maya: $300 boat → "This needs 2 of 3 approvals" → Ask the group → "1 of 2". Leo's installed iPhone: push "Maya needs your OK" → Approve sheet ("over the $100 instant limit · Pot after this: $66") → Approve → **"Approved! $300 is on its way to Maya"**; hero $66 | "Bigger spends go to the group. Maya's request counts as her approval; Leo's makes it 2 of 3." |
| 2:02-2:22 | Close with fair refunds | Maya: Close Pot → table: everyone put in $150, **gets back $22.00** → Ask the group → Leo approves → "Pot closed. $22.00 is on its way back to you." | "When the trip ends, everyone gets their share back, split by what they put in." |
| 2:22-2:38 | Under the hood | the mainnet Pot in Trezu (`/requests`, `/members`); a terminal: `get_policy` (member + rulebot, bond 0) and `list-keys` on the hub → empty | "Every Pot is a Sputnik DAO. The rules contract is locked: nobody holds its keys." |
| 2:38-2:45 | End card | name, `github.com/<org>/<repo>`, "Built at NEAR HACKATHON", tracks Social + Real-World. Rev 6: the lockup (never the wordmark alone) and the tagline "Group chat money that follows its own rules." | — |

Rules: real footage only (no mock-ups); every on-chain moment has a receipt we can link; captions on (many watch muted); the demo banner stays visible in `/demo` footage; nothing shows a full account id or key.

### 2.2 X cut (≤ 2:20)

Same order, trimmed: problem 0:08; create + share 0:14; Leo joins 0:22; mainnet deposit 0:10 (or dropped); instant spend 0:20; vote with push 0:24; close 0:18; Trezu + CLI 0:12; end card 0:05 → 2:13 with the clip, 2:03 without. Verify the posting account's limit in the X composer (docs.x.com says 20 min for default accounts; several 2026 guides say 2:20; hackathon-rules.md).

### 2.3 Recording checklist (Nov 12)
- Fresh pool Pots seeded for the take (no leftover requests); a pre-Leo Pot for the join scene, made through the app the same way as the X-19 hallway Pots (Maya creates and adds $150, Sam joins and adds $150; rev3).
- iPhone installed PWA subscribed to push (or the R-15 decision applied); Do Not Disturb off; notifications preview on.
- Rev 3: Maya (desktop at 390 px) and Leo (iPhone) must act in the **same** Pot. If Leo's installed app uses a demo session (the `FLAG_DEMO_PUSH` option, api-spec §2.6), leases follow the visitor cookie: copy the iPhone's `pot_demo_visitor` cookie into the desktop browser with Safari Web Inspector, then choose "Try as Maya" there, which reuses the same lease. With NEAR Auth (H-01) or NEAR Connect accounts, use a real Pot instead.
- Screen recordings at 60 fps; a timer overlay for real waits; speed-ups labeled "2×"/"10×".
- Rev 6: set You → Appearance to **Day** on both devices for the take, whatever the phones' dark-mode setting. Check that the browser tab shows the small-cut favicon and that the installed iPhone icon is the marigold apple-touch icon.
- Export: 1080×1920 vertical for X and 1920×1080 for the README link; captions burned in for X.

---

## 3. X post draft (a human posts it)

> Built at NEAR HACKATHON: Pot, group money with rules.
> Friends chip in dollars. Small spends approve themselves, bigger ones go to the group, leftovers come back fairly. No wallet, no gas.
> Every Pot is a Sputnik DAO on @NEARProtocol.
> Code: <repo link>

- 239 characters before the link, 262 with it (t.co counts every link as 23), under the 280 limit for accounts without X Premium. The product name follows H-06 (rev6: decided, "Pot").
- **Card (rev6).** The post carries the attached video, so X shows the video, not a link card. Every Pot URL posted on X unfurls as a `summary_large_image` card built from **`og-image.png`** (1200×630, marigold, the pot-bubble, the wordmark, the tagline): the app root, `/demo` in the reply thread, an invite link. The human checks the card in the composer before posting. For the repo link, set GitHub's social preview to `og-image.png` (§5, 10:00).
- The video (≤ 2:20 cut) is **attached**, not linked (the rule: "says the project was built at NEAR HACKATHON and has the demo video or screenshots attached").
- Reply thread (optional, by the human): the `/demo` link, the mainnet Trezu link, the 1Click deposit tx, the README.
- After posting, the human checks the post while logged out and copies its URL for `demoUrl`.

---

## 4. Submission JSON checklist

`POST https://nearhackathon.com/api/applications`, `Content-Type: application/json`, **exactly 11 fields**, body **≤ 12,000 bytes**. One attempt; a submission can't be edited.

| Field | Rule | Who decides | Check |
|---|---|---|---|
| `requestId` | UUID v4, lowercase (`uuidgen \| tr A-Z a-z`), generated **once** | agent generates, human stores it in the vault (outside git) | reused on every retry |
| `projectName` | 2-80 chars, unique case-insensitive | human (H-06) | not "Pot" alone if that is taken |
| `leadName` | 2-80 chars | human | — |
| `email` | valid, ≤ 160 chars, unique; the Pot team email | human (H-14) | — |
| `size` | exactly `"2 - 4"` (spaces included) | fixed | string compare |
| `tracks` | `["social","realworld"]` | fixed | each once, lowercase |
| `nearAddress` | **mainnet**, lowercase, 2-64, regex in hackathon-rules.md; created by a human in a wallet | human (H-14) | eyeball: ends in `.near` or is a 64-hex implicit id; the regex also passes `.testnet` |
| `projectUrl` | the **public** repo URL, http(s), ≤ 300 | human | opens logged out |
| `demoUrl` | the **public X post** URL, ≤ 300 | human | opens logged out; not YouTube |
| `idea` | 20-2,000 chars: the problem, the product, how NEAR fits in; **written by a human** (an agent draft may only be a starting point the human rewrites) | human | length counted |
| `consent` | `true` only after the human read the notice verbatim: "I agree that the organizers may use these details to review our submission and contact us about this hackathon." | human | — |

Never add other fields; **`website` is a spam trap** (any non-empty value rejects the submission).

**Responses** (hackathon-rules.md): `201` saved → tell the humans, done · `400` → fix the fields listed in `fields`, resend with the **same** `requestId` · `403` (not open, or looked cross-site) → stop, tell the humans, **do not retry** · `409` (name or email used) → already submitted; ask the humans, **never rename to get around it** · `413` → shorten `idea` · `503` → wait a minute, resend with the same `requestId`.

---

## 5. Nov 13 order of operations (times in UTC; EET = UTC+2)

| UTC | Step | Who | Done when |
|---|---|---|---|
| 08:00 | **Final checks:** re-fetch HACKATHON.md and diff (H-13); CI green on the `v1.0` tag; E-10 and E-11 green on production; `/demo` without JS shows $450; ≥ 6 pool Pots ready; balances (relayer ≥ 10 NEAR available, above its `relayer_low` threshold, api-spec §3.5; hub ≥ 5 NEAR free) cover Nov 13-18; Vercel plan active through Nov 18; gitleaks over the full history clean (X-17); LICENSE present; README has no placeholders | agent runs, humans read | all ✅ |
| 10:00 | **The human makes the repo public** (GitHub settings → visibility). Then: the README renders logged out; CI badges load; deploys still work (if Hobby, see H-04). Rev 6: the README's lockup switches with GitHub's light/dark theme; the human sets Settings → Social preview to `og-image.png` | human | URL opens in a logged-out browser |
| 11:00 | **The human posts on X** with the ≤ 2:20 video attached (§3) | human | post URL copied |
| 12:00 | **The agent assembles the JSON** from the values the humans provide, in a file outside git; validates every rule in §4 and the byte size; **prints the full JSON**. The humans read it and say "yes" | agent drafts, humans confirm | an explicit "yes" |
| 12:15 | **POST** (by the human, or by the agent after the "yes") | human or agent | HTTP 201 |
| 12:15-18:00 | retries only per §4 (400, 503 with the same `requestId`); 403/409 stop | humans | 201 by 18:00 UTC |
| Nov 14, all day | **Buffer** until 23:59 UTC (01:59 EET Nov 15). No feature work | both | — |

The API only accepts submissions between Nov 1 00:00 UTC and Nov 14 23:59 UTC; never call it outside that window or "to test".

---

## 6. Mainnet clip plan (Phase 2; cuttable, §1.5 item 7 of the implementation plan)

**What it shows (≈ 16-25 s in the video, hashes in the README):**
1. **NEAR Intents for real:** about **$20 USDC on Base** → 1Click `FLEX_INPUT` quote (100 bps, recipient = refundTo = `leo.<root>.near`, `refundType: INTENTS`, +2 h deadline, `referral: "pot"`; D-50) → the stepper reaches SUCCESS (Base p50 ≈ 29 s) → **Add to Pot**: Leo's `ft_transfer_call` to the mainnet hub → the Pot's balance grows.
2. **Trezu:** `https://trezu.app/<slug>.pots.<root>.near/requests` and `/members` showing the Pot's requests and members (D-03, D-52), with the known wrong approval count noted in the README.
3. Optional: a **$5 instant spend** on mainnet ("Approved by Pot rules"), visible in Trezu as Executed. Rev 4: Leo makes it, after his deposit (a member who hasn't put money in goes to a vote).

**Budget** ([accounts-and-deploy.md](accounts-and-deploy.md) §2.5): **5 NEAR** (hub ≈ 3.6 incl. code storage and a 0.5 reserve; the personas ≈ 0.7, which rev4 makes pay the clip Pots' floats and prepays as deposits because the mainnet hub sponsors nothing; gas ≈ 0.1) + **≈ $25 USDC on Base** + Base gas (cents). Roughly 3 NEAR is recoverable if the mainnet hub is deleted rather than locked (a human call, made right after the clip in rev4).

**Accounts** (accounts-and-deploy §1.3): `<root>.near` (Ledger recommended), `pots.<root>.near` (the same wasm as testnet, init per contracts-spec §9.2: Circle USDC id, `DtHZ…`, float 0.1, tight limits, rev4 `relayers: []`), `<slug>.pots.<root>.near` (1-2), `maya.<root>.near`, `leo.<root>.near` (+ `sam` optional). There is **no mainnet relayer**: personas sign their own txs and attach each hub call's cost (`create_pot` 0.12 NEAR, `join` 0.02). All mainnet keys follow the key-custody rule (a Ledger or the custody user, never the agents' user).

**Script (every signed step is done by a human at the keyboard, D-63):**

| When | Step | Who |
|---|---|---|
| by Sun Nov 8 | fund `<root>.near` with 5 NEAR; put ≈ $25 USDC on Base in a human-controlled wallet; create `maya` and `leo` sub-accounts with 0.1 NEAR each | Cerasela |
| Tue Nov 10 AM (C-20) | build the release wasm from the C-18 commit; runbook §3.12: create `pots.<root>.near`, register it on Circle USDC, deploy + init (`relayers: []`); Maya creates the clip Pot (`create_pot` by CLI, attached deposit 0.12 NEAR); Leo joins (invite via `scripts/invite.ts`, 0.02 NEAR); **Trezu read-only check** on `/requests` and `/members` | P1 + a human |
| Tue Nov 10, 18:00 | **go/no-go**: hub live, Trezu pages load, Base not paused (Shield status), funds in place | both |
| Wed Nov 11 AM (X-13) | check the Shield status JSON; take a **dry** quote and confirm the fee (1 bp seen on Oct 21); start the screen recording; take the real quote in the stepper (real-mode build pointing at `leo.<root>.near`); send ≈ $20 from the Base wallet; record PENDING → PROCESSING → SUCCESS; Leo's `ft_transfer_call` to the hub (CLI on screen, or NEAR Connect with a mainnet wallet in a clip build); open Trezu; note the deposit address, the Base tx hash and the NEAR tx hashes | P1 records, a human signs |
| Wed Nov 11, right after the recording (C-22, rev4) | close the clip Pots (the real USDC goes back to Maya and Leo), then lock the mainnet hub (delete its key) or delete the account to reclaim ≈ 3 NEAR (a human decides) | P1 + a human |
| Thu Nov 12 | edit the clip into the video (F-26); hashes into the README | Cerasela, P1 |

**Level 1 (default) vs level 2:** level 1 records the 1Click stepper in a real-mode build plus the CLI "Add to Pot" and Trezu. Level 2 does the whole flow in a mainnet clip build of the app with NEAR Connect self-paid signing; build it only if level 1 is done by Nov 10 noon.

**Fallbacks:** Base paused → Arbitrum (p50 18.5 s); all chains paused or the deposit stuck → cut the clip and show the labeled testnet simulator; Trezu pages 404 → show the NEAR explorer + the in-app "On-chain rules" panel; a refund lands in Leo's `intents.near` balance → note it (recovery is Phase 3), keep amounts small. Never automate mainnet signing.
