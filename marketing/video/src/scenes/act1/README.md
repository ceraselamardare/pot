# Act 1: THE PROBLEM (builder A)

The first 18 s (1,080 f) of the film, on the Night palette with no marigold, finished with grain (`Grain opacity 0.28`, set by the director) and a vignette of 8 %. Every length comes from `src/data/timeline.ts`, and every word cue from `voWord()` / `voWordRel()`.

## Files and exports (`index.ts`)
| File | Component | Covers (`*_SCENES`) | Frames |
|---|---|---|---|
| `S01Hook.tsx` | `S01Hook` | `S01_SCENES` = s01-hook | 195 |
| `S02S03FrontChase.tsx` | `S02S03FrontChase` (+ `FrontChaseVisual`: visuals only, used by s04) | `S02S03_SCENES` = s02-front, s03-chase | 105 + 225 |
| `S04Options.tsx` | `S04Options` | `S04_SCENES` = s04-options | 330 |
| `S05Pivot.tsx` | `S05Pivot` (+ `S05_END_BUBBLE`, `PUSH_RATIO`) | `S05_SCENES` = s05-pivot | 225 |
| `common.tsx` | Night constants, `NightFinish`, film-scale `FilmBubble` / `FilmAvatar` / `NotificationBanner` / `AppTile` / `Seen` | | |
| `pivotBubble.tsx` | `PivotBubble`: the s05 chat bubble with the typing dots, drawn by s04's tail (it pops in at s04 f300) and by s05 (which pushes into it) | | |
| `preview/` | `index.ts` + `Root.tsx` + `Act1.tsx` | `A1-S01Hook`, `A1-S02S03FrontChase`, `A1-S04Options`, `A1-S05Pivot`, `A1-Act1` (all four, back to back) | |

Registry: `{covers: S01_SCENES, component: S01Hook}`, `{covers: S02S03_SCENES, component: S02S03FrontChase}`, `{covers: S04_SCENES, component: S04Options}`, `{covers: S05_SCENES, component: S05Pivot}`.

```
npx remotion still src/scenes/act1/preview/index.ts A1-S05Pivot out/stills/s05-pivot/x.png --frame=224
npx remotion render src/scenes/act1/preview/index.ts A1-Act1 out/scenes/act1.mp4 --scale=0.5
```

## Beats: key frames
Frames are component-relative, with absolute film frames in [brackets].

### s01-hook [0-195]
| f | Beat |
|---|---|
| 0 | **Mid-avalanche.** Three "Lisbon Trip ✈️" banners (generic message-circle app tile on member-6 + member-colour avatar) are on screen, the top one mid-slide. |
| −12, −4, 2, 8, 13, 17, 21, 24 | Banner slams: gaps 8, 6, 6, 5, 4, 4, 3. Each slides 65-110 px on `snap` with a 1 f vertical smear, and the stack drops in one-frame jumps. The six storyboard messages ride the slams from −4 to 21. |
| 24 → 25 | **Snap back** (`revealSnapKeys`, ratio 0.6, 24 f `land` tail), 2 f before "Every" (27). The content changes on the snap frame: a wall of chat bubbles with the giant bubble "who’s holding the trip money?" (Sam) at its centre. |
| 29, 33, 36 | The avalanche's tail (gaps 4, 4, 3): bubbles pop into the wall. The wall then dims to 34 % with a scrim behind the type bands. |
| 17 / 36 / 52 | "Every" / "group" / "trip" rise on the voice (spoken at 27 / 46 / 62), above the bubble. Gabarito 800, 128 px. |
| 100 / 112 / 122 | "has" / "a" / "money problem." rise below the bubble (spoken at 110 / 122 / 132; "problem" at 148). |
| 140-151 | Member-4 pink HighlightBar on "money problem.", with eggplant text: it reaches "problem" on the word. The finished line then holds about 33 f. |
| 183-195 | **Whip left** on `exit`, with a horizontal smear of up to 110 px; it reaches the cut at peak speed. |
| 191-194 | The whip-in overlaps the whip-out: `FrontChaseArrival` draws Maya already arriving from the right (s02 frames −4 to −1), so there is no empty frame. |

