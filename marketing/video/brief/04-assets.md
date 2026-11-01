# Asset list v1

Owner: the director.

## Images (OpenAI image model; the image agent owns them)
All images are **die-cut stickers** in **one consistent style**. They add real-world flavour beside the phone and are never the hero. Output goes to `public/images/stickers/<name>.png`: transparent, trimmed to bounds plus a 24 px margin, longest side 1024 px.

**Style prompt (use it verbatim as the prefix of every sticker prompt):**
> A single glossy die-cut vinyl sticker of {SUBJECT}. Flat vector illustration with soft, minimal shading and chunky rounded shapes, bold dark eggplant (#2b1b3a) outlines, a limited warm palette of {PALETTE}, a thick clean white sticker border all around the shape, and a very subtle soft drop shadow. Centered, isolated on a transparent background. No text, no letters, no numbers, no logos, no coins.

| Name | Subject | Palette | Used in |
|---|---|---|---|
| tram | a classic yellow Lisbon tram (tram 28), three-quarter view | marigold yellow (#ffb320), cream (#faf9f6), soft periwinkle (#b8c7ff) windows | s07 create |
| pastel | a Portuguese custard tart (pastel de nata) with a caramelized top | cream, warm marigold, light brown | s07 / s08 accent |
| groceries | a paper grocery bag with a baguette, oranges and leafy greens peeking out | kraft cream, soft mint (#9ad7c2), marigold oranges | s09 instant |
| boat | a small sailboat with a white sail on a little stylized wave | periwinkle (#b8c7ff) wave, cream sail, pink (#f5b3c8) hull stripe | s10 group |
| tickets | two overlapping boat-trip tickets with a perforated edge (no text on them) | cream, pink (#f5b3c8), periwinkle | s10 group |
| receipt | a long curled paper receipt with abstract lines instead of text | white and cream paper, eggplant lines only, NO yellow | s02 front (Act 1 has no marigold) |
| sunglasses | a pair of round sunglasses | eggplant frame, periwinkle lenses with a soft pink reflection | s11 close (end of trip) |
| suitcase | a small travel suitcase with a few travel stickers on it (stickers without text) | mint (#9ad7c2), cream, pink | s08 join |

**Process:**
1. Generate the **tram** first as the style anchor and review it.
2. Generate the rest with the same prompt prefix. If the image model's edit endpoint accepts reference images, pass the anchor sticker as a style reference for consistency.
3. Check alpha, trim, resize and build a contact sheet, `out/stills/stickers-contact.png`, for director review.
4. Two candidates per sticker at most. Keep the best and archive the other under `public/images/stickers/_alt/`.

## Audio (ElevenLabs; the audio agent owns it)
- **VO:** one clip per script line in `brief/02-script.md` → `public/audio/vo/<id>.mp3` + `src/data/vo/<id>.json` (word timings) + `src/data/vo-data.ts` (the registry).
- **SFX:** every name in `src/audio/sfx.ts` → `public/audio/sfx/<name>.mp3`.
- **Music:** one 120 BPM instrumental, `public/audio/music/pot-theme.mp3`, built from a composition plan whose sections match the act boundaries in `src/data/timeline.ts`. It is generated after the timeline is locked.
