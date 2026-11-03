# Pot: Design direction (brand × real-app references)

Pot's own brand is applied screen by screen here, backed by references from real apps. The **brand wins on look**: palette, type, shape, motion and logo, from [../../brand/README.md](../../brand/README.md) and `brand/tokens.json`. The **references win on proven patterns**: layout, hierarchy and interaction. The **plan wins on behavior and numbers** ([../decisions.md](../decisions.md), [../ux-spec.md](../ux-spec.md)).

Written 2026-10-21 for Cerasela (P2, design lead) as input to the Figma flows and hallway round A. It is planning only; the build starts Nov 1.

| File | Screens | Mobbin references |
|---|---|---|
| [01-join-and-money-in.md](01-join-and-money-in.md) | Invite unfurl in a chat, invite landing, sign-in and account setup, "You're in", Create Pot and share, Add money, any-chain deposit + stepper, install coach and push prompt, "Confirm it's you" | 60 screens from 16 iOS searches |
| [02-pot-and-decisions.md](02-pot-and-decisions.md) | Pots home, the Pot screen (+ the 1024 px two-column layout), Spend + rule preview, the instant-approval moment, Approve sheet and Requests, Members and Rules, Close Pot, entry from notifications, empty and error states | 90 screens and flows from 16 searches |
| [03-landing.md](03-landing.md) | The landing page `/` (2026-10-22): page-wide grammar (rhythm, stickers, member colours, motion, mock-UI rules), then header, hero, problem, how it works, try the rules, trust, under the hood, final call to action and footer, at 390 px and ≥ 1024 px | 40 cited references (39 web landing sections, 1 iOS screen) from 19 searches |
| [04-landing-motion.md](04-landing-motion.md) | The landing's motion and interaction (2026-10-22): 7 principles, motion tokens (+ `ease-spring` as `linear()`), the stagger and beat rule, per-section timelines (hero load, problem chat, the 5 how-it-works stories, Try the rules, the tech trace, final call to action), the micro-interaction catalogue, implementation notes (CSS vs JS, the 25 KB budget, CLS 0, reduced motion, no-JS), priorities and browser support | 16 live sites recorded and measured (probe + contact sheets), 8 Mobbin flows and sections from 4 searches, 8 craft and platform sources |
| [06-demo-simple.md](06-demo-simple.md) | The `/demo` tour, simplified (2026-10-27). It replaces 05's main path. One reader, a person about to make a real Pot. 14 steps in 5 parts plus a cover and an end screen (≈ 100 s), with the exact `tour.*` copy (not allowlisted, so the jargon lint guards it). One stage at 390 and 1280: the phone, one sentence, [Next]. "Simulation" is said once. The 1.2 s rules beat and the burst sit at step 7, and the tour ends on [Start a real Pot]. One closed "Under the hood" sheet per part holds 05's NEAR cards, and `/demo/all` is the full technical read. Also: a removal table, accessibility, motion and no-JS | 14 Mobbin flows, sections and screens from 9 searches; 6 web sources on tours and progressive disclosure; a 104-screenshot walk of today's demo |
| [07-site-update.md](07-site-update.md) | The site update (2026-11-03). **The CTA system** across `/`, the `/demo` cover and end, and the app's signed-out screen: [Start a Pot] everywhere (the hero's stays the one marigold), "See a demo" second, a text "Sign in" in the header. **The sign-in dialog** (a bottom sheet at 390, a 440 px dialog from md): the options by build (Google, email, then "I have a NEAR wallet"; the wallet alone on today's hosted build), mode copy, 13 states (waiting stepper, errors, in-app browser, nothing available, no-JS), NEAR Connect's stacked picker, a11y and motion. **"What else a Pot can do"**, four quiet cells between Try the rules and Trust. Proposed `home.*` / `signin.*` keys (one allowlist entry) | 39 Mobbin screens, flows and sections from 10 searches; 6 web sources (Google branding and webview rules, NN/g, Navattic, Privy); a 20-screenshot walk of today's site |

Each screen has its job, the references (with a Mobbin link, what to borrow and what to leave), a Pot blueprint in token names, and watch-outs.

## Principles across both docs
1. **One marigold button per screen, labelled with its outcome:** "Join with Google", "Add $150", "Copy Base address". On the Pot screen the marigold is [Add money]. An inline Approve in a feed or list is a secondary button, never a second marigold.
2. **The Pot is the hero object everywhere.** One Pot card (emoji cover, name, member seats, balance, goal bar) appears in the chat preview, the landing, the "You're in" sheet, Share and Create.
3. **Every wait is one vertical stepper with a time on each step.** It covers account setup, Create, "Confirm it's you" and the 5-step deposit, and its current step shows the pot-bubble's typing dots.
4. **The rule is visible before, during and after the tap.**
   - *Before:* a neutral rule-preview sentence under the amount.
   - *During:* the typing dots for "Checking Pot rules".
   - *After:* the product's only celebration, a 600 ms marigold burst on "Approved by Pot rules", and a receipt that names the rule.
5. **Every group decision reads as one timeline** (who asked, whose approval counted, who is left, decided or expired), reused in Approve, the receipt, Requests and Close.
6. **Status is always an icon, a word and a color.** Pills use the Lucide check, clock and x, never a colored dot alone.
7. **Money sheets read like a sentence:** amount, then source, then the outcome line, then the button, then the keypad, so one thumb does it all.
8. **Calm, never blank.** Cached numbers stay on screen under an offline or service banner. Skeletons appear only after 150 ms. Every error says what happened, whether money moved and what to do.

## Brand-system fixes to consider
These are contrast and consistency findings from both docs, computed from `tokens.json`. They are Cerasela's call; apply them in the Design System artifact.

| Finding | Where | Suggested fix |
|---|---|---|
| `approved` green on `brand-soft` is 4.35:1, below 4.5:1 | The "Approved by Pot rules" highlight row | Use `ink` text on `brand-soft`; keep green for the icon and pill only |
| The goal bar fill against its track is 1.47:1 (non-text contrast needs 3:1) | GoalBar | Add a 1 px `brand-deep` edge to the fill. It already has a text twin ("$450 of $450 collected") |
| Eggplant on the pressed `brand-deep` is 4.33:1 | Day pressed primary button | Lighten Day `brand-deep` slightly, or accept it as a momentary state |
| Night `link`/`focus` `#FFC94D` is 1.17:1 against marigold, so links look like marigold text | Night text buttons | A light plum for Night links, or underlined `ink` |
| The Requests badge uses `declined` red, which means "Not approved" | Bottom tab badge | Badge in `ink` (eggplant) |
| Status pills use 8 px dots | Colour-type mockup | Lucide check, clock and x (the brand README already asks for icons) |
| Mockups use 12-13 px text | Tab labels, badges, meta | Add a 12/16 caption style for tabs and badges only, or move up to `body-sm` 14 |
| Two marigold buttons on one screen | In-context Pot mockup (Add money + inline Approve) | Make the inline Approve secondary |
| Mockup content differs from the plan | In-context mockups | Use the D-61 numbers (Maya asks $300; $450; Maya, Sam and Leo). No Apple button on testnet (D-20) |

**Already resolved:**
- The brand replaces the provisional tokens in ux-spec §7 and Geist (decisions Rev 6, D-45, D-67).
- Gabarito and Figtree both support tabular figures (`tnum`, verified in the files next/font serves). `tabular-nums` must be switched on for every amount, because both fonts default to proportional digits.

## Open questions for Cerasela
These are merged from both docs; each doc gives the detail. Defaults are in brackets.

| # | Question | Doc |
|---|---|---|
| 1 | Google button: "Join with Google" (sign in + join in one tap) or "Continue with Google"? Check Google's branding rules before using a marigold button with the G. [a G on a white disc inside the marigold button] | 01 |
| 2 | Landing copy: add "Everyone's chipping in $150", drop "No crypto needed"? | 01 |
| 3 | "wallet" in main paths: allow two copy keys, or rename to "Another app or exchange"? [rename] | 01 |
| 4 | Add an outcome line above the Add money button, "Lisbon trip will have $450"? [yes] | 01 |
| 5 | First Home Screen launch: ask "Confirm it's you" only when first needed, or bundle it with the push prompt as one "Finish setting up" step? | 01 |
| 6 | Testnet deposit: make "Simulate sending $150" the marigold, and hide Copy address under "Do not send"? [yes] | 01 |
| 7 | Create: Club and Team as disabled "Coming soon" cards, or hidden? Six cover gradients from the member tints? | 01 |
| 8 | Link-preview emoji: Twemoji, or the gradient with a Gabarito initial? | 01 |
| 9 | When something waits on you: Add money stays the only marigold and Approve is secondary, or the marigold moves to the pending request? [Add money stays] | 02 |
| 10 | The Pot hero's actions vs "primary actions in the bottom 40%": a documented exception, or a sticky action bar when the hero scrolls away? [exception] | 02 |
| 11 | "Your share" means both $150 (contribution) and $122 (your part now). Rename the second to "Your part" / "You'd get back"? [rename; test in hallway round A] | 02 |
| 12 | The burst: only "Approved by Pot rules", or also the final group approval and Pot closed? [only rules, per the brand] | 02 |
| 13 | Expired requests: `ink-muted` + an hourglass + "Expired"? [yes] | 02 |
| 14 | Copy renames: "Pay a member", "Ask the group to change a rule", "Approve closing", "It needs 1 more"? | 02 |
| 15 | After close, where do Leo's $22 go? They stay in his Pot account, with no cash-out in the MVP. The copy says "on its way back to you", so it needs to be honest about this (with P1). | 02 |
| 16 | Update the mockups to the D-61 numbers before hallway round A? [yes] | 02 |
| 17 | frontend-architecture §15 Q16 and the new Appearance (Day/Night) copy; the unused per-user `avatar_tint` field in api-spec/data-model (P1 can drop it) | integrator |

## Note on references
All references are Mobbin captures of third-party apps, cited by link and used for patterns only. Pot's look comes from its own brand. Mobbin image links expire after 30 days, but the `mobbin.com` page links in these docs stay valid.
