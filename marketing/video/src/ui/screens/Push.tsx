// A generic notification (no real OS branding): a frosted token card with the pot-mark app icon, "Pot", "now",
// the title and body in the app's push copy (en.json notif.*). `copyVariant` picks the message:
//   "oneOk" (default since hub 1.1.0: the $300 tickets are a one-OK ask): "Maya needs one OK" /
//            "$300 for the boat trip · Lisbon Trip · Anyone can OK it";
//   "group": "Maya needs your OK" / "$300 for the boat trip · Lisbon Trip" (a spend over $300);
//   "trust": "You're now Trusted in Lisbon Trip" / "You can spend up to $200 without asking.";
//   "goal":  "Lisbon Trip reached its goal" / "$450 collected. Spending is open.".
// `title` / `body` override any of them. `progress` slides it down; `pressed` presses it like a button.
// LockScreen: a member-colour wallpaper, the date, a big "9:41" and a notification stack.
import { Camera, Flashlight, Lock } from "lucide-react";
import React from "react";
import { interpolateColors } from "remotion";
import { PotMark } from "../../brand/Logo";
import { day, night } from "../../brand/tokens";
import { copy } from "../copy";
import { LISBON, MAYA } from "../data";
import { clamp01, easeEnter } from "../ease";
import { alpha, useUi } from "../theme";
import { DISPLAY, SANS, SCREEN_TEXT } from "../type";

export type PushCopy = "oneOk" | "group" | "trust" | "goal";

/** The push messages the film uses, as [title, body]. */
export function pushCopy(v: PushCopy, opts?: { name?: string; amount?: string; reason?: string; potName?: string }): [string, string] {
  const name = opts?.name ?? MAYA.name;
  const amount = opts?.amount ?? "$300";
  const reason = opts?.reason ?? "the boat trip";
  const potName = opts?.potName ?? LISBON.name;
  switch (v) {
    case "oneOk":
      return [copy["notif.one_ok.title"](name), copy["notif.one_ok.body"](amount, reason, potName)];
    case "group":
      return [copy["notif.approval.title"](name), copy["notif.approval.body"](amount, reason, potName)];
    case "trust":
      return [copy["notif.trust.title"](copy["trust.level.1"], potName), copy["notif.trust.body"](opts?.amount ?? "$200")];
    case "goal":
      return [copy["notif.goal.reached.title"](potName), copy["notif.goal.reached.body"](opts?.amount ?? "$450")];
  }
}

export type PushProps = {
  appName?: string;
  /** Which message (default "oneOk"); `title` / `body` override it. */
  copyVariant?: PushCopy;
  title?: string;
  body?: string;
  time?: string;
  /** 0..1 slide down + fade (banner) / rise + fade (lock list). */
  progress?: number;
  /** 0..1 press (scale 0.97, the card darkens a touch). */
  pressed?: number;
  /** "banner": over an app at the top; "lock": in the lock-screen list (positioned by its parent). */
  variant?: "banner" | "lock";
  /** Force the frosted tone (defaults to the theme). */
  tone?: "light" | "dark";
  style?: React.CSSProperties;
};

