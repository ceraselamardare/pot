// ProgressSteps (apps/web/components/feedback/States.tsx): one vertical stepper for every wait. Done = an
// `approved` disc with a check, current = the typing dots, next = an empty `line-strong` ring; the connector turns
// `approved` once the step is done.
import { Check } from "lucide-react";
import React from "react";
import { useUi } from "../theme";
import { T } from "../type";
import { TypingDots } from "./TypingDots";
import { pop as popAnim } from "../ease";

export type StepState = "done" | "current" | "next" | "error";

export const ProgressSteps: React.FC<{
  steps: { label: string; state: StepState; helper?: string; /** 0..1 pop of the done check */ pop?: number }[];
  dotsFrame?: number;
  style?: React.CSSProperties;
}> = ({ steps, dotsFrame, style }) => {
  const { c } = useUi();
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", ...style }}>
      {steps.map((s, i) => {
        const pp = popAnim(s.pop ?? 1);
        return (
          <li key={i} style={{ display: "flex", gap: 12 }}>
            <div style={{ display: "flex", width: 24, flexDirection: "column", alignItems: "center" }}>
              <span style={{ display: "grid", width: 24, height: 24, flexShrink: 0, placeItems: "center" }}>
                {s.state === "done" ? (
                  <span
                    style={{
                      display: "grid",
                      width: 20,
                      height: 20,
                      placeItems: "center",
                      borderRadius: 999,
                      background: c.approved,
                      color: c.surface,
                      transform: (s.pop ?? 1) < 1 ? `scale(${pp.scale})` : undefined,
                      opacity: pp.opacity,
                    }}
                  >
                    <Check size={14} strokeWidth={2} style={{ display: "block" }} aria-hidden />
                  </span>
                ) : s.state === "current" ? (
                  <TypingDots size="sm" color={c.ink} frame={dotsFrame} />
                ) : s.state === "next" ? (
                  <span style={{ width: 12, height: 12, borderRadius: 999, border: `2px solid ${c.lineStrong}`, boxSizing: "border-box" }} />
                ) : (
                  <span style={{ width: 12, height: 12, borderRadius: 999, background: c.declined }} />
                )}
              </span>
              {i < steps.length - 1 ? (
                <span style={{ margin: "4px 0", width: 2, flex: 1, borderRadius: 999, background: s.state === "done" ? c.approved : c.line }} />
              ) : null}
            </div>
            <div style={{ paddingBottom: i === steps.length - 1 ? 0 : 20 }}>
              <p style={{ margin: 0, ...(s.state === "current" ? T.label : T.bodySm), color: s.state === "current" ? c.ink : c.inkMuted }}>{s.label}</p>
              {s.helper ? <p style={{ margin: "2px 0 0", ...T.bodySm, color: c.inkMuted }}>{s.helper}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
};
