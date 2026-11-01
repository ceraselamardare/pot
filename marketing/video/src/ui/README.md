# Pot UI kit (video)

App-faithful, frame-driven React replicas of Pot's real screens, for staging inside a 3D phone. Every state
change is a **prop**: scenes animate by computing props from `useCurrentFrame()` (no CSS animations inside).
Import everything from `src/ui` (`index.ts`).

Built from `apps/web/components/**`, `apps/web/i18n/en.json` and `app/tokens.css`, and checked pixel-for-pixel
against `notes/screens/*.png` (3× captures of a 390 px layout). Colours come only from `src/brand/tokens.ts`.

```tsx
import { Phone, PotScreen, SpendSheet, FEED_FULL, pressAt } from "../ui";

<Phone theme="day" depth={10}>
  <PotScreen balance={interpolate(f, [0, 30], [450, 366])} yourShare={122} putIn={150} feed={feedAfterGroceries(appear)} />
  <SpendSheet step="approved" amount={84} progress={1} burstProgress={(f - 40) / 36} burstVariant="cinematic" />
</Phone>
```

## Coordinates and themes
- The screen is **390 × 844** logical px (designed size of the app). `Phone` = 414 × 868 (12 px bezel), screen
  radius 55. `SCREEN_RECT` = `{x: 12, y: 12, width: 390, height: 844, radius: 55}` relative to the phone.
- Inside `Phone`, screens respect the safe areas: **50 px** status bar (`SAFE_TOP`), **34 px** home indicator
  (`SAFE_BOTTOM`). Outside a phone (`BareScreen`, `UiPiece`, or no provider) they are 0.
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
- Exact in-screen rects for default states are in `LAYOUT` (`src/ui/layout.ts`, e.g. `LAYOUT.spendSentCapsule`
  = `{x:16, y:604, w:358, h:64}`); `inPhone(rect)` adds the bezel. Re-measure: `node src/ui/preview/measure.mjs`.
- Hide the in-phone original while the twin is up (keeps layout): `PotScreen hideHero`,
  `SpendSheet hideCapsule`, `ApproveSheet hideTimeline`, `CloseSheet hideTable`, `RulesTab hideRule="instant"`,
  `ChatMessage.hidden`.
- Standalone pieces: `RulesCapsule`, `SpendResult`, `ApprovalTimeline`, `RefundTable`, `RuleRow`,
  `LinkPreviewCard`, `OgCard`, `PushNotification`, `RequestCard`, `FeedRow`, `BalanceHero`.

## Presses (the tap language)
- Every pressable takes a **0..1 press**: `Button pressed`, `Keypad pressedKey + press`, `Chip pressed`,
  `PushNotification pressed`, and per-sheet/screen props (`ctaPress`, `donePress`, `approvePress`,
  `declinePress`, `secondaryPress`, `laterPress`, `googlePress`, `emailPress`, `pressedChip + chipPress`,
  `PotScreen press={{target: "add" | "spend", amount}}`, `RequestCard pressed + press`).
- Pressed = primary → `brand-deep`, secondary/ghost/chips → `surface-sunken`, keys → `line`, all at scale 0.97.
- `pressAt(frameSinceTouch, {inFrames: 5, holdFrames: 2, outFrames: 11})` gives the curve (in 4-6 f, out 10-12 f).
- Touch dot: `<TouchDot press={p} x={…} y={…} />` (44 px, eggplant at 18 %, only while pressed; Night uses the
  Night ink) or `Button touchDot`. `TapRipple` (disc + expanding ring) is kept for special moments.

## Components and the props that animate them
Atoms
- `Avatar` (`person`, `size` xs/sm/md/lg, `ring`), `AvatarStack` (`appear[]` per seat pop, `emptySeats`),
  `EmptySeat`, `CoverTile` (`emoji`, `cover` gradient index, `size`, `px`).
