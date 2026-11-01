# Images: sticker set notes

Owner: the image agent. Written 2026-10-22.

## Result
Eight die-cut stickers in one style, as transparent PNGs. Each is trimmed to the sticker plus a 24 px margin, with the long side at 1024 px. They are registered in `src/data/stickers.ts` with their intrinsic sizes.

| Sticker | File | Size | Final candidate | Scene (04-assets) |
|---|---|---|---|---|
| tram | `public/images/stickers/tram.png` | 1024 × 867 | `tram-a` (generate, the style anchor) | s07 create |
| pastel | `public/images/stickers/pastel.png` | 1024 × 824 | `pastel-edit2` (edit, re-take) | s07 / s08 accent |
| groceries | `public/images/stickers/groceries.png` | 782 × 1024 | `groceries-edit` (edit) | s09 instant |
| boat | `public/images/stickers/boat.png` | 891 × 1024 | `boat-edit` (edit) | s10 group |
| tickets | `public/images/stickers/tickets.png` | 1024 × 1014 | `tickets-edit` (edit) | s10 group |
| receipt | `public/images/stickers/receipt.png` | 635 × 1024 | `receipt-edit2` (edit, re-take) | s02 front (Night, no marigold) |
| sunglasses | `public/images/stickers/sunglasses.png` | 1024 × 562 | `sunglasses-edit` (edit) | s11 close |
| suitcase | `public/images/stickers/suitcase.png` | 1014 × 1024 | `suitcase-edit` (edit) | s08 join |

- **Contact sheet:** `out/stills/stickers-contact.png` shows every final on Day `#faf9f6` and on Night `#1c1424`. The archived candidates are on `out/stills/stickers-contact-alts.png`.
- **Archived candidates:** `public/images/stickers/_alt/`, each cleaned the same way: `boat-gen.png`, `pastel-edit.png`, `receipt-edit.png`.
- **Raw outputs:** every raw output with its `.meta.json` (request, model, usage, request id) is in `public/images/stickers/_raw/`.
- **Spend:** **11 of 24 generations** used, ≈ **$0.68** in total (token prices from `brief/tooling.md`). Every call used `gpt-image-2.5-sunburst`, `quality: "high"`, `background: "transparent"` and png. No Flare drafts were needed.

### Using them in a scene
```tsx
import { Img, staticFile } from "remotion";
import { STICKERS } from "../../data/stickers";

<Img src={staticFile(STICKERS.groceries.src)} style={{ width: 300, height: "auto" }} />
```
- **Baked-in shadow:** a very subtle eggplant contact shadow (offset 6 px, blur σ 5 px, 22 % at the 1024 px scale) sits inside the 24 px margin. It is invisible on Night. Don't add a second tight shadow. For a "lift" during the pop, a larger CSS shadow in eggplant rgba is fine, e.g. `filter: "drop-shadow(0 8px 24px rgba(43, 27, 58, 0.16))"`; shadows are always eggplant rgba (brand).
- **Size by the long side:** the sunglasses are wide (1.8 : 1) and the receipt is tall (1 : 1.6). Fitting all stickers into the same box keeps the outline and border weights equal across the set.
- **Margin:** every PNG has 24 px of transparent margin at 1024 px (≈ 2.3 %). Account for it when you align edges to the phone.

## Method
1. **Style anchor:** the tram, plain generation at 1536 × 1024. Approved on the first take:
   - a clean die-cut, eggplant outlines, the palette (marigold body, cream roof and band, periwinkle windows) and eggplant running gear;
   - one silhouette and real transparency;
   - **no text**: the destination sign is blank.

   Two flaws were left to post-processing rather than a re-take: the border was thin (1.3 % of the long side) and the model's shadow showed as a halo on Night (see Cleanup).
2. **Consistency A/B on the boat.** Plain generation (`boat-gen`) against `/v1/images/edits` with the tram as a style reference (`boat-edit`), both with the same prompt.
   - **Generation drifted:** it gave a tan wooden mast, boom and gunwale (off palette, 6.5 % yellow-brown pixels), greyer sail shading and lighter linework.
   - **Edit matched the anchor's vocabulary:** structural parts in eggplant like the tram's trolley pole, the same warm cream with soft shading, the same glossy streaks, the same line weight.
   - **No yellow leaked from the marigold tram:** 0 % yellow pixels.
   - **Winner: edit with the anchor as reference**, used for the other six.
