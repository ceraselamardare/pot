// Money in motion. Brand: tabular figures, two decimals on amounts, U+2212 "−" for minus.
//   <MoneyRoll steps={[{at: 0, value: 450}, {at: 60, value: 366}, {at: 150, value: 66}]} fontSize={220} />
//   <MoneyRoll from={0} to={1236} at={20} fontSize={200} />                 // tick: ~20 decaying steps in 42 f
//   <CountUp from={0} to={450} at={10} duration={30} fontSize={120} />
import React from "react";
import { useCurrentFrame } from "remotion";
import { measureText } from "@remotion/layout-utils";
import { day } from "../brand/tokens";
import { DISPLAY } from "../brand/fonts";
import { expoOut, land, punch, quintInOut, ramp, lerp, clamp01, type Ease } from "./easing";
import { DirectionalBlur, smearSigma } from "./effects/blur";
import { useFontsReady } from "./text/fit";

export const MINUS = "−";

export type MoneyFormat = {
  /** Default 2 (amounts). Sentences/buttons use whole dollars: 0. */
  decimals?: number;
  currency?: string;
  /** "auto": − only for negatives. "always": + / −. "never": absolute value. */
  sign?: "auto" | "always" | "never";
  grouping?: boolean;
};

/** 450 → "$450.00", −84 → "−$84.00", sign "always": "+$150.00". */
export const formatMoney = (value: number, { decimals = 2, currency = "$", sign = "auto", grouping = true }: MoneyFormat = {}) => {
  const rounded = Number(value.toFixed(decimals));
  const neg = rounded < 0;
  const [int, frac] = Math.abs(rounded).toFixed(decimals).split(".");
  const intG = grouping ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : int;
  const s = sign === "never" ? "" : neg ? MINUS : sign === "always" && rounded > 0 ? "+" : "";
  return `${s}${currency}${intG}${frac !== undefined ? `.${frac}` : ""}`;
};

type MoneyLook = {
  /** px (default 160). */
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  fontWeight?: number;
  letterSpacing?: string;
  style?: React.CSSProperties;
};

const lookStyle = (l: MoneyLook): React.CSSProperties => ({
  fontFamily: l.fontFamily ?? DISPLAY,
  fontWeight: l.fontWeight ?? 800,
  fontSize: l.fontSize ?? 160,
  letterSpacing: l.letterSpacing ?? "-0.02em",
  color: l.color ?? day.ink,
  fontVariantNumeric: "tabular-nums",
  lineHeight: 1,
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "flex-start",
  ...l.style,
});

// ─── CountUp ────────────────────────────────────────────────────────────────────
export type CountUpProps = MoneyLook & {
  from: number;
  to: number;
  at: number;
  /** Frames (default 30 = the product's 500 ms count-up). */
  duration?: number;
  ease?: Ease;
  /** Formatter (default formatMoney). */
  format?: (v: number) => string;
};

/** Eased number interpolation, formatted, tabular figures (plain text, no wheels). */
export const CountUp: React.FC<CountUpProps> = ({ from, to, at, duration = 30, ease = expoOut, format = (v) => formatMoney(v), ...look }) => {
  const frame = useCurrentFrame();
  const v = lerp(from, to, ramp(frame, at, at + duration, ease));
  return <span style={lookStyle(look)}>{format(v)}</span>;
};

// ─── Wheel column ───────────────────────────────────────────────────────────────
const mod10 = (k: number) => ((k % 10) + 10) % 10;

/** One digit wheel. `pos` is the (fractional) wheel position: cell k shows digit k mod 10 and sits
 *  (k − pos) cells below the window, so rising values scroll up. */
