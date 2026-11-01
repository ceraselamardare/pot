// Builder C measuring tool: logs the screen-relative rects (390 × 844 logical px, safe areas 50 / 34) of the
// in-phone elements s07/s08 animate around (press targets, breakout sources, the flying card's start).
//   node src/scenes/act3/preview-c/measure-c.mjs
import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, continueRender, delayRender } from "remotion";
import {
  AddMoneySheet,
  ChatScreen,
  CreatePotSheet,
  FEED_FULL,
  InviteLanding,
  LEO,
  MAYA,
  PotScreen,
  SAFE_BOTTOM,
  SAFE_TOP,
  SAM,
  SCREEN_H,
  SCREEN_W,
  UiTheme,
  YoureInSheet,
  feedLeoAdding,
} from "../../../ui";
import { DISPLAY, SANS } from "../../../brand/fonts";
import { mayaChat } from "../c-lib/chat";

type Target = { key: string; text: string; up?: number };

const Screen: React.FC<{ name: string; targets: Target[]; children: React.ReactNode }> = ({ name, targets, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const handle = delayRender(`measure ${name}`);
    const loads = ["700", "800"].map((w) => document.fonts.load(`${w} 44px ${DISPLAY}`)).concat(["400", "600", "700"].map((w) => document.fonts.load(`${w} 16px ${SANS}`)));
    Promise.all(loads)
      .then(() => new Promise((r) => setTimeout(r, 250)))
      .then(() => {
        const root = ref.current;
        if (root) {
          const r0 = root.getBoundingClientRect();
          const k = r0.width / SCREEN_W;
          const out: Record<string, number[]> = {};
          const all = Array.from(root.querySelectorAll<HTMLElement>("*"));
          for (const t of targets) {
            let best: HTMLElement | null = null;
            let bestArea = Infinity;
            for (const el of all) {
              if (!(el.textContent ?? "").includes(t.text)) continue;
              const r = el.getBoundingClientRect();
              const area = r.width * r.height;
              if (area > 0 && area < bestArea) {
                best = el;
                bestArea = area;
              }
            }
            let el: HTMLElement | null = best;
            for (let i = 0; i < (t.up ?? 0) && el; i++) el = el.parentElement;
            if (!el) continue;
            const r = el.getBoundingClientRect();
            out[t.key] = [(r.left - r0.left) / k, (r.top - r0.top) / k, r.width / k, r.height / k].map((v) => Math.round(v * 100) / 100);
          }
          root.querySelectorAll("[data-ui]").forEach((node, i) => {
            const r = node.getBoundingClientRect();
            out[`data-ui:${node.getAttribute("data-ui")}#${i}`] = [(r.left - r0.left) / k, (r.top - r0.top) / k, r.width / k, r.height / k].map((v) => Math.round(v * 100) / 100);
          });
          // eslint-disable-next-line no-console
          console.log(`CMEASURE ${name} ${JSON.stringify(out)}`);
        }
        continueRender(handle);
      });
  }, [name, targets]);
  return (
    <div ref={ref} style={{ position: "relative", width: SCREEN_W, height: SCREEN_H, overflow: "hidden", flexShrink: 0 }}>
      <UiTheme theme="day" safeTop={SAFE_TOP} safeBottom={SAFE_BOTTOM}>
        {children}
      </UiTheme>
    </div>
  );
};

const btn = (key: string, text: string): Target => ({ key, text, up: 1 });

export const CMeasure: React.FC = () => (
  <AbsoluteFill style={{ flexDirection: "row", flexWrap: "wrap" }}>
    <Screen
      name="create1"
      targets={[
        { key: "previewName", text: "Just you so far", up: 2 },
        { key: "nameLabel", text: "Pot name" },
        { key: "field", text: "Lisbon Trip", up: 0 },
        { key: "flag", text: "🇵🇹" },
        { key: "plane", text: "✈️" },
        btn("next", "Next"),
        { key: "title", text: "Name your Pot" },
      ]}
    >
      <CreatePotSheet step={1} typedChars={11} emoji="✈️" />
    </Screen>
    <Screen
      name="create2"
      targets={[
        { key: "line1", text: "Up to $100 without asking" },
        { key: "line2", text: "Bigger spends need most of the group" },
        { key: "line3", text: "Leftovers back at the end" },
        { key: "trip", text: "Trip", up: 0 },
        btn("create", "Create Pot"),
        { key: "title", text: "How should it work?" },
      ]}
    >
      <CreatePotSheet step={2} />
    </Screen>
    <Screen
      name="create3"
      targets={[
        { key: "title", text: "Creating Lisbon Trip…" },
        { key: "free", text: "Free: we cover the setup." },
        { key: "ready", text: "Ready to share" },
      ]}
    >
      <CreatePotSheet step={3} />
    </Screen>
    <Screen
      name="chat"
      targets={[
        { key: "invite", text: "Join our Lisbon Trip Pot" },
        { key: "in", text: "in!" },
        { key: "joining", text: "joining now" },
      ]}
    >
      <ChatScreen messages={mayaChat({ link: 1, sam: 1, leo: 1 })} />
    </Screen>
    {[0, 120, 160, 200, 240].map((s) => (
      <Screen
        key={s}
        name={`landing${s}`}
        targets={[
          { key: "title", text: "Maya invited you to Lisbon Trip" },
          { key: "hero", text: "$300.00" },
          { key: "goal", text: "$300 of $450 collected" },
          btn("google", "Join with Google"),
          { key: "whoIn", text: "Maya and Sam are in" },
        ]}
      >
        <InviteLanding scrollY={s} />
      </Screen>
    ))}
    <Screen name="youreIn" targets={[btn("cta", "Add my $150 share"), { key: "title", text: "You're in!" }]}>
      <InviteLanding scrollY={200} joinStep={3} members={[MAYA, SAM, LEO]} emptySeats={0} />
      <YoureInSheet />
    </Screen>
    <Screen name="addMoney" targets={[btn("cta", "Add $150"), { key: "title", text: "Add money to Lisbon Trip" }]}>
      <PotScreen balance={300} yourShare={0} putIn={0} collected={300} feed={FEED_FULL.slice(1)} />
      <AddMoneySheet />
    </Screen>
    <Screen name="leoAdded" targets={[{ key: "hero", text: "$450.00" }, { key: "rowAmt", text: "+ $150.00" }, { key: "row", text: "Leo added $150", up: 3 }]}>
      <PotScreen balance={450} yourShare={150} putIn={150} collected={450} feed={feedLeoAdding("added")} />
    </Screen>
    <Screen name="mayaFull" targets={[{ key: "hero", text: "$450.00" }, { key: "rowAmt", text: "+ $150.00" }, { key: "row", text: "Leo added $150", up: 3 }]}>
      <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
    </Screen>
  </AbsoluteFill>
);
