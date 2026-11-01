# Pot: security review and fact check (red team)

> Reviewer: security and fact-check (red team). Written 2026-10-21; live checks ran 14:37-14:53 UTC.
> **Scope:** the planned design in [decisions.md](decisions.md) (Revision 3), [contracts-spec.md](contracts-spec.md), [accounts-and-deploy.md](accounts-and-deploy.md), [architecture.md](architecture.md), [api-spec.md](api-spec.md), [data-model.md](data-model.md), [frontend-architecture.md](frontend-architecture.md), [implementation-plan.md](implementation-plan.md), [test-plan.md](test-plan.md), the KB files and `spikes/*/RESULTS.md`.
> **Read-only.** No transactions, no sign-ups, no product code. Live checks used RPC view calls on `rpc.testnet.fastnear.com`, `rpc.mainnet.fastnear.com` and `near-testnet.drpc.org`, GET requests (GitHub source, crates.io, npm, NearBlocks API, docs), read-only query POSTs (JSON-RPC, FastNEAR Tx API, the npm advisory bulk API), one dry 1Click quote, and one Auth0 `/authorize` GET with no login. `rpc.testnet.near.org` was never used.
> **This file is the only one this review edits.** Section 5 lists every recommended change to the other plan files as file + section + proposed text.
> **Rev 4 (2026-10-21):** the lead's decisions on these findings are applied across the plan; §7 maps every finding to where it is fixed, deferred (owner and ID) or left to a human, and maps this review's proposed test IDs to the plan's.
>
> **Severity**
> - **Critical:** a cheap, repeatable attack that takes down the judged demo or loses mainnet funds, with no control in the plan.
> - **High:** large impact with a plausible attacker; the plan has partial controls only.
> - **Medium:** limited impact, or the attack needs unusual preconditions.
> - **Low:** hardening.
> - **Info:** accepted by design; disclose it.
>
> **New test IDs** continue the existing series:
> - T-88…T-100 and PR-05: sandbox and property tests ([contracts-spec.md](contracts-spec.md) §7.2).
> - A-21…A-33: API tests ([test-plan.md](test-plan.md) §6).
> - M-16…M-19: mocked UI. W-08: headers. U-11: unit. E-12: testnet abuse run. SEC-1, SEC-2: CI.

---

## 0. Verdict

**What is sound already.** Keep all of this:
- authorization by `predecessor_account_id` only (INV-01);
- the hub votes only on proposal ids returned by its own `add_proposal` in the same chain, with the kind rebuilt deterministically (INV-03, INV-04, and Sputnik's `ERR_WRONG_KIND`);
- the 1-yocto deposit cap (D-24, R1);
- the forward-then-record pattern for `ft_on_transfer` (INV-08);
- `quorum "1"` everywhere (blocks the empty-role `Finalize` bypass);
- invite signatures bound to `pot-join:v1:<dao>:<joiner>`;
- single-use proofs and non-extractable WebCrypto device keys;
- receipt scanning with trusted executors only;
- the push SSRF allowlist, idempotency keys, and memos kept off-chain.

**The one Critical gap (C-1).** The hub pays NEAR for member-triggered operations: DAO floats, per-proposal storage prepay and hub state. Every rate limit on those operations lives in the relayer. But the hub is a public contract, and anyone can call it directly and pay their own gas. On-chain only per-creator and per-Pot caps exist, and `propose_rules` has none at all. So:
- one person can drain the hub to `min_hub_reserve` within hours, from faucet NEAR;
- after that, every Pot gets `ERR_HUB_LOW_BALANCE`, including during judging;
- a sole member can also withdraw what the hub sent to their DAO, so the attacker profits.

**Five Highs:**
- **H-1:** an invite link is bearer membership, and membership grants instant spending and votes.
- **H-2:** the relayer sponsors votes and `Finalize` on any DAO proposal at exactly 300 Tgas. That is a gas-griefing route to the global cap, and a phishing route to policy takeover.
- **H-3:** the 1Click simulator has no amount cap, which empties the hot treasury.
- **H-4:** before the lock, the hub key and the token key are master keys. They sit in plaintext on the laptop where agents run shells. Separately, D-05's "the owner can never move money" is false for NEAR.
- **H-5:** cheap denial of service against the judge path: demo leases, the shared Pot and the demo budget.

**Fact check.** All 12 required claims hold, with three corrections:
1. Testnet moved to protocol 88 today.
2. D-21's 2 NEAR MPC reserve is unnecessary: a 1-yocto `sign` is proven on chain.
3. contracts-patterns.md §G's "2-week delay on mainnet" does not apply to the deployed `2b0f34a`.

There is also one new risk: `pnpm audit` cannot see the Next.js `use cache` RCE advisory yet.

---

## 1. Summary table

| ID | Sev | Finding | Fix (short) | Test that proves the fix |
|---|---|---|---|---|
| **C-1** | Critical | Anyone calling the hub **directly** (self-paid gas) makes it spend NEAR:<br>• `create_pot` ≈ 0.061 per Pot;<br>• `request_spend` ≈ 0.008;<br>• `propose_rules` ≈ 0.009 with no cap;<br>• `join`, `propose_close`, `add_invite`.<br>Relayer quotas don't apply. Sole members then withdraw the float, and after a policy change the prepays too. ≈ 7-11× amplification, and net profit for the attacker. The mainnet clip hub is just as open. | Sponsor only relayed calls (`env::signer_account_id() ∈ config.sponsors`). Direct calls attach the cost. On-chain daily budgets (global, per account, per Pot) and a global Pots/day cap. ≤ 1 open rules proposal per Pot. Testnet float 0.03. Mainnet hub paused outside the recording. | T-88, T-89, T-90, PR-05, A-21 |
| **H-1** | High | Invite = bearer membership. Joins are auto-approved, and a new member immediately has the instant cap and budget ($100/$200 Trip, $250/$1,000 Team; payee = themselves) plus a vote. The create-time invite lasts 30 days with unlimited uses, and `add_invite` allows no expiry. A leaked link lets strangers drain budgets, or fill the Pot (40) and take the majority. | Default invite: 7-day expiry, `max_uses` 10. `add_invite` requires an expiry. Instant spends need `contributed > 0` (H-10 product call). Every member gets a "joined via link" push with Revoke. Optional: joins beyond N go to a vote. | T-91, T-92, A-22 |
| **H-2** | High | R11 sponsors `act_proposal` on **any** proposal of a known DAO, at exactly 300 Tgas for `FunctionCall` kinds. A member creates a gas-burning `FunctionCall` in their own Pot (self-paid `add_proposal`). Relayed votes and repeated `Finalize` then burn ≈ 0.03 NEAR each, and two accounts exhaust the 5 NEAR/day global cap: relayer down for everyone. The approve UI can also be used to phish members into approving `ChangePolicy` or `UpgradeSelf`. | Relay votes only on hub-tracked proposals (new view `get_subject`). `Finalize` ≤ 3 per proposal per day, and only after a payee check. Per-user daily yocto cap. Pre-charge `FunctionCall` votes at 0.03. UI: no one-tap approve for non-hub proposals. | A-23, A-24, M-16 |
| **H-3** | High | The simulated 1Click deposit has no amount cap: `QuoteReq.amount` takes 16 digits, and `SimulateReq.amount` is free. It is reachable from **demo** sessions. One call empties the $1M hot treasury, and the faucet and demo seeding stop. | Simulated amount ≤ min(quote, $500), and ≤ $150 for demo sessions. It counts toward the `faucet_usd` caps per subject and globally. | A-25 |
| **H-4** | High | Pre-lock master keys:<br>• The hub FAK is the rulebot (approves any Transfer or AddMember in every DAO) **and** the factory (`update()` deploys code into every DAO immediately; verified at 278adc7 and 2b0f34a).<br>• The `usdc` FAK can redeploy the token and rewrite every balance.<br>• Both sit in plaintext `~/.near-credentials` on the laptop where Claude Code runs Bash.<br>• `set_config` has no `dao_float` upper bound, so the owner can route the hub's NEAR into a DAO they control. | Lock `usdc` on Nov 2. Hub and root keys go on a Ledger or a separate OS user. Alert on any tx signed by `pots.<root>`. `MAX_DAO_FLOAT`, a `min_hub_reserve` floor and a two-step owner transfer. Mainnet: pause and lock after the clip. | T-93, A-26, ops checklist |
| **H-5** | High | Judge-path DoS:<br>• leases are limited per IP hash, which IPv6 rotation defeats;<br>• visitor quotas are keyed by a clearable cookie;<br>• `demo_yocto` and the hub's ≈ 0.08 NEAR per seeded Pot can be exhausted;<br>• any visitor in the shared fallback Pot can close it or spend it to $0;<br>• demo `create_pot` burns hub floats once per cookie. | Limits per /64 and /24; a global leases-per-day cap; recycle untouched leases; count the hub cost in the demo budget. Shared Pot: no close and no create; reseed it when < $300 or not Open. Reserve a budget for judges. | A-27, E-12 |
| M-1 | Medium | ID-token replay. The shared Auth0 client means a shared `aud`, and auth0-spa-js overwrites any custom `nonce`. Any origin whitelisted on the shared client can harvest ID tokens and replay them within 10 min: it gets a session, and for a new user it creates the Pot account with the attacker's device key (pre-hijack). | H-01: ask for a **dedicated** client id. Production accepts only that `aud`. Sessions with a pending device are limited. Optional: a custom PKCE flow with a device-bound nonce. | A-28 |
| M-2 | Medium | Pair from Safari can be phished. A session minted from a replayed token or a stolen cookie starts a pairing; the victim's Safari "compares the code" and signs `AddKey(attacker)`. | Start only from a session bound to an **on-chain active** device; the completion must be signed by that same device; "new device added" alert; clear copy. | A-29 |
| M-3 | Medium | No anti-framing headers, and the CSP is report-only. One-tap money actions can be clickjacked. XSS equals takeover, and signed delegates can be exfiltrated to any relayer. | Global `X-Frame-Options: DENY` + `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. An enforced nonce-free CSP (`connect-src` allowlist, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`). `react/no-danger`. | W-08 |
| M-4 | Medium | The DAO float is a faucet:<br>• a majority or sole member withdraws it;<br>• the top-up backstop (0.05 NEAR/h per DAO, 2 NEAR/day) refills it;<br>• non-members can eat it with `store_blob` (≈ 2× amplification, derived from source);<br>• contested votes beyond `approvals_needed` aren't prepaid, so votes fail once the float is gone. | Top-ups only for demo and reference Pots, ≤ 2 per DAO. Prepay `extra_votes = member_count`. A small float. | T-94, A-30 |
| M-5 | Medium | Close griefing:<br>• one member freezes spends and contributions for up to 7 days with a close the majority ignores (Club needs 16 rejections), and can repeat it;<br>• `storage_unregister` makes the atomic close `Failed`, which keeps the Pot Closing;<br>• relayed `Finalize` loops burn gas. | A 24 h per-proposer cooldown after Rejected/Expired. The relayer re-registers payees before the deciding vote or `Finalize`. A `Finalize` rate limit. | T-95, T-96 |
| M-6 | Medium | Late contributors subsidize earlier spending, because the refund is pro rata to lifetime contributions. For example, $150 added after $384 spent on $450 returns $54. | Add sheet: "If the Pot closed now you'd get back $X of this". README limitation. Phase 3: time-weighted accounting. | M-17, P-01 V7 |
| M-7 | Medium | Privacy:<br>• MPC `sign` logs `…#google-oauth2\|<Google sub>` on chain (verified), and the signed `AddKey` names the Pot account, so they are publicly linked;<br>• slugs, names, members and amounts are enumerable from hub events;<br>• display names are served to anyone who has the slug. | Disclose it. Prefer pairing for new devices. Show names on `/j` only with a valid `?i=`. Anonymous feed reads get no profiles. Copy: "the Pot name and amounts are public". Lock-screen-safe push text. | A-31 |
| M-8 | Medium | `pnpm audit` is blind to GHSA-673q-mjm6-r5xr. It is a repo advisory only, and the npm advisory API returns nothing for `next@16.4.0` today. A downgrade to ≤ 16.4.0 would pass CI. | A CI gate on the lockfile: `next` ≥ 16.4.1. Repo Dependabot alerts. No typed arrays returned from `use cache`. | SEC-1 |
| M-9 | Medium | "Forget this device" leaves the device's full-access key on chain. A lost browser profile can still sign through **any** relayer. | Relayed `DeleteKey(device key)` signed by MPC or another active device. Never delete the MPC key. | A-32 |
| M-10 | Low-Med | The approve, close and rules UIs render hub data (`RequestView`, `preview_close`), not the DAO proposal being voted on. A hub bug or a pre-lock compromise would go unseen. | Decode `get_proposal(id).kind` (receiver and amount; `FunctionCall` args), compare it with the hub's data, and refuse on a mismatch. | M-18 |
| L-1 | Low | A member removed in the DAO keeps hub powers: `add_invite` (can come back through a Sybil), `propose_close`, `propose_rules`, contributions. | Document "removing a member also needs ..." or add `prune_members(pot)` synced from `get_policy`. | T-97 |
| L-2 | Low | A callback that runs out of gas leaves `checking`, `proposing` or `Joining{None}` records. `reserved` stays above 0 forever, which blocks `propose_close`. | A permissionless `reap(pot, id)` for records older than 1 h with no proposal id. | T-98 |
| L-3 | Low | `sync` expires requests from the hub's `created_at_ms`, which is 1-2 s before the DAO's `submission_time`, and it has no `expired → approved` transition. | Use the DAO's `submission_time`, and allow late transitions. | T-99 |
| L-4 | Low | Unicode format characters (bidi overrides) pass the "no control chars" check. The emoji field accepts ASCII punctuation. | Reject Cf except ZWJ and VS16. Emoji: no ASCII bytes. | U-11 |
| L-5 | Low | `/demo?as=` auto-submits and can swap a real session for a demo one through a link. | Preview only, or only when there is no non-demo hint. | M-19 |
| L-6 | Low | Registration refund loop. The faucet and simulator pay `storage_deposit` again after a user's `storage_unregister`, and the user pockets 0.00125 NEAR each time. | Register once per account ever; minimum claim $50; a global registrations/day counter. | A-33 |
| L-7 | Low | An MPC `sign` is paid even if the stored `mpcPk` no longer matches the JWT's `sub`, for example after NEAR Auth's planned "D13" hashed-sub change. | Recompute `derived_public_key(sub)` and compare it before `sign`. Deposit 1 yocto (proven). | A-10 extension |
| L-8 | Low | An anonymous feed GET triggers a lazy reconcile (RPC calls and `sync` txs) for any Pot. | Lazy reconcile only for members and demo Pots; negative caching. | A-31 extension |
| I-1…I-5 | Info | Majority sovereignty (D-04). The MPC key is shared across all NEAR Auth apps. `Finalize`, `RemoveProposal` and expiry semantics. Testnet protocol 88. KB errata. | Disclose in the README, fix the KB. | — |