const Wheel: React.FC<{
  pos: number;
  /** Visible width fraction (columns that appear/disappear collapse). */
  widthF: number;
  digitW: number;
  cellHeight: number;
  /** Vertical blur σ in px. */
  sigma: number;
  /** Cells that render blank (leading-zero / appearing / vanishing sides). */
  blank?: (cellK: number) => boolean;
  /** What cell k shows (default: k mod 10). */
  digitAt?: (cellK: number) => string | number;
  /** Draw only the nearest cell (flickering fast columns: no neighbour slivers). */
  single?: boolean;
}> = ({ pos, widthF, digitW, cellHeight, sigma, blank, digitAt = mod10, single }) => {
  const base = single ? Math.round(pos) : Math.floor(pos);
  const frac = pos - base;
  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        width: `${digitW * clamp01(widthF)}em`,
        height: `${cellHeight}em`,
        overflow: "hidden",
        verticalAlign: "top",
      }}
    >
      <DirectionalBlur y={sigma} inline region={0.4} style={{ position: "absolute", left: 0, top: 0, width: `${digitW}em`, height: `${cellHeight}em` }}>
        {(single ? [base] : [base, base + 1]).map((cellK) => (
          <span
            key={cellK}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: `${digitW}em`,
              height: `${cellHeight}em`,
              lineHeight: `${cellHeight}em`,
              textAlign: "center",
              transform: `translateY(${(cellK - base - frac) * cellHeight}em)`,
              opacity: blank?.(cellK) ? 0 : 1,
            }}
          >
            {digitAt(cellK)}
          </span>
        ))}
      </DirectionalBlur>
    </span>
  );
};

const Sep: React.FC<{ ch: string; widthEm: number; vis: number; cellHeight: number }> = ({ ch, widthEm, vis, cellHeight }) => (
  <span
    style={{
      display: "inline-block",
      width: `${widthEm * clamp01(vis)}em`,
      overflow: "hidden",
      height: `${cellHeight}em`,
      lineHeight: `${cellHeight}em`,
      opacity: clamp01(vis),
      verticalAlign: "top",
    }}
  >
    {ch}
  </span>
);

const Prefix: React.FC<{ a: string; b: string; p: number; cellHeight: number }> = ({ a, b, p, cellHeight }) => (
  <span style={{ position: "relative", display: "inline-block", height: `${cellHeight}em`, lineHeight: `${cellHeight}em`, verticalAlign: "top" }}>
    {a === b ? (
      b
    ) : (
      <>
        <span style={{ opacity: p, display: "inline-block" }}>{b}</span>
        <span style={{ position: "absolute", right: 0, top: 0, opacity: 1 - p }}>{a}</span>
      </>
    )}
  </span>
);

// ─── MoneyRoll ──────────────────────────────────────────────────────────────────
export type MoneyStep = { at: number; value: number };

export type MoneyRollProps = MoneyLook &
  MoneyFormat & {
    /** Values over time. The first is shown from the start; each later one rolls in at its `at`. */
    steps?: readonly MoneyStep[];
    /** Shorthand for two steps: shows `from`, rolls to `to` at frame `at`. */
    from?: number;
    to?: number;
    at?: number;
    /** "tick" (default, research §3.5): steps through ~20 values with decaying steps (ease-out),
     *  each changed digit sliding one cell; never overshoots, lands exactly. $1,236.00 ≈ 20 steps in 42 f.
     *  "roll": each changed digit spins to its new digit, cascading (slot-machine accent).
     *  "count": a mechanical odometer counting through every value with carries. */
    mode?: "tick" | "roll" | "count";
    /** Frames: tick 42 (research 30-54), roll 34 per column, count 60. */
    duration?: number;
    /** tick: number of distinct values (research 15-23; default 20). */
    ticks?: number;
    /** tick: frames each changed digit takes to settle from its nudge (default 3, capped by the step interval). */
    slide?: number;
    /** roll: frames between changing columns (default 3). */
    stagger?: number;
    /** roll: cascade order (default "ltr"). */
    order?: "ltr" | "rtl";
    /** Default expoOut (roll) / quintInOut (count). */
    ease?: Ease;
    /** roll: "auto" rolls digits down when the amount drops, up when it grows. */
    direction?: "auto" | "up" | "down";
    /** roll: extra full turns for changed digits (default 0; 1 = slot-machine energy). */
    spins?: number;
    /** Vertical motion blur on fast digits (default true). */
    blur?: boolean;
    /** Digit cell height, em (default 1.06). */
    cellHeight?: number;
  };

type Col = { kind: "digit"; a: number | null; b: number | null } | { kind: "sep"; ch: string; a: boolean; b: boolean };

const splitMoney = (s: string) => {
  const m = s.match(/^([^\d]*)([\d,]+)(\.\d+)?$/);
  if (!m) return { prefix: "", int: s, frac: "" };
  return { prefix: m[1], int: m[2], frac: m[3] ?? "" };
};

