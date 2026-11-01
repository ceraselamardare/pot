// The bottom sheet (apps/web/components/sheets/Sheet.tsx, Base UI Drawer on phones): surface, radius-lg top corners,
// shadow-sheet, a 40 × 5 grabber, the title in Gabarito `heading` with a 44 px ✕, a body clipped at 92 % of the
// screen, and an optional footer (top `line` border, padded for the home indicator). The scrim is --pot-scrim.
// `progress` 0..1 = time through the 360 ms enter: the sheet slides up with ease-enter, the scrim fades in with
// ease-standard. Pass `exiting` while animating 1 → 0 to use the 280 ms ease-exit curve instead.
import { X } from "lucide-react";
import React from "react";
import { clamp01, easeEnter, easeExit, easeStandard } from "../ease";
import { alpha, useUi } from "../theme";
import { SCREEN_TEXT, T } from "../type";

export type SheetProps = {
  progress?: number;
  exiting?: boolean;
  /** Use `progress` as the eased position directly (e.g. a spring that overshoots). */
  raw?: boolean;
  title?: React.ReactNode;
  titleStyle?: React.CSSProperties;
  /** Replace the whole title block. */
  header?: React.ReactNode;
  showClose?: boolean;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** 0..1 grows the footer in (when a Done button appears). */
  footerAppear?: number;
  /** Bottom padding of the footer above the safe area (app: 12; the Approve sheet's sticky block: 20). */
  footerPadBottom?: number;
  footerGap?: number;
  /** Full-height sheet (Create): 92 % of the screen. */
  full?: boolean;
  /** Scroll the body content (px). */
  bodyScroll?: number;
  bodyStyle?: React.CSSProperties;
  scrim?: boolean;
  style?: React.CSSProperties;
};

export const Sheet: React.FC<SheetProps> = ({
  progress = 1,
  exiting,
  raw,
  title,
  titleStyle,
  header,
  showClose = true,
  children,
  footer,
  footerAppear = 1,
  footerPadBottom = 12,
  footerGap,
  full,
  bodyScroll = 0,
  bodyStyle,
  scrim = true,
  style,
}) => {
  const { c, safeBottom, screenH, scrim: scrimColor, shadowSheet } = useUi();
  if (progress <= 0 && !raw) return null;
  const p = clamp01(progress);
  const pos = raw ? progress : exiting ? 1 - easeExit(1 - p) : easeEnter(p);
  const scrimA = raw ? clamp01(progress) : exiting ? 1 - easeExit(1 - p) : easeStandard(p);
  const maxH = Math.round(screenH * 0.92);
  const fA = clamp01(footerAppear);
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 40, ...SCREEN_TEXT, ...style }}>
      {scrim ? <div style={{ position: "absolute", inset: 0, background: scrimColor, opacity: scrimA }} /> : null}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "center", pointerEvents: "none" }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            maxHeight: maxH,
            height: full ? maxH : undefined,
            display: "flex",
            flexDirection: "column",
            background: c.surface,
            color: c.ink,
            boxShadow: shadowSheet,
            borderRadius: "24px 24px 0 0",
            transform: `translateY(${(1 - pos) * 100}%)`,
          }}
        >
          {/* skirt: keeps the screen covered if a spring overshoots */}
          <div style={{ position: "absolute", left: 0, right: 0, top: "100%", height: 120, background: c.surface }} />
          <div style={{ margin: "8px auto 0", height: 5, width: 40, flexShrink: 0, borderRadius: 999, background: alpha(c.lineStrong, 0.6) }} />
          <div style={{ display: "flex", flexShrink: 0, alignItems: "flex-start", gap: 8, padding: "8px 16px 0" }}>
            <div style={{ minWidth: 0, flex: 1, paddingTop: 8 }}>
              {header ?? <h2 style={{ margin: 0, ...T.heading, color: c.ink, textWrap: "balance", ...titleStyle }}>{title}</h2>}
            </div>
            {showClose ? (
              <span style={{ marginRight: -8, display: "grid", width: 44, height: 44, flexShrink: 0, placeItems: "center", borderRadius: 999, color: c.ink }}>
                <X size={24} strokeWidth={2} style={{ display: "block" }} aria-hidden />
              </span>
            ) : null}
          </div>
          <div style={{ position: "relative", minHeight: 0, flex: "1 1 auto", overflow: "hidden", padding: "0 16px 16px", ...bodyStyle }}>
            <div style={{ transform: bodyScroll ? `translateY(${-bodyScroll}px)` : undefined }}>{children}</div>
          </div>
          {footer && fA > 0 ? (
            <div style={{ flexShrink: 0, display: "grid", gridTemplateRows: `${fA < 1 ? easeStandard(fA) : 1}fr` }}>
              <div style={{ minHeight: 0, overflow: fA < 1 ? "hidden" : undefined }}>
                <div
                  style={{
                    borderTop: `1px solid ${c.line}`,
                    background: c.surface,
                    padding: `12px 16px ${footerPadBottom + safeBottom}px`,
                    display: "flex",
                    flexDirection: "column",
                    gap: footerGap ?? 12,
                    opacity: fA < 1 ? clamp01((fA - 0.3) / 0.7) : 1,
                  }}
                >
                  {footer}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
