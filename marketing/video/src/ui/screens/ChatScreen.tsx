// A GENERIC group chat (our own neutral messenger look from tokens; not any real messenger's branding), Day or
// Night. Header (back, group avatar, "Lisbon Trip ✈️", member names), bottom-anchored bubbles (incoming with the
// sender's member-colour avatar and name, outgoing on brand-soft), times and read ticks, a typing bubble with
// the brand's three dots (the video's narrative thread), and the invite link preview (the OG card). Every
// message has `appear` 0..1 (pops in from below and pushes the list up).
import { ArrowUp, CheckCheck, ChevronLeft, Phone as PhoneIcon, Plus, Video } from "lucide-react";
import React from "react";
import { copy } from "../copy";
import { LISBON, MAYA, LEO, SAM, memberColor, type Person } from "../data";
import { alpha, useUi } from "../theme";
import { SANS, SCREEN_TEXT, T } from "../type";
import { Appear } from "../atoms/Appear";
import { Avatar } from "../atoms/Avatar";
import { coverGradient } from "../atoms/CoverTile";
import { TypingDots } from "../atoms/TypingDots";
import { Caret } from "../atoms/Touch";
import { OgCard } from "./OgCard";

export type ChatLink = {
  /** og:title, e.g. "Maya invited you to Lisbon Trip" */
  title?: string;
  /** og:description (the trust sentence) */
  description?: string;
  /** small line under the description (e.g. a domain), hidden when undefined */
  domain?: string;
  potName?: string;
  emoji?: string;
  cover?: number;
  members?: Person[];
};

export type ChatMessage = {
  id: string;
  /** a member, or "me" (the phone owner: outgoing) */
  from: Person | "me";
  kind?: "text" | "typing" | "link";
  text?: string;
  time?: string;
  /** 0..1 entrance */
  appear?: number;
  /** outgoing: show the read ticks */
  read?: boolean;
  link?: ChatLink;
  /** hide (keep layout) while a breakout twin is on screen */
  hidden?: boolean;
  /** frame for the typing dots (defaults to the current frame) */
  dotsFrame?: number;
};

export type ChatScreenProps = {
  title?: string;
  subtitle?: string;
  avatarEmoji?: string;
  messages: ChatMessage[];
  /** Pushes the message column down (px) to reveal older messages; negative scrolls further up. */
  scrollY?: number;
  /** Day separator chip at the top of the list (null hides it). */
  dayLabel?: string | null;
  /** Text in the composer (with a caret when `composerCaret`). */
  composerText?: string;
  composerCaret?: boolean;
  caretFrame?: number;
  children?: React.ReactNode;
  style?: React.CSSProperties;
};

const BUBBLE_MAX = 272;

const sameSender = (a?: ChatMessage, b?: ChatMessage) => {
  if (!a || !b) return false;
  const ia = a.from === "me" ? "me" : a.from.id;
  const ib = b.from === "me" ? "me" : b.from.id;
  return ia === ib;
};

