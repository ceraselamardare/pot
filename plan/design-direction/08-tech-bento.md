# Design direction 08: the tech bento (Under the hood's six facts)

Written 2026-11-03 for the design lead and the builder. It replaces the six fact cards of [03](03-landing.md) §6 (a 3 × 2 grid of text cards under the flow diagram) with a bento of six cells, each with a tiny visual, and adds one optional beat to [04](04-landing-motion.md) §6. The flow diagram, its $84 trace, the demo row and the hackathon credit stay exactly as they are.

1. **The diagram is the path; the bento is the parts.** The flow traces one spend. Each cell is a close-up of one stop on that path, in the same order, and says what that part guarantees and what it costs. No cell redraws a connector, repeats a node's sentence or runs a second trace.
2. **Every cell reads at three levels:** a playful but exact title (at most 6 words), one plain hook a friend could repeat, then the technical line that keeps every key term for the judges. Today's cards have a spec-like title and the technical line only, in the smallest muted type, which is why they read like a spec sheet.
3. **Every visual is the product's own UI,** built from tokens and real components (`Avatar`, `StatusChip`, `MoneyText`, `CoverTile`, and the seat look of the demo's `VoteMeter`), in a `ground` well at the cell's foot. Names, ids and numbers are real or measured. There are no illustrations, icon tiles, padlocks, code font or glow.
4. **Sizes follow the content.** The two facts with the richest visuals (the Hub's checklist and the money split) get the wide cells, the two number-like facts get the narrow ones, and the person's side opens with two halves. That gives 6 columns at lg (3·3 / 4·2 / 2·4), 2 at md and 1 on phones, always in the diagram's order.
5. **It stays calm.** There is one optional 1-second beat (the majority meter filling), it never loops, and it is static under reduced motion and without JS. The trace above remains the band's one story.

> **For:** the design lead and the builder of the landing's tech band. **Written:** 2026-11-03 by bento-research. This is direction only: no product code was changed.
> **Inputs:**
> - `CLAUDE.md`, `brand/README.md`, `notes/landing.md`, [03](03-landing.md) §6, [04](04-landing-motion.md) §6 and the catalogue, [07](07-site-update.md) §3 (the hairline cells of "What else a Pot can do").
> - Code: `components/landing/home/UnderTheHood.tsx`, `Section.tsx`, `motion/` (`sequence.ts`, `landing-motion.css`, `Sequences.tsx`, `RollingMoney.tsx`), `components/pot/` (`Avatar`, `StatusChip`, `CoverTile`, `RefundTable`, `GoalBar`, `ApprovalTimeline`), `components/money/MoneyText.tsx`, `components/demo/cards/Proposal.tsx` (`VoteMeter`), `components/demo/cards/Sent.tsx` (`WhoPaid`), `components/demo/Bits.tsx` (`Breaks`), `app/demo/_data/demo-script.json`, the `home.tech.*` keys in `i18n/en.json`, `i18n/banned.mjs` and `eslint.config.mjs` (`react/jsx-no-literals`).
> - Facts: `notes/contracts.md`, `notes/contracts-wave4.md`, `notes/deploy.md`, `notes/frontend.md` (hub 1.2.0 deployed on 2026-11-02), `notes/integrations.md` (the wallet fallback), `kb/sputnik-dao.md`, `kb/meta-tx-relayer.md`, `kb/accounts-onboarding.md`, `kb/near-auth.md`, `contracts/pot-hub/src/policy.rs` and `lib.rs` (`create_pot`), `contracts/CALIBRATION.md`, `packages/pot-sdk/src/actions/gas.ts` (`RELAY_POLICY`).
> - **Today's band, measured read-only** on the dev server (:3311, Playwright, reduced motion, 1280 × 800 and 390 × 844, Day and Night page themes):
>   - The band is **1,078 px** tall at 1280. The facts take 360 px of it (rows of 182 and 162 px).
>   - At 390 the band is **2,032 px**, and the facts take about 876 px.
>   - For scale, How it works is 1,965 px at 1280 and 3,235 px at 390. The whole page is 6,659 px and 10,263 px.
> - **Every proposed string, measured in the landing's own fonts:**
>   - titles are 200-227 px in `heading`, so each fits on one line from 320 px up;
>   - the Pot's account id is 196 px in `body-sm` and 215 px in `label`;
>   - "The refund of a missed all-or-nothing goal" is 262 px in `body-sm`;
>   - "0 NEAR" is 85 px in `title`;
>   - the line counts for every cell width are in §3.5.
> - **Two reference bentos,** studied in code and in screenshots at 1280 and 390 for patterns only. They are not named here.
> - **Mobbin:** 8 searches (7 of web sections, 1 of iOS screens), and every returned image was viewed. §1.2 lists the 16 references used.
>
> **Notation:** as in 03 and 07. `token` is a brand token or its Tailwind class; type styles use the brand's names (`heading`, `body`, `body-sm`, `label`, `title`); ⓟ marks a proposed `en.json` key. "lg" is ≥ 1024 px, inside `max-w-app` (1032 px of content at 1280, 976 px at 1024). "md" is 768-1023. "390" means phones, and every layout must also work at 320 with no horizontal scroll.

---

## v2 (built 2026-11-03): six looping scenes

The user's verdict on v1: "the visuals are not really helping digest that section… the Google one should represent the Google sign-in; the gas fee one, something shorter, easier to grasp. Same for all of them… less text, more some visual moving." So each cell is now **one tiny animated scene that shows its fact in about two seconds**, with far less text. v1's tech paragraphs and data wells (the receipt, the Hub's lists, the account card) are gone; the flow diagram keeps its own lines, and `/demo/all` stays the full technical read. Where v2 differs, it supersedes §3.4-3.5 (anatomy, heights), §4's visuals, §6 (motion) and §8 (keys) below.

**Cell anatomy.** Four rows of one CSS subgrid, so the scenes of a row line up even when a line wraps:
1. the title (h4, `heading`; v1's titles, unchanged);
2. one short line (`body`, `ink-muted`, at most 8 words, plain: `home.tech.<id>.hook`; the i18n test checks both);
3. the scene: a 120 px `ground` stage (1 px `line`, `rounded-md`, clipped), `role="img"` with one sentence (`home.tech.<id>.scene`), its inside `aria-hidden` and `inert`;
4. three tech tags (`home.tech.<id>.tags`, "A · B · C"): `body-sm`, `ink-muted`, 24 px outline chips, real text a judge can search for.

**Grid.** lg is 10 columns, rows 5·5 / 6·4 / 4·6 (the narrow cells are 331-353 px inside, so every line and tag row stays on one line at lg and md); md 2 columns; phones 1. Same order as the flow.

**The scenes as built.** Code: `components/landing/home/tech-scenes/` (one server component per scene, `Scene.tsx` the stage, `bento.css` the loops). Times are ms into the loop; every loop opens with a 200 ms reset (the end frame fades out, the start frame in) and ends on a 1.4-2 s rest on the end frame.

| Scene | Loop (first start) | Storyboard |
|---|---|---|
| **auth** "Zero NEAR, zero popups" | 4 s (0) | A mock of Google's own light "Continue with Google" button (Day tokens inside the Night band, the app's `GoogleMark`; never marigold). 1000: one tap, a .96 press and a ripple from under the thumb. 1400: the button resolves into Maya's account chip, her avatar where the G was, and the G stays on as a 14 px badge on its corner (so the rest and the still frame say Google too). 1900: "0 NEAR" pops. 2300: "Key saved on this phone" slides in 8 px. |
| **relayer** "Gas and deposits are on us" | 4 s (+600) | Starts at "$0.03 · you pay · gas, deposits". 1100: "gas" is crossed off (a line draws across it), and the figure ticks to $0.02. 1400: "deposits" is crossed off, $0.01. 1750: $0.00, big (`balance-hero`). 1800: a "Pot pays" tag (the relayer's send icon) slides in. Words are crossed off, never an amount (a struck amount means declined). The figure is a column of four `MoneyText` amounts rolling up a line per tick; $0.03 is about a tap's gas and deposits, and the scene never states it. |
| **hub** "A rulebot on a short leash" | 5 s (+300) | Two faint lanes and the rulebot's gate, "Up to $100" with the bot (the DAO scene's rulebot icon), across the top one. 300-1100: "🛒 $84" rides in from off stage and through the gate; 1150: "Approved" pops. 1700-2300: "⛵ $300" rides to the gate and stops (a 4 px recoil); 2600: it drops to the lane below; 2850: "Needs one OK" pops, then "from anyone" (one member's OK, not the majority of the next cell: a Pot made today gets one OK up to $300). The hint sits on the stage's own `ground`, so lane 2 never reads as a line struck through it. Everything hangs off `--gate` (40 % of the stage, or further left when the pass lane needs the room); pills travel in `cqw`. Below 16rem the pills drop their emoji; "from anyone" shows from 24rem. |
| **majority** "Majority rules. Literally." | 4 s (+900) | "Close the Pot" and three seats. 600: Maya's check pops (she asked, so hers counts), her meter segment fills, "1 of 3". 1200: Sam's, "2 of 3". 1700: "Approved" lands. Leo's seat stays dashed. |
| **dao** "One Pot, one DAO, no keys" | 4 s (0) | Lisbon Trip as a sealed box, the four seats dimmed on its top and bottom edges. 300-800: a key comes at its side and bumps it; pushed back, it dims, a ✕ pops and "0 keys" appears (`ink-muted`: a permission, not a failed request). 1500-1920: the seats light up one by one: Maya, Sam, Leo, the rulebot. No padlock. |
| **money** "Dollars in, fair shares out" | 5 s (+600) | Maya's, Sam's and Leo's $150.00 bars. 1000-1600: they rise and join into one bar, $450.00. 2000-2600: spends shrink it to its centre, thirds and all (× 0.1467): $66.00. 2700-3300: it splits, and each third drops into its owner's slot (the footprint their $150 left) as $22.00. |

**Motion contract** (the director's decision, aligned with WCAG 2.2.2):
- CSS keyframes only, transform and opacity (plus `clip-path` for the meter's fills: paint, never layout). Each loop's first and last keyframe is the scene's end frame, which is also the server HTML. So arming a loop changes nothing on screen, a pause can never strand an empty stage, and no JS, reduced motion and a scene that hasn't started all show the most explanatory frame.
- One client island, `SceneLoops.tsx`. It marks the list `data-scenes` (the loops attach, paused) and gives a scene `data-play` only while at least half of it is on screen, the tab is visible and the visitor hasn't paused. Anything else freezes it where it is (`animation-play-state`), so off-screen loops cost nothing.
- One Pause/Play control for all six, at the right end of the "Each part, up close" row. It is a toggle with one fixed name, "Pause the animations" (`home.tech.parts.pause`), and `aria-pressed` = paused. Its icon shows what a press does. It is a 44 px target around a 36 px secondary circle, with no marigold.
- Without JS or with reduced motion, the control isn't rendered. Its row keeps its 44 px either way (CLS 0). Reduced motion gets no step button: the end frames already say it all.
- First starts are staggered (relayer and money +600 ms, hub +300, majority +900), so rows that come into view together never reset in unison.
- The flow's one-shot $84 trace is unchanged and stays the band's only `[data-sequence]`.

**Copy.** New keys:
- `home.tech.parts.pause`;
- `home.tech.<id>.tags` and `home.tech.<id>.scene`;
- the scenes' words, `home.tech.<id>.s.*`.

The hooks were rewritten where needed: dao "It holds the money. Nobody holds a key.", money "Close it: everyone gets their share back.". Retired: every `home.tech.<id>.body`, `home.tech.<id>.visual` and `home.tech.<id>.v.*`. Reused app keys: `signin.google`, `feed.pending.one_ok`, `chip.approved`, `create.name.placeholder`.

**Heights** (measured, reduced motion, Day):

| Width | v1 band | v2 band | v2 bento |
|---|---|---|---|
| 1280 | 1,604 | 1,592 | 842 (rows of 270) |
| 390 | 2,975 | 2,772 | 1,584 (cells of 254) |
| 320 | — | 3,092 | — |

**Deviations from the brief, for the design lead:**
- The auth tags leave out "device key". It is in the flow's first node and in the scene's "Key saved on this phone", and three tags keep every tag row on one line at md. The DAO's "no access keys" tag reads "0 keys", the scene's own words, so it fits the 4/10 cell.
- The hub pills show an emoji and whole dollars, like the playground's amount chips.
- The 10-column grid replaces v1's 6 columns.

---

## 1. What the references teach

### 1.1 Patterns from the two reference bentos

| Pattern | What they do | Take | Leave |
|---|---|---|---|
| **Grid** | One goes 1 → 2 → 3 columns, with one tall cell (row span 2) and two wide cells (column span 2). The other goes 1 → 2 → **6** columns, so that one row can be 4 + 2 and the next 3 + 3. A 3-column grid can't make a row of two equal halves | The 6-column base: rows can be halves or thirds, and spans are chosen by what the visual needs | Row-span towers (a tall cell drags its row partners' height) and dense auto-flow (the visual order stops matching the reading order) |
| **Cell anatomy** | A short title and a one-sentence description on top, then the live micro-UI filling the rest of the cell, sometimes with an honest footer caption that says what a number is not | Title → hook → technical line, then the visual at the foot | — |
| **Titles** | Promise-shaped and concrete, 3-7 words, often a whole sentence about what the thing will or won't do, with a small twist | Playful titles that stay exact | — |
| **Visuals** | Real components (a timeline, widgets, a list), markup bars with % widths, SVG only for a real chart. One row of promised figures pairs each big number with its unit, a label and the id of the document it comes from | Markup plus real components; a number shown next to the standard it comes from | Mono tags (03: no code font), strikethrough for "not allowed" (in Pot a struck amount means declined or expired), an icon tile on every cell |
| **Grouping** | Two groups of claims in the page's one dark band: what the product refuses to do, and how you can verify it | The Hub's "It approves / It never approves"; the DAO cell's checkable account id | The timer that rotates the claims |
| **A11y** | A screen-reader sentence that summarises each visual, with the visual itself hidden | One label per visual (`role="img"`), or real content where the visual is the fact (the Hub's list) | — |
| **Motion** | Count-ups on reveal, icons that draw themselves, auto-advancing demos with a pause button, a 4° pointer tilt, hover lifts | One beat of at most 1 s that explains something (§6) | All the rest (04's "No" list: count-ups on stats, tilt, lifts on cards that aren't links, loops) |
| **Lessons from their own audits** | An inner layout must answer to its container, not the viewport. A grid child needs `min-w-0`, or one mock widens the whole page (in one case, 51 px of sideways scroll at every phone width). Don't let a box hold space it doesn't use. Never use `transition-all` | `@container` on every cell, `min-w-0`, and a height budget per row (§3.5) | — |

### 1.2 Mobbin

| Site | Section or screen | Borrow | Leave |
|---|---|---|---|
| Mercury | [Just one part of the platform](https://mobbin.com/sites/sections/539c4090-e9d6-4bd2-9ff9-656e8d1ac13c) | Six cards, each with a tiny fragment of real UI: account rows with balances, "Receipt required", "$9.6M" over a bar, "$250,000.00" over a signature. Six different pictures still read as one set because the panel has the same shape in every card | The arrow button in every card (ours aren't links) and the footnote marks |
| Parker | [A new generation of financial tools](https://mobbin.com/sites/sections/9a6ff27c-5c97-4518-938e-25c5dd7a1581) | Rows of 3, 2 and 1 cards. Varying the count per row is enough to break the spec-sheet look, with no row spans | An icon in a circle on every card, and a call to action inside the grid |
| V7 | [How it works](https://mobbin.com/sites/sections/e505b147-d9a1-4c08-ac58-fb785d47b1b6) | Text on top and the tiny visual at the cell's foot: a "Files" chip, a "Processing" status, one highlighted clause. Visuals made of chips and rows | A four-column strip that runs off the edge |
| Customer.io | [Infrastructure](https://mobbin.com/sites/sections/f4bba38e-1d01-4049-bca5-8590d16ff9cc) | A dark technical band where cells of different sizes still read as one object: one grid, shared edges | The abstract shapes and the logo wall |
| Uniswap | [Feature cards](https://mobbin.com/sites/sections/9f8857a1-0afb-4f5e-88dc-3f40d1f3d592) | Two wide cards over three narrow ones; the wide ones carry the richest pictures | Coin art and pink links |
| Klarna | [How Pay in 4 works](https://mobbin.com/sites/sections/b6f0369a-157c-454f-90a2-fe2b6aaaf160) | Tiny abstract rows with right-aligned amounts ($180, $85, $70). The picture proves the sentence under it | The lime highlight |
| Phantom | [Trading cards](https://mobbin.com/sites/sections/10765f4c-84d9-45f8-9fcd-8ba8d6a6ddf8) | "$134 · Payout Claimed": one big number and its words are the whole picture. That's the auth cell's "0 NEAR" | Flying tickets and the carousel |
| incident.io | [Scale, security, control](https://mobbin.com/sites/sections/8b01aa03-9fc7-48bb-9364-f2749faa795d) | Permissions shown as a real roles card. That's the Hub's checklist | The padlock in a shield |
| PayPal | [Manage your payments](https://mobbin.com/sites/sections/714f3c55-6716-4a0f-9506-f25e899fec88) | "2 of 12 Paid" right beside the amounts it counts. That's our "needs 2" beside the seats | The ring and the video overlay |
| Binance (iOS) | [Send](https://mobbin.com/screens/5f99db5f-92dd-4d01-b841-b1dbc6fd7258) | "Network fee paid by: … Gas Sponsor": the receipt names who covers the gas | The struck-through fee (in Pot a struck amount means declined or expired) and the raw addresses |
| World App (iOS) | [Confirm send](https://mobbin.com/screens/b1c9e68c-5190-41de-a034-f5e8cb06fd11) | "Transaction fee · $0.00": the person's cost in their own currency | The address and network rows |
| Base (iOS) | [Order preview](https://mobbin.com/screens/dc5865e4-a92a-477a-a7b7-f819fae68166) | Fee rows, label and value, closed by a total line | The warning card and "Secured by" |
| Maze | [Trust and security](https://mobbin.com/sites/sections/b07657a6-9166-45b2-bdc3-3fc8e29e4534) | Nothing: it's a warning | Six identical cards, each a tag and a sentence. That is our current look |
| Coinbase | [Advanced trading](https://mobbin.com/sites/sections/309b035c-e264-4262-b5aa-fb0de290a241) | Nothing | Four equal dark cards with 3D icons |
| Firecrawl | [Scrape, then interact](https://mobbin.com/sites/sections/53e926f9-d160-43c8-8641-9b7de2c73581) | Nothing | A code line in every cell (03: no code font) |
| Slush | [100% non-custodial](https://mobbin.com/sites/sections/05891498-2de8-40de-9302-8b035d67fd10) | Nothing | A giant padlock and an all-caps claim: the register 03 rules out, and an icon 03 §5 and 07 §3.6 ban |

---

## 2. How the bento relates to the flow diagram

The `<ol>` above is one spend's **path**: who acts, in which order, and which road the $84 takes. The bento holds the **parts**: what each stop can and cannot do, and what it costs. The cells follow the nodes' order, left to right at lg and top to bottom on phones, so each cell reads as the close-up of the node above it.

| Flow node (today's copy) | Cell | What the cell adds that the node doesn't say |
|---|---|---|
| 1 · "Maya taps Spend $84" · "Her phone signs a NEP-366 delegate action with its device key." | **Zero NEAR, zero popups** | Where that device key came from: Google sign-in through NEAR Auth, a named account that Pot creates, and an MPC recovery key beside the device key. The account holds 0 NEAR (NEP-448) |
| 2 · "Our relayer pays the gas" · "It checks a per-method allowlist and caps, then submits it." | **Gas and deposits are on us** | The bill for that same $84: ≈ 0.003 NEAR of gas (our relayer), ≈ 0.006 NEAR of proposal storage (the Pot Hub), and $0.00 for Maya. Also every deposit, down to the 1 yoctoNEAR, and the wallet exception |
| 3 · "Pot Hub checks the rules" · "It holds the 1-of-1 rulebot seat in every Pot." | **A rulebot on a short leash** | The seat's whole job: four things it may approve and two it never can |
| 4 · the lanes "Inside the rules" / "Bigger spends: one member's OK, or a majority" | **Majority rules. Literally.** | The road the trace leaves unlit (04 §6). What needs a majority, the strict-majority threshold (2 of 3), and the requester's approval counted automatically. This is the bento's only motion |
| 5 · "The Pot pays out" · "Its Sputnik DAO sends the USDC, shown as dollars." | **One Pot, one DAO, no keys** and **Dollars in, fair shares out** | What "the Pot" is on chain (a real, checkable account, its code by hash, 0 keys, its two roles), and how dollars come in (`ft_transfer_call`) and leave at close (pro rata, one proposal) |

**Rules that keep them apart**
- **The diagram owns lines, arrows and motion along a path.** The bento has no connectors, no arrows between cells, no `lit` rings and no traces.
- **One example is shared on purpose.** Maya's $84 is traced by the diagram and priced by the relayer cell's receipt: the receipt is the trace's price tag. No other cell reuses the $84. The majority cell uses the close, and the money cell uses the three $150s.
- **The bento doesn't reuse the node icons** (`Send`, `ListChecks`, `Banknote`), so the eye never pairs the wrong things. `Check` keeps its one meaning on both sides: approved.
- **No `brand-soft` and no marigold in the bento.** The diagram's instant lane is the band's one "the rules did this" highlight, and the Hub node's top edge is its one marigold surface.
- **A small label introduces the bento,** like the flow's own label: "How a spend moves through Pot" (the path), then "Each part, up close" (the parts).

---

## 3. Layout

### 3.1 lg (≥ 1024): six columns, rows 3·3 / 4·2 / 2·4

```
1280 × 800 · max-w-app, 1032 px of content · 6 columns, gap-4 · ≈ 1,060 px tall
Each part, up close                                         ← h3, label, ink-muted (as the flow's label)
row 1  [ 3 · Zero NEAR, zero popups        ][ 3 · Gas and deposits are on us    ]   the tap · the relayer
row 2  [ 4 · A rulebot on a short leash                  ][ 2 · Majority rules.  ]   the Hub · the group
row 3  [ 2 · One Pot, one DAO, no keys ][ 4 · Dollars in, fair shares out        ]   the Pot · its money
```

- `<ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-6 lg:gap-4">`, with spans `auth lg:col-span-3`, `relayer lg:col-span-3`, `hub lg:col-span-4`, `majority lg:col-span-2`, `dao lg:col-span-2`, `money lg:col-span-4`.
- No row spans and no `grid-flow-dense`: the DOM order is the visual order and the reading order.
- **Why this rhythm:**
  - The calm halves open the bento, and they are the person's side.
  - The zigzag puts the two wide cells, the Hub and the money, on a diagonal.
  - Each row is one topic, so md can keep the same pairs.
- **Inner widths** (the cell minus `p-6`):

  | Span | At 1280 | At 1024 |
  |---|---|---|
  | 2 | 285 px | 267 px |
  | 3 | 460 px | 432 px |
  | 4 | 635 px | 597 px |

### 3.2 md (768-1023): two columns, the same pairs
- Rows: [auth][relayer] / [hub][majority] / [dao][money], each cell about 354 px wide (306 px inside `p-6`).
- The Hub's list is one column and the receipt stacks as rows (§4); nothing else changes.

### 3.3 390 and 320: one column, the diagram's order
- `gap-3`, cells `p-4`, inner widths 326 px at 390 and 256 px at 320.
- The order is auth, relayer, hub, majority, dao, money: the same order as the nodes above.
- Every visual keeps its content; only its inner layout reflows, through container queries (§3.4).
- At 320 nothing scrolls sideways: cells are `min-w-0`, the account id breaks after its dots, and amounts never break.

### 3.4 Cell anatomy

```
┌ li: @container/fact · flex flex-col min-w-0 · bg-surface · 1 px line · rounded-lg · p-4 md:p-6 ┐
│ h4    title        font-display heading 19/24, ink              one line at every width   │
│ p     hook         body 16/24, ink · mt-2                       1 line, 2 at most (§3.5)  │
│ p     tech line    body-sm 14/20, ink-muted, tabular · mt-1     2-5 lines (§3.5)          │
│       (mt-auto spacer, then pt-4)                                                           │
│ ┌ well: bg-ground · 1 px line · rounded-md · p-3 md:p-4 · role="img" + label (§7) ──────┐ │
│ │ the tiny visual: real components and tokens, nothing under body-sm (14 px)             │ │
│ └───────────────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Three text levels.** The hook is `body` in `ink`: the "fun to read" line, a step larger than today's copy. The tech line keeps today's `body-sm` `ink-muted` and today's `<Unbroken>` wrapper (no break inside "NEP-366", "1-of-1" or "one-OK"). There are no eyebrow tags: every tech line starts with its key term.
- **The well sits at the cell's foot** (`mt-auto`), so wells line up along the bottom of a row. Cells are `rounded-lg` (24, 03's card radius) and wells `rounded-md` (16), so the bento's boxes are visibly softer than the diagram's `rounded-md` nodes.
- **Spacing uses brand steps only** (4, 8, 12, 16, 24): no `p-5`.
- **The inner layout answers to the cell, not the viewport.** Container breakpoints are Tailwind v4's defaults, on `@container/fact`:
  - the receipt goes 3-up at `@sm` (24 rem);
  - the Hub's list goes to two columns at `@lg` (32 rem).

  These thresholds fall between the measured inner widths of 306/326 (md and phones), 432-460 (halves) and 597-635 (wide cells).
- **No hover, no lift and no cursor change.** The cells aren't links (04 catalogue). Nothing in a cell is focusable.
- **Test hooks:** keep `data-tech-fact="<id>"` on each `li`, and add `data-tech-visual="<id>"` on each well.

### 3.5 Height budget (measured)
These are line counts of the §8 strings at each cell's inner width, in the landing's fonts:

| Cell | Title | Hook | Tech line, 320 / 390 / md / 1024 / 1280 |
|---|---|---|---|
| auth (span 3) | 1 everywhere | 1 | 4 / 3 / 4 / 3 / 3 |
| relayer (3) | 1 | 1 (2 at 320) | 5 / 4 / 5 / 3 / 3 |
| hub (4) | 1 | 1 (2 at 320) | 3 / 3 / 3 / 2 / 2 |
| majority (2) | 1 | 1 (2 at 320) | 4 / 3 / 3 / 4 / 4 |
| dao (2) | 1 | 1 (2 at 320 and 1024) | 4 / 3 / 3 / 4 / 3 |
| money (4) | 1 | 1 (2 at 320) | 5 / 3 / 4 / 2 / 2 |

**Wells:**

| Cell | Well height at lg | At 390 |
|---|---|---|
| auth | ≈ 114 px | ≈ 114 px |
| relayer | ≈ 128 px | ≈ 130 px |
| hub | ≈ 180 px | ≈ 256 px |
| majority | ≈ 160 px | ≈ 160 px |
| dao | ≈ 144 px | ≈ 144 px |
| money | ≈ 180 px | ≈ 180 px |

**Rows at 1280** come to ≈ 316, 368 and 348 px. That makes the bento **≈ 1,060 px**, against today's 360, so the band grows from 1,078 to **≈ 1,800 px**.

**At 390** the six cells, their gaps and the label come to ≈ 2,100 px, against today's 876, so the band grows from 2,032 to **≈ 3,250 px**, about the height of How it works. The page grows by about 11 % at 1280 and 12 % at 390. That is the cost of six visuals (§9 Q1).

**Levers**, if it must be shorter:
- trim the two 4-line tech lines in the narrow lg cells (majority, dao) to 3 lines;
- tighten the Hub's list rows to a 4 px gap;
- on phones, use `p-3` wells.

Don't cut the hooks: they are the point of the change.

---

## 4. The six cells

The order is the diagram's order. Every string is a `home.tech.*` key (§8). Amounts render through `MoneyText`; NEAR figures and counts are `tabular-nums`.

### 4.1 auth: "Zero NEAR, zero popups" (span 3)

| Part | Copy |
|---|---|
| Title | Zero NEAR, zero popups |
| Hook | Sign in with Google. Then just tap. |
| Tech line | Google sign-in via NEAR Auth. Pot opens a named account with an MPC recovery key and a device key: 0 NEAR held (NEP-448), no popup per action. |

**Visual: Maya's account**
```
(M)  0 NEAR                              Avatar sm (member-1) · font-display title, tabular, ink
     before and after every tap          body-sm, ink-muted
⚿  MPC recovery key, from NEAR Auth      Lucide key-round 20 px ink-muted · body-sm ink
⚿  Device key, on her phone
```
- **The two keys and the DAO cell's "0 access keys" are a deliberate pair:** the person holds keys, and the Pot holds none.
- **No account id here.** Maya is made up, and a real NEAR Auth account belongs to a real person. The one real id on the page is the Pot's (§4.5).
- **No Google "G" outside an official button** (03 §5). No wallet icon and no coin.
- **Facts:**
  - NEAR Auth never creates accounts. Pot's server derives the MPC key and creates `u-<8>.users.<root>` with two full-access keys: the MPC key (recovery) and the device key (kb/near-auth.md; notes/backend.md `POST /api/session`; notes/deploy.md).
  - The account is 224 B, below NEP-448's 770 B zero-balance limit (kb/accounts-onboarding.md).
  - The device key signs every delegate locally, so there is no popup (D-21).
- **Copy fix.** Today's line says "NEAR Auth creates a named account". That is imprecise, and the new line says "Pot opens".

### 4.2 relayer: "Gas and deposits are on us" (span 3)

| Part | Copy |
|---|---|
| Title | Gas and deposits are on us |
| Hook | Taps are free. We pick up the bill. |
| Tech line | NEP-366 meta-transactions: our relayer pays the gas and every deposit, even the 1 yoctoNEAR, within per-method allowlists and caps. Wallets that can't sign delegates pay their own. |

**Visual: the receipt for the $84 the diagram just traced**
```
Who paid for Maya's $84 spend                                       label, ink
 Gas             │ Proposal storage │ Maya                           body-sm ink-muted
 ≈ 0.003 NEAR    │ ≈ 0.006 NEAR     │ $0.00                          label ink, tabular ($0.00 = MoneyText)
 our relayer     │ the Pot Hub      │ in fees                        body-sm ink-muted
```
- **From `@sm/fact` (lg halves):** three columns divided by 1 px `line` rules (`divide-x`).
- **Below that (md, phones):** three rows, each with the label and payer on the left and the figure right-aligned. Maya's row comes last, under a 2 px `line-strong` rule (RefundTable's total rule).
- **Always "≈".** No strikethrough on the fee, no "Free" badge and no green: this is a receipt, not a state.
- **Facts:**
  - **Gas.** A relayed instant spend burns 32.5 Tgas ≈ 0.0033 NEAR (CALIBRATION §3); the demo script's real-run figure for the same $84 is ≈ 0.0030.
  - **Storage.** The Hub prepays the proposal's storage: 572 B ≈ 0.0057 NEAR (CALIBRATION §5); 0.00586 in the demo script. The DAO's float is never touched.
  - **Deposits.** The relayer pays every deposit inside a delegate, including the 1 yocto of `ft_transfer_call`, under `RELAY_POLICY`'s per-method receiver, deposit and gas caps (kb/meta-tx-relayer.md; `gas.ts`).
  - **The wallet exception.** A NEAR Connect wallet without `signDelegateActions` sends the call itself and pays its own gas (notes/integrations.md `walletSend()`).
- **The hook speaks for the main path** (Google and email sign-in, and delegate-capable wallets). The tech line names the exception in the same cell.

### 4.3 hub: "A rulebot on a short leash" (span 4)

| Part | Copy |
|---|---|
| Title | A rulebot on a short leash |
| Hook | It approves what the rules allow. Only. |
| Tech line | Our Pot Hub contract holds the 1-of-1 rulebot role in every Pot's Sputnik policy. |

**Visual: the role's whole job. It is real content, not a picture.**
```
It approves                                    It never approves                     label, ink (group labels)
✓ Spends inside the rules                      ✕ Rule changes                        Check in approved · X in ink-muted
✓ Invite joins                                 ✕ Spends over the one-OK limit        20 px, stroke 2 · body-sm ink
✓ One-OK spends, after a member's OK
✓ The refund of a missed all-or-nothing goal
```
- **Two columns from `@lg/fact`** (the lg wide cell), stacked below that. Rows have an 8 px gap (4 px if §3.5 needs it).
- **Markup:**
  - each group is a `<p id>` followed by a `<ul aria-labelledby>`;
  - the icons are `aria-hidden`, and the words carry the meaning;
  - this well has no `role="img"`: it is the fact itself.
- **Why the check is green here:** it means exactly what it means in the app, "approved by Pot rules". 03's warning against check icons on fact rows is about checks that *don't* mean approved.
- **Why the ✕ is `ink-muted`, not `declined` red:** these are permissions, not a request that failed. Red means "Not approved" on a real request (brand §4), and 03's problem section already uses a neutral ✕ for "not this".
- **Facts:**
  - **The role and the default approvals.** The rulebot role is one account, the hub, with `transfer` and `add_member_to_role` vote policies at 1/1 (`policy.rs`). That covers the instant spends (INV-05) and the invite joins (INV-09).
  - **One-OK spends.** The hub votes only after `ok_request` from another active member, and refuses if anyone has already objected (wave 4, D4-3). Hub 1.2.0 has been live on the testnet preview since 2026-11-02.
  - **The refund of a missed goal.** Only all-or-nothing Pots (policy v2) let the rulebot approve a `call`: the refund close that `refund_unfunded` proposes itself (wave 4).
  - **Never rule changes.** Rules change only through the DAO or a sole member (INV-10), and the hub never votes on a rules `call` (INV-03 as amended).
  - **Never a spend over the one-OK limit.** The hub approves only the instant and one-OK paths; everything else waits for the members.
  - **Deliberately left out:**
    - "Can't pay itself": the hub escrows pay-by-link payouts (D4-4).
    - "Keyless hub": the hub keeps its key until the Nov 12 lock (notes/landing.md decision 1).

### 4.4 majority: "Majority rules. Literally." (span 2)

| Part | Copy |
|---|---|
| Title | Majority rules. Literally. |
| Hook | Bigger calls wait for most of the group. |
| Tech line | Spends over the one-OK limit, rule changes and closing need a majority of members. Pot casts the requester's own approval automatically. |

**Visual: closing Lisbon Trip**
```
Close Lisbon Trip                       [✓ Approved]    label ink · StatusChip status="approved" (chip.approved)
(M)✓  (S)✓  ┃ needs 2   (L)◌                           Avatar sm · approved badge · 2 px ink rule + body-sm ink · dashed line-strong ring
Maya asked, so hers counts. Sam approved. Leo hasn't yet.   body-sm, ink-muted
```
- **The same look as the demo's `VoteMeter`** (`components/demo/cards/Proposal.tsx`): approvals first, then the "needs k" rule, then who is left. Feed it `CHAT_CAST`: Maya `member-1`, Sam `member-2`, Leo `member-3`.
- `VoteMeter` reads the demo's own data types, so build a small landing copy with identical classes (the `CloseTable` precedent in notes/landing.md), or lift the seat into `components/pot/` for both (§9 Q8).
- **The title's pun is the fact:** the majority changes the rules.
- **Facts:**
  - **The threshold.** It is a strict majority of the member role, `floor(n/2) + 1`, so 2 of 3 (kb/sputnik-dao.md).
  - **The approval Pot casts itself.** The DAO doesn't count the requester's approval automatically; Pot's client casts it. The demo's close chapter shows the proposer's approval followed by Sam's, which executes the close (`demo.real.c6.*`).

### 4.5 dao: "One Pot, one DAO, no keys" (span 2)

| Part | Copy |
|---|---|
| Title | One Pot, one DAO, no keys |
| Hook | It holds the money. Nobody holds a key. |
| Tech line | Each Pot is its own NEAR account, running the official Sputnik DAO v2 code from a global contract, by hash, with no access keys. |

**Visual: the Pot's account card**
```
🇵🇹 Lisbon Trip                               CoverTile sm (cover 0, as in How it works) · label ink
lisbon-trip.pots.potprev.testnet              body-sm ink · breaks after each dot (Breaks, demo/Bits.tsx)
Sputnik DAO v2, by hash Ea8tHX…RpgD           body-sm ink-muted
⚿ 0 access keys · 3 members, 1 rulebot        key-round 20 px · body-sm ink · "0" and "3" tabular
```
- **A real account anyone can look up.** It is the reference Pot on the preview root:
  - it has `list-keys` empty;
  - its `get_policy` holds member ×3 and rulebot;
  - its code is the global contract `Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD` (notes/deploy.md "Demo Pots").

  The id is 196 px in `body-sm`, so it fits the 253 px well at lg and the 232 px well at 320.
- **No padlock.** The brief imagined a "no keys" lock, but 03 §5 and 07 §3.6 ban padlocks, and a lock says "we locked it" when the truth is "nobody holds a key". A key icon, the word and the number say it exactly.
- **Facts:**
  - `create_pot` is `CreateAccount + Transfer(float) + UseGlobalContract(hash) + new` and never `AddKey` (`lib.rs`).
  - The hub never sends `AddKey`, `DeployContract` or `DeleteAccount` to a DAO (INV-14), and `dao_code_hash` is immutable (INV-17).

### 4.6 money: "Dollars in, fair shares out" (span 4)

| Part | Copy |
|---|---|
| Title | Dollars in, fair shares out (kept: it already works) |
| Hook | You see dollars, and get your share back. |
| Tech line | Balances are USDC, added with ft_transfer_call and shown as dollars. Closing pays every contributor pro rata in one DAO proposal: every refund, or none. |

**Visual: two share bars cut in the same places**
```
     (M)              (S)              (L)               Avatar xs, centred over each third
Put in · $450.00                                          body-sm ink-muted + MoneyText
[  $150.00       ][  $150.00       ][  $150.00       ]    segments bg-member-1/2/3 · text-on-brand · body-sm 600 · tabular
Back at close, in one proposal · $66.00
[  $22.00        ][  $22.00        ][  $22.00        ]    2 px ground gaps · rounded-sm ends
```
- **The bars are the pro-rata rule as a picture:** the "back" bar is cut exactly where the "put in" bar is cut.
- **People are colours** (03 principle 4): member tints with eggplant figures, 9.6-11.0:1.
- **No `GoalBar`** (it's marigold and means "collected"), and nothing moves: How it works step 5 already lands the refund rows and rolls $0.00 → $66.00. This cell is the rule, not the event.
- **Fit at 320:** each segment is about 75 px, and "$150.00" is about 55 px.
- **Facts:**
  - **Money in.** Contributions are `ft_transfer_call` into the hub, recorded only after it forwards them (INV-08).
  - **Money out.** The close is one `FunctionCall` to USDC with n `ft_transfer`s, so the refunds succeed or fail together. The payouts sum to the balance read in the same chain, by floor pro rata, with the dust (fewer than n micro-dollars) going to the last contributor (INV-11).
  - **The D-61 numbers.** $450 − $84 − $300 = $66, a third each.

---

## 5. The Night band, in both page themes

`Section band="night"` already scopes Night tokens to the band, and `PAGE_NIGHT` (`UnderTheHood.tsx`) lifts it a step when the page itself is Night (detail audit C13/D4). The bento adds only the wells.

| Element | Day page (the band on Night `ground`) | Night page (the band lifted) |
|---|---|---|
| Band | `ground` #1c1424 (unchanged) | `surface` #261c30 (`PAGE_NIGHT.band`, unchanged) |
| Cell | `surface` #261c30 + 1 px `line` #3f3350, `rounded-lg`, no shadow | `surface-sunken` #33283f (`PAGE_NIGHT.card`) + `line` |
| Well | `ground` #1c1424 + 1 px `line`: the band showing through, as the playground's ground well (D4) | `ground` #1c1424: now the darkest step, so it reads recessed. **No variant needed** |
| Text | `ink` 15.9:1 · `ink-muted` 8.8:1 on `ground` (≥ 6.8:1 on `surface-sunken`) | the same |
| States | `approved` #5fd3a0 (≈ 9.6:1 on `ground`) with its check and words; `ink-muted` ✕ with words | the same |
| People | `member-1..3` with `on-brand` initials (9.6-11.4:1); the "not yet" ring a dashed `line-strong` (≥ 3.8:1, non-text) | the same |
| Never | marigold surfaces, `brand-soft`, glows, gradients, grain, code font | — |

- **Without JS,** the band is still Night (`data-theme` sits on the section in the server HTML). The `PAGE_NIGHT` lift needs the head script, so in a no-JS dark page the band equals the page ground. The cells' `surface` and `line` still separate them, as today.
- **Check axe inside the band in both page themes** (03 §6).

---

## 6. Motion (optional, one beat)

The flow's trace stays the band's one story (04 §6). The bento adds a single beat, in the one cell whose process the trace leaves unlit: the group's road. It explains something; it is not decoration.

**The majority meter fills** (the majority well is one `[data-sequence]`):

| Element | Effect (`data-seq`) | `data-at` | Dur | Easing |
|---|---|---|---|---|
| Maya's approved badge (her own approval, counted when she asked) | `pop`, `data-scale=".5"` | 0 | 360 | `ease-spring` |
| Sam's approved badge | `pop`, `.5` | 400 | 360 | `ease-spring` |
| "Approved" chip | `pop`, `.6` (chips) | 660 | 360 | `ease-spring` |
| "Maya asked, so hers counts…" line | `fade` | 760 | 200 | `ease-standard` |

- **It ends at 1.02 s.** The armed frame shows the caption, the three seats and "needs 2" (never an empty well). Leo's dashed seat and the rule never move.
- **No new JS.** The section's existing `<Sequences startLine={0.85} />` arms every `[data-sequence]` in `#tech`, so this well is armed only when wholly below the viewport, plays once, and lands on the server HTML.
- **At most two stories at once:** the meter sits well below the flow (in row 2 at lg, as the fourth cell on phones), so by the time it plays the 3.0 s trace has finished.
- **Reduced motion, no JS and a jump past it** all show the final frame.
- ***Could*, default off: the Hub's checks pop in** (`pop` from .5 at 0/60/120/180 ms; the two ✕ rows `fade` at 300/360). At lg it enters in the same frame as the meter, so add `stagger={300}` to the section's `<Sequences />`: the right cell then starts 300 ms after the left, as in How it works.
- **No:**
  - a count-up on "0 NEAR" (04: no count-ups on decorative stats);
  - money rolls (step 5 owns them);
  - a receipt "printing";
  - hover lifts or tilt;
  - loops or typing dots;
  - a second trace.

---

## 7. Accessibility

- **Headings.** The H2 stays "How NEAR makes it work". The two h3s are the existing "How a spend moves through Pot" and "Each part, up close" ⓟ. The six cell titles are h4s. The alternative is to keep the cell titles at h3 with no label (§9 Q7).
- **The list.** `<ul aria-labelledby="tech-parts-title">` holds six `<li>`s in the diagram's order. The DOM order is the visual order at every width.
- **Every visual is labelled once.**
  - Five wells are `role="img"`, each with one sentence (`home.tech.<id>.visual`), and their insides are `aria-hidden` and `inert` (the mock-UI rule of 03).
  - The sentence describes the example (names, numbers, who paid). It does not repeat the tech line.
  - The Hub's well is real content (two labelled lists), so it gets no label.
  - Avatars are decorative (`Avatar`'s default).
- **Colour is never alone.** Checks and ✕s sit beside words; seats carry a check badge or a dashed ring, plus the words in the line and the label; the share bars sit under avatars with initials.
- **Text sizes and reflow.**
  - Nothing is smaller than `body-sm` (14 px).
  - At 200 % text, wells wrap, the account id breaks after its dots, and amounts never break.
  - At 320 there is no horizontal scroll (`min-w-0` on every cell).
- **Judges.** The bento stays a server component with all copy in the server HTML: titles, hooks, tech lines, the visuals' text and their labels. Every technical term appears in a tech line, not only inside a visual.
- **axe** must report 0 violations at 390, 1280 and 320, in Day and Night, with motion on and reduced (run it after the sequence ends, 04 implementation note 6).

---

## 8. Copy keys (`home.tech.*`)

Every key below lives under `home.tech.`, the jargon lint's one landing exemption (`i18n/banned.mjs`). `react/jsx-no-literals` means even the visuals' words ("≈", "NEAR", the account id) must come from keys; amounts come from `MoneyText`.

- **The hooks are plain on purpose.** All six pass `findBanned()` even though their prefix is exempt (checked on 2026-11-03). A unit test can keep it that way.
- **Sentences keep whole dollars** ("$84", "$150"); displayed amounts keep two decimals (brand §9).

| Key | English | Note |
|---|---|---|
| `home.tech.parts.label` ⓟ | Each part, up close | h3 above the bento |
| `home.tech.auth.title` | Zero NEAR, zero popups | changed |
| `home.tech.auth.hook` ⓟ | Sign in with Google. Then just tap. | |
| `home.tech.auth.body` | Google sign-in via NEAR Auth. Pot opens a named account with an MPC recovery key and a device key: 0 NEAR held (NEP-448), no popup per action. | changed (fixes "NEAR Auth creates") |
| `home.tech.auth.v.balance` ⓟ | 0 NEAR | |
| `home.tech.auth.v.balance_note` ⓟ | before and after every tap | |
| `home.tech.auth.v.mpc` ⓟ | MPC recovery key, from NEAR Auth | |
| `home.tech.auth.v.device` ⓟ | Device key, on her phone | |
| `home.tech.auth.visual` ⓟ | Maya's account holds 0 NEAR before and after every tap, with two keys: an MPC recovery key from NEAR Auth and a device key on her phone. | the well's label |
| `home.tech.relayer.title` | Gas and deposits are on us | changed |
| `home.tech.relayer.hook` ⓟ | Taps are free. We pick up the bill. | |
| `home.tech.relayer.body` | NEP-366 meta-transactions: our relayer pays the gas and every deposit, even the 1 yoctoNEAR, within per-method allowlists and caps. Wallets that can't sign delegates pay their own. | changed |
| `home.tech.relayer.v.caption` ⓟ | Who paid for Maya's $84 spend | |
| `home.tech.relayer.v.gas` · `.gas_value` · `.gas_by` ⓟ | Gas · ≈ 0.003 NEAR · our relayer | |
| `home.tech.relayer.v.storage` · `.storage_value` · `.storage_by` ⓟ | Proposal storage · ≈ 0.006 NEAR · the Pot Hub | |
| `home.tech.relayer.v.person` · `.person_by` ⓟ | Maya · in fees | the value is `MoneyText` $0.00 |
| `home.tech.relayer.visual` ⓟ | Who paid for Maya's $84 spend: our relayer about 0.003 NEAR of gas, the Pot Hub about 0.006 NEAR of proposal storage, and Maya $0 in fees. | |
| `home.tech.hub.title` | A rulebot on a short leash | changed |
| `home.tech.hub.hook` ⓟ | It approves what the rules allow. Only. | |
| `home.tech.hub.body` | Our Pot Hub contract holds the 1-of-1 rulebot role in every Pot's Sputnik policy. | changed (the list carries the rest) |
| `home.tech.hub.v.yes` ⓟ | It approves | group label |
| `home.tech.hub.v.yes.rules` · `.joins` · `.one_ok` · `.goal` ⓟ | Spends inside the rules · Invite joins · One-OK spends, after a member's OK · The refund of a missed all-or-nothing goal | |
| `home.tech.hub.v.no` ⓟ | It never approves | group label |
| `home.tech.hub.v.no.rules` · `.over` ⓟ | Rule changes · Spends over the one-OK limit | |
| `home.tech.majority.title` | Majority rules. Literally. | changed |
| `home.tech.majority.hook` ⓟ | Bigger calls wait for most of the group. | |
| `home.tech.majority.body` | Spends over the one-OK limit, rule changes and closing need a majority of members. Pot casts the requester's own approval automatically. | changed slightly |
| `home.tech.majority.v.caption` ⓟ | Close {pot} | `{pot}` = `create.name.placeholder` "Lisbon Trip"; the chip reuses `chip.approved` |
| `home.tech.majority.v.needs` ⓟ | needs {k} | as `demo.proposal.needs` |
| `home.tech.majority.v.note` ⓟ | Maya asked, so hers counts. Sam approved. Leo hasn't yet. | |
| `home.tech.majority.visual` ⓟ | Closing {pot}: Maya's own approval, counted when she asked, and Sam's make 2 of 3 members, a majority, so it's approved. Leo hasn't answered yet. | |
| `home.tech.dao.title` | One Pot, one DAO, no keys | changed |
| `home.tech.dao.hook` ⓟ | It holds the money. Nobody holds a key. | |
| `home.tech.dao.body` | Each Pot is its own NEAR account, running the official Sputnik DAO v2 code from a global contract, by hash, with no access keys. | changed slightly |
| `home.tech.dao.v.account` ⓟ | lisbon-trip.pots.potprev.testnet | §9 Q4 |
| `home.tech.dao.v.code` ⓟ | Sputnik DAO v2, by hash Ea8tHX…RpgD | |
| `home.tech.dao.v.keys` · `.roles` ⓟ | 0 access keys · 3 members, 1 rulebot | |
| `home.tech.dao.visual` ⓟ | {pot} is the account lisbon-trip.pots.potprev.testnet: Sputnik DAO v2 code by hash, 0 access keys, 3 members and 1 rulebot. | |
| `home.tech.money.title` | Dollars in, fair shares out | unchanged |
| `home.tech.money.hook` ⓟ | You see dollars, and get your share back. | |
| `home.tech.money.body` | Balances are USDC, added with ft_transfer_call and shown as dollars. Closing pays every contributor pro rata in one DAO proposal: every refund, or none. | changed ("moved" → "added", plus "every refund, or none") |
| `home.tech.money.v.back` ⓟ | Back at close, in one proposal | the "Put in" bar reuses `close.table.put_in` |
| `home.tech.money.visual` ⓟ | Maya, Sam and Leo each put in $150, a third of $450. At close the $66 left goes back the same way: $22 each, in one proposal. | |

No key is retired. The flow keys (`home.tech.flow.*`), `eyebrow`, `title`, `intro`, `demo.*`, `built` and `tracks` are unchanged.

---

## 9. Open questions (defaults in brackets)

| # | Question | Default |
|---|---|---|
| 1 | **Height:** the band grows from 1,078 to ≈ 1,800 px at 1280, and from 2,032 to ≈ 3,250 px at 390 (as tall as How it works); the page grows by 11-12 %. Accept it? | [Yes. If it must shrink, use §3.5's levers, never the hooks] |
| 2 | **Titles:** the playful set, or plainer alternates? Alternates: "Google in, 0 NEAR held" · "We pay, down to the yocto" (cheekier) · "Yes inside the rules, never outside" · "Bigger calls go to the group" · "Every Pot is a keyless DAO" | [The playful set in §4] |
| 3 | **Order:** follow the diagram (sign-in first), instead of today's order (the DAO first)? | [Follow the diagram: that is what makes the cells read as close-ups] |
| 4 | **The real account id** in the DAO cell? It is public, keyless and checkable on an explorer, but it is tied to the preview root. | [Yes. If the judged build moves to another root, point the key at that root's Pot] |
| 5 | **Pro rata with D-61's equal $150s** looks like an even split. Keep D-61, or allow one uneven example only here (for example, Leo put in $100)? | [Keep D-61. The bars still show the rule (cut where "put in" is cut), and the tech line says "pro rata"] |
| 6 | **Motion:** the one majority beat? The Hub's checks popping in? | [The majority beat yes; the Hub no] |
| 7 | **Headings:** an h3 "Each part, up close" with h4 cells, or h3 cells with no label? | [Add the label: the outline reads path, then parts] |
| 8 | **`VoteMeter`:** lift its seat into `components/pot/` for the demo and the landing, or keep a landing copy with identical classes? | [A landing copy, like `CloseTable`; lift it later if the app needs it] |
| 9 | **The receipt's figures** (≈ 0.003 and ≈ 0.006 NEAR) come from CALIBRATION and the demo script's real run. Re-measure them on hub 1.2.0? | [Keep the ≈ figures; re-check them once if a hub release changes `request_spend`] |

**Not in scope:** the flow diagram and its trace, the band's head, the demo row, the credit, the rest of the page, and any code.

---

## 10. References
- **Mobbin** (8 searches, every image viewed; the 16 rows of §1.2): the canonical `mobbin.com` pages. Their image links expire after 30 days.
- **Two reference bentos:** studied for patterns only (§1.1), not named or linked.
- **Pot sources:** the files listed under Inputs. The facts behind every cell are cited at the end of each part of §4.
