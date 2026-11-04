# Act 3 hero moments: s09-instant + s10-group (builder D), v2 (2026-11-03)

Two scenes in the shared Act 3 world (`src/scenes/shared/world.tsx`): one 3D space, Maya's phone at x 0 and Leo's at
+1.2 W, raster-2 phones, cameras keyed in scene-local frames with the drift from the global frame
(`useWorldCamera`), breakouts as `<BreakOut>` siblings inside `<WorldPhone>`. v2 follows `brief/06-update-v2.md`:
the app of Nov 3 (round actions, two-step Spend, compact feed, Pot dollars in the tab bar) and **one OK** for the $300
boat (hub 1.1.0). No "2 of 3" and no "Approvals · 1 of 2" anywhere in either scene.

## Exports (`d-index.ts`)
| Export | Covers | Length |
|---|---|---|
| `S09Instant`, `S09_SCENES` | `["s09-instant"]` | `scene("s09-instant").duration` (540 f, global 2250) |
| `S10Group`, `S10_SCENES` | `["s10-group"]` | `scene("s10-group").duration` (360 f, global 2790) |

## Files
| File | What |
|---|---|
| `S09Instant.tsx` | s09: camera keys, Maya's screen states, the approved-card breakout + the hero burst, TypeZone, SFX |
| `S10Group.tsx` | s10: the one-OK flow on both phones, the request-card whip, the "✓ One OK" whip home, TypeZone, SFX |
| `s09-timing.ts`, `s10-timing.ts` | beat sheets: every beat derived from `voWord()` (fallbacks = the takes) |
| `s09-shared.tsx` | shared by both: measured UI rects (`UI`, v2), the CSS-3D projection of the world (`frameOn`, `project`, `localForScreen`), `smearAt` (multi-point, camera-velocity smear), `tickValue`, `BigType`, `HighlightLine` (one bar per line), `PunctTail`, `RiseIn`, `WorldSticker`, `WidePill` |
| `s10-flight.tsx` | `RequestFlight` (Maya's ask → Leo's one-OK push) and `ApprovedChip` (the feed's "✓ One OK" chip, the whip anchor) |
| `preview-d/` | own entry (`index.ts`, `Root.tsx`), batch stills (`stills.mjs`), UI measurer (`Measure.tsx`, `measure.mjs`), handoff references (`HandoffRef.tsx`), `neighbours/` (C's s08 + B's s10b, a separate entry) |

## Preview (builder D's scripts use port 3473; `PORT=` to change; the CLI uses 3417 from remotion.config.ts)
```
npx remotion studio src/scenes/act3/preview-d/index.ts
node src/scenes/act3/preview-d/stills.mjs S09Instant out/stills/s09-instant 0.5 0,352,539
npx remotion render src/scenes/act3/preview-d/index.ts S10Group out/scenes/s10-group.mp4 --scale=0.5 --gl=angle --port=3473
node src/scenes/act3/preview-d/measure.mjs            # re-measure the UI rects if the UI kit changes
node src/scenes/act3/preview-d/neighbours/render.mjs  # C's s08 last frame + B's s10b first frame
```

## s09-instant (540 f at global 2250; VO unchanged at f15: "Small spends approve themselves. Eighty-four dollars for groceries? Pot checks the rules… approved, and paid back in seconds.")
| Local (global) | Beat | Keyed to |
|---|---|---|
| 0 (2250) | CAM.maya, PotScreen $450.00 · FEED_FULL, no sheet, tab bar $0.00 (handoff in); the camera creeps from f0 | — |
| 8-81 (2258-2331) | "Small spends / approve themselves." (132 px), one marigold bar per line at 104 / 109; exits 138, clear by 152 (2402) | Small 18 · approve 69 · themselves 91 |
| 118 (2368) | press the round Spend action; "How much?" rises 124-146; push to the keypad 120-158 | before "Eighty-four" |
| 155 / 163 (2405 / 2413) | keys 8 and 4 → "$84", "✓ This will be approved instantly" | Eighty-four 159 |
| 182 → 191 (2432 → 2441) | [Next] → a 14 f blur-matched move (speedRamp); step 2 switches in at peak speed | after "dollars" |
| 204 / 207 / 208 (2454-2458) | press + select Groceries 🛒 (`pop`), the grocery sticker; Who gets paid: **Me** | groceries 212 |
| 216 → 232 (2466 → 2482) | tap the decision's ⓘ: "Anyone can spend up to $100 without asking." + "Once it's paid, you'd get back $122…" | — |
| 250 (2500) | press [Get $84 back] | after "groceries?" |
| 256 → 270 | a 14 f blur-matched move; "Checking Pot rules…" switches in at 263 (2513); blips 292 (2542) | Pot 273 · checks 285 |
| 334 (2584) | the 0.7 snap toward the dots (×1.39 in 1 f, about the dots) | — |
| **352 (2602)** | **"Approved by Pot rules" · "Under the $100 instant limit"**: `success` + `burst`; the ONE burst (12 light sparks, 12-16 px on screen at launch, no rim, no streak, 36 f); the card BREAKS OUT (1.9×) while the camera pulls back on the same {150, 20} spring | approved 356 |
| 398 / 415 (2648 / 2665) | "Sending $84 to you…" → "$84 sent to you" + ✓ Sent + Receipt ↗; "In the Pot" + MoneyRoll $450.00 → $366.00 (42 f) with Maya's hero (You'd get back $122) | and 406 · paid 417 |
| 452 → 472 | the card drops back into the sent slot | — |
| 474 / 480 / 484 | Done; the sheet exits; the groceries row lands; the tab bar ticks $0.00 → $84.00 (484-508) | — |
| 506 → 516 (2756 → 2766) | the big roll clears; camera home at 528 (2778) | — |
| 539 (2789) | CAM.maya, $366.00 · You'd get back $122 · put in $150, `feedAfterGroceries()`, no sheet, tab bar $84.00, empty TypeZone | — |

