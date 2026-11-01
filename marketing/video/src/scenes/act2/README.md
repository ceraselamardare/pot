# Act 2: the reveal (builder B)

**s06-reveal** is 360 f (0:18 to 0:24). Frame 0 sits on a bar line. VO starts at f45: "Meet Pot. … Group chat money that follows its own rules."

The chat's typing dots become Pot's logo on a marigold flood. The scene ends on the marigold contracting into Maya's phone screen.

## Files and exports (`index.ts`)

| Export | What |
|---|---|
| `S06Reveal` (props optional: `bubble`) | The scene. Mount it for `S06_REVEAL_SCENES` (`["s06-reveal"]`). Length comes from `scene("s06-reveal").duration`. |
| `MarigoldToPhone` (`start`, `duration` = 30, `ease` = `inOut`, `progress`, `rect` = PHONE_HANDOFF, `color`, `ground`) | Accent transition 2, reusable. A full-frame marigold layer contracts with `clip-path: inset(… round r)` to the phone screen rect and reveals cream around it. Children ride on the marigold and are clipped with it. Pass `progress` to drive it across a cut. Also exports `phoneInset(p, rect)`, `rectInsets()` and `MARIGOLD_TO_PHONE_FRAMES`. |
| `LockupSvg` (`x`, `y`, `height`, `on`, `dots`, `wordmarkReveal`, `parts`) | The lockup as SVG elements, built from the brand's own `PotMark` + `Wordmark` with the exact geometry of `pot-lockup-on-*.svg`. It is pixel-identical to the brand file (diff max 0). Use it instead of `<Lockup>` until that is fixed (see Problems below). |
| `RevealHandoffNight` | s05's last frame: Night ground, `S05_END_BUBBLE`, the three ink-muted dots and the Night finish. |
| `S06_KEYS`, `s06Pose(f)`, `S06_LOCKUP_HEIGHT` (400) | The key frames, the camera, and the resting lockup height (≈ 277 px of visible ink). |

