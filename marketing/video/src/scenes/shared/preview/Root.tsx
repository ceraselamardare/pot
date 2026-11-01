import "../../../brand/fonts";
import React from "react";
import { Composition } from "remotion";
import { WorldTest } from "./WorldTest";
import { GlyphTest } from "./GlyphTest";

export const DirectorPreviewRoot: React.FC = () => (
  <>
    <Composition id="WorldMaya" component={WorldTest} defaultProps={{ view: "maya" as const }} durationInFrames={1} fps={60} width={1920} height={1080} />
    <Composition id="WorldSplit" component={WorldTest} defaultProps={{ view: "split" as const }} durationInFrames={1} fps={60} width={1920} height={1080} />
    <Composition id="GlyphTest" component={GlyphTest} durationInFrames={1} fps={60} width={1920} height={1080} />
  </>
);