## s10-group (360 f at global 2790; NEW VO at f15: "Bigger spends need one OK. Leo taps it, right from a notification.")
| Local (global) | Beat | Keyed to |
|---|---|---|
| 0 (2790) | = s09's last frame | — |
| 1 / 6-28 | press Spend; "How much?" rises; push 3-34 | — |
| 8-97 (2798-2887) | "Bigger spends / need one OK." (128 px); one marigold block under "one OK" at 112 (2902); exits 152, clear by 170 (2960), so it holds beside Leo's push (review 3) | Bigger 18 … OK 107 |
| 24 / 30 / 36 | keys 3 · 0 · 0 → "$300"; the decision flips to "✋ This needs one OK from anyone else" (ringed, waiting blue) | spends 41 |
| 45 → 53 (2843) | [Next] → 14 f blur-matched move; step 2 at peak speed | — |
| 60-74 | flick the chips; press + select Tickets 🎟️ at 74 (`pop`) + the boat sticker | need 67 |
| 78 / 81-101 | tap "+ Add a note"; "the boat trip" types; the decision line is ringed (89-110) | one 90 |
| 102 (2892) | press [Ask for one OK] → the grey ask with dots (107) | one OK 90-138 |
| 107 → 121 | blur-matched move; **"Sent · One OK from anyone else in the group and it's paid."** switches in at 114 (2904), readable (≈ 27-28 px) until the whip | OK 107 |
| 118 → 142 | the request card lifts out of the "$300.00" (the "Sent" box stays readable) and rides the whip to Leo (124-140, `whoosh-long` 2908); lands as the push at **142 (2932, `notif`)**: **"Maya needs one OK / $300 for the boat trip · Lisbon Trip · Anyone can OK it"**, fully readable for 28 f (142-170, review 3) | — |
| 166 / 170 (2956 / 2960) | Leo taps the push; on "Leo" the lock slides away and the one-OK sheet rises (170-192): "Maya asks for $300 · Lisbon Trip · just now", "One OK needed · Anyone in Lisbon Trip except Maya can give it." | Leo 174 |
| **185 → 190 (2975 → 2980)** | **press [OK $300], peak on "taps"** (`click` 2977) → "Sending your OK…" (191) | taps 190 |
| 202 → 216 | blur-matched move; **"Done. Your OK sent $300 to Maya."** switches in at 209 (2999); "You · gave the OK", ✓ Paid, "One OK by Leo". **No burst.** | it 208 |
| 164-249 (2954-3039) | "Leo taps it, / right from a / notification." (112 px, top of the column); exits 297, clear by 317 (3107) | Leo 174 … notification 259 |
| 252 → 276 (3042 → 3066) | the "✓ One OK" chip pops beside Leo's line and rides the whip home (258-276, scale dip keeps a phone in frame) onto Maya's feed row | notification |
| 276-340 (3066-3130) | "In the Pot" + MoneyRoll $366.00 → $66.00 (280-310) with her hero (You'd get back $22) and her Pot dollars $84.00 → $384.00; Maya pill; the roll clears by 350 (3140) | — |
| 359 (3149) | CAM.maya, PotScreen $66.00 · You'd get back $22, `feedAfterBoat()`, no sheet, tab bar $384.00, empty TypeZone; Leo at rest out of frame (his PotScreen $66.00, `feedAfterBoat()`) | — |

## For the director
- **The "Approved by Pot rules" hit: global 2602** (s09 local 352; `success` + `burst`). The music clear-out goes to 2587-2602.
- **Big type that repeats the VO word for word** (caption suppression; global, from the first word's entry to fully cleared):
  - s09 "Small spends / approve themselves." **2258-2402**;
  - s10 "Bigger spends / need one OK." **2798-2960**;
  - s10 "Leo taps it, / right from a / notification." **2954-3107**.
- **The caption strip (y > 960, x 1080-1840) is free** in every framing: the phones stay left of x 1080 whenever they reach below y 960, and the money rolls sit at y ≤ 830. Only the two whips (2914-2930, 3048-3066) pass smeared phones through it.
- **SFX (global):**
  - s09: `swoosh-up` 2372 · `keypad` 2406, 2414 · `pop` 2457 · `blips` 2542 · `success` + `burst` 2602.
  - s10: `swoosh-up` 2794 · `keypad` 2815, 2821, 2827 · `pop` 2864 · `whoosh-long` 2908 · `notif` 2932 · `swoosh-up` 2958 · `click` 2977 · `whoosh-fast` 3052.

## Handoff verification (renders at scale 1; mean |Δ| per channel)
| Cut | Result |
|---|---|
| C's `S08Join` f479 (the Nov 3 version) vs s09 f0 | 0.125 / 255 (C's frame = the `DRefS08End` contract exactly) |
| s09 f539 vs s10 f0 | 0.066 / 255 |
| s10 f359 vs B's `S10bMore` f0 / the `DRefS10bStart` contract | 0.150 / 255 (B's frame = the contract exactly) |

