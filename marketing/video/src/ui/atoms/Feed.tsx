// ActivityFeed + rows (apps/web/components/pot/Feed.tsx). Day headings in `label` ink-muted; money rows: avatar,
// a sentence that carries the words, a muted sub-line, and the amount column ("+ $150.00" in `approved`,
// "− $84.00" in ink). The instant spend row is tinted brand-soft with ink text and only the check in `approved`.
// System events are quiet centred lines. Every entry can animate in with `appear`.
import { Check, DoorClosed, Hand, PartyPopper, UserPlus } from "lucide-react";
import React from "react";
import { copy } from "../copy";
import { formatUsd, names } from "../format";
import type { Person } from "../data";
import { useUi } from "../theme";
import { T } from "../type";
import { Appear } from "./Appear";
import { Avatar } from "./Avatar";
import { MoneyText } from "./MoneyText";
import { StatusChip, type ChipStatus } from "./StatusChip";

export type FeedEntry =
  /** "Leo added $150" · "23h ago" · "+ $150.00" (optional chip: "Sent" right after it lands). */
  | { kind: "contribution"; who: Person; amount: number; when: string; chip?: ChipStatus }
  /** Pending add (OpRow): "Adding $150…" + "Sending…" chip, amount "+ $150.00" in ink-muted. */
  | { kind: "adding"; who: Person; amount: number }
  | { kind: "joined"; who: Person }
  | { kind: "created"; who: Person; potName: string }
  /** The instant spend, tinted brand-soft: "Maya got $84 back for groceries" · ✓ Approved by Pot rules · Under the $100 instant limit. */
  | { kind: "instant"; who: Person; amount: number; reason: string; instantLimit: number; chip?: ChipStatus }
  /** "Maya asks for $300 for the boat trip" · "Expires in 7 days" · [⏱ 1 of 2 approvals]. */
  | { kind: "pending"; who: Person; amount: number; reason: string; approvals: number; k: number; expires: string }
  /** "$300 sent to Maya for the boat trip" · "Approved by Maya and Leo" · [✓ Approved]. */
  | { kind: "approved"; to: Person; amount: number; reason: string; approvedBy: string[]; chip?: ChipStatus }
  | { kind: "closeRequested"; who: Person; k: number }
  | { kind: "closed" };

export type FeedItem = FeedEntry & { id?: string; appear?: number };
export type FeedGroup = { label: string; items: FeedItem[]; appear?: number };

const Row: React.FC<{
  avatar: Person;
  main: string;
  sub?: React.ReactNode;
  amount?: React.ReactNode;
  tint?: boolean;
  chip?: React.ReactNode;
}> = ({ avatar, main, sub, amount, tint, chip }) => {
  const { c } = useUi();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        borderRadius: 16,
        padding: 12,
        background: tint ? c.brandSoft : c.surface,
        textAlign: "left",
      }}
    >
      <Avatar person={avatar} size="sm" ring={tint ? "brandSoft" : "surface"} style={{ marginTop: 2 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, ...T.body, color: c.ink, textWrap: "pretty" }}>{main}</p>
        {sub ? (
          <div
            style={{
              marginTop: 2,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              columnGap: 8,
              rowGap: 4,
              ...T.bodySm,
              color: tint ? c.ink : c.inkMuted,
            }}
          >
            {sub}
          </div>
        ) : null}
        {chip ? <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>{chip}</div> : null}
      </div>
      {amount ? <div style={{ flexShrink: 0, paddingTop: 2, textAlign: "right" }}>{amount}</div> : null}
    </div>
  );
};

export const SystemLine: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => {
  const { c } = useUi();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "8px 12px",
        textAlign: "center",
        ...T.bodySm,
        color: c.inkMuted,
      }}
    >
      <span style={{ display: "block", flexShrink: 0 }}>{icon}</span>
      {text}
    </div>
  );
};

const ico = (I: typeof Check) => <I size={16} strokeWidth={2} style={{ display: "block" }} aria-hidden />;

