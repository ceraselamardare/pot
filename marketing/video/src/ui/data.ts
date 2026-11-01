// The D-61 demo cast and Pot (binding numbers, brief §"The demo story"). Pure data.
import { members } from "../brand/tokens";

export type Person = { id: string; name: string; initials: string; joinIndex: number | null };

export const MAYA: Person = { id: "maya", name: "Maya", initials: "M", joinIndex: 0 };
export const SAM: Person = { id: "sam", name: "Sam", initials: "S", joinIndex: 1 };
export const LEO: Person = { id: "leo", name: "Leo", initials: "L", joinIndex: 2 };
export const CREW: Person[] = [MAYA, SAM, LEO];

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
  memberBudget: 200,
  /** approvals needed / members */
  k: 2,
  n: 3,
  expiryDays: 7,
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
