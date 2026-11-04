// The D-61 demo cast and Pot (binding numbers, brief §"The demo story" + 06-update-v2 §1). Pure data.
import { members } from "../brand/tokens";

export type Person = { id: string; name: string; initials: string; joinIndex: number | null };

export const MAYA: Person = { id: "maya", name: "Maya", initials: "M", joinIndex: 0 };
export const SAM: Person = { id: "sam", name: "Sam", initials: "S", joinIndex: 1 };
export const LEO: Person = { id: "leo", name: "Leo", initials: "L", joinIndex: 2 };
export const CREW: Person[] = [MAYA, SAM, LEO];
/** Someone outside the Pot who pays in by link (no join index: a surface-sunken seat with ink-muted initials). */
export const GRANDMA: Person = { id: "grandma", name: "Grandma", initials: "G", joinIndex: null };

/** Avatar colour by join order: member-((joinIndex mod 6) + 1). */
export const memberColor = (joinIndex: number) => members[((joinIndex % 6) + 6) % 6];

export const LISBON = {
  name: "Lisbon Trip",
  emoji: "🇵🇹",
  /** CoverTile gradient index (app fixture: Lisbon Trip = 0, member-1 → member-4). */
  cover: 0,
  goal: 450,
  goalEach: 150,
  instantLimit: 100,
  /** hub 1.1.0: spends over the instant limit and up to this need one OK from anyone else (3 × the instant limit). */
  oneOkCap: 300,
  memberBudget: 200,
  /** majority for bigger spends, closing and rule changes: approvals needed / members */
  k: 2,
  n: 3,
  expiryDays: 7,
  maxMembers: 40,
  /** earned trust: every 3 paid spends raise the instant limit by $100, up to $300 */
  trustStep: 3,
} as const;

/** Balances through the story. */
export const STORY = {
  beforeLeo: 300,
  full: 450,
  afterGroceries: 366,
  afterBoat: 66,
  refundEach: 22,
  groceries: 84,
  boat: 300,
} as const;

/** "You'd get back" on Maya's hero (pro rata of the balance; everyone put in $150). */
export const GETS_BACK = { full: 150, afterGroceries: 122, afterBoat: 22 } as const;

/** Each person's own Pot dollars (the tab bar's third tab). Adds come from demo dollars, so they stay $0 until paid. */
export const POT_DOLLARS = {
  maya: { start: 0, afterGroceries: 84, afterBoat: 384, afterClose: 406 },
  leo: { start: 0, afterClose: 22 },
  sam: { start: 0, afterClose: 22 },
} as const;
