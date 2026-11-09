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

type Target = { key: string; text: string; up?: number; nth?: number };

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
          const rect = (el: Element) => {
            const r = el.getBoundingClientRect();
            return [(r.left - r0.left) / k, (r.top - r0.top) / k, r.width / k, r.height / k].map((v) => Math.round(v * 100) / 100);
          };
          const out: Record<string, number[]> = {};
          const all = Array.from(root.querySelectorAll<HTMLElement>("*"));
          for (const t of targets) {
            // smallest elements whose text contains the target; nth picks among equal-text hits (top to bottom)
            const hits = all
              .filter((el) => (el.textContent ?? "").includes(t.text))
              .map((el) => ({ el, r: el.getBoundingClientRect() }))
              .filter(({ r }) => r.width * r.height > 0);
            const minArea = Math.min(...hits.map(({ r }) => r.width * r.height));
            const smallest = hits.filter(({ r }) => r.width * r.height <= minArea * 1.0001).sort((a, b) => a.r.top - b.r.top);
            let el: HTMLElement | null = smallest[t.nth ?? 0]?.el ?? null;
            for (let i = 0; i < (t.up ?? 0) && el; i++) el = el.parentElement;
            if (el) out[t.key] = rect(el);
          }
          root.querySelectorAll("[data-ui]").forEach((node, i) => {
            out[`ui:${node.getAttribute("data-ui")}#${i}`] = rect(node);
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
    <Screen name="create1" targets={[btn("change", "Change"), btn("create", "Create Pot"), { key: "title", text: "Start a Pot" }, { key: "name", text: "Lisbon Trip", nth: 1 }]}>
      <CreatePotSheet step={1} typedChars={11} emoji="✈️" />
    </Screen>
    <Screen name="create1picker" targets={[{ key: "flag", text: "🇵🇹" }, btn("done", "Done"), btn("change", "Change")]}>
      <CreatePotSheet step={1} typedChars={11} emoji="✈️" picker />
    </Screen>
    <Screen name="create2" targets={[btn("create", "Create Pot"), { key: "title", text: "Pot rules" }]}>
      <CreatePotSheet step={2} />
    </Screen>
    <Screen name="create2s412" targets={[]}>
      <CreatePotSheet step={2} bodyScroll={412} />
    </Screen>
    <Screen name="create2s714" targets={[{ key: "majority", text: "Bigger spends need more than half the group" }, { key: "fixedTitle", text: "Every Pot works like this" }]}>
      <CreatePotSheet step={2} bodyScroll={714} />
    </Screen>
    <Screen name="create3" targets={[{ key: "title", text: "Creating Lisbon Trip…" }, { key: "free", text: "Free: we cover the setup." }]}>
      <CreatePotSheet step={3} />
    </Screen>
    <Screen name="chat" targets={[{ key: "invite", text: "Join our Lisbon Trip Pot" }]}>
      <ChatScreen messages={mayaChat({ link: 1, sam: 1, leo: 1 })} />
    </Screen>
    {[0, 160, 200, 240].map((s) => (
      <Screen
        key={s}
        name={`landing${s}`}
        targets={[
          { key: "title", text: "Maya invited you to Lisbon Trip" },
          { key: "hero", text: "$300.00" },
          btn("google", "Join with Google"),
          { key: "whoIn", text: "Maya and 1 other are in" },
          { key: "peek", text: "up to $300 with one OK" },
        ]}
      >
        <InviteLanding scrollY={s} />
      </Screen>
    ))}
    <Screen name="youreIn" targets={[btn("cta", "Add my $150 share"), { key: "title", text: "You're in!" }]}>
      <InviteLanding scrollY={160} joinStep={3} members={[MAYA, SAM, LEO]} emptySeats={0} />
      <YoureInSheet />
    </Screen>
    <Screen name="addStep2" targets={[btn("cta", "Add $150"), { key: "title", text: "Add money to Lisbon Trip" }, { key: "goal", text: "Goal reached" }]}>
      <PotScreen balance={300} yourShare={0} putIn={0} collected={300} feed={FEED_FULL.slice(1)} />
      <AddMoneySheet step={2} />
    </Screen>
    <Screen name="leoAdded" targets={[{ key: "hero", text: "$450.00" }, { key: "rowAmt", text: "+ $150.00" }]}>
      <PotScreen balance={450} yourShare={150} putIn={150} collected={450} feed={feedLeoAdding("added")} />
    </Screen>
    <Screen name="mayaFull" targets={[{ key: "hero", text: "$450.00" }, { key: "rowAmt", text: "+ $150.00" }, { key: "share", text: "You'd get back" }]}>
      <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
    </Screen>
  </AbsoluteFill>
);
