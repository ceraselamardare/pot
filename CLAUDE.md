# Pot: guide for Claude

Pot is group-chat money that follows its own rules. It is a mobile-first PWA, and each Pot is a **Sputnik DAO** on NEAR.
- The **Pot Hub** contract (`pots.<root>`) holds the 1-of-1 `rulebot` role, so it auto-approves small spends and invite joins.
- Members approve bigger spends by majority.
- Everything is gasless through our own NEP-366 relayer.
- When a Pot closes, everyone gets their pro-rata share back.

It is being built for NEAR HACKATHON (Nov 1-14, 2026; tracks `social` + `realworld`) by two people:
- **P1**: contracts and backend.
- **P2**: frontend, UX and design lead.

## Status
- **Research and planning are done** (2026-10-21).
- **Implementation started on 2026-10-22 at the user's explicit request.** The rules update of 2026-10-29 (Q-001) confirms that code written since the 2026-10-19 announcement counts, so all of it is in-window. The current rules are summarized at the top of `kb/hackathon-rules.md`, with a snapshot in `kb/sources/`.
  - **The git repo is `ceraselamardare/pot` on GitHub (branch `main`).** Read-only git (status, diff, log, grep) is fine. Commit only when the user asks, and always ask before you push.
- **No wallet-less real accounts** (user decision, 2026-11-01): there is no test-account login and no custodial live persona demo. Sign-in is a NEAR wallet (NEAR Connect) or Google/email (NEAR Auth) only. Fake, no-network content is fine: the simulated `/demo` tour and the landing's "Try the rules".
- **Built and tested:**
  - `contracts/`: Pot Hub + test USDC, 120 sandbox tests.
  - `packages/pot-sdk`.
  - `apps/web`: UI + API + relayer, in the pnpm workspace layout of D-64.
  - The preview deployment on testnet under `potprev.testnet` (see notes/deploy.md).
- **Per-area build notes, deviations and open items:** `notes/*.md`. Read the relevant one before changing an area.
- **Every testnet-touching run** (live tests, testnet Playwright, seeding) must go through `scripts/with-testnet-lock.sh <cmd>`.
- **Testnet funding:** the holding account is `pot-funds-65k8.testnet`. Top it up via the faucet, and verify on chain, because the faucet can report success without creating the account.

## Read before working
1. **[plan/decisions.md](plan/decisions.md)**: the binding decisions (D-xx), the human items (H-xx) and the interface skeleton (§8). Where it disagrees with the original plan, decisions.md wins.
2. **[plan/README.md](plan/README.md)**: the index of specs (contracts, API, data model, frontend, UX, implementation plan, tests, submission, risks). Load only the spec for the area you are touching.
3. **[kb/README.md](kb/README.md)**: verified research by topic, marked ✅ verified / 📄 docs / ⚠️ unverified. Read the topic file before you change that area.
4. **[brand/README.md](brand/README.md)**: the brand and design system: logo, tokens, type, motion and web assets. Its source of truth is the Design System artifact `https://claude.ai/artifact/TfPiy6PHkWTSZsR2wDxwWN`, with design tokens in `brand/tokens.json`. For screen-level direction backed by real-app references, see [plan/design-direction/](plan/design-direction/README.md). Read both before any UI work.

## Hard rules
- **Ask for explicit human confirmation before** you:
  - `git push`, or make a repo public;
  - post anywhere;
  - **sign any transaction (testnet included)**, deploy anything, or submit to the hackathon API.

  These are the hackathon's agent rules (see kb/hackathon-rules.md).
- **Networks:** use testnet for everything judges run. Mainnet is only for the Phase 2 recorded clip, with a human present.
- **RPC:** never use `rpc.testnet.near.org`: it is deprecated, adds ~3 s and returns 429. Use `https://rpc.testnet.fastnear.com` with a dRPC failover.
- **Private keys** never go in docs, code, logs or commits. Never read, print or copy key files.
  - The full-access keys for the hub, `<root>`, `reserve` and `treasury` are **never kept on disk in the macOS user account that runs AI agents** (D-13, Rev 4 of plan/decisions.md). Agents only get preview/testnet relayer keys, through env vars.
  - Throwaway testnet keys live in a gitignored `.keys/` or in `~/.near-credentials/testnet/`.
  - With near-cli-rs, never use `save-to-keychain` or `sign-with-keychain`: the macOS Keychain prompt blocks non-interactive shells. Use `save-to-legacy-keychain`, `sign-with-legacy-keychain` or key files instead.
