// Scene registry (director-owned): which component renders which timeline entries. Scene builders don't edit
// this; the director swaps placeholders for the real scenes as they land.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { SceneId } from "../data/timeline";
import { SCRIPT } from "../data/script";
import { day, night } from "../brand/tokens";
import { DISPLAY, SANS } from "../brand/fonts";
import { S01Hook, S01_SCENES, S02S03FrontChase, S02S03_SCENES, S04Options, S04_SCENES, S05Pivot, S05_SCENES } from "./act1";
import { S06Reveal, S06_REVEAL_SCENES } from "./act2";
import { S07Create, S07_SCENES, S08Join, S08_SCENES } from "./act3/c-index";
import { S09Instant, S09_SCENES, S10Group, S10_SCENES } from "./act3/d-index";
import { S10bMore, S10B_SCENES } from "./act3/b-index";
import { S11Close, S11_SCENES } from "./act3/e-index";
import { S12Tech, S12_SCENES } from "./act4";
import { S13End, S13_END_SCENES } from "./act5";
import { useFilmProps } from "../filmProps";

/** The end card with the film-level repo link (empty until the repo is public). */
const S13EndWithRepo: React.FC = () => {
  const { repoUrl } = useFilmProps();
  return <S13End repoUrl={repoUrl || undefined} />;
};

export type SceneEntry = {
  /** Timeline entries this component covers (in order). It is mounted at the first one's start. */
  covers: SceneId[];
  component: React.FC;
};

/** A slate used until a scene exists: shows the scene id and its VO line (useful for timing checks). */
const placeholder = (id: SceneId, act: number): React.FC => {
  const Slate: React.FC = () => {
    const frame = useCurrentFrame();
    const isNight = act === 1 || act === 4;
    const t = isNight ? night : day;
    const bg = act === 2 ? day.brand : t.ground;
    return (
      <AbsoluteFill style={{ background: bg, alignItems: "center", justifyContent: "center", gap: 24, padding: 120 }}>
        <div style={{ fontFamily: SANS, fontSize: 28, color: act === 2 ? day.onBrand : t.inkMuted }}>
          {id} · f{frame}
        </div>
        <div
          style={{
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize: 64,
            lineHeight: 1.1,
            textAlign: "center",
            color: act === 2 ? day.onBrand : t.ink,
          }}
        >
          {SCRIPT[id]}
        </div>
      </AbsoluteFill>
    );
  };
  return Slate;
};

export const REGISTRY: SceneEntry[] = [
  { covers: S01_SCENES, component: S01Hook },
  { covers: S02S03_SCENES, component: S02S03FrontChase },
  { covers: S04_SCENES, component: S04Options },
  { covers: S05_SCENES, component: S05Pivot },
  { covers: S06_REVEAL_SCENES, component: S06Reveal },
  { covers: S07_SCENES, component: S07Create },
  { covers: S08_SCENES, component: S08Join },
  { covers: S09_SCENES, component: S09Instant },
  { covers: S10_SCENES, component: S10Group },
  { covers: S10B_SCENES, component: S10bMore },
  { covers: S11_SCENES, component: S11Close },
  { covers: S12_SCENES, component: S12Tech },
  { covers: S13_END_SCENES, component: S13EndWithRepo },
];
