# Motion kit (`src/motion`)

The film's shared motion vocabulary: curves, springs, camera, kinetic type, money, transitions,
effects, the typing-dots motif and SFX cues. Everything is frame-driven (`useCurrentFrame`),
deterministic (`random(seed)` / `noise2D`) and token-coloured. Recipes follow
`brief/research-hypermotion.md` (binding) and `brand/README.md` §3, §8.

```ts
import { WordRise, HighlightBar, MoneyRoll, useCamera, Stage3D, Camera, Layer, BreakOut, hyper, Burst, Sfx, land, beats } from "../motion";
```

- **Preview harness** (does not touch the main Root): `npx remotion studio src/motion/preview/index.ts`.
  Compositions: `MK-Showcase`, `MK-Kinetic`, `MK-Money`, `MK-Transitions`, `MK-Camera`, `MK-Effects`, `MK-InScene`.
- **Stills:** `npx remotion still src/motion/preview/index.ts MK-Camera out/stills/motion/x.png --frame=80 --scale=0.5`.
- **Main Root:** `MotionKit/MotionKitShowcase` (824 f, about 13.7 s).
- All numbers below are frames at 60 fps (1 beat = 30 f, an eighth = 15 f) and px at 1920 × 1080.

---

## 0. The ten rules in code (research §1)

| Rule | Kit default |
|---|---|
| Fast heads, long tails; median move 20 f | `land` / `snap` / `punch` / `whip` curves; entries 18-24 f |
| One object across every seam | `flood({x, y, r0})` from the dot; `TypingDots` / `typingDots()` one geometry |
| One primary transition + 2-3 accents | `whipPan` (cut whip), `flood`, `scaleCut`, `zoomThrough`; the others are accents |
| Camera never freezes, dwells on heroes | `useCamera` drift (8 px, ±0.4°) + `creep` (4-8 % push per scene) |
| Overshoot is rare | springs `uiPop` 5.8 %, `breakout` 1.2 %, `camera` 0 %; `lid` 7.3 % is THE visible spring |
| Words arrive by moving, on the voice | `WordRise` (rise 48 px + smear 16 → 0, `land`, 20 f), `voLanding()` |
| One blur grammar: directional smear | `DirectionalBlur` (SVG `stdDeviation="X 0"`), `smearSigma` = 0.5 × displacement |
| Phrase-level sound | `<Sfx>` cues; whooshes start 6-8 f before peak speed, transients on the frame or 1 f early |
| Frame 0 already moves | start entries at 0, camera snaps on f1-2 |
| Brand fidelity beats effects | token colours only; vignette ≤ 10 %; no light leaks; grain Night only |

---

## 1. Time and rhythm (`time.ts`, `rhythm.ts`)

| Export | Meaning |
|---|---|
| `FPS` 60, `BPM` 120, `FRAMES_PER_BEAT` 30 | the grid |
| `sec(s, fps?)`, `beats(n, fps?)`, `bars(n, fps?)`, `eighths(n, fps?)` | units to frames. Each takes an optional fps for a 240 fps master |
| `beatPulse(frame, {every, offset, decay})` | 1 → 0 pulse on each beat, for a 1-2 % bump on the kick |
| `snapToBeat(frame, subdivision)`, `beatFloor`, `beatPhase` | snap cues to the grid |

## 2. Curves, springs, keyframes (`easing.ts`)

**Research curves** (exact beziers, §3.1). Use these names:

| Name | Bezier | Frames | Use |
|---|---|---|---|
| `land` | .22,.78,.51,.94 | 24 (12-42) | default entry; 70 % of travel in the first third |
| `snap` | .14,1.06,.31,.94 | 22; logo 36-60 | hero entries, the flood |
| `punch` | .22,1,.36,1 | 18 | punchline words |
| `whip` | .38,.95,.72,1 | 14-16 | whip arrivals |
| `exit` | .29,0,.63,.04 | 16-26 | thrown off-frame |
| `crashOut` | .44,0,.73,0 | 34 | into a cut at full speed |
| `inOut` / `speedRamp` | .76,0,.24,1 / .87,0,.13,1 | 24-36 / 20-30 | reframes / the "hyper" camera move |
| `softInOut` | .34,.07,.66,.93 | 18 | blur, opacity, colour |
| `popOver` | .30,.15,.30,1.39 | 30 | the rare overshoot (peaks 1.08) |

