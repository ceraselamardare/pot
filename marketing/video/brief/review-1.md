# Review 1: the assembled film (critic pass, 2026-10-22)

Sources: `out/review/PotDemoCaptioned-half.mp4`, full-res stills, and audio stems rendered with music/VO toggled (`out/review/stem-*.wav`). Evidence images are in `out/review/frames/`. Frames are global, at 60 fps.

## Verdict
1. **Yes, this would impress the judges.** Acts 1-2 are premium-studio level: frame 0 already hooks, and the typing dot that turns marigold on f1080 and floods into the logo is the best moment in the film.
2. **The story is coherent and truthful:** real UI and copy, D-61 numbers that reconcile on every screen, and kinetic type that lands 0-10 f before each spoken word.
3. **Biggest weakness: the second half loses the hypermotion promise.** From 0:38, every Act 3 seam is a 0.7-1.6 s dead hold of a small phone beside an empty half-frame; $450 and $66 get no hero beat (unlike $366); Act 4 is a near-static slide; the end card sits silent and motionless for 3 s.
4. **The captioned X cut needs a caption pass:** captions repeat the big type about 10 times and collide with the UI in 4 places.
5. **Brand and accuracy are clean, with one exception:** the "approved" burst reads as gold coins.

## Measured
- **Loudness:** the review MP4 is −26.0 LUFS / −12.4 dBTP (unmastered by design). `scripts/audio-master.py` on it gives −14.1 LUFS / −1.5 dBTP, LRA 3.5, no clipping.
- **Ducking** (music under VO vs between lines): Act 1 −4.5 dB, Act 2 −8.5, Act 3 −6.9, Act 4 −7.0. The VO sits about 17 dB over the bed.
- **SFX sync** (after the 1.5 f MP3 delay that mastering removes): impact f1080.1 = first marigold frame; success f2661.8 (card f2662, VO "approved" f2666); "No" stamps f2074/2126/2194 vs VO f2075/2127/2195; end blips f4712 vs "Pot" f4713.
- **Type sync:** "2 of 3" lands just before "two" (f3125), its block on "three"; "$22.00 each." on "share"; s12 slabs 4 and 3 light within 6 f of "Sputnik" and "enforced".
- **Silence:** the mix is under −50 dB from f4855 to the end (3.1 s).

## P0: must fix

**P0-1. Captions collide and duplicate (PotDemoCaptioned).**
- Collisions:
  - f1816-1889 (s08): the box sits on the chat composer, so "Drop the link in the chat." reads as a typed message (`f1870.png`).
  - f3290-3356 (s10): the phone's home indicator pokes out beside the box as a stray "–" (`f3345.png`, `glitch-b.png`).
  - f4711-4863 (s13): "Built at NEAR Hackathon." sits under the "Built at NEAR HACKATHON" pill, in two casings (`glitch-a.png`).
  - f3916-4136 (s12): the box covers the "Dollars" slab (`f3950.png`).
- Word-for-word duplicates of on-screen type: f25-189, f871-1047, f1201-1350 (`f1345.png`), f2073-2250 (`f2235.png`), f2326-2453 (`f2450.png`), f2896-3000, f3190-3356, f3466-3591, f4477-4595.
- Fix: suppress ranges wherever the kinetic type shows the VO words; no captions on s13; in Act 3, right-align the box in the free column (x ≈ 1080-1820), clear of the phone.
- Files: `src/Captions.tsx`.

**P0-2. The burst reads as coins (brand rule 9).** f2662-2700, s09 (`f2672.png`, `f2690.png`).
- Problem: particles render about 28-30 px on screen (camera push plus +200 px Z travel), with a 2-3 px brand-deep rim and streak ellipses. They look like rimmed gold discs.
- Fix: at `S09Instant.tsx:192`, drop `rim`, set `streak={0}`, and lower `scale` or the Z travel until the dots land at 12-16 px on screen.
- Files: `src/scenes/act3/S09Instant.tsx`, `src/motion/effects/Burst.tsx`.

## P1: should fix

**P1-1. Dead holds at the Act 3 seams; $66 has no hero.** f2277-2317 (s08 → s09), f2842-2887 (s09 → s10), f3370-3467 (s10 → s11, 1.6 s).
- Problem: a static small phone beside an empty right half (`seams-b.png` rows 2-4, `f3430.png`).
- Fix: trim each hold to ≤ 12 f of drift, or start the next scene's type or push before the cut. On f3370-3440, add the right-side "In the Pot $366.00 → $66.00" MoneyRoll, as in s09 f2712-2772.
- Files: `S08Join.tsx`, `S09Instant.tsx`, `S10Group.tsx`, `S11Close.tsx`, `s09-shared.tsx`.

**P1-2. s08 is half-empty and the fully funded beat is buried.**
- Problem: the right half is empty on f1902-2074 (2.9 s; `f1945.png`, `f2045.png`). The $300 → $450 roll plays tiny inside the phone on f2066-2105, under the "No wallet" stamps (`sync-presses.png`).
- Fix: big type beside Leo's phone ("Join with Google", then "Chip in $150"); give "$450 of $450 collected" a 30-40 f breakout before f2075.
- Files: `S08Join.tsx`.

**P1-3. The ending is dead air.** f4863-5039, s13 (`f4900.png`).
- Problem: zero motion, music gone from f4855, no URL.
- Fix: sustain the final chord to the last frame (or end near f4950), add 1-2 % creep, and put the product URL under the pill.
- Files: `S13End.tsx`, `Soundtrack.tsx` (`MUSIC_ARC_DB` tail), `timeline.ts`.

