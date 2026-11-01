"""Sticker cleanup + QA for the Pot video. Owner: image agent. No API calls, no keys.

Run from marketing/video:
  python3 scripts/images-clean.py preview <candidateId> [...]   # clean raw candidates into the scratchpad + print QA
  python3 scripts/images-clean.py final                         # write the selected finals / alts + src/data/stickers.ts

Pipeline (brief/tooling.md section 6, plus fixes found in review):
  1. alpha < 16 -> 0 (the model's matte haze); alpha >= 250 -> 255 (its "opaque" tops out at 253-254).
  2. Keep the main silhouette; drop isolated specks that do not touch it. Report enclosed holes.
  3. Rebuild a crisp anti-aliased edge from the opaque core. The model's own soft "drop shadow" is stored
     as light-grey pixels at partial alpha: a shadow on cream but a light HALO on Night, so it is removed,
     and edge pixels take the colour of the white border next to them (no grey fringe).
  4. Even out the white die-cut border to BORDER_T of the sticker's long side (octagon dilation in the
     border's own white), so every sticker in the set has the same relative border weight.
  5. Trim to the alpha bounds, premultiplied LANCZOS resize so the long side is 1024 px incl. a 24 px margin.
  6. Bake one consistent, very subtle eggplant (#2b1b3a) contact shadow inside the margin (brand rule:
     shadows are rgba of eggplant). Invisible on Night, a soft lift on the Day cream.
"""

import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

RAW = "assets-src/stickers/_raw"
OUT = "public/images/stickers"
ALT = "assets-src/stickers/_alt"
TS = "src/data/stickers.ts"
SCRATCH = os.environ.get("SCRATCH", "/tmp/pot-stickers")
FLOOR, CEIL, MARGIN, LONG = 16, 250, 24, 1024
CONTENT = LONG - 2 * MARGIN
DAY, NIGHT = (0xFA, 0xF9, 0xF6), (0x1C, 0x14, 0x24)
EGGPLANT = np.array([0x2B, 0x1B, 0x3A], np.float32)
BORDER_T = 0.024  # target white border width as a fraction of the sticker's long side (None = keep the model's)
SHADOW = {"dy": 6, "sigma": 5.0, "opacity": 0.22}  # at the final 1024 px scale; extent ~6 + 3*5 = 21 px < margin

# Final pick per sticker and the archived other candidate(s). Order = order in STICKERS (ts) and the sheet.
SELECTION = {
    # name: (final candidate id, [alt candidate ids])
    "tram": ("tram-a", []),
    "pastel": ("pastel-edit2", ["pastel-edit"]),
    "groceries": ("groceries-edit", []),
    "boat": ("boat-edit", ["boat-gen"]),
    "tickets": ("tickets-edit", []),
    "receipt": ("receipt-edit2", ["receipt-edit"]),
    "sunglasses": ("sunglasses-edit", []),
    "suitcase": ("suitcase-edit", []),
}

TOKENS = {
    "eggplant": "#2b1b3a", "marigold": "#ffb320", "cream": "#faf9f6", "white": "#ffffff",
    "periwinkle": "#b8c7ff", "mint": "#9ad7c2", "pink": "#f5b3c8", "member-1": "#ffd166",
    "brand-soft": "#ffe7a8", "brand-deep": "#b87800", "sunken": "#f1eee9", "line": "#e6e1da",
    "member-5": "#d7c1f0", "member-6": "#c9e3a6", "ink-muted": "#645a70", "line-strong": "#8f8597",
}


def hex2rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def L(mask_or_u8):
    """Writable PIL "L" image from a bool / uint8 array (Pillow 12's fromarray is read-only)."""
    arr = mask_or_u8.astype(np.uint8) * 255 if mask_or_u8.dtype == bool else mask_or_u8.astype(np.uint8)
    return Image.fromarray(arr, "L").copy()


def blur(arr_u8, sigma):
    return np.array(L(arr_u8).filter(ImageFilter.GaussianBlur(sigma))).astype(np.float32)


