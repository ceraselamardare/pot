// Kinetic typography (research §3.4). Gabarito 800, token colours, frame-driven only.
// Words arrive by MOVING, on the voice: whole words rise out of a vertical smear into fixed slots.
//   <WordRise text="Every group trip" start={10} />                    // the house entry
//   <WordRise words={voWords} />                                       // VO-timed: each word lands as spoken
//   <ScalePunch text="weeks." start={40} mode="single" />               // the thesis word, from 1.6×
//   <MaskReveal text="Group chat money" start={10} />                  // words through masks (accent)
//   <LetterCascade text="Lisbon Trip" start={0} />                     // per-letter (accent)
//   <Typewriter text="Lisbon Trip" start={0} />                        // ONLY inside the product's own fields
import React from "react";
import { random, useCurrentFrame } from "remotion";
import { day } from "../../brand/tokens";
import { DISPLAY } from "../../brand/fonts";
import { exit as exitEase, land, punch, ramp, springAt, lerp, type Ease, type SpringName } from "../easing";
import { DirectionalBlur } from "../effects/blur";

// ─── Word timing ────────────────────────────────────────────────────────────────
/** A word and the frame its entry starts (see voLanding for VO sync). */
export type TimedWord = { text: string; startFrame: number; /** Start a new line before this word. */ breakBefore?: boolean };

/** Either VO-timed `words`, or `text` + `start` + `stagger` ("\n" in text = line break;
 *  join a phrase with U+00A0, "money problem", to animate it as one unit). */
export type WordSource = { words: readonly TimedWord[] } | { text: string; start?: number; stagger?: number };

type Word = { kind: "word"; text: string; start: number; index: number };
type Token = Word | { kind: "br" };

export const resolveWords = (src: WordSource, defaultStagger = 6): Token[] => {
  const out: Token[] = [];
  if ("words" in src) {
    src.words.forEach((w, i) => {
      if (w.breakBefore && i > 0) out.push({ kind: "br" });
      out.push({ kind: "word", text: w.text, start: w.startFrame, index: i });
    });
    return out;
  }
  const start = src.start ?? 0;
  const stagger = src.stagger ?? defaultStagger;
  let index = 0;
  src.text.split("\n").forEach((line, li) => {
    if (li > 0) out.push({ kind: "br" });
    for (const w of line.split(/[ \t]+/).filter(Boolean)) {
      out.push({ kind: "word", text: w, start: start + index * stagger, index });
      index++;
    }
  });
  return out;
};

/** Frames between a word's entry start and the moment it reads as landed (research: voice-led words
 *  land 0-4 f before the spoken word; `land` covers ~85 % in 10 f of a 20 f entry). */
export const VO_LEAD = 10;

/** Entry start for a word spoken at `spokenFrame` so it lands just before it is heard. */
export const voLanding = (spokenFrame: number, lead = VO_LEAD) => spokenFrame - lead;

/** VO timestamps in seconds (e.g. ElevenLabs alignment) → TimedWord[] whose entries start `lead` frames
 *  before each word is spoken. `offset` shifts everything (e.g. the scene's VO start). */
export const wordsFromSeconds = (words: readonly { text: string; start: number }[], fps = 60, offset = 0, lead = VO_LEAD): TimedWord[] =>
  words.map((w) => ({ text: w.text, startFrame: Math.round(w.start * fps) + offset - lead }));

// ─── Shared look ────────────────────────────────────────────────────────────────
export type KineticLook = {
  /** px (default 140; research punchlines 110-160). Use useFitText() for huge words. */
  fontSize?: number;
  /** Token colour (default Day ink). On Night grounds pass night.ink. Never marigold. */
  color?: string;
  fontFamily?: string;
  fontWeight?: number;
  /** Unitless (default 1.0). */
  lineHeight?: number;
  /** Default "-0.025em" (research: −1.5 % to −3 %). */
  letterSpacing?: string;
  align?: "left" | "center" | "right";
  maxWidth?: number | string;
  style?: React.CSSProperties;
  /** Wrap individual words (e.g. a HighlightBar on one word). Return the word's content. */
  renderWord?: (text: string, index: number) => React.ReactNode;
};

const containerStyle = (l: KineticLook): React.CSSProperties => ({
  fontFamily: l.fontFamily ?? DISPLAY,
  fontWeight: l.fontWeight ?? 800,
  fontSize: l.fontSize ?? 140,
  lineHeight: l.lineHeight ?? 1,
  letterSpacing: l.letterSpacing ?? "-0.025em",
  color: l.color ?? day.ink,
  textAlign: l.align ?? "center",
  maxWidth: l.maxWidth,
  ...l.style,
});

