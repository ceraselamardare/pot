// Builder D measuring tool (dev only): logs the screen-relative rects (390 × 844 phone screen, safe areas 50 / 34)
// of the elements s09/s10 press, lift or aim at, so the scenes' constants (s09-layout.ts) match the UI kit exactly.
//   node src/scenes/act3/preview-d/measure.mjs
import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, continueRender, delayRender } from "remotion";
import {
  ApproveSheet,
  FEED_FULL,
  LockScreen,
  PotScreen,
  SAFE_BOTTOM,
  SAFE_TOP,
  SCREEN_H,
  SCREEN_W,
  SpendSheet,
  UiTheme,
  feedAfterGroceries,
  feedBoatPending,
  feedAfterBoat,
  DISPLAY,
  SANS,
  MAYA,
} from "../../../ui";

type Probe = { key: string; text?: string; ui?: string; up?: number };

const Screen: React.FC<{ name: string; probes: Probe[]; children: React.ReactNode }> = ({ name, probes, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const handle = delayRender(`measure ${name}`);
    const loads = ["700", "800"]
      .map((w) => document.fonts.load(`${w} 44px ${DISPLAY}`))
      .concat(["400", "600", "700"].map((w) => document.fonts.load(`${w} 16px ${SANS}`)));
    Promise.all(loads)
      .then(() => new Promise((r) => setTimeout(r, 200)))
      .then(() => {
        const root = ref.current;
        if (root) {
          const r0 = root.getBoundingClientRect();
          const k = r0.width / SCREEN_W;
          const out: Record<string, number[] | null> = {};
          const all = Array.from(root.querySelectorAll<HTMLElement>("*"));
          for (const p of probes) {
            let el: HTMLElement | null = null;
            if (p.ui) el = root.querySelector<HTMLElement>(`[data-ui="${p.ui}"]`);
            if (p.text) {
              // the smallest element whose whole text is the probe text
              const hits = all.filter((e) => (e.textContent ?? "").trim() === p.text);
              el = hits.length ? hits[hits.length - 1] : null;
            }
            for (let i = 0; i < (p.up ?? 0) && el; i++) el = el.parentElement;
            if (!el) {
              out[p.key] = null;
              continue;
            }
            const r = el.getBoundingClientRect();
            out[p.key] = [(r.left - r0.left) / k, (r.top - r0.top) / k, r.width / k, r.height / k].map((v) => Math.round(v * 100) / 100);
          }
          // eslint-disable-next-line no-console
          console.log(`DMEASURE ${name} ${JSON.stringify(out)}`);
        }
        continueRender(handle);
      });
  }, [name, probes]);
  return (
    <div ref={ref} style={{ position: "relative", width: SCREEN_W, height: SCREEN_H, overflow: "hidden", flexShrink: 0 }}>
      <UiTheme theme="day" safeTop={SAFE_TOP} safeBottom={SAFE_BOTTOM}>
        {children}
      </UiTheme>
    </div>
  );
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d) => ({ key: `key${d}`, text: d }));

const WORDS = [
  "Small spends",
  "approve themselves.",
  "approve",
  "themselves.",
  "Bigger spends",
  "go to the group.",
  "go to the",
  "the group.",
  "2 of 3",
  "approvals",
  "Leo approves,",
  "right from a",
  "notification.",
  "right from a notification.",
  "$450.00",
  "$366.00",
  "needs",
];

/** Widths (px) of the big-type strings in Gabarito 800 at 100 px, tracking -0.025em. */
const TextWidths: React.FC = () => {
  useLayoutEffect(() => {
    const handle = delayRender("measure text");
    document.fonts.load(`800 100px ${DISPLAY}`).then(() => {
      const c = document.createElement("canvas").getContext("2d")!;
      c.font = `800 100px ${DISPLAY}`;
      (c as unknown as { letterSpacing: string }).letterSpacing = "-2.5px";
      const out: Record<string, number> = {};
      for (const w of WORDS) out[w] = Math.round(c.measureText(w).width);
      // eslint-disable-next-line no-console
      console.log(`DMEASURE text100 ${JSON.stringify(out)}`);
      continueRender(handle);
    });
  }, []);
  return null;
};

