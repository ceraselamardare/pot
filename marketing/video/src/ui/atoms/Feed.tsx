// ActivityFeed (apps/web/components/pot/Feed.tsx, compact rows since 2026-11-02). Day headings in `label` ink-muted;
// every money row is a CompactRow: avatar + badge, "Leo · Added money", a meta line (status chip, "Receipt ↗") and the
// time, and the amount column ("+ $150.00" in `approved`, "− $84.00" in ink, "$300.00" while asked). Instant spends
// sit on the same surface as every other row: the "⚡ Instant" chip says it (no brand-soft tint since 2026-11-02).
// System events are quiet centred lines with their receipt. Every entry can animate in with `appear`.
import { ArrowDownLeft, CarTaxiFront, DoorClosed, Flag, Gift, Hand, PartyPopper, Plus, ShoppingCart, Tag, Ticket, UserPlus, Utensils, BedDouble, type LucideIcon } from "lucide-react";
import React from "react";
import { copy, reasonTitle, type Category } from "../copy";
import { LISBON, type Person } from "../data";
import { formatUsd } from "../format";
import { useUi } from "../theme";
import { T } from "../type";
import { Appear } from "./Appear";
import { CompactRow, LeadAvatar, ReceiptLink, RowTitle, SystemLine } from "./CompactRow";
import { MoneyText } from "./MoneyText";
import { StatusChip, type ChipStatus } from "./StatusChip";

export { SystemLine };

export type SpendTier = "one_ok" | "group";

export type FeedEntry =
  /** "Leo · Added money" · Receipt ↗ · "5:23 PM" · "+ $150.00" (chip "sent" right after it lands). */
  | { kind: "contribution"; who: Person; amount: number; when: string; chip?: ChipStatus; receipt?: boolean }
  /** Pending add (OpRow): "Adding $150…" + "Sending…" chip, amount "+ $150.00" in ink-muted. */
  | { kind: "adding"; who: Person; amount: number }
  | { kind: "joined"; who: Person; receipt?: boolean }
  | { kind: "created"; who: Person; potName: string; receipt?: boolean }
  /** The instant spend: "Maya · Groceries" · ⚡ Instant · "just now" · "− $84.00". */
  | { kind: "instant"; who: Person; amount: number; reason: string; instantLimit: number; chip?: ChipStatus; category?: Category; when?: string }
  /** Asked: "Maya · Tickets" · ⏱ Needs one OK (one-OK tier) or ⏱ Waiting 1 of 2 (the group) · "$300.00". */
  | {
      kind: "pending";
      who: Person;
      amount: number;
      reason: string;
      approvals: number;
      k: number;
      expires: string;
      tier?: SpendTier;
      category?: Category;
      when?: string;
    }
  /** Paid after approval: "Maya · Tickets" · ✓ One OK (okBy) or ✓ Approved (the group) · "− $300.00". */
  | {
      kind: "approved";
      to: Person;
      amount: number;
      reason: string;
      approvedBy: string[];
      chip?: ChipStatus;
      okBy?: string;
      category?: Category;
      when?: string;
    }
  /** Money paid in from outside the Pot by link: "Grandma · Paid in · by link" · ↙ From outside (or a gift ☕). */
  | { kind: "payin"; who: Person; amount: number; tone?: "payment" | "gift"; when: string }
  | { kind: "goalReached"; amount: number; receipt?: boolean }
  | { kind: "closeRequested"; who: Person; k: number; receipt?: boolean }
  | { kind: "closed"; receipt?: boolean };

export type FeedItem = FeedEntry & { id?: string; appear?: number; /** 0..1 press on the row */ pressed?: number };
export type FeedGroup = { label: string; items: FeedItem[]; appear?: number };

export const REASON_ICON: Record<Category, LucideIcon> = {
  groceries: ShoppingCart,
  food: Utensils,
  transport: CarTaxiFront,
  stay: BedDouble,
  tickets: Ticket,
  other: Tag,
};

/** A reason word ("groceries", "the boat trip") → its chip category (anything else is "other"). */
export function categoryOf(reason: string): Category {
  const r = reason.trim().toLowerCase();
  if (r === "groceries") return "groceries";
  if (r === "food") return "food";
  if (r === "transport") return "transport";
  if (r === "a place to stay" || r === "stay") return "stay";
  if (r === "tickets") return "tickets";
  return "other";
}

/** Line 1's "what": the category's word; "Other" gives way to the note as written ("the boat trip"). */
const what = (category: Category, reason: string) => (category === "other" ? reason.trim() || reasonTitle("other") : reasonTitle(category));

const ico = (I: LucideIcon) => <I size={16} strokeWidth={2} style={{ display: "block" }} aria-hidden />;

