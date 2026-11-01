// The whole of Act 1 back to back on the locked timeline (preview only: checks the seams s01 → s05).
import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { scene } from "../../../data/timeline";
import { N } from "../common";
import { S01Hook } from "../S01Hook";
import { S02S03FrontChase, S02S03_DURATION } from "../S02S03FrontChase";
import { S04Options } from "../S04Options";
import { S05Pivot } from "../S05Pivot";

export const ACT1_DURATION = scene("s06-reveal").from;

export const Act1: React.FC = () => (
  <AbsoluteFill style={{ background: N.ground }}>
    <Sequence from={scene("s01-hook").from} durationInFrames={scene("s01-hook").duration} premountFor={60}>
      <S01Hook />
    </Sequence>
    <Sequence from={scene("s02-front").from} durationInFrames={S02S03_DURATION} premountFor={60}>
      <S02S03FrontChase />
    </Sequence>
    <Sequence from={scene("s04-options").from} durationInFrames={scene("s04-options").duration} premountFor={60}>
      <S04Options />
    </Sequence>
    <Sequence from={scene("s05-pivot").from} durationInFrames={scene("s05-pivot").duration} premountFor={60}>
      <S05Pivot />
    </Sequence>
  </AbsoluteFill>
);
