"""Contact sheet for the sticker set: every final on the Day cream and on the Night ground (edge-halo check).
Run from marketing/video after `python3 scripts/images-clean.py final`:
  python3 scripts/images-contact.py            -> out/stills/stickers-contact.png
  python3 scripts/images-contact.py --alts     -> also out/stills/stickers-contact-alts.png (the archived candidates)
No API calls. Fonts: the brand's Gabarito / Figtree TTFs from apps/web/assets/fonts (read only).
"""

import importlib.util
import os
import sys

from PIL import Image, ImageDraw, ImageFont

spec = importlib.util.spec_from_file_location("ic", "scripts/images-clean.py")
ic = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ic)

FONTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../apps/web/assets/fonts")
DISPLAY = ImageFont.truetype(f"{FONTS}/Gabarito-ExtraBold.ttf", 34)
LABEL = ImageFont.truetype(f"{FONTS}/Figtree-SemiBold.ttf", 22)
SMALL = ImageFont.truetype(f"{FONTS}/Figtree-SemiBold.ttf", 18)
INK = {"day": (0x2B, 0x1B, 0x3A), "night": (0xF6, 0xF1, 0xEA)}
MUTED = {"day": (0x64, 0x5A, 0x70), "night": (0xBD, 0xB2, 0xC8)}
GROUND = {"day": ic.DAY, "night": ic.NIGHT}
COLS, CELL_W, CELL_H, BOX_W, BOX_H, PAD, HEAD = 4, 420, 400, 340, 300, 30, 84


def panel(items, theme, title):
    rows = (len(items) + COLS - 1) // COLS
    p = Image.new("RGB", (COLS * CELL_W + 2 * PAD, HEAD + rows * CELL_H + PAD), GROUND[theme])
    d = ImageDraw.Draw(p)
    d.text((PAD + 10, 26), title, fill=INK[theme], font=DISPLAY)
    for i, (name, path) in enumerate(items):
        im = Image.open(path).convert("RGBA")
        s = min(BOX_W / im.width, BOX_H / im.height)
        t = im.convert("RGBa").resize((round(im.width * s), round(im.height * s)), Image.LANCZOS).convert("RGBA")
        cx = PAD + (i % COLS) * CELL_W + CELL_W // 2
        top = HEAD + (i // COLS) * CELL_H
        p.paste(t, (cx - t.width // 2, top + (BOX_H - t.height) // 2 + 10), t)
        d.text((cx, top + BOX_H + 34), name, fill=INK[theme], font=LABEL, anchor="ms")
        d.text((cx, top + BOX_H + 58), f"{im.width} × {im.height}", fill=MUTED[theme], font=SMALL, anchor="ms")
    return p


def sheet(items, out, what):
    day = panel(items, "day", f"{what} · Day #faf9f6")
    night = panel(items, "night", f"{what} · Night #1c1424")
    s = Image.new("RGB", (day.width, day.height + night.height))
    s.paste(day, (0, 0))
    s.paste(night, (0, day.height))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    s.save(out, optimize=True)
    print(out, s.size)


if __name__ == "__main__":
    finals = [(n, f"{ic.OUT}/{n}.png") for n in ic.SELECTION]
    sheet(finals, "out/stills/stickers-contact.png", f"Stickers ({len(finals)})")
    if "--alts" in sys.argv:
        alts = [(a, f"{ic.ALT}/{a}.png") for _, (_, al) in ic.SELECTION.items() for a in al]
        sheet(alts, "out/stills/stickers-contact-alts.png", f"Archived candidates ({len(alts)})")
