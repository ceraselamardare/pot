# Demo video (hackathon film)

Built 2026-10-22. The project lives in `marketing/video/`, a standalone Remotion npm project outside the pnpm workspace. Its `README.md` covers commands, structure and asset provenance.

- **Outputs:**
  - `marketing/video/out/final/PotDemo.mp4` (clean)
  - `marketing/video/out/final/PotDemoCaptioned.mp4` (burned-in captions, for the X post)
  - Both are 1920 × 1080 at 60 fps, 82.0 s, about −14 LUFS.
- **Story:** the D-61 cast and numbers. The app UI is rebuilt from `apps/web/components` and `i18n/en.json` and checked against `notes/screens/`.

## Update v2 (2026-11-03)
Brought up to the Nov 3 app and website. The brief is `marketing/video/brief/06-update-v2.md`; it holds the truth audit and the new beats.
- **Same length (82.0 s), same music, same act boundaries.** Act 3 was re-cut inside its window.
- **The $300 boat now needs one OK**, as in the app, README J-4 and the site. The old "2 of 3" for the boat was false.
  - New s10 VO: "Bigger spends need one OK. Leo taps it, right from a notification."
- **New s10b, "And more":** Trust grows · All or nothing · Ask anyone to pay in · Send by link. These are the site's "What else a Pot can do".
  - Trust is shown as Maya's honest state.
  - The other three cards are on other Pots, so the Lisbon story stays consistent.
  - New VO: "Plus: trust that grows, all-or-nothing goals, and links to pay in, or pay out."
- **s07 shows the three rule tiers:** "Anyone can spend up to $100 without asking." · "Up to $300? Just one OK." · "Over $300? Most of the group."
- **s11:** the group (Maya and Sam, 2 of 3) approves the close before the $22.00 refunds.
- **s12:**
  - The x-ray's $300 pulse is approved by Pot rules after Leo's OK.
  - The close lights the Sputnik DAO majority.
  - The dollars slab says "testnet today".
- **The UI kit matches today's app:** the round action row, Settings tab, compact feed, two-step Spend and Add money, the one-OK sheet and push, the lean Create and the Pot rules screen, the private invite landing, and the trust, goal, pay-in and send-by-link pieces.

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
