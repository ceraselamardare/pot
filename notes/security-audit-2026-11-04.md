# Pot security audit (2026-11-04)

Read-only review by six parallel auditors: hub core contract, hub wave-4/gifts/token/upgrades, Sputnik governance &
keys (with live testnet view calls), relayer/backend, client/signing, and threat intelligence (2017–2026 incidents).
No code was changed, nothing was signed or deployed. Sandbox tests run during the audit: `pot-hub` unit 35/35,
`t_wave4`/`t_gifts`/`t_migrate` 24/24; relay policy tests 204/204.

Scope: `contracts/pot-hub` (1.2.0, live as `pots.potprev.testnet`), test USDC, each Pot's Sputnik policy, the NEP-366
relayer and server (`apps/web/server`), the client (signing, keys, links, pages) and key custody.

**Bottom line.** The relayer and the hub's low-level mechanics are solid (no arbitrary calls/deposits through the
relayer, every callback `#[private]`, only real USDC accepted, no "ghost funds" pattern, signatures well bound).
The real risks are **economic/governance**: a malicious creator or a few sybil accounts (free to create, admitted by
invite links) can take a Pot's money without the honest majority, and **one hub key** can rewrite every Pot. These
must be fixed before any real money; most need a hub change, so they collide with the **Nov 12 hub lock**.

> **Status (2026-11-05):** fixes for the findings marked in-scope landed in hub 1.3.0 (not yet deployed), the web
> client and the server. An independent review of those fixes found five more issues, also fixed. GOV-1/5/6/8
> (upgradeable hub, key custody) are the testnet stage by decision. What changed, what is open and how each fix is
> tested: [SECURITY.md](../SECURITY.md).

## Ranked findings

Severity is for a mainnet/real-money deployment; testnet impact is test money only unless noted.

### Critical / High

| ID | Finding | Where | Exploit in one line | Fix direction |
|---|---|---|---|---|
| **GOV-1** | One key can rewrite every Pot | hub `pots.potprev.testnet` (1 full-access key, verified); every DAO has `factory_id = hub, auto_update: true` (verified) | Hub key holder redeploys the hub → approves any `Transfer` as 1/1 rulebot, or calls each DAO's `update()` with arbitrary code | Lock the hub on schedule and publish the key list; mainnet: disable factory auto-update at creation (or keyless factory); keep owner in custody |
| **HUB-1** | Creator rigs the policy before anyone joins | `policy.rs:9,41-52`; `lib.rs:1623-1676` (join), `1035-1072` | Alone, the creator is the majority: adds alt accounts to the member role or lowers the transfer threshold directly in the DAO; friends join, contribute; creator transfers everything out | On `join`/contribute, verify the live `get_policy` equals the template and the member group equals the hub's members; permissionless `check_policy` that flags tampered Pots; UI checks before join/contribute |
| **W4-1** | One-OK tier: two (sybil) members drain a Pot | `lib.rs:401-418`; `wave4.rs:351-438` | Join with A and B via a leaked invite; A requests `one_ok_cap` to self, B OKs next block; hub approves as rulebot; repeat | OK-er ≠ receiver; both must predate the request and have contributed / tenure; one-OK budget per member and period; delay before OK; re-check tier at OK time |
| **GOV-2** | Sybil majority via invites | `lib.rs:1568-1660`; live policy `[1,2]`, members hold `*:AddProposal`/`*:VoteApprove` | Any member mints invites, joins ~h free accounts, files a raw DAO `Transfer(all → attacker)`, approves with the sybils; executes at once | New joiners are hub-only "guests" until they contribute / are approved; per-inviter join quotas; stricter thresholds + delay for transfer/call/policy kinds; alert all members on non-hub proposals |
| **CLI-1 / APP-5** | Full-access device key signs silently; CSP has no `script-src` | `lib/client/live/signing.ts:34`; `device-key-store.ts:177-191`; `next.config.ts:39-48` | Any XSS / malicious dependency / extension signs `AddKey` or `ft_transfer` of all USDC and submits it via its own relayer | Hash-based `script-src` + `connect-src`; function-call key for 0-deposit calls, full access only behind an explicit tap; confirm above a threshold |
| **GOV-5** | Custody keys on the machine that runs agents | `~/.near-credentials/testnet/` (hub owner, hub, reserve, treasury, relayer…, filenames only) | A prompt-injected agent or malicious package reads the hub key → GOV-1 | Move hub/root/reserve keys to the custody user (D-13), reconcile S-4 vs H-17; never for mainnet |