/** Research exits: one word every 2 f, 7 f each, on `exit` (faster than the entry). */
export type ExitOptions = { at: number; stagger?: number; duration?: number; ease?: Ease };
const exitProgress = (frame: number, index: number, exit?: ExitOptions) =>
  exit ? ramp(frame, exit.at + index * (exit.stagger ?? 2), exit.at + index * (exit.stagger ?? 2) + (exit.duration ?? 7), exit.ease ?? exitEase) : 0;

const renderTokens = (tokens: Token[], word: (w: Word) => React.ReactNode) =>
  tokens.map((t, i) =>
    t.kind === "br" ? (
      <br key={`br${i}`} />
    ) : (
      <React.Fragment key={i}>
        {i > 0 && tokens[i - 1].kind === "word" ? " " : null}
        {word(t)}
      </React.Fragment>
    ),
  );

// ─── WordRise (the house entry) ─────────────────────────────────────────────────
export type WordRiseProps = KineticLook &
  WordSource & {
    /** Rise distance in px (research 32-76; default 48). */
    rise?: number;
    /** Entry frames (research 18-24; default 20). */
    duration?: number;
    /** Default land (or punch for punchlines). No bounce. */
    ease?: Ease;
    /** Vertical smear σ at the start, px (default 16 → 0). */
    blur?: number;
    /** Opacity helper: starts at this (default 0.2) and reaches 1 over `fadeFrames` (default 10). */
    fadeFrom?: number;
    fadeFrames?: number;
    /** Indices of the thesis word(s): they arrive from `thesisScale` instead of rising. One per line, at most. */
    thesis?: readonly number[];
    /** Research 1.4-1.9 (default 1.6). */
    thesisScale?: number;
    exit?: ExitOptions;
  };

/** Whole words rise out of a vertical smear into fixed slots (layout never reflows). */
export const WordRise: React.FC<WordRiseProps> = (props) => {
  const frame = useCurrentFrame();
  const { rise = 48, duration = 20, ease = land, blur = 16, fadeFrom = 0.2, fadeFrames = 10, thesis = [], thesisScale = 1.6, exit, renderWord } = props;
  const tokens = resolveWords(props, 6);
  return (
    <div style={containerStyle(props)}>
      {renderTokens(tokens, (t) => {
        const started = frame >= t.start;
        const e = ramp(frame, t.start, t.start + duration, ease);
        const q = exitProgress(frame, t.index, exit);
        const isThesis = thesis.includes(t.index);
        const y = isThesis ? 0 : (1 - e) * rise - q * rise;
        const s = isThesis ? lerp(thesisScale, 1, e) : 1;
        const sigma = blur * (1 - e) + blur * q;
        const opacity = started ? lerp(fadeFrom, 1, ramp(frame, t.start, t.start + fadeFrames)) * (1 - q) : 0;
        return (
          <DirectionalBlur inline y={sigma} x={isThesis ? sigma * 0.5 : 0} style={{ transform: `translateY(${y}px) scale(${s})`, opacity, transformOrigin: "50% 60%" }}>
            {renderWord ? renderWord(t.text, t.index) : t.text}
          </DirectionalBlur>
        );
      })}
    </div>
  );
};

// ─── ScalePunch (the thesis word) ───────────────────────────────────────────────
export type ScalePunchProps = KineticLook &
  WordSource & {
    /** Start scale (research: only the thesis word, 1.4-1.9; default 1.6). */
    fromScale?: number;
    /** Entry frames (default 18) on `punch`, no bounce. */
    duration?: number;
    ease?: Ease;
    /** Use a spring instead of the ease. "slam" {260, 12, m .6}: at most ONCE per act. */
    spring?: SpringName;
    /** Smear at the start, px (default 16 → 0). */
    blur?: number;
    /** "line": words build up the line. "single": one word at a time in the same spot (VO captions). */
    mode?: "line" | "single";
    exit?: ExitOptions;
  };