- **Inside app replicas,** use the product's tokens (ux-spec §7.6): `uiEase.standard / enter / exit` and
  `UI_FRAMES = {fast 7, base 12, moderate 17, slow 22, count 30, celebrate 36, loop 72, minChecking 72}`.
- **Aliases** stay for older call sites: `expoInOut` = `speedRamp`, `quintOut` = `punch`, `expoOut` ≈ `snap`, plus `expoIn`, `quintInOut`, `cubicOut`, `sineInOut`, `snappyOut`, `backOut`, `backOutSoft`, `anticipate`, `linear`.

**Springs** (`springs`, `springAt(frame, at, name)`), measured at 60 fps:

| Name | Config | Overshoot / settle | Use |
|---|---|---|---|
| `uiPop` | {500, 30} | 5.8 % / 19 f | chips, checks, UI pops (= the product's spring-pop) |
| `breakout` | {150, 20} | 1.2 % / 36 f | breakouts, magic moves |
| `camera` | {120, 30, m 1.2} | 0 / 45 f | camera keys |
| `lid` | {120, 14} | 7.3 % / 48 f | **the one visible spring: the logo lid** |
| `slam` | {260, 12, m .6} | 17.8 % / 33 f | a word slam, **at most once per act** |
| `snappy` / `smooth` / `heavy` | {20,200} / {200} / {15,80,m2} | 4 % / 0 / 10 % | neutral helpers |
| `pop` / `sticker` / `bouncy` | — | 14 % / 25 % / 25 % | **sticker moments only** (too bouncy for words and UI) |

**Helpers**
- `ramp(frame, start, end, ease)` gives a clamped, eased 0..1. `span(frame, at, dur, ease)` does the same from a start and a duration.
- `interp`, `mix`, `lerp`, `logLerp` (for scales), `clamp01`.
- `stagger(i, each, start)`, plus `unevenStagger(i, {start, min: 2, max: 6, seed})` for siblings 2-6 f apart with uneven gaps (§3.3).
- `pulse`, and `velocity(fn, frame)` (px per frame of any frame → value function).
- `kf(frame, [{at, v, ease?}], defaultEase = inOut, log?)` is a keyframed number. The `ease` on a key shapes the segment that **arrives** at it.
- `kfPose(frame, keys, defaults, ease, logProps)` keyframes a pose object. Each key is a full pose: props a key omits carry over from the previous key.

## 3. Camera rig (`camera.tsx`)

```tsx
const cam = useCamera(
  [{ at: 0, scale: 1 }, ...pushKeys(96, 30, { cx: 0, cy: -150 }), { at: 190, scale: 1, cx: 0, cy: 0 }],
  { creep: { start: 0, end: 240, amount: 0.05 } },          // the 4-8 % scene push
);
<Stage3D perspective={HELD_ENTRY.perspective}>             // 2600 = "photographed" phone
  <Camera pose={cam}>
    <Layer {...heldEntryPose(frame, 2)}>
      <Slab width={390} height={844} radius={56}><Phone hideApprovedCard={breakoutLifted(frame, 70, 170)} /></Slab>
      <BreakOut at={70} returnAt={170} from={{ y: -98 }} face={heldEntryPose(frame, 2)}><ApprovedCard /></BreakOut>
    </Layer>
  </Camera>
</Stage3D>
```

**Camera pose** `{x, y, z, scale, rotX, rotY, rotZ, cx, cy}`:
- `cx`/`cy` is the world point (px from the stage centre) that lands on screen centre.
- `x`/`y` is a screen offset.
- `scale` is the zoom.
- `rot*` are degrees, pivoting on the look-at point.

**Interpolation follows §3.6:**
- Zoom runs in **log space**.
- The look-at point is **pre-multiplied by the scale** (`L = Lb − (1−t)·(sa/s)·(Lb−La)`), so the target glides on a straight screen path into a push.

| Export | Defaults / notes |
|---|---|
| `useCamera(keys, {drift, creep, ease, rest})` / `cameraAt(frame, …)` | drift on (`noise2D` × 8 px, ±0.4° roll, ±0.3° tilt, 0.25 cycles/s); `drift: false` to lock off |
| `pushRatio(frames)` | 1.25× (≤ 12 f), 1.4× (≤ 36 f), 1.5× (≤ 90 f), 2.4× (longer drifts) |
| `pushKeys(at, frames, {from, ratio, ease = inOut, cx, cy})` | keys to splice into `useCamera` |
| `revealSnapKeys(at, fromScale, {ratio = 0.6, tail = 24, settle = 0.96})` | a 1-frame scale jump (0.56-0.77) then a `land` tail (18-36 f) |
| `Stage3D({perspective = 2400, origin})` | perspective container (overflow hidden) |
| `Camera({pose})` | the world (preserve-3d) |
| `Layer({x,y,z,scale,rotX,rotY,rotZ, keys, raster, center})` | full-stage 3D plane; `raster` supersamples crisp text when magnified (CSS zoom × k, transform ÷ k) |
| `HELD_ENTRY`, `heldEntryPose(frame, at)` | yaw −54° / pitch 29° / roll 11° → −9° / 24° / 2°, scale 0.79 → 0.95, **held** poses at f 2, 4, 6, 12, 18, 24; perspective 2600 |
| `Slab({width, height, radius, depth = 110, step = 4, colors})` | real phone thickness: stacked rounded layers in Night tokens; visible side ≈ depth·sin(yaw), so ~90 px at −54° and ~17 px at −9° |
| `ContactShadow({width, height, opacity = 0.22})` | eggplant radial contact shadow (put it in a `Layer z={-depth}`) |
| `BreakOut({at, returnAt, from, to, face, raster})` | a sibling twin lifts on the `breakout` spring to z 240, scale 1.6, faces the lens (`face` = the camera/phone pose); token shadow grows; returns on `exit` over 20 f; supersampled ×(scale·1.4) by default |
| `breakoutLifted(frame, at, returnAt)` | hide the in-screen original while the twin is lifted |
| `Parallax({pose, factor})` | 2D parallax for backgrounds (research ratio 2-2.4× between layers) |
| `useDrift(opts)` | drift as a CSS transform string for single elements |

> **3D gotcha (research §5, MDN):** these flatten `preserve-3d`: `opacity < 1`, `filter`, `clip-path`, `mask`, `mix-blend-mode`, `isolation`, and `overflow` other than visible.
> - Keep them on **leaf** elements (screen content, a card's inner box), never on `Camera` / `Layer` / `Slab` or anything between them. The kit's own 3D components respect this.
> - The clipped phone screen can't hold 3D children, so **breakout cards are sibling layers of the phone**, not children of its screen.
> - Don't put a large `box-shadow` blur on a 3D-transformed wrapper: Chrome clips it to a hard rectangle. `depthShadow()` caps the blur at 70 px and `BreakOut` draws it on a leaf plate.

## 4. Kinetic type (`text/KineticText.tsx`, `text/marks.tsx`, `text/fit.tsx`)

All of these take `text` + `start` + `stagger`, **or** VO-timed `words: {text, startFrame, breakBefore?}[]`.
- Join a phrase with U+00A0 (`"money problem"`) to animate it as one unit.
- `renderWord(text, i)` wraps single words, for example in a `HighlightBar`.
- Look props: `fontSize` (default 140), `color` (a token, never marigold), `fontWeight` 800, `letterSpacing` −0.025em, `lineHeight` 1, `align`, `maxWidth`.

| Component | Defaults | Use |
|---|---|---|
| `WordRise` | rise 48 px, smear 16 → 0, `land`, 20 f, opacity 0.2 → 1 over 10 f, stagger 6 f; `thesis=[i]` makes word i arrive from 1.6× instead; `exit` 2 f stagger, 7 f each, `exit` ease | **the house entry**: whole words rise into fixed slots |
| `ScalePunch` | from 1.6× (`fromScale`), `punch` 18 f, smear 16 → 0, stagger 8; `spring="slam"` once per act; `mode="single"` = one word at a time | the thesis word ("weeks.") and VO captions |
| `MaskReveal` | words through overflow masks, `punch` 20 f, stagger 4 | accent |
| `LetterCascade` | per-letter (grapheme-safe) rise + 8° tilt, `land` 24 f, 1.5 f stagger, transforms only | accent |
| `Typewriter` | string slicing; bursts of 14-30 chars/s, 12-20 f pause after a space, **solid** caret (`framesPerChar` for uniform speed) | **only inside the product's own fields** (pot name, chat composer) |
| `HighlightBar` | marigold block wipes left → right in 11 f on `land`; text over it turns eggplant (no AA halo); `color={day.member4}` for Act 1 (no marigold before s06) | one device per line, once the line is readable |
| `StrikeThrough` | 12 f on `land`, centre tilt −2°, colour = `currentColor`; `tone="declined"` only with an icon + word on screen; `dimTo` | s04 cards |
| `useFitText({text, maxWidth, maxFontSize, …})`, `FitText`, `useTextWidth` | multi-line aware; waits for fonts (`useFontsReady`) so `measureText` never caches the fallback font | huge words that must not overflow 1920 |
| `wordsFromSeconds(words, fps, offset, lead = 10)`, `voLanding(spokenFrame)` | entry starts 10 f before the spoken frame, so the word lands 0-4 f early | VO sync |
| `typingSchedule`, `typedCount`, `typedEnd`, `Caret` | typing timing helpers | — |

## 5. Money (`numbers.tsx`)

| Export | Defaults |
|---|---|
| `formatMoney(v, {decimals = 2, sign = "auto"/"always"/"never"})` | `$450.00`, `−$84.00` (U+2212), `+$150.00` |
| `MoneyRoll({steps \| from/to/at, mode, fontSize, color})` | `mode="tick"` (default, research §3.5): about 20 values with decaying steps (`punch`) over 42 f. A changed digit swaps crisply and settles from a 0.16 em nudge with a light smear. Never overshoots, lands exactly. Columns that appear or vanish collapse (450 → 66 stays tight). Tabular figures |
| `MoneyRoll mode="roll"` | each changed digit spins to its new digit, trend-consistent, 34 f, 3 f column stagger (slot-machine accent) |
| `MoneyRoll mode="count"` | mechanical odometer with carries (fast columns flicker sharp digits) |
| `CountUp({from, to, at, duration = 30})` | plain eased text count (the product's 500 ms count) |

Research timings: `$1,236.00` ≈ 20 steps in 42 f; balances land, then hold 0.5-1.2 s; refund rows 3-4 f apart.

## 6. Transitions (`transitions/*`)

Easing lives **inside** each presentation, so always drive them with **linear** timing: `T(frames)`, or spread `hyper.*`:

```tsx
<TransitionSeries.Transition {...hyper.whipPan({ direction: "left", bleed: [night.ground, day.ground] })} />
<TransitionSeries.Transition {...hyper.flood({ x: 960, y: 540, r0: 84 })} />
```

| Presentation | Default frames | What it does |
|---|---|---|
| `whipPan({direction, bleed, outFrames = 6, travel = 0.3})` | 22 | **Blur-matched cut whip.** A accelerates out on `exit` while its smear ramps over its last 6 f, then a hard cut at peak speed. B continues the vector from 0.3 W, starts at least as blurred, and clears on `whip` in ~16 f. Only one shot is ever visible, so there is no seam. **Pass `bleed` (the two scene grounds)**: it fills revealed areas and blur fringes. Without it the whip is blur-only (no travel) |
| `flood({x, y, r0, ease = snap})` | 15 | The research's off-centre circle: the next scene grows from an object (the dot, a button) to the corners |
| `zoomThrough({origin, outFrames = 18, rate = 1.47, enterFrom = 1.8})` | 40 | A zooms ×1.47 every 4 f toward a feature (log-constant), then a cut. B starts at 1.8× and settles on `land`. `mode: "portal"` makes B grow out of the target instead |
| `scaleCut({ratio = 1.8, origin})` | 24 | One-frame scale cut: B arrives `ratio`× tight (1.4-3.7) and settles on `land` |
| `circleIris({origin, r0, ring, exitScale, exitDim})` | 18 | `flood` plus an optional token ring and a sinking outgoing scene |
| `colorFlood({colors, shape: wipe/circle, direction, hold})` | 36 | Token bands cover, hold, then uncover (accent) |
| `slideStack({direction = "up"})` | 24 | A card rises over the old scene, which sinks back and dims (accent; the s04 occlusion) |
| `maskWipe({direction, angle = 14, edgeColor})` | 20 | Angled hard wipe with a token line on the edge (accent; no marigold in Act 1) |
| `whipSlide({direction, bleed})` | 18 | Both shots adjacent ("one world" moves); the seam softens while smeared (accent) |
| `blurDissolve()` | 20 | Research calls crossfades cheap: the end card at most |
| `pushCutToken(props)` / `hyper.pushCut` | 20 | Remotion's `pushCut` with its off-token `#f5f2ed` flash zeroed |

**In-scene wrappers** (same presentations, no `TransitionSeries`):
- `<Swap at duration presentation from to />`. `to` gets its own clock from `at`, premounted.
- `<Enter at duration presentation>…</Enter>`.
- Inside a box, pass `size: {width, height}` in the presentation props.

`TRANSITION_FRAMES`, `HyperTransition`, the `dirVec` / `halfPlanePolygon` geometry helpers.

## 7. Effects (`effects/*`)

| Export | Defaults | Notes |
|---|---|---|
| `DirectionalBlur({x, y, inline, region})` | σ in px; skipped below 0.25 | SVG per-axis Gaussian; the DOM never changes, so children never remount |
| `FakeMotionBlur({vx, vy \| track, k = 0.5, max = 96, mode: "blur"/"ghost", ghosts = 3})` | σ = k × displacement per frame; ghosts at 0.22 / 0.12 / 0.06 where the element was 1-3 f ago | ghost mode duplicates children: no `<Sfx>` inside |
| `smearSigma(px, k, max)`, `smearDecay(frame, at, peak, 0.7)`, `GHOSTS` | peak on the first frame, ×0.7 per frame, gone in 6-8 f | §3.8 |
| `HeroMotionBlur({samples = 6, shutterAngle = 180})`, `HeroTrail({layers = 5, lagInFrames = 1, trailOpacity = 0.6})` | `@remotion/motion-blur` | **N× the subtree's render cost.** Hero moments only, wrapped around small subtrees |
| `Grain({opacity = 0.35, size = 2, refresh = 2, width, height})` | monochrome, seeded per frame, overlay | ≈ 2 % luminance std on the Night ground (0.5 ≈ 3 %). **Night only** |
| `Vignette({strength = 0.08, theme})` | clamped to **≤ 0.1** | eggplant (Day) / black (Night token shadows) |
| `Glow({color, radius, strength})` + `haloAt(frame, at, 18)` | drop-shadow halo | research: only as a **0.3 s event**, never at rest |
| `Burst({at, variant: "ui"/"hero", scale, rim, r0, color, ring, streak})` | `ui` = brand §8 (12 × 6-8 px, 40-72 px, 36 f, ease-out, scale + fade to 0). `hero` = s09 spec (12 × 12-16 px, 30° ± seeded 8°, 120-220 px + 200 px Z on `land`, fading from 40 %) | **Only for "Approved by Pot rules" and the logo reveal**, never for group approvals. `rim` = 1 px brand-deep on cream; `color={day.onBrand}` on marigold; `r0` launches from a glyph's edge |
| `StickerPop({at, rotate = −4, fromScale = 1.3, ease = snap, duration = 22, spring?})` | 1.3 → 1.0 on `snap`, landing token shadow | at most one sticker per scene; `spring="sticker"` for the 1-2 playful moments |
| `ShapePop` | from 0 on `uiPop` | chips, checks, avatars |
| `Stamp` | from 1.5× on `uiPop` (3-5 % settle), tilt −6 → −3° | s04 declined chips (+ `<Sfx name="stamp">`) |
| `Shake({hits})`, `useShake`, `shakeAt` | 10 px, 0.6°, 18 f, decaying noise | rare impacts |
| `FlashFrame({at, intensity = 0.12, duration = 8, color})` | — | research: white flashes read cheap; s06 hit at most, or a token colour |
| `pressAt(frame, at)`, `TouchDot({at, x, y})` | dip to 0.97 + marigold → brand-deep over 5 f, release over 11 f; eggplant touch dot at 18 % | replaces `TapRipple` (§6) |
| `Orbs({colors, opacity = 0.15})` | radial gradients wandering with noise (nearly free) | storyboard's member-colour glows. The research suggests dropping them; the director decides |
| `depthShadow(lift, theme)`, `alpha(hex, a)`, `blend(a, b, t)` | token-only colour helpers | `blend` mixes two tokens (allowed for gradients) |

## 8. The dots (`dots.tsx`)

- `typingDots(frame, {mode: "pulse"/"bounce"/"still", grid: "brand"/"eighths", start})` returns 3 `DotState`s. They plug straight into the Logo's `dots` prop.
  - `pulse` is the brand loader: 0.35 → 1, 72 f loop, 9 f stagger.
  - `grid: "eighths"` puts each dot on an eighth note (15 f stagger, 60 f loop).
- `<TypingDots r color mode grid />` draws the same dots with the brand geometry (centre gap = **3.33 r** = `DOT_GAP_R`), for chat bubbles and the rules loader.
- Use the dots everywhere they appear: "Leo is typing…", the s05 bubble, the logo's holes, "Checking Pot rules…", the end card.

## 9. Sound cues (`Sfx.tsx`)

```tsx
<Sfx name="pop" at={beats(2)} volume={0.6} />          // = <Sequence from={at} premountFor={30}><Audio src={staticFile(SFX.pop)} /></Sequence>
```

- It checks `getStaticFiles()` (the `public/` listing baked into every Studio session and render bundle). When the file is missing it **renders nothing**, so cues can be placed now and start sounding once the audio agent adds `public/audio/sfx/*.mp3`. No flag needed.
- Other props: `durationInFrames`, `playbackRate`, `trimBefore`, and `volume` (a number or `f => number`).
- `sfxAvailable(name)` and `publicFiles()` are exported.
- Research sync: transients land on the event frame or 1 f early. Start a whoosh 6-8 f before peak speed. A riser ends dead on the hit.

---

## 10. Render cost (measured on this Mac, Remotion 4.0.537)

**Use the GPU:** `--gl=angle` is about 10× faster here. The research also recommends it.

| Showcase (824 f) | Default GL (software) | `--gl=angle` |
|---|---|---|
| 1920 × 1080 | 139 s (5.9 fps) | **13.2 s (62 fps)** |
| `--scale=0.5` | 31 s (27 fps) | 8.6 s (96 fps) |

Set it once with `Config.setChromiumOpenGlRenderer("angle")` in `remotion.config.ts` (director-owned), or pass `--gl=angle`. Spot-checked frames from both renderers match: text, 3D phone, grain and smears.

Single-tab costs per 1080p frame (`renderStill`, PNG, default GL; the baseline is a simple Day card at ≈ 0.33 s):

| Item | Extra cost | Advice |
|---|---|---|
| `Grain` (full frame, overlay) | +120-195 ms | Night only; `blend="normal"` saves ~40 ms |
| `Slab` thickness layers | ~10 ms per layer (28 by default) | negligible with ANGLE; `step` 5-6 when the phone is small |
| Full-frame directional smear (whips) | +150 ms on smeared frames | only during the 6-16 f of the move |
| `HeroMotionBlur` | × samples (6) for the wrapped subtree | wrap small subtrees, hero moments only |
| `BreakOut` raster supersampling | more pixels while lifted | `raster={1}` if the card stays small |
| Everything else (transforms, clip-path, gradients, springs, word smears) | small | the default toolkit |

## 11. Research adoption (brief/research-hypermotion.md)

- Curves §3.1: all ten added with exact beziers. The old names stay as aliases.
- Springs §3.2: `uiPop`, `breakout`, `camera`, `lid`, `slam` added. `pop` / `sticker` / `bouncy` are marked "sticker moments only".
- Camera §3.6:
  - log-space zoom with a pre-multiplied look-at;
  - `pushRatio` / `pushKeys`;
  - `revealSnapKeys`;
  - drift ×8 px / ±0.4° plus `creep`;
  - the held-pose entry (`heldEntryPose`, perspective 2600);
  - `Slab` side thickness and `ContactShadow`;
  - `BreakOut` as a sibling twin on `{150, 20}`, returning on `exit` over 20 f.
- Smear §3.8: SVG `stdDeviation="X 0"`, σ = 0.5-1 × displacement, capped; `smearDecay` ×0.7; ghosts at 0.22 / 0.12 / 0.06.
- Kinetic type §3.4:
  - `WordRise`: rise 32-76 px, smear 16 → 0, 18-24 f on `land` / `punch`, no bounce, fixed slots;
  - the thesis word from 1.4-1.9×;
  - VO lead;
  - exits 2 f × 7 f;
  - highlights in 11 f.
- Numbers §3.5: `tick` mode, about 20 decaying values in 42 f; never overshoots, lands exactly.
- Transitions §3.7:
  - `flood` (the §5 code, with an internal ease), the blur-matched `whipPan` and `scaleCut`;
  - `pushCutToken` zeroes the off-token flash;
  - no light leaks (none in the kit).
- Finish §3.8: grain ≈ 2-3 % monochrome (Night only), vignette clamped to ≤ 10 %, glow only as a 0.3 s halo.
- 3D gotcha §5: documented above; the kit's components keep flattening properties on leaves, and breakouts are siblings.
