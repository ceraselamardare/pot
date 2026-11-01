// "You're in!" (apps/web/components/landing/JoinCta.tsx, the joined sheet over the invite landing): the title at
// balance-hero size, the members (md avatars on surface), "Welcome to Lisbon Trip. Everyone's chipping in $150.",
// [Add my $150 share] (the one marigold) and [Not now].
import React from "react";
import { copy } from "../copy";
import { CREW, LISBON, type Person } from "../data";
import { formatUsd } from "../format";
import { useUi } from "../theme";
import { T } from "../type";
import { AvatarStack } from "../atoms/Avatar";
import { Button } from "../atoms/Button";
import { Sheet, type SheetProps } from "./Sheet";

export type YoureInSheetProps = Omit<SheetProps, "children" | "footer" | "title"> & {
  potName?: string;
  members?: Person[];
  /** Per-avatar 0..1 pop (e.g. Leo's seat landing last). */
  seatAppear?: number[];
  suggested?: number;
  ctaPress?: number;
  laterPress?: number;
};

export const YoureInSheet: React.FC<YoureInSheetProps> = ({
  potName = LISBON.name,
  members = CREW,
  seatAppear,
  suggested = LISBON.goalEach,
  ctaPress = 0,
  laterPress = 0,
  ...sheet
}) => {
  const { c } = useUi();
  const s = formatUsd(suggested, "whole");
  return (
    <Sheet {...sheet} title={copy["setup.success.title"]} titleStyle={{ ...T.hero, textWrap: "balance" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "8px 0" }}>
        <AvatarStack people={members} size="md" ring="surface" appear={seatAppear} />
        <p style={{ margin: 0, ...T.body, color: c.inkMuted }}>{copy["setup.success.body"](potName, s)}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Button variant="primary" fullWidth pressed={ctaPress}>
            {copy["setup.success.cta"](s)}
          </Button>
          <Button variant="ghost" fullWidth pressed={laterPress}>
            {copy["setup.success.later"]}
          </Button>
        </div>
      </div>
    </Sheet>
  );
};
