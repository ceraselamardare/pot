# Design direction 04: landing motion and interaction (`/`)

Written 2026-10-22 for Cerasela (P2, design lead) and the round-2 landing builders. It sits on top of [03-landing.md](03-landing.md) (layout) and changes no layout.

1. **Every motion has a job, and the job is the product.** Motion on `/` explains how Pot decides (a spend checked, approved, sent), answers the visitor (hover, press, select) or guides the eye to the next thing. If a motion does none of these, it goes.
2. **The story plays once, when the visitor scrolls to it.** Each how-it-works fragment and the tech flow play their sequence once at 35 % in view, then rest in the exact server state. Nothing replays on the way back up, nothing is scrubbed to the scroll position, and nothing moves on its own after it lands.
3. **On load, only the hero's picture moves, for 0.8 s.** The H1, the subhead, the buttons and the reassurance line never animate. Around them, the highlight block wipes in behind "its own rules", the phone rises, the proof card lands and the stickers settle.
4. **Product rhythm, not marketing rhythm.** We use the app's own tokens (120 / 200 / 280 / 360 / 500 / 600 ms, `ease-standard` / `ease-enter` / `ease-exit`, `spring-pop`). The best sites run 0.7-1.2 s reveals and multi-second hero sequences; we don't. The site should feel like the app, and the app is quick.
5. **One celebration, one motif.** The 600 ms marigold burst plays only after the visitor's own tap in Try the rules. It does not play in how-it-works step 3, even though that step shows "Approved by Pot rules". Typing dots appear only beside "is typing" and "Checking Pot rules…". No loop runs past 4.8 s, and no marigold text appears, even mid-animation.
6. **Final state first.** Server HTML, no-JS, reduced motion and "skipped it by jumping" all show the same final frame. JS may hold an element in its "before" pose only when it sits below the viewport after hydration. CLS stays 0, because only `transform`, `opacity` and `clip-path` move and every rolling number keeps its final width.
7. **Interaction details are the motion most people see.** A press scales in 120 ms and releases smoothly. Hover appears only on devices that hover. The focus ring is never animated. Anchors scroll smoothly to just below the header. Buttons show a pointer, and selection uses the brand-soft colour.