export const PushNotification: React.FC<PushProps> = ({
  appName = "Pot",
  copyVariant = "oneOk",
  title: titleProp,
  body: bodyProp,
  time = "now",
  progress = 1,
  pressed = 0,
  variant = "banner",
  tone,
  style,
}) => {
  const ui = useUi();
  const [defTitle, defBody] = pushCopy(copyVariant);
  const title = titleProp ?? defTitle;
  const body = bodyProp ?? defBody;
  const t = tone ?? (ui.theme === "night" ? "dark" : "light");
  const ink = t === "dark" ? night.ink : day.ink;
  const muted = t === "dark" ? night.inkMuted : day.inkMuted;
  const p = clamp01(pressed);
  const base = t === "dark" ? alpha(night.surfaceSunken, 0.84) : alpha(day.surface, 0.8);
  const pressedBg = t === "dark" ? alpha(night.line, 0.9) : alpha(day.surfaceSunken, 0.9);
  const bg = p > 0 ? interpolateColors(p, [0, 1], [base, pressedBg]) : base;
  const e = easeEnter(clamp01(progress));
  if (progress <= 0) return null;
  const enter =
    variant === "banner" ? `translateY(${(1 - e) * -130}%)` : `translateY(${(1 - e) * 24}px) scale(${0.94 + 0.06 * e})`;
  return (
    <div
      data-ui="push"
      style={{
        ...(variant === "banner" ? { position: "absolute", left: 8, right: 8, top: ui.safeTop + 2, zIndex: 80 } : { position: "relative" }),
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 24,
        background: bg,
        backdropFilter: "blur(24px) saturate(1.5)",
        WebkitBackdropFilter: "blur(24px) saturate(1.5)",
        boxShadow: t === "dark" ? "0 10px 30px rgba(0, 0, 0, 0.35)" : "0 10px 30px rgba(43, 27, 58, 0.16), 0 1px 2px rgba(43, 27, 58, 0.08)",
        color: ink,
        fontFamily: SANS,
        opacity: variant === "banner" ? Math.min(1, e * 1.4) : e,
        transform: `${enter}${p > 0 ? ` scale(${1 - 0.03 * p})` : ""}`,
        ...style,
      }}
    >
      <PotMark size={38} style={{ display: "block", flexShrink: 0, alignSelf: "flex-start", marginTop: 2 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ flex: 1, fontSize: 13, lineHeight: "18px", fontWeight: 600, color: muted }}>{appName}</span>
          <span style={{ fontSize: 13, lineHeight: "18px", color: muted, flexShrink: 0 }}>{time}</span>
        </div>
        <p style={{ margin: 0, fontSize: 15, lineHeight: "20px", fontWeight: 700 }}>{title}</p>
        <p style={{ margin: 0, fontSize: 15, lineHeight: "20px", fontWeight: 400 }}>{body}</p>
      </div>
    </div>
  );
};

export type LockScreenProps = {
  time?: string;
  date?: string;
  /** Wallpaper (defaults to a Leo member-3 → member-5 → member-4 gradient). */
  wallpaper?: string;
  notifications?: (PushProps & { id: string })[];
  /** Top of the notification stack (px from the screen top). */
  stackTop?: number;
  children?: React.ReactNode;
  style?: React.CSSProperties;
};

export const LOCK_WALLPAPER = `radial-gradient(120% 70% at 20% 10%, ${day.member3} 0%, rgba(184, 199, 255, 0) 60%), radial-gradient(90% 60% at 90% 80%, ${day.member4} 0%, rgba(245, 179, 200, 0) 70%), linear-gradient(165deg, ${day.member3} 0%, ${day.member5} 48%, ${day.member4} 100%)`;

export const LockScreen: React.FC<LockScreenProps> = ({
  time = "9:41",
  date = "Tuesday, November 3",
  wallpaper = LOCK_WALLPAPER,
  notifications = [],
  stackTop = 330,
  children,
  style,
}) => {
  const { safeBottom } = useUi();
  const ink = day.ink;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 0, background: wallpaper, color: ink, overflow: "hidden", ...SCREEN_TEXT, ...style }}>
      <div style={{ position: "absolute", top: 58, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Lock size={18} strokeWidth={2} color={ink} style={{ display: "block", opacity: 0.85 }} aria-hidden />
        <p style={{ margin: "14px 0 0", fontFamily: SANS, fontSize: 19, lineHeight: "24px", fontWeight: 600, color: alpha(ink, 0.9) }}>{date}</p>
        <p style={{ margin: "-6px 0 0", fontFamily: DISPLAY, fontSize: 104, lineHeight: "112px", fontWeight: 700, letterSpacing: "-0.02em", color: alpha(ink, 0.92), fontVariantNumeric: "tabular-nums" }}>
          {time}
        </p>
      </div>
      <div style={{ position: "absolute", top: stackTop, left: 8, right: 8, display: "flex", flexDirection: "column", gap: 8 }}>
        {notifications.map(({ id, ...n }) => (
          <PushNotification key={id} variant="lock" tone="light" {...n} />
        ))}
      </div>
      <div style={{ position: "absolute", left: 46, right: 46, bottom: safeBottom + 18, display: "flex", justifyContent: "space-between" }}>
        {[Flashlight, Camera].map((I, i) => (
          <span
            key={i}
            style={{
              display: "grid",
              width: 50,
              height: 50,
              placeItems: "center",
              borderRadius: 999,
              background: alpha(day.surface, 0.42),
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              color: ink,
            }}
          >
            <I size={22} strokeWidth={2} style={{ display: "block" }} aria-hidden />
          </span>
        ))}
      </div>
      {children}
    </div>
  );
};
