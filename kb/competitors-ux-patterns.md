# Competitors and UX patterns that convert
> Owner: product-ux. Last verified: 2026-10-21. Legend: ✅ verified · 📄 docs-only · ⚠️ unverified/conflicting
> For UI facts, ✅ means directly observed in a Mobbin capture of the real app (linked). Capture dates vary, so the live app may have changed since.

## TL;DR
- **Party.app is gone, but "the niche is empty" overstates it.** Party ("A group chat with a group wallet that can do anything onchain") has been deprecated and is "no longer accessible after March 9, 2026". Its team was acquihired by Stripe (announced Feb 12, 2026). ✅/📄 Mainstream pooled money is very much alive: **Cash App Pools** (Jul 29, 2025), **PayPal pooling** (relaunched Nov 14, 2024, after Money Pools was killed in Nov 2021), **Revolut Group Pockets + Group Bills**, **Venmo Groups**, **Monzo shared tabs**. 📄
- **Every mainstream pool hands the money to one person.** In Cash App the organizer can "close it and transfer the collected funds directly into their Cash App balance". In PayPal, "Funds are transferred to the organizer's PayPal balance". In Revolut the admin decides who may withdraw. 📄 The split apps (Splitwise, Tricount, Settle Up, Venmo Groups) **hold no money**: they track who owes whom.
- **Pot's unique combination:** one shared balance with **no single owner**, enforced by a contract. **Rules approve small spends instantly**, bigger ones go to a group approval, and **leftovers are refunded pro-rata at close**. Money can come **from any chain**, and every Pot is inspectable (Sputnik DAO, visible in Trezu). No competitor we found does more than two of these.
- **What converts (consistent across products):**
  1. **Link join with no app and no account up front** (Settle Up: "No app required"; Cash App: non-users pay with Apple Pay/Google Pay; PayPal: contributors "whether or not they have a PayPal account"; Splitwise Itemize: "only one person needs the Splitwise app").
  2. **Net position in plain words, colored and signed** ("gets back $148.00" / "owes $148.00").
  3. **Settle-up summaries with one-tap reminders.**
  4. **Goal progress** ("$450 of $900").
  5. **A chat-like feed** (Revolut's group bills look like a chat).
  6. **Approval cards with Approve/Reject plus context.**
- **Mainstream precedent for "approved by rules":** bunq's request sheet offers "Accept Only this Request / Always Accept Requests from this User" and "Enable Auto Accept". ✅ Use it as the mental model in copy: rules are standing approvals the group agreed to.
- **Biggest honest gap versus Cash App/PayPal:** they let guests pay by card or Apple Pay with no account. Pot needs a login, and on mainnet it needs crypto dollars. There is no fiat on-ramp until Phase 3. Say so in the README's Limitations.
- **Naming risk:** in the NEAR ecosystem, **PotLock calls its quadratic-funding rounds "Pots"** ("A Pot is a smart contract for quadratic funding rounds"). 📄 NEAR judges know PotLock. Decide the submission name with that in mind.

## Plan check

| Original plan claim | Status | Note |
|---|---|---|
| "Party has been deprecated and will no longer be accessible after March 9, 2026." | ✅ confirmed | Banner on party.app (fetched 2026-10-21). Cause: the Stripe acquihire (Bankless, Feb 12, 2026). |
| "Party.app's March 2026 shutdown leaves the niche empty" (C1) | ⚠️ overstated | Cash App and PayPal pools, Revolut, Venmo and Monzo cover pooling and splitting for millions. The empty niche is **rules-governed shared money with no single owner**. Reword the pitch. |
| Borrowed pattern "Tricount link join and 'who owes whom'" | ✅ | Tricount 14.0: "Joining a tricount from an invite link is now easier than ever". Balances "propose a method… to limit the number of transactions". |
| "Splitwise 'you get back $X' and settle-up summary" | ✅ | Splitwise renders "Alex Smith gets back $158.00 in total" plus [Remind…] [Settle up]. |
| "Revolut pockets goal bar and hero balance" | ✅ | The Revolut pocket shows a big balance and "Goal $0 / $20". Group Pockets have admin-set withdraw permissions. |
| "Venmo's emoji social feed" | ⚠️ not re-verified | Venmo Groups (help center) use a group name + emoji; the group feed was not inspected. Revolut's chat-style group bill is a closer model. |
| "Party.app chat-first framing" | ✅ | "Every Party has a private group chat just for members." |
| PayPal pools "discontinued?" (brief) | ❌ corrected | Money Pools ended Nov 2021, and **pooling relaunched Nov 14, 2024** (US, DE, IT, ES). Mobbin shows a 2026 pool with "Chip in until Mar 6, 2026". |
| Crypto group wallets (Safe, Squads, Daimo) | n/a in the plan | Safe and Squads are team/DAO treasuries. Daimo's consumer app shut down and it is now a "ramp". See Reference. |

## Reference

### Landscape (status as of 2026-10-21)

| Product | Status | Who holds the money | Join model | Approvals / rules | End state | Marker |
|---|---|---|---|---|---|---|
| **Party.app** (PartyDAO) | Deprecated; inaccessible after **Mar 9, 2026** | Onchain group wallet (ETH, Base) | Crowdfund contribution; "Every user gets an NFT with voting power" | "Vote on proposals to do any transaction onchain"; WalletConnect | Shut down; team to Stripe | ✅ site / 📄 Bankless |
| **Splitwise** | Active; Itemize launched Oct 14, 2026 | Nobody (tracks debts); Splitwise Pay in US | Invite link "Anyone can follow this link to join…"; [Change link] rotates it | none | "Settle up", "Simplify group debts" | ✅ Mobbin / 📄 press |
| **Tricount** (bunq) | Active (v14.2.0, Oct 2026) | Nobody (tracks); bunq payment requests | Link join; "identify yourself the first time" (pick your name) | none | Balances + suggested reimbursements | 📄 App Store / FAQ |
| **Settle Up** | Active (v3.18.2) | Nobody | Link or QR; "view the balance in their browser without downloading anything" | none | "fewest possible transfers" | 📄 App Store |
| **Revolut Group Bills** | Active | Nobody (tracks; pay in-app) | Revolut contacts | none; "Smart settle" | "You are settled up"; "Alex can't leave yet" until settled | ✅ Mobbin |
| **Revolut Group Pockets** (formerly Group Vaults) | Active | Shared pocket; **admin sets who may withdraw** | Invite Revolut friends | Admin permission | Withdraw | ⚠️ search excerpt of help.revolut.com (page bot-blocked) / ✅ Mobbin pocket UI |
| **Venmo Groups** | Active | Nobody (tracks; settle via Venmo) | Venmo users only; non-friends "need to accept the invitation"; **max 30 people** | none | Settle up | 📄 help.venmo.com |
| **Cash App Pools** | Launched **Jul 29, 2025** (limited rollout then) | **Organizer** ("transfer the collected funds directly into their Cash App balance") | Share a link; non-users pay with **Apple Pay / Google Pay** | none | Organizer "Close pool" | 📄 CNBC / ✅ Mobbin |
| **PayPal pooling** | Money Pools 2017 to Nov 2021, **relaunched Nov 14, 2024** | **Organizer** ("Funds are transferred to the organizer's PayPal balance") | Link via SMS/email/WhatsApp; contributors "whether or not they have a PayPal account" | none; terms forbid charity fundraising | Transfer to organizer | 📄 PayPal newsroom / ✅ Mobbin |
| **Monzo shared tabs** | Active | Nobody (tracks) | "Add people not on Monzo": QR + `split.monzo.me` link | none | "Settle up — All or part of what you owe" | ✅ Mobbin |
| **bunq** | Active | Personal | n/a | **"Always Accept Requests from this User" / "Enable Auto Accept"** | n/a | ✅ Mobbin |
| **Safe{Wallet}** and Safe-based apps (e.g. **Den**, onchainden.com, which uses Safe multisigs internally) | Active ("over $100 billion" secured, per secondary sources) | k-of-n multisig smart account | Owners added by tx; wallet required | Threshold + modules (spending limits, roles) | n/a | ⚠️ secondary (eco.com, onchainden.com blog) |
| **Squads** (Solana) | Active: Multisig, **Altitude** (business), **Fuse** (personal), **Grid** (API) | Smart accounts | Business or personal onboarding | Multisig policies | n/a | ⚠️ secondary + squads.xyz blog |
| **Daimo** | **Old app shut down** ("Please withdraw funds"); now "The ramp for ambitious stablecoin apps" (Daimo Pay) | was USDC on Base, passkeys | was invite links | none | n/a | ✅ GitHub README / daimo.com |
| **Base App** (Coinbase) | Active (launched Jul 2025) | Personal wallets | XMTP group chats | none; "request group payments and see who's paid" | n/a | ⚠️ XMTP marketing / news |
| **Crypto splitters** (SolSplit, StableSplit, Splitwiser, CryptoSplitter, Tab, xupersplit) | Mostly hackathon-grade | Nobody / per-user wallets | Wallet connect or link | none | Onchain settle in USDC | ⚠️ GitHub / sites via search |
| **Trezu** (NEAR) | Active, open source | **Sputnik DAO** treasury for teams | Members by proposal | Roles (Requestor/Admin/Approver per plan [kb/trezu.md]) | n/a | ⚠️ secondary; see kb/trezu.md (sputnik) |
| **PotLock** (NEAR) | Active | QF round contracts called **"Pots"** | Donors / projects | Round admins ("Owner, Admins, Chef") | Payouts | 📄 potlock docs via search |
| **near.com** (NEAR) | Launched Feb 23, 2026 | Personal multichain wallet, gas abstracted, confidential mode | n/a | n/a | n/a | 📄 CoinDesk |

### What converts: patterns with evidence

| # | Pattern | Evidence (verbatim where possible) | Apply in Pot |
|---|---|---|---|
| 1 | **Link join, no install, no account first** | Settle Up: "No app required: Share a group link so friends can view the balance in their browser without downloading anything." 📄 Cash App: "This is the first time we're going into out-of-network payments with Pools… [Block] sees each non-user who contributes to a pool as a potential convert." 📄 PayPal: "Contributors can join whether or not they have a PayPal account." 📄 Splitwise Itemize: "only one person needs the Splitwise app" (QR). 📄 | The invite landing shows **real Pot data before login** (name, inviter, avatars, "$450 in the Pot"). Login only when acting. |
| 2 | **One CTA that both authenticates and accepts** | Optimal Workshop: "Sign up with Google and accept". Charma: "Sign up now to join Jane Smith and 2 others". ✅ | A single "Join with Google" button. No separate "Accept" step after login. |
| 3 | **Name the inviter and show who's in** | Craft: "You've been invited to join — Alex's Family, invited by Alex Smith" → "You joined Alex's Family". Zillow: "Accept your invitation before it expires on May 29". ✅ | "Maya invited you to Lisbon Trip" + 3 avatars + expiry if any. |
| 4 | **Net position in words, colored and signed** | Splitwise: "Alex Smith gets back $158.00 in total", "Sam L. owes $158.00 to Alex S.", "you lent $200.00" / "you borrowed $22.50". Revolut: "Are owed $6.74" / "Owes $3.36". Wanderlog: "-$65.60". ✅ | Pot's equivalents: "You put in $150", "Your share now $142", "You'd get back $142". Always words plus color, never color alone. |
| 5 | **Settle-up summary + reminders** | Splitwise [Remind…] [Settle up]; Monzo "Send reminder"; Revolut "Reminded" label. ✅ | Members tab: "Leo hasn't added his share yet → [Nudge]". The Close preview lists everyone's refund. |
| 6 | **Goal progress** | Cash App ring "$1 of $1 goal"; PayPal "Amount received $0.00 / Goal $5.00 · Chip in until Mar 6, 2026"; Revolut "Goal $0 / $20"; Plum "0% of £500 goal". ✅ | GoalBar "$450 of $900 collected". Optional deadline "Chip in by Nov 20". |
| 7 | **Chat-like group feed** | Revolut group bill renders bills as chat bubbles ("You lent $6.74", "Marked as paid") with "Add a bill" above the composer. Party: "Every Party has a private group chat". ✅ | ActivityFeed with day separators, money items as bubbles, inline Approve on request cards. Pin "Waiting on you" on top (Grab "Ongoing", bunq "Awaiting Events"). |
| 8 | **Smart amount entry** | Chime chips "$25 / $100 / $200"; Cash App "From $10 to $1,500"; talabat "Or quickly select amount". ✅ | Prefill the suggested share ("Your share: $150") as the first chip. Show the allowed range. |
| 9 | **Approval card with context** | Airwallex "Awaiting approval" + amount, description, category, "Requested by" + [Approve] [Reject ⌄]. Monzo [Review payment] [Decline request]. ✅ | Approve sheet: requester, amount, reason, rule context ("over the $50 instant limit"), progress "1 of 2 approvals", [Approve] [Decline]. |
| 10 | **Standing approvals = rules** | bunq "Always Accept Requests from this User", "Enable Auto Accept". ✅ | "Approved by Pot rules" with a tappable rule sentence ("Anyone can spend up to $50 without asking"). |
| 11 | **Tiny creation** | Cash App "Start a $1 pool — For [Noodles] — [Start]". PayPal "Create your pool — This is what others will see, so make it pop!" (cover image). ✅ | Create step 1 is name + emoji/cover only. Rules come from a preset. |
| 12 | **Show the math** | Buddy "Settle up": 1. How much? (total ÷ members) 2. Who paid most? 3. "Jen Doe owes Joshua: $500". ✅ | Close preview: "Leftover $372 split by how much each person put in" + a per-person table. |

### What Pot does that none of them do

| Capability | Pot | Cash App / PayPal pools | Revolut Group Pocket | Split apps (Splitwise, Tricount, Settle Up, Venmo Groups) | Safe / Squads / Trezu | Party (dead) |
|---|---|---|---|---|---|---|
| Shared balance, **no single owner can take it** | ✅ contract-enforced | ❌ organizer | ⚠️ admin decides | ❌ no balance | ✅ multisig | ✅ |
| **Small spends auto-approved by rules** | ✅ Rulebot | ❌ | ❌ | ❌ | ⚠️ modules, built for teams | ❌ (votes) |
| Group approval for big spends | ✅ | ❌ | ❌ | ❌ | ✅ signers | ✅ NFT votes |
| **Pro-rata refund at close** | ✅ | ❌ organizer keeps | ❌ | n/a | ❌ | ❌ |
| Contribute from any chain | ✅ (1Click, Phase 2) | ❌ | ❌ | ❌ | ⚠️ | ❌ ETH |
| No app install, social login | ✅ PWA + Google/Apple/email/passkey | ✅ guests (card/Apple Pay) | ❌ Revolut account | ⚠️ Settle Up web only | ❌ wallets | ❌ wallet |
| Plain-language, no-jargon UI | ✅ (goal) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Publicly verifiable | ✅ Sputnik DAO in Trezu | ❌ | ❌ | ❌ | ✅ | ✅ |

### Lessons from failures
- **Party:** crypto-native mechanics (NFT memberships with voting power, then "Launch a token") drifted toward memecoins ("Sendit raised 25 ETH from 522 members to launch the $sendit memecoin"). Peak numbers on the site: "20,000+ Parties created, 100,000+ Unique users, 12,000 ETH Raised". It wound down after the Stripe acquihire. **Lesson:** stay on everyday money (trips, clubs, teams); no tokens, no NFTs in the UI.
- **PayPal Money Pools (2017-2021):** PayPal said customers were using it "to raise money for community causes" and moved that to Generosity Network. The 2024 relaunch terms make users agree they "will not use the pool to raise money for a charity". **Lesson:** position Pot as money for **groups who know each other**, not fundraising. Say so in onboarding copy and the README.
- **Daimo:** a polished passkey/USDC consumer app that shut down and became infrastructure. **Lesson:** consumer stablecoin apps need a sustainability story, which is also a judging criterion (see hackathon-rules.md).
- **Account walls:** Venmo Groups need Venmo users. Vivid shows "Unable to share the Pocket… you can only share a pocket with an existing vivid customer" (✅ Mobbin). Revolut pockets need Revolut friends. **Lesson:** never put an account wall before the person sees the Pot.

## Snippets
Copy observed in the wild that is worth adapting. These are observations to learn from; Pot's own strings are in plan/ux-spec.md.
- Splitwise invite: "Anyone can follow this link to join "Winter Trip". Only share it with people you trust." [Share link] [Copy link] [Change link]
- Splitwise group empty state: "No expenses here yet. Tap the button below to add an expense with this group."
- Splitwise / Revolut settled state: "You are all settled up in this group." / "You are settled up"
- Revolut leave blocker: "Oh no! Alex can't leave yet. Make sure all outstanding balances with Alex are settled before removing"
- Cash App pools explainer: "From trips to gifts, collect money with anyone—even if they aren't on Cash App."
- Cash App pending: "Pending — Waiting for [name] to accept this request". Chime: "Cancel this request? [Cancel request] [Never mind]"
- Posh explainer: "What does this mean? [Name] has not yet accepted your ticket. You can still cancel this transfer."
- Discord: "Invite links expire in 24 hours"
- World App fee line: "Transaction fee Free $0.00" (the sponsored-fee framing Pot can use once, then hide)

## Gotchas & failure modes
- **Organizer custody is the norm, so explain Pot's difference in one line:** "No one can take money out alone. Small spends follow the Pot's rules; bigger ones need the group." This must be on the invite landing and the Create flow.
- **Guest payments:** Cash App and PayPal let non-users pay by card without an account, and Pot can't on mainnet without an on-ramp. On testnet, "Demo dollars" stand in. Label them clearly.
- **Group-chat links need multi-use invites.** Splitwise, Discord and Monzo all use reusable links (rotatable, optionally expiring). Plan P-3's "one-time code" breaks the "drop the link in the group chat" flow. See plan/ux-spec.md, open question to contracts.
- **Leave with balance:** Revolut blocks leaving while balances are open. Pot needs a rule for "leave the Pot" (refund your share? only at close?). It is not in the plan.
- **Name collision:** "Pot" means a quadratic-funding round in PotLock (NEAR). It could also be read as slang in some markets.

## Costs, limits, latencies

| Item | Value | Marker |
|---|---|---|
| Venmo group size | max 30 people | 📄 help.venmo.com |
| PayPal pooling markets (launch) | US, Germany, Italy, Spain | 📄 PayPal newsroom |
| Cash App Pools rollout (Jul 2025) | "limited set of Cash App users" at launch | 📄 CNBC |
| Splitwise Itemize | free, QR for non-app users | 📄 Yahoo Finance press release |

## Open questions / needs a human
1. **Cerasela:** the submission and product name ("Pot" vs a distinctive variant), given PotLock's "Pots" and projectName uniqueness.
2. **Cerasela + P1:** invite links: multi-use (rotatable, with expiry) vs P-3's one-time codes → **Open question → contracts**.
3. **Cerasela + P1:** can a member leave before close, and what happens to their share? (Revolut blocks it.) → **Open question → contracts**.
4. **Cerasela:** should the MVP pitch call out "no single owner" as the headline differentiator against Cash App/PayPal pools? (Recommended.)
5. **Phase 3:** guest contributions without an account, and a fiat on-ramp. Out of scope; list under Limitations.

## Sources
- https://www.party.app/: deprecation banner, feature list, stats, "A group chat with a group wallet". Accessed 2026-10-21.
- https://www.bankless.com/read/news/payments-processor-stripe-acquihires-partydao-team: Stripe acquihire, Feb 12, 2026. Accessed 2026-10-21.
- https://finance.yahoo.com/small-business/articles/splitwise-launches-feature-takes-awkwardness-123000659.html: Splitwise Itemize, Oct 14, 2026, "only one person needs the Splitwise app". Accessed 2026-10-21.
- https://help.tricount.com/articles/tricount-faqs: identify yourself on first join; balances minimize transactions (updated Oct 14, 2026). Accessed 2026-10-21.
- https://apps.apple.com/us/app/tricount-split-settle-bills/id349866256: invite-link join (v14.0.0), payment requests, bunq link. Accessed 2026-10-21.
- https://apps.apple.com/us/app/settle-up-group-expenses/id737534985: link/QR, "No app required…", fewest transfers. Accessed 2026-10-21.
- https://help.venmo.com/cs/articles/setting-up-a-group-vhel106: group setup, max 30 people, invitation acceptance. Accessed 2026-10-21.
- https://www.cnbc.com/2025/07/29/cash-app-pools-apple-pay-google-pay.html: Pools launch, out-of-network payments, organizer receives funds, quotes. Accessed 2026-10-21.
- https://newsroom.uk.paypal-corp.com/evolving-the-ways-you-can-collect-and-raise-money: Money Pools discontinued (no new pools from Sep 30, 2021; removed Nov 2021). Accessed 2026-10-21.
- https://about.pypl.com/news-details/2024/PayPal-Unveils-Innovative-Money-Pooling-Feature-Simplifying-Group-Expenses-Between-Family-and-Friends/default.aspx: pooling relaunch Nov 14, 2024; markets; funds to organizer. Accessed 2026-10-21.
- https://help.revolut.com/en-US/help/app-features/vaults/how-do-i-manage-a-group-pocket/ (bot-blocked; content via search excerpt ⚠️): Group Pocket admin and withdraw permissions. Accessed 2026-10-21.
- https://raw.githubusercontent.com/daimo-eth/daimo/master/README.md: "The old Daimo app is shutting down. Please withdraw funds." Accessed 2026-10-21.
- https://squads.xyz/blog/squads-smart-account-program-live-on-mainnet and search results: Squads product suite (Altitude, Fuse, Grid). Accessed 2026-10-21. ⚠️
- https://xmtp.org/digital-money: group payment requests in chats (marketing). Accessed 2026-10-21. ⚠️
- https://onchainden.com/blog/safe-wallet-review and https://eco.com/support/en/articles/15254042-safe-wallet-deep-dive-2026-multisig-and-smart-accounts (via search): Safe in 2026, Den built on Safe. Accessed 2026-10-21. ⚠️
- https://docs.potlock.io/ and https://www.potlock.org/ (via search): "A Pot is a smart contract for quadratic funding rounds". Accessed 2026-10-21.
- https://www.coindesk.com/business/2026/02/23/near-launches-near-com-super-app-touting-ai-capabilities-and-confidential-transactions: near.com features and quotes. Accessed 2026-10-21.
- Mobbin (UI observations, accessed 2026-10-21):
  - Cash App "Creating a new pool" https://mobbin.com/flows/b65be81e-03ff-4275-9334-83aa5c0cde6a
  - PayPal "Creating a pool" https://mobbin.com/flows/8eb3e694-ad23-4997-bcf8-e8af208428ff
  - Vivid "Pocket sharing" https://mobbin.com/flows/1e4df5ae-5acc-4dec-9024-0ffa7ebfb00c
  - Plum "Creating a pocket" https://mobbin.com/flows/56b5766b-0d7e-4e27-ac58-fbf5e00a8629
  - bunq "Creating a group expense" https://mobbin.com/flows/7abb29ac-b6bb-434b-bfa3-22fac004e7c8
  - Splitwise "Copying a link" https://mobbin.com/flows/211ed153-bdc6-4a16-9688-adb6532a3e04
  - Splitwise "Group balances" https://mobbin.com/flows/d12d2ff4-5576-4a34-ae8c-9ace8b28ecac
  - Splitwise "Group detail" https://mobbin.com/flows/61b649dd-8997-40ff-bff5-4db8e0142180
  - Revolut group bill screens https://mobbin.com/screens/9cefa3b7-4c45-4770-ae2f-9d45f86f4dd4, https://mobbin.com/screens/61d50a5b-ccad-4936-9b7d-1a380171de8b, https://mobbin.com/screens/e0b8b2a6-3990-4de3-906e-22b1e881e525
  - Revolut pocket https://mobbin.com/screens/4467a0cf-c122-47f6-8ad2-24532c385176
  - Monzo "Balances" https://mobbin.com/flows/c71be1b2-24c0-4470-b64e-f13bcfa8e4ca
  - bunq "Approving a request" https://mobbin.com/flows/dc1f3c4a-a261-4d22-a8dc-4cc31cbc296f
  - Airwallex approval https://mobbin.com/screens/94e0c040-22b2-4151-b2a9-029c5b2fcd54
  - Buddy settle up https://mobbin.com/flows/9a6f51d4-b8c6-4863-889c-c55c418a19c5
  - Wanderlog balances https://mobbin.com/flows/c4eaeff5-4e7e-4a85-8e5c-e5fdacf81884