---

## 2. Trust boundaries (what an attacker can reach)

| Asset | Who can touch it today | Hard boundary |
|---|---|---|
| USDC in a Pot DAO | the member majority (any Sputnik kind); the hub (Transfer and AddMember, by code); **before Nov 12, the hub key holder** (rulebot + factory `update`) | Sputnik policy + hub code |
| Hub NEAR (floats, prepays, state) | **any account** that calls hub methods, relayed or direct | **None today beyond per-creator and per-Pot caps** (C-1) |
| Relayer NEAR | session holders through `/api/relay`, `/api/devices`, faucet registrations, top-ups | quotas and caps in Postgres (api-spec §3.5) |
| Treasury test USDC | faucet, simulator, demo seeding | per-account, per-IP and global caps; **the simulator has none** (H-3) |
| User account | the device FAK, the MPC FAK, and XSS on our origin (signed delegates can go to any relayer) | WebCrypto non-extractable key; the NEAR Auth consent screen |
| Demo personas | the server (`DEMO_PERSONA_KEY`) and every visitor, through demo intents | demo-intent scoping (api-spec §2.3, §7.2) |

**Principle this review recommends writing down (D-05):** relayer quotas protect relayer NEAR. They are **not** a security boundary for hub NEAR or Pot funds, because every hub method can be called directly. Every hub-funded effect needs its own on-chain bound.

---

## 3. Detailed threats (Part A)

Each threat lists: the attack · its impact on testnet/demo and on a future mainnet · whether the current spec mitigates it (with the section) · the fix · the test that proves the fix.

### 3.1 Relayer and hub drain

#### C-1 · The hub pays for direct, self-paid calls (Critical)

**Attack.**

The hub spends its own NEAR in these hub methods:

| Method | What the hub pays | Source |
|---|---|---|
| `create_pot` | float `f` + 0.00125 USDC registration + ≈ 0.0094 state ≈ **0.061 NEAR** at `f` = 0.05 | contracts-spec §3.2, §8.4 |
| `request_spend` | prepay ≈ 0.006-0.008 + Request/Subject state ≈ 0.0025 | §3.4, §3.11 |
| `join` | ≈ 0.009 | §3.7 |
| `propose_rules` | ≈ 0.009 | §3.8 |
| `propose_close` | 0.013-0.10 | §3.9 |
| `add_invite` | 0.0015 | §3.7 |

The relayer's quotas never see a **direct** call, which is a normal transaction to `pots.<root>` signed by the caller. Anyone can do this: a NEAR Connect user with their own NEAR, or anyone with a faucet account (10 NEAR per new account, [accounts-onboarding.md](../kb/accounts-onboarding.md)).

The only on-chain bounds are:
- `max_pots_per_creator_per_day` (per account);
- per-Pot caps (`max_requests_per_pot` 1000, `max_pending_per_member` 10, invite caps);
- `min_hub_reserve`.

`propose_rules` has **no** cap. A sole member may call it, and pending rules proposals are unbounded (§3.8).

Worked numbers for testnet with float 0.05 (D-05 Rev 3):

1. **Sybil Pots.**
   - A direct `create_pot` costs the attacker ≈ 0.0085 NEAR (gas, plus the 0.007 creation charge of the DAO account, which the signer pays). It costs the hub ≈ 0.061.
   - The creator is the sole member, and a 1-member group's threshold is 1 (§3.2 notes). They add `Transfer{token_id:"", receiver_id: self, amount: ≈0.035 NEAR}` and approve it: the float minus ≈ 0.012 of base storage comes back. Net: attacker **+0.03**, hub **−0.06** per Pot.
   - There are 3 Pots per account per day, and sub-accounts cost 0.007 each. So 100 accounts take ≈ 18 NEAR in one day, which is the whole Nov 6 hub funding (accounts-and-deploy §2.4: 20 NEAR).
2. **`propose_rules` loop.** ≈ 0.0008 NEAR of attacker gas causes ≈ 0.009 NEAR of hub prepay and state (≈ 11×). About 2,000 calls take a 20 NEAR hub down to its 2 NEAR reserve.
3. **`request_spend` loops.** Up to 1000 per Pot, each ≈ 0.0084 hub vs ≈ 0.003 attacker. Afterwards the sole member grants themselves `*:RemoveProposal` (`ChangePolicyAddOrUpdateRole`, approved by their own vote), deletes the hub-created proposals and withdraws the freed storage NEAR. So the prepays are recoverable too.
4. **Through the relayer** the same operations are quota-limited, but each relayed op costs the hub ≈ 0.008, ≈ 2.7× the relayer's own ≈ 0.003. So the 5 NEAR/day `relay_yocto` cap still allows ≈ 13 NEAR/day of hub outflow, and no counter tracks it.

**Impact.**
- **Testnet/demo:** once free balance reaches `min_hub_reserve`, every `create_pot`, `request_spend`, `join` and `propose_*` fails with `ERR_HUB_LOW_BALANCE` for everyone. That includes the demo-pool refill and the nightly E-tests. It is cheap to repeat after each top-up, and Nov 15-18 judging is the worst time.
- **Mainnet:** the clip hub (`pots.<root>.near`, ≈ 3.7 NEAR, no relayer at all) is callable by anyone, and the loss is real NEAR. Any future launch with sponsored floats would be a money pump.

**Current spec.** Partial only:
- contracts-spec §2.2 `Limits`, INV-12: per creator and per Pot;
- api-spec §3.1 and §3.5, architecture §2.4: relayer only. architecture §2.4 rates Pot-creation spam "bounded by the hub float", which understates it.

**Fix.** It must be in the frozen Nov 6 layout; ED-01…ED-05.
1. **Sponsor only relayed calls.** For hub-funded methods, `sponsored = env::signer_account_id() ∈ config.sponsors`.
   - Under NEP-366 the inner receipt's signer is the relayer ([meta-tx-relayer.md](../kb/meta-tx-relayer.md): `actions.rs:501-533`). It cannot be spoofed.
   - This is a **payment** decision, not identity: authorization stays on `predecessor`.
   - When not sponsored, require `attached_deposit ≥ cost(op)`. The hub keeps the deposit and sends the prepay or float out of it, so direct callers pay their own way.
   - `config.sponsors` is set by the owner. The mainnet hub sets it to `[]`.
2. **On-chain daily budgets** as defense in depth (the relayer itself can be abused within its quotas). All of them can be tuned with `set_config`:
   - `max_pots_per_day` (global, default 40, including demo seeding);
   - `max_sponsored_per_day` (3 NEAR);
   - `max_sponsored_per_account_day` (0.1 NEAR);
   - `max_sponsored_per_pot_day` (0.15 NEAR).
3. **`propose_rules`:** at most 1 open rules proposal per Pot (`ERR_RULES_PENDING`), and 3 per Pot per UTC day.
4. **Smaller float.** Prepay already covers every hub-created proposal, so the float only needs base state plus a margin. Use 0.03 NEAR on testnet (`min_dao_float` ≥ 0.02 is already allowed, §3.1), which leaves ≈ 0.018 NEAR extractable.
5. **Relayer:** add `global/hub_yocto` and `user/hub_yocto` estimate counters (§3.5) with daily caps.
6. **Mainnet hub:** `sponsors: []`, init with `paused: true`, unpause only while recording, then close the clip Pots and lock or delete the hub.

**Tests.**
- **T-88:** 41 distinct accounts each call `create_pot` directly in one UTC day → the 41st gets `ERR_GLOBAL_DAILY_LIMIT`; the hub's balance delta ≤ the budget.
- **T-89:** a sole member loops `propose_rules` and `request_spend` **directly** (signer = predecessor, no deposit) → `ERR_SPONSOR_REQUIRED`. With the deposit attached → it succeeds and the hub's balance doesn't drop. Relayed (signer ∈ sponsors) → it succeeds until `ERR_SPONSOR_LIMIT`.
- **T-90:** float extraction by a sole member ≤ `dao_float` − base storage.
- **PR-05 (proptest):** any interleaving of direct and relayed calls by k accounts within a day: hub NEAR outflow ≤ `max_sponsored_per_day` + Σ deposits received.
- **A-21:** relayer `hub_yocto` counters trip 429 `quota_exceeded` with family `sponsor`.

#### H-2 · The relayer sponsors votes and `Finalize` on arbitrary DAO proposals (High)

**Attack.**
- R11 (api-spec §3.1) sponsors `act_proposal` VoteApprove, VoteReject and Finalize for **any** proposal id in a known DAO, provided the kind deep-equals `get_proposal`.
- For `FunctionCall` kinds it **requires** exactly 300 Tgas.
- A member (self-paid; e.g. the sole member of their own Pot) `add_proposal`s a `FunctionCall` to a gas-burning contract with a 290 Tgas action. Relayed `VoteApprove` executes it. While it stays `Failed`, every relayed `Finalize` re-executes it: Sputnik's `Finalize` recomputes the status of a `Failed` (or `InProgress`) proposal and re-executes it when its votes still meet the threshold (verified in the 278adc7 source).
- Each costs the relayer ≈ 0.029 NEAR, against a pre-charge estimate of 0.008 (§3.5). With 100 votes per user per day, two accounts pass the 5 NEAR/day `relay_yocto` cap, which returns 503 `global_cap` for all users for the rest of the UTC day, every day.
- Second route: **phishing.** If the Requests tab shows member-created proposals (it is built from `dao.get_proposals`, frontend-architecture §3.2/§3.6) with a one-tap Approve, a colluding member can get a `ChangePolicy`, `UpgradeSelf` or `Transfer` approved by people who think it is a normal request.

**Impact.**
- Testnet: a global DoS of the relayer, which takes the hosted demo down.
- Mainnet: the same, plus loss of funds through approvals obtained by phishing.

**Current spec.**
- The R11 kind check prevents kind swaps but not this.
- api-spec §8 P-8 (c) "no member-created DAO `add_proposal` is ever relayed" covers creation, not votes.

**Fix (ED-06…ED-09).**
- New hub view `get_subject(pot, proposal_id) -> Option<SubjectView>`.
- R11 relays only when the subject exists (cache 60 s). Otherwise → 403 `proposal_not_tracked`.
- `FunctionCall` votes only for subjects `close` and `rules`.
- `Finalize` ≤ 3 per proposal per UTC day. For close, only after a payee-registration check (M-5).
- A per-user `relay_yocto` cap (0.2 NEAR/day). Pre-charge `FunctionCall` votes and `Finalize` at 0.03.
- UI: a non-hub proposal renders as a read-only "Direct change, not created by Pot" card with the decoded kind and no Approve.

**Tests.**
- **A-23:** a relayed vote on a member-created proposal → 403 `proposal_not_tracked`, with no tx.
- **A-24:** a fourth `Finalize` on the same proposal in one day → 429. The per-user yocto cap trips before the global one.
- **M-16:** a mocked DAO with a member-created `ChangePolicy` → the Requests tab shows it read-only with no Approve button.

#### Other relayer items (from the brief)