/** One feed entry, as the app renders it. */
export const FeedRow: React.FC<{ item: FeedEntry; pressed?: number }> = ({ item, pressed = 0 }) => {
  const { c } = useUi();
  switch (item.kind) {
    case "contribution":
      return (
        <CompactRow
          pressed={pressed}
          lead={<LeadAvatar person={item.who} badge={Plus} />}
          title={<RowTitle who={item.who.name} what={copy["row.added"]} />}
          meta={
            <>
              {item.chip ? <StatusChip status={item.chip} size="sm" /> : null}
              {item.receipt !== false && item.chip !== "sending" ? <ReceiptLink /> : null}
            </>
          }
          aside={item.when}
          amount={<MoneyText amount={item.amount} sign="in" color={c.approved} />}
        />
      );
    case "adding":
      return (
        <CompactRow
          pressed={pressed}
          lead={<LeadAvatar person={item.who} badge={Plus} />}
          title={copy["add.sending"](formatUsd(item.amount, "whole"))}
          meta={<StatusChip status="sending" size="sm" />}
          amount={<MoneyText amount={item.amount} sign="in" color={c.inkMuted} />}
        />
      );
    case "joined":
      return <SystemLine icon={ico(UserPlus)} text={copy["feed.joined"](item.who.name)} receipt={item.receipt !== false} />;
    case "created":
      return <SystemLine icon={ico(PartyPopper)} text={copy["feed.created"](item.who.name, item.potName)} receipt={item.receipt !== false} />;
    case "instant": {
      const cat = item.category ?? categoryOf(item.reason);
      return (
        <CompactRow
          pressed={pressed}
          lead={<LeadAvatar person={item.who} badge={REASON_ICON[cat]} />}
          title={<RowTitle who={item.who.name} what={what(cat, item.reason)} />}
          meta={<StatusChip status={item.chip ?? "instant"} size="sm" />}
          aside={item.when ?? copy["time.just_now"]}
          amount={<MoneyText amount={item.amount} sign="out" color={c.ink} />}
        />
      );
    }
    case "pending": {
      const cat = item.category ?? categoryOf(item.reason);
      const tier: SpendTier = item.tier ?? (item.amount <= LISBON.oneOkCap ? "one_ok" : "group");
      return (
        <CompactRow
          pressed={pressed}
          lead={<LeadAvatar person={item.who} badge={REASON_ICON[cat]} />}
          title={<RowTitle who={item.who.name} what={what(cat, item.reason)} />}
          meta={
            <StatusChip status="needs" size="sm">
              {tier === "one_ok" ? copy["feed.pending.one_ok"] : copy["row.status.waiting"](item.approvals, item.k)}
            </StatusChip>
          }
          aside={item.when ?? copy["time.just_now"]}
          amount={<MoneyText amount={item.amount} color={c.ink} />}
        />
      );
    }
    case "approved": {
      const cat = item.category ?? categoryOf(item.reason);
      return (
        <CompactRow
          pressed={pressed}
          lead={<LeadAvatar person={item.to} badge={REASON_ICON[cat]} />}
          title={<RowTitle who={item.to.name} what={what(cat, item.reason)} />}
          meta={
            <StatusChip status={item.chip ?? "approved"} size="sm">
              {item.chip === "sent" ? undefined : item.okBy ? copy["row.status.one_ok"] : undefined}
            </StatusChip>
          }
          aside={item.when ?? copy["time.just_now"]}
          amount={<MoneyText amount={item.amount} sign="out" color={c.ink} />}
        />
      );
    }
    case "payin": {
      const gift = item.tone === "gift";
      return (
        <CompactRow
          pressed={pressed}
          lead={<LeadAvatar person={item.who} badge={gift ? Gift : ArrowDownLeft} />}
          title={<RowTitle who={item.who.name} what={gift ? copy["row.gift"] : copy["row.payin"]} />}
          meta={<StatusChip status={gift ? "gift" : "outside"} size="sm" />}
          aside={item.when}
          amount={<MoneyText amount={item.amount} sign="in" color={c.approved} />}
        />
      );
    }
    case "goalReached":
      return <SystemLine icon={ico(Flag)} text={copy["feed.goal.reached"](formatUsd(item.amount, "whole"))} receipt={item.receipt !== false} />;
    case "closeRequested":
      return (
        <SystemLine
          icon={ico(Hand)}
          text={`${copy["feed.close_requested"](item.who.name)} · ${copy["feed.close_requested.sub"](item.k)}`}
          receipt={item.receipt !== false}
        />
      );
    case "closed":
      return <SystemLine icon={ico(DoorClosed)} text={`${copy["feed.closed"]} ${copy["feed.closed.sub"]}`} receipt={item.receipt !== false} />;
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
          <FeedRow item={it} pressed={it.pressed} />
        </Appear>,
      );
    });
  });
  return <div style={{ display: "flex", flexDirection: "column", ...style }}>{out}</div>;
};
