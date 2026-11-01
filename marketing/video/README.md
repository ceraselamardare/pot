# Pot: hackathon demo film (Remotion)

An 82 s hypermotion demo of Pot for NEAR HACKATHON.
- It runs problem → the reveal → how it works → under the hood (NEAR) → end card.
- Format: 1920 × 1080, 60 fps, on a 120 BPM grid.
- It's a standalone npm project, not part of the pnpm workspace.

## Outputs
| File | What |
|---|---|
| `out/final/PotDemo.mp4` | Clean cut, for the README and general use |
| `out/final/PotDemoCaptioned.mp4` | Burned-in captions, for the X post (X autoplays muted) |

Both are H.264, CRF 16, AAC 320 kbps, mastered to about −14 LUFS / −1 dBTP.

## Commands (run from `marketing/video`)
```bash
npm install                                   # once
npx remotion studio                           # preview everything (Director/PotDemo, PotDemoCaptioned)
bash scripts/render-final.sh                  # render + master both cuts → out/final/
bash scripts/render-final.sh --only PotDemo   # one cut
bash scripts/review.sh                        # half-res review render + contact sheets → out/review/
```
`remotion.config.ts` uses the ANGLE GL renderer, which is about 10× faster headless for these 3D frames.

## How it's built
- **The team docs, in reading order, are in `brief/`:**
  1. `00-team-brief.md` (rules, story, numbers)
  2. `01-creative-brief.md`
  3. `02-script.md` (the VO)
  4. `03-storyboard.md` (shot by shot, plus the film-wide motion grammar)
  5. `research-hypermotion.md` (the motion cookbook)
  6. `tooling.md` (ElevenLabs and OpenAI)
  7. `audio-notes.md`, `images-notes.md`
  8. `review-1.md` / `review-2.md` (critic passes)
- `src/data/timeline.ts`: the locked master timeline (scene starts and VO offsets on the beat grid). Everything derives from it.
- `src/brand/`: tokens generated from `brand/tokens.json` (`node scripts/gen-tokens.mjs`), Gabarito + Figtree, and the logo as exact SVG paths.
- `src/ui/`: Pot's real app screens rebuilt as frame-driven components. They are checked against `notes/screens/*.png` to within about 1 px.
- `src/motion/`: the shared motion kit (camera, curves, kinetic type, money rolls, transitions, burst, grain, `<Sfx>`).
- `src/scenes/`: one folder per act. `shared/` holds the Act 3 two-phone world and the exact handoff contracts between scenes. `registry.tsx` maps the timeline to the scenes.
- `src/audio/Soundtrack.tsx`: VO placement plus the music bed ducked under the VO, with the section arc and dips. `scripts/audio-master.py` masters the render and removes the uniform 25 ms MP3 decoder delay.
- `src/Captions.tsx`: captions built from the VO word timings. Lines the big type already shows are suppressed.

## Assets and where they came from
- **Voice-over:** ElevenLabs `eleven_v4`, voice "Dior" (`4XLp6ou1JHGgf9xXbHCM`).
  - The voice was chosen by a measured A/B against Emma and Marcus; their takes are in `public/audio/vo/_takes/`.
  - Word timings were corrected to the measured speech onsets.
- **Music:** ElevenLabs Music `music_v2_5`, from a 7-section composition plan at 120 BPM (`scripts/audio-music-plan.json`). The section hits land on the act boundaries.
- **SFX:** ElevenLabs sound generation (`scripts/audio-sfx.json`), 24 cues.
- **Stickers:** OpenAI `gpt-image-2.5-sunburst`, transparent die-cut stickers in one style (an edit from a style anchor). Raws are in `assets-src/stickers/`.
- **All visuals except the stickers are code:** brand tokens only, the real app copy, and the D-61 numbers.

## Change something
- **Repo link on the end card:** `bash scripts/render-final.sh --repo github.com/<org>/<repo>`. This passes the `repoUrl` composition prop through to the end card, which is empty by default until the repo is public.
- **Swap the narrator:**
  1. Regenerate the lines with `scripts/audio-vo-take.mjs` (see `brief/audio-notes.md`). This rewrites `src/data/vo/*.json`.
  2. Re-check `src/data/timeline.ts`. Scenes key every beat to VO words, so most of them follow automatically.
- **A human voice-over:**
  1. Record each line from `brief/02-script.md` as `public/audio/vo/<id>.mp3`.
  2. Produce the word timings with ElevenLabs speech-to-text (`stt()` in `scripts/lib/eleven.mjs`) into the same JSON shape.
- **Captions:** edit `SUPPRESS` / placement in `src/Captions.tsx`.

## Secrets
API keys live in `marketing/.env` (gitignored). Scripts load them only at runtime: `node --env-file=../.env …`.
