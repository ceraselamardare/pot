// Every amount renders through MoneyText (apps/web/components/money/MoneyText.tsx): tabular figures, Gabarito
// for the hero, Figtree 700 for rows, two decimals, U+2212 for money out.
import React from "react";
import { formatSigned, formatUsd, type MoneyStyle } from "../format";
import { useUi } from "../theme";
import { T } from "../type";

export type MoneyVariant = "hero" | "title" | "row" | "inline";

const VARIANT: Record<MoneyVariant, React.CSSProperties> = {
  // the app's hero: text-balance-hero with [line-height:1.1]
  hero: { ...T.hero, lineHeight: 1.1 },
  title: T.title,
  row: { ...T.amount },
  inline: {},
};

export const MoneyText: React.FC<{
  /** Dollars (float ok: rounded to the cent, so a count-up can pass interpolated values). */
  amount?: number;
  /** Alternatively, integer cents (wins over `amount`). */
  cents?: number;
  variant?: MoneyVariant;
  /** "fixed" (default) "$450.00"; "whole" "$150" for sentences and buttons. */
  format?: MoneyStyle;
  /** "in" → "+ $150.00", "out" → "− $84.00". */
  sign?: "in" | "out";
  color?: string;
  strike?: boolean;
  style?: React.CSSProperties;
}> = ({ amount = 0, cents, variant = "row", format = "fixed", sign, color, strike, style }) => {
  const { c } = useUi();
  const dollars = cents !== undefined ? cents / 100 : amount;
  const text = sign ? formatSigned(dollars, sign) : formatUsd(dollars, format);
  return (
    <span
      style={{
        whiteSpace: "nowrap",
        fontVariantNumeric: "tabular-nums",
        color: color ?? c.ink,
        textDecoration: strike ? "line-through" : undefined,
        ...VARIANT[variant],
        ...style,
      }}
    >
      {text}
    </span>
  );
};
