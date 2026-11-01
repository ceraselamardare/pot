# Act 3 hero moments: s09-instant + s10-group (builder D)

Two scene components in the shared Act 3 world (`src/scenes/shared/world.tsx`): one 3D space, Maya's phone at
x 0 and Leo's at +1.2 W, cameras keyed in scene-local frames with the drift from the global frame
(`useWorldCamera`), breakouts as `<BreakOut>` siblings inside `<WorldPhone>`.

## Exports (`d-index.ts`)
| Export | Covers | Length |
|---|---|---|
| `S09Instant`, `S09_SCENES` | `["s09-instant"]` | `scene("s09-instant").duration` (570 f) |
| `S10Group`, `S10_SCENES` | `["s10-group"]` | `scene("s10-group").duration` (570 f) |

Registry lines: `{ covers: S09_SCENES, component: S09Instant }`, `{ covers: S10_SCENES, component: S10Group }`.

## Files
| File | What |
|---|---|
| `S09Instant.tsx` | the s09 scene (camera keys, Maya's screen states, approved-card breakout + hero burst, TypeZone, SFX) |
| `S10Group.tsx` | the s10 scene (vote form, timeline breakout, split, Leo's flow, whip home, SFX) |
| `s09-timing.ts`, `s10-timing.ts` | beat sheets: every beat derived from `voWord()` (fallbacks = the locked takes) |
| `s09-shared.tsx` | shared by both: measured UI rects (`UI`), the CSS-3D projection of the world (`frameOn`, `project`, `localForScreen`), `tickValue` (MoneyRoll tick schedule for in-phone balances), `BigType` (WordRise + chained marigold sweeps), `WorldSticker`, `WidePill` |
| `s10-flight.tsx` | `RequestFlight` (Maya → Leo, lands as the push) and `ApprovedChip` (the whip anchor, Leo → Maya) |
| `preview-d/` | own entry (`index.ts`, `Root.tsx`), batch stills (`stills.mjs`), UI measurer (`Measure.tsx`, `measure.mjs`), handoff references (`HandoffRef.tsx`), zoom test |

## Preview
```
npx remotion studio src/scenes/act3/preview-d/index.ts            # S09Instant, S10Group (+ BuilderD-Tools)
node src/scenes/act3/preview-d/stills.mjs S09Instant out/stills/s09-instant 0.5 0,352,569   # one bundle, many stills
npx remotion render src/scenes/act3/preview-d/index.ts S10Group out/scenes/s10-group.mp4 --scale=0.5 --gl=angle
node src/scenes/act3/preview-d/measure.mjs                        # re-measure UI rects if the UI kit changes
```

## s09-instant (VO at f15: "Small spends approve themselves. Eighty-four dollars for groceries? Pot checks the rules… approved, and paid back in seconds.")
Global = local + 2310.
| Frame | Beat | Keyed to |
|---|---|---|
| 0 | CAM.maya, PotScreen $450.00 · FEED_FULL, no sheet (handoff in); a slow creep starts at f0 | — |
| 8 / 34 / 59 / 81 | "Small spends / approve / themselves." rise (132 px); one marigold bar per line at 104 / 109; the period moves off the block as the bar arrives | Small 18 · spends 44 · approve 69 · themselves 91 |
| 120 | press Spend (the touch dot lifts in 5 f); the sheet rises 128-150 (`swoosh-up`); push 124 → 162 to the form (1.38×); the type exits at 138 | before "Eighty-four" 159 |
| 155 / 163 | keys 8 and 4 (`keypad` ×2); the preview reads "This will be approved instantly · Anyone can spend up to $100 without asking." | Eighty-four 159 |
| 204 / 207 / 208 | press + select "Groceries 🛒" (`pop`); the grocery sticker pops, exits at 248 and is unmounted below 5 % (no speck) | groceries 212 |
| 250 | press "Get $84 back" | after "groceries?" |
| 256 → 270 | 14 f blur-matched move from the form to the result; "Checking Pot rules…" switches in at 263, at peak speed (was a jump cut) | Pot 273 |
| 291 | `blips` on the dots' first peak | checks 285 · rules 308 |
| 334 | the 0.7 snap toward the dots (×1.39 in 1 f, 18 f tail) | — |
| **352** | **"Approved by Pot rules"** + the hero burst: 12 light sparks, no rim, no streak, **12-16 px on screen at launch** (measured), fading from 40 %, 36 f; `success` + `burst`; the card breaks out (1.9×) while the camera pulls back on the same spring | approved 356 |
| 398 / 415 | "$84 sent to you" + Sent; "In the Pot" + MoneyRoll $450.00 → $366.00 (42 f), with Maya's hero in lockstep | and 406 · paid 417 |
| 470-566 | the card drops back; Done (492); the sheet exits (500); the groceries row lands (504); the money clears by 566; the camera lands home at 566 | — |
| 569 | CAM.maya, $366.00 · share $122 · put in $150, `feedAfterGroceries()`, no sheet, empty type zone (handoff out) | — |

## s10-group (VO at f15: "Bigger spends go to the group. The three-hundred-dollar boat trip needs two of three… so Leo approves, right from a notification.")
Global = local + 2880.
| Frame | Beat | Keyed to |
|---|---|---|
| 0 | = s09's last frame; a slow creep starts at f0 | — |
| 8-77 | "Bigger spends / go to the group." (128 px): ONE marigold block under "go to the group" (100-112), the period nudged off the block; exits 132 | Bigger 18 … group 87 |
| 104 | press Spend (dot lifts in 5 f); sheet 112-134 (`swoosh-up`); push 108 → 146 | after "group" |
| 145 / 155 / 165 | keys 3-0-0 (`keypad` ×3); at 167 the preview flips to "This needs 2 of 3 approvals" with a waiting-blue ring (to 229) | three-hundred-dollar 147 |
| 168-180 | the finger flicks the chip row; 182 / 185 press + select Tickets (`pop`) | — |
| 186-196 | the finger drags the form up 56 px so "+ Add a note (optional)" clears the footer; boat sticker 192 (out 223) | boat 194 |
| 197 / 200-226 | tap "+ Add a note" (a visible target), "the boat trip" types | trip 206 |
| 229 | press "Ask the group" | needs 225 |
| 232 → 252 | blur-matched move to the vote framing; "Sent to the group" + "Approvals · 1 of 2" switch in at 240 | — |
| 242 | the timeline BREAKS OUT; "needs" (215) / "2 of 3" (235, block at 255) | two 245 · of 257 · three 267 |
| 266 → 286 | 1.6× pull-back to CAM.split; Maya/Leo pills | after "three" |
| 272 → 298 | the request emerges from Leo's row and flies to Leo; it lands as the push at 298 (`notif`) | before "so" 312 |
| 292 → 312 | push to Leo's lock screen | so 312 |
| **316** | **Leo taps the push** (global 3196); the lock slides away 322-336; the ApproveSheet rises 320-342 | so 312 · Leo 330 |
| **341** | **press "Approve $300"**, peak 346 on the word (global 3221-3226; `click` 343) → "Approving…", 2 of 2 (347) | approves 344 |
| 365 | "Approved! $300 is on its way to Maya." **No burst.** | — |
| 320-456 | "Leo approves, / right from a / notification." (112 px) | Leo 330 … notification 418 |
| 460 | the "✓ Approved" chip pops BESIDE Leo's "Approved!" row (left of the sheet; covers no text) | — |
| 466 → 486 | whip home: scale dips to 0.8× mid-whip so a phone is always in frame (no empty frame); axis smear; the chip holds a steady screen path and lands on Maya's feed row (486) | — |
| 486 / 488 | "In the Pot" + MoneyRoll $366.00 → $66.00 (36 f, lands 524) with Maya's hero; holds ~0.5 s; cleared by 566 | — |
| 564-569 | camera at CAM.maya (≤ 6 f of drift) | — |
| 569 | CAM.maya, $66.00 · share $22 · put in $150, `feedAfterBoat()`, no sheet, empty type zone; Leo's phone at rest, out of frame | — |

## SFX cues (scene-local frames, nominal volumes 0.3-0.75)
- s09: `swoosh-up` 126 · `keypad` 156, 164 · `pop` 207 · `blips` 291 · `success` 352 · `burst` 352.
- s10: `swoosh-up` 110 · `keypad` 146, 156, 166 · `pop` 185 · `whoosh-long` 277 · `notif` 298 · `swoosh-up` 318 · `click` 343 · `whoosh-fast` 470 (quiet 0.35).
- Global frames: **the s09 hit is global 2662** (music clears 2647-2662); the s10 push lands at 3178; the whip home runs 3346-3366.

## Handoff verification (renders at scale 1)
- s09 f0 vs a reference of the s08 → s09 contract (CAM.maya + the act drift at global 2309, PotScreen $450.00, FEED_FULL): mean |Δ| 0.04 / 255, max 14 (one frame of drift).
- s09 f569 vs s10 f0: PSNR 46 dB, mean |Δ| 0.13 / 255 (one frame of drift; same state).
- s10 f569 vs a reference of the s10 → s11 contract (CAM.maya at global 3450, PotScreen $66.00, `feedAfterBoat()`): mean |Δ| 0.10 / 255, max 25 (one frame of drift).
- References: `preview-d/HandoffRef.tsx` (`DRefS08End`, `DRefS11Start`).
- The real neighbours (2026-10-22 versions): builder C's `S08Join` f509 vs s09 f0, mean |Δ| 0.04 / 255; s10 f569 vs builder E's
  `S11Close` f0, mean |Δ| 0.10 / 255 (both = one frame of drift). Re-check: `node src/scenes/act3/preview-d/neighbours/render.mjs`
  (a separate entry, so their work in progress never breaks `preview-d`).

## Review 1 fixes (2026-10-22)
- **P0 burst (no coins):** no rim, streak 0, `scale` 0.4 → 12 particles at 12-16 px on screen at launch, shrinking to ≈ 9-12 px as they fade; 36 f.
- **P1 seams:**
  - The camera creeps from f0 in both scenes.
  - s09 ends with 3 f of drift. With s10's first word at f8, that is 11 f across the cut.
  - s10 ends on a big "In the Pot $66.00" roll, cleared by f566, then ≤ 6 f of drift.
  - s08 → s09: my side is 8 f before "Small". The 33 f before the cut (global 2277-2309) are s08's.
- **P2:**
  - The s09 jump cut is now a 14 f blur-matched move.
  - The ✓ chip launches beside Leo's row.
  - Leo's push tap is at 3196 and the Approve press at 3221.
  - The sticker unmounts below 5 %.
  - The s10 note field is visible before its tap, and the touch dots lift in 5 f.
  - No empty whip frames.
  - One highlight block per line, with the period off the block (`HighlightLine`, `PunctTail` in `s09-shared.tsx`).

## Deviations and notes
- **Hidden timeline (s10):** `SpendSheet` has no `hideTimeline` for the `voteSent` step, so while the twin is lifted a surface-coloured rect covers the in-screen timeline (layout kept, pixel-identical background). Request: add `hideTimeline` to `SpendSheet` voteSent, like `ApproveSheet`.
- **"Highlighted" preview (s10):** a 2.5 px `waiting` focus ring around the RulePreview from the third key press to the "Ask the group" press (the preview already carries the clock icon and the words). It is a video annotation, not an app state.
- **Leo's line (s10):** "Leo approves, / right from a / notification." is added in the TypeZone so the beat reads muted; "Leo" lands ~20 f after it is spoken by design (in the split, Leo's phone sits where the type would go).
- **Split pills (s10):** the shared `PersonaPill`, scaled 1.7× (`WidePill`) on both phones in the split; at CAM.split the normal pill is ~14 px.
- **Body scroll (s10):** the note row sits under the footer in the vote form, so the sheet body scrolls 56 px to show "the boat trip" being typed.
- **Burst:** the motion kit's `Burst variant="hero"` inside the breakout twin (scale 0.4 of card px → 12-16 px on screen, launch ring r0 18, no rim, no streak). The in-phone `Celebration` is not used (the card is lifted when it would play).
- The approved capsule shows the approved text on surface-sunken for 1 frame before its 12 f tint (the kit's own transition).
- `<Sfx>` volumes are nominal: per `brief/audio-notes.md`, `SFX_MASTER` still has to be wired into `src/motion/Sfx.tsx`.
