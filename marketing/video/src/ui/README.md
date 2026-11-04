# Pot UI kit (video)

App-faithful, frame-driven React replicas of Pot's real screens, for staging inside a 3D phone. Every state
change is a **prop**: scenes animate by computing props from `useCurrentFrame()` (no CSS animations inside).
Import everything from `src/ui` (`index.ts`).

Built from `apps/web/components/**`, `apps/web/i18n/en.json` and `app/tokens.css`, and checked pixel-for-pixel
against `notes/screens/*.png` (3× captures of a 390 px layout). Colours come only from `src/brand/tokens.ts`.
**Updated 2026-11-03 to the app of Nov 3** (round actions, compact feed, Settings tab, two-step Spend and Add,
one OK, earned trust, the goal with a date, pay-in and send-by-link links, the lean Create). See "What changed".

```tsx
import { Phone, PotScreen, SpendSheet, feedAfterGroceries, pressAt } from "../ui";

<Phone theme="day" depth={10}>
  <PotScreen balance={interpolate(f, [0, 30], [450, 366])} yourShare={122} putIn={150} feed={feedAfterGroceries(appear)} tabBar={{ balance: 84 }} />
  <SpendSheet step="approved" amount={84} progress={1} burstProgress={(f - 40) / 36} burstVariant="cinematic" />
</Phone>
```

## What changed on 2026-11-03 (props and rects that changed meaning)
- **PotScreen**: the hero line is "You'd get back $150 · You put in $150 ⓘ"; the two pill buttons became the
  round action row **Add money (the one marigold circle) · Spend · Ask · More** (`press.target` is now
  `"add" | "spend" | "ask" | "more"`, same `{target, amount}` shape); tabs are **Activity · Members · Settings**
  (`activeTab="rules"` still works and shows Settings; `rules` prop = `settings` prop); the feed rows are
  **compact rows**; the header has no ••• (only a closed Pot keeps it); the **tab bar shows your Pot dollars**
  ("$0.00" by default: pass `tabBar={{ balance }}`; `balance: null` brings back "You"). The hero is 52 px taller
  (`LAYOUT.potHero` h 250.38 → 302.38) and everything under it moved down 52 px.
- **SpendSheet** is two steps. Legacy `step="amount" | "vote"` render the new form: step 1 ("How much?" + keypad +
  [Next]) while no reason is chosen and no chip is pressed, step 2 ("What's it for?" + Who gets paid + the
  decision line + the ask + [Back]) from then on. Prefer the explicit `step="howMuch" | "details"`.
  **$300 is now a one-OK amount** (instant ≤ $100 < one OK ≤ $300 < the group): `step="vote"`/`"details"` at $300
  says "This needs one OK from anyone else" + [Ask for one OK], and **`step="voteSent"` at $300 shows the one-OK
  result** ("Sent · One OK from anyone else in the group and it's paid.", no timeline). Pass `tier="group"` (or an
  amount over $300) for the old "Sent to the group · Needs 2 of 3 approvals" + timeline. `step="sent"` gained the
  quiet "Receipt ↗" (the result block is 44 px taller: `LAYOUT.spendSentCapsule` y 604 → 560).
