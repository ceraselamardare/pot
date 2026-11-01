// Sticker generation for the Pot video (GPT Image 2.5). Owner: image agent.
// Run ONE candidate at a time, from marketing/video:
//   node --env-file=../.env scripts/images-stickers.mjs <candidateId>          # generate (paid)
//   node scripts/images-stickers.mjs <candidateId> --dry                       # print the prompt only (free)
//   node scripts/images-stickers.mjs --count                                   # generations used so far (free)
//
// Every candidate below is a record of exactly what was sent. Raw outputs (+ .meta.json provenance)
// land in assets-src/stickers/_raw/<candidateId>.png; the cache is keyed by that path, so re-running
// a candidate never re-bills. Cleanup / trim / contact sheet: scripts/images-clean.py, images-contact.py.

import { readdirSync, existsSync } from "node:fs";
import { generateImage, editImage } from "./lib/openai-image.mjs";

const RAW = "assets-src/stickers/_raw";
const CAP = 24; // hard spend cap for this task: generations + edits

/** The style prefix from brief/04-assets.md, verbatim, with {SUBJECT} and {PALETTE} filled in. */
const STYLE = (subject, palette) =>
  `A single glossy die-cut vinyl sticker of ${subject}. Flat vector illustration with soft, minimal shading and chunky rounded shapes, bold dark eggplant (#2b1b3a) outlines, a limited warm palette of ${palette}, a thick clean white sticker border all around the shape, and a very subtle soft drop shadow. Centered, isolated on a transparent background. No text, no letters, no numbers, no logos, no coins.`;

/** Appended to every prompt: one silhouette (no floating bits that become specks) and a set-wide framing. */
const SET_RULES =
  "Everything sits inside one single continuous white die-cut outline, with no separate floating pieces, sparkles or crumbs. The sticker fills most of the canvas with a small even margin.";

/** Base subject + palette per sticker (brief/04-assets.md table), plus subject-specific guard rails. */
const STICKERS = {
  tram: {
    // "(tram 28)" from the brief table is dropped on purpose: the scout's test tram came back with
    // "CARREIRA Nº 28" and "573" painted on it. The blank-sign sentence below targets the same failure.
    subject: "a classic yellow Lisbon tram, the iconic vintage streetcar of Lisbon, in three-quarter view",
    palette: "marigold yellow (#ffb320), cream (#faf9f6) and soft periwinkle (#b8c7ff) windows",
    extra:
      "The roof is cream; the wheels, bumpers and trolley pole are dark eggplant (#2b1b3a); no grey, no black, no red. The destination sign above the windshield is a blank cream panel: no route number, no fleet number and no lettering anywhere on the tram. Keep it simple and iconic, with few bold details.",
    size: "1536x1024",
  },
  pastel: {
    subject: "a Portuguese custard tart (pastel de nata) with a caramelized top",
    palette: "cream (#faf9f6), warm marigold (#ffb320) and light brown",
    extra:
      "Seen from a slight three-quarter angle above: a golden flaky pastry cup holding a glossy custard filling with a few dark caramelized spots. No plate, no cinnamon, no steam.",
  },
  groceries: {
    subject: "a paper grocery bag with a baguette, oranges and leafy greens peeking out",
    palette: "kraft cream, soft mint (#9ad7c2) and marigold (#ffb320) oranges",
    extra: "The bag is plain kraft paper with no print, no label and no logo.",
  },
  boat: {
    subject: "a small sailboat with a white sail on a little stylized wave",
    palette: "soft periwinkle (#b8c7ff) wave, cream (#faf9f6) sail and a pink (#f5b3c8) hull stripe",
    extra: "The sail is plain, with no sail number, no emblem and no flag.",
  },
  tickets: {
    subject: "two overlapping boat-trip tickets with a perforated edge (no text on them)",
    palette: "cream (#faf9f6), pink (#f5b3c8) and periwinkle (#b8c7ff)",
    extra:
      "One pink ticket overlaps one periwinkle ticket, slightly rotated against each other, each with a cream stub behind a perforated line. Instead of printing, each ticket carries a few simple rounded bars and a tiny wave shape: no words, no letters, no digits, no barcode.",
  },
  receipt: {
    subject: "a long curled paper receipt with abstract lines instead of text",
    palette: "white and cream (#faf9f6) paper with dark eggplant (#2b1b3a) lines only",
    extra:
      "Absolutely no yellow, orange, gold or marigold anywhere. The printed lines are plain rounded eggplant bars of different lengths: no characters, no digits, no currency symbols. A zigzag torn edge at the bottom and a gentle curl.",
  },
  sunglasses: {
    subject: "a pair of round sunglasses",
    palette: "dark eggplant (#2b1b3a) frame, soft periwinkle (#b8c7ff) lenses with a soft pink (#f5b3c8) reflection",
    extra: "Front view, slightly tilted, temple arms folded behind the lenses.",
  },
  suitcase: {
    subject: "a small travel suitcase with a few travel stickers on it (stickers without text)",
    palette: "soft mint (#9ad7c2), cream (#faf9f6) and pink (#f5b3c8)",
    extra:
      "A retro hard-shell suitcase with rounded corners and a dark eggplant top handle. The little travel stickers on it are simple pink and cream shapes (a heart, a star, a wave): no words, no letters, no numbers, no flags, no luggage-tag text.",
  },
};