- `GoalBar`: `collected`/`goal` (text twin "$300 of $450 collected"), **`progress`** 0..1 for a smooth fill.
- `Button`: `variant` primary/secondary/ghost, `icon` (Lucide), `leading` (e.g. `<GoogleMark/>`), `pressed`,
  `disabled` (the empty-amount style), `dim`, `touchDot`.
- `StatusChip`: `status` sending/sent/approved/needs/declined/expired/failed (+ custom words as children).
- `MoneyText`: **`amount`** (float ok: count-ups), `variant` hero/title/row, `format` fixed/whole, `sign` in/out.
- `Keypad` (`pressedKey`, `press`), `AmountDisplay` (**`typed`** keypad string, `pop`).
- `TypingDots`: `frame` (defaults to the current frame; the brand loop 0.35 → 1, 1200 ms, 150 ms stagger,
  2 px rise), `still`, `size`, `color`. `dotState(ms, i)` exposes the curve for match-cuts.
- `Celebration`: **`progress`** 0..1 over 600 ms (36 f), `variant` "app" (exact; fades within ~150 ms) or
  "cinematic" (holds, then fades), `distance`/`size` multipliers. 12 particles, `brand` + every 4th `brand-deep`.
- `Chip` (`selected` 0..1, `pressed`, `pill`), `Segmented` (`index`, fractional slides), `Tabs` (`active` or
  fractional **`index`** 0..2).
- `TabBar`: `active`, `badge`, `badgeAppear`.
- `ActivityFeed`: `groups` = `{label, items[], appear?}`; each item `appear` 0..1 (height grows, then fades in,
  6 px drop). Kinds: `contribution`, `adding` ("Adding $150…" + Sending…), `joined`, `created`, `instant`
  (brand-soft row), `pending`, `approved`, `closeRequested`, `closed`. Ready-made feeds in `fixtures.ts`.
- `ApprovalTimeline` (`rows` with per-row **`pop`**, `k`) + `timelineRows({asker, approved, waiting, me})`.
- `RefundTable` (`rows`, `me`, `caption`, **`backShown[]`** per-row count-up), `RuleRow` (`highlight`,
  `meter`), `ProgressSteps` (`steps[].state`, `pop`), `RequestCard` (`pressed`, `press`).
- `RulesCapsule` (`state` checking/approved, **`tint`**, **`checkPop`**, **`burstProgress`**, `still`),
  `SpendResult` (+ `statusAppear`).
- `Toast` (`text`, `progress`), `Appear` (generic insert), `Caret` (`frame`, `blink`), `GoogleMark`.

Screens
- `PotScreen`: **`balance`**, `yourShare`, `putIn`, `collected`, `goal`, **`goalProgress`**, `pendingIn`
  ("+$150 on the way"), `activeTab` / **`tabIndex`**, `feed`, `waiting` (RequestCards with `appear`),
  `memberLines`/`memberTotals` (Members tab), `rules` (RulesTab props: `highlight`, `appear`, `hideRule`),
  `showDemoBanner` (false), `tabBar` ({active, badge, badgeAppear} or false), **`scrollY`**, `press`,
  `closed` ({date, refund}), `hideHero`, `children` (overlays).
- `InviteLanding`: `members`, `emptySeats`, `balance`, `goalProgress`, **`scrollY`** (the CTA is below the
  fold: ~300 shows it), **`joinStep`** 0..3 (buttons → "Welcome, Leo" + progress), `googlePress`,
  `emailPress`, `seatAppear`, `dotsFrame`.
- `ChatScreen` (generic messenger, Day/Night): `messages[]` = `{id, from: Person | "me", kind: text/typing/link,
  text, time, read, link, appear, hidden, dotsFrame}`, `scrollY`, `dayLabel`, `composerText`, `composerCaret`.
  `shareText()` = the app's share message. Outgoing bubbles are brand-soft; incoming surface with member-colour
  avatars (names in member colours in Night).
- `PushNotification`: `title` "Maya needs your OK", `body` "$300 for the boat trip · Lisbon Trip", `appName`
  "Pot", `time` "now", **`progress`** (slide down), **`pressed`**, `variant` banner/lock.
