# Design direction 03: the landing page (`/`)

Written 2026-10-22 for Cerasela (P2, design lead) and the landing builder.

1. **One marigold button on the whole page: [Start a Pot] in the hero.** The header, the final call to action and every mock UI fragment use secondary buttons or no buttons at all. Marigold still shows up as a *surface* (the logo tile, the goal bar fill, a card's top edge), never as text and never as a second button-shaped thing, even inside a mock phone.
2. **Show the product, not pictures of it.** Every visual is server-rendered markup built from the real app components with the D-61 numbers: the Lisbon Trip chat, "$450 of $450 collected", "Approved by Pot rules", "1 of 2 approvals", "$22.00 back each". AI judges read it as text, and it stays sharp in Day and Night.
3. **Headline first, proof right under it.** At 390 px the order is: what it is (H1) → how it behaves (subhead) → [Start a Pot] → a phone whose top edge, with the "Approved by Pot rules" card, sits above the fold.
4. **People are colours, rules are brand-soft.** Maya is `member-1`, Sam `member-2` and Leo `member-3` on every avatar, chat name and highlight. `brand-soft` means "the rules did this", so it marks only the H1's key words, the instant-approval result and the rule that decided.
5. **The page is calm on load.** Nothing loops or celebrates until the visitor taps. A scroll reveal is a single one-time fade, and the 600 ms burst plays only in "Try the rules", and only in answer to the visitor's own tap.

> **For:** Cerasela and the landing builder (phase 2 of the landing team; the team brief lives in the director's session scratchpad as `landing-brief.md`). **Written:** 2026-10-22 by the design-reference researcher. Direction only; no product code was changed.
> **Inputs:**
> - The brand system ([../../brand/README.md](../../brand/README.md), `brand/tokens.json`), [01](01-join-and-money-in.md) and [02](02-pot-and-decisions.md) of this folder, and the video's creative brief (`marketing/video/brief/01-creative-brief.md`: the three-dots thread, phone with breakout cards, stickers in small doses, "the tech section looks precise").
> - The landing copy already drafted in `apps/web/i18n/en.json` (`home.*`). This doc cites those keys; the copy agent owns them.
> - 19 Mobbin searches run on 2026-10-22: 17 of web landing sections, 1 of iOS welcome screens (the 390 px analogue of a landing hero), 1 of comparison sections. I looked at every returned image. The live sites may have changed since capture.
>
> **Demo numbers (D-61), the only ones allowed:** Lisbon Trip 🇵🇹 with Trip rules ("Anyone can spend up to $100 without asking." · "Bigger spends need 2 of 3 approvals." · "Each person can spend up to $200 in total without asking."). Maya, Sam and Leo put in $150 each → $450 of $450. Maya's $84 groceries are approved by Pot rules → $366.00. Maya asks for $300 for the boat → 1 of 2 approvals → Leo approves → $66.00. Close → $22.00 back each.
>
> **Notation:**
> - `token` is a brand token or its Tailwind class (`bg-surface`, `text-ink-muted`, `rounded-lg`, `shadow-card`, `max-w-flow`, `max-w-app`). Type styles use the brand's names: `balance-hero`, `title`, `heading`, `body`, `body-sm`, `label`, `amount`.
> - `home.x.y` is an existing en.json key; ⓟ marks a key this doc proposes (the copy agent decides).
> - "390" means phones (the design width; it must also work at 320 with no horizontal scroll). "lg" means ≥ 1024 px, inside `max-w-app` (1080).

## Page-wide grammar

### Rhythm and layout
| Rule | 390 | lg (≥ 1024) |
|---|---|---|
| Page gutter | `px-4` (`space-4`) | `md:px-6`, content in `mx-auto max-w-app` |
| Section padding | `py-12` (`space-12`), so 96 px between two sections' content | same `py-12`; the extra air comes from the wider columns, not more padding |
| Section head | eyebrow (`label`, `text-ink-muted`, sentence case) → `space-2` → H2 (`font-display text-title text-ink`, `text-balance`) → `space-3` → intro (`body`, `text-ink-muted`, `max-w-flow`) → `space-6` → content | same, but `space-8` before the content, and the head may sit in the left column |
| Columns | one column; the visual comes **after** its copy (except in the hero, see §1) | two columns from `lg`: copy in 5 of 12, visual in 7 of 12 (`lg:grid lg:grid-cols-12 lg:gap-8`) |
| Text measure | intros and body copy at most `max-w-flow` (440 px, about 55-60 characters) | same; never let a paragraph run the full 1080 |
| Cards | `bg-surface rounded-lg shadow-card p-4` | `p-6` (`md:p-6`) |
| UI-fragment panels | `bg-surface-sunken rounded-lg p-4`, the "stage" a real component sits on (Origin, Braintrust, Beside below) | `p-6` |
| Anchors | each section has an `id` (`how`, `rules`, `tech`) and `scroll-mt-20`, so the sticky header never covers its heading (WCAG 2.4.11) | same |

**Surfaces, top to bottom.** `ground` for header, hero, problem, how it works, trust, final call to action and footer. Two bands break the rhythm, one per half of the page:
- **Try the rules** sits on a full-bleed `bg-surface-sunken` band: it reads as the "play area".
- **Under the hood** is a full-bleed band scoped to Night with `data-theme="night"` on the `<section>`. `app/tokens.css` defines Night on the `[data-theme="night"]` selector (not only `:root`), and the lockup CSS in `globals.css` is a descendant rule, so every token and the wordmark switch inside the band. This is the video's "Night, x-ray" act. In Night theme the band matches the page, so its diagram nodes and fact cards keep `bg-surface` plus a 1 px `border-line` to stay distinct.

**Type.** One `<h1>`, the hero title, in `font-display text-balance-hero` (44/48, 800, −0.02em; `max-xs:text-[2.25rem] max-xs:leading-10` below 360 px, the brand's own rule). H2s are `title`, step and card titles `heading`, body `body`, captions `body-sm` in `ink-muted`, buttons and chips `label`. Every amount renders through `MoneyText` (`tabular-nums`, two decimals when displayed, U+2212 for money out). No all-caps eyebrows and no monospace "FIG 3.A" labels, even in the tech band: precision comes from thin `line` rules, alignment and tabular figures, not from a code font the brand doesn't have.

### Stickers (die-cut, `public/landing/stickers/*.webp`)
- **Where:** the hero (tram and pastel de nata), one per how-it-works step that has a real object (groceries on step 3, boat or tickets on step 4, suitcase or receipt on step 5) and the final call to action (tram or sunglasses). **Never** in the problem section (the video keeps its anxiety act free of flavour), the trust section or under the hood.
- **How many:** at most 2 visible in any 390 × 844 viewport; at most 2 per section on desktop.
- **Size and placement:** 64-96 px wide at 390 (the 256 w file), 120-160 px at lg (the 512 w file via `srcset`). Each one overlaps the corner of a phone, panel or card by 20-35 % and is rotated −10° to +10°. It never covers words, an amount, a status chip or a tap target.
- **Markup:** `<img alt="" aria-hidden="true" width height loading="lazy">` (no lazy loading in the hero), inside a parent with `overflow-x: clip` so a sticker that overhangs the gutter can't cause horizontal scroll at 320.
- **Night:** keep the white die-cut edge; it reads on `#1c1424` (see `marketing/video/out/stills/stickers-contact.png`).
- **Shadow:** none, or `shadow-card` at most. No member-colour glows.

### Member colours and highlights
- Avatars use `Avatar`/`AvatarStack` with `joinIndex` 0, 1, 2 → `member-1`, `member-2`, `member-3`, eggplant initials, and a 2 px ring in the colour they sit on.
- In mock chats, each sender's name is set in `label` `text-ink` next to their avatar. Don't colour the name text with the member tint: `member-*` on `ground` fails as text.
- **Key-word highlight blocks** (the Fibery pattern below) are a background behind `display` words, padded `px-1` with `rounded-sm` and `box-decoration-break: clone` so they wrap cleanly:
  - **Rules words** ("its own rules" in the H1, `home.hero.title.highlight`): `bg-brand-soft text-ink`, which is 13.1:1 in Day and 9.7:1 in Night.
  - **People words** (for example "Leo is typing…" in the problem section): `bg-member-3 text-on-brand`. The member tints are the same hex in both themes, so the text must stay `on-brand` eggplant (9.6:1), never `ink`, which turns light in Night.
- Never use `brand` (marigold) as a highlight behind text: a marigold block next to the marigold button reads as a second button.

### Motion
- **Server HTML is the final state.** Every word, number and fragment is visible with JS off. Nothing has `opacity: 0` in the server render.
- **Scroll reveal (optional, one kind only):** after hydration, a small client island hides only the elements that are *below* the viewport (`opacity: 0; translate: 0 12px`) and reveals each one once on intersection: 280 ms, ease-out, no stagger beyond 60 ms. Use it for the how-it-works fragment panels and the tech diagram nodes, nothing else. Under `prefers-reduced-motion: reduce` the island does nothing.
- **Allowed loops:** the chat's "is typing" bubble (`TypingDots`) in the hero and the problem section. It pulses only while in view, for at most 5 s (WCAG 2.2.2), then stays still. Reduced motion: still from the start.
- **The burst** (`Celebration`) lives only in Try the rules, after the visitor taps an amount that Pot rules approve. Never on load, scroll or hover. Reduced motion: no burst, no translate or scale; the text and tint change instantly, and the 1.2 s "Checking Pot rules…" beat stays (it is pacing).
- **No tilt on the phone.** A 3D phone tilt blurs text and fights reduced motion. Only stickers (static rotation) and the hero's breakout card (−2°) are rotated.

### Mock UI rules (all fragments, the hero phone included)
- Build fragments from the real components (list below) fed with D-61 data, and wrap each fragment in `inert` plus `aria-hidden="true"`. The surrounding copy or a `role="img"` label (`home.hero.visual_label`) carries the meaning. `inert` matters: a real `RequestCard` renders `<button>`s, and focusable content inside `aria-hidden` is an axe violation (`aria-hidden-focus`); the brief requires zero.
- **No marigold inside a mock.** Don't mock the Pot hero's [Add money] or a marigold [Approve $300]. Show the moment *after* the tap (a StatusChip, a result capsule, a timeline) or render the button in secondary style. The e2e test counts marigold `button, a`, but the brand rule counts what people see.
- Status is always `StatusChip` (icon + word + colour). Rows with an amount use `MoneyText`.

### Desktop vs phone, in one table
| | 390 | lg |
|---|---|---|
| Hero | headline block, then the phone, cropped at the bottom of the hero so it invites the scroll | copy left (cols 1-6), the full phone right (cols 7-12) with two floating cards and two stickers |
| Problem | 3 stacked cards, the chat card first | the chat card on the left, the other two cards stacked on the right |
| How it works | 5 stacked step cards | a 2-2-1 bento: setup pair, spending pair (instant beside group, the key contrast), then close full width |
| Try the rules | head, then the playground card | head and the three rule sentences left, the playground card right |
| Trust | headline, then 3 fact rows in one card | headline, then 3 fact columns |
| Under the hood | vertical flow diagram, then fact cards in 1 column | horizontal flow diagram, then a 3 × 2 grid of fact cards |
| Header links | hidden (the page is a single scroll; no hamburger) | How it works · Rules · Under the hood |

---

## Sections

### 0. Header

- **Job:** say "this is Pot" and give a quiet second way in ([Try the demo]) without competing with the hero's marigold.
- **References:**

| App | Section | What to borrow | What to leave |
|---|---|---|---|
| Linear | [Hero with header](https://mobbin.com/sites/sections/192414ab-334b-4a7f-a278-1d4cf5bdc095) | Restraint: logo left, a few plain links on the right, one small outlined button. Nothing else in the bar. | The dark UI |
| mymind | [Pill nav](https://mobbin.com/sites/sections/4441237a-2e84-4fd8-a4dd-683a3c21c5d9) | Anchor links that jump into the page's own story ("What? Why? How?") instead of product menus | The coloured dot before each link (three dots are Pot's logo motif) and the floating pill |
| Superpower | [Header over hero](https://mobbin.com/sites/sections/a66c7229-39c5-4f24-b34c-c09db551575d) | Nothing | A filled orange CTA in the header *and* the hero: for Pot that would be a second marigold |

- **Pot version:**
  - **390:** sticky, 56 px tall, `bg-ground` with `border-b border-line`, `px-4`.
    - Left: `<a href="/" aria-label={t("home.nav.home")}>` around `<Lockup className="h-10 w-auto" />`. At 40 px tall it is about 99 px wide, above the 96 px minimum. It is **not** the `<h1>`.
    - Right: [Try the demo] as `<Button nativeButton={false} render={<Link href="/demo" />}>` (secondary, 44 px tall, `label`; `home.cta.demo`).
  - **lg:** 64 px tall, inside `max-w-app`. The lockup is on the left. On the right: `<nav aria-label={t("home.nav.label")}>` with text links (`home.nav.how`, `home.nav.rules`, `home.nav.tech` → `#how`, `#rules`, `#tech`) in `label` `text-ink`, each with a 44 px hit area and `hover:bg-surface-sunken rounded-md`, then [Try the demo] secondary.
- **Watch-outs:**
  - Don't make the header translucent or blurred over content: the tokens have no translucent ground, and a solid `ground` keeps contrast predictable in both themes.
  - Nav links in `ink`, not `link`: in Night `link` is `#ffc94d` and reads as marigold text (02, open question 5).
  - Keep `<HomeRedirect />` and `<NearAuthCallback />` mounted on the page (brief).

### 1. Hero

- **Job:** in about 10 seconds, tell Maya what Pot is (group chat money with rules), show it working (the rules approve $84), and get the tap on [Start a Pot].
- **References:**

| App | Section | What to borrow | What to leave |
|---|---|---|---|
| Superpower | [Hero](https://mobbin.com/sites/sections/a66c7229-39c5-4f24-b34c-c09db551575d) | Centred headline, then a phone **cropped by the hero's bottom edge**. The crop says "keep scrolling" and keeps the first viewport light. This is the 390 layout. | The carousel arrows under the phone and the orange two-tone headline |
| Fruitful | [Hero](https://mobbin.com/sites/sections/7ae10bfe-9d17-4b88-9805-b5189cfde81b) | One card **breaking out of the phone**, overlapping its edge, so the hero shows a second, bigger piece of UI. Our breakout is the "Approved by Pot rules" card. | The tilted phone (blurry text) and the APY footnotes |
| Revolut | [Hero](https://mobbin.com/sites/sections/e936d541-f5ac-4ec3-809e-9723f3c77561) | A single transaction card ("Salary +£2,550") floating over the device outline, a real money row as the proof | All-caps headline over a photo, white text on an image |
| WhatsApp | [Groups](https://mobbin.com/sites/sections/fede1c3e-00e8-4167-a8dc-4e990922653f) | A group-chat card with a group header and each sender's name above their bubble, plus one illustration overlapping its corner, the exact composition of our phone + sticker | Name colours as text (fails contrast for us) and the photo bubble |
| PamPam | [Hero](https://mobbin.com/sites/sections/d3a56f6d-f5bb-4d27-9278-c10c0388d8bc) | Die-cut real-object stickers at the edges of a centred headline: travel flavour without illustration | Ten-plus stickers; Pot uses two |
| Fibery | [Hero](https://mobbin.com/sites/sections/6b6f5398-f384-422a-ad92-a11c8fd00943) | A highlight block behind the headline's key words ("grudges.") | The yellow-on-white block colour: ours is `brand-soft` |
| UGLYCASH | [Hero](https://mobbin.com/sites/sections/38f98d17-c8cf-41d7-8da7-737c54b4217d) | Nothing | Huge condensed all-caps, neon pink glow and an APY badge: this is the crypto-bro look the brief rules out |
| Legend | [Hero](https://mobbin.com/sites/sections/b8a17555-d678-4f2e-bc59-9356e15ba6b5) | Nothing | "Onchain money superapp", "Earn up to 8.22%" and partner protocol logos: we never sell yield or name the chain here |

- **Pot version, 390** (top to bottom, `px-4`, `pt-6`, no bottom padding):
  1. **Eyebrow:** `home.hero.eyebrow` "Shared money for group trips", in `label` `text-ink-muted`.
  2. **H1** (`mt-2`): `home.hero.title` "Group chat money that follows its own rules." in `font-display text-balance-hero text-ink text-balance`. The words in `home.hero.title.highlight` ("its own rules") get the rules highlight (`bg-brand-soft text-ink`). About four lines at 390.
  3. **Subhead** (`mt-3`): `home.hero.subhead` in `body` `text-ink-muted`, `max-w-flow`.
  4. **Buttons** (`mt-6`, `flex flex-col gap-3`; from `sm:` a row with auto widths of at least 160 px):
     - [Start a Pot]: `<Button variant="primary" nativeButton={false} render={<Link href="/pots?sheet=create" />}>`, 52 px, full width, `home.cta.start`. **The page's only marigold.**
     - [Try the demo]: secondary, 52 px, full width (`home.cta.demo`, `/demo`).
  5. **Reassurance** (`mt-3`): `home.hero.reassure` in `body-sm` `text-ink-muted`, `text-balance`, centred under the buttons. Use no icons here: a row of checks would read as "approved" states.
  6. **Visual** (`mt-8`): a `relative` stage, 360 px tall at 390 (320 px at 320), with `overflow: clip` on both axes. It is labelled once with `role="img" aria-label={t("home.hero.visual_label")}`, and everything inside is `aria-hidden` plus `inert`.
     - `PhoneFrame`, about 264 px wide (68 % of the viewport, `max-w-[17rem]`), centred, its bottom cut off by the stage. The screen shows the "Lisbon Trip" group chat (`ChatThread`): Maya's line, then her `InviteBubble` (CoverTile 🇵🇹, "Lisbon Trip · 3 friends", a `GoalBar` with `pot.goal` "$450 of $450 collected"), then a typing bubble from Sam.
     - **Breakout card** (`FloatCard`, about 224 px wide, `bg-surface rounded-lg shadow-card p-3`, rotated −2°): anchored to the phone's upper-right corner and overhanging the phone's right edge by about 32 px (it still fits inside the 390 width). Content: a `brand-soft` capsule with a Lucide `check` in `approved` and `spend.approved` "Approved by Pot rules" in `label` `text-ink`. Under it, `body-sm` `text-ink-muted` "Under the $100 instant limit", and on the right a `MoneyText` row "−$84.00". Its top sits within the first 844 px viewport, so the proof is visible before any scroll.
     - **Stickers:** the tram (80 px) overlapping the phone's top-left edge, behind the breakout card's z-index; the pastel (64 px) at the phone's lower-left, which ends up below the fold.
     - **Crop:** a 32 px gradient from transparent to `var(--pot-ground)` at the stage's bottom edge, so the phone sinks into the page instead of ending on a hard line.
- **Pot version, lg** (`lg:grid lg:grid-cols-12 lg:items-center lg:gap-8`, `lg:py-12`, the hero at least 640 px tall):
  - **Copy** (cols 1-6), left-aligned: eyebrow, H1 (still `balance-hero`; see open question 1), subhead, buttons in a row, reassurance under them (left-aligned).
  - **Visual** (cols 7-12): the full, uncropped phone (about 300 × 620 px), centred in the column.
    - The breakout card "Approved by Pot rules" overlaps the phone's **left** edge at mid-height, breaking out toward the copy, as in Fruitful.
    - A second, smaller card (`PushCard`: Leo's avatar, `feed.contribution` "Leo added $150.00", `pot.goal` "$450 of $450 collected") overlaps the top-right corner.
    - Stickers: the tram (140 px) behind the phone's top-left, the pastel (120 px) in front of its bottom-right.
    - That's two floating cards and two stickers, and no more.
- **States:**

  | State | What shows |
  |---|---|
  | No JS | Everything above, static: the typing bubble's dots are still and the cards sit in place |
  | Night | Tokens switch. The phone bezel follows the kit's Night style, the breakout card is Night `surface` with the Night `brand-soft` capsule (ink 9.7:1), and the stickers are unchanged. |
  | 320 | H1 at 36/40, phone 240 px, breakout card 200 px; the stage's `overflow: clip` prevents horizontal scroll |
  | Reduced motion | Same as no JS |
- **Watch-outs:**
  - **One `<h1>`**: the title. The header lockup is a link, not a heading. The current page wraps the lockup in `<h1>`; drop that.
  - **No marigold text in the H1.** The highlight is `brand-soft` behind `ink`, never marigold words, and never marigold behind words.
  - **The invite card's goal bar** is marigold (a bar, not a button) and always has its sentence twin. Don't add an [Add money] or [Join] button to the mock invite.
  - **Don't put a second floating card on the phone at 390.** With two, the chat becomes unreadable at 264 px.
  - **Button bug:** pass `nativeButton={false}` whenever a `Button` renders a `Link` (brief).
  - **Jargon:** the hero never says crypto, wallet or USDC; "$" and "dollars" carry the money.

### 2. The problem

- **Job:** make the pain specific and a little funny (Leo's "typing…" that never becomes $150), then show why the usual fixes fail, and hand off to "what if the money lived in the chat?".
- **References:**

| App | Section | What to borrow | What to leave |
|---|---|---|---|
| Beside | [The problem](https://mobbin.com/sites/sections/d19fc233-a9d7-460f-86f0-06df400c7655) | A small "The problem" eyebrow, the headline on the left, and the problems as a numbered list on the right, each with a short neutral verdict tag on its row ("Handled by Beside") | The two-tone gradient headline and the testimonial carousel |
| ClickUp | [Context sprawl](https://mobbin.com/sites/sections/8138d756-c6c3-467d-a0e3-da83437d850b) | Each problem gets a tiny visual of the mess itself: floating chat bubbles ("Where's that…", "Who can help…"). Ours is a real mini chat with "Leo is typing…". | Percent stats, the 3D knotted rope and the video button over the headline |
| Front | [Does this sound familiar?](https://mobbin.com/sites/sections/fdeb0c2b-6196-4d02-b036-9b4c03badce5) | The pivot line after the pains ("In comes Front…"), set large and centred, which hands off to the solution | Four generic icon cards |
| Front | [Front vs help desk](https://mobbin.com/sites/sections/887ca35c-b1cf-4975-82af-c178a50ff4a4) | Optional for lg only: a two-column "this vs that" comparison | Red ✕ and green ✓ as the only cue, and the gradient wash |

- **Pot version, 390** (`id` none; the section is `<section aria-labelledby>`):
  1. Head: `home.problem.eyebrow` "The problem" → H2 `home.problem.title` "Every group trip has a money problem".
  2. **Card 1, the hook** (`bg-surface rounded-lg shadow-card p-4`):
     - `heading` `home.problem.front.title` "One friend fronts it all", then `body-sm` `text-ink-muted` `home.problem.front.body`.
     - A mini chat on a `bg-surface-sunken rounded-md p-3` panel (`ChatThread`, `inert` + `aria-hidden`; the card's `aria-label` is `home.problem.front.chat.label`):
       - A centred `body-sm` `text-ink-muted` day label "Day 2", then Maya's bubble: "Leo, your $150 for the trip? 🙏".
       - "Day 23", then Maya: "Leo??", then "Seen" under it in `body-sm`.
       - Leo's typing bubble: his `member-3` avatar, `TypingDots size="sm"`, and "Leo is typing…" set in the people highlight (`bg-member-3 text-on-brand`).
     - The punchline under the panel: `home.problem.front.punchline` "Leo has been typing since day 2." in `body` `text-ink`.
  3. **Cards 2 and 3** (same card style, `mt-3`): a `heading` (`home.problem.split.title`, `home.problem.shared.title`), a `body-sm` `text-ink-muted` body, and a **verdict pill**: `bg-surface-sunken rounded-pill px-3 py-1`, a Lucide `x` in `text-ink-muted` and the verdict in `label` `text-ink` (`home.problem.split.verdict` "Holds no money", `home.problem.shared.verdict` "One person holds it all"). It's neutral, not `declined` red: these aren't Pot states, and red means "Not approved" in this product.
  4. **Pivot** (`mt-8`, centred): `home.problem.pivot` "What if the money lived right in the group chat?" in `font-display text-title`, with the static eggplant glyph (`Glyph`, 40 px, decorative) above it. That's the three dots resting, the video's Act 2 beat, without motion.
- **Pot version, lg:** the head spans the full width (left-aligned). Below it, a 12-column grid: card 1 in cols 1-7, with the chat panel tall enough to show all four lines; cards 2 and 3 stacked in cols 8-12 (`gap-3`). The pivot spans the full width, centred, `mt-12`.
  - **Optional:** a compact comparison table under the cards: rows "Holds the group's money", "Rules everyone agreed to", "No one can take money out alone", "Everyone gets their share back"; columns "Fronting it", "Split apps", "Shared account", "Pot". Use a real `<table>` with `<th scope>`, marks as Lucide `check` or `x` in `ink` with visually hidden "Yes"/"No", never green and red. Default: skip it; the three cards already carry the argument (open question 6).
- **Watch-outs:**
  - **No stickers and no marigold in this section.** It is the "before". The first marigold the eye meets after the hero should be the how-it-works goal bar.
  - **No competitor names or logos** ("Splitwise", "Venmo"): "split apps" and "shared accounts" are enough and avoid trademark issues.
  - **The typing loop stops at 5 s** and starts only when in view. Without JS the dots are still, which also tells the joke.
  - **Day labels** ("Day 2", "Day 23") are decorative inside the inert chat; the `aria-label` sentence carries them.

### 3. How it works (`#how`)

- **Job:** show the whole loop in five beats with real UI (create with rules → share and join → instant spend → group approval → close with fair shares), so a judge gets it from the fragments alone.
- **References:**

| App | Section | What to borrow | What to leave |
|---|---|---|---|
| Partiful | [How It Works](https://mobbin.com/sites/sections/020813a8-e0e9-4d30-9ed0-8f64ffbcae9b) | Short step titles with one line each, and a **tiny live UI fragment** per step ("Invite friends" with share targets is literally our step 2). The consumer-social tone is right. | The neon gradient and glow chips |
| Braintrust | [How it works](https://mobbin.com/sites/sections/3269321e-bdad-48fc-a49b-c1126a3fed77) | Each step is a **real UI card on a tinted panel** above "1. Post your job", with equal panel heights across the row | The lavender wash: ours is `surface-sunken` |
| Beside | [Beside answers the phone](https://mobbin.com/sites/sections/5ef7e058-1b1c-49f8-a582-5bd91770f2d0) | UI cards stacked on a sunken panel to show a sequence (call answered → contact created) inside one step | The hand-drawn circle around words and the floating ask bar |
| Beside | [Annotated phone](https://mobbin.com/sites/sections/03f765e3-3432-4ac7-ab08-a240654f65db) | Small "note" callouts beside the UI that name what's happening; for us, the rule sentence next to the $84 result | The tab strip above the phone |
| Zipline | [How It Works](https://mobbin.com/sites/sections/7b0ca7a7-caf2-42a6-b315-53b86c8cd190) | "01 / 02 / 03" numbers on equal-height cards | Full-bleed illustration colours per card |

- **Fragments, one per step** (all `inert` + `aria-hidden`, on `bg-surface-sunken rounded-md p-4` inside the step card, built from real components with D-61 data):

  | Step | Copy keys | Fragment | Sticker |
  |---|---|---|---|
  | 1 | `home.how.create.title` / `.body` | A `surface` mini card: `CoverTile` 🇵🇹 + "Lisbon Trip" (`heading`) + a "Trip rules" pill (`surface-sunken`, `label`); then the three rule sentences from `ruleSentences()` (Tabs.tsx) with Lucide `zap`, `users`, `user-round` icons and values in bold tabular `ink` | none |
  | 2 | `home.how.share.*` | `ChatThread` with Maya's `InviteBubble`; under it Leo's `member-3` avatar joining, a `feed.contribution` row "Leo added $150.00" with "+ $150.00" in `approved`, and a `GoalBar` with `pot.goal` "$450 of $450 collected" | none |
  | 3 | `home.how.instant.*` | The result capsule from 02 §4: a `brand-soft` row, `check` in `approved`, `spend.approved` "Approved by Pot rules" in `ink` `label`, and "Under the $100 instant limit" in `body-sm`; then `MoneyText` "$84.00" with `StatusChip status="sent"`; then "In the Pot $366.00" | groceries |
  | 4 | `home.how.group.*` | A static `RequestCard` look: Maya's avatar, "Maya asks for $300 for the boat", `MoneyText` "$300.00", `StatusChip status="needs"` "1 of 2 approvals", and an `ApprovalTimeline` (Maya ✓ "approval counted", Leo ○, Sam ○). **No marigold Approve**: omit the buttons, or render [Approve $300] secondary. | boat or tickets |
  | 5 | `home.how.close.*` | `RefundTable` with Maya, Sam and Leo, each "Put in $150.00 · Gets back $22.00", total $450.00 / $66.00, plus a `StatusChip status="approved"` with `close.done.title` "Pot closed" | suitcase or receipt |

- **Pot version, 390:** head (`home.how.eyebrow`, H2 `home.how.title`), then five step cards in one column (`gap-4`). Each card is a `<li>` in an `<ol>` (so "Step 3 of 5" comes for free):
  - A step marker: a 32 px `bg-surface-sunken rounded-pill` circle with the numeral in `font-display` `label` `tabular-nums`, plus `home.how.step` "Step {n}" visually hidden or in `body-sm` `text-ink-muted` beside it.
  - The title in `heading`, the body in `body-sm` `text-ink-muted`, then the fragment panel.
  - The sticker overlaps the fragment panel's top-right corner by 30 %.
  - A decorative 2 px `line` rail can join the step markers down the left edge (`aria-hidden`).
- **Pot version, lg:** the head is left-aligned at full width. The steps form a **2-2-1 bento** (`lg:grid lg:grid-cols-2 lg:gap-6`; the cards stretch, so each row's fragment panels share a height):
  - Row A: step 1 (rules) | step 2 (share and join), the setup.
  - Row B: step 3 (instant $84) | step 4 (group $300). Side by side, "under $100 approves itself" and "over $100 goes to the group" become the page's clearest contrast.
  - Row C: step 5 at full width (`lg:col-span-2`): text on the left (cols 1-5), `RefundTable` on the right (cols 6-12).
- **Motion:** each fragment panel may fade up once on entering the viewport (page-wide rule). Nothing inside a fragment animates: no count-up, no burst, no dots loop.
- **Watch-outs:**
  - **Fragments are not screenshots.** Real components keep text crisp, themable and readable by AI judges. Don't use the PNGs from `notes/screens/`.
  - **Two denominators** (02 §3): rules and previews say "2 of 3 approvals"; a live request says "1 of 2 approvals". Step 4's chip says "1 of 2 approvals", and its body copy explains that Maya's own approval counts.
  - **Instant-row contrast:** `approved` text on Day `brand-soft` is 4.35:1, so only the check icon is green; the words stay `ink`.
  - **Avatars on `brand-soft`** get the 2 px `surface` ring (`member-1` on `brand-soft` is 1.18:1).
  - **Words:** approvals, approve, the group, rules. Never vote, proposal, settle, contract or budget, which the lint bans.

### 4. Try the rules (`#rules`)

- **Job:** let the visitor *feel* the rule: pick an amount and watch Pot decide, instantly for small spends or "the group decides" for bigger ones.
- **References:**

| App | Section | What to borrow | What to leave |
|---|---|---|---|
| Beside | [Live demo](https://mobbin.com/sites/sections/bacfcd5d-bcca-4640-8fcf-da2f03dc8669) | "Don't take our word for it. Give it a try now.": copy and one action on the left; on the right, a conversation card on a sunken panel that **ends in a checked result row** ("✓ Appointment booked") | The two-tone muted/ink headline and the gradient phone number |
| Klarna | [Estimate your payments](https://mobbin.com/sites/sections/5d70975c-8895-498f-afa2-13852e9c2b22) | A **big amount centred above the control**, with the outcome as rows that keep the amount right-aligned | The slider as the only input |
| Duolingo | [How many on your team?](https://mobbin.com/sites/sections/e19a3827-93f1-44d7-b629-bc44a070152f) | A playful question as the headline beside a small, calm calculator card | The slider and the all-green button |
| Goldsand | [Simulate your savings](https://mobbin.com/sites/sections/d76a3205-fbe5-4d55-abff-88cb84b13d72) | A sunken card where the result number is the biggest thing and the input sits in its own inner box | Green numerals: state colours never fill a big figure |
| monday.com | [Try it out](https://mobbin.com/sites/sections/cb5efa4f-8757-45c7-a26f-ffadd272a4fb) | A one-line hint above the playground that it is live ("Click anything here…") | A full fake app with scrollbars |
| Whop | [Profit calculator](https://mobbin.com/sites/sections/4db0b302-8a31-4645-b1e1-21d72a3c3bea) | Nothing | Sliders only, with no typed or tapped alternative (WCAG 2.5.7) |

- **Pot version, 390** (full-bleed `bg-surface-sunken` band, `py-12`; the `home.try.*` keys belong to the playground agent):
  1. Head: eyebrow, H2, intro, and a one-line hint in `body-sm` `text-ink-muted` (as in monday.com).
  2. **Playground card** (`RulesPlayground`, `bg-surface rounded-lg shadow-card p-4`, `max-w-flow mx-auto`):
     - **Context line:** `CoverTile` sm 🇵🇹, "Lisbon Trip", and "In the Pot $450.00" in `body-sm`; it states the Pot has $450, which explains a "blocked" result.
     - **Amount:** `MoneyText variant="hero"`, centred, with `aria-live="polite"` on the result box only, not on the number.
     - **Amount choices:** a single-select row of chips (`Chip` from `components/pot/Controls.tsx`, `role="radiogroup"`), 44 px tall, `radius-sm`, `label`, wrapping to two rows at 320.
       - Unselected: `surface` with a `line-strong` border. Selected: `brand-soft` with a `brand-deep` border and a check icon (02 §3).
       - Seed them with the story's amounts: **$84** and **$300** (D-61), plus the $100 boundary.
       - An "Other amount" choice opens a 16 px `inputmode="decimal"` field (no slider; see watch-outs).
     - **Result box** (02 §3's RulePreview, `bg-surface-sunken rounded-md p-3 min-h-16`, polite live region):
       - Checking (≥ 1.2 s): `TypingDots` + `spend.checking` "Checking Pot rules…".
       - **Instant:** the fill turns `brand-soft`, a `check` in `approved`, `spend.approved` "Approved by Pot rules" in `ink` `label`, and `rules.instant` in `body-sm`. `Celebration` plays once, from this box, **only after the visitor's tap**.
       - **Group:** a `clock` in `waiting`, "This needs 2 of 3 approvals" in `ink` `label`, and "It's over the $100 instant limit." (`preview.vote.over_cap`). No burst.
       - **Blocked** (more than the Pot holds): an `x` in `declined` with `ink` text (`preview.blocked.balance` wording). No red sentence.
     - **Exit:** a secondary [Try the demo] link under the card, the only button besides the chips.
- **Pot version, lg** (12 columns): copy in cols 1-5 (head, hint, then the **three rule sentences** as a list with icons, as in the Rules tab). The rule that decided the current result gets a `brand-soft` row with a check icon: "the rule is visible after" (02 principle 4). The playground card sits in cols 6-12, vertically centred.
- **Server render:** the SSR/no-JS state is a meaningful default: $84 selected and the final instant result shown statically ("Approved by Pot rules · Anyone can spend up to $100 without asking."). The rule sentences are plain text, so AI judges read the rule and its outcome.
- **Watch-outs:**
  - **No marigold here.** The chips are toggles, not primary buttons, and the result box never turns `brand` (only `brand-soft`).
  - **No amount slider** (02: ux-spec §8, WCAG 2.5.7 and precision). Use chips plus a typed field.
  - **Don't write the result into the H2.** The live region announces once per change: "Approved by Pot rules" or "This needs 2 of 3 approvals".
  - **Keep the 1.2 s "Checking Pot rules…" beat** even when the answer is computed locally: it is the brand's pacing. Reduced motion keeps the beat but drops the dots' pulse and the burst.
  - **Don't promise more than the product does.** The per-person $200 rule exists (D-61); if the playground models it, say whose $200, in words ("Maya has $116 left to spend without asking").

### 5. Trust

- **Job:** answer "is it safe?" in one sentence a friend would repeat ("No one can take money out alone"), backed by three short facts.
- **References:**

| App | Section | What to borrow | What to leave |
|---|---|---|---|
| Wise | [Trust us to look after your money](https://mobbin.com/sites/sections/0740a282-cb01-4c0f-9720-8d842a95359a) | One confident headline, one line of context, then **three icon facts in a row**, each a short title and one line | The 3D padlock render |
| Wise | [Disappoint thieves](https://mobbin.com/sites/sections/b0f30855-bfdb-458b-97c8-ef46bd5037ee) | A plain, slightly witty headline; icons in soft round tiles (our `surface-sunken` circles) | The green pill button |
| Airtasker | [Trust and safety](https://mobbin.com/sites/sections/e390c68e-a369-43a8-8a35-d11f56865db3) | Status chips floating on the visual as proof ("Job completed", "Payment released"). For us, two StatusChips, the two lanes of money out. | The stock photo and the brush illustration |
| Uber Eats (iOS) | [Group orders intro](https://mobbin.com/screens/bc2b5a11-aa02-44c0-9865-99c08be2bd25) | The 390 layout for facts: an object icon, a bold one-line title and one plain line per row, stacked | The black button |
| Public | [Secure by design](https://mobbin.com/sites/sections/a68d588f-1d33-489d-9e65-920c5df68e2f) | Nothing | Regulator badges (FINRA, FDIC). Pot has none, and we must not imply bank-style protection |

- **Pot version, 390** (`ground`, `py-12`):
  1. Eyebrow `home.trust.eyebrow` "Is it safe?", then H2 `home.trust.title` "No one can take money out alone." in `title`, then `home.trust.body` in `body` `text-ink-muted`.
  2. **Proof chips** (`mt-4`, a wrapping row, `inert` + `aria-hidden`, since the body sentence already says it): `StatusChip status="approved"` "Approved by Pot rules" and `StatusChip status="needs"` "1 of 2 approvals".
  3. **Facts card** (`bg-surface rounded-lg shadow-card`, `mt-6`): three rows, each `p-4`, divided by `border-line`:
     - A 40 px `bg-surface-sunken rounded-pill` circle with a 20 px Lucide icon in `ink`.
     - The title in `label` `text-ink` and the body in `body-sm` `text-ink-muted` (`home.trust.google.*`, `home.trust.install.*`, `home.trust.back.*`).
     - Icons: `log-in` (Google sign-in; never Google's G outside an official button), `link` (nothing to install, opens from the link), `split` (everyone gets their share back).
- **Pot version, lg:** the head is left-aligned in cols 1-7, with the proof chips on the right (cols 9-12, aligned to the H2's baseline). The facts become three columns (`lg:grid-cols-3`) with no outer card, each fact on its own `surface` card, as in Wise.
- **Watch-outs:**
  - **No padlocks, shields, vaults, coins or piggy banks.** The proof is behavioural (rules and approvals), so the visuals are the product's own chips.
  - **The chips are states, so they keep icon + word + colour.** Don't shorten them to coloured dots.
  - **No "bank-grade", "insured" or "secure by blockchain" claims.** The copy keys already avoid them; keep it that way.
  - Avoid a `check` icon on fact rows: in this product a check means "approved".

### 6. Under the hood (`#tech`)

- **Job:** give judges the architecture in 30 seconds (every Pot is a Sputnik DAO on NEAR, the Pot Hub is the 1-of-1 rule checker, members decide by majority, gasless via our NEP-366 relayer, Google sign-in with 0 NEAR, USDC shown as dollars, pro-rata refunds), and send them to the live demo. It's the only place tech words appear.
- **References:**

| App | Section | What to borrow | What to leave |
|---|---|---|---|
| Duna | [The infrastructure behind every decision](https://mobbin.com/sites/sections/bfa5af78-e3be-420f-a9fb-23e5a2edda20) | **One central "engine" node** (Policy Engine) with four labelled satellites joined by thin lines. Ours: the Pot Hub in the middle of the money path. | The painted volcano inside the node |
| Cloudflare Workers | [Platform infrastructure](https://mobbin.com/sites/sections/3f43d4a8-c70c-4f82-a216-52bd0a30a932) | A left-to-right **flow** from users through labelled boxes with dashed connectors and short labels on the arrows; precise without being dark | The tiny mono labels and the multicolour boxes |
| Reducto | [Built to read the way humans do](https://mobbin.com/sites/sections/a6d745f1-654b-4c53-be50-395831c75766) | Short labelled callouts placed around one object, each a bold label and two lines | The iridescent 3D discs |
| Intercom | [Fin AI Engine](https://mobbin.com/sites/sections/d7229859-7935-46bd-9859-fd407ec9ec42) | The tone: a dark, quiet band with annotated parts that feels engineered | "FIG 3.A" mono captions and the sci-fi render |
| Overmind | [Under the hood](https://mobbin.com/sites/sections/3a7b8338-2d78-4ced-9d4b-fbe12ac7e393) | Nothing | Floating cubes and pixel art read as "blockchain cubes", which the brief bans |
| Rox | [Layers](https://mobbin.com/sites/sections/f81fe9bd-84ae-40e5-8ddd-6a406a3442fc) | Nothing | Isometric stacked slabs: hard to read, impossible at 390 |

- **Pot version, 390** (`<section id="tech" data-theme="night">`, full-bleed `bg-ground text-ink`, `py-12`):
  1. Head: `home.tech.eyebrow`, H2 `home.tech.title` "How NEAR makes it work", `home.tech.intro`.
  2. **Flow diagram** as real HTML: an `<ol>` of nodes joined by 2 px `line-strong` connectors (`aria-hidden`). Each node is `bg-surface border border-line rounded-md p-3` with a `label` title and a `body-sm` `text-ink-muted` line. Node labels need ⓟ `home.tech.flow.*` keys (copy agent).
     1. "Maya taps Spend $84" (her `member-1` avatar)
     2. "Our relayer pays the gas (NEP-366)"
     3. **"Pot Hub checks the rules"**: the emphasised node. It gets a 4 px `brand` top edge (marigold as a card top, allowed) and "1-of-1 rule checker in every Pot".
     4. Two lanes, side by side even at 390 (`grid-cols-2 gap-2`):
        - "Inside the rules": `check` in `approved` + "Approved instantly".
        - "Bigger spends": `clock` in `waiting` + "Members approve by majority".
     5. "The Pot (a Sputnik DAO) pays out USDC, shown as dollars"
  3. **Fact cards** (`mt-8`, one column at 390, two from `md`): `home.tech.dao.*`, `.hub.*`, `.majority.*`, `.relayer.*`, `.auth.*`, `.money.*`. Each is `bg-surface border border-line rounded-md p-4`, with the title in `heading` and the body in `body-sm` `text-ink-muted`. Numbers ("1-of-1", "0 NEAR", "2 of 3") are tabular.
  4. **Demo and credit** (`mt-8`): `home.tech.demo.body` in `body-sm`; [Open the live demo] secondary (`home.tech.demo.cta` → `/demo`); then `home.tech.built` "Built at NEAR HACKATHON 2026" in `label` and `home.tech.tracks` in `body-sm` `text-ink-muted`, as a quiet badge row.
- **Pot version, lg:** the head is in cols 1-7. The flow runs **left to right** across the full width, five columns with the two-lane split in the fourth (Cloudflare's shape; the Hub node is visually centred, as in Duna). The fact cards form a `lg:grid-cols-3` 3 × 2 grid. The demo row is a flex row: text left, button right.
- **Watch-outs:**
  - **Tech words only under `home.tech.*`** (the allowlisted prefix). The diagram's labels, alt text and `aria-label`s count too, so put every diagram string under `home.tech.flow.*`, not `home.how.*`.
  - **No inline text links inside the band.** Night `link` is `#ffc94d`, which reads as marigold text; use the secondary button.
  - **No glows, gradients, cubes, chain-link icons or grain.** "The tech section looks precise": thin lines, aligned boxes, tabular numbers.
  - **Be honest:** the intro already says "testnet today with test USDC". Keep any "mainnet" mention out of the band (creative-brief guardrail).
  - **Night scoping:** check axe inside the band too. The lockup isn't in this band; if one is ever added, `[data-theme="night"] .pot-lockup-day` already hides the dark wordmark.

### 7. Final call to action and footer

- **Job:** one last, warm push to start a Pot (secondary buttons only; the marigold was spent in the hero), then a small honest footer: test money, built at NEAR HACKATHON, back to top.
- **References:**

| App | Section | What to borrow | What to leave |
|---|---|---|---|
| Notion | [Let's talk + footer](https://mobbin.com/sites/sections/8abed1a3-73c3-46af-a057-9e45bf8840bf) | A centred short headline, one line and the action, then the footer under a hairline. Nothing else. | The five-column link footer: we have no pages to list |
| Circle | [Final CTA](https://mobbin.com/sites/sections/97cab45c-15a6-4607-82f6-5bd49b5eb27b) | **People around the call to action**, joined by dotted lines. Ours: Maya, Sam and Leo's avatars. | The dark navy band and the blue filled button |
| Cycle | [CTA + footer](https://mobbin.com/sites/sections/60044a93-0808-4d2c-903b-136e2289d709) | The call to action in a **rounded container with objects peeking from its corners** (our stickers), two buttons, and a small badge ("Product of the Week"), the model for "Built at NEAR HACKATHON 2026" | The saturated blue fill |
| Wispr Flow | [Footer](https://mobbin.com/sites/sections/d2b17651-2709-4db5-99f2-d14af9dd09b2) | A big logo as the sign-off. Ours is the lockup, whole and uncropped. | Cropped giant wordmarks (also BAGGU, Legora): the brand forbids cropping or showing the name without the mark |

- **Pot version, 390:**
  1. **Call-to-action card** (`bg-surface rounded-lg shadow-card p-6`, centred text, `relative`, inside a parent with `overflow-x: clip`):
     - An `AvatarStack` of Maya, Sam and Leo (40 px, `surface` ring).
     - H2 `home.final.title` "Start the Pot before anyone fronts the money" in `title`.
     - `home.final.body` in `body` `text-ink-muted`.
     - Buttons (`mt-6`, stacked full width; from `sm:` a centred row): [Start your Pot] secondary (`home.final.cta.start` → `/pots?sheet=create`) and [Try the demo] secondary (`/demo`).
     - One sticker (tram, 72 px) overlapping the card's top-right corner.
  2. **Footer** (`border-t border-line`, `pt-8 pb-[calc(32px+env(safe-area-inset-bottom))]`, `mt-12`), stacked:
     - `Lockup` h-10 linking to `/`, the tagline `home.title` in `body-sm` `text-ink-muted`.
     - `home.footer.preview` "Preview: Pots use test money for now…" with a Lucide `info` icon (20 px, `ink-muted`).
     - `home.tech.built` "Built at NEAR HACKATHON 2026" (allowed: it's a `home.tech.` key).
     - `home.footer.top` "Back to top" as a 44 px text link to `#main`.
- **Pot version, lg:** the card is `p-12` inside `max-w-app`, with two stickers (tram top-left, sunglasses bottom-right) overlapping its corners and the avatars possibly joined by a dotted `line-strong` connector (decorative, as in Circle). The footer is one row: lockup and tagline left; preview note, credit and Back to top right.
- **Watch-outs:**
  - **Don't make this band marigold.** It's tempting (the video's "marigold flood"), but:
    - Night secondary buttons are transparent with light `ink` text: about 1.6:1 on marigold.
    - `line-strong` borders are about 2:1 against marigold.
    - A marigold block with a button reads as a second primary.
  - **Both buttons are secondary** (brief). If they need a lead, order them (Start first) and add a Lucide `arrow-right` to [Start your Pot]; don't change its fill.
  - **No social icons, newsletter or app-store badges.** There is no app to download, and the PWA installs from the browser.
  - **The footer must not repeat the jargon:** "test money", not "testnet" or "USDC", outside `home.tech.*`.

---

## Proposed copy keys (ⓟ)

These go to the copy agent and must pass the jargon lint (the `home.tech.` prefix is allowlisted).

| Key | String (suggestion) | Why |
|---|---|---|
| `home.tech.flow.label` | How a spend moves through Pot | `aria-label` of the diagram `<ol>` |
| `home.tech.flow.tap` | Maya taps Spend $84 | Node 1 |
| `home.tech.flow.relay` | Our relayer pays the gas (NEP-366) | Node 2 |
| `home.tech.flow.hub` | Pot Hub checks the rules | Node 3, emphasised |
| `home.tech.flow.hub.sub` | 1-of-1 rule checker in every Pot | Node 3 sub-line |
| `home.tech.flow.instant` | Inside the rules: approved instantly | Lane A |
| `home.tech.flow.group` | Bigger spends: members approve by majority | Lane B |
| `home.tech.flow.payout` | The Pot, a Sputnik DAO, pays out USDC shown as dollars | Node 5 |
| `home.how.fragment.*` (only if needed) | Short `aria-label`s for step fragments, if the step body doesn't already say it | Only where the copy doesn't cover what the fragment shows |

## Open questions for Cerasela

| # | Question | Default |
|---|---|---|
| 1 | **Landing display size.** The brand's largest display style is `balance-hero` 44/48. Use it for the H1 at every width, or add a `display` style (for example 56/60 at ≥ 1024) to `tokens.json` through the Design System artifact? | Use `balance-hero` everywhere for now; restraint suits "premium, never crypto-bro" |
| 2 | **Under the hood as a Night-scoped band in Day theme** (`data-theme="night"` on the section), the video's x-ray act? | Yes |
| 3 | **H1 highlight colour:** `brand-soft` ("the rules' colour"), or `member-1`? | `brand-soft`: member colours mean people |
| 4 | **How it works at lg:** a 2-2-1 bento, or five full-width rows? | Bento: the instant-vs-group contrast sits side by side |
| 5 | **Sticky header on phones** (56 px, solid `ground`, `line` border, [Try the demo] always reachable)? | Yes, with `scroll-mt-20` on the section targets |
| 6 | **Comparison table in the problem section at lg** (Fronting it · Split apps · Shared account · Pot)? | No; the three cards carry it |
| 7 | **Hero breakout card copy:** the mock shows "−$84.00" as money out of the Pot, while Maya's own receipt says "$84 sent to you". Keep "−$84.00" (the Pot's view), or show "+ $84.00 to Maya"? | "−$84.00" with "Under the $100 instant limit" |

## Note on references
All references are Mobbin captures of third-party sites and apps, cited by link and used for layout patterns only. Pot's look comes from its own brand. Mobbin image links expire after 30 days, but the `mobbin.com` page links above stay valid.
