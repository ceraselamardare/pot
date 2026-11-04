# Review 3: the v2 update (2026-11-03)

**Checked:** the render, 50 stills (`out/review/frames3/`), the seams (`seams3-montage.png`), two strips and the mix, against en.json, the components, notes/screens and the hub contract.

## Verdict
1. **Truth:** every app string matches en.json; the tiers, one OK, the close and the tie-back are true.
2. **One P0 regression:** s10's big type is captioned twice.
3. **s10b is the weak beat:** its cards break out of Maya's Lisbon phone but show states that contradict it, and it has no big type.
4. **Other P1s:**
   - s07 has a 12 f collision.
   - s07 and s10 give two answers to "Bigger spends need…".
   - s10's push is a 12 f flash.
5. **Clean:** audio, seams, numbers and brand. No fix changes the length.

## P0
**P0-1: duplicate captions in s10 (a regression of review-2's P0-1).**
- **Where:** f2962-3114.
- **What:** "Leo taps it," and "right from a notification." repeat the big type word for word (`frames3/f2990.png`, `f3045.png`, `f3090.png`).
- **Why:**
  - SUPPRESS lists the whole sentence.
  - The 0.334 s pause after "it" splits it into two pages, so neither page matches.
- **Fix:** list both pages, or set s10 to `"all"`.
- **File:** `src/Captions.tsx`.

## P1
**P1-1: s10b contradicts Maya's Pot.**
- **Where:** f3208-3500.
- **What:** the cards break out of Maya's phone beside "$66.00", so they read as her Pot now. Three can't be:
  - **The goal card** shows "In the Pot $300.00 · $300 of $450 · 3 days left · Spending opens once the goal is reached". But s07 showed "Set a goal" off, and she has already spent twice (`f3344.png`).
  - **"Grandma … +$25.00 just now" and "$40 ✓ Claimed"** both move Lisbon money: a link is escrowed on approval. Yet the Pot stays at $66, and s11 splits $66.
  - **The claimed link** is also Maya's third paid spend (TRUST_STEP = 3). The Trust card beside it says "1 more paid spend to $200" (`f3445.png`).
- **Fix:**
  - Keep Trust as Maya's card.
  - Give cards 2-4 another named Pot with its own numbers, e.g. the app capture's Festival Fund, "$300 of $1,200 · 3 days left".
  - Launch those cards from off-frame and drop "just now".
  - Minimum: give the goal card non-Lisbon numbers.
- **Files:** `s10b-cards.tsx`, `S10bMore.tsx`, `s10b-timing.ts`.

**P1-2: collision in s07.**
- **Where:** f1636-1648.
- **What:** the third twin is the whole "Every Pot works like this" box at 1.6×, and it crosses line 2. "one OK." prints over its header (`f1640.png`, `s07-tiers-1596-1690.png`).
- **Fix:** lift only the box's first row, like the other twins, or cap that twin's scale so its top stays below y ≈ 640.
- **Files:** `S07Create.tsx`, `c-lib/LiftTwin.tsx`.

**P1-3: two answers to "Bigger spends".**
- **What:** 20 s apart, the film says two different things:
  - s07 (f1656-1760): "Bigger spends need most of the group." (`f1700.png`)
  - s10 (f2798-2932): "Bigger spends need one OK." (`f2905.png`)
- **Fix (no new VO):** change s07's line 3 to "Over $300? Most of the group.", parallel to "Up to $300? Just one OK.".
- **File:** `S07Create.tsx`.

**P1-4: the push is a flash.**
- **Where:** it is legible only at f2944-2955 (12 f) on Leo's phone and at f2922-2926 on Maya's (`s10-push-2906-2976.png`, `f2946.png`). The VO says "notification" at f3049.
- **Fix:**
  - Start the flight about 10 f earlier: Maya's 16 f "Sent" state barely registers.
  - Open the sheet on "Leo" (≈ f2964).
  - The push holds about 28 f, the press stays on "taps", and "Bigger spends need one OK." gains about 10 f.
- **File:** `s10-timing.ts`.

**P1-5: s10b has no kinetic type.**
- **Where:** at f3140-3205, the TypeZone holds only a 32 px muted "And more" (`f3178.png`).
- **What:** then the only text ≥ 28 px is four 40 px titles (card copy 17-23 px): Act 3's one slide-like beat, weak when muted.
- **Fix:**
  - Land "And more." at 110-130 px on "Plus" (f3156).
  - Shrink it into the eyebrow as card 1 launches (f3184); this also fills the s10 → s10b lull.
  - Raise the titles to about 52 px.
- **Files:** `S10bMore.tsx`, `s10b-cards.tsx`.

## P2
1. **s10b caption box (f3420-3470):** it sits 11 px under the cards (`f3445.png`). Fix: raise `GRID.y` by about 20 px. File: `s10b-cards.tsx`.
2. **s11 refund twin (f3698-3750):** it re-rolls from $0 to $22.00, although the sheet already showed $22.00 (`f3720.png`). Fix: hold the values. File: `s11-refund.tsx`.
3. **The goal card's date:** "3 days left … by Nov 12", but the film's today is Nov 3 ("Closed Nov 3"). Fix: use Nov 6.
4. **Leo's sheet (f2952-2999):** it says "2 min ago" for a push marked "now". Fix: "just now". Files: `S10Group.tsx` or the `src/ui` ApproveSheet defaults.
5. **End card (carried over from review-2 P1-3):** it still has no app or README URL. Adding one costs no time.

## Completeness and coherence
Everything from Nov 1-3 is shown, in the app's words: one OK and the majority, the tiers, the Pot rules screen, the four "What else a Pot can do" items, the new Pot screen, Create, Spend, Add money (step 2 is true for "Add my $150 share") and "Maya and 1 other are in". Nothing important is missing.

As a "meanwhile" before the close, s10b sits sensibly. After P1-1 and P1-5 it won't feel bolted on.

The one-OK beat reads in 6 s through its big type, "Done. Your OK sent $300 to Maya." (about 40 f) and the $366 → $66 roll.

## Audio, seams and brand
- **Audio:**
  - Every VO sits at scene.from + voAt (s10 at f2805, s10b at f3165), measured by cross-correlation with a constant AAC offset of +1.5 f.
  - The new takes are −16.1 and −16.2 LUFS, like the others.
  - The music dips to −45 / −53 dB at f2590-2600, and the success hit lands on f2602.
- **Seams:** all 13 are clean.
- **Brand:**
  - one marigold button per screen;
  - each status has an icon, a word and a colour;
  - token colours only;
  - no burst outside s09 and the logo reveal;
  - the QR codes encode harmless demo text.

## Five things to keep
1. **s07's three tiers:** marigold blocks on $100, $300 and one OK, held together for about 1.6 s.
2. **s10 uses the exact one-OK copy,** from the preview to "Done. Your OK sent $300 to Maya."; the ✓ One OK chip carries the whip into the $66.00 roll.
3. **The honest Trust card:** New, 2 of 3, "1 more paid spend to $200".
4. **s12's tie-back:**
   - The $84 and the $300 stop at Pot rules; the $300 is marked "Approved by Leo's OK".
   - "Close · 2 of 3" lights Your Pot with Maya's and Sam's dots.
   - No label is covered.
5. **The number chain:**
   - $450 → $366 → $66 → $22.00 each;
   - You'd get back 150, 122 and 22;
   - Pot dollars $84 → $384;
   - s11's order: ask, 1 of 2, Sam, 2 of 2, $22.00 each, Pot closed, screen-off at f3840.
