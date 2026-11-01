// Animated film grain (research §3.8: 2-3 %, monochrome, seeded per frame, NIGHT ONLY).
// Cheap: four 512² noise tiles are generated once per browser tab (seeded PRNG, deterministic); each
// frame paints one tile as a repeating pattern at a seeded offset onto a half-resolution canvas that
// CSS scales up (softer, filmic grain). ≈1 ms per frame.
// Calibration: overlay blend at opacity 0.35 gives a luminance std of ≈2.1 % on the Night ground
// (#1c1424); 0.5 ≈ 3 %. On cream it is nearly invisible (overlay), which is what we want.
import React, { useLayoutEffect, useRef } from "react";
import { random, useCurrentFrame, useVideoConfig } from "remotion";

const TILE = 512;
const TILE_COUNT = 4;
const tileCache = new Map<string, HTMLCanvasElement[]>();

/** mulberry32: tiny seeded PRNG (deterministic, seeded from remotion's random()). */
const mulberry32 = (a: number) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const getTiles = (seed: string): HTMLCanvasElement[] => {
  const cached = tileCache.get(seed);
  if (cached) return cached;
  const tiles: HTMLCanvasElement[] = [];
  for (let k = 0; k < TILE_COUNT; k++) {
    const c = document.createElement("canvas");
    c.width = TILE;
    c.height = TILE;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(TILE, TILE);
    const rnd = mulberry32(Math.floor(random(`${seed}-tile-${k}`) * 4294967296));
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      // Sum of 3 uniforms ≈ gaussian: grain clusters around mid-grey like film.
      const g = (rnd() + rnd() + rnd()) / 3;
      const v = Math.max(0, Math.min(255, 128 + (g - 0.5) * 2.2 * 255));
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    tiles.push(c);
  }
  tileCache.set(seed, tiles);
  return tiles;
};

export const Grain: React.FC<{
  /** Strength (default 0.35 ≈ 2 % on Night ground; 0.5 ≈ 3 %). */
  opacity?: number;
  /** Grain size in px (canvas is rendered at 1/size resolution, default 2). */
  size?: number;
  /** Frames per grain refresh (default 2 = 30 grain fps at 60 fps, like film). */
  refresh?: number;
  blend?: React.CSSProperties["mixBlendMode"];
  seed?: string;
  /** Size of the area it covers in px (default: the composition size). */
  width?: number;
  height?: number;
  style?: React.CSSProperties;
}> = ({ opacity = 0.35, size = 2, refresh = 2, blend = "overlay", seed = "grain", style, ...box }) => {
  const frame = useCurrentFrame();
  const video = useVideoConfig();
  const width = box.width ?? video.width;
  const height = box.height ?? video.height;
  const ref = useRef<HTMLCanvasElement>(null);
  const cw = Math.ceil(width / size);
  const ch = Math.ceil(height / size);
  const step = Math.floor(frame / Math.max(1, refresh));

  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const tiles = getTiles(seed);
    const tile = tiles[step % tiles.length];
    const ox = Math.floor(random(`${seed}-ox-${step}`) * TILE);
    const oy = Math.floor(random(`${seed}-oy-${step}`) * TILE);
    const pattern = ctx.createPattern(tile, "repeat");
    if (!pattern) return;
    ctx.save();
    ctx.translate(-ox, -oy);
    ctx.fillStyle = pattern;
    ctx.fillRect(ox, oy, cw, ch);
    ctx.restore();
  }, [step, seed, cw, ch]);

  return (
    <canvas
      ref={ref}
      width={cw}
      height={ch}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity,
        mixBlendMode: blend,
        pointerEvents: "none",
        ...style,
      }}
    />
  );
};