**P1-4. Act 4 is the least kinetic part, where judges score tech.** s12, f3870-4680.
- Problem: lowest motion in the film; inactive rows at about 40 % opacity and sub-labels about 28 px (`f4440.png`); the stack never ties back to the two spends we just watched.
- Fix: a slow orbit and creep on the stack; inactive rows at ≥ 60 %. On "enforced on-chain", send an "$84" pulse that stops at Pot rules with a ✓, and a "$300" pulse that goes on to Your Pot, where two member dots light.
- Files: `S12Tech.tsx`, `xray.tsx`.

**P1-5. The rule sentences are too short to read.** f1650-1710, s07 (`s07-exit.png`).
- Problem: both sentences (14 words) are complete for about 1.0 s. The film's own rule wants 2.8 s, and the VO doesn't read them.
- Fix: hold them to about f1770; shorten the wordless "Creating Lisbon Trip…" beat (f1731-1799).
- Files: `S07Create.tsx`.

**P1-6. The joke doesn't land.** f465-512, s03 (`glitch-a.png`).
- Problem: "Leo is typing…" is a bubble about 200 px wide with a 28 px label at the bottom edge, 30 px above the caption.
- Fix: push in 1.4× or stage it at 2× near the centre; keep the 1 f vanish and the music dip at f492-525.
- Files: `S02S03FrontChase.tsx`.

**P1-7. 0.9 s of empty frame.** f811-865, s04 → s05: grain only (`seams-a.png` row 4).
- Fix: keep the audio breath, but bring the bubble in by about f830.
- Files: `S04Options.tsx`, `S05Pivot.tsx`.

## P2: polish
- **Whip gaps and jump cuts.**
  - Where: empty frames on f191-194 (s01 → s02) and f3361 (s10); jump cuts on the same phone at f1730 → 1731 (s07) and f2571 → 2572 (s09) (`s09-jump.png`).
  - Fix: overlap whip-out and whip-in by 4 f; turn the jump cuts into 12-15 f pushes or blur-matched whips.
  - Files: `S01Hook.tsx`, `S10Group.tsx`, `S07Create.tsx`, `S09Instant.tsx`.
- **The ✓ Approved chip covers its sentence,** reading "Approved roved! $300…" (f3345-3356, s10; `glitch-b.png`). Launch it beside the row. `S10Group.tsx`.
- **Leo's approve press is late:** f3280, 57 f after "approves" (f3223). Tap the push at about f3195 and press at about f3220. `s10-timing.ts`.
- **Highlight blocks:** "go to the group." is four overlapping blocks with notches (`f2995.png`), and periods sit on the block edge (`f2450.png`). One block per line. `src/motion/text/marks.tsx`.
- **"No" stamps:** each marigold block starts about 6 f after its stamp SFX (`sync-nostamps.png`). Hit the blocks on f2074, f2126 and f2194. `S08Join.tsx`.
- **s12 rows:** "Your Pot" and "Dollars" vanish on f4215-4365, then pop back under the blurred sub-label (`f4250.png`, `glitch-a.png`). Keep the rows fixed. `S12Tech.tsx`.
- **Sticker speck:** a 3-5 px orange speck trails the s09 whip on f2569-2576. Unmount the sticker below scale 0.05.
- **s11 close approvals flash past:** "1 of 2" (f3750) → "2 of 2" (f3770) → "Pot closed" (f3795), with no VO and small type (`s11-close.png`). Hold "2 of 2" for ≥ 30 f. `S11Close.tsx`, `s11-approvals.tsx`.
- **Continuity:** "who's holding the trip money?" is Sam's in s01 but Leo's in the s08 chat (`f1870.png`). Use one sender.
- **Touch dots in s10:** the note-field tap (f3078-3086) lands on the edge of "Ask the group", the note field is invisible (`s10-note.png`), and the Spend touch dot stays over the risen sheet (`f2995.png`). `S10Group.tsx`, `press.tsx`.
- **Holds without creep:** the s06 lockup is static on f1146-1390, and the finished s01 line holds only about 15 f before the whip (f170-184).
- **Clutter:** "weeks" sits on the dimmed $1,236.00 on f345-395 (`act1-s02s03.png`). Clear the counter first.
- **Trust nuance:** "No one can take money out alone." comes right after Maya took $84 out alone. Add the product's own second half as a sub-line: "Small spends follow the Pot's rules; bigger ones need the group."
- **Mix:** Act 1 ducks only 4.5 dB; bring it to about 8 dB.

## Keep: do not lose these in fixes
1. **The dots thread:** on f1080 a typing dot turns marigold, floods and becomes the logo's dots, with the impact on the same frame; later "Checking Pot rules…" blips into "Approved by Pot rules" on f2662.
2. **The frame-0 hook and a concrete Act 1:** $1,236.00 fronted, "Sam, the $412?", Day 2 / 9 / 23 with "Seen", the struck-out split-app cards.
3. **Real UI with exact, reconciling D-61 numbers and honest copy:** "Demo dollars (test money)", "Taking money out of Pot isn't available yet", no account IDs.
4. **Word-level type sync** throughout.
5. **The one-world grammar:** link-card and request-card whips between the phones, the split screen, the screen-off into the Night x-ray, and consistent phone scale and light across Act 3.