- **Brand rules**
  - Use the tokens from `brand/tokens.json` only; never invent colors.
  - One marigold (`brand`) button per screen, always with eggplant `on-brand` text. Marigold is never used for text.
  - Status colors always come with an icon and a word.
  - Type: Gabarito for display and Figtree for text. Every amount uses tabular figures.
  - Icons: Lucide at stroke 2.
  - The logo is never recolored. The mark always appears with the name, and the wordmark is always lowercase "pot".
- **UI copy** never shows these in main paths: DAO, multisig, treasury, proposal, vote, bond, gas, yoctoNEAR, storage deposit, wallet, account ID, transaction hash, USDC, Sputnik, Trezu. The words to use instead are in [plan/ux-spec.md](plan/ux-spec.md), and a jargon lint enforces them (D-44).

## Must-know facts
Details are in `kb/`.
- **Sputnik**
  - Always pass `proposal` (the stored kind) to `act_proposal`: mainnet v3.2 requires it.
  - `act_proposal` succeeding does **not** mean the payout succeeded. The payout is a detached promise that can end in `Failed`; retry with `Finalize`. The relayer calls `pots.sync` after votes and after payout failures.
  - Bond "0" requires exactly 0 deposit. Use `quorum "1"` everywhere.
  - The DAO pays storage for every proposal, so it keeps a 0.05 NEAR float and the hub tops it up per proposal.
  - See [kb/sputnik-dao.md](kb/sputnik-dao.md).
- **DAO code** comes from the testnet global contract `Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD`, at 0.0121 NEAR per DAO. Don't use the legacy factory `sputnikv2.testnet`: it costs 5.4 NEAR per DAO and has the old API.
- **NEP-366 relayer**
  - The relayer pays **every deposit** inside a delegate, including the 1 yocto, so cap deposits per method.
  - A relayed tx's top-level status hides inner failures, so scan `receipts_outcome`.
  - Function-call keys can't attach the 1 yocto that FT transfers need.
  - Under NEP-366, `env::signer_account_id()` is the relayer, so authorize by `predecessor_account_id`.
  - See [kb/meta-tx-relayer.md](kb/meta-tx-relayer.md).
- **Accounts:** users need 0 NEAR (NEP-448). Onboarding costs ≈ 0.0085 NEAR **in total**, which already includes the 0.00125 NEAR USDC storage deposit. See [kb/accounts-onboarding.md](kb/accounts-onboarding.md).
- **NEAR Auth:** every signature costs a popup plus ~9 s of MPC, and the shared testnet client only allows `http://localhost:3000`. So we use the device-key model (D-21) and a thin `@auth0/auth0-spa-js` wrapper instead of the official SDK. See [kb/near-auth.md](kb/near-auth.md).
- **`ft_transfer_call`** needs ≥ 35 Tgas (use 100). With less, the money silently bounces back.
- **Contract toolchain**
  - Rust `1.93.0` via `rust-toolchain.toml`; `near-sdk =5.29.1`; `near-workspaces =0.23.0`.
  - Build with `cargo near build non-reproducible-wasm`; a plain `cargo build` is wrong for near-sdk ≥ 5.27.
  - This machine's default rustup toolchain is a 2023 nightly, so always rely on `rust-toolchain.toml`.
  - Testnet moved to protocol 88 on 2026-10-21, but mainnet is still on 86. Keep the pins, and don't adopt the protocol-88 release candidates.
  - The sandbox runs on arm64 Macs but not Intel Macs.
  - See [kb/contracts-toolchain.md](kb/contracts-toolchain.md).
- **Frontend pins**
  - next `16.4.5` (≥ 16.4.1 fixes an RCE; 16.4.5 is the latest security release, audit CLI-8), react `19.3.1`, TypeScript `5.9.3`, ESLint 9, Tailwind 4.3, shadcn on Base UI.
  - No vaul and no Serwist.
  - Cache Components is on, so wrap anything that reads `params` in `<Suspense>`.
  - pnpm 11 needs `allowBuilds` for packages with install scripts.
  - See [kb/frontend-stack.md](kb/frontend-stack.md).
- **Backend:** Neon Postgres + Drizzle `0.45.4`, not Prisma. Vercel route handlers + Workflow. No always-on worker and no indexer. See [kb/backend-infra.md](kb/backend-infra.md).

## Commands
- NEAR CLI: `npx -y near-cli-rs@0.30.1 <full command>`. Always pass every argument, because the CLI is interactive otherwise.
- Testnet explorer links: `https://testnet.nearblocks.io/txns/<hash>`.
