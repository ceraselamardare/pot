// Demo: kinetic typography with the research defaults.
// Night: WordRise headline + member-4 highlight (Act 1 never uses marigold) → chat field typing +
// strike → thesis word "weeks." from 1.6×. Day: WordRise + marigold highlight, MaskReveal/LetterCascade accents.
import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { day, night } from "../../brand/tokens";
import { SANS } from "../../brand/fonts";
import { WordRise, ScalePunch, Typewriter, typedEnd, LetterCascade, MaskReveal } from "../text/KineticText";
import { HighlightBar, StrikeThrough } from "../text/marks";
import { useFitText } from "../text/fit";
import { Grain } from "../effects/Grain";
import { Vignette } from "../effects/overlays";
import { useCamera, Stage3D, Camera, revealSnapKeys } from "../camera";

const NightHeadline: React.FC = () => {
  const text = "Every group trip\nhas a money problem.";
  const fontSize = useFitText({ text, maxWidth: 1600, maxFontSize: 170 });
  // Reveal snap: tight 1.5× → one-frame jump to 0.6 of that, then a 24 f land tail.
  const cam = useCamera(revealSnapKeys(6, 1.5, { ratio: 0.6, tail: 24 }), { creep: { start: 30, end: 130, amount: 0.05 } });
  return (
    <AbsoluteFill style={{ background: night.ground }}>
      <Stage3D>
        <Camera pose={cam}>
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
            <WordRise
              text={text}
              start={6}
              stagger={6}
              fontSize={fontSize}
              color={night.ink}
              exit={{ at: 110 }}
              renderWord={(w) =>
                w.startsWith("money") ? (
                  <HighlightBar at={52} color={day.member4}>
                    {w}
                  </HighlightBar>
                ) : (
                  w
                )
              }
            />
          </AbsoluteFill>
        </Camera>
      </Stage3D>
      <Vignette theme="night" />
      <Grain />
    </AbsoluteFill>
  );
};

const NightChase: React.FC = () => {
  const line = "i'll pay you back!!";
  const end = typedEnd(line, { start: 6, seed: "chase" });
  return (
    <AbsoluteFill style={{ background: night.ground, alignItems: "center", justifyContent: "center", gap: 48 }}>
      <div style={{ background: night.surfaceSunken, borderRadius: 40, padding: "28px 44px", color: night.ink }}>
        <StrikeThrough at={end + 14} dimTo={0.55}>
          <Typewriter text={line} start={6} seed="chase" fontFamily={SANS} fontWeight={600} fontSize={64} color={night.ink} caretUntil={end + 10} align="left" />
        </StrikeThrough>
      </div>
      <ScalePunch text="weeks." start={end + 34} fontSize={240} color={night.ink} mode="single" exit={{ at: end + 84 }} />
      <Vignette theme="night" />
      <Grain />
    </AbsoluteFill>
  );
};

const DayLines: React.FC = () => (
  <AbsoluteFill style={{ background: day.ground, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 40 }}>
    <WordRise
      text={"Small spends\napprove themselves."}
      start={4}
      stagger={8}
      fontSize={140}
      renderWord={(w) =>
        w.startsWith("approve") ? (
          <HighlightBar at={44}>
            {w}
          </HighlightBar>
        ) : (
          w
        )
      }
    />
    <div style={{ display: "flex", gap: 60, alignItems: "baseline" }}>
      <MaskReveal text="Lisbon Trip" start={30} fontSize={64} color={day.inkMuted} />
      <LetterCascade text="Trip rules" start={36} fontSize={64} color={day.inkMuted} />
    </div>
  </AbsoluteFill>
);

export const KINETIC_FRAMES = 380;

export const KineticDemo: React.FC = () => (
  <AbsoluteFill style={{ background: night.ground }}>
    <Sequence durationInFrames={130} premountFor={30}>
      <NightHeadline />
    </Sequence>
    <Sequence from={130} durationInFrames={150} premountFor={30}>
      <NightChase />
    </Sequence>
    <Sequence from={280} durationInFrames={100} premountFor={30}>
      <DayLines />
    </Sequence>
  </AbsoluteFill>
);
