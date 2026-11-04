// Create Pot (apps/web/components/sheets/CreatePotSheet.tsx, the lean create of 2026-11-02), a full-height sheet:
//  1 "Start a Pot" (one screen): the cover card (emoji tile with a pencil badge, the name, "Just you so far"), "This is
//    what friends see in the chat. Tap the picture to change it.", "Pot name" with the typed name + caret and the
//    count, then one box: "Everyone chips in [$ 150] each" with its switch, and the rules summary "Small spends up to
//    $100 go through on their own; bigger ones go to the group" + [Change]. Footer [Create Pot] (the one marigold).
//    `picker` opens the emoji + colour picker under the cover card (tap the picture).
//  2 "Pot rules" ([Change]): the intro, then a card per rule: the instant limit [$ 100], the per-person limit
//    [$ 200], "Trust grows" (switch, on), one OK "Spends up to [$ 300] need just one OK from anyone else.", who instant
//    payments can go to, "Set a goal (optional)" (switch, off), the "Every Pot works like this" box and the footer
//    line. Footer [Create Pot] + [‹ Back].
//  3 creating: the cover + name and the progress steps ("Creating Lisbon Trip…" · "Free: we cover the setup.").
// Every rule card is exported on its own (CreateRuleCard kind=…) for breakouts, same size as in the sheet (358 wide).
import { Check, Flag, Hand, Hourglass, Info, Lock, Pencil, Sprout, Undo2, UserCheck, UserPlus, UserRound, Users, Zap, type LucideIcon } from "lucide-react";
import React from "react";
import { interpolateColors } from "remotion";
import { copy } from "../copy";
import { LISBON } from "../data";
import { formatUsd } from "../format";
import { clamp01 } from "../ease";
import { useUi } from "../theme";
import { T } from "../type";
import { Button } from "../atoms/Button";
import { COVER_GRADIENTS, CoverTile } from "../atoms/CoverTile";
import { Caret } from "../atoms/Touch";
import { ProgressSteps } from "../atoms/ProgressSteps";
import { Toggle } from "../atoms/Toggle";
import { Sheet, SheetBack, type SheetProps } from "./Sheet";

export const CREATE_EMOJI = ["✈️", "🇵🇹", "🏖️", "🏔️", "🍷", "🎉", "🏕️", "🚐", "🎿", "🍕", "⚽", "🎸"];

/** The inline "$ [100]" field inside a rule sentence: 44 px, surface-sunken, "$" pinned left, tabular semibold. */
export const AmountField: React.FC<{ value: string; narrow?: boolean; /** 0..1 focus ring */ focus?: number; caret?: boolean; caretFrame?: number }> = ({
  value,
  narrow,
  focus = 0,
  caret,
  caretFrame,
}) => {
  const { c } = useUi();
  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        flexShrink: 0,
        boxSizing: "border-box",
        width: narrow ? 88 : 112,
        height: 44,
        alignItems: "center",
        borderRadius: 10,
        border: `1px solid ${c.lineStrong}`,
        background: c.surfaceSunken,
        padding: "0 12px 0 28px",
        ...T.body,
        fontWeight: 600,
        color: c.ink,
        fontVariantNumeric: "tabular-nums",
        outline: focus > 0 ? `2px solid ${c.focus}` : undefined,
        outlineOffset: 2,
      }}
    >
      <span style={{ position: "absolute", left: 12, top: 0, bottom: 0, display: "flex", alignItems: "center" }}>{copy["create.rules.dollar"]}</span>
      {value}
      {caret ? <Caret frame={caretFrame} height={20} style={{ marginLeft: 1 }} /> : null}
    </span>
  );
};

export type CreateRuleKind = "instant" | "perPerson" | "trust" | "oneOk" | "payees" | "goal" | "fixed";

const cardStyle = (c: ReturnType<typeof useUi>["c"], h: number): React.CSSProperties => ({
  display: "flex",
  gap: 12,
  borderRadius: 16,
  border: `1px solid ${c.lineStrong}`,
  background: h > 0 ? interpolateColors(h, [0, 1], [c.surface, c.brandSoft]) : c.surface,
  padding: 16,
  boxSizing: "border-box",
});

const RuleIcon: React.FC<{ icon: LucideIcon; top?: number }> = ({ icon: Icon, top = 10 }) => (
  <Icon size={24} strokeWidth={2} style={{ display: "block", flexShrink: 0, marginTop: top }} aria-hidden />
);

