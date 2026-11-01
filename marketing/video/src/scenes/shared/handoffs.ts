// Handoff contracts between scenes built by different agents (director-owned). The last frame of one scene and
// the first frame of the next must match these values exactly, so the cut reads as one continuous shot.
import { PHONE_SCALE, WORLD, CAM } from "./world";
import { SCREEN_W, SCREEN_H, SCREEN_RADIUS } from "../../ui";
import { LOGO_GEOMETRY } from "../../brand/Logo";

/**
 * s05 → s06 (Act 1 → Act 2). On s05's LAST frame the typing bubble's three dots sit here (screen px), on the
 * Night ground, in Night ink-muted (#bdb2c8), inside a Night-surface bubble that has grown past the dots.
 * On s06 frame 0 the middle dot is in the same place and size, and turns marigold.
 * Geometry = the brand's dots: gap = 3.33 × r (LOGO_GEOMETRY: r 18, centres 60 apart in the 512 tile).
 */
export const DOT_HANDOFF = {
  cx: 960,
  cy: 540,
  r: 84,
  /** centre-to-centre distance between neighbouring dots */
  gap: (84 * 60) / 18,
} as const;

/**
 * The Night-surface bubble around the dots on s05's last frame (measured by builder A), screen px.
 * Rounded rect with every corner radius 240 except the bottom-left (the bubble's tail side) at 72.
 * s05's last frame also carries the Night grain + vignette finish; s06 frame 0 may drop it (the flood covers it).
 */
export const S05_END_BUBBLE = {
  x: 392,
  y: 300,
  w: 1136,
  h: 480,
  radius: 240,
  bottomLeftRadius: 72,
  color: "#261c30",
} as const;

/** Glyph scale (px per 512-unit) at which the logo's dots exactly match DOT_HANDOFF. */
export const GLYPH_MATCH_SCALE = DOT_HANDOFF.r / LOGO_GEOMETRY.dotR;

/**
 * s06 → s07 (Act 2 → Act 3). On s06's LAST frame the marigold has contracted to this rounded rect (screen px):
 * Maya's phone SCREEN, frontal (no rotation), at her world position under CAM.maya. On s07 frame 0 the phone body
 * appears around it in a 1 f step (screen still marigold), the app UI rises over the marigold within ~12-18 f,
 * and the phone eases from frontal into PHONE_HOME over ~30 f on `land`.
 */
export const PHONE_HANDOFF = {
  cx: 960 + (WORLD.maya.x - CAM.maya.cx) * CAM.maya.scale,
  cy: 540 + WORLD.maya.y,
  w: SCREEN_W * PHONE_SCALE,
  h: SCREEN_H * PHONE_SCALE,
  r: SCREEN_RADIUS * PHONE_SCALE,
} as const;

/**
 * Act 3 internal handoffs (camera = CAM.maya on both sides, drift from the GLOBAL frame via useWorldCamera):
 * - s08 → s09: Maya's phone, PotScreen $450.00, FEED_FULL, no sheet open.
 * - s09 → s10: Maya's phone, PotScreen $366.00, feedAfterGroceries(), no sheet open.
 * - s10 → s11: Maya's phone, PotScreen $66.00, feedAfterBoat(), no sheet open; Leo's phone at rest, out of frame.
 * s12 → s13: hard cut on the bar line (Night → cream).
 */
export const ACT3_HANDOFF_NOTE = "see comment";
