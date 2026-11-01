// Font-safe text measuring/fitting on top of @remotion/layout-utils.
// Why the guard: measureText() caches by font-family string. If it runs before Gabarito has loaded,
// the fallback font's width is cached for the whole tab and every later frame is mis-fitted.
// useFontsReady() holds the render (delayRender) until document.fonts is done, then measures.
import React, { useEffect, useState } from "react";
import { continueRender, delayRender } from "remotion";
import { fitText, measureText } from "@remotion/layout-utils";
import { DISPLAY } from "../../brand/fonts";

const fontsDone = () => typeof document !== "undefined" && document.fonts !== undefined && document.fonts.status === "loaded";

/** true once all fonts are loaded. Until then it holds the render, so no frame is captured unfitted. */
export const useFontsReady = (): boolean => {
  const [ready, setReady] = useState(fontsDone);
  const [handle] = useState(() => (fontsDone() ? null : delayRender("motion-kit: waiting for fonts before measuring text")));
  useEffect(() => {
    if (handle === null) return;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      continueRender(handle);
    };
    document.fonts.ready.then(() => {
      setReady(true);
      release();
    });
    return release;
  }, [handle]);
  return ready;
};

export type FitOptions = {
  text: string;
  /** Available width in px. */
  maxWidth: number;
  fontFamily?: string;
  fontWeight?: number | string;
  letterSpacing?: string;
  /** Cap (px). Default 400. */
  maxFontSize?: number;
  /** Floor (px). Default 24. */
  minFontSize?: number;
  /** For amounts: "tabular-nums". */
  fontVariantNumeric?: string;
};

/** Largest font size (px) at which the widest line of `text` ("\n" = line break) fits `maxWidth`. */
export const useFitText = ({
  text,
  maxWidth,
  fontFamily = DISPLAY,
  fontWeight = 800,
  letterSpacing,
  maxFontSize = 400,
  minFontSize = 24,
  fontVariantNumeric,
}: FitOptions): number => {
  const ready = useFontsReady();
  if (!ready) return maxFontSize;
  let size = maxFontSize;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const { fontSize } = fitText({ text: line, withinWidth: maxWidth, fontFamily, fontWeight, letterSpacing, fontVariantNumeric });
    size = Math.min(size, fontSize);
  }
  return Math.max(minFontSize, Math.floor(size));
};

/** Width in px of `text` at `fontSize` (0 until fonts are ready; the render waits for them anyway). */
export const useTextWidth = (opts: {
  text: string;
  fontSize: number;
  fontFamily?: string;
  fontWeight?: number | string;
  letterSpacing?: string;
  fontVariantNumeric?: string;
}): number => {
  const ready = useFontsReady();
  if (!ready) return 0;
  return measureText({
    text: opts.text,
    fontSize: opts.fontSize,
    fontFamily: opts.fontFamily ?? DISPLAY,
    fontWeight: opts.fontWeight ?? 800,
    letterSpacing: opts.letterSpacing,
    fontVariantNumeric: opts.fontVariantNumeric,
  }).width;
};

/** A block of display text auto-sized to fit `maxWidth` (never overflows 1920). */
export const FitText: React.FC<
  Omit<FitOptions, "text"> & { text: string; color?: string; lineHeight?: number; style?: React.CSSProperties }
> = ({ text, color, lineHeight = 1, style, ...fit }) => {
  const fontSize = useFitText({ text, ...fit });
  return (
    <div
      style={{
        fontFamily: fit.fontFamily ?? DISPLAY,
        fontWeight: fit.fontWeight ?? 800,
        letterSpacing: fit.letterSpacing,
        fontVariantNumeric: fit.fontVariantNumeric,
        fontSize,
        lineHeight,
        color,
        whiteSpace: "pre",
        ...style,
      }}
    >
      {text}
    </div>
  );
};
