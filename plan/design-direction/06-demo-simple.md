# Design direction 06: the simple demo tour (`/demo`)

Written 2026-10-27 for Cerasela (P2, design lead) and the `/demo` builders. **For the main path it replaces the structure of [05](05-demo-explainer.md)**: no chapter rail, no two panes, no hood beats. 05 stays the reference for the NEAR layer, the dataset and the cards, which this doc reuses as they are.

1. **One reader, one thing at a time.** The page is for a person about to make a real Pot, with no crypto knowledge. Each state shows the phone (the real app UI, simulated), one plain sentence and one control, [Next]. Nothing else competes for the eye.
2. **14 steps instead of 52.** Five short parts follow the D-61 story: Lisbon Trip; Maya, Sam and Leo; $450 → $84 approved by Pot rules → $366 → $300 decided by the group → $66 → $22 back each. With a cover and an end screen that makes 16 states and about 100 seconds.
3. **Product words only.** Main-path copy lives under a new `tour.*` prefix, which the jargon lint does **not** allowlist. Words like DAO, proposal, relayer, gas or wallet then fail the build there.
4. **NEAR is one closed door per part.** Each part has one "Under the hood" button. It opens the existing decoded cards, the real testnet links and the glossary in a sheet. It is never open by default and never needed to follow the story. It stays in the server HTML for AI judges, and `/demo/all` keeps the full technical read.
5. **Honest once, then calm.** The cover says "This is a simulation" once. The page keeps the 1.2 s "Checking Pot rules…" beat and the one marigold burst on the $84 approval, and it ends on **[Start a real Pot]** (`/pots?sheet=create`).

