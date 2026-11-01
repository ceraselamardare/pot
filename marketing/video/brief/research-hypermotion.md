# Hypermotion research: recipes for the Pot demo video

Owner: the motion-design researcher. 2026-10-22. Readers: the director (storyboard) and the engineers (`src/motion`, scenes).

**Conventions:** frames at 60 fps (120 BPM: beat 30 f, eighth 15 f, bar 120 f); px at 1920 × 1080. Numbers come from the linked sources; **[local]** = checked in our `node_modules` (Remotion 4.0.537) or measured here; **[unverified]** = inferred. The hardest data is motionmaxxing's measurements (4,288 moves in 50 pro moments, @30, doubled here). I could not play videos; references are described from their pages.

## 1. TL;DR: ten rules
1. **Momentum, not maximum motion:** fast heads, long tails, cuts at peak velocity. Median move 20 f; entries 24 f; opacity 12 f.
2. **Carry one object across every seam (the dots):** cut on motion with a matched object, or let an effect become the next ground. No crossfades or white flashes.
3. **One primary transition plus 2-3 accents.**
4. **The camera never freezes, but it dwells** 1.5-2.5 s on hero moments; reveals are one-frame snaps plus a tail.
5. **Overshoot is rare:** under 10 % of moves, one visible spring, never on numbers.
6. **Words arrive by moving, on the voice:** whole words rising out of blur into fixed slots. Never typed headlines.
7. **One blur grammar, directional smear**, gone in 6-8 f. No camera blur everywhere, glows or light leaks.
8. **Phrase-level sound:** 3-5 SFX kinds, 1-3 hits per act, music ducked 8-10 dB; −14 LUFS / −1 dBTP.
9. **Hook within 3 s, product early, muted-first;** frame 0 already moves.
10. **Brand fidelity beats effects:** tokens, flat fills, token shadows; the 3D phone must look photographed, not templated.

