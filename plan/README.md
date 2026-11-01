# Pot: Plan index

These are the Phase 0 planning outputs, written 2026-10-21. P1 (contracts and backend) and P2 (frontend, UX and design lead) are roles; Cerasela Mardare, the solo builder, holds both. Start with **decisions.md**: it is binding, and other docs cite its IDs (D-xx, H-xx).

Implementation starts **Nov 1** in a fresh repo (D-63, D-64). These docs may be copied into that repo's `docs/`.

The research behind them is in [../kb](../kb/README.md), and the throwaway testnet spikes are in [../spikes](../spikes/README.md).

## Start here
| File | What it is | Read it when |
|---|---|---|
| [decisions.md](decisions.md) | Binding decisions D-01…D-66 (Rev 4: the security fixes), what Phase 1 changed in the original plan, human items H-01…H-17, and the binding interface skeleton (§8) | Always, first |
| [phase0-checklist.md](phase0-checklist.md) | Human actions for **Oct 21-31**, ordered by lead time, with owners, deadlines, steps and fallbacks; ends with the Oct 31 go/no-go | Now |
| [implementation-plan.md](implementation-plan.md) | Scope and cut order, day-by-day schedule for Nov 1-14 per person, ~70 tasks (C/B/F/X), gates G1-G4, the Nov 1 readiness checklist, a Claude Code guide, and the conflict-resolution log (§10) | Before each workday |

## Specifications
| Area | File | Owner during the event |
|---|---|---|
| On-chain | [contracts-spec.md](contracts-spec.md): Pot Hub (Rulebot + factory) and test USDC, covering methods, state, events, invariants, test matrix and gas/storage tables | P1 |
| On-chain | [accounts-and-deploy.md](accounts-and-deploy.md): account map, key custody, testnet NEAR budget (~74 NEAR), near-cli-rs runbook, Nov 2 token lock and Nov 12 hub lock, judge CLI commands, incident steps | P1 |
| Backend | [architecture.md](architecture.md): system context, trust model, 16 sequence diagrams with failure branches, cross-cutting rules | P1 |
| Backend | [api-spec.md](api-spec.md): all routes, relayer policy (R1-R12, validation order, key pool, receipt scanning), sessions, Workflows, notifications, demo mode | P1 (+ P2 for UI-adjacent routes) |
| Backend | [data-model.md](data-model.md): Drizzle schema (22 tables), atomic quotas and leases, retention, seed data | P1 |
| Frontend | [frontend-architecture.md](frontend-architecture.md): app structure, route map, data layer, signing layer (`PotSigner`), state machines, design-system mapping, PWA, i18n, a11y, performance, build order | P2 (Cerasela) |
| UX | [ux-spec.md](ux-spec.md): **UX source of truth (Cerasela)**: screens, states, the full copy deck, flows with tap counts, tokens, accessibility, install coach | P2 (Cerasela) |
| UX | [hallway-test.md](hallway-test.md): 5-person hallway test script (join and pay in under 2 minutes) | P2 (Cerasela) |
| Brand | [../brand/README.md](../brand/README.md): logo system, Day/Night tokens (`brand/tokens.json`), type (Gabarito + Figtree), motion, icons and web assets. Source: the Pot Design System artifact (D-67) | P2 (Cerasela) |
| Design | [design-direction/](design-direction/README.md): screen-by-screen blueprints that combine the brand with 150 real-app references from Mobbin, plus brand-system contrast fixes and open design questions | P2 (Cerasela) |

## Quality and delivery
| File | What it is |
|---|---|
| [test-plan.md](test-plan.md) | Test layers (sandbox against both Sputnik builds, relayer negatives, property tests, Playwright two-context e2e, PWA, a11y, device matrix), CI, definition of done, traceability for P-1…P-11 |
| [submission-plan.md](submission-plan.md) | README outline for AI judges ("do X → see Y"), video storyboard, X post, submission JSON checklist, Nov 13 order of operations, mainnet clip plan |
| [risk-register.md](risk-register.md) | Risks with signals, mitigations, owners and trigger dates |

## Reviews
| File | What it is |
|---|---|
| [review.md](review.md) | Consistency review: the 32 conflicts resolved, coverage gaps filled, schedule fixes, open questions with defaults, and the "Ready for Nov 1?" verdict |
| [review-security.md](review-security.md) | Security red-team and live fact-check of the plan's key claims; §7 maps every finding to where it is fixed, deferred or left to a human (Rev 4) |
