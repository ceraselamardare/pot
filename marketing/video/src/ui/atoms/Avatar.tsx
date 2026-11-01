// Member avatars (apps/web/components/pot/Avatar.tsx): initials on the member colour by join order, eggplant
// `on-brand` initials in both themes, Figtree 700. Stacks overlap by 8 px with a 2 px ring in the colour they sit on.
import React from "react";
import { SANS } from "../../brand/fonts";
import { memberColor, type Person } from "../data";
import { useUi } from "../theme";

export type AvatarSize = "xs" | "sm" | "md" | "lg";

/** px size and initials font size (Tailwind size-6/8/10/12 with text-[10px]/xs/sm/base). */
export const AVATAR: Record<AvatarSize, { box: number; font: number }> = {
  xs: { box: 24, font: 10 },
  sm: { box: 32, font: 12 },
  md: { box: 40, font: 14 },
  lg: { box: 48, font: 16 },
};

export type Ring = "ground" | "surface" | "brandSoft" | "none" | (string & {});

export const Avatar: React.FC<{
  person: Pick<Person, "initials" | "joinIndex">;
  size?: AvatarSize;
  /** A 2 px ring in the colour the avatar sits on (stacks, tinted rows). */
  ring?: Ring;
  ringWidth?: number;
  style?: React.CSSProperties;
}> = ({ person, size = "sm", ring = "none", ringWidth = 2, style }) => {
  const { c } = useUi();
  const s = AVATAR[size];
  const invited = person.joinIndex === null;
  const ringColor = ring === "none" ? null : ring === "ground" ? c.ground : ring === "surface" ? c.surface : ring === "brandSoft" ? c.brandSoft : ring;
  return (
    <span
      aria-hidden
      style={{
        display: "inline-grid",
        placeItems: "center",
        flexShrink: 0,
        width: s.box,
        height: s.box,
        borderRadius: 999,
        background: invited ? c.surfaceSunken : memberColor(person.joinIndex as number),
        color: invited ? c.inkMuted : c.onBrand,
        fontFamily: SANS,
        fontWeight: 700,
        fontSize: s.font,
        lineHeight: 1,
        boxShadow: ringColor ? `0 0 0 ${ringWidth}px ${ringColor}` : undefined,
        userSelect: "none",
        ...style,
      }}
    >
      {person.initials}
    </span>
  );
};

/** Overlapping seats (overlap 8 px), as in the Pot header and the invite card. `appear` per seat (0..1) pops it in. */
export const AvatarStack: React.FC<{
  people: Pick<Person, "id" | "initials" | "joinIndex">[];
  size?: AvatarSize;
  ring?: Ring;
  /** Optional per-person 0..1 entrance (scale + fade), indexed like `people`. */
  appear?: number[];
  /** Empty dashed seats after the people (invite landing). */
  emptySeats?: number;
  style?: React.CSSProperties;
}> = ({ people, size = "sm", ring = "ground", appear, emptySeats = 0, style }) => {
  const box = AVATAR[size].box;
  return (
    <span aria-hidden style={{ display: "flex", alignItems: "center", ...style }}>
      {people.map((p, i) => {
        const a = appear?.[i] ?? 1;
        return (
          <Avatar
            key={p.id}
            person={p}
            size={size}
            ring={ring}
            style={{
              marginLeft: i > 0 ? -8 : 0,
              transform: a < 1 ? `scale(${0.4 + 0.6 * a})` : undefined,
              opacity: Math.min(1, a * 1.5),
              position: "relative",
              zIndex: i,
            }}
          />
        );
      })}
      {Array.from({ length: emptySeats }, (_, i) => (
        <EmptySeat key={`seat${i}`} size={box} style={{ marginLeft: people.length + i > 0 ? -8 : 0, position: "relative", zIndex: people.length + i }} />
      ))}
    </span>
  );
};

/** The invite landing's empty seat: a dashed `line-strong` circle on `ground` (1.5 px dashes). */
export const EmptySeat: React.FC<{ size?: number; style?: React.CSSProperties }> = ({ size = 32, style }) => {
  const { c } = useUi();
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: 999,
        border: `1.5px dashed ${c.lineStrong}`,
        background: c.ground,
        boxSizing: "border-box",
        flexShrink: 0,
        ...style,
      }}
    />
  );
};
