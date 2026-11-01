# Review 2: regression and verification (2026-10-22)

Checked: the new render (4950 f), 42 full-res stills, new audio stems and frame scans. Evidence: `out/review/frames2/`.

**Verdict:** both P0s and 6 of 7 P1s are fixed. No new P0 or P1. Nothing left would embarrass us.

## P0
- **P0-1 Captions: FIXED.** All 9 duplicate ranges are silent (`gridB-dups.png`, `gridC-dups2.png`); s06 and s13 have none (f4790); the s10 dash is gone (f3300); in s12 the box clears every label (f3950-f4440, `gridH-act4.png`). I checked all 19 remaining pages; minor items are under "New".
- **P0-2 Burst: FIXED.** 10-14 px sparks, no rim or streak; no coin read (f2672, f2690, `gridD-burst.png`).

## P1
- **P1-1 Seam holds and $66 hero: FIXED.** Static holds are about 12-15 f: f2306-2320, f2876-2888 (with "$366.00" holding the right side to f2870) and f3446-3458, after a big "$366 → $66.00" roll on f3380-3440 (`seams-v2.png`).
- **P1-2 s08 type column: FIXED.** "Join with Google." (f1945) → "Chip in $150." (f1985) → "$300 → $450.00 / $450 of $450 collected" (f2040-2068) → "No" stamps (f2072). No overlaps at any handover (`transitions-v2.png` rows 1-2).
- **P1-3 Ending: PARTLY.** The 3 s silent tail is gone, but:
  - the music is under −50 dB from f4855, so the last 1.6 s are near-silent over a still card;
  - the "creep" is a 5 px drift over 270 f, invisible;
  - there is no URL.
  - Fix: let the outro ring to f4949 or trim to about f4890; use a real 1 % scale creep; add the app URL.
- **P1-4 Act 4: FIXED.** Inactive labels now reach luminance 160 against 241 active (was 118). Rows no longer vanish. The "$84.00 ✓ Approved by Pot rules" and "$300.00 · Approved by Maya and Leo" pulses read well (f4250-4365).
- **P1-5 Rule sentences: FIXED.** Complete by about f1650, held to f1778 (about 2.1 s).
- **P1-6 Joke: FIXED.** Staged big; the label is about 36 px and clears the caption by about 85 px (f470, `gridJ-act1.png`).
- **P1-7 s04 → s05 gap: FIXED.** The near-empty stretch is now 11 f (f825-835), down from 55.

## P2 follow-up
- **Fixed:** the whip gaps and both jump cuts, the Approved chip, Leo's press (click f3223.1, "approves" f3223), the highlight blocks, the "No" blocks (f2072-2074), the speck, the sender continuity, the s10 note tap, the "weeks" clutter and the trust sub-line.
- **Improved:** s11 "2 of 2" is now a big card held about 25 f.
- **Not done:** the s06 lockup is still static (f1150-1380).

## New (all P2)
1. **f4280-4365, s12:** the "Approved by Maya and Leo" chip covers the "Your Pot" slab label (only "Your" shows), and the $300 pill crosses "Gasless relay" at about f4250 (`s12-tieback-crop.png`). Fix: offset the chip onto the slab's empty half. File: `S12Tech.tsx`.
2. **f1816-1889, s08:** the caption sits about 10 px from the bezel, level with the send button, so it still reads as chat UI (`f1870-caption-crop.png`). Fix: raise it about 150 px or suppress it. File: `Captions.tsx`.
3. **f301-305, s03:** the caption fades in over the "hey! just a reminder" bubble. Fix: start this page at f306.
4. **f3614-3723, s11:** the caption leaves "back." alone on the second line. Fix: `textWrap: "balance"`.

## Audio and seams
- **Loudness:** raw −26.0 LUFS; mastered −14.0 LUFS and −1.4 dBTP, no clipping.
- **Sync is unchanged:** impact f1080.1, success f2661.8, stamps f2074, f2126 and f2194.
- **Act 1 music** is about 1.7 dB lower, so the VO sits about 20 dB over the bed.
- **Seams:** all 12 are clean (`seams-montage.png`); the blink candidates are designed whips (`blinks.png`).
