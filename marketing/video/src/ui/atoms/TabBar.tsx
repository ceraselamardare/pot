// TabBar (apps/web/components/app-shell/Shell.tsx): Pots · Requests · You, 56 px + the bottom safe area, surface
// with a `line` top border. Active = ink + semibold label; others ink-muted. The Requests badge counts what waits
// on you: `ink` pill with `surface` numerals (as the app ships it).
import { House, Inbox, UserRound } from "lucide-react";
import React from "react";
import { copy } from "../copy";
import { useUi } from "../theme";
import { T } from "../type";

export type TabName = "pots" | "requests" | "you";

const NAV = [
  { key: "pots" as const, label: copy["pots.title"], Icon: House },
  { key: "requests" as const, label: copy["requests.title"], Icon: Inbox },
  { key: "you" as const, label: copy["you.title"], Icon: UserRound },
];

export const TabBar: React.FC<{
  active?: TabName;
  /** Requests badge count (0 hides it). */
  badge?: number;
  /** 0..1 pop-in of the badge. */
  badgeAppear?: number;
  /** Bottom safe area (defaults to the phone's). */
  safeBottom?: number;
  style?: React.CSSProperties;
}> = ({ active = "pots", badge = 0, badgeAppear = 1, safeBottom, style }) => {
  const ui = useUi();
  const { c } = ui;
  const pb = safeBottom ?? ui.safeBottom;
  return (
    <div
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
        {NAV.map(({ key, label, Icon }) => {
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
