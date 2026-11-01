# Scene builders: how to build your scenes

Owner: the director. Every scene builder reads this, plus `00-team-brief.md`, `01-creative-brief.md`, `03-storyboard.md` (v2, binding) and `research-hypermotion.md`. Also read the READMEs of the kits you use: `src/ui/README.md` and `src/motion/README.md`.

## Assignments
| Builder | Scenes | Folder | Notes |
|---|---|---|---|
| A | s01-hook, s02-front + s03-chase (ONE component spanning both entries), s04-options, s05-pivot | `src/scenes/act1/` | Night palette; no marigold; ends on DOT_HANDOFF |
| B | s06-reveal, s13-end | `src/scenes/act2/`, `src/scenes/act5/` | starts on DOT_HANDOFF; ends on PHONE_HANDOFF |
| C | s07-create, s08-join | `src/scenes/act3/` (files `s07-*`, `s08-*`) | starts on PHONE_HANDOFF; one world, two phones |
| D | s09-instant, s10-group | `src/scenes/act3/` (files `s09-*`, `s10-*`) | the hero moments (burst, breakouts, split screen) |
| E | s11-close, s12-tech | `src/scenes/act3/` (`s11-*`), `src/scenes/act4/` | owns the screen-off transition into Night |

## Contract
1. **One React component per scene** (B and E have two each; A's s02+s03 is one component), each exporting:
   - the component itself, with no required props;
   - `export const <NAME>_SCENES: SceneId[]`, listing the timeline entries it covers.
2. **Length:** read `scene(id).duration` from `src/data/timeline.ts`, and for s02+s03 the sum of both. Never hard-code a length; the timeline is locked but may shift by a few frames.
3. **Inside your component, frame 0 is your scene's first frame.**
   - Key every moment that has a word to `voWord(id, "word", fallback)` from `src/data/vo.ts`. Use `voWordRel(...)` for a component spanning two scenes.
   - Real timings exist for all 13 lines; read `src/data/vo/<id>.json` to see them.
   - Voice-led visuals land 0-4 f before the word. The motion kit's `voLanding()` / `VO_LEAD` help.
4. **Don't render the VO or the music;** the director adds them. **Do** add SFX with `<Sfx name at volume>` from `src/motion` (names are in `src/audio/sfx.ts`). Follow the sound system (03-storyboard rule 8): sparse and deliberate.
5. **Handoffs are exact** (`src/scenes/shared/handoffs.ts`):
   - s05 → s06 uses `DOT_HANDOFF` and `GLYPH_MATCH_SCALE`.
   - s06 → s07 uses `PHONE_HANDOFF`.
   - Act 3 scene → scene: CAM.maya, plus the stated PotScreen state.
   - **Render your first and last frame** and check them against the contract.
6. **Act 3 staging** must use `src/scenes/shared/world.tsx`:
   - `WorldStage`, `WorldPhone`, `CAM.maya` / `CAM.leo` / `CAM.split`, `PersonaPill`, `TypeZone`, `cardOffset(LAYOUT.*)`.
   - Use `useWorldCamera(sceneId, keys)`, so the drift continues across cuts.
   - Breakouts are siblings of the phone (`<WorldPhone>` children: `<BreakOut … face={PHONE_HOME}>` with a `UiPiece` twin). Hide the in-screen original with the kit's hide props.
7. **Imports:** `src/ui` and `src/motion` both export `pressAt`, `TouchDot`, `TypingDots` and `Caret`. Import those four by explicit path, never from both barrels:
   - **Inside the app UI:** the UI-kit versions, from `../../ui/atoms/...`.
   - **For film-level graphics:** the motion-kit versions, e.g. `TypingDots` from `../../motion/dots`.
   - Everything else can come from the barrels.
8. **Determinism and 3D:**
   - Frame-driven only. Use `random(seed)` / `noise2D`, never `Math.random`. No CSS animations or transitions.
   - Keep opacity, filter, clip-path, mask and overflow on leaf elements inside 3D stages.
9. **Brand:** tokens only, Gabarito/Figtree, tabular figures with two decimals for amounts, Lucide icons at stroke 2, the logo only via `src/brand/Logo.tsx`. **Marigold is never a text colour.** **No marigold in Act 1.**
10. **Stickers:** use `STICKERS` from `src/data/stickers.ts` with `staticFile(src)` and `<Img>` from remotion, wrapped in the motion kit's `StickerPop`. At most one sticker per scene. Don't add a second tight shadow (one is baked in); a soft lift shadow during the pop is fine.

## Workflow
- **Develop in your own preview entry:** `src/scenes/<folder>/preview/index.ts`, with its own `registerRoot` and a Root that registers your scene compositions at 1920×1080, 60 fps, with the real durations. Another builder's half-finished code can't break your renders that way.
- **Render stills** at every key moment (`--scale=0.5` for checks, `--scale=1` for detail) and look at them with Read:
  ```
  cd marketing/video && npx remotion still src/scenes/<folder>/preview/index.ts <CompId> out/stills/<scene>/<name>.png --frame=<n> --scale=0.5
  ```
- **Check the motion** by rendering a low-res MP4 of each scene and extracting a contact sheet of frames with ffmpeg:
  ```
  npx remotion render src/scenes/<folder>/preview/index.ts <CompId> out/scenes/<scene>.mp4 --scale=0.5
  ffmpeg -i out/scenes/<scene>.mp4 -vf "fps=6,scale=480:-1,tile=6x5" -frames:v 1 out/stills/<scene>/contact.png
  ```
- **Self-review against the storyboard before reporting:**
  - Is every VO beat visualised at the right word?
  - Is text readable: on screen long enough, at least 28 px?
  - Do the handoff frames match?
  - Any dead frames, off-token colours, clipped text or layout jumps?
- `npx tsc --noEmit` must pass.
- **Don't edit** `src/ui`, `src/motion`, `src/brand`, `src/data` or `src/scenes/shared`. If you need a change there, describe it in your final report, or work around it locally inside your folder.
- When done, write `src/scenes/<folder>/README.md`: components, exports, key frames, SFX cues, handoff verification. Report back.

## Hard rules
No git commands. Don't post anything. No paid API calls (all assets exist). Never print secrets. Write only inside your scene folders and `out/`.