export const ChatScreen: React.FC<ChatScreenProps> = ({
  title = `${LISBON.name} ✈️`,
  subtitle = `${MAYA.name}, ${SAM.name}, ${LEO.name}`,
  avatarEmoji = "✈️",
  messages,
  scrollY = 0,
  dayLabel = copy["feed.day.today"],
  composerText = "",
  composerCaret = false,
  caretFrame,
  children,
  style,
}) => {
  const { c, theme, safeTop, safeBottom } = useUi();
  const wallpaper = theme === "night" ? c.ground : c.surfaceSunken;
  const headerH = 56;
  const composerH = 56;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 0, background: wallpaper, color: c.ink, overflow: "hidden", ...SCREEN_TEXT, ...style }}>
      {/* messages */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: safeTop + headerH,
          bottom: composerH + safeBottom,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "8px 12px 10px", transform: scrollY ? `translateY(${scrollY}px)` : undefined }}>
          {dayLabel ? (
            <div style={{ display: "flex", justifyContent: "center", paddingBottom: 8 }}>
              <span style={{ borderRadius: 999, background: alpha(c.surface, theme === "night" ? 1 : 0.9), padding: "3px 10px", ...T.bodySm, fontSize: 12, lineHeight: "16px", fontWeight: 600, color: c.inkMuted }}>
                {dayLabel}
              </span>
            </div>
          ) : null}
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const firstOfRun = !sameSender(prev, m);
            const lastOfRun = !sameSender(m, next);
            const out = m.from === "me";
            return (
              <Appear key={m.id} appear={m.appear ?? 1} gap={i === 0 ? 0 : firstOfRun ? 10 : 3} from="rise" origin={out ? "bottom right" : "bottom left"}>
                <Bubble msg={m} out={out} firstOfRun={firstOfRun} lastOfRun={lastOfRun} />
              </Appear>
            );
          })}
        </div>
      </div>

      {/* header */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, zIndex: 2, paddingTop: safeTop, background: c.surface, borderBottom: `1px solid ${c.line}` }}>
        <div style={{ height: headerH, display: "flex", alignItems: "center", gap: 8, padding: "0 12px 0 4px" }}>
          <ChevronLeft size={28} strokeWidth={2} color={c.ink} style={{ display: "block", flexShrink: 0 }} aria-hidden />
          <span style={{ display: "grid", width: 38, height: 38, flexShrink: 0, placeItems: "center", borderRadius: 999, background: coverGradient(LISBON.cover), fontSize: 19, lineHeight: 1 }}>
            {avatarEmoji}
          </span>
          <div style={{ minWidth: 0, flex: 1, marginLeft: 2 }}>
            <p style={{ margin: 0, fontFamily: SANS, fontSize: 16, lineHeight: "20px", fontWeight: 700, color: c.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</p>
            <p style={{ margin: 0, ...T.bodySm, fontSize: 13, lineHeight: "17px", color: c.inkMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</p>
          </div>
          <Video size={24} strokeWidth={2} color={c.ink} style={{ display: "block", flexShrink: 0, marginRight: 14 }} aria-hidden />
          <PhoneIcon size={22} strokeWidth={2} color={c.ink} style={{ display: "block", flexShrink: 0, marginRight: 4 }} aria-hidden />
        </div>
      </div>

      {/* composer */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 2, paddingBottom: safeBottom, background: c.surface, borderTop: `1px solid ${c.line}` }}>
        <div style={{ height: composerH, display: "flex", alignItems: "center", gap: 10, padding: "0 12px" }}>
          <Plus size={26} strokeWidth={2} color={c.ink} style={{ display: "block", flexShrink: 0 }} aria-hidden />
          <div
            style={{
              flex: 1,
              minWidth: 0,
              height: 36,
              display: "flex",
              alignItems: "center",
              borderRadius: 999,
              background: c.surfaceSunken,
              border: `1px solid ${c.line}`,
              padding: "0 14px",
              boxSizing: "border-box",
              fontFamily: SANS,
              fontSize: 16,
              color: composerText ? c.ink : c.inkMuted,
              whiteSpace: "pre",
              overflow: "hidden",
            }}
          >
            {composerText || (composerCaret ? "" : "Message")}
            {composerCaret ? <Caret frame={caretFrame} height={20} style={{ marginLeft: 1 }} /> : null}
          </div>
          <span style={{ display: "grid", width: 34, height: 34, flexShrink: 0, placeItems: "center", borderRadius: 999, background: c.ink, color: c.surface }}>
            <ArrowUp size={20} strokeWidth={2} style={{ display: "block" }} aria-hidden />
          </span>
        </div>
      </div>
      {children}
    </div>
  );
};

const Bubble: React.FC<{ msg: ChatMessage; out: boolean; firstOfRun: boolean; lastOfRun: boolean }> = ({ msg, out, firstOfRun, lastOfRun }) => {
  const { c, theme } = useUi();
  const person = msg.from === "me" ? null : msg.from;
  const bg = out ? c.brandSoft : c.surface;
  const r = 18;
  const tail = 6;
  // the corner on the sender's side is small below the first bubble of a run and at the run's tail
  const radius = out ? `${r}px ${firstOfRun ? r : tail}px ${lastOfRun ? tail : r}px ${r}px` : `${firstOfRun ? r : tail}px ${r}px ${r}px ${lastOfRun ? tail : r}px`;
  const nameColor = person ? (theme === "night" ? memberColor(person.joinIndex ?? 0) : c.inkMuted) : c.inkMuted;
  const meta = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, marginLeft: 8, float: "right", position: "relative", top: 7, fontFamily: SANS, fontSize: 11, lineHeight: "14px", color: c.inkMuted, fontVariantNumeric: "tabular-nums" }}>
      {msg.time}
      {out && msg.read !== undefined ? <CheckCheck size={14} strokeWidth={2} style={{ display: "block" }} aria-hidden /> : null}
    </span>
  );
  const kind = msg.kind ?? "text";
  const shadow = theme === "night" ? undefined : "0 1px 1px rgba(43, 27, 58, 0.06)";
  return (
    <div style={{ display: "flex", justifyContent: out ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 6, visibility: msg.hidden ? "hidden" : undefined }}>
      {!out ? (
        <span style={{ width: 28, flexShrink: 0 }}>{lastOfRun && person ? <Avatar person={person} size="xs" style={{ width: 28, height: 28, fontSize: 11 }} /> : null}</span>
      ) : null}
      <div style={{ maxWidth: BUBBLE_MAX, display: "flex", flexDirection: "column", alignItems: out ? "flex-end" : "flex-start" }}>
        {kind === "typing" ? (
          <div style={{ borderRadius: radius, background: bg, padding: "13px 14px", boxShadow: shadow }}>
            <TypingDots frame={msg.dotsFrame} color={c.inkMuted} size={8} gap={5} />
          </div>
        ) : kind === "link" ? (
          <LinkBubble msg={msg} out={out} radius={radius} bg={bg} nameColor={nameColor} showName={firstOfRun && !out} meta={meta} />
        ) : (
          <div style={{ borderRadius: radius, background: bg, padding: "7px 11px 8px", boxShadow: shadow }}>
            {firstOfRun && person && !out ? (
              <p style={{ margin: "0 0 1px", fontFamily: SANS, fontSize: 13, lineHeight: "17px", fontWeight: 700, color: nameColor }}>{person.name}</p>
            ) : null}
            <p style={{ margin: 0, fontFamily: SANS, fontSize: 16, lineHeight: "21px", color: c.ink, overflowWrap: "break-word" }}>
              {msg.text}
              {msg.time ? meta : null}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

const LinkBubble: React.FC<{
  msg: ChatMessage;
  out: boolean;
  radius: string;
  bg: string;
  nameColor: string;
  showName: boolean;
  meta: React.ReactNode;
}> = ({ msg, radius, bg, nameColor, showName, meta }) => {
  const { c, theme } = useUi();
  const l = msg.link ?? {};
  const person = msg.from === "me" ? null : msg.from;
  const inner = BUBBLE_MAX - 8;
  return (
    <div style={{ width: BUBBLE_MAX, borderRadius: radius, background: bg, padding: 4, boxSizing: "border-box", boxShadow: theme === "night" ? undefined : "0 1px 1px rgba(43, 27, 58, 0.06)" }}>
      {showName && person ? (
        <p style={{ margin: "3px 8px 4px", fontFamily: SANS, fontSize: 13, lineHeight: "17px", fontWeight: 700, color: nameColor }}>{person.name}</p>
      ) : null}
      <LinkPreviewCard link={l} width={inner} />
      {msg.text ? (
        <p style={{ margin: 0, padding: "6px 8px 4px", fontFamily: SANS, fontSize: 16, lineHeight: "21px", color: c.ink }}>
          {msg.text}
          {msg.time ? meta : null}
        </p>
      ) : msg.time ? (
        <div style={{ padding: "0 8px 6px", overflow: "hidden" }}>{meta}</div>
      ) : null}
    </div>
  );
};

/**
 * The link preview inside a chat bubble (standalone-renderable for breakout shots): the OG card on top, then the
 * og:title ("Maya invited you to Lisbon Trip") and og:description (the trust sentence).
 */
export const LinkPreviewCard: React.FC<{ link?: ChatLink; width?: number; style?: React.CSSProperties }> = ({ link = {}, width = BUBBLE_MAX - 8, style }) => {
  const { c } = useUi();
  return (
    <div data-ui="link-preview" style={{ width, borderRadius: 14, overflow: "hidden", background: c.surfaceSunken, ...style }}>
      <OgCard width={width} potName={link.potName} emoji={link.emoji} cover={link.cover} members={link.members} />
      <div style={{ padding: "8px 10px 10px" }}>
        <p style={{ margin: 0, fontFamily: SANS, fontSize: 15, lineHeight: "20px", fontWeight: 700, color: c.ink }}>
          {link.title ?? copy["landing.title"](MAYA.name, link.potName ?? LISBON.name)}
        </p>
        <p style={{ margin: "2px 0 0", fontFamily: SANS, fontSize: 13, lineHeight: "18px", color: c.inkMuted }}>{link.description ?? copy["landing.trust"]}</p>
        {link.domain ? <p style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: 12, lineHeight: "16px", color: c.inkMuted }}>{link.domain}</p> : null}
      </div>
    </div>
  );
};

/** The share message the app writes into the chat (share.message), without a URL unless one is given. */
export const shareText = (potName = LISBON.name, link?: string) =>
  link ? copy["share.message"](potName, link) : copy["share.message"](potName, "").replace(/:\s*$/, "");
