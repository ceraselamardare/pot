// Demo: MoneyRoll modes. Left (Day): tick 450 → 366 → 66 and the $22.00 refund. Right (Night):
// tick $0 → $1,236.00 (research: ~20 steps in 42 f), roll accent $300 → $450, count odometer.
import React from "react";
import { AbsoluteFill } from "remotion";
import { day, night } from "../../brand/tokens";
import { SANS } from "../../brand/fonts";
import { MoneyRoll } from "../numbers";
import { useCamera, Stage3D, Camera } from "../camera";

export const MONEY_FRAMES = 300;

const Label: React.FC<{ children: React.ReactNode; color: string }> = ({ children, color }) => (
  <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 30, color }}>{children}</div>
);

export const MoneyDemo: React.FC = () => {
  const cam = useCamera([{ at: 0, scale: 1 }], { creep: { start: 0, end: 300, amount: 0.05 } });
  return (
    <AbsoluteFill style={{ flexDirection: "row" }}>
      <AbsoluteFill style={{ background: day.ground, width: "60%" }}>
        <Stage3D>
          <Camera pose={cam}>
            <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 18 }}>
              <Label color={day.inkMuted}>Lisbon Trip · tick</Label>
              <MoneyRoll
                steps={[
                  { at: 0, value: 450 },
                  { at: 40, value: 366 },
                  { at: 150, value: 66 },
                ]}
                fontSize={240}
              />
              <div style={{ display: "flex", gap: 20, alignItems: "baseline" }}>
                <Label color={day.inkMuted}>Everyone gets back</Label>
                <MoneyRoll from={0} to={22} at={220} duration={36} ticks={16} fontSize={64} />
              </div>
            </AbsoluteFill>
          </Camera>
        </Stage3D>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: night.ground, left: "60%", width: "40%", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 28 }}>
        <MoneyRoll from={0} to={1236} at={30} fontSize={124} color={night.ink} />
        <Label color={night.inkMuted}>fronted by Maya · tick</Label>
        <MoneyRoll from={300} to={450} at={90} mode="roll" fontSize={84} color={night.ink} />
        <Label color={night.inkMuted}>roll (accent)</Label>
        <MoneyRoll from={0} to={22} at={160} mode="count" duration={50} fontSize={84} color={night.ink} />
        <Label color={night.inkMuted}>count (odometer)</Label>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
