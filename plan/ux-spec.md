# Pot UX spec (draft v0.1)
> Drafted by product-ux on 2026-10-21 for **Cerasela (P2, design lead)** to take over and own.
> Source of truth for scope: the original plan Part C (C1, C2, C4, C5, C8). Research behind every decision: [../kb/ux-research.md](../kb/ux-research.md), [../kb/competitors-ux-patterns.md](../kb/competitors-ux-patterns.md), [../kb/hackathon-rules.md](../kb/hackathon-rules.md).
> Markers: ✅ verified · 📄 docs-only · ⚠️ assumption or estimate. **→ owner** marks a dependency on another agent's area (auth, relayer, sputnik, contracts, intents, web, infra).
> No code in Phase 0. This is a design document. Token tables are specs to be turned into Tailwind v4 `@theme` variables on Nov 1.
> **(rev6) Brand, 2026-10-21 (D-67, D-45).** Cerasela's logo and design system ([../brand/README.md](../brand/README.md), tokens in `brand/tokens.json`) replace the provisional §7 tokens. Night is now in scope, and the type is Gabarito + Figtree. Every edit is marked "(rev6)" for review: §0, §1.1-§1.3, §2, §3, §4.1, §4.4, §4.9, §4.10, §4.15, §5.13, §6.1, §6.3, §7, §8, §10, §12, §13. The brand mockups' numbers, Apple button and "organizers" wording don't change this spec; brand/README §12 lists every difference and which source wins.

## 0. TL;DR (decisions in this draft)
1. **Two moments win the demo:** the invite landing → "You're in" (≤ 4 taps, median < 30 s) and "Approved by Pot rules" (minimum 1.2 s beat, then a real "Sent"). Every other screen is ordinary on purpose.
2. **Show the Pot before login.** `/j/[slug]` (rev3: the link is `/j/<slug>?i=<pk>#<secret>`, multi-use, D-08) server-renders the real Pot (inviter, avatars, balance, goal, rules in one line). A single **"Join with Google"** button signs in *and* joins.
3. **Hero = what's in the Pot** (44 px). "Your share" and "You put in" sit right under it. Every number carries words; no number relies on color or a minus sign alone.
4. **One trust sentence wherever money moves:** "No one can take money out alone. Small spends follow the Pot's rules; bigger ones need the group."
5. **Status comes from the chain; the pacing is designed.** Optimistic "Sending…" chips, a minimum 1.2 s "Checking Pot rules" beat, and "Approved" kept separate from "Sent".
6. **Signing friction is designed for, not wished away.** If NEAR Auth needs a popup per action, a `ConfirmStep` adds one tap (flows show both counts). → auth
7. **Requests open a review sheet. Notifications never move money by themselves** (WCAG 3.3.4). Inline Approve in the feed is allowed only with a 4 s Undo, and only when no popup is needed.
8. **Brand tokens (rev6, D-67):**
   - Marigold `brand` for the one primary button per screen (eggplant text, never used as text), eggplant `ink`, Day and Night themes.
   - Every text pair is ≥ 4.5:1 (computed, brand/README §3).
   - Gabarito (display) + Figtree (text), with tabular figures.
   - This replaces the provisional terracotta/honey palette and Inter or Geist.
9. **Install is earned:** the coach appears after the first contribution and never on the landing. It handles iOS 26 ("More •••"), iOS 27 ("Page Menu"), Android `beforeinstallprompt`, and in-app browsers.
10. **Advanced is a separate room:** account id, Trezu link, receipts, contract ids and raw errors live only under You → Advanced (plus a "Details" disclosure in errors).

Contradictions fixed or flagged (details in §6 and §13):
- The Trip instant limit must be **$100** (not $50) for the $84 instant demo.
- **$ everywhere** (C1 says €84).
- Multi-use invite links (C4 P-3 says one-time).
- "organizers" → "the group".
- One consistent 3-member demo cast. The video's **$400 boat** request exceeds what is left after the $84 spend, so it becomes **$300**, which matches the README's "$300 → 2 of 3".

---

## 1. Principles, vocabulary, formatting

### 1.1 Principles
1. Every screen answers **"how much is in the Pot, and what do you need from me?"** (C5).
2. **One primary action per screen**, placed in the bottom 40% (C5).
3. **Show, then ask:** real data before login. Login happens inside the first action.
4. **Words before numbers:** "You'd get back $142", never "+$142". (rev6: a sign in the feed's amount column is fine because the row's sentence carries the words; see §1.3.)
5. **Rules are sentences** you can tap from every auto-approval.
6. **Review before money moves:** every money sheet shows the outcome above its button.
7. **Earn install and push** after value has been delivered.

### 1.2 Vocabulary (extends C5 "Never show / Show instead")