> **For:** Cerasela and the landing builders (round 2; team brief `motion-brief.md` in the director's session scratchpad, written `<sp>` below). **Written:** 2026-10-22 by motion-research. Direction only; no product code was changed.
> **Inputs:**
> - The brand ([../../brand/README.md](../../brand/README.md) §8), ux-spec §7.6, [03-landing.md](03-landing.md), `notes/landing.md`, and the film's motion language (`marketing/video/brief/research-hypermotion.md`, `03-storyboard.md`). The site borrows the film's **beats** (typing → approved → money moves → balance rolls, rows landing, one spend travelling the stack), not its **speed**. Whips, camera pushes and blur are film-only.
> - **16 live sites recorded** with `<sp>/record.mjs` plus a measuring probe (`<sp>/scenarios/research-lib.mjs`). The probe logs every Web Animation, CSS animation and transition (start time, delay, duration, easing and keyframes), the inline-style writes of JS libraries, the hover and press deltas of the first CTAs, the header state on scroll, and CSS feature counts.
>   - Sites: Linear, Stripe, Vercel, Raycast, Family, Arc, Mercury, Wise, Monzo, Cash App, Partiful, Duolingo, Splitwise, Luma and Copilot at 1280 × 800, and 12 of them at 390 × 844. Revolut served a bot challenge and was skipped.
>   - Raw data: `<sp>/research/<site>.json`, digests via `python3 <sp>/research/summarize.py <file>`. Contact sheets: `<sp>/shots/research/`.
> - Mobbin (4 searches: 2 iOS flows, 2 web sections; cited by page link), and web sources: Emil Kowalski, Rauno Freiberg, Vercel's Web Interface Guidelines, Apple HIG Motion, Material 3 easing, WebKit and MDN release notes, and web.dev Baseline.
> - Our own page measured the same way (`<sp>/research/pot*.json`, `<sp>/shots/research/pot-*`).
>
> **Notation:** times are ms from the start of the section's sequence. Effect names (`fade-up`, `fade`, `pop`, `drop`, `slide`, `draw-x`/`draw-y`, `fill`/`goal`, `roll`, `lit`, `travel`, `out`) are the `data-seq` effects of the in-progress toolkit in `apps/web/components/landing/home/motion/`. Each table defines its effects in from → to terms, so the spec stands on its own.

---

## What the best sites actually do (measured, 2026-10-22)

| Pattern | Measured | Lesson for Pot |
|---|---|---|
| **Hover** | Colour/background only, 100-300 ms. Linear 100 ms (nav) and 160 ms (buttons), Vercel 150, Family and Raycast 200, Stripe 240-300. Nobody scales a button on hover. Arc scales nav links 1.05, which wobbles text. | 120 ms colour change (ours already). No hover scale. |
| **Press** | Linear: `scale(.97)`, 160 ms. Monzo: background darkens **instantly** (`transition: none` on `:active`) and releases over 300 ms. Stripe and Vercel: no press scale. | Press in 120 ms, release in 200 ms, scale .97. Ours is currently broken (see Implementation §1). |
| **Arrow nudge** | Stripe: the CTA arrow moves `translateX(6px)` over 300 ms `(.25,1,.5,1)`. Arc: 2 px, 200 ms. | 3 px, 200 ms, on links that carry an arrow. |
| **Entrance distance and time** | Monzo `translateY(24px)`, 1000 ms (spring). Raycast 20 px over 1000 ms; its cards 50 px + `scale(.98)` over 700 ms. Luma cards 28 px + `scale(.92)` over 900 ms. Partiful: opacity only, 460-550 ms. | 8-12 px over 280-360 ms. The long marketing reveals read as "loading". |
| **Stagger** | 33 ms (Linear title lines), 50 ms (Stripe digits), 80 ms (Raycast and Luma cards), 80-150 ms (Partiful and Luma words). | 60 ms between siblings, at most 4 steps. |
| **Curves** | Ease-out dominates. Stripe `(.25,1,.5,1)` ×44 rules, Luma and Linear `(.16,1,.3,1)`, Partiful `(.22,1,.36,1)`, Monzo `(.33,1,.68,1)`. Springs ship as CSS `linear()` curves generated by Motion (Linear, Copilot, Monzo). | Our `ease-enter` (M3 emphasized decelerate) is the same family. Add `spring-pop` as a `linear()` curve (tokens below). |
| **Hero on load** | Linear blurs and lifts the H1 line by line (~2.5 s total). Raycast fades the H1 in from 0 (~3 s). Luma rises words by 170 px (~2.3 s). **Stripe, Vercel, Family, Duolingo and Splitwise keep the H1 still**; only the visual or a live counter moves. | Keep the H1 still (it is the LCP element and the AI judges' first line). Animate only the picture, ≤ 0.8 s. |
| **Header** | Linear: fixed, transparent, `blur(20px)`. Vercel: background appears after scroll. Monzo: shadow alpha 0 → .1 over 300 ms once scrolled. Wise (350 ms) and Partiful (280 ms) hide it on scroll down and show it on scroll up. **Stripe drives its header state with a CSS `ScrollTimeline`.** | Solid, always visible. Only the hairline appears after scroll, via a CSS scroll timeline. |
| **Numbers** | Stripe's GDP counter is a digit odometer: each digit `translateY(-100%)` over 325 ms `(.33,1,.68,1)`, 50 ms apart. Wise's rate ticker slides rows with a crossfade. | A 500 ms count with tabular figures (ux-spec), not an odometer. |
| **Product UI moving** | Family and Cash App: phone screen recordings and auto-scrolling UI, with a touch dot. Stripe: live UI inside bento cards. Raycast: keys light up 0.2 → 1, 300 ms apart. **Partiful: an avatar with typing dots (~1.45 s), then the pill widens into "what's happening friday???" in ~200 ms, then the stack lifts in ~270 ms as the next person starts typing.** | The chat and the fragments assemble from real components, row by row. |
| **What stays still** | Body copy, section heads, pricing, footers and trust facts, everywhere. | Same. |
| **Reduced motion in CSS** | `prefers-reduced-motion` rules: Stripe 85, Linear 65, Monzo 65, Vercel 29, Wise 27. Partiful, Family, Luma, Splitwise and Duolingo: 0. | We test both modes every time. |

**Our page today (same probe):**
- The only motion is Leo's hero dots (4 × 1200 ms) and `Reveal`'s fade-up (12 px, 280 ms, 60 ms stagger) on the 5 how-it-works panels and 5 tech nodes.
- The header has no scroll state.
- Three bugs:
  1. **Press doesn't animate.** `active:scale-[.97]` sets the CSS `scale` property, while `buttonVariants` and `Chip` transition `transform`. The press snaps in and out (probe: `scale none → .97` with no transition).
  2. **The burst is visible for about 80 ms of its 600 ms.** Opacity and scale share the steep `ease-enter` curve, so the particles are already 70 % gone at 100 ms (`<sp>/shots/research/pot-burst-zoom.png`, 25 fps).
  3. **At 390 the playground balance rolls off-screen.** When Maya taps Spend, "$450.00" is ~420 px above the button, so the visitor never sees it become $366.00 (`pot-burst-overview.png`).

---

## Motion tokens

These are ux-spec §7.6, with one addition. Define each once, in `landing-motion.css` under `[data-landing]` (the toolkit already does this), and never as a literal anywhere else.

| Token | Value | Use on `/` |
|---|---|---|
| `duration-fast` | 120 ms | press in, chip select, hover colour, nav hover |
| `duration-base` | 200 ms | fades, text and number swaps, press release, arrow nudge, header hairline |
| `duration-moderate` | 280 ms | `fade-up`, `drop`, list rows landing, segmented thumb, nav indicator |
| `duration-slow` | 360 ms | phone and card entrances, `pop` (spring), sticker settle |
| `duration-count` | 500 ms | every number roll, the goal-bar fill |
| `duration-celebrate` | 600 ms | the burst (Try the rules only) |
| `min-checking` | 1200 ms | "Checking Pot rules…" in the playground; one dot cycle in step 3 |
| `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | colour changes, rolls, fills, draws, slides that stay on screen |
| `ease-enter` | `cubic-bezier(0.05, 0.7, 0.1, 1)` | anything arriving |
| `ease-exit` | `cubic-bezier(0.3, 0, 0.8, 0.15)` | anything leaving (the trace fading, `out`) |
| **`ease-spring`** (new) | `linear(0, 0.084 6%, 0.266 11%, 0.474 17%, 0.666 22%, 0.818 28%, 0.932 33%, 1.003 39%, 1.041 44%, 1.056 50%, 1.056 56%, 1.047 61%, 1.036 67%, 1.024 72%, 1.014 78%, 1.007 83%, 1.001 89%, 0.998 94%, 1)` over **360 ms** | `spring-pop` itself: stiffness 500, damping 30, mass 1, simulated at 0.5 ms steps. It peaks at +5.6 % at 189 ms and is within 0.5 % by 304 ms. Use it for checks, chips, avatars and stickers. |

- **Why add `ease-spring`:** ux-spec defines `spring-pop` as a Motion spring, but nothing on `/` imports Motion, and the CSS stand-in `pot-pop` overshoots 12 % (`scale .4 → 1.12 → 1`), twice the real spring. `linear()` is Baseline Widely Available, so the exact spring costs 0 KB of JS.
  - The toolkit's current string (`linear(0, 0.081, …)`) is the same curve sampled at equal steps. It's fine; keep one of the two.
  - Keep the `cubic-bezier(0.34, 1.36, 0.64, 1)` fallback for old engines.
- **Spring rules:** the spring scales, it never translates. A pop starts at `scale(.5)` for icons and `scale(.6)` for avatars, never from 0 (Emil Kowalski). Its opacity runs its own 120 ms linear fade.

**Stagger and beats (the timing rule for every sequence):**
1. **Siblings in one batch** (rows, rule lines, avatars) start **60 ms** apart, at most 4 steps (a batch begins within 240 ms).
2. **Story beats** (one meaningful state after another) overlap. The next beat starts when the previous entrance is about 70 % done: **+200 ms after a 280 ms entrance**, +260 ms after a 360 ms one.
3. **A hold is allowed only when the hold is the message.** Examples: one 1200 ms dot cycle for "Checking Pot rules…", the 520 ms "three weeks later" gap in the problem chat, and the 600 ms at the Pot Hub.
4. **Length caps:** a fragment story ends within **2.5 s**, and the tech flow within **3.0 s** including its fade-back. At most **two** stories run at the same time.
5. **Number rolls** always take 500 ms on `ease-standard` and land exactly on the final amount. Never overshoot a number, never use a spring on one, never use a random digit.

---

## Page-wide behaviour

| Rule | Spec |
|---|---|
| **Trigger** | One `IntersectionObserver` with `threshold: [0, 0.35]` and `rootMargin: 0px 0px -10% 0px`. A sequence plays when **35 % of its container** is visible (35 % of the viewport if the container is taller than it). Unobserve after playing. |
| **Arming** | After hydration, only containers whose top is **below the viewport** get `data-seq-state="armed"`, where the CSS holds every item at its "from" pose, paused. Anything partly or wholly on screen is left alone (it never blinks). |
| **Skipped** | A container that is above the viewport when checked (an anchor jump or a fast fling) is finished at once (the attributes come off, final state). On a click on `#how` / `#rules` / `#tech`, finish every armed container above the target **before** the smooth scroll starts, so nothing plays while flying past. |
| **Once** | Sequences never replay, including after scrolling back up or a resize. A hidden tab doesn't restart them. |
| **lg pairs** | When two bento cards enter in the same frame (steps 1+2, steps 3+4), the right card starts **600 ms** after the left one, so the eye reads left, then right. |
| **Reduced motion** | Nothing is armed. CSS guard: under `(prefers-reduced-motion: reduce)` every `[data-seq]` gets `animation: none`. Numbers show their final value. Dots are still. The hero's load choreography doesn't run. In the playground, the outcome may fade in over ≤ 120 ms and the 1.2 s beat stays. No translate, scale, rotate, parallax or scrubbing anywhere. |
| **No JS** | Sequences never arm, so everything is final. The hero's CSS-only load choreography still runs (≤ 0.8 s) and ends on the server state; if CSS animations are unavailable, the final state shows. |
| **Night** | Every effect uses tokens, so both themes and the Night-scoped tech band work unchanged. `lit` rings and the trace are `brand` (a surface use of marigold) on both grounds. |

---

## Sections

### 0. Header

- **Plays:** nothing on load.
  - The hairline appears once you scroll.
  - At lg, the active-section indicator follows your reading.

| Element | Trigger | From → to | Delay | Dur | Easing |
|---|---|---|---|---|---|
| Bottom border | scroll, 0 → 48 px (CSS `animation-timeline: scroll(root)`, `animation-range: 0 48px`) | `border-color: transparent` → `var(--pot-line)` | — | scrubbed over 48 px | linear |
| Nav indicator (lg): one 2 px `ink` bar, `rounded-pill`, 6 px above the 44 px hit area's bottom, as wide as the link text | the section under the viewport's 35 % line changes (IO, `rootMargin: -35% 0px -64% 0px`) | `translateX` and `scaleX` from the old link's text box to the new one's (one element, transform only) | 0 | 280 | `ease-standard` |
| Nav indicator appears / disappears (hero, problem, final CTA, footer have none) | same | opacity 0 ↔ 1 | 0 | 200 | `ease-standard` |
| Active link | same | `aria-current="true"`; text stays `ink` | — | — | — |

- **Where `animation-timeline` is unsupported** (Firefox stable as of 157) the border is simply always on, which is today's look. The scrubbed border is a colour change with a two-state fallback, so under reduced motion it is also always on.
- **Reduced motion:** the indicator jumps to the new link and fades over 120 ms.
- **No JS:** no indicator, and the border is always on.
- **Don't:** hide the header on scroll down (Wise, Partiful), blur it, shrink it, or animate the lockup. The header is 56 px and carries [Try the demo]: it stays put.

### 1. Hero (load, CSS only, `[data-seq-load]`)

- **Plays:** one 0.8 s arrival of the visual.
- **Still:** eyebrow, H1 text, subhead, both buttons and the reassurance line. They never animate, not even their opacity.

| Element | From → to | Delay | Dur | Easing |
|---|---|---|---|---|
| H1 highlight block behind "its own rules" (move the `brand-soft` fill to a `::before` on the highlight span; the text never moves) | `clip-path: inset(0 100% 0 0 round var(--radius-sm))` → `inset(0 0 0 0 round …)` (a left-to-right wipe) | 200 | 280 | `ease-enter` |
| Phone (`PhoneFrame` wrapper) | `opacity 0; translate: 0 24px` → rest | 0 | 360 | `ease-enter` |
| "Approved by Pot rules" card (FloatCard; keeps its −2° `rotate`, so animate `translate`/`scale`, not `transform`) | `opacity 0; translate: 0 12px; scale: .96` → rest, `transform-origin` = the corner nearest the phone | 280 | 360 | `ease-enter` |
| Its check badge | `pop`: `scale .5 → 1` | 520 | 360 | `ease-spring` |
| Leo's "$150.00" card (lg only) | `drop`: `opacity 0; translate: 0 -8px` → rest (a notification arriving) | 400 | 280 | `ease-enter` |
| Tram sticker | `opacity 0; transform: rotate(6deg) scale(1.08)` → `none`. This composes with its inline `rotate: −8deg`, so it starts at −2° and settles at −8°, like a sticker being pressed down. | 360 | 360 | `ease-spring` |
| Pastel sticker | the same extra `rotate(6deg) scale(1.08)` → `none`, ending at its own +8° | 440 | 360 | `ease-spring` |
| Leo's typing dots | start the existing pulse (4 × 1200 ms, 150 ms stagger), only while fully in view (`TypingInView`) | 600 | ≤ 4 800 | existing `pot-dot` |

- **Totals:** the arrival ends at 880 ms and the dots at ≤ 5.4 s. Nothing else moves.
- **Reduced motion:** all static. The highlight shows from the first paint, and the dots are still.
- **No JS:** the same CSS choreography runs. The dots stay paused at their first frame, which `TypingInView` already guarantees.
- **Watch-outs:**
  - `opacity: 0` on the phone at t = 0 is acceptable only because the visual is decorative (`role="img"` with a label) and the H1 is the LCP element. Check that LCP stays the H1 (record + `PerformanceObserver`).
  - Don't add a second chat motion inside the phone. The phone arriving is the one movement; at 264 px, a bubble animating inside a moving phone is noise.
  - A client-side return to `/` (from `/demo`) replays the arrival. That's acceptable. Skipping it is a *could*.

### 2. The problem (in view 35 %, the chat card)

- **Plays:** the chat happens: Maya asks, three weeks pass, Leo is still typing.
- **Still:** the headings, the punchline (it's copy), cards 2 and 3, the verdict pills, the pivot line and its glyph (the glyph's dots rest, as in 03).

| Element (inside `FrontChat`, all inert) | From → to | Delay | Dur | Easing |
|---|---|---|---|---|
| "Day 2" tag | `fade` | 0 | 200 | `ease-standard` |
| Maya's bubble "Leo, your $150 for the trip? 🙏" | `fade-up` 8 px + `scale .96 → 1`, origin bottom-left (the bubble's tail) | 120 | 280 | `ease-enter` |
| "Day 23" tag (the gap is the joke: three weeks) | `fade` | 640 | 200 | `ease-standard` |
| "Leo??" bubble | as Maya's first | 760 | 280 | `ease-enter` |
| "Seen" | `fade` | 1 060 | 200 | `ease-standard` |
| Leo's row (avatar + typing bubble) | `fade-up` 8 px, origin bottom-left | 1 260 | 280 | `ease-enter` |
| "Leo is typing…" (member-3 highlight) | `fade` | 1 360 | 200 | `ease-standard` |
| Leo's dots | the pulse starts (4 × 1200 ms) and then rests | 1 460 | ≤ 4 800 | `pot-dot` |

- **Reduced motion:** final, with still dots. **No JS:** final, with dots paused at their first frame (the joke still reads).
- **Don't:**
  - Turn the typing into a message. That's Partiful's beat, and here the joke is that it never comes.
  - Stamp the verdict pills (the film's s04). On the page, the pills are quiet labels.

### 3. How it works (each fragment panel is its own sequence, threshold 35 %)

The panels no longer fade up as wholes (drop `data-reveal` from the panel). Their **contents** tell the story, while the step card, numeral, title and sentence stay still. Every fragment ends exactly on today's server render. None has a burst.

**Step 1: "Start a Pot and pick the rules"** (the rules arrive as they're picked):

| Element | From → to | Delay | Dur | Easing |
|---|---|---|---|---|
| Pot-name card (CoverTile 🇵🇹, "Lisbon Trip") | `fade-up` 8 px | 0 | 280 | `ease-enter` |
| "Trip rules" label | `fade` | 160 | 200 | `ease-standard` |
| Rule rows ($100 · 2 of 3 · $200) | `fade-up` 8 px, 60 ms apart | 240 / 300 / 360 | 280 | `ease-enter` |

Ends at 640 ms. The bold values don't animate.

**Step 2: "Drop the link in the chat"** (invite → You're in! → the goal fills):

| Element | From → to | Delay | Dur | Easing |
|---|---|---|---|---|
| Maya's avatar + `InviteBubble` | `fade-up` 8 px + `scale .96 → 1`, origin bottom-left | 0 | 360 | `ease-enter` |
| Leo's card ("You're in!", "Leo added $150") | `fade-up` 8 px | 520 | 280 | `ease-enter` |
| Leo's avatar | `pop` from `.6` | 600 | 360 | `ease-spring` |
| "+ $150.00" | `fade` | 760 | 200 | `ease-standard` |
| Goal fill | `goal`: `clip-path` from 66.7 % ($300 of $450) to 100 % (rounded ends never squash) | 880 | 500 | `ease-standard` |
| "$300 of $450 collected" → "**$450** of $450 collected" | `roll` of the first number, in step with the fill | 880 | 500 | `ease-standard` |

Ends at 1.38 s. The fill never animates `width`; the app's `GoalBar` has `transition-[width]`, so reach its fill from outside with `clip-path`, as the toolkit's `goal` effect does.

**Step 3: "Small spends approve themselves"** (Groceries → checking → approved → sent → $366.00):

| Element | From → to | Delay | Dur | Easing |
|---|---|---|---|---|
| Groceries row (Maya, "Groceries 🛒", $84.00) | `fade-up` 8 px | 0 | 280 | `ease-enter` |
| "Checking Pot rules…" row | `fade-up` 8 px | 200 | 280 | `ease-enter` |
| Its dots | **one** pulse cycle, then rest at the still look (opacity .6), the server's state | 280 | 1 200 | `pot-dot` (1 iteration) |
| "Approved by Pot rules" capsule (`brand-soft` from its first frame) | `fade-up` 8 px + `scale .98 → 1` | 1 480 | 280 | `ease-enter` |
| Its check | `pop` from `.5` | 1 560 | 360 | `ease-spring` |
| "$84 sent to you" row | `fade-up` 8 px | 1 760 | 280 | `ease-enter` |
| Its "Sent" chip | `fade` | 1 840 | 200 | `ease-standard` |
| "In the Pot" **$450.00 → $366.00** | `roll` | 1 960 | 500 | `ease-standard` |

- Ends at 2.46 s.
- **No burst here.** The burst answers the visitor's own tap, and nobody tapped.
- The checking row stays after approval, as a log line. Its dots are still, exactly as in the server HTML.

**Step 4: "Bigger spends go to the group"** (request → 2 of 3 → 1 of 2 → the push → Approved! → $66.00):

| Element | From → to | Delay | Dur | Easing |
|---|---|---|---|---|
| Request card (Maya: "Maya asks for $300 for the boat trip", $300.00) | `fade-up` 8 px | 0 | 280 | `ease-enter` |
| "This needs 2 of 3 approvals" + "It's over the $100 instant limit." | `fade` | 280 | 200 | `ease-standard` |
| "1 of 2 approvals" chip (Maya's own approval counted) | `pop` from `.6` | 640 | 360 | `ease-spring` |
| "Maya · asked, approval counted" | `fade` | 720 | 200 | `ease-standard` |
| `PushCard` "Maya needs your OK" | `drop`: `opacity 0; translate: 0 -12px` → rest (a banner arriving) | 1 120 | 360 | `ease-enter` |
| "Approved! $300 is on its way to Maya." row | `fade-up` 8 px | 1 720 | 280 | `ease-enter` |
| Its check | `pop` from `.5` | 1 800 | 360 | `ease-spring` |
| "In the Pot" **$366.00 → $66.00** | `roll` (width shrinks by one digit: ghost-width, see Implementation §4) | 1 960 | 500 | `ease-standard` |

- Ends at 2.46 s. No burst (group approvals never burst).
- The chip stays "1 of 2 approvals". The fragment reads as a timeline, and the server HTML is the final state.

**Step 5: "Close it and everyone gets their share back"** (rows land, the total settles, Pot closed):

| Element | From → to | Delay | Dur | Easing |
|---|---|---|---|---|
| Caption + column heads | `fade` | 0 | 200 | `ease-standard` |
| Rows Maya, Sam, Leo | `fade-up` 8 px, 60 ms apart | 120 / 180 / 240 | 280 | `ease-enter` |
| Total row | `fade` | 300 | 200 | `ease-standard` |
| Total "Gets back" **$0.00 → $66.00** (Put in $450.00 stays still: only the money coming back moves) | `roll` (ghost-width) | 300 | 500 | `ease-standard` |
| "Everyone got their share back." | `fade` | 840 | 200 | `ease-standard` |
| "Pot closed" chip (top row) | `pop` from `.6` | 900 | 360 | `ease-spring` |

Ends at 1.26 s. No burst: closing is not a rules approval (brand README §8, design-direction 02 open question 12).

**Stickers** (groceries, boat, suitcase): `opacity 0; transform: rotate(6deg) scale(1.08)` → `none` (on top of their inline `rotate`), on `ease-spring` over 360 ms, at the step's delay + 200 ms. They ride on the step's sequence; they are not a separate trigger.

- **Reduced motion:** every fragment is final, rolls show their final value, and the dots are still.
- **No JS:** today's static fragments.

### 4. Try the rules (the visitor's own action; no scroll sequence)

| Moment | Spec |
|---|---|
| Section head, rule list | Still. The deciding rule's row gets `bg-surface` over 200 ms `ease-standard` (exists). |
| Reason chips | See the catalogue. A selected chip's check pops (`ease-spring`, 360 ms, from `.5`). |
| Amount segmented control | A **sliding thumb**: one `surface` pill (with the existing 1 px shadow) moves under the selected label with `translateX` over 280 ms `ease-standard`, like `TabList`. Labels cross to `ink` over 200 ms. Arrow keys move it the same way. |
| Spend tap | Press per the catalogue. The fieldset dims to 60 % over 200 ms (exists). The cursor shows `progress` while busy (exists). |
| Outcome enters | `pot-enter`: `translateY(-6px) → 0` with opacity, 280 ms `ease-enter` (exists). **Should:** grow its box with `grid-template-rows: 0fr → 1fr` over 280 ms, so the content below glides instead of jumping. The growth is user-initiated, so it never counts toward CLS. |
| Checking | "Checking Pot rules…" + dots for the 1.2 s beat (exists; it stays under reduced motion). |
| Approved | Capsule to `brand-soft` over 200 ms (exists). The check `pop` moves from `pot-pop` to `ease-spring`, 360 ms. **The burst** plays in the same frame, from the Spend button. |
| The burst (fix) | 10-12 particles, 6-8 px, `brand`/`brand-deep`, travelling 40-72 px over **600 ms**. Split the curves: **translate** on `ease-enter`; **scale** `1 → .4` on `ease-standard`; **opacity** held at 1 until 40 %, then linear to 0 at 100 % (keyframes `0%, 40% {opacity:1}`, separate from the travel easing). It should read for ~350 ms, not ~80 ms. Never under reduced motion. |
| Sent | "$84 sent to you" + the Sent chip `fade` 200 ms. Balance **$450.00 → $366.00** `roll` 500 ms (exists). **Should:** below a 768 px container, add an "In the Pot" line to the outcome (the `pot.hero.label` key; no new copy) that rolls too, because the top balance is off-screen at 390. Hide it from `@3xl/try`, so a wide card never shows two rolls. |
| Asked → Approve as Leo | Press per the catalogue. The capsule's text swaps with a 200 ms crossfade. Status chip "1 of 2" → "2 of 2" `pop`. Balance roll (exists). No burst. |
| Start over | The balance **snaps** back to $450.00 with a 200 ms crossfade, because no money moved, so nothing rolls. *Could:* the `RotateCcw` icon turns −360° once, over 360 ms `ease-standard`, on click (not hover). |

- **Reduced motion:** colours and text change instantly, the outcome may fade over 120 ms, there is no burst and no pop, the balance swaps, and the 1.2 s beat stays.
- **No JS:** the server's first state (Groceries, $84, the preview), as today.

### 5. Trust

Still. This section answers "is it safe?", and a calm page is part of the answer. The proof chips don't pop (they would repeat the playground), and the fact cards have no hover (they aren't links).

### 6. Under the hood (`#tech`; the flow `<ol>` is one sequence at 35 %)

- **Plays:** **one** spend, Maya's $84, travels the path. Each node it reaches **lights**: a 2 px `brand` ring at `inset: -3px` fades 0 → 1 → 0 over 600 ms (`lit`).
- **The trace:** each connector it crosses **draws** a `brand` line over the `line-strong` connector (`draw-y` on phones, `draw-x` at lg). At the fork it takes the **left branch** into "Inside the rules", because $84 is under the $100 limit, then joins and pays out. The "Bigger spends" lane stays unlit: it's the other road, not this spend's.
- **Final:** the traces fade back to the plain connectors, so the final frame is the server's.
- **Still:** nodes (they are present from the start; drop their `data-reveal`), fact cards, the demo row and the credit.

| Element | From → to | Delay | Dur | Easing |
|---|---|---|---|---|
| Node 1 "Maya taps Spend $84" | `lit` | 0 | 600 | `ease-standard` |
| Connector 1→2 trace | `draw-y` / `draw-x` from its start edge | 200 | 200 | `ease-standard` |
| Node 2 "Our relayer pays the gas" | `lit` | 400 | 600 | `ease-standard` |
| Connector 2→3 trace | `draw` | 600 | 200 | `ease-standard` |
| Node 3 "Pot Hub checks the rules": `lit` + its icon tile `pop` from `.85` (the hold *is* the check; no dots, since there is no "Checking Pot rules…" text here) | `lit` + `pop` | 800 | 600 hold | `ease-standard` / `ease-spring` |
| Fork stem + **left** half of the bracket | `draw` | 1 400 | 240 | `ease-standard` |
| Lane "Inside the rules": `lit` + its check `pop` from `.5` | `lit` + `pop` | 1 640 | 600 / 360 | `ease-standard` / `ease-spring` |
| Join (left half) + last connector | `draw` | 1 900 | 240 | `ease-standard` |
| Node 5 "The Pot pays out" | `lit` | 2 140 | 600 | `ease-standard` |
| Every trace | `out`: opacity 1 → 0, back to `line-strong` | 2 400 | 600 | `ease-exit` |

- **Total:** 3.0 s.
- **Trace, not a moving dot:** the toolkit's `travel` marker reads badly here, because the connectors are 16 px long at 390 and 24 px at lg, so a dot only blips. A drawing line plus a lit node reads as "it went from here to there".
- **Reduced motion and no JS:** the static diagram.
- **Don't:**
  - Run a second $300 pass down the group lane (twice the length for no new idea).
  - Loop the trace.
  - Give the hub typing dots: the motif stays tied to its words.

### 7. Final call to action

| Element | Trigger | From → to | Delay | Dur | Easing |
|---|---|---|---|---|---|
| Avatars Maya, Sam, Leo (the group gathers) | in view, 50 % of the card | `pop` from `.6` + `opacity 0`, 80 ms apart | 0 / 80 / 160 | 360 | `ease-spring` |
| Sunglasses sticker | same | `opacity 0; transform: rotate(6deg) scale(1.08)` → `none` (settles at its −8°) | 240 | 360 | `ease-spring` |
| H2, body, buttons | — | still | — | — | — |

Reduced motion and no JS: static.

### 8. Footer

Still. [Back to top] scrolls smoothly to `#main` (instantly under reduced motion). Its arrow nudges up 2 px on hover (catalogue).

---

## Micro-interaction catalogue

Hover rules apply only where `(hover: hover)` holds (Tailwind v4's `hover:` already does this). The focus ring is the global 2 px `focus` ring with a 2 px offset on `:focus-visible`. It is never transitioned, never removed and never covered: no `transition: all`, and no `outline` in any transition list. Every press is `scale: .97` **in 120 ms, out 200 ms**, on `ease-standard`. Under reduced motion there is no scale, and colour changes stay.

| Element | Hover | Press | Focus | Selected / current | Disabled / busy |
|---|---|---|---|---|---|
| Lockup link (header, footer) | none (the logo never animates or changes colour) | none | ring around the 44 px link | — | — |
| Header anchor links (lg) | `bg-surface-sunken`, 120 ms (exists) | none (scroll is the feedback) | ring | 2 px `ink` indicator + `aria-current="true"` (§0) | — |
| [Try the demo] (header, sm secondary) | `bg-surface-sunken`, 120 ms (exists) | `.97` | ring | — | — |
| **[Start a Pot]** (the one marigold) | **Cerasela's call**, open question 1. Default: no colour change; `shadow-card` fades in over 200 ms. | `bg-brand-deep` + `.97` (exists) | ring | — | — |
| Secondary buttons (hero [Try the demo], [Start your Pot →], [Try the demo], [Open the live demo →]) | `bg-surface-sunken`, 120 ms. **Arrow** (where present): `translate: 3px 0`, 200 ms `ease-standard` | `.97` | ring | — | 50 % + `not-allowed` (none on `/` today) |
| Reason chips (Groceries, Dinner, Boat trip) | `bg-surface-sunken`, 120 ms (unselected only) | `.97` | ring | `brand-soft` + `brand-deep` edge over 120 ms; the check pops (`ease-spring`, 360 ms). *Should:* the check's slot opens with `grid-template-columns: 0fr → 1fr` over 200 ms, so neighbours glide rather than jump. | inside the disabled fieldset: 60 % (exists), `not-allowed` |
| Amount radios ($20 · $84 · $150 · $300) | label to `ink`, 200 ms (exists) | `.97` on the label | ring on the radio | the sliding thumb (§4) | as above |
| [Spend $84] (secondary) | `bg-surface-sunken`, 120 ms | `.97` | ring | — | Not allowed: 50 % + `not-allowed`, still focusable (exists), and the preview box says why. Busy: `cursor: progress`. |
| [Approve as Leo] (secondary, check icon) | `bg-surface-sunken`, 120 ms | `.97` | ring; focus moves to Spend after the tap (exists) | — | — |
| [Start over] (text button) | underline `line-strong` → `ink`, 120 ms (exists) | icon turn (*could*, §4), no scale | ring | — | — |
| Stickers (decorative `<img>`) | *Could*, pointer devices only, on the sticker itself (never on its card): `rotate base + 4°; scale 1.04`, 360 ms `ease-spring`. `cursor: default`, so it promises no click. | none | not focusable | — | — |
| Cards (step, problem, trust, fact, final) | **None.** None of them is a link, and a lift would promise a click. If a card ever becomes one link: `translate: 0 -2px` + a second `shadow-card` layer fading in over 200 ms (the toolkit's `.l-lift`). | — | — | — | — |
| In-page anchors (nav links, Back to top) | as their style | — | the ring lands on the link; after the jump the heading sits 80 px below the top (`scroll-mt-20`, header 56/64 px) | — | — |
| [Back to top] | underline (exists) + arrow `translate: 0 -2px`, 200 ms | — | ring | — | — |

**Global details:**
- **Cursor:** `cursor: pointer` on every landing `<button>`. Tailwind v4's preflight sets `cursor: default` on buttons, and today our chips, radios and Spend show an arrow while every link shows a hand. Use `not-allowed` when disabled and `progress` when busy.
- **Tap highlight:** `-webkit-tap-highlight-color: transparent` on landing `a` and `button`, because every one of them has a press state. The focus ring stays.
- **Selection:** `::selection { background: var(--pot-brand-soft); color: var(--pot-ink) }`, which works in Day and in the Night band (tokens only).
- **Smooth anchors:** `html { scroll-behavior: smooth }`, only under `(prefers-reduced-motion: no-preference)` and only on `/` (`html:has([data-landing])`, as the toolkit does). No JS scroll library.
- **Touch:** `touch-action: manipulation` on chips and radios (`.pot-touch`, exists). Hit areas ≥ 44 px (exist).

---

## Implementation notes

1. **Fix the press transition first.** It's a one-line class change with the biggest felt difference.
   - The bug: Tailwind v4's `scale-*` utilities set the CSS `scale` property, but `buttonVariants` and `Chip` list `transform` in `transition-[…]`.
   - The fix: `transition-[background-color,border-color,scale]`. For an asymmetric press, add `active:duration-120` with a base `duration-200`.
   - `button.tsx` and `Controls.tsx` are app-wide, so the director decides who edits them. The fix also benefits the app.
2. **CSS, WAAPI or `motion`?**
   - **CSS:** hero load, every sequence effect (keyframes paused while armed), hover, press, focus, selection, header border (scroll timeline), segmented thumb and nav indicator (transitions on `transform`), and the burst.
   - **Tiny JS (no library):** one engine that arms, plays and skips (a single IntersectionObserver), number rolls (rAF writing `textContent` of an `aria-hidden` overlay; no React re-render per frame), and the nav scroll-spy. The engine and rolls are ~2 KB gzip and the scroll-spy under 1 KB.
   - **`motion`: don't import it.** Measured with esbuild (minified + gzip, React external):
     - `animate` from `motion` 24.3 KB;
     - `LazyMotion` + `domAnimation` + `m` 31.2 KB (over the 25 KB budget on its own);
     - `motion/mini` `animate` 3.4 KB, `motion/react-mini` 3.5 KB, the `spring` generator 2.0 KB, `inView` 0.45 KB.

     The spring is a precomputed `linear()` (0 KB). If a JS-driven spring is ever truly needed, `motion/mini` (3.4 KB) is the ceiling.
   - **Budget target:** ≤ 6 KB gzip JS and ≤ 4 KB gzip CSS for all landing motion, well inside 25 KB.
3. **Scroll work:** no scroll listener doing work per frame.
   - Use IntersectionObserver for triggers and the scroll-spy.
   - The header hairline uses CSS `animation-timeline: scroll()` behind `@supports (animation-timeline: scroll())`.
   - The playground's growth is user-initiated; nothing animates layout on scroll.
4. **CLS 0:**
   - Animate only `transform` / `translate` / `scale` / `rotate`, `opacity` and `clip-path`.
   - Arm only below the viewport.
   - Fill the goal bar with `clip-path`, never `width`.
   - **Ghost width for rolls whose digit count changes** ($366.00 → $66.00, $0.00 → $66.00): render the final amount invisibly (`visibility: hidden`) to size the box, and roll an absolutely positioned, `aria-hidden`, end-aligned copy over it. Remove the overlay at the end.
   - Shifts caused by scroll-triggered motion are *not* excused by CLS's 500 ms input window; only taps are.
5. **Screen readers:** fragments are `inert` + `aria-hidden` and the tech flow is plain text, so nothing animating is announced. The playground's single polite live region speaks only the outcome sentence (exists). Rolls never write to a live region.
6. **Tests:** run axe after sequences finish (no `[data-seq-state]` left) or with `reducedMotion: "reduce"`; mid-animation opacity gives false contrast results. e2e selectors stay on final text, so they pass with motion on and off.

**What to verify with `record.mjs`** (scenarios in `<sp>/scenarios/`; read the sheets, don't guess):

| Check | How | Pass |
|---|---|---|
| Hero arrival | load, `--fps 20 --cols 8`, 0-1.5 s, at 390 and 1280, Day and `--dark` | The H1 is identical in every frame. The arrival ends ≤ 0.9 s. The highlight wipes left to right. |
| Problem chat | scroll it into view, `--fps 12` | The 640 ms gap before "Day 23"; the dots stop by 5 s. |
| Each how-it-works step | scroll each into view, `--fps 20` | The order matches its table, the last frame equals the reduced-motion still, and the balance lands exactly on $366.00 / $66.00. |
| lg pairs | 1280, scroll to steps 3+4 | The right card starts ~600 ms after the left. |
| Tech flow | 390 and 1280, `--dark` | One trace goes down the left lane, the group lane never lights, and the traces are gone by 3.0 s. |
| Playground | the existing `playground-instant.mjs`, plus a crop at 25 fps around Spend | Particles are visible for ≥ 300 ms, and on phones a rolling balance is visible. |
| Reduced motion | every scenario with `--reduced` | Nothing translates or scales, and finals are immediate. |
| Jump and fling | click the `#tech` nav link; `mouse.wheel(0, 8000)` | No half-played or blank fragment above the landing point. |
| CPU 4× | in the scenario: `const s = await page.context().newCDPSession(page); await s.send("Emulation.setCPUThrottlingRate", {rate: 4})` | No dropped sequences, and frames stay even. |
| CLS | `PerformanceObserver({type: "layout-shift", buffered: true})` summed after a full scroll | 0. |
| LCP | `largest-contentful-paint` entry | Still the H1. |

---

## Priority

**Must (this round):**
1. Press transitions that actually animate (`scale` in the transition list; 120 ms in, 200 ms out) on buttons, chips and radios.
2. A burst that reads: split opacity from travel, per §4. It stays the only celebration.
3. How-it-works stories for steps 2, 3, 4 and 5 (and step 1's light row reveal), with arming, skip-to-final, reduced-motion finals and no burst.
4. The tech flow: one $84 spend traced node to node, down the left lane.
5. The hero's 0.8 s arrival, with the H1 still and the highlight wiping in.
6. The problem chat arriving, with the 640 ms "three weeks" pause, and the dots stopping by 5 s.
7. Number rolls at 500 ms with ghost width (CLS 0), landing exactly.
8. Global details: `ease-spring` as `linear()`, `cursor: pointer`, tap highlight, `::selection`, and smooth anchors guarded for reduced motion.

**Should:**
- The header hairline on scroll (CSS scroll timeline; Firefox shows it always).
- The nav's active-section indicator at lg.
- The segmented sliding thumb.
- A rolling balance visible on phones in the playground.
- The outcome box growing smoothly.
- The check's slot opening in chips.
- The final call to action's avatars gathering.
- Arrow nudges.
- The lg pair offset.

**Could:**
- A sticker tilt on hover of the sticker itself.
- The Start-over icon turn.
- Skipping the hero replay on client-side return.

**No (and why):**
- **Scroll-linked parallax**, on stickers or anything else. It is decoration, it is scrubbed motion against the "plays once" grammar, Firefox doesn't support it, and the real-app stickers don't need it. The toolkit's `[data-parallax]` should stay unused, or be cut. If Cerasela wants it anyway: stickers only, ≤ 8 px, never on mocks.
- **Scroll-jacking, pinned scenes and smooth-scroll libraries** (Cash App's GSAP pin, Partiful's Lenis).
- **Hiding the header on scroll.**
- **Headline reveals**: word by word, blur-in or line masks (Linear, Luma, Raycast). They hide the LCP element and the judges' first line.
- **Auto-advancing carousels, marquees, rotating words and progress loops** (Raycast's 5 s bar, Stripe's logo marquee, Splitwise's word loop).
- **Fake cursors, touch dots, cursor followers, magnetic buttons and 3D card tilt.** The fragments explain themselves, and the brand bans the phone tilt.
- **A lift on non-link cards, and any hover on decoration that looks clickable.**
- **Confetti or the burst anywhere outside Try the rules.**
- **Count-ups on decorative stats.**
- **Typing dots anywhere new.**
- **Animated gradients or glows.**
- **View Transitions on `/`.** There is nothing to transition between; keep them for app routes.

---

## Browser support (checked 2026-10-22)

| Feature | Chrome / Edge | Safari | Firefox | On `/` |
|---|---|---|---|---|
| CSS scroll-driven animations (`animation-timeline: scroll()` / `view()`) | 115 (Jul 2023) | **26.0** (Sep 2025); compositor-threaded from 26.4, reliability fixes in 26.5 | **Not in stable**: behind `layout.css.scroll-driven-animations.enabled` through Firefox 157 (released 2026-09-29); on in Nightly; an Interop 2026 focus area | Progressive only: the header hairline. Never needed for content. Always behind `@supports`. |
| `@starting-style` | 117 | 17.5 | 129 | Baseline (newly available). Optional for elements React inserts after hydration (the playground outcome), instead of keyframes. |
| View Transitions, same-document (`startViewTransition`) | 111 | 18.0 | **144** (2025-10-14) | Baseline (newly available). Cross-document: Chrome 126, Safari 18.2, Firefox not yet. Not used on `/`. |
| `linear()` easing | 113 | 17.2 | 112 | Baseline **widely available** (June 2026). Use it for `ease-spring`. |
| Individual transforms (`scale`, `translate`, `rotate`) | 104 | 14.1 | 72 | Widely available. This is why `active:scale-*` needs `scale` in the transition list. |

Sources: [WebKit features in Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/), [Safari 26.4](https://webkit.org/blog/17862/webkit-features-for-safari-26-4/), [Safari 26.5](https://webkit.org/blog/17938/webkit-features-for-safari-26-5/), [Firefox 152](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/152), [156](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/156) and [157](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/157) release notes, [MDN `animation-timeline`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/animation-timeline) ("Limited availability"), [web.dev: entry animations in Baseline](https://web.dev/blog/baseline-entry-animations), [web-features: linear() easing](https://web-platform-dx.github.io/web-features-explorer/features/linear-easing/), [View Transitions in all major browsers](https://events-3bg.pages.dev/jotter/in-all-major-browsers/). The individual-transform versions come from MDN's compatibility data, from memory: ⚠️ re-check them if they matter.

---

## References

**Live sites.** Sheets are in `<sp>/shots/research/`: `<name>-d-load.png` / `-scroll.png` at 1280, and `<name>-m-…` at 390. Probe data is in `<sp>/research/<name>.json`.

| Site | Recorded / measured | Borrow | Leave |
|---|---|---|---|
| **Partiful** | `partiful-d-load.png`, **`partiful-d-bubble.png`** (15 fps crop) | **The chat beat:** typing dots (opacity .4, 900 ms, 120 ms apart) for ~1.45 s, then the pill widens into the message in ~200 ms (dots out 120, text in 120), then the stack lifts ~270 ms as the next person types. This is our problem chat and step 2. | Lenis smooth scroll, the hide-on-scroll pill header, all-caps reveals |
| **Luma** | **`luma-m-load.png`**, `luma-d-*` | Cards assembling: from `translateY(~28px) scale(.92)`, 900 ms `(.16,1,.3,1)`, 80 ms apart. Our phone and proof card, shortened to 360 ms. | Title words rising 170 px over 1200 ms; a 2.3 s choreography |
| **Stripe** | **`stripe-d-load.png`**, `stripe-d-scroll.png`, `stripe-m-*` | **A still H1 on load.** Live product UI inside bento cards. The CTA arrow nudge (6 px, 300 ms). The header state on a CSS `ScrollTimeline`. The digit odometer (325 ms, 50 ms per digit). | The logo marquee, the WebGL gradient |
| Linear | `linear-d-load.png`, `linear-m-*` | Press `scale(.97)` over 160 ms; nav hover 100 ms; popovers `scale(.98) → 1` over 180 ms; springs exported as `linear()` | A blurred, line-masked H1 (~2.5 s) |
| Monzo | `monzo-d-*`, `monzo-m-scroll.png` (half covered by its consent banner, which was not clicked) | An instant press (`transition: none` on `:active`) with a 300 ms release; the header shadow appearing on scroll; `@starting-style` and `linear()` in production | 24 px / 1000 ms reveals |
| Wise | `wise-d-*`, `wise-m-*` | A calm page; the exchange-rate ticker's row crossfade | Hiding the header on scroll down (350 ms) |
| Raycast | `raycast-d-load.png` | Sequential highlight (keys 0.2 → 1, 300 ms apart), the idea behind our `lit` nodes | The H1 faded in from 0; a 5 s auto-advancing carousel; the 3 s hero |
| Mercury | `mercury-d-*` | Tab content crossfades with `blur(4px)` over 500 ms (a "could" for any future tabs) | Cookie-modal choreography |
| Cash App | `cashapp-d-scroll.png`, `cashapp-m-load.png` | A phone whose UI moves through real states ($789.13 → savings → borrow) | GSAP pinning and parallax, scroll-jacked colour swaps |
| Family | `family-d-scroll.png` | The restraint around product videos; the touch indicator in app recordings (film-only for us) | Video product shots: ours are live components |
| Vercel | `vercel-d-*` | Almost nothing moves; the header background appears on scroll | — |
| Arc | `arc-d-*` | A 2 px arrow nudge, 200 ms | Nav links scaling 1.05 on hover |
| Duolingo, Splitwise | `duolingo-m-load.png`, `splitwise-m-load.png` (stacked in `stack-m-load-1.png`) | Static, friendly heroes work | Splitwise's looping word and colour rotation |
| Copilot | `copilot-d-*` | Springs as `linear()` (Framer) | A 2 s hero scale from 0.7 |
| Pot (ours) | `pot-m-*`, `pot-d-*`, **`pot-burst-zoom.png`**, `pot-burst-overview.png` | Baseline: Reveal 12 px / 280 ms / 60 ms; tokens in use | The three bugs above |

**Mobbin** (patterns only; page links stay valid):

| App | Mobbin | Borrow | Leave |
|---|---|---|---|
| Attio | [Automations hero](https://mobbin.com/sites/sections/02fd91bb-fe2c-4813-97e4-0acf28fd1d9a) | Nodes ticking "Completed" down a flow that forks into two lanes: the shape of our tech trace | The dotted grid background |
| Ramp | [Approvals](https://mobbin.com/sites/sections/c97365f0-4fee-4ad0-8ad9-c7ef4849bc6d) | A rule written as a sentence ("If Request is software and > $5,000") above an approval chain; a chat-style receipt reminder | The four-approver chain (ours is "2 of 3") |
| Wise (iOS) | [Sending money](https://mobbin.com/flows/b821a14c-a4be-49e8-b7cc-2d491badb3e0) | The "Sent" receipt as a checked vertical timeline: our step 4 log reading | Password re-entry |
| Vipps (iOS) | [Sending money](https://mobbin.com/flows/16797a9c-7191-451e-9b5d-1e301a91ccf5) | The paid row landing at the top of "Latest": a list insert that confirms | The orange floating action bar |
| Setel (iOS) | [Sending money](https://mobbin.com/flows/aa2d71c3-0488-4e32-ae7e-2a064ab82ca9) | A success card with the check badge overlapping its top edge, which gives the check its own beat | The rating slider |
| Cash App (iOS) | [Pools: add people](https://mobbin.com/flows/c614b77e-7697-4656-a43b-e9eaadcf349e) | A "$0 of $100 goal" ring that fills as people chip in: our goal fill with its sentence twin | The ring shape (we keep the bar) |
| Chime (iOS) | [Sending a request](https://mobbin.com/flows/b56cf4c5-08ab-4827-a7f1-1f184e895692) | Per-person Paid / Unpaid rows: our refund rows landing one by one | The green CTA |
| OpenPhone | [Conversation](https://mobbin.com/sites/sections/d5f2b5bf-68fc-4969-9ddd-bec83f7bf85a) | Product cards living inside one chat thread | — |

**Craft sources:**
- [Emil Kowalski, 7 practical animation tips](https://emilkowal.ski/ui/7-practical-animation-tips): press `scale(0.97)`; never animate from `scale(0)` (start ~0.93); keep UI motion under 300 ms; origin-aware transforms.
- Emil Kowalski, [Great animations](https://emilkowal.ski/ui/great-animations) and [Good vs great](https://emilkowal.ski/ui/good-vs-great-animations): ease-out for enter and exit; no animation on high-frequency or keyboard actions; animate only transform and opacity.
- [Rauno Freiberg, Invisible details of interaction design](https://rauno.me/craft/interaction-design): interruptibility, motion that shows where things live, immediate feedback then confirmation, and frequency kills animation.
- [Vercel Web Interface Guidelines](https://vercel.com/design/guidelines): CSS > WAAPI > JS; never `transition: all`; honour reduced motion; `scroll-margin-top` for anchors; `-webkit-tap-highlight-color`; a show-delay and a minimum visible time for loaders.
- [Apple HIG: Motion](https://developers.apple.com/design/human-interface-guidelines/foundations/motion): purposeful, brief and precise; never the only carrier of information; under Reduce Motion, crossfades instead of slides.
- Material 3 easing ([tokens](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs)): our `ease-standard` / `ease-enter` / `ease-exit` are M3's standard, emphasized-decelerate and emphasized-accelerate curves.
- [IntersectionObserver vs scroll listeners](https://itnext.io/1v1-scroll-listener-vs-intersection-observers-469a26ab9eb6): scroll handlers cost about twice the scripting time of IntersectionObserver in that benchmark.

---

## Open questions for Cerasela

| # | Question | Default |
|---|---|---|
| 1 | **[Start a Pot] hover.** The brand defines only pressed (`brand-deep`) for the primary. Should hover add `shadow-card` (no new colour), or stay as it is? | `shadow-card` fades in over 200 ms |
| 2 | **Parallax.** Cut the toolkit's `[data-parallax]`, or allow ≤ 8 px on stickers only? | Cut |
| 3 | **The press fix in `button.tsx` / `Controls.tsx`** changes the app too (for the better). Should it land in the app components or only in landing CSS? | App components (one class each) |
| 4 | **The segmented sliding thumb** lives in `Controls.tsx`, which SpendSheet and YouScreen also use. Should the app get the slide too? | Yes, like `TabList` |
| 5 | **Step 4's chip** stays "1 of 2 approvals" under "Approved! $300 is on its way" (a log reading). Change the server text to "2 of 2"? | Keep "1 of 2": it carries the story for AI judges |
| 6 | **The hero's arrival** sets `opacity: 0` on the decorative visual for ≤ 360 ms at first paint. Acceptable, or translate-only (no fade)? | Acceptable: the H1 is the LCP element and stays still |
