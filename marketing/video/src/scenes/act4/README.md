# Builder E: s11-close, s12-tech, and the screen-off into Night

**Scenes** (timeline v1.1)
- **s11-close** (420 f, global 3450-3869) closes the Pot. The group approves (2 of 3), and everyone gets $22.00 back.
- **s12-tech** (810 f, global 3870-4679) is the "Under the hood" x-ray.

The Act 3 → 4 transition (accent 3, the screen-off) is one rig, `xray.tsx`, shared by both scenes. Each scene evaluates the same functions of `g`, the number of frames relative to the s12 start (negative inside s11). That keeps the cut continuous by construction.

**Every boundary comes from `src/data/timeline.ts`:**
- the scene lengths;
- `g` across the cut;
- the s12 end hold;
- the screen-off. It sits on the last bar line at or before s12's start: v1.1 = global 3840 = s11 f390, exactly where the music enters "Under the hood". It is never later than 30 f before the cut.

## Files and exports

| File | What |
|---|---|
| `../act3/S11Close.tsx` | `S11Close`, `S11_SCENES = ["s11-close"]` |
| `../act3/e-index.ts` | Re-exports `S11Close` and `S11_SCENES` (the registry entry for s11) |
| `../act3/s11-timing.ts` | `S11` (every beat, from `voWord`), `S11_CAMERA_KEYS`, `s11CameraAt()` (pure camera, used by the rig) |
| `../act3/s11-menu.tsx` | The Pot header's ⋮ menu (local; the kit has none), rebuilt from `apps/web/components/pot/PotParts.tsx` with en.json copy |
| `../act3/s11-refund.tsx` | `S11RefundTable`, the breakout twin. It is the kit `RefundTable` markup plus per-row landing and a `tickValue()` count |
| `../act3/s11-approvals.tsx` | The group-approval beat: `closeTimeline()` (kit `timelineRows`), `S11ApprovalsCard` (the readable type-side twin of the sheet's waiting block) and `S11ClosedLine` (close.done.self) |
| `S12Tech.tsx` | `S12Tech`, `S12_SCENES = ["s12-tech"]` |
| `index.ts` | Re-exports `S12Tech` and `S12_SCENES` |
| `s12-timing.ts` | `S12` (every beat, from `voWord`) and `FOCUS` (which layer is lit when) |
| `s12-plates.tsx` | `PLATES` (the 5 layers, with copy), `Plate` (one slab), and the gap, anchor and pulse-station geometry |
| `xray.tsx` | The transition rig: `XR`, `ISO`, `STACK`, `xrayLayerPose`, `xrayCamera`, `screenRectAt`, `XrayPhone` (the line-art phone) and `XrayScene` |
| `xray-math.ts` | 4×4 maths that mirrors the motion kit's CSS 3D chain (Stage3D → Camera → Layer), used to pin screen-space overlays onto 3D objects |
| `preview/index.ts`, `preview/Root.tsx` | Own `registerRoot`. Compositions: `S11Close` (420), `S12Tech` (810), and `S11toS12`, which is the last 90 f of s11 plus the first 150 f of s12, cut as the master does |

**Commands:**
```
npx remotion still  src/scenes/act4/preview/index.ts S11Close out/stills/s11/x.png --frame=236 --scale=0.5
npx remotion render src/scenes/act4/preview/index.ts S12Tech  out/scenes/s12-tech.mp4 --scale=0.5
```

## s11-close: beats (scene frames; global = 3450 + frame; VO starts at f15)

**VO words:** When 18 · trip's 32 · over 53 · close 91 · the 110 · Pot 117 · Everyone 166 · gets 191 · fair 217 · share 230 · back 244 (the VO ends ≈ 263).

| Frames (global) | Beat | Keyed to |
|---|---|---|
| 0 (3450) | Handoff: CAM.maya, Maya's PotScreen at $66.00 ("Your share $22 · You put in $150"), `feedAfterBoat()`, no sheet, empty TypeZone | the s10 contract |
| 8-63 | "When the trip's over," rises word by word (WordRise, 92 px). The sunglasses sticker pops at 43 and lands on "over" | When … over |
| 58-86 | The camera pushes 1.08× toward the header | — |
| 66 / 70 | Press on ⋮, then the app's menu opens (Share invite / Close Pot · "Ask the group to end it and share out what's left") | the pause before "close" |
| 86 | Press on "Close Pot" | "close" 91 |
| 81-127 | "close the Pot." rises (line 2) | close / the / Pot |
| 93-115 | The CloseSheet rises and is then read: "Close Lisbon Trip?", "$66.00 left · split by how much each person put in", the table, [Ask the group to close]. The camera creeps 1.02 → 1.035 | "close the Pot" |
| 184-205 | Lines 1-2 exit | — |
| 188 (3638) | **Breakout:** the refund table lifts out of the sheet (kit `BreakOut` + `UiPiece` twin, original hidden with `hideTable`) | just before "gets" |
| 191 / 194 / 198 | Rows land 3 and 4 f apart. Each "Gets back" counts $0.00 → **$22.00** (≈ 20 decaying values in 42 f). "Put in $150.00" stays muted. The Total counts to $66.00 | "fair share" 217-244 |
| 233-240 (3683-3690) | The counts land | "back" 244 |
| 226 / 234 | "**$22.00** each." rises (150 px, tabular) | "back" |
| 250-261 | The marigold HighlightBar wipes behind $22.00 | — |
| 256-276 | The twin returns into the sheet (dwell ≈ 1.1 s; the camera pushed 1.035 → 1.07) | — |
| **278 (3728)** | Press on "Ask the group to close" (click) | — |
| **284 (3734)** | The sheet goes to **waiting**: close.sent "Sent to the group. Your approval is counted. It needs 1 more." and "Approvals · 1 of 2" (Maya ✓ "asked, approval counted", Sam/Leo "hasn't decided"). "$22.00 each." moves up, and the readable twin of that block rises beside it (zoom 2, rows ≈ 28 px). Held 30 f | — |
| **314 (3764)** | **Sam approves:** his row flips to ✓ "Sam · approved" (the kit's pop, a soft pop SFX, no burst), "Approvals · 2 of 2". The sheet's note and the twin's note become feed.approved.sub "Approved by Maya and Sam". **"2 of 2" holds 32 f** | — |
| **346 (3796)** | **Pot closed:** the closed sheet (glyph + approved check, "$22.00 is in your Pot account.", "Who got what back"); the Pot behind reads "Closed Oct 22", $0.00. The approvals twin exits, "$22.00 each." settles back to centre and at 350 (3800) the line "✓ Pot closed. $22.00 is in your Pot account." (close.done.self) pops in under it | — |
| 346-390 | "Pot closed" hold: 44 f (40 f for the closed line). The camera returns to CAM.maya by 378 | — |
| **390 (3840)** | **Screen-off:** the phone's screen goes Night in 1 f, on the music's "Under the hood" bar line | — |
| 391-415 (3841-3865) | A Night rect grows from the screen's on-screen rect to the full frame (24 f, inOut). The phone shows through it as x-ray line-art, with grain and vignette | — |
| 398 (3848) → s12 36 | The line-art phone turns toward isometric (rotX 55°, rotZ −35°). An x-ray scan runs down its screen (s11 402 → s12 12) and reveals the app's structure | — |
| 419 (3869) | Last frame: full Night, the phone entering the x-ray pose | — |

## s12-tech: beats (scene frames; global = 3870 + frame; VO starts at f45)

**VO words:** Under 48 · hood 67 · every 107 · Sputnik 169 · DAO 190 · on 226 · NEAR 236 · Its 286 · rules 302 · enforced 326 · on-chain 358 · person 432 · Every 494 · action 515 · gasless 548 · And 609 · no 620 · one 631 · can 641 · take 649 · money 662 · out 678 · alone 690 (the VO ends ≈ 715).

| Frames | Beat | Keyed to |
|---|---|---|
| 0-36 | The iso turn completes and the scan finishes (frame 0 = s11 frame 419 + 1, same rig) | — |
| 34 / 39 / 44 / 49 / 54 | **The x-ray separates.** The phone (App) lifts, and four slabs slide out under it, 150 px apart along the normal, 5 f apart, 24 f each on `land` | "Under the hood" |
| 38-77 | "Under the hood" rises (76 px) | Under / the / hood |
| 59 → 234 | **Request pulse:** a marigold dot spawns on the App's Spend button. It follows a screen-space Bézier through the five layers (`getLength` / `getPointAtLength`) and lights each border on arrival (App 71, Relay 101, Rules 131, Your Pot 165, Dollars 234). It has a speed tail and a quiet tick per layer. Each callout blur-resolves as the pulse reaches its layer | hood … NEAR |
| 151-171 → 232 | **Your Pot:** the x-ray scan ends on "Sputnik". Dwell 159-232: border line-strong, icon ink, callout "a Sputnik DAO · the group approves bigger spends" | "Sputnik DAO" |
| 232-300 | **Dollars:** "USDC on NEAR" | "on NEAR" |
| 308-328 → 500 | **Pot rules:** the scan ends on "enforced". Dwell to 500. "Under the hood" makes way at 332, and at 348 the app's own copy takes the headline slot: "The Pot enforces these rules itself. / No one, including Maya, can skip them." (held ≈ 2.4 s; the rows below never move) | "enforced on-chain, not by a person" |
| 292 → 324 | **The story, part 1:** an "$84.00" request leaves the App's Spend button and runs down the slabs' left bands to Pot rules. Its dot becomes the approved check, and "✓ Approved by Pot rules" pops under its pill. Pill and chip fold into the check at 386-396; the check stays to 452 | "rules … enforced" |
| 372 → 420 | **The story, part 2:** a "$300.00" request leaves the App at 380. It passes Pot rules along the band's outer edge, left of the $84 check, and lands at Your Pot at 420. Its pill makes room; Maya's and Leo's member dots light up beside it; "✓ Approved by Maya and Leo" pops under them; the Your Pot row lights with Pot rules (out at 492) | "on-chain, not by a person" |
| — | **Label-safe by construction:** both lanes stay in the slabs' left bands (plate-local x < −69, never covered by the slab above and clear of every engraved icon and title, which sit on the bottom band). Every pill and chip sits left of its dot. Clearance was checked frame by frame against the projected label boxes: ≥ 38 px | — |
| 530-550 → 582 | **Gasless relay:** "NEP-366 meta-transactions · people hold 0 NEAR" | "gasless" |
| 574-594 | The headline, leader lines and callouts exit | — |
| 590-604 | The stack snaps shut | the pause before "And" |
| 600-620 | The shut stack shrinks up into the shield | — |
| 612 | The shield-check pops (uiPop) with a stamp | "And" |
| 610-700 | "**No one can take / money out alone.**" (Gabarito 800, 132 px, Night ink) rises word by word, 0-4 f before each word | no … alone |
| 698 | The product's own second half rises under it: "Small spends follow the Pot's rules; bigger ones need the group." (landing.trust, Figtree 40 px, ink-muted) | — |
| 720-753 | Track chips settle along the bottom: Sputnik DAO · Meta-transactions · Named accounts · Stablecoins (28 px, ink-muted pills) | — |
| → 810 (4680) | Hold (≈ 1.8 s after the sentence completes), with a slow creep. Hard cut to the cream end card | — |

**Layer copy** (callout = Gabarito 700 40 px title + Figtree 500 28 px label; each slab also carries its Lucide icon and title engraved on its exposed band):
1. App · smartphone · "Sign in with Google (NEAR Auth) · no wallet, no seed phrase"
2. Gasless relay · zap · "NEP-366 meta-transactions · people hold 0 NEAR"
3. Pot rules · shield-check · "Pot Hub contract · approves only what the rules allow"
4. Your Pot · users · "a Sputnik DAO · the group approves bigger spends"
5. Dollars · banknote · "USDC on NEAR"

**Motion and readability:**
- From frame 36 to the collapse, the stack orbits slowly: about +5° rotateZ and −2.5° rotateY with a faint wobble, plus a 5 % creep. The trust hold creeps 3 %, so no hold in Act 4 is static.
- Inactive rows sit at ≥ 62 % (85 % when nothing is in focus). The active row is full strength and 15 % larger.
- The rows never move or hide. The bottom-right caption strip (x 1080-1820, y 960-1040) stays free of labels.

**Finish:** Night ground. Grain at 0.35 (≈ 2 %) sits under the type, so labels stay crisp. Vignette 0.08. Marigold appears only as the pulse dots, their tails and the border flashes; every label is ink.

## SFX cues (`<Sfx>`, files present in public/audio/sfx)

| Scene | Cue |
|---|---|
| s11 | `swoosh-up` 91 (0.28, the sheet) · `pop-soft` 191/194/198 (0.16, the rows) · `click` 278 (0.4, Ask the group to close) · `pop-soft` 314 (0.2, Sam approves) · `pop-soft` 350 (0.16, Pot closed) · `whoosh-fast` 392 (0.25, the screen-off; it ends at 413, before the cut) |
| s12 | `tick` 71/101/131/165/234 (0.13, the overview pulse) and 324/420 (where $84 and $300 land) · `stamp` 612 (0.38, the shield / trust sentence) |

## Handoff verification

- **s10 → s11.** Frame 0 = `useWorldCamera("s11-close", …)` starting exactly on CAM.maya (drift from the global frame, "act3" seed). The screen is `PotScreen balance 66, yourShare 22, putIn 150, feedAfterBoat()`, with no sheet. It was compared with the last frame of builder D's `out/scenes/s10-group.mp4` and is the same state and pose (`out/stills/s11/handoff-s10-s11.png`).
- **s11 → s12.** Both scenes render `XrayScene` from the same `g`. Frames 89/90 of `S11toS12` (`out/stills/s12/cut-s11-last.png` and `cut-s12-first.png`) were compared after blurring out the grain. The changed pixels (1.17 %) sit only on the turning phone, the same as ordinary in-scene frames 88/89 (1.09 %) and 90/91 (1.24 %).
- **s12 → s13.** A hard cut at 810. s12 lands everything first: the sentence completes ≈ 700 and the chips by 745.

## Notes and deviations

- **Breakout depth:** the twin starts at z 1.5. The phone face sits at z 0.5 inside `Slab`, so a twin at z 0 hides on the swap frame. The kit's `BreakOut` now defaults to 1.5; s11 also passes it explicitly.
- **Refund-row reset:** the twin's rows re-land with a 2 f dip, which masks the reset from $22.00 to $0.00 before the count. The in-sheet table shows the real values while the sheet is read.
- **Slab text:** each slab carries its icon and title on its exposed front band (iso, decorative). The readable title and label are flat callouts beside the stack, linked by leader lines to each slab's corner, because the isometric faces are foreshortened (cos 55°) and mostly covered by the slab above.
- **CloseSheet note:** the kit's CloseSheet (director fix) switches its waiting note to "Approved by Maya and Sam" at 2 of 2, driven by the timeline rows s11 passes. The phone and the type-side twin now agree.