/**
 * One card of the "Pot rules" step, standalone (a breakout twin) or in the sheet. `value` is the amount in its field
 * (instant "100", perPerson "200", oneOk "300"), `on` the switch (trust, goal), `highlight` blends it to brand-soft.
 */
export const CreateRuleCard: React.FC<{
  kind: CreateRuleKind;
  value?: string;
  on?: boolean | number;
  highlight?: number;
  /** 0..1 focus ring on the card's amount field. */
  focus?: number;
  /** trust: the instant limit for its detail line. */
  instantLimit?: number;
  style?: React.CSSProperties;
}> = ({ kind, value, on, highlight = 0, focus = 0, instantLimit = LISBON.instantLimit, style }) => {
  const { c } = useUi();
  const h = clamp01(highlight);
  const sentence: React.CSSProperties = { margin: 0, display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4, ...T.body, color: c.ink };
  switch (kind) {
    case "instant":
      return (
        <div data-ui="create-rule-instant" style={{ ...cardStyle(c, h), color: c.ink, ...style }}>
          <RuleIcon icon={Zap} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={sentence}>
              <span>{copy["create.rules.instant.before"]}</span>
              <AmountField value={value ?? String(LISBON.instantLimit)} focus={focus} />
              <span>{copy["create.rules.instant.after"]}</span>
            </p>
          </div>
        </div>
      );
    case "perPerson":
      return (
        <div data-ui="create-rule-per-person" style={{ ...cardStyle(c, h), color: c.ink, ...style }}>
          <RuleIcon icon={UserRound} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={sentence}>
              <span>{copy["create.rules.person.before"]}</span>
              <AmountField value={value ?? String(LISBON.memberBudget)} focus={focus} />
              <span>{copy["create.rules.person.after"]}</span>
            </p>
          </div>
        </div>
      );
    case "trust": {
      const isOn = on === undefined ? true : typeof on === "number" ? on > 0.5 : on;
      return (
        <div data-ui="create-rule-trust" style={{ ...cardStyle(c, h), color: c.ink, ...style }}>
          <RuleIcon icon={Sprout} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ ...T.label, color: c.ink }}>{copy["create.trust.label"]}</span>
              <Toggle on={on ?? true} />
            </div>
            <p style={{ margin: 0, ...T.body, color: c.ink }}>{copy["create.trust.hint"]}</p>
            {isOn ? (
              <p style={{ margin: "4px 0 0", ...T.bodySm, color: c.inkMuted, fontVariantNumeric: "tabular-nums" }}>
                {copy["create.trust.detail"](LISBON.trustStep, formatUsd(instantLimit, "whole"), formatUsd(instantLimit * 3, "whole"))}
              </p>
            ) : null}
          </div>
        </div>
      );
    }
    case "oneOk":
      return (
        <div data-ui="create-rule-one-ok" style={{ ...cardStyle(c, h), color: c.ink, ...style }}>
          <RuleIcon icon={Hand} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={sentence}>
              <span>{copy["create.oneok.before"]}</span>
              <AmountField value={value ?? String(LISBON.oneOkCap)} focus={focus} />
              <span>{copy["create.oneok.after"]}</span>
            </p>
            <p style={{ margin: "8px 0 0", display: "flex", alignItems: "flex-start", gap: 6, ...T.bodySm, color: c.inkMuted }}>
              <Info size={16} strokeWidth={2} style={{ display: "block", flexShrink: 0, marginTop: 2 }} aria-hidden />
              {copy["create.oneok.hint"]}
            </p>
          </div>
        </div>
      );
    case "payees":
      return (
        <div data-ui="create-rule-payees" style={{ borderRadius: 16, border: `1px solid ${c.lineStrong}`, background: h > 0 ? interpolateColors(h, [0, 1], [c.surface, c.brandSoft]) : c.surface, padding: 16, ...style }}>
          <p style={{ margin: "0 0 4px", display: "flex", alignItems: "flex-start", gap: 12, ...T.body, color: c.ink }}>
            <UserCheck size={24} strokeWidth={2} style={{ display: "block", flexShrink: 0, marginTop: 2 }} aria-hidden />
            {copy["create.rules.payees.legend"]}
          </p>
          <div style={{ paddingLeft: 36, display: "flex", flexDirection: "column" }}>
            {[copy["create.rules.payees.members"], copy["create.rules.payees.named"]].map((label, i) => (
              <span key={label} style={{ display: "flex", minHeight: 44, alignItems: "center", gap: 12, ...T.body, color: c.ink }}>
                <span
                  style={{
                    display: "grid",
                    width: 20,
                    height: 20,
                    flexShrink: 0,
                    boxSizing: "border-box",
                    placeItems: "center",
                    borderRadius: 999,
                    border: `2px solid ${i === 0 ? c.ink : c.lineStrong}`,
                  }}
                >
                  {i === 0 ? <span style={{ width: 10, height: 10, borderRadius: 999, background: c.ink }} /> : null}
                </span>
                {label}
              </span>
            ))}
          </div>
        </div>
      );
    case "goal":
      return (
        <div data-ui="create-rule-goal" style={{ ...cardStyle(c, h), flexDirection: "column", gap: 8, color: c.ink, ...style }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 12, ...T.label, color: c.ink }}>
              <Flag size={24} strokeWidth={2} style={{ display: "block", flexShrink: 0 }} aria-hidden />
              {copy["create.target.label"]}
            </span>
            <Toggle on={on ?? false} />
          </div>
          {(typeof on === "number" ? on > 0.5 : on) ? (
            <>
              <p style={{ margin: 0, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, ...T.body, color: c.ink }}>
                <span>{copy["create.target.before"]}</span>
                <AmountField value={value ?? "450"} />
                <span>{copy["create.target.by"]}</span>
                <span
                  style={{
                    display: "inline-flex",
                    height: 44,
                    boxSizing: "border-box",
                    alignItems: "center",
                    borderRadius: 10,
                    border: `1px solid ${c.lineStrong}`,
                    background: c.surfaceSunken,
                    padding: "0 12px",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  11/12/2026
                </span>
              </p>
              <div style={{ marginTop: 4, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, borderTop: `1px solid ${c.line}`, paddingTop: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ ...T.label, color: c.ink }}>{copy["create.target.aon.label"]}</span>
                  <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted }}>{copy["create.target.aon.hint"]}</p>
                  <p style={{ margin: "4px 0 0", ...T.bodySm, color: c.inkMuted }}>{copy["create.target.aon.spend"]}</p>
                </div>
                <Toggle on />
              </div>
            </>
          ) : null}
        </div>
      );
    case "fixed": {
      const fixed = [
        { icon: Users, text: copy["create.rules.fixed.majority"] },
        { icon: Undo2, text: copy["create.rules.fixed.leftovers"] },
        { icon: Hourglass, text: copy["create.rules.fixed.expiry"](LISBON.expiryDays) },
        { icon: UserPlus, text: copy["create.rules.fixed.size"](LISBON.maxMembers) },
      ];
      return (
        <section data-ui="create-rules-fixed" style={{ borderRadius: 16, background: c.surfaceSunken, padding: 16, ...style }}>
          <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, ...T.label, color: c.ink }}>
            <Lock size={16} strokeWidth={2} style={{ display: "block", flexShrink: 0 }} aria-hidden />
            {copy["create.rules.fixed.title"]}
          </h3>
          <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {fixed.map(({ icon: Icon, text }) => (
              <li key={text} style={{ display: "flex", alignItems: "flex-start", gap: 12, ...T.body, color: c.ink }}>
                <Icon size={20} strokeWidth={2} color={c.inkMuted} style={{ display: "block", flexShrink: 0, marginTop: 2 }} aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </section>
      );
    }
  }
};

