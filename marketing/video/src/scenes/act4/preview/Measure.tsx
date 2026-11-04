// Builder E: measures in-phone rects the kit's LAYOUT doesn't carry (screen px from the screen's top-left), by
// logging getBoundingClientRect() of data-ui nodes. Run with --log=verbose and grep "[E-MEASURE]".
import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill, continueRender, delayRender } from "remotion";
import { CloseSheet, defaultRefundRows, feedAfterBoat, MoreSheet, Phone, PotScreen } from "../../../ui";
import { closeTimeline } from "../../act3/s11-approvals";

export const S11Measure: React.FC<{ mode: "waiting" | "waiting2" | "closed" | "propose" | "more" }> = ({ mode }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [handle] = React.useState(() => delayRender("measure"));
  const [text, setText] = React.useState("");
  useLayoutEffect(() => {
    const run = async () => {
      await document.fonts.ready;
      const root = ref.current!;
      const screen = root.querySelector('[data-e="screen"]') as HTMLElement;
      const s = screen.getBoundingClientRect();
      const q = (sel: string) => Array.from(root.querySelectorAll(sel)) as HTMLElement[];
      const out: Record<string, unknown> = {};
      const rel = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return [+(r.left - s.left).toFixed(2), +(r.top - s.top).toFixed(2), +r.width.toFixed(2), +r.height.toFixed(2)];
      };
      q('[data-ui="refund-table"]').forEach((el, i) => (out[`table${i}`] = rel(el)));
      q('[data-ui="timeline"]').forEach((el, i) => (out[`timeline${i}`] = rel(el)));
      q('[data-ui="more-item"]').forEach((el, i) => (out[`moreItem${i}`] = rel(el)));
      q("button, [data-ui='button']").forEach((el, i) => (out[`button${i}`] = rel(el)));
      // the sheet's buttons are spans: find by text
      q("span").filter((el) => /^(Ask the group to close|Done|Keep the Pot open)$/.test(el.textContent ?? "") && el.children.length <= 2).forEach((el) => (out[`btn:${el.textContent}`] = rel(el)));
      setText(`${mode}\n` + Object.entries(out).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join("\n"));
      requestAnimationFrame(() => continueRender(handle));
    };
    run();
  }, [handle, mode]);
  const rows = defaultRefundRows(22, 150);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingLeft: 40, flexDirection: "row", gap: 40, background: "#faf9f6" }}>
      <div ref={ref} style={{ position: "relative" }}>
        <Phone theme="day">
          <div data-e="screen" style={{ position: "absolute", inset: 0 }} />
          <PotScreen balance={66} yourShare={22} putIn={150} feed={feedAfterBoat()} tabBar={{ active: "pots", balance: 384 }}>
            {mode === "more" ? (
              <MoreSheet progress={1} />
            ) : (
              <CloseSheet
                progress={1}
                mode={mode === "waiting2" ? "waiting" : mode}
                rows={rows}
                timeline={mode === "waiting2" ? closeTimeline(true, 1) : mode === "waiting" ? closeTimeline(false, 1) : undefined}
              />
            )}
          </PotScreen>
        </Phone>
      </div>
      <pre style={{ fontFamily: "monospace", fontSize: 22, lineHeight: 1.35, color: "#2b1b3a", whiteSpace: "pre-wrap", maxWidth: 1380 }}>{text}</pre>
    </AbsoluteFill>
  );
};