### Medium

| ID | Finding | Where | Note |
|---|---|---|---|
| **HUB-4** | Close marked Closed on Sputnik's provisional `Approved` (High on the goal-refund path) | `lib.rs:1463-1468`; `wave4.rs:697-702` | Payout can still fail; Pot shows "refunded" while funds sit in the DAO and hub paths are blocked. Confirm with `ft_balance_of(dao)==0` / keep the subject live until money is out |
| **HUB-2** | 1-unit contribution bypasses the NewMember rule | `lib.rs:407`, `1053-1054` | Stranger contributes $0.000001, then instant-spends up to the member budget; require meaningful contribution or tenure |
| **HUB-3 / W4-2** | Close split by lifetime contributions captures gifts/surplus | `prorata.rs:59-65` | $1 contribution flips a gifts-only Pot from equal to 100% pro-rata; big last-minute contribution captures gifts. Use NAV/share accounting or allocate gifts at arrival |
| **HUB-5 / W4-6** | One unpayable payee fails the whole close | `kinds.rs:46-59`; `lib.rs:1883-1897` | Atomic batch of `ft_transfer`s; `storage_unregister` (testnet) or a USDC blocklist (mainnet) blocks every close. Pre-check/register payees; pull-based payouts |
| **W4-3** | Failed forward callback refunds the sender out of link escrow | `gifts.rs:130-176`; `lib.rs:1060-1104` | Triggered by an upgrade/rollback while a forward is in flight (the documented 1.1.0 rollback does it). Track `escrow_total`, cron-assert hub balance ≥ escrow; drain in-flight before deploys |
| **W4-4** | Stuck `Claiming`/`Returning` links have no cleanup | `wave4.rs:528-567, 582-641` | Callback OOG/state errors leave a link stuck → Pot can never close, escrow may be locked. Add timed `reap_link` |
| **W4-5** | A single member can block close with pending links | `lib.rs:1860`; `wave4.rs:664` | AwaitingFunds links count as open; free to create and renew. Only Funded/Claiming/Returning should block; void pending at close |
| **GOV-3** | A colluding majority can do anything (upgrade, policy, any FunctionCall) | live policy `*:` permissions | "Everyone gets their share back" is not enforced against 2 of 3. Explicit per-kind permissions, drop upgrade/bounty kinds, disclose in-app |
| **GOV-11** | No exit for a minority | `lib.rs:1834-1840` | Deadlocked or abandoned group = money stuck forever. Timed pro-rata exit after N days of inactivity |
| **GOV-6** | Relayer (9) and treasury (5) keys are full-access | `users.potprev.testnet`, `treasury.potprev.testnet` | Unavoidable for delegates; keep balances low with alert top-ups, separate relayer from user-parent account, per-environment accounts, rotation runbook |
| **GOV-7** | Server chooses the keys on new NEAR Auth accounts | `server/session/service.ts:215`; `onboard.ts:121-127` | A compromised server adds its own key. Client verifies the access-key list = {mpc, device} |
| **APP-1** | Sybils exhaust global caps and sponsor balances | `server/quotas.ts:46-57`; `pipeline.ts:301-327` | Free testnet wallet accounts take Pot creation / relaying down for everyone (judging risk). Caps below live balances, lower tier for new accounts, per-IP relay quotas, BotID/WAF |
| **APP-2** | USDC registration paid at every first wallet sign-in, shared counter | `wallet/service.ts:132-170`; `pipeline.ts:851-872` | Drains NEAR and the shared registrations counter, can starve close-payee registration. Register lazily; reserve a close-payee counter |
| **CLI-2** | Sign-out / lost device leaves the key valid on chain | `lib/client/live/session.ts:41-51` | `DeleteKey` on sign-out; device list with revoke |
| **CLI-3** | Approve sheet doesn't show who gets the money before the vote | `components/sheets/ApproveSheet.tsx:168-215` | Show receiver + account hint + "not in this Pot" badge; disambiguate duplicate names |
| **CLI-4** | Public pay/gift pages with official-looking previews; no reporting | `app/_lib/gift-og.tsx:47`; `app/give/[slug]` | Brand-impersonation fundraising scams. Reserved names, "Report" link, admin kill switch, "made by a user" label |

