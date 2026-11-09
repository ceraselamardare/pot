// The Testnet badge (apps/web/components/brand/NetworkBadge.tsx, 2026-11-09): a small pill with a dashed
// `line-strong` edge, `ink` text and a Lucide flask at stroke 2 (status = an icon + a word); neutral, never marigold.
// The app's pill is 28 px (Figtree 14/600, 14 px icon). In the film it is an OVERLAY (position: absolute), never a
// row: the app puts it in a slim strip above the Pot header on phones, but the scenes' measured POS constants and
// handoffs assume the current layout, so it sits in the free band between the status bar and the header (PotScreen)
// or in the empty space above the lockup (InviteLanding). `size="sm"` (22 px, 12 px icon) fits that band.
import { FlaskConical } from "lucide-react";
import React from "react";
import { copy } from "../copy";
import { useUi } from "../theme";
import { SANS } from "../type";

export const NetworkBadge: React.FC<{ size?: "md" | "sm"; style?: React.CSSProperties }> = ({ size = "md", style }) => {
  const { c } = useUi();
  const sm = size === "sm";
  return (
    <span
      data-ui="network-badge"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: sm ? 3 : 4,
        height: sm ? 22 : 28,
        boxSizing: "border-box",
        padding: sm ? "0 6px" : "0 8px",
        borderRadius: 999,
        border: `1px dashed ${c.lineStrong}`,
        fontFamily: SANS,
        fontSize: sm ? 12 : 14,
        lineHeight: sm ? "16px" : "20px",
        fontWeight: 600,
        whiteSpace: "nowrap",
        color: c.ink,
        ...style,
      }}
    >
      <FlaskConical size={sm ? 12 : 14} strokeWidth={2} style={{ display: "block", flexShrink: 0 }} aria-hidden />
      {copy["network.badge"]}
    </span>
  );
};