> **For:** Cerasela and the `/demo` builders (the team brief is `demo-brief.md` in the director's scratchpad). **Written:** 2026-10-27 by tour-ux. Direction only: no product code was changed.
> **Inputs:**
> - CLAUDE.md, `apps/web/AGENTS.md`, `notes/demo.md`, [05](05-demo-explainer.md), [03](03-landing.md) and [04](04-landing-motion.md), `plan/ux-spec.md` §1.2-§1.4, `brand/README.md`, `apps/web/i18n/banned.mjs`, `apps/web/components/demo/*`, and `app/demo/_data/demo-script.json` (its beats and scenes).
> - **A walk through today's demo** (2026-10-27, Playwright, 390 × 844 and 1280 × 800). I pressed Next through every beat of `/demo/1`…`/demo/6` and saved 104 screenshots in the director's scratchpad, `shots/tour-ux/`. What I measured:
>   - **52 beats.** 30 of them are hood beats, during which the phone doesn't change. In chapter 4 the phone sits on "Checking Pot rules…" for 5 beats in a row.
>   - **Up to 2,229 visible words** on one page (chapter 6, last beat, at 1280), and pages up to 13,846 px tall.
>   - **At 390, the phone starts below the fold** on beat 1 of every chapter: the title, the aha line, the simulation banner and the tabs come first.
>   - **At 390, chapter 5 beat 6** (Leo's push) shows the push card cut off under the sticky tabs.
>   - **At 1280, the sticky step bar covers the bottom of the hood.**
>   - **Captions assume the hood.** For example: "Nobody voted, yet the DAO approved it…" and "Token transfers need one yoctoNEAR attached…".
> - **References:** 9 Mobbin searches (iOS and web flows, web sections, web screens). I looked at every returned image. I also read 6 web sources on product tours and progressive disclosure. All are listed in §10.
>
> **Notation:** the same as 03-05. `token` is a brand token. Type styles use the brand's names (`title`, `heading`, `body`, `body-sm`, `label`, `amount`). `tour.x` is a proposed `en.json` key and `demo.x` is an existing or proposed allowlisted key. "390" means phones (it must also work at 320 with no horizontal scroll), "md" 768-1023 and "lg" ≥ 1024, designed at 1280 × 800.
> - A **step** is one state of the story.
> - A **part** is one of the 5 groups of steps (05 called them chapters).
> - The **stage** is the one viewport-high area that holds the tour.
> - The **hood** is the optional "Under the hood" sheet.

---

## 1. The reader, the takeaways, success

### 1.1 The reader
**One reader: a person about to make a real Pot.** That is Maya, organising a trip, who arrived from the landing's [Try the demo]. Or it is Leo, sent a link, who wants to know what he'd be joining. They have never used crypto, they will give it about two minutes, and they will leave the moment it feels like homework.

Judges (human or AI) are **not** a reader of the main path any more. They get the hood (one tap per part), `/demo/all` and the server HTML (§4, §5.2, §7.4).

### 1.2 The five takeaways
After one run, with no prior knowledge, the reader can say:

| # | Takeaway | Shown at steps |
|---|---|---|
| T1 | A Pot is the group's shared money, with rules everyone agreed to. | 1, 3 |
| T2 | Friends join from a link and chip in. It's Google sign-in, with nothing to install. | 2, 3, 4, 5 |
| T3 | Small spends are approved at once by the Pot's rules; bigger ones need most of the group. | 6, 7, 8, 9, 10 |
| T4 | No one can take money out alone, and when the trip ends everyone gets their share back. | 11, 12, 13, 14 |
| T5 | It costs nothing to use: nothing to pay, nothing to set up. | 2, 4, 14, end |

### 1.3 Success criteria (testable)

| # | Criterion | How it's checked |
|---|---|---|
| S1 | **≤ 16 states**: a cover, 14 steps and an end screen | unit test: `TOUR.length === 14` |
| S2 | **≤ 25 words per caption**, and ≤ 280 words over all 14 captions (they total 252 in §2) | unit test counts the words in each rendered `tour.sN` |
| S3 | **≤ 2 minutes** at one Next per 6 s: 14 × 6 s + cover and end ≈ 12 s + the 1.2 s hold ≈ 98 s | the sum of the step budget in `tour.ts` |
| S4 | **Zero banned words on the main path.** `tour.*` passes `lint-copy.mjs` with no new allowlist entry. At every state, the stage's visible text and its `aria-label`s, phone included, match neither `BANNED_CI_RE` nor `NEAR` | the lint, plus e2e over all 16 states |
| S5 | **One primary control per state**: the cover's [Show me how], each step's [Next] and the end's [Start a real Pot]. On tap steps the phone's own button does the same thing as Next. **At most one marigold** is visible in any state | `brandChecks({ marigold: "at-most-one" })` after every press |
| S6 | **Everything fits, nothing scrolls.** At 390 × 844 and 1280 × 800, the phone, the caption, the "You're …" chip and Next are fully inside the viewport in every state, with `scrollY === 0`. There is no horizontal scroll at 320 | e2e bounding boxes |
| S7 | **The hood is optional.** The full walk completes without opening any hood. Every hood is closed on arrival | J-1 e2e never opens one; `aria-expanded="false"` at every state |
| S8 | **"Simulation" is said once.** `tour.sim` appears once per walk (on the cover, or on the first step shown after a deep link) | e2e counts it across the walk |
| S9 | **No network.** No request goes to an RPC, `/api/relay`, `/api/demo` or nearblocks while walking or opening the hood | the existing guard from `demo-explainer.spec.ts` |
| S10 | **No-JS reads the whole story.** `/demo` HTML contains all 14 captions in order, the end lines, `href="/pots?sheet=create"`, and five closed `<details>` holding `request_spend`, `VoteApprove`, `sim-` and a `https://testnet.nearblocks.io/txns/` link | `demo-explainer-nojs.spec.ts`, rewritten |
| S11 | **People get it** (hallway, manual). After one run, 3 of 4 people with no crypto background state at least 4 of T1-T5 in their own words, and none mention a word from the banned list | Cerasela's hallway round |

---

## 2. The step list (exact copy)

**How to read it:**
- "Phone" names the existing scene by its dataset beat (`cN bM` = `chapters[N-1].beats[M-1]` in `demo-script.json`), so **no dataset change is needed**. The tour is a small static table (`components/demo/tour.ts`) that maps each step to one or more beats.
- **Tap** means the phone's own primary is marigold and live on that step, and pressing it does what Next does (05 §3.5). After QA (polish, 2026-10-27) that includes the buttons a person naturally taps on a result screen: [Share link] on step 2 and [Done] on steps 7, 9 and 11. Only steps 5 and 14 have no phone button, and a tap on anything inert in the phone (Decline, ✕, Add money…) rings the way on (the live button, or Next) instead of doing nothing.
- The words column counts the caption.

### Cover (state 0)

| Phone | Copy |
|---|---|
| `c3 b7`: Lisbon Trip at **$450.00** of $450, with its feed (Leo, Maya and Sam added $150). Its primaries are inert | `tour.cover.title` **See how Pot works** · `tour.cover.body` "Two minutes, one trip. Follow Maya, Sam and Leo as they share the money for Lisbon." · the cast: (M) Maya `tour.cast.maya` "plans the trip" · (S) Sam `tour.cast.sam` "a friend who's in" · (L) Leo `tour.cast.leo` "joins from the link" · **[Show me how]** `tour.cover.start` (the marigold) · `tour.sim` "This is a simulation. The people and the money are made up, and nothing is sent." |

### Part 1 of 5: Start a Pot (`tour.p1` "Start a Pot") · You're Maya

| # | Phone (beat) | Tap | Caption (`tour.sN`) | Words |
|---|---|---|---|---|
| 1 | `c1 b2`: Create, step 2 "How should it work?", Trip selected with its three lines | **[Create Pot]** | Maya starts a Pot for the Lisbon trip. She picks Trip rules: up to $100 without asking, bigger spends need most of the group. | 24 |
| 2 | `c1 b8`: Share sheet, with the chat preview "Maya invited you to Lisbon Trip" (one seat, "1 friend is in": only Maya is in yet) and [Share link] / [Copy link] | **[Share link]** | Setting it up is free. Maya gets one link to drop in the group chat. | 15 |

### Part 2 of 5: Join and chip in (`tour.p2` "Join and chip in") · You're Leo

| # | Phone (beat) | Tap | Caption | Words |
|---|---|---|---|---|
| 3 | `c2 b1`: invite landing "Maya invited you to Lisbon Trip", "Maya and Sam are in", $300.00 of $450 and the trust line | **[Join Lisbon Trip]** | **Now you're Leo.** Maya's link shows him who's in, what's in the Pot and the rules, before he joins. | 19 |
| 4 | `c2 b8`: "You're in!", with [Add my $150 share] | **[Add my $150 share]** (new: `YoureIn`'s Primary becomes live, §8.3) | He signs in with Google and he's in. Nothing to install, nothing to pay. | 14 |
| 5 | `c3 b7`: the Pot home, the goal bar full, "$450 of $450 collected" and the feed "Leo added $150.00" | — | Leo chips in $150, like Maya and Sam. The Pot is full: $450 of $450. | 15 |

### Part 3 of 5: Small spends (`tour.p3` "Small spends") · You're Maya

| # | Phone (beat) | Tap | Caption | Words |
|---|---|---|---|---|
| 6 | `c4 b1`: Spend, Reimburse me, $84, Groceries 🛒 and the RulePreview "This will be approved instantly" | **[Get $84 back]** | **You're Maya again.** She paid $84 for groceries. Before she asks, the app shows the rules allow it. | 18 |
| 7 | **A sequence:** `c4 b2` "Checking Pot rules…" with the typing dots, **held ≥ 1.2 s** → `c4 b7` "Approved by Pot rules" (`brand-soft`, the check pop, **⚑ the burst**) → `c4 b9` "$84 sent to you", Sent, with "In the Pot" rolling to **$366.00** | **[Done]** (once sent) | During the hold `tour.s7.checking` "Maya asks for her $84 back. Pot checks the rules…", then Under $100, so Pot rules approve it on the spot. No one else is asked. Maya gets her $84 back; $366 is left. | 23 |

**⏱ The 1.2 s rules beat and ⚑ the burst are step 7.** The timing (04's tokens) runs like this:
- **t 0:** the checking screen. Next is `aria-disabled` and described "Checking…".
- **t 1200:** approved, and the burst plays (`celebrate` 600, opacity held at 40 %).
- **t 1800:** the sent row swaps in and the balance rolls (`count` 500).
- **t 2300:** settled.

The burst plays only when step 7 is reached by the visitor's own forward press. It never plays on a deep link, after Back then Next, or under reduced motion: the same `burstLive` rule as today. Under reduced motion, step 7 shows checking for 1.2 s and then the settled screen.

### Part 4 of 5: Bigger spends (`tour.p4` "Bigger spends") · You're Maya, then Leo

| # | Phone (beat) | Tap | Caption | Words |
|---|---|---|---|---|
| 8 | `c5 b1`: Spend $300, Tickets 🎟️, with the clock preview "This needs 2 of 3 approvals" | **[Ask the group]** | Maya wants $300 for the boat tickets. That's over the $100 limit, so the group decides. | 16 |
| 9 | `c5 b5`: "Sent to the group" (without the app's "Needs 2 of 3 approvals" line, so the screen shows one fraction), the chip "1 of 2 approvals" and the timeline (Maya ✓ asked, approval counted · Sam ○ · Leo ○) | **[Done]** | Two of the three must say yes. Maya's own yes counts, so she needs one more: Sam and Leo get a notification. | 22 |
| 10 | `c5 b6`: first **Leo's lock screen with the push** "Maya needs your OK" (`appBefore`, 1.4 s), then the Approve sheet "Maya asks for $300 · for tickets" | **[Approve $300]** | **Now you're Leo.** He sees exactly what he'd approve: $300 to Maya, for tickets. | 14 |
| 11 | `c5 b10`: "Approved! $300 is on its way to Maya.", "Approvals · 2 of 2" and **$66.00** | **[Done]** | Over $100, no one can take money out alone. Two of three said yes, so the $300 goes to Maya. $66 is left. | 23 |

### Part 5 of 5: Close and share back (`tour.p5` "Close and share back") · You're Maya, then Sam

| # | Phone (beat) | Tap | Caption | Words |
|---|---|---|---|---|
| 12 | `c6 b1`: "Close Lisbon Trip?", the RefundTable (Maya, Sam, Leo: put in $150.00, gets back $22.00; total $66.00) | **[Ask the group to close]** | **You're Maya again.** The trip is over, so she asks to close the Pot. Everyone would get $22 back. | 19 |
| 13 | `c6 b6`: first **Sam's lock screen with the push** "Maya wants to close Lisbon Trip", then the Approve closing sheet with the three refunds | **[Approve closing]** | **Now you're Sam.** He checks who gets what back, and approves. Closing needs most of the group too. | 18 |
| 14 | `c6 b10`: "Pot closed", with "Who got what back" at $22.00 each and "In the Pot $0.00" | — | The Pot is closed and everyone gets their share back: $22 each, in their Pot account. Nobody paid a cent to use Pot. | 23 |

The captions total **263 words** (after QA and polish; 252 as first written). Bold marks the persona switch. It is the first words of the caption, so it is said in the story's own voice, and §3.4 covers the rest.

### End (state 15)

| Phone | Copy |
|---|---|
| `c6 b10` (the closed Pot) | `tour.end.title` **That's Pot.** Then five lines, each with a Lucide `check` in `ink`. They are not status colours, so each one stays a word plus an icon: |
| | `tour.end.l1` "A Pot is the group's money, with rules everyone can see." |
| | `tour.end.l2` "Friends join from a link with Google. Nothing to install." |
| | `tour.end.l3` "Small spends are approved by the rules. Bigger ones need most of the group." |
| | `tour.end.l4` "No one can take money out alone. At the end, everyone gets their share back." |
| | `tour.end.l5` "Free to use: nothing to pay, nothing to set up." |
| | **[Start a real Pot]** `tour.end.cta`, the marigold, `/pots?sheet=create` · `tour.end.note` "You'll sign in with Google. For now, Pot runs on demo dollars (test money)." · the secondary [Back to home] `tour.end.home` → `/` |

**What was cut from 05's 52 beats, and why:**
- **Every hood beat (30).** They are in the hood now.
- **c1 b1, the naming screen.** It adds nothing step 1 doesn't say.
- **c3 b1, the Add money form.** Step 4's [Add my $150 share] → step 5's full Pot tells it.
- **The separate checking, approved and sent beats.** Step 7 is one sequence.
- **The Meanwhile card.** Sam's join and the first $300 show on Leo's invite landing ("Maya and Sam are in", $300.00 of $450), and their real links move into the hood of part 2.

---

## 3. Layout

### 3.1 The stage (every state, both sizes)
One `<main data-tour>` that is exactly `100dvh` high (`min-height: 100dvh`, `height: 100dvh` from md). It holds, in DOM order:
1. **Header:** the lockup (a link to `/`), then on the right a text button [Skip to the end] (`tour.skip`), which is hidden on the end screen.
2. **Strip:** the "You're …" chip, "Part n of 5 · <part name>", and the 5-segment progress bar.
3. **Caption:** one live region.
4. **Phone.**
5. **Controls:** [← Back] [Next →].
6. **"Under the hood"** for this part.

The DOM order is also the reading and focus order at both sizes. Only the grid placement changes at lg.

**Not on the stage, anywhere:**
- the chapter rail;
- the aha line;
- the simulation banner, the "Simulation" pill and "A simulated phone. Nothing is sent.";
- the [The app | Under the hood] tabs;
- the summary chips and the beat timeline;
- the prev/next chapter links;
- a sticky bar that overlaps content.

### 3.2 Phone, 390 × 844

```
┌ header 56: [pot] lockup ·························· Skip to the end ┐
├ strip 52: (M) You're Maya ················ Part 3 of 5 · Small spends ┤
│          ▬▬▬▬ ▬▬▬▬ ▬▬▬░ ░░░░ ░░░░   (5 segments, 4 px, gap 4)           │
├ caption, min-height 3 lines (body 16/24 → 72 px), centred, ink            │
│  "Under $100, so Pot rules approve it on the spot, with no one…"          │
├ phone: centred; its height takes what's left (≈ 500 px at 844)           │
│        width = height × 390/800 (PhoneFrame keeps its aspect)            │
├ "Under the hood ›"  body-sm ink-muted, a 44 px row, centred             │
└ controls 72 + safe area: [←] 48 × 48 secondary · [Next →] flex-1 48 px ┘
```

- **The phone's height** is `calc(100dvh - 56 - 52 - 88 - 44 - 72 - env(safe-area-inset-bottom))`, at least 360 px. Below that (for example 375 × 600), the stage stops being fixed-height and the page scrolls normally. The controls then become `sticky bottom-0`, with the stage's own padding underneath, so they never cover the caption.
- **Short phones, under 720 px of height (polish after QA):** 390 × 664 is iPhone Safari with its toolbars, so it is the common case. The chrome tightens (header 44, a 32 px strip row, the caption at 16/22, the hood row 32 px with a 44 px hit area) and the phone becomes a shorter crop, 390/640 (an SE's proportions). It is sized from its own box (a size container), so it takes exactly what's left: **242 px wide at 390 × 664** (it was ≈ 195), 227 px on the one step that shows the tap hint. Under 656 px the page scrolls and the phone is a fixed 240 px.
- **The caption sits above the phone.** You read the sentence, look at the screen, then press Next with the same thumb. That is the KOHO and Splitwise order (§10). The caption box keeps its 3-line height on every step, so the phone never jumps (CLS 0).
- **Next** is the wide button on the right, under the thumb. Its label is "Next" on steps 1-13 and "Finish" (`tour.finish`) on step 14. Back is a 48 px square with an `arrow-left` icon and the accessible name "Back". It is disabled on step 1.
- **Cover at 390:** the strip, the progress bar and Back are hidden. The caption block becomes the title (`title`), the body and the three cast rows (32 px avatars + `label` + `body-sm`). The phone is shown smaller (`max-height: 40dvh`), then [Show me how] full width in the controls slot, then the `tour.sim` line under it in `body-sm ink-muted`.
- **End at 390:** the strip and the progress bar are hidden. Then come the title, the five lines, [Start a real Pot] (full width, marigold), `tour.end.note`, and [Back to home] (secondary, full width). The phone is hidden at 390, because the lines replace it. "Under the hood" for part 5 stays as the last row.

### 3.3 Desktop, lg, 1280 × 800

```
┌ header 64: [pot] lockup ········································· Skip to the end ┐
│ max-w-app (1080), 12 columns, gap-12, vertically centred in 100dvh − 64            │
│ ┌ left 5/12 (≈ 420) ───────────────────┐  ┌ right 7/12 ───────────────────────┐   │
│ │ Part 3 of 5 · Small spends   (label) │  │                                    │   │
│ │ ▬▬▬▬ ▬▬▬▬ ▬▬▬░ ░░░░ ░░░░              │  │        phone, centred              │   │
│ │ (M) You're Maya                       │  │        height min(40rem,           │   │
│ │                                       │  │          100dvh − 64 − 96)         │   │
│ │ Under $100, so Pot rules approve it   │  │        ≈ 640 px → 312 px wide      │   │
│ │ on the spot, with no one else asked.  │  │                                    │   │
│ │ The $84 is hers; $366 is left.        │  │                                    │   │
│ │   (heading 24/32, min-height 4 lines) │  │                                    │   │
│ │                                       │  │                                    │   │
│ │ [← Back]  [Next →]                    │  │                                    │   │
│ │ ───────────── 1 px line ───────────── │  │                                    │   │
│ │ ◫ Under the hood ›    body-sm         │  │                                    │   │
│ └───────────────────────────────────────┘  └────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- **The caption is the reading focus.** It uses `heading` in `ink`, at most 4 lines at 420 px, with the box fixed at 4 lines so Back and Next never move. That is the Framer "01 + text + Back 1/3 Next" layout (§10).
- **Controls sit right under the caption**, not in a bottom bar, so the eye goes caption → Next in 2 cm. Both are secondary 48 px buttons, with Next first in visual weight (`min-w-40`, `arrow-right` that nudges on hover).
- **md (768-1023):** the same two columns at 6/6, with the caption in `body-lg` if the scale has it, otherwise `body`.
- **Cover at lg:** on the left, the title (`title`), the body, the cast, [Show me how] (marigold) and the `tour.sim` line. On the right, the phone. It is today's intro layout, minus the bottom banner.
- **End at lg:** on the left, the title, the five lines, then [Start a real Pot] (marigold) beside [Back to home] (secondary), with `tour.end.note` under them. On the right, the closed Pot.

### 3.4 Who you are, and the persona switch
- **The chip** "You're Maya" (`tour.you`) uses the person's `Avatar` in its member colour, with `label` text on `surface`. It sits in the strip at 390 and under the progress bar at lg, and is hidden on the cover and the end.
- **The switch is told by the story itself, three ways at once:**
  1. The caption opens with "Now you're Leo." / "You're Maya again.".
  2. The chip crossfades (200) to the new name, and the new avatar pops (`ease-spring` from .6).
  3. On steps 10 and 13 the phone first shows **that person's lock screen with the push** that brought them in (the existing `appBefore`, 1.4 s). They are holding their phone because Maya's request just arrived.
  On step 3 the switch reads from the invite landing itself ("Maya invited you…").
- **The phone's accessible name follows the person:** "Leo's phone (simulated)" (`tour.phone.label`).

### 3.5 The one simulation note
- **`tour.sim`** ("This is a simulation. The people and the money are made up, and nothing is sent.") appears **once**: on the cover, under [Show me how], in `body-sm ink-muted` with a Lucide `flask-conical` 16 px. That is Xero's one calm "fictional data" line, not a banner (§10).
- **A visitor who arrives on a later step** (`/demo#step-6`, or `/demo/4`) sees the same line once, as a fourth line of that first caption box, and never again.
- **The hood keeps its own "Simulated" chips and `sim-` hashes** (05 §4.2). That's where precision matters.
- **The `<title>` and meta description say "simulation"** (§6.1), so a shared link is honest too.

### 3.6 Progress
- **5 segments, one per part.** Each fills left to right as its steps pass: a 4 px `ink` fill on a `line` track, `rounded-pill`. They are KOHO's story bars (§10). The current segment's fill moves 280 `ease-standard`.
- **The text label "Part 3 of 5 · Small spends"** says it in words, so colour is never the only cue. That is Chameleon's "visible progress": +12 % completion and −20 % dismissals (§10).
- **The bar is one `role="progressbar"`** with `aria-valuenow` = step and `aria-valuemax` = 14, and `aria-valuetext` = `tour.progress` "Step 7 of 14". The segments are not buttons, because jumping between parts isn't a reader need. Back, the deep links and the no-JS list cover it.

### 3.7 Controls and keys

| Input | Effect |
|---|---|
| [Show me how] (cover) | step 1; focus moves to Next |
| [Next] / `→` | the next step; on step 14 ("Finish") the end screen, with focus on its title |
| [Back] / `←` | the previous step, with no motion (a 120 ms crossfade); on step 1, disabled; on the end screen it is replaced by the end's buttons, so `←` returns to step 14 |
| the phone's own primary on a tap step | the same as Next, then focus moves to Next (as today) |
| [Skip to the end] | the end screen, with focus on its title |
| "Under the hood" | opens this part's hood sheet (§4); focus moves to its title; `Esc` or ✕ closes it and returns focus. It never changes the step |
| `→` / `←` while the hood is open, or with focus in a `<details>`, `<pre>` or text field | ignored by the tour |

There is no auto-advance and no Play. Every step waits for the reader (NN/g, Ciechanowski; 05 §5.1).

### 3.8 Routes

| URL | What |
|---|---|
| `/demo` | the tour, opening on the cover. Static |
| `/demo#step-7` | opens at step 7; `history.replaceState` keeps the fragment in step (no history entry per step). `#end` opens the end screen |
| `/demo/1`…`/demo/6` | **kept**, because the landing's `home.tech.demo.cta` links `/demo/4`. They are the same tour, statically rendered and opened at the old chapter's first step: 1 → step 1, 2 → 3, 3 → 4, 4 → 6, 5 → 8, 6 → 12. Each has `<link rel="canonical" href="/demo">` and no separate design |
| `/demo?step=n` | the existing 308 to `/demo/n` stays |
| `/demo/all` | **"How Pot works on NEAR"**: the full technical read, §5.2 |
| `/demo/live` | unchanged; flagged off and unlinked |

---

## 4. The optional NEAR layer (the hood)

### 4.1 Where it sits and what it's called
- **One per part, not per step.** It is the "Under the hood" row on the stage (§3.2, §3.3): a ghost text button with a Lucide `layers` icon (stroke 2), `body-sm ink-muted`, a `chevron-right`, and a 44 px hit area. It carries `aria-haspopup="dialog"` and the accessible description `tour.hood.hint` "Optional. How this part works underneath."
- **The label is `tour.hood.label` "Under the hood".** It has no banned word, so it passes the `tour.*` lint, and it is the same name as the landing's `#tech` section, so the idea is already familiar. It stays the same in every part. Everything **inside** the hood uses `demo.*` keys (allowlisted), so NEAR, DAO, proposal and relayer may appear there.
- **It is never open by default**, never opened by a step, never pulsing and never badged.
- **How it opens:** with JS, the app's `Sheet` (`components/sheets/Sheet.tsx`, Base UI Drawer).
  - Below md it is a full-height bottom sheet (`full`).
  - From md it needs a **wide** variant: a centred dialog of `min(720px, 100vw − 48px)`, so the receipt lanes (≥ 32 rem) fit. This is the one small additive change to `Sheet` (§8.3).
  - Its content is Night-scoped (`data-theme="night"`), the landing's x-ray act. The title is `demo.near.title` "Under the hood: {part}", and there is a "Simulated" chip beside the ✕.
- **How it reads without JS:** each part's steps in the server list (§7.4) are followed by a closed native `<details>`, with the same summary as the label, holding the same content.

### 4.2 Inside each hood, in order
1. **The first-level summary** (2-3 lines, `body`, `ink`): `demo.near.pN.summary` (§4.3). A curious reader can stop here.
2. **"What happened, step by step":** the existing cards for this part's chapter(s), **stacked in dataset order with no beat timeline**, each with its own closed "Show every field" and "Raw JSON". The `HoodPane` gets a `mode="stack"` that drops the timeline, the beat numbers and the summary strip.
3. **"See a real one on testnet":** the existing `RealOne` links for those chapters.
4. **The glossary:** the existing `GlossaryList` for those chapters, closed with its word count (today's behaviour).
5. **Footer:** a text link "Every step on one page →" (`demo.near.all`) to `/demo/all`.

**Disclosure depth:** the stage shows 0 levels. The summary is level 1 and the cards are level 2; their "Show every field" and "Raw JSON" are a third level, which NN/g warns about. It is acceptable here because the hood is a separate reading mode for a separate reader (§10).

### 4.3 Per part: the summary and the cards it holds

| Part | `demo.near.pN.summary` (allowlisted) | Cards (existing components, from the dataset) | Real links |
|---|---|---|---|
| 1 Start a Pot | "Maya's phone signed one request to the Pot Hub, and our relayer paid for it. The Hub created Lisbon Trip as its own Sputnik DAO with no keys: its only seats are the members and the Hub." | c1: `BeforeCard`, `SignedCard` (create_pot), `SentCard` + WhoPaid, `ReceiptRoute` (rows 1-6, 6 refunds hidden) + `NoteCard no_keys`, `StateCard`, `BalancesCard` | `demo.real.c1.create` |
| 2 Join and chip in | "Joining is a DAO proposal that the Hub approves with its one seat, only if the link's signature checks out. Leo's $150 then passes through the Hub, which writes down who put in what." | c2: `InviteSigCard`, `SignedCard` (join), `SentCard`, `ReceiptRoute`, `ProposalCard #1`, `StateCard` · `InterludeCard` (Sam's join, the first $300) · c3: `SignedCard` (ft_transfer_call), `SentCard`, `ReceiptRoute` + `NoteCard status_lies`, `BalancesCard` | interlude ×3, `c2.join`, `c3.add` |
| 3 Small spends | "Nobody voted, yet the DAO paid: the Hub checked the rules, filed proposal #2 and approved it with its rulebot seat, 1 of 1. Then the Pot itself sent Maya $84." | c4: `SignedCard` (request_spend), `SentCard`, `RulesCard`, `ReceiptRoute` (14 rows), `ProposalCard #2` + `NoteCard limits_in_hub`, `BalancesCard` | `c4.request`, `c4.same_shape` |
| 4 Bigger spends | "Above the limit the Hub can only file proposal #3. Maya's and Leo's approvals are DAO votes (2 of 3 members), and the Pot paid the moment the second one landed." | c5: `SignedCard` ×3 (request, Maya's vote, Leo's vote), `RulesCard`, `ProposalCard #3` with the VoteMeter 0 → 1 → 2 + `NoteCard exact_kind`, `payout_separate`, `SentCard` (sync) + `NoteCard sync`, `BalancesCard` | `c5.request`, `c5.maya_vote`, `c5.leo_vote`, `c5.sync` |
| 5 Close and share back | "Closing is one proposal that holds all three refunds, computed from what each person put in. Sam's approval ran them in one step: all of them, or none." | c6: `SignedCard` (propose_close, two votes), `ProposalCard #4` + `NoteCard busy`, `atomic`, `SentCard` (sync), `StateCard`, `BalancesCard` + `NoteCard after_close` · **`Recap`** (the totals table + the J-7 CLI block) | `c6.propose`, `c6.maya_vote`, `c6.sam_vote` |

Every card, id, number and link is what `/demo/N` renders today. Only the grouping changes. The 465 `demo.*` keys stay.

---

## 5. What's removed from the main path

### 5.1 Table

| Element (today) | Verdict | Why |
|---|---|---|
| 6-step chapter rail (lg) / chapter switcher `<details>` (390) | **removed**, replaced by the 5-segment bar + "Part n of 5 · name" | One progress cue, in words; nothing to choose between |
| Chapter title + aha line ("Nobody voted, yet the DAO approved it…") | **moved** into the hood (the aha becomes `demo.near.pN.summary`) | Jargon, and a second sentence competing with the caption |
| Simulation banner per chapter, header "Simulation" pill, "A simulated phone. Nothing is sent." | **removed**; said once (`tour.sim`, §3.5) | Repetition read as alarm; the hood keeps its chips |
| [The app \| Under the hood] tabs (390), the two-pane layout (lg) | **removed** | No two competing panes |
| Night hood panel: summary chips ("14 receipts"), Where we start, the beat timeline, Before/After | **moved** into the hood sheet, stacked (§4.2) | Judges' detail |
| 30 hood beats (signed, sent, route, rules, proposal, state) | **moved**: their cards are in the hood; the beats are gone | 52 → 14 steps |
| App-beat captions (05 §2) | **rewritten** as `tour.s1`…`s14` | ≤ 25 words, product words only |
| Real-one footers, glossary `<dl>`, recap table, CLI block | **moved** into the hood (recap/CLI in part 5) and `/demo/all` | Proof for judges, never needed to follow |
| Meanwhile interlude card | **moved** into hood 2; the main path shows it on the invite landing | The phone already says "Maya and Sam are in", $300 of $450 |
| Prev/next chapter links, "Next: Join from the link →" link-navigation | **removed** (one page, one player) | No page loads mid-story; the no-JS list is in order |
| Sticky beat bar (overlapping the hood at 1280) | **removed**; controls live in the stage | No overlap, no scroll |
| c1 b1 naming screen, c3 b1 add-money form, separate checking/approved/sent beats | **removed** / **merged** (step 7) | Each step must change something the reader needs |
| `localStorage` progress (`pot-demo-progress`) | **removed** | Nothing reads it any more (no rail ticks) |
| The real app components in the phone, scene transitions | **kept** | The phone is the hero |
| The 1.2 s "Checking Pot rules…" hold, the one burst | **kept** (step 7) | The brand's rule moment |
| Tap-to-advance on the phone's primary, at most one marigold | **kept** | It teaches the real button |
| "You're Maya" chip | **kept**, simplified (§3.4) | Who's holding the phone |
| ←/→ keys, polite live region, reduced motion, no network, static routes | **kept** | — |

### 5.2 `/demo/all` and the intro page
- **The intro page is gone as a separate page.** It is the tour's cover (state 0, §2), at the same URL, `/demo`.
- **`/demo/all` becomes "How Pot works on NEAR (simulation)".** It is the full technical read for judges and print:
  - the five hoods' content, in order and open (`<section>`s, not dialogs), each under its part name and its `demo.near.pN.summary`;
  - then the recap, the CLI block and the full glossary.
  - It keeps `demo.*` copy and the "Simulated" chips. It is linked from every hood's footer and from README J-1 ("for the technical detail").
  - It is the only page where every card is open.

---

## 6. Copy

### 6.1 The new prefix
**`tour.*`.** It is not in `ALLOW_PREFIXES` or `ALLOW_KEYS` of `apps/web/i18n/banned.mjs`, and must never be added. Then `lint-copy.mjs` fails the build if a main-path string says DAO, proposal, relayer, gas, fee, wallet, testnet, USDC, signature, chain or NEAR.
- The phone keeps using only the app's own keys (`spend.*`, `approve.*`, `close.*`…), which are already linted.
- The hood keeps `demo.*`.
- A unit test asserts that `tour.` has no allowlist entry.

**Style rules** (ux-spec §1.3-§1.4):
- whole dollars in sentences, two decimals on the phone;
- second person only in the "you're" lines;
- no exclamation mark (the phone's "You're in!" is the flow's one);
- names, not pronouns, at the start of a part.

### 6.2 Keys and English strings

| Key | English |
|---|---|
| `tour.meta.title` | See how Pot works (simulation) |
| `tour.meta.description` | A two-minute look at Pot: three friends, one Lisbon trip, shared money with rules. A simulation, so nothing is sent. |
| `tour.cover.title` | See how Pot works |
| `tour.cover.body` | Two minutes, one trip. Follow Maya, Sam and Leo as they share the money for Lisbon. |
| `tour.cast.maya` | plans the trip |
| `tour.cast.sam` | a friend who's in |
| `tour.cast.leo` | joins from the link |
| `tour.cover.start` | Show me how |
| `tour.sim` | This is a simulation. The people and the money are made up, and nothing is sent. |
| `tour.skip` | Skip to the end |
| `tour.you` | You're {name} |
| `tour.part` | Part {n} of {total} · {name} |
| `tour.p1` | Start a Pot |
| `tour.p2` | Join and chip in |
| `tour.p3` | Small spends |
| `tour.p4` | Bigger spends |
| `tour.p5` | Close and share back |
| `tour.progress` | Step {n} of {total} |
| `tour.progress.label` | Your progress |
| `tour.back` | Back |
| `tour.next` | Next |
| `tour.finish` | Finish |
| `tour.checking` | Checking… |
| `tour.phone.label` | {name}'s phone (simulated) |
| `tour.phone.tap_hint` | Pressing it is the same as Next. |
| `tour.tap_hint` | Tip: tap the button on the phone, or press Next. (visible, under the caption, on the first tap step until the phone's button is used) |
| `tour.hood.label` | Under the hood |
| `tour.hood.hint` | Optional. How this part works underneath. |
| `tour.s1` | Maya starts a Pot for the Lisbon trip. She picks Trip rules: up to $100 without asking, bigger spends need most of the group. |
| `tour.s2` | Setting it up is free. Maya gets one link to drop in the group chat. |
| `tour.s3` | Now you're Leo. Maya's link shows him who's in, what's in the Pot and the rules, before he joins. |
| `tour.s4` | He signs in with Google and he's in. Nothing to install, nothing to pay. |
| `tour.s5` | Leo chips in $150, like Maya and Sam. The Pot is full: $450 of $450. |
| `tour.s6` | You're Maya again. She paid $84 for groceries. Before she asks, the app shows the rules allow it. |
| `tour.s7.checking` | Maya asks for her $84 back. Pot checks the rules… |
| `tour.s7` | Under $100, so Pot rules approve it on the spot. No one else is asked. Maya gets her $84 back; $366 is left. |
| `tour.s8` | Maya wants $300 for the boat tickets. That's over the $100 limit, so the group decides. |
| `tour.s9` | Two of the three must say yes. Maya's own yes counts, so she needs one more: Sam and Leo get a notification. |
| `tour.s10` | Now you're Leo. He sees exactly what he'd approve: $300 to Maya, for tickets. |
| `tour.s11` | Over $100, no one can take money out alone. Two of three said yes, so the $300 goes to Maya. $66 is left. |
| `tour.s12` | You're Maya again. The trip is over, so she asks to close the Pot. Everyone would get $22 back. |
| `tour.s13` | Now you're Sam. He checks who gets what back, and approves. Closing needs most of the group too. |
| `tour.s14` | The Pot is closed and everyone gets their share back: $22 each, in their Pot account. Nobody paid a cent to use Pot. |
| `tour.end.title` | That's Pot. |
| `tour.end.l1` | A Pot is the group's money, with rules everyone can see. |
| `tour.end.l2` | Friends join from a link with Google. Nothing to install. |
| `tour.end.l3` | Small spends are approved by the rules. Bigger ones need most of the group. |
| `tour.end.l4` | No one can take money out alone. At the end, everyone gets their share back. |
| `tour.end.l5` | Free to use: nothing to pay, nothing to set up. |
| `tour.end.cta` | Start a real Pot |
| `tour.end.note` | You'll sign in with Google. For now, Pot runs on demo dollars (test money). |
| `tour.end.home` | Back to home |
| `tour.list.title` | The whole story, step by step |
| `tour.list.part` | Part {n}: {name} |

**New allowlisted keys for the hood** (`demo.*`):
- `demo.near.title`: "Under the hood: {part}";
- `demo.near.p1.summary`…`demo.near.p5.summary`, exactly as in §4.3;
- `demo.near.steps`: "What happened, step by step";
- `demo.near.all`: "Every step on one page";
- `demo.all.title`: "How Pot works on NEAR (simulation)".

The rest are the existing `demo.*` keys.

**I checked every `tour.*` string above against `BANNED_CI_RE` and `NEAR`** by hand: "free", "limit", "approve", "approval", "notification", "test money", "demo dollars" and "simulation" all pass. The builders' lint run is the real check.

---

## 7. Accessibility, motion, no-JS

### 7.1 Accessibility
- **The live region:** the caption block is `aria-live="polite"` and `aria-atomic="true"`.
  - On each step it speaks `tour.progress`, then the caption: "Step 7 of 14. Under $100, so Pot rules…". On a part's first step it prefixes `tour.part`.
  - On step 7 it speaks **after** the 1.2 s hold, so it never announces approval while the screen still says "Checking".
  - The burst is `aria-hidden` and `pointer-events: none`.
- **Focus:**
  - It stays on the control pressed (Next or Back).
  - After the phone's tap it moves to Next.
  - After [Show me how], [Finish] or [Skip to the end] it moves to the new state's heading or Next (§3.7).
  - The hood returns focus to its trigger. Focus rings use the 2 px `focus` token and are never animated.
- **Keyboard:** see §3.7. `aria-keyshortcuts="ArrowRight"` / `"ArrowLeft"` go on Next and Back.
- **The phone:** `PhoneFrame interactive`, `role="region"`, named by `tour.phone.label`. On tap steps its primary is a real button with its own label ("Get $84 back") and `aria-describedby` → `tour.phone.tap_hint`. On other steps it is inert (`tabindex=-1`, `aria-disabled`).
- **Targets:** every control is ≥ 44 × 44 px, and the hood row is a full 44 px row.
- **Contrast:** the progress fill is `ink` on `line`, ≥ 3:1. The caption is `ink` on `ground`.
- **Status:** "Approved by Pot rules" and "1 of 2 approvals" keep their icon + word + colour (they are app components, unchanged).
- **axe:** 0 violations at the cover, steps 1, 7, 10 and 14, and the end, in Day and Night, with motion on and reduced. Also check each hood once while open.

### 7.2 Motion
Use 04's tokens and the `demo.css` effects already built (`d-swap`, `d-scene`, `pot-demo-*`). Nothing new.

| Moment | Motion |
|---|---|
| Next | The caption crossfades (out 80 / in 200, from 40). The phone runs the scene's own transition (a sheet slides in 360 `ease-enter`, a chip pops on the spring, numbers roll 500 `count`). The progress fill moves 280 `ease-standard` |
| Back | No motion: a 120 ms crossfade to the previous final screen |
| Persona switch | The chip crossfades 200 and the avatar pops from .6. On steps 10 and 13 the lock screen shows for 1.4 s, then the sheet slides up |
| Step 7 | The hold, the burst and the roll, exactly as in §2 |
| Hood | The Sheet's own 360 enter / 280 exit |
| Cover → step 1, step 14 → end | A 200 fade of the left column / caption block. The phone crossfades its screen |

**Never:**
- auto-advance;
- scroll-driven anything;
- looping;
- a burst anywhere but step 7;
- confetti on close;
- motion on the progress bar except the fill.

### 7.3 Reduced motion
- No translate, scale, pop or burst.
- All changes crossfade in ≤ 120 ms, numbers swap without rolling, and the lock-screen push shows for 1.4 s and then swaps.
- **The 1.2 s hold stays**, because it is pacing.

### 7.4 No-JS and the server HTML
`/demo` (and `/demo/1`…`/6`) is server-rendered in this order:
1. **The stage, in its cover state.** It matches the JS cover exactly, so hydration causes no layout shift. [Show me how] is an `<a href="#story">`, and becomes a button after hydration.
2. **`<section id="story">`** with the H2 `tour.list.title`. For each part:
   - an H3 `tour.list.part`;
   - one phone at that part's last screen (as today's chapters do);
   - an `<ol>` of that part's steps, each `<li id="step-n">` holding its caption;
   - then **the closed `<details>`** "Under the hood", holding §4.2's content (cards, raw JSON in their own closed `<details>`, real links, glossary).
3. **The end:** the five lines, [Start a real Pot] (`href="/pots?sheet=create"`) and [Back to home].

With JS, `#story` gets `hidden` after hydration, because the stage plays it. The hood dialogs render that same content. The list is in the HTML either way, so AI judges and `curl` read the whole story and every hood. Nothing is hidden with `opacity: 0` in the server render (04 rule 6). The theme uses the token `prefers-color-scheme` fallback, and the hood content carries `data-theme="night"`.

---

## 8. Build notes

### 8.1 Files (all in the `/demo*` scope)
- **`components/demo/tour.ts`:** the 14 steps as data. Each step has `{ part, beats: [[chapter, beat]…], you, tap, hold?, burst?, captionKey }`. It is server-safe and computed into small per-step phone props (`PhoneBeat`) on the server, so the client still never gets the 280 KB dataset.
- **`TourPlayer.tsx`:** the client state: step, via, holding, burstLive, plus the keys and the live region. It reuses `BeatPlayer`'s reducer logic (bounds, the hold, the burst-once rule, deep links), generalised to steps that span chapters.
- **`Stage.tsx`:** the header, the strip, the caption, the phone (the existing `AppPane` minus its figcaption), the controls and the hood trigger.
- **`HoodSheet.tsx`:** the `Sheet` wrapper plus `HoodPane mode="stack"` for a part's chapter(s).
- **`TourList.tsx`:** the server story list (§7.4).
- **The pages:** `app/demo/page.tsx` and `app/demo/[chapter]/page.tsx` render `<Tour initialStep>`. `app/demo/all/page.tsx` renders the open hoods, the recap and the glossary.
- **To retire:** `BeatBar`, `ChapterRail`, `ChapterSwitcher`, `PaneTabs`/`PanePanel`, `IntroPhone` and the hood timeline parts of `Chapter.tsx`, once nothing imports them.

### 8.2 Data
**No change to `demo-script.json` or the generator**, and `pnpm check:demo` stays green. Each step's phone comes from existing beats:
- step 7's sequence is `c4 b2 → b7 → b9`;
- steps 10 and 13 use those beats' `appBefore`.

### 8.3 Small additive changes outside the demo folder
1. **`Sheet`:** a `wide` prop (≥ md: `min(720px, 100vw − 48px)`), for the hood.
2. **`Scenes.tsx` `YoureIn`:** pass `active`/`onPrimary` to its Primary (today it is hard-coded `active={false}`), so step 4 can be a tap step. This file is in `components/demo/`.
3. **The jargon lint:** a test that `tour.` is not allowlisted.

There are no landing changes. `/demo/4` keeps working (§3.8).

### 8.4 Tests (replace J-1…J-6 of `demo-explainer.spec.ts` and `-nojs.spec.ts`)
- **J-1, the walk:** cover → [Show me how] → Next × 13 → Finish → end. At each state, assert S4, S5 and S6. Assert the D-61 text on the phone at steps 5 ($450.00), 7 (Approved by Pot rules, $366.00), 9 (1 of 2 approvals), 11 ($66.00) and 14 ($22.00). Assert that [Start a real Pot] has `href="/pots?sheet=create"`. Assert S7: no hood opened.
- **J-2, the phone taps:** steps 1-4 and 6-13 can be advanced by the phone's own button (2, 7, 9 and 11 added after QA). Steps 5 and 14 have none.
- **J-3, step 7:** Next is `aria-disabled` for ≥ 1.2 s. The burst is visible once on forward arrival, and absent on `#step-7`, after Back + Next, and under `reducedMotion: "reduce"`.
- **J-4, the hood:** for each part, the trigger opens the sheet. It contains `demo.near.pN.summary` and that part's judge strings (part 3: `request_spend`, `Approved`, proposal #2, a nearblocks link). `Esc` closes it, focus returns, and the step is unchanged.
- **J-5, deep links and keys:** `/demo#step-10` shows "You're Leo" and the push; `/demo/4` opens step 6; `→`/`←` step through; `tour.sim` is seen once (S8).
- **J-6, no-JS:** S10, and no `role="dialog"` in the HTML.
- **Unit:** caption word counts (S1-S3), no allowlist for `tour.`, and the step → beat mapping resolves for all 14.
- Plus axe (§7.1), the no-network guard (S9) and CLS 0 through a full walk at both sizes.

**README J-1** becomes: "Open `<APP_URL>/demo` and tap **Show me how**. In 14 steps (about 2 minutes) Maya, Sam and Leo share the money for a Lisbon trip. It's a simulation and nothing is sent. Each part has an **Under the hood** button with what was signed, what our relayer sent, every receipt and the Sputnik proposal, and `/demo/all` has all of it on one page." `scripts/check-readme-steps.ts` keeps mapping J-1 to `/test\("J-1\b/`.

---

## 9. Open questions for Cerasela

| # | Question | Default |
|---|---|---|
| 1 | The marigold during the tour: keep 05's rule (the phone's own primary on tap steps is the only marigold; Next is always secondary), or make Next the marigold and draw every in-phone primary secondary, as the landing does (03 rule 1)? | Keep 05's: it shows the real button, and Next never changes look |
| 2 | Is "Under the hood" the right label for the optional layer, or "How it works on NEAR"? The second needs an allowlisted `demo.*` key on the main path, and S4 would then exempt it | "Under the hood" |
| 3 | The end screen's secondary: [Back to home] (the brief's "way back"), or [Watch again]? | Back to home |
| 4 | Step 4 skips the Add money sheet: "You're in!" → [Add my $150 share] → the full Pot. Is that jump OK, or add the sheet back as a 15th step? | Skip it (14 steps) |
| 5 | `tour.end.note` "For now, Pot runs on demo dollars (test money)": say it here, or leave it to the Create flow? | Say it: it's the honest line before a real action |
| 6 | Five parts (Join + Add money merged) instead of six chapters. OK for the old `/demo/3` to open at step 4? | Yes |
| 7 | 390, end screen: hide the phone (the five lines replace it), or keep a small closed-Pot phone above them? | Hide |
| 8 | The cover phone: the full Pot at $450 (the hero object), or Maya's chat invite? | The Pot at $450 |

---

## 10. References

Mobbin (patterns only; Pot's look comes from the brand):

| App | Flow / screen | Pattern borrowed | Left |
|---|---|---|---|
| KOHO | [How it works](https://mobbin.com/flows/8f7d4342-b5f1-47bb-b006-ed7a77af170c) | A segmented story bar on top, one short headline per step, one visual, one bottom button | Purple full-bleed screens, stock photos |
| Splitwise | [Onboarding welcome](https://mobbin.com/flows/bd8e8a85-eb7a-4cb5-84fc-c532e572ba20) | Explaining with a real product card full of sample data ("Beach trip, David owes you $100") and one sentence, not an illustration | Page dots as the only progress |
| Framer | [Prototype section: "01", text, Back · 1/3 · Next beside a phone](https://mobbin.com/sites/sections/34b01d8c-b4f6-4707-96d0-90ded5ae33cb) | The lg layout: text and Back/Next in one column, the phone as the hero beside it | The dark browser chrome |
| Ramp | ["See how Ramp works": Interactive product tour, "Takes 2 minutes"](https://mobbin.com/sites/sections/e92c227f-410f-4d47-8f54-4d8945f66ae3) | Naming the time up front ("Two minutes, one trip"); a tour with "Back · 2 of 7 · Next" | The choice between three demo formats |
| beehiiv | [Guided tour, "2 of 7", Back / Next](https://mobbin.com/flows/2e01960d-3001-4150-9de1-f4e1fa95a825) | Back and Next together, the count as words | Tooltips over a dimmed app |
| Clay | [Guided tour, "1 / 8", Continue + Skip](https://mobbin.com/flows/184bcf07-6ae0-4755-af10-dfc9d08770c8) | A quiet Skip that's always there, apart from the main control | Gradient cards, uppercase micro-labels |
| Canva, Jasper | [Canva "3/3 · Got it"](https://mobbin.com/flows/d3237fe5-9e7c-47ec-89e6-56ccfd951dc1), [Jasper "Start tour" → "4 of 4 · Done"](https://mobbin.com/flows/17d27ca2-c066-4eb0-9b9b-d3e09a8fdcd9) | The last step renamed ("Finish"); a start state with one button | A modal over the work |
| Duolingo | [Profile after the first lesson: "Create a profile to save your progress"](https://mobbin.com/flows/4511e153-c7d5-4b70-b37e-09cc798e49d9) | Value first, account after; the ask comes once the person has seen it work: our end screen | The mascot |
| Monzo | [Welcome and "Let's get to know you"](https://mobbin.com/flows/9ac93ca6-671e-46ea-92c1-ef050166a6b3) | One sentence and one button per screen; reassurance in one plain line | Many form steps |
| Cash App | [Onboarding](https://mobbin.com/flows/6262682d-9373-4089-bc19-4cf75f9772b7) | A big headline, one line of body, one primary at the bottom | Black-on-green brand |
| Partiful | [Onboarding: "Just for event updates. No spam"](https://mobbin.com/flows/53e5b088-33a3-4da1-a4c9-28182e340005) | A short reassurance line right under the ask: our `tour.end.note` | Phone-number sign-up |
| Xero | [Demo Company with "Get familiar with Xero using fictional data"](https://mobbin.com/screens/df886246-1ccc-456f-8952-b33a264771a6) | Saying "fictional" once, calmly, in one line: our `tour.sim` | A permanent top banner |
| Steep | [Home with a small "Using demo data" card](https://mobbin.com/screens/fd3fc8db-0edb-4cc8-97c8-9fb72946f0f1) | A quiet, out-of-the-way note that it's sample data, with the next step beside it | A sidebar placement |
| The Leap | [Interactive demo "4 of 13" inside the landing](https://mobbin.com/sites/sections/93ef6214-dac2-4f0a-8171-75df5652fef0) | "Click around" demos stay inside the page with a visible count | Carousel of many cards at once |

Web:
- [Navattic, best practices for interactive demos (2026)](https://www.navattic.com/blog/best-practices-building-interactive-demos), from about 40,000 demos:
  - **Steps:** top demos run 5-13 steps per flow, and the highest completion comes at 1-6 steps per flow.
  - **Words:** "just 25 to 30 per dialog box". That is our ≤ 25-word cap.
  - **Flows:** multi-flow demos complete 48 % more often than single-flow ones. These are our 5 parts of 2-4 steps.
  - **Start:** 72 % of top demos start with a modal. That is our cover.
  - **What we left:** their "5 CTAs, one every 1-2 steps". We ask once, at the end.
- [Chameleon, "What 550M data points say about your product tour"](https://www.chameleon.io/blog/mastering-product-tours):
  - 3-4-step tours complete at 72-74 % and 7+ steps at 16 %;
  - click-triggered tours complete at 67 %, against 31 % on a timer.
  - That is why parts stay short and nothing advances by itself.
- [Chameleon, effective product tour metrics](https://www.chameleon.io/blog/effective-product-tour-metrics): visible progress lifts completion about 12 % and cuts dismissals about 20 %. That is our 5-segment bar with words.
- [NN/g, Progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/):
  - show the few things most people need and offer the rest on request;
  - make the way in obvious and well labelled;
  - designs past 2 levels usually test poorly.
  - Our two levels are the stage and the hood; the cards' raw views are a judge-only third.
- [NN/g, Mobile tutorials: wasted effort or efficiency boost?](https://www.nngroup.com/articles/mobile-tutorials/) and [Onboarding tutorials vs. contextual help](https://www.nngroup.com/articles/onboarding-tutorials/):
  - deck-of-cards tutorials didn't improve task success (91 % read vs 94 % skipped);
  - keep them short, show only what's new, and make them skippable.
  - Our tour shows the novel part (rules and group approvals) on the real UI, with a Skip.
- [Stripe Checkout demo](https://checkout.stripe.dev/): the demo is the real component with sample data, the disclosure is minimal and in place, and it ends on one action ("Start building"). That is our end screen.
- From 05 and still valid: [Bartosz Ciechanowski's explainers](https://ciechanow.ski/color-spaces/): one idea per step, the reader sets the pace, and nothing moves unless asked.

All Mobbin links are the canonical `mobbin.com` pages; their image links expire after 30 days.