### Low / Info (summary)

- **Contracts:**
  - **HUB-6:** an old Failed close can still be finalized after the Pot reopens.
  - **HUB-7:** members can grief the Pot:
    - contributing every 59 s blocks the close;
    - about 1,000 refused requests use up `request_seq`;
    - the lifetime invite cap can be exhausted.
  - **W4-7:** in v2 Pots the hub is a 1/1 approver of any `call` proposal.
  - **W4-8:** the hub's NEAR can be farmed through claim registrations, because links have no minimum amount.
  - **W4-9:**
    - test list gaps;
    - a `balance_est` display bug;
    - instant links get around the members-only payee rule.
- **Governance:**
  - **GOV-4:** zero-bond proposal spam burns the DAO float, and proposals can't be removed.
  - **GOV-8:** the owner can set relayers and pause forever.
  - **GOV-9:** a member removed in the DAO keeps hub powers.
  - **GOV-10:** v2 widens what the rulebot can approve alone.
- **Backend:**
  - **APP-3:** weaker defaults outside Vercel production (development HMAC, NEAR Auth nonce off, the test allowlist is honoured, previews share the relayer).
  - **APP-4:** a stolen cookie grants every off-chain power.
  - **APP-6:** gift-link rules are enforced only in the relay pre-flight.
  - **APP-7:** previews and production accept each other's sign-in signatures.
  - **APP-8:** `deliver()` has no network guard of its own.
  - **APP-9:**
    - X-Forwarded-For trust off Vercel;
    - a nonce read-then-insert race;
    - stale membership cache (10 s);
    - logout returns 500 on a malformed body.
- **Client:**
  - **CLI-5:** the NEAR Connect manifest isn't pinned.
  - **CLI-6:** link secrets persist after sign-out.
  - **CLI-7:** the invite secret stays in the URL after a failed join.
  - **CLI-8:** Next.js 16.4.2 is behind the 16.4.5 security release.
  - **CLI-9:** the CSV formula guard has gaps.
  - **CLI-10:** the 1Click deposit address is trusted from the server.

## What looks solid

- **Relayer:**
  - Only one FunctionCall per delegate.
  - Receivers are limited to the hub, the token and DAOs under the hub; methods are allowlisted.
  - Deposits are exact and gas is range-checked.
  - Arguments must have exact keys; the `ft_transfer_call` msg must be exactly `{"pot"}` or `{"pot","gift"}`.
  - `act_proposal` checks the proposal kind by deep equality.
  - The decoder is canonical; sender, signature and nonce are checked.
  - Every receipt is scanned for inner failures; events are trusted only by their executor.
  - Quotas are charged atomically.
- **Hub:**
  - Authorization is by predecessor only.
  - All 18 callbacks and `migrate` are `#[private]`.
  - `ft_on_transfer` asserts the predecessor is USDC.
  - Contributions and gifts are credited only after a successful forward.
  - Invite and claim signatures are domain-separated, and claims are bound to the receiver.
  - The pro-rata math is overflow-safe and sums exactly.
  - Upgrade storage prefixes don't collide; `migrate` runs once.
