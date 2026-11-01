# Pot: Lead decisions (Phase 0 synthesis)

> Written 2026-10-21 by the lead, from the Phase 1 research in [../kb](../kb) and [../spikes](../spikes). Every other plan doc cites these IDs.
>
> **Status values:**
> - **Decided**: the evidence is conclusive (tested, or read in primary source).
> - **Default**: we go ahead with this unless a human overrides it.
> - **Human**: needs a person to decide or act. Each one is also tracked in [phase0-checklist.md](phase0-checklist.md).
>
> Where this file disagrees with the original plan, this file wins.
>
> **Revision 9 (2026-11-01, the user's call):** nothing in Pot lets anyone act on chain without their own sign-in.
> - **Removed:** the live testnet demo (`/demo/live`: server-held demo keys, demo sessions, the demo Pot pool and its cron, the relay's server-signed demo intents and their quotas; its flags and `DEMO_*` env) and the test-account sign-in ("dev" sessions, `POST /api/session/dev`, `FLAG_DEV_SESSION`). Migration `0001` drops `demo_pot` and the demo columns, deletes demo/dev users and sessions, and pins `app_user`/`session.kind` to `near-auth | wallet`.
> - **Why:** "Remove any demo or thing without actually being connected to a wallet where a user can do an onchain tx." Fake things with no real accounts or transactions stay: the simulated `/demo` tour, the landing's rules playground, and the mock data source for tests and design.
> - **Stays:** NEAR Auth (Google/email) and NEAR Connect wallets; the demo-dollars faucet and the 1Click simulator, which deliver test dollars to the signed-in person's own account.
> - **Tests:** the testnet e2e, live tests and `scripts/e2e-chain.ts` create throwaway 0-NEAR accounts from `pot-funds-65k8.testnet` and sign in through the wallet path (NEP-413 → wallet session → `signDelegateActions` → relayer). The browser uses the e2e mock wallet, which `next.config.ts` compiles in only for a flagged local build and refuses on Vercel and mainnet.
> - **Superseded:** D-33's demo Pots (reference/pool/shared), the demo parts of D-63 and S-5, and the dev session of D-21 / api-spec §2.1 and §2.8. The older entries below are kept as written.
>
> **Revision 6 (2026-10-21, brand; details in [../brand/README.md](../brand/README.md)):**
> - **D-67 (new): the brand and design system are decided.**
>   - Source of truth: the Design System artifact `https://claude.ai/artifact/TfPiy6PHkWTSZsR2wDxwWN` plus `brand/` (logo, web assets, `brand/tokens.json`).
>   - Day and Night themes are in scope.
>   - One marigold button per screen, and marigold is never text. The mark always appears with the name.
>   - Lucide at stroke 2; one 600 ms celebration.
>   - The web assets come from `brand/web`.
> - **D-45: type is Gabarito (display) + Figtree (text),** replacing Geist and Inter. Both are in `next/font/google` for next 16.4.2, and both ship `tnum` (verified in the woff2 files next/font self-hosts).
> - **H-06 / D-62 decided:** the product is "Pot", with a lowercase wordmark, and the mark carries recognition. The submission `projectName` stays a human item (H-14).
> - **H-10 narrowed:** the brand decides the palette and the font; Cerasela's other calls stay open.
> - The brand material and the plan differ in 25 places, and brand/README §12 resolves each. Examples: no Apple button on testnet (D-20); the D-61 demo numbers win over the mockups'; "the group" wins over "organizers"; timing copy is the measured one (D-50). The ux-spec edits are marked "(rev6)".
>
> **Revision 4 (2026-10-21, after the security review; the per-finding resolution is [review-security.md](review-security.md) §7):**
> - **S-1 Hub NEAR (C-1):** the hub pays floats, prepays and new state only when `env::signer_account_id()` is one of `config.relayers` (our relayer); any other caller attaches the cost or gets `ERR_DEPOSIT_REQUIRED`. On-chain caps: 3 Pots per creator per UTC day, 50 sponsored Pots per UTC day globally (`ERR_GLOBAL_DAILY_LIMIT`), ≤ 1 open rules proposal (`ERR_RULES_PENDING`) and ≤ 1 open close proposal per Pot. Seeding scripts, CLI steps and the mainnet clip attach deposits (D-05, §8).
> - **S-2 Relayer (H-2):** relays `act_proposal` only on live proposals the hub created (new view `get_proposal_subject`) and only for members of that Pot, at exactly 100 Tgas (Transfer, join) or 300 Tgas (`call`); `Finalize` ≤ 3 per proposal per day; per-user daily NEAR budgets on top of the global caps and alerts (D-24).
> - **S-3 Invites (H-1):** links default to 7 days and 10 uses; any member can make a new one; the UI shows the expiry and says to share it only in the group chat. Instant spends need `contributed > 0` (the default; Cerasela confirms, H-10) (D-08, D-60).
> - **S-4 Keys (H-4):** the token is locked on Nov 2; the hub, root, reserve and treasury keys never sit on disk in the OS user that runs agents, who get only preview relayer keys (H-17); `set_config` is bounded to coded ranges (float ∈ [0.05, 0.5] NEAR), `owner` is immutable and nothing moves funds; D-05's "can never move money" is corrected; the mainnet hub follows the same rules and is locked right after the clip (D-05, D-13, D-63).
> - **S-5 Simulator and demo (H-3, H-5):** simulated deposits ≤ $500 per session per day ($150 in demo sessions), inside the global faucet cap; new demo leases pass BotID and are limited per IPv4 address and per IPv6 /64; the reference Pot is read-only (its personas' keys are deleted); the nightly shared Pot can't be closed or have its rules changed; static security headers incl. CSP `frame-ancestors 'none'` (D-33, D-50).
> - **S-6 Login (M-1):** H-01 asks for a **dedicated** NEAR Auth client id (preferred); the ID token's OIDC `nonce` = base64url(sha256(device_pk ‖ server challenge)) and the server rejects a mismatch; the D-20 wrapper calls `/authorize` directly for login, because auth0-spa-js overwrites a caller's nonce (D-20, D-22).
> - **S-7 MPC deposit (fact fix):** the `sign` deposit is 1 yocto, proven on chain; no 2 NEAR reserve; relayer warn/critical 5/2 NEAR; the H-02 ask is ≈ 74 NEAR (D-21).
> - **S-8 CI:** a lockfile check enforces next ≥ 16.4.1, because `pnpm audit` can't see the advisory yet (D-40).
> - **S-9 KB:** "Review corrections (2026-10-21)" sections at the end of the affected KB files (testnet protocol 88; deployed Sputnik `update()` has no 2-week delay; NEAR Auth nonce and `sign` facts).
> - **S-10:** the low-effort Medium and Low fixes are applied (prepay for `member_count` votes, a 24 h close cooldown, top-ups for demo Pots only, `pending_device` sessions, pairing checks, names gated by `?i=`, Unicode Cf rejection, one USDC registration per account, expiry by the DAO's `submission_time`); the rest are deferred with owners (risk-register R-33).
>
> **Revision 5 (2026-10-21, the lead's answer to review-security §6 Q5; closes contracts-spec §12 Q10 and the pending item in risk-register R-33):**
> - **D-04: the rulebot loses `transfer:RemoveProposal`** in the day-1 policy. Sputnik's `RemoveProposal` deletes a proposal whatever its status, so the permission was a history-erasure power that widened the blast radius before the lock (review-security §3.5, §6 Q5, §7.3 #5).
> - **D-07, §8: `withdraw_request` (task C-19) moves to Phase 3** and is not built during the hackathon. It was already #2 in the cut order, and weeks 1-2 are overloaded (R-31); its Nov 10 PM slot goes to relief step 0 and the security tasks. The MVP already hides the Withdraw button, and requests expire after 7 days.
> - **Instead of withdrawing,** a requester who changes their mind can vote **Decline** on their own request, which counts toward rejection under the majority, as long as their own approval hasn't been cast. Under the D-61 default it is cast automatically and Sputnik votes are final (`ERR_ALREADY_VOTED`), so in practice the other members decide or the request expires.
> - **Adding withdraw later** needs new hub code (D-13) and, in each existing Pot, a voted `ChangePolicyAddOrUpdateRole` that gives the rulebot `transfer:RemoveProposal` back. That is acceptable for Phase 3.
> - **Also Phase 3, not built:** the `spend_withdrawn` event, the `ERR_NOT_REQUESTER` / `ERR_UNKNOWN_REQUEST` / `ERR_NOT_WITHDRAWABLE` errors, relayer rule R10, the `withdraw_request` intent and `FLAG_WITHDRAW`, and tests T-47/T-48. contracts-spec §3.6b keeps the method's spec and safety checks for later.
>
> **Revision 1 (2026-10-21, after the frontend-architecture objections):**
> - **Demo cast and limits** now follow [ux-spec.md](ux-spec.md): Maya, Sam and Leo; Trip per-person limit $200 (D-02, D-60, D-61).
> - **Invite links** carry the non-secret `?i=<invite_pk>` (D-08).
> - **New hub methods:** `propose_rules` (D-07b, §8) and `withdraw_request`. The latter is Phase 2, which adds `transfer:RemoveProposal` to the rulebot role (D-04).
> - **iOS:** a "Pair from Safari" fallback (D-21).
> - **New API routes:** notes and nudges. Covers are emoji-only (§8).
>
> **Revision 2 (2026-10-21, after the contracts-spec objections):**
> - **DAO float** is 0.05 NEAR. Each hub-created proposal pays its own storage in the same batch (D-05).
> - **`sync`** is called by the relayer after votes and after payout failures (D-05).
> - **Members are capped at 40**, and the close vote is relayed with 300 Tgas (D-09).
> - **The requester's own approval is cast automatically** by default (D-61, H-10).
> - **D-03 is resolved:** the mainnet clip uses the same creation pattern as testnet.
> - **Instant spends:** "Approved by Pot rules" shows when the `request_spend` tx returns, and the per-person limit counts instant spends only (D-07).
> - **New `reserve.<root>` account** for the supply, and a `preview.<root>` namespace (D-02).
> - **D-33:** the seeded state is fixed.
>
> **Revision 8 (2026-10-29, the HACKATHON.md update; see `kb/hackathon-rules.md`):**
> - Code since 2026-10-19 counts (Q-001).
> - Testnet-only projects are eligible (Q-010).
> - A LICENSE is required (Q-014).
> - One email may carry 2 submissions, and repos are unique.
> - The hosted demo should stay up to Nov 25 (Q-012).
> - The 1Click no-JWT fee is 0.2% (Q-006).
> - H-14 and H-15 are updated.
>
> **Revision 7 (2026-10-21, user answers):** H-02 handled by the agent (28.1 NEAR in `pot-funds-65k8.testnet`); H-04 Vercel Hobby; H-07 no domain (`*.vercel.app`, no email); H-17 custody only for mainnet keys.
>
> **Revision 3 (2026-10-21, after the consistency review; details in [review.md](review.md)):**
> - **§1 row 7 corrected:** onboarding costs ≈ 0.0085 NEAR **in total, including** the 0.00125 NEAR USDC storage deposit. The old wording counted the deposit twice ([accounts-onboarding.md](../kb/accounts-onboarding.md): 0.0071 + 0.00125 + 0.00019).
> - **D-05:** the testnet production and preview hubs both use `dao_float` = `min_dao_float` = 0.05 NEAR. The mainnet clip hub uses 0.1 NEAR (real NEAR, two Pots; contracts-spec §9.2).
> - **D-07b, D-09:** votes and `Finalize` on `call` proposals (close and rules) carry exactly 300 Tgas. Votes on Transfer proposals carry 100 Tgas.
> - **D-21:** the MPC `sign` deposit stays 2 NEAR per slot until a 1-yocto `sign` is proven (spike §C by Oct 25, else B-13 on Nov 8). The relayer's alert thresholds are derived from it (api-spec §3.5).
> - **D-33:** names the three kinds of demo Pot (reference, pool, shared) and their accounts. The shared fallback is a new Pot each night, pointed to by a DB row and never by an env var. A seeded Pot costs ≈ 0.12 NEAR.
> - **D-42:** the push pre-prompt in an Android Chrome tab before install stays off unless Cerasela opts in (H-10).
> - **D-60:** the Club and Team values live in contracts-spec §6 (proposed, Cerasela confirms).
> - **D-65:** the two Playwright contexts share one demo visitor cookie, so both act in the same leased Pot.
> - **§8:** adds the hub additions the specs made (`new`, `set_config`, `get_config`, `get_request`, four events), the `custom` preset rule, the preview-only `POST /api/session/dev` and a pointer to the supporting routes.
> - **§9:** adds H-13…H-16, which phase0-checklist proposed.

## 1. What Phase 1 changed

| # | Original plan said | Reality on 2026-10-21 | Evidence |
|---|---|---|---|
| 1 | Spike 1 might fail, which would mean design B | ✅ A single vote from the 1-of-1 `rulebot` role approves **and executes** NEAR transfers, FT transfers and `AddMemberToRole`, with bond "0" and 0 deposit. **Design B is dropped.** | [sputnik-dao.md](../kb/sputnik-dao.md), [contracts-patterns.md](../kb/contracts-patterns.md) (sandbox) |
| 2 | Sputnik creation costs ≥ 0.01 NEAR | The testnet factory `sputnikv2.testnet` is a legacy v3.31 build that copies 540 KB of code into each DAO, so a DAO costs **5.41 NEAR**. The testnet global code `Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD` (sputnikdao2@278adc7, mainnet-like API) costs **0.0121 NEAR** of storage plus a float. | sputnik-dao.md R1-R2 |
| 3 | `act_proposal(id, action)` | Mainnet v3.2 **requires** `proposal` (it must equal the stored kind) and rejects unknown args. The testnet legacy build ignores it. **Always send `proposal`.** `skip_execution` doesn't exist. | sputnik-dao.md R6 |
| 4 | Policy: member role plus a rulebot role with `add_member_to_role:*`, bond 0 | Three changes are needed:<br>• Set `quorum "1"` everywhere. Otherwise `Finalize` on an empty group executes an unvoted proposal (tested).<br>• Add `*:Finalize` / `transfer:Finalize`. This is the only retry for a failed payout.<br>• Grant explicit `add_member_to_role:AddProposal` + `:VoteApprove` instead of `:*`. | sputnik-dao.md R3, R8; [policy-hardened.json](../spikes/sputnik-rulebot/policy-hardened.json) |
| 5 | (implied) The DAO needs no NEAR | With bond 0, the DAO pays ~0.002-0.004 NEAR of storage per proposal from its own balance. With no float, `add_proposal` fails with `LackBalanceForState`. **Keep a 0.05 NEAR float, and the hub sends each proposal's storage cost in the same batch** (D-05, Rev 2). | sputnik-dao.md R9, contracts-spec.md |
| 6 | `pot-factory.pot-<team>` creates `<slug>.rulebot.pot-<team>` | Impossible: only the direct parent can create `x.parent` (`CreateAccountNotAllowed`). Instead, one **Pot Hub** contract acts as both Rulebot and factory. | contracts-patterns.md |
| 7 | The user attaches 1 yocto from a funded account; 0.05 NEAR per user | **The relayer pays every deposit inside a delegate**, including the 1 yocto, so an unguarded relayer is a faucet. Users need **0 NEAR** (NEP-448). Onboarding costs ≈ **0.0085 NEAR** in total, including the 0.00125 NEAR USDC storage deposit (Rev 3). | [meta-tx-relayer.md](../kb/meta-tx-relayer.md), [accounts-onboarding.md](../kb/accounts-onboarding.md) |
| 8 | Relayer allowlist: pot-factory, rulebot.*, usdc | Must also allow the Pot DAOs (`act_proposal`) and the user's own account (`AddKey`), and cap method, args, deposit and gas. A relayed tx's top-level status hides inner failures, so **scan the receipts**. | meta-tx-relayer.md |
| 9 | NEAR Auth login, gasless via relayer | Works on testnet, with these problems:<br>• **Every signature** costs an Auth0 popup, an approval form and ~9 s of MPC.<br>• The shared testnet client only accepts the callbacks `http://localhost:3000` and `https://example.fast-auth.com`.<br>• There's no Apple and no email OTP ("email" means email + password).<br>• The SDK is poor. | [near-auth.md](../kb/near-auth.md) |
| 10 | near-connect 0.8.2 | It's 0.11.4. On testnet only Meteor, Intear, Ledger and NEAR CLI can `signDelegateActions`. | [near-connect.md](../kb/near-connect.md) |
| 11 | 1Click: JWT needed or +0.25% without; 1-3 min; "send exactly X" | • No JWT is needed; the observed fee is ~1 bp.<br>• 1Click registers USDC storage itself.<br>• Median deposit time is 18-84 s.<br>• Use **FLEX_INPUT** rather than "send exactly X".<br>• Only Base, Arbitrum, Ethereum and Solana are live.<br>• SUCCESS means the money reached the member's account, not the Pot, so the stepper needs a 5th step. | [intents-1click.md](../kb/intents-1click.md) |
| 12 | Every Pot opens in Trezu | Trezu is **mainnet-only**. It shows any mainnet Sputnik DAO by id. Its "required approvals" count is wrong for our two-role policy. | [trezu.md](../kb/trezu.md) |
| 13 | One worker + an indexer feeding Postgres; Prisma | Neither is needed for the MVP:<br>• The relayer sees every outcome.<br>• Clients poll view methods, which meets P-4 (≈ 3.3 s after finality).<br>• The FastNEAR Tx API gives history.<br>Testnet has no free real-time block stream. Use **Drizzle**, not Prisma: `npm i prisma` installs the Prisma 8 RC CLI, which has no `generate`. | [backend-infra.md](../kb/backend-infra.md) |
| 14 | vaul sheets; serwist service worker | • vaul is unmaintained, so use the shadcn Drawer on **Base UI**.<br>• Serwist breaks the Turbopack build, so use `app/manifest.ts` + a hand-written `sw.js`.<br>• next 16.0.0-16.4.0 has a **critical RCE**, so require next ≥ 16.4.1. | [frontend-stack.md](../kb/frontend-stack.md), [pwa-push.md](../kb/pwa-push.md) |
| 15 | A team-deployed "USDC (test)" | Confirmed:<br>• `usdc.fakes.testnet` is griefable (anyone can burn anyone's balance).<br>• Circle's testnet faucet gives only 20 USDC per 2 h. | [fungible-tokens-usdc.md](../kb/fungible-tokens-usdc.md) |
| 16 | Submit any time before Nov 13 | • The API accepts submissions **only from Nov 1 00:00 to Nov 14 23:59 UTC** and returns 403 outside that window.<br>• The AI judges are Claude Code and Codex.<br>• The criteria include **sustainability**.<br>• The `idea` text must be written by a human.<br>• Agents must never push, make repos public, post, sign txs, deploy to mainnet or submit without explicit human confirmation. | [hackathon-rules.md](../kb/hackathon-rules.md) |
| 17 | Demo numbers | • A $50 instant cap makes the $84 instant demo impossible.<br>• The $400 boat request exceeds the $366 left.<br>• Use $, not €.<br>• Say "the group" rather than "organizers": the policy is a member majority. | [ux-spec.md](ux-spec.md) |
| 18 | "The niche is empty" | Cash App Pools, PayPal pooling, Revolut, Venmo and Monzo all exist, but every one of them pays out to one owner or only tracks debts. Pot's angle is no single owner, rules-based approvals and pro-rata refunds. The name "Pots" collides with PotLock. | [competitors-ux-patterns.md](../kb/competitors-ux-patterns.md) |

## 2. On-chain

- **D-01 Decided: design A.** Each Pot is a Sputnik DAO. Members vote by majority. A `rulebot` role (1/1) held by our contract auto-approves small spends and invite joins.
- **D-02 Default: a singleton "Pot Hub" contract that is both Rulebot and factory.**
  - One contract holds rules, contributions, requests and invites for every Pot, with state keyed by DAO account id.
  - It creates each DAO as its own direct sub-account.
  - Default account map, with `<root>` (the team root) to be named by a human (H-05):

    | Role | Account |
    |---|---|
    | Hub | `pots.<root>` |
    | DAO | `<slug>.pots.<root>` |
    | Test token | `usdc.<root>` |
    | Demo-dollar supply | `treasury.<root>` |
    | Relayer and parent of all user accounts | `users.<root>`, which creates `u-<id>.users.<root>` |
    | Demo personas | `maya.users.<root>`, `sam.users.<root>`, `leo.users.<root>` |

  - Reserve slugs such as `api`, `demo`, `www`.
  - Preview and production environments use separate hub and relayer accounts, under a `preview.<root>` namespace.
  - A cold `reserve.<root>` holds the test-dollar supply, and the hot `treasury.<root>` holds what the faucet hands out.
  - Keep `<root>` to **≤ 10 characters** so nested names stay within the account-id limits.
  - [accounts-and-deploy.md](accounts-and-deploy.md) finalizes the map.
- **D-03 Default: DAO code comes from a global contract by hash.**
  - The hub creates `<slug>.pots.<root>` in one batch: `CreateAccount`, `Transfer(float)`, `UseGlobalContract(Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD)`, `FunctionCall new({config, policy})`. Then it pays the DAO's USDC `storage_deposit`.
  - Cost ≈ 0.0121 NEAR plus the float (D-05).
  - Don't use the legacy `sputnikv2.testnet` (5.41 NEAR per DAO, v3.31 API).
  - **Mainnet clip (Phase 2), resolved: use the same pattern** with mainnet's Sputnik global code.
    - Trezu's source loads any DAO by id. Only its balance tracking skips ids outside `.sputnik-dao.near`, so "View in Trezu" deep-links to `/requests`, which works.
    - Moving to the official factory, for a full Trezu dashboard, is a Phase 3 option.
    - Details: [contracts-spec.md](contracts-spec.md).
- **D-04 Decided: the hardened policy.** Start from [policy-hardened.json](../spikes/sputnik-rulebot/policy-hardened.json):
  - **member** role: Group, `*:AddProposal`, `*:VoteApprove`, `*:VoteReject`, `*:Finalize`; default vote policy majority `[1,2]` RoleWeight with `quorum "1"`.
  - **rulebot** role: Group `[pots.<root>]`, threshold `[1,1]`, `quorum "1"`. Permissions:
    - `transfer:{AddProposal,VoteApprove,Finalize}`. (Rev 5: no `RemoveProposal`; `withdraw_request` is Phase 3, D-07.)
    - `add_member_to_role:{AddProposal,VoteApprove}`.
    - **`call:AddProposal`**, needed for D-09 close and D-07b `propose_rules`. Never `call:VoteApprove`.
    - The permissions ship in the policy from day 1, because changing the policy later needs a vote.
  - Other parameters: `proposal_bond "0"`, `proposal_period` 7 days. Config metadata is `""` or base64 JSON (Trezu-safe).
  - Never leave a Group role empty.
- **D-05 Decided: the hub code is the only guard.** Sputnik enforces no caps, so the hub must:
  - Authorize only by `predecessor_account_id`. Under NEP-366, `signer_account_id` is the relayer.
  - **Rev 4 (review-security C-1): pay only for relayed calls.** Relayer quotas are not a security boundary for hub NEAR, because every hub method can be called directly. The hub sponsors costs (DAO creation and float, USDC registration, per-proposal storage, new state) **only when `env::signer_account_id()` is one of the configured relayer accounts** (`config.relayers`, set by `new` and `set_config`; `[]` on mainnet). That stays sound under NEP-366: the signer is the relayer, while authorization still uses the predecessor. Any other caller must attach a deposit ≥ the cost, or the call fails with `ERR_DEPOSIT_REQUIRED`; the hub keeps the cost and refunds the excess.
  - **Rev 4 on-chain caps:** 3 Pots per creator account per UTC day; 50 sponsored Pots per UTC day globally (`limits.max_sponsored_pots_per_day`, `ERR_GLOBAL_DAILY_LIMIT`); at most one open rules proposal per Pot (`ERR_RULES_PENDING`); at most one open close proposal per Pot (`ERR_CLOSE_IN_PROGRESS`, plus a 24 h cooldown for a proposer whose close was rejected, `ERR_CLOSE_COOLDOWN`). Seeding scripts that don't go through the relayer, the CLI runbook and the mainnet clip attach deposits.
  - Vote only on proposals it created in the same call chain.
  - Approve `AddMemberToRole` only for role `member`.
  - Always pass `proposal` (the kind) to `act_proposal`.
  - Check that the payee is registered with USDC before proposing.
  - Re-read the proposal status after acting, because the payout runs as a detached promise and can end `Failed` while the callback sees Ok.
  - Expose a `Finalize` retry.
  - Keep a **0.05 NEAR** float in each DAO. On top of that, **every hub-created proposal sends its own storage cost to the DAO in the same batch**, so the float never runs down.
    - Rev 3: the testnet production and preview hubs are both initialized with `dao_float` = `min_dao_float` = 0.05 NEAR. The mainnet clip hub uses 0.1 NEAR (contracts-spec §9.2).
    - Rev 4: the prepay covers a vote by every member (`member_count`), and the backstop top-up refills only demo and reference Pots.
  - `sync(pot, proposal_id)` and `retry_payout` can be called by anyone. The relayer calls `sync` after every relayed vote and whenever it sees a payout fail. Re-reading the status confirms the vote, not the payout.
  - **Rev 4, corrected (review-security H-4):** the old line "the owner's `set_config` … can never move money" was false. **Before the Nov 12 lock, the holder of the hub's full-access key (with the owner key) can do anything**: redeploy the hub, approve transfers in every DAO as the rulebot, push DAO code as the factory. That is exactly why the lock exists (D-13) and why those keys never sit where agents run (D-63). After the lock, the owner's `set_config` can change only the float (within [0.05, 0.5] NEAR), the limits (each within a range fixed in code), the relayer list (≤ 4) and the pause switch; `owner` is immutable; it has no path to move USDC or NEAR to any account. Its only indirect reach is the bounded sponsored float (contracts-spec §3.10, risk-register R-32).
- **D-06 Decided: contributions.**
  - The member sends a relayed `usdc.ft_transfer_call({receiver_id: "pots.<root>", amount, msg: "{\"pot\":\"<dao_id>\"}"})` with **≥ 100 Tgas**. Below 35 Tgas, the money silently bounces back.
  - The hub's `ft_on_transfer`:
    1. checks the predecessor is the USDC contract, the Pot is open and the sender is a member;
    2. records the contribution;
    3. forwards to the DAO with `ft_transfer`;
    4. returns the unused amount, so a failed forward refunds automatically (tested).
- **D-07 Decided: spends.**
  - The member sends a relayed `pots.request_spend(...)` with 100-150 Tgas.
  - **Under the cap and within budget:** a parallel pre-check (DAO balance, payee registration, live member list) → `add_proposal(Transfer)` → callback → `act_proposal(VoteApprove, proposal)` → status check. This is ≈ 30 Tgas over ~8 receipts.
    - The UI shows "Approved by Pot rules" as soon as the relayed tx returns (~3 s), and "Sent" once the payout is confirmed.
    - The per-person limit counts **instant spends only**, so the copy reads "spend up to $X without asking".
  - **Otherwise:** `add_proposal` only. Members then vote directly on the DAO with a relayed `act_proposal` (`VoteApprove`/`VoteReject`).
  - Memo text stays **off-chain** in the DB, because on-chain text is public. The on-chain description carries only the category and a request ref.
  - **Withdraw: Phase 3, not built during the hackathon (Rev 5; the MVP already hides the button).**
    - The planned `pots.withdraw_request(pot, request_id)` (original requester only, while the request is in progress; contracts-spec §3.6b) calls `act_proposal(RemoveProposal)`, which needs a permission the day-1 policy no longer grants (D-04). Adding it later needs new hub code (D-13) and, in each existing Pot, a voted `ChangePolicyAddOrUpdateRole` that gives the rulebot `transfer:RemoveProposal`.
    - Until then, a requester who changes their mind can vote **Decline** on their own request like any member; it counts toward rejection under the majority. That works only while their own approval isn't cast: under the D-61 default it is cast automatically, and Sputnik votes are final (`ERR_ALREADY_VOTED`), so the other members decide or the request expires after 7 days.
- **D-07b Default: rule changes.** A member calls `pots.propose_rules(pot, rules)`. The hub adds a DAO `FunctionCall` proposal that calls `pots.set_rules(pot, rules)`, and members vote by majority (P-8). A sole member can call `set_rules` directly. This keeps the relayer allowlist free of member-created DAO proposals.
  - Rev 3: votes and `Finalize` on these `call` proposals carry exactly 300 Tgas, the same as close (D-09). Votes on Transfer proposals carry 100 Tgas.
- **D-08 Default: invites are ed25519 keypairs, multi-use and rotatable.** This replaces P-3's one-time code.
  1. A member's browser generates an invite keypair, and the hub stores the public key with an optional expiry and max uses.
  2. The link is `/j/<slug>?i=<invite_pk>#<secret>`. The public key in `?i=` is not secret: it lets the server render "{inviter} invited you" and check the invite is valid. The secret is in the fragment, which never reaches a server.
  3. The joiner signs a domain-separated message (pot + their account) with the invite secret.
  4. A relayed `pots.join(...)` verifies it with `env::ed25519_verify`, then `AddMemberToRole(member)` is auto-approved.
  This can't be front-run, and one link can be shared in a group chat.
  - **Rev 4 (review-security H-1): a link is a bearer pass**, because joining grants a vote. Defaults: the link made at creation, and any `add_invite` without arguments, expires after **7 days** with **10 uses**; `add_invite` accepts at most 30 days and 40 uses. Any member can make a new link at any time, and the Share sheet shows when it stops working and how many joins are left. The copy says to share it only in the group chat. Every member gets a push when someone joins.
  - **Rev 4 default (Cerasela's call, H-10):** a new member can vote at once, but **instant spends need `contributed > 0`**; before that, a request goes to the group with reason `new_member`.
- **D-09 Default: close-out is one atomic proposal.**
  1. A member calls `pots.propose_close(pot)`.
  2. The hub computes the pro-rata amounts on-chain: `balance × contribution_i / total`, floored, with the dust going to the last contributor.
  3. It adds **one DAO `FunctionCall` proposal to the USDC contract** with one `ft_transfer` action per member (≤ 100 actions per receipt; 30 members ≈ 61.5 Tgas).
  4. The members' majority approves it. Pots are capped at **40 members**, and the relayer gives the final close vote **300 Tgas**. 200 Tgas covers only about 34 members.
  The hub blocks new contributions and spends from the moment a close is proposed. `sync` marks the Pot closed once the proposal is Approved.
- **D-10 Decided: events.** The hub emits NEP-297 events (`standard: "pot"`, `version: "1.0.0"`) on every state change. Sputnik emits none, so poll its `get_proposals`.
- **D-11 Decided: the test token.**
  - Our own NEP-141 "USDC (test)", 6 decimals, from the near-examples/FT reference contract, deployed at `usdc.<root>` (≈ 2.2 NEAR).
  - Mint the whole supply to `treasury.<root>`. A rate-limited `/api/faucet` hands out "Demo dollars (testnet)".
  - No public `mint`.
  - Rev 4: the token account's key is deleted on **Nov 2**, right after the mint and the move to `reserve` (D-13).
- **D-12 Decided: toolchain pins.**
  - Rust `1.93.0` (in `rust-toolchain.toml`). `near-sdk` and `near-contract-standards` `=5.29.1`. `near-workspaces` `=0.23.0`. cargo-near 0.22.0, built with `cargo near build non-reproducible-wasm`. near-cli-rs 0.30.1.
  - Don't adopt the October RCs: they target protocol 88, while mainnet is on 86.
  - Vendor the exact deployed Sputnik wasm with hashes (the testnet global `Ea8t…` and mainnet v3.2) and a fetch script; the repo no longer ships `res/`.
  - The near-workspaces sandbox works on arm64 Macs but **not Intel Macs**.
- **D-13 Default: lock and upgrade.** Keep the hub's full-access key until **Nov 12**, then delete it (the README shows `list-keys`). If a bug is found after that, redeploy as `pots-v2`. A DAO-governed upgrade is Phase 3.
  - **Rev 4 (review-security H-4):** lock the test token `usdc.<root>` **on Nov 2**, right after the deploy, the mint and the move to `reserve` (C-05): it has no admin method, and a token bug means `usdc2` + `pots-v2` anyway. Until the hub lock, its key lives only in the custody account (D-63), and the cron alerts on any tx the hub signs outside a planned deploy. The **mainnet clip hub** follows the same rules (`relayers: []`, custody) and is locked, or its account deleted, right after the clip (Nov 11), once the clip Pots are closed.

## 3. Accounts, login and keys

- **D-20 Default: login.**
  - Use NEAR Auth through a ~40-line wrapper over `@auth0/auth0-spa-js`, not the official SDK (broken types, 205 MB of react-native, logged out on reload).
    - Rev 4 (review-security M-1, F-15): the wrapper must pass a custom OIDC `nonce` that binds the ID token to the device key (D-21), and auth0-spa-js 2.28.4 overwrites a caller's nonce. So the **login** calls `/authorize` directly (Authorization Code + PKCE, `nonce = base64url(sha256(device_pk ‖ server challenge))`) and exchanges the code itself; signing approvals keep auth0-spa-js (the `fatxn` claim binds them). Tasks B-20 and F-27; required before NEAR Auth is enabled on any hosted origin.
  - The testnet methods are Google and email + password (plus passkeys where the tenant offers them). Apple isn't available on testnet.
  - Show "I have a NEAR wallet" (NEAR Connect) in small text.
- **D-21 Default: a NEAR Auth root key plus a device key.**
  1. On first login, the server verifies the Auth0 ID token (JWKS).
  2. It derives the MPC public key with `v1.signer-prod.testnet.derived_public_key({path: "jwt#https://login.testnet.fast-auth.com/#" + sub, predecessor: "fast-auth.testnet", domain_id: 1})`.
  3. It creates `u-<id>.users.<root>` with **two full-access keys**: the MPC key (recovery) and the browser's **device key**, held in WebCrypto Ed25519, non-extractable, in IndexedDB. Use a fallback where WebCrypto Ed25519 isn't supported.
  4. Bind the device key to the session with proof of possession.
     - Rev 4 (review-security M-1): also bind the **ID token** to the device key with the OIDC `nonce`: nonce = base64url(sha256(device_pk ‖ server challenge)), the challenge coming from `GET /api/session/challenge`. The server rejects a token whose nonce doesn't match, so a leaked token can't open a session for another device key. A session whose device isn't on chain yet (`pending_device`) can only read, add its device and log out.
  - Everyday actions: the device key signs a delegate locally (no popup), which goes to `/api/relay`.
  - **New device, or iOS Home Screen install** (Safari and the installed PWA don't share storage; only cookies are copied): "Confirm it's you" → NEAR Auth popup → MPC signs `AddKey(new device key)` → relayed.
  - **Fallback: "Pair from Safari".** Use this if the device test shows the NEAR Auth popup failing inside an installed iOS PWA (unproven; spikes/near-auth checklist §D).
    1. The PWA generates its key and shows a pairing link or code.
    2. Safari, which already holds a device key, signs `AddKey(PWA key)`.
    3. The relayer submits it.
  - The relayer verifies the JWT off-chain before paying ~0.0045 NEAR per sign, and (rev4, L-7) recomputes `derived_public_key(sub)` to check it still equals the stored MPC key.
    - **Rev 4 (fact fix, review-security F-6): the `sign` deposit is 1 yocto.** It is proven on chain: testnet `sign` tx `FzULQ33cjnR4HFc9iBGzR5V8oScLhJuUKAHqeixjFgLE` (2026-09-26) attached 1 yocto and logged "MPC signing successful", and `fast-auth` refunds the deposit on every path. `MPC_SIGN_DEPOSIT_YOCTO = 1`, and **no 2 NEAR per slot is reserved**. The relayer's thresholds become warn/critical 5/2 NEAR (api-spec §3.5), and the H-02 ask drops to ≈ 74 NEAR. The manual spike's §C stays as a confirmation, not a blocker. (Rev 3 kept 2 NEAR per slot until this was proven.)
- **D-22 Human, start now: the NEAR Auth origin whitelist.**
  - Ask NEAR Auth / Peersyst for a **dedicated testnet client id** for our origins (rev4: preferred, because any origin on the shared client could replay its users' ID tokens to us, review-security M-1). A whitelist on the shared client is the fallback; then production accepts the shared client only with the nonce binding (D-21) live, and the residual is accepted for testnet only. Also submit the mainnet Typeform.
  - These fallbacks always ship:
    - (a) `/demo` personas with server-held testnet keys: server-rendered, clearly labeled, the canonical judge path;
    - (b) NEAR Connect: gasless with Meteor, Intear, Ledger or NEAR CLI; other wallets pay their own testnet gas.
  - If we have no whitelist by **Nov 8**, the hosted app offers (a) + (b), and the video shows NEAR Auth on `localhost:3000`.
- **D-23 Decided: user accounts.**
  - Named sub-accounts created by the relayer (`CreateAccount` + `AddKey`×2) with 0 NEAR.
  - USDC `storage_deposit` is paid by the relayer in parallel.
  - Display names and avatars live off-chain.
  - NEAR Connect users keep their own account. The relayer pays their USDC registration on first use.
- **D-24 Decided: our own relayer, `/api/relay`** (Node runtime).
  1. Decode the `SignedDelegate`.
  2. Validate before submitting: allowlist (receiver, method, args), deposit caps (**1 yocto only for `usdc.ft_transfer_call` with `receiver_id = pots.<root>`**, 0 everywhere else), gas caps, expiry window, nonce, key permission, local signature check, and per-user and global daily quotas (atomic in Postgres).
  3. Submit through a **key pool** on `users.<root>`.
  4. Return the outcome per receipt.
  - **Receivers:** `pots.<root>`, `usdc.<root>`, DAOs matching `*.pots.<root>` (`act_proposal` with `VoteApprove` / `VoteReject` / `Finalize`), and the sender's own account (`AddKey` only).
    - **Rev 4 (review-security H-2):** DAO votes and `Finalize` are relayed **only for proposals the hub created** and still tracks as live (hub view `get_proposal_subject(pot, proposal_id)`), and **only for members of that Pot**. Gas is exactly 100 Tgas for votes on Transfer (and join) proposals and exactly 300 Tgas for votes on `call` proposals (close, rules). `Finalize` (and `retry_payout`) at most 3 per proposal per UTC day. Members' own DAO proposals are shown read-only, never relayed.
  - Store secrets in Vercel sensitive env vars, with separate preview and prod relayer accounts, a low-balance alert, and a global daily cap.
    - **Rev 4:** plus a **per-user daily NEAR budget** (`relay_yocto` 0.2 NEAR for the relayer's gas, `hub_yocto` 0.3 NEAR for the hub's sponsored cost) and a global `hub_yocto` cap, on top of the existing global `relay_yocto` cap and alerts. The relayer never attaches a deposit to a hub call.

## 4. Backend and data

- **D-30 Default: hosting.**
  - Vercel, region `iad1`. Next.js route handlers and **Vercel Workflow** (1Click polling, demo-pool refill), plus `after()` for notification fan-out.
  - No always-on worker and no indexer.
  - The **plan tier is a human call (H-04).** Hobby can only deploy a public repo on a personal account (or a private one where only the owner's commits deploy), is non-commercial and runs crons daily at most. Pro covers both teammates.
- **D-31 Decided: the database.**
  - Neon Postgres (Free) + Drizzle `0.45.4` (pinned) + `pg`.
  - The chain is the source of truth. The DB holds:
    - users (auth `sub` ↔ account) and devices
    - push subscriptions and Telegram links
    - profiles
    - invite metadata (never secrets)
    - request memos
    - deposit intents
    - relay log
    - quotas
    - pot cache
    - the demo pool
- **D-32 Decided: reads.**
  - Browsers read the chain directly with an RPC failover list: `https://rpc.testnet.fastnear.com`, then dRPC.
  - **Never `rpc.testnet.near.org`**: it is deprecated, adds +3 s and answers 429.
  - Poll every 3 s while the page is visible. Use the FastNEAR Tx API (`tx.test.fastnear.com`) for history and receipt links.
- **D-33 Default: the demo pool.** Judges need deterministic README steps and must not collide with each other.
  - Keep a **pool of pre-seeded demo Pots**. Each has fresh Maya, Sam and Leo personas and is seeded at the moment right after Leo joins: **$450 from 3 members, no spends yet**. That is the state the README steps start from.
  - Each visitor session leases one Pot. A Workflow refills the pool.
  - Fall back to a shared Pot that is reset nightly.
  - Budget ≈ 0.1 testnet NEAR per demo Pot, using the 0.05 float. [api-spec.md](api-spec.md) specifies the design.
  - **Rev 3: the three kinds of demo Pot.** Every doc uses these names ([api-spec.md](api-spec.md) §7.2 is the detailed spec):

    | Kind | Pot | Personas | Who acts | Lifetime |
    |---|---|---|---|---|
    | **Reference** | `lisbon-trip.pots.<root>` (env `DEMO_REFERENCE_POT`) | `maya`, `sam`, `leo` `.users.<root>` | nobody through the API | permanent, never leased: the README CLI twins and the `/demo` snapshot read it |
    | **Pool** | `lisbon-<k>.pots.<root>` | `maya-<k>`, `sam-<k>`, `leo-<k>` `.users.<root>` | the visitor who leased it | leased for 2 h (up to 8 h), then retired |
    | **Shared** (fallback) | `lisbon-<yyyymmdd>.pots.<root>` | `maya`, `sam`, `leo` `.users.<root>` | anyone, when the pool is empty | a new Pot each night (04:00 UTC cron), pointed to by a `demo_pot` DB row, never by an env var |

    - A seeded Pot costs ≈ 0.12 NEAR (contracts-spec §8.4: hub ≈ 0.079 incl. two joins, relayer ≈ 0.038), close to the ≈ 0.1 budget.
  - **Rev 4: demo hardening (review-security H-3, H-5).** The table above changes in two places: the **reference** Pot is read-only for everyone, because its personas' only key is deleted after seeding (and the API refuses any demo intent naming it, before any other check); the **shared** Pot gets fresh `maya-<k>`/`sam-<k>`/`leo-<k>` personas each night, can't be closed or have its rules changed through the API, and is reseeded when it falls below $300 or isn't Open. Also:
    - a new lease passes BotID (no-JS posts get the read-only `/demo?ro=1`, which AI judges can read) and is limited to 10 a day per IPv4 address and per IPv6 /64;
    - demo quotas are keyed by visitor and by IP net; `demo_yocto` includes the hub's costs;
    - the 1Click simulator delivers at most $150 per demo visitor per day;
    - every route sends static security headers, incl. CSP `frame-ancestors 'none'`, so the Approve screen can't be framed.

## 5. Frontend

- **D-40 Decided: pinned versions.**
  - next `16.4.2` (≥ 16.4.1 for the RCE fix), react and react-dom `19.3.1`, TypeScript `5.9.3`, ESLint 9.
    - Rev 4 (review-security M-8): CI asserts `next ≥ 16.4.1` from the lockfile (check SEC-1), because GHSA-673q-mjm6-r5xr isn't in the npm advisory database yet, so `pnpm audit` alone would pass a downgrade. No `'use cache'` function returns typed arrays.
  - Tailwind 4.3.x, shadcn CLI 4.22.x (Base UI), sonner 2.0.x, motion 14.4.x, TanStack Query 5.104.x.
  - react-hook-form 7.90 + zod 4.6.
  - near-api-js `7.3.1`, @hot-labs/near-connect `0.11.4`, near-connect-hooks `1.1.6`.
  - pnpm 11 (packages with install scripts need `allowBuilds`). Node ≥ 22.22.2.
- **D-41 Decided: bottom sheets** use the shadcn Drawer on Base UI, not vaul. Sheets with inputs add `VirtualKeyboardProvider`.
- **D-42 Decided: the PWA.**
  - `app/manifest.ts` and a hand-written `public/sw.js` that handles only push and notification clicks: no fetch handler, no Serwist.
  - Push payloads use Declarative Web Push JSON.
  - Ask for push permission only after install, with a reason.
    - Rev 3: this also applies to Android Chrome tabs, where Web Push would work before install (frontend-architecture O10). Cerasela may opt in by Oct 25 (H-10, phase0-checklist §5 #18).
  - Keep near-api-js off first-load routes (it adds ~58 KB brotli).
- **D-43 Default:** Cache Components stay **on**, so every page that reads `params` must sit inside `<Suspense>`. A human can flip this by Nov 1.
- **D-44 Decided: i18n.** A typed `t()` over `en.json`, plus a two-layer jargon lint: a script over `en.json` and an ESLint rule. A prototype exists, but it is throwaway and gets rewritten during the event.
- **D-45 Decided (rev6, brand): type.** **Gabarito** for display (balances, Pot names, headings; the wordmark ships as outlines) and **Figtree** for text. This replaces Geist and Inter.
  - Both load through `next/font/google`, self-hosted with `display: swap`. In next 16.4.2 both are variable fonts (Gabarito wght 400-900, Figtree wght 300-900; subsets latin and latin-ext).
  - **Tabular figures, verified 2026-10-21:** both fonts have the OpenType `tnum` feature in the woff2 files next/font serves (fontTools). Both have proportional default figures, so every amount needs `tabular-nums`, which `MoneyText` adds.
  - Support Dynamic Type with `html { font: -apple-system-body }`.
  - Details and evidence: [brand/README.md](../brand/README.md) §5.

## 6. Integrations

- **D-50 Default (Phase 2): 1Click.**
  - Quote parameters: `FLEX_INPUT`, slippage 100 bps, `recipient` = the member's NEAR account, `refundTo` = the member's NEAR account with `refundType: INTENTS`, a 2 h deadline, `referral: "pot"`.
  - Chains: Base, Arbitrum and Solana, plus Ethereum marked "slower". Hide paused chains using the Shield status JSON.
  - A Workflow polls `/v0/status`.
  - On SUCCESS, push "Your $X arrived. Add it to the Pot", where one tap sends a relayed `ft_transfer_call`.
  - The stepper has 5 steps and shows "Taking longer" at 5 min.
  - The JWT is optional and server-side only.
  - Testnet uses a labeled simulated deposit with the same response shapes, and its QR reads "DO NOT SEND".
    - Rev 4 (review-security H-3): the simulator is capped: ≤ $500 per quote and per session per UTC day, **≤ $150 in demo sessions**, and every simulated delivery counts toward the global daily faucet cap. Before this, one demo visitor could empty the $1M hot treasury.
- **D-51 Decided: notifications.**
  - Web push: `web-push` 3.6.7 (VAPID) on the Node runtime, payloads ≤ 2.5 KB, Declarative Web Push JSON.
  - Email: Resend, which needs a domain (H-07).
  - Telegram: a plain bot using grammY. It is Phase 2 and the **first item to cut**.
- **D-52 Decided: Trezu.**
  - Show "View in Trezu" (`https://trezu.app/<dao>/requests`) **only for mainnet Pots**.
  - On testnet, show a NEAR explorer link and an in-app "On-chain rules" panel. The README uses `get_policy`.
  - List Trezu's wrong approval count in the README's limitations.

## 7. Product, demo and process

- **D-60 Default: presets.** These follow ux-spec.md, and Cerasela confirms the numbers.
  - **Trip**: instant ≤ **$100**, per-person limit **$200**, instant payouts only to members, majority for everything else.
  - Rev 4 default, every preset (D-08): instant spends need the requester to have put money in (`contributed > 0`); Cerasela confirms (H-10).
  - **Club** and **Team**: values proposed in contracts-spec.md §6 (Cerasela confirms, H-10). ux-spec.md shows both as "coming soon" in the MVP.
  - Use $ everywhere and say "the group".
- **D-61 Default: the demo script.** This follows ux-spec.md §6.
  1. The Lisbon Trip Pot with **Maya, Sam and Leo**. Maya and Sam have each put in $150; **Leo joins from the invite** and adds $150, so the Pot holds $450.
  2. Maya's $84 groceries are approved instantly.
  3. A $300 boat request needs 2 of 3.
     - **Default: the requester's own approval counts and is cast automatically.** The client relays `act_proposal(VoteApprove)` right after `request_spend` returns the proposal id.
     - That way the README's "Leo approves → it executes" step works with 3 members.
     - If Cerasela or P1 override this (H-10), the README needs two approvers.
  4. Close returns $22 to each person.
  - The README's seeded state is the moment right after Leo joins: $450 and 3 members.
  - Covers are emoji + gradient only. There are no uploads in the MVP.
- **D-62 Decided (rev6): the product name is "Pot".** The brand sets a lowercase wordmark, "pot". "Pot" is a common word (PotLock's "Pots" on NEAR, Collctiv pots, Monzo Shared Pots), so the mark carries recognition and always appears with the name (D-67). The unique submission `projectName` is a human item (H-14).
- **D-63 Decided: hackathon process.**
  - The repo is created fresh on Nov 1. This folder's `kb/` and `plan/` may be copied in as docs; `spikes/` never.
  - Submit on Nov 13. The API only opens on Nov 1.
  - The `idea` field is written by a human.
  - Agents ask for explicit confirmation before they push, make the repo public, post, sign any transaction (testnet included) or submit.
  - **Rev 4 key custody (review-security H-4):** the hub, root, reserve and treasury full-access keys (and every other full-access key the team holds, except the Vercel hot keys) are **never stored on disk in the macOS user account that runs AI coding agents**. They live in a separate macOS user, on a hardware wallet, or in the password manager with import-on-demand, and are removed after use. Signing runs in that custody account's terminal. Agents only ever get the **preview relayer keys**, through env vars (H-17, accounts-and-deploy §1.5).
  - The README follows "do X → see Y" and adds a costs/sustainability section.
  - `/demo` is server-rendered, so AI judges can read it without logging in.
- **D-64 Default: repo layout.** One pnpm workspace:

  | Path | Contents |
  |---|---|
  | `apps/web` | Next.js: UI + route handlers + workflows |
  | `contracts/` | Cargo workspace: `pot-hub`, `test-usdc` (reference FT), `tests/` (near-workspaces) |
  | `contracts/res/sputnik/` | vendored wasm + `SHA256SUMS` |
  | `packages/pot-sdk` | typed TS client for hub/DAO/USDC views and actions, shared by web and scripts |
  | `scripts/` | deploy and seed |
  | `docs/` | KB and plan |

- **D-65 Decided: test strategy.**
  - Contract tests in near-workspaces against the vendored Sputnik builds (both of them).
  - Property tests for the pro-rata math.
  - Playwright with two contexts (Maya, Leo) on testnet via demo personas, plus axe and CDP `Page.getInstallabilityErrors`. Rev 3: the two contexts share one demo visitor cookie, so both act in the same leased Pot (test-plan §5.2).
  - CI on GitHub Actions pinned to `ubuntu-24.04` with Rust 1.93.0 (`ubuntu-latest` moves to 26.04 during the event; Rust 1.100 ships Nov 12).
- **D-66 Default: roles.**
  - **P1:** contracts, relayer, onboarding, API.
  - **P2 (Cerasela):** UX, frontend, PWA, design system, video.
  - Both work with Claude Code against `CLAUDE.md` and this plan.
- **D-67 Decided (rev6): brand and design system.** Cerasela made the logo and the system with Claude.
  - **Source of truth:** the Design System artifact `https://claude.ai/artifact/TfPiy6PHkWTSZsR2wDxwWN` and `brand/` (logo, web assets, explorations, [brand/README.md](../brand/README.md)).
    - The tokens live in `brand/tokens.json`, an exact copy of the artifact's.
    - The app generates its CSS variables from that file (frontend-architecture §7.1) and never invents colours.
  - **Themes:** Day and Night are both in scope.
    - Day is the default and the identity. Night follows `prefers-color-scheme: dark`, and people can override it in You → Settings.
    - `data-theme` sits on `<html>`, set by an inline head script before first paint.
  - **Colour rules:**
    - One marigold (`brand`) button per screen, with eggplant `on-brand` text; Day adds a 1 px `brand-deep` border.
    - Marigold is never text.
    - Status colours (`approved`, `waiting`, `declined`) always come with an icon and a word.
    - Member avatars use `member-1`…`member-6` in join order.
  - **Logo:** never recoloured or redrawn. The mark always appears with the name, and the wordmark is always lowercase (D-62).
  - **Type:** D-45.
  - **Shape and layout:** the radius, spacing, shadow and layout tokens. Primary buttons are 52 px; sheets use `container-flow` (440 px) and become dialogs at `bp-md` (768 px); the app uses two columns from `bp-lg` (1024 px).
  - **Motion:** one celebration, a 600 ms marigold burst when Pot rules approve a request. The typing-dots loader shows "Checking Pot rules". Everything else answers the person's own action. Reduced motion drops the burst and keeps the message.
  - **Icons:** Lucide at stroke 2. The pot-bubble is a logo, never an icon in a button.
  - **Web assets** come from `brand/web`: the favicon, the Apple touch icon, the PWA icons (192, 512, maskable 512) and the 1200×630 `og-image.png`.
    - They are wired through `app/manifest.ts` and the Next metadata API (frontend-architecture §8.1).
    - The manifest and the Day `theme-color` are `#faf9f6`; Night's is `#1c1424`.
  - **Where the brand material and the plan differ,** brand/README §12 records which wins. Product facts and copy (D-20, D-50, D-61, ux-spec) win over the mockups; the look follows the brand.

## 8. Interface skeleton

These names are binding so the specs can be written in parallel. Arguments may still be refined in the specs.

**Hub `pots.<root>`.** Change methods are called through the relayer unless marked otherwise.

| Method | Purpose |
|---|---|
| `create_pot(slug, name, preset, rules, invite_pk?)` | Creates the DAO; the creator is the predecessor; the hub pays when the call is relayed (rev4: signer ∈ `relayers`), otherwise the caller attaches the cost |
| `ft_on_transfer(sender_id, amount, msg)` | Called by `usdc.<root>`; `msg = {"pot": "<dao_id>"}` |
| `request_spend(pot, amount, receiver_id, category, request_ref)` | Instant or vote path |
| `join(pot, invite_pk, signature)` | Invite join |
| `add_invite(pot, invite_pk, expires_at_ms?, max_uses?)` / `revoke_invite(pot, invite_pk)` | Members only |
| `set_rules(pot, rules)` | Predecessor must be the DAO (via a `call` proposal), or the sole member |
| `propose_rules(pot, rules)` | Member; the hub adds the `call` proposal for `set_rules` (D-07b) |
| `withdraw_request(pot, request_id)` | **Phase 3, not built** (Rev 5); original requester only; needs the rulebot's `transfer:RemoveProposal`, which the day-1 policy doesn't grant (D-04, D-07) |
| `propose_close(pot)` | Creates the D-09 proposal |
| `retry_payout(pot, proposal_id)` | `act_proposal(Finalize)` |
| `sync(pot, proposal_id)` | Reconciles vote-path outcomes (spent totals, closed) |

- **Views:** `get_pot(pot)`, `get_pots_of(account_id)`, `get_members(pot)`, `get_rules(pot)`, `preview_spend(pot, account_id, amount, receiver_id)` (returns `instant | vote`, a reason and the approvals needed), `preview_close(pot)`, `get_requests(pot, from_index, limit)`, `get_invite(pot, invite_pk)`.
- **Events:** `pot_created`, `member_joined`, `contribution`, `spend_requested`, `spend_auto_approved`, `spend_payout_failed`, `rules_changed`, `invite_added`, `invite_revoked`, `close_proposed`, `pot_closed`.
- **Rev 3: additions made by contracts-spec.md (now binding too).**
  - Owner methods: `new(owner, usdc, dao_code_hash, dao_float, min_dao_float, limits?)` and `set_config(patch)`, which can change the float, the limits and the pause switch and nothing else. (Rev 4 extends both; see below.)
  - Optional arguments: `create_pot(…, emoji?, float?)`, where `float` may only lower the float; `balance?` on `get_members`, `preview_spend` and `preview_close`.
  - Views: `get_config()` and `get_request(pot, request_id)`.
  - Events: `rules_change_proposed`, `spend_withdrawn` (Rev 5: Phase 3, emitted only by `withdraw_request`), `proposal_synced`, `config_changed`.
  - Presets: `trip`, `club`, `team`, `custom`. `custom` needs explicit `rules`; the MVP UI only creates `trip`.
- **Rev 4: additions made by the security review (binding; contracts-spec §3.0, §3.10, §4).**
  - `new(owner, usdc, dao_code_hash, dao_float, min_dao_float, relayers, limits?)`; `set_config(patch)` can change the float, the limits, the relayer list and the pause switch, each within a coded range, and nothing else (`owner` is immutable).
  - `Limits.max_sponsored_pots_per_day` (default 50).
  - The six hub-funded methods (`create_pot`, `request_spend`, `join`, `add_invite`, `propose_rules`, `propose_close`) are payable for direct callers only; relayed calls attach 0.
  - View `get_proposal_subject(pot, proposal_id)` → `{kind, request_id, member, rules_version, live}` or `null`.
  - Errors `ERR_DEPOSIT_REQUIRED`, `ERR_GLOBAL_DAILY_LIMIT`, `ERR_RULES_PENDING`, `ERR_CLOSE_COOLDOWN`; spend reason `new_member`.
  - `add_invite(pot, invite_pk, expires_at_ms?, max_uses?)`: omitted values default to 7 days and 10 uses; at most 30 days and 40 uses.

**DAO `<slug>.pots.<root>`:**
- Members call `act_proposal({id, action, proposal})` through the relayer.
- Views: `get_policy`, `get_proposals`, `get_proposal`, `get_last_proposal_id`.

**Token `usdc.<root>`:** NEP-141/145. Users may only `ft_transfer_call` to `pots.<root>` through the relayer.

**API routes in `apps/web`.** Payloads are defined in [api-spec.md](api-spec.md).

| Route | Purpose |
|---|---|
| `POST /api/session` | Auth0 ID token + device pubkey → cookie; creates the account on first login. Rev 4: also the `challenge` whose hash is the token's `nonce` |
| `GET /api/session/challenge` | Rev 4. A short-lived server challenge for the device-bound OIDC `nonce` (D-21) |
| `POST /api/session/wallet` | NEAR Connect NEP-413 → cookie |
| `POST /api/devices` | Relays the NEAR Auth-signed `AddKey` |
| `POST /api/relay` | Relays a signed delegate |
| `POST /api/faucet` | Hands out demo dollars |
| `POST /api/notes` | Stores off-chain text: `{kind: "memo" \| "decline_reason", pot, ref, text}` (replaces `/api/requests/memo`) |
| `POST /api/nudges` | Sends a nudge (1 per person per 24 h) |
| `GET /api/pots/[pot]/feed` | Pot feed |
| `POST` / `DELETE /api/push/subscription` | Push subscription |
| `POST /api/oneclick/quote`, `GET /api/oneclick/status/[id]`, `POST /api/oneclick/simulate` | 1Click (Phase 2) |
| `POST /api/demo/session` | Leases a demo Pot |
| `POST /api/telegram/webhook` | Telegram (Phase 2) |
| `POST /api/session/dev` | Rev 3. **Preview and local only** (`FLAG_DEV_SESSION`, 404 on production): creates a 0-NEAR test account for a browser device key, with no Auth0. Used for G1, G2 and hallway round B (implementation-plan B-04) |

The supporting routes (session `GET`/`DELETE`, device re-login, relay status, profile, Pot metadata, pairing, health, cron, demo state) are listed with their owners in [api-spec.md](api-spec.md) §0.6.

## 9. Human decisions and actions

Dates and owners are tracked in [phase0-checklist.md](phase0-checklist.md).

| ID | Item | Default if nobody decides |
|---|---|---|
| H-01 | Contact NEAR Auth / Peersyst: ask for a **dedicated testnet client id** for our origins (rev4: preferred over a whitelist on the shared client, which lets other origins' tokens be replayed to us); a whitelist is the fallback; submit the mainnet Typeform | Demo personas + NEAR Connect on the hosted app; NEAR Auth on localhost in the video |
| H-02 | Rev 7 (2026-10-21): **handled by the lead (agent), with the user's OK.** Faucet accounts and the leftover spike accounts are swept into the holding account `pot-funds-65k8.testnet`, which had **28.1 NEAR** on Oct 21. The faucet quietly refuses after ~2 accounts per IP per window, so top up in small batches Oct 22-31 to ≥ 33 by Nov 1, then move to `<root>` once it is named. The target stays ~74 (lean ≈ 45). | Lean plan ≈ 45 NEAR |
| H-03 | Reserve the root account names (accounts are allowed before Nov 1) | — |
| H-04 | Rev 7: **decided, Vercel Hobby.** Hobby only deploys commits by the repo owner on a private repo, so either keep the repo on Cerasela's personal GitHub and make it **public from Nov 1**, or have only Cerasela's merges deploy. Cron runs at most daily; the design already uses Workflow plus client polling instead. Hobby is non-commercial, which is fine for a hackathon. | Public personal repo from Nov 1 |
| H-05 | Root account name `<root>` | Follows the product name |
| H-06 | Product name (PotLock collision). **Decided (rev6):** "Pot", with a lowercase wordmark; the mark carries recognition (D-62, D-67). Still open for humans: the unique submission `projectName` (H-14) | "Pot" |
| H-07 | Rev 7: **no domain for now.** The app runs on `https://<project>.vercel.app` (pick and claim the project name early: it is also the NEAR Auth origin, H-01). There is no email (Resend needs a domain), so notifications are push + in-app only. | No email |
| H-08 | 1Click partner key (optional, 5 min); a mainnet NEAR account + ~$20 USDC on Base for the clip | Anonymous API |
| H-09 | Telegram bots via BotFather + a privacy-policy URL (Phase 2, optional) | No bot |
| H-10 | Cerasela: presets, hero number, login order, whether the requester's own approval counts, demo cast, plus the "Questions for Cerasela" in [frontend-architecture.md](frontend-architecture.md). Rev 4 adds: may a member who hasn't put money in spend instantly (default **no**, D-08); review the "(rev4)" ux-spec edits. **Rev 6:** the brand decides the palette and the font (D-67, D-45), so they leave this list. Added: review the "(rev6)" ux-spec edits and the calls in brand/README §12 (e.g. which button is marigold on the Pot screen; no burst for group approvals; the Appearance setting's copy) | Values in D-60, D-61, D-67 and ux-spec.md |
| H-11 | Teammates' OS (Intel Macs can't run the sandbox) | Run sandbox tests in CI |
| H-12 | Whether to adopt the device-key model (D-21) | Adopt |
| H-13 | Rev 3. Re-read HACKATHON.md and diff it against [hackathon-rules.md](../kb/hackathon-rules.md) on Nov 1, Nov 7 and Nov 13 | Rules as in the KB |
| H-14 | Rev 3, updated Rev 8. Submission identity: `projectName`, `leadName`, the team email (at most 2 submissions per email), the X account that posts, and the **mainnet** payout `nearAddress`. `projectUrl` must be unique per repo. Humans only | Nothing is ever filled in by an agent |
| H-15 | Rev 8: **mostly answered by the rules update (2026-10-29).** Pre-Nov-1 code is OK (Q-001). Pot's team doesn't overlap with another submission, so Q-015's disclosure doesn't apply. Still open: whether one project can place in two tracks, and KYC/tax at payout | — |
| H-16 | Rev 3. Buy a FastNEAR Dev key ($69/month) only if server reads hit 429s (R-04) | No paid RPC; dRPC failover |
| H-17 | Rev 7: **relaxed for testnet by the user.** Testnet keys may live in `~/.near-credentials` on the dev machine. The custody setup (a separate macOS user or a Ledger) applies only to **mainnet** keys (the clip hub, the payout account). | Testnet keys on the dev machine |
