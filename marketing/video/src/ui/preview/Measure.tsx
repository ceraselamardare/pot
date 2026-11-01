// Logs the screen-relative rects of [data-ui] elements for the key states (inside a phone: safe areas 50 / 34),
// so src/ui/layout.ts can publish exact breakout positions. Run:
//   node src/ui/preview/measure.mjs   (the CLI does not forward browser logs; the renderer API does)
import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, continueRender, delayRender } from "remotion";
import { SAFE_BOTTOM, SAFE_TOP, SCREEN_H, SCREEN_W } from "../Phone";
import { DISPLAY, SANS } from "../type";
import { UiTheme } from "../theme";
import { PotScreen } from "../screens/PotScreen";
import { SpendSheet } from "../sheets/SpendSheet";
import { ApproveSheet } from "../sheets/ApproveSheet";
import { CloseSheet } from "../sheets/CloseSheet";
import { ChatScreen, shareText } from "../screens/ChatScreen";
import { FEED_FULL, feedAfterGroceries, feedAfterBoat } from "../fixtures";
import { MAYA, SAM, LEO } from "../data";

const Screen: React.FC<{ name: string; children: React.ReactNode }> = ({ name, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const handle = delayRender(`measure ${name}`);
    // measure only once the brand fonts are in (layout depends on them)
    const loads = ["700", "800"].map((w) => document.fonts.load(`${w} 44px ${DISPLAY}`)).concat(["400", "600", "700"].map((w) => document.fonts.load(`${w} 16px ${SANS}`)));
    Promise.all(loads).then(() => new Promise((r) => setTimeout(r, 200))).then(() => {
      const root = ref.current;
      if (root) {
        const r0 = root.getBoundingClientRect();
        const k = r0.width / SCREEN_W; // undo the render scale
        const out: Record<string, number[]> = {};
        root.querySelectorAll("[data-ui]").forEach((el, i) => {
          const r = el.getBoundingClientRect();
          const key = `${el.getAttribute("data-ui")}${out[el.getAttribute("data-ui") ?? ""] ? `#${i}` : ""}`;
          out[key] = [(r.left - r0.left) / k, (r.top - r0.top) / k, r.width / k, r.height / k].map((v) => Math.round(v * 100) / 100);
        });
        // eslint-disable-next-line no-console
        console.log(`UIMEASURE ${name} ${JSON.stringify(out)}`);
      }
      continueRender(handle);
    });
  }, [name]);
  return (
    <div ref={ref} style={{ position: "relative", width: SCREEN_W, height: SCREEN_H, overflow: "hidden", flexShrink: 0 }}>
      <UiTheme theme="day" safeTop={SAFE_TOP} safeBottom={SAFE_BOTTOM}>
        {children}
      </UiTheme>
    </div>
  );
};

export const Measure: React.FC = () => (
  <AbsoluteFill style={{ flexDirection: "row", flexWrap: "wrap", gap: 0 }}>
    <Screen name="pot">
      <PotScreen balance={450} yourShare={150} putIn={150} feed={FEED_FULL} />
    </Screen>
    <Screen name="spendSent">
      <PotScreen balance={366} yourShare={122} putIn={150} feed={feedAfterGroceries()} />
      <SpendSheet step="sent" amount={84} />
    </Screen>
    <Screen name="spendApproved">
      <PotScreen balance={366} yourShare={122} putIn={150} feed={feedAfterGroceries()} />
      <SpendSheet step="approved" amount={84} />
    </Screen>
    <Screen name="approve">
      <PotScreen balance={366} yourShare={122} putIn={150} feed={feedAfterGroceries()} />
      <ApproveSheet state="ready" />
    </Screen>
    <Screen name="closePropose">
      <PotScreen balance={66} yourShare={22} putIn={150} feed={feedAfterBoat()} />
      <CloseSheet mode="propose" />
    </Screen>
    <Screen name="closed">
      <PotScreen balance={66} yourShare={22} putIn={150} feed={feedAfterBoat()} />
      <CloseSheet mode="closed" />
    </Screen>
    <Screen name="rules">
      <PotScreen balance={450} yourShare={150} putIn={150} activeTab="rules" />
    </Screen>
    <Screen name="chat">
      <ChatScreen
        messages={[
          { id: "1", from: SAM, text: "Who's paying for the boat? 🛥️", time: "21:02" },
          { id: "2", from: LEO, text: "I'll pay you back, promise", time: "21:03" },
          { id: "4", from: MAYA, kind: "link", text: shareText(), time: "21:05", link: { members: [MAYA, SAM] } },
        ]}
      />
    </Screen>
  </AbsoluteFill>
);
