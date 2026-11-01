// Colour helpers for motion graphics. They never invent colours: they only add alpha to token hex
// values or blend two token colours (brand rule: gradients may blend token colours only).
import { day, night } from "../brand/tokens";

/** "#ffb320" + 0.4 → "rgba(255, 179, 32, 0.4)". Use with token values only. */
export const alpha = (hex: string, a: number): string => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a))})`;
};

/** Linear blend of two token colours (t = 0 → a, 1 → b). */
export const blend = (a: string, b: string, t: number): string => {
  const pa = alpha(a, 1).match(/\d+/g)!.map(Number);
  const pb = alpha(b, 1).match(/\d+/g)!.map(Number);
  const c = [0, 1, 2].map((i) => Math.round(pa[i] + (pb[i] - pa[i]) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
};

/** Eggplant (Day ink / on-brand) is the only shadow colour, per the brand. */
export const EGGPLANT = day.ink;

/** Depth shadow for an element floating `lift` px above its surface (0 = resting card shadow).
 *  Built from the token card shadow recipe, deepening with height. Blur and offset are capped (≤ 70 px /
 *  ≤ 48 px): Chrome clips very large box-shadow blurs on 3D-transformed layers to a hard rectangle. */
export const depthShadow = (lift: number, theme: "day" | "night" = "day"): string => {
  const l = Math.max(0, lift);
  const offset = 8 + Math.min(40, l * 0.17);
  const blur = 24 + Math.min(46, l * 0.2);
  if (theme === "night") {
    return `0 1px 0 rgba(255, 255, 255, 0.04) inset, 0 ${offset}px ${blur}px rgba(0, 0, 0, ${0.35 + Math.min(0.15, l / 1200)})`;
  }
  return `0 ${1 + Math.min(4, l * 0.02)}px ${2 + Math.min(6, l * 0.03)}px ${alpha(EGGPLANT, 0.06)}, 0 ${offset}px ${blur}px ${alpha(EGGPLANT, 0.08 + Math.min(0.12, l / 1500))}`;
};

export { day, night };
