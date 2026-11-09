// Builder D measuring tool (dev only): logs the screen-relative rects (390 × 844 phone screen, safe areas 50 / 34)
// of the elements s09/s10 press, lift or aim at, so the scenes' constants (s09-shared.tsx `UI`) match the UI kit.
// v2 (2026-11-03): the app of Nov 3 (round actions, two-step Spend, one OK).
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
  feedAfterBoat,
  feedBoatPending,
  DISPLAY,
  SANS,
} from "../../../ui";

type Probe = { key: string; text?: string; ui?: string; up?: number; nth?: number };

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
            if (p.ui) {
              const hits = Array.from(root.querySelectorAll<HTMLElement>(`[data-ui="${p.ui}"]`));
              el = hits[p.nth ?? 0] ?? null;
            }
            if (p.text) {
              // the smallest element whose whole text is the probe text (last = deepest), or the nth match
              const hits = all.filter((e) => (e.textContent ?? "").trim() === p.text);
              el = hits.length ? (p.nth !== undefined ? (hits[p.nth] ?? null) : hits[hits.length - 1]) : null;
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

export const DMeasure: React.FC = () => (
  <AbsoluteFill style={{ flexDirection: "row", flexWrap: "wrap" }}>
    <Screen
      name="pot"
      probes={[
        { key: "hero", ui: "hero" },
        { key: "balance", text: "$450.00" },
        { key: "share", text: "You'd get back $150 · You put in $150", up: 0 },
        { key: "spendLabel", text: "Spend" },
        { key: "tab3", text: "$0.00" },
        { key: "tabBar", ui: "tab-bar" },
      ]}
    >
      <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
    </Screen>
    <Screen
      name="howMuch84"
      probes={[
        { key: "amount", text: "$84" },
        { key: "decision", ui: "decision" },
        { key: "next", ui: "cta" },
        { key: "step1", ui: "spend-step1" },
        { key: "title", text: "Spend from Lisbon Trip" },
        ...KEYS,
      ]}
    >
      <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
      <SpendSheet step="howMuch" typed="84" />
    </Screen>
    <Screen
      name="details84"
      probes={[
        { key: "amount", text: "$84" },
        { key: "chipGroceries", text: "Groceries 🛒" },
        { key: "whoLabel", text: "Who gets paid?" },
        { key: "payeeMe", text: "Me" },
        { key: "note", text: "+ Add a note (optional)" },
        { key: "decision", ui: "decision" },
        { key: "cta", ui: "cta" },
        { key: "back", text: "Back" },
        { key: "step2", ui: "spend-step2" },
        { key: "title", text: "Spend from Lisbon Trip" },
      ]}
    >
      <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
      <SpendSheet step="details" typed="84" category="groceries" />
    </Screen>
    <Screen
      name="details84open"
      probes={[
        { key: "decision", ui: "decision" },
        { key: "cta", ui: "cta" },
        { key: "chipGroceries", text: "Groceries 🛒" },
        { key: "title", text: "Spend from Lisbon Trip" },
        { key: "body", text: "Anyone can spend up to $100 without asking." },
      ]}
    >
      <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
      <SpendSheet step="details" typed="84" category="groceries" decisionOpen={1} />
    </Screen>
    <Screen name="details84none" probes={[{ key: "chipGroceries", text: "Groceries 🛒" }, { key: "chipTickets", text: "Tickets 🎟️" }, { key: "decision", ui: "decision" }]}>
      <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
      <SpendSheet step="details" typed="84" category={null} chipsScrollX={0} />
    </Screen>
    <Screen
      name="howMuch300"
      probes={[
        { key: "amount", text: "$300" },
        { key: "decision", ui: "decision" },
        { key: "next", ui: "cta" },
        ...KEYS,
      ]}
    >
      <PotScreen balance={366} yourShare={122} putIn={150} feed={feedAfterGroceries()} tabBar={{ balance: 84 }} />
      <SpendSheet step="howMuch" typed="300" />
    </Screen>
    <Screen
      name="details300"
      probes={[
        { key: "amount", text: "$300" },
        { key: "chipTickets", text: "Tickets 🎟️" },
        { key: "note", text: "the boat trip" },
        { key: "decision", ui: "decision" },
        { key: "cta", ui: "cta" },
        { key: "back", text: "Back" },
        { key: "payeeMe", text: "Me" },
      ]}
    >
      <PotScreen balance={366} yourShare={122} putIn={150} feed={feedAfterGroceries()} tabBar={{ balance: 84 }} />
      <SpendSheet step="details" typed="300" category="tickets" note="the boat trip" />
    </Screen>
    <Screen
      name="details300open"
      probes={[
        { key: "decision", ui: "decision" },
        { key: "cta", ui: "cta" },
        { key: "chipTickets", text: "Tickets 🎟️" },
        { key: "note", text: "the boat trip" },
        { key: "title", text: "Spend from Lisbon Trip" },
      ]}
    >
      <PotScreen balance={366} yourShare={122} putIn={150} feed={feedAfterGroceries()} tabBar={{ balance: 84 }} />
      <SpendSheet step="details" typed="300" category="tickets" note="the boat trip" decisionOpen={1} />
    </Screen>
    <Screen name="details300none" probes={[{ key: "chipTickets", text: "Tickets 🎟️" }, { key: "note", text: "+ Add a note (optional)" }]}>
      <PotScreen balance={366} yourShare={122} putIn={150} feed={feedAfterGroceries()} tabBar={{ balance: 84 }} />
      <SpendSheet step="details" typed="300" category={null} chipsScrollX={0} />
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
        { key: "receipt", text: "Receipt" },
        { key: "done", text: "Done", up: 1 },
      ]}
    >
      <PotScreen balance={366} yourShare={122} putIn={150} feed={feedAfterGroceries()} tabBar={{ balance: 84 }} />
      <SpendSheet step="sent" amount={84} category="groceries" />
    </Screen>
    <Screen
      name="oneOkSent"
      probes={[
        { key: "result", ui: "spend-one-ok-sent" },
        { key: "status", ui: "spend-sent-status" },
        { key: "amount", text: "$300.00" },
        { key: "done", text: "Done", up: 1 },
      ]}
    >
      <PotScreen balance={366} yourShare={122} putIn={150} feed={feedBoatPending()} tabBar={{ balance: 84 }} />
      <SpendSheet step="oneOkSent" amount={300} category="tickets" />
    </Screen>
    <Screen name="lock" probes={[{ key: "push", ui: "push" }, { key: "title", text: "Maya needs one OK" }]}>
      <LockScreen notifications={[{ id: "n", progress: 1 }]} />
    </Screen>
    <Screen
      name="approveReady"
      probes={[
        { key: "oneOk", ui: "one-ok" },
        { key: "facts", ui: "spend-facts" },
        { key: "cta", ui: "cta" },
        { key: "decline", text: "Decline", up: 1 },
        { key: "title", text: "Maya asks for $300" },
        { key: "why", text: "Needs one OK from someone in the group who has added money. It's over Maya's instant limit." },
      ]}
    >
      <PotScreen balance={366} yourShare={122} putIn={150} feed={feedBoatPending()} />
      <ApproveSheet state="ready" />
    </Screen>
    <Screen
      name="approveDone"
      probes={[
        { key: "oneOk", ui: "one-ok" },
        { key: "facts", ui: "spend-facts" },
        { key: "status", ui: "approve-status" },
        { key: "done", text: "Done", up: 1 },
        { key: "title", text: "Maya asks for $300" },
        { key: "gaveOk", text: "You · gave the OK" },
      ]}
    >
      <PotScreen balance={366} yourShare={122} putIn={150} feed={feedBoatPending()} />
      <ApproveSheet state="approved" />
    </Screen>
    <Screen
      name="potAfterBoat"
      probes={[
        { key: "balance", text: "$66.00" },
        { key: "firstRow", ui: "compact-row" },
        { key: "chipOneOk", text: "One OK", up: 1 },
        { key: "chipOneOkText", text: "One OK" },
        { key: "tab3", text: "$384.00" },
      ]}
    >
      <PotScreen balance={66} yourShare={22} putIn={150} feed={feedAfterBoat()} tabBar={{ balance: 384 }} />
    </Screen>
    <Screen name="potAfterGroceries" probes={[{ key: "firstRow", ui: "compact-row" }, { key: "instant", text: "Instant" }, { key: "tab3", text: "$84.00" }]}>
      <PotScreen balance={366} yourShare={122} putIn={150} feed={feedAfterGroceries()} tabBar={{ balance: 84 }} />
    </Screen>
  </AbsoluteFill>
);
