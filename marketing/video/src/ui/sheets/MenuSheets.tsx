// The round row's menus (apps/web/components/pot/PotActions.tsx PotMoreSheet, payin/AskSheet.tsx, 2026-11-03):
//  - MoreSheet (More): "More options" · "Lisbon Trip": Invite friends · Settings · Pot record · Who can see what ·
//    Close Pot. Rows are MoreItem: a 40 px surface-sunken circle with a 20 px icon, the title (body) and its line.
//  - AskSheet (Ask): "Ask for money" · "Lisbon Trip": Ask the group ("Everyone adds a little more") · Ask anyone by
//    link ("Anyone can pay into Lisbon Trip. They don't join.").
// `pressed` presses a row (surface-sunken + the touch dot with `touchDot`).
import { Eye, HandCoins, Link2, ListChecks, LogOut, Settings, UserPlus, type LucideIcon } from "lucide-react";
import React from "react";
import { interpolateColors } from "remotion";
import { copy } from "../copy";
import { LISBON } from "../data";
import { clamp01 } from "../ease";
import { useUi } from "../theme";
import { T } from "../type";
import { TouchDot } from "../atoms/Touch";
import { Sheet, type SheetProps } from "./Sheet";

export const MoreItem: React.FC<{ icon: LucideIcon; title: string; sub?: string; disabled?: boolean; pressed?: number; touchDot?: boolean; style?: React.CSSProperties }> = ({
  icon: Icon,
  title,
  sub,
  disabled,
  pressed = 0,
  touchDot,
  style,
}) => {
  const { c } = useUi();
  const p = clamp01(pressed);
  return (
    <div
      data-ui="more-item"
      style={{
        position: "relative",
        display: "flex",
        minHeight: 56,
        boxSizing: "border-box",
        alignItems: "center",
        gap: 12,
        borderRadius: 16,
        padding: "8px 12px",
        background: p > 0 ? interpolateColors(p, [0, 1], [c.surface, c.surfaceSunken]) : undefined,
        ...T.body,
        color: disabled ? c.inkMuted : c.ink,
        ...style,
      }}
    >
      <span style={{ display: "grid", width: 40, height: 40, flexShrink: 0, placeItems: "center", borderRadius: 999, background: c.surfaceSunken }}>
        <Icon size={20} strokeWidth={2} style={{ display: "block" }} aria-hidden />
      </span>
      <span style={{ display: "flex", minWidth: 0, flexDirection: "column" }}>
        <span>{title}</span>
        {sub ? <span style={{ ...T.bodySm, color: c.inkMuted }}>{sub}</span> : null}
      </span>
      {touchDot && p > 0 ? <TouchDot press={p} x={32} y={28} /> : null}
    </div>
  );
};

export type MoreKey = "invite" | "settings" | "record" | "privacy" | "close";

export const MoreSheet: React.FC<
  Omit<SheetProps, "children" | "title" | "description"> & { potName?: string; pressed?: { target: MoreKey; amount?: number } | null; touchDot?: boolean; closed?: boolean }
> = ({ potName = LISBON.name, pressed = null, touchDot, closed = false, ...sheet }) => {
  const items: { key: MoreKey; icon: LucideIcon; title: string; sub?: string }[] = [
    { key: "invite", icon: UserPlus, title: copy["members.invite_cta"], sub: copy["pot.more.invite.sub"] },
    { key: "settings", icon: Settings, title: copy["pot.more.settings"], sub: copy["pot.more.settings.sub"] },
    { key: "record", icon: ListChecks, title: copy["pot.menu.record"], sub: copy["pot.menu.record.sub"] },
    { key: "privacy", icon: Eye, title: copy["privacy.menu"], sub: copy["privacy.menu.sub"] },
    { key: "close", icon: LogOut, title: closed ? copy["close.summary.cta"] : copy["pot.menu.close"], sub: closed ? undefined : copy["close.menu.sub"] },
  ];
  return (
    <Sheet {...sheet} title={copy["pot.more.title"]} description={potName}>
      <div data-ui="more-sheet" style={{ margin: "0 -12px", display: "flex", flexDirection: "column", paddingBottom: 8 }}>
        {items.map((it) => (
          <MoreItem key={it.key} icon={it.icon} title={it.title} sub={it.sub} pressed={pressed?.target === it.key ? (pressed.amount ?? 1) : 0} touchDot={touchDot} />
        ))}
      </div>
    </Sheet>
  );
};

export type AskKey = "group" | "anyone";

export const AskSheet: React.FC<
  Omit<SheetProps, "children" | "title" | "description"> & { potName?: string; pressed?: { target: AskKey; amount?: number } | null; touchDot?: boolean }
> = ({ potName = LISBON.name, pressed = null, touchDot, ...sheet }) => (
  <Sheet {...sheet} title={copy["ask.title"]} description={potName}>
    <div data-ui="ask-sheet" style={{ margin: "0 -12px", display: "flex", flexDirection: "column", paddingBottom: 8 }}>
      <MoreItem icon={HandCoins} title={copy["topup.menu"]} sub={copy["topup.menu.sub"]} pressed={pressed?.target === "group" ? (pressed.amount ?? 1) : 0} touchDot={touchDot} />
      <MoreItem icon={Link2} title={copy["ask.anyone"]} sub={copy["ask.anyone.sub"](potName)} pressed={pressed?.target === "anyone" ? (pressed.amount ?? 1) : 0} touchDot={touchDot} />
    </div>
  </Sheet>
);
