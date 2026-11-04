// The VO script (v3, 2026-11-03), mirrored from brief/02-script.md. Director-owned.
// Used for captions (to restore punctuation the word timings don't carry) and as a fallback when VO isn't generated yet.
import type { SceneId } from "./timeline";

export const SCRIPT: Record<SceneId, string> = {
  "s01-hook": "Every group trip has a money problem.",
  "s02-front": "One friend fronts it all…",
  "s03-chase": "…then spends weeks chasing everyone to pay up.",
  "s04-options": "Split apps just keep score. Shared accounts hand one person all the money.",
  "s05-pivot": "What if the money lived right in the group chat?",
  "s06-reveal": "Meet Pot. … Group chat money that follows its own rules.",
  "s07-create": "Start a Pot for the trip, and set the rules in plain words.",
  "s08-join":
    "Drop the link in the chat. Friends join with Google and chip in their share. No wallet. No seed phrase. No gas.",
  "s09-instant":
    "Small spends approve themselves. Eighty-four dollars for groceries? Pot checks the rules… approved, and paid back in seconds.",
  "s10-group": "Bigger spends need one OK. Leo taps it, right from a notification.",
  "s10b-more": "Plus: trust that grows, all-or-nothing goals, and links to pay in, or pay out.",
  "s11-close": "When the trip's over, close the Pot. Everyone gets their fair share back.",
  "s12-tech":
    "Under the hood, every Pot is a Sputnik DAO on NEAR. Its rules are enforced on-chain, not by a person. Every action is gasless. And no one can take money out alone.",
  "s13-end": "Pot. Built at NEAR Hackathon.",
};

/** Script tokens with punctuation, split on whitespace; standalone ellipses are dropped. */
export const scriptTokens = (id: SceneId): string[] =>
  SCRIPT[id]
    .split(/\s+/)
    .filter((t) => t.replace(/[.…,?!]/g, "").length > 0);