/** One feed entry, as the app renders it. */
export const FeedRow: React.FC<{ item: FeedEntry }> = ({ item }) => {
  const { c } = useUi();
  switch (item.kind) {
    case "contribution":
      return (
        <Row
          avatar={item.who}
          main={copy["feed.contribution"](item.who.name, formatUsd(item.amount, "whole"))}
          sub={<span>{item.when}</span>}
          chip={item.chip ? <StatusChip status={item.chip} /> : undefined}
          amount={<MoneyText amount={item.amount} sign="in" color={c.approved} />}
        />
      );
    case "adding":
      return (
        <Row
          avatar={item.who}
          main={copy["add.sending"](formatUsd(item.amount, "whole"))}
          chip={<StatusChip status="sending" />}
          amount={<MoneyText amount={item.amount} sign="in" color={c.inkMuted} />}
        />
      );
    case "joined":
      return <SystemLine icon={ico(UserPlus)} text={copy["feed.joined"](item.who.name)} />;
    case "created":
      return <SystemLine icon={ico(PartyPopper)} text={copy["feed.created"](item.who.name, item.potName)} />;
    case "instant":
      return (
        <Row
          tint
          avatar={item.who}
          main={copy["feed.instant"](item.who.name, formatUsd(item.amount, "whole"), item.reason)}
          sub={
            <>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Check size={16} strokeWidth={2} color={c.approved} style={{ display: "block" }} aria-hidden />
                {copy["spend.approved"]}
              </span>
              <span>{copy["feed.instant.rule"](formatUsd(item.instantLimit, "whole"))}</span>
            </>
          }
          chip={item.chip ? <StatusChip status={item.chip} /> : undefined}
          amount={<MoneyText amount={item.amount} sign="out" color={c.ink} />}
        />
      );
    case "pending":
      return (
        <Row
          avatar={item.who}
          main={copy["feed.pending"](item.who.name, formatUsd(item.amount, "whole"), item.reason)}
          sub={<span>{copy["approve.expires"](item.expires)}</span>}
          chip={<StatusChip status="needs">{copy["approve.progress"](item.approvals, item.k)}</StatusChip>}
          amount={<MoneyText amount={item.amount} color={c.ink} />}
        />
      );
    case "approved":
      return (
        <Row
          avatar={item.to}
          main={copy["feed.approved"](formatUsd(item.amount, "whole"), item.to.name, item.reason)}
          sub={<span>{copy["feed.approved.sub"](names(item.approvedBy))}</span>}
          chip={<StatusChip status={item.chip ?? "approved"} />}
          amount={<MoneyText amount={item.amount} sign="out" color={c.ink} />}
        />
      );
    case "closeRequested":
      return (
        <SystemLine icon={ico(Hand)} text={`${copy["feed.close_requested"](item.who.name)} · ${copy["feed.close_requested.sub"](item.k)}`} />
      );
    case "closed":
      return <SystemLine icon={ico(DoorClosed)} text={`${copy["feed.closed"]} ${copy["feed.closed.sub"]}`} />;
  }
};

export const DayHeader: React.FC<{ label: string; first?: boolean }> = ({ label, first }) => {
  const { c } = useUi();
  return <h3 style={{ margin: 0, padding: `${first ? 0 : 12}px 4px 0`, ...T.label, color: c.inkMuted }}>{label}</h3>;
};

/** The feed: groups of day heading + entries, 8 px apart. `appear` on a group or item animates it in. */
export const ActivityFeed: React.FC<{ groups: FeedGroup[]; style?: React.CSSProperties }> = ({ groups, style }) => {
  let first = true;
  const out: React.ReactNode[] = [];
  groups.forEach((g, gi) => {
    const gA = g.appear ?? 1;
    out.push(
      <Appear key={`h${gi}-${g.label}`} appear={gA} gap={first ? 0 : 8}>
        <DayHeader label={g.label} first={first} />
      </Appear>,
    );
    first = false;
    g.items.forEach((it, ii) => {
      out.push(
        <Appear key={it.id ?? `i${gi}-${ii}`} appear={Math.min(gA, it.appear ?? 1)} gap={8}>
          <FeedRow item={it} />
        </Appear>,
      );
    });
  });
  return <div style={{ display: "flex", flexDirection: "column", ...style }}>{out}</div>;
};