| Sub-threat | Assessment | Spec reference | Recommendation |
|---|---|---|---|
| Deposit caps | ✅ Mitigated. Exactly 1 yocto only on `usdc.ft_transfer_call` → hub, 0 everywhere else. A-01 tests it. Keep "deposit refunds go to the **user**" in mind if any hub method ever takes a deposit through the relayer: a synchronous hub panic would send it to the user. | D-24, api-spec §3.1 R1 | If C-1's "direct callers pay" is adopted, the relayer must still attach **0** (sponsored path). Never relay a deposit to the hub. |
| Gas griefing, high-gas failing calls | Only burnt gas costs money, and failing hub calls burn little. The real vector is H-2. | api-spec §3.1 gas ranges | H-2 fix. |
| Many cheap delegates | Count quotas per family, burst limits, `global/relays` and `relay_yocto`. But the global cap turns abuse into **DoS for everyone**, and there is no per-user yocto cap. | api-spec §3.5 | Per-user `relay_yocto` (0.2 NEAR/day). Demo relays draw only from `demo_yocto`, not `relay_yocto`, so non-demo abuse can't block judges. |
| Relaying for accounts we didn't create (NEAR Connect) | Allowed after NEP-413 with a FAK. Wallet accounts are free on testnet, so the only bounds are per-account quotas and global caps. There is no global cap on wallet USDC registrations. | api-spec §2.1 `session/wallet`, §3.5 | Add `global/registrations` (200/day). Refuse wallet sessions for every account under `<root>`, not just under the relayer: the hub has a FAK until Nov 12. |
| AddKey/DeleteKey abuse | ✅ The relayer allows `AddKey` only through `/api/devices` (the user's own account, signed by the user's MPC key, PoP'd new key) and pairing. It cannot add keys to someone else's account, and the MPC key cannot be removed **through our relayer** (no `DeleteKey`). ⚠️ But a device FAK, or XSS running on our origin, can sign `[DeleteKey(mpc), AddKey(x)]` and submit it through **any** relayer (NEP-366 doesn't bind the relayer). Pairing is phishable (M-2). | api-spec §3.1 R12, §2.2 | M-2, M-3, M-9. Disclose that "a device key is full access". |
| Account-creation quota vs the 3-Pots/email/day rule | The per-email rule only counts **verified** emails. Email+password signups on the testnet tenant are unverified ([near-auth.md](../kb/near-auth.md)), and wallets have no email. So the effective limits are 3 per account, 3 accounts per IP per day and **20 Pots per day globally**. One abuser can use up all 20 every day (DoS for legitimate creators and E-05), and direct calls skip all of it (C-1). | api-spec §3.1 R2, §3.5 | Separate the budgets for demo and non-demo creation. Limit creation per IP prefix (/24, /64). The on-chain cap is C-1's `max_pots_per_day`. |
| `create_pot` cost to the hub: Sybil Pots | C-1. | §3.2 | C-1. |
| NEAR Auth `sign` costs before JWT validation | ✅ Mitigated: everything before step 8 of `/api/devices` is free (JWT, `fatxn`, delegate shape, nonce, quotas). Residual: a valid JWT for a `sub` whose derived key no longer equals the stored `mpc_public_key` (D13 hashed sub). The guard and MPC then sign with the new key, the `AddKey` delegate fails on chain, and ≈ 0.0045 + 0.000082 NEAR is lost. | api-spec §2.2 steps 1-11, architecture K-3 | L-7: a free `derived_public_key` view compare before `sign`. The deposit can be 1 yocto (F-06). |

### 3.2 The hub as an unlimited spender

The rulebot role's single vote approves **any** `transfer` and **any** `AddMemberToRole` (any role). Sputnik checks only the permission (verified: `can_execute_action` wildcard matching, 278adc7 `policy.rs:333-361`). Every path in which the hub votes:

| Check | Verdict | Evidence / gap |
|---|---|---|
| Votes only on its own proposals, created in the same call chain | ✅ | `on_spend_added` and `on_join_added` use the id returned by their own `add_proposal`, and `act_proposal` rebuilds the kind (INV-03, INV-04). Sputnik rejects any other kind with `ERR_WRONG_KIND` (278adc7 `proposals.rs:625`). `retry_payout` uses `Finalize` only on subjects in `payout_failed`. T-27 and T-85 cover it. |
| Only role `member` | ✅ | `join_kind` hard-codes `"member"` (INV-09, T-57). Note: a wrong role name is a **silent no-op that still ends Approved** ([sputnik-dao.md](../kb/sputnik-dao.md) R4). If a majority renames the role, `on_join_status` marks a "member" Active who can't vote. Assert membership via `get_policy` (L-1 note). |
| Caps and budgets checked against current state | ✅ with a 3 s window | `decide()` runs at B0, reservations are taken synchronously, and the live DAO group is checked at B2. A `set_rules` executed by the DAO between B0 and B5 doesn't stop an already-decided instant vote. Document it: "rules apply to requests submitted after the change". |
| Reentrancy / add→act interleaving | ✅ | No synchronous reentrancy on NEAR. Interleavings: members reject between hop 3 and hop 5 → the vote panics `ERR_PROPOSAL_NOT_READY_FOR_VOTE` → re-read → `rejected` ✅. The rulebot is removed or its threshold raised → `auto_approve_failed` ✅ (T-28a/b). **Gap (L-2):** a callback that runs out of gas strands `checking`/`proposing`. Then `reserved > 0` forever and `propose_close` is blocked (`ERR_PAYOUTS_PENDING`). |
| Two concurrent `request_spend` on one balance | ✅ safe, sometimes too strict | Both reservations exist before either pre-check. The check `amount ≤ balance − (reserved − own)` can refuse **both** when either alone would fit. Never overdraws: the DAO can't overdraw, and a late payout fails → `payout_failed`. T-26 should assert "at most one succeeds, none overdraws", not a fixed order. |
| Pre-lock hub key | ❌ (H-4) | Whoever holds the hub's FAK can sign `add_proposal` + `act_proposal(VoteApprove)` as the rulebot in **every** DAO, and call `<dao>.update(<wasm>)` as the factory. `update()` is immediate in the deployed builds (278adc7 and 2b0f34a `upgrade.rs`, verified; the factory is the parent account by default). |
| A majority-upgraded DAO talking to the hub | ✅ isolated | A DAO running code its majority chose via `UpgradeSelf` can return fake ids or statuses to hub callbacks. Callbacks take `pot` from the original call, so only that Pot's ledger can be corrupted. It can also keep the hub's prepays (C-1 bounds that). |

**Close computation:**
- **Rounding and dust:** floor pro-rata, dust < n base units goes to the last contributor, Σ = B is asserted. ✅
- **Overflow:** `B × c_i ≤ 1e15 × 1e15`. B can exceed `total_contributed` (direct transfers) but never the token supply (1e15 test; 7.7e13 mainnet, F-09). ✅
- **Zero-contribution members** get 0 and are left out. ✅
- **Members who joined after spending:** M-6 (they subsidize earlier spending).
- **A payout that fails during Closing:** when a vote-path payout fails after `propose_close`, its money is re-distributed pro-rata at close, and `retry_payout` needs Open. The requester loses the approved reimbursement. Low; document it.

**`set_rules` / `propose_rules` authorization:**
- ✅ Only the Pot's own DAO or the sole Active member (INV-10). Any majority-approved `call` proposal, including a member-created one, may call `set_rules`, which is consistent with majority rule.
- Race: a sole member can change the rules while a joiner's join is still `Joining`. The landing shows rules before the join, and the Rules tab before contributing. Low.
- **Gap:** `propose_rules` is unbounded (C-1).

### 3.3 Invites

| Aspect | Assessment | Spec |
|---|---|---|
| Signature domain separation | ✅ `pot-join:v1:<dao_id>:<joiner>`. The DAO id encodes the hub, environment and network; account ids can't contain `:`; raw ed25519 over the bytes; single-purpose keys. | contracts-spec §3.7 |
| Replay across Pots | ✅ The message carries the DAO id, and invites are stored per `(pot idx, pk)`. Any Pot may *add* a known public key, but that only invites holders of that secret into their own Pot. | §3.7 |
| Front-running | ✅ The joiner must equal the predecessor, so a copied signature only joins the victim. | INV-09, T-52 |
| Link leakage | ⚠️ `?i=` only exposes Pot data that is public anyway (H-1/M-7 for names). **The full link is a bearer credential.** It is multi-use, the create-time default is 30 days with unlimited uses, and `add_invite` accepts `expires_at_ms: null` (R5 allows null). Joining grants instant spending and a vote, so it is **H-1**. | §3.2 `on_pot_created`, §3.7, api-spec R5 |
| `max_uses` and expiry races | ✅ `uses` is reserved synchronously and released when the join fails; expiry is checked at execution. Conservative under contention. | §3.7 |
| Revocation | ✅ Immediate. Any member can revoke any invite, which a hostile member can use to grief (Low). A revoked pk can't come back (`ERR_INVITE_EXISTS`). | §3.7 |

#### H-1 · Invite link = bearer membership with spending rights (High)

**Attack.** A link posted to a big chat, forwarded, screenshotted or leaked lets strangers join, and each joins in ≈ 4 s.
- Trip: each stranger instant-spends up to $100 per request and $200 in total, **to themselves** (they are now a member, so they are an allowed payee).
- Team: $250 / $1,000.
- With n + 1 strangers, against n friends, they hold the majority: they add a `Transfer` of everything and approve it with self-paid votes. The 40-member cap lets 37 strangers face 3 friends.

**Impact.**
- Testnet: test money in user Pots. Demo Pots use server-held invites, so they are fine.
- Mainnet: direct theft. This is the main fund risk of the product design.

**Current spec.** Front-running and replay are covered. `member_joined` only pushes to the creator (api-spec §6.1). No gate on new members.

**Fix (ED-10…ED-12).**
1. Default invite: `expires = now + 7 d`, `max_uses = 10`. `add_invite` requires `expires_at_ms ≤ now + 30 d`. The Share sheet shows the uses left.
2. Instant path only if `member.contributed > 0`. Otherwise reason `new_member` → vote. This is a product call for H-10, and the demo is unaffected because everyone has put in $150.
3. `member_joined` pushes **every** member: "Ana joined using your link · Revoke link".
4. Optional for Club and Team: after the first N joins through an invite, joins go to a member vote (the hub already handles `InProgress` joins).

**Tests.**
- **T-91:** a stranger joins, then asks for $100 to themselves → `vote`, reason `new_member`. After a $10 contribution → instant.
- **T-92:** the `create_pot` invite has `max_uses` 10 and a 7-day expiry. The 11th join → `ERR_INVITE_USED_UP`.
- **A-22:** R5 without an expiry → 422 `args_invalid`.

### 3.4 Sessions and auth

| Area | Assessment | Spec |
|---|---|---|
| Auth0 ID token: `iss`, `aud`, `exp`, `iat` ≤ 10 min, RS256, `azp`, `sub` regex | ✅ Specified. Discovery advertises `["HS256","RS256","PS256"]` (F-13), so pin `algorithms: ['RS256']` in `jose` explicitly. | api-spec §4.3 |
| `nonce` | ❌ Not verifiable: auth0-spa-js 2.28.4 generates the nonce itself and spreads it after the caller's params (F-15). Together with the **shared** client's `aud`, this gives M-1. | — |
| Device-key PoP and replay | ✅ Purpose-tagged, ±120 s, single use keyed by `(purpose, pk, ts)` (works with Safari's randomized signatures). Suggest appending the origin (`\|<origin>`) to every PoP message for environment separation (cheap). | api-spec §4.2 |
| Pair from Safari brute force | ✅ Not a brute-force target: the 6-digit code is only for comparison, the pairing id is 100 bits and same-user bound. The real risk is phishing (M-2). | api-spec §2.2 |
| Session fixation | ✅ Server-generated 32-byte ids, `__Host-` prefix, a new row at login; `vercel.app` is on the Public Suffix List, so sibling deployments can't toss cookies. L-5: `/demo?as=` can swap sessions. | api-spec §4.1 |
| CSRF on POST routes | ✅ `Content-Type: application/json` + an `Origin` check; demo form posts check `Sec-Fetch-Site`/`Origin`. Side-effecting GETs: the feed's lazy reconcile (L-8) and the relay status poll (benign). | api-spec §0.2, §2.8 |
| Demo personas | Custodial by design. Visitors **can't** drain the relayer through member-created proposals (personas never create DAO proposals). They **can**: drain the treasury through the simulator (H-3); exhaust `demo_yocto` and hub floats (H-5); close or empty the shared Pot (H-5); send the leased Pot's test USDC to any account through a vote-path spend, approved by switching persona (harmless). The reference Pot is protected only by a rule (`demo_forbidden`) that must run **before** the "a Pot the persona created" allowance, and `maya.users.<root>` created the reference Pot (accounts-and-deploy §3.8). | api-spec §2.3, §7.2 |

#### M-1 · ID-token replay under the shared Auth0 client (Medium; High if production stays on the shared client)

**Attack.**
- `aud` is the shared client `np8paq…`, which any origin on its callback list can use.
- If H-01 ends with "whitelist Pot on the shared client", other teams' origins will likely be whitelisted too.
- A malicious or XSS'd origin receives ID tokens of users who log in there. The token is replayed to `POST /api/session` within 10 min, with the attacker's own device key and PoP.
- For a **new** Pot user, the server creates `u-…` with the MPC key **and the attacker's device key** as full-access keys (pre-hijack).
- For a returning user, it creates a session with a pending device. That session can read members-only memos, post notes, rename the user, and start a pairing (M-2).

**Impact.** Account pre-hijack: every later contribution can be stolen. Mainnet: real funds.

**Fix (ED-13).**
1. H-01 asks for a **dedicated** testnet client.
2. Production accepts only that `aud`. If only the shared client is available, keep NEAR Auth on localhost (already the D-22 fallback).
3. A session whose device isn't on chain is `pending_device`: GETs, `/api/devices` and logout only.
4. Optional (Phase 3): a custom PKCE wrapper with `nonce = b64url(sha256(devicePk ‖ serverChallenge))`, checked server-side.

**Tests.** **A-28:**
- the shared `aud` on a production config → `id_token_invalid`;
- a `pending_device` session calling notes, faucet, pairing or `PATCH /api/me` → 403.

#### M-2 · Pair from Safari can be phished (Medium; Phase 2)

**Attack.** The attacker holds *any* session for the victim's user (M-1, or a stolen cookie), starts `POST /api/devices/pair` with key B, and sends the victim `link-device?p=…` ("tap to confirm"). The victim's Safari session is the same user, the code "matches", and A signs `AddKey(B)`.

**Fix (ED-14).**
- Start a pairing only from a session whose bound device is **active on chain**. The legitimate PWA session is the cookie copied from Safari, so it is bound to device A.
- `complete` must be signed by **that** device.
- Push and email "A new device was added" to the other devices.
- Copy: "Only continue if you started this on this phone in the last 10 minutes".
- Every key is visible in Advanced with Remove (M-9).

**Test.** **A-29:** a pairing started from a `pending_device` session → `pairing_invalid`. A completion signed by a different active device → `pairing_invalid`.

### 3.5 The DAO policy

**Verdict: acceptable for a majority-governed group, if disclosed.** Members hold `*:AddProposal`, `*:VoteApprove`, `*:VoteReject` and `*:Finalize`, with a `[1,2]` majority (verified live on the spike DAO `g1`, F-01). A bare majority can:
- move every token (`Transfer`);
- add anyone to any role, including `rulebot` (this *breaks* instant spends: the `[1,1]` ratio then needs both);
- change the policy;
- `UpgradeSelf` the DAO;
- call `hub.set_rules`.

This is the trust model of a Sputnik DAO. **No member can bypass the hub alone in a ≥ 2-member Pot, and no minority can take funds.** Residual risks and semantics:

- **Sole member = full control** of their DAO. That is fine for their own money, but it is the engine of C-1 (they withdraw the hub's float and prepays).
- **Member-created proposals** can be phished through the UI and used for gas griefing through the relayer (H-2). A colluding 2-of-3 can drain the third member's share with no delay: votes execute the moment the majority is reached, and a 7-day period doesn't slow approvals.
  - Disclose: "a majority can do anything with the money".
  - Phase 3 option: stricter member vote policies for `upgrade_self`, `upgrade_remote`, `factory_info_update`, `set_vote_token` and the `policy*` labels (e.g. `[2,3]`). This doesn't help against `transfer`.
- **`Finalize`** (verified at 278adc7 `proposals.rs`):
  - it recomputes the status over **all** roles;
  - it needs the stored status `InProgress|Failed`; an already-successful `Approved` panics `ERR_PROPOSAL_NOT_IN_PROGRESS`, so a paid payout can't be doubled;
  - a recomputed `Approved` → execute (for a `Failed` proposal, again);
  - `Expired` → reject;
  - anything else panics.
  - Consequences: a failed instant payout can be re-run by any member or by the rulebot at any time within 7 days. A failed close can be re-run by any member. Expiry wins over everything (checked first).
  - With `quorum "1"`, the empty-role bypass needs a majority to create an empty role with quorum 0 first. That is no escalation.
- **`RemoveProposal`** deletes a proposal **regardless of status** (verified: `Action::RemoveProposal => self.proposals.remove(&id)`). The rulebot's `transfer:RemoveProposal` is therefore a history-erasure power: harmless after the lock if `withdraw_request` is the only code path (T-85), but it widens the pre-lock blast radius (H-4). Rev 5: dropped from the day-1 policy; `withdraw_request` is Phase 3, not built (§7.3 #5).
- **Expiry** is lazy, and `proposal_period` is read from the current policy, so a majority can expire everything at once. Votes after expiry are stored and mark the proposal `Expired`.
- **`store_blob`** is callable by **anyone**. It charges `(len + 32) × byte cost`, but not the 40-byte record overhead or the `blobs` map entry (≈ 97 B). So each call makes non-members burn ≈ 0.0014 NEAR of DAO float (derived from the 278adc7 `lib.rs:181-206` source; verify in the sandbox, T-94). Other entry points for non-members (`bounty_claim` needs an existing bounty; `act_proposal` checks permission and reverts) don't drain anything.
- **Contested votes:** prepay covers `approvals_needed` votes (§3.11). In a 40-member Pot up to 2k−1 = 41 votes can be cast, so ≈ 2 KB is uncovered per contested proposal. Once the float is gone, votes fail with `LackBalanceForState` and are not recorded (M-4).

**Fix:** M-4 (prepay `member_count` votes; restrict top-ups) and H-2 (relay only hub-tracked proposals).

### 3.6 Privacy

| Data | Where it becomes public | Note / fix |
|---|---|---|
| Member account ids, contributions per member, every request (amount, category, requester, receiver), votes and voters, timestamps, balances | chain (hub events and state, DAO, USDC events) | By design. `u-<random>` ids are pseudonymous ✅; wallet users' named accounts (`alice.near`) are not. Disclose. |
| Pot name, slug, emoji, rules | chain (`pot_created`, DAO `config.name`) | **Slugs are enumerable** from hub events, so the "random suffix, not guessable" defense (architecture §2.5, Q-4) doesn't hold. Create-sheet copy: "The Pot name and amounts are public". |
| Social graph | `invite_added{by}`, `member_joined{invite_pk}` | Who invited whom is public. Disclose. |
| **Google identity ↔ Pot account** | MPC `sign` logs `path: "jwt#https://login.testnet.fast-auth.com/#google-oauth2\|118395…"` (F-06, tx FzULQ33c…). The signed payload (the `AddKey` delegate) names the Pot account. | New for this plan: architecture §2.5 says ids aren't derived from `sub`, but the new-device flow publishes the link. Prefer pairing, which uses no MPC, and disclose (M-7). |
| Display names | DB → `/j/<slug>` SSR, `GET /api/pots/[pot]/feed` `profiles` (anonymous), the OG image, notifications | Gate them: names on `/j` only with a valid active `?i=`; no `profiles` for anonymous feed reads (except demo Pots); initials only in the OG image (ED-17). |
| Memos and decline reasons | DB; members only; **push bodies** ("$300 for Boat trip") show them on lock screens | Payloads are end-to-end encrypted (RFC 8291) ✅. Lock-screen-safe default: "Maya needs your OK in Lisbon Trip". |
| Logs | Vercel logs (URLs with `?i=` pk, IPs for 1 h on Hobby); `relay_log`, `error_log` | ✅ Never tokens or secrets (architecture §4.4). Use one structured logger with an allowlist of fields. |

### 3.7 Supply chain and keys

| Item | Assessment | Recommendation |
|---|---|---|
| Pinned versions | ✅ All latest stable on 2026-10-21 (F-08, F-20): near-sdk and near-contract-standards 5.29.1, near-workspaces 0.23.0, cargo-near 0.22.0 (only RCs are newer); next 16.4.2, react 19.3.1, near-api-js 7.3.1, near-connect 0.11.4. No npm advisories for the pinned versions. auth0-spa-js 2.28.4 (2.29.0 exists, no advisory). | Keep the pins. Add `cargo audit`/`cargo deny` to the contracts job (SEC-2). pnpm `minimumReleaseAge` 1440 ([frontend-stack.md](../kb/frontend-stack.md)). |
| Next.js RCE ≥ 16.4.1 | ✅ GHSA-673q-mjm6-r5xr: critical, "Unauthenticated RCE in `use cache` functions returning typed arrays", `>=16.0.0 <=16.4.0`, patched in 16.4.1, published 2026-10-14. ⚠️ **It is not in the GitHub global advisory DB, and the npm bulk advisory API returns nothing for `next@16.4.0`** (F-08). So test-plan §7's `pnpm audit --prod` would pass a downgrade. The plan uses `'use cache'` (invite preview, demo snapshot). | **M-8:** a CI step asserts the lockfile's `next` ≥ 16.4.1. No typed arrays returned from `use cache`. Turn on repo Dependabot alerts. |
| NEAR Auth SDK avoided | ✅ D-20's thin wrapper drops 325 packages (205 MB). | Keep. |
| Relayer and treasury keys in Vercel env | Secret env vars are write-only in the UI but readable by **any deployed code**, including a malicious dependency or a bad merge. Prod and preview values are separate ✅. "Secrets are now allowed in Development" (Vercel docs, F-19), so `vercel env pull` could bring them to laptops. | Never add them to Development. Protect key-loading modules with `server-only` + `experimental.taintUniqueValue`. Keep Git Fork Protection on when the repo goes public (it is on by default: fork PRs need team authorization, F-19). Keep hot balances small (already specified). |
| Preview vs prod | ✅ Separate namespaces, keys and DB branches; one shared test token (fine). `FLAG_DEV_SESSION` (B-04) must be impossible in prod: fail at boot if `VERCEL_ENV==='production'`. X-19's shareable protection-bypass link exposes the preview dev session; rotate it after the hallway test. | ED-21 |
| **Laptop and agents** | `~/.near-credentials/testnet/*.json` holds plaintext FAKs for root, hub, usdc, reserve and the relayer/treasury recovery keys. implementation-plan §9.2 denies the **Read** tool for that path, but a `Bash` call (`cat`, `cp`, `python`) or a prompt-injected agent bypasses Read rules. | **H-4:** keep the hub, root and usdc keys out of the agent's OS user: `sign-with-ledger` (near-cli-rs supports it) or a separate macOS user; run agents in the Claude Code sandbox with filesystem denies; the preview keys may stay. |
| Lock procedure (Nov 12) | ✅ Sound (`list-keys` = exactly 1 key, delete it, empty table). **Before it**, the hub key = rulebot + factory over every DAO, and the usdc key = rewrite every balance. A stolen **owner** key (root) can't move USDC, **but** it can set `dao_float` = free − reserve and `min_hub_reserve` = 0 and then create a sole-member Pot: the whole hub NEAR moves to a DAO the attacker controls. It can also pause (DoS) or hand `owner` to itself for good. That stays true after the lock. | **H-4:** lock `usdc` on Nov 2 (it has no admin method; a token bug means `usdc2` + `pots-v2` anyway). Code bounds: `MAX_DAO_FLOAT` 0.25, `min_hub_reserve` ≥ 1 NEAR, a two-step `owner` change. An alert on any tx whose signer is `pots.<root>` other than a planned deploy. Mainnet: see C-1. |

### 3.8 Faucet, demo pool, nudges, notes, OG images

#### H-3 · The 1Click simulator drains the treasury (High)

**Attack.**
- `POST /api/oneclick/quote` takes `amount: MicroStr` (up to 16 digits) and is allowed for any session that is a member of the Pot, **including demo personas**.
- `POST /api/oneclick/simulate` takes `amount?` ("what arrives").
- At SUCCESS, the workflow sends that much test USDC from `treasury.<root>`, plus a `storage_deposit`.
- No cap or quota applies to the amount (api-spec §2.7, §5.1). One anonymous demo visitor moves ≤ $1M (the hot float), and the faucet and demo seeding stop until a human refills from `reserve`. Then the attacker repeats.

**Fix (ED-15).**
- Simulated `amount` ≤ min(quote amount, 500000000); for demo sessions ≤ 150000000.
- Simulated quotes ≤ 500000000.
- Delivered amounts count toward `faucet_usd` per account, visitor and IP, and globally.

**Test.** **A-25:** quote $1,000,000 → 422 `amount_too_high`. Simulate twice → the second is over the daily cap → 429 `quota_exceeded`, family `faucet`. The treasury balance delta ≤ the cap.

#### H-5 · Judge-path denial of service (High for Nov 15-18)

**Attack vectors:**
- Leases are limited by `ip:{hash}` (20 per day), and IPv6 /64 rotation makes that unlimited. Each lease consumes a pre-seeded Pot (≈ 0.12 NEAR), and the refill spends `demo_yocto` (3 NEAR/day) plus **hub floats and prepays, which no counter tracks** (≈ 0.08 per seeded Pot).
- Visitor quotas are keyed by the `pot_demo_visitor` cookie, which a visitor can clear.
- Demo `create_pot` is allowed once per visitor per day (api-spec §9.2 Q4), so it is unlimited once cookies are cleared.
- In the **shared** fallback Pot (`lisbon-<yyyymmdd>`, every visitor uses the same personas), any visitor can `propose_close` and approve it by switching persona, or spend it to $0 within the instant rules and by vote. Every later visitor then sees a closed or empty Pot, and the README steps fail.

**Fix (ED-16).**
- Lease limits per /64 (IPv6) and /24 (IPv4) (10 per day), plus a global 150 per day.
- Recycle a lease with no on-chain action within 15 min.
- Visitor quotas also keyed by IP prefix.
- Hide and refuse `create_pot` in demo sessions.
- In the shared Pot, refuse `propose_close` and close votes. Spawn a fresh shared Pot when its balance < $300 or it isn't Open.
- Count hub floats and prepays in `demo_yocto`.
- Keep a reserved judge budget, and a "demo degraded" banner instead of errors.

**Tests.**
- **A-27:** 11 leases from one /64 → 429. A demo `create_pot` → 403 `demo_forbidden`. A close in the shared Pot → 403. A shared Pot below $300 → a fresh one is leased.
- **E-12:** a nightly abuse script against preview: 50 leases from rotating /128s in one /64, and budget counters hold.

#### Faucet, nudges, notes and OG images

- **Faucet:** ✅ caps per account ($500, 5 claims), per IP ($1,000) and globally ($50k). It is idempotent. L-6: every claim re-registers unregistered accounts, so the `storage_unregister` refund loop is a micro-drain of the relayer. Register once per account ever, with a $50 minimum claim.
- **Nudges:** ✅ 1 per (Pot, target) per 24 h, 10 per sender. Display names in push titles ("{name} nudged you", "{name} needs your OK") allow impersonation ("Pot Support"). Reserve words in display names (Pot, NEAR, Support, Admin, Team), and show names in quotes in system notifications. Low.
- **Notes (memos, decline reasons):**
  - ✅ XSS: React text only, `dangerouslySetInnerHTML` is banned; add an ESLint `react/no-danger` rule.
  - Email: react-email escapes. Telegram: send with **no** `parse_mode` (or escape it).
  - The authorship rules (a memo shows only if its author is the on-chain requester; a decline reason only if the author voted Reject) stop spoofed memos ✅.
  - Reject Unicode bidi format characters (L-4).
  - Never put server-provided URLs (e.g. a 1Click `explorerUrl`) into `href` without an `https:` scheme allowlist.
- **OG images:** ✅ no balance, and `ImageResponse` renders text (no injection). Emoji fetches go to a fixed CDN host (no SSRF). CPU DoS through random slugs: cache negative lookups, and validate the slug format before any I/O. Privacy: initials only, and no inviter name without `?i=`.

### 3.9 Other findings (Medium/Low)

- **M-3, clickjacking and CSP.** frontend-architecture §1.5 sets headers only for `/sw.js` and `/j/*`, and §4.3 plans the CSP as report-only from day 11.
  - One-tap actions (inline approve with Undo, Spend) can be framed.
  - Fix: global static headers, which work with Cache Components because they need no nonce: `X-Frame-Options: DENY`; `Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; connect-src 'self' https://rpc.testnet.fastnear.com https://near-testnet.drpc.org https://tx.test.fastnear.com https://login.testnet.fast-auth.com`; `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin` (keep `same-origin` on `/j/*`); `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Enforce them from Nov 6 and keep a report-only `script-src` experiment.
  - Test **W-08:** curl every route and assert the headers.
- **M-4, the float faucet.**
  - api-spec §3.5's backstop (0.05 NEAR per hour per DAO, 2 NEAR/day) refills DAOs whose float a majority withdrew (or that non-members ate through `store_blob`).
  - Fix: top up only `is_demo` or reference Pots, ≤ 2 times per DAO lifetime, and never a DAO that ran a NEAR `Transfer` (`token_id ""`). Prepay `extra_votes = member_count` (contracts-spec §3.11).
  - Tests: **T-94** (a contested 40-member vote never touches the float; `store_blob` drain measured), **A-30** (no top-up for a non-demo DAO).
- **M-5, close griefing.**
  - Fix: a 24 h cooldown per proposer after a Rejected or Expired close (`ERR_CLOSE_COOLDOWN`), and 1 close proposal per Pot per 24 h.
  - The relayer re-registers every payee (`storage_deposit`, registration-only, refunded if already registered) before relaying the deciding close vote or `Finalize`.
  - `Finalize` limit as in H-2.
  - Phase 3: the close batch includes `storage_deposit` actions (the gas cost drops `HARD_MAX_MEMBERS`).
  - Tests: **T-95** (cooldown), **T-96** (a payee unregisters → close `Failed` → re-register → `Finalize` → `Approved`; the Pot stays Closing meanwhile).
- **M-6, dilution.**
  - Fix: the Add sheet shows "If the Pot closed now you'd get back {x} of this" whenever `B < C`, plus a README limitation.
  - Tests: **M-17**, and pro-rata vector **V7**: B 66e6, contributions (150, 150, 150, then 150 late) → the late contributor gets 22e6 back, not 150e6.
- **M-9, revoke.** Add R13: `DeleteKey(pk)` on the sender's own account, only for a device key (never the stored `mpc_public_key`), signed by the MPC key through `/api/devices` or by another active device. Test **A-32**.
- **M-10, decode before voting.** Approve sheets render the receiver and amount from `get_proposal(id).kind`. Close and rules decode the `FunctionCall` args and compare them with `preview_close` and the proposed rules; on a mismatch, refuse with `generic.error`. Test **M-18**.
- **L-1…L-8:** see the summary table; tests T-97…T-99, U-11, M-19, A-31, A-33.

---

## 4. Fact check (Part B)

All checks ran on 2026-10-21 between 14:37 and 14:53 UTC. "RPC" means JSON-RPC `query` on `https://rpc.testnet.fastnear.com` (T) or `https://rpc.mainnet.fastnear.com` (M). The scripts are in the scratchpad (`review/rpc.sh`, `b58.py`).

| # | Claim the plan depends on | Method | Evidence (excerpt) | Verdict |
|---|---|---|---|---|
| F-01 | The testnet global code `Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD` exists and can be used with `UseGlobalContract` | T `view_global_contract_code {code_hash: Ea8t…}`; sha256 + base58; T `view_account g1.potspike-dao-svuw.testnet`; T `contract_source_metadata` on g1 | 430,308 B; sha256 `c9a502ef…39ce`; base58(sha256) = `Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD` (block 274109048). g1: `"code_hash":"111…1","global_contract_hash":"Ea8t…"`. NEP-330 link `…/tree/278adc713e…`. The live g1 policy equals the hardened template. A view can't execute an action, so the "usable" part rests on the live DAO using it plus spike 1b's creation tx `8aNJW8…` ([sputnik-rulebot RESULTS](../spikes/sputnik-rulebot/RESULTS.md)) | ✅ |
| F-02 | `sputnikv2.testnet` deploys the legacy v3.31 | T `get_default_code_hash`, `get_default_version`, `get_contracts_metadata`, `get_number_daos` | `"AA4nA45vauiac3jdVwJTzSdUP3oj2r1fDaPAb2mHdgcH"`, `[3,31]`, commit `7764926cfd…`, 5,321 DAOs | ✅ |
| F-03 | Mainnet Sputnik `act_proposal` **requires** `proposal` | M `sputnik-dao.near.get_default_code_hash`/`version`; newest DAO `nhrxg.sputnik-dao.near` `view_account` + `__contract_abi` (zstd); GitHub source | `"DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF"`, `[3,2]`. nhrxg `global_contract_hash: DtHZ…`. ABI: `act_proposal(id: uint64, action: Action, proposal: ProposalKind (not nullable), memo: string\|null)`. Source `2b0f34a…/proposals.rs:593 #[deny_unknown_arguments]`, `:616 ERR_WRONG_KIND`. Testnet `278adc7` has the same at `:602`/`:625` | ✅ |
| F-04a | FastNEAR testnet RPC is healthy | `POST {"method":"status"}` to T; the same to dRPC; `EXPERIMENTAL_protocol_config {block_id: h−43200}` | HTTP 200 in 0.078 s; `chain_id testnet`, **`protocol_version 88`**, nearcore 2.14.0-rc.5, block 274109211 at 14:38:43Z. dRPC: 88. Block 274066658 (~6 h earlier): **87** | ✅ healthy. ❌ **Correction:** testnet is protocol **88** (switched within the last ~6 h). KB files say 87 (meta-tx-relayer.md, contracts-patterns.md, sputnik-dao.md). The 88 features (`FailCallToMissingGlobalContract`, `FixSelfMappedShardBandwidthRequest`, `UpdatedEthWalletContract`; `max_globals_per_contract` 65,536) don't affect Pot. The ★ CI job (2.14.0-rc.4) is now the *current* testnet parity job |
| F-04b | `rpc.testnet.near.org` is deprecated, slow and returns 429 | Not queried (project rule). `GET https://docs.near.org/api/rpc/providers` (dateModified 2026-10-19) | The providers table lists only `archival-rpc.testnet.near.org` ("Severely rate limited") for NEAR, plus FastNEAR (`test.rpc.fastnear.com`) and dRPC. Spike evidence: `-429 "THIS ENDPOINT IS DEPRECATED"` ([meta-tx RESULTS](../spikes/meta-tx/RESULTS.md) Gotchas) | ⚠️ not live-verified by rule; consistent with the docs and the spike |
| F-05 | `v1.signer-prod.testnet.derived_public_key({path: "jwt#https://login.testnet.fast-auth.com/#"+sub, predecessor: "fast-auth.testnet", domain_id: 1})` works | T view calls | Dummy sub `google-oauth2\|000000000000000000001` → `ed25519:Ct59zGEUA2FavyFzAwCbvwTQkh8yT5yFFm8xCquE7o83`. The KB example `google-oauth2\|123456789` → `ed25519:4ePu6MJVtv74NDZvT7DeqUdL6j9saHHx5YTsTscbNTyJ` (exactly the KB value). `domain_id 0` → a `secp256k1:` key. Predecessor `fast-auth-beta-001.testnet` → a different key. MPC `version` 3.17.0, Running, domain 1 = Frost | ✅ |
| F-06 | `fast-auth.testnet` exists; its `sign` deposit is 2 NEAR or 1 yocto | T view calls; source `Peersyst/fast-auth@8f84383 contracts/fa/src/lib.rs:427-610`; NearBlocks `GET /v1/account/fast-auth.testnet/txns-only`; FastNEAR Tx API query for `FzULQ33c…` | `version "1.0.0"`, owner `fast-auth-admin.testnet`, `paused false`, `mpc_address v1.signer-prod.testnet`, `mpc_domain_id 1`, `get_guard({guard_id:"jwt"}) = jwt.fast-auth.testnet`. Source: `#[payable] sign` forwards `attached_deposit` to MPC and **refunds `original_deposit` to the caller** on guard failure, MPC failure and success. On chain: `sign` succeeds with deposit **1** (`FzULQ33cjnR4HFc9iBGzR5V8oScLhJuUKAHqeixjFgLE`, 2026-09-26) and **2E+24** (`Aw75JRVq…`, 2026-09-25). FzULQ33c… logs: `MPC signing successful: EdDsa(EdDsaSignResponse { scheme: "Ed25519", … })` | ✅ exists. ❌ **Correction to D-21 (Rev 3 keeps 2 NEAR "until proven"): proven now.** 1 yocto suffices, so drop the 2 NEAR-per-slot reserve (architecture O-1 was right). Side finding (M-7): the logs show `path: "jwt#…#google-oauth2\|<Google sub>"` |
| F-07 | 1Click `/v0/tokens` and a dry quote work without a JWT | `GET https://1click.chaindefuser.com/v0/tokens`; `POST /v0/quote` `{dry:true, FLEX_INPUT, slippage 100, Base USDC → nep141:17208628…, 150 USDC, refundType INTENTS, recipient implicit}` with no key | Tokens: HTTP 200, 205 entries including `nep141:17208628…36133a1` (near, 6 dp). Quote: **HTTP 201**, `appFees [{fee: 1}]` (1 bp injected), `amountOut 149968090`, `minAmountIn 148500000`, `refundFee "0"`, `withdrawFee "6492"` (unregistered recipient), `depositAddress null` (dry), ed25519 `signature` present | ✅ |
| F-08 | near-sdk 5.29.1 and near-workspaces 0.23.0 are the latest non-RC; next 16.4.2 and the advisory range | crates.io API; npm registry; GitHub repo advisory API; GitHub global advisories; npm bulk advisory API | crates.io `max_stable_version`: near-sdk **5.29.1** (2026-09-17; newest 5.30.0-rc.1, 10-19), near-contract-standards 5.29.1, near-workspaces **0.23.0** (newest 0.24.0-rc.2), cargo-near 0.22.0 (newest 0.23.0-rc.2). npm `next` latest **16.4.2** (2026-10-15; 16.4.1 on 10-14, 16.4.0 on 10-06). `GHSA-673q-mjm6-r5xr`: critical, "Unauthenticated Remote Code Execution in `use cache` functions returning typed arrays", range `>=16.0.0 <= 16.4.0`, patched `16.4.1`, published 2026-10-14. Global advisory DB: **404** for that id. npm bulk API for `next@16.4.0`: **`{}`** (for 16.0.0 it lists 20+ older advisories) | ✅ versions and range. ⚠️ **New risk (M-8):** `pnpm audit` can't flag it yet |
| F-09 | Mainnet USDC metadata and storage bounds | M `ft_metadata`, `storage_balance_bounds`, `ft_total_supply`, `view_account` on `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` | `{"spec":"ft-1.0.0","name":"USDC","symbol":"USDC","decimals":6}`; bounds `min = max = 1250000000000000000000`; supply `77388746560469`; code `DVJx7F3d…`; `is_blocklisted` exported | ✅ |
| F-10 | NEP-448 zero-balance limit is 770 B; account creation charges 0.007 NEAR | GitHub `near/nearcore@8d697a9` (master, 2026-10-21) `runtime/runtime/src/verifier.rs`; NEP-448 text; `runtime_configs/85.yaml`; live T and M `EXPERIMENTAL_protocol_config` | `verifier.rs:25 pub const ZERO_BALANCE_ACCOUNT_STORAGE_LIMIT: StorageUsage = 770;` NEP-448: `100 + (131 + 40) * 2 + (42 + 40) * 4 = 770` (4 FAKs + 2 FC keys). `85.yaml: account_creation_charge: { old: 0, new: 0.007 N }`. Live: `account_creation_charge = 7000000000000000000000` on both networks | ✅ (2 FAKs = 264 B; 7 FAKs = 674 B, which fits R12's "≤ 6 device keys" + MPC) |
| F-11 | 1 PGas per tx and 100 actions per receipt on testnet | T and M `EXPERIMENTAL_protocol_config`; `gas_price` | Both: `max_total_prepaid_gas 1000000000000000`, `max_gas_burnt 1e15`, `max_actions_per_receipt 100`, logs 100 / 16384 B, args 4 MiB, tx 1.5 MiB, `min_gas_purchase_price 1e9`. Live `gas_price` 1e8 on both. `burnt_gas_reward` 0 (testnet) vs 3/10 (mainnet) | ✅ |
| F-12 | Hackathon window and agent rules | `GET https://nearhackathon.com/HACKATHON.md` (HTTP 200, 12,588 B, sha256 `39fd3939…`) | Starts `2026-11-01T00:00:00Z`; development ends `2026-11-14T23:59:00Z`; "Outside that window the API answers 403"; judging 11-16, results by 11-18. "Never without the human's explicit confirmation: Send the submission… Post anything… Make the repository public, push, or force-push. Sign transactions, spend tokens or deploy to mainnet. Commit secrets." | ✅ (CLAUDE.md's "testnet included" is stricter, which is fine) |
| F-13 | JWKS keys; RS256 | `GET login.testnet.fast-auth.com/.well-known/jwks.json` and `openid-configuration` | kids `LNPfzjbR4nX1k3LLOiCkm`, `UCoJR8zvMKACwbQxLOlro` (RS256). Discovery: `id_token_signing_alg_values_supported ["HS256","RS256","PS256"]` | ✅. Pin RS256 explicitly |
| F-14 | The shared client accepts only localhost:3000 and example.fast-auth.com | `GET /authorize` (no login) with `redirect_uri=https://pot-review-probe.vercel.app` vs `http://localhost:3000` | 403 "Callback URL mismatch. https://pot-review-probe.vercel.app is not in the list of allowed callback URLs"; localhost → 302 `/u/login/identifier` | ✅ |
| F-15 | A server-bound OIDC nonce is possible with auth0-spa-js (for M-1) | GitHub `auth0/auth0-spa-js@v2.28.4` `src/Auth0Client.ts:566`, `src/Auth0Client.utils.ts:88-102` | `const nonce = encode(createRandomString())`; `getAuthorizeParams` returns `{…clientOptions.authorizationParams, …authorizationParams, …, state, nonce, …}`, so a caller's nonce is overwritten | ❌ not possible with the SDK; needs a custom PKCE flow |
| F-16 | The DAO factory (= the hub) can push DAO code; "2-week delay on mainnet" | GitHub `278adc7` and `2b0f34a` `sputnikdao2/src/upgrade.rs`, `lib.rs new()` | `update()`: `predecessor == current_id \|\| (predecessor == factory_info.factory_id && factory_info.auto_update)` → `deploy_contract(env::input())` + `migrate`, **no delay** in either. `new` sets `FactoryInfo{factory_id: predecessor, auto_update: true}`; the default factory is the parent account | ✅ for contracts-spec INV-14 and §9.2. ❌ **Correction:** contracts-patterns.md §G says "On main/mainnet, a factory-pushed update … applies only after 2 weeks". That holds only for `main` HEAD `5434a59`, not the deployed mainnet `2b0f34a` |
| F-17 | Sputnik `Finalize`, `RemoveProposal` and vote semantics (§3.5 here) | GitHub `278adc7 proposals.rs:602-700`, `policy.rs:333-410` | `RemoveProposal => self.proposals.remove(&id)` (no status check). `Finalize`: `proposal_status` over **all** roles; asserts `InProgress\|Failed`; Approved → execute; Expired → reject; else `ERR_PROPOSAL_NOT_EXPIRED_OR_FAILED`. Expiry is checked first | ✅ |
| F-18 | The mainnet DAO global code `DtHZ…` exists (D-03 clip) | M `view_global_contract_code` | 444,088 B, sha256 `bf6f951e…7f6`, base58 = `DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF` | ✅ (matches contracts-spec §1.4) |
| F-19 | Vercel fork protection and Secret env vars | `GET vercel.com/docs/git/vercel-for-github.md`, `…/sensitive-environment-variables.md` | "If you receive a pull request from a fork … Vercel will require authorization … You can disable Git Fork Protection". "Secret values are write-only after saving"; "Secrets are allowed in Development" | ✅ (keep fork protection on; never put Secrets in Development) |
| F-20 | The pinned npm dependencies have no known advisories | npm registry `dist-tags`; npm bulk advisory API | `{}` for near-api-js 7.3.1, @hot-labs/near-connect 0.11.4, @noble/curves 2.2.0, @auth0/auth0-spa-js 2.28.4, drizzle-orm 0.45.4, web-push 3.6.7, react/react-dom 19.3.1, pg 8.23.1, borsh 2.0.0, grammy 1.46.0, resend 6.34.1, @tanstack/react-query 5.104.5, zod 4.6.7. near-api-js 7.3.1 and near-connect 0.11.4 are `latest` | ✅ |

**Corrections found:**
- F-04a: testnet is protocol 88, not 87.
- F-06: D-21 Rev 3's 2 NEAR reserve isn't needed; 1 yocto is proven.
- F-15: an OIDC nonce can't be bound to the device with auth0-spa-js.
- F-16: contracts-patterns.md §G's "2-week delay on mainnet" applies to `main` only, not the deployed build.

---

## 5. Exact edits recommended to other plan files

Each edit gives the file, the section and the proposed text. "Add" appends; "Replace" swaps the quoted sentence.

### decisions.md

- **ED-01 · D-05, last bullet.** Replace "The owner's `set_config` can change the float and limits and pause the hub. It can never move money." with:
  > The owner's `set_config` can change the float, the limits and the sponsor list, and pause the hub. It can never move USDC or change rules or membership. Its reach over hub NEAR is bounded in code: `dao_float ≤ 0.25 NEAR`, `min_hub_reserve ≥ 1 NEAR`, a two-step `owner` change, and the on-chain sponsorship budgets. **Relayer quotas are not a security boundary for hub NEAR or Pot funds:** every hub method can be called directly. So the hub sponsors only calls whose `env::signer_account_id()` is in `config.sponsors` (the relayer; NEP-366 makes it the signer), and other callers attach the cost. All sponsored spending is capped per Pot, per account and globally per UTC day (review-security C-1, H-4).
- **ED-02 · D-08, add.**
  > Defaults (review-security H-1): the invite made at creation expires in 7 days with `max_uses` 10; `add_invite` requires an expiry of at most 30 days. A new member can vote at once, but instant spends need `contributed > 0` (reason `new_member` → vote; H-10 confirms). Every member gets a push when someone joins through a link, with Revoke.
- **ED-03 · D-13, add.**
  > Lock `usdc.<root>` right after the reserve split (Nov 2): it has no admin method, and a token bug means `usdc2` + `pots-v2` anyway. Until the hub lock, the hub's key can approve transfers in every DAO and push DAO code (Sputnik `update()` is immediate in 278adc7 and 2b0f34a). Keep the hub, root and usdc keys out of the OS user that runs agents (`sign-with-ledger` or a separate macOS user), and alert on any tx signed by `pots.<root>` other than a planned deploy. Mainnet hub: `sponsors []`, `paused: true` outside the recording, then close the clip Pots and lock or delete the hub.
- **ED-04 · D-21, replace the Rev 3 bullet** with:
  > The `sign` deposit is **1 yocto** (proven: testnet `sign` tx `FzULQ33cjnR4HFc9iBGzR5V8oScLhJuUKAHqeixjFgLE` attached 1 yocto and logged "MPC signing successful"; fast-auth refunds the deposit on every path). No 2 NEAR reserve per slot. Before calling `sign`, the server checks `derived_public_key(sub)` == the delegate's `public_key`.
- **ED-05 · D-24, Receivers bullet.** Replace "DAOs matching `*.pots.<root>` (`act_proposal` with `VoteApprove` / `VoteReject` / `Finalize`)" with:
  > DAOs matching `*.pots.<root>`: `act_proposal` with `VoteApprove` / `VoteReject` / `Finalize`, **only on proposals the hub tracks** (`pots.get_subject(pot, id)` non-null); `Finalize` at most 3 per proposal per UTC day. Plus a per-user daily yocto cap, and demo relays drawn only from the demo budget.
- **ED-06 · D-33, add.**
  > Demo protections: lease limits per IPv6 /64 and IPv4 /24, plus a global daily cap; untouched leases recycle after 15 min; demo sessions can't `create_pot`; the shared Pot refuses close and is replaced when below $300 or not Open; the simulator delivers ≤ $150 per demo session; hub floats and prepays count in `demo_yocto`. The reference Pot's personas use a key kept only on the laptop, never `DEMO_PERSONA_KEY`.

### contracts-spec.md

- **ED-07 · §2.2 `HubConfig`, add a field:** `pub sponsors: Vec<AccountId>, // ≤ 4; accounts whose signed (relayed) calls the hub sponsors; [] on mainnet`. `new` takes it, and `ConfigPatch` (§3.10) gains `sponsors: Option<Vec<AccountId>>`, so a rotated relayer (`users2`, accounts-and-deploy §5.1) can be added after the lock. **§2.2 `Limits`, add:**
  ```rust
  pub max_pots_per_day: u32,                      // global per UTC day, incl. demo seeding (default 40)
  pub max_sponsored_per_day: NearToken,           // hub NEAR spent on floats, prepays and new state per UTC day (default 3 NEAR)
  pub max_sponsored_per_account_day: NearToken,   // per predecessor (default 0.1 NEAR)
  pub max_sponsored_per_pot_day: NearToken,       // per Pot (default 0.15 NEAR)
  pub max_open_rules_proposals: u32,              // per Pot (default 1)
  pub close_cooldown_ms: u64,                     // per proposer after a Rejected/Expired close (default 24 h)
  ```
  **§2.1 `StorageKey`:** add `SponsorDaily` (global, `account:<id>` and `pot:<idx>` keys → `{day, yocto, count}`). It must be in the Nov 6 layout.
- **ED-08 · §3.0 Conventions, after "Free balance", add:**
  > **Sponsorship.** A call that makes the hub spend NEAR (float, USDC registration, prepay, new state) is *sponsored* only when `env::signer_account_id() ∈ config.sponsors`. This decides who pays; it is never used for authorization, which stays on `predecessor`.
> - A sponsored call must attach **0** (T-81 keeps asserting that).
> - Any other call needs `attached_deposit ≥ cost(op)` (`ERR_SPONSOR_REQUIRED`). The hub keeps the excess. A synchronous panic refunds the deposit to the caller, who also paid it.
> - Sponsored costs are charged at the estimate, synchronously, against the global, per-account and per-Pot daily budgets in `Limits` (`ERR_SPONSOR_LIMIT`), and corrected in the callback.
> - The hub-funded methods (`create_pot`, `request_spend`, `join`, `add_invite`, `propose_rules`, `propose_close`) become `#[payable]` only for this purpose. The relayer never attaches a deposit to them.
>
> (review-security C-1)
- **ED-09 · §3.2 `create_pot`, Synchronous checks, add:** `pot_count_today ≥ max_pots_per_day` → `ERR_GLOBAL_DAILY_LIMIT`; the sponsorship rule above. **Float:** change the testnet default to 0.03 NEAR (base storage ≈ 0.012 + margin; prepay covers proposals). **`on_pot_created` Ok:** the optional invite becomes `Invite{expires: now + 7 d, max_uses: Some(10)}`.
- **ED-10 · §3.4 decision function, add a row before row 10:**
  > | 9b | `member.contributed == 0` | **vote**, reason `new_member` (H-1; H-10 confirms) |
  
  Add `NewMember` to `enum Reason`, and `new_member` to `SpendPreview.reason`.
- **ED-11 · §3.5 `sync` mapping (Spend), replace the expiry clause with:**
  > `Expired`, or `InProgress` with the DAO's `submission_time` + `proposal_period` < now → `expired`. `expired` may move to `approved`/`payout_failed` if the DAO later reports it (the DAO is the source of truth).
  
  **Add a method `reap(pot, request_id)`** (anyone): a request in `checking`/`proposing` with no `proposal_id` and `updated_at_ms` older than 1 h → transition to deleted and release its reservations. Likewise a `Joining{None}` member older than 1 h → delete and release (review-security L-2).
- **ED-12 · §3.7 `add_invite`, Checks:** replace "`expires_at_ms > now + 60 000`" with "`expires_at_ms` **required**, in `(now + 60 000, now + 30 d]`". **`join`:** after `on_join_status` Approved, emit `member_joined` (already) and let the relayer notify **all** members (api-spec §6.1).
- **ED-13 · §3.8 `propose_rules`, add:**
  > At most `max_open_rules_proposals` open rules proposals per Pot (`ERR_RULES_PENDING`; a rules subject counts as open until `sync` sees it resolved) and 3 per Pot per UTC day. Sponsored per §3.0.
- **ED-14 · §3.9 `propose_close`, Checks, add:**
  > `ERR_CLOSE_COOLDOWN` if the same proposer's last close was Rejected or Expired less than `close_cooldown_ms` ago, or any close was proposed in this Pot in the last 24 h.
- **ED-15 · §3.10 `set_config`, replace "Same validation as `new`" with:**
  > Same validation as `new`, plus hard bounds in code: `dao_float ≤ MAX_DAO_FLOAT` (0.25 NEAR), `min_hub_reserve ≥ 1 NEAR`, `sponsors.len() ≤ 4`, and every sponsor budget ≤ 10× its default. `owner` changes in two steps: `propose_owner(new)`, then `accept_owner()` called by `new`.
  
  Replace "What the owner can't do: move money; …" with:
  > What the owner can't do: move USDC; touch rules, members or requests; change `usdc` or the DAO code; push hub NEAR anywhere except through the bounded float and sponsor budgets.
- **ED-16 · §3.11, replace** "`extra_votes = 0 for hub-approved kinds | approvals_needed …`" with "`extra_votes = 0` for hub-approved kinds, `member_count` for member-voted kinds (every member may vote, including rejections)". **Monitoring and backstop:** replace the backstop bullet with:
  > Top-ups only for demo and reference Pots, at most 2 per DAO lifetime, and never for a DAO that has run a NEAR `Transfer` (`token_id ""`). Note: `store_blob` is callable by anyone and under-charges ≈ 137 B per call (review-security M-4).
- **ED-17 · §4 Views, add a row:**
  > | 🆕 `get_subject` | `(pot, proposal_id: u64)` | `Option<SubjectView>`: `{"kind":"spend"\|"join"\|"close"\|"rules","request_id":…,"member":…,"rules_version":…}`. The relayer (R11) and the UI use it to tell hub proposals from member-created ones |
- **ED-18 · §7.1, add invariants:**
  > INV-18: the hub's NEAR outflow per UTC day is ≤ `max_sponsored_per_day` + Σ deposits received, per predecessor ≤ `max_sponsored_per_account_day`, and per Pot ≤ `max_sponsored_per_pot_day`, whatever the call path (relayed or direct).
  >
  > INV-19: `set_config` can't raise `dao_float` above `MAX_DAO_FLOAT` or lower `min_hub_reserve` below 1 NEAR.
- **ED-19 · §7.2 test matrix, add:** T-88…T-100 and PR-05 as defined in §3 of review-security.md:
  - T-88: global Pot cap;
  - T-89: direct vs relayed sponsorship;
  - T-90: float extraction bound;
  - T-91: `new_member`;
  - T-92: invite defaults;
  - T-93: `set_config` bounds and two-step owner;
  - T-94: prepay covers `member_count` votes; `store_blob` measurement;
  - T-95: close cooldown;
  - T-96: unregistered payee → Failed → re-register → Finalize;
  - T-97: removed member (if `prune_members` is built);
  - T-98: `reap`;
  - T-99: late `sync` transition;
  - T-100: `get_subject`.
  
  Also fix **T-26**'s assertion to "at most one succeeds and nothing overdraws".
- **ED-20 · §9.2 mainnet hub init:** add `"sponsors": []` and `"paused": true` (unpaused only during the recording window).

### api-spec.md

- **ED-21 · §0.2, add after the CSRF paragraph:**
  > **Security headers (all routes, static):** `X-Frame-Options: DENY`; `Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; connect-src 'self' <RPC_URLS> https://tx.test.fastnear.com https://login.testnet.fast-auth.com` (enforced, no nonce needed); `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin` (`same-origin` on `/j/*`); `Permissions-Policy: camera=(), microphone=(), geolocation=()`. `POST /api/session/dev` refuses to boot when `VERCEL_ENV === 'production'`.
- **ED-22 · §2.1 `POST /api/session`, step 4, "found" branch, add:**
  > If the device isn't on chain, the session is `pending_device`: only GET routes, `POST /api/devices` and logout. Notes, nudges, faucet, push, `PATCH /api/me` and pairing → 403 `device_not_registered`.
  
  **§4.3 ID token, add:**
  > Verify with `jose` `{algorithms: ['RS256']}` (the tenant also advertises HS256 and PS256). Production accepts only a Pot-dedicated `aud`. With the shared client `np8paq…`, NEAR Auth stays localhost-only: any whitelisted origin could replay its ID tokens here, and auth0-spa-js can't bind a nonce.
- **ED-23 · §2.2 pairing.** `POST /api/devices/pair` Validation, add:
  > The session's bound device must be `active` **and** on chain (`view_access_key`). `complete` must be signed by that same device key. On completion, send a `device_added` push/email to the user's other devices.
  
  Add **`DELETE /api/devices/[publicKey]`** (Phase 2, R13): relays `DeleteKey(pk)` on the own account, signed by the MPC key (NEAR Auth popup) or another active device. Never the stored `mpc_public_key`.
- **ED-24 · §2.4 Faucet, Steps 1, replace with:**
  > `storage_balance_of(account)`. If null **and** the account was never registered by us before (`relay_log` key `register:{account}`), the relayer pays `storage_deposit`; otherwise 409 `registration_used`. Minimum claim 50000000 ($50). Count it in `global/registrations`.
- **ED-25 · §2.5 feed.** Auth, replace "Everyone gets items and profiles" with:
  > Everyone gets items. `profiles` go only to members and demo sessions (anonymous reads of demo Pots keep them). The lazy reconcile runs only for member or demo requests.
- **ED-26 · §2.7.** `QuoteReq`: `amount` ≤ 500000000 in simulated mode. `SimulateReq.amount`:
  > ≤ min(quote amount, 500000000); demo sessions ≤ 150000000. Delivered amounts count toward `faucet_usd` per account, visitor and IP, and globally (→ 429 `quota_exceeded`, family `faucet`).
- **ED-27 · §2.8 / §7.5 Demo limits, replace with:**
  > Leases: 10 per day per IPv6 /64 or IPv4 /24 (hashed), 150 per day globally. A lease with no on-chain action after 15 min goes back to `ready`. Visitor quotas are keyed by `visitor:{hash}` **and** `ipnet:{hash}`. Demo sessions can't `create_pot`. In the shared Pot, `propose_close` and close votes → `demo_forbidden`; a shared Pot below $300 or not Open is replaced at the next lease. `demo_yocto` includes the hub's float and prepay estimates. Demo relays don't consume `global/relay_yocto`. Reference personas sign with a laptop-only key, so no demo intent can reach them.
- **ED-28 · §3.1 R11, Argument constraints, add:**
  > `id` is hub-tracked: `hub.get_subject(pot, id)` non-null (cached 60 s), else 403 `proposal_not_tracked`. `FunctionCall` kinds are allowed only for subjects `close` and `rules`. `Finalize` at most 3 per proposal per UTC day. For a close, all payees must be registered first: the relayer runs `storage_deposit` (registration only) for any that aren't.
  
  Add `proposal_not_tracked` to §1.2. **R5:** replace "`expires_at_ms` null or in (now, now + 90 days]" with "`expires_at_ms` **required**, in (now, now + 30 days]".
- **ED-29 · §3.5, add counters:**
  > `user:{id}`/`relay_yocto` 0.2 NEAR (prod), 0.1 (preview). `global`/`hub_yocto` and `user:{id}`/`hub_yocto`: estimates of hub spending per op (create 0.04 at float 0.03, request_spend 0.011, join 0.009, propose_rules 0.009, propose_close 0.016 + 0.0025·n) with caps of 3 NEAR and 0.1 NEAR. `global`/`registrations` 200.
  
  Pre-charge `FunctionCall` votes and `Finalize` at 0.03 NEAR. **"each DAO" row:** replace the backstop text with the ED-16 rule.
- **ED-30 · §6.1 `member_joined`, Recipients:** replace "the Pot creator (and the inviter, if different)" with "every member, with a [Make a new link] action".

### architecture.md

- **ED-31 · §2.1 "Honest limit", add:**
  > A member majority can do anything a Sputnik DAO allows, immediately: move all money, add or remove members, change the policy, upgrade the DAO's code. Until the Nov 12 lock, the team's hub key is a rulebot and the factory for every DAO: it could approve transfers and push code. After the lock, nobody can. Invite links are bearer credentials: anyone holding one can join and vote.
- **ED-32 · §2.4 table.**
  - Replace the "Pot-creation spam" row's residual with: "bounded on chain by `max_pots_per_day` and the sponsor budgets; direct (self-paid) calls must attach the cost (review-security C-1)".
  - Add a row: "Votes or Finalize on member-created proposals | ≈ 0.03 NEAR per 300 Tgas `FunctionCall` | R11 hub-tracked only, Finalize ≤ 3/day, per-user yocto cap | none".
  - Add a row: "Simulated deposits | treasury USDC | capped like the faucet | none".
- **ED-33 · §2.5 privacy table, add rows:**
  > | Google account id (`sub`) ↔ Pot account | chain: the MPC `sign` logs `path …#google-oauth2\|<sub>`, and the signed `AddKey` names the account (new-device flow only) | everyone; prefer pairing; disclose |
  > | Pot slugs and names | chain (`pot_created`) | enumerable; the random suffix is not a privacy control |
  
  Replace the display-names row's "anyone who knows the Pot slug" with "anyone holding an active invite link (`?i=`); members; demo visitors".
- **ED-34 · §4.7 Secrets, add:**
  > Hub, root and usdc keys never live in `~/.near-credentials` of the OS user that runs Claude Code. Use `sign-with-ledger` or a separate macOS user. The Read deny rules don't stop `Bash`. Never add Secret env vars to Development. Keep Git Fork Protection on after the repo goes public.

### accounts-and-deploy.md

- **ED-35 · §3.4, add step 5:**
  > 5. Lock the token now: `near account list-keys $USDC …` (1 row), then `near account delete-keys $USDC public-keys <that key> …`. It has no admin method, and keeping its key means anyone holding it can rewrite every Pot's balance.
  
  Remove the token lines from §3.10.
- **ED-36 · §1.5 Key custody, rule 1, add:**
  > Root, hub (prod), `usdc` and `reserve` keys: `sign-with-ledger` where possible; otherwise a separate macOS user with its own `~/.near-credentials`, not readable by the account that runs agents.
  
  **§1.1:** reference personas `maya-ref`/`sam-ref`/`leo-ref` (laptop-only key, never in Vercel). The shared Pot keeps `maya`/`sam`/`leo` with `DEMO_PERSONA_KEY`.
- **ED-37 · §3.10, pre-lock checklist, add:**
  > 6. No tx signed by `$HUB` since the last deploy except planned ones (FastNEAR Tx API, signer = `$HUB`). 7. `get_config().sponsors` = [prod relayer] and the sponsor budgets are set.
  
  **§5.4, replace** "That is a denial of service only. The owner can't move money or change rules" with:
  > Denial of service, plus bounded NEAR: within `MAX_DAO_FLOAT` and the sponsor budgets, an owner can push hub NEAR into a Pot they control. It can't move USDC or change rules.
- **ED-38 · §3.12 mainnet:** init with `"sponsors": []` and `"paused": true`; unpause only for the recording; afterwards close the clip Pots (`propose_close`, works while paused) and lock or delete `pots.<root>.near`. With `sponsors: []` the clip personas attach each hub call's cost themselves (≈ 0.12 NEAR for `create_pot` at float 0.1); add that to the §2.5 budget.
- **ED-38b · §3.5 `init_hub` and §3.8 reference Pot.** Pass `"sponsors":["$RELAYER"]` (preview: `$RELAYER_PV`) to `new`. The §3.8 CLI steps sign as the personas directly, so they are **not** sponsored. Either attach the cost (`create_pot … attached-deposit '0.05 NEAR'`, `join … attached-deposit '0.01 NEAR'`; the hub keeps any excess), or seed through `/api/relay` like the Workflow does. The 0.5 NEAR per persona already covers it.

### frontend-architecture.md

- **ED-39 · §1.5 `headers()`:** add the global security headers of ED-21 (`source: '/:path*'`). **§4.3 Security notes:** replace "a CSP in report-only mode from day 11" with:
  > An enforced, nonce-free CSP from Nov 6 (`frame-ancestors 'none'`, `connect-src` allowlist, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`) plus `X-Frame-Options: DENY`. A report-only `script-src` experiment from day 11. ESLint `react/no-danger`.
- **ED-40 · §5.4 Approve, add:**
  > Approve and decline only for hub-tracked proposals (`get_subject`). Render the amount and receiver decoded from `get_proposal(id).kind`. For close, decode the `FunctionCall` args (base64 JSON) and require them to equal `preview_close.payouts`; for rules, decode `set_rules` args. On a mismatch, show `generic.error` and don't sign. Other `InProgress` proposals show as a read-only "Direct change (not created by Pot)" card with the decoded kind.
  
  **§5.3:** before resuming an `autoVote`, check that the proposal's hub request has `requester == me` and `request_ref == op.id`.
- **ED-41 · §2.5 landing:** member names and avatars render only when `?i=` resolves to an `active` invite; otherwise show the Pot name, emoji, member count and balance. **OG image:** initials and the count only. **§2.6:** `?as=` auto-submit only when `NEXT_PUBLIC_FLAG_DEMO_AUTOSUBMIT` is on (preview) and `pot_hint.kind` is missing or `demo`.
- **ED-42 · §5.5 Add money, add:**
  > When `balance < total contributed`, show "If the Pot closed now you'd get back {x} of this" under the amount (`add.dilution`, ⓟ) (review-security M-6).
  
  **§9.3 lint:** reject Unicode Cf characters (except ZWJ U+200D and VS16 U+FE0F) in names and memos client-side too.

### test-plan.md

- **ED-43 · §6, add rows A-21…A-33** as defined in review-security.md §1/§3. **§5.2, add E-12** (nightly abuse run on preview: lease rotation within one /64, direct-call sponsorship probes with a funded throwaway account, simulator caps; assert the budgets hold and nothing returns 5xx). **§9.1, add W-08** (security headers on every route). **§3.2, add U-11** (Cf/bidi rejection, emoji without ASCII).
- **ED-44 · §7 `security` job, replace** "`pnpm audit --prod` for critical advisories (next ≥ 16.4.1 rule, D-40)" with:
  > `pnpm audit --prod` **plus** SEC-1: a script asserts the lockfile's `next` ≥ 16.4.1 and `react` ≥ 19.3.1 (GHSA-673q-mjm6-r5xr is not in the npm advisory database on 2026-10-21, so audit alone misses it). SEC-2: `cargo audit` and `cargo deny check` on `contracts/`.

### implementation-plan.md

- **ED-45 · §3.2 C-02, add:** "`sponsors`, the sponsor budgets, `SponsorDaily`, `get_subject` and `reap` in the v1 layout (review-security C-1, H-2, L-2)". **C-05:** "lock `usdc` after §3.4 (ED-35)". **§3.3 B-03:** "R11 hub-tracked only; per-user `relay_yocto` and `hub_yocto` counters". **X-17 (Nov 11), add:** "re-run review-security §1 (every Critical and High closed), SEC-1 and SEC-2, W-08, the E-12 abuse run, and check the key-custody rules".

### KB errata (owned by kb/, listed here)

- **ED-46 · kb/meta-tx-relayer.md** "Protocol parameters" table, **kb/contracts-patterns.md** §F heading, and **kb/sputnik-dao.md** "Protocol 87 limits": testnet is **protocol 88** (nearcore 2.14.0-rc.5) since ≈ 2026-10-21 08:00-14:00 UTC; the limits are unchanged.
- **ED-47 · kb/contracts-patterns.md §G "Sputnik-side trust",** replace "On `main`/mainnet, a factory-pushed update first appears as an `UpgradeSelf` proposal and applies only after 2 weeks" with:
  > On `main` HEAD (`5434a59`) a factory-pushed update waits 2 weeks. The **deployed** builds (mainnet `2b0f34a`, testnet global `278adc7`) apply `update()` from the factory immediately (`upgrade.rs`).
- **ED-48 · kb/near-auth.md, Gotchas, add:**
  > A `sign` call's logs and args publish `path …#<sub>` on chain, so a Google subject id becomes public and linked to the account named in the signed payload. A 1-yocto deposit is enough (tx `FzULQ33c…`).

---

## 6. Open questions for humans

1. **H-10 (Cerasela):** may a member who hasn't put money in make instant spends (H-1)? This review recommends no.
2. **H-01 (human):** ask NEAR Auth for a **dedicated** testnet client id, not only whitelisting on the shared client (M-1).
3. **P1:** accept the signer-based sponsorship rule (C-1)? It adds `#[payable]` to the hub-funded methods for direct callers only. The relayer still attaches 0.
4. **Lead:** lock the token on Nov 2 (H-4)?
5. **Lead:** cut `transfer:RemoveProposal` from the day-1 policy if `withdraw_request` (C-19) won't ship? It is harmless after the lock, but widens the pre-lock blast radius. (Resolved in Rev 5: cut, and `withdraw_request` is Phase 3, not built; §7.3 #5.)

---

## 7. Resolution (Rev 4, 2026-10-21)

The lead accepted the fixes below as decisions.md **Revision 4** (S-1…S-10) and they are now in the plan. Where the lead's decision differs from §5's proposed text, the "Notes" column says how. Status: **fixed** (in the plan; file and section given), **partly** (the core is fixed, the rest deferred), **deferred** (owner and risk or task ID), **human** (a person decides; tracked in decisions.md §9 and phase0-checklist).

### 7.1 Per finding

| ID | Status | Where it is fixed, or who owns it | Notes |
|---|---|---|---|
| **C-1** | fixed (S-1) | contracts-spec §0 #13, §2.1-§2.3, §3.0 "Sponsorship", §3.2, §3.4 row 12, §3.7, §3.8, §3.9, §3.10, §3.13, §7.1 INV-18/INV-19, §9.2; api-spec §3.1 general rules, §3.5 `hub_yocto`; architecture §2.4; accounts-and-deploy §3.0, §3.5, §3.8, §3.12; decisions D-05. Tests T-89, T-90, PR-05, A-23, E-12 | The field is `config.relayers` (not `sponsors`) and the error `ERR_DEPOSIT_REQUIRED` (not `ERR_SPONSOR_REQUIRED`); direct callers' excess is refunded. On-chain caps: 3 Pots per creator per UTC day, **50 sponsored** Pots per UTC day (direct, paid creations don't count), ≤ 1 open rules proposal, ≤ 1 open close proposal. The float stays 0.05 (not 0.03). The on-chain NEAR budgets per account / per Pot / per day and "3 rules proposals per Pot per day" are **deferred** (P1, R-33); the relayer's per-user and global `hub_yocto` counters cover the relayed path. Mainnet: `relayers: []` (no pause window) |
| **H-1** | fixed (S-3) + human (H-10) | contracts-spec §2.3, §3.2, §3.4 row 9b, §3.7, §6; api-spec §3.1 R5, §6.1 (`member_joined` to every member); ux-spec §4.13, §5 (rev4); frontend §5.10; decisions D-08, D-60. Tests T-93, T-94, A-24, M-18 | Default links: 7 days, 10 uses; `add_invite` defaults to the same when called without arguments, at most 30 days and 40 uses. Instant spends need `contributed > 0` (Cerasela confirms, phase0-checklist §5 #26). "Joins beyond N go to a vote" is **deferred** (R-33, R-35) |
| **H-2** | fixed (S-2) | contracts-spec §3.12, §4 `get_proposal_subject`; api-spec §3.1 R9/R11, §3.5; frontend §5.4; decisions D-24. Tests T-96, A-22, A-23, M-17 | The view is `get_proposal_subject(pot, proposal_id)` with a `live` flag (not `get_subject`). Votes need exactly 100 Tgas (Transfer, join) or 300 Tgas (`call`); `Finalize` and `retry_payout` ≤ 3 per proposal per day; per-user `relay_yocto` 0.2 NEAR and `hub_yocto` 0.3 NEAR |
| **H-3** | fixed (S-5) | api-spec §2.7; decisions D-50. Test A-27 | ≤ $500 per quote and per session per UTC day, demo sessions ≤ $150; the global cap is the shared `faucet_usd` cap |
| **H-4** | fixed (S-4) | accounts-and-deploy §1.5 (custody), §3.4 step 5 (token lock Nov 2), §3.10, §3.12, §5.4; architecture §4.7; contracts-spec §3.10, INV-15, INV-19; decisions D-05 (corrected), D-13, D-63, H-17; implementation-plan §9.2, C-05, C-22. Test T-95 | Ranges: `dao_float` ∈ [0.05, **0.5**] NEAR (review: ≤ 0.25), `min_hub_reserve` ≥ **0.5** NEAR (review: ≥ 1; 0.5 keeps the mainnet init valid). `owner` is **immutable** instead of a two-step change. Custody: a separate macOS user, a Ledger or vault import-on-demand; agents get only preview relayer keys. The cron alerts on hub-signed txs (`hub_key_used`). The mainnet hub is locked right after the clip (C-22) |
| **H-5** | partly (S-5) | api-spec §2.3, §2.8, §3.5, §5.2, §7.1-§7.5; architecture §2.3, §3.15, §4.5, §4.6; frontend §2.6; decisions D-33. Tests A-26, E-12, M-19 | Lease limits per **IPv4 address** (not /24) and IPv6 /64, 10 a day; BotID on new leases (no-JS → read-only `/demo?ro=1`); visitor quotas also keyed by IP net; `demo_yocto` includes hub costs; the reference Pot is read-only because its personas (still `maya/sam/leo`) **lose their key** after seeding (not `maya-ref` with a laptop key); the shared Pot gets fresh personas, refuses close and rules changes, and is reseeded below $300. No global lease cap (`demo_yocto` bounds seeding). **Deferred** (R-33): recycling untouched leases, a reserved judge budget. **Human:** hiding demo `create_pot` (Cerasela, phase0-checklist §5 #19) |
| M-1 | fixed (S-6) + human (H-01) | api-spec §2.1, §4.3; frontend §4.3, §4.4; architecture §3.1; decisions D-20, D-21, D-22. Tasks B-20, F-27. Test A-25 | Adopted now (not Phase 3): nonce = base64url(sha256(device_pk ‖ challenge)) via a direct `/authorize` call, because auth0-spa-js overwrites the nonce (F-15). B-20/F-27 run on Nov 9 if G4 enables NEAR Auth on a hosted origin. `pending_device` sessions limited. Residual on a shared client: R-36 |
| M-2 | partly | api-spec §2.2 (start only from an on-chain device; completed by that device; warning copy). Test A-30 | The "new device added" push is **deferred** (P1, with X-06, only if B-15 ships; R-33) |
| M-3 | fixed (S-5) | api-spec §0.2; frontend §1.5, §4.3. Test W-08 | Enforced: `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`, `X-Frame-Options: DENY`, nosniff, Referrer-, Permissions-Policy, HSTS. `connect-src` and `script-src` stay report-only (a strict `connect-src` could break NEAR Connect) |
| M-4 | fixed (S-10) | contracts-spec §3.11 (`member_count` prepay, top-up rule, `store_blob` note); api-spec §3.5. Tests T-97, T-89, A-31 | Top-ups for demo and reference Pots only, ≤ 2 per DAO |
| M-5 | fixed (S-10) | contracts-spec §3.9, §3.13 (`ERR_CLOSE_COOLDOWN`, one open close); api-spec §3.1 R11 (payee registration, `Finalize` cap). Test T-92 | The cooldown uses the latest CloseRecord (same proposer, < 24 h, Rejected or Expired) |
| M-6 | partly | contracts-spec §3.9 vector V7; submission-plan §1.6 (README limitation) | The Add-sheet hint is **deferred** (Cerasela, frontend §15 Q15, phase0-checklist §5 #28; R-33) |
| M-7 | partly | api-spec §2.5 (feed `profiles` gated); frontend §2.5 (names only with an active `?i=`, OG initials); architecture §2.5; submission-plan §1.6. Test A-29 | **Deferred** to Cerasela (frontend §15 Q14, phase0-checklist §5 #27; R-33): the Create-sheet "public" line, lock-screen-safe push text, preferring pairing for new devices |
| M-8 | fixed (S-8) | test-plan §7 `security` job (SEC-1); implementation-plan X-01 (Dependabot), X-02, §9.4; decisions D-40 | `cargo audit` / `cargo deny` (SEC-2) **deferred** (P1, optional, non-blocking; R-33) |
| M-9 | deferred | P1, Phase 3 (`DELETE /api/devices/[publicKey]`, R13; R-33); disclosed in architecture §2.1 and submission-plan §1.6 | — |
| M-10 | fixed (S-10) | frontend §5.3 (`autoVote` check), §5.4; implementation-plan F-12, F-22. Test M-17 | Transfer, close and rules approvals render the proposal's own kind |
| L-1 | partly | documented in contracts-spec §3.7 and submission-plan §1.6 | `prune_members` **deferred** (P1, Phase 3; R-33) |
| L-2 | deferred | P1, Phase 3 (contracts-spec §12 Q9; R-33) | Workaround: the majority closes with a direct DAO proposal |
| L-3 | fixed | contracts-spec §2.5, §3.0 (`submission_time`), §3.5. Test T-97 | — |
| L-4 | fixed | contracts-spec §3.2; api-spec §2.1, §2.5; frontend §4.3. Test U-11 | Plus reserved display names ("Pot", "NEAR", "Support", "Admin", "Team") |
| L-5 | fixed | frontend §2.6. Test M-19 | No preview-only flag: the nightly production E-10 uses `?as=` from a fresh context |
| L-6 | fixed | api-spec §2.4 (once per account, $50 minimum), §2.1 wallet, §3.5 `registrations`. Test A-28 | — |
| L-7 | fixed | api-spec §2.2 step 7b; decisions D-21. Test A-30 | — |
| L-8 | fixed | api-spec §2.5. Test A-29 | — |
| I-1…I-5 | disclosed | submission-plan §1.6; architecture §2.1; KB "Review corrections" (S-9) | — |
| F-04a, F-06, F-15, F-16 | fixed (S-7, S-9) | decisions D-21 (1 yocto); "Review corrections (2026-10-21)" at the end of kb/contracts-patterns.md, kb/contracts-toolchain.md, kb/sputnik-dao.md, kb/meta-tx-relayer.md, kb/near-auth.md, kb/accounts-onboarding.md, kb/backend-infra.md | — |

Other recommendations from §3:

| Item | Status | Where |
|---|---|---|
| Never relay a deposit to the hub | fixed | api-spec §3.1 general rules |
| Refuse wallet sessions for every account under `<root>` | fixed | api-spec §2.1 |
| Demo relays draw only from `demo_yocto` | fixed | api-spec §3.5 |
| Secrets never in Development; `server-only` + `taintUniqueValue`; Git Fork Protection | fixed | architecture §4.7 |
| `FLAG_DEV_SESSION` fails at boot on production | not adopted | the route already answers 404 on production whatever the flag (api-spec §2.1) |
| Rotate the preview protection-bypass link after the hallway test | fixed | implementation-plan X-17 |
| Reserved words in display names | fixed | api-spec §2.1 |
| Display names in quotes in push titles | deferred | Cerasela (notification copy); R-33 |
| Telegram without `parse_mode`; `https:`-only `href` for server URLs | fixed | api-spec §6.3; frontend §4.3 |
| OG image: slug validation before I/O, negative caching | fixed | frontend §2.5 |
| PoP messages carry the origin | not adopted | optional; R-33 |
| T-26 asserts "at most one succeeds, nothing overdraws" | fixed | contracts-spec §7.2 |
| A payout that fails during Closing | documented | contracts-spec §3.9; submission-plan §1.6 |
| `jose` pinned to RS256 | fixed | api-spec §4.3 |

### 7.2 Test IDs (this review → the plan)

T-88 was already the views test and A-21 the dev-session test, so the new tests were renumbered:
- **Contract:** review T-88 (global cap) → **T-90**; T-89 (direct vs relayed) and T-90 (float extraction) → **T-89**; T-91 → **T-94**; T-92 → **T-93**; T-93 → **T-95**; T-94 → **T-97** (prepay) and **T-89** (`store_blob`); T-95 and T-96 → **T-92**; T-97 (`prune_members`) and T-98 (`reap`) → deferred; T-99 → **T-97**; T-100 → **T-96**; PR-05 → **PR-05**.
- **API:** review A-21 → **A-23**; A-22 → **A-24**; A-23 → **A-22**; A-24 → **A-22** + **A-23**; A-25 → **A-27**; A-26 → **T-95** + X-17; A-27 → **A-26**; A-28 → **A-25**; A-29 → **A-30**; A-30 → **A-31**; A-31 → **A-29**; A-32 → deferred (M-9); A-33 → **A-28**.
- **Mocked UI:** review M-16 and M-18 → **M-17**; M-17 → deferred (M-6); M-19 → **M-19**; new **M-18** covers the invite and new-member UI.
- Unchanged: W-08, U-11, E-12 (a manual run, since GitHub holds no NEAR keys), SEC-1. SEC-2 is deferred.

### 7.3 Answers to §6 and what stays open

1. Instant spends without money in (H-1) → **human**: Cerasela, H-10 (phase0-checklist §5 #26); default **no**.
2. A dedicated NEAR Auth client (M-1) → **human**: H-01 now asks for it (preferred).
3. The signer-based sponsorship rule (C-1) → **accepted** by the lead (S-1).
4. Lock the token on Nov 2 (H-4) → **accepted** (S-4; runbook §3.4 step 5, C-05).
5. Drop `transfer:RemoveProposal` if `withdraw_request` won't ship → **resolved by decisions.md Revision 5**: the day-1 policy drops it, and `withdraw_request` (C-19) moves to Phase 3, not built during the hackathon (contracts-spec §3.2, §3.6b, §12 Q10; R-33).

New human item: **H-17**, the key-custody set-up (decisions.md §9, phase0-checklist).

---

## Appendix: evidence commands (read-only)

```bash
# helpers (scratchpad review/rpc.sh): POST JSON-RPC to a FastNEAR endpoint; view() base64-encodes args for call_function
T=https://rpc.testnet.fastnear.com; M=https://rpc.mainnet.fastnear.com
rpc.sh $T '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_global_contract_code","finality":"final","code_hash":"Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD"}}'
rpc.sh $T '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"view_account","finality":"final","account_id":"g1.potspike-dao-svuw.testnet"}}'
view $T sputnikv2.testnet get_default_code_hash '{}' ; view $M sputnik-dao.near get_default_code_hash '{}'
view $M nhrxg.sputnik-dao.near __contract_abi '{}'   # zstd → abi.json → .body.functions[] | select(.name=="act_proposal")
rpc.sh $T '{"jsonrpc":"2.0","id":1,"method":"status","params":[]}' ; rpc.sh $T '{"jsonrpc":"2.0","id":1,"method":"EXPERIMENTAL_protocol_config","params":{"finality":"final"}}'
view $T v1.signer-prod.testnet derived_public_key '{"path":"jwt#https://login.testnet.fast-auth.com/#google-oauth2|000000000000000000001","predecessor":"fast-auth.testnet","domain_id":1}'
curl 'https://api-testnet.nearblocks.io/v1/account/fast-auth.testnet/txns-only?per_page=25&order=desc'
curl -d '{"tx_hashes":["FzULQ33cjnR4HFc9iBGzR5V8oScLhJuUKAHqeixjFgLE"]}' https://tx.test.fastnear.com/v0/transactions
curl https://1click.chaindefuser.com/v0/tokens ; curl -d @quote.json https://1click.chaindefuser.com/v0/quote   # dry:true
curl -H 'User-Agent: …' https://crates.io/api/v1/crates/near-sdk ; curl https://registry.npmjs.org/next
curl https://api.github.com/repos/vercel/next.js/security-advisories/GHSA-673q-mjm6-r5xr ; curl https://api.github.com/advisories/GHSA-673q-mjm6-r5xr
curl -d '{"next":["16.4.0"]}' https://registry.npmjs.org/-/npm/v1/security/advisories/bulk
view $M 17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1 ft_metadata '{}'   # and storage_balance_bounds
curl https://raw.githubusercontent.com/near/nearcore/master/runtime/runtime/src/verifier.rs   # line 25
curl https://nearhackathon.com/HACKATHON.md
curl https://login.testnet.fast-auth.com/.well-known/jwks.json ; curl -o /dev/null -w '%{http_code}' 'https://login.testnet.fast-auth.com/authorize?client_id=np8paqIpMWmNbzT4xAvOOapZBjsOpptl&response_type=code&redirect_uri=https%3A%2F%2Fpot-review-probe.vercel.app&scope=openid&state=probe&nonce=probe&code_challenge=…&code_challenge_method=S256'
curl https://raw.githubusercontent.com/near-daos/sputnik-dao-contract/278adc713e795f95a6da4d3007c7e03e8120f153/sputnikdao2/src/{proposals,upgrade,policy,lib}.rs   # and 2b0f34a…
curl https://raw.githubusercontent.com/Peersyst/fast-auth/main/contracts/fa/src/lib.rs
curl https://raw.githubusercontent.com/auth0/auth0-spa-js/v2.28.4/src/Auth0Client.ts
```