/** Align two formatted amounts column by column (integer part right-aligned, decimals aligned). */
const buildColumns = (A: string, B: string): { prefixA: string; prefixB: string; cols: Col[] } => {
  const a = splitMoney(A);
  const b = splitMoney(B);
  const n = Math.max(a.int.length, b.int.length);
  const ia = a.int.padStart(n, " ");
  const ib = b.int.padStart(n, " ");
  const cols: Col[] = [];
  for (let i = 0; i < n; i++) {
    const ca = ia[i];
    const cb = ib[i];
    if (ca === "," || cb === ",") cols.push({ kind: "sep", ch: ",", a: ca === ",", b: cb === "," });
    else cols.push({ kind: "digit", a: ca === " " ? null : Number(ca), b: cb === " " ? null : Number(cb) });
  }
  const fn = Math.max(a.frac.length, b.frac.length);
  if (fn > 0) {
    cols.push({ kind: "sep", ch: ".", a: a.frac.length > 0, b: b.frac.length > 0 });
    for (let i = 1; i < fn; i++) {
      cols.push({ kind: "digit", a: a.frac[i] !== undefined ? Number(a.frac[i]) : null, b: b.frac[i] !== undefined ? Number(b.frac[i]) : null });
    }
  }
  return { prefixA: a.prefix, prefixB: b.prefix, cols };
};

/** Mechanical odometer wheel position for column j (0 = smallest unit) at x smallest units. */
const odoWheel = (x: number, j: number) => {
  if (j === 0) return x;
  const lower = (x / 10 ** (j - 1)) % 10;
  return Math.floor(x / 10 ** j) + clamp01(lower - 9);
};