**Preview:**
- `npx remotion studio src/scenes/act2/preview/index.ts`
- Compositions: `S06-Reveal` (360 f) and `S06-HandoffRef` (s05's expected last frame).

## Key frames (scene-local; VO words from `src/data/vo/s06-reveal.json`)

| f | Beat |
|---|---|
| 0 | DOT_HANDOFF plus `S05_END_BUBBLE` on Night. The **middle dot turns marigold** (the film's first marigold) and is the flood's r0 (84). `impact`. |
| 0-15 | The flood: a circle from (960, 540) to the corners on `snap`. |
| 2-20 | The eggplant iris (from r 0, centred on the middle dot) reveals the glyph **body** at GLYPH_MATCH_SCALE. The dots re-emerge as marigold holes: the middle one at f3, the outer ones at f4-5. |
| 5-13 | **The glyph's holes sit exactly on the handoff dots** (camera static). At f8-13 the body nearly fills the frame. |
| 14-50 | Camera pull-back in log space on `land`: from 4.667 to 0.781 px per unit, with the middle dot gliding from (960, 540) to (960, 442.6). |
| 18 → 35 | The lid falls from off-frame on the **`lid` spring {120, 14}**, the one visible spring. It starts tilted −9°. It seats at f35 and dips 7.3 % (≈ 10 px) at f40, then settles. |
| 22, 25 | The handles step out from inside the body, 3 f apart (10 f on `snap`; no fades). |
| 35 | Eggplant hero burst (`day.onBrand`, ×1.25, 30 f), launched just outside the glyph. `burst` at f34, `sparkle` at f36. |
| 48-58 / 48-66 | "Meet" is at f48. **"pot" wipes on in 10 f**, fully on 10 f before "Pot" (f68). Meanwhile the glyph slides to its lockup place (the lockup opens) over 18 f on `land`. |
| 66-309+ | The hold breathes (review-1): a 2 % log-linear push plus the film's hand-held drift (`driftAt`, ≈ 6 px, translation only, eased in over 40 f). Both are folded into the logo's vector geometry and applied as a transform on the tagline. Measured: the lockup grows 922 → 941 px wide from f70 to f300 and drifts up to ≈ 5 px, and consecutive frames differ throughout. |
| 98 | GlyphParts hands over to `LockupSvg on="marigold"`. The lid's residual at that point is 0.008 px, and the diff is no bigger than between any two creep frames. |
| 113-243 | The tagline rises on the voice: WordRise, Gabarito 700, 64 px, eggplant, landing 0-4 f before each word. The words are at f123, 137, 152, 171, 185, 203, 218 and 233. The full line is held until f305 (≥ 1 s). |
| 305 | Words leave one every 2 f (7 f each), gone by f326. |
| 309 | The lockup is thrown up and out (760 px on `exit`, smear σ = 0.5 × speed, **no fade**), out of frame by f327. |
| 329-359 | `MarigoldToPhone`: 30 f on `inOut`. `whoosh-long` at f332 (it peaks with the contraction's speed at f344). |
| 359 | **The marigold rect on cream, nothing else** (= s07 frame 0). |

**SFX** (4 cues, sparse):
- `impact` 0.9 @0;
- `burst` 0.5 @34;
- `sparkle` 0.3 @36;
- `whoosh-long` 0.28 @332.

## Handoff verification

All measured on full-resolution PNGs with sub-pixel edge fits. The probe scripts are not in the repo.

**s05 → s06 (frame 0):**
- **Dots:**
  - The middle one is marigold, at x 876.00-1044.00 and y 456.0-624.0.
  - The outer ones are ink-muted, at x 596.0-764.0 and 1156.0-1324.0.
- **Builder A's real last frame** (`A1-S05Pivot` f224, `out/stills/s06-reveal/ref-s05-last.png`) against s06 f0:
  - The dots match within 0.1 px.
  - The bubble corner radius fits are TL/TR/BR/BL = 237/238.5/239/74.5 for A and 238.5/238/239/72.5 for s06. Both are 240/72 within the grain noise.
  - A grain-suppressed whole-frame diff averages 1.2 levels, apart from the middle dot.
  - The only intended changes are the middle dot's colour and the grain's noise frame. The Night finish matches A: vignette 0.08, grain 0.28.
- **Glyph dots on the handoff dots:**
  - At f8 and f12 the holes are at x 596.00-764.00, 876.00-1044.00 and 1156.00-1324.00, y 456.00-624.00 (0.01 px).
  - The edges are crisp (0 → 1 within one pixel).

**s06 → s07 (last frame, f359):**
- The marigold rect is x 369.40-790.60 and y 84.24-995.76. That is centre (580.00, 540.00) and size 421.20 × 911.52.
- The corner radius fits are 59.3-59.6, against the expected 59.4.
- Pixels that are neither cream nor marigold (or their anti-aliased mix): 0.
- Against builder C's `S07Create` f0: the marigold rect is identical, the cream is identical (max diff 0), and the phone body appears around the screen in one frame, as the contract says.
- See `seam-s06-last-vs-s07-f0.png`.

**All 360 frames** were scanned for off-palette pixels (saturated blue or green, raw greys): none found.

## Notes and problems found (for the director)

1. **`<Lockup>` in `src/brand/Logo.tsx` cut off the "t"** (fixed by the director after review-1; `LockupSvg` is kept because it paints inside the SVG canvas, and it is pixel-identical to the brand file either way).
   - Its `wordmarkReveal` clip rect is `x 560, width 662` (to 1222 units), but the wordmark's "t" crossbar reaches 1253.2 units. So even at reveal = 1, it drops about 31 units of the crossbar's right arm. That is about 12 px at 200 px tall.
   - Proof: `out/stills/s13-end/brand-vs-lockup.png` (the brand file on top, `<Lockup>` below), and composition `BrandDiff` in the act5 preview. Against the brand file at 512 px, `<Lockup>` differs on 4,315 px and `LockupSvg` on 0.
   - **One-line fix:** `const clipW = (1265 - 560) * Math.max(0, Math.min(1, wordmarkReveal));`.
   - Every other scene that uses `<Lockup>` is affected.
2. **The overlay-blended `Grain` can drop its blend.** On frames where a clip-path layer above it crosses the frame edges (here f5-6 of the flood), Chrome's compositor drops the blend and shows raw grey grain. In the MP4 (JPEG frames) it came out bright blue. `isolation: "isolate"` on the Night layer that holds the grain fixes it (done here). Night scenes with clip-path transitions over grain should do the same.
3. **The SVG logo is positioned inside a full-frame `<svg>` with an SVG `translate`,** never with CSS left/top or a CSS transform:
   - layout snaps fractional px (the holes landed 0.33 px off);
   - a CSS transform under an ancestor clip-path is resampled (soft edges).
4. **GlyphParts:** a hidden lid parked far above the glyph widens the masked group's bounds. Chrome then rasterizes the dot holes about 0.5 px softer, so the hidden lid is kept on its seat until it falls.
5. **The iris starts at r 0.** An iris edge that coincides with a hole's edge leaves a hairline ring.