- **ApproveSheet defaults to the one-OK variant** for $100 < amount ≤ $300 ("Needs one OK from anyone in the group.
  It's over Maya's instant limit.", "One OK needed", [OK $300] → "Sending your OK…" → "Done. Your OK sent $300 to
  Maya."). `variant="group"` keeps the Oct 22 sheet (timeline, [Approve $300], "Approving…", "Approved! …"). Both
  now have the details table (Status · Approved · Pot after this · Expires) and "Receipt ↗", and use the standard
  footer (12 px bottom padding, was 20). While `state="approving"` both buttons are disabled (50 %), as in the app.
- **PushNotification defaults to the one-OK copy** ("Maya needs one OK" / "$300 for the boat trip · Lisbon Trip ·
  Anyone can OK it", two body lines: `LAYOUT.lockPush` h 102). `copyVariant="group"` = the old copy.
- **RuleRow `highlight`** accepts 0..1. `tripRules()` is LEGACY (Oct 22 order); use `potRules()` / `ruleTiers()`.
- **InviteLanding**: plain seats (only the inviter's initials), "Maya and 1 other are in", the one-OK rules line,
  "Pot is for groups who know each other.", default expiry "Nov 7" (`allInitials` brings back the Oct 22 seats).
- **AddMoneySheet** is two steps; the default `step={2}` ("How do you want to add it?") is where "Add my $150
  share" lands, so the old call `<AddMoneySheet ctaPress … />` still shows [Add $150] (now with [‹ Back]).
- **CreatePotSheet** `step 1` is the lean "Start a Pot" (no emoji grid unless `picker`), `step 2` is "Pot rules"
  (was the Trip preset card), `step 3` unchanged.
- **OgCard** shows plain seats (no initials; `initials` restores them). **LockScreen** date "Tuesday, November 3".
- `Tabs` `index` 2 = Settings; `POT_TABS` = activity/members/settings.
- Feed fixtures follow the app's seeded world (Oct 31 · Nov 1 · Yesterday 5:23 PM · Today) and the one-OK story.

## Coordinates and themes
- The screen is **390 × 844** logical px. `Phone` = 414 × 868 (12 px bezel), screen radius 55.
  `SCREEN_RECT` = `{x: 12, y: 12, width: 390, height: 844, radius: 55}` relative to the phone.
- Inside `Phone`, screens respect the safe areas: **50 px** status bar (`SAFE_TOP`), **34 px** home indicator
  (`SAFE_BOTTOM`). Outside a phone (`BareScreen`, `UiPiece`, or no provider) they are 0. `BareScreen height`
  makes a taller page (full-page comparisons).
- `theme="day" | "night"` on `Phone` (or `<UiTheme theme>`); every component reads tokens from it.
- Content width inside the phone: **358** (`CONTENT_W`, 16 px gutters).
- Text inherits the app's body style (`SCREEN_TEXT`: Figtree 16/24, tabular figures). Amounts go through
  `MoneyText` / `formatUsd` (two decimals, U+2212 minus); sentences/buttons use whole dollars ("Add $150").

## Phone (3D-ready)
`Phone` props: `theme`, `showStatusBar` (true), `statusBarTone` ("dark"/"light"), `time` ("9:41"), `battery`,
`homeIndicator`, `homeIndicatorTone`, `screenBackground`, `zoom` (CSS zoom: crisp large renders; prefer it to a
CSS scale for close-ups), `shadow` (eggplant rgba), `glare` (0..1 glass reflection), **`depth`** (px body
thickness: extruded token-coloured layers behind the face, visible when a 3D stage yaws the phone).
- The root is `transform-style: preserve-3d`; no ancestor of the screen has opacity/filter/mask/isolation/
  overflow. Only the screen leaf clips (radius + overflow).
- Generic hardware: pill camera island, SVG signal/wi-fi/battery, side buttons; no device branding.

## Breakouts (cards lifted out of the phone)
- Render the twin **outside** the phone at the same size with `<UiPiece theme width={358}>…</UiPiece>`
  (`card="surface"` + `padding` + `shadow` give it a card body).
- Exact in-screen rects for default states are in `LAYOUT` (`src/ui/layout.ts`); `inPhone(rect)` adds the bezel.
  Re-measure: `node src/ui/preview/measure.mjs` (uses port 3417; `PORT=` to change).
- Hide the in-phone original while the twin is up (keeps layout): `PotScreen hideHero`, `SpendSheet hideCapsule`
  / `hideDecision` / `hideTimeline`, `ApproveSheet hideTimeline` (also hides the One OK block) / `hideDetails`,
  `CloseSheet hideTable`, `SettingsTab hideRule="oneOk"`, `CreatePotSheet hideRule="oneOk"`, `ChatMessage.hidden`.
- Standalone pieces (all 358 wide unless noted): `RulesCapsule`, `SpendResult`, `DecisionLine`, `OneOkLine`,
  `SpendFacts`, `ApprovalTimeline`, `RefundTable`, `RuleRow`, `RequestCard`, `FeedRow` / `CompactRow`,
  `BalanceHero`, `PotActions` (326), `TrustRow`, `TrustBadge`, `MyTrustCard`, `TrustLevelUp`, `GoalBanner`,
  `GoalCard`, `PayInCard`, `SendLinkCard`, `QrPlate`, `CreateRuleCard kind=…`, `CreateCoverCard`,
  `CreateSummaryBox`, `MoreItem` (382), `LinkPreviewCard` (264), `OgCard`, `PushNotification` (374).

### LAYOUT keys (screen px; `node src/ui/preview/measure.mjs`)
| key | rect | note |
| --- | --- | --- |
| `potHero` | 16, 122, 358, **302.38** | was h 250.38 |
| `potActions` / `potActionAdd·Spend·Ask·More` | 32, 326.38, 326, 82 / circles x 43.25 · 125.75 · 208.25 · 290.75, 56² | new |
| `potTabs` · `feedFirstRow` · `potWaitingCard` · `tabBar` | y 448.38 · 536.38 (h 70.97) · 548.38 (h 200) · 752 (h 92) | new |
| `potGoalBanner` | 32, 272.38, 326, 114 (hero h 378.38) | new |
| `spendHowMuchDecision` · `spendHowMuchNext` · `spendKeypad` | y 404 · 486 · 550 (h 248) | new |
| `spendDetailsDecision` · `spendDetailsCta` | y 626 · 690 | new |
| `spendSentResult` / `spendSentCapsule` | **y 459.63** h 256.38 / **y 560** | was 503.63 h 212.38 / 604 |
| `spendApprovedResult` / `spendApprovedCapsule` | 663.63 / 764 | unchanged |
| `spendOneOkSentResult` · `spendOneOkSentStatus` | y 485.63 h 230.38 · y 586 h 86 | new |
| `spendVoteSentStatus` · `spendVoteSentTimeline` | y 438 · y 544 h 128 (`tier="group"`) | new |
| `sendLinkCard` · `sendLinkQr` | y 317.38 h 478 · y 381.38 h 268 | new |
| `approveOneOk` · `approveFacts` · `approveCta` | y 385.38 h 84 · y 489.38 h 196 · y 690 | new (default) |
| `approveDoneOneOk` · `approveDoneFacts` · `approveDoneStatus` | y 410 · 514 (h 100) · 670 (h 46) | new |
| `approveTimeline` | **y 385.38** (group variant) | was y 400 |
| `closeProposeTable` · `closedTable` | 331.75 · 467.75 | unchanged |
| `myTrust` | 16, 544.38, 358, 170 | new (Settings) |
| `ruleInstant` · `ruleTrust` · `ruleOneOk` · `ruleThreshold` · `ruleBudget` | **y 730.38** · 818.38 · 930.38 · **1018.38** · **1084.38** | instant/threshold/budget were 508.38 / 596.38 / 662.38 |
| `ruleRecipients` · `ruleExpiry` · `ruleLeftovers` · `ruleSize` · `ruleLinks` | **y 1216.38** · **1282.38** · 1348.38 · 1460.38 · 1526.38 | recipients/expiry were 794.38 / 860.38 |
| `memberFirstRow` · `lockPush` | y 688.38 h 128 · 8, 330, 374, **102** | new · push h was 82 |
| `createCoverCard` · `createName` · `createSummary` | y 137 · 311 · 383 (h 158) | new |
| `createRuleInstant` … `createRulesFixed` | y 201 · 353 · 477 · 685 · 857 · 1027 · 1123 | new (scroll with `bodyScroll`) |
| `addStep1Body` · `addStep2Body` · `payInCard` · `payInQr` · `moreFirstItem` | y 264 · 342 · 300 · 340 · 520 | new |
| `chatLinkPreviewExample` | 50, 455.41, 264, 232.59 | unchanged |

## Presses (the tap language)
- Every pressable takes a **0..1 press**: `Button pressed`, `Keypad pressedKey + press`, `Chip pressed`,
  `PushNotification pressed`, `PotActions press`, `MoreItem pressed`, and per-sheet/screen props (`ctaPress` = the
  step's primary, `backPress`, `donePress`, `approvePress`, `declinePress`, `secondaryPress`, `laterPress`,
  `googlePress`, `emailPress`, `morePress`, `changePress`, `coverPress`, `receiptPress`, `sharePress`,
  `pressedChip + chipPress`, `PotScreen press={{target: "add" | "spend" | "ask" | "more", amount}}` (+ `touchDot`),
  `RequestCard pressed + press`, `MoreSheet/AskSheet pressed={{target, amount}}`).
- Pressed = primary → `brand-deep`, secondary/ghost/chips/rows → `surface-sunken`, keys → `line`, scale 0.97
  (the round actions 0.94, as the app).
- `pressAt(frameSinceTouch, {inFrames: 5, holdFrames: 2, outFrames: 11})` gives the curve (in 4-6 f, out 10-12 f).
- Touch dot: `<TouchDot press={p} x={…} y={…} />` (44 px, eggplant at 18 %, only while pressed; Night uses the
  Night ink) or `Button touchDot`. `TapRipple` (disc + expanding ring) is kept for special moments.

## Components and the props that animate them
Atoms
- `Avatar` (`person`, `size` xs/sm/md/lg, `ring`, `hideInitials`), `AvatarStack` (`appear[]`, `emptySeats`,
  `initialsOnly`), `EmptySeat`, `CoverTile` (`emoji`, `cover`, `size`, `px`).
- `GoalBar`: `collected`/`goal` (+ text twin), **`progress`**, `text`. `GoalBanner` (`state` collecting/reached,
  `collected`, `goal`, `progress`, `daysLeft`, `date`, `allOrNothing`, `reachedPop`) and `GoalCard` (+ `balance`,
  `highlight`): "$300 of $450 · 3 days left", 🔒 "Spending opens once the goal is reached.", the all-or-nothing
  promise; reached: ✓ "Goal reached · $450 collected. Spending is open."
- `Button`: `variant`, `icon`, `leading`, `trailing`, `pressed`, `disabled` (the empty-amount style), `dim`,
  `touchDot`, `height`, `dataUi`.
- `StatusChip`: `status` sending/sent/approved/instant/needs/declined/expired/failed/cancelled + the pay-in chips
  outside/gift (custom words as children: "Needs one OK", "One OK"…), `size` md/sm, `ground`, `bare`.
- `MoneyText`: **`amount`** (float ok: count-ups), `variant` hero/title/row, `format` fixed/whole, `sign` in/out.
- `Keypad` (`pressedKey`, `press`), `AmountDisplay` (**`typed`**, `pop`), `TypingDots`, `Celebration`
  (**`progress`** over 36 f, `variant` app/cinematic), `Chip`, `Segmented` (`index` slides), `Tabs` (`active` or
  fractional **`index`** 0..2), `Toggle` (`on` 0..1 slides).
- `PotActions`: `press`, `addVariant`, `dim` (per action), `touchDot`.
- `TabBar`: `active`, `badge`, `badgeAppear`, **`balance`** (your Pot dollars; `null` = "You").
- `CompactRow` (`lead`, `title`, `meta`, `aside`, `amount`, `ground`, `pressed`), `LeadAvatar` (+ reason badge),
  `RowTitle`, `ReceiptLink`, `SystemLine`.
- `ActivityFeed`: `groups` = `{label, items[], appear?}`; item `appear` 0..1, `pressed`. Kinds: `contribution`
  (`chip: "sent"` right after it lands), `adding` ("Adding $150…" + Sending…), `joined`, `created`, `instant`
  (⚡ Instant), `pending` (`tier` one_ok → "Needs one OK", group → "Waiting 1 of 2"), `approved` (`okBy` → "✓ One
  OK"), `payin` (`tone` payment → "Paid in · by link" + From outside, gift → "Sent a gift ☕"), `goalReached`,
  `closeRequested`, `closed`. Ready-made feeds in `fixtures.ts`.
- `DecisionLine` (`path` empty/instant/one_ok/group, **`open`** 0..1 = the ⓘ panel, `details`), `decisionPath()`.
- `ApprovalTimeline` (`rows` with per-row **`pop`**, `k`) + `timelineRows({asker, approved, waiting, me})`.
- `RequestCard`: `tier` (default by amount: one OK → "Needs one OK" + [✓ OK $300]), `pressed` + `press`, `undo`
  ("queued" → "✓ Approved · Undo" with `undoDrain`, "sending", "sent").
- `RefundTable` (`rows`, `me`, `caption`, **`backShown[]`**), `RuleRow` (`highlight` 0..1, `meter`), `potRules()`
  / `ruleTiers()`, `ProgressSteps`, `RulesCapsule` (**`tint`**, **`checkPop`**, **`burstProgress`**),
  `SpendResult` (`statusAppear`, `receipt`, `to`).
- Trust: `TrustBadge` (`level` 0 New · 1 Trusted · 2 Very trusted, `pop`), `TrustRow` (`level`, `badgePop`,
  **`upTo`** (roll 100 → 200), `putIn`, `spentShare`, `getsBack`), `MyTrustCard` (`level`, `upTo`, `nextIn`,
  `next`), `TrustLevelUp` (`appear`).
- `QrCode` / `QrPlate` (`kind` payIn/sendLink, `size`, **`reveal`** row by row, `hint`): static matrices of demo
  text (never a real link), deterministic.
- `Toast` (`text`, `progress`), `Appear`, `Caret`, `GoogleMark`.

Screens
- `PotScreen`: **`balance`**, `yourShare` ("You'd get back"), `putIn`, `collected`, `goal`, **`goalProgress`**,
  `goalText`, `goalBanner` (GoalBanner props: all-or-nothing in the hero, dims Spend), `pendingIn`, `activeTab`
  (activity/members/settings) / **`tabIndex`**, `feed`, `waiting` (RequestCards: `tier`, `appear`, `pressed`,
  `press`), `memberLines`/`memberTotals`, `settings` (SettingsTab props; `rules` = legacy name), `tabBar` ({active,
  badge, badgeAppear, **balance**} or false), **`scrollY`**, `press`, `touchDot`, `sharePress`, `addVariant`,
  `closing` (the paused card, dims the actions), `closed` ({date, refund, putIn}), `hideHero`, `children`.
- `SettingsTab` (= legacy `RulesTab`): `trust`, `oneOkCap`, `links`, `k`, `n`, `memberBudget`, `used`, `myTrust`
  (MyTrustCard props or null), `show`, `highlight` + `highlightAmount`, `appear` (per rule), `hideRule`, `footer`,
  `moreSections`, `payInLinks`, `inviteUntil`.
- `MembersTab`: `members` (MemberLine: `person`, `putIn`, `spentShare`, `getsBack`, `isMe`, `trust` {level, upTo}),
  `totals`. `memberLines(balance, me, TRUST_NEW)`.
- `InviteLanding`: `members`, `emptySeats`, `balance`, `goalProgress`, `oneOkCap`, `expiry`, `allInitials`,
  **`scrollY`** (~300 brings the CTA up), **`joinStep`** 0..3, `joinVariant` mock/live (+ `showWalletLink`),
  `googlePress`, `emailPress`, `morePress`, `seatAppear`, `dotsFrame`.
- `PayInCard` / `PayInSheet` (`tone` payment/gift, `amount` (null = "They choose"), `until`, **`qrReveal`**,
  `readyPop`, `sharePress`, `copyPress`) and `SendLinkCard` (`amount`, `who`, `qrReveal`, `claimed` + `claimedPop`,
  `heading`, `card`).
- `ChatScreen` (unchanged), `PushNotification` (`copyVariant` oneOk/group/trust/goal, `title`, `body`,
  **`progress`**, **`pressed`**, `variant` banner/lock), `LockScreen` (`date` "Tuesday, November 3"), `OgCard`
  (`width`, plain seats), `LinkPreviewCard`.

Sheets (all share `SheetProps`: **`progress`** 0..1 through the 360 ms enter, `exiting`, `raw`, **`footerAppear`**,
`bodyScroll`, `scrim`, `description`; `SheetBack` is the step [‹ Back])
- `SpendSheet` **`step`**: `howMuch` (`typed`, `pressedKey` + `keyPress`, `amountPop`, `receipts`, `receiptPress`,
  `ctaPress` = [Next]) · `details` (`category`, `categorySelect`, `pressedChip` + `chipPress`, `chipsScrollX`,
  `payee` me/member/link + `payeeIndex`, `payTo`, `linkLabel`, `note`, `decisionOpen`, `hideDecision`,
  `submitting` (grey ask + dots), `ctaPress`, `backPress`) · `checking` (`dotsFrame`) · `approved` (`capsuleTint`,
  `checkPop`, `burstProgress`…) · `sending` · `sent` (`statusAppear`, `receipt`, `donePress`; `payee="link"` →
  "Your link to send $40 is ready" + the QR card, [Share link] [Copy link] [Done]) · `oneOkSent` · `voteSent`
  (`tier`, `timeline`, `hideTimeline`). Tier props: `instantLimit`, `oneOkCap`, `tier`, `potBalance`.
- `ApproveSheet` **`state`** ready / approving / approved, **`variant`** oneOk/group (default by amount); `asker`,
  `me` (Leo), `others`, `amount`, `reason`, `time`, `balanceAfter`, `expires`, `tickPop` (your tick: "You · gave
  the OK" or the timeline row), `statusAppear`, `approvePress`, `declinePress`, `donePress`, `hideTimeline`,
  `hideDetails`, `receipt`.
- `CloseSheet` **`mode`** propose / waiting / vote / closed; **`voting`** (vote in flight: [Approving…] and your
  row ticks, `votePop`), `me`, `proposer`, `rows`, `backShown`, `badgePop`, `ctaPress`, `secondaryPress`,
  `hideTable`. `ClosedMoment` (`refund`, `putIn`).
- `AddMoneySheet` **`step`** 1 / 2 (default 2): `typed`, `suggested`, `balance`/`collected`/`goal`/`putIn` (the
  footer lines), `source`, `ownDollars`, `pressedKey`, `keyPress`, `pressedChip` + `chipPress`, `someoneElse`,
  `ctaPress` ([Next] / [Add $150]), `backPress`, `showDollarNote` (off).
- `CreatePotSheet` **`step`** 1 (lean: **`typedChars`** + caret, `emoji`, `cover`, `picker` + `emojiSelect`,
  `coverPress`, `goalOn`, `goalEach`, `changePress`, `summaryHighlight`) / 2 (Pot rules: `instantLimit`,
  `memberBudget`, `trustOn`, `oneOkCap`, `targetOn`, `highlightRule` + `highlightAmount`, `hideRule`, `bodyScroll`,
  `backPress`) / 3 (creating: `created`, `dotsFrame`); `ctaPress`.
- `MoreSheet` (`pressed`, `touchDot`, `closed`), `AskSheet` (`pressed`, `touchDot`), `YoureInSheet` (unchanged).

## Copy used (all from en.json, `copy.ts`)
- Pot: "In the Pot" · "You'd get back $150 · You put in $150 ⓘ" · "$450 of $450 collected" · Add money · Spend ·
  Ask · More · Activity / Members / Settings · Yesterday "Leo · Added money" "Receipt ↗" "5:23 PM" "+ $150.00" ·
  "Leo joined · Receipt ↗" · Nov 1 / Oct 31 · "Maya · Groceries" ⚡ Instant "just now" "− $84.00" · "Maya ·
  Tickets" ⏱ Needs one OK "$300.00" → ✓ One OK "− $300.00" · "Grandma · Paid in · by link" ↙ From outside ·
  "Pot closed Everyone got their share back." · tab bar Pots / Requests / "$0.00" · Waiting on you: "Maya asks for
  $300 for the boat trip" "Needs one OK" "Expires in 7 days" [✓ OK $300] [Decline].
- Settings: "RULES · the group decides" · "Your instant limit" New "You can spend up to $100 without asking" "3
  more paid spends to $200" · "Anyone can spend up to $100 without asking." · "Trust grows: every 3 paid spends
  raise someone's instant limit by $100, up to $300." · "Spends up to $300 need just one OK from anyone else." ·
  "Bigger spends need 2 of 3 approvals." · per person / members / 7 days / leftovers / 40 people / "Sending money
  by link to people outside: on." · "The Pot enforces these rules itself…" · "Changing the rules" · MONEY FROM
  OUTSIDE · PAYING PEOPLE OUTSIDE · PEOPLE · RECORD · CLOSE POT.
- Spend: "Spend from Lisbon Trip" · "How much?" · [📷 Scan receipt] Choose a photo · "This will be approved
  instantly" ⓘ · [Next] · "What's it for?" chips · "Who gets paid?" Me / A member / Someone else · "+ Add a note
  (optional)" · "This needs one OK from anyone else" ⓘ ("It's over your $100 instant limit.") · [Get $84 back] /
  [Ask for one OK] / [Ask the group] · [‹ Back] · "Checking Pot rules…" · "Approved by Pot rules · Under the $100
  instant limit" · "$84 sent to you" ✓ Sent · "Receipt ↗" · "Sent · One OK from anyone else in the group and it's
  paid." · "Your link to send $40 is ready".
- Approve: "Maya asks for $300" · "Lisbon Trip · 2 min ago" · "For the boat trip" · "Needs one OK from anyone in
  the group. It's over Maya's instant limit." · "One OK needed" · "Maya · asked, approval counted" · "Anyone in
  Lisbon Trip except Maya can give it." · Status ⏱ Waiting · Approved Not yet · Pot after this $66.00 · Expires in 7
  days · [OK $300] [Decline] · "Sending your OK…" · "You · gave the OK" · ✓ Paid · "One OK by Leo" · "Done. Your OK
  sent $300 to Maya."
- Close, Join, Chat: as Oct 22, plus "Maya and 1 other are in", "Up to $100 without asking · up to $300 with one OK
  · bigger spends need most of the group", "Pot is for groups who know each other. No app to download."
- Add: "How much?" · Your share $150 · $50 · $100 · "Someone else paying? Send them a link" · [Next] · "$150"
  [Change] · "How do you want to add it?" · Demo dollars (test money) [Test] · "Pot dollars you have · $0.00 You
  don't have any yet" · Another app or exchange · "Lisbon Trip will have $450.00. Goal reached." · "After this,
  you'd get back $150 if the Pot closed." · [Add $150] [‹ Back].
- Create: "Start a Pot" · "Just you so far" · "This is what friends see in the chat. Tap the picture to change it."
  · "Pot name" "11/40" · "Everyone chips in [$ 150] each" · "Small spends up to $100 go through on their own;
  bigger ones go to the group" [Change] · [Create Pot] · "Pot rules" … "Every Pot works like this".
- Links: "Ask anyone to pay in" · "Your pay-in link is ready" · "Scan to pay into Lisbon Trip" · "Payment · $25 ·
  Until Nov 17" / "Gift ☕ · …" · [Share link] [Copy link] [Make another link] · "Send it to Casa Lisboa host.
  Whoever opens it gets $40." · "They point their phone camera at it." · "Anyone who has this link can take the
  money, so send it only to them."
- Push: "Maya needs one OK" · "$300 for the boat trip · Lisbon Trip · Anyone can OK it".

## Staging the story (60 fps; app timings in `MS`)
Numbers: In the Pot $450 → $366 → $66 → closed · You'd get back $150 → $122 → $22 · Maya's Pot dollars (tab bar)
$0.00 → $84.00 → $384.00 → $406.00 · Leo's $0.00 → $22.00 (`GETS_BACK`, `POT_DOLLARS`).
1. **Chat (Night):** unchanged (`ChatScreen`, `shareText()`, the typing dots match-cut with `dotState()`).
2. **Join:** `InviteLanding` (`scrollY` ≈ 300, `googlePress`) → `joinStep` 1 → 2 → 3 → `YoureInSheet` → "Add my
   $150 share" → `AddMoneySheet` (step 2) `ctaPress` → out → `PotScreen pendingIn={150} feed={feedLeoAdding(
   "adding")}` → `feedLeoAdding("added")` (✓ Sent), `balance` 300 → 450, `goalProgress` 0.67 → 1, `Toast`.
3. **$84 instant:** `PotScreen press={{target:"spend", amount}}` → `SpendSheet step="howMuch"` `typed` "" → "8" →
   "84" → `ctaPress` (Next) → `step="details"` `category="groceries"` (`categorySelect`) → `ctaPress` ("Get $84
   back") → `checking` ≥ 72 f → `approved` (`capsuleTint`, `checkPop`, `burstProgress`) → `sending` → `sent`
   (Receipt ↗) → Pot 450 → 366, `feedAfterGroceries(appear)`, `tabBar={{ balance: 84 }}`.
4. **$300, one OK:** `step="howMuch"` "300" → `details` `category="tickets"` `note="the boat trip"` (the decision
   line flips to "This needs one OK from anyone else"; `decisionOpen` shows why) → `submitting` → `oneOkSent` →
   Leo: `LockScreen` (one-OK push) → `pressed` → `PotScreen waiting=[…]` + `ApproveSheet state="ready"` →
   `approvePress` → `approving` ("Sending your OK…") → `approved` (`tickPop`, `statusAppear`) → Pot 366 → 66,
   `feedAfterBoat(appear)` ("✓ One OK"), Maya's tab bar $384.00.
5. **Close:** `CloseSheet mode="propose"` → `waiting` → (Leo) `vote` → `voting` → `closed` (`badgePop`);
   `PotScreen closed={{date: "Nov 3", refund: 22}} feed={feedClosed(appear)}`.
6. **And more:** `TrustRow` (badge pop, `upTo` 100 → 200) + `TrustLevelUp`, `GoalCard` (collecting → reached),
   `PayInCard` (`qrReveal`) + `FeedRow item={payInItem()}`, `SendLinkCard` (`claimed`), `CreateRuleCard`.

## Preview, galleries and fidelity checks
- Galleries (1920 × 1080): `npx remotion still src/ui/preview/index.ts <Id> out/stills/ui/<name>.png --frame=<n>
  --port=3417` (port 3000 is often taken by the app's dev server) with Ids `UiGalleryStory`, `UiGalleryJoin`,
  `UiGallerySpend`, `UiGalleryDecide`, `UiGalleryChat`, `UiGalleryNight`, `UiGalleryPieces`, `UiGalleryMore`,
  `UiGalleryMotion`, `UiGalleryMisc`. The main registry has `UIKit/UiKitGallery`.
- 1:1 comparisons (390 × 844, no safe areas; render with `--scale=3`, diff against `notes/screens/*.png`):
  `CmpDayPot`/`CmpNightPot` (day-pot), `CmpDayPotMore` (day-pot-more), `CmpDayInstant` (day-instant-approval),
  `CmpDaySettings` (settings-day, 390 × 2376 full page), `CmpDayAdd1` (payin-add), `CmpDayAdd2` (add-step2),
  `CmpDaySpend1`/`CmpDaySpend2` (spend-step1/2), `CmpDaySpendOneOk` (trust-spend), `CmpDayApproveOneOk`
  (trust-approve), `CmpDayClose`/`CmpDayCloseApprove`/`CmpDayClosed` (p2-day-close*), `CmpDayInvite`
  (day-invite-landing), `CmpDayAsk` (payin-ask), `CmpDayPayInReady` (payin-ready), `CmpDayPayInFeed`
  (payin-feed), `CmpDayCreateLean` (create-lean), `CmpDayCreateRules` (create-rules, 390 × 1678). Every text row
  and card edge lands within ~1 px of the capture (most within 0.3-0.7 px; Figtree 14-15 px glyphs sit ~0.7 px
  lower than in the app's capture, a font-build difference).

## Notes and deviations
- Icons use Lucide at stroke 2 everywhere (brand rule); the app uses 2.25-3 on a few small checks.
- Compact rows are calibrated to the app's measured 71 px (the arithmetic gives 70; the browser's line boxes add a
  pixel), so the feed lines up 1:1.
- Banned words stay out: the Add sheet's digital-dollar note ("USDC") is off unless `showDollarNote`; the live
  landing's "I have a NEAR wallet" link only with `showWalletLink`. Neither is on any default path.
- The one-OK "approved" sheet keeps the One OK block with "You · gave the OK" (as the app's /demo tour does) rather
  than the real sheet's after-the-fact timeline; the details table says ✓ Paid · "One OK by Leo".
- `voteSent` at $300 is the one-OK result now (truthful to hub 1.1.0). Scenes that want the old "2 of 3" beat pass
  `tier="group"` (Spend), `variant="group"` (Approve), `copyVariant="group"` (push) and `feedBoatPending(1,
  "group")` / `feedAfterBoat(1, "group")`.
- Captures of other Pots (Ski Chalet, Porto Weekend) or with the Pots list behind a sheet only match in the
  sheet's region (the kit has no Pots list screen). The QR codes encode demo text at the real codes' size (33 and
  37 modules), so their pattern differs from a capture's.
- Sheets size to content (max 92 % of the screen): switching steps changes the sheet height at once, as in the app
  (the app also slides the step content; cut on it or cross-fade two sheets).
- Emoji render with the system emoji font (Apple Color Emoji in headless Chrome on macOS).
- The requests badge is `ink` with `surface` numerals (as the app ships it).