/** Odometer money. Digits that appear/disappear (450 → 66) collapse their column so the amount stays tight. */
export const MoneyRoll: React.FC<MoneyRollProps> = (props) => {
  const frame = useCurrentFrame();
  const ready = useFontsReady();
  const mode = props.mode ?? "tick";
  const {
    duration = mode === "count" ? 60 : mode === "tick" ? 42 : 34,
    stagger = 3,
    order = "ltr",
    ease = mode === "count" ? quintInOut : mode === "tick" ? punch : expoOut,
    direction = "auto",
    spins = 0,
    blur = true,
    cellHeight = 1.06,
    decimals = 2,
    currency = "$",
    sign = "auto",
    grouping = true,
  } = props;
  const fmt = { decimals, currency, sign, grouping };
  const fontSize = props.fontSize ?? 160;
  const family = props.fontFamily ?? DISPLAY;
  const weight = props.fontWeight ?? 800;
  const spacing = props.letterSpacing ?? "-0.02em";
  const steps: readonly MoneyStep[] =
    props.steps ?? [
      { at: Number.NEGATIVE_INFINITY, value: props.from ?? 0 },
      { at: props.at ?? 0, value: props.to ?? props.from ?? 0 },
    ];

  // Current transition = the latest step that has started.
  let k = 0;
  for (let i = 0; i < steps.length; i++) if (frame >= steps[i].at) k = i;
  const prev = k > 0 ? steps[k - 1] : steps[0];
  const cur = steps[k];
  const lt = frame - cur.at;

  // Column advance widths (em) from the real font (fallbacks until fonts load; the render waits for them).
  const w100 = (text: string, tab: boolean) =>
    ready
      ? measureText({ text, fontFamily: family, fontWeight: weight, fontSize: 100, letterSpacing: spacing, fontVariantNumeric: tab ? "tabular-nums" : undefined }).width /
        100
      : text === "0"
        ? 0.6
        : 0.28;
  const digitW = w100("0", true);
  const cellPx = fontSize * cellHeight;
  const sigmaFor = (cellsPerFrame: number) => (blur && k > 0 ? Math.min(cellPx * 0.2, smearSigma(cellsPerFrame * cellPx)) : 0);
  const A = formatMoney(prev.value, fmt);
  const B = formatMoney(cur.value, fmt);

  if (mode === "tick") {
    const N = Math.max(2, Math.round(props.ticks ?? 20));
    const valueAt = (k: number) => (k >= N ? cur.value : Number(lerp(prev.value, cur.value, ease(k / N)).toFixed(decimals)));
    const timeAt = (k: number) => Math.round((k * duration) / N);
    // Current step k (k = 0 → prev value; k = N → exact target).
    let kk = N;
    if (k > 0) {
      kk = 0;
      while (kk < N && timeAt(kk + 1) <= lt) kk++;
    }
    const vPrev = kk > 0 ? valueAt(kk - 1) : prev.value;
    const vCur = k > 0 ? valueAt(kk) : cur.value;
    const interval = Math.max(1, timeAt(kk + 1) - timeAt(kk));
    const slide = Math.max(1, Math.min(props.slide ?? 3, interval));
    const qAt = (t: number) => (k === 0 || kk === 0 ? 1 : ramp(t, timeAt(kk), timeAt(kk) + slide, land));
    const q = qAt(lt);
    const qv = qAt(lt + 0.5) - qAt(lt - 0.5);
    const sA = formatMoney(kk > 0 ? vPrev : vCur, fmt);
    const sB = formatMoney(vCur, fmt);
    const { prefixA, prefixB, cols } = buildColumns(sA, sB);
    const dir = cur.value >= prev.value ? 1 : -1;
    // Crisp ticker: a changed digit swaps instantly and settles from a small nudge (rising values come
    // up from below), with a light vertical smear on its first frame. Digits stay readable every frame.
    const NUDGE = 0.16; // em
    return (
      <span style={lookStyle(props)} aria-label={formatMoney(cur.value, fmt)}>
        <Prefix a={prefixA} b={prefixB} p={q} cellHeight={cellHeight} />
        {cols.map((c, i) => {
          if (c.kind === "sep") {
            const vis = c.a && c.b ? 1 : c.b ? q : 1 - q;
            return <Sep key={i} ch={c.ch} widthEm={w100(c.ch, false)} vis={vis} cellHeight={cellHeight} />;
          }
          const appear = c.a === null;
          const vanish = c.b === null;
          const moving = c.a !== c.b && !vanish;
          const y = moving ? dir * NUDGE * (1 - q) : 0;
          const vy = moving ? Math.abs(NUDGE * qv) * fontSize : 0;
          const sigma = blur && k > 0 ? Math.min(cellPx * 0.03, smearSigma(vy)) : 0;
          return (
            <span
              key={i}
              style={{
                position: "relative",
                display: "inline-block",
                width: `${digitW * clamp01(appear ? q : vanish ? 1 - q : 1)}em`,
                height: `${cellHeight}em`,
                lineHeight: `${cellHeight}em`,
                overflow: appear || vanish ? "hidden" : "visible",
                verticalAlign: "top",
              }}
            >
              <DirectionalBlur inline y={sigma} region={0.4} style={{ width: `${digitW}em`, textAlign: "center", transform: `translateY(${y}em)` }}>
                {vanish ? c.a : c.b}
              </DirectionalBlur>
            </span>
          );
        })}
      </span>
    );
  }

  if (mode === "count") {
    const pAt = (t: number) => (k === 0 ? 1 : ramp(t, 0, duration, ease));
    const vAt = (t: number) => lerp(prev.value, cur.value, pAt(t));
    const unit = 10 ** decimals;
    const xAt = (t: number) => Math.round(Math.abs(vAt(t)) * unit * 1e6) / 1e6;
    const x = xAt(lt);
    const intLen = Math.max(Math.floor(Math.abs(prev.value)).toString().length, Math.floor(Math.abs(cur.value)).toString().length);
    const total = intLen + decimals;
    const v = vAt(lt);
    const prefix = formatMoney(v, fmt).match(/^[^\d]*/)?.[0] ?? "";
    const els: React.ReactNode[] = [];
    // Visible fraction of the integer column with place index p (0 = units dollar).
    const intVis = (p: number) => {
      if (p === 0) return 1;
      const j = p + decimals;
      return clamp01(odoWheel(x, j));
    };
    for (let j = total - 1; j >= 0; j--) {
      const pos = odoWheel(x, j);
      const vel = odoWheel(xAt(lt + 0.5), j) - odoWheel(xAt(lt - 0.5), j);
      const isInt = j >= decimals;
      const p = j - decimals; // place index for integer columns
      const leading = isInt && p > 0;
      const vis = leading ? intVis(p) : 1;
      // Columns spinning faster than ~0.6 cells/frame would smear into mush: show sharp flickering
      // digits with a small vertical jitter + light blur instead (reads like a fast counter on camera).
      const fast = Math.abs(vel) > 0.6;
      const base = Math.floor(pos);
      const shown = fast ? base + 0.5 + (pos - base - 0.5) * 0.12 : pos;
      const sigma = fast ? cellPx * 0.035 : Math.min(cellPx * 0.12, sigmaFor(vel));
      els.push(
        <Wheel
          key={`d${j}`}
          pos={shown}
          widthF={vis}
          digitW={digitW}
          cellHeight={cellHeight}
          sigma={blur && k > 0 ? sigma : 0}
          blank={leading ? (cellK) => cellK === 0 && pos < 1 : undefined}
          single={fast}
        />,
      );
      if (isInt && p > 0 && p % 3 === 0 && grouping) {
        // Comma after this column (it sits left of the hundreds of the next group).
        els.push(<Sep key={`c${j}`} ch="," widthEm={w100(",", false)} vis={vis} cellHeight={cellHeight} />);
      }
      if (j === decimals && decimals > 0) els.push(<Sep key="dot" ch="." widthEm={w100(".", false)} vis={1} cellHeight={cellHeight} />);
    }
    return (
      <span style={lookStyle(props)} aria-label={formatMoney(v, fmt)}>
        <Prefix a={prefix} b={prefix} p={1} cellHeight={cellHeight} />
        {els}
      </span>
    );
  }

  // mode "roll"
  const { prefixA, prefixB, cols } = buildColumns(A, B);
  const dir = direction === "auto" ? (cur.value >= prev.value ? 1 : -1) : direction === "up" ? 1 : -1;
  const changing = cols.map((c, i) => ({ c, i })).filter(({ c }) => c.a !== c.b);
  const rank = new Map<number, number>();
  (order === "ltr" ? changing : [...changing].reverse()).forEach(({ i }, r) => rank.set(i, r));
  const colPAt = (i: number, t: number) => {
    if (k === 0) return 1;
    const r = rank.get(i) ?? 0;
    return ramp(t, r * stagger, r * stagger + duration, ease);
  };
  const pp = k > 0 ? ramp(lt, 0, 12, expoOut) : 1;

  return (
    <span style={lookStyle(props)} aria-label={B}>
      <Prefix a={k > 0 ? prefixA : prefixB} b={prefixB} p={pp} cellHeight={cellHeight} />
      {cols.map((c, i) => {
        const p = colPAt(i, lt);
        if (c.kind === "sep") {
          const vis = c.a && c.b ? 1 : c.b ? p : 1 - p;
          return <Sep key={i} ch={c.ch} widthEm={w100(c.ch, false)} vis={vis} cellHeight={cellHeight} />;
        }
        const appear = c.a === null && c.b !== null;
        const vanish = c.a !== null && c.b === null;
        let posA = c.a ?? 0;
        let posB = c.b ?? 0;
        if (appear) posA = posB - dir; // slides in by one cell from the blank side
        if (vanish) posB = posA + dir;
        if (!appear && !vanish && c.a !== c.b) {
          if (dir > 0 && posB < posA) posB += 10;
          if (dir < 0 && posB > posA) posB -= 10;
          posB += dir * 10 * spins;
        }
        const pos = lerp(posA, posB, p);
        const vel = (posB - posA) * (colPAt(i, lt + 0.5) - colPAt(i, lt - 0.5));
        const blankCell = appear ? posA : vanish ? posB : null;
        return (
          <Wheel
            key={i}
            pos={pos}
            widthF={appear ? p : vanish ? 1 - p : 1}
            digitW={digitW}
            cellHeight={cellHeight}
            sigma={sigmaFor(vel)}
            blank={blankCell === null ? undefined : (cellK) => cellK === blankCell}
          />
        );
      })}
    </span>
  );
};

/** Frame at which a "roll" step finishes (for chaining SFX/cuts): at + duration + (changed columns − 1) × stagger. */
export const rollEnd = (step: MoneyStep, changedColumns: number, duration = 34, stagger = 3) => step.at + duration + Math.max(0, changedColumns - 1) * stagger;