- `LockScreen`: `time` "9:41", `date` "Thursday, October 22", `wallpaper` (member-3 → member-5 → member-4),
  `notifications[]` (PushProps with `progress`).
- `OgCard` (`width`: the 1200 × 630 invite image laid out in DOM at any size), `LinkPreviewCard`.

Sheets (all share `SheetProps`: **`progress`** 0..1 = time through the 360 ms enter (slides with ease-enter,
scrim fades with ease-standard), `exiting` (280 ms ease-exit when animating 1 → 0), `raw` (spring values),
**`footerAppear`**, `bodyScroll`, `scrim`)
- `SpendSheet` **`step`**: `amount` / `vote` (form: `typed`, `category`, `categorySelect`, `pressedChip`,
  `chipPress`, `chipsScrollX`, `note`, `pressedKey`, `keyPress`, `ctaPress`, `amountPop`; the RulePreview and
  CTA follow the typed amount), `checking` (`dotsFrame`), `approved` (`capsuleTint`, `checkPop`,
  `burstProgress`, `burstVariant`, `burstDistance`, `burstSize`), `sending`, `sent` (`statusAppear`,
  `donePress`), `voteSent` (`timeline`). The brief's "approved + $84 sent to you + Done" frame is step `sent`.
- `ApproveSheet` **`state`** ready / approving (button "Approving…", your tick pops: `tickPop`) / approved
  ("Approved! $300 is on its way to Maya.": `statusAppear`, [Done]). Props: `asker`, `me` (Leo), `others`,
  `amount`, `reason`, `balanceAfter`, `approvePress`, `declinePress`, `donePress`, `hideTimeline`.
- `CloseSheet` **`mode`** propose / waiting / vote / closed; `me`, `proposer`, `rows` (default everyone $150 →
  $22), `backShown`, `badgePop` (closed check), `ctaPress`, `secondaryPress`, `hideTable`.
- `AddMoneySheet`: `typed` ("150"), `balance`/`collected`/`goal` (for "…will have $450.00. Goal reached."),
  `source`, `pressedKey`, `keyPress`, `ctaPress`, `pressedChip`, `chipPress`.
- `CreatePotSheet` **`step`** 1 (name: **`typedChars`** + caret, `emoji`, `emojiSelect`, `cover`) / 2 (Trip
  preset, `goalOn`) / 3 (creating: `created`, `dotsFrame`); `ctaPress`.
- `YoureInSheet`: `members`, `seatAppear`, `suggested`, `ctaPress`, `laterPress`.

## Copy used (all from en.json, `copy.ts`)
- Pot: "In the Pot" · "Your share $150 · You put in $150" · "$450 of $450 collected" · [+ Add money] [↗ Spend] ·
  Activity / Members / Rules · "Leo added $150" "23h ago" "+ $150.00" · "Leo joined" · "Maya got $84 back for
  groceries" "✓ Approved by Pot rules" "Under the $100 instant limit" "− $84.00" · "Maya asks for $300 for the
  boat trip" "1 of 2 approvals" "Expires in 7 days" · "$300 sent to Maya for the boat trip" "Approved by Maya and
  Leo" · "Pot closed Everyone got their share back." · tab bar Pots / Requests / You · demo banner "Demo · test
  money on NEAR testnet" (off by default).
- Rules: "How Lisbon Trip works" · "Trip rules" · "Anyone can spend up to $100 without asking." · "Bigger spends
  need 2 of 3 approvals." · "Each person can spend up to $200 in total without asking." "You've used $0 of it." ·
  "Instant payments only go to members." · "Requests expire after 7 days."