/** Words arrive from a bigger scale and settle into place, sharpening from blur. */
export const ScalePunch: React.FC<ScalePunchProps> = (props) => {
  const frame = useCurrentFrame();
  const { fromScale = 1.6, duration = 18, ease = punch, spring, blur = 16, mode = "line", exit, renderWord } = props;
  const tokens = resolveWords(props, 8);
  const words = tokens.filter((t): t is Word => t.kind === "word");

  const wordEl = (t: Word) => {
    const e = spring ? springAt(frame, t.start, spring) : ramp(frame, t.start, t.start + duration, ease);
    const sharp = ramp(frame, t.start, t.start + duration, ease);
    const q = exitProgress(frame, t.index, exit);
    const started = frame >= t.start;
    const scale = lerp(fromScale, 1, e) * (1 - 0.25 * q);
    const sigma = blur * (1 - sharp) + 10 * q;
    return (
      <DirectionalBlur
        inline
        x={sigma * 0.5}
        y={sigma}
        style={{ transform: `scale(${scale})`, transformOrigin: "50% 60%", opacity: started ? lerp(0.2, 1, ramp(frame, t.start, t.start + 8)) * (1 - q) : 0 }}
      >
        {renderWord ? renderWord(t.text, t.index) : t.text}
      </DirectionalBlur>
    );
  };

  if (mode === "single") {
    let current: Word | null = null;
    for (const w of words) if (frame >= w.start) current = w;
    return <div style={containerStyle(props)}>{current ? wordEl(current) : null}</div>;
  }
  return <div style={containerStyle(props)}>{renderTokens(tokens, wordEl)}</div>;
};

// ─── MaskReveal (accent) ────────────────────────────────────────────────────────
/** Mask box paddings (em) so ascenders/descenders and tight tracking never get clipped. */
const PAD_T = 0.1;
const PAD_B = 0.22;
const PAD_X = 0.08;
const maskStyle: React.CSSProperties = {
  display: "inline-block",
  overflow: "hidden",
  verticalAlign: "top",
  padding: `${PAD_T}em ${PAD_X}em ${PAD_B}em`,
  margin: `-${PAD_T}em -${PAD_X}em -${PAD_B}em`,
};

export type MaskRevealProps = KineticLook &
  WordSource & {
    /** Frames per word (default 20). */
    duration?: number;
    /** Default punch. */
    ease?: Ease;
    /** Words rise from below (default) or drop from above. */
    from?: "below" | "above";
    /** Words leave upward through the same masks (2 f stagger, 7 f each). */
    exit?: ExitOptions;
  };

/** Words slide up into place inside overflow-hidden boxes, staggered. */
export const MaskReveal: React.FC<MaskRevealProps> = (props) => {
  const frame = useCurrentFrame();
  const { duration = 20, ease = punch, from = "below", exit, renderWord } = props;
  const lh = props.lineHeight ?? 1;
  const tokens = resolveWords(props, 4);
  const travelIn = from === "below" ? lh + PAD_B + 0.04 : -(lh + PAD_T + 0.04);
  const travelOut = -(lh + PAD_T + 0.04);
  return (
    <div style={containerStyle(props)}>
      {renderTokens(tokens, (t) => {
        const p = ramp(frame, t.start, t.start + duration, ease);
        const q = exitProgress(frame, t.index, exit);
        const y = (1 - p) * travelIn + q * travelOut;
        return (
          <span style={maskStyle}>
            <span style={{ display: "inline-block", transform: `translateY(${y}em)` }}>{renderWord ? renderWord(t.text, t.index) : t.text}</span>
          </span>
        );
      })}
    </div>
  );
};

// ─── LetterCascade (accent) ─────────────────────────────────────────────────────
/** Split into user-perceived characters (keeps emoji flags and ZWJ sequences whole). */
export const graphemes = (s: string): string[] => {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (x: string) => Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) return Array.from(new Seg(undefined, { granularity: "grapheme" }).segment(s), (x) => x.segment);
  return Array.from(s);
};

export type LetterCascadeProps = KineticLook & {
  text: string;
  start?: number;
  /** Frames between letters (default 1.5). */
  stagger?: number;
  /** Frames per letter (default 24). */
  duration?: number;
  ease?: Ease;
  /** Start tilt per letter in degrees (default 8). */
  rotate?: number;
  exit?: ExitOptions;
};

/** Per-letter rise through word masks with a small tilt that settles. Transforms only (no per-letter opacity). */
export const LetterCascade: React.FC<LetterCascadeProps> = (props) => {
  const frame = useCurrentFrame();
  const { text, start = 0, stagger = 1.5, duration = 24, ease = land, rotate = 8, exit } = props;
  const lh = props.lineHeight ?? 1;
  const travel = lh + PAD_B + 0.06;
  let letterIndex = 0;
  return (
    <div style={containerStyle(props)}>
      {text.split("\n").map((line, li) => (
        <React.Fragment key={li}>
          {li > 0 ? <br /> : null}
          {line
            .split(" ")
            .filter(Boolean)
            .map((word, wi) => (
              <React.Fragment key={wi}>
                {wi > 0 ? " " : null}
                <span style={maskStyle}>
                  {graphemes(word).map((ch, ci) => {
                    const k = letterIndex++;
                    const s0 = start + k * stagger;
                    const p = ramp(frame, s0, s0 + duration, ease);
                    const q = exit ? ramp(frame, exit.at + k * (exit.stagger ?? 1), exit.at + k * (exit.stagger ?? 1) + (exit.duration ?? 7), exit.ease ?? exitEase) : 0;
                    const y = (1 - p) * travel - q * travel;
                    return (
                      <span key={ci} style={{ display: "inline-block", transform: `translateY(${y}em) rotate(${(1 - p) * rotate}deg)`, transformOrigin: "0% 100%" }}>
                        {ch}
                      </span>
                    );
                  })}
                </span>
              </React.Fragment>
            ))}
        </React.Fragment>
      ))}
    </div>
  );
};