Each residual is one frame of the shared drift: the diff images are uniform outlines, with no content change.

## Notes and deviations
- **Content switches:** each step change, and each sheet whose layout jumps, switches on the peak-speed frame of a monotonic 12-14 f `speedRamp` move, with the stage smeared from the camera velocity at three points (`smearAt`):
  - "How much?" → details;
  - details → result;
  - "approving" → "approved".
  A dip key would put a velocity reversal (no smear) on the switch frame.
- **The ⓘ:**
  - s09 opens the decision's ⓘ to show the app's own "Anyone can spend up to $100 without asking." (the brief's preview line).
  - s10 does not: there is no time inside 360 f. Its decision line shows "This needs one OK from anyone else" with a waiting-blue ring (a video annotation), and the result shows "One OK from anyone else in the group and it's paid." readably.
- **The note:** "the boat trip" types at 1.5 f/char (40 chars/s), which is fast but legible; the budget is 360 f.
- **The tab bar:** Maya's Pot dollars tick when they become visible: $84 as her sheet clears (s09), $384 with the hero roll (s10).
- **The request card:**
  - It flies in a second, unblurred stage with the same camera, so it stays sharp while the world smears.
  - It lands exactly in the two-line one-OK push slot (`LAYOUT.lockPush` centre y 381).
- **Leo's sheet** says "Lisbon Trip · just now" (`time` prop), matching the push's "now" (review 3).
- **Pills:** none on Leo; his close framings crop them. The lock screen, "Maya needs one OK" and "Leo taps it," identify him. Maya's pill shows on the return.
- **Kept from review 1:**
  - the light-spark burst;
  - ≤ 11 f seam holds;
  - one bar per line, with the period off the block;
  - quick-lift touch dots;
  - the sticker unmount below 5 %;
  - no empty frames in the whips;
  - the chip launched beside its sentence.