- Spend: "Spend from Lisbon Trip" · Reimburse me / Pay a member · "How much?" · "This will be approved instantly ·
  Anyone can spend up to $100 without asking." · "This needs 2 of 3 approvals · It's over the $100 instant
  limit." · "What's it for?" Groceries 🛒 Food 🍝 Transport 🚕 Stay 🏠 Tickets 🎟️ Other · "+ Add a note
  (optional)" · CTAs "Enter an amount" / "Get $84 back" / "Ask the group" · "Checking Pot rules…" · "Approved by
  Pot rules" · "Sending $84 to you…" / "$84 sent to you" (Sending… / Sent chips) · "Sent to the group · Needs 2
  of 3 approvals. We'll tell you when it's decided." · "Approvals · 1 of 2" · "Maya · asked, approval counted" ·
  "Sam · hasn't decided" · "You · waiting for you" · [Done].
- Approve: "Maya asks for $300" · "Lisbon Trip · 2 min ago" · "For the boat trip" · "Needs approval because it's
  over the $100 instant limit." · "Pot after this $66.00" · "Expires in 7 days" · [Approve $300] [Decline] ·
  "Approving…" · "Approved! $300 is on its way to Maya."
- Close: "Close Lisbon Trip?" · "Everyone gets back their share of what's left. The group needs to approve." ·
  "$66.00 left · split by how much each person put in" · "Who gets what back" Person / Put in / Gets back ·
  "Maya (you)" · Total · "Adding money and spending pause while the group decides." · [Ask the group to close]
  [Keep the Pot open] · "Maya wants to close Lisbon Trip" "You'd get back $22.00" [Approve closing] [Say no] ·
  "Sent to the group. Your approval is counted. It needs 1 more." · "Pot closed" · "$22.00 is in your Pot
  account." · "It stays in your Pot dollars, ready for your next Pot. Taking money out of Pot isn't available
  yet." · "Who got what back".
- Invite/join: "Maya invited you to Lisbon Trip" · "Maya and Sam are in" · "Everyone's chipping in $150" · "No one
  can take money out alone. Small spends follow the Pot's rules; bigger ones need the group." · "Up to $100
  without asking · bigger spends need most of the group" · "This invite works until Oct 29." · [Join with Google]
  [Continue with email] [More ways to join] · "Welcome, Leo" · "Setting up your Pot account…" · "Joining Lisbon
  Trip…" · "You're in" · "Usually under 10 seconds" · "You're in!" · "Welcome to Lisbon Trip. Everyone's
  chipping in $150." · [Add my $150 share] [Not now].
- Add money: "Add money to Lisbon Trip" · "Amount in dollars" · "Your share $150" $50 $100 · "From" · "Demo
  dollars (test money)" [Test] · "Pot dollars you have · $0.00" · "Another app or exchange" · "Lisbon Trip will
  have $450.00. Goal reached." · [Add $150] · then on the Pot: "Adding $150…" + "Sending…", "+$150 on the way",
  toast "Added. Lisbon Trip now has $450.00."
- Create: "Name your Pot" · "Step 1 of 2" · "Just you so far" · "This is what friends see in the chat." · "Pot
  name" "11/40" · "Pick an emoji" · "Pick a colour" · [Next] · "How should it work?" · Trip: "Up to $100 without
  asking" / "Bigger spends need most of the group" / "Leftovers back at the end" · Club / Team "Coming soon" ·
  "Everyone chips in (optional)" "$150 each" · [Create Pot] [Back] · "Creating Lisbon Trip…" "Free: we cover the
  setup." "Ready to share".
- Push / OG: "Pot" "now" "Maya needs your OK" "$300 for the boat trip · Lisbon Trip" · OG "Lisbon Trip" "3 friends
  are in" · share message "Join our Lisbon Trip Pot so we can chip in together".

## Staging the story (60 fps; app timings in `MS`)
1. **Chat (Night):** `<Phone theme="night"><ChatScreen messages=[…, {kind:"link", from: MAYA, text: shareText(),
   link:{members:[MAYA,SAM]}, appear}, {kind:"typing", from: LEO, appear}] /></Phone>`. The typing bubble's dots
   use the brand loop: match-cut them to the logo with `dotState()`.