/** Sentence that turns the prefix into a reference-guided edit (method "edit"). */
const REF_RULES =
  "Style reference: the attached image is an approved sticker from the same set. Match its style exactly: the same bold eggplant outline weight, the same thick white die-cut border, the same flat colours with soft minimal shading, the same glossy highlight and the same very subtle drop shadow, at a similar size on the canvas. Use it only as a style guide: do not draw a tram or any part of it, and do not copy its colours where they differ from the palette above.";

const ANCHOR = `${RAW}/tram-a.png`; // the approved style anchor (set after review)

/**
 * Candidates: one entry per paid call. Keep them all, as the record of what was sent.
 * method: "generate" (POST /v1/images/generations) | "edit" (POST /v1/images/edits with the anchor as reference)
 */
const CANDIDATES = {
  // 1. Style anchor. Approved as is: clean die-cut, eggplant outlines, on-palette, no text, one silhouette.
  "tram-a": { sticker: "tram", method: "generate" },
  // 2. Consistency A/B on a sticker with a different palette (also shows any yellow leaking from the ref).
  "boat-gen": { sticker: "boat", method: "generate" },
  "boat-edit": { sticker: "boat", method: "edit" },
  // Result: edit wins (eggplant structure like the tram, same cream + gloss; plain gen drifted to tan wood).
  // 3. The rest, by the winning method: edit with the tram anchor as style reference.
  "pastel-edit": { sticker: "pastel", method: "edit" },
  "groceries-edit": { sticker: "groceries", method: "edit" },
  "tickets-edit": { sticker: "tickets", method: "edit" },
  "receipt-edit": { sticker: "receipt", method: "edit" },
  "sunglasses-edit": { sticker: "sunglasses", method: "edit" },
  "suitcase-edit": { sticker: "suitcase", method: "edit" },
  // 4. Re-takes after review.
  // pastel-edit came back painterly (texture strokes, gradients, deep orange-brown): off the flat set style.
  "pastel-edit2": {
    sticker: "pastel",
    method: "edit",
    extra:
      "Draw it as flat and simple as the reference sticker: a simple fluted pastry cup with a few chunky rounded folds in light golden brown, holding a smooth warm marigold custard top with three or four soft caramelized spots in dark eggplant-brown. Flat colour areas with one soft shade each: no texture strokes, no painterly detail, no realistic rendering. Seen from a slight three-quarter angle above. No plate, no cinnamon, no steam.",
  },
  // receipt-edit is clean but its strokes are ~1.6x heavier than the set's at equal display size (a simple
  // shape drawn bold). Tall canvas (the receipt's analogue of the tram's wide one) + explicit line weight.
  "receipt-edit2": {
    sticker: "receipt",
    method: "edit",
    size: "1024x1536",
    extra:
      "Absolutely no yellow, orange, gold or marigold anywhere. A tall strip of receipt paper with a gentle curl at the top and a zigzag torn edge at the bottom, printed with eight to ten abstract lines: plain rounded eggplant bars of different lengths, no characters, no digits, no currency symbols. Use the same medium outline weight as the reference sticker, not heavier.",
  },
};

function buildPrompt(c) {
  const s = STICKERS[c.sticker];
  const base = `${STYLE(c.subject ?? s.subject, c.palette ?? s.palette)} ${c.extra ?? s.extra} ${SET_RULES}`;
  return c.method === "edit" ? `${base} ${REF_RULES}` : base;
}

function usedCount() {
  if (!existsSync(RAW)) return 0;
  return readdirSync(RAW).filter((f) => f.endsWith(".png.meta.json")).length;
}

const [id, ...flags] = process.argv.slice(2);
if (id === "--count" || !id) {
  console.log(`generations used: ${usedCount()} / ${CAP}`);
  if (!id) console.log(`candidates: ${Object.keys(CANDIDATES).join(", ")}`);
  process.exit(0);
}
const c = CANDIDATES[id];
if (!c) throw new Error(`unknown candidate ${id}`);
const prompt = buildPrompt(c);
const outPath = `${RAW}/${id}.png`;
const size = c.size ?? STICKERS[c.sticker].size ?? "1024x1024";
const model = c.model ?? "gpt-image-2.5-sunburst";
const quality = c.quality ?? "high";

console.log(`[${id}] ${c.method} · ${model} · ${quality} · ${size}${c.method === "edit" ? ` · ref ${c.ref ?? ANCHOR}` : ""}`);
console.log(prompt);
if (flags.includes("--dry")) process.exit(0);

if (existsSync(outPath)) {
  console.log(`cached: ${outPath} (no call)`);
  process.exit(0);
}
const used = usedCount();
if (used >= CAP) throw new Error(`spend cap reached: ${used}/${CAP} generations`);

const common = { prompt, model, size, quality, background: "transparent", outputFormat: "png", outPath };
const r =
  c.method === "edit"
    ? await editImage({ ...common, images: [c.ref ?? ANCHOR] })
    : await generateImage(common);
console.log(`${r.cached ? "cached" : "generated"} ${r.outPath} · ${r.latencyMs ?? 0} ms · usage ${JSON.stringify(r.usage)}`);
console.log(`generations used: ${usedCount()} / ${CAP}`);
