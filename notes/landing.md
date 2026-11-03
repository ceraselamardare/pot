# Landing page notes: `/`

> Written 2026-10-22. Built by a team of agents at the design lead's request: references, copy, kit and playground in parallel, then two builders in parallel, then QA and polish.
> Direction: [plan/design-direction/03-landing.md](../plan/design-direction/03-landing.md), from 19 Mobbin searches. Brand: `brand/README.md` + `tokens.json`. Story and numbers: D-61 and the video brief (`marketing/video/brief/`).

## What `/` is now
A static (○), server-rendered, mobile-first product landing page for two readers: the organizer on a phone (Maya), and the hackathon judges, both human and AI, who read the server HTML.
- It keeps the old jobs of `/`: `HomeRedirect` sends a signed-in visitor to `/pots`, and `NearAuthCallback` hosts the Auth0 redirect.
- Order: header → hero → the problem → how it works (`#how`) → try the rules (`#rules`, a sunken band) → what else a Pot can do (`#more`, since Nov 3) → trust → under the hood (`#tech`, a Night-scoped band) → final call to action → footer.

| File | What it is |
|---|---|
| `apps/web/app/page.tsx` | Assembles the page. `generateMetadata` uses `home.meta.*` and extends the layout's openGraph, so the OG image is kept |
| `components/landing/home/Section.tsx` | `Section` (band: ground / sunken / night) and `SectionHead` (eyebrow → H2 → intro). Every section uses them |
| `SiteHeader`, `Hero`, `Problem`, `TypingInView` | Sticky header (lockup link, anchor nav from lg, a "Sign in" text link and a secondary [Start a Pot], since Nov 3); hero with the H1 highlight, the single marigold [Start a Pot] (it opens the sign-in dialog) beside [See a demo], and the phone with the breakout cards and 2 stickers; the "Leo is typing…" problem card |
| `HowItWorks`, `Trust`, `UnderTheHood`, `FinalCta`, `SiteFooter` | Five steps built from real components with D-61 numbers (a 2-2-1 bento at lg); trust; the tech band (flow `<ol>` + the "Each part, up close" bento + demo link); the `surface` call-to-action card; footer |
| `components/landing/home/motion/` (+ `top.css`, `play.css`) | Round 2's motion toolkit: `Sequences` (play once in view, final = server HTML), `RollingMoney`/`LiveMoney`, `ScrollFlag`/`ActiveNav`/`SmoothAnchors`, press/nudge utilities. CSS + WAAPI only, no `motion` import (+4.8 KB gzip JS in total). API: the session scratchpad's `motion-kit.md`. `Reveal.tsx` was replaced by it |
| `RulesPlayground.tsx` + `RulesParts.tsx` + `play.css` (+ `components/__tests__/RulesPlayground.test.tsx`, 16 tests) | The interactive "Try the rules", with a new Pot's rules (since Nov 3, see "Site update" below): instant path with the burst → $366.00; $300 → one OK → [OK $300 as Leo] → $150.00; $400 → the group's 2 of 3 → [Approve as Leo]; the $200 per-person rule; trust that grows; a balance floor. It uses `previewSpend` from `lib/client/rules.ts`. Round 2 motion: see below |
| `PhoneFrame`, `ChatThread`, `InviteBubble`, `PushCard`, `FloatCard`, `Sticker` + `stickers.ts` | The mock-UI kit, ported from the video's Remotion UI. Each mock is one `role="img"` with an `inert`/`aria-hidden` inside |
| `components/brand/MarkTile.tsx`, `LockupOnBrand.tsx` | Logo pieces used inside the mocks, moved here so the logo has one source. The geometry is unchanged |
| `public/landing/stickers/<name>-{256,512}.webp` | The video's 8 die-cut stickers at 27–39 KB each (512 px), from 0.4–0.9 MB PNGs |
| `i18n/en.json` | About 120 `home.*` keys. `home.title`, `home.body` and `home.sample.label` were removed |

