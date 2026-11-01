# Act 3 · builder C: s07-create and s08-join

Two scenes in the Act 3 world (`src/scenes/shared/world.tsx`): Maya starts a Pot and sets the rules (s07), then the
invite goes into the group chat and Leo joins with Google and adds his $150 (s08).

## Files
| File | What |
|---|---|
| `S07Create.tsx` | `S07Create`, `S07_SCENES = ["s07-create"]` (360 f) |
| `S08Join.tsx` | `S08Join`, `S08_SCENES = ["s08-join"]` (510 f) |
| `c-index.ts` | re-exports both components and both `*_SCENES` arrays |
| `c-lib/poses.ts` | camera framings shared by s07/s08, the move that straddles the s07 → s08 cut, `worldCamAt()` |
| `c-lib/whip.tsx` | the in-screen "app switch" whip (blur-matched cut whip at screen scale, split across the cut) |
| `c-lib/project.ts` | exact projection of a phone point to the frame (replays the world's CSS 3D chain with DOMMatrix) |
| `c-lib/LiftTwin.tsx` | breakout twin with an explicit 0..1 progress (sibling of the phone body, faces the lens) |
| `c-lib/Flyer.tsx` | screen-space carried object (whip anchors) with its own smear and depth shadow |
| `c-lib/BigLine.tsx` | one line of TypeZone big type: WordRise + optional Lucide icon + one HighlightBar |
| `c-lib/RiseIn.tsx` | a non-word TypeZone block (MoneyRoll, goal bar) entering like the house words |
| `c-lib/chat.ts`, `c-lib/tick.ts` | s08 chat content; the kit's tick roll as a value (for the in-app hero) |
| `preview-c/` | own `registerRoot`: `S07Create`, `S08Join`, `S07S08` (back to back, to check the cut), `CMeasure` |

Renders: `npx remotion still src/scenes/act3/preview-c/index.ts S07Create out/stills/s07-create/x.png --frame=0`.
Measure in-screen rects again after kit changes: `node src/scenes/act3/preview-c/measure-c.mjs`.

## s07-create (VO at f24: "Start a Pot for the trip, and set the rules in plain words."), global = 1440 + f
| Frame | Beat | Keyed to |
|---|---|---|
| 0 | PHONE_HANDOFF: pure marigold screen (status bar + home indicator masked), frontal phone, CAM.maya, no drift | handoff |
| 1-19 | Create sheet ("Name your Pot") rises over the marigold; marigold → cream → app scrim behind it | — |
| 0-30 / 0-48 | phone eases frontal → PHONE_HOME on `land`; camera drift fades in (0 → 8 px / 0.4°) | — |
| 14-116 | persona pill "Maya" | — |
| 26-88 | camera push 1.0 → 1.3 toward the name field (softInOut) | — |
| 27-78 | "Lisbon Trip" types in bursts (seed `lisbon`), solid caret | "Start" f27 |
| 78 | tram sticker pops off the phone's top-right edge (StickerPop, out at 146) | "trip" f81 |
| 88-101 | press on 🇵🇹 → selected ring + preview cover switch | — |
| 94-122 / 122 | camera back to CAM.maya / press **Next** → step 2 at 129 (Trip preset selected) | — |
| 156 / 178 | RuleRow twins lift out of the Trip preset, fly into their TypeZone slots and dissolve | "rules" f163 |
| 165-220 | big type: ⚡ "Anyone can spend up to **$100** without asking." / 👥 "Bigger spends need **2 of 3** approvals." | "plain" f195 · "words" f218 |
| 220-334 | both lines complete and readable (≈ 1.9 s; review 1: was ≈ 1.0 s) | — |
| 296 / 303 | press **Create Pot** (click) / step 3 "Creating Lisbon Trip… · Free: we cover the setup." in the phone beside the type (no camera cut) | — |
| 334-355 | words exit (2 f apart) | — |
| 340 | ✓ created, "Ready to share" current | — |
| 350 → s08 22 | camera push from CAM.maya ×1.03 into the chat close-up (inOut, peak at the cut) | — |
| 354-359 | app-switch whip: the step-3 sheet accelerates RIGHT (with the push), smear ramps; hard cut at peak speed | out |

SFX: swoosh-up 1 · typing 27 · pop-soft 78 (sticker) · click 299 · whoosh-fast 352.

## s08-join (VO at f15: "Drop the link in the chat. Friends join with Google and chip in their share. No wallet. No seed phrase. No gas."), global = 1800 + f
| Frame | Beat | Keyed to |
|---|---|---|
| 0-22 | the chat whips in from the left (B half of s07's whip, 0-16); camera finishes the push to the chat close-up (1.6×) | — |
| 22-39 | Maya's invite lands: marigold link preview + "Join our Lisbon Trip Pot so we can chip in together" (pop) | "link" f35 |
| 50 / 66 | Sam "in!" · Leo "joining now" (history = s01's lines, same senders) | "chat" f59 |
| 82-122 | the link card peels off the chat and anchors the 15 f whip Maya → Leo (90-105), then settles into the invite page | "Friends" f115 |
| 103-162 | persona pill "Leo"; InviteLanding "Maya invited you to Lisbon Trip", $300.00, "$300 of $450 collected" | — |
| 124-188 | big type "Join with Google." word by word on the voice | "join" f134 · "with" f146 · "Google" f156 |
| 140 | press **Join with Google** (click 143) → "Welcome, Leo" steps → **You're in!** (162) | — |
| 182-270 | big type "Chip in **$150**." (block on "$150", period off the block) | "chip" f192 |
| 190 / 210 | press **Add my $150 share** → Add money sheet (199) → press **Add $150** → sheet closes; "Adding $150…" + "+$150 on the way" | "share" f222 |
| 228-270 | the money beat: "In the Pot" + MoneyRoll **$300.00 → $450.00** (tick, 236-270) + the app's goal bar ×2.2 → "$450 of $450 collected"; Leo's in-app hero rolls with it; toast "Added. Lisbon Trip now has $450.00." | lands f270, before "No" f275 |
| 265 / 317 / 385 | "**No** wallet." / "**No** seed phrase." / "**No** gas." under the money; each block's 8 f sweep hits its stamp (274 / 326 / 394) | "No" f275 / f327 / f395 |
| 442-470 | money and lines exit | — |
| 452-502 | "+ $150.00" chip (Leo's avatar) lifts off Leo's row, anchors the whip back (466-476 `exit` into peak speed, `whip` tail to 509) and lands text-on-text on Maya's row | — |
| 509 | the whip's tail lands exactly on CAM.maya (+ drift): no dead hold (0.4 px/f on the last frame) | hand-off |

Right-column type never goes below y 840 (the caption box takes the bottom ≈ 110 px of x 1080-1820).

SFX: pop 30 · pop-soft 54, 70 · whoosh-fast 90 · click 143 · swoosh-up 162, 199 · stamp 274, 326, 394 · whoosh-fast 468.

## Hand-off verification
- **s06 → s07 (PHONE_HANDOFF).** s07 f0 rendered at 1920 × 1080: marigold screen x 369.3-790.65, y 83.65-996.3
  (centre 579.98, 539.98) vs PHONE_HANDOFF x 369.4-790.6, y 84.24-995.76. Builder B's s06 last frame (f359) has its
  marigold rect at the same edges on cream. Rotation {0,0,0}, camera exactly CAM.maya (drift scaled by 0 on f0).
- **s07 → s08 (same builder).** One camera move and one in-screen whip are keyed around the cut in both scenes
  (`CUT_MOVE`, `SCREEN_WHIP`), drift from the global frame; checked frame by frame in `S07S08`.
- **s08 → s09.** s08 f509 vs builder D's s09 f0 at full resolution: max channel difference 25/255, mean 0.05, no pixel
  over 40 (one frame of drift plus the whip's last 0.4 px). Camera = CAM.maya (last key on the last frame) +
  `useWorldCamera` drift; Maya's phone is the shared `WorldPhone` with `PotScreen balance 450 · yourShare 150 ·
  putIn 150 · FEED_FULL`, no sheet.

## Deviations and notes
- **Raster.** Both scenes use the shared `WorldPhone` (raster 2 by default since review 1); `c-lib/WorldPhoneHD.tsx`
  is gone.
- **Chat history** = s01's lines with s01's senders, ending on Sam's "who’s holding the trip money?", so the invite
  answers the Act 1 chaos. Update `c-lib/chat.ts` if Act 1 copy changes.
- **Money beat in s08** (review 1): the right-column MoneyRoll + magnified goal bar replace the earlier hero breakout.
- **Rule cards** come out of the Trip preset (whose lines are the preset summary); the cards carry the real rule
  sentences (`tripRules()`), as the storyboard asks.
- The Create sheet's default emoji is ✈️ (app: `initialCreate.emoji`), so 🇵🇹 is genuinely picked.
- The app-switch whip keeps the phone and changes the screen (storyboard: "keeping the same phone"); the world is not
  smeared there, only the screen content. World smear is reserved for the two persona whips (speed > 40 px/f).
