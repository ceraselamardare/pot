// TabBar (apps/web/components/app-shell/Shell.tsx): Pots · Requests · <your Pot dollars>, 56 px + the bottom safe
// area, surface with a `line` top border. The third tab is You, labelled with the person's own Pot dollars ("$0.00",
// tabular) since 2026-11-01. Active = ink + semibold; others ink-muted. The Requests badge counts what waits on you:
// an `ink` pill with `surface` numerals (as the app ships it).
import { House, Inbox, UserRound } from "lucide-react";
import React from "react";
import { copy } from "../copy";
import { formatUsd } from "../format";
import { useUi } from "../theme";
import { T } from "../type";

export type TabName = "pots" | "requests" | "you";

export const TabBar: React.FC<{
  active?: TabName;
  /** Requests badge count (0 hides it). */
  badge?: number;
  /** 0..1 pop-in of the badge. */
  badgeAppear?: number;
  /** The person's own Pot dollars on the third tab (dollars; interpolate for a roll). null = the plain "You" label. */
  balance?: number | null;
  /** Bottom safe area (defaults to the phone's). */
  safeBottom?: number;
  style?: React.CSSProperties;
}> = ({ active = "pots", badge = 0, badgeAppear = 1, balance = 0, safeBottom, style }) => {
  const ui = useUi();
  const { c } = ui;
  const pb = safeBottom ?? ui.safeBottom;
  const nav = [
    { key: "pots" as const, label: copy["pots.title"], Icon: House },
    { key: "requests" as const, label: copy["requests.title"], Icon: Inbox },
    { key: "you" as const, label: balance === null ? copy["you.title"] : formatUsd(balance), Icon: UserRound },
  ];
  return (
    <div
      data-ui="tab-bar"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 30,
        borderTop: `1px solid ${c.line}`,
        background: c.surface,
        paddingBottom: pb,
        ...style,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", height: 56 }}>
        {nav.map(({ key, label, Icon }) => {
          const on = key === active;
          return (
            <div
              key={key}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                color: on ? c.ink : c.inkMuted,
                ...T.bodySm,
                fontWeight: on ? 600 : 400,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span style={{ position: "relative", display: "block" }}>
                <Icon size={24} strokeWidth={2} style={{ display: "block" }} aria-hidden />
                {key === "requests" && badge > 0 && badgeAppear > 0 ? (
                  <span
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -12,
                      boxSizing: "border-box",
                      display: "grid",
                      placeItems: "center",
                      height: 18,
                      minWidth: 18,
                      padding: "0 4px",
                      borderRadius: 999,
                      background: c.ink,
                      color: c.surface,
                      fontSize: 12,
                      lineHeight: 1,
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                      transform: badgeAppear < 1 ? `scale(${badgeAppear})` : undefined,
                    }}
                  >
                    {badge}
                  </span>
                ) : null}
              </span>
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
};
