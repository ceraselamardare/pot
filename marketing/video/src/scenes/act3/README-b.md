# s10b-more: "And more" (builder B)

**s10b-more** is 360 f at global 3150-3509, between s10 (one OK) and s11 (close). VO at f15 (4.893 s): "Plus: trust that grows, all-or-nothing goals, and links to pay in, or pay out."

It is the film's feature blitz, mirroring the website's "What else a Pot can do". **"And more."** lands big on "Plus", then shrinks into the heading as four feature cards land one per VO beat in a 2 × 2 grid beside Maya's phone.

**Coherence (review-3 P1-1).** Only the Trust card is Maya's Lisbon Trip, in its honest state. The other three belong to *other* Pots of the app's own seeded world (`apps/web/lib/client/mock`), each with its Pot chip (the app's CoverTile + name). So nothing contradicts Lisbon's $66.00 or s11's $22.00 each, and those three cards enter from off-frame rather than from Maya's phone.

## Files
| File | What |
|---|---|
| `S10bMore.tsx` | The scene: world, camera, the "And more." heading, the card entries, exit, SFX. Exports `S10bMore` and `S10B_SCENES` (`["s10b-more"]`). |
| `s10b-cards.tsx` | The four cards. Each has a Pot chip, the website's Lucide icon (sprout / target / qr-code / send, stroke 2, ink), the app's own title in Gabarito 700 at **48 px** (−0.02em), and a LIVE kit fragment (411 px kit layout at CSS `zoom` 1.16 for crisp text). `POTS` holds the four Pots. |
| `s10b-timing.ts` | Every beat, keyed to its word with `voWord()`. |
| `b-index.ts` | Registry entry: `{ covers: S10B_SCENES, component: S10bMore }`. |
| `preview-b/` | `npx remotion studio src/scenes/act3/preview-b/index.ts`. `S10bMore` (360 f) is the scene; `S10bHandoffRef` (`globalFrame`) renders the handoff state straight from the spec, for diffing. |

## Beats
Scene-local frames; global = +3150.

| f (global) | Beat |
|---|---|
| 0 (3150) | The handoff state (see below). |
| 6-40 (3156-3190) | The camera makes room (a 5.5 % pull-back with the phone sliding left, `speedRamp`). `whoosh-long` at f12 peaks with it. |
| 8-34 (3158-3184) | **"And more."** rises in big on "Plus" (f18): Gabarito 800, 120 px, ink, −2.5 %, "And" then "more.", top right, clear of the phone. |
| 34-54 (3184-3204) | It shrinks (log scale) and glides into the 34 px heading above the grid as card 1 launches. It is out of card 1's path before the card arrives. |
| 34 → 54 (3184 → 3204) | **Trust grows · 🇵🇹 Lisbon Trip** breaks out of Maya's Settings tab and lands 4 f before "trust" (f58). It shows her honest state: two paid spends so far, and the rule is "every 3 paid spends raise someone's limit by $100". So the kit's MyTrustCard reads "Your instant limit" · New · "You can spend up to $100 without asking". Her two spends fill two of the three segments (f62-74, f80-92), and the line counts down to "1 more paid spend to $200" on "grows" (f92), with "Spends of $10 or more count. A declined request lowers it." under it. |
| 109 → 129 (3259 → 3279) | **All or nothing · 🎸 Festival Fund** (the app's goal-collecting capture) whips in from the right and lands before "all-or-nothing" (f133). "In the Pot" and the bar fill **$150.00 → $300.00 of $1,200 · 3 days left** (f137-176, "goals" f168). The lock line "Spending opens once the goal is reached." and "All or nothing: if we don't reach $1,200 by Nov 6, everyone gets their money back automatically." stay readable (the film's today is Nov 3). |
| 186 → 206 (3336 → 3356) | **Ask anyone to pay in · 🍷 Porto Weekend** rises from below and lands before "links" (f210). It isn't the goal Pot, because the app blocks pay-ins while a Pot still collects for an all-or-nothing goal. The QR draws in (f204-235), then ✓ "Your pay-in link is ready" · "Scan to pay into Porto Weekend" · "Payment · $25 · Until Nov 17". The feed row "Grandma · Paid in · by link + $25.00 · ↙ From outside · 9:12 AM" slides in at f238 and lands on "in" (f250). |
| 252 → 272 (3402 → 3422) | **Send by link · 🏄 Surf Camp** (the app's paylink capture) whips in from the right and lands before the second "pay" (f276). It shows "Your link to send $50 is ready", "Send it to Casa Lisboa host. Whoever opens it gets $50.", the QR, and "$50.00 · For Casa Lisboa host". **✓ Claimed** pops at f286, on "out" (f289). |
| 289-322 (3439-3472) | **The full grid holds** for 33 f, with the phone drifting and the camera creeping. |
| 318 / 322-351 (3468 / 3472-3501) | The heading leaves first. Then the cards are **thrown out to the right** on `exit` (20 f each, with smear): right column first (f322, f325), then the left (f328, f331). Meanwhile the camera eases home (`inOut`). From f351 the TypeZone is empty again. |
| 359 (3509) | The handoff state, exactly. |

## Motion grammar
- **Trust's breakout:**
  - the `{150, 20}` spring carries position and scale (0.22 → 1, log space), a −5° tilt settling, and a lift shadow (`depthShadow`, peaking mid-flight).
- **The other Pots' cards:**
  - they arrive already lifted (scale 0.92, lift 160 → 0, a ±3-4° tilt settling) from off-frame on the same spring;
  - none crosses a landed card.
- **Smear:** σ = 0.5 × px/f with a 5 px/f dead zone, so every card is crisp from 4 f before its word.
- **Camera:** the act's global drift (`useWorldCamera`), the room move, a 1.6 % creep, and a 0.7 % kick on each landing. The grid and heading float with half the drift.
- **No bouncy springs.** Only the app's own 320 ms pop on the two small checks (✓ ready, ✓ Claimed).
- **No burst. No new colours.** Marigold appears only as the goal bar and the app's Add button. Statuses are icon + word + colour. Amounts use two decimals and tabular figures (`MoneyText`); sentences use the app's whole dollars.
- **Readability (review-3 P1-5, P2-1):**
  - the big "And more." is 120 px;
  - the card titles are 48 px (the longest, "Ask anyone to pay in", fits on one line);
  - the Pot chips are 20 px;
  - kit text in the fragments is ≈ 18.6 px (body) and 16 px (small);
  - the grid (x 810-1880, y 112-932) leaves ≈ 31 px above the caption box (it was 11 px).
- **SFX:** `whoosh-long` 0.3 @12; `pop-soft` 0.35 at each landing (f53, 128, 205, 271). No burst, no taps.

## Handoff checks
The spec state: `CAM.maya` + the act's drift (`driftAt(global, {seed: "act3"})`, as `useWorldCamera`), `PotScreen balance 66 · yourShare 22 · putIn 150 · feedAfterBoat() · tabBar {balance: 384}`, no sheet, empty TypeZone.

| Frame | Compared with | Max channel diff |
|---|---|---|
| s10b f0 (full res) | `S10bHandoffRef` at global 3150 | **0** (pixel-identical) |
| s10b f359 (full res) | `S10bHandoffRef` at global 3509 | **0** (pixel-identical) |
| D's s10 last frame (v2, f359 = global 3149) | `S10bHandoffRef` at global 3149 | **0** |
| E's s11 f0 (v2, global 3510) | `S10bHandoffRef` at global 3510 | **0** |

Across each cut, the frame-to-frame difference (16,408 px, max 71) equals exactly one frame of the shared camera drift. Spec@3149 against spec@3150 gives the same numbers, so both seams are continuous: same state, same camera, same drift.