/** Step 1's cover card: the tile with its pencil badge, the name (or the placeholder), "Just you so far". */
export const CreateCoverCard: React.FC<{ emoji?: string; cover?: number; name?: string; /** 0..1 press on the tile */ press?: number; style?: React.CSSProperties }> = ({
  emoji = LISBON.emoji,
  cover = LISBON.cover,
  name = "",
  press = 0,
  style,
}) => {
  const { c, shadowCard } = useUi();
  return (
    <div
      data-ui="create-cover-card"
      style={{ display: "flex", alignItems: "center", gap: 12, borderRadius: 24, background: c.surface, padding: 12, boxShadow: `${shadowCard}, 0 0 0 1px ${c.line}`, ...style }}
    >
      <span style={{ position: "relative", flexShrink: 0, borderRadius: 16, transform: press > 0 ? `scale(${1 - 0.03 * clamp01(press)})` : undefined }}>
        <CoverTile emoji={emoji} cover={cover} size="lg" />
        <span
          style={{
            position: "absolute",
            right: -6,
            bottom: -6,
            display: "grid",
            width: 24,
            height: 24,
            placeItems: "center",
            borderRadius: 999,
            background: c.surface,
            color: c.ink,
            boxShadow: `${shadowCard}, 0 0 0 1px ${c.lineStrong}`,
          }}
        >
          <Pencil size={14} strokeWidth={2} style={{ display: "block" }} aria-hidden />
        </span>
      </span>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...T.heading, color: name.trim() ? c.ink : c.inkMuted }}>
          {name.trim() || copy["create.name.placeholder"]}
        </p>
        <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted }}>{copy["create.preview.members"]}</p>
      </div>
    </div>
  );
};

