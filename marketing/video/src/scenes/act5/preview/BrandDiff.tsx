// Dev check: the brand lockup file vs <Lockup> vs the local LockupSvg, rendered one at a time at the same spot.
import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { Lockup } from "../../../brand/Logo";
import { day } from "../../../brand/tokens";
import { LockupSvg } from "../../act2/LockupSvg";

export type BrandDiffProps = { which: "file" | "lockup" | "svg" };
export const BrandDiff: React.FC<BrandDiffProps> = ({ which }) => (
  <AbsoluteFill style={{ background: day.ground }}>
    {which === "file" ? <Img src={staticFile("brand/pot-lockup-on-light.svg")} style={{ position: "absolute", left: 100, top: 60, height: 512, width: 1265 }} /> : null}
    {which === "lockup" ? (
      <div style={{ position: "absolute", left: 100, top: 60, lineHeight: 0 }}>
        <Lockup height={512} on="light" />
      </div>
    ) : null}
    {which === "svg" ? (
      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
        <LockupSvg x={100} y={60} height={512} on="light" />
      </svg>
    ) : null}
  </AbsoluteFill>
);