2. **Join:** `InviteLanding` (`scrollY` ≈ 300 to bring the CTA up, `googlePress`) → `joinStep` 1 → 2 → 3 (≈ 0.6 s
   each) → `YoureInSheet progress` (22 f) → press "Add my $150 share" → `AddMoneySheet progress` → `ctaPress` →
   sheet out (`exiting`) → `PotScreen pendingIn={150} feed={feedLeoAdding("adding", appear)}` → then
   `feedLeoAdding("added")`, `balance` 300 → 450 over 30 f, `goalProgress` 0.67 → 1, `Toast progress`.
3. **$84 instant:** `PotScreen press={{target:"spend", amount: pressAt(f)}}` → `SpendSheet step="amount"
   typed` "" → "8" → "84" (`pressedKey` + `pressAt`), `category="groceries"` with `categorySelect`, `ctaPress` →
   `step="checking"` ≥ 72 f (1.2 s) → `step="approved"` with `capsuleTint` 0 → 1 over 12 f, `checkPop` over 19 f,
   `burstProgress` over 36 f (`burstVariant="cinematic"` reads better on video) → `step="sending"`
   (`footerAppear`) → `step="sent"` → Pot `balance` 450 → 366 over 30 f, `feedAfterGroceries(appear)`.
4. **$300 vote:** `SpendSheet step="vote"` (`typed` 300, `category="tickets"`, `note="the boat trip"`) →
   `step="voteSent"` → Leo: `<Phone><LockScreen notifications=[{id, progress}] /></Phone>` (or a banner
   `PushNotification` over any screen) → `pressed` → `PotScreen waiting=[…]` + `ApproveSheet state="ready"` →
   `approvePress` → `state="approving"` (`tickPop`) → `state="approved"` (`statusAppear`) → Pot `balance` 366 →
   66, `feedAfterBoat(appear)`.
5. **Close:** `CloseSheet mode="propose"` → `ctaPress` → `mode="waiting"` → (Leo) `mode="vote"` → `mode="closed"`
   with `badgePop`; `PotScreen closed={{date:"Oct 22", refund: 22}} feed={feedClosed(appear)}`.

## Preview, galleries and fidelity checks
- Galleries (1920 × 1080): `npx remotion still src/ui/preview/index.ts <Id> out/stills/ui/<name>.png --frame=<n>`
  with Ids `UiGalleryStory`, `UiGalleryJoin`, `UiGallerySpend`, `UiGalleryDecide`, `UiGalleryChat`,
  `UiGalleryNight`, `UiGalleryPieces`, `UiGalleryMotion`. The main registry has `UIKit/UiKitGallery`.
- 1:1 comparisons (390 × 844, demo banner on, no safe areas): `CmpDayPot`, `CmpNightPot`, `CmpDayInstant`,
  `CmpNightInstant`, `CmpDayRules`, `CmpDayClose`, `CmpNightClose`, `CmpDayCloseApprove`, `CmpDayClosed`,
  `CmpNightClosed`, `CmpDayInvite`, `CmpNightInvite`, `CmpDayLivePot`. Render with `--scale=3` and diff against
  `notes/screens/*.png`; layout matches within ~1 px (Figtree glyphs sit ~0.7 px lower than in the app's capture,
  a font-build difference).

## Notes and deviations
- Icons use Lucide at stroke 2 everywhere (brand rule); the app uses 2.25-3 on a few small checks, so those
  read slightly thinner.
- The burst comes from the "Approved by Pot rules" capsule's centre, as in the app (not the Done button).
- The Approve sheet's secondary button is the app's "Decline" ("Say no" is the Close sheet's word).
- Create is the app's 2-step flow (name + emoji, then Trip rules + [Create Pot]).
- Add money: the real sheet closes on submit; "Adding $150…" → "Added." happens on the Pot screen and a toast.
- Sheets size to content (max 92 % of the screen), so switching Spend from the form to the result shrinks the
  sheet at once, as in the app: cut on it, or cross-fade two `SpendSheet`s.
- Emoji render with the system emoji font (Apple Color Emoji in headless Chrome on macOS); the app's OG image uses
  Twemoji.
- The requests badge is `ink` with `surface` numerals (as the app ships it).