| Internal concept | Show | Never show in main paths |
|---|---|---|
| DAO, multisig, treasury | **Pot** | DAO, multisig, treasury |
| Proposal | **Request** | proposal |
| Vote, council | **Approve / Decline**, "approvals", "the group" (**"organizers" only for a future Club preset with an organizer role**; rev6: this row wins over the brand README's "Approve, organizers") | vote, council, quorum |
| Bond, gas, yoctoNEAR, storage deposit, relayer, sponsored | nothing (say "Free" once, during Create) | gas, fee, bond, storage |
| Wallet, account id | **Your Pot account** (Advanced only) | wallet, address, `.testnet` |
| Transaction hash | **Receipt** | tx, hash, block |
| USDC | **dollars, $** | USDC (exceptions below) |
| Sputnik, Trezu | "Advanced: View on Trezu" only | Sputnik |
| Rulebot, policy | **Pot rules** | bot, policy, contract |
| `instant_cap` | **instant limit** ("up to $100 without asking") | cap |
| `member_budget` | **spending limit per person** (rev3: it counts spends made without asking only, so copy says "without asking", D-07) | budget, allowance |
| `ft_transfer_call` / deposit | **Add money** | deposit, transfer_call |
| `settle` | **Close the Pot** | settle, settlement |
| pro-rata refund | **your share back** | pro-rata |
| Chain, network | only in the cross-chain sheet ("network: Base") | chain, bridge, swap, intent |
| Testnet USDC | **Demo dollars (test money)** | testnet USDC |
| Sputnik `Rejected` / `Expired` / `Failed` / `Removed` | "Not approved" / "Expired" / "Didn't go through yet" / (hidden) | status names |

**Lint exceptions** (the C5 rule over `i18n/en.json` needs a whitelist):
- the `advanced.*` namespace;
- the one-time `add.usdc_note`;
- the `xc.*` cross-chain strings. These **must** say "USDC" and the network name exactly, because a vague instruction can lose someone's money. This is a safety rule, not a breach of the no-jargon principle.
- `demo.*` (judges are the audience).

### 1.3 Money formatting
- US dollars, `en-US`: `$1,234.50`. (rev6, brand) **Every displayed amount shows two decimals with tabular figures, the hero included** ("$450.00", "$84.00"). This also keeps the live hero's width steady. Sentences and buttons keep whole dollars when the amount is whole ("Your share $150", "Add $150").
- (rev6, brand) In the feed's amount column, money in may read "+ $150.00" and money out "− $84.00" (a U+2212 minus, the same width as "+"). The row's sentence carries the words, so the sign is never the only cue.
- Never a bare sign. Write "You put in $150", "Gets back $22.00", "Spent $84.00".
- Amounts on buttons: "Add $150", "Approve $300", "Get $84 back".
- Display amounts are computed from the same integer math as the contract (USDC 6 decimals) and floored to the cent. The close preview explains the rounding (§5.12).
- Relative times: "2h ago", "Expires in 2 days". Absolute dates after 7 days: "Nov 12".

### 1.4 Tone
Warm, short, specific. Second person. Use at most one exclamation mark per flow (the "You're in!" moment). Errors always say **what happened, whether money moved, and what to do**, in that order.

---

## 2. Information architecture and navigation

**Bottom tabs (3):** **Pots** · **Requests** (badge = items waiting on me) · **You**. The tab bar is 56 px plus `safe-area-inset-bottom`.

| Route | Screen | Notes |
|---|---|---|
| `/` | redirect | Signed in → `/pots`; signed out → marketing-lite page with "Start a Pot" (out of scope; can redirect to `/demo` on testnet) |
| `/j/[slug]` (rev3: was `/j/[code]`) | Invite landing | SSR, works without JS for the first paint; OG image = Pot cover + "{inviter} invited you to {potName}". The link is `/j/<slug>?i=<invite public key>#<secret>` and works for many people until it expires or is replaced (D-08) (rev3) |
| `/pots` | Pots home | |
| `/p/[slug]` | Pot (segmented: **Activity** · Members · Rules) | `?tab=members` deep links |
| `/p/[slug]/r/[id]` | Pot with the **Approve sheet** open | Target of push, email and bot links |
| `/requests` | Requests tab | |
| `/you`, `/you/advanced` | You, Advanced | |
| `/demo` | Judge entry: "Try as Maya / Try as Leo" | SSR (AI judges fetch HTML) |

**Sheets** (shadcn `Drawer` on Base UI on mobile (rev3: not vaul, D-41); shadcn `Dialog`/`Sheet` at ≥ 768 px): Add money · Cross-chain deposit (P2) · Spend · Approve · Create (full-height) · Share · Close · ConfirmStep · InstallCoach · Push pre-prompt · Details.
- A sheet opens with focus on its title and returns focus to its trigger on close. Every sheet has a visible ✕ or Cancel (WCAG 2.5.7: dragging is never the only way to close).
- Deep links open the Pot first, then the sheet on top, so Back closes the sheet and leaves the user in the Pot.

**Layout:** designed at 390×844 first.
- (rev6, brand layout tokens) Sheets, flows and the invite landing have a max width of `container-flow` (440 px).
- The app's max width on desktop is `container-app` (1080 px). From `bp-lg` (1024 px) it has two columns: the Pot on the left, Requests and members on the right.
- Gutters are 16 px, and 24 px from 768 px.
- Sticky CTA zone = 16 px padding + `safe-area-inset-bottom`.
- `scroll-padding-bottom` equals the sticky heights so focused elements are never hidden (WCAG 2.4.11).

---

## 3. Component inventory
shadcn/ui primitives: `Button`, `Card`, `Drawer` (Base UI; rev3, not vaul), `Sheet`, `Dialog`, `Tabs` (segmented), `Avatar`, `Badge`, `Progress`, `Skeleton`, `Sonner` (toasts), `ToggleGroup` (chips), `Input`, `Textarea`, `Label`/`Form`, `Switch`, `Alert`, `Accordion` (Details), `InputOTP`, `Separator`, `DropdownMenu`, `Tooltip` (desktop only). Icons: lucide (rev6: stroke 2, brand/README §8).

| Custom component | Built from | Where | Variants / props | A11y notes |
|---|---|---|---|---|
| **BalanceHero** | Card + text | Pot, Pots card (compact) | `balance`, `share`, `contributed`, `state: live / sending / stale` | `aria-label="{balance} in the Pot. Your share {share}."`; the number is a live region only on change |
| **GoalBar** | Progress | Pot, landing | `collected`, `goal`, `deadline?` | Text twin "$450 of $900 collected". (rev6) The fill (`brand`) against the track (`brand-soft`) is 1.5:1 in Day, so the text twin is mandatory and the bar never carries information alone |
| **PotCard** | Card | Pots home | `name, emoji/cover, balance, share, waitingCount, closed` | Whole card is one link; the badge is included in its name |
| **ActivityFeed** | list + `FeedItem` | Pot | sections: "Waiting on you" (pinned), days | `<ul>`, day separators as headings, new items announced politely |
| **FeedItem** | Card/row | feed | `joined · contribution · instant · pending · approved · declined · expired · withdrawn · failed · rule_change · close_requested · closed` + `StatusChip` (rev5: `withdrawn` is Phase 3, not built) | Icon + text + color; amounts in words |
| **RequestCard** | Card + Buttons | feed (pending), Requests | inline `[Review]`, or `[Approve][Decline]` with Undo (see §6.4). (rev6) These are secondary buttons: a screen has one marigold button, and on the Pot it is Add money | Buttons ≥ 48 px; name includes the amount |
| **ApprovalMeter** | dots + text | RequestCard, Approve sheet | `count, needed, voters[]` | Text "1 of 2 approvals: Sam" |
| **RulePreview** | Alert | Spend | `instant · vote(reason) · blocked(balance)` | Live region polite; updates debounced 300 ms |
| **RuleSentence** | text + chips | Rules, previews | values as chips (editable in P2) | Each sentence is one paragraph |
| **AmountKeypad** | grid of Buttons | Add money, Spend | `value, max, quickChips[]` | Physical-key support; display is `role="status"`; keys labelled "1".."9", "decimal point", "delete" |
| **SourcePicker** | ToggleGroup / list | Add money | `pot_dollars(available) · other_wallet · demo` | radio semantics |
| **DepositStepper** (P2) | vertical steps | Cross-chain | 1Click status → step | Current step `aria-current="step"`, polite updates |
| **StatusChip** | Badge | everywhere | `sending · sent · approved · needs_approval · declined · expired · failed` | icon + text, never color only. (rev6) Approved and sent use `approved` + `check`; needs approval uses `waiting` + `clock`; declined and failed use `declined` + `x`; sending and expired are neutral `ink-muted` |
| **ConfirmStep** | Drawer | before signed actions | `actionSummary, provider` | Opens the NEAR Auth popup **inside the tap** (build the payload first). → auth |
| **AccountSetupProgress** | Progress + text | onboarding | stages | `aria-busy`, polite stage text |
| **MemberRow** | row | Members, Close | `contributed, spentShare, refund, invited` | full sentence label |
| **RefundTable** | `<table>` | Close sheet | rows, total, rounding note | real `<th scope>` |
| **InviteCard** | Card + QR | Share, Create step 3 | link, QR, expiry | QR has a text twin (link + Copy) |
| **InstallCoach** | Drawer | after first value | `ios26 · ios27 · ios_other · android_prompt · android_menu · in_app` | numbered list |
| **OfflineBanner / ServiceBanner** | Alert | global | offline · relayer down · maintenance | `role="status"` |
| **ErrorToast + Details** | Sonner + Accordion | global | `message, requestId, raw?` | `role="alert"` only when action is needed |
| **EmptyState** | Card | lists | illustration, title, body, CTA | |
| **DemoBanner** | Alert | `/demo` sessions | Switch persona, Reset | |
| **ReceiptLink** | link | feed, Advanced | opens the receipt sheet; the explorer link sits inside it | "Receipt for $84 groceries" |

Skeletons: PotCard (3 lines), BalanceHero (one 44 px bar + one 16 px bar), FeedItem ×5. Show skeletons after 150 ms (no flash for fast loads), cross-fade when data arrives, and never let skeletons cover cached data. Show cached data with a `stale` marker instead.

---

## 4. Screen inventory and states
**State legend** (the copy IDs are in §5):
- **E** = empty
- **L** = loading or skeleton
- **O** = optimistic "Sending…"
- **S** = success
- **X** = error
- **OFF** = offline
- **EXP** = expired request
- **BAL** = insufficient Pot balance
- **RLY** = relayer down
- "—" = not applicable

### 4.1 Invite landing `/j/[slug]` (rev3)
**Purpose:** turn a tap in a group chat into a member. **Primary action:** "Join with Google" (platform-ordered, see §6.1; rev6: the screen's one marigold button).
**Layout, top to bottom:**
1. Pot cover/emoji
2. H1 "Maya invited you to Lisbon Trip"
3. Avatars "Maya and Sam are in"
4. BalanceHero-compact "Lisbon Trip has $300" + GoalBar "$300 of $450 collected"
5. Trust sentence
6. Rules one-liner "Up to $100 without asking · bigger spends need most of the group"
7. Expiry, if any
8. CTA stack: [Join with Google] [Join with Apple] (order by platform) · "More ways to join" (email, passkey, NEAR wallet). (rev3: Apple is mainnet-only and hidden on testnet, D-20. Preview builds add [Join with a test account] for the hallway test.)
   **(rev6, D-20 + brand mock)** On testnet the stack is:
   1. **[Join with Google]**, the screen's one marigold button.
   2. **[Continue with email]** (`landing.more.email`), a secondary button. It is the only other testnet method, and it is the one that stays in in-app browsers.
   3. "More ways to join", holding [Use a passkey] (only where the NEAR Auth tenant offers passkeys) and "I have a NEAR wallet" in small text.

   [Join with Apple] appears only if the tenant adds Apple (`FLAG_APPLE`); it then sits second, ordered by platform. The brand mockup's "Continue with Apple" and "Continue with Google" labels don't apply: Google keeps `landing.cta.google`, because one tap signs in *and* joins.
9. Legal line

| State | Behaviour / copy |
|---|---|
| L | SSR, so no skeleton on first paint. If client data is stale, refresh silently. |
| Signed in already | Replace the CTAs with `landing.signed_in_as` + [Join Lisbon Trip] (1 tap). |
| In-app browser detected (UA list → web) | Show `landing.inapp.*` **above** the CTAs. Google and passkey buttons are hidden; Email stays. |
| X invalid / expired / used / replaced / already member / Pot closed | Full-screen states `invite.*` with one CTA each. |
| OFF | `invite.network_error` + [Try again]. Cached SSR stays visible. |
| RLY (during setup) | See 4.2. |
| E / O / EXP / BAL | — |

### 4.2 Sign-in and account setup (inline on the landing, or a sheet from "More ways")
**Purpose:** authenticate, create the Pot account, join. **Primary action:** none during progress.
`AccountSetupProgress` stages: "Setting up your Pot account…" (3-8 s ⚠️ → relayer) → "Joining Lisbon Trip…" (≤ 4 s ⚠️ → contracts) → success screen "You're in!" with [Add my $150 share] and "Not now".

| State | Behaviour |
|---|---|
| L | Determinate-looking bar: time-based up to 90%, completes on the real event. `setup.slow` appears at 10 s. |
| X auth | `auth.popup_blocked` / `auth.failed` / `auth.service_down`. User cancel is silent. |
| X setup | `setup.error.relayer` [Try again] (idempotent → relayer); `setup.error.join` [Try again]. |
| Session lost (tokens in memory ⚠️ → auth) | `setup.welcome_back`: one-tap re-auth. The cached Pot stays visible read-only. |
| OFF | Progress pauses with `offline.banner`, then resumes. |

### 4.3 Pots home `/pots`
**Purpose:** overview of my Pots. **Primary action:** "Start a Pot" (bottom CTA when empty; a `+` in the header otherwise).

| State | Behaviour |
|---|---|
| E | `pots.empty.*` + illustration + [Start a Pot] |
| L | 3 PotCard skeletons |
| O | A PotCard being created shows the "Creating…" chip |
| X | `pots.error.load` + pull-to-refresh/[Try again]; cached cards keep showing with "Updated 5 min ago" |
| OFF | cached cards + `offline.banner` |
| Closed Pots | collapsed "Closed (2)" section at the bottom |

### 4.4 Pot `/p/[slug]` (Activity)
**Purpose:** "how much is in the Pot and what do you need from me". **Primary actions:** [Add money] [Spend] (two equal-width buttons under the hero; Add money is filled, Spend is tonal). The single most important thing (a pending request) is pinned in "Waiting on you". (rev6, brand) Add money is the screen's one marigold button. Spend and every RequestCard button are secondary (`surface` fill, `line-strong` border); the brand mockup's second marigold [Approve] breaks the one-per-screen rule. Approve is marigold inside the Approve sheet.
**Header:** emoji, Pot name (H1), ••• menu (Share invite, Close Pot, Advanced: View on Trezu (rev3: mainnet Pots only, D-52)).
**Body:**
1. BalanceHero ("$450" / "In the Pot" / "Your share $150 · You put in $150"; rev6: the hero reads "$450.00", §1.3)
2. GoalBar
3. Segmented tabs
4. "Waiting on you" (RequestCards)
5. ActivityFeed by day

| State | Behaviour |
|---|---|
| E (new Pot) | Creator: `pot.feed.empty.*` with [Invite friends] + [Add your share]. Member: "Be the first to add money". |
| L | hero + 5 feed skeletons; cached data first if present |
| O | New item at the top with a `Sending…` chip; the hero shows the pending delta as "+$150 on the way" (ink-2; rev6: `ink-muted`), not in the main number |
| S | chip → "Sent ✓" for 2 s, then removed; hero counts up (500 ms; instant with reduced motion) |
| X | the item reverts (fade out) + toast with Details |
| OFF | banner; Add/Spend disabled with `*.offline` on tap |
| EXP | pending card turns into the Expired item (computed client-side from `submission_time + proposal_period` because Sputnik sets `Expired` lazily ✅) |
| BAL | Spend CTA stays enabled, but the preview blocks over-balance amounts (§4.9). Approved-but-unsent items show `feed.request.failed`. |
| RLY | `relayer.down.banner`; Add/Spend/Approve open but show `*.error.relayer` on submit |
| Not a member / not found | `pot.not_member` / `pot.not_found` |
| Closed | read-only, hero "Closed Nov 12", final refund summary card; CTAs hidden |

### 4.5 Pot → Members
**Purpose:** who paid what and what each person would get back. **Primary action:** [Invite friends].
Row (demo, after the $84 and $300 spends): "Leo · Put in $150 · Share of spending $128.00 · Gets back $22.00". Invited people: "Ana · Invited · hasn't joined" [Nudge]. Footer: `members.explainer`.
States: L (rows skeleton) · E (only you: "Invite friends to start") · X (toast) · OFF (cached) · nudge O/S ("Nudge sent to Ana", max 1 per person per 24 h ⚠️ → infra).

### 4.6 Pot → Rules
**Purpose:** understand, and in P2 change, how the Pot works. **Primary action:** none in MVP; "Suggest a change" in P2 (creates a request).
Sentences (Trip preset): `rules.instant`, `rules.threshold`, `rules.budget`, `rules.recipients`, `rules.expiry`, footer `rules.footer`. Badge "Trip rules".
States: L · X · OFF (cached). P2 change flow: O "Sent to the group" / EXP / declined, same as requests.

### 4.7 Add money sheet
**Purpose:** pay in. **Primary action:** [Add $150].
**Content:**
- Title `add.title`
- AmountKeypad with chips [Your share $150] [$50] [$100]
- SourcePicker:
  - testnet: **Demo dollars (test money)** preselected
  - with balance: "Pot dollars you have · $40.00"
  - P2: "Another wallet or exchange" → 4.8
- the one-time `add.usdc_note` (first time only)
- [Add $150]

| State | Behaviour |
|---|---|
| Default | CTA disabled at $0; the range hint shows when a max exists |
| O | the sheet closes; the feed item shows `Adding $150…` (`add.sending`) |
| S | toast `add.success`; first time → InstallCoach card (§9) |
| X insufficient own funds | inline `add.error.insufficient_own` under the amount (amount kept) |
| X relayer / generic | `add.error.relayer` / `add.error.generic` + Details; the amount is kept in the sheet if reopened |
| Pending forward | arrived in your account but not forwarded → persistent card `add.finish_pending` with [Finish adding $150] (C6 "Finish adding $150") |
| ConfirmStep needed (⚠️ → auth/relayer: `ft_transfer_call` carries 1 yocto, so it likely needs a full-access signature) | [Add $150] → ConfirmStep → O |
| OFF | `add.offline`, CTA disabled |
| E / EXP / BAL | — (BAL applies to the user's own funds; see above) |

### 4.8 Cross-chain deposit sheet (Phase 2, P-7)
**Purpose:** bring dollars from another chain or an exchange. **Primary action:** [Copy address] (then wait).
**Steps:**
1. Network chips (Base, Arbitrum, Ethereum, Solana…) → `xc.network.label`
2. Exact instruction `xc.instructions` + QR + address + [Copy address] + warning `xc.warning` (+ memo if any)
3. `DepositStepper`: Waiting → Spotted → Converting → Arrived → Added

| 1Click status 📄 | Step / copy |
|---|---|
| `PENDING_DEPOSIT` | `xc.step.waiting` ("You can close this screen. We'll let you know when it arrives.") |
| `KNOWN_DEPOSIT_TX` | `xc.step.spotted` |
| `PROCESSING` | `xc.step.converting` ("Usually under a minute"; rev3: measured p50 18-84 s, D-50) |
| `SUCCESS` | `xc.step.arrived`, then automatically "Add to Pot" (needs the member's signature → ConfirmStep if required) → `add.success` |
| `INCOMPLETE_DEPOSIT` | `xc.incomplete` + [Send the rest] (rev3: there is no refund action; whatever arrived is returned automatically about a minute after the deadline, D-50) |
| `REFUNDED` | `xc.refunded` |
| `FAILED` | `xc.failed` + [Contact support]; keep the deposit details visible |
| 5 min in `PROCESSING` (rev3: was "no change for 20 min", D-50) | `xc.slow` |
| quote deadline passed with no deposit | `xc.expired` + [Get a new address] (→ intents: what happens to late sends) |

OFF: the stepper pauses with "We'll update when you're back online" (status is server-polled → infra). RLY: affects only the final "Add to Pot" step → `add.error.relayer` + persistent `add.finish_pending`.

### 4.9 Spend sheet
**Purpose:** ask for money (reimbursement) or pay a member. **Primary action:** [Get $84 back] (instant) or [Ask the group] (vote).
**Content:**
- Type toggle [Reimburse me] [Pay a member] (MVP; "Pay someone outside the group" is P3 → contracts)
- AmountKeypad
- Reason chips + optional note
- **RulePreview** (live)
- CTA

| RulePreview result | Condition (from Rules) | Copy |
|---|---|---|
| Instant | amount ≤ instant limit AND within the person's limit AND recipient is a member AND amount ≤ Pot balance | `preview.instant` |
| Vote: over cap | amount > instant limit | `preview.vote.over_cap` |
| Vote: over budget | used + amount > per-person limit | `preview.vote.over_budget` |
| Vote: recipient | recipient not allowed | `preview.vote.recipient` |
| Vote: new member *(rev4)* | the requester hasn't put any money in yet (security review H-1; Cerasela confirms) | `preview.vote.new_member` |
| **Blocked: BAL** | amount > Pot balance | `preview.blocked.balance`, CTA disabled |

| State | Behaviour |
|---|---|
| O instant | the sheet morphs into the result card: `spend.checking` (shimmer, **min 1.2 s**) → `spend.approved` (celebration ≤ 600 ms) → `spend.sending` → `spend.sent` [Receipt] [Done]. `spend.still_checking` at 6 s, `spend.slow` at 15 s (the user may leave). (rev6: the typing dots replace the shimmer; the celebration is the brand's 600 ms marigold burst, §6.3) |
| O vote | `spend.vote_sent` with ApprovalMeter "1 of 2" (rev3: the requester's own approval is cast automatically, D-61) |
| Became a vote | `spend.became_vote` (a race with another spend) |
| X | `spend.error.relayer` / `spend.error.generic` + Details; the amount and reason are kept |
| OFF | `spend.offline`, CTA disabled |
| EXP | — (see Approve) |
| ConfirmStep needed | CTA → ConfirmStep → O (⚠️ → auth: can requests use a scoped key?) |

Privacy: if notes are stored on-chain (→ contracts), show `spend.note.public_hint` under the note field.

### 4.10 Approve sheet
**Purpose:** decide fast with context. **Primary action:** [Approve $300]; secondary [Decline].
**Content:**
- title `approve.title`
- reason
- requester avatar + time
- `approve.why`
- ApprovalMeter
- `approve.after` ("Pot after this: $66.00")
- `approve.expires`
- buttons
- for the requester: [Withdraw request] in place of the decision buttons (rev3: Phase 2, behind `FLAG_WITHDRAW`; hidden in the MVP, D-07; rev5: now Phase 3, not built during the hackathon, so it stays hidden)

| State | Behaviour |
|---|---|
| L | sheet skeleton (from a push deep link) |
| O | `approve.optimistic`; the meter fills; reconciles ≤ 5 s |
| S (threshold reached) | `approve.final` (celebration if your vote completed it; rev6: the check icon and the message only, with no burst, because the brand keeps its one celebration for "Approved by Pot rules", §6.3) |
| Declined by me | `approve.declined.self` |
| Already voted | buttons replaced by `approve.already` |
| Already decided | `approve.decided.approved` / `approve.decided.declined` |
| **EXP** | `approve.expired` (computed client-side; the chain may still say InProgress ✅) |
| **BAL** (approved but transfer `Failed` ✅) | `approve.failed` + [Add money]; retry is automatic or manual → contracts |
| X | toast `approve.error.vote_revert`; the meter reverts |
| RLY | `approve.error.relayer` |
| OFF | `approve.offline`, buttons disabled |
| Own request | `approve.own.counted` (rev3: the requester's approval counts, D-61) |
| ConfirmStep needed | [Approve $300] → ConfirmStep → O (→ auth) |

### 4.11 Requests tab `/requests`
**Purpose:** everything waiting on me, across Pots. **Primary action:** review the top item.
Sections: "Waiting on you" (RequestCards with the Pot name) · "Your requests" (status chips; withdraw in Phase 2 only, rev3; rev5: now Phase 3, not built) · "Decided" (last 30 days).
States: E `requests.empty.*` · L (3 card skeletons) · O/X as Approve · OFF (cached, actions disabled) · EXP (moves to Decided as Expired) · badge `requests.badge.a11y`.

### 4.12 Create Pot (full-height sheet, 3 steps; C5)
**Purpose:** a Pot in under a minute. **Primary actions:** [Next] → [Create Pot] → [Share link].
**Steps:**
1. `create.step1.title`: name + emoji/cover (cover optional).
2. `create.step2.title`: preset cards **Trip** (selected) · Club (soon) · Team (soon); "Everyone chips in (optional)" chip "$150 each" (sets the goal = $150 × invited count, editable).
3. "Creating Lisbon Trip…" (≤ 15 s, P-2) → Share step (§4.13).

| State | Behaviour |
|---|---|
| Validation | `create.error.name`; a taken slug is auto-suffixed silently (→ contracts: slug rules) |
| O | progress with `create.progress` ("Free — we cover the setup."); `create.slow` at 8 s |
| S | `create.success` → Share step |
| X | `create.error.relayer` [Try again]; `create.error.limit` (3 Pots per verified email per day, C5) |
| OFF | CTA disabled |
| ConfirmStep | creation is sponsored by the Pot Hub (rev3: no `pot-factory`, D-02); the device key signs, so no popup (D-21) |

### 4.13 Share / Invite sheet
**Purpose:** get the link into the group chat. **Primary action:** [Share link] (Web Share API) → the OS sheet.
Content: InviteCard (QR, short link, `share.body`, `share.expiry`), [Share link] [Copy link] [Show QR code], P2 [Post in Telegram], [Make a new link] (rotate, with confirm). *(rev4)* A new link works for 7 days and up to 10 people; any member can make a new one at any time, and the card always shows when the link stops working.
Prefilled share text `share.message`. States: S toast "Link copied" · X "Couldn't copy. Press and hold the link to copy it." · OFF (link still shown; copy works).

### 4.14 Close Pot sheet (P-9) and closed state
**Purpose:** end fairly. **Primary action:** [Ask the group to close].
**Content:**
1. `close.title`
2. `close.body`
3. `close.math` ("$187.20 left · split by how much each person put in")
4. **RefundTable** (Person · Put in · Gets back)
5. `close.dust`
6. `close.open_requests`, if any
7. CTA

Demo numbers (§6): $66.00 left after $384 of spending; everyone put in $150 → **$22.00 each**. Unequal example for the RefundTable design: if Maya had put in $200, Sam $150 and Leo $100 ($450 total), $66 splits **$29.33 / $22.00 / $14.66**, and the leftover cent goes to whoever added money last (P-9 floor + dust rule). C5's "$62.40" was illustrative: with Maya $200, Leo $150, Sam $100 and $187.20 left, the split is $83.20 / $62.40 / $41.60.

| State | Behaviour |
|---|---|
| O | `close.sent` + ApprovalMeter |
| Others | Approve sheet variant `close.approve.title` + "You'd get back $22.00" |
| S | `close.done.self` for each member; feed `close.done.feed`; Pot goes read-only |
| X / RLY / OFF | `close.error` / `approve.error.relayer` / disabled |
| Cut (plan cut order) | `close.disabled`: the button is visible but disabled, with the explanation |

### 4.15 You `/you`
Profile (name, avatar, email from auth), **Notifications** (push toggle → pre-prompt; email toggle; P2 Telegram), **Add Pot to your Home Screen** (hidden when standalone), **Help** (same place on every screen, WCAG 3.2.6), **About Pot dollars**, **Advanced**, Sign out.
(rev6, brand) Settings gains **Appearance**: a segmented control `you.appearance.*` with Match my phone (default), Day and Night. "Match my phone" follows `prefers-color-scheme`; the choice is stored on the device and applied before first paint (brand/README §7). The logo never changes between themes.

### 4.16 Advanced `/you/advanced` (separate room, §10)

### 4.17 ConfirmStep (conditional; → auth)
Drawer: `confirm.title`, `confirm.body` (action summary with amount), [Continue with Google] (provider-matched). States: waiting `confirm.waiting` · popup blocked `confirm.blocked` · cancelled (silent) · failed `confirm.failed`. The popup **must open within the tap**: prepare the payload when the sheet opens (spike note ⚠️).

### 4.18 InstallCoach + push pre-prompt (§9)

### 4.19 `/demo` (judges; C8)
SSR page "Pot demo · test money on NEAR testnet". Two big buttons: [Try as Maya, who organized the trip] [Try as Leo, a friend]. Then "What to try" (3 steps that mirror the README) and a link to the README. In a demo session a `DemoBanner` stays on top: "Demo · test money" + [Switch to Leo/Maya] + [Reset demo] (→ contracts/infra: reset strategy). (rev3: the switch offers both other personas, Sam included, because the leased Pot has all three; the snapshot on `/demo` is the permanent reference Pot, D-33.) It must work without login and must render the Pot balance and feed text in the HTML (AI judges, see kb/hackathon-rules.md).

### 4.20 Global system states

| Situation | UI |
|---|---|
| Offline | `offline.banner` (top, polite); money CTAs disabled with tap explanation; `online.restored` toast |
| Relayer down / sponsor low | `relayer.down.banner` (→ relayer: health endpoint) |
| Per-user daily cap hit (C9) | toast `relayer.cap` |
| Maintenance | `maintenance` full-width banner |
| Unknown error | `generic.error` + Details (request id) |
| Session expired | `session.expired` sheet with one-tap re-auth |

---

## 5. Copy deck
Keys are `i18n/en.json` IDs. `{braces}` are variables. Push/email/bot are in §5.15. Lint exceptions are listed in §1.2.

### 5.1 Invite landing

| ID | String |
|---|---|
| landing.title | {inviter} invited you to {potName} |
| landing.balance | {potName} has {balance} from {count} friends |
| landing.balance.zero | {potName} is just getting started |
| landing.goal | {collected} of {goal} collected |
| landing.members | {names} are in |
| landing.trust | No one can take money out alone. Small spends follow the Pot's rules; bigger ones need the group. |
| landing.rules_peek | Up to {instantLimit} without asking · bigger spends need {thresholdWords} |
| landing.expiry | This invite works until {date}. |
| landing.cta.google | Join with Google |
| landing.cta.apple | Join with Apple *(rev3: mainnet only; hidden on testnet, D-20)* |
| landing.cta.dev | Join with a test account *(rev3: preview builds only, for the hallway test; api-spec §2.1)* |
| landing.cta.more | More ways to join |
| landing.more.email | Continue with email |
| landing.more.passkey | Use a passkey |
| landing.more.wallet | I have a NEAR wallet |
| landing.legal | By joining you agree to the Terms. Pot is for groups who know each other. |
| landing.signed_in_as | Join as {email}? |
| landing.signed_in_as.cta | Join {potName} |
| landing.signed_in_as.switch | Use another account |
| landing.inapp.title | Open in {browser} to join |
| landing.inapp.body | Google sign-in doesn't work inside {appName}. Tap ••• and choose "Open in browser". |
| landing.inapp.copy | Copy link |
| landing.inapp.email | Or continue with email here |

### 5.2 Invite errors (failure mode → copy)

| Failure mode | ID | Title / body / CTA |
|---|---|---|
| Link not found or malformed (rev3: was "Code") | invite.invalid | **This invite link doesn't work** / It may have a typo or be out of date. Ask the person who sent it for a new link. / [Copy link I was sent] |
| Expired | invite.expired | **This invite has expired** / Ask {inviter} for a new link. |
| Use limit reached (rev3: links are multi-use, D-08; *(rev4)* every link has a use limit, 10 people by default, so this fires once a link is used up) | invite.used | **This invite was already used** / This link can't be used again. Ask {inviter} to send you a new link. *(rev3)* |
| Rotated by the creator | invite.replaced | **This link was replaced** / {inviter} made a new invite link. Ask them for the latest one. |
| Already a member | invite.already_member | **You're already in {potName}** / [Open {potName}] |
| Pot closed | invite.pot_closed | **{potName} is closed** / This Pot has finished and paid everyone back. There's nothing to join. |
| Network | invite.network_error | **We couldn't load this invite** / Check your connection and try again. / [Try again] |

### 5.3 Sign-in, setup, session

| ID | String |
|---|---|
| auth.popup_blocked | Your browser blocked the sign-in window. Tap the button again. |
| auth.failed | Sign-in didn't work. Try again, or pick another way to join. |
| auth.service_down | Sign-in isn't available right now. Try again in a few minutes. |
| setup.progress.1 | Setting up your Pot account… |
| setup.progress.2 | Joining {potName}… |
| setup.slow | This is taking a little longer than usual… |
| setup.success.title | You're in! |
| setup.success.body | Welcome to {potName}. Everyone's chipping in {suggested}. |
| setup.success.cta | Add my {suggested} share |
| setup.success.later | Not now |
| setup.error.relayer | We couldn't finish setting up your account. Nothing was charged. Try again in a minute. |
| setup.error.join | You're signed in, but we couldn't add you to {potName}. Try again. |
| setup.welcome_back | Welcome back, {firstName}. Continue with {provider} to pick up where you left off. |
| session.expired | For your safety, sign in again to continue. |

### 5.4 Pots home and Pot

| ID | String |
|---|---|
| pots.title | Pots |
| pots.empty.title | No Pots yet |
| pots.empty.body | Start one for a trip, a club or a team, and invite friends with a link. |
| pots.empty.cta | Start a Pot |
| pots.card.balance | {balance} in the Pot |
| pots.card.share | Your share {share} |
| pots.card.waiting | {n} waiting on you |
| pots.card.closed | Closed {date} |
| pots.error.load | We couldn't load your Pots. Pull down to try again. |
| pot.hero.label | In the Pot |
| pot.hero.share | Your share {share} · You put in {contributed} |
| pot.hero.pending | +{amount} on the way |
| pot.goal | {collected} of {goal} collected |
| pot.cta.add | Add money |
| pot.cta.spend | Spend |
| pot.tabs.activity / .members / .rules | Activity / Members / Rules |
| pot.waiting.header | Waiting on you |
| pot.feed.empty.title | Nothing here yet |
| pot.feed.empty.body | Invite friends and add your share to get {potName} going. |
| pot.feed.empty.member | Be the first to add money. |
| pot.not_member.title | You're not in this Pot |
| pot.not_member.body | Ask someone in {potName} for an invite link. |
| pot.not_found.title | We can't find this Pot |
| pot.not_found.body | The link may be wrong, or the Pot was closed. |
| pot.closed.hero | Closed {date} |

### 5.5 Feed items

| ID | Main line | Sub line |
|---|---|---|
| feed.joined | {name} joined | — |
| feed.contribution | {name} added {amount} | — |
| feed.instant | {name} got {amount} back for {reason} | Approved by Pot rules ✓ |
| feed.pending | {name} asks for {amount} for {reason} | Needs {k} approvals · {count} so far |
| feed.approved | {amount} sent to {name} for {reason} | Approved by {names} |
| feed.declined | {name}'s request for {amount} wasn't approved | Declined by {names} |
| feed.expired | {name}'s request for {amount} expired | Not enough approvals by {date} |
| feed.withdrawn | {name} withdrew a request for {amount} | — *(rev5: Phase 3, not built)* |
| feed.failed | Approved, but {amount} couldn't be sent yet | The Pot is short. It goes through when there's enough money. |
| feed.rule_change | {name} changed a rule | {ruleSentence} |
| feed.close_requested | {name} asked to close the Pot | Needs {k} approvals |
| feed.closed | Pot closed | Everyone got their share back. |
| chip.sending / .sent / .approved / .needs / .declined / .expired / .failed | Sending… / Sent / Approved / Needs approval / Not approved / Expired / Not sent yet | |
| feed.receipt | Receipt | |

### 5.6 Members and Rules

| ID | String |
|---|---|
| members.header | {n} people |
| members.row | Put in {contributed} · Share of spending {spentShare} · Gets back {refund} |
| members.invited | Invited · hasn't joined |
| members.nudge | Nudge |
| members.nudge.sent | Nudge sent to {name} |
| members.invite_cta | Invite friends |
| members.explainer | Leftover money is split by how much each person put in. |
| rules.title | How {potName} works |
| rules.instant | Anyone can spend up to {instantLimit} without asking. |
| rules.threshold | Bigger spends need {k} of {n} approvals. |
| rules.budget | Each person can spend up to {memberBudget} in total without asking. *(rev3: the limit counts instant spends only, D-07)* |
| rules.recipients | Instant payments only go to members. |
| rules.expiry | Requests expire after {days} days. |
| rules.footer | The Pot enforces these rules itself. No one, including {creator}, can skip them. |
| rules.change.cta (P2) | Suggest a change |
| rules.change.note (P2) | Changes need the group's approval. |
| rules.preset.trip | Trip rules |

### 5.7 Add money

| ID | String |
|---|---|
| add.title | Add money to {potName} |
| add.amount.label | Amount in dollars |
| add.chip.share | Your share {suggested} |
| add.range | Up to {max} |
| add.source.label | From |
| add.source.pot_dollars | Pot dollars you have · {available} |
| add.source.other_wallet (P2) | Another wallet or exchange |
| add.source.demo | Demo dollars (test money) |
| add.usdc_note | Pot keeps money in USDC, a digital dollar. 1 USDC is always worth $1. *(lint exception)* |
| add.usdc_note.ok | Got it |
| add.cta | Add {amount} |
| add.sending | Adding {amount}… |
| add.success | Added. {potName} now has {balance}. |
| add.error.insufficient_own | You have {available} in Pot dollars. Add up to {available}, or choose another way. |
| add.error.relayer | We couldn't add your money right now. Nothing left your account. Try again in a minute. |
| add.error.generic | That didn't go through. Nothing left your account. |
| add.finish_pending.title | Finish adding {amount} |
| add.finish_pending.body | Your {amount} arrived in your Pot account. Tap to add it to {potName}. |
| add.offline | You're offline. Connect to add money. |

### 5.8 Cross-chain (P2; mapped to 1Click statuses 📄; lint exception)

| Status / case | ID | String |
|---|---|---|
| — | xc.title | Add from another wallet or exchange |
| — | xc.network.label | Which network are you sending from? |
| — | xc.instructions | Send {amountToken} {token} on {network} *(rev3: not "exactly", FLEX_INPUT, D-50)* |
| — | xc.instructions.min | We'll accept {minAmount} or more. *(rev3, D-50)* |
| — | xc.address.label | To this address |
| — | xc.copy | Copy address |
| — | xc.copied | Address copied |
| — | xc.warning | Only send {token} on {network}. Other coins or networks may be lost. |
| memo required | xc.memo | Include this memo: {memo}. Without it, your money can't be matched. |
| quote deadline | xc.deadline | Send within {minutes} minutes |
| `PENDING_DEPOSIT` | xc.step.waiting | Waiting for your transfer · You can close this screen. We'll let you know when it arrives. |
| `KNOWN_DEPOSIT_TX` | xc.step.spotted | Transfer spotted · Waiting for {network} to confirm it. |
| `PROCESSING` | xc.step.converting | Converting to Pot dollars · Usually under a minute. *(rev3: measured p50 18-84 s, D-50)* |
| `SUCCESS` | xc.step.arrived | Arrived · Adding it to {potName}… |
| `SUCCESS` + forwarded | xc.step.added | Added to the Pot |
| `INCOMPLETE_DEPOSIT` | xc.incomplete | You sent less than needed · Send {missing} more to the same address by {deadline}, or we'll return it automatically after that. *(rev3: no refund action exists, D-50)* |
| `REFUNDED` | xc.refunded | This didn't go through · Your money is safe and wasn't added to the Pot. *(rev3: refunds go to the member's NEAR Intents balance, not an origin address, D-50; [Contact support] gets it back until Phase 3)* |
| `FAILED` | xc.failed | This transfer failed · We're checking what happened. Keep this page: it has your deposit details. |
| 5 min in `PROCESSING` (rev3: was 20 min, D-50) | xc.slow | Taking longer than usual · Transfers sometimes queue on busy days. Your deposit details are saved below. |
| deadline passed, nothing sent | xc.expired | This address expired · Get a new one before sending. |
| — | xc.notify_ok | We'll notify you when it arrives. |
| — | xc.support | Contact support |

### 5.9 Spend

| ID | String |
|---|---|
| spend.title | Spend from {potName} |
| spend.type.reimburse | Reimburse me |
| spend.type.pay_member | Pay a member |
| spend.amount.label | How much? |
| spend.reason.label | What's it for? |
| spend.reason.chips | Groceries 🛒 · Food 🍝 · Transport 🚕 · Stay 🏠 · Tickets 🎟️ · Other |
| spend.note.placeholder | Add a note (optional) |
| spend.note.public_hint | Notes are visible to anyone who looks up this Pot. *(only if notes are on-chain → contracts)* |
| preview.instant | This will be approved instantly · Anyone can spend up to {instantLimit} without asking. |
| preview.vote.over_cap | This needs {k} of {n} approvals · It's over the {instantLimit} instant limit. |
| preview.vote.over_budget | This needs {k} of {n} approvals · It would take you over the {memberBudget} you can spend without asking ({used} used). *(rev3, D-07)* |
| preview.vote.recipient | This needs {k} of {n} approvals · Instant payments only go to members. |
| preview.vote.new_member | This needs {k} of {n} approvals · Add money to the Pot first to spend without asking. *(rev4)* |
| preview.blocked.balance | The Pot has {balance} · You can ask for up to {balance}. |
| spend.cta.instant | Get {amount} back |
| spend.cta.pay_member | Send {amount} to {name} |
| spend.cta.vote | Ask the group |
| spend.checking | Checking Pot rules… |
| spend.still_checking | Still checking… |
| spend.slow | Taking longer than usual. You can leave this screen; we'll update the Pot. |
| spend.approved | Approved by Pot rules |
| spend.sending | Sending {amount} to you… |
| spend.sent | {amount} sent to you |
| spend.vote_sent | Sent to the group · Needs {k} of {n} approvals. We'll tell you when it's decided. |
| spend.became_vote | This one needs approval after all · Someone just spent from the Pot, so this is now over a limit. We sent it to the group. |
| spend.error.relayer | We couldn't send this right now. Nothing left the Pot. Try again in a minute. |
| spend.error.generic | That didn't go through. Nothing left the Pot. |
| spend.offline | You're offline. Connect to send a request. |

### 5.10 Approve and Requests

| Failure mode / state | ID | String |
|---|---|---|
| — | approve.title | {name} asks for {amount} |
| — | approve.reason | For {reason} |
| over cap | approve.why.cap | Needs approval because it's over the {instantLimit} instant limit. |
| over budget | approve.why.budget | Needs approval because it's over the {memberBudget} {name} can spend without asking. *(rev3, D-07)* |
| recipient | approve.why.recipient | Needs approval because the money goes to someone outside the Pot. |
| new member *(rev4)* | approve.why.new_member | Needs approval because {name} hasn't added money yet. |
| — | approve.progress | {count} of {k} approvals |
| — | approve.after | Pot after this: {balanceAfter} |
| — | approve.expires | Expires {relativeTime} |
| — | approve.cta.approve | Approve {amount} |
| — | approve.cta.decline | Decline |
| — | approve.decline.reason | Add a reason (optional) |
| optimistic | approve.optimistic | Approved. {count} of {k}. |
| inline undo | approve.undo | Approved · Undo |
| threshold reached | approve.final | Approved! {amount} is on its way to {name}. |
| I declined | approve.declined.self | Declined. {name} will see that you said no. |
| already voted | approve.already | You approved this {relativeTime} |
| own request (A: requester counts) | approve.own.counted | Your approval is counted. Waiting for {remaining} more. |
| own request (B: requester excluded) | approve.own.excluded | Waiting for the group. You can't approve your own request. |
| requester withdraws *(rev5: Phase 3, not built)* | approve.withdraw | Withdraw request |
| — *(rev5: Phase 3)* | approve.withdraw.confirm | Withdraw this request? · [Withdraw] [Keep it] |
| — *(rev5: Phase 3)* | approve.withdrawn | Request withdrawn |
| **expired request** | approve.expired | This request expired · It didn't get {k} approvals by {date}. {name} can ask again. |
| already approved | approve.decided.approved | Already approved · {amount} was sent to {name}. |
| **declined vote** | approve.decided.declined | Already decided · This request wasn't approved. |
| **insufficient Pot balance** (`Failed`) | approve.failed | Approved, but the Pot is short · {amount} will be sent when the Pot has enough. Add money to help. |
| relayer down | approve.error.relayer | We couldn't record your approval. Nothing changed. Try again in a minute. |
| vote reverted | approve.error.vote_revert | Your approval didn't go through. Try again. |
| offline | approve.offline | You're offline. Connect to approve. |
| — | requests.title | Requests |
| — | requests.section.waiting / .mine / .history | Waiting on you / Your requests / Decided |
| — | requests.empty.title | You're all caught up |
| — | requests.empty.body | When someone asks the group for money, it'll show up here. |
| — | requests.badge.a11y | {n} requests waiting on you |

### 5.11 Create and Share

| ID | String |
|---|---|
| create.step1.title | Name your Pot |
| create.name.placeholder | Lisbon Trip |
| create.cover | Pick an emoji or photo |
| create.step2.title | How should it work? |
| create.preset.trip | Trip · Up to $100 without asking · bigger spends need most of the group · leftovers back at the end |
| create.preset.club | Club · coming soon |
| create.preset.team | Team · coming soon |
| create.goal.label | Everyone chips in (optional) |
| create.cta.next / create.cta | Next / Create Pot |
| create.progress | Creating {potName}… · Free: we cover the setup. |
| create.slow | Still working on it. This can take up to 15 seconds. |
| create.success | {potName} is ready |
| create.error.relayer | We couldn't create your Pot right now. Nothing was charged. Try again in a minute. |
| create.error.limit | You've started 3 Pots today. You can start another tomorrow. |
| create.error.name | Use 2–40 letters, numbers or spaces. |
| share.title | Invite friends to {potName} |
| share.body | Anyone with this link can join the Pot and help decide how its money is spent. Share it only in your group chat. *(rev4)* |
| share.expiry | Link works until {date} · {usesLeft} more people can join with it *(rev4)* |
| share.cta.share / .copy / .qr / .telegram | Share link / Copy link / Show QR code / Post in Telegram |
| share.copied | Link copied |
| share.copy_failed | Couldn't copy. Press and hold the link to copy it. |
| share.cta.rotate | Make a new link |
| share.rotate.confirm | The old link will stop working. People who already joined stay in. · [Make new link] [Cancel] |
| share.message | Join our {potName} Pot so we can chip in together: {link} |

### 5.12 Close

| ID | String |
|---|---|
| close.title | Close {potName}? |
| close.body | Everyone gets back their share of what's left. The group needs to approve. |
| close.math | {balance} left · split by how much each person put in |
| close.table.headers | Person · Put in · Gets back |
| close.dust | Amounts are rounded down to the cent. Any tiny remainder goes to {lastContributor}, who added money last. |
| close.open_requests | {n} open requests will be cancelled. |
| close.cta | Ask the group to close |
| close.sent | Sent to the group. Needs {k} of {n} approvals. |
| close.approve.title | {name} wants to close {potName} |
| close.approve.refund | You'd get back {refund} |
| close.done.self | Pot closed. {refund} is on its way back to you. |
| close.done.feed | Pot closed on {date}. Everyone got their share back. |
| close.readonly | This Pot is closed. |
| close.error | We couldn't close the Pot right now. Nothing changed. Try again in a minute. |
| close.disabled | Closing a Pot is coming soon. |

### 5.13 You, Advanced, ConfirmStep, Help

| ID | String |
|---|---|
| you.title / .notifications / .install / .help / .advanced / .signout | You / Notifications / Add Pot to your Home Screen / Help / Advanced / Sign out |
| you.appearance / .auto / .day / .night *(rev6, proposed)* | Appearance / Match my phone / Day / Night |
| you.push | Get told when friends need your OK |
| you.email | Email me when someone needs my OK |
| you.about_dollars | About Pot dollars |
| advanced.title | Advanced |
| advanced.intro | For people who know crypto. You don't need any of this to use Pot. |
| advanced.account | Your Pot account |
| advanced.copy / .copied | Copy / Copied |
| advanced.network | Network: NEAR testnet |
| advanced.trezu | View {potName} on Trezu |
| advanced.contracts.pot / .rules | Pot contract / Rules contract |
| advanced.receipts | Receipts |
| advanced.export | Export activity (CSV) |
| advanced.wallet | Use a NEAR wallet |
| advanced.tech_errors | Show technical details in errors |
| advanced.public | Pot activity is recorded on a public ledger that anyone can read. |
| confirm.title | Confirm it's you |
| confirm.body | {actionSummary} |
| confirm.cta | Continue with {provider} |
| confirm.waiting | Waiting for confirmation… |
| confirm.blocked | Your browser blocked the confirmation window. Tap Continue again. |
| confirm.failed | We couldn't confirm it's you. Nothing was sent. Try again. |

### 5.14 Global and system

| Failure mode | ID | String |
|---|---|---|
| offline | offline.banner | You're offline. You can look around; adding money and approving need a connection. |
| back online | online.restored | Back online |
| relayer down / sponsor low | relayer.down.banner | Pot is having trouble sending right now. Your money is where it was. We'll be back shortly. |
| per-user daily cap | relayer.cap | You've reached today's limit for free actions. Try again tomorrow. |
| maintenance | maintenance | Pot is being updated. Back in a few minutes. |
| unknown | generic.error | Something went wrong. Nothing was sent. |
| — | details.label / details.request_id / details.copy | Details / Request ID {id} / Copy details |
| receipt | receipt.title / receipt.line / receipt.ledger | Receipt / {amount} · {date} / View on the public ledger |
| demo | demo.banner | Demo · test money on NEAR testnet |
| demo | demo.switch / demo.reset | Switch to {persona} / Reset demo |
| demo | demo.choose / demo.maya / demo.leo | Try Pot as… / Maya, who organized the trip / Leo, a friend |

### 5.15 Notifications (push ≤ 40-char title, ≤ 110-char body; email subject = push title; bot = group post)

| Event | Push title | Push body | Opens | Telegram bot post (P2) |
|---|---|---|---|---|
| Request needs my approval | {name} needs your OK | {amount} for {reason} · {potName} | Approve sheet | {name} wants {amount} for {reason}. Needs {k} of {n} approvals. Approve in Pot → {link} |
| My request approved | Approved: {amount} is on its way | {names} approved your {reason} request. | Pot | ✅ Approved: {amount} to {name} for {reason}. |
| My request declined | Not approved | Your {amount} {reason} request was declined. | Pot | Not approved: {name}'s {amount} request. |
| My request expired | Request expired | Your {amount} request didn't get enough approvals in {days} days. | Pot | — |
| Auto-approved (to others, digest) | — (feed only; too noisy for push) | — | — | Approved by Pot rules: {name} got {amount} back for {reason}. |
| Money arrived (cross-chain) | Your {amount} arrived | It's in {potName} now. | Pot | — |
| Someone joined (to creator) | {name} joined {potName} | {joined} of {invited} friends are in. | Members | {name} joined. {joined} of {invited} are in. |
| Contribution | {name} added {amount} | Added to {potName}. *(rev3: no balances in push or bot text, notifications.md N1)* | Pot | {name} added {amount} to {potName}. *(rev3)* |
| Nudge | {name} nudged you | Add your {suggested} share to {potName}. | Add money | — |
| Close requested | {name} wants to close {potName} | You'd get back {refund}. Review and approve. | Approve (close) | {name} asked to close {potName}. Approve in Pot → {link} |
| Closed | {potName} is closed | {refund} is on its way back to you. | Pot | {potName} is closed. Everyone got their share back. |
| Bot link hint | — | — | — | Opens in Telegram's browser. To install Pot, open it in Safari. |

### 5.16 Install coach and push pre-prompt (§9)

| ID | String |
|---|---|
| coach.card.title | Put Pot on your Home Screen |
| coach.card.body | So you hear when friends need your OK. |
| coach.card.cta / .later | Show me how / Not now |
| coach.ios.step1 | Tap ••• next to the address bar |
| coach.ios27.step1 | Tap the page menu next to the address bar |
| coach.ios.step1_alt | Don't see it? Tap the Share button instead. |
| coach.ios.step2 | Tap Share, then scroll down |
| coach.ios.step3 | Tap Add to Home Screen |
| coach.ios.step4 | Keep "Open as Web App" on, then tap Add |
| coach.ios.done | Then open Pot from your Home Screen. |
| coach.android.cta | Install Pot |
| coach.android.step1 / 2 / 3 | Tap ⋮ at the top right / Tap "Add to Home screen" or "Install app" / Tap Install |
| coach.inapp.title | Open Pot in {browser} first |
| coach.inapp.body | {appName} can't add apps to your Home Screen. Tap ••• and choose "Open in browser". |
| coach.installed | Pot is on your Home Screen |
| push.prompt.title | Get told when friends need your OK |
| push.prompt.body | We'll only notify you about money in your Pots. |
| push.prompt.cta / .later | Turn on notifications / Not now |
| push.denied | Notifications are off. You can turn them on in your phone's Settings. |

---

## 6. Flows with tap counts and time budgets
Counting rules:
- A tap is any deliberate touch.
- Typing digits on the keypad counts as taps. Free-text typing does not (it is listed as "typing").
- **(+n)** = extra taps if an unknown resolves badly (→ owner).
- Times are design targets; ⚠️ marks estimates that need measuring in the spikes.

**Demo cast** (proposal; Cerasela's call). It unifies C1, C5 and C8:
- Pot: **Lisbon Trip** 🇵🇹, Trip preset.
- Rules: instant limit **$100**, per-person limit **$200**, majority.
- Goal: **$450** (3 × $150).
- Members: Maya (creator), Sam, then Leo joins.

Story:
1. Maya $150 + Sam $150 = **$300 of $450** when Leo opens the invite.
2. Leo adds $150 → **$450 of $450** (the goal bar completes on camera).
3. Groceries **$84**, approved instantly → $366.
4. Boat trip **$300** → "needs **2 of 3**" → approved → $66.
5. Close → **$22.00 each**.

The README's seeded state is the moment right after Leo joins ($450, 3 members), so C8's "$20 instant" and "$300 → 2 of 3" steps work unchanged. C8's video uses a "$400 boat request" after the $84 spend, which exceeds the $366 left in a $450 Pot. That is why it is $300 here (or seed more money).

### 6.1 F1: Invite onboarding (Leo, new user). Target ≤ 4 taps, median < 30 s (P-1)

| # | Screen | User action | Taps | System | Time budget |
|---|---|---|---|---|---|
| 0 | Group chat | Sees link preview (OG card: cover + "Maya invited you to Lisbon Trip") | 0 | OG image served | — |
| 1 | Chat → Safari | Taps link | 1 | SSR landing | ≤ 1.5 s to content |
| 2 | Landing | Reads (≈ 5 s), taps **Join with Google** | 2 | NEAR Auth / Auth0 authorize with a Google connection hint | 0.5 s |
| (2b) | Auth0 Universal Login chooser | "Continue with Google" | (+1) | only if the chooser can't be skipped → auth | 1-2 s |
| 3 | Google account chooser | Picks account | 3 | OAuth → callback | 2-5 s ⚠️ |
| (3b) | Consent screen | "Continue" | (+1) | only if Auth0/Google shows one → auth | 1-2 s |
| 4 | Setup | — | — | create + fund account, USDC storage (relayer); `join(invite)` → Rulebot auto-approves AddMemberToRole | 3-8 s + ≤ 4 s ⚠️ |
| 5 | **"You're in!"** | — | **3 (worst 5)** | focus to H1, polite announcement | total ≈ 15-25 s |

**Branches:**
- Returning, already signed in: link → [Join Lisbon Trip] = **2 taps, ≤ 5 s**.
- In-app browser (Instagram, Messenger…): banner → ••• → "Open in browser" (+2) → as above = **5-7 taps**. Or Email here: [Continue with email] + typing + password/code (→ auth: Auth0 DB connection = email + password per the spike legend; passwordless preferred).
- Apple on iOS: [Join with Apple] → Face ID sheet = **3 taps**. (rev3: mainnet only; the testnet NEAR Auth tenant has no Apple, D-20. rev6: the button exists only if the tenant adds Apple; the testnet stack is in §4.1.)
- Failures: invite.* (§5.2), auth.* / setup.* (§5.3).

### 6.2 F2: First contribution (Leo, testnet demo dollars). Target ≤ 3 taps after "You're in", ≤ 10 s

| # | Screen | Action | Taps | System | Time |
|---|---|---|---|---|---|
| 1 | You're in | [Add my $150 share] (amount prefilled, source = Demo dollars) | 1 | sheet opens prefilled | 0.3 s |
| 2 | Add money | [Add $150] | 2 | (testnet) mint demo dollars to Leo → relayed `ft_transfer_call` to Rulebot (→ relayer/contracts: can the faucet credit in one step?) | optimistic at once |
| (2b) | ConfirmStep | [Continue with Google] | (+1) | NEAR Auth popup (likely needed because `ft_transfer_call` carries 1 yocto → relayer) | +3-10 s ⚠️ |
| 3 | Pot | — | **2 (3)** | `Adding $150…` → `Added. Lisbon Trip now has $450.` (goal bar completes) | ≤ 5 s after finality (P-4) |

Then the InstallCoach card (§9). **Join + pay total: 5 taps best case, 8 worst, well under the 2-minute hallway target.**

### 6.3 F3: Instant reimbursement (Maya, $84 groceries). The 1.2 s moment

| # | Screen | Action | Taps | System | Time |
|---|---|---|---|---|---|
| 1 | Pot | [Spend] | 1 | sheet (Reimburse me preselected) | 0.3 s |
| 2 | Spend | 8, 4 on the keypad | 3 | RulePreview → `preview.instant` (debounced 300 ms) | instant |
| 3 | Spend | chip "Groceries 🛒" | 4 | — | — |
| 4 | Spend | [Get $84 back] | 5 | relayed `request_spend` → Rulebot → DAO add_proposal + rulebot vote → transfer | — |
| (4b) | ConfirmStep | [Continue with Google] | (+1) | only if requests need a popup → auth | +3-10 s ⚠️ |
| 5 | Result card | — | **5 (6)** | `Checking Pot rules…` shimmer (rev6: typing dots), **min 1.2 s**, until the Rulebot decision → `Approved by Pot rules` + celebration (≤ 600 ms; rev6: the 600 ms marigold burst) → `Sending $84 to you…` → `$84 sent to you` [Receipt] | target: Approved ≤ 3 s, Sent ≤ 6 s; `still_checking` at 6 s; `slow` at 15 s ⚠️ → contracts/relayer: measured block count |

**Failure branches:**
- Relayer down → `spend.error.relayer` (the card reverts to the form with values kept).
- Race over a limit → `spend.became_vote`.
- Pot short at execution → `feed.failed`.

**Choreography** (reduced-motion variant in §7.6):
1. 0-1200 ms: the shimmer sweeps the card and the copy reads "Checking Pot rules…" (`aria-busy="true"`). (rev6: no shimmer. The brand's typing dots pulse instead, its one motif, brand/README §8.)
2. On decision: the card tints success-subtle (200 ms), the check icon pops (spring), a 12-particle honey/terracotta burst plays (≤ 600 ms, once), and the line swaps to "Approved by Pot rules". (rev6, brand) The card tints `brand-soft` instead, and the burst is the brand's one celebration: 600 ms of marigold from the button, once, for the requester only.
3. The number then rolls from $0 to $84 (500 ms).
4. "Sending…" chip → "Sent ✓".
5. The live region announces only: "Approved by Pot rules. $84 sent to you."

### 6.4 F4: Group vote ($300 boat trip)
**Requester (Maya):** [Spend] → 3, 0, 0 → chip "Tickets 🎟️" (or note "Boat trip", typing) → preview `preview.vote.over_cap` → [Ask the group] = **6 taps** (+ConfirmStep). Result `spend.vote_sent`, meter "1 of 2" (rev3: Maya's own approval is cast automatically, D-61).

**Approver (Leo):**

| # | Screen | Action | Taps | System | Time |
|---|---|---|---|---|---|
| 1 | Push "Maya needs your OK" | tap | 1 | opens `/p/lisbon-trip/r/12` → Approve sheet | ≤ 1 s warm, ≤ 3 s cold (+ re-auth if the session was lost → auth) |
| 2 | Approve sheet | [Approve $300] | **2** | relayed `act_proposal(VoteApprove)` | optimistic < 100 ms |
| (2b) | ConfirmStep | [Continue with Google] | (+1) | if votes need a popup | +3-10 s ⚠️ |
| 3 | Sheet | — | — | `Approved. 2 of 2.` reconcile ≤ 5 s (rev3: Leo's approval is the 2nd of 2, so it reaches the threshold) | |
| — | threshold reached (rev3: no third vote needed) | — | — | DAO executes transfer → everyone's feed shows `feed.approved`; Maya gets "Approved: $300 is on its way" | ≤ 5 s after the last vote |

**Inline approve from the feed or Requests:**
- **(A) no popup needed:** tap [Approve] on the card → it flips to "Approved · Undo" for 4 s, then sends. This is reversible before submission, so it satisfies WCAG 3.3.4. **1 tap.**
- **(B) popup needed:** the card's [Review] opens the sheet. **2-3 taps.**

**Decline path:** [Decline] → optional reason → `approve.declined.self`. With majority declined → `feed.declined` + push to the requester.

**Expiry path:** proposal period ends (rev3: **7 days** for every Pot; the period is a DAO setting fixed at creation, D-04, so `rules.expiry` says 7) → `approve.expired` / `feed.expired`, computed client-side.

### 6.5 F5: Close with pro-rata preview

| # | Who / screen | Action | Taps | System | Time |
|---|---|---|---|---|---|
| 1 | Maya · Pot | ••• → "Close Pot" | 2 | Close sheet with RefundTable (computed from on-chain contributions and balance) | ≤ 1 s |
| 2 | Close sheet | Reads the math; [Ask the group to close] | 3 (+1 Confirm) | `settle` request created | optimistic |
| 3 | Leo/Sam · push "Maya wants to close Lisbon Trip" | tap → [Approve] | 2 each | votes | — |
| 4 | All | — | — | majority → `settle` executes; each gets `balance × contribution_i / total` floored; dust to the last contributor (P-9) | ≤ 10 s ⚠️ |
| 5 | Everyone | — | — | `close.done.self` "Pot closed. $22.00 is on its way back to you."; Pot goes read-only | — |

### 6.6 F6: Create and share (Maya). Target < 60 s including typing
[Start a Pot] (1) → type "Lisbon Trip" + pick 🇵🇹 (2) → [Next] (3) → Trip preselected, chip "$150 each" (4) → [Create Pot] (5) → progress ≤ 15 s (P-2) → [Share link] (6) → WhatsApp (7) → chat (8) → Send (9). Copy-link variant: 6 taps.

### 6.7 F7: Any-chain add (Phase 2)
[Add money] → source "Another wallet or exchange" (2) → network "Base" (3) → amount prefilled → [Get address] (4) → [Copy address] (5) → (send from the other app, outside Pot) → stepper → on `SUCCESS`, automatic "Add to Pot" (+1 Confirm if needed) → "Added to the Pot". Budget: 1-3 min ⚠️ (intents). The user may leave; we notify (push/email).

---

## 7. Design tokens (rev6: the brand)
(rev6) The provisional proposal that stood here was replaced by the brand (D-67, D-45). It was light and warm (terracotta `#B4441F`, honey, ink `#1F1A17`), set in Inter or Geist, with dark mode out of scope.
- **Values:** [`brand/tokens.json`](../brand/tokens.json), explained with contrast checks in [brand/README.md](../brand/README.md) §3-§8.
- **Night is in scope** (Day is the default; §4.15 Appearance).
- **Structure:** each subsection keeps its place and maps the old token names to the brand's, so older references in this spec still resolve.
- **In code:** `--pot-<token>` CSS variables per theme, and Tailwind utilities from `@theme` (frontend-architecture §7.1).

### 7.1 Colour roles (rev6: pointer + mapping)

| Old token (provisional) | Brand token | Note |
|---|---|---|
| `canvas` | `ground` | Day `#faf9f6`, Night `#1c1424`; also the `theme-color` |
| `surface` | `surface` | cards, sheets, the Pot hero |
| `surface-sunken` | `surface-sunken` | keypad, inputs, segmented track, hovered rows |
| `border` | `line` | decorative only |
| `border-strong` | `line-strong` | inputs, unselected chip borders; ≥ 3:1 on every surface |
| `ink` | `ink` | eggplant `#2b1b3a` in Day, `#f6f1ea` in Night |
| `ink-2`, `ink-3` | `ink-muted` | one secondary text colour, ≥ 5.6:1 |
| `primary` | `brand` (marigold `#ffb320`) | the one primary button per screen and the goal bar fill. Text on it is `on-brand` (eggplant). It is **never text**, so links move to `link` |
| `primary-pressed` | `brand-deep` | pressed; also the 1 px Day border of marigold buttons |
| `primary-subtle` | `brand-soft` | selected chip; the "Approved by Pot rules" highlight |
| `honey`, `honey-subtle` | — | dropped: there is no decoration colour, and illustrations use the logo glyph |
| `success` | `approved` | with the `check` icon and a word |
| `success-subtle` | `brand-soft` | the instant-approval highlight (§6.3) |
| `warning` | `waiting` | blue, with the `clock` icon and a word |
| `danger` | `declined` | with the `x` icon and a word; inline error text is `declined` on the normal surface |
| `danger-subtle` | — | dropped |
| `info` | `link` | Advanced links, text buttons |
| `track` | `brand-soft` | GoalBar track; the fill is only 1.5:1 against it in Day, so the text twin carries the information (§3) |
| `focus` | `focus` | plum `#5b3a8c` (Day), `#ffc94d` (Night); a 2 px ring with a 2 px offset |
| `scrim` | — (not a brand token) | Day: eggplant `#2b1b3a` at 45 %; Night: black at 35 %, as in the canvas's Night sheet |
| avatar tints (peach, sand, sage, mist, lilac, rose) | `member-1`…`member-6` | assigned in **join order** (`join_index`), not per user; eggplant initials ≥ 9.2:1 |

Rules:
- Status always pairs color with an icon and a word.
- Amount colors: incoming money ("+ $150.00", "gets back") may use `approved`; "needs approval" uses `waiting`. A normal balance is **ink**, never green. (rev6)
- (rev6) Marigold (`brand`, `brand-deep`) is never text. On `brand-soft`, text is `ink` or `ink-muted`.
- (rev6) One marigold button per screen.

### 7.2 Type scale (rev6: Gabarito + Figtree, D-45)

| Old token | Brand style | Value |
|---|---|---|
| `display-balance` | `balance-hero` | Gabarito 44 / 48 px (2.75 / 3 rem), 800, −0.02em, tabular; 36 px below 360 px wide |
| `display-amount` | `balance-hero` | keypad display and result card. The brand has no larger style (the canvas's Approve sheet uses `balance-hero`); Cerasela may add one to the artifact |
| `title-1` | `title` | Gabarito 26 / 30, 700, −0.01em: Pot name, screen titles |
| `title-2`, `title-3` | `heading` | Gabarito 19 / 24, 700: sheet and section headings |
| `body` | `body` | Figtree 16 / 24, 400; **inputs ≥ 16 px** (prevents iOS focus zoom) |
| `body-strong` | `amount` (row amounts) or `label` (button labels) | Figtree 17 / 24, 700, tabular; or Figtree 15 / 20, 600 |
| `callout` | `body` | feed lines |
| `footnote` | `body-sm` | Figtree 14 / 20, 400, `ink-muted`: meta, helper text |
| `caption` | `label` | badges, chips, tabs |

Use rem everywhere, so text scales with the browser setting (D-45 Dynamic Type). Both fonts ship `tnum` (verified 2026-10-21), and every amount uses tabular figures. (rev6) The "$" renders in `ink` like the digits, as on the canvas.

### 7.3 Spacing and layout (rev6)
- **Spacing:** the brand's steps `space-1` 4 · `space-2` 8 · `space-3` 12 · `space-4` 16 (gutter, card padding) · `space-6` 24 (section gap; card padding from 768 px) · `space-8` 32 · `space-12` 48 (top margin of the invite landing). `space-5`, `space-10` and `space-16` are dropped.
- **Sizes**, all at least the brand's `tap-min` (44 px):
  - Buttons: 52 px primary (the brand's value), 48 px secondary, full width in sheets.
  - Keypad keys: 64×56.
  - List rows: ≥ 56 px.
  - Tab bar: 56 px + safe area.
  - Sheets: max height 92 dvh, max width `container-flow` (440 px), and centred dialogs from `bp-md` (768 px).
- **Breakpoints and containers:** `bp-sm` 360, `bp-md` 768, `bp-lg` 1024; `container-flow` 440, `container-app` 1080 (§2).

### 7.4 Radii (rev6)
`radius-sm` 10 (inputs, chips) · `radius-md` 16 (buttons, feed cards, toasts) · `radius-lg` 24 (the Pot hero, sheet top corners, dialogs) · `radius-pill` (avatars, status pills, the goal bar, segmented controls).
Old → new: `radius-sm` 8 → 10; `radius-md` 12 → 16; `radius-lg` 16 (cards) → `radius-md` 16; `radius-xl` 24 → `radius-lg` 24; `radius-full` → `radius-pill`.

### 7.5 Elevation (rev6)

| Old token | Brand token | Use |
|---|---|---|
| `shadow-0` | none | flat rows on `ground` |
| `shadow-1` | `shadow-card` | the Pot hero, Pot cards on the Pots home |
| `shadow-2` | `shadow-card` | sticky CTA bar, toasts (the brand has no separate token) |
| `shadow-3` | `shadow-sheet` | bottom sheets |

Each brand shadow has a Day and a Night value (brand/README §6).

### 7.6 Motion

| Token | Value | Use |
|---|---|---|
| `duration-fast` | 120 ms | press feedback, chip select, toggles |
| `duration-base` | 200 ms | fades, state swaps, toast in |
| `duration-moderate` | 280 ms | segmented control, list insert/remove |
| `duration-slow` | 360 ms | sheet enter (rev3: Base UI Drawer with CSS transitions, D-41; no vaul spring) |
| `duration-count` | 500 ms | number roll in hero and result |
| `duration-celebrate` | ≤ 600 ms | approval burst (C5). (rev6) Exactly 600 ms: the brand's one celebration, a marigold burst from the button when Pot rules approve a request, never for group approvals |
| `duration-shimmer` | 1200 ms loop | "Checking Pot rules". (rev6) The loop of the typing-dots loader (no shimmer) |
| `min-checking` | 1200 ms | minimum display for the rules beat |
| `ease-standard` | cubic-bezier(0.2, 0, 0, 1) | most transitions |
| `ease-enter` | cubic-bezier(0.05, 0.7, 0.1, 1) | elements entering |
| `ease-exit` | cubic-bezier(0.3, 0, 0.8, 0.15) | elements leaving |
| `spring-pop` | Motion spring, stiffness 500, damping 30 | check icon, chip select |

**Reduced motion** (`prefers-reduced-motion: reduce`):
- no translate, scale or parallax;
- sheets and toasts fade in 120 ms;
- the shimmer becomes a static `honey-subtle` tint plus the "Checking Pot rules…" text (rev6: the typing dots stay still next to the text);
- confetti is replaced by a static ✓ and a colour change (rev6: no burst, just the message and the static ✓);
- number rolls swap instantly;
- the 1.2 s minimum stays, because it is pacing rather than motion. The live region announces only the final state.

**Other rules:**
- No looping animation runs longer than 5 s (WCAG 2.2.2). After 5 s of checking, switch to the static "Still checking…".
- No flashing.
- Haptics are not available in iOS Safari, so never rely on them.

### 7.7 Iconography and illustration
- lucide at 20/24 px, 1.75 stroke. (rev6, brand: **stroke 2**, in `ink` or the state colour.)
- Warm, simple spot illustrations for empty states (pot, coins, friends) in honey/terracotta. (rev6, brand: empty states use the logo glyph, eggplant on Day and marigold on Night, and the empty feed shows its typing dots. No coins: the brand forbids a coin on the pot.)
- Emoji are allowed as Pot covers and reason chips.
- Icons always come with text labels on primary actions.
- (rev6) The pot-bubble is a logo, never an icon in a button. The typing dots are the brand's one motif: the "Checking Pot rules" loader and the empty feed only.

---

## 8. Accessibility checklist (WCAG 2.2 AA)

| SC | Requirement for Pot | Test |
|---|---|---|
| 1.1.1 | Avatars alt = name; QR has its link + Copy as a text twin; confetti `aria-hidden` (rev6: the marigold burst) | axe, VoiceOver |
| 1.3.1 | One H1 per screen (Pot name / sheet title); feed is a `<ul>` with day headings; RefundTable is a real `<table>` | axe, rotor |
| 1.3.5 | `autocomplete`: `email`, `name`, `one-time-code` | inspect |
| 1.4.1 | Status = icon + word + colour; balances use words ("gets back") | grayscale screenshot review |
| 1.4.3 | Text ≥ 4.5:1, large ≥ 3:1. The §7.1 palette passes; `honey` is never used for text. (rev6) The brand palette passes in Day and Night (brand/README §3). Marigold (`brand`, `brand-deep`) is never text, and on `brand-soft` text is `ink` or `ink-muted` | token audit (rev6: test-plan U-WEB-09) |
| 1.4.4 / 1.4.10 | 200% text and 320 px reflow without horizontal scroll; the keypad display auto-shrinks | Safari zoom, 320 px viewport |
| 1.4.11 | Input borders `border-strong` 3.89:1; focus ring ≥ 3:1; GoalBar fill vs track 4.22:1; selected chips also get a ✓. (rev6) Input borders `line-strong` ≥ 3.0:1. The `focus` ring keeps its 2 px offset, because in Night it is 1.2:1 against marigold. The GoalBar fill against its track is 1.5:1 in Day, so its text twin carries the information. Day marigold buttons get the `brand-deep` border (3.5:1) | token audit |
| 2.1.1 / 2.1.2 | Desktop: all actions by keyboard; keypad accepts digits, Backspace, Enter; sheets trap focus, Esc closes, focus returns | keyboard pass |
| 2.2.1 | Quote/deposit deadlines offer "Get a new address"; the session-expiry warning offers one-tap re-auth | manual |
| 2.2.2 | Shimmer stops at 5 s; no endless loops (rev6: the typing-dots pulse stops at 5 s) | manual |
| 2.4.2 | `document.title` = "Lisbon Trip · Pot", "Approve $300 · Pot" | inspect |
| 2.4.3 | Sheet open → focus on its title; close → focus back to the trigger | VoiceOver |
| 2.4.7 + **2.4.11** | Visible ring (2 px ink + 2 px offset; rev6: 2 px `focus` ring + 2 px offset, on `:focus-visible`). **Sticky CTA bar, tab bar and toasts never cover the focused element**: `scroll-padding-bottom`, toasts at the top on mobile | keyboard + zoom |
| 2.5.3 | Visible label inside the accessible name ("Approve $300"), so voice control works | inspect |
| **2.5.7** | Every drawer has ✕/Cancel; no swipe-only actions (no swipe-to-approve); no amount sliders | manual |
| **2.5.8** | Targets ≥ 24×24 (we use ≥ 48×48 with ≥ 8 px spacing); inline links avoided in money UI | measure |
| 3.2.2 | Keypad entry never auto-submits; choosing a source doesn't submit | manual |
| **3.2.6** | "Help" in the same place everywhere (You tab, plus "?" at top-right of sheets) | review |
| 3.3.1 / 3.3.3 | Inline errors with icon and text, `aria-describedby`, with a suggestion ("You can ask for up to $366.00") | axe |
| **3.3.4** | Spend / Add / Approve / Close show the outcome **before** the button. Notifications open sheets, never act. Inline approve only with a 4 s Undo (reversible) | flow review |
| **3.3.7** | Name and email come from auth; remember the last source and reason; never ask twice | review |
| **3.3.8** | Login by OAuth or passkey (no cognitive test). Email path: allow paste and password managers, `autocomplete="one-time-code"` for codes. Any anti-abuse challenge must be non-cognitive (→ relayer) | manual |
| 4.1.2 | Segmented control = `tablist`; chips = `aria-pressed` or radio; keypad keys labelled | axe |
| **4.1.3** | One polite live region per screen for "Sending…", "Approved by Pot rules", "Added…", "1 of 2 approvals". `role="alert"` only for failures needing action. No double announcement (toast or inline, not both) | VoiceOver, TalkBack |

**VoiceOver path: join** (iPhone, Safari, VoiceOver on). Expected focus stops and announcements:
1. "Maya invited you to Lisbon Trip, heading level 1."
2. "Lisbon Trip has $300 from 2 friends." → "$300 of $450 collected." → "Maya and Sam are in."
3. "No one can take money out alone. Small spends follow the Pot's rules; bigger ones need the group."
4. "Join with Google, button." Double-tap. Google pages are outside our control.
5. Back in Pot: "Setting up your Pot account. Busy." → (polite) "Joining Lisbon Trip." → focus moves to "You're in!, heading level 1" → "Welcome to Lisbon Trip. Everyone's chipping in $150." → "Add my $150 share, button."

**VoiceOver path: approve:**
1. Notification "Pot. Maya needs your OK. $300 for Tickets · Lisbon Trip". Double-tap.
2. "Approve request, dialog. Maya asks for $300, heading level 2."
3. "For Tickets." → "Needs approval because it's over the $100 instant limit." → "1 of 2 approvals so far." → "Pot after this: $66." → "Expires in 2 days."
4. "Approve $300, button." Double-tap → (ConfirmStep, if any) → polite "Approved. 2 of 2. $300 is on its way to Maya." → the sheet closes; focus lands on the request item, now "Approved".

Day-11 test matrix (C7):
- VoiceOver: iOS 26 or 27, Safari tab **and** installed PWA.
- TalkBack: Android Chrome.
- axe on every route.
- Keyboard pass on desktop.
- 200% zoom.
- Reduced motion on.
- 320 px width.

---

## 9. Install coach (iOS 26/27 Safari, Android Chrome, in-app browsers)
**Principles:** the app works fully in a browser tab, and install only adds push and a Home Screen icon (C2, C9). Never block, never show on the invite landing, never before first value.

**Triggers:**
1. After the **first successful contribution** (Leo) or **Pot creation** (Maya), as a card inside the success state: `coach.card.*`.
2. Always available in You → "Add Pot to your Home Screen" until installed.

**Caps:** at most 2 automatic shows per device; snooze 7 days after "Not now". Never show when `display-mode: standalone`, and never on desktop (You tab only).

| Detected context (→ web: detection) | Coach |
|---|---|
| **iOS 26 Safari** | Bottom sheet, 4 numbered steps with a mini illustration each: `coach.ios.step1` (••• "More" button) + `coach.ios.step1_alt` (Bottom/Top tab layouts show Share directly) → `step2` → `step3` → `step4` → `done`. Steps per Apple's guide: "Tap [More], then tap Share… Scroll down… tap Add to Home Screen… Turn on Open as Web App. Tap Add." 📄 |
| **iOS 27 Safari** (current) | Same, with step 1 = `coach.ios27.step1` ("page menu"); Apple's iOS 27 guide names "the Page Menu button" 📄. If the version can't be detected, use the iOS 26 copy plus the "Don't see it?" line. |
| iOS other browsers | Generic: "Open the share menu and tap Add to Home Screen" (⚠️ → web: iOS Chrome/Firefox support) |
| **In-app browser** (Instagram, Facebook/Messenger, LinkedIn, TikTok, Telegram's in-app view…) | `coach.inapp.*` + [Copy link]. Same detection drives the landing banner (§4.1), because Google OAuth is blocked in WebViews 📄. |
| **Android Chrome, `beforeinstallprompt` saved** | Single [Install Pot] (`coach.android.cta`) → native dialog → `coach.installed` |
| Android Chrome without the event | `coach.android.step1-3` (menu wording varies: "Add to Home screen" / "Install app" ⚠️ → web) |

**After install** (first standalone launch): show the push pre-prompt `push.prompt.*` before any system prompt, and only from a tap (iOS requires a user gesture in an installed web app → web/infra). Denied → `push.denied`; email stays on as the fallback (→ infra).

**Measure:** `coach_shown`, `coach_opened`, `install_detected` (display-mode change or `appinstalled`), `push_prompt_shown`, `push_granted`. These feed the hallway test and the day-11 checks.

---

## 10. Advanced (kept separate)
- **Entry:** You → Advanced (and the Pot ••• → "View on Trezu", which opens Advanced's Trezu row). Nothing in Advanced is needed to use Pot.
- **Header:** `advanced.intro`.
- **Rows:**
  1. **Your Pot account:** `leo.<…>.testnet` [Copy] + `advanced.network`.
  2. **Per Pot:** "View Lisbon Trip on Trezu ↗" (rev3: mainnet Pots only; testnet shows the explorer link and the "On-chain rules" panel instead, D-52), Pot contract id, Rules contract id (copyable).
  3. **Receipts:** all my actions, each "{action} {amount} · {date}" → nearblocks link.
  4. **Export activity (CSV).**
  5. **Use a NEAR wallet** (NEAR Connect; → auth).
  6. **Show technical details in errors** (toggle; default off). On: error toasts expand raw messages (e.g. `ERR_MIN_BOND`) under "Details".
  7. `advanced.public` privacy note.
- **Lint:** the `advanced.*` namespace is the only place allowed to show account ids, contract names and "testnet".
- **Visual:** a different, quieter surface (`surface-sunken` background, `ink-2` text), with no primary-coloured CTAs, so it reads as "back office". (rev6: `ink-muted` text, and no marigold.)

---

## 11. Instrumentation (to verify tap and time budgets)
Events (anonymous, testnet):
- `landing_view`
- `join_cta_tap{provider}`
- `auth_return{ok,ms}`
- `setup_done{ms}`
- `joined{ms_since_landing}`
- `add_tap`, `add_sent{ms}`, `add_settled{ms}`
- `spend_submit{path}`, `rules_decision{ms}`, `spend_sent{ms}`
- `approve_open{source}`, `approve_vote{ms}`
- `confirm_step_shown`
- `error{code}`
- `coach_*`, `push_*`

Dashboards are optional. For the hallway test (round B), a hidden `?debug=1` overlay with timers is enough.

---

## 12. Day-by-day hooks for Cerasela (from C7)

| Day | UX deliverable from this spec |
|---|---|
| Oct 22-31 (Phase 0) | Figma: landing, You're in, Pot, Add money, Spend + result card, Approve sheet, Close preview. Clickable prototype for hallway round A ([hallway-test.md](hallway-test.md)). Tokens in Figma variables. (rev6: tokens, logo and web icons are done in `brand/`; Figma variables are optional and, if made, copy `brand/tokens.json`) |
| Nov 1 | §7 tokens into Tailwind `@theme`; shadcn install; i18n file seeded from §5. (rev6: `brand/tokens.json` (Day + Night) generates the CSS variables; Gabarito + Figtree via next/font; icons, manifest and OG image from `brand/web`) |
| Nov 2-6 | §4.1-4.4, 4.7, 4.9-4.10 states; §6 flows wired; ConfirmStep if needed |
| Nov 7 | Hallway round B (3 people) on the testnet build |
| Nov 8-10 | §4.8 stepper, §4.6 Rules, §4.14 Close |
| Nov 11 | §8 accessibility pass, §9 install coach, push prompt |
| Nov 12 | Video: F1, F3, F4, F5 in that order (C8) |

---

## 13. Open questions and decisions
### For Cerasela (design calls)
1. **Hero number:** Pot balance (recommended) vs "Your share" (C5 says "Your share $150").
2. **Login set and order:** [Join with Google] + [Join with Apple], ordered by platform, + "More ways" (recommended) vs four equal buttons. (rev6: on testnet, [Join with Google] (marigold) + [Continue with email] + "More ways" (passkey, wallet); Apple only if the tenant adds it, D-20, §4.1.)
3. **Trip instant limit $100** (recommended; C5's "$50" makes the "$84 instant" demo impossible) and the per-person limit of $200.
4. **Inline Approve with Undo** (only if no popup) vs always opening the sheet.
5. **Font:** Inter (recommended: neutral, proven `tnum`) vs Geist. (rev6: answered by the brand. Gabarito + Figtree, both with `tnum`, D-45.)
6. **Palette:** terracotta + honey (as specified) vs an alternative warm primary. (rev6: answered by the brand. Marigold + eggplant, Day and Night, D-67.)
7. **Product and submission name** (PotLock's "Pots", name uniqueness; see kb/competitors-ux-patterns.md). (rev6: the product name is "Pot" with a lowercase wordmark, D-62. The unique submission `projectName` stays with the humans, H-14.)
8. **Demo cast and amounts** (§6). This also fixes the C1/C5/C8 inconsistencies (€ vs $, "3-of-5" vs "2 of 3").
9. **Decline reason:** optional (as specified) vs none. Test hypothesis H4.
10. **Say "Free" once** at Create (as specified) vs never mention fees.

### → auth
- **Per-action popup?** Can votes and requests use a scoped function-call key, so they are popup-free?
- **Session persistence** after reload or PWA relaunch ("tokens in memory").
- **Hosted origin on testnet:** the shared client allows only `localhost:3000`.
- **Skipping the Auth0 chooser:** connection hint `google-oauth2` / `apple`.
- **Consent screen:** is one shown?
- **Email path:** password vs passwordless.
- **Accounts:** do Google and passkey map to the same account?
- **NEAR Connect fallback:** is near.com in near-connect?

### → relayer
- Measured account setup time.
- Does `ft_transfer_call` with 1 yocto force full-access signing?
- Per-user cap values (for the `relayer.cap` copy).
- Health endpoint for `relayer.down.banner`.
- Testnet faucet: can it mint and credit in one step?

### → contracts / sputnik
- **Invites:** multi-use, rotatable, expiring links vs P-3's one-time codes. (rev3: answered, multi-use and rotatable, D-08)
- **Requester's approval:** does it count (auto-vote)? (rev3: answered, yes, cast automatically, D-61)
- **Proposal period:** 3 days for Trip? (rev3: answered, 7 days for every Pot, D-04)
- **Leaving:** can someone leave before close? (rev3: not in v1; refunds come at close)
- **Notes:** on-chain or off-chain? (privacy) (rev3: answered, off-chain, D-07, so `spend.note.public_hint` is never shown)
- **`Failed` transfers:** retry automatically? (rev3: answered, the daily reconcile retries when the Pot has enough, api-spec §5.3; members can also retry)
- **Slug rules** and collisions. (rev3: contracts-spec §3.2)
- **Open requests at close:** cancel them? (rev3: they stay open on-chain but can never be paid once the Pot is empty, and expire after 7 days)
- **Demo reset.** (rev3: answered, Reset leases a fresh Pot, api-spec §7.3)
- **Trezu testnet deep link.** (rev3: answered, none: Trezu is mainnet-only, D-52)
- **Measured block counts** for auto-approve (to tune the 6 s / 15 s thresholds). (rev3: calibrated on Nov 4, task C-09)

### → intents
- Late sends after the quote deadline.
- `INCOMPLETE_DEPOSIT` refund mechanics.
- Typical `PROCESSING` time (to confirm "1-3 minutes").
- `depositMemo` cases.

### → web
- In-app browser detection list.
- iOS version detection (26 vs 27 illustration).
- Android install wording.
- iOS Dynamic Type via `-apple-system-body`.
- OG image route for `/j/[slug]` (rev3).

### → infra
- Push payload limits.
- Email fallback default.
- Nudge rate limit.
- Telegram bot terms for linking to the PWA.

---

## 14. Sources
Research and citations live in the KB files. Key primary sources behind this spec, all accessed 2026-10-21:
- https://nearhackathon.com/HACKATHON.md and https://nearhackathon.com/: rules, judges, criteria (see kb/hackathon-rules.md).
- https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ and https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html: WCAG 2.2 SCs, 3.3.4.
- https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/26.0/ios/26.0 and /27.0/ios/27.0: install steps.
- https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/: in-app browser OAuth block.
- https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/proposals.rs: proposal statuses (lazy Expired, Failed).
- https://docs.near-intents.org/api-reference/oneclick/check-swap-execution-status: 1Click statuses.
- Mobbin references: kb/ux-research.md §Reference library; kb/competitors-ux-patterns.md §Sources.
- Contrast ratios: computed locally from the WCAG relative-luminance formula (scratch script, not product code).
