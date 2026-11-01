// Small geometry helpers for wipes and floods.

export type Dir4 = "left" | "right" | "up" | "down";

/** Unit vector of a travel direction. */
export const dirVec = (d: Dir4): [number, number] => (d === "left" ? [-1, 0] : d === "right" ? [1, 0] : d === "up" ? [0, -1] : [0, 1]);

/** Angle (deg) of a travel direction: right 0, down 90, left 180, up 270. */
export const dirAngle = (d: Dir4) => (d === "right" ? 0 : d === "down" ? 90 : d === "left" ? 180 : 270);

/** Half-extent of a W×H frame projected on unit vector u (distance from centre to the farthest edge). */
export const halfExtent = (W: number, H: number, ux: number, uy: number) => (W * Math.abs(ux) + H * Math.abs(uy)) / 2;

/** Polygon (CSS clip-path) of the part of the W×H box where (P − C)·u ≤ t (C = box centre). */
export const halfPlanePolygon = (W: number, H: number, ux: number, uy: number, t: number): string => {
  const cx = W / 2;
  const cy = H / 2;
  const pts: [number, number][] = [
    [0, 0],
    [W, 0],
    [W, H],
    [0, H],
  ];
  const s = (p: [number, number]) => (p[0] - cx) * ux + (p[1] - cy) * uy - t;
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const sa = s(a);
    const sb = s(b);
    if (sa <= 0) out.push(a);
    if ((sa <= 0 && sb > 0) || (sa > 0 && sb <= 0)) {
      const k = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
    }
  }
  if (out.length < 3) return "polygon(0px 0px, 0px 0px, 0px 0px)";
  return `polygon(${out.map(([x, y]) => `${x.toFixed(2)}px ${y.toFixed(2)}px`).join(", ")})`;
};

/** Distance from point (x, y) to the farthest corner of a W×H box. */
export const farCorner = (W: number, H: number, x: number, y: number) =>
  Math.max(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y));