3. **The rest:** six edits, run in parallel. Two needed a re-take after review:
   - **pastel:** the first take was painterly (texture strokes, gradients, deep orange-browns) and off the flat style. The re-take adds an explicit flatness paragraph and is in style.
   - **receipt:** the first take was clean, with no yellow, but its strokes were about 1.6× heavier than the set's at equal display size: a simple shape drawn bold. The re-take uses a tall 1024 × 1536 canvas (the receipt's equivalent of the tram's wide one) plus "same medium outline weight as the reference". The outline came down from 22 px to 14 px, in family with the set's 12-16 px.
4. **Review.** Every final was checked:
   - **Format:** on Day and Night, at 2× zoom for edges, and at full resolution for any text.
   - **Content:** no text, letters or digits anywhere, no coins, and no piggy banks.

### Prompts
Every prompt starts with the `04-assets.md` style prefix, verbatim. Then come the sticker's guard rails (`extra`), a set rule and, for edits, a reference rule. `scripts/images-stickers.mjs` holds every candidate exactly as sent, and `node scripts/images-stickers.mjs <id> --dry` prints any prompt for free. The exact final prompts are in the appendix.

- **Set rule** (all): "Everything sits inside one single continuous white die-cut outline, with no separate floating pieces, sparkles or crumbs. The sticker fills most of the canvas with a small even margin." This keeps one silhouette, so no specks, and a similar framing across the set.
- **Reference rule** (edits): "Style reference: the attached image is an approved sticker from the same set. Match its style exactly: … Use it only as a style guide: do not draw a tram or any part of it, and do not copy its colours where they differ from the palette above."
- **Deviation:** "(tram 28)" was dropped from the tram subject. The tooling scout's test tram came back with "CARREIRA Nº 28" and "573" painted on it. The tram prompt also asks for a blank destination sign. Result: no text.
- **Deviation:** the receipt is on a 1024 × 1536 canvas (the brief says 1024 × 1024 except for the tram). This gives the set a consistent line weight, at no extra cost: the tall canvas used fewer output tokens.

## Cleanup (`scripts/images-clean.py`)
It extends the tested snippet in tooling.md §6. Steps 3, 4 and 6 fix problems found in this review.
1. **Alpha floor and ceiling.** Alpha below 16 becomes 0 (the haze). Alpha at 250 or above becomes 255.
2. **Specks and holes.** Keep the main silhouette and drop specks that don't touch it (0-7 px per sticker). Enclosed see-through pixels are composited over the border white.
   - Most are border pixels at alpha 247-249.
   - The suitcase handle's opening (≈ 6k px of grey at alpha ≈ 36) now reads as white sticker backing.
3. **Halo removal.** The model's own "very subtle soft drop shadow" is stored as **light-grey pixels at partial alpha** (mean RGB ≈ 180, alpha ≈ 60). That is a shadow on cream but a **light glow on Night**. The edge is rebuilt from the opaque core: a 0.8 px anti-alias, with edge colours taken from the adjacent border white.
4. **Even border.** The model's border varied from 1.3 % to 2.1 % of the long side, so it is normalised to **2.4 %** by an octagon dilation in the border's own white (measured finals: 2.25-2.46 %). 2.4 % was chosen against 1.3 % and 3.0 % at about 380 px display width: it reads as a real die-cut without looking heavy.
5. **Trim and resize.** Trim, then a premultiplied LANCZOS resize to a 976 px long side, plus the 24 px margin. LANCZOS undershoot clipped edge colours to black at partial alpha, which gave a 1 px dark fringe. Edge pixels are re-coloured from the opaque border next to them (the darkest edge pixel on cream is now luma 204).
6. **Shadow.** One consistent eggplant contact shadow is baked into the margin (see "Using them").

**Gotcha for anyone scripting PIL here:** in Pillow 12, `Image.fromarray()` returns a **read-only** image. `ImageDraw.floodfill` on it silently does nothing, so call `.copy()` first.

## QA (finals, measured by `images-clean.py`)
| Sticker | Border (% of long side) | Outline (px at 1024) | Yellow pixels | Dominant colours (nearest token, RGB distance) |
|---|---|---|---|---|
| tram | 2.25 | 13 | 22 % | #f9b91a ~marigold (10), #34163e ~eggplant (11), cream, white |
| pastel | 2.36 | 12 | 55 % | #fdbd26 ~marigold (12), #f8ba68 ~member-1 (24), #e69836 (43), eggplant |
| groceries | 2.36 | 13 | 63 % | kraft #e9bf8e / #c5aa79 (no token), white, eggplant |
| boat | 2.25 | 12 | 0 % | white, cream, eggplant (17), #c7cdf0 between periwinkle and member-5 (20), #d69bbd ~pink (41) |
| tickets | 2.46 | 14 | 0 % | #fea5c2 ~pink (18), #bfc1f2 ~periwinkle (16), cream, eggplant |
| receipt | 2.36 | 14 | **0 %** | eggplant (7), cream (2-3), white |
| sunglasses | 2.25 | 33 (the frame itself is eggplant) | 0 % | #b0bffd ~periwinkle (11), eggplant, white |
| suitcase | 2.36 | 16 | 0 % | #9addc4 ~mint (6), eggplant, cream, white |