## Decisions and deviations (for the design lead to review)
1. **`home.tech.` is in the jargon-lint allowlist** (`i18n/banned.mjs`), like `demo.` and `advanced.`. It is the only place on `/` where NEAR, Sputnik DAO, NEP-366 and USDC appear. If `/` should be fully jargon-free, delete the `UnderTheHood` section and point judges to `/demo`. The tech facts were checked against README, CLAUDE.md and kb (e.g. "no access keys": kb/sputnik-dao.md). "Keyless hub" was left out on purpose, because the hub keeps its key until the planned lock.
2. **One marigold on the whole page:** the hero's [Start a Pot]. The header's and the final card's [Start a Pot] (one name since Nov 3; tests scope them by region) and every mock use secondary styles. Marigold appears only as a surface (the invite top, the goal bar, the Hub node's edge).
3. **Link-buttons are `<Link className={buttonVariants(…)}>`**, not `<Button nativeButton={false} render={<Link/>}>`. With Base UI the latter gives the link `role="button"`.
4. **The H1 is the tagline** (`text-balance-hero`, with "its own rules" on `brand-soft`). There is no new display-size token, so on desktop the H1 stays at 44 px. Alternative H1s are in the copy deck: "Put the trip money in the group chat, with rules." / "The group chat decides everything. Now it holds the money too."
5. **"Under the hood" is a Night band** (`data-theme="night"` on the section) in both page themes, like the video's x-ray act. Its "Inside the rules" lane uses Night `brand-soft`, which reads olive. That is the brand's own Night highlight; plain `surface` would be calmer.
6. **CTAs sit side by side from 360 px** (03 said stacked until `sm`), so the proof card stays above the fold.
7. "Built at NEAR HACKATHON 2026" appears only at the end of `#tech`; it was removed from the footer.