## 2. What hypermotion is
- **In ads**, "hyper motion" names a product-only highlight with aggressive camera moves, speed ramps and hard cuts ([hermoso](https://hermoso.ai/recipes/hyper-motion/)). A worked example ([buzzvideo](https://buzzvideo.ai/usecase/hyper-motion-199)) cuts about every 1.0 s with motion-matched cuts, crash zooms and foreground occlusion, keeps the product steadier than the world, and settles into a still hero.
- **In UI launch films:** decelerating entries, one-frame camera snaps, cuts into shots already moving, almost no fades. The classic explainer it replaces has equal slides, fades, a static camera and transcript captions.
- It is not a formal style name [unverified].

**References**

| Reference | Steal |
|---|---|
| [HyperFrames: premium motion](https://hyperframes.heygen.com/prompting/motion), [transitions](https://hyperframes.heygen.com/prompting/transitions) | A/B-rendered rules: 1-2 % idle, 4-8 % push, offsets shorter than moves, overshoot on transforms only, depth 0.2× / 1× / 6× with one occluder, one primary transition |
| [motionmaxxing](https://github.com/Tejashmakwana/motionmaxxing) (`references/motion.md`, `transitions.md`, `type.md`, `sound-sync.md`) | Measured durations, fitted eases, whips, counters, slop tells |
| [product-film skill](https://github.com/Rieranthony/product-film-skill) | Remotion kit: closed-form springs, log-space camera zoom, 240 fps master averaged into motion blur |
| [RemotionUI whip pan](https://remotionui.com/docs/components/transition-whip-pan) | Single-axis SVG blur (CSS `blur()` reads as defocus), overscan by 3σ |
| [Remotion `pushCut()`](https://www.remotion.dev/docs/transitions/presentations/push-cut) | Cut with a 1.04 → 1.07 punch-in; its default flash `#f5f2ed` is off-token, so change it or zero it |
| [X Money](https://60fps.design/shots/x-money-intro-sequence-animation), [Fold](https://60fps.design/shots/fold-successful-payment-check-animation), [Family](https://60fps.design/shots/family-wallet-card-morph-to-screen-transition) (60fps.design) | Number tickers and card tilts; check + burst + staggered reveal (our approval); card springing into a screen (our tile → phone) |
| [Raycast teaser via moonb](https://www.moonb.io/blog/product-launch-video) | Cropped, dark fragments of the real UI: the Act 4 mood |
| [Remotion showcase](https://www.remotion.dev/showcase): [AnySticker trailer](https://github.com/JonnyBurger/anysticker-tutorials/blob/main/src/Announcement/index.tsx), [GitHub Unwrapped](https://github.com/remotion-dev/github-unwrapped) | Readable Remotion source for hype trailers |

I found no verifiable technique breakdowns of the Linear, Arc, Monzo or Apple films [unverified].

## 3. Cookbook

### 3.1 Curves
The exact functions are in motionmaxxing `runtime/motion.js` (lines 18-39); `interpolate()` accepts any `(t) => number`. The bezier fits are mine (max error shown) [local].

| Name | Bezier (max err) | Frames | Use |
|---|---|---|---|
| land | `.22,.78,.51,.94` (.002) | 24 (12-42) | Default entry |
| snap | `.14,1.06,.31,.94` (.009); expoOut `.16,1,.3,1` is close (.05) | 22; logo 36-60 | Hero entries, flood |
| punch | `.22,1,.36,1` (quint out) | 18 | Punchline words |
| whip | `.38,.95,.72,1` (.002) | 14-16 | Whip arrivals |
| exit | `.29,0,.63,.04` (.000) | 16-26 | Thrown off-frame |
| crashOut | `.44,0,.73,0` (.027) | 34 | Into a cut at full speed |
| inOut / speedRamp | `.76,0,.24,1` / `.87,0,.13,1` | 24-36 / 20-30 | Reframes / the "hyper" camera move |
| softInOut | `.34,.07,.66,.93` (.001) | 18 | Blur, opacity, colour |
| popOver | `.30,.15,.30,1.39` (.014), peaks 1.08 | 30 | The rare overshoot |

**Inside app replicas**, keep the product's tokens (ux-spec §7.6):
- easings `(.2,0,0,1)`, `(.05,.7,.1,1)` and `(.3,0,.8,.15)`;
- durations of 7, 12, 17, 22, 30 and 36 f.

### 3.2 Springs [local, `measureSpring` at 60 fps]

| Config | Overshoot | Settles | Use |
|---|---|---|---|
| `{stiffness 500, damping 30}` (Pot spring-pop) | 5.8 % | 19 f | Chips, checks, UI pops |
| `{150, 20}` | 1.2 % | 36 f | Breakouts, magic moves |
| `{120, 30, mass 1.2}` | 0 | 45 f | Camera keys |
| `{120, 14}` | 7.3 % | 48 f | The one visible spring: the logo lid |
| `{260, 12, mass .6}` | 17.8 % | 33 f | A word slam, at most once per act |

The motion kit's `pop` (14 %) and `sticker` (25 %) presets are too bouncy for words and UI. Save them for one or two sticker moments.

### 3.3 Durations, stagger, holds
- **Exits** 26 f, accelerating; **blur** 14 f; **opacity** only as a helper (0.12-0.3 → 1 over 8-12 f).
- **Hero entries** cover 54-72 % of their travel in 8 f, then take a 0.4-0.6 s tail.
- **Siblings** (rows, avatars): 2-6 f apart with uneven gaps; each move about 2× its gap; the wave under 0.6 s.
- **No dead frames:** something always moves (1-2 px/f, or 0.5-1 % creep). A 0.6-1.5 s designed breath only before a payoff; a still payoff under 1 s.

### 3.4 Kinetic type
- **Word gaps:** 4-8 f in hooks, 8-12 f in headlines; voice-led words land 0-4 f before their spoken word; the payoff word waits 1.5-2× the gap.
- **Entry:** rise 32-76 px with blur 16 → 0 over 18-24 f on `land` or `punch`, no bounce, into fixed slots (`measureText` from `@remotion/layout-utils`). Only the thesis word may arrive from 1.4-1.9× scale.
- **Size:** punchlines 110-160 px Gabarito 800, tracking −1.5 % to −3 %; text that must be read is at least 28 px on screen.
- **Emphasis:** highlight blocks wipe on left to right in 10-12 f once the line is readable; one device per line.
- **Exits:** one word every 2 f, 6-8 f each, faster than the entry.
- **Typing** only in the product's own field: 14-30 chars/s in irregular bursts, 12-20 f pause after a space, a solid caret.
- **Reading:** hold 0.2 s per word once complete (1.7-2 s for 6-8 words); captions at least 50 f and at most 17 chars/s (Netflix); BBC subtitles run at about 3 words/s.

### 3.5 Numbers
- Roll one value per frame with decaying steps (15-23 values in 30-54 f); the last 3 frames barely move; never overshoot.
- Land on the exact amount (`$366.00`) in tabular figures, U+2212 for minus; hold 0.5-1.2 s.

### 3.6 Camera, 3D phone, breakouts
- **Push by duration:** 1.25× (≤ 12 f), 1.4× (14-36 f), 1.5× (38-90 f), 2.4× only for long drifts. Interpolate `ln(scale)` and pre-multiply the translate by the final scale ([Archibald](https://jakearchibald.com/2025/animating-zooming/)).
- **Reveal snap:** ratio 0.56-0.77 in 1 f, then an 18-36 f `land` tail.
- **Whip:** 14-16 f, cut at peak speed; the next shot continues the vector with a constant-size anchor.
- **Zoom-through:** ×1.5-2 every 4 f (1 → 21.9× in 32 f) toward a feature; the next shot starts at 1.4-2.5× and settles.
- **Parallax:** 2-2.4× speed ratio between layers; at most one blurred foreground occluder per act.
- **Drift:** `noise2D('camX', t*.25, 0)*8` px, ±0.4° rotation, plus a 4-8 % push per scene.
- **3D phone** (1080p): perspective 2,400-2,800 px, phone cropped by the frame. Enter from yaw −54° / pitch 29° / roll 11° to −9° / 24° / 2° in six held poses at f 2, 4, 6, 12, 18, 24 (scale 0.79 → 0.95). Visible side thickness (90 → 20 px), headlines behind it, body in Night tokens, eggplant-rgba contact shadow.
- **Breakout** [unverified composite]: a sibling twin on the screen plane swaps in for 1 f, then lifts (`translateZ` → 240 px, scale 1.6-2.0×, yaw turned to camera) on `{150, 20}` as its token shadow grows; it holds for the reading time and returns on `exit` (20 f).

### 3.7 Transitions
- **Premium:**
  - a hard cut on motion, matched object within 0.02 W;
  - an effect that becomes the next ground (circle `clip-path` to the corners in 12-18 f on `snap`);
  - a blur-matched whip (blur ramps over A's last 6 f; B starts at least as blurred and clears in about 16 f);
  - a one-frame scale cut (1.4-3.7×) with the content changing in the same frame;
  - a 0.5-0.7 s colour ramp timed to what leaves.
- **Cheap:** crossfades, white flashes, dips to black, a new transition per seam, generic slides, star or clock wipes, 3D cube / `flip` / `book-flip`, full-frame glitch, light leaks (off-token hues; `LightLeak` is deprecated [local]).

### 3.8 Blur and finish
- **Smear:** `<feGaussianBlur stdDeviation="X 0">` via `filter: url(#id)`. It peaks on the move's first frame and decays ×0.7 per frame. Length about 0.5-1× that frame's displacement, at most 0.15 W (words 12-45 px, whips up to about 100 px). Optionally 1-3 ghosts at 0.22 / 0.12 / 0.06 (`<Trail>`).
- **Finish:**
  - grain 2-3 %, monochrome, seeded per frame, Night only;
  - vignette 10 % at most (a radial glow plus vignette around a logo reads as "premium pastiche");
  - glow only as a 0.3 s event halo;
  - token shadows with one light direction.

### 3.9 Sound
- **Sync:** transients on the event frame or 1 f early (audio leading is detectable from 45 ms, lagging from 125 ms; ITU-R BT.1359). A 0.3-0.5 s whoosh starts 6-8 f before peak speed; a riser ends dead on the hit.
- **Levels:** VO peaks −16 to −12 dBFS; music ducks 8-10 dB (80 ms attack, 300 ms release); SFX below the VO peak: clicks −6 to −10 dB, whooshes −10 to −14, ticks −16 to −20.
- **ElevenLabs:** word timings run 50-300 ms late (snap to `silencedetect`, −40 dB); music can start late (trim, loop whole bars); measure the real tempo (119.8 BPM drifts about 9 f over 90 s).

### 3.10 Pacing
- **Cut lengths:** every 0.3-2.3 s within a beat; claims 1.5-3 s, product phases as long or longer.
- **Shape:** scenes shorten toward the end and the last one lingers; name exactly one breather.
- **Grid:** cuts on beats or eighths; acts on bar lines in 4- or 8-bar phrases; the reveal on a phrase downbeat.
- **Words:** 2.5-3 words/s of VO, about 190-220 words for 90 s (script v1 has about 185).

## 4. How demo videos win
- **Judging:** the proxy criteria are equally weighted (technical implementation, design, impact, idea, sustainability; ties go to technical implementation; `kb/hackathon-rules.md`), so design is scored. A Devpost judge distrusted projects whose "video intro looked really cool" but whose code was lighter: show real UI, real numbers and real contract names ([judges](https://info.devpost.com/blog/hackathon-judging-tips)).
- **[ETHGlobal](https://ethglobal.com/events/ethonline/info/details):** 2-4 min, intro under 20 s, no speed-ups, and **no TTS or AI voice-over**. NEAR has no such rule, but a human VO take is worth considering.
- **YC-style demos** ([secondary source](https://tryteasr.com/guides/yc-demo-video)): open with the core action; one workflow.
- **X** ([Meltwater](https://www.meltwater.com/en/blog/guide-to-posting-videos-to-twitter)): autoplays muted and the first 2-3 s decide. Show the logo or product within 3 s, burn in the key words, make frame 0 a real image.
- **Suggested shape:** hook 0-3 s → problem to 15 s → logo hit ≈ 0:16 → product 21-70 s → under the hood 70-83 s → end card 83-90 s. Storyboard v1 reaches the product at 0:30.

## 5. Remotion notes [local unless tagged]

| Technique | Cost / note |
|---|---|
| Transforms, 3D, `clip-path`, `evolvePath` | Cheap: the default toolkit |
| `box-shadow`, gradients, large `blur()` | GPU-heavy headless: few and short; render with `--gl=angle` ([docs](https://www.remotion.dev/docs/gl-options)) |
| `<CameraMotionBlur>` (defaults 180°, 10 samples) | About N× the subtree: whips only, 6-8 samples, wrapping the 3D stage from outside |
| Shader transitions (`zoomBlur`, `crossZoom`, …) | CLI (headless Chrome 157) enables `CanvasDrawElement`; Studio needs Chrome ≥ 149 with `chrome://flags/#canvas-draw-element`. Untested |
| CSS presentations (`fade`, `slide`, `wipe`, centred `iris`, `pushCut`) | Cheap; `linearTiming({durationInFrames, easing})` takes any ease |
| `@remotion/effects` (noise, vignette, axis `blur`) | Installed only via `@remotion/light-leaks`; experimental [unverified] |
| 240 fps master + ffmpeg `tmix=frames=4` | True motion blur at 4× render time; needs `time.ts` to read `fps` instead of its hard-coded 60 |

**3D gotcha** ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-style)):
- These flatten `preserve-3d`: `opacity < 1`, `filter`, `clip-path`, mask, `mix-blend-mode`, `isolation`, and `overflow` other than visible/clip. Keep them on leaf elements.
- The clipped screen can't hold 3D children: breakouts are siblings.

**Off-centre flood** (`iris` grows only from the centre; this type-checks against our installed packages [local]):
```tsx
import type {FC} from "react";
import {AbsoluteFill} from "remotion";
import type {TransitionPresentation, TransitionPresentationComponentProps} from "@remotion/transitions";
type P = {x: number; y: number; r0: number};
const Flood: FC<TransitionPresentationComponentProps<P>> = ({children, presentationDirection, presentationProgress: p, passedProps: {x, y, r0}}) => {
  const R = Math.hypot(Math.max(x, 1920 - x), Math.max(y, 1080 - y));
  const style = presentationDirection === "entering" ? {clipPath: `circle(${r0 + (R - r0) * p}px at ${x}px ${y}px)`} : {};
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
};
export const flood = (props: P): TransitionPresentation<P> => ({component: Flood, props});
// <TransitionSeries.Transition presentation={flood({x: 960, y: 560, r0: 24})} timing={linearTiming({durationInFrames: 15, easing: Easing.bezier(0.14, 1.06, 0.31, 0.94)})} />
```
- Transitions shorten the timeline; overlays don't.
- Use `random(seed)` and `noise2D(seed, …)`, never `Math.random()`.

## 6. Pot, act by act
- **The dots are the thread.** Keep one geometry (3 dots, gap = 3.33 r) everywhere they appear:
  - "Leo is typing…";
  - the s05 bubble;
  - the logo's holes;
  - "Checking Pot rules…";
  - the end card.
- **Give the dots a sound:** a three-blip motif. It resolves into the hit at s06, into the chime at s09, and rests at s13.

**Act 1 (Night, ≤ 16 s: merge s02 and s03; no marigold)**
- **Frame 0 is mid-avalanche:** banners 8, 6, 6, 5, 4, 4, 3 f apart, each sliding 65-110 px on `snap` with a 1 f vertical smear; the stack drops in one-frame jumps. The first VO word snaps the camera back (ratio 0.6, 24 f tail).
- **$1,236.00** rolls about 20 steps in 42 f.
- **"Leo is typing…":** the dots pulse on eighths, the bubble vanishes in a 1 f cut, then 30 f of music dropout: the joke.
- **s04 cards** rise and occlude the previous content; `declined` chips stamp with a 3-5 % settle; the strike-through draws in 12 f; the cards leave on `exit`.

**Act 1 → 2**
1. **s05:** a 1 s breath. On "rules?", push into the middle dot 1 → 6× in log space over 60 f on `crashOut`; the music clears 15-30 f before the bar line.
2. **Bar line = s06 frame 0:** the dot turns marigold in 1 f (the film's first marigold); the `flood` reaches the corners in 15 f on `snap`; the hit's transient lands on frame 0.
3. **The logo builds:** an eggplant iris centred on the middle dot reveals the glyph body in 18 f, so the dots re-emerge as its marigold holes. The lid drops on `{120, 14}`, the handles step in 3 f apart, and the eggplant burst plays as the lid lands.
4. **Words:** "pot" is fully wiped on 10 f before it is spoken; the tagline follows on the voice; hold at least 1 s.

**Act 2 → 3:** the marigold contracts to the phone screen (`clip-path: inset(… round r)`, 30 f, `inOut`); the phone body appears in a 1 f step, then the held-pose entry. Optionally dock the lockup into the app header [unverified that the screen has one].

**Act 3 (Day)**
- **One world, two phones:** Maya at x 0, Leo at +1.2 W. Persona switches are 15 f whips (40-60 px axis blur) anchored by the flying link card, then the request card; the s10 split screen is a 1.6× pull-back. This replaces the 3D flips.
- **Presses instead of `TapRipple`:** an eggplant touch dot at 18 %; the button turns `brand-deep` at 0.97 scale over 4-6 f and releases over 10-12 f.
- **Breakouts**, one per beat (the rule sentences, the approved card, "Approvals · 1 of 2", the refund table), each with a 1.5-2.5 s camera dwell while numbers and dots keep moving.
- **s09:** "Checking Pot rules…" holds 90 f (above the product's 1.2 s minimum), then a 0.7 snap toward the dots. On "approved", 12 marigold particles (12-16 px, optional 1 px `brand-deep` rim on cream) leave in 1 f, 30° apart ± a seeded 8°, and travel 120-220 px plus +200 px in Z on `land` over 36 f, fading from 40 % of their life. The music clears 15 f before the hit. **s10** is a group approval: no burst.
- **Balances** roll per §3.5; refund rows land 3-4 f apart; at most one sticker per scene (1.3 → 1.0 on `snap`).

**Act 3 → 4:** the screen goes Night in 1 f; the dark rect grows to fill the frame in 24 f; the phone outline rotates to isometric (rotateX 55°, rotateZ −35°).

**Act 4 (Night):** slabs 140-180 px apart in Z, separating 4-6 f apart. Each layer gets a 15-20 f sweep and a 60-90 f dwell keyed to its VO word, with labels blur-resolving. The marigold request pulse follows `getPointAtLength`. End on the trust sentence at 120-140 px, then a hard cut to cream on the bar line.

**Act 5:** the lockup arrives 1.15 → 1.0 over 36-48 f; the dots blip once; the text blur-resolves at 8 f per word; hold 2.5-3 s with 1-2 % creep so judges can read it. No fade to black.

**Suggested deltas to storyboard v1:** reveal by about 0:16; a sound system instead of an SFX on every motion; drop the member-colour glows; replace the 3D flips and `TapRipple`; limit transitions to the primary plus three accents (the flood, the tile → screen contraction, the screen-off flip); vignette at 10 % or less; one visible spring; fps-agnostic time helpers.

## 7. Caveats
- The motionmaxxing numbers come from 3-7 s clips @30, converted ×2. I used only its measured tables, not its model-decoded rows.
- The bezier fits and spring figures are mine [local].
- Unverified:
  - the shader transitions and `@remotion/effects`;
  - X loudness handling and custom thumbnails;
  - "hypermotion" as a formal style name.