/** Step 1's box: "Everyone chips in [$ 150] each" + switch, and the rules summary + [Change]. */
export const CreateSummaryBox: React.FC<{
  goalOn?: boolean | number;
  goalEach?: number;
  instantLimit?: number;
  /** 0..1 press on [Change]. */
  changePress?: number;
  /** 0..1 brand-soft blend of the summary row (a scene points at it). */
  highlight?: number;
  style?: React.CSSProperties;
}> = ({ goalOn = true, goalEach = LISBON.goalEach, instantLimit = LISBON.instantLimit, changePress = 0, highlight = 0, style }) => {
  const { c } = useUi();
  const on = typeof goalOn === "number" ? goalOn > 0.5 : goalOn;
  return (
    <div data-ui="create-summary" style={{ display: "flex", flexDirection: "column", borderRadius: 16, border: `1px solid ${c.lineStrong}`, overflow: "hidden", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px" }}>
        <p style={{ margin: 0, minWidth: 0, flex: 1, display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 4, ...T.body, color: on ? c.ink : c.inkMuted }}>
          <span>{copy["create.goal.inline"]}</span>
          {on ? (
            <>
              <AmountField value={String(goalEach)} narrow />
              <span>{copy["create.goal.each.after"]}</span>
            </>
          ) : null}
        </p>
        <Toggle on={goalOn} />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: 12,
          borderTop: `1px solid ${c.line}`,
          background: highlight > 0 ? interpolateColors(clamp01(highlight), [0, 1], [c.surface, c.brandSoft]) : undefined,
        }}
      >
        <p style={{ margin: 0, minWidth: 0, flex: 1, ...T.body, color: c.ink, fontVariantNumeric: "tabular-nums" }}>{copy["create.summary.instant"](formatUsd(instantLimit, "whole"))}</p>
        <Button height={44} pressed={changePress} style={{ padding: "6px 12px" }}>
          {copy["create.summary.change"]}
        </Button>
      </div>
    </div>
  );
};