### s02-front + s03-chase [195-525], one continuous shot
| f | Beat |
|---|---|
| −4-20 | The B side of the whip. It starts on s01's last 4 frames, from just off the right edge, smeared; Maya (M on member-1, "Maya") lands at 20. VO "friend" is at 22. |
| 24-75 | The camera reframes and pulls back (cx −420 → 0, 1.12× → 1.0) as the content builds. |
| 26 | The receipt sticker pops behind the chips (the act's one sticker). |
| 30 / 45 / 60 | Chips on eighths: House "Flat · $840.00", Car "Car · $210.00", Utensils "Dinner · $186.00". |
| 33 → 41-83 | The total appears as $0.00, then ticks to **$1,236.00** (MoneyRoll `tick`: 20 steps, 42 f, Gabarito 800 210 px, tabular). VO "fronts" is at 43. "fronted by Maya" appears at 45. |
| 88-140 | One decisive speed-ramp down: the total becomes the top of the thread, then sweeps out of the top before "weeks". |
| 102 / 104 / 116 | "hey! just a reminder 🙏" (VO "then" at 108), then the Day 2 stamp, then "Seen". |
| 140-205 | **"weeks"**: the thesis word, from 1.6× on `punch`. It lands alone on its word (150), with the counter cleared and a 66 % Night-ground dim, and leaves 198-205. Day 9 flips at 150. |
| 204 / 218 / 236 | "Sam, the $412?" / "Leo??" / "anyone??", each followed by "Seen" 14 f later, during a slow drift down. Day 23 flips at 232. |
| 262-288 | **The joke push:** 1.6× on `inOut` onto Leo's typing bubble. It ends centred and large on screen: the bubble is about 380 px, the dots r ≈ 28, and the "Leo is typing…" label about 76 px. "anyone?? · Seen" sits above right. |
| 266 | "Leo is typing…" appears. The VO ends at 266. |
| 270 | The dots pulse on eighths (gap 3.33 r), peaking at 277.5 and 292.5. The third dot never lights. |
| **300 [495]** | **1-frame cut:** the typing bubble is gone. |
| 300-330 | Stillness at the pushed framing: only the slow drift and the grain move. |

### s04-options [525-855]
| f | Beat |
|---|---|
| 0 | Hard cut on the beat. The background is s03's last frame (`<Freeze>`), identical at f0, and it then sinks back 10 % and dims. Card 1 is already rising: it started at −6 on `snap` with a vertical smear. |
| ~18 | Card 1 lands: Receipt icon, "Split apps", "Track who owes what." / "Hold no money." VO "Split" is at 12. |
| 74 → 83 | Chip **✕ "Can’t pay for anything"**: the UI-kit `StatusChip status="declined"` in the Night theme at 3× (via CSS zoom), stamped from 1.5× on `uiPop` (2.9 % settle). It touches 1.0× at 83; VO "score" is at 84. |
| 96-108 | StrikeThrough over "Split apps" (12 f, Night declined, with the chip's icon and word on screen), dimmed to 60 %. |
| 128-152 | Card 2 rises and occludes card 1 (VO "Shared" at 144): UserRound icon, "Shared accounts", "One person holds it all." / "Everyone else just hopes." Card 1 recedes (0.9×, up, dimmed 42 %) and the thread is gone by 158. |
| 198 → 207 | Chip **✕ "One person in charge"** (VO "one" at 208). |
| 220-232 | Strike over "Shared accounts". |
| 280-305 | Both cards are thrown down and off frame on `exit`, just after "money" (270-291). |
| **300 [825]** | The s05 bubble pops in at the centre (`PivotBubble`) as the cards clear, and its dots pulse. The audio breath (VO gap [816-873]) never shows an empty frame. |

### s05-pivot [855-1080]
| f | Beat |
|---|---|
| 0 | The bubble from s04's tail continues exactly: same position, scale 1 and dot pulse. Creep and drift start from zero here. |
| 8 … 152 | The question rises on the voice: "What if the money lived right" (Gabarito 500, ink-muted, 80 px) / "**in the group chat?**" (Gabarito 800, ink, 112 px). "chat" is at 162. |
| 164-224 | **Push into the middle dot**, 1.03 → 6× in log space on `crashOut` (scale 1.13 at 190, 2.0 at 210, 4.0 at 220, 6.0 at 224). The dots settle to still (opacity 1, scale 1) by 190, and the drift fades to 0. |
| 224 [1079] | = **DOT_HANDOFF** (verified below). |

## SFX cue sheet
Volumes are the audio notes' "cue vol" values, which assume `SFX_MASTER` is applied (see Requests).

| Scene f [abs] | Cue | Vol | Note |
|---|---|---|---|
| s01 0 [0] | `buzz` | 0.18 | under the avalanche |
| s01 2 [2], 13 [13] | `notif` | 0.5, 0.42 | 2 of the 8 slams |
| s01 22 [22] | `whoosh-fast` | 0.3 | peaks 3.5 f in, on the snap (25) |
| s01 189 [189] | `whoosh-fast` | 0.22 | the whip out (optional), peaking near the cut |
| s02 33 [228] | `thud` | 0.5 | one thud for the chips, on chip 1's landing |
| s03 104 / 150 / 232 [299 / 345 / 427] | `tick` | 0.16 | the Day 2 / 9 / 23 flips |
| s03 277 [472] | `blips`, first blip only (6 f) | 0.3 | on dot 1's peak |
| s03 292 [487] | `blips`, second blip only (`trimBefore` 9, 6 f) | 0.3 | on dot 2's peak; the third never comes |
| s04 82 [607] | `stamp` | 0.55 | peaks 1 f in, on chip 1's contact (83) |
| s04 219 [744] | `scribble`, first stroke only (11 f) | 0.4 | strike 2 |
| s04 318 [843] | `blips` | 0.22 | the pivot bubble's first pulse, inside the VO breath |
| s05 162 [1017] | `riser`, `trimBefore` 47 | 0.55 | starts on "chat" and ends at 225 = the s06 cut |

**Music:**
- The `JOKE_DIP` in `src/audio/Soundtrack.tsx` (492-525) is fully down at 494/495, which matches the vanish at [495].
- `REVEAL_CLEAR` (1060-1080) matches the push's last 20 f.

## Handoff verification (s05 last frame → s06, `DOT_HANDOFF`)
`out/stills/s05-pivot/key-2-handoff.png` (frame 224, full res) was measured with a threshold plus centroid; pixel index i covers [i, i+1).

| | Expected | Measured |
|---|---|---|
| Dot centres | (680, 540), (960, 540), (1240, 540) | (680.02, 540.00), (960.01, 540.00), (1240.00, 539.98); re-measured after the review-1 fixes |
| Dot radius | 84 | 84.01 by area; bounding box 168 × 168 for each dot |
| Gap | 280 | 280 |
| Dot colour | #bdb2c8 (189, 178, 200) | (189.1, 178.1, 200.0) |
| Bubble | #261c30, x 392-1528, y 300-780 | (38.2, 28.2, 48.3); x 393-1527, y 299-779 (1 px anti-aliasing) |

**How it stays exact:** the bubble and the dots are drawn in screen space from the zoom math (no CSS scale), and the zoom is exactly `PUSH_RATIO` = 6 on the last frame. The pulse and the drift are zero by then.

**The bubble on the last frame** (for s06): `S05_END_BUBBLE` = `{x: 392, y: 300, w: 1136, h: 480, r: 240, tail: 72 (bottom-left corner), color: #261c30, dotColor: #bdb2c8}`. The middle dot centres the bubble.

## Stills and checks
- **Key stills (full res):** `out/stills/{s01-hook,s02s03,s04-options,s05-pivot}/key-*.png`.
- **Checks (half res):** `f*.png` in the same folders, and `out/stills/act1/seams.png` for the s01→s02, s03→s04, s04→s05 and end seams.
- **MP4s (0.5 scale):** `out/scenes/s01-hook.mp4`, `s02s03-front-chase.mp4`, `s04-options.mp4`, `s05-pivot.mp4`, `act1.mp4`.
- **Contact sheets:** `contact.png` is the brief's command (6 fps × 30 tiles, so it truncates scenes longer than 5 s). `contact-full.png` spreads the 30 tiles over the whole scene.

## Deviations and choices
- **Banners.** There are 9 banners: the 6 storyboard messages plus 3 extra.
  - "flights booked! ✈️" (Maya) is already settled at frame 0.
  - "LISBON!! 🇵🇹" (Leo) and "😅" (Leo) ride the first and last slams.
  - Without the extras, frame 0 would show a single banner. The wall's filler messages are invented, in the same voice.
- **Maya's outgoing bubbles** use `night.surfaceSunken`, not the app's `brandSoft` (#4a3a22, a marigold tint): Act 1 has no marigold.
- **The breath** (review 1, P1-7) is kept in the audio (the VO gap [816-873]) but is never an empty frame. The cards leave 280-305 and the s05 bubble pops in at s04 f300 [825].
- **The day stamp** is one pill that flips, on the left middle of the frame. It doesn't move with the camera, because at the top it collided with the s02 block as the camera moved down.
- **The thread column** spans world x −220 to 380 (phone-like). That lets the joke push centre Leo's typing bubble with "anyone??" still in frame.
- **Review 1 fixes:**
  - P1-6, the joke: staged big and central.
  - P1-7, the breath: no empty frame.
  - P2s: the s01 → s02 whip overlap, a 33 f hold of the s01 line, and the counter cleared before "weeks".
  - The grain is now 0.28; the director set it.
- **"weeks"** gets a brief dim and lands alone (the counter has left the top). "Sam, the $412?" therefore lands just after it (f204, on "everyone"), not on "chasing".
- **s04 opens on s03's frozen last frame**, so the hard cut on the beat changes only the rising card.

## Requests for the director
1. **Registry:** swap the 4 Act 1 placeholders for these components. The exports are in `index.ts`.
2. **`SFX_MASTER`** (`src/audio/Soundtrack.tsx`) is not multiplied into `<Sfx>` yet (`src/motion/Sfx.tsx`). My cue volumes assume it will be; without it, every Act 1 cue is about 12 dB hot.
3. **s06:** `S05_END_BUBBLE` lives in `src/scenes/act1`. It could move to `shared/handoffs.ts` next to `DOT_HANDOFF`.
4. **Grain:** the s05 last frame carries the Night grain over the dots; s06 (marigold) won't. The texture change hides under the dot turning marigold and the flood.