def keep_main(mask):
    """Main silhouette (4-connected flood fill from its centre) plus any component 8-touching it."""
    pts = np.argwhere(mask)
    cy, cx = pts.mean(axis=0)
    seed = pts[np.argmin((pts[:, 0] - cy) ** 2 + (pts[:, 1] - cx) ** 2)]
    m = L(mask)
    ImageDraw.floodfill(m, (int(seed[1]), int(seed[0])), 128, thresh=0)
    lab = np.array(m)
    main, left = lab == 128, lab == 255
    h, w = mask.shape
    seen = np.zeros_like(left)
    out = mask.copy()
    n = px = 0
    for y0, x0 in np.argwhere(left):
        if seen[y0, x0]:
            continue
        comp, touches = [], False
        q = deque([(y0, x0)])
        seen[y0, x0] = True
        while q:
            y, x = q.popleft()
            comp.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w:
                        if main[ny, nx]:
                            touches = True
                        elif left[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            q.append((ny, nx))
        if not touches:
            ys, xs = zip(*comp)
            out[list(ys), list(xs)] = False
            n += 1
            px += len(comp)
    return out, n, px


def holes(mask):
    """Non-core pixels fully enclosed by the sticker (semi-transparent specks inside it; a die-cut
    sticker has no holes). Returns their mask."""
    m = L(np.pad(~mask, 1, constant_values=True))
    ImageDraw.floodfill(m, (0, 0), 128, thresh=0)
    return (np.array(m) == 255)[1:-1, 1:-1]


def rings(mask, rgb, n=60):
    """(white share, dark share, pixels) of successive 1 px rings from the outside of mask inwards."""
    white = rgb.min(axis=2) >= 220
    luma = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    dark = luma < 90
    cur, out = L(mask), []
    for _ in range(n):
        nxt = cur.filter(ImageFilter.MinFilter(3))
        ring = (np.array(cur) > 0) & ~(np.array(nxt) > 0)
        if not ring.any():
            break
        out.append((float(white[ring].mean()), float(dark[ring].mean()), ring))
        cur = nxt
    return out


def border_outline(rs):
    """White border width = leading rings that are mostly white (ring 0 may be partial); outline width =
    the next run of mostly-dark rings, after at most 3 transition rings."""
    k = 0
    while k < len(rs) and (rs[k][0] >= 0.5 or k == 0):
        k += 1
    j = k
    while j < min(k + 3, len(rs)) and rs[j][1] < 0.5:
        j += 1
    o = j
    while o < len(rs) and rs[o][1] >= 0.5:
        o += 1
    return k, o - j


def dilate_octagon(mask, n):
    """Binary dilation alternating cross / square steps: an octagon close to a disc of radius n."""
    m = mask
    for i in range(n):
        p = np.pad(m, 1)
        c = p[1:-1, 1:-1] | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
        if i % 2:
            c = c | p[:-2, :-2] | p[:-2, 2:] | p[2:, :-2] | p[2:, 2:]
        m = c
    return m


def over(c_top, a_top, c_bot, a_bot):
    """Porter-Duff source-over on float colour (H,W,3) and alpha (H,W) in 0..1."""
    a = a_top + a_bot * (1 - a_top)
    c = (c_top * a_top[..., None] + c_bot * (a_bot * (1 - a_top))[..., None]) / np.maximum(a, 1e-6)[..., None]
    return c, a


def clean(src, dst, border_t=BORDER_T, shadow=SHADOW):
    raw = np.array(Image.open(src).convert("RGBA"))
    alpha = raw[..., 3].copy()
    st = {"raw_size": f"{raw.shape[1]}x{raw.shape[0]}", "haze_px": int(((alpha > 0) & (alpha < FLOOR)).sum())}
    alpha[alpha < FLOOR] = 0
    alpha[alpha >= CEIL] = 255
    st["halo_px"] = int(((alpha > 0) & (alpha < 255)).sum())  # soft shadow / glow pixels that get replaced

    core, st["specks_removed"], st["speck_px"] = keep_main(alpha == 255)
    hole = holes(core)
    st["holes_filled_px"] = int(hole.sum())
    core = core | hole

    # the white border: its width (raw px) and its own colour (median of the rings just inside the edge)
    rs = rings(core, raw[..., :3].astype(int))
    b_raw, _ = border_outline(rs)
    white_px = np.concatenate([raw[..., :3][r[2]] for r in rs[1:max(2, min(6, b_raw))]])
    bcol = np.median(white_px, axis=0).astype(np.float32) if b_raw >= 3 else np.array([255, 255, 255], np.float32)

    # enclosed holes become opaque: composite them over the border white, i.e. the sticker's backing shows
    # through (border pixels at alpha 247-249 stay white; a see-through handle opening becomes near-white)
    rgb = raw[..., :3].astype(np.float32)
    ha = (raw[..., 3].astype(np.float32) / 255.0)[..., None]
    rgb = np.where(hole[..., None], rgb * ha + bcol * (1 - ha), rgb)

    # 3. crisp edge from the core + edge colours from the neighbouring border (no grey fringe)
    a_soft = np.maximum(blur(core, 0.8), core * 255.0) / 255.0
    masked = np.where(core[..., None], rgb, 0).clip(0, 255).astype(np.uint8)
    grown = np.stack([np.array(L(masked[..., i]).filter(ImageFilter.MaxFilter(5))) for i in range(3)], -1)
    rgb = np.where(core[..., None], rgb, grown.astype(np.float32))

    # 4. even out the border: add d raw px so that (b + d) / (Lsize + 2d) = border_t
    ys, xs = np.nonzero(core)
    lsize = max(xs.max() - xs.min() + 1, ys.max() - ys.min() + 1)
    st["border_raw_pct"] = round(100 * b_raw / lsize, 2)
    d = 0
    if border_t:
        d = int(round((border_t * lsize - b_raw) / (1 - 2 * border_t)))
    st["border_added_raw_px"] = max(d, 0)
    if d > 0:
        pad = d + 4
        corep = np.pad(core, pad)
        dil = dilate_octagon(corep, d)
        a_dil = np.maximum(blur(dil, 0.8), dil * 255.0) / 255.0
        rgbp = np.pad(rgb, ((pad, pad), (pad, pad), (0, 0)))
        a_softp = np.pad(a_soft, pad)
        rgb, a_soft = over(rgbp, a_softp, np.broadcast_to(bcol, rgbp.shape), a_dil)

    # 5. trim + premultiplied resize + margin
    ys, xs = np.nonzero(a_soft > 0.004)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgb, a_soft = rgb[y0:y1, x0:x1], a_soft[y0:y1, x0:x1]
    h, w = a_soft.shape
    s = CONTENT / max(w, h)
    nw, nh = round(w * s), round(h * s)
    pm = np.dstack([rgb * a_soft[..., None], a_soft * 255.0]).clip(0, 255).astype(np.uint8)
    small = np.array(Image.fromarray(pm, "RGBA").resize((nw, nh), Image.LANCZOS)).astype(np.float32)
    fa = (small[..., 3] / 255.0).clip(0, 1)
    fc = small[..., :3] / np.maximum(fa, 1e-6)[..., None]
    # LANCZOS undershoot clips the premultiplied colour to 0 where alpha is still > 0: a near-black fringe.
    # Partial alpha only exists on the outer edge (the interior is opaque), so take the edge colour from
    # the opaque border pixels within 3 px.
    op = fa >= 0.999
    src8 = np.where(op[..., None], fc, 0).clip(0, 255).astype(np.uint8)
    grown = np.stack([np.array(L(src8[..., i]).filter(ImageFilter.MaxFilter(7))) for i in range(3)], -1)
    edge = (fa > 0) & ~op & (grown.max(axis=2) > 0)
    fc[edge] = grown[edge]
    H, W = nh + 2 * MARGIN, nw + 2 * MARGIN
    C = np.zeros((H, W, 3), np.float32)
    A = np.zeros((H, W), np.float32)
    C[MARGIN:MARGIN + nh, MARGIN:MARGIN + nw] = fc.clip(0, 255)
    A[MARGIN:MARGIN + nh, MARGIN:MARGIN + nw] = fa
    st["scale"] = round(s, 3)

    # 6. subtle eggplant contact shadow inside the margin
    if shadow:
        sh = blur((A * 255).astype(np.uint8), shadow["sigma"]) / 255.0
        sh = np.roll(sh, shadow["dy"], axis=0)
        sh[: shadow["dy"]] = 0
        C, A = over(C, A, np.broadcast_to(EGGPLANT, C.shape), sh * shadow["opacity"])

    A8 = np.round(A * 255)
    A8[A8 < 3] = 0
    A8[A8 >= CEIL] = 255
    out = np.dstack([np.where(A8[..., None] > 0, C, 0), A8]).clip(0, 255).astype(np.uint8)
    im = Image.fromarray(out, "RGBA")
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    im.save(dst, optimize=True)
    return im, st


def qa(im):
    """Final-image QA: border / outline width (px and % of the long side), yellow share, dominant colours."""
    a = np.array(im)
    rgb, al = a[..., :3].astype(int), a[..., 3]
    content_long = max(im.size) - 2 * MARGIN
    b, o = border_outline(rings(al >= 128, rgb))
    op = al == 255
    hsv = np.array(im.convert("RGB").convert("HSV")).astype(int)
    yellow = op & (hsv[..., 0] >= 14) & (hsv[..., 0] <= 43) & (hsv[..., 1] >= 89) & (hsv[..., 2] >= 115)
    px = rgb[op]
    q = Image.fromarray(px.reshape(1, -1, 3).astype(np.uint8), "RGB").quantize(8, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[:24]
    dom = []
    for cnt, idx in sorted(q.getcolors(), reverse=True)[:6]:
        c = tuple(pal[idx * 3: idx * 3 + 3])
        name, d = min(((n, sum((x - y) ** 2 for x, y in zip(c, hex2rgb(hx))) ** 0.5) for n, hx in TOKENS.items()), key=lambda t: t[1])
        dom.append(f"#{c[0]:02x}{c[1]:02x}{c[2]:02x} {cnt / len(px):.0%} ~{name}({d:.0f})")
    return {
        "size": f"{im.width}x{im.height}",
        "border_px": b, "border_pct": round(100 * b / content_long, 2),
        "outline_px": o, "outline_pct": round(100 * o / content_long, 2),
        "yellow_pct": round(100 * yellow.sum() / max(op.sum(), 1), 2),
        "dominant": dom,
    }


def on_ground(im, color, scale=1.0):
    g = Image.new("RGBA", im.size, color + (255,))
    g.alpha_composite(im)
    g = g.convert("RGB")
    if scale != 1.0:
        g = g.resize((round(g.width * scale), round(g.height * scale)), Image.LANCZOS)
    return g


def preview(cid, **kw):
    im, st = clean(f"{RAW}/{cid}.png", f"{SCRATCH}/{cid}.png", **kw)
    st.update(qa(im))
    d, n = on_ground(im, DAY, 0.5), on_ground(im, NIGHT, 0.5)
    sbs = Image.new("RGB", (d.width + n.width, d.height))
    sbs.paste(d, (0, 0))
    sbs.paste(n, (d.width, 0))
    sbs.save(f"{SCRATCH}/{cid}-sbs.jpg", quality=92)
    print(cid, json.dumps(st, default=str))
    return im, st


def final():
    entries = []
    for name, (pick, alts) in SELECTION.items():
        im, st = clean(f"{RAW}/{pick}.png", f"{OUT}/{name}.png")
        st.update(qa(im))
        print(f"{name:<11} <- {pick:<14} {json.dumps(st, default=str)}")
        entries.append((name, im.width, im.height))
        for alt in alts:
            clean(f"{RAW}/{alt}.png", f"{ALT}/{alt}.png")
            print(f"{'':<11}    alt {alt} -> {ALT}/{alt}.png")
    lines = [
        "// Die-cut sticker images for the Pot video (GPT Image 2.5, cleaned by scripts/images-clean.py).",
        "// Transparent PNGs: the sticker + a 24 px margin, longest side 1024 px. width/height are the",
        "// intrinsic pixel sizes. A very subtle eggplant contact shadow is baked into the margin (invisible",
        "// on Night), so don't stack a second tight shadow; a larger lift shadow during a pop is fine.",
        "// Usage: <Img src={staticFile(STICKERS.tram.src)} style={{ width: 360 }} />",
        "// Prompts, method and review notes: brief/images-notes.md. Generated file: re-run",
        "// `python3 scripts/images-clean.py final` from marketing/video instead of editing it.",
        "",
        "export const STICKERS = {",
    ]
    for name, w, h in entries:
        lines.append(f'  {name}: {{ src: "images/stickers/{name}.png", width: {w}, height: {h} }},')
    lines += ["} as const;", "", "export type StickerName = keyof typeof STICKERS;", ""]
    with open(TS, "w") as f:
        f.write("\n".join(lines))
    print(f"wrote {TS} ({len(entries)} stickers)")


if __name__ == "__main__":
    mode, *args = sys.argv[1:]
    if mode == "preview":
        for cid in args:
            preview(cid)
    elif mode == "final":
        final()
    else:
        raise SystemExit("usage: images-clean.py preview <candidateId>... | final")
