# Design direction 01: join and money in

1. **The Pot is the hero, from the chat to membership.** One Pot card (emoji-on-gradient cover, `title` name, avatar seats, `balance-hero`, GoalBar) appears in the chat preview, the landing, the "You're in" sheet over the live Pot, the Share preview and the Create preview, so Leo sees one object instead of five screens ([Bluesky](https://mobbin.com/screens/20aa08e2-cecf-4c60-8a37-ed1f6a4a3985), [Wise](https://mobbin.com/screens/e81a35b4-cfeb-46a3-bb85-ff16517cc1d4), [Patreon](https://mobbin.com/screens/7bd322ba-e3b2-4ded-9534-46dea286055e)).
2. **One vertical stepper for every wait.** A single ProgressSteps part (done: an `approved` check and a time; current: an `ink` label with the typing dots; next: `ink-muted`) runs account setup, Create, "Confirm it's you" and the 5-step deposit, and every step promises a time ([Wise](https://mobbin.com/screens/d7da9beb-2dd6-4e38-8efd-a08113f32614), [Rocket Money](https://mobbin.com/screens/da08a12d-7485-4319-aa2c-579422bd1482), [Life Reset](https://mobbin.com/screens/10724d8a-b463-414e-87f6-c82f87fda797)).
3. **One marigold action per screen, labelled with its outcome.** "Join with Google", "Add $150" and "Copy Base address" are 52 px tall in the bottom 40%. Alternatives wait behind a quiet "More ways" text button, never a wall of equal provider buttons ([Notion](https://mobbin.com/screens/249f6555-6fc6-4931-adce-d2b4302e8ce1) is the anti-pattern).
4. **Money sheets read top to bottom like a sentence: amount, source, outcome, button, keypad.** The source is one row between the amount and the keypad, the outcome line sits above the button, and the button rests on the keypad for one thumb ([Public](https://mobbin.com/screens/2eefe6eb-c5f4-4c54-bc7f-7b32579ccd4f), [Klarna](https://mobbin.com/screens/e86dfc7e-4038-4ac1-8393-1ed2651b7485), [Base](https://mobbin.com/screens/fddc24b9-e05e-4fb2-8830-9e3d5724cea2)).
5. **Safety and delight are both typographic.** The button label carries the constraint, with one `surface-sunken` callout above it. Every failure says what happened, whether money moved and what to do. A success like "You're in!" is Gabarito at a large size, and the 600 ms burst stays reserved for "Approved by Pot rules".

> **For:** Cerasela (P2, design lead). **Written:** 2026-10-21 by the design-reference researcher. **Status:** planning only; no product code before Nov 1 (D-63).
>
> **Inputs:** the brand system (README, tokens.json, Day and Night) and its In-context and Web-icons mockups; [ux-spec.md](../ux-spec.md) (states, copy keys, tap budgets); [decisions.md](../decisions.md) Rev 5; [frontend-architecture.md](../frontend-architecture.md) §2.5 and §5; api-spec and architecture for pairing and 1Click details. This builds on [kb/ux-research.md](../../kb/ux-research.md) and [kb/competitors-ux-patterns.md](../../kb/competitors-ux-patterns.md) and doesn't repeat their references.
>
> **References:** 16 Mobbin searches, iOS (Pot is designed at 390 × 844). Each screen cited below was judged from its image. Links open Mobbin.
>
> **Notation:** `token` = a tokens.json name. Type styles: `balance-hero`, `title`, `heading` (Gabarito); `body`, `body-sm`, `label`, `amount` (Figtree). ⓟ = a proposed new copy key (some come from frontend-architecture §15 Q11). ⚠️ = unverified. Contrast ratios are computed from tokens.json with the WCAG 2.x formula.

## Shared parts used below

- **Primary button:** `brand` fill with `on-brand` text in `label` style, 52 px tall, `radius-md`, full width. Day adds a 1 px `brand-deep` border (marigold on `surface` is only 1.79:1). Pressed state is `brand-deep`. Focus is a 2 px `focus` ring with a 2 px offset. **Secondary:** `surface` fill, 1 px `line-strong` border (3.52:1 on `surface`), `ink` label, 48-52 px.
- **Pot card:** a cover tile (the Pot's gradient with its emoji, `radius-lg`), then the name in `title`, the seat row, a `body-sm` `ink-muted` label, the amount in `balance-hero` `ink`, and the GoalBar (10 px, `radius-pill`, `brand` on `brand-soft`) with its text twin.
- **Seat row:** 32 px avatars in `member-n` (join order) with `on-brand` initials and a 2 px ring in the parent's surface color, overlapping by 8 px. One dashed "You" seat follows (1.5 px dashed `line-strong`).
- **ProgressSteps:** a vertical list.
  - Done: a 20 px `approved` check, with the label and time in `body-sm` `ink-muted`.
  - Current: the typing dots (three 6 px `ink` dots), the label in `label` `ink`, and a `body-sm` helper.
  - Next: a 12 px hollow `line-strong` circle and an `ink-muted` label.
  - A 2 px `line` connector turns `approved` once a step is done. Use `aria-current="step"` and one polite announcement per change.
  - The dots pulse for at most 5 s, then hold still (WCAG 2.2.2, ux-spec §7.6).
- **Copy button:** the label swaps in place to "… copied" with a check for 2 s (icon and word). That swap is the only announcement, with no toast on top.
- **Callout:** `surface-sunken`, `radius-md`, `space-3` padding, a 20 px icon in `ink`, `body-sm` `ink` text. The brand has no warning token, so warnings use an `ink` icon and words; `declined` stays for failures.
- **Sheet:** `surface` with `radius-lg` top corners and `shadow-sheet`, a grabber and a visible ✕ (44 px). Focus goes to the title, and height is at most 92 dvh. From `bp-md` it becomes a `container-flow` (440 px) dialog. It enters in 360 ms with `ease-enter` and leaves in 280 ms; with reduced motion, a 120 ms fade.
- **Token pairs to respect (computed):**
  - Day `approved` (4.35:1) and `declined` (4.48:1) fail AA on `brand-soft`, so only `ink` or `ink-muted` text goes there (13.06:1 and 5.33:1).
  - Day `on-brand` on the pressed `brand-deep` is 4.33:1, just under AA.
  - Night `focus` (#FFC94D) on `brand` is 1.17:1, so the 2 px offset carries the focus ring on marigold buttons.

## 1. From the group chat to the landing

### Invite link preview in the chat (`/j/[slug]` metadata and `opengraph-image`, ux-spec §2, §6.1 step 0)

- **Job:** among photos in a busy chat, the preview must say "a real Pot called Lisbon Trip, with friends already in it", and make the tap feel safe.
- **References:** Mobbin has no captures of link previews inside a chat, so the frame comes from your Web-icons mockup. These two screens show how other apps design the card itself.

| App | Screen | What to borrow | What to leave |
|---|---|---|---|
| Bluesky | [Starter pack invite](https://mobbin.com/screens/20aa08e2-cecf-4c60-8a37-ed1f6a4a3985) | A generated share card: a row of avatars, a bold title and a small "on Bluesky" line on a branded background. | The photo collage behind it, which is unreadable at thumbnail size. |
| Lapse | [Roll Code](https://mobbin.com/screens/49e299a6-fbb5-4cfa-ace7-3085c06f60d5) | The group's emoji as the visual anchor, and the promise "No download required. Even friends not on Lapse can join!" | The tooltip floating over the content. |

- **Pot version** (a 1200 × 630 `ImageResponse`):
  1. A full-bleed `brand` background, as in your preview ("marigold so it stands out between photos").
  2. The cover tile, centred inside the middle 630 × 630 square, because some chats crop previews to a small square: 280 px, with 22% corners like the logo tile, and the emoji at 150 px on the Pot's gradient. At thumbnail size this tile is all that's left, so it has to work alone.
  3. Under it, centred: the Pot name in Gabarito 800 at 64 px in `on-brand` (8.88:1 on marigold), two lines at most.
  4. A bottom row of initials-only avatars (48 px, `member-n`, with a 4 px `surface` ring so `member-1` stays distinct from the marigold) and "3 friends are in" (ⓟ `og.members`) in Figtree 600 at 32 px `on-brand`.
  5. `pot-glyph-eggplant` with the wordmark, 48 px tall, bottom left.
  6. Metadata:
     - `og:title` = `landing.title` ("Maya invited you to Lisbon Trip", from `?i=`), falling back to "Join Lisbon Trip on Pot";
     - `og:description` = `landing.trust`;
     - `og:site_name` "Pot";
     - `robots` set to noindex.
  - **States:**
    - Pot closed: the second line reads "Closed" (ⓟ `og.closed`).
    - Unknown slug: the static brand `og-image.png`, titled "Pot".
    - Image fails: the platform shows only the title, which still names the inviter and the Pot.
  - **Motion:** none.
  - **Copy keys:** `landing.title`, `landing.trust`, `share.message`; ⓟ `og.members`, `og.closed`.
- **Watch-outs:**
  - No balance in the image. Platforms cache previews for days, and a stale "$300" would contradict the live landing (frontend-architecture §2.5, Q3).
  - Initials only in the image, no names (review-security M-7, rev4).
  - Text on marigold is always `on-brand`, never white. Marigold is the background here, not text, so the "never as text" rule holds.
  - frontend-architecture §2.5 loads Geist into `ImageResponse`. With the brand on Gabarito and Figtree, it should load their static TTFs instead.
  - `emoji: 'twemoji'` draws Twitter-style emoji, while iOS shows Apple's on the landing, so the cover looks slightly different in the chat and on the page (open question 9).
  - Your mockup's chat message ("Join our Lisbon trip Pot, $150 each") includes the share amount; `share.message` doesn't. Proposed ⓟ `share.message.each`: "Join our {potName} Pot, {suggested} each: {link}".

### Invite landing (`/j/[slug]`, ux-spec §4.1)

- **Job:** within 5 seconds Leo must see who invited him, that Lisbon Trip is real money among real friends, that no one can take it out alone, and that one tap gets him in.
- **References:**

| App | Screen | What to borrow | What to leave |
|---|---|---|---|
| yope | [Invite 4 more friends](https://mobbin.com/screens/b8e0f240-a969-41bb-af3a-4bb5d9d80499) | A row of seats: filled avatars plus dashed empty circles, so who's in, and where you fit, reads at a glance. | The dark gradient and the "better with a gang" slang. |
| Cash App | [Pool page ("Add people" flow)](https://mobbin.com/flows/c614b77e-7697-4656-a43b-e9eaadcf349e) | Balance and goal as one big number with "of $100 goal" under it; the empty-state line "No activity yet—be the first to contribute!" | The 300 px ring that pushes the buttons to the bottom edge; two equal black and grey buttons. |
| Monzo | [Creating a running split](https://mobbin.com/flows/598bb5e7-0ead-43fc-acfb-981b3f0ee455) | The guest promise "If they don't have Monzo they'll join as a guest on the web browser." Pot's equivalent: "No app to download." | The contact picker; Pot's invite is a link. |
| Zocdoc | [Sign up](https://mobbin.com/screens/a89faf81-6fad-427c-a1aa-13b6961d5ad6) | A quiet trust link at the very bottom ("Learn how Zocdoc protects your privacy"). | The email-first form and the Apple button (D-20). |

- **Pot version** (390 × 844; Night swaps tokens only):
  1. `ground` page with a 48 px (`space-12`) top margin and `pot-lockup-on-light`, 96 px wide, centred.
  2. Cover tile: full width, 140 px, `radius-lg`, gradient with the emoji at 64 px. Draw it in CSS so the 1.5 s first paint needs no image.
  3. H1 in `title` `ink`, centred: `landing.title` "Maya invited you to Lisbon Trip".
  4. The seat row, with `landing.members` "Maya and Sam are in" in `body-sm` `ink-muted`.
  5. The Pot card body (`surface`, `radius-lg`, `shadow-card`, `space-4` padding): `pot.hero.label` "In the Pot", "$300" in `balance-hero`, the GoalBar, then `landing.goal` "$300 of $450 collected" and ⓟ `landing.share` "Everyone's chipping in $150". The card's accessible name is `landing.balance` ("Lisbon Trip has $300 from 2 friends"), as in the VoiceOver path in ux-spec §8.
  6. A Callout with a `shield-check` icon and `landing.trust`. Under it, `landing.rules_peek` and `landing.expiry` in `body-sm` `ink-muted`.
  7. A sticky CTA zone (`ground`, `space-4` padding plus `safe-area-inset-bottom`; its height is reserved so hydration doesn't shift it). Top to bottom:
     - [Join with Google], the one primary, with the Google "G" on a 24 px white disc;
     - `landing.cta.more` "More ways to join", a `label` text button 44 px tall;
     - `landing.legal` plus "No app to download.", in `body-sm` `ink-muted`;
     - a "How Pot keeps money safe" link that opens the rules (ⓟ `landing.how_safe`).
  - **States:**
    - Loading: server-rendered, so no skeleton. The client island refreshes the balance and members every 3 s in the background.
    - Empty ($0 in the Pot): `landing.balance.zero` "Lisbon Trip is just getting started" replaces the amount, and the GoalBar shows its empty track with "$0 of $450 collected".
    - Signed in: `landing.signed_in_as` "Join as m•••@gmail.com?", then [Join Lisbon Trip] and a "Use another account" link (2 taps).
    - In-app browser: a Callout above the buttons with `landing.inapp.title` and `.body`, plus [Copy link], which copies the link with its `#secret`. Google and passkey are hidden, so [Continue with email] becomes the primary.
    - Preview builds: `landing.cta.dev` [Join with a test account] as a secondary. It becomes the primary where Google is off (hallway round B).
    - Signing in: the page dims behind a `surface` card, "Continue in the sign-in window" (ⓟ `auth.continue_in_window`), with typing dots and [Cancel].
    - Sign-in error: shown inline under the button with a `declined` x icon: `auth.popup_blocked`, `auth.failed` or `auth.service_down` (`role="alert"`). If the person cancels, nothing is shown.
    - Invite error: a full-screen `invite.*` state with `pot-glyph-eggplant` at 96 px, a `title`, `body` text and one button. For `invite.already_member` the button is [Open Lisbon Trip] as the primary.
    - Offline: `invite.network_error` and [Try again]; the server-rendered Pot stays.
    - No active `?i=` (rev4 privacy): the H1 reads "You're invited to Lisbon Trip" (ⓟ `landing.title.fallback`), and the seats become a count ("3 people are in") with no names.
  - **Motion:** none on first paint, for speed and no layout shift. The GoalBar renders already filled.
  - **Copy keys:** `landing.title`, `.balance`, `.balance.zero`, `.goal`, `.members`, `.trust`, `.rules_peek`, `.expiry`, `.cta.google`, `.cta.more`, `.cta.dev`, `.legal`, `.signed_in_as` (with `.cta` and `.switch`), `.inapp.*`; `pot.hero.label`; `auth.*`; `invite.*`. ⓟ `landing.share`, `landing.how_safe`, `landing.title.fallback`, `auth.continue_in_window`.
- **Watch-outs:**
  - Your mockup shows [Continue with Apple]. Apple is mainnet-only and hidden on testnet (D-20, ux-spec §4.1), so it should come out of the mockup.
  - Your mockup says "Continue with Google", while the spec says "Join with Google" (sign in and join in one tap). Google's sign-in branding rules also limit the label and logo treatment ⚠️ (open question 2).
  - "No crypto needed" puts the word crypto on the first screen people see. "No app to download." reassures without it.
  - Status colors fail on `brand-soft` in Day, so anything on the cover or a `brand-soft` area is `ink`. `member-1` on `brand-soft` is 1.18:1, so avatars keep their ring.
  - "More ways to join" and the small links need 44 px hit areas with 8 px between them (WCAG 2.5.8).
  - In Night, `link` is #FFC94D, close to marigold. Right under the marigold button it reads as a second marigold action (open question 10).
  - `landing.share` is new. The spec's landing has no "your share" line, but your mockup has one, and it answers "what do you need from me?" (ux-spec §1.1 principle 1).

## 2. Sign-in, setup and "You're in"

### Sign-in: more ways to join (sheet on `/j/[slug]`, ux-spec §4.2, §5.1, §5.3)

- **Job:** let someone who won't use Google choose email or a passkey without losing sight of the Pot, and let crypto users find "I have a NEAR wallet" without it getting in anyone else's way.
- **References:**

| App | Screen | What to borrow | What to leave |
|---|---|---|---|
| Notion | [Sign-up options](https://mobbin.com/screens/249f6555-6fc6-4931-adce-d2b4302e8ce1) | Passkey as an equal row with its own person-and-key icon; icons left-aligned in every row. | Six equal provider buttons above an email field: too many choices and no context left. |
| StubHub | [Create an account](https://mobbin.com/screens/f2b7b306-a28c-4700-b829-8cfc922091da) | "Continue with Passkey" as an outlined secondary button with an icon. | A name, phone and password form before the person has seen anything of value. |
| Swarm | [Get started with your email](https://mobbin.com/screens/c575d0d1-4c1c-41eb-b55f-e30ecaaac8d8) | Alternatives below an "or" divider; the terms line small at the bottom. | Facebook and Apple, which Pot doesn't offer. |
| Jobber | [Create an account](https://mobbin.com/screens/2de20a51-bd75-4b2a-98c4-abb6acee27c5) | Every action in the lower half, within thumb reach. | Password rules shown up front ("Minimum of 6 characters"). |

- **Pot version:**
  1. A Sheet titled "More ways to join Lisbon Trip" in `heading` (ⓟ `landing.more.title`).
  2. Two 56 px rows (`surface`, 1 px `line-strong`, `radius-md`, a 24 px `ink` icon, `label` `ink` text). Neither is marigold, because they are equal choices.
     - `mail`: `landing.more.email` "Continue with email".
     - `key-round`: `landing.more.passkey` "Use a passkey", with "Face ID, Touch ID or your screen lock" in `body-sm` `ink-muted` (ⓟ `landing.more.passkey_hint`).
  3. A `line` divider, then `landing.more.wallet` "I have a NEAR wallet" as a `body-sm` text button, 44 px tall.
  4. A `body-sm` `ink-muted` footer: "A sign-in window opens next. Pot never sees your password." (ⓟ `landing.more.note`).
  - **States:**
    - Tapping a row leads to the same "Continue in the sign-in window" state as Google.
    - The wallet link opens NEAR Connect's own picker; cancelling returns here.
    - Errors show inline (`auth.*`).
    - In-app browsers hide the passkey row, and so does a NEAR Auth tenant without passkeys.
    - A lost session later reuses this layout with one primary: `setup.welcome_back` and [Continue with Google].
  - **Motion:** the shared Sheet motion. On close, focus returns to "More ways to join".
  - **Copy keys:** `landing.cta.more`, `landing.more.email`, `.passkey`, `.wallet`, `auth.*`, `setup.welcome_back`; ⓟ `landing.more.title`, `.passkey_hint`, `.note`.
- **Watch-outs:**
  - Email with password, and passkeys, run on NEAR Auth's hosted pages, not in Pot. So there can be no inline email field (as in Swarm) and no styling. The hosted page also decides between sign-in and sign-up, so the row says "Continue", never "Sign up".
  - On the shared testnet client those hosted pages are branded "Example" (kb/near-auth.md). H-01's dedicated client id matters for design too.
  - Google, email and passkey may create separate accounts (an open question for the auth owner), so the sheet must not promise a single account.
  - "wallet" is banned in main paths, and `landing.more.wallet` isn't on the ux-spec §1.2 whitelist (open question 4).
  - No Apple on testnet (D-20).

### Setting up your Pot account (on `/j/[slug]`, ux-spec §4.2)

- **Job:** make a 3-12 second wait feel short and safe: real progress, plain words, and the Pot Leo is joining still on screen.
- **References:**

| App | Screen | What to borrow | What to leave |
|---|---|---|---|
| Rocket Money | [Preparing your account](https://mobbin.com/screens/da08a12d-7485-4319-aa2c-579422bd1482) | A 3-line checklist: done lines muted with a check, the current line in full ink ending in "…", the next one faded. | Stages that aren't real events ("Finding potential savings…"). |
| Life Reset | [Creating your plan](https://mobbin.com/screens/10724d8a-b463-414e-87f6-c82f87fda797) | A vertical 3-step stepper in a card: a filled check, a spinner and a hollow circle, joined by a line. | The dark, theatrical styling. |
| Stake | [Creating account](https://mobbin.com/screens/e77b502c-73f1-4508-9a71-73d6f64792a3) | A time promise under the label ("This can take up to 1 minute"). | The swipe-to-learn carousel, which asks for effort during a short wait. |
| Jobber | [Welcome, setting up](https://mobbin.com/screens/7354de3c-549c-495f-ad54-d1fb94812d86) | A greeting by name while it works ("Welcome, alexsmith!"). | The full-bleed photo. |
| World App | [Creating account](https://mobbin.com/screens/0d318d8e-b845-4c6c-84c0-321f7c22d7c5) | Nothing. | "Please don't close the app." makes a short wait sound risky. |

- **Pot version:**
  1. Same route. The cover, H1 and Pot card stay where they are (no navigation, no jump).
  2. The CTA zone becomes a `surface` card (`radius-lg`, `shadow-card`, `aria-busy="true"`) in the bottom 40%. It holds:
     - "Welcome, Leo" in `heading` (ⓟ `setup.greeting`; first name from Google, left out if unknown);
     - ProgressSteps: "Setting up your Pot account" (`setup.progress.1`), "Joining Lisbon Trip" (`setup.progress.2`), "You're in";
     - "Usually under 10 seconds" in `body-sm` `ink-muted` (ⓟ `setup.time`), replaced by `setup.slow` at 10 s.
  3. No button while it works.
  - **States:**
    - Existing account on a new phone: "Confirm it's you" opens over the card, then the steps resume.
    - `setup.error.relayer` or `setup.error.join`: the current step becomes a `declined` x icon with the message and a primary [Try again] (retries are idempotent).
    - Invite fails mid-join: its `invite.*` screen.
    - Offline: `offline.banner` at the top; the current step reads "Waiting for a connection" (ⓟ `setup.offline`) and resumes by itself.
  - **Motion:** dots on the current step only. A finished step's check pops with `spring-pop`, and the connector fills in 280 ms. With reduced motion, the dots stay still and checks appear instantly. Focus stays where it is until success.
  - **Copy keys:** `setup.progress.1`, `.progress.2`, `setup.slow`, `setup.error.relayer`, `.error.join`, `offline.banner`; ⓟ `setup.greeting`, `setup.time`, `setup.offline`.
- **Watch-outs:**
  - Each step follows a real event (session created, then joined); never invent stages.
  - "Under 10 seconds" rests on ⚠️ estimates (3-8 s setup plus up to 4 s to join). Confirm it after the relayer measurement, or drop the number.
  - "Pot account" is the only name used: no wallet, no NEAR, no "creating keys".
  - No burst at the end; the next screen is the payoff.
  - Hallway round A simulates 6 s here, so the design must hold up at 6 s.

### You're in (`/p/[slug]` with a one-time sheet, ux-spec §4.2)

- **Job:** tell Leo he's a member and hand him the one next step, adding his $150 share, with an easy "not now".
- **References:**

| App | Screen | What to borrow | What to leave |
|---|---|---|---|
| Patreon | [You're in!](https://mobbin.com/screens/7bd322ba-e3b2-4ded-9534-46dea286055e) | "You're in!" as a short sheet over the page you just joined, so the place is visible behind it; an avatar on top; one full-width button. | The vague "Continue". Pot's button names the action and the amount. |
| pillowtalk | [Congrats you are in](https://mobbin.com/screens/4ca8084a-482f-4951-b1eb-28e624fb167d) | A celebration made of type size alone: a giant "in", no particles. | A full-screen takeover with no context. |
| Locals | [Joined this club](https://mobbin.com/screens/4118f3e0-d25d-49de-8333-5984d622fb32) | Nothing. | Confetti of brand coins. Pot keeps its single burst for "Approved by Pot rules". |
| Goodreads | [Success alert](https://mobbin.com/screens/f6aed3ae-b151-486d-9f53-b8b8213a16cb) | Nothing. | A system-style "Success! … OK" alert, a dead end with no next step. |

- **Pot version:**
  1. Behind the sheet, the live Pot (`/p/lisbon-trip`, with the link fragment stripped): BalanceHero "$300", the GoalBar two-thirds full, the tabs visible.
  2. The sheet, centred, top to bottom:
     - the seat row from the landing, now with Leo's `member-3` avatar in the "You" seat;
     - the H1 "You're in!" in Gabarito 800 at 44/48 (the `balance-hero` size), `ink`;
     - `setup.success.body` "Welcome to Lisbon Trip. Everyone's chipping in $150." in `body` `ink-muted`;
     - the primary [Add my $150 share] (`setup.success.cta`);
     - "Not now" (`setup.success.later`), a 44 px link.
  3. If no goal is set: "Welcome to Lisbon Trip." and [Add money] (ⓟ `setup.success.cta_plain`).
  - **States:** success only. Offline, the button explains `add.offline` when tapped.
  - **Motion:** Leo's avatar slides 16 px into the empty seat and fades in (280 ms, `ease-enter`), and the member count changes with it. No particles. With reduced motion, a 120 ms fade. Focus moves to the H1, with one polite announcement: "You're in! Welcome to Lisbon Trip. Everyone's chipping in $150."
  - **Copy keys:** `setup.success.title`, `.body`, `.cta`, `.later`; ⓟ `setup.success.cta_plain`.
- **Watch-outs:**
  - The 600 ms burst belongs to "Approved by Pot rules" (brand motion rule). Here the type is the celebration, and "You're in!" is the flow's one exclamation (ux-spec §1.4).
  - [Add my $150 share] opens the Add sheet prefilled ($150, Demo dollars on testnet), which keeps flow F2 at 2 taps.
  - frontend-architecture §5.1 shows the success inside the landing's join machine, then strips the fragment with `replaceState`. A sheet over the real Pot needs an actual navigation to `/p/[slug]` with a one-time sheet state. If that flashes, transform the landing's CTA card into the success state instead.
  - Leo's seat color stays his: `member-n` by join order, on every screen.

## 3. Create and share

### Create Pot (`/pots?sheet=create`, ux-spec §4.12)

- **Job:** Maya gets a real Pot in under a minute: a name and a look her friends will recognize in the chat, Trip rules chosen for her, and an optional "$150 each".
- **References:**

| App | Screen | What to borrow | What to leave |
|---|---|---|---|
| KOHO | [Create a group](https://mobbin.com/screens/bf902e0d-63d5-41e6-b45c-cb1903a1abfc) | The emoji tile above the field follows the purpose; helper text with an example ("Miami 2024") and a 0/20 counter; purpose chips with emoji, ✈️ Trip selected. | Five purposes; Pot has one live preset. |
| Luma | [New group chat](https://mobbin.com/screens/7270fba2-748f-47d0-b240-2e49a261a355) | A big round emoji with an edit badge and a row of color swatches (selected = ring), which is exactly "emoji + gradient". | The description field. |
| Wise | [What's this jar for?](https://mobbin.com/screens/e81a35b4-cfeb-46a3-bb85-ff16517cc1d4) | A live preview of the result above the inputs, updating as you type. | An icon set in place of emoji. |
| Monzo | [Name your Pot](https://mobbin.com/screens/75e96ac3-31aa-497d-9158-ecfe2d41182f) | The cover tile with a pencil badge. | Stock illustrations, and name chips that would look like presets next to Pot's preset step. |
| Zopa | [What are you saving for?](https://mobbin.com/screens/5fe8674d-790c-460d-b161-d261666820dd) | Outlined option cards with line icons; the chosen one gets a heavier ink border. | The savings-goal framing. |
| Messages | [Group name and photo](https://mobbin.com/screens/80b4f7ff-2f17-43e2-b516-409997c854d4) | A grid of emoji on tinted circles, ready to tap. | Camera and photo options (covers are emoji only, D-61). |

- **Pot version** (a full-height sheet on phones):
  - **Step 1, `create.step1.title` "Name your Pot":**
    1. ✕ on the left and "Step 1 of 2" on the right, in `body-sm` `ink-muted` (ⓟ `create.step_of`); the title in `title`.
    2. A live preview: a small Pot card (56 px cover, the name in `heading`, "Just you so far" in `body-sm`), captioned "This is what friends see in the chat." in `body-sm` `ink-muted` (ⓟ `create.preview_hint`).
    3. "Pot name" in `label` over a `surface-sunken` input: 52 px, `radius-sm`, 1 px `line-strong`, 16 px `body` text, placeholder `create.name.placeholder`, `enterKeyHint="done"`, and a counter ("11/40").
    4. Cover (`create.cover`):
       - a 56 px emoji button. It opens a grid of about 24 emoji on tinted circles, plus "Other…", a one-character field that brings up the system emoji keyboard;
       - six gradient swatches (32 px, with 44 px hit areas; selected = a 2 px `ink` ring and a check).
    5. The primary [Next] (`create.cta.next`), raised above the keyboard with `--drawer-keyboard-inset`.
  - **Step 2, `create.step2.title` "How should it work?":**
    1. The Trip card, selected: `brand-soft` fill, 2 px `ink` border and a check. "Trip" in `heading`, then the three `create.preset.trip` lines in `body`, each with a line icon ("Up to $100 without asking", "Bigger spends need most of the group", "Leftovers back at the end").
    2. Club and Team cards (`create.preset.club`, `.team`): `surface-sunken`, `ink-muted` text, a "Coming soon" pill, `aria-disabled`, no chevron.
    3. `create.goal.label` "Everyone chips in (optional)": a switch. When on, a "$150 each" chip opens the amount keypad.
    4. The primary [Create Pot] (`create.cta`).
  - **Step 3:** the sheet's content becomes ProgressSteps: "Creating Lisbon Trip", with "Free: we cover the setup." as its helper (`create.progress`), then "Ready to share". `create.slow` appears at 8 s; the budget is 15 s. On success the Share sheet opens with a `create.success` toast.
  - **States:**
    - `create.error.name` shows inline under the field (`declined` icon and words, `aria-describedby`).
    - A taken slug gets a suffix silently.
    - `create.error.relayer` comes with [Try again], keeping what Maya entered.
    - `create.error.limit` replaces the button.
    - Offline, [Next] still works, while [Create Pot] is disabled and explains why when tapped.
  - **Motion:** steps slide 280 ms (`ease-standard`), and the preview crossfades emoji and gradient changes in 120 ms. With reduced motion, fades only. No burst.
  - **Copy keys:** `create.step1.title`, `create.name.placeholder`, `create.cover`, `create.step2.title`, `create.preset.trip`, `.club`, `.team`, `create.goal.label`, `create.cta.next`, `create.cta`, `create.progress`, `create.slow`, `create.success`, `create.error.relayer`, `.limit`, `.name`; ⓟ `create.step_of`, `create.preview_hint`.
- **Watch-outs:**
  - `create.cover` says "Pick an emoji or photo", but covers are emoji plus gradient only (D-61). It should read "Pick an emoji".
  - Build the six gradients from the `member-n` tints and `brand-soft`, never marigold to marigold: a marigold block reads as a button.
  - Disabled preset cards must not look tappable. Hiding them is the alternative (open question 8).
  - Selected swatches and cards need a check icon, not just color (WCAG 1.4.1).
  - "Free" appears once, here (ux-spec §13 Q10), and not again in Share.
  - Browsers have no emoji-picker API, so the grid of chosen emoji plus "Other…" is the realistic version.

### Share and invite (`/p/[slug]?sheet=share`, ux-spec §4.13)

- **Job:** get the link into the group chat in two taps, with honest expectations: who can join, until when, and how many more people.
- **References:**

| App | Screen | What to borrow | What to leave |
|---|---|---|---|
| Spotify | [Invite friends to your Jam](https://mobbin.com/screens/2c09d153-6448-472b-bfd1-4b715a52111e) | One big [Share link] as the hero, with the QR as a small thumbnail lower down ("Tap on the code to enlarge it"). | Auto-invite for people nearby (the web has no Bluetooth). |
| Strava | [Invite to Club](https://mobbin.com/screens/90c331c7-94e7-463d-ba98-b3d3a2033aa8) | The copy action confirms in place: the icon tints and its label changes to "Copied". | The follower search list. |
| Bluesky | [Starter pack invite](https://mobbin.com/screens/20aa08e2-cecf-4c60-8a37-ed1f6a4a3985) | A preview of the exact card people will see, followed by [Share link], [Share QR code] and [Save image]. | The busy photo collage in the card. |
| Lapse | [Roll Code](https://mobbin.com/screens/49e299a6-fbb5-4cfa-ace7-3085c06f60d5) | The QR on a branded card with the group's emoji in the centre; the short link with a copy icon. | The tooltip covering the steps. |
| Discord | [New group](https://mobbin.com/screens/0d8f136d-72a9-4498-97da-4a017c1e71ba) | "Copy Invite Link" with the expiry as its sub-label ("Invite links expire in 24 hours"), and a small "Link Copied!" pill at the top. | Nothing. |
| Cash App | [Share a link ("Add people" flow)](https://mobbin.com/flows/c614b77e-7697-4656-a43b-e9eaadcf349e) | One sentence on who can pay ("Collect money with anyone who has Cash App, Apple Pay, or Google Pay."), above equal [Copy link] and [Share] buttons. | Searching people by $cashtag. |

- **Pot version:**
  1. After Create only, a toast at the top: an `approved` check and `create.success` "Lisbon Trip is ready".
  2. `share.title` "Invite friends to Lisbon Trip" in `heading`.
  3. A chat preview: the link-preview card in miniature inside a `surface-sunken` chat bubble, as in your Web-icons mockup. Below it, "This is what your group will see." in `body-sm` `ink-muted` (ⓟ `share.preview_hint`).
  4. `share.body` in `body` `ink`.
  5. `share.expiry` "Link works until Nov 8 · 10 more people can join with it", in `body-sm` `ink-muted` with a clock icon.
  6. The primary [Share link] (`share.cta.share`): Web Share with `share.message`. Where Web Share is missing, it copies the link instead.
  7. Two equal secondaries:
     - [Copy link] (`share.cta.copy`), using the Copy button swap to "Link copied";
     - [Show QR code] (`share.cta.qr`). It opens a white plate (`radius-lg`, 240 px, `ink` modules, the Pot emoji on a 56 px white disc in the centre), with the short link under it as the text version and "Friends can scan this with their camera." in `body-sm`.
  8. `share.cta.rotate` "Make a new link", a link-style button, opens the `share.rotate.confirm` dialog.
  - **States:**
    - Link expired or used up: a `declined` x icon with "This link stopped working" (ⓟ `share.dead`), and [Make a new link] becomes the primary.
    - The invite secret was made on another phone: "Make a new link to share from this phone" (ⓟ `share.other_device`), with the same primary (frontend-architecture §5.10).
    - Copy failed: `share.copy_failed`, with the link shown as selectable text.
    - Offline: the link and QR still work, and Share falls back to Copy.
  - **Motion:** the label swap is a 120 ms crossfade; the QR plate opens with a 280 ms height reveal. With reduced motion, both are instant.
  - **Copy keys:** `share.title`, `share.body`, `share.expiry`, `share.cta.share`, `.copy`, `.qr`, `share.copied`, `share.copy_failed`, `share.cta.rotate`, `share.rotate.confirm`, `share.message`, `create.success`; ⓟ `share.preview_hint`, `share.dead`, `share.other_device`.
- **Watch-outs:**
  - The QR stays dark on white in Night, because many scanners fail on inverted codes. The plate is the one white surface in Night.
  - The URL carries `?i=` and the `#secret` (about 130 characters), so the code is dense. Test scanning at 240 px, and keep the emoji disc small at error-correction level H ⚠️.
  - Copy, Share and the QR must all keep the `#fragment` (frontend-architecture §2.5).
  - The in-place "Link copied" is the announcement. Don't also fire the `share.copied` toast (one announcement per event, ux-spec §8).
  - A link works like a ticket: anyone holding it can join (rev4, H-1). Keep "Share it only in your group chat" and the expiry in view.

## 4. Money in

### Add money (`/p/[slug]?sheet=add`, ux-spec §4.7)

- **Job:** Leo checks the amount (prefilled with his $150 share), sees where it comes from and what the Pot will hold afterwards, and adds it in one tap.
- **References:** these go beyond the kb ones (Cash App, Chime, Phantom, Revolut, Dave, Believe).

| App | Screen | What to borrow | What to leave |
|---|---|---|---|
| Public | [Funding](https://mobbin.com/screens/2eefe6eb-c5f4-4c54-bc7f-7b32579ccd4f) | The source as one compact row between the amount and the keypad ("Payment method · Checking ⌄"); a bottom bar that repeats the amount next to the button. | The frequency and account rows. |
| Klarna | [How much would you like to spend?](https://mobbin.com/screens/e86dfc7e-4038-4ac1-8393-1ed2651b7485) | The available amount as a tappable line under the figure ("Purchase power is $1,000 ›"); the button directly on top of the keypad. | The percentage chips. |
| Base | [Buy](https://mobbin.com/screens/fddc24b9-e05e-4fb2-8830-9e3d5724cea2) | A summary row above the action ("Deposit With › Debit Card · Total $0.00"). | "USDC" as the visible label, and the swipe-to-deposit slider (a drag-only control, WCAG 2.5.7). |
| 7-Eleven | [Enter custom amount](https://mobbin.com/screens/3a7c2ec3-6390-4b83-907b-855281320390) | The limit as a small pill under the amount ("$1.00 Minimum"). | The underlined field. |
| GoPay | [Payment methods](https://mobbin.com/screens/fb70bed4-d2b8-4e3e-8c37-1c77554d6017) | Radio rows with the balance under each method's name, a colored status word when it's short ("Low Balance"), and the fix right there ("Top up"). | Card numbers; "Swipe left to set your default method". |
| Bolt Food | [Payment](https://mobbin.com/screens/511687df-404d-4f16-a436-e0591aa3f1ac) | "What is Bolt balance?" as a help row, not a banner. | Nothing. |

- **Pot version** (a Sheet, `container-flow`, at most 92 dvh):
  1. Grabber, `add.title` "Add money to Lisbon Trip" in `heading`, and ✕.
  2. The amount (`role="status"`): `add.amount.label` in `body-sm` `ink-muted`, then "$150" in `balance-hero` `ink` with tabular figures. It shrinks to 36 px past 7 characters.
  3. Chips (44 px, `radius-pill`, `surface-sunken`; selected = `brand-soft` with a check): [Your share $150] (`add.chip.share`), [$50], [$100].
  4. The source row (56 px, `surface-sunken`, `radius-md`): "From" (`add.source.label`) in `body-sm` `ink-muted`, then "Demo dollars (test money)" in `label` `ink`, a neutral "Test" pill and a chevron. The chevron opens a radio sub-sheet:
     - `add.source.demo` "Demo dollars (test money)", testnet only and preselected;
     - `add.source.pot_dollars` "Pot dollars you have · $40.00". When that's not enough, a `declined` icon and "Not enough for $150" (ⓟ `add.source.short`);
     - `add.source.other_wallet` "Another wallet or exchange", which leads to the deposit flow (Phase 2).
  5. First time only, a Callout with `add.usdc_note` and [Got it] (`add.usdc_note.ok`). After that, an "About Pot dollars" help row.
  6. An outcome line above the button, in `body-sm` `ink-muted`: "Lisbon Trip will have $450. Goal reached." (ⓟ `add.after`).
  7. The primary [Add $150] (`add.cta`), resting on the keypad.
  8. The keypad on `surface-sunken`:
     - 64 × 56 keys, with digits in Gabarito 700 at 26 px (the `title` style);
     - a 120 ms `line` flash on press;
     - accessible names "1"…"9", "decimal point" and "delete", with physical keys working on desktop;
     - `safe-area-inset-bottom` padding below.
  - **States:**
    - $0: the button is disabled (`surface-sunken` fill, `ink-muted` label). No marigold until the amount is valid.
    - Optimistic: the sheet closes at once. The feed gets "Adding $150…" (`add.sending`) with `chip.sending` (small typing dots plus "Sending…"), and the hero shows `pot.hero.pending` "+$150 on the way" in `ink-muted`.
    - Success: the toast `add.success` "Added. Lisbon Trip now has $450.", and the GoalBar fills. The first time, the install coach card follows.
    - Not enough Pot dollars: inline under the amount, a `declined` icon and `add.error.insufficient_own`. The amount is kept.
    - Relayer or generic error: a toast (`add.error.relayer` or `add.error.generic`) with Details. The amount is kept if the sheet reopens.
    - Arrived but not added: a persistent Pot card, `add.finish_pending.*`, with [Finish adding $150]. That card takes the screen's marigold, so the hero's [Add money] becomes secondary while it shows.
    - Needs a signature: "Confirm it's you" comes first.
    - Offline: `add.offline`, and the button is disabled.
  - **Motion:** the shared Sheet motion. Chips press to `scale(.97)` over 120 ms. On submit, the feed item slides in (280 ms) and the hero counts up over 500 ms. With reduced motion, color changes only and numbers update instantly. No burst.
  - **Copy keys:** `add.title`, `add.amount.label`, `add.chip.share`, `add.range`, `add.source.label`, `.demo`, `.pot_dollars`, `.other_wallet`, `add.usdc_note`, `.ok`, `add.cta`, `add.sending`, `add.success`, `add.error.insufficient_own`, `.relayer`, `.generic`, `add.finish_pending.title`, `.body`, `add.offline`, `pot.hero.pending`, `chip.sending`, `chip.sent`; ⓟ `add.after`, `add.source.short`.
- **Watch-outs:**
  - ux-spec §1.1 principle 6 (the outcome above the button, WCAG 3.3.4) isn't in the Add sheet's content list. `add.after` closes that gap (open question 5).
  - "Another wallet or exchange" contains "wallet", and `add.source.other_wallet` isn't whitelisted in ux-spec §1.2 (open question 4).
  - `add.usdc_note` is the only "USDC" outside the `xc.*` keys, and it's whitelisted.
  - Demo dollars must read as play money. The "Test" pill stays neutral (`surface-sunken`, `ink-muted`), never a status color.
  - No sliders and no swipe-to-pay. The button label always includes the amount, so voice control works (WCAG 2.5.3).
  - The amount display must fit at 320 px wide (WCAG 1.4.10).
  - Selected chips use `brand-soft` with a check, never `brand`: that's reserved for the button.

### Any-chain deposit: network and address (`/p/[slug]?sheet=add&src=xc`, ux-spec §4.8)

- **Job:** someone holding dollars in another app sends the right coin, on the right network, to the right address, and knows how long it will take.
- **References:**

| App | Screen | What to borrow | What to leave |
|---|---|---|---|
| PayPal | [Receive PYUSD: select network](https://mobbin.com/screens/8550a62a-e830-42fc-b8bb-9e9f675f1e34) | A mainstream network picker: one sentence on why, big rows with logos and names, and a "Network · Ethereum · Change" card that stays on the receive screen. | The words "blockchains" and "chain"; Pot says "network". |
| Coinbase | [Receive BTC](https://mobbin.com/screens/ac3257e5-0c9e-46e5-8d8d-7d0adb57c0cb) | The QR on a brand-colored card, the address shortened in the middle with a copy button, and three icon lines: what not to send, which network only, and how long ("Allow 31 min for processing"). | Coin-specific warnings Pot doesn't need. |
| Cash App | [Receive USDC](https://mobbin.com/screens/ffe644e0-472b-46c7-bfee-7e397b1ebf4a) | The network chip right under the QR ("Ethereum ⌄"), so the code and its network are read together; equal [Copy] and [Share] buttons. | The tiny monospace warning about losing funds, which nobody reads. |
| Blackbird | [Pay with USDC on Base](https://mobbin.com/screens/ac664326-e731-4f66-947c-0afd811582cd), [Copied](https://mobbin.com/screens/a74710fc-d518-40f8-93e6-52b55dfe94b7) | Plain numbered steps (copy, send USDC on Base, receive) and one copy button, confirmed by a "Copied" pill. | The all-caps "ONLY USE BASE - MAINNET WILL FAIL". |
| World App | [Receive on World Chain](https://mobbin.com/screens/064e0df7-c008-47e8-8a36-fb03413abad8) | The warning attached to the copy action ("Ok, copy my address"). | The extra screen and tap before copying. |
| OKX | [Select deposit network](https://mobbin.com/screens/b77bd777-a3ba-4da0-80ca-64b737de08f1) | Each network row states its minimum and how long it takes. | "Confirmations" and codes like "USDT-ERC20". |

- **Pot version** (inside the Add sheet, with a back arrow to the source picker):
  1. `xc.title` "Add from another wallet or exchange" in `heading`, with "Adding $150 to Lisbon Trip" in `body-sm` `ink-muted`.
  2. The network step: `xc.network.label` "Which network are you sending from?" in `label`, then four 56 px radio rows. Each has a 28 px logo, the name in `label`, and a time in `body-sm` `ink-muted`. Base, Arbitrum and Solana say "Usually under a minute"; Ethereum says "Slower: about 1 to 2 minutes" (measured medians 29, 18, 42 and 84 s, api-spec). A paused network is `ink-muted` and `aria-disabled`, with "Paused right now" (ⓟ `xc.network.paused`).
  3. The primary [Get address]. While it loads, typing dots in the button (`aria-busy`) and "Getting your address" (ⓟ `xc.quoting`).
  4. The address step:
     - `xc.instructions` "Send 150 USDC on Base" in `heading`, then `xc.instructions.min` "We'll accept 149.50 USDC or more." in `body-sm`;
     - the QR: a white plate (`radius-lg`, 220 px) with the network's logo in the centre, and under it a "Base" chip with "Change", which goes back to the network step;
     - `xc.address.label` "To this address" in `label`, over a `surface-sunken` row: tabular figures, shortened in the middle, with the first and last 4 characters in bold `ink` ("0x7a3F…91cE"), and a [Show all] toggle. A tip in `body-sm`: "After you paste it, check the first and last 4 characters." (ⓟ `xc.check_hint`);
     - a Callout with an `ink` alert-triangle icon: `xc.warning` "Only send USDC on Base. Other coins or networks may be lost." Add `xc.memo` when a memo is needed, and `xc.deadline` with a clock icon;
     - the primary [Copy Base address] (`xc.copy` with {network}), which swaps in place to `xc.copied` "Address copied";
     - below it, the stepper starts, collapsed, at "Waiting for your transfer" (next section).
  5. Testnet runs a simulated deposit: the QR shows a "Test only · Do not send" band and encodes "POT TESTNET DEMO - DO NOT SEND FUNDS". [Simulate sending $150] becomes the primary, and Copy is hidden (open question 7).
  - **States:**
    - Loading: typing dots.
    - `quote_failed`: a toast with [Try again].
    - `amount_too_low`: inline "Send at least {min}".
    - `chain_paused`: that network's row is disabled.
    - Offline: the address and QR stay usable, and the stepper pauses.
  - **Motion:** the steps slide over 280 ms; the copy swap takes 120 ms. With reduced motion, both are instant.
  - **Copy keys:** `xc.title`, `xc.network.label`, `xc.instructions`, `.min`, `xc.address.label`, `xc.copy`, `xc.copied`, `xc.warning`, `xc.memo`, `xc.deadline`, `xc.notify_ok`; ⓟ `xc.network.paused`, `xc.quoting`, `xc.check_hint`.
- **Watch-outs:**
  - `xc.*` is a deliberate lint exception: it must say "USDC" and the exact network name (ux-spec §1.2).
  - `xc.deadline` reads "Send within {minutes} minutes", but the D-50 deadline is 2 hours. Show hours once the value passes 60 minutes.
  - The QR stays dark on white in Night, with a small centre logo. Check that it scans with Coinbase, MetaMask, Phantom and an exchange app.
  - Network logos are other companies' trademarks: always show them with the name, never alone, and never recolored.
  - The warning icon is `ink`, not `declined`: a risk is not a failure, and the brand has no warning color.

### Any-chain deposit: DepositStepper (`/p/[slug]?sheet=add&src=xc&d=<id>`, ux-spec §4.8)

- **Job:** after sending, Leo sees where his money is, how long it usually takes, and that he can leave. If something goes wrong, he learns what happened, whether money moved and what to do.
- **References:**

| App | Screen | What to borrow | What to leave |
|---|---|---|---|
| Wise | [Adding 1 SGD](https://mobbin.com/screens/d7da9beb-2dd6-4e38-8efd-a08113f32614) | The model: done steps with a check and a timestamp, the current step bold with a filled dot, future steps muted, first-person lines ("We received your SGD"), and an Updates / Details switch. | [Cancel transfer]: a 1Click deposit can't be cancelled. |
| Marcus | [Track my transfer](https://mobbin.com/screens/0d72165f-a2d5-419d-91cc-cfd62115d7c1) | Expected times on future steps, and a short plain paragraph under the steps. | The legal fine print. |
| Bolt Food | [Arriving](https://mobbin.com/screens/9509b853-f44c-425e-81c0-c6e96efffe2c) | One big status word above the steps, readable at a glance. | Nothing. |
| Zomato | [Payment failed](https://mobbin.com/screens/2225c0f4-21e4-4ebb-a71f-1cf8aa070700) | A failure sheet that says whether money moved and by when ("refund will be initiated within 24 hours"), then [Retry payment] and [Try another payment method]. | The red filled primary button. |
| Glow | [Transaction failed](https://mobbin.com/screens/dc7af07d-0e08-4954-a986-d9d9ff567218) | The headline pair "Transaction Failed / This transaction didn't go through." | The network fee, signature and "View Raw Transaction" up front. Pot keeps those under Details. |
| Shopee | [Request under review](https://mobbin.com/screens/a8264b56-1329-4366-be8e-1be1f86bc17a) | A dated promise ("We will provide you with an update by 15 Oct") next to Contact support. | The horizontal four-step header. |

- **Pot version:**
  1. A status word in `title` `ink`: "On its way" while waiting and converting, "Added" at the end (ⓟ `xc.status.*`). Under it, "$150 from Base to Lisbon Trip" in `body-sm` `ink-muted`.
  2. A [Progress | Details] segmented control on `surface-sunken` (`radius-pill`). Details keeps the network, address, amount, deadline and a "Reference" with a copy button, for support.
  3. ProgressSteps with five steps (D-50):
     1. Waiting for your transfer (`xc.step.waiting`: "You can close this screen. We'll let you know when it arrives.")
     2. Transfer spotted (`xc.step.spotted`)
     3. Converting to Pot dollars (`xc.step.converting`: "Usually under a minute.")
     4. Arrived (`xc.step.arrived`: "Adding it to Lisbon Trip…")
     5. Added to the Pot (`xc.step.added`)

     Done steps show their time ("2:14 PM") in `body-sm` `ink-muted`; the current step's text is in `body-sm` `ink`. The current step has `aria-current="step"`.
  4. `xc.notify_ok` "We'll notify you when it arrives." in `body-sm` `ink-muted`, then a secondary [Close]. Closing never cancels.
  5. Once the sheet is closed, a compact card sits on the Pot above the feed ("Adding $150 from Base · Converting", with five small dots). Tapping it reopens the sheet.
  6. Step 5 needs the member's signature: "Confirm it's you" if a gesture is needed, otherwise it happens automatically. Success shows the `add.success` toast and fills the GoalBar.
  - **Slow and failure states** (a result block replaces the steps: state icon, `heading`, `body`, buttons):
    - `xc.slow` (5 min in Converting): a `waiting` clock with "Taking longer than usual…"; the steps stay visible.
    - `xc.incomplete`: a `waiting` clock, because this can be fixed: "You sent less than needed · Send 12.40 USDC more to the same address by 4:30 PM, or we'll return it automatically after that." The primary is [Copy Base address].
    - `xc.refunded`: a `declined` x with "This didn't go through · Your money is safe and wasn't added to the Pot.", plus [Contact support] (`xc.support`).
    - `xc.failed`: a `declined` x with "This transfer failed · We're checking what happened. Keep this page: it has your deposit details.", plus [Contact support]. Details opens by default.
    - `xc.expired`: "This address expired · Get a new one before sending." The primary is [Get a new address].
    - The final add fails: `add.error.relayer` and the persistent `add.finish_pending` card.
    - Offline: "We'll update when you're back online" (ⓟ `xc.offline`).
    - Opened cold from the push: five skeleton bars.
  - **Motion:** on each status change, the check pops (`spring-pop`), the connector fills downward in 280 ms, and the next step's dots pulse for at most 5 s, then rest. With reduced motion, changes are instant. No burst at "Added" (it isn't a rules approval); the GoalBar filling is the payoff.
  - **Copy keys:** `xc.step.waiting`, `.spotted`, `.converting`, `.arrived`, `.added`, `xc.slow`, `xc.incomplete`, `xc.refunded`, `xc.failed`, `xc.expired`, `xc.support`, `xc.notify_ok`, `add.success`, `add.finish_pending.*`, `add.error.relayer`; ⓟ `xc.status.*`, `xc.offline`.
- **Watch-outs:**
  - The brand README's sample error, "Your money went back to your Base wallet", contradicts D-50. Refunds land in the member's NEAR Intents balance and come back through support until Phase 3. Never promise a return to the sending wallet.
  - Never show "confirmations", hashes or reference ids outside Details.
  - Waiting is `waiting` blue, failure is `declined` and done is `approved`, always with an icon and a word (WCAG 1.4.1).
  - The waiting step can last minutes, so the typing dots must rest after 5 s (WCAG 2.2.2).
  - 1Click has no cancel, so [Close] must never read like one.

## 5. Install and push

### Install coach (local state, on `/p/[slug]` and in You, ux-spec §9)

- **Job:** after the first contribution, state the one benefit of installing (hearing when friends need your OK) and walk Leo through Safari's four steps without blocking anything.
- **References:** these go beyond the kb ones (talabat, Duolingo's prompt, Speak).

| App | Screen | What to borrow | What to leave |
|---|---|---|---|
| Duolingo | [Widget steps](https://mobbin.com/screens/11243abc-d521-46f0-ba2b-871bd71551d9) | One step at a time with a progress bar, and a phone drawing that shows exactly what to look for. | The mascot in a speech bubble. Pot's pot-bubble is a logo, not a character. |
| Google | [How to add a widget](https://mobbin.com/screens/73101647-2740-45fb-aa4d-82aebce34ebf) | A device drawing with a touch circle on the exact control to tap. | The swipe carousel. |
| Buddy | [How to add widgets?](https://mobbin.com/screens/b58bf220-7443-4e09-883e-5f11e6d29e5b) | The benefit line on top, then a compact numbered card with [Got it] inside it. | Nothing. |
| bunq | [Add to your Home Screen](https://mobbin.com/screens/ed55913f-6219-4b88-8762-b02f8e84b67c) | A real capture of the system screen works better than an abstract drawing. | "Let's go!", a button that does nothing. |
| Vocabulary | [Add a widget](https://mobbin.com/screens/63802e05-866b-448e-a91a-7909fb958878) | Nothing. | An [Install widget] button that can't install. iOS gives web apps no install API, so Pot shows no install button there. |

- **Pot version:**
  1. A trigger card in the Add success state (the first contribution), or after Create (`surface`, `radius-lg`):
     - the 48 px app icon (the apple-touch-icon, with 22% corners);
     - `coach.card.title` "Put Pot on your Home Screen" in `heading`;
     - `coach.card.body` "So you hear when friends need your OK." in `body-sm` `ink-muted`;
     - [Show me how] as a secondary (the Pot screen's marigold stays on [Add money]), and "Not now".
  2. The iOS coach Sheet: "Add Pot to your Home Screen" in `heading`, then a numbered list (`<ol>`) of four rows. Each row has a 24 px number disc (`surface-sunken`, `label`), the instruction in `body`, and a 72 px drawing of the real Safari control. The drawings use the brand line style (2 px strokes, `ink` on `surface-sunken`), with the control to tap ringed in 2 px `ink` on a `brand-soft` halo.
     1. iOS 27 `coach.ios27.step1` / iOS 26 `coach.ios.step1`, plus `coach.ios.step1_alt` in `body-sm`
     2. `coach.ios.step2`
     3. `coach.ios.step3`
     4. `coach.ios.step4`

     Then `coach.ios.done` in `body-sm`, and [Got it] as a secondary.
  3. Android, when Chrome offers its install prompt (`beforeinstallprompt`): the card's button becomes [Install Pot] (`coach.android.cta`), which opens Chrome's install dialog and ends with `coach.installed`. Without the prompt, `coach.android.step1`, `step2` and `step3` in the same list layout.
  4. In-app browser: `coach.inapp.title` and `.body`, [Copy link], and an "Open in Safari" link that keeps the `#fragment`.
  5. In You, the `you.install` row stays until Pot is installed.
  - **States:** at most 2 automatic shows per device, with a 7-day snooze. Hidden when already installed and on desktop. A `coach.installed` toast when the install is detected.
  - **Motion:** the shared Sheet motion. The drawings are static, with no loops. With reduced motion, nothing animates.
  - **Copy keys:** `coach.card.title`, `.body`, `.cta`, `.later`, `coach.ios.step1`, `coach.ios27.step1`, `coach.ios.step1_alt`, `coach.ios.step2`, `.step3`, `.step4`, `coach.ios.done`, `coach.android.cta`, `coach.android.step1`, `.step2`, `.step3`, `coach.inapp.title`, `.body`, `coach.installed`, `you.install`.
- **Watch-outs:**
  - Never on the landing, and never before the person has gotten something out of Pot (ux-spec §9).
  - Tell iOS 27 from iOS 26 by `Version/27` vs `Version/26` in the user agent. If unknown, use the iOS 26 copy plus the "Don't see it?" line.
  - The drawings must match the real Safari 26 and 27 toolbars, which differ between the compact and the bottom or top tab layouts. Redraw them if Apple changes Safari before Nov 11.
  - After install, the Home Screen app starts without a device key (D-21), so its first action that needs a signature asks "Confirm it's you" (open question 6).
  - Use `<ol>` so screen readers announce "1 of 4".

### Push pre-prompt (local state, first launch from the Home Screen, ux-spec §9)

- **Job:** on the first launch from the Home Screen, ask once, with a concrete reason, before iOS shows its own dialog, and make "Not now" painless.
- **References:**

| App | Screen | What to borrow | What to leave |
|---|---|---|---|
| Revolut Business | [Get what you need, in a tap](https://mobbin.com/screens/3bde8924-ee2e-407d-9781-e1418ded6b74) | The reason is the approval job ("instantly approve payments"); two full-width buttons stacked. | The dramatic white-on-black styling. |
| Jobber | [Keep a pulse on your business](https://mobbin.com/screens/200a8a3a-14ee-4fa6-ac8f-5da34b34a103) | Two or three realistic notifications in the app's own voice, above the headline. | The phone frame around them. |
| Strava | [Don't miss a thing](https://mobbin.com/screens/c43f3937-d7e3-4af8-9a56-1bb85e63a06d) | Preparing people for the system dialog: "Make sure you select 'Allow' on the next step". | The vague [Choose permissions]. |
| Affirm | [Stay in the know](https://mobbin.com/screens/c797ee4d-1c25-4e77-b592-9f6732e5725a) | Exactly what you'll receive, plus "Update your notification preferences any time in Settings." | "Exclusive in-app deals". |
| Too Good To Go | [Want to get alerts…](https://mobbin.com/screens/253d03a5-2444-492c-9384-fe6393784ac0) | Nothing. | Marketing consent bundled into the permission request. |

- **Pot version:**
  1. A Sheet shown automatically on the first launch from the Home Screen (D-42). The system dialog only ever comes from the button tap.
  2. Two example notifications (decorative, `aria-hidden`): `surface` rows, `radius-md`, `shadow-card`, each with the 20 px Pot icon and "Pot · now". They read "Maya needs your OK · $300 for Tickets · Lisbon Trip" and "Your $150 arrived · It's in Lisbon Trip now." (the real ux-spec §5.15 strings).
  3. `push.prompt.title` "Get told when friends need your OK" in `title`.
  4. `push.prompt.body` "We'll only notify you about money in your Pots." in `body` `ink-muted`.
  5. In `body-sm` `ink-muted`: "Your phone asks next. Tap Allow." (ⓟ `push.prompt.prime`) and "You can change this in You, Notifications." (ⓟ `push.prompt.settings`).
  6. The primary [Turn on notifications], and `push.prompt.later` "Not now" as a 44 px text button.
  - **States:**
    - Requesting: the system dialog is up.
    - Subscribing: typing dots in the button.
    - On: a "Notifications on" toast (ⓟ `push.on`), or nothing.
    - Denied: `push.denied` with steps to Settings, and "We'll email you instead" when email is on.
    - Unsupported (an iOS Safari tab): the You row explains that Pot needs to be installed first and links to the coach.
  - **Motion:** the example notifications drop in once (280 ms, staggered by 80 ms). With reduced motion, they're static.
  - **Copy keys:** `push.prompt.title`, `.body`, `.cta`, `.later`, `push.denied`, `you.push`, `you.email`; ⓟ `push.prompt.prime`, `push.prompt.settings`, `push.on`.
- **Watch-outs:**
  - The first launch could ask twice: this prompt, then "Confirm it's you" at the first action that needs a signature (open question 6).
  - The example notifications must match what the server actually sends, and must be safe to show on a lock screen: no note text (frontend-architecture Q14).
  - Android browser tabs before install: under D-42 Rev 3 this prompt stays off unless you opt in by Oct 25 (H-10).
  - The button calls `Notification.requestPermission()` directly inside the tap, with no `await` before it.

## 6. Confirm it's you

### Confirm it's you (ConfirmStep, local state over the sheet that triggered it, ux-spec §4.17; D-21)

- **Job:** on a new phone, or the freshly installed Home Screen app, Leo understands why he's asked, sees what's being added (this phone), confirms with one tap plus Google's window, and his original action continues.
- **References:**

| App | Screen | What to borrow | What to leave |
|---|---|---|---|
| Wise | [Check your other device](https://mobbin.com/screens/496d3823-f2d9-4926-9d8d-30e14a1baf4e) | One sentence says where the confirmation happens and what to do if you can't see it, plus a way out ("Verify another way", "I've got a new device"). This is the model for "Pair from Safari". | The all-caps headline. |
| Setel | [Trusted device](https://mobbin.com/screens/9d9f3d57-68fa-40f5-b474-779bbe47f13d) | Shows the device being added (model and system version), so you know what you're approving. | The 6-hour waiting period and the all-caps button. |
| Upwork | [Let's make sure it's you](https://mobbin.com/screens/7a4de9a5-6e06-4f98-81aa-2bee76c43ce9) | Nothing. | A security question, which is a memory test that WCAG 3.3.8 rules out. |

- **Pot version:**
  1. A short Sheet stacked over the sheet that triggered it (for example the Approve sheet), so "Approve $300" stays visible behind it.
  2. `confirm.title` "Confirm it's you" in `heading`.
  3. A device row (`surface-sunken`, `radius-md`): a `smartphone` icon, "This iPhone · Pot on your Home Screen" in `label`, and "New on your Pot account" in `body-sm` `ink-muted`. `confirm.body` = ⓟ `confirm.body.add_device` "Add this phone to your Pot account".
  4. Why, in `body` `ink-muted`:
     - after a Home Screen install: "Pot on your Home Screen is a separate app on your phone, so it needs your OK once." (ⓟ `confirm.why.install`);
     - on a new phone: "You're on a new phone. Confirm once and you're set." (ⓟ `confirm.why.new_device`).
  5. What comes next, in `body-sm` `ink-muted`: "A Google window opens. Pick your account, then tap Approve." (ⓟ `confirm.next`).
  6. The primary [Continue with Google] (`confirm.cta`, matching how the person signed in; email users see "Continue with email"). It's disabled, with typing dots, for up to 1 s while the request is prepared, so the window can open within the tap.
  7. Fallback, only if the iOS test fails (B-15, Phase 2): a "Use Safari instead" link (ⓟ `confirm.use_safari`) leads to a pairing view:
     - a 6-digit code in `balance-hero` with tabular figures;
     - "Open Pot in Safari on this phone and check the code matches" in `body`;
     - the primary [Open Safari] (an `x-safari-https` link);
     - a line saying the code expires in 10 minutes (`device.pair.*` ⓟ).
  - **States:**
    - Approving: `confirm.waiting` "Waiting for confirmation…".
    - Submitting (MPC signing about 9 s plus relay about 3 s; a 15 s budget): ProgressSteps "Approved in Google" (done), "Adding this phone", "Done".
    - Verified: the original action resumes by itself and the sheet closes.
    - `confirm.blocked` and `confirm.failed` show inline with a `declined` icon. Cancelling is silent and returns to the button. If the login token has expired, the request is rebuilt and the person is asked again.
    - `session.expired` and `setup.welcome_back` reuse the same sheet layout.
  - **Motion:** the shared Sheet and ProgressSteps motion. No burst.
  - **Copy keys:** `confirm.title`, `.body`, `.cta`, `.waiting`, `.blocked`, `.failed`, `session.expired`, `setup.welcome_back`; ⓟ `confirm.body.add_device`, `confirm.why.install`, `confirm.why.new_device`, `confirm.next`, `confirm.use_safari`, `device.pair.*`.
- **Watch-outs:**
  - On the shared testnet client, the NEAR Auth window reads "Example wants to sign a DelegateAction", with raw JSON (kb/near-auth.md), at exactly the moment we ask for trust. H-01's dedicated client id, carrying Pot's name and logo, is a design need as well as a security one.
  - This step costs 15 to 25 s. When it lands on an Approve opened from a push (demo flow F4), "one tap" becomes a tap, Google, and about 20 s (open question 6).
  - Never a memory test (WCAG 3.3.8): only Google or a passkey.
  - The window must open within the tap, with no `await` between the tap and `window.open`.
  - Resuming the action automatically is fine under WCAG 3.3.4, because the person already reviewed it in the sheet behind. When it completes, announce it politely ("Approved. 2 of 2.").

## Open questions for Cerasela

1. **Source of truth for tokens:** does the brand system (Gabarito and Figtree, marigold and eggplant, Day and Night) replace ux-spec §7 (terracotta, Inter, "dark mode out of scope") and D-45 (Geist)? frontend-architecture §7 and the font for the link-preview image follow from that. Please also confirm that Gabarito and Figtree have tabular figures ⚠️. And in Day, eggplant on the pressed `brand-deep` is 4.33:1, so should the pressed state be a touch lighter?
2. **The Google button:** "Join with Google" (ux-spec: sign in and join in one tap) or "Continue with Google" (your mockup)? Google's sign-in branding rules may restrict both the label and a marigold button ⚠️. A safe version puts the "G" on a white disc inside the marigold button.
3. **Landing copy:** add "Everyone's chipping in $150" (your mockup has it; ux-spec has no key for it), and drop "No crypto needed"?
4. **"wallet" in main paths:** whitelist `landing.more.wallet` and `add.source.other_wallet`, or rename the second to "Another app or exchange"?
5. **Add sheet outcome line:** add ⓟ `add.after` ("Lisbon Trip will have $450. Goal reached.") to meet the outcome-above-the-button principle?
6. **First launch from the Home Screen:** keep D-21's lazy "Confirm it's you" (asked at the first action that needs a signature), or bundle it with the push pre-prompt into one "Finish setting up" step, so a later Approve from a push stays one tap?
7. **Testnet deposit:** make [Simulate sending $150] the marigold button and hide "Copy address" while the QR says "Do not send"?
8. **Create, step 2:** show Club and Team as disabled "Coming soon" cards, or hide them? And are six cover gradients built from the member tints and `brand-soft` right?
9. **Link-preview emoji:** Twemoji in the preview image next to Apple emoji on the landing. Is that acceptable, or should the preview cover be the gradient with a Gabarito initial?
10. **Text links in Night:** `link` is #FFC94D in Night, close to marigold. Should text buttons that sit right under a marigold button use underlined `ink` instead?

---

**Your Mobbin AI usage is high this month**

Usage is unlimited during beta. If your usage stays at this level, you may need to purchase more credits once limits take effect. [View usage and plan options](https://mobbin.com/settings/billing-and-usage)