export const DMeasure: React.FC = () => (
  <AbsoluteFill style={{ flexDirection: "row", flexWrap: "wrap" }}>
    <TextWidths />
    <Screen
      name="pot"
      probes={[
        { key: "hero", ui: "hero" },
        { key: "spendLabel", text: "Spend" },
        { key: "spendBtn", text: "Spend", up: 1 },
        { key: "balance", text: "$450.00" },
      ]}
    >
      <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
    </Screen>
    <Screen
      name="amount84"
      probes={[
        { key: "amount", text: "$84" },
        { key: "previewTitle", text: "This will be approved instantly" },
        { key: "previewBox", text: "This will be approved instantly", up: 2 },
        { key: "chipGroceries", text: "Groceries 🛒" },
        { key: "cta", text: "Get $84 back", up: 1 },
        { key: "note", text: "+ Add a note (optional)" },
        { key: "title", text: "Spend from Lisbon Trip" },
        ...KEYS,
      ]}
    >
      <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
      <SpendSheet step="amount" typed="84" category="groceries" />
    </Screen>
    <Screen
      name="vote300"
      probes={[
        { key: "amount", text: "$300" },
        { key: "previewTitle", text: "This needs 2 of 3 approvals" },
        { key: "previewBox", text: "This needs 2 of 3 approvals", up: 2 },
        { key: "chipTickets", text: "Tickets 🎟️" },
        { key: "note", text: "the boat trip" },
        { key: "cta", text: "Ask the group", up: 1 },
        ...KEYS,
      ]}
    >
      <PotScreen balance={366} yourShare={122} putIn={150} feed={feedAfterGroceries()} />
      <SpendSheet step="vote" typed="300" category="tickets" note="the boat trip" />
    </Screen>
    <Screen
      name="voteChipsUnscrolled"
      probes={[{ key: "chipTickets", text: "Tickets 🎟️" }, { key: "chipGroceries", text: "Groceries 🛒" }, { key: "chipStay", text: "Stay 🏠" }]}
    >
      <PotScreen balance={366} yourShare={122} putIn={150} feed={feedAfterGroceries()} />
      <SpendSheet step="vote" typed="300" category={null} chipsScrollX={0} />
    </Screen>
    <Screen name="vote300scrolled" probes={[{ key: "note", text: "the boat trip" }, { key: "amount", text: "$300" }, { key: "previewBox", text: "This needs 2 of 3 approvals", up: 2 }, { key: "chipTickets", text: "Tickets 🎟️" }, { key: "cta", text: "Ask the group", up: 1 }]}>
      <PotScreen balance={366} yourShare={122} putIn={150} feed={feedAfterGroceries()} />
      <SpendSheet step="vote" typed="300" category="tickets" note="the boat trip" bodyScroll={56} />
    </Screen>
    <Screen name="checking" probes={[{ key: "capsule", ui: "capsule" }, { key: "result", ui: "spend-result" }, { key: "checkingText", text: "Checking Pot rules…" }]}>
      <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
      <SpendSheet step="checking" amount={84} category="groceries" />
    </Screen>
    <Screen name="approved" probes={[{ key: "capsule", ui: "capsule" }, { key: "result", ui: "spend-result" }]}>
      <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
      <SpendSheet step="approved" amount={84} category="groceries" />
    </Screen>
    <Screen
      name="sent"
      probes={[
        { key: "capsule", ui: "capsule" },
        { key: "result", ui: "spend-result" },
        { key: "sentText", text: "$84 sent to you" },
        { key: "done", text: "Done", up: 1 },
      ]}
    >
      <PotScreen balance={366} yourShare={122} putIn={150} feed={feedAfterGroceries()} />
      <SpendSheet step="sent" amount={84} category="groceries" />
    </Screen>
    <Screen
      name="voteSent"
      probes={[
        { key: "timeline", ui: "timeline" },
        { key: "sentBox", text: "Sent to the group", up: 2 },
        { key: "done", text: "Done", up: 1 },
        { key: "amount", text: "$300.00" },
      ]}
    >
      <PotScreen balance={366} yourShare={122} putIn={150} feed={feedAfterGroceries()} />
      <SpendSheet step="voteSent" amount={300} category="tickets" />
    </Screen>
    <Screen name="lock" probes={[{ key: "notifTitle", text: "Maya needs your OK" }, { key: "notif", text: "Maya needs your OK", up: 2 }]}>
      <LockScreen notifications={[{ id: "n", progress: 1 }]} />
    </Screen>
    <Screen
      name="approveReady"
      probes={[
        { key: "timeline", ui: "timeline" },
        { key: "approve", text: "Approve $300", up: 1 },
        { key: "decline", text: "Decline", up: 1 },
        { key: "title", text: "Maya asks for $300" },
      ]}
    >
      <PotScreen balance={366} yourShare={122} putIn={150} feed={feedBoatPending()} />
      <ApproveSheet state="ready" />
    </Screen>
    <Screen
      name="approveApproved"
      probes={[
        { key: "timeline", ui: "timeline" },
        { key: "final", text: "Approved! $300 is on its way to Maya.", up: 1 },
        { key: "done", text: "Done", up: 1 },
        { key: "title", text: "Maya asks for $300" },
      ]}
    >
      <PotScreen balance={366} yourShare={122} putIn={150} feed={feedBoatPending()} />
      <ApproveSheet state="approved" />
    </Screen>
    <Screen
      name="potBoatPending"
      probes={[
        { key: "rowMain", text: "Maya asks for $300 for the boat trip" },
        { key: "chipText", text: "1 of 2 approvals" },
        { key: "chip", text: "1 of 2 approvals", up: 1 },
        { key: "row", text: "Maya asks for $300 for the boat trip", up: 2 },
        { key: "today", text: "Today" },
        { key: "groceriesRow", text: "Maya got $84 back for groceries", up: 2 },
      ]}
    >
      <PotScreen balance={366} yourShare={122} putIn={150} feed={feedBoatPending()} demoPerson={MAYA} />
    </Screen>
    <Screen
      name="potAfterBoat"
      probes={[
        { key: "hero", ui: "hero" },
        { key: "balance", text: "$66.00" },
        { key: "rowMain", text: "$300 sent to Maya for the boat trip" },
        { key: "chipText", text: "Approved" },
        { key: "chip", text: "Approved", up: 1 },
        { key: "row", text: "$300 sent to Maya for the boat trip", up: 2 },
        { key: "groceriesRow", text: "Maya got $84 back for groceries", up: 2 },
      ]}
    >
      <PotScreen balance={66} yourShare={22} putIn={150} feed={feedAfterBoat()} demoPerson={MAYA} />
    </Screen>
    <Screen name="potAfterGroceries" probes={[{ key: "today", text: "Today" }, { key: "groceriesRow", text: "Maya got $84 back for groceries", up: 2 }, { key: "yesterday", text: "Yesterday" }]}>
      <PotScreen balance={366} yourShare={122} putIn={150} feed={feedAfterGroceries()} />
    </Screen>
  </AbsoluteFill>
);
