// Die-cut sticker images for the Pot video (GPT Image 2.5, cleaned by scripts/images-clean.py).
// Transparent PNGs: the sticker + a 24 px margin, longest side 1024 px. width/height are the
// intrinsic pixel sizes. A very subtle eggplant contact shadow is baked into the margin (invisible
// on Night), so don't stack a second tight shadow; a larger lift shadow during a pop is fine.
// Usage: <Img src={staticFile(STICKERS.tram.src)} style={{ width: 360 }} />
// Prompts, method and review notes: brief/images-notes.md. Generated file: re-run
// `python3 scripts/images-clean.py final` from marketing/video instead of editing it.

export const STICKERS = {
  tram: { src: "images/stickers/tram.png", width: 1024, height: 867 },
  pastel: { src: "images/stickers/pastel.png", width: 1024, height: 824 },
  groceries: { src: "images/stickers/groceries.png", width: 782, height: 1024 },
  boat: { src: "images/stickers/boat.png", width: 891, height: 1024 },
  tickets: { src: "images/stickers/tickets.png", width: 1024, height: 1014 },
  receipt: { src: "images/stickers/receipt.png", width: 635, height: 1024 },
  sunglasses: { src: "images/stickers/sunglasses.png", width: 1024, height: 562 },
  suitcase: { src: "images/stickers/suitcase.png", width: 1014, height: 1024 },
} as const;

export type StickerName = keyof typeof STICKERS;
