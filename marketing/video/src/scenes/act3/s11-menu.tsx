// The Pot header's ⋮ menu (builder E, local to s11: the UI kit has no overflow menu). Rebuilt from the app's
// apps/web/components/pot/PotParts.tsx (Base UI Menu): popup min-w-60, rounded-md (16), 1 px `line` border,
// `surface` fill, p-1, shadow-card, right-aligned under the trigger with a 6 px offset; items min-h-12, gap-3,
// px-3, rounded-sm (10), text-body ink, highlighted = surface-sunken. Copy from apps/web/i18n/en.json:
//   pot.menu.share "Share invite" · pot.menu.close "Close Pot" · close.menu.sub "Ask the group to end it and …"
// Coordinates are SCREEN px (390 × 844, inside the phone, safe area included).
import { EllipsisVertical, LogOut, Share2 } from "lucide-react";
import React from "react";
import { useUi, T, alpha } from "../../ui";

/** The ⋮ trigger in the Pot header: 44 × 44 at x 338-382, y 62-106 (SAFE_TOP 50 + header pt 12). */
export const S11_DOTS = { x: 360, y: 84, size: 44 } as const;

/** Menu box (screen px): right edge aligned with the trigger (382), 6 px below it. */
export const S11_MENU = { right: 382, top: 112, width: 300 } as const;

/** Centre of the "Close Pot" item (for the touch dot). Item 1 = 48 px, item 2 ≈ 72 px (two-line sub). */
export const S11_MENU_CLOSE_ITEM = { x: S11_MENU.right - S11_MENU.width / 2 - 20, y: S11_MENU.top + 1 + 4 + 48 + 36 } as const;

const MENU_SHARE = "Share invite";
const MENU_CLOSE = "Close Pot";
const MENU_CLOSE_SUB = "Ask the group to end it and share out what's left";

/** The trigger's pressed look (hover/popup-open = surface-sunken disc) drawn over the header's ⋮. */
export const S11DotsPressed: React.FC<{ amount: number }> = ({ amount }) => {
  const { c } = useUi();
  if (amount <= 0.001) return null;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: S11_DOTS.x - S11_DOTS.size / 2,
        top: S11_DOTS.y - S11_DOTS.size / 2,
        width: S11_DOTS.size,
        height: S11_DOTS.size,
        borderRadius: 999,
        background: alpha(c.surfaceSunken, Math.min(1, amount)),
        display: "grid",
        placeItems: "center",
        color: c.ink,
        zIndex: 30,
      }}
    >
      <EllipsisVertical size={24} strokeWidth={2} style={{ display: "block" }} aria-hidden />
    </div>
  );
};

/**
 * The open menu. `open` 0..1 = the popup's 120 ms opacity + scale(.95 → 1) from its top-right origin
 * (ease-standard); `highlight` 0..1 = the "Close Pot" item's highlighted (pressed) background.
 */
export const S11OverflowMenu: React.FC<{ open: number; highlight?: number }> = ({ open, highlight = 0 }) => {
  const { c, shadowCard } = useUi();
  if (open <= 0.001) return null;
  const item: React.CSSProperties = {
    display: "flex",
    width: "100%",
    minHeight: 48,
    alignItems: "center",
    gap: 12,
    boxSizing: "border-box",
    borderRadius: 10,
    padding: "0 12px",
    textAlign: "left",
    ...T.body,
    color: c.ink,
  };
  return (
    <div
      style={{
        position: "absolute",
        top: S11_MENU.top,
        left: S11_MENU.right - S11_MENU.width,
        width: S11_MENU.width,
        boxSizing: "border-box",
        borderRadius: 16,
        border: `1px solid ${c.line}`,
        background: c.surface,
        padding: 4,
        boxShadow: shadowCard,
        opacity: open,
        transform: `scale(${0.95 + 0.05 * open})`,
        transformOrigin: "100% 0%",
        zIndex: 50,
      }}
    >
      <div style={item}>
        <Share2 size={20} strokeWidth={2} style={{ display: "block", flexShrink: 0 }} aria-hidden />
        {MENU_SHARE}
      </div>
      <div style={{ ...item, background: highlight > 0 ? alpha(c.surfaceSunken, Math.min(1, highlight)) : undefined }}>
        <LogOut size={20} strokeWidth={2} style={{ display: "block", flexShrink: 0 }} aria-hidden />
        <span style={{ display: "flex", flexDirection: "column", padding: "4px 0" }}>
          <span>{MENU_CLOSE}</span>
          <span style={{ ...T.bodySm, color: c.inkMuted }}>{MENU_CLOSE_SUB}</span>
        </span>
      </div>
    </div>
  );
};
