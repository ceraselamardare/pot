# Pot: Knowledge Base

This is the Phase 0 research for **Pot** (NEAR HACKATHON, Nov 1-14, 2026; tracks `social` + `realworld`).
The source is the original Phase 0 plan; decisions.md and the specs in plan/ supersede it.
The research ran on 2026-10-21 against live docs, source code, package registries, testnet and sandbox.

## Rules
- **No product code before Nov 1.** The spikes in [../spikes](../spikes) are throwaway. Never import or copy them into the product.
- **Testnet only.** No mainnet transactions and no real funds.
- Every fact carries a status marker and a source:
  - ✅ **Verified**: tested on testnet, sandbox or a live API, or read in the primary source code (with a link to file and line or commit)
  - 📄 **Docs**: stated in official docs but not tested
  - ⚠️ **Unverified / conflicting**: secondary source, inference, or sources that disagree (say which)
- Prefer exact signatures, JSON shapes, account IDs, versions and measured numbers over prose.

## File template
```
# <Topic>
> Owner: <agent>. Last verified: 2026-10-21. Legend: ✅ verified · 📄 docs-only · ⚠️ unverified/conflicting

## TL;DR                  (5-10 bullets an implementer must know)
## Plan check             (claims in the original plan on this topic → ✅ confirmed / ❌ corrected / ⚠️ unknown)
## Reference              (APIs, signatures, JSON shapes, account ids, versions)
## Snippets               (minimal, copy-pasteable, tested where possible; say which)
## Gotchas & failure modes
## Costs, limits, latencies (measured vs documented)
## Open questions / needs a human
## Sources                (URL: what it supports: accessed date)
```

## Index
| File | Topic | Owner |
|---|---|---|
| [hackathon-rules.md](hackathon-rules.md) | Live HACKATHON.md rules, submission API, judging, compliance checklist | product-ux |
| [competitors-ux-patterns.md](competitors-ux-patterns.md) | Party.app, Splitwise, Tricount, Revolut, crypto group wallets; patterns that convert | product-ux |
| [ux-research.md](ux-research.md) | UX research brief and reference flows | product-ux |
| [sputnik-dao.md](sputnik-dao.md) | Sputnik DAO v2: factory, policy, proposals, voting math, spike 1 results | sputnik |
| [trezu.md](trezu.md) | Trezu: DAO visibility, testnet support, deep links | sputnik |
| [meta-tx-relayer.md](meta-tx-relayer.md) | NEP-366 delegate actions, near-api-js 7 APIs, relayer design, spike 3 results | relayer |
| [accounts-onboarding.md](accounts-onboarding.md) | Sponsored account creation, funding, storage costs, testnet NEAR sourcing | relayer |
| [fungible-tokens-usdc.md](fungible-tokens-usdc.md) | NEP-141/145, testnet USDC options, mainnet USDC, storage | relayer |
| [near-auth.md](near-auth.md) | NEAR Auth (FastAuth): SDKs, account model, signing, testnet config, iOS PWA OAuth | auth |
| [near-connect.md](near-connect.md) | @hot-labs/near-connect + hooks: wallet fallback | auth |
| [intents-1click.md](intents-1click.md) | NEAR Intents 1Click API: live tests, schemas, statuses, JWT, delivery to NEAR | intents |
| [contracts-toolchain.md](contracts-toolchain.md) | near-sdk, cargo-near, Rust pin, near-workspaces sandbox (+ Sputnik wasm in sandbox) | contracts |
| [contracts-patterns.md](contracts-patterns.md) | Cross-contract calls to Sputnik, ft_on_transfer, factories, global contracts, events, gas, security invariants | contracts |
| [frontend-stack.md](frontend-stack.md) | Next.js 16, Tailwind v4, shadcn/ui, Motion, TanStack, NEAR libs in Next | web |
| [pwa-push.md](pwa-push.md) | PWA approach, service worker, Web Push (iOS/Android), install UX | web |
| [backend-infra.md](backend-infra.md) | Vercel limits, cron/worker, DB/ORM, RPC providers, indexing/feed, CI | infra |
| [notifications.md](notifications.md) | Web Push server, email, Telegram bot terms + design | infra |

The planning outputs live in [../plan](../plan).
