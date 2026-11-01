# Act 5: the end card (builder B)

**s13-end** is 270 f (timeline v1.2: 1:18 to 1:22.5). It opens on a hard cut from Night on a bar line. VO starts at f30: "Pot. Built at NEAR Hackathon."

## Files and exports (`index.ts`)

| Export | What |
|---|---|
| `S13End` (props: `repoUrl?: string`) | The scene. Mount it for `S13_END_SCENES` (`["s13-end"]`). Length comes from `scene("s13-end").duration`. `repoUrl` adds a small ink-muted line under the tracks and lifts the card half a line so it stays centred. It stays undefined by default (the repo isn't public yet; the human adds it through the prop). |
| `S13_KEYS`, `S13_LOCKUP_HEIGHT` (200) | The key frames and the lockup height. |

**Preview:**
- `npx remotion studio src/scenes/act5/preview/index.ts`
- `S13-End` is the 270 f scene.
- `S13-End-Repo` is a layout check with a sample `repoUrl` (preview only).
- `BrandDiff` (`which`: `file` / `lockup` / `svg`) compares the brand lockup file, `<Lockup>` and `LockupSvg` at the same spot, as evidence for the `<Lockup>` "t" bug.

## Key frames

| f | Beat |
|---|---|
| 0 | Cream `#faf9f6`. `LockupSvg on="light"` (= `pot-lockup-on-light.svg`, pixel-identical) is already on screen at 1.15×. |
| 0-42 | Settles 1.15 → 1.0 in log space on `land`, about its ink centre. |
| 10-86 | The tagline "Group chat money that follows its own rules." blur-resolves at **8 f per word**: WordRise, Figtree 600, 44 px, ink-muted, rise 20, smear 14 → 0. |
| 33 / 42 / 51 | The dots blip once, left to right: a scale pulse to 1.4 through the Lockup's `dots` prop (3 f attack, 10 f settle), then rest. The first peak is on **"Pot."** (f33). `blips` starts at f32; its three transients sit 9 f apart, on the three dots. |
| 73 → 83 | The pill "Built at NEAR HACKATHON" rises in and lands on **"Built"**. It has the surface fill, a 1 px line border, ink text, Figtree 600 at 28 px, and pill radius. |
| 124 → 134 | "Social Money · Real-World Money" (Figtree 600, 28 px, ink-muted) lands on **"Hackathon"**. |
| 144 → 269 | The composed card holds (≈ 2.1 s) on a **2 % constant-rate creep** from f42 to the very last frame, plus a gentle hand-held drift (`driftAt`, ≈ 4 px, translation only), folded into the logo's vector geometry and applied as a transform on the text. No frame is static: f268 → f269 still differ on 352 sampled pixels. There is **no fade to black**: the last frame is the card. |

**SFX:** `blips` 0.4 @32 (the dots' motif rests here). The final chord is the director's.

## Measured
- **f42 (arrival done, creep not started):**
  - the tile is exactly 200.00 × 200.00 px at (715.2, 300.0);
  - the "t" ends at 1204.8, so the lockup's ink is centred at x 960.0;
  - the tagline ink starts 61 px under the tile (the quarter-tile clear space is 50 px).
- **f269 (end of the 2 % creep):** the tile is 203.94 px, and the gap is 61.4 px against a 51.0 px clear space.
- **Rendered audio:** the blips' onsets are at f33, f42 and f51, on the three dot peaks.
- **All frames (360 f version):** no off-palette pixels. The only near-greys are anti-aliased text edges on the cream → ink-muted line.

## Notes
- The lockup is drawn with `LockupSvg` from `../act2/LockupSvg` (pixel-identical to the brand file). `<Lockup>` used to clip the "t"; the director has since fixed it, so either works.
- `tooling.md` mentions a possible "Voice, music & sound effects: ElevenLabs" credit on the end card, which is a human licensing decision. It isn't shown. If it's wanted, it fits as one more small line under the tracks, like `repoUrl`.
