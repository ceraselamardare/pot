// Burned-in captions for muted autoplay (the X cut). Director-owned.
// Pages are built from the VO word timings; punctuation is restored from the script tokens when the counts match.
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { SCENES, type SceneId, type SceneSpec } from "./data/timeline";
import { VO_DATA } from "./data/vo-data";
import { scriptTokens } from "./data/script";
import { day, night } from "./brand/tokens";
import { SANS } from "./brand/fonts";
import { FPS } from "./motion/time";

type Page = { text: string; from: number; to: number; act: SceneSpec["act"]; id: SceneId };

const MAX_CHARS = 56; // one line at 40 px Figtree 600 stays under ~1150 px
const COMMA_BREAK_MIN = 18; // break after a comma once the page has this many characters
const GAP_BREAK_S = 0.32; // a pause this long starts a new page
const MIN_FRAMES = 50; // research §3.4: captions on screen ≥ 50 f
// Never end a page on one of these: carry it to the next page instead.
const DANGLING = new Set(["a", "an", "the", "to", "of", "in", "on", "and", "so", "for", "with", "right", "from"]);

// review-1 P0-1: captions only where the film's own big type does NOT already show the spoken words.
// Pages whose text matches one of these (punctuation-insensitive) are not shown; "all" drops a scene's captions.
const SUPPRESS: Partial<Record<SceneId, string[] | "all">> = {
  "s01-hook": ["Every group trip has a money problem."],
  "s05-pivot": ["What if the money lived right in the group chat?"],
  "s06-reveal": "all",
  // "Drop the link in the chat." sits level with the chat's send button in s08's close-up (review-2): the visual
  // already shows the link landing in the chat, so it is suppressed too.
  "s08-join": ["Drop the link in the chat.", "No wallet.", "No seed phrase.", "No gas."],
  "s09-instant": ["Small spends approve themselves."],
  "s10-group": ["Bigger spends go to the group.", "so Leo approves, right from a notification."],
  "s11-close": ["When the trip's over,", "close the Pot."],
  "s12-tech": ["And no one can take money out alone."],
  "s13-end": "all",
};
const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9$]/g, "");
const suppressed = (id: SceneId, text: string) => {
  const rule = SUPPRESS[id];
  if (!rule) return false;
  if (rule === "all") return true;
  return rule.some((r) => key(r) === key(text));
};

// Placement: Acts 1 and 2 are full-frame type, so captions sit bottom-centre. In Acts 3 and 4 the phone / the x-ray
// stack own the left half, so captions sit right-anchored in the free right column (to x 1840), clear of the UI.
const placement = (act: SceneSpec["act"]): "center" | "right" => (act === 3 || act === 4 ? "right" : "center");

const buildPages = (): Page[] => {
  const pages: Page[] = [];
  for (const s of SCENES) {
    const clip = VO_DATA[s.id];
    if (!clip) continue;
    const tokens = scriptTokens(s.id);
    const words = clip.words.map((w, i) => ({
      ...w,
      text: tokens.length === clip.words.length ? tokens[i].replace(/^…/, "") : w.text,
    }));
    let cur: typeof words = [];
    const flush = () => {
      if (!cur.length) return;
      const from = s.from + s.voAt + Math.round(cur[0].start * FPS) - 2;
      const to = s.from + s.voAt + Math.round(cur[cur.length - 1].end * FPS) + 10;
      const text = cur.map((w) => w.text).join(" ");
      if (!suppressed(s.id, text)) pages.push({ text, from, to, act: s.act, id: s.id });
      cur = [];
    };
    words.forEach((w, i) => {
      const prev = words[i - 1];
      const curText = cur.map((x) => x.text).join(" ");
      const len = curText.length + w.text.length + 1;
      const sentenceEnd = prev && /[.?!…]$/.test(prev.text);
      const commaBreak = prev && /,$/.test(prev.text) && curText.length >= COMMA_BREAK_MIN;
      const pause = prev && w.start - prev.end > GAP_BREAK_S;
      if (cur.length && (len > MAX_CHARS || pause || sentenceEnd || commaBreak)) {
        // Overflow break: don't strand a short function word at the end of the page.
        const carry: typeof words = [];
        if (len > MAX_CHARS && !sentenceEnd && !commaBreak) {
          while (cur.length > 1 && DANGLING.has(cur[cur.length - 1].text.toLowerCase().replace(/[^a-z]/g, ""))) {
            carry.unshift(cur.pop()!);
          }
        }
        flush();
        cur = carry;
      }
      cur.push(w);
    });
    flush();
  }
  // Enforce a minimum duration without overlapping the next page.
  return pages.map((p, i) => {
    const next = pages[i + 1];
    const wanted = Math.max(p.to, p.from + MIN_FRAMES);
    return { ...p, to: next ? Math.min(wanted, next.from) : wanted };
  });
};

const PAGES = buildPages();

export const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  const page = PAGES.find((p) => frame >= p.from && frame < p.to);
  if (!page) return null;
  const isNight = page.act === 1 || page.act === 4;
  const t = isNight ? night : day;
  const local = frame - page.from;
  const fadeIn = Math.min(1, local / 6);
  const right = placement(page.act) === "right";
  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: right ? "flex-end" : "center",
        paddingBottom: right ? 44 : 56,
        // Right-anchored at x 1840: clear of the phone even in Act 3 close-ups (the phone reaches x ≈ 1310 at most).
        paddingRight: right ? 80 : 0,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontFamily: SANS,
          fontWeight: 600,
          fontSize: 40,
          lineHeight: "52px",
          color: t.ink,
          background: isNight ? "rgba(38, 28, 48, 0.88)" : "rgba(255, 255, 255, 0.9)",
          border: `1px solid ${t.line}`,
          borderRadius: 16,
          padding: "10px 28px",
          maxWidth: right ? 640 : 1400,
          textAlign: right ? "right" : "center",
          // Balanced lines: never strand a single word ("back.") on a second line (review-2).
          textWrap: "balance",
          opacity: fadeIn,
          transform: `translateY(${(1 - fadeIn) * 8}px)`,
        }}
      >
        {page.text}
      </div>
    </AbsoluteFill>
  );
};
