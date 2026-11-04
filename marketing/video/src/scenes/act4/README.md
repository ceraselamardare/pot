# Builder E: s11-close, s12-tech, and the screen-off into Night

**Scenes** (timeline v2, brief 06)
- **s11-close** (360 f, global 3510-3869) closes the Pot. The group approves (2 of 3), and everyone gets $22.00 back.
- **s12-tech** (810 f, global 3870-4679) is the "Under the hood" x-ray.

The Act 3 → 4 transition (accent 3, the screen-off) is one rig, `xray.tsx`, shared by both scenes. Each scene evaluates the same functions of `g`, the number of frames relative to the s12 start (negative inside s11). That keeps the cut continuous by construction.

**Every boundary comes from `src/data/timeline.ts`:**
- the scene lengths;
- `g` across the cut;
- the s12 end hold;
- the screen-off. It sits on the last bar line at or before s12's start: v2 = global 3840 = s11 f330, exactly where the music enters "Under the hood". It is never later than 30 f before the cut.

## Files and exports

| File | What |
|---|---|
| `../act3/S11Close.tsx` | `S11Close`, `S11_SCENES = ["s11-close"]` |
| `../act3/e-index.ts` | Re-exports `S11Close` and `S11_SCENES` (the registry entry for s11) |
| `../act3/s11-timing.ts` | `S11` (every beat, from `voWord`), `S11_CAMERA_KEYS`, `s11CameraAt()` (pure camera, used by the rig) |
| `../act3/s11-refund.tsx` | `S11RefundTable`, the breakout twin. It is the kit `RefundTable` markup plus per-row landing and a `tickValue()` count |
| `../act3/s11-approvals.tsx` | The group-approval beat: `closeTimeline()` (kit `timelineRows`), `S11ApprovalsCard` (the readable type-side twin of the sheet's waiting block) and `S11ClosedLine` (close.done.self) |
| `S12Tech.tsx` | `S12Tech`, `S12_SCENES = ["s12-tech"]` |
| `index.ts` | Re-exports `S12Tech` and `S12_SCENES` |
| `s12-timing.ts` | `S12` (every beat, from `voWord`) and `FOCUS` (which layer is lit when) |
| `s12-plates.tsx` | `PLATES` (the 5 layers, with copy), `Plate` (one slab), and the gap, anchor and pulse-station geometry |
| `xray.tsx` | The transition rig: `XR`, `ISO`, `STACK`, `xrayLayerPose`, `xrayCamera`, `screenRectAt`, `XrayPhone` (the line-art phone) and `XrayScene` |
| `xray-math.ts` | 4×4 maths that mirrors the motion kit's CSS 3D chain (Stage3D → Camera → Layer), used to pin screen-space overlays onto 3D objects |
| `preview/index.ts`, `preview/Root.tsx` | Own `registerRoot`. Compositions: `S11Close` (360), `S12Tech` (810), and `S11toS12`, which is the last 90 f of s11 plus the first 150 f of s12, cut as the master does |
| `preview/Measure.tsx` | `S11Measure`: prints in-phone rects the kit's LAYOUT doesn't carry (the waiting sheet's table, the MoreSheet rows) into the frame |

**Commands:**
```
npx remotion still  src/scenes/act4/preview/index.ts S11Close out/stills/s11/x.png --frame=236 --scale=0.5 --port=3517
npx remotion render src/scenes/act4/preview/index.ts S12Tech  out/scenes/s12-tech.mp4 --scale=0.5 --port=3517
```

## s11-close: beats (scene frames; global = 3510 + frame; VO starts at f15)

**VO words:** When 18 · trip's 32 · over 53 · close 91 · the 110 · Pot 117 · Everyone 166 · gets 191 · fair 217 · share 230 · back 244 (the VO ends ≈ 263).

| Frames (global) | Beat | Keyed to |
|---|---|---|
| 0 (3510) | Handoff from s10b: CAM.maya, Maya's PotScreen at $66.00 ("You'd get back $22 · You put in $150"), the round action row, `feedAfterBoat()` (✓ One OK), no sheet, tab bar $384.00, empty TypeZone | the s10b contract |
| 8-127 | "When the trip's over, / close the Pot." rises word by word (WordRise, 92 px). The sunglasses sticker pops at 43, lands on "over", and leaves at 104 | When … Pot |
| 24 (3534) | Press on the round **More** action (the camera pushes 1.06× toward the action row) | "trip's" |
| 28-50 | The **MoreSheet** rises: "More options · Lisbon Trip", Invite friends · Settings · Pot record · Who can see what · **Close Pot** | — |
| 62 (3572) | Press on "Close Pot" (the camera glides down with the sheet) | after "over" |
| 66-92 | The MoreSheet leaves while the **CloseSheet** rises onto "close" (one shared scrim, so the hand-over never double-darkens) | "close" 91 |
| 102 (3612) | Press **"Ask the group to close"** | "close the Pot" |
| 108 (3618) | The sheet goes to **waiting**: "Sent to the group. Your approval is counted. It needs 1 more." and "Approvals · 1 of 2". The VO line moves up and the readable twin of the waiting block rises beside it (zoom 2, rows ≈ 28 px) | — |
| 142 (3652) | **Sam approves:** his row flips to ✓ (kit pop, soft pop SFX, no burst); "Approvals · 2 of 2"; both notes read "Approved by Maya and Sam". 2 of 2 holds 46 f in the sheet and 54 f in the twin | — |
| 186-204 | The VO line and the approvals twin leave | — |
| 188 (3698) | **Refund breakout** out of the waiting sheet's table at 2 of 2 (measured at y 223.69), **holding the sheet's values** ($22.00 each, Total $66.00: no re-roll); `hideTable` on the original | just before "gets" |
| 191 / 194 / 198 | Each "Gets back" $22.00 gets a brief brand-soft emphasis (10 f wipe, 3 and 4 f apart, text stays ink); "Put in $150.00" muted; the emphasis clears as the twin settles back at 262-274 | "fair share" 217-244 |
| 226 / 234 (3736/3744) | "**$22.00** each." rises (150 px, tabular); the marigold bar wipes behind $22.00 at 250 (3760) | "back" 244 |
| 262 (3772) | **Pot closed:** the closed sheet (glyph + approved check, "$22.00 is in your Pot account.", "Who got what back"); the Pot behind reads "Closed Nov 3" with the header ••• back; Maya's Pot dollars roll $384.00 → $406.00 under the sheet; the twin settles into the closed table (20 f) | end of "back" |
| 266 (3776) | "✓ **Pot closed.** $22.00 is in your Pot account." (close.done.self) pops under "$22.00 each.", which settles up | — |
| 266-330 | "Pot closed" hold (64 f); the camera returns to CAM.maya by 318 | — |
| **330 (3840)** | **Screen-off:** the screen goes Night in 1 f, on the music's "Under the hood" bar line | — |
| 331-355 (3841-3865) | The Night rect grows from the screen's on-screen rect to the full frame (24 f, inOut); the phone shows through as x-ray line-art | — |
| 338 (3848) → s12 36 | The line-art phone turns toward isometric (rotX 55°, rotZ −35°); an x-ray scan runs down its screen (s11 342 → s12 12) | — |
| 359 (3869) | Last frame: full Night, the phone entering the x-ray pose | — |

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
| 276 → 308 (4146 → 4178) | **The story, 1:** an "$84.00" request runs from the App's Spend button down the slabs' left bands and stops at Pot rules; its dot becomes the approved check and "✓ Approved by Pot rules" pops under the pill. Pill and chip fold into the check at 354-364; the check stays to 424 | "rules" 302 |
| 336 → 370 (4206 → 4240) | **The story, 2:** a "$300.00" request **also stops at Pot rules**, higher up the same band beside the $84 check: Leo's dot pops beside it and "✓ Approved by Leo's OK" (approve.decided.ok): the Pot Hub approves it after one member's OK. Everything clears at 424-434 | "on-chain" 358 |
| 414 → 450 (4284 → 4320) | **The story, 3:** "Close · 2 of 3" runs down the band's outer edge (relayed: Gasless relay flashes; Pot rules doesn't decide it, so its slab stays dark) and lands at **Your Pot**: the pill makes room, Maya's and Sam's dots light up, the check, "✓ Approved by Maya and Sam" (the majority, as in s11); the Your Pot row lights. Out at 508 | "not by a person" 405-458 |
| — | **Label-safe by construction:** all lanes stay in the slabs' left bands (plate-local x < −69), and every pill and chip sits left of or under its dot. A frame-by-frame check against the projected engraved-label boxes gives ≥ 38 px everywhere, and ≥ 44 px from the frame edges | — |
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
4. Your Pot · users · "a Sputnik DAO · bigger calls need most of the group"
5. Dollars · banknote · "USDC on NEAR · testnet today"

**Motion and readability:**
- From frame 36 to the collapse, the stack orbits slowly: about +5° rotateZ and −2.5° rotateY with a faint wobble, plus a 5 % creep. The trust hold creeps 3 %, so no hold in Act 4 is static.
- Inactive rows sit at ≥ 62 % (85 % when nothing is in focus). The active row is full strength and 15 % larger.
- The rows never move or hide. The bottom-right caption strip (x 1080-1820, y 960-1040) stays free of labels.

**Finish:** Night ground. Grain at 0.35 (≈ 2 %) sits under the type, so labels stay crisp. Vignette 0.08. Marigold appears only as the pulse dots, their tails and the border flashes; every label is ink.

## SFX cues (`<Sfx>`, files present in public/audio/sfx)

| Scene | Cue |
|---|---|
| s11 | `tap` 24 (0.3, More) · `swoosh-up` 68 (0.28, the CloseSheet) · `click` 102 (0.4, Ask the group to close) · `pop-soft` 142 (0.2, Sam approves) · `pop-soft` 191/194/198 (0.16, the rows) · `pop-soft` 266 (0.16, Pot closed) · `whoosh-fast` 332 (0.25, the screen-off; it ends at 353, before the cut) |
| s12 | `tick` 71/101/131/165/234 (0.13, the overview pulse) and 308/370/450 (where $84, $300 and the close land) · `stamp` 612 (0.38, the shield / trust sentence) |

## Handoff verification

- **s10b → s11.** Frame 0 = `useWorldCamera("s11-close", …)` starting exactly on CAM.maya (drift from the global frame, "act3" seed); `PotScreen balance 66, yourShare 22, putIn 150, feedAfterBoat()`, tab bar $384.00, no sheet. Pixel-compared with builder B's `S10bMore` last frame: 0.19 % of pixels differ by more than 16/255 (one frame of the shared drift); `out/stills/s11/handoff-s10b-s11.png`.
- **s11 → s12.** Both scenes render `XrayScene` from the same `g`. Frames 89/90 of `S11toS12` (`out/stills/s12/cut-s11-last.png` / `cut-s12-first.png`), compared after blurring out the grain: 1.17 % of pixels change across the cut, the same as ordinary in-scene neighbours (1.08 % and 1.24 %); only the turning phone moves.
- **s12 → s13.** A hard cut at 810. s12 lands everything first: the sentence completes ≈ 700, its sub-line at 698-718, the chips by 753.

## Big type that repeats the VO word for word (for caption suppression; global frames)

| Scene | Line | On screen | VO |
|---|---|---|---|
| s11 | "When the trip's over, / close the Pot." | 3518 → 3714 (rise from 3518; exit 3696-3714) | 3528-3637 |
| s12 | "Under the hood" | 3908 → 4213 (rise from 3908; exit 4202-4213) | 3918-3937 |
| s12 | "No one can take / money out alone." | 4480 → 4680 (rise from 4480; holds to the cut) | 4490-4585 |

Not VO repeats: "$22.00 each.", the approvals twin, the closed line, the s12 callouts, the quote and the trust sub-line.

## Notes and deviations

- **Breakout depth:** the twin starts at z 1.5. The phone face sits at z 0.5 inside `Slab`, so a twin at z 0 hides on the swap frame. The kit's `BreakOut` now defaults to 1.5; s11 also passes it explicitly.
- **Refund values:** the twin lifts holding the sheet's own $22.00 (review-3: a re-roll from $0.00 read as a glitch); the emphasis is a brand-soft wipe behind each amount, echoing the marigold bar of "$22.00 each.".
- **Slab text:** each slab carries its icon and title on its exposed front band (iso, decorative). The readable title and label are flat callouts beside the stack, linked by leader lines to each slab's corner, because the isometric faces are foreshortened (cos 55°) and mostly covered by the slab above.
- **CloseSheet note:** the kit's CloseSheet switches its waiting note to "Approved by Maya and Sam" at 2 of 2, driven by the timeline rows s11 passes. The phone and the type-side twin agree.
- **v2 order (brief 06 §5.4):** the ⋮ header menu is gone (the app only keeps ••• on a closed Pot); s11 uses the round More action and the kit's MoreSheet → Close Pot. The approvals come before the refund breakout, which now lifts from the waiting sheet's table (measured with `preview/Measure.tsx`).
- **s12 v2 tie-back:** the $84 and the $300 both resolve at Pot rules (the hub approves the $300 after Leo's one OK); the majority pulse is the close (Maya and Sam, 2 of 3) at Your Pot. Each result clears before the next request needs its lane, so all three read one at a time.