## What didn't come out perfectly
- **Colours are approximate.** The hex codes in the prompt steer the palette but don't pin it; see the distances above. Nothing is wildly off, but no sticker is exactly on the tokens. If a sticker must match a token exactly, recolour that region in post.
- **Groceries:** the bag is a muted kraft tan, the largest off-token area in the set. It is natural for a paper bag and reads correctly, but it is the dullest sticker. I didn't re-take it, because a cream bag would read less like a grocery bag.
- **Pastel:** the caramel spots are stylised eggplant-brown blobs, so it is less literal than a real pastel de nata. The more realistic but painterly first take is in `_alt/pastel-edit.png` if the director prefers recognisability over set consistency.
- **Sunglasses:** the lens reflection is a hard pink diagonal stripe plus a pale stripe, rather than a soft reflection. It is fine at sticker scale.
- **Bundle weight:** `_raw/` (12 MB) and `_alt/` (1.9 MB) sit inside `public/`, which Remotion copies into every bundle. They were kept there for provenance (this task's write scope is `public/images`). Move them outside `public/` if bundle time matters.

## Reproduce
From `marketing/video`:
```bash
node scripts/images-stickers.mjs --count                         # generations used (free)
node scripts/images-stickers.mjs <candidateId> --dry             # print a prompt (free)
node --env-file=../.env scripts/images-stickers.mjs <candidateId> # one paid call; cached by output path
python3 scripts/images-clean.py preview <candidateId> ...         # clean into the scratchpad + QA numbers
python3 scripts/images-clean.py final                             # finals + _alt + src/data/stickers.ts
python3 scripts/images-contact.py --alts                          # contact sheets in out/stills/
```

### Spend log
| # | Candidate | Endpoint | Size | Latency | Tokens (text in / image in / out) | ≈ Cost |
|---|---|---|---|---|---|---|
| 1 | tram-a | generations | 1536 × 1024 | 34.7 s | 245 / 0 / 1372 | $0.042 |
| 2 | boat-gen | generations | 1024² | 39.6 s | 190 / 0 / 1756 | $0.054 |
| 3 | boat-edit | edits | 1024² | 41.7 s | 298 / 1536 / 1756 | $0.067 |
| 4-9 | sunglasses, receipt, suitcase, groceries, pastel, tickets (edit) | edits | 1024² | 40-45 s | ≈ 310 / 1536 / 1756 each | $0.067 each |
| 10 | pastel-edit2 | edits | 1024² | 41.6 s | 362 / 1536 / 1756 | $0.067 |
| 11 | receipt-edit2 | edits | 1024 × 1536 | 34.2 s | 346 / 1536 / 1372 | $0.055 |
| | **Total** | | | | | **≈ $0.68** |

## Appendix: exact final prompts
Generated with `node scripts/images-stickers.mjs <id> --dry`. Above each block: the candidate id, then method · model · quality · size · reference image.

**tram-a** · `generate · gpt-image-2.5-sunburst · high · 1536x1024`
```text
A single glossy die-cut vinyl sticker of a classic yellow Lisbon tram, the iconic vintage streetcar of Lisbon, in three-quarter view. Flat vector illustration with soft, minimal shading and chunky rounded shapes, bold dark eggplant (#2b1b3a) outlines, a limited warm palette of marigold yellow (#ffb320), cream (#faf9f6) and soft periwinkle (#b8c7ff) windows, a thick clean white sticker border all around the shape, and a very subtle soft drop shadow. Centered, isolated on a transparent background. No text, no letters, no numbers, no logos, no coins. The roof is cream; the wheels, bumpers and trolley pole are dark eggplant (#2b1b3a); no grey, no black, no red. The destination sign above the windshield is a blank cream panel: no route number, no fleet number and no lettering anywhere on the tram. Keep it simple and iconic, with few bold details. Everything sits inside one single continuous white die-cut outline, with no separate floating pieces, sparkles or crumbs. The sticker fills most of the canvas with a small even margin.
```

**pastel-edit2** · `edit · gpt-image-2.5-sunburst · high · 1024x1024 · ref public/images/stickers/_raw/tram-a.png`
```text
A single glossy die-cut vinyl sticker of a Portuguese custard tart (pastel de nata) with a caramelized top. Flat vector illustration with soft, minimal shading and chunky rounded shapes, bold dark eggplant (#2b1b3a) outlines, a limited warm palette of cream (#faf9f6), warm marigold (#ffb320) and light brown, a thick clean white sticker border all around the shape, and a very subtle soft drop shadow. Centered, isolated on a transparent background. No text, no letters, no numbers, no logos, no coins. Draw it as flat and simple as the reference sticker: a simple fluted pastry cup with a few chunky rounded folds in light golden brown, holding a smooth warm marigold custard top with three or four soft caramelized spots in dark eggplant-brown. Flat colour areas with one soft shade each: no texture strokes, no painterly detail, no realistic rendering. Seen from a slight three-quarter angle above. No plate, no cinnamon, no steam. Everything sits inside one single continuous white die-cut outline, with no separate floating pieces, sparkles or crumbs. The sticker fills most of the canvas with a small even margin. Style reference: the attached image is an approved sticker from the same set. Match its style exactly: the same bold eggplant outline weight, the same thick white die-cut border, the same flat colours with soft minimal shading, the same glossy highlight and the same very subtle drop shadow, at a similar size on the canvas. Use it only as a style guide: do not draw a tram or any part of it, and do not copy its colours where they differ from the palette above.
```

**groceries-edit** · `edit · gpt-image-2.5-sunburst · high · 1024x1024 · ref public/images/stickers/_raw/tram-a.png`
```text
A single glossy die-cut vinyl sticker of a paper grocery bag with a baguette, oranges and leafy greens peeking out. Flat vector illustration with soft, minimal shading and chunky rounded shapes, bold dark eggplant (#2b1b3a) outlines, a limited warm palette of kraft cream, soft mint (#9ad7c2) and marigold (#ffb320) oranges, a thick clean white sticker border all around the shape, and a very subtle soft drop shadow. Centered, isolated on a transparent background. No text, no letters, no numbers, no logos, no coins. The bag is plain kraft paper with no print, no label and no logo. Everything sits inside one single continuous white die-cut outline, with no separate floating pieces, sparkles or crumbs. The sticker fills most of the canvas with a small even margin. Style reference: the attached image is an approved sticker from the same set. Match its style exactly: the same bold eggplant outline weight, the same thick white die-cut border, the same flat colours with soft minimal shading, the same glossy highlight and the same very subtle drop shadow, at a similar size on the canvas. Use it only as a style guide: do not draw a tram or any part of it, and do not copy its colours where they differ from the palette above.
```

**boat-edit** · `edit · gpt-image-2.5-sunburst · high · 1024x1024 · ref public/images/stickers/_raw/tram-a.png`
```text
A single glossy die-cut vinyl sticker of a small sailboat with a white sail on a little stylized wave. Flat vector illustration with soft, minimal shading and chunky rounded shapes, bold dark eggplant (#2b1b3a) outlines, a limited warm palette of soft periwinkle (#b8c7ff) wave, cream (#faf9f6) sail and a pink (#f5b3c8) hull stripe, a thick clean white sticker border all around the shape, and a very subtle soft drop shadow. Centered, isolated on a transparent background. No text, no letters, no numbers, no logos, no coins. The sail is plain, with no sail number, no emblem and no flag. Everything sits inside one single continuous white die-cut outline, with no separate floating pieces, sparkles or crumbs. The sticker fills most of the canvas with a small even margin. Style reference: the attached image is an approved sticker from the same set. Match its style exactly: the same bold eggplant outline weight, the same thick white die-cut border, the same flat colours with soft minimal shading, the same glossy highlight and the same very subtle drop shadow, at a similar size on the canvas. Use it only as a style guide: do not draw a tram or any part of it, and do not copy its colours where they differ from the palette above.
```

**tickets-edit** · `edit · gpt-image-2.5-sunburst · high · 1024x1024 · ref public/images/stickers/_raw/tram-a.png`
```text
A single glossy die-cut vinyl sticker of two overlapping boat-trip tickets with a perforated edge (no text on them). Flat vector illustration with soft, minimal shading and chunky rounded shapes, bold dark eggplant (#2b1b3a) outlines, a limited warm palette of cream (#faf9f6), pink (#f5b3c8) and periwinkle (#b8c7ff), a thick clean white sticker border all around the shape, and a very subtle soft drop shadow. Centered, isolated on a transparent background. No text, no letters, no numbers, no logos, no coins. One pink ticket overlaps one periwinkle ticket, slightly rotated against each other, each with a cream stub behind a perforated line. Instead of printing, each ticket carries a few simple rounded bars and a tiny wave shape: no words, no letters, no digits, no barcode. Everything sits inside one single continuous white die-cut outline, with no separate floating pieces, sparkles or crumbs. The sticker fills most of the canvas with a small even margin. Style reference: the attached image is an approved sticker from the same set. Match its style exactly: the same bold eggplant outline weight, the same thick white die-cut border, the same flat colours with soft minimal shading, the same glossy highlight and the same very subtle drop shadow, at a similar size on the canvas. Use it only as a style guide: do not draw a tram or any part of it, and do not copy its colours where they differ from the palette above.
```

**receipt-edit2** · `edit · gpt-image-2.5-sunburst · high · 1024x1536 · ref public/images/stickers/_raw/tram-a.png`
```text
A single glossy die-cut vinyl sticker of a long curled paper receipt with abstract lines instead of text. Flat vector illustration with soft, minimal shading and chunky rounded shapes, bold dark eggplant (#2b1b3a) outlines, a limited warm palette of white and cream (#faf9f6) paper with dark eggplant (#2b1b3a) lines only, a thick clean white sticker border all around the shape, and a very subtle soft drop shadow. Centered, isolated on a transparent background. No text, no letters, no numbers, no logos, no coins. Absolutely no yellow, orange, gold or marigold anywhere. A tall strip of receipt paper with a gentle curl at the top and a zigzag torn edge at the bottom, printed with eight to ten abstract lines: plain rounded eggplant bars of different lengths, no characters, no digits, no currency symbols. Use the same medium outline weight as the reference sticker, not heavier. Everything sits inside one single continuous white die-cut outline, with no separate floating pieces, sparkles or crumbs. The sticker fills most of the canvas with a small even margin. Style reference: the attached image is an approved sticker from the same set. Match its style exactly: the same bold eggplant outline weight, the same thick white die-cut border, the same flat colours with soft minimal shading, the same glossy highlight and the same very subtle drop shadow, at a similar size on the canvas. Use it only as a style guide: do not draw a tram or any part of it, and do not copy its colours where they differ from the palette above.
```

**sunglasses-edit** · `edit · gpt-image-2.5-sunburst · high · 1024x1024 · ref public/images/stickers/_raw/tram-a.png`
```text
A single glossy die-cut vinyl sticker of a pair of round sunglasses. Flat vector illustration with soft, minimal shading and chunky rounded shapes, bold dark eggplant (#2b1b3a) outlines, a limited warm palette of dark eggplant (#2b1b3a) frame, soft periwinkle (#b8c7ff) lenses with a soft pink (#f5b3c8) reflection, a thick clean white sticker border all around the shape, and a very subtle soft drop shadow. Centered, isolated on a transparent background. No text, no letters, no numbers, no logos, no coins. Front view, slightly tilted, temple arms folded behind the lenses. Everything sits inside one single continuous white die-cut outline, with no separate floating pieces, sparkles or crumbs. The sticker fills most of the canvas with a small even margin. Style reference: the attached image is an approved sticker from the same set. Match its style exactly: the same bold eggplant outline weight, the same thick white die-cut border, the same flat colours with soft minimal shading, the same glossy highlight and the same very subtle drop shadow, at a similar size on the canvas. Use it only as a style guide: do not draw a tram or any part of it, and do not copy its colours where they differ from the palette above.
```

**suitcase-edit** · `edit · gpt-image-2.5-sunburst · high · 1024x1024 · ref public/images/stickers/_raw/tram-a.png`
```text
A single glossy die-cut vinyl sticker of a small travel suitcase with a few travel stickers on it (stickers without text). Flat vector illustration with soft, minimal shading and chunky rounded shapes, bold dark eggplant (#2b1b3a) outlines, a limited warm palette of soft mint (#9ad7c2), cream (#faf9f6) and pink (#f5b3c8), a thick clean white sticker border all around the shape, and a very subtle soft drop shadow. Centered, isolated on a transparent background. No text, no letters, no numbers, no logos, no coins. A retro hard-shell suitcase with rounded corners and a dark eggplant top handle. The little travel stickers on it are simple pink and cream shapes (a heart, a star, a wave): no words, no letters, no numbers, no flags, no luggage-tag text. Everything sits inside one single continuous white die-cut outline, with no separate floating pieces, sparkles or crumbs. The sticker fills most of the canvas with a small even margin. Style reference: the attached image is an approved sticker from the same set. Match its style exactly: the same bold eggplant outline weight, the same thick white die-cut border, the same flat colours with soft minimal shading, the same glossy highlight and the same very subtle drop shadow, at a similar size on the canvas. Use it only as a style guide: do not draw a tram or any part of it, and do not copy its colours where they differ from the palette above.
```
