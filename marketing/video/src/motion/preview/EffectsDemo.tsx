// Demo: Night half (grain, vignette ≤ 10 %, typing dots on eighths, a stamped declined chip with a tiny
// shake) and Day half (smear + ghosts on a fast card, a press with touch dot → UI burst, the hero burst
// with rim on cream, sticker on snap, avatars on uiPop, a 0.3 s glow halo on the lockup).
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Check, X } from "lucide-react";
import { day, night } from "../../brand/tokens";
import { DISPLAY, SANS } from "../../brand/fonts";
import { Lockup } from "../../brand/Logo";
import { Grain } from "../effects/Grain";
import { Vignette, Glow, haloAt } from "../effects/overlays";
import { Burst } from "../effects/Burst";
import { StickerPop, ShapePop, Stamp, Shake } from "../effects/pop";
import { FakeMotionBlur } from "../effects/blur";
import { pressAt, TouchDot } from "../effects/press";
import { TypingDots } from "../dots";
import { kf, whip } from "../easing";
import { depthShadow } from "../color";

export const EFFECTS_FRAMES = 240;

const NightSide: React.FC = () => (
  <AbsoluteFill style={{ background: night.ground, width: "50%", overflow: "hidden" }}>
    <Shake hits={[{ at: 120, amplitude: 8 }]}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 40 }}>
        <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 34, color: night.inkMuted }}>Leo is typing…</div>
        <div style={{ background: night.surfaceSunken, borderRadius: 48, padding: "34px 40px" }}>
          <TypingDots mode="bounce" grid="eighths" r={14} color={night.inkMuted} />
        </div>
        <Stamp at={120}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "16px 28px",
              borderRadius: 999,
              background: night.surfaceSunken,
              color: night.ink,
              fontFamily: SANS,
              fontWeight: 700,
              fontSize: 34,
            }}
          >
            <X size={36} strokeWidth={2} color={night.declined} /> Can't pay for anything
          </div>
        </Stamp>
      </AbsoluteFill>
    </Shake>
    <Vignette theme="night" />
    <Grain width={960} />
  </AbsoluteFill>
);

const DaySide: React.FC = () => {
  const frame = useCurrentFrame();
  // A card whips in on `whip`; smear + ghosts follow its velocity.
  const track = (f: number) => ({ x: kf(f, [{ at: 16, v: -760 }, { at: 32, v: 0, ease: whip }]), y: 0 });
  const press = pressAt(frame, 60);
  return (
    <AbsoluteFill style={{ background: day.ground, left: "50%", width: "50%", overflow: "hidden" }}>
      <AbsoluteFill style={{ alignItems: "center", top: 70, height: 160 }}>
        <div style={{ transform: `translateX(${track(frame).x}px)` }}>
          <FakeMotionBlur track={track} inline mode="ghost">
            <div style={{ background: day.surface, borderRadius: 24, padding: "22px 30px", boxShadow: depthShadow(0), fontFamily: DISPLAY, fontWeight: 700, fontSize: 36, color: day.ink }}>
              Groceries 🛒 · $84.00
            </div>
          </FakeMotionBlur>
        </div>
      </AbsoluteFill>
      {/* A press (touch dot, dip, brand-deep) → the UI-size burst (product spec). */}
      <div style={{ position: "absolute", left: 100, top: 400 }}>
        <div style={{ position: "relative", width: 300 }}>
          <div
            style={{
              background: press.brandFill,
              border: `1px solid ${day.brandDeep}`,
              color: day.onBrand,
              fontFamily: SANS,
              fontWeight: 700,
              fontSize: 30,
              padding: "18px 34px",
              borderRadius: 999,
              textAlign: "center",
              transform: `scale(${press.scale})`,
            }}
          >
            Get $84 back
          </div>
          <TouchDot at={60} x={150} y={38} />
          <Burst at={72} x={150} y={38} />
        </div>
        <ShapePop at={80} inline={false} style={{ marginTop: 30 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 12, fontFamily: SANS, fontWeight: 600, fontSize: 30, color: day.ink, background: day.brandSoft, padding: "12px 20px", borderRadius: 16 }}>
            <Check size={30} strokeWidth={2} color={day.approved} /> Approved by Pot rules
          </div>
        </ShapePop>
      </div>
      {/* The hero burst (research s09 spec) with a brand-deep rim on cream. */}
      <div style={{ position: "absolute", left: 700, top: 480 }}>
        <Burst at={130} variant="hero" rim />
        <div style={{ position: "absolute", left: -18, top: -18, width: 36, height: 36, borderRadius: 36, background: day.brand, border: `1px solid ${day.brandDeep}` }} />
      </div>
      {/* Sticker on snap (1.3 → 1.0) and avatars on uiPop. */}
      <div style={{ position: "absolute", left: 560, top: 230, display: "flex", gap: 28 }}>
        <StickerPop at={96} rotate={-6}>
          <div style={{ width: 120, height: 120, borderRadius: 30, background: day.member4, border: `8px solid ${day.surface}`, boxSizing: "border-box" }} />
        </StickerPop>
        {[day.member1, day.member2, day.member3].map((c, i) => (
          <ShapePop key={c} at={[150, 154, 159][i]}>
            <div style={{ width: 84, height: 84, borderRadius: 84, background: c, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 38, color: day.onBrand }}>
              {"MSL"[i]}
            </div>
          </ShapePop>
        ))}
      </div>
      <div style={{ position: "absolute", left: 120, top: 800 }}>
        <Glow color={day.brand} radius={40} strength={haloAt(frame, 180)}>
          <Lockup height={120} on="light" />
        </Glow>
      </div>
    </AbsoluteFill>
  );
};

export const EffectsDemo: React.FC = () => (
  <AbsoluteFill>
    <NightSide />
    <DaySide />
  </AbsoluteFill>
);
