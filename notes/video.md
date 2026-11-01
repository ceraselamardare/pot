# Demo video (hackathon film)

Built 2026-10-22. The project lives in `marketing/video/`, a standalone Remotion npm project outside the pnpm workspace. Its `README.md` covers commands, structure and asset provenance.

- **Outputs:**
  - `marketing/video/out/final/PotDemo.mp4` (clean)
  - `marketing/video/out/final/PotDemoCaptioned.mp4` (burned-in captions, for the X post)
  - Both are 1920 × 1080 at 60 fps, 82.0 s, about −14 LUFS.
- **Story:** the D-61 cast and numbers. The app UI is rebuilt from `apps/web/components` and `i18n/en.json` and checked against `notes/screens/`.

## Deviation from the submission plan
`plan/submission-plan.md` §2 said "real footage only (no mock-ups)". This film is motion graphics instead: the real app's screens rebuilt in code, with exact copy and numbers.
- A real screen-recording segment can still be cut in later. `Phone` renders any React content, and the timeline makes room per scene.
- The plan’s ≤ 2:20 X limit is met (82.0 s).

## Open human decisions
- **ElevenLabs licence.** The account is on the free tier plus pay-as-you-go balance. The ElevenLabs docs say free-tier output is non-commercial with attribution, and Music's commercial licence needs Starter or above. Choose one before posting:
  - upgrade to Starter;
  - or credit ElevenLabs, e.g. in the X post or the README.
- **AI voice-over.** It is allowed: the NEAR rules say nothing about it. ETHGlobal bans AI voice-overs, so a human take is optional. `marketing/video/README.md` explains how to drop one in.
- **Repo URL on the end card.** Pass `repoUrl` once the repo is public.