- **On chain (verified):**
  - The test USDC has 0 keys and no mint method.
  - The DAOs have 0 keys and run immutable global code.
  - The live policy matches the code.
- **Auth:**
  - NEAR Auth RS256 tokens with issuer, audience, `azp`, nonce and device binding.
  - `__Host-` HttpOnly session cookie, stored hashed.
  - CSRF requires a JSON content type plus an Origin check.
  - `CRON_SECRET` is compared in constant time.
- **Client:**
  - Actions are built on the client from user intent; the server never supplies the arguments to sign.
  - Secrets only in `#fragments`, with `Referrer-Policy: same-origin` on link pages.
  - No `dangerouslySetInnerHTML` with user data.
  - Strict framing headers.
  - The SSRF allowlist for push endpoints.
  - The e2e mock wallet is refused on Vercel and mainnet builds.

## Threat-intel mapping (top incidents → status)

| Incident | Class | Pot status |
|---|---|---|
| NEAR Intents "ghost funds" (Sep 2026, ~$3.8M) | credit before forward succeeds | ✅ not present; residual via failed callbacks (W4-3) |
| SWEAT / HOT (Apr 2026) | callback missing `#[private]` | ✅ all callbacks private |
| Rhea Finance (Apr 2026, ~$18M) | fake NEP-141 tokens | ✅ USDC predecessor asserted |
| Ref Finance (2024) | upgrade/storage hotfix bug | ⚠️ upgrade discipline needed (W4-3 runbook) |
| Bybit / Radiant / WazirX (2024–25) | blind signing | ⚠️ CLI-1, CLI-3 |
| Tornado governance (2023) | malicious proposal / policy change | ❌ HUB-1, GOV-2, GOV-3 |
| Beanstalk (2022) | instant voting power | ❌ GOV-2, W4-1 (sybil joins via invites) |
| Parity multisig (2017) | single shared dependency | ⚠️ GOV-1 (hub key + DAO auto-update) |
| NEAR Wallet → Mixpanel (2022), Peanut links (2026) | URL secret leakage | ✅ mostly; CLI-6, CLI-7 |
| ERC-4337 paymaster griefing | sponsored-failure drain | ⚠️ APP-1, APP-2, W4-8 |
| 1Click misroutes (#384, Oct 2026) | API "SUCCESS" without delivery | ✅ credit only on chain; keep it that way in real mode |
| Circle freezes (2026) | blocklisted payee | ⚠️ HUB-5 |

## Suggested order (for discussion — nothing changed yet)

1. **Before the Nov 12 hub lock (contract changes, one redeploy):**
   - HUB-1: check the live policy on join and contribute.
   - W4-1 and HUB-2: harden the one-OK tier and the NewMember rule.
   - HUB-4: don't treat `Approved` as final for a close.
   - W4-5: pending links shouldn't block the close.
   - GOV-11: a timed exit for a minority.
   - Optionally W4-4 and W4-3: `reap_link` and `escrow_total`.
   - GOV-2: guest joiners.
2. **App and ops now, no lock needed:**
   - CSP `script-src` (CLI-1).
   - Upgrade to Next.js 16.4.5 (CLI-8).
   - Show the receiver on the Approve sheet (CLI-3).
   - Size the global caps and sponsor balances and add per-IP quotas (APP-1, APP-2).
   - Reserved names and a "Report" link (CLI-4).
   - `DeleteKey` on sign-out (CLI-2).
   - Fail closed outside Vercel production (APP-3).
3. **Custody, before mainnet:**
   - Lock the hub, move the custody keys off the agent machine (GOV-1, GOV-5).
   - Disable DAO auto-update (GOV-1).
   - Use per-environment relayer accounts with low balances (GOV-6).
   - Verify account keys on the client (GOV-7).
   - Disclose the majority trust model (GOV-3).