// ─── Typewriter (product fields only) ───────────────────────────────────────────
export type TypePause = { /** Pause after this many characters. */ after: number; frames: number };

export type TypingOptions = {
  start?: number;
  /** Uniform speed (frames per character). If omitted: research bursts, 14-30 chars/s. */
  framesPerChar?: number;
  /** Extra pauses (uniform mode). */
  pauses?: readonly TypePause[];
  /** Burst mode: chars/s range (default [14, 30]) and pause after a space in frames (default [12, 20]). */
  cps?: [number, number];
  spacePause?: [number, number];
  seed?: string;
};

/** Frame at which each character of `text` appears. */
export const typingSchedule = (text: string, o: TypingOptions = {}): number[] => {
  const { start = 0, framesPerChar, pauses = [], cps = [14, 30], spacePause = [12, 20], seed = "type" } = o;
  const times: number[] = [];
  let t = start;
  for (let i = 0; i < text.length; i++) {
    if (framesPerChar !== undefined) {
      t += framesPerChar;
    } else {
      // Irregular bursts: the speed wanders per short burst of 3-5 chars.
      const burst = Math.floor(i / 4);
      const rate = lerp(cps[0], cps[1], random(`${seed}-b${burst}`));
      t += Math.max(1, Math.round(60 / rate + (random(`${seed}-c${i}`) - 0.5)));
      if (i > 0 && text[i - 1] === " ") t += Math.round(lerp(spacePause[0], spacePause[1], random(`${seed}-s${i}`)));
    }
    times.push(t);
    for (const p of pauses) if (p.after === i + 1) t += p.frames;
  }
  return times;
};

/** How many characters are typed at `frame` (string slicing, never per-character opacity). */
export const typedCount = (frame: number, text: string, o: TypingOptions = {}): number => {
  const times = typingSchedule(text, o);
  let n = 0;
  while (n < times.length && times[n] <= frame) n++;
  return n;
};

/** Frame at which typing of `text` completes. */
export const typedEnd = (text: string, o: TypingOptions = {}) => {
  const times = typingSchedule(text, o);
  return times.length ? times[times.length - 1] : (o.start ?? 0);
};

/** Caret: solid (research), or blinking (period frames, default 32 ≈ 530 ms) when `blink`. */
export const Caret: React.FC<{ blink?: boolean; period?: number; color?: string; width?: string; style?: React.CSSProperties }> = ({
  blink = false,
  period = 32,
  color = "currentColor",
  width = "0.07em",
  style,
}) => {
  const frame = useCurrentFrame();
  const on = !blink || frame % period < period / 2;
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width,
        height: "0.92em",
        marginLeft: "0.05em",
        background: color,
        borderRadius: "0.04em",
        transform: "translateY(0.12em)",
        opacity: on ? 1 : 0,
        ...style,
      }}
    />
  );
};

export type TypewriterProps = KineticLook &
  TypingOptions & {
    text: string;
    caret?: boolean;
    caretColor?: string;
    /** Blink the caret once typing is done (default false: solid). */
    blinkWhenDone?: boolean;
    /** Hide the caret from this frame (e.g. when the message is "sent"). */
    caretUntil?: number;
  };

/** Typing with string slicing + a solid caret. Research: only inside the product's own fields
 *  (pot name, chat composer); never for headlines. */
export const Typewriter: React.FC<TypewriterProps> = (props) => {
  const frame = useCurrentFrame();
  const { text, caret = true, caretColor, caretUntil, blinkWhenDone = false } = props;
  const n = typedCount(frame, text, props);
  const showCaret = caret && (caretUntil === undefined || frame < caretUntil);
  return (
    <div style={{ ...containerStyle({ fontWeight: 600, letterSpacing: "0", ...props }), whiteSpace: "pre-wrap" }}>
      <span>{text.slice(0, n)}</span>
      {showCaret ? <Caret blink={blinkWhenDone && n >= text.length} color={caretColor} /> : null}
    </div>
  );
};

