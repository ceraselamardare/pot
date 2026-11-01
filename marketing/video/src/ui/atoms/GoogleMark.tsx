// The Google "G" on a disc inside the marigold [Join with Google] button, drawn exactly as the app's JoinCta
// GoogleG (the disc is `surface`, so it turns dark in Night like the real landing). Google's own colours.
import React from "react";
import { useUi } from "../theme";

export const GoogleMark: React.FC<{ size?: number; disc?: string; style?: React.CSSProperties }> = ({ size = 24, disc, style }) => {
  const { c } = useUi();
  const g = (size * 16) / 24;
  return (
    <span
      aria-hidden
      style={{ display: "grid", placeItems: "center", width: size, height: size, borderRadius: 999, background: disc ?? c.surface, flexShrink: 0, ...style }}
    >
      <svg viewBox="0 0 24 24" width={g} height={g} style={{ display: "block" }}>
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2a7 7 0 0 1-6.6-4.8H1.4v3.1A12 12 0 0 0 12 24Z" />
        <path fill="#FBBC05" d="M5.4 14.5a7.2 7.2 0 0 1 0-4.6V6.8h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
        <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.8l4 3.1A7 7 0 0 1 12 4.8Z" />
      </svg>
    </span>
  );
};
