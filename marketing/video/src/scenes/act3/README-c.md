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

## s07-create v2 (330 f at global 1440; VO at f24: "Start a Pot for the trip, and set the rules in plain words.")
| Frame (global) | Beat | Keyed to |
|---|---|---|
| 0 (1440) | PHONE_HANDOFF: pure marigold screen, frontal phone, CAM.maya, no drift | handoff |
| 1-19 (1441-1459) | the lean "Start a Pot" sheet rises over the marigold (marigold → cream → scrim behind it) | — |
| 24-75 (1464-1515) | "Lisbon Trip" types in bursts with a solid caret; camera push 1.0 → 1.3 on the form | "Start" 27 |
| 74 (1514) | tram sticker pops off the phone's edge (out at 132) | "trip" 81 |
| 80 / 85 / 94 / 106 (1520-1546) | tap the picture → the picker → 🇵🇹 (cover switches at 97) → [Done] (closes at 111) | — |
| 116 → 123 (1556 → 1563) | [Change] → "Pot rules" (cards with inline amounts) | — |
| 140 (1580) | tier 1 lifts out of the instant card; ⚡ "Anyone can spend up to **$100** without asking." words 149-163, block 177 | "rules" 163 |
| 146-169 / 173-191 | the rules list scrolls (0 → 412 → 714; v3, was 400 → 690) between the lifts | — |
| 172 (1612) | tier 2 lifts out of the one-OK card; ✋ "Up to **$300**? Just **one OK**." words 181-189, blocks 198 / 202 | "plain" 195 |
| 192 (1632) | tier 3: only the majority row of "Every Pot works like this" lifts (cropped, 1.15×, routed under line 2); 👥 "Over **$300**? **Most of the group**." words 201-205, blocks 215 / 217 | "words" 218 |
| 230-308 (1670-1748) | all three readable together (≈ 1.3 s) | — |
| 284 → 291 (1724 → 1731) | [Create Pot] (on the rules step) → "Creating Lisbon Trip… · Free: we cover the setup." | — |
| 308-329 | type exits | — |
| 320 → s08 22 | push into the chat close-up; 324-329 the in-screen whip; cut at peak speed on 1770 | out |

SFX: swoosh-up 1 · typing 24 · pop-soft 74 (sticker) · click 287 · whoosh-fast 322.

## s08-join v2 (480 f at global 1770; VO at f15: "Drop the link in the chat. Friends join with Google and chip in their share. No wallet. No seed phrase. No gas.")
| Frame (global) | Beat | Keyed to |
|---|---|---|
| 0-22 (1770-1792) | the chat whips in (B half of s07's whip); camera finishes the push to the chat close-up | — |
| 22-39 (1792-1809) | Maya's invite lands (marigold link preview, plain seats) | "link" 35 |
| 50 / 66 | Sam "in!" · Leo "joining now" (history = s01's lines and senders) | "chat" 59 |
| 82-122 (1852-1892) | the link card peels off and anchors the 15 f whip to Leo (90-105), settling into the invite page | "Friends" 115 |
| 105-140 | InviteLanding: "Maya invited you to Lisbon Trip", $300.00, "Maya and 1 other are in", the one-OK rules line, "until Nov 7" | — |
| 124-188 (1894-1958) | big type "Join with Google." on the voice | "join" 134 · "Google" 156 |
| 140 (1910) | press **Join with Google** (click) → "Welcome, Leo" steps → **You're in!** (162) | — |
| 182-265 (1952-2035) | big type "Chip in **$150**." | "chip" 192 |
| 190 → 199 (1960 → 1969) | **Add my $150 share** → Add money opens on step 2 (as the app does for `?amount=150`): "$150 · Change", sources, "Goal reached.", "After this, you'd get back $150…" | "share" 222 |
| 210 (1980) | press **Add $150** → the sheet closes; "Adding $150… · Sending…" + "+$150 on the way" | — |
| 228-270 (1998-2040) | money beat: "In the Pot" + MoneyRoll $300.00 → $450.00 (236-270) + the goal bar to "$450 of $450 collected"; toast | lands before "No" 275 |
| 265 / 317 / 385 (2035 / 2087 / 2155) | "**No** wallet." / "**No** seed phrase." / "**No** gas."; blocks hit the stamps at 274 / 326 / 394 (2044 / 2096 / 2164) | each "No" |
| 432-451 | money and lines exit | — |
| 436-470 | the "+ $150.00" chip lifts off Leo's row and anchors the whip back (440-450 into peak speed, tail to 479) | — |
| 479 (2249) | lands on CAM.maya (+ drift): Maya's PotScreen $450.00, "You'd get back $150 · You put in $150", FEED_FULL, tab bar $0.00, no sheet, empty TypeZone | hand-off |

Right-column type never goes below y 850 (the caption strip y > 960 stays free).

SFX: pop 30 · pop-soft 54, 70 · whoosh-fast 90 · click 143 · swoosh-up 162, 199 · stamp 274, 326, 394 · whoosh-fast 442.

## Hand-off verification (v2)
- **s06 → s07:** s07 f0 fully-marigold pixels x 370-789, y 86-994; builder B's s06 last frame x 370-789, y 85-994;
  PHONE_HANDOFF x 369.4-790.6, y 84.24-995.76.
- **s07 → s08:** one camera move and one in-screen whip are keyed around the cut in both scenes; checked in `S07S08`.
- **s08 → s09:** s08 f479 vs builder D's updated s09 f0 and vs `S09HandoffRef` (s09's frame-0 camera + the stated
  PotScreen): identical results, max 49/255, mean 0.145, zero integer shift (phase correlation) and identical edges,
  i.e. sub-pixel (one frame of drift + the whip's last 0.4 px).

## Deviations and notes
- **Raster.** Both scenes use the shared `WorldPhone` (raster 2 by default since review 1); `c-lib/WorldPhoneHD.tsx`
  is gone.
- **Chat history** = s01's lines with s01's senders, ending on Sam's "who’s holding the trip money?", so the invite
  answers the Act 1 chaos. Update `c-lib/chat.ts` if Act 1 copy changes.
- **Money beat in s08** (review 1): the right-column MoneyRoll + magnified goal bar replace the earlier hero breakout.
- **Add money in s08 (v2):** "Add my $150 share" opens the two-step sheet straight on step 2 (the app routes it with
  `?amount=150`; step 1 "How much?" only shows from the Pot's round Add money action), so s08 shows step 2.
- **s07 tiers (v2):** the twins are the kit's `CreateRuleCard` instant / oneOk / fixed; the list scrolls between the
  lifts; the source card tints brand-soft while its twin lifts.
- **Rule cards** come out of the Trip preset (whose lines are the preset summary); the cards carry the real rule
  sentences (`tripRules()`), as the storyboard asks.
- The Create sheet's default emoji is ✈️ (app: `initialCreate.emoji`), so 🇵🇹 is genuinely picked.
- The app-switch whip keeps the phone and changes the screen (storyboard: "keeping the same phone"); the world is not
  smeared there, only the screen content. World smear is reserved for the two persona whips (speed > 40 px/f).