export type CreatePotSheetProps = Omit<SheetProps, "children" | "footer" | "title" | "full"> & {
  /** 1 the lean "Start a Pot" screen · 2 "Pot rules" ([Change]) · 3 creating. */
  step?: 1 | 2 | 3;
  /** The name being typed (default "Lisbon Trip"); `typedChars` reveals it letter by letter. */
  name?: string;
  typedChars?: number;
  /** Show the caret in the name field (focused). Default: while typing on step 1. */
  caret?: boolean;
  caretFrame?: number;
  emoji?: string;
  /** Step 1: the emoji + colour picker open under the cover card. */
  picker?: boolean;
  /** 0..1 selection animation of the emoji cell (picker). */
  emojiSelect?: number;
  /** 0..1 press on the cover tile (opens the picker). */
  coverPress?: number;
  cover?: number;
  /** "Everyone chips in $150 each" switch (boolean or 0..1 slide). */
  goalOn?: boolean | number;
  goalEach?: number;
  instantLimit?: number;
  /** 0..1 press on the summary's [Change]. */
  changePress?: number;
  /** 0..1 brand-soft blend of the rules summary (step 1). */
  summaryHighlight?: number;
  /** Step 2: the switches and amounts. */
  trustOn?: boolean | number;
  oneOkCap?: number;
  memberBudget?: number;
  targetOn?: boolean | number;
  /** Step 2: blend one card to brand-soft (0..1 via highlightAmount) while a scene points at it. */
  highlightRule?: CreateRuleKind | null;
  highlightAmount?: number;
  /** Step 2: hide one card (keeps its space) while its breakout twin is on screen. */
  hideRule?: CreateRuleKind | null;
  ctaPress?: number;
  /** 0..1 press on [‹ Back] (step 2). */
  backPress?: number;
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
  picker = false,
  emojiSelect = 1,
  coverPress = 0,
  cover = LISBON.cover,
  goalOn = true,
  goalEach = LISBON.goalEach,
  instantLimit = LISBON.instantLimit,
  changePress = 0,
  summaryHighlight = 0,
  trustOn = true,
  oneOkCap = LISBON.oneOkCap,
  memberBudget = LISBON.memberBudget,
  targetOn = false,
  highlightRule = null,
  highlightAmount = 1,
  hideRule = null,
  ctaPress = 0,
  backPress = 0,
  created = false,
  dotsFrame,
  ...sheet
}) => {
  const { c } = useUi();
  const typed = typedChars === undefined ? name : Array.from(name).slice(0, Math.max(0, Math.floor(typedChars))).join("");
  const showCaret = caret ?? step === 1;
  const title = step === 1 ? copy["create.title"] : step === 2 ? copy["create.step2.title"] : copy["create.progress"](typed.trim())[0];

  const footer =
    step === 1 ? (
      <Button variant="primary" fullWidth pressed={ctaPress}>
        {copy["create.cta"]}
      </Button>
    ) : step === 2 ? (
      <>
        <Button variant="primary" fullWidth pressed={ctaPress}>
          {copy["create.cta"]}
        </Button>
        <SheetBack pressed={backPress} />
      </>
    ) : undefined;

  const ruleCard = (kind: CreateRuleKind, props: Partial<React.ComponentProps<typeof CreateRuleCard>> = {}) => (
    <CreateRuleCard
      kind={kind}
      instantLimit={instantLimit}
      highlight={highlightRule === kind ? highlightAmount : 0}
      style={hideRule === kind ? { visibility: "hidden" } : undefined}
      {...props}
    />
  );

  return (
    <Sheet {...sheet} full title={title} footer={footer} footerGap={8}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, paddingTop: 4 }}>
        {step === 1 ? (
          <>
            <figure style={{ margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <CreateCoverCard emoji={emoji} cover={cover} name={typed} press={coverPress} />
              <figcaption style={{ ...T.bodySm, color: c.inkMuted }}>
                {copy["create.preview_hint"]} {copy["create.cover.hint"]}
              </figcaption>
            </figure>

            {picker ? (
              <div data-ui="create-picker" style={{ display: "flex", flexDirection: "column", gap: 16, borderRadius: 16, background: c.surfaceSunken, padding: 12 }}>
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
                            background: on > 0.5 ? c.brandSoft : c.surface,
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
                            boxShadow: cover === i ? `0 0 0 2px ${c.surfaceSunken}, 0 0 0 4px ${c.ink}` : undefined,
                            color: c.onBrand,
                          }}
                        >
                          {cover === i ? <Check size={16} strokeWidth={2} style={{ display: "block" }} aria-hidden /> : null}
                        </span>
                      </span>
                    ))}
                  </div>
                </fieldset>
                <Button variant="ghost" height={44} style={{ alignSelf: "flex-end", padding: "6px 16px" }}>
                  {copy["create.cover.done"]}
                </Button>
              </div>
            ) : null}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", ...T.label, color: c.ink }}>
                {copy["create.name.label"]}
                <span style={{ ...T.bodySm, fontWeight: 400, color: c.inkMuted }}>{copy["create.name.count"](Array.from(typed).length)}</span>
              </span>
              <div
                data-ui="create-name"
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

            <CreateSummaryBox goalOn={goalOn} goalEach={goalEach} instantLimit={instantLimit} changePress={changePress} highlight={summaryHighlight} />
          </>
        ) : null}

        {step === 2 ? (
          <div data-ui="create-rules" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ margin: 0, ...T.body, color: c.inkMuted }}>{copy["create.rules.intro"]}</p>
            {ruleCard("instant", { value: String(instantLimit) })}
            {ruleCard("perPerson", { value: String(memberBudget) })}
            {ruleCard("trust", { on: trustOn })}
            {ruleCard("oneOk", { value: String(oneOkCap) })}
            {ruleCard("payees")}
            {ruleCard("goal", { on: targetOn })}
            {ruleCard("fixed")}
            <p style={{ margin: 0, ...T.bodySm, color: c.inkMuted }}>{copy["create.rules.footer"]}</p>
          </div>
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
