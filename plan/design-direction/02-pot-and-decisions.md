# Design direction 02: the Pot screen and group decisions

1. **One marigold button per screen, placed where the money decision is made:** [Add money] on the Pot, and the CTA inside each sheet. Lists and feeds use secondary buttons, so an inline Approve never becomes a second marigold.
2. **Status is always an icon, a word and a state colour** (Lucide check, clock or x on a `surface-sunken` pill, never the 8 px dot or colour alone). Money that never moved is struck through *and* says "Not sent".
3. **The rule is visible before, during and after the tap:** a neutral RulePreview sentence under the amount, the pot-bubble's typing dots for "Checking Pot rules", the product's only celebration (a 600 ms marigold burst) for "Approved by Pot rules", and a receipt that names the rule.
4. **Every group decision reads as one timeline:** who asked, approvals so far, who's left, then expired or decided, with names and reasons. The same timeline appears in the Approve sheet, the receipt, Requests and the close request.
5. **Calm and never blank:** cached numbers stay on screen under an offline or service banner, skeletons appear only after 150 ms, toasts sit at the top, and every error says what happened, whether money moved, and what to do.

> **For:** Cerasela (P2, design lead). **Written:** 2026-10-21 by the design-reference researcher. Planning only, no product code.
> **Inputs:**
> - The brand system (README, tokens.json) and Cerasela's In-context and Colour-type mockups.
> - [ux-spec.md](../ux-spec.md) (states, copy keys), [decisions.md](../decisions.md) Rev 5 (binding) and [frontend-architecture.md](../frontend-architecture.md) (routes, state machines).
> - 16 Mobbin searches run on 2026-10-21: 15 on iOS and 1 on web, for the desktop layout. I examined every reference image. The live apps may have changed since they were captured.
>
> **Not repeated here:** [kb/ux-research.md](../../kb/ux-research.md) and [kb/competitors-ux-patterns.md](../../kb/competitors-ux-patterns.md) already cover these references:
> - Splitwise [balances](https://mobbin.com/flows/d12d2ff4-5576-4a34-ae8c-9ace8b28ecac) and [group detail](https://mobbin.com/screens/9f36de33-ee48-426a-b3df-65cba508f5b2); Revolut's [group-bill chat](https://mobbin.com/screens/61d50a5b-ccad-4936-9b7d-1a380171de8b) and [members](https://mobbin.com/screens/9cefa3b7-4c45-4770-ae2f-9d45f86f4dd4); [Wanderlog](https://mobbin.com/flows/c4eaeff5-4e7e-4a85-8e5c-e5fdacf81884); [Buddy's settle-up math](https://mobbin.com/flows/9a6f51d4-b8c6-4863-889c-c55c418a19c5).
> - Airwallex's [request detail](https://mobbin.com/screens/94e0c040-22b2-4151-b2a9-029c5b2fcd54); Monzo's [pay-a-request](https://mobbin.com/flows/13477666-9c0a-4ce8-92a4-215eec896c78); bunq's [approving flow](https://mobbin.com/flows/dc1f3c4a-a261-4d22-a8dc-4cc31cbc296f).
> - [Cash App](https://mobbin.com/flows/b65be81e-03ff-4275-9334-83aa5c0cde6a) and [PayPal](https://mobbin.com/flows/8eb3e694-ad23-4997-bcf8-e8af208428ff) pool creation; [Grab](https://mobbin.com/screens/2fd1cc96-aa61-42e0-bfd2-5d19cddf5178) and [Gojek](https://mobbin.com/screens/23267089-18b8-4654-8c21-3da243b49dd2) activity.
>
> This file adds new references and turns them into blueprints.
>
> **Demo (D-61):** Lisbon trip, with Maya (creator, `member-1`), Sam (`member-2`) and Leo (`member-3`). The Pot holds $450.
> 1. Maya's $84 groceries are approved instantly, leaving $366.
> 2. Maya asks for $300 for the boat. It needs 2 of 3 approvals. Her own approval counts automatically, so Leo's approval completes it, leaving $66.
> 3. Closing returns $22.00 to each person.
>
> The blueprints show Leo's view unless they say otherwise.
>
> **Notation:**
> - `token` is a brand token. Type styles use the brand's names: `balance-hero`, `title`, `heading`, `body`, `body-sm`, `label`, `amount`.
> - `copy.key` is a ux-spec §5 key. ⓟ marks a key this file proposes.
> - Contrast ratios were computed for this file with the WCAG 2.x formula.

## Shared parts used below

| Part | Spec | Source |
|---|---|---|
| Primary button | `brand` fill with an `on-brand` label (`label`, or 16/700 as in the mockups), 52 px tall, `radius-md`. In Day it has a 1 px `brand-deep` border; pressed, it turns `brand-deep`. One per screen, or none. | Brand README |
| Secondary button | `surface` fill, 1 px `line-strong` border, `ink` label, 48-52 px. Every inline decision in a list uses this style. | Inline decisions are outlined in [Revolut Business](https://mobbin.com/screens/90b1a976-e401-48bd-aec3-570e31be5633), [Remote](https://mobbin.com/screens/6f7ddbc3-3a49-492b-8de8-5f7c791cdf28) and [X](https://mobbin.com/screens/b9d47aae-5407-4bc1-b76f-56198d875dc0) |
| Text button | `link` colour, `label`, with a 44 px hit area | Brand README |
| StatusChip | `radius-pill` pill on `surface-sunken`, with a 16 px Lucide icon and a word.<br>• `approved` + check: "Approved" or "Sent"<br>• `waiting` + clock: "1 of 2 approvals"<br>• `declined` + x: "Not approved"<br>• Expired: `ink-muted` + hourglass, "Expired"<br>• Sending: `ink-muted` + send, "Sending…"<br>All pass 4.5:1 on `surface-sunken` (Day `approved` 4.57, `declined` 4.71). | Brand state table; the Colour-type mockup's dots are replaced by icons |
| ApprovalTimeline | A vertical list with a 24 px icon column:<br>• Done: a filled `approved` check.<br>• Not yet: a hollow 2 px `line-strong` circle.<br>• Declined: a filled `declined` x.<br>Each row has a 24 px avatar and a `body-sm` sentence such as "Maya asked · approval counted · 2:04 PM". The header is a `label` such as "Approvals · 1 of 2". | [Revolut Business](https://mobbin.com/screens/9a34e3c2-65fa-49e0-9a6f-5833c749d333), [Brex](https://mobbin.com/screens/ecf850cc-08cc-46ef-b321-8248107afc9e), [Wise](https://mobbin.com/flows/b821a14c-a4be-49e8-b7cc-2d491badb3e0), [Remote](https://mobbin.com/screens/7e183a3e-ce8f-4dbb-b91e-0efc2cbe6833) |
| MoneyText | Hero and sheet amounts use Gabarito `balance-hero`; rows use Figtree `amount`.<br>Always set `font-variant-numeric: tabular-nums`. Both fonts default to proportional figures: in Gabarito the "1" is 365 units wide against 560 with `tnum`. I checked the Google Fonts v9 TTFs: both ship `tnum`.<br>The hero drops ".00" for whole amounts; rows keep two decimals.<br>Money in is "+ $150.00" in `approved`; money out is "- $84.00" in `ink`. | Brand README, ux-spec §1.3 |
| Avatar | Colour `member-1` to `member-6` by join order *in that Pot*, with eggplant initials (≥ 9.2:1). Add a 2 px `surface` ring whenever the avatar sits on a tinted row: `member-1` on `brand-soft` is 1.18:1. | Brand README |
| Sheet | `surface`, `radius-lg` top corners (the mockup's 28 px becomes 24), `shadow-sheet`.<br>• A 40×5 `line-strong` grabber and a visible 44 px ✕ at the top right.<br>• The title is a `heading` and receives focus on open.<br>• Maximum height 92 dvh.<br>• From `bp-md` it becomes a centred dialog in `container-flow` (440 px). | ux-spec §2, D-41 |

---

## Screens

### 1. Pots home (`/pots`, ux-spec §4.3)

- **Job:** show every Pot I'm in, how much each holds and where someone needs my OK, and let me start a new one.
- **References:**

| App | Screen | What to borrow | What to leave |
|---|---|---|---|
| Splitwise | [Groups list](https://mobbin.com/screens/8d4a1f26-0dd5-488c-a257-990a28c15159) | Each row states your position in a sentence under the name. Only the row that needs you gets its own small action ("Settle up"). | The debt framing ("Overall, you owe $180.00"), orange and green as meaning, and three ways to create (header link, outlined button, FAB) |
| Vipps | [Groups](https://mobbin.com/screens/cbf44a7f-4716-4dd7-ab46-c73703593d49) | A gradient cover band per group, which fits D-61's emoji and gradient covers, plus a "Last activity today" line | The status pill printed on the gradient (its contrast varies) and a filled button inside every card |
| bunq | [Home](https://mobbin.com/screens/e69218fc-71c5-46dd-8554-0eb5b73155ad) | "Awaiting Events" pinned above all accounts: one strip across all Pots for "waiting on you" | The dark tile grid, the round Pay/Request/Add buttons and the superscript cents |
| KOHO | [Goals](https://mobbin.com/screens/9cbbefd8-063f-441d-bfc7-40e068552e7a) | Once the list isn't empty, a "+" next to the section title is the way to create | The interest chip ("Earning 2%") |
| Dave | [Goals](https://mobbin.com/screens/6b8b2f25-eaa9-40b3-a409-e98b2d190fed) | A dashed "Create a new Goal" ghost card closes the list; an empty card carries a one-line nudge ("To get started, add some money.") | Illustration thumbnails and APY |
| Cleo AI | [Save](https://mobbin.com/screens/75caba83-f731-4148-9ad4-f25fd5fead74) | "Pending $1.00" gets its own labelled line, separate from the saved amount, like `pot.hero.pending` | A large filled button inside the card, and the setup checklist |
| PayPal | [Closed pool](https://mobbin.com/screens/1e07fa7e-cc79-4e53-8d7d-c871a681e307) | A small "Closed" tag under the name, while the balance and activity stay readable | Photo covers (the MVP uses emoji only) and the organizer-only Transfer button |
| Jomo | [Squads, empty](https://mobbin.com/screens/8efeff17-42b5-4828-8776-7a1c2e462bf3) | The empty state covers both ways in: create a group, or join one with an invite link | A bottom sheet just to choose between two options |

- **Pot version** (390 × 844, Day):
  1. **Header** on `ground`:
     - `title` "Pots" (`pots.title`) on the left.
     - On the right, a 44 px "+" icon button in `ink` with the accessible name "Start a Pot" (`pots.empty.cta`). There is no marigold on this screen once Pots exist.
  2. **Waiting strip.** Shown only when at least one request across all Pots waits on me, as in bunq's Awaiting Events.
     - One 56 px row on `surface`, `radius-md`.
     - Waiting clock and "1 request waiting on you" (the `requests.badge.a11y` text), with a chevron. It opens `/requests`.
  3. **PotCard list** (gap `space-3`). Each card is a single `<a>` on `surface` with `radius-lg`, `shadow-card` and `space-4` padding.
     - Row 1: a 44 px cover tile (`radius-md`, emoji on the Pot's gradient), the name in `heading`, and a 24 px avatar stack (up to 3, then "+2") on the right.
     - Row 2: "$366" in Gabarito `title` 26/30 with tabular figures, then "in the Pot" in `body-sm` `ink-muted` (`pots.card.balance`).
     - Row 3: `pots.card.share` "Your share $122" in `body-sm` `ink-muted`. See open question 3.
     - Row 4 (conditional): either a waiting StatusChip "1 waiting on you" (`pots.card.waiting`), which is the card's only colour, or, for a Pot that hasn't reached its goal, a 6 px goal bar and "$300 of $450".
     - The accessible name reads as one sentence: "Lisbon trip, $366 in the Pot, your share $122, 1 waiting on you".
  4. **"Start a Pot" ghost card** at the end of the list, as in Dave and Monzo's [Pots row with a "Create Pot" tile](https://mobbin.com/flows/78b5cb70-b07e-453f-b297-3ba8c3c1c1f5) (last step). It is 72 px tall with a dashed 1.5 px `line-strong` border, `radius-lg`, a plus icon and an `ink` `label`. It opens `?sheet=create`.
  5. **"Closed (2)" disclosure** at the bottom: a button with `aria-expanded`. Closed cards are `surface-sunken` with no shadow. They show the name, `pots.card.closed` "Closed Nov 12" and ⓟ `pots.card.closed_refund` "You got back $22.00".
  6. **Tab bar** (56 px plus the safe area, on `surface` with a 1 px `line` top border): Pots (active, `ink`, weight 600), Requests and You.
     - The Requests badge has an `ink` fill with `surface` numerals and a minimum width of 18 px. Its accessible name is `requests.badge.a11y`.
- **States:**

  | State | What shows |
  |---|---|
  | **E (empty)** | Centred in the upper half: `pot-glyph-eggplant` at 72 px (the marigold glyph in Night), `heading` `pots.empty.title`, and `body` `pots.empty.body`.<br>In the bottom 40%: the only marigold, [Start a Pot] (`pots.empty.cta`), with `body-sm` ⓟ `pots.empty.join_hint` "Got an invite? Open the link from your group chat." under it. |
  | **L (loading)** | Three PotCard skeletons in `surface-sunken` blocks after 150 ms, with no shimmer. Cached cards show instead when they exist. |
  | **O (creating)** | The new card appears first with a "Creating…" chip. |
  | **X (error)** | `pots.error.load` as a toast at the top. Cached cards stay, with "Updated 5 min ago" (`stale.updated`, ⓟ frontend-architecture §15) under the header. |
  | **OFF (offline)** | Cached cards plus `offline.banner`. |

- **Motion:**
  - Card press: `scale(.98)` over 120 ms.
  - A new card inserts over 280 ms (height and opacity).
  - Reduced motion: opacity only.
  - From `bp-md`, the cards form a two-column grid inside `container-app`.
- **Watch-outs:**
  - **Tab badge colour.** The mockup's tab badge is `declined` red with white text. That's wrong for three reasons:
    - `declined` means "Not approved".
    - A bare count has no icon or word, which the brand requires for state colours.
    - In Night, white on `#ff8a8f` is 2.01:1.

    Use an `ink` fill with `surface` numerals (15.9:1 in Day, 14.5:1 in Night).
  - **"Your share" means two things in the plan.** It's the suggested contribution ("Add my $150 share", `setup.success.cta`) and also the current part of the balance (`floor(balance × mine / total)`, frontend-architecture §3.7), which is $122 after the $84 spend. Leo may read "$122" as what he owes. See open question 3.
  - **No debt framing.** Splitwise's "Overall, you owe" doesn't fit Pot, because nobody owes anyone. The only summary across Pots is "waiting on you".
  - **One way to create.** There's one quiet way per state: "+" in the header, plus a ghost card. Splitwise's three are noise. The ghost card stays `ink`, not marigold.
  - **Cover contrast.** Keep the status pill and the text off the gradient cover, whose contrast is unknown. D-61 allows emoji and gradient covers only.
  - **Tap targets.** The "+" and the "Closed (2)" toggle need 44 × 44 hit areas even with 24 px glyphs.

### 2. Pot screen (`/p/[slug]`, ux-spec §4.4), including the bp-lg two-column variant

- **Job:** answer "how much is in the Pot, and what's needed from me?", then let me add money or spend in one tap.
- **References:**

| App | Screen | What to borrow | What to leave |
|---|---|---|---|
| Vivid | [Pocket](https://mobbin.com/screens/1b198e58-e96e-42a3-a6d3-025fec1e0998) | An equal-width pair right under the balance: tonal "Withdraw" next to filled "Add money". This maps to [Spend] secondary and [Add money] marigold. | The 3D hero art, interest and "Boost" upsells |
| Satispay | [Pocket](https://mobbin.com/screens/cf4f34a5-6f0d-4367-b73d-e27401b09a39) | A goal card that says it in words and numbers ("0% of goal · 0 € / 50 €") | The orange-red primary with a share icon squeezed beside it |
| Monzo | [Holiday pot](https://mobbin.com/screens/73b9defd-18ee-438d-b797-166fd1c2fe65) | A goal line with the deadline in words ("Goal · 20% of £100", "1 month left · 31 Jul 2026") | Scheduled deposits, interest and round-ups |
| PayPal | [Activity](https://mobbin.com/screens/5969e566-58ee-4417-bedc-be826d2a427a) | A "Pending" card above "Completed", a clock badge on the avatar, one small inline action, and month headers | Search, filter chips and the promo card |
| Chime | [Group history](https://mobbin.com/screens/f43cc47c-879d-4fa7-8111-0a66b0d8f6e0) | System events ("'Ramen noodles' settled Feb 24. Details") as centred, quiet lines between money rows | Deleted expenses (Pot has no delete) |
| Up | [Chat with a request](https://mobbin.com/screens/577efe4e-33c4-4b82-8507-167189aaed5f) | A pending "Requested" bubble with its action chip right under it: the feed as a conversation, which suits the pot-bubble mark | GIFs and the full-width coral Request/Pay bar |
| Mercury (web) | [Transactions](https://mobbin.com/screens/2a9877cf-2b59-42c1-b143-ae4ee6e27841) | At bp-lg: a "Money in / Money out" strip above the list, "Pending" and "Failed" tags next to names, and details that open in a right-hand panel | Table chrome, GL codes and comments |
| Airwallex (web) | [Spend requests](https://mobbin.com/screens/20e4926b-889e-4213-bba8-ff45219c0176) | At bp-lg: a "Pending your approval · 1" summary card that heads the side column | Filters, tables and the sidebar nav |
| Deel (web) | [Action required](https://mobbin.com/screens/b6d82ee0-8694-4f55-a1d5-9f0964c8b13c) | Nothing | Icon-only ✓ and ✕ on every row, and "Approve all your pending (71)": no review, and no amount in the button's name |

- **Pot version** (390 px, Leo's view after the $84 spend, with Maya's $300 request waiting):
  1. **Header** on `ground` (no fixed coloured bar, frontend-architecture §8.3):
     - A 44 px back chevron, only when the screen was entered from Pots.
     - A 32 px cover tile and the H1 "Lisbon trip" in `title`.
     - A 30 px avatar stack with a 2 px `ground` ring: M is `member-1`, S is `member-2`, L is `member-3`.
     - A 44 px "•••" menu with three items: Share invite; Close Pot, with the subtitle ⓟ `close.menu.sub` (see §7); and Advanced: View on Trezu, for mainnet Pots only (D-52).
  2. **BalanceHero card** on `surface`, `radius-lg`, `shadow-card`, with `space-4` padding (`space-6` from 768 px):
     - "In the Pot" (`pot.hero.label`) in `body-sm` `ink-muted`. The mockup uses 13 px; use 14.
     - "$366" in `balance-hero` with tabular figures (36 px below 360 px wide). ux-spec §1.3 drops ".00" for whole amounts; the mockup shows "$366.00".
     - `pot.hero.share` "Your share $122 · You put in $150" in `body-sm` `ink-muted`.
     - A conditional pending line, as in [Cleo](https://mobbin.com/screens/75caba83-f731-4148-9ad4-f25fd5fead74): a clock icon in `ink-muted` and `pot.hero.pending` "+$150 on the way". It is never added to the big number.
     - The GoalBar: 10 px, `radius-pill`, a `brand` fill on a `brand-soft` track. In Day, the fill gets a 1 px `brand-deep` end-cap (see watch-outs). Under it, `pot.goal` "$450 of $450 collected" in `body-sm`. With no goal, the bar and line are hidden.
     - A button row (gap `space-2`): [Add money] primary (`pot.cta.add`) and [Spend] secondary (`pot.cta.spend`), equal widths, 52 px tall (the mockup's are 46 px).
  3. **SegmentedTabs**, a 44 px `tablist`: Activity · Members · Rules (`pot.tabs.*`).
     - The track is `surface-sunken` with `radius-pill`. The selected tab is `surface` with an `ink` `label`.
     - The indicator slides over 280 ms. `?tab=` updates with `replaceState`.
  4. **Waiting on you** (`pot.waiting.header`, `heading`), shown only when something waits on me. Each RequestCard sits on `surface`, `radius-md`, with `space-3` padding:
     - A 32 px avatar (Maya, `member-1`), the `body` line "Maya asks for $300 for the boat" (`feed.pending`), and "$300.00" in `amount` on the right.
     - A sub-line with a waiting StatusChip "1 of 2 approvals" and "Expires in 7 days" in `body-sm` `ink-muted` (`approve.expires`, as in [Retro](https://mobbin.com/screens/492b60e4-e3de-4183-ab3b-2b600aa0f5b5)).
     - Two 48 px buttons: [✓ Approve $300] secondary and [Decline] secondary. There's no marigold here; see watch-outs.
     - With the device key, which needs no popup, tapping Approve flips the card to `approve.undo` "Approved · Undo" for 4 s:
       - [Undo] is a 44 px text button, and a 4 s hairline drains under the card.
       - After 4 s, `chip.sending` shows, then `approve.optimistic` "Approved. 2 of 2.", and the item moves into the feed as `feed.approved`.
     - When a popup is needed, the card shows a single [Review] secondary button that opens the Approve sheet (ux-spec 6.4 B).
  5. **ActivityFeed**: a `<ul>` with day headings in `label` `ink-muted` ("Today", ⓟ `feed.day.today`).
     - **Money rows** on `surface` with `radius-md`: a 32 px avatar, a main line in `body` `ink`, a sub-line in `body-sm` `ink-muted`, and an `amount` on the right.
     - **Instant spend:** the row's fill is `brand-soft`. Main line: `feed.instant` "Maya got $84.00 back for groceries". Sub-line: a check icon in `approved` and "Approved by Pot rules · under the $100 limit" in `ink` text. The amount is "- $84.00" in `ink`. Tapping the sub-line opens the rule (ux-spec principle 5).
     - **Money in:** `feed.contribution` "Leo added $150.00", with "+ $150.00" in `approved`.
     - **Approved by vote:** `feed.approved` "$300 sent to Maya for the boat", with the sub-line "Approved by Sam and Leo".
     - **Declined or expired:** `feed.declined` or `feed.expired`. The amount is struck through, with the StatusChip "Not approved" or "Expired", as in Revolut's [declined top-up](https://mobbin.com/screens/95dc85c9-8a4c-47a8-b765-74b8ba18b04f).
     - **Failed:** `feed.failed`, with an [Add money] text button.
     - **System events** (joined, rule changed, close requested, closed): a centred `body-sm` `ink-muted` line with a small icon and no card, as in Chime. This keeps the money rows easy to scan.
     - Tapping any money row opens the receipt (§4).
- **States:**

  | State | What shows |
  |---|---|
  | **E, creator** | Instead of the feed, an empty card like [Splitwise's "You're the only one here!"](https://mobbin.com/screens/7cdc0bfd-0fd8-4e34-8208-1761834fdfde): three static 8 px typing dots in `ink-muted`, `pot.feed.empty.title`, `pot.feed.empty.body` and [Invite friends] secondary. Add money is already in the hero, so ux-spec's second button [Add your share] is dropped. |
  | **E, member** | `pot.feed.empty.member` "Be the first to add money." over a faint ghost feed row, as in [Insight Timer](https://mobbin.com/screens/dc623371-156f-4cf6-aff3-7fce3e4bf67c) (§8). |
  | **L** | A hero skeleton (one 44 px bar and one 16 px bar) and 5 row skeletons after 150 ms. Cached data first. |
  | **O** | The new row appears first with `chip.sending`, plus the hero's pending line. |
  | **S** | The chip changes to "Sent ✓" for 2 s. The hero counts up over 500 ms; tabular figures keep its width steady. |
  | **X** | The row fades out over 200 ms, and a toast with Details appears at the top. |
  | **OFF / RLY** | A top banner on `surface-sunken` with an info icon (`offline.banner` / `relayer.down.banner`). Add money and Spend stay visible but are `aria-disabled`; tapping explains (`add.offline`, `spend.offline`). |
  | **EXP** | The RequestCard becomes the Expired row, computed on the client. |
  | **Closing** | D-09: the hub blocks money in and spends. A waiting card replaces "Waiting on you": a clock, `pot.closing` "This Pot is closing. Adding money and spending are paused." (ⓟ frontend-architecture §15), "Needs 2 approvals · 1 so far", and [Review]. Add money and Spend are `aria-disabled`. |
  | **Closed** | Read-only. The hero shows `pot.closed.hero` "Closed Nov 12" and $0. The button row becomes a summary card, as in [Cash App's closed pool](https://mobbin.com/flows/ba668050-9892-48ef-9f0b-49427ef42bdd): an approved check, `close.done.feed` and "You got back $22.00". The feed ends with `feed.closed`. |
  | **Not a member / not found** | A full-screen state with the eggplant glyph: `pot.not_member.*` or `pot.not_found.*`. |

- **Motion:**
  - Hero number roll: 500 ms.
  - Feed insert and segment indicator: 280 ms.
  - Inline-approve flip: a 200 ms cross-fade.
  - Reduced motion: numbers swap instantly and everything else uses opacity only.
- **bp-lg** (≥ 1024 px, `container-app` 1080):
  - **Top bar:** replaces the bottom tabs. It is 64 px tall, with the lockup on the left and "Pots · Requests (badge) · You".
  - **Left column (≈ 640 px):**
    - The header, then the BalanceHero. Its buttons stay 52 px tall, with auto width of at least 160 px.
    - SegmentedTabs reduced to Activity · Rules.
    - The feed.
  - **Right column (≈ 392 px, sticky 24 px from the top):**
    - "Waiting on you" headed by a summary line, as in Airwallex web, with this Pot's RequestCards.
    - "Your requests" in this Pot, showing status only.
    - Members in compact form: avatar, name, then "Put in $150 · Gets back $22.00", plus [Invite friends] secondary.
    - Optionally, a strip like Mercury's: "Put in $450 · Spent $384 · Left $66".
  - **Sheets:** centred 440 px dialogs, as already from `bp-md`. The receipt may later open as a right-hand panel, as in Mercury (Phase 2, optional).
  - **Keyboard:** arrow keys move between tabs; Esc closes dialogs; focus returns to the trigger.
  - **bp-md (768-1023 px):** a single centred column with the bottom tabs kept and the gutter at `space-6`.
- **Watch-outs:**
  - **Two marigold buttons in the mockup.** Cerasela's In-context mockup shows Add money and the inline Approve both in marigold on one screen. My recommendation: the inline Approve is secondary, and the marigold Approve lives in the Approve sheet. See open question 1.
  - **Undersized buttons in the mockup.** The hero buttons are 46 px and the inline Approve/Decline about 40 px: under `tap-min` (44) and ux-spec's 48 for RequestCard buttons. Use 52 and 48.
  - **"Bottom 40%" rule.** The brand puts primary actions in the bottom 40% of the screen, but ux-spec 4.4 and the mockup put them under the hero, in the top 40%. Either treat the Pot screen as an exception (the actions sit next to the number they change, as in Vivid and Satispay), or add a sticky [Add money] [Spend] bar when the hero scrolls away. See open question 2.
  - **GoalBar contrast.** In Day, `brand` on `brand-soft` is 1.47:1 (Night: 6.11:1). The text twin carries the meaning, so the bar is decorative under 1.4.11. Still, the 1 px `brand-deep` end-cap (3.01:1 on the track) makes progress readable for low-vision users.
  - **Instant-row contrast.** In Day, `approved` on `brand-soft` is 4.35:1, which fails 4.5:1 at 14 px. On the instant row, colour only the check icon and keep the words in `ink` (13.06:1). Maya's `member-1` avatar on that row is 1.18:1, so give it the 2 px `surface` ring.
  - **Mockup data contradicts D-61.** The mockup shows "$450 of $900", "Leo wants $400 for the boat", "1 of 3 approved", a fourth member Ana, and Leo in `member-2`'s mint. It should show $450 of $450, Maya asking for $300, "1 of 2 approvals", three members, and Leo as `member-3`.
  - **Text below the type scale.** The mockups use 12-13 px text (feed meta, hero label, tab labels), smaller than `body-sm` 14/20. See open question 9.
  - **Avatar colour rule conflict.** The brand says join order; frontend-architecture §7.5 picks the tint by hash. Join order from `get_members` is deterministic and has no collisions up to 6 members.
  - **No bulk or icon-only approvals.** Never Deel's bulk approve or icon-only ✓/✕, not even at bp-lg (WCAG 3.3.4, 2.5.3).

### 3. Spend sheet (`/p/[slug]?sheet=spend`, ux-spec §4.9)

- **Job:** get money back or pay a member in about 5 taps, knowing before the tap whether the rules approve it or the group decides.
- **References:**

| App | Screen | What to borrow | What to leave |
|---|---|---|---|
| Wealthsimple | [Deposit amount](https://mobbin.com/screens/51ca11a2-d4ea-402d-a111-0b38322a87ea) | A neutral rounded box between the amount and the keypad that states the instant limit as a sentence ("You can deposit up to $3,500.00 instantly. ⓘ"). This is the model for RulePreview. | Borderless keys: Pot keeps `surface-sunken` keys so the targets are visible |
| Chime | [Check amount](https://mobbin.com/screens/277fdefb-e130-42ba-ada1-c2779194ea2c) | The limit sits under the amount before typing ("$10,000 limit ⓘ"). The blocked state pairs an icon, a sentence and what's available ("Checking balance: $0.00"). | A red error sentence |
| Stake | [Add to balance](https://mobbin.com/screens/542ff421-78fa-4043-895d-fc64ffff5c14) | The order: amount, message panel, quick chips, keypad | A pink error panel for an ordinary minimum |
| Revolut Business | [Reimbursement details](https://mobbin.com/screens/0535430d-d0d6-422a-a01e-2e82cff93139) | The CTA sits directly above a custom keypad, so the OS keyboard never covers it | Calculator operators, and merchant and date fields |
| Setel | [Sending money flow](https://mobbin.com/flows/aa2d71c3-0488-4e32-ae7e-2a064ab82ca9) | Reason chips right under the amount ("Transfer · #DahSetel · Meals") and a limit line just above the CTA ("Transfer up to RM1.00") | The passcode step, and the rating slider and cross-sell on the success card |
| Tripsy | [New expense](https://mobbin.com/screens/defc1fa9-8108-480e-8335-bbe2433dbf00) | A horizontally scrolling row of suggestion chips that fills in the reason with one tap | Opening the OS keyboard first |
| Chime | [Add expense](https://mobbin.com/screens/f26c3684-79c1-4524-a116-bd40cb71f35a) | A big amount first, then one conversational question ("What's this expense for?"), like `spend.reason.label` | Split rows and the date wheel |
| Mercury | [Expense details](https://mobbin.com/screens/926af2dd-cfc4-4b31-828d-859819b0b02b) | The policy as helper text right where it applies ("Submit within 30 days") | Receipt upload, merchant and currency |
| Brex | [Request reimbursement](https://mobbin.com/screens/0fdaa34f-998e-4c1c-a9c1-d1288239cb92) | The visible ✕ in the sheet header | Eight fields and "Save draft"; Pot's target is 5 taps |

- **Pot version** (Maya's $84 groceries), top to bottom:
  1. **Header:** the grabber, `heading` `spend.title` "Spend from Lisbon trip", and ✕.
  2. **Type switch:** a 44 px segmented control with radio semantics.
     - Options: `spend.type.reimburse` "Reimburse me" (the default) and `spend.type.pay_member` "Pay a member".
     - "Pay a member" adds a horizontal row of 48 px member avatars with names. The selected member gets a 2 px `ink` ring and a check.
  3. **Amount:** `balance-hero`, tabular, centred.
     - "$84" with an `ink` caret; the placeholder "$0" is in `ink-muted`.
     - It shrinks to fit past 7 characters, and has `role="status"`.
     - Its accessible label is `spend.amount.label` "How much?".
  4. **RulePreview box**, as in Wealthsimple: `surface-sunken`, `radius-md`, `space-3` padding.
     - A 64 px minimum height, so nothing jumps.
     - A polite live region, updated with a 300 ms debounce.
     - The icon and first line are `ink` `label`; the second line is `body-sm` `ink-muted`.

     | State | Icon | First line | Second line |
     |---|---|---|---|
     | $0 | none | `rules.instant` "Anyone can spend up to $100 without asking." | none |
     | Instant | `approved` check | "This will be approved instantly" | "Anyone can spend up to $100 without asking." (`preview.instant`) |
     | Vote | `waiting` clock | "This needs 2 of 3 approvals" | "It's over the $100 instant limit." (`preview.vote.over_cap`; also `.over_budget`, `.recipient`, `.new_member`) |
     | Blocked | `declined` x | "The Pot has $366" | "You can ask for up to $366." (`preview.blocked.balance`, as in Chime). The CTA is disabled. |

     This box never turns `brand-soft`: that colour is saved for the real approval.
  5. **Reason:** "What's it for?" (`spend.reason.label`, `body-sm` `ink-muted`), then a horizontally scrolling chip row, as in Tripsy and Setel.
     - A single-select `ToggleGroup` with `spend.reason.chips`: Groceries 🛒 · Food 🍝 · Transport 🚕 · Stay 🏠 · Tickets 🎟️ · Other.
     - Chips are 44 px tall with `radius-sm` and a `label`.
     - Unselected: `surface` with a 1 px `line-strong` border. Selected: `brand-soft`, a 1 px `brand-deep` border and a check icon (the fill alone is 1.22:1 against `surface`).
  6. **Note:** a "+ Add a note (optional)" text button (`spend.note.placeholder`).
     - It expands a 16 px single-line input on `surface-sunken` with a 1 px `line-strong` border and `radius-sm`, inside `VirtualKeyboardProvider`.
     - While the note has focus, the keypad collapses.
     - Notes are stored off-chain (D-07), so the public-note hint never shows.
  7. **CTA:** a full-width 52 px primary button directly above the keypad, as in Revolut Business.
     - `spend.cta.instant` "Get $84 back", `spend.cta.pay_member` "Send $84 to Sam" or `spend.cta.vote` "Ask the group".
     - Disabled at $0 and when blocked.
  8. **AmountKeypad:** 3 × 4 keys, about 119 × 56 px, on `surface-sunken` with `radius-md`.
     - Keys are labelled "1"…"9", "decimal point" and "delete".
     - Physical keys work on desktop. The bottom padding includes the safe area.
  - **Fit:** about 680 of the 776 px available (92 dvh at 844), so there's no scrolling at 390 × 844. On 667 px phones, the chips and note scroll above the pinned CTA and keypad.
- **States:**

  | State | What shows |
  |---|---|
  | Editing | As above |
  | O, instant | The sheet changes into the result card (§4) |
  | O, vote | `spend.vote_sent` and an ApprovalTimeline: "Maya ✓ approval counted", Sam ○, Leo ○ (D-61) |
  | Became a vote | `spend.became_vote`, when another spend raced this one |
  | X | `spend.error.relayer` or `.generic` inline with `role="alert"` above the CTA. The values are kept. |
  | OFF | `spend.offline`: the CTA is disabled, and tapping explains why |
  | New member | `preview.vote.new_member` (rev4, H-10 default) |

- **Motion:** the preview text cross-fades over 120 ms, with no height jump; chip selection takes 120 ms. Reduced motion: no transitions.
- **Watch-outs:**
  - **"Pay someone" vs "Pay a member".** The brief says "Pay someone"; the ux-spec MVP says "Pay a member". Paying people outside the Pot is Phase 3 and always needs a vote (`rules.recipients`). Keep "Pay a member" so the label doesn't promise what the MVP can't do.
  - **Two denominators.** The preview says "needs 2 of 3 approvals" (approvals needed out of members), and right after sending the meter says "1 of 2" (approvals so far out of approvals needed). Keep "2 of 3" for previews and rules. After sending, say ⓟ `spend.vote_sent` "Sent to the group · Your approval is counted. It needs 1 more." Never write "1 of 3 approved", as the mockup does.
  - **The preview isn't a promise.** The chain decides (`spend.became_vote`), so the result card must wait for the real answer before saying "Approved".
  - **No red sentences.** Chime's red error text feels like scolding. Pot uses the `declined` icon with `ink` text (`declined` itself is 4.71:1 on `surface-sunken`).
  - **Keypad vs OS keyboard.** iOS 26 Safari ignores `interactive-widget`, so the keypad must collapse while the note field has focus (frontend-architecture §8.4).
  - **Chip targets.** Chips must be at least 44 px tall (ux-spec asks for 48) and 8 px apart. The scrolling row should show a peek of the next chip.
  - **No crypto words.** Never "transfer", "fee" or "network" in this sheet.

### 4. The instant-approval moment and the receipt (Spend result card and Receipt sheet, ux-spec §4.9 O-instant, §6.3, §5.14)

- **Job:** turn "Get $84 back" into a short, true story: the rules checked, the rules approved, the money arrived, and here's the receipt.
- **References:**

| App | Screen | What to borrow | What to leave |
|---|---|---|---|
| Revolut | [Sending money flow](https://mobbin.com/flows/c4a1fcdc-9763-40cb-8470-3ca850e88da2) | The review screen states the outcome and the timing before Send ("Estimated arrival · Usually in seconds"). Afterwards, the payment lands as a bubble in the conversation, so Pot's result should end as the new feed row. | The fraud-warning box and the "No fees" row |
| Wealthsimple | [Send money flow](https://mobbin.com/flows/6a904954-7026-4395-b571-dd148c841625) | "Sending limit $5,000 ⓘ" as a row under the amount, and a short branded interstitial while it sends | The coin animation and handle search |
| Wise | [Sending money flow](https://mobbin.com/flows/b821a14c-a4be-49e8-b7cc-2d491badb3e0) | The last step: a big "Sent" amount, an "Updates / Details" switch, and a checked timeline ("You set up your transfer", "We paid out", "Your transfer's complete"). This is the model for the receipt. | The password and 2-step verification screens, and "Repeat this transfer" |
| Starling | [Sending a payment flow](https://mobbin.com/flows/0f58475d-00d4-4f94-8840-800b577c52bf) | The review lists the category with its icon ("Groceries") | The modal "High Value Payments" alert: Pot explains a vote inline, before the tap |
| Setel | [Sending money flow](https://mobbin.com/flows/aa2d71c3-0488-4e32-ae7e-2a064ab82ca9) | The success card: a check badge on the card's top edge, compact key/value rows and a secondary "View transaction details" | The transaction ID up front, and the rating slider |
| Duolingo ABC | [Celebration](https://mobbin.com/screens/38019d11-7dfa-424c-aea8-651ad6acfeaa) | The shape: short rays from one central object, not confetti falling across the screen | The mascot, emoji and full-screen takeover |
| StubHub | [You are all set](https://mobbin.com/screens/c49485da-9605-4f1c-9099-2e42f2b135e6) | The check badge anchors the moment, with the headline right under it | Full-screen confetti and a paragraph of copy |
| Withings | [Missions done](https://mobbin.com/screens/c52f7e0f-41e5-4e12-96d9-84b1b420f7f9) | A small pill above the headline names what happened. Pot's version is the `brand-soft` "Approved by Pot rules" capsule. | All caps and the illustration |
| Zopa Bank | [Pot celebration](https://mobbin.com/screens/e183df2c-95fd-46cf-9d56-8a954bab27d5) | Nothing | Full-screen confetti that carries no information, just "Go to my pot" |
| Nibble | [Completed](https://mobbin.com/screens/5385f415-3d0a-4d60-86f2-b50d6aaa7763) | Nothing | Yellow numerals: marigold must never be text |

- **Pot version: choreography** (Maya). "The button becomes the answer":
  - The keypad slides away over 280 ms. The amount stays at the top as "$84.00" in `balance-hero`, with the reason chip "Groceries 🛒" under it.
  - The tapped CTA turns into a status capsule in the same place: `surface-sunken`, `radius-md`, 52 px tall.

| Time | What you see | Copy | Accessibility |
|---|---|---|---|
| 0 ms | The capsule shows a 24 px inline-SVG pot-bubble glyph (eggplant, with marigold dots, 8.9:1) whose three dots pulse in turn: opacity .35 to 1, 150 ms apart, a 1200 ms loop. The brand lists the glyph for "loading". | `spend.checking` "Checking Pot rules…" in an `ink` `label` | `aria-busy="true"` on the card; nothing is announced |
| ≥ 1200 ms and APPROVED (the relay's early answer, D-07) | The glyph becomes a check in `approved`, with a spring pop (stiffness 500, damping 30). The capsule fill turns `brand-soft` over 200 ms. **One** 600 ms marigold burst comes from the capsule: 12 `brand` and `brand-deep` particles, 4-6 px, radiating 40-64 px and fading out by 600 ms. | `spend.approved` "Approved by Pot rules". Under it in `body-sm` `ink-muted`: "Under the $100 instant limit", plus a "See rule" text button | The burst is `aria-hidden` |
| +600 ms | The capsule's second line changes | `spend.sending` "Sending $84 to you…" with `chip.sending` | none |
| Payout confirmed | A StatusChip "✓ Sent" next to the amount | `spend.sent` "$84 sent to you" | The live region announces once: "Approved by Pot rules. $84 sent to you." Focus moves to this line. |
| End | [Done] primary (the sheet's only marigold) and a "Receipt" text button (`feed.receipt`) | none | none |

- **Timeouts and edge cases:**
  - At 5 s the dots stop pulsing (WCAG 2.2.2). At 6 s the static `spend.still_checking` shows. At 15 s, `spend.slow` appears with [Close]; the operation keeps running and the feed updates.
  - Approved but the payout failed: the `feed.failed` copy appears in the card with an [Add money] text button. The burst doesn't replay.
- **Reduced motion:** no burst, no spring, and the dots stay still. The capsule tint and the text change instantly. The 1.2 s minimum stays, because it's pacing, not motion.
- **[Done]:** closes the sheet, and the `feed.instant` row appears at the top of the feed with the same `brand-soft` tint, as in Revolut.
- **Receipt sheet**, opened from [Receipt] or by tapping any money row. Modelled on Wise's "Updates / Details":
  1. **Header:** `heading` `receipt.title` "Receipt" and ✕.
  2. **Summary:** "$84.00" in `balance-hero`, `receipt.line` "$84.00 · Nov 3", and a StatusChip "✓ Sent".
  3. **ApprovalTimeline:**
     - Instant: "Maya asked to get $84 back for groceries · 2:04 PM", then "Approved by Pot rules · under the $100 instant limit", then "$84.00 sent to Maya · 2:04 PM".
     - Vote: "Maya asked…", "Maya's approval counted", "Leo approved · 2:31 PM", then "$300 sent to Maya".
     - Declined: "✕ Sam didn't approve · Reason: …", as in [Remote](https://mobbin.com/screens/7e183a3e-ce8f-4dbb-b91e-0efc2cbe6833).
  4. **Details:** 48 px rows with a `body-sm` label and a `body` value:
     - For: Groceries 🛒
     - Note: "Pingo Doce"
     - Pot after this: $366.00
     - Optionally, ⓟ `receipt.your_share` "Your share of this: $28.00", like [Vipps's "Your part is"](https://mobbin.com/screens/9c254808-67ef-4616-82d4-79a2a84acb36) (§6a)
  5. **Ledger link:** the `receipt.ledger` "View on the public ledger" text button. No hash is shown.
- **Watch-outs:**
  - **Only one celebration in the product.** ux-spec 4.10 S gives `approve.final` a celebration when your approval completes a vote, which would make two. I recommend no burst for group approvals or for closing; they get a calm check and the word. See open question 4.
  - **Outdated spec details.** ux-spec §6.3 and frontend-architecture §7.4 still specify "honey/terracotta" particles and a shimmer. Replace them with marigold particles and the typing dots. `duration-shimmer` becomes the dots' loop.
  - **Never show "Approved" before it's true.** Until task B-09's two-phase relay lands, Approved and Sent arrive together and play in order: Approved for at least 600 ms, then Sending for at least 400 ms (frontend-architecture Q2).
  - **Capsule contrast.** "Approved by Pot rules" stays `ink` on `brand-soft`; only the icon is `approved` (4.35:1 for text in Day).
  - **Keep the dots for "Checking Pot rules" and the empty feed.** "Sending…" uses the static send icon, so the dots keep meaning "the rules are thinking".
  - **Focus.** When the CTA disappears, keep focus inside the sheet and move it once, to the final status line, not at every step.
  - **No crypto words in the receipt.** No hash, block or gas. `receipt.ledger` passes the lint; keep it a text button.
  - **No full-screen confetti** like [Zopa's](https://mobbin.com/screens/e183df2c-95fd-46cf-9d56-8a954bab27d5) or [Finch's](https://mobbin.com/screens/7004eb96-c2e5-4d63-a8df-5f4bb450e873). The burst lasts 600 ms or less and stays inside the card.

### 5a. Approve sheet (`/p/[slug]?r=<proposalId>`, ux-spec §4.10)

- **Job:** decide on a request in one tap with everything needed to be fair: who's asking, how much, why it needs me, who already said yes, what's left after, and when it expires.
- **References** (Cerasela's Night Approve mockup is the base):

| App | Screen | What to borrow | What to leave |
|---|---|---|---|
| Revolut Business | [Request detail](https://mobbin.com/screens/9a34e3c2-65fa-49e0-9a6f-5833c749d333) | An "Approvals · 1 of 1 ⓘ" header over a vertical timeline ("Submitted for review", then "Awaiting approval from 1 team member" with an avatar), a separate "Note" block, then the details | Approve and Reject at the top of the screen; the dark-only styling |
| Brex | [Request status](https://mobbin.com/screens/ecf850cc-08cc-46ef-b321-8248107afc9e) | Hollow circles for approvers who haven't acted ("Pending review from … or 10 others") and a filled check for those done | "Cancel budget request" (withdrawing is Phase 3) and comments |
| Retro | [Requests](https://mobbin.com/screens/492b60e4-e3de-4183-ab3b-2b600aa0f5b5) | The expiry in the request's meta line ("Expires in 13 days"); a full-width pair of labelled buttons | Decline as the filled button |
| X | [Member requests](https://mobbin.com/screens/b9d47aae-5407-4bc1-b76f-56198d875dc0) | While a decision is sending, both buttons are disabled and the tapped one shows progress inside it | The red outline on Deny |
| Remote | [Declined invoice](https://mobbin.com/screens/7e183a3e-ce8f-4dbb-b91e-0efc2cbe6833) | A declined request shows a one-line alert ("… declined the invoice") and a timeline row with ✕ and "Reason: …" | The upsell pill and PDF button |
| Warby Parker | [Order error](https://mobbin.com/screens/1011a84c-072f-494a-ae2e-66691a7c22cf) | An alert card at the top of the detail with its one fix inside it, the model for `approve.failed` with [Add money] | The bright red border and "Error" tag |

- **Pot version** (Leo reviewing Maya's $300):
  1. **Top:** the grabber and a 44 px ✕.
  2. **Header row:** a 40 px avatar (Maya, `member-1`), the H2 `approve.title` "Maya asks for $300" in `heading` (the focus target), and "Lisbon trip · 5 min ago" in `body-sm` `ink-muted`.
  3. **Amount:** "$300.00" in `balance-hero`, tabular.
  4. **Reason:** `approve.reason` "For the boat 🎟️" in `body` `ink` (the note if there is one, otherwise the category). A note gets its own quote block on `surface-sunken` with `radius-sm`, like Revolut Business's "Note".
  5. **Why box** on `surface-sunken`, `radius-md`: `approve.why.cap` in `body` `ink`. The mockup's wording, "Over the $100 instant limit, so the group decides.", is warmer than the spec's; I propose updating the key to it.
  6. **ApprovalTimeline**, as in Brex:
     - Header: `approve.progress` "Approvals · 1 of 2".
     - Rows: "✓ Maya · asked, approval counted", "○ You · waiting for you", "○ Sam · hasn't decided".
     - Accessible text: "1 of 2 approvals: Maya".
  7. **Facts:** two 48 px rows with a `body-sm` label and an `amount` value: `approve.after` "Pot after this $66.00" and `approve.expires` "Expires in 7 days".
  8. **Decision zone:** sticky in the bottom 40%, with the safe area.
     - [Approve $300] primary (`approve.cta.approve`) and [Decline] secondary (`approve.cta.decline`), each full width and 52 px tall, stacked as in the mockup with a `space-2` gap.
     - [Decline] expands the zone: an optional 16 px textarea (`approve.decline.reason`), [Decline], and a [Cancel] text button. The reason is posted with `POST /api/notes` after the decline is recorded.
- **States:**

  | State | What shows |
  |---|---|
  | L, from a cold push | A skeleton of the header, amount and timeline over the Pot as it renders |
  | Voting | Both buttons are disabled and Approve reads "Approving…" with `aria-busy`, as in X. Within 100 ms, `approve.optimistic` "Approved. 2 of 2." shows and the "You" row ticks. |
  | Final (threshold reached) | A calm `approved` check and `approve.final` "$300 is on its way to Maya." (drop the "!", see watch-outs). The sheet closes after 1.5 s or on ✕; focus returns to the feed item, now "Approved". |
  | Declined by me | `approve.declined.self` |
  | Already voted | `approve.already` "You approved this 2h ago" replaces the decision zone |
  | Decided | `approve.decided.approved` or `.declined`, with the timeline showing who declined and why, as in Remote |
  | Expired | `approve.expired`, with the "Expired" chip and the amount struck through |
  | Failed (BAL) | An alert card at the top, as in Warby Parker: `approve.failed` "Approved, but the Pot is short…" with [Add money] secondary inside it |
  | Own request (Maya) | No decision buttons. `approve.own.counted` "Your approval is counted. Waiting for 1 more." and ⓟ `approve.own.hint` "Changed your mind? Ask the group to decline it." D-07 Rev 5: there's no withdraw, and Maya's own approval is final. |
  | X / RLY / OFF | X: the toast `approve.error.vote_revert` and the timeline reverts. RLY: `approve.error.relayer`. OFF: `approve.offline` and `aria-disabled` buttons. |
  | Close variant | `close.approve.title` "Maya wants to close Lisbon trip", a large `close.approve.refund` "You'd get back $22.00", the RefundTable (§7), and ⓟ `close.approve.cta` [Approve closing] |
  | Rules variant | ⓟ `approve.rules.title` "Maya wants to change a rule", then the old sentence struck through and the new one in `ink`, decoded from the `set_rules` arguments (frontend-architecture §5.4) |
  | Proposal not created by Pot | A read-only card, `requests.direct_change` (ⓟ frontend-architecture), with no Approve (rev4 H-2) |

- **Motion:** the sheet slides in over 360 ms; the optimistic tick takes 120 ms; there is no burst. From `bp-md`, it's a centred 440 px dialog in the same order.
- **Watch-outs:**
  - **Decision placement.** Revolut Business's Approve/Reject at the top would break the bottom-40% rule. Keep the decision zone sticky at the bottom.
  - **Decline is never the strong button.** Retro fills Decline and X outlines Deny in red. In Pot, Decline is always secondary, and `declined` is a state colour that never fills a button.
  - **The accessible name includes the amount** ("Approve $300", WCAG 2.5.3). Never icon-only buttons like [Lex's](https://mobbin.com/screens/0e4808d2-cc01-49c6-a5f6-89547d179133).
  - **Notifications never approve** (3.3.4). This sheet is the review step.
  - **Night focus ring.** The marigold button has no border in Night. The focus ring colour `#ffc94d` is 1.17:1 against the marigold button, so the 2 px offset is mandatory; the ring then sits on Night `surface` at 10.6:1.
  - **One exclamation per flow.** `approve.final` "Approved! …" adds a second "!" to the flow; the tone rule allows one ("You're in!").
  - **Decode what's actually voted on.** Render the amount and recipient decoded from `get_proposal(id).kind` (rev4 M-10). If they differ from the hub's request, show `generic.error` and don't sign.
  - **Words.** Approve, Decline, approvals, the group. Never "vote" or "proposal"; the mockup's copy is already clean.

### 5b. Requests tab (`/requests`, ux-spec §4.11)

- **Job:** one place for everything across my Pots that needs me, what I've asked for, and what's been decided.
- **References:**

| App | Screen | What to borrow | What to leave |
|---|---|---|---|
| Revolut Business | [Card requests](https://mobbin.com/screens/90b1a976-e401-48bd-aec3-570e31be5633) | The decided list: a status badge (✓ or ✕) on each item's icon, the status word under the title, a rejected amount struck through, and an "All · 3" count | A red word as the only cue for "Rejected" |
| Remote | [Time-off requests](https://mobbin.com/screens/6f7ddbc3-3a49-492b-8de8-5f7c791cdf28) | A section header with its count ("Pending requests · 1"), decision buttons with an icon and a word, and a tab badge | The overview card and coloured outline buttons |
| Airwallex | [My tasks](https://mobbin.com/screens/183421be-24a2-47db-b692-a98293277b3a) | Empty sections stay and say "✓ You're up to date"; a soft count pill marks what needs you | Five task categories |
| Airwallex | [Spend requests](https://mobbin.com/screens/eb6281a0-2c85-473d-95fb-cedc5ba119f4) | A status label aligned right on each row | Status pills with no icon, and the FAB |
| Chime | [Group, pending](https://mobbin.com/screens/9b3cefde-7aec-41a0-916e-d9bc2a87c7ed) | Pending before history, and a tonal "Remind" button on the row | Tabs inside a tab |
| Satispay | [Requests](https://mobbin.com/screens/72dbcfff-3d62-41ee-9084-10c64bd2bd15) | Nothing | "Pending / Canceled" segments hide how much is waiting. Pot stacks sections instead. |
| Apple Music | [Follow requests](https://mobbin.com/screens/f37105ad-ba4c-4918-842e-c4ccb627face) | Nothing | Icon-only red ✕ and green ✓, and "Approve All" (also in [Lex](https://mobbin.com/screens/0e4808d2-cc01-49c6-a5f6-89547d179133) and [GroupMe](https://mobbin.com/screens/bf79539c-577c-4eaa-8ab3-346d878ed019)) |

- **Pot version:**
  1. **Header:** `title` `requests.title` "Requests".
  2. **Three stacked sections**, each headed in `heading` with a count. No inner tabs.
     - "Waiting on you · 1" (`requests.section.waiting`)
     - "Your requests · 1" (`.mine`)
     - "Decided" (`.history`, the last 30 days)
  3. **Waiting on you:** the same RequestCard as on the Pot (§2), with the Pot's cover tile and name as the first meta line ("🇵🇹 Lisbon trip").
     - Buttons: [✓ Approve $300] secondary and [Decline] secondary, or [Review] when a popup is needed.
     - Tapping the card body opens `/p/<slug>?r=<id>`. Back closes the sheet, then returns to Requests.
  4. **Your requests:** rows with your avatar, "You asked for $300 for the boat · Lisbon trip", a StatusChip "1 of 2 approvals" and "Expires in 7 days".
     - There is no Withdraw button (Phase 3).
     - ⓟ `approve.own.hint` appears in `body-sm` under the first row.
  5. **Decided:** compact rows, as in Revolut Business.
     - Each avatar carries a 16 px status badge: ✓ in `approved`, ✕ in `declined`, or an hourglass in `ink-muted`.
     - Then the title, "Pot · date", and the status word under the title: "Approved", "Not approved" or "Expired".
     - The amount sits on the right. For declined and expired requests it is struck through and followed by "Not sent".
  6. **Empty:** if everything is empty, the EmptyState shows a check in a circle in `approved`, `requests.empty.title` "You're all caught up" and `requests.empty.body`. If only one section is empty, its heading stays with one line: "✓ Nothing waiting on you" (ⓟ `requests.section.waiting.empty`), as in Airwallex.
  7. **Badge:** the tab badge counts Waiting on you, in `ink`, with `requests.badge.a11y`. Where supported, `navigator.setAppBadge` mirrors it (frontend-architecture §8.5).
- **States:**
  - L: 3 card skeletons.
  - O / X: as in the Approve sheet, including the 4 s inline undo.
  - OFF: cached rows, with actions `aria-disabled`.
  - EXP: the request moves to Decided as Expired.
- **bp-lg:** by default the request opens in the centred dialog. An optional variant puts the list on the left (about 480 px) and the selected request's Approve content in a right-hand panel, as in [Mercury](https://mobbin.com/screens/2a9877cf-2b59-42c1-b143-ae4ee6e27841).
- **Watch-outs:**
  - **No marigold on this tab.** Lists use secondary buttons; zero marigold buttons is allowed and keeps the marigold for the sheet.
  - **No bulk approve.** Every money decision gets its own review; drop "Approve all" ([GroupMe](https://mobbin.com/screens/bf79539c-577c-4eaa-8ab3-346d878ed019), [Apple Music](https://mobbin.com/screens/f37105ad-ba4c-4918-842e-c4ccb627face), [Deel](https://mobbin.com/screens/b6d82ee0-8694-4f55-a1d5-9f0964c8b13c)).
  - **Expired has no brand state colour.** Use `ink-muted`, an hourglass and the word "Expired". See open question 7.
  - **Strikethrough isn't announced** by most screen readers and is a weak cue on its own. Always pair it with "Not sent".
  - **Copy drift.** The brand's type sample reads "Waiting for you", and the mockup says "Waiting for you, 1 of 3 approved". Use `pot.waiting.header` "Waiting on you" everywhere.

### 6a. Members (`/p/[slug]?tab=members`, ux-spec §4.5)

- **Job:** show, person by person, what they put in, their share of what's been spent, and what they would get back if the Pot closed now.
- **References:**

| App | Screen | What to borrow | What to leave |
|---|---|---|---|
| Monzo | [Shared tab](https://mobbin.com/screens/b6b0c41b-83ee-44bf-8850-16fb42188b20) | "3 People · Overall balances", with one tile per person (initials and one number), "You" first | Bare signed numbers ("-1.13") in red and green |
| GoPay | [Split bill details](https://mobbin.com/screens/84551398-9d8a-4ad7-8790-0ddf3f0da17e) | One sentence above the list about what happens automatically, and a warning line under a person's name ("This person is not using GoPay"), the model for "Invited · hasn't joined" | "Item details" expanders and Delete |
| Vipps | [Group chat](https://mobbin.com/screens/9c254808-67ef-4616-82d4-79a2a84acb36) | "Your part is 1 SEK" printed on each expense, the source of the optional "Your share of this" line in Pot's receipt | The chat composer |
| Revolut | [Group members](https://mobbin.com/screens/9cefa3b7-4c45-4770-ae2f-9d45f86f4dd4) (already in the KB) | New detail: group totals under the list ("Total spent by group / by you") | "Smart settle" and the red "Leave group" |

- **Pot version** (after the $84 and $300 spends):
  1. **Header row:** `heading` `members.header` "3 people", with a 44 px [Invite friends] secondary button (`members.invite_cta`) on the right. The hero's Add money stays the only marigold.
     - Under it, `body-sm` `ink-muted` ⓟ `members.refund_hint`: "What each person would get back if the Pot closed now."
  2. **Totals strip** on `surface-sunken`, `radius-md`, in three columns with a `body-sm` label above an `amount`: "Put in $450.00 · Spent $384.00 · Left $66.00" (ⓟ `members.totals`). This combines Revolut's totals and [Mercury's strip](https://mobbin.com/screens/2a9877cf-2b59-42c1-b143-ae4ee6e27841).
  3. **MemberRows**, at least 64 px each, on `surface` with `radius-md`.
     - A 40 px avatar and the name in `label`. "You" comes first, then join order: Maya, Sam.
     - On the right: "Gets back" in `body-sm` `ink-muted` over "$22.00" in `amount`, the number each person cares about.
     - A second line in `body-sm` `ink-muted`: `members.row` "Put in $150.00 · Share of spending $128.00".
     - The accessible name is the full sentence.
     - **Invited, not joined:** a dashed `line-strong` avatar outline, "Ana" and `members.invited` "Invited · hasn't joined". Nudge is cut by default (`FLAG_NUDGE`). When enabled, [Nudge] secondary leads to `members.nudge.sent`.
  4. **Footer:** `members.explainer` "Leftover money is split by how much each person put in." in `body-sm` `ink-muted`, plus a "How it's worked out" text button. It opens a small sheet that explains the math in words ([Buddy's model](https://mobbin.com/screens/e1f4374b-33cc-4fcd-b282-b2a3ed6ed3b8), already in the KB).
- **States:**
  - L: row skeletons.
  - E (only you): "Invite friends to start" with [Invite friends].
  - X: a toast.
  - OFF: cached rows.
  - Design with the unequal example too ($29.33 / $22.00 / $14.66, ux-spec §4.14). Tabular figures keep the column aligned.
- **Watch-outs:**
  - **Words, not signs.** Monzo, [Wanderlog](https://mobbin.com/screens/a792e2a4-0c01-409e-b05a-ad19408a52f5) and [Splitwise](https://mobbin.com/screens/a65c5e3d-efa0-456e-8cf2-dc87f760e198) use signed, coloured numbers. Pot writes "Gets back $22.00", with no red or green for people, because nobody owes anybody.
  - **Banned vocabulary.** [Splitwise's "Settle up"](https://mobbin.com/screens/a65c5e3d-efa0-456e-8cf2-dc87f760e198) is out (`settle` becomes "Close the Pot").
  - **"Gets back" is a projection before close.** The helper line says so once. The authoritative number comes from `preview_close` (frontend-architecture §3.7).
  - **Consistent colours.** Join-order colours (Maya `member-1`, Sam `member-2`, Leo `member-3`) must match the feed and the timeline.
  - **Keep the table for Close.** At 320 px, the two-line row reflows cleanly where a four-column table wouldn't.

### 6b. Rules (`/p/[slug]?tab=rules`, ux-spec §4.6)

- **Job:** make the Pot's rules readable as plain sentences, show me where I stand against them, and let me ask the group to change one.
- **References:**

| App | Screen | What to borrow | What to leave |
|---|---|---|---|
| GoHenry | [Limits and controls](https://mobbin.com/screens/2df2c48a-d9c3-4fd3-bbed-917fd7ea8edc) | Each limit is a value plus one plain line of meaning ("Single £50 · Maximum spend in one go") | One parent's "Edit" |
| Brex | [Limit details](https://mobbin.com/screens/2598230b-a25f-4a62-9447-633328d8fdb2) | A personal usage bar ("$27.97 available · $300.00 limit"), a secondary "Request limit increase" button, and a one-sentence rule ("Expenses outside of policy require additional review") | Category and merchant matrices, and the word "policy" |
| Fuse | [Spending limits](https://mobbin.com/screens/739782f9-50c7-44bb-ad3a-c69eaf1938ad) | A one-sentence "why" sheet: within the limit, no extra check is needed, which is Pot's "up to $100 without asking" | "Wallet" and "2FA" |
| Zopa Bank | [Payment limits](https://mobbin.com/screens/d06e877d-fa99-405f-9f20-5c68ea716368) | Limits framed as peace of mind ("you'll never move more money than you're comfortable with") | Locked sliders |
| ANZ Plus | [Card controls](https://mobbin.com/screens/edbb8f8d-5ab6-4f3d-bc6b-a1c6ea25f45b) | An honest footnote about when a change takes effect | Toggles that one person can flip |

- **Pot version:**
  1. **Header:** `heading` `rules.title` "How Lisbon trip works", with a `surface-sunken` pill `rules.preset.trip` "Trip rules".
  2. **Rule rows**, in GoHenry's "value plus meaning" pattern: `surface`, `radius-md`, `space-4` padding, a 24 px Lucide icon on the left, and each value in bold `ink` with tabular figures. Values are read-only; the RuleSentence chips become editable in P2.

     | Icon | Rule |
     |---|---|
     | zap | `rules.instant` "Anyone can spend up to **$100** without asking." |
     | users | `rules.threshold` "Bigger spends need **2 of 3** approvals." |
     | user-round | `rules.budget` "Each person can spend up to **$200** in total without asking." It adds a personal meter, as in Brex: a 6 px `ink` fill on a `surface-sunken` track, and ⓟ `rules.budget.used` "You've used $84 of it." for Maya. |
     | user-check | `rules.recipients` "Instant payments only go to members." |
     | hourglass | `rules.expiry` "Requests expire after **7** days." |
     | (optional) | ⓟ `rules.new_member` "Spending without asking starts once you've added money." (rev4 H-10) |

  3. **Footer:** `rules.footer` "The Pot enforces these rules itself. No one, including Maya, can skip them." in `body-sm`.
  4. **Change** (`FLAG_RULES_EDIT`, P-8):
     - [Ask the group to change a rule] secondary (ⓟ rename of `rules.change.cta`), with `rules.change.note` in `body-sm`: "Changes need the group's approval. They apply once 2 of 3 approve." That honest timing comes from ANZ.
     - It opens a change sheet: every value becomes an editable chip (amounts use the keypad), with a live preview of the new sentence and "This needs 2 of 3 approvals".
     - The sheet's primary is [Ask the group] (`spend.cta.vote`). The proposer's approval is cast automatically (contracts-spec §3.12).
  5. **Pending** (at most one open rules request, `ERR_RULES_PENDING`): the button is replaced by a waiting card.
     - ⓟ `rules.change.pending` "Maya asked to change a rule · 1 of 2 approvals · Expires in 7 days", with [Review].
     - [Review] opens the Approve sheet's rules variant, with the old sentence struck through and the new one below it.
  6. **Sole member:** "Change rules" applies at once (`set_rules`), with no group copy.
  7. **On-chain rules:** the testnet "On-chain rules" panel (D-52) lives only in Advanced.
- **States:**
  - L, X, OFF: cached rules.
  - The shared demo Pot hides Change, because changes there return `demo_forbidden`.
- **Watch-outs:**
  - **One person's authority.** "Request limit increase" (Brex) and "Edit" (GoHenry) imply one person decides. Pot's copy must say the group decides.
  - **No amount sliders.** Zopa's locked sliders are out (ux-spec §8, for 2.5.7 and precision).
  - **CTA wording.** "Ask the group to change a rule" (the brief) matches "Ask the group" (Spend) and "Ask the group to close". ux-spec's P2 key says "Suggest a change"; I recommend renaming `rules.change.cta`.
  - **Banned words stay out.** `cap`, `budget` and `policy` are banned, and the sentences already avoid them; the icons need no text.
  - **The usage meter is not marigold.** If it used `brand` or `brand-soft`, it would read as a goal bar.

### 7. Close Pot (`/p/[slug]?sheet=close`, ux-spec §4.14)

- **Job:** show everyone exactly what they'd get back, ask the group to agree, and end the Pot with a clear "your money is on its way".
- **References:**

| App | Screen | What to borrow | What to leave |
|---|---|---|---|
| Cash App | [Closing a pool](https://mobbin.com/flows/ba668050-9892-48ef-9f0b-49427ef42bdd) | The success screen says what happened and where the money is ("You closed the pool and transferred $1… You can view Noodles anytime"). Afterwards, a "Closed Jul 17 · Money transferred" card replaces the buttons and "Pool closed" ends the activity. | All the money going to the organizer, and the upsell card |
| Cash App | [Closing a pool, options](https://mobbin.com/flows/a8b813ea-391a-4ece-8d4c-f60157b25d1d) | The menu row carries its consequence as a subtitle ("Close pool · Stop new payments") | The black primary |
| PayPal | [Closing a pool](https://mobbin.com/flows/995483b4-f2da-47e7-9f58-def7a4ff2b6b) | The confirm sheet states the effect in one sentence ("You won't be able to receive contributions…"); a "Closed" tag afterwards | The transfer to the organizer |
| Monzo | [Archiving a pot](https://mobbin.com/flows/78b5cb70-b07e-453f-b297-3ba8c3c1c1f5) | The confirmation names the amount and where it goes; a named way out ("Keep Pot") instead of "Cancel"; the ending action sits at the bottom of the details | The warning-triangle art: closing isn't an error |
| Wise | [Closing a balance](https://mobbin.com/flows/a89b1dcc-8d95-4737-a397-ca987e0d8276) | Nothing | A red filled "Close your balance" button |

- **Pot version** (Maya proposes, Leo approves, everyone sees the ending):
  1. **Entry:** ••• → "Close Pot", with the subtitle ⓟ `close.menu.sub` "Ask the group to end it and share out what's left".
  2. **Sheet:**
     1. ✕ and the `heading` `close.title` "Close Lisbon trip?".
     2. `close.body` "Everyone gets back their share of what's left. The group needs to approve." in `body`.
     3. `close.math` "$66.00 left · split by how much each person put in" in `body-sm` `ink-muted`.
     4. **RefundTable:** a real `<table>` with `<th scope>`.
        - Headers in `body-sm` `ink-muted`: Person · Put in · Gets back.
        - Cells in `amount`, tabular and right-aligned.
        - The "You" row comes first, highlighted in `surface-sunken` with the name in `label`. A total row closes the table.
     5. `close.dust` only when there's a remainder; `close.open_requests` only when requests are open.
     6. **What happens next**, as in PayPal: an info icon and `body-sm` "Adding money and spending pause while the group decides." (`pot.closing` wording).
     7. **Actions:** [Ask the group to close] primary (`close.cta`) and a text button ⓟ `close.keep` "Keep the Pot open", as in Monzo.
  3. **Waiting (O):**
     - The sheet shows `close.sent`. I propose "Sent to the group. Your approval is counted. It needs 1 more." to match §3.
     - It also shows the ApprovalTimeline: "Maya ✓ counted", Sam ○, Leo ○.
     - The Pot screen then shows the closing card (§2), and "Close Pot" in ••• reads "Waiting for the group" (`ERR_CLOSE_IN_PROGRESS`).
  4. **Others:** a push, "Maya wants to close Lisbon trip · You'd get back $22.00. Review and approve.", opens the Approve sheet's close variant (§5a).
  5. **Closed moment** for each member, the first time they see it:
     - A calm state with no burst: the 64 px pot glyph (eggplant in Day, marigold in Night) with an `approved` check badge.
     - A `heading` "Pot closed" and `close.done.self` "$22.00 is on its way back to you."
     - In `body-sm`, ⓟ `close.done.where`: "It goes back to your Pot dollars. You can still see Lisbon trip's history."
     - [Done] primary. The live region announces "Pot closed. $22.00 is on its way back to you."
  6. **Closed Pot:** read-only, as in Cash App's closed card (§2).
- **States:**
  - X: `close.error`.
  - Cooldown: ⓟ `close.cooldown` "The group said no to closing. You can ask again tomorrow." (`ERR_CLOSE_COOLDOWN`).
  - RLY and OFF: as on the Pot screen.
  - Cut: `close.disabled` "Closing a Pot is coming soon.", with the button visible but disabled (`FLAG_CLOSE`).
- **Watch-outs:**
  - **Everyone, not the organizer.** Cash App and PayPal pay everything to the organizer, the exact opposite of Pot. The table, listing every person, is what makes "everyone" visible; never show only a total.
  - **Not a red button.** Unlike Wise, closing a Pot is a group request, so the CTA is the normal marigold with an eggplant label. `declined` never fills a button.
  - **Words.** No "settle", "settlement" or "pro-rata". Use "Gets back" and "your share back".
  - **Only one celebration.** "Pot closed" is calm (a check and the glyph) even though it's an ending.
  - **Show the lock before it bites.** From `propose_close` on, money in and spends are blocked on-chain (D-09). Disable Add money and Spend with the `pot.closing` explanation before anyone hits an error.
  - **Narrow screens.** At 320 px, three columns with names up to about 12 characters and "$29.33" fit in `body-sm`. Longer names truncate, with the full name in the accessible text.
  - **Where the money goes.** The $22 lands in each member's Pot dollars, and the MVP has no way to cash out. See open question 11.

### 8. Notification-driven entry, plus empty and error states (push to `/p/[slug]?r=<id>`, ux-spec §5.15, §4.20, §8)

- **Job:** a push lands on exactly the right decision in one tap, and every empty or broken state says what's going on and what to do.
- **References:**

| App | Screen | What to borrow | What to leave |
|---|---|---|---|
| Whatnot | [Notification prompt](https://mobbin.com/screens/ec73d892-81b2-4d37-810d-af5762454af0) | The pre-prompt shows what the notifications will look like on a lock screen | The full-bleed yellow and the hype copy |
| Lloyds | [Notification settings](https://mobbin.com/screens/0c7a0043-8e37-4f6f-b67c-9b2a23c8e8f6) | Per-type toggles, each with one line of meaning, and a "How notifications might look" sample sheet | Long account-number copy |
| Splitwise | [New group, empty](https://mobbin.com/screens/7cdc0bfd-0fd8-4e34-8208-1761834fdfde) | A "You're the only one here!" card with invite actions where the feed will be | Two strong buttons plus a FAB |
| Insight Timer | [Group feed, empty](https://mobbin.com/screens/dc623371-156f-4cf6-aff3-7fce3e4bf67c) | A faint ghost of the item the feed will hold, with "Be the first to post something…" | The generic illustration: Pot uses the typing dots |
| Garmin Connect | [No challenges](https://mobbin.com/screens/8a382e17-10ff-4314-8e60-77811958d254) | The empty copy says who acts next | The admin framing |
| Revolut | [Declined top-up](https://mobbin.com/screens/95dc85c9-8a4c-47a8-b765-74b8ba18b04f) | The amount struck through, a status row giving the reason in one sentence, and "Get help" | Strikethrough as the only cue |
| Zomato | [Payment failed](https://mobbin.com/screens/2225c0f4-21e4-4ebb-a71f-1cf8aa070700) | Says whether money moved and when it comes back ("refund will be initiated within 24 hours") | Red filled buttons |
| Glow | [Transaction failed](https://mobbin.com/screens/dc7af07d-0e08-4954-a986-d9d9ff567218) | The headline "This transaction didn't go through." matches Pot's error voice | The fee, the signature and "View Raw Transaction" in the main path |
| Kraken | [Payment didn't work](https://mobbin.com/screens/8ba824e1-ab12-4510-93cb-80092cdc74b6) | Nothing | "Something went wrong… may have been declined" is vague |
| GoPay | [Offline](https://mobbin.com/screens/95483b32-a4d7-4025-b6e7-64220245eff5) | Nothing | Replacing the content with an offline illustration; Pot keeps cached numbers visible |

- **Pot version: notification entry**
  1. **The push** (Declarative Web Push; title up to 40 characters, body up to 110):
     - Title `{name} needs your OK`, which renders as "Maya needs your OK". Body: "$300 for the boat · Lisbon trip".
     - One `tag` per request, so a repeat replaces the old notification instead of stacking.
     - No action buttons: WebKit ignores `actions[]`, and 3.3.4 means a notification never acts.
  2. **The tap** opens `/p/lisbon-trip?r=12` (a 307 from `/p/[slug]/r/[id]`).
     - The Pot renders from cache or as a skeleton, and the Approve sheet opens on top in its L state.
     - Focus goes to the sheet's H2 "Maya asks for $300", and `document.title` is "Approve $300 · Pot".
  3. **Branches when it opens:**
     - Session lost: the `session.expired` sheet with one-tap re-auth, over the read-only cached Pot.
     - Already decided by others: `approve.decided.*`, for example "Already approved · $300 was sent to Maya".
     - Expired: `approve.expired`.
     - Not a member: `pot.not_member`.
     - Close and rules requests open the matching sheet variant.
  4. **Closing the sheet:** Back or ✕ returns to the Pot. For a cold link, `replaceState` makes sure closing never leaves the app. Focus lands on the request's feed item.
  5. **Other pushes** follow frontend-architecture §8.2:
     - Nudge: `?sheet=add`.
     - Someone joined: `?tab=members`.
     - Approved, declined, expired or closed: the Pot, with the relevant feed item highlighted in `surface-sunken` for 2 s.
  6. **App badge:** shows the Waiting on you count (iOS, when installed and permitted).
  7. **Push pre-prompt** (after install, from a tap, D-42), in Whatnot's style:
     - A preview card of the real notification ("Maya needs your OK · $300 for the boat · Lisbon trip").
     - Then `push.prompt.title` "Get told when friends need your OK", `push.prompt.body`, [Turn on notifications] primary and a [Not now] text button.
  8. **You → Notifications:** Lloyds-style rows with one line of meaning per notification type, and a "See an example" sheet.
- **Pot version: empty states.** One pattern everywhere: the brand glyph or the typing dots, one heading, one sentence, and at most one action.

| Screen | When | Visual | Copy | Action |
|---|---|---|---|---|
| Pots home | No Pots | Eggplant glyph, 72 px | `pots.empty.*`, ⓟ `pots.empty.join_hint` | [Start a Pot] primary |
| Pot feed (creator) | New Pot | Three static typing dots | `pot.feed.empty.title`, `.body` | [Invite friends] secondary |
| Pot feed (member) | Nothing yet | Ghost feed row | `pot.feed.empty.member` | None; the hero's Add money is right there |
| Requests | Nothing at all | Check in a circle, `approved` | `requests.empty.title`, `.body` | None |
| Requests section | Nothing waiting | One inline line with a check | ⓟ `requests.section.waiting.empty` | None |
| Members | Only you | Your own row | "Invite friends to start" | [Invite friends] secondary |

- **Pot version: error states.** The copy order is always: what happened, whether money moved, what to do.

| Situation | Where | Pattern | Copy |
|---|---|---|---|
| Offline | Everywhere | A top banner on `surface-sunken` with a wifi-off icon. Cached numbers stay, with "Updated 5 min ago". Money buttons are `aria-disabled`, and tapping one explains why. | `offline.banner`, `*.offline`, `online.restored` |
| Relayer down | Everywhere | The same banner. On submit, an inline error. | `relayer.down.banner`, `*.error.relayer` |
| Spend failed before approval | Spend sheet | An inline `role="alert"` above the CTA; the values are kept | `spend.error.relayer`, `.generic` |
| Approval didn't record | Approve sheet | A toast at the top, and the timeline reverts | `approve.error.vote_revert` |
| Approved, but the Pot is short | Approve sheet, feed | An inline alert card with the fix inside it, as in [Warby Parker](https://mobbin.com/screens/1011a84c-072f-494a-ae2e-66691a7c22cf) | `approve.failed`, [Add money] |
| Declined or expired | Feed, Requests, receipt | The amount struck through, a StatusChip, and the reason in the timeline ([Revolut](https://mobbin.com/screens/95dc85c9-8a4c-47a8-b765-74b8ba18b04f), [Remote](https://mobbin.com/screens/7e183a3e-ce8f-4dbb-b91e-0efc2cbe6833)) | `feed.declined`, `feed.expired`, `approve.expired` |
| Load failed | Pots, Pot | Cached data plus a toast, never a blank screen | `pots.error.load` |
| Unknown error | Everywhere | A toast with Details: the request ID, and the raw message only with the Advanced toggle on | `generic.error`, `details.*` |
| Session expired | Everywhere | A sheet with one-tap re-auth | `session.expired` |
| Daily limit reached | Everywhere | A toast | `relayer.cap` |

- **Watch-outs:**
  - **Lock-screen privacy.** "$300 for the boat" shows the request's note on a lock screen. A lock-screen-safe body, "Maya needs your OK in Lisbon trip", is the alternative (frontend-architecture Q14). Balances never appear in a push (notifications.md N1).
  - **Name what happened.** Kraken's vague copy is what to avoid: every Pot error names what happened and whether money moved (`moneyMoved`).
  - **Raw details stay in Advanced.** Glow's fee and signature are what to avoid; Pot shows raw details only in Advanced, with the toggle on.
  - **Toasts and announcements.** Toasts go at the top, never under the sticky CTA or the tab bar (2.4.11). One announcement per event: the toast or the live region, never both.
  - **Cold deep links.** The Pot must render behind the sheet before focus moves, or VoiceOver lands on a skeleton.
  - **No big red blocks.** Avoid [Warby Parker's](https://mobbin.com/screens/1011a84c-072f-494a-ae2e-66691a7c22cf) red border. Alerts are `surface-sunken` with a `declined` icon; `declined` text is 5.45:1 on `surface` in Day and 7.19:1 in Night.
  - **No approve from a notification** (3.3.4). WebKit can't show action buttons anyway.

---

## Proposed copy keys (ⓟ)

These are new or reworded keys for ux-spec §5. Each must pass the jargon lint.

| Key | String |
|---|---|
| `pots.empty.join_hint` | Got an invite? Open the link from your group chat. |
| `pots.card.closed_refund` | You got back {refund} |
| `spend.vote_sent` (reworded) | Sent to the group · Your approval is counted. It needs {remaining} more. |
| `close.sent` (reworded) | Sent to the group. Your approval is counted. It needs {remaining} more. |
| `approve.why.cap` (reworded, from the mockup) | Over the {instantLimit} instant limit, so the group decides. |
| `approve.own.hint` | Changed your mind? Ask the group to decline it. |
| `approve.rules.title` | {name} wants to change a rule |
| `requests.section.waiting.empty` | Nothing waiting on you |
| `receipt.your_share` (optional) | Your share of this: {amount} |
| `members.refund_hint` | What each person would get back if the Pot closed now. |
| `members.totals` | Put in {in} · Spent {spent} · Left {left} |
| `rules.budget.used` | You've used {used} of it. |
| `rules.new_member` (optional) | Spending without asking starts once you've added money. |
| `rules.change.cta` (renamed) | Ask the group to change a rule |
| `rules.change.pending` | {name} asked to change a rule |
| `close.menu.sub` | Ask the group to end it and share out what's left |
| `close.keep` | Keep the Pot open |
| `close.approve.cta` | Approve closing |
| `close.done.where` | It goes back to your Pot dollars. You can still see {potName}'s history. |
| `close.cooldown` | The group said no to closing. You can ask again tomorrow. |

## Open questions for Cerasela

1. **Marigold when something waits on you.** Should Add money stay the Pot screen's only marigold, with the inline Approve secondary (recommended)? Or should the marigold move to the pinned request while something waits on you? The In-context mockup shows both, which breaks the one-marigold rule.
2. **Hero actions vs "primary actions in the bottom 40%".** Accept the Pot screen as a documented exception (recommended), or add a sticky [Add money] [Spend] bar that appears when the hero scrolls away?
3. **"Your share" means both $150 and $122.** It's the suggested contribution and also the current part of the balance. Rename the hero and PotCard line to "Your part $122" or "You'd get back $122" (recommended), and keep "share" for the contribution? Worth testing in hallway round A.
4. **One celebration.** Burst only on "Approved by Pot rules" (recommended, and the brand rule), or also when your approval completes a group request (ux-spec `approve.final`) and when the Pot closes?
5. **Night link and focus colour.** `#ffc94d` is 1.17:1 against marigold, so in Night every "View details" link looks like marigold text. Keep it, or move Night links to a light plum?
6. **Requests badge.** `ink` fill (recommended) instead of the mockup's `declined` red, which fails in Night and means "Not approved"?
7. **Expired.** It has no state colour. Use `ink-muted`, an hourglass and the word "Expired" (recommended)?
8. **Status pills.** Use Lucide check, clock and x icons instead of the 8 px dots in the Colour-type mockup (recommended; the README asks for icons)?
9. **Small text.** Add a 12/16 caption style just for tab labels and badges, or move all the mockups' 12-13 px text up to `body-sm` 14?
10. **Copy.** Do you agree with:
    - "Pay a member" (MVP) over "Pay someone"?
    - "Ask the group to change a rule" over "Suggest a change"?
    - "Approve closing" as the button for close requests?
    - "It needs 1 more" after sending, instead of switching from "2 of 3" to "1 of 2"?
11. **After close.** Where do Leo's $22 go, and what can he do with them? The MVP has no cash-out, and the copy promises "on its way back to you".
12. **Mockup numbers.** Should the mockups be updated to D-61 (Maya asks for $300; $450 of $450; three members; Leo as `member-3`) before hallway round A?

---

**Your Mobbin AI usage is high this month**

Usage is unlimited during beta. If your usage stays at this level, you may need to purchase more credits once limits take effect. [View usage and plan options](https://mobbin.com/settings/billing-and-usage)
