// Create Pot (apps/web/components/sheets/CreatePotSheet.tsx), a full-height sheet in steps:
//  1 "Name your Pot": the live preview card (what friends see in the chat), "Pot name" with the typed name + caret,
//    the emoji grid (🇵🇹 selected) and the colour swatches, footer [Next];
//  2 "How should it work?": the Trip preset card (selected: ink edge on brand-soft) with the rules as sentences,
//    Club / Team "Coming soon", "Everyone chips in (optional) · $150 each" with its switch, footer [Create Pot] + [Back];
//  3 creating: the cover + name and the progress steps ("Creating Lisbon Trip…" · "Free: we cover the setup.").
import { Check, Gift, Plane, Users } from "lucide-react";
import React from "react";
import { copy } from "../copy";
import { LISBON } from "../data";
import { formatUsd } from "../format";
import { useUi } from "../theme";
import { T } from "../type";
import { Button } from "../atoms/Button";
import { COVER_GRADIENTS, CoverTile } from "../atoms/CoverTile";
import { Caret } from "../atoms/Touch";
import { ProgressSteps } from "../atoms/ProgressSteps";
import { Sheet, type SheetProps } from "./Sheet";

export const CREATE_EMOJI = ["✈️", "🇵🇹", "🏖️", "🏔️", "🍷", "🎉", "🏕️", "🚐", "🎿", "🍕", "⚽", "🎸"];

export type CreatePotSheetProps = Omit<SheetProps, "children" | "footer" | "title" | "full"> & {
  step?: 1 | 2 | 3;
  /** The name being typed (default "Lisbon Trip"); `typedChars` reveals it letter by letter. */
  name?: string;
  typedChars?: number;
  /** Show the caret in the name field (focused). Default: while typing on step 1. */
  caret?: boolean;
  caretFrame?: number;
  emoji?: string;
  /** 0..1 selection animation of the emoji cell. */
  emojiSelect?: number;
  cover?: number;
  goalOn?: boolean;
  goalEach?: number;
  ctaPress?: number;
  /** Step 3: has the Pot been created (first step done)? */
  created?: boolean;
  dotsFrame?: number;
};