## Round 2: details, micro-animation, motion (2026-10-22)
The design lead asked for more attention to details, micro-animations, motion and interactions. Direction: [plan/design-direction/04-landing-motion.md](../plan/design-direction/04-landing-motion.md), from 16 recorded live sites, Mobbin and craft sources, plus a 45-item detail audit. The grammar: every motion explains, answers or guides; scrolling a section into view plays its story **once** (a landing-only extension of the brand's "motion answers the person's own action"); on load only the hero moves (≤ 0.8 s, CSS only, the H1 and CTAs never move); the burst stays the one celebration; nothing loops over 5 s; reduced motion, no-JS and jump-past always show the final state. Its "No" list (parallax, scroll-jacking, headline reveals, marquees, fake cursors, 3D tilt, View Transitions) is binding.

## Round 2 motion: header, hero, problem (motion-top)
- **Header:** a hairline draws in once scrolled; from lg a 2 px ink bar tracks the section in view (`aria-current` on its link; transform-only, 280 ms). Anchors land the band exactly under the header (`scroll-mt-14 lg:scroll-mt-16` in `Section.tsx`); after a nav jump focus moves to the section's H2.
- **Hero:** a 0.8 s CSS-only arrival (`[data-seq-load]`): the highlight wipes in behind "its own rules", the phone rises, the proof card lands on the spring, the stickers settle. Static without JS (`@media (scripting: none)`). [Start a Pot] gets a 200 ms `shadow-card` on hover.
- **Problem:** the chat plays once in view: "Day 2" → a 640 ms "three weeks later" pause → "Day 23", "Leo??", "Seen", Leo's typing bubble (dots stop by 5 s), then the punchline.
- **Page-wide (`top.css`):** `text-wrap: balance` on headings and `pretty` on copy under `[data-landing]` (one-word last lines 8/18/10/8 → 1/5/0/0 at 390/320/1024/1280); press feedback on text links.

## Round 2 motion: How it works, Trust, final call to action, footer (motion-story)
Direction: [plan/design-direction/04-landing-motion.md](../plan/design-direction/04-landing-motion.md) §3, §5, §7, §8, built on the shared toolkit in `components/landing/home/motion/`.
- **How it works:** each fragment panel is one `[data-sequence]` (35 % in view, once) with 04's timings as `data-at`:
  - step 1: the rules arrive (0.64 s);
  - step 2: invite, then "You're in!", then the goal bar fills while "$300 of $450" rolls to "$450 of $450 collected" (1.38 s);
  - step 3: Groceries, then "Checking Pot rules…" with one dot cycle, then "Approved by Pot rules", then Sent, then $450.00 rolls to $366.00 (2.46 s, no burst);
  - step 4: the request, "2 of 3", the "1 of 2 approvals" chip, Leo's push dropping in, "Approved!", then $366.00 rolls to $66.00 (2.46 s);
  - step 5: refund rows land, the total rolls $0.00 → $66.00, then "Pot closed" (1.26 s).
  - A bento pair that enters together plays left, then right +300 ms (`<Sequences stagger={300} />`; it was 600, story-tuning). Stickers are children of their panel and settle at +200 ms.
- **Final call to action:** half in view, Maya, Sam and Leo pop 80 ms apart and the sunglasses settle. [Start your Pot →] and [Back to top] nudge their arrow on hover. Trust stays still (04 §5).
- **Deviation: step 5's table is a local copy of `RefundTable`** (`CloseTable` in HowItWorks.tsx). Same markup, classes and copy. Rows must be sequence items and the total needs a RollingMoney, and RefundTable passes neither through. The rules sit on cells (`border-separate`), because a collapsed border neither moves nor fades with its row (measured in Chromium). Keep it visually identical to RefundTable.
- **Toolkit issue, now fixed in `roll.ts` (the local `story.css` copy was removed):** the ghost copy of a digit-count-changing roll (`roll.ts` `amountWriter`, `right: 0`) moves its left edge, or its text node, when a digit is gained or lost. Chrome counts that as a layout shift (0.00005–0.00015 per roll). Pinned to both edges and set `direction: rtl`, it measures CLS 0. **The same fix belongs in `roll.ts`** for every end-aligned ghost, including the playground's `LiveMoney`.
- **Detail audit closed here:**
  - B1: the stories.
  - B2: the boat and sunglasses stay ≥ 6 px inside the viewport at every width.
  - B3: only the title makes room for a sticker. Corner stickers are 80 px at md and 96 px at lg, so they end above the sentence.
  - B4: step 1 is centred, step 3's rows spread, step 5's copy is top-aligned.
  - B5: the suitcase is at `-bottom-6`.
  - B6: page-wide `pretty` (top.css), plus the approved row and nowrap bold rule values.
  - D4: Night stages are `ground` (rows read raised). Trust's lg stage is a `ground` well with a hairline.
  - D5: `lg:gap-y-6`; the bento rows are `lg:gap-y-12`.

## Round 2 motion: Try the rules, Under the hood (motion-play)
Direction: 04 §4, §6 and the micro-interaction catalogue; detail audit (C). Files: `RulesPlayground.tsx`, `RulesParts.tsx` (landing-only `RulesChip`, `RulesSegmented`, `Layers`, `useGlide`), `play.css`, `UnderTheHood.tsx`.
- **The stage.** The preview box right above the button *becomes* the result (ux-spec "the sheet morphs into the result card"), so the answer is where the visitor looks. Under it: what the money is doing ("Sending…" → "$84 sent to you"; or "1 of 2" → "2 of 2" + Leo's line), and its own **"In the Pot" line, the one number that rolls** (500 ms). The top balance fades to the new amount (200 ms) instead of rolling, so a card never shows two rolls.
- **No jumps.** Every state a spend can reach is stacked in one grid cell (`Layers`, inactive ones invisible + `aria-hidden` + `inert`) and mounted at the tap, so timer-driven states (approved, sent, asked) never change a height. Heights change only on the visitor's taps and glide 280 ms (`useGlide`, WAAPI, interruptible). The rule list's "You've used $84 of it." line is always reserved. CLS 0 in every run (390×664, 390×844, 1280×800, Day/Night/reduced).
- **Group path.** While the group decides, the action button becomes [Approve as Leo]. After it, if the amount no longer fits, focus moves to the result (`preventScroll`), never a disabled button; the result stays until the visitor touches the picker or taps the "no" Spend (then the preview says why: no red ✕ beside "Approved!"). A 400 ms guard after the approval makes a double tap safe.
- **Details.** The chip's check slot opens (`grid-template-columns` 0fr → 1fr, 200 ms) and the check pops on the spring. Below a 23rem row the emoji hide and the sides tighten, so three chips fit one line from 360 px. One sliding amount thumb (280 ms). Swaps are 160 ms (out 80 ms, in from 40 ms). Start over's icon turns once, and it fades out after the turn.
- **Tech flow.** One sequence traces the $84: nodes light, connectors draw brand traces, the Hub's tile pops, the trace takes the fork's left/top half into "Inside the rules" (its check pops), joins, pays out, and fades back by 3.0 s. The bracket halves use a local `reveal` effect (clip-path, longhands, `pot-seq-` name, so the engine waits for it).
- **Night.** The play band is `ground` with hairline edges, so the card is raised over it. Inside the card the amount track is a `ground` well and its thumb `surface-sunken`, ringed `line` (D4). When the page itself is Night, the tech band lifts to `surface` and its cards to `surface-sunken` (C13; Day unchanged).
- **Deviations for review:**
  1. The result's "In the Pot" line shows at every width, not only below 768 px. With the button centred at 1280×800, the top balance is off-screen too (audit C1).
  2. [Approve as Leo] takes the action button's place instead of a separate box. This is more compact and keeps Spend from moving on a timer.
  3. Skipped C14 ("Spending $84…" while busy): the stage above already states the tense, and on the group path "Spending" would claim a spend that is going to a vote.
- Removed the unused keys `home.try.hint` and `home.try.used`.

## Round 2 motion QA (motion-QA): what it fixed
- **Smooth anchors are on only after load, and only while `/` is on screen** (`<SmoothAnchors />` in `motion/ScrollMarkers.tsx`, mounted in `page.tsx`; CSS `html:has([data-landing][data-smooth-anchors])`).
  - Before, a cold deep link (`/#tech`) smooth-scrolled through the whole page: 1.3 s in Chromium, 0.23 s in WebKit.
  - Next 16 keeps a page's DOM after a client navigation (hidden in React `<Activity>`), so `html:has([data-landing])` still matched on `/demo` and `/pots`. Their scroll-to-top glided about 500 px after a click from deep in `/`.
  - The marker is a layout effect: its cleanup runs before the next page's scroll-to-top.
- **`roll.ts`:** a pinned ghost (an unsigned, end-aligned amount) now also sets `direction: rtl` on its wrapper. Without it, the playground's live balance narrowed when it lost a digit ($150.00 → $66.00) on a timer, which measured CLS 0.00015.
- **`SiteHeader.tsx`:** the nav links transition `background-color` only. `transition-colors` also faded the focus ring's `outline-color` in over 120 ms.
- **`SiteHeaderNav.tsx`:** after a nav click, Firefox dropped focus to `<body>` while it ran the fragment navigation. The H2 is now focused again on that `hashchange`.
- **`UnderTheHood.tsx`:** the arrow on [Open the live demo →] now nudges on hover (`l-nudge`), like [Start your Pot →].

## Round 2 story-tuning (`motion/sequence.ts`, motion-kit §1)
- **Why:** at a steady 700 px/s a phone shows a how-it-works panel for only 1.3-1.8 s, but steps 3 and 4 run 2.46 s and the tech flow 3.0 s, so their payoffs always ended off screen. The skip rule wasn't the cause: it already fired only after a story had left the screen.
- **Rules:**
  - Start: below lg, a story starts once its top passes 85 % of the screen (`startLine`). At lg it starts at 35 % in view.
  - Pace: while the visitor scrolls fast, a story plays only as fast as needed (at most 2×, re-checked every 100 ms) for each beat to land at least 120 px below the top. It goes back to 04's timings when the visitor slows or stops. Measured: 1.55-1.85× at 700 px/s, 1-1.5× at 400 px/s.
  - Skip: a story jumps to its final state only if it was never seen playing, or once it has left the screen.
- **Armed frames:** each fragment's first beat is static, next to its "In the Pot" foot at the starting amount, so a panel never scrolls in empty. The lg pair offset is 300 ms (it was 600).
- **Verified:** every payoff is seen at 400 and 700 px/s on 390 × 844 and 390 × 664, and at 1280 × 800. CLS is 0, axe finds 0 violations, and the cost is +1.2 KB of gzipped JS. Evidence: the session scratchpad's `shots/tune/`.

## App-wide fixes made during this work
- **Round 2:**
  - the burst's opacity now has its own timing, so it reads for ~350 ms instead of ~80 ms (`globals.css` `.pot-particle`);
  - `Button` press animates (`scale` .97 in 120 ms, out 200 ms; the reduced-motion override now wins: `motion-reduce:active:not-aria-[haspopup]:scale-100`);
  - `Chip` press animates (`scale`, not `transform`, in its transition list);
  - the segmented control no longer fades its focus ring (`transition-[color,background-color]`, not `transition-colors`);
  - pointer cursor on enabled buttons, and `::selection` in `brand-soft` + `ink` (`globals.css`).
- **`app/globals.css`:** the iOS Dynamic Type rule also matched macOS Safari, where `-apple-system-body` is 13 px, so the whole app showed at 81 %. It is now gated with `and (-webkit-touch-callout: none)`, which only iOS supports. Verified on a production build in Playwright WebKit (macOS): root 16 px, H1 44 px. ⚠️ The iOS side still needs one check on a real iPhone: the 17 px root should still apply.
- **`app/layout.tsx`:** the skip link lost its padding on focus (`not-sr-only` resets it). `focus:px-4 focus:py-3` fixes it; it now renders as a 137 × 44 pill.

## Verification
- **QA (independent agent)**:
  - typecheck and lint clean (870 strings, 0 banned words);
  - vitest 642 passed;
  - build: `/` static;
  - full mock e2e 164 passed / 0 failed;
  - axe 0 violations in 42 runs (390/1280/320, Day/Night, motion on and reduced, every playground state, WebKit too);
  - exactly 1 marigold in every state;
  - no-JS render shows every section;
  - CLS 0, LCP = the H1 (848 ms with mobile throttling).
  - Report: the director's session scratchpad `qa-landing.md`.
- **Final run after polish and the app-wide fixes:**
  - typecheck clean;
  - lint clean (869 strings, 0 banned words);
  - vitest 642 passed / 13 skipped;
  - full mock e2e 164 passed / 13 skipped / 0 failed.
  - Screenshots for review are in the session scratchpad (`shots/polish/`), not in the repo.
- **Round 2, final run (director, after story-tuning):**
  - typecheck clean;
  - lint clean (867 strings, 0 banned words);
  - vitest 704 passed / 13 skipped;
  - full mock e2e 164 passed / 13 skipped / 0 failed.
  - One earlier full run had 2 failures in `e2e/mock/p2.spec.ts` "a sole member changes the rules directly" (mobile-night, desktop). They passed 6/6 alone and in the next full run, so this is a load-sensitive flake in an app flow, not the landing.
  - Motion QA (192 axe runs across Chromium, WebKit and Firefox, 0 violations; CLS 0; p95 frame 16.7 ms at 4× CPU) is in the session scratchpad's `motion-qa.md`.
- `e2e/smoke.spec.ts` was updated: the h1 is the tagline, the lockup is the banner's "Pot, home" link, and the money check is scoped to `[data-try-balance] [data-money]`.

## Site update (Nov 3): one main action, the one-OK truth, "What else a Pot can do"
Built by builder-site from the director's brief and facts (the session scratchpad's `site-brief.md`, `site-facts.md` rows L1-L9, P1-P9, H1-H4) and [plan/design-direction/07-site-update.md](../plan/design-direction/07-site-update.md). The sign-in dialog is builder-signin's (`components/features/auth/`, notes/frontend.md "Sign-in dialog"); the tour is builder-tour's (notes/demo.md).
- **CTAs (07 §1):** one main action everywhere, [Start a Pot], always a `<SignInLink>`: a real `<a href="/pots?sheet=create">` in the server HTML (no JS, new tabs, crawlers), the sign-in dialog in place with JS and no session.
  - Header: "Sign in" (`home.nav.signin`, `next="/pots"`, a 44 px `ink` text link, hidden below 360 px) + [Start a Pot] secondary `sm`. The header's demo button is gone.
  - Hero: [Start a Pot], still the page's one marigold, + [See a demo] (`home.cta.demo`, was "Try the demo").
  - Final card: [Start a Pot →] + [See a demo], both secondary. "Start your Pot" (`home.final.cta.start`) is retired, so tests scope by region.
  - Test hooks: `[data-landing-hero]`, `[data-header-signin]`, `[data-header-start]`, `[data-final-cta]`; SignInLink adds `data-signin-source`.
  - Measured: the header's "Sign in" 70 px + [Start a Pot] 107 px fit from 360 px (at 320 only [Start a Pot]); the hero's buttons are 158 px at 360 and 173 px at 390. The press scale still works: SignInLink marks the dialog with `data-opens-dialog`, not `aria-haspopup`.
- **The one-OK truth:** a Pot made today gets one OK up to $300 (3 × the instant limit), so the $300 boat needs one OK, not 2 of 3.
  - How it works, step 4: `preview.one_ok.over_cap`, the chip `feed.pending.one_ok`, the push `notif.one_ok.*` (`PushCard variant="one_ok"`; after the first " · " a push's parts never break inside), then `approve.decided.ok`. Step 1 lists `rules.one_ok` in the app's order (instant → one OK → the group → per person). `home.how.group.*` reworded.
  - Trust's proof chip: "Needs one OK". `home.chat.push.label` (unused) reworded too.
  - Under the hood: the hub approves one-OK spends after a member's OK and the refund of a missed all-or-nothing goal, never rule changes; the majority is for spends over the one-OK limit; a wallet that can't sign delegates pays its own gas; the flow's group lane says "One member's OK, or a majority".
  - Footer: "Preview: for now, Pots run on demo dollars (test money), so no real money is at risk."
- **Try the rules:** it decides with the real defaults (`DEFAULT_RULES` + the sdk's `defaultExtras`: trust on, one OK $300) and words every preview with the Spend sheet's own `previewCopy`. Presets $20 · $84 · $300 · $400:
  - $20, $84: instant, with the burst (unchanged);
  - $300, or anything over the $200 per person up to $300: "Sent · One OK from anyone else in the group and it's paid.", "Needs one OK", [OK $300 as Leo] → "Approved by Leo's OK · $300 was sent to Maya.", "One OK", "Leo · gave the OK". No burst;
  - $400: the group's 2-of-3 flow with [Approve as Leo], as before. The balance floor means it shows only while the Pot holds $400 (from the start, or after $20s).
  - Trust follows the hub's `trust_settle` (`settleTrust`, exported for tests): every paid spend of $10 or more counts, and every 3rd raises Maya's instant limit by $100, up to $300. The spend that raises it shows one line, "Trust grows: you can now spend up to $200 at a time without asking." (`home.try.trust`), reserved from the tap like every other state. The $200 per person still caps it: at $300 a time, a $300 is "over the $200 … ($120 used)" and needs one OK.
  - The rule list gains the one-OK row (Hand). The highlight follows who approves (instant, one OK, the group), plus the per-person row when that rule is the reason.
- **"What else a Pot can do"** (`Features.tsx`, `#more`, 07 §3), between Try the rules and Is it safe?: Trust grows · All or nothing · Ask anyone to pay in · Send by link. The titles are the app's own keys (`create.trust.label`, `create.target.aon.label`, `payin.title`, `settings.sending`); the lines are `home.features.*`. Lucide sprout / target / qr-code / send at stroke 2; hairline cells (1 column below 360, 2 × 2, one row of four from lg); no cards, buttons, links or motion.
- **Verified** (dev server :3311, mock data; `scratchpad/shots/site/`): every playground road at 390 × 844 Day/Night, 1280 × 800, 320 and reduced motion: CLS 0, axe 0, one marigold, no overflow, no console errors; pages at 390 × 844 Day/Night, 390 × 664, 1280 × 800 Day/Night, 360 and 320: the same. Without JS, the hero's and the final card's [Start a Pot] are `<a href="/pots?sheet=create">` and "Sign in" is `<a href="/pots">`. Typecheck, lint (jargon lint 0) and vitest (1654 passed) are clean. E2E on a mock build (`NEXT_PUBLIC_DATA_SOURCE=mock`, `NEXT_DIST_DIR=.next-site`): `smoke.spec.ts` (+ the CTA system, the feature block and a no-JS test), `mock/screens.spec.ts` and `mock/a11y.spec.ts` (320 px: the header keeps [Start a Pot] and hides "Sign in"): 55 passed, 14 skipped (per-project), 0 failed; `/` stays static (○).
- **Decisions for review:**
  1. The pay-in cell says "Ask anyone to pay in" (the app's `payin.title`), not the brief's "Ask anyone to chip in": on the site members chip in, while people outside pay in and don't join.
  2. The trust line is built from the app's words (`create.trust.label` + `trust.person.body.you`) rather than `trust.level_up` ("You're now Trusted in Lisbon Trip: you can spend up to $200 without asking."): "at a time" keeps it apart from the $200 in total.
  3. After Leo's OK the playground's "who" row reads `approve.timeline.ok` ("Leo · gave the OK"), not `feed.approved.ok`, which would repeat the capsule's "Approved by Leo's OK".
  4. App copy, outside the landing: for spends over the one-OK limit the app's why is still "It's over the $100 instant limit." (`previewCopy`, also on the playground's $400). It's true, but it isn't why the group decides.

## Under the hood: the tech bento (Nov 3)
From [08-tech-bento.md](../plan/design-direction/08-tech-bento.md): six cells in the flow's order replace the six text-only facts.
- **Parts:** auth · relayer · hub · majority · dao · money; lg 3·3 / 4·2 / 2·4, md 2, phones 1. Each has an h4 title, a plain hook, the tech line and a `ground` well built from `Avatar`, `StatusChip`, `MoneyText`, `CoverTile` and `Seat` (a landing copy of the demo VoteMeter's seat, like CloseTable). Five wells are one labelled `role="img"` (`home.tech.<id>.visual`, inert inside); the Hub's two lists are real content. The one motion is the majority meter (0 / 400 / 660 ms, once; static under reduced motion and without JS).
- **Facts:** Pot, not NEAR Auth, creates the named account (kb/near-auth.md, `server/session/service.ts`). `lisbon-trip.pots.potprev.testnet` is plain text (read-only check on 2026-11-03: 0 access keys, global code `Ea8tHX…`, member ×3 + rulebot). Money keeps D-61's equal $150s and says pro rata in words. `i18n.test.ts` keeps the six hooks jargon-free (08 §8).
- **Height:** 1,078 → 1,604 px at 1280 and 2,032 → 2,975 px at 390 (spec ≈ 1,800 / ≈ 3,250; brief ≤ ~1,400 / ≤ ~2,700). The floor: lg rows 2-3 are set by the narrow cells (≈ 280 px each), and the Hub's six-item list needs a wide cell, so 1,400 would mean dropping hooks or visuals.
- **Deviations for the design lead:** the majority's "Maya asked…" line lives only in the well's label; the receipt has no caption (the $84 is in Maya's column); the keys read "MPC recovery key" and "Device key"; the relayer line leaves "per-method allowlists and caps" to the flow node above it; the bars' second label is "Back" (`home.tech.money.v.back`), so a third fits $150.00 at 320.

### v2 (Nov 3): six looping scenes ([08 §v2](../plan/design-direction/08-tech-bento.md))
- **Each cell** is a title, a line of at most 8 plain words, a looping scene that shows the fact in about 2 s, and 3 tech tags. The v1 paragraphs and wells are gone, and their keys are retired. Code: `components/landing/home/tech-scenes/` (6 server scenes, the `Scene` stage, `bento.css`) and one island, `SceneLoops.tsx`.
- **Loops are CSS only.** Each one starts and ends on its end frame, which is also the server HTML, the reduced-motion frame and the no-JS frame. A scene plays only while at least half of it is on screen and the tab is visible. One Pause/Play toggle covers all six (`aria-pressed`, 44 px), and it is hidden without JS or with reduced motion.
- **Grid:** lg is 10 columns, 5·5 / 6·4 / 4·6, on a CSS subgrid, so the scenes of a row align.
- **Band heights:** 1,604 → 1,592 px at 1280 and 2,975 → 2,772 px at 390.
- **Verified:** 57/57 contract checks: in-view gating, pause, tab hidden, reduced motion, no JS, axe 0 in Day/Night × 390/1280 × running/paused, one marigold, CLS 0, no console errors. The landing e2e passed 61, skipped 14 and failed 0.
- **Review (fresh eyes, same day):**
  - **auth:** the Google G now stays on as a badge on Maya's avatar. Before, Google was on screen for only 1.2 s of the 4 s loop and was missing from the still frame.
  - **hub:** the gate carries the rulebot (the DAO scene's bot icon), so the title's "rulebot" is on stage. "to the group" became "from anyone" (`home.tech.hub.s.anyone`): one OK is one member, not the majority of the next cell. The hint now sits on the stage colour, because lane 2's line had run through it like a strike-through.
  - **Also checked:** keyboard (Tab, focus ring, Space and Enter, `aria-pressed`, fixed name); reduced motion switched on mid-session; 320 with JS while the scenes run; no marigold text at 21 moments with all six playing; WebKit and Firefox (hub, money, auth).

## Open items
| # | Item | Owner |
|---|---|---|
| 1 | `/` loads about 382 KB of gzipped JS (25 chunks), against 226 KB for `/demo`. Most of it is the always-mounted `HomeRedirect` (the `useMe` data layer) and `NearAuthCallback` (auth0). Fix: `next/dynamic` the callback only when `?code&state` is present, and gate the redirect on a cheap session hint. This predates the landing work | P2 |
| 2 | Token-level calls the round-2 audit raised: a display size for the desktop H1/H2s (D7); 36 px H1 below 390 px rather than 360 (A4); Night `surface` is darker than `surface-sunken`, so cards on sunken stages look recessed (D4; the landing works around it with `dark:bg-ground` stages) | Design lead |
| 3 | `StatusChip` icons use stroke 2.25 and `Chip`'s check 2.5, against the brand's "Lucide at stroke 2". Change the rule or the code | Design lead |
| 4 | `metadataBase` falls back to `VERCEL_URL`. Set `NEXT_PUBLIC_APP_URL`, or crawlers can't fetch `og:image` behind deployment protection | P1 / deploy |
| 5 | With iOS's 17 px root, the hero's proof card lands about 8 px below the fold in a 390 × 664 Safari tab (672 px). With a 16 px root it is at 561 px. Closing the gap needs a smaller H1 or no eyebrow | Design lead |
| 6 | `home.tech.demo.body` says Google sign-in works only on local builds (the NEAR Auth shared client), while the hero says "Sign in with Google". It's honest, but it changes once a hosted origin is allowed | P1 |
| 7 | Turbopack's dev server served stale files after edits (en.json, globals.css) several times. Restart `next dev` with `.next/dev` deleted if strings show as raw keys or CSS doesn't update. Running `next build` into the shared `.next` while `next dev` runs seems to trigger it; use `NEXT_DIST_DIR=.next-<name>` for side builds and e2e | — |
| 8 | `e2e/mock/p2.spec.ts` "a sole member changes the rules directly" flakes under full-suite load (see Verification) | P2 |
| 9 | The hero's 0.8 s arrival replays when navigating back to `/` client-side. The spec accepts it; motion QA can add an opt-out | Design lead |
