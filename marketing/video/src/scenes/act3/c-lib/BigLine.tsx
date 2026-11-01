// Builder C: one line of big kinetic type for the TypeZone (Gabarito 800, eggplant). Whole words rise out of a
// vertical smear into fixed slots (the motion kit's WordRise), an optional Lucide icon rises with the first word,
// and one word (or a U+00A0-joined phrase) gets the marigold HighlightBar once it has landed.
import type { LucideIcon } from "lucide-react";
import React from "react";
import { useCurrentFrame } from "remotion";
import { DirectionalBlur, HighlightBar, WordRise, exit as exitEase, land, lerp, ramp, type ExitOptions, type TimedWord } from "../../../motion";
import { day } from "../../../brand/tokens";

export type BigLineProps = {
  words: TimedWord[];
  icon?: LucideIcon;
  /** Word index that gets the HighlightBar, the frame its sweep starts and its length (default 11 f). */
  highlight?: { index: number; at: number; duration?: number };
  fontSize?: number;
  maxWidth?: number;
  lineHeight?: number;
  exit?: ExitOptions;
  /** Word indices that arrive from scale (the thesis word; research 1.4-1.9×). */
  thesis?: number[];
  thesisScale?: number;
  /** Entry frames per word (default 20) and rise (default 48). */
  duration?: number;
  rise?: number;
  style?: React.CSSProperties;
};

/** Evenly staggered words from a sentence (U+00A0 keeps a phrase together). */
export const wordsAt = (text: string, start: number, stagger: number): TimedWord[] =>
  text.split(" ").map((w, i) => ({ text: w, startFrame: start + i * stagger }));

export const BigLine: React.FC<BigLineProps> = ({
  words,
  icon: Icon,
  highlight,
  fontSize = 80,
  maxWidth = 820,
  lineHeight = 1.06,
  exit,
  thesis,
  thesisScale = 1.5,
  duration = 20,
  rise = 48,
  style,
}) => {
  const frame = useCurrentFrame();
  const first = words[0]?.startFrame ?? 0;
  const iconSize = Math.round(fontSize * 0.74);
  // the icon moves like a word: rise + smear on land, opacity only as a helper; exits with the first word
  const e = ramp(frame, first, first + duration, land);
  const q = exit ? ramp(frame, exit.at, exit.at + (exit.duration ?? 7), exit.ease ?? exitEase) : 0;
  const iconOpacity = frame < first ? 0 : lerp(0.2, 1, ramp(frame, first, first + 10)) * (1 - q);
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: Math.round(fontSize * 0.3), ...style }}>
      {Icon ? (
        <DirectionalBlur
          inline
          y={16 * (1 - e) + 16 * q}
          style={{ flexShrink: 0, marginTop: Math.round(fontSize * 0.14), transform: `translateY(${(1 - e) * rise - q * rise}px)`, opacity: iconOpacity }}
        >
          <Icon size={iconSize} strokeWidth={2} color={day.ink} style={{ display: "block" }} aria-hidden />
        </DirectionalBlur>
      ) : null}
      <WordRise
        words={words}
        fontSize={fontSize}
        lineHeight={lineHeight}
        letterSpacing="-0.02em"
        align="left"
        maxWidth={maxWidth}
        color={day.ink}
        duration={duration}
        rise={rise}
        thesis={thesis}
        thesisScale={thesisScale}
        exit={exit}
        style={{ fontVariantNumeric: "tabular-nums" }}
        renderWord={
          highlight
            ? (text, i) => {
                if (i !== highlight.index) return text;
                // trailing punctuation stays off the block (review 1: periods must not sit on the block edge)
                const m = text.match(/^(.*?)([.,!?…]*)$/);
                return (
                  <>
                    <HighlightBar at={highlight.at} duration={highlight.duration ?? 11} padX={0.1}>
                      {m?.[1] ?? text}
                    </HighlightBar>
                    {m?.[2] ?? ""}
                  </>
                );
              }
            : undefined
        }
      />
    </div>
  );
};