export const CreatePotSheet: React.FC<CreatePotSheetProps> = ({
  step = 1,
  name = LISBON.name,
  typedChars,
  caret,
  caretFrame,
  emoji = LISBON.emoji,
  emojiSelect = 1,
  cover = LISBON.cover,
  goalOn = true,
  goalEach = LISBON.goalEach,
  ctaPress = 0,
  created = false,
  dotsFrame,
  ...sheet
}) => {
  const { c, shadowCard } = useUi();
  const typed = typedChars === undefined ? name : Array.from(name).slice(0, Math.max(0, Math.floor(typedChars))).join("");
  const shown = typed.trim() || copy["create.name.placeholder"];
  const showCaret = caret ?? step === 1;
  const title = step === 1 ? copy["create.step1.title"] : step === 2 ? copy["create.step2.title"] : copy["create.progress"](typed.trim())[0];
  const [presetName, ...presetLines] = copy["create.preset.trip"].split(" · ");

  const footer =
    step === 1 ? (
      <Button variant="primary" fullWidth pressed={ctaPress}>
        {copy["create.cta.next"]}
      </Button>
    ) : step === 2 ? (
      <>
        <Button variant="primary" fullWidth pressed={ctaPress}>
          {copy["create.cta"]}
        </Button>
        <Button variant="ghost" fullWidth>
          {copy["create.back"]}
        </Button>
      </>
    ) : undefined;

  return (
    <Sheet {...sheet} full title={title} footer={footer} footerGap={8}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 4 }}>
        {step < 3 ? <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted }}>{copy["create.step_of"](step, 2)}</p> : null}

        {step === 1 ? (
          <>
            <figure style={{ margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: 24, background: c.surface, padding: 12, boxShadow: `${shadowCard}, 0 0 0 1px ${c.line}` }}>
                <CoverTile emoji={emoji} cover={cover} size="lg" />
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...T.heading, color: typed.trim() ? c.ink : c.inkMuted }}>{shown}</p>
                  <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted }}>{copy["create.preview.members"]}</p>
                </div>
              </div>
              <figcaption style={{ ...T.bodySm, color: c.inkMuted }}>{copy["create.preview_hint"]}</figcaption>
            </figure>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", ...T.label, color: c.ink }}>
                {copy["create.name.label"]}
                <span style={{ ...T.bodySm, fontWeight: 400, color: c.inkMuted }}>{copy["create.name.count"](Array.from(typed).length)}</span>
              </span>
              <div
                style={{
                  boxSizing: "border-box",
                  height: 52,
                  display: "flex",
                  alignItems: "center",
                  borderRadius: 10,
                  border: `1px solid ${c.lineStrong}`,
                  background: c.surfaceSunken,
                  padding: "0 12px",
                  ...T.body,
                  color: typed ? c.ink : c.inkMuted,
                  outline: showCaret ? `2px solid ${c.focus}` : undefined,
                  outlineOffset: 2,
                  whiteSpace: "pre",
                }}
              >
                {typed ? <span>{typed}</span> : null}
                {showCaret ? <Caret frame={caretFrame} height={22} blink={typedChars === undefined || typedChars >= Array.from(name).length} style={{ marginLeft: 1 }} /> : null}
                {!typed ? <span style={{ marginLeft: showCaret ? 1 : 0 }}>{copy["create.name.placeholder"]}</span> : null}
              </div>
            </div>

            <fieldset style={{ margin: 0, padding: 0, border: 0, minWidth: 0 }}>
              <legend style={{ padding: 0, marginBottom: 8, ...T.label, color: c.ink }}>{copy["create.cover"]}</legend>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 8 }}>
                {CREATE_EMOJI.map((e) => {
                  const on = e === emoji ? emojiSelect : 0;
                  return (
                    <span
                      key={e}
                      style={{
                        display: "grid",
                        aspectRatio: "1 / 1",
                        minHeight: 44,
                        placeItems: "center",
                        borderRadius: 16,
                        fontSize: 24,
                        lineHeight: 1,
                        background: on > 0.5 ? c.brandSoft : c.surfaceSunken,
                        boxShadow: on > 0 ? `0 0 0 ${2 * on}px ${c.ink}` : undefined,
                      }}
                    >
                      {e}
                    </span>
                  );
                })}
              </div>
            </fieldset>

            <fieldset style={{ margin: 0, padding: 0, border: 0, minWidth: 0 }}>
              <legend style={{ padding: 0, marginBottom: 8, ...T.label, color: c.ink }}>{copy["create.cover.color"]}</legend>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {COVER_GRADIENTS.map(([from, to], i) => (
                  <span key={i} style={{ display: "grid", width: 44, height: 44, placeItems: "center", borderRadius: 999 }}>
                    <span
                      style={{
                        display: "grid",
                        width: 36,
                        height: 36,
                        placeItems: "center",
                        borderRadius: 999,
                        background: `linear-gradient(to bottom right, ${from}, ${to})`,
                        boxShadow: cover === i ? `0 0 0 2px ${c.surface}, 0 0 0 4px ${c.ink}` : undefined,
                        color: c.onBrand,
                      }}
                    >
                      {cover === i ? <Check size={16} strokeWidth={2} style={{ display: "block" }} aria-hidden /> : null}
                    </span>
                  </span>
                ))}
              </div>
            </fieldset>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ position: "relative", borderRadius: 24, border: `2px solid ${c.ink}`, background: c.brandSoft, padding: 16 }}>
                <span
                  style={{
                    position: "absolute",
                    top: 12,
                    right: 12,
                    display: "grid",
                    width: 24,
                    height: 24,
                    placeItems: "center",
                    borderRadius: 999,
                    background: c.ink,
                    color: c.surface,
                  }}
                >
                  <Check size={16} strokeWidth={2} style={{ display: "block" }} aria-hidden />
                </span>
                <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, ...T.heading, color: c.ink }}>
                  <Plane size={20} strokeWidth={2} style={{ display: "block" }} aria-hidden />
                  {presetName}
                </p>
                <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 4, ...T.body, color: c.ink }}>
                  {presetLines.map((line) => (
                    <li key={line} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <Check size={16} strokeWidth={2} style={{ display: "block", flexShrink: 0, marginTop: 4 }} aria-hidden />
                      {line.charAt(0).toUpperCase() + line.slice(1)}
                    </li>
                  ))}
                </ul>
              </div>
              {(["create.preset.club", "create.preset.team"] as const).map((k) => (
                <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 24, background: c.surfaceSunken, padding: 16 }}>
                  <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, ...T.heading, color: c.inkMuted }}>
                    {k === "create.preset.club" ? (
                      <Users size={20} strokeWidth={2} style={{ display: "block" }} aria-hidden />
                    ) : (
                      <Gift size={20} strokeWidth={2} style={{ display: "block" }} aria-hidden />
                    )}
                    {copy[k].split(" · ")[0]}
                  </p>
                  <span style={{ borderRadius: 999, background: c.surface, padding: "2px 10px", ...T.bodySm, fontWeight: 600, color: c.inkMuted }}>{copy["create.preset.soon"]}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderRadius: 16, border: `1px solid ${c.line}`, padding: 12 }}>
              <span style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ ...T.label, color: c.ink }}>{copy["create.goal.label"]}</span>
                <span style={{ ...T.bodySm, color: c.inkMuted }}>{copy["create.goal.each"](formatUsd(goalEach, "whole"))}</span>
              </span>
              <span style={{ display: "grid", height: 44, width: 56, flexShrink: 0, placeItems: "center" }}>
                <span style={{ position: "relative", height: 28, width: 48, borderRadius: 999, background: goalOn ? c.ink : c.lineStrong }}>
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: 2,
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      background: c.surface,
                      boxShadow: "0 1px 3px rgba(43, 27, 58, 0.25)",
                      transform: goalOn ? "translateX(20px)" : undefined,
                    }}
                  />
                </span>
              </span>
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <CoverTile emoji={emoji} cover={cover} size="lg" />
              <p style={{ margin: 0, ...T.heading, color: c.ink }}>{typed.trim()}</p>
            </div>
            <ProgressSteps
              dotsFrame={dotsFrame}
              steps={[
                { label: copy["create.progress"](typed.trim())[0], helper: copy["create.progress"](typed.trim())[1], state: created ? "done" : "current" },
                { label: copy["create.progress.ready"], state: created ? "current" : "next" },
              ]}
            />
          </div>
        ) : null}
      </div>
    </Sheet>
  );
};

