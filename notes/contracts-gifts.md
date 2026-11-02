# Contracts: gifts (hub 1.2.0)

> Owner: the contracts engineer. Written 2026-11-02. Spec: [gifts-plan.md](gifts-plan.md) (approved by the owner).
> Sandbox only: **no transaction was signed, nothing was deployed, nothing was committed.** The testnet upgrade in §6
> needs the human's explicit OK.
> Code: `contracts/pot-hub/src/gifts.rs` (new), `lib.rs` (msg parse order, close checks), `wave4.rs` (goal progress,
> goal-refund check), `prorata.rs` (`close_split`), `views.rs`, `types.rs`, `events.rs`, `errors.rs`.
> Tests: `pot-hub/src/unit_gifts.rs`, `contracts/tests/tests/t_gifts.rs`, fixture `contracts/tests/fixtures/pot_hub_v1.1.0.wasm`
> (= the testnet build, sha256 `939c1963…cfdf93`, on-chain code hash `AwCzDVnh…XiDXG`, checked 2026-11-02).

## 1. What it does

Anyone, member or not, can send a Pot a **gift**:
`usdc.ft_transfer_call(receiver_id = hub, amount, msg = {"pot":"<dao>","gift":"<ref>"})`, 1 yocto, 100 Tgas (like a
contribution). The hub forwards it to the Pot's DAO and records it. Gift money is group money:

- It is **never** a contribution: `member.contributed`, `total_contributed` and `last_contributor` don't move, so there is
  no refund claim, no vote weight, no budget or trust effect, and a giver does not become a member.
- It is spendable like any Pot money: `balance_estimate` includes gifts, and the hub's spend check reads the real balance.
- At close it is shared **pro-rata** to contributions (it is simply part of the balance). If **nobody contributed** (a
  gifts-only Pot) the balance is split **equally** among the members.
- It counts toward a **normal goal**. It is **refused while an all-or-nothing goal is collecting** (or missed).
- Gifts are **on for every Pot**, old ones included. Any active member can turn them off or on (`set_gifts`).

## 2. Design decisions (and why)

**G-1 · No migration: a side record under a fresh prefix.** One `GiftState` per Pot is stored directly under storage
prefix `0x0D` (`StorageKey::Gifts`) with the exact key layout a `LookupMap<u32, GiftState>` would use
(`[0x0D] ++ borsh(pot idx)`), read/written with `env::storage_read/write` (`gifts.rs::gift_key`, unit-tested). It is not a
field of the root struct, so the 1.1.0 state deserializes unchanged and **1.1.0 → 1.2.0 is a plain DeployContract**.
A missing record = gifts on, nothing received. Proven in the sandbox (G7): the testnet 1.1.0 build is deployed, Pots,
requests, a funded link, a goal and an invite are created, then the 1.2.0 code is deployed **without any function call**;
every old view reads byte-identical, the pending vote, the link claim and the invite work after it, and gifts are on for
the old Pots. `migrate` still exists (it is the 1.0.0 → current path, t_migrate) and fails on 1.1.0 state.

**G-2 · Same forward-and-callback pattern as contributions (INV-08).** `ft_on_transfer` validates synchronously (a refusal
panics → the token refunds the whole amount, exactly like a refused contribution), then `ft_transfer(dao)` +
`on_gift_forwarded`. The callback records the gift only if the forward succeeded; otherwise it returns `amount` (the
token refunds the giver). The hub never keeps a gift (asserted: hub USDC balance stays 0).

**G-3 · No busy window; an in-flight counter instead.** Contributions set a 60 s busy window that blocks the close. Gifts
must not (anyone can send one, so they could keep a Pot from closing). Instead `GiftState.in_flight` counts forwards
started and not yet called back, and `in_flight_until_ms` = the latest start + 60 s. `propose_close` and
`refund_unfunded` refuse with `ERR_GIFT_IN_FLIGHT` only while `in_flight > 0 && now < in_flight_until_ms` (a few blocks in
practice). If a callback were ever lost the block **self-heals after 60 s**, and the next gift resets the stale counter.
Why it matters: a gift forward that lands after the close read the balance would be stranded in the DAO. Gifts are
refused once `closing_until_ms` is set (`ERR_POT_NOT_OPEN`), so the two can't cross the other way.

**G-4 · The close.** `ERR_NO_CONTRIBUTIONS` now means "no contributions **and** no gifts". The close (and every preview:
`preview_close`, `get_members.would_get_back`) uses `prorata::close_split`: `prorata` when any member contributed;
otherwise `prorata` with weight 1 per Active member and no last contributor, so the dust (< n) goes to the **last member
in join order**. The prepay upper bound counts every member as a payee in that case. The TS twin is
`closeSplit` in `@pot/sdk` (`math/prorata.ts`); shared vectors `contracts/tests/vectors/close-split.json` =
`packages/pot-sdk/src/math/vectors/close-split.json` (E1-E10, both sides assert parity), plus property tests on both sides.

**G-5 · Goals.** A normal goal's progress = contributions + gifts (`goal_progress`; a gift can be the one that reaches
it, `goal_reached.total` = that progress). An all-or-nothing goal counts **contributions only** (its promise is "your
contribution back") and gifts are refused while it is collecting (`ERR_GOAL_COLLECTING`) or missed (`ERR_GOAL_MISSED`),
so a goal refund never has to deal with gift money. Once it is reached, gifts are accepted.

**Choices where the spec was open (safest option):**
- `ref`: 1-32 chars of `[A-Za-z0-9_-]`, **required** (our server's ids are `g` + 23 base32 chars). Never free text, never a note.
- A Pot's own DAO can't gift itself (`ERR_GIFT_SELF`): it would only inflate its gift total.
- A Pot's gift total is capped at `MAX_AMOUNT` ($1B, keeps the pro-rata math in range, INV-13); the relayer caps one
  sponsored gift at $10,000 (like a contribution).
- `set_gifts`: any Active member, allowed while paused (it's a safety switch), refused on a Closed Pot; a no-op (no
  event, no write) when nothing changes. A direct, unsponsored caller pays the record's storage (120 B) on its first
  write only; relayer-signed costs the caller nothing.
- `gift_received` carries the spec's `{pot, from, amount, ref}` **plus** `gifts_total` and `gifts_count` (the Pot's totals
  after this gift), mirroring `contribution.pot_total`.
- `seq` bumps once per recorded gift (in the callback) and once per real `set_gifts` change.

## 3. Interface (hub 1.2.0)

### Messages
| `ft_on_transfer` msg | from | effect |
|---|---|---|
| `{"link":<id>}` | a Pot's DAO | link escrow (1.1.0, unchanged) |
| `{"pot":"<dao>","gift":"<ref>"}` | **anyone** | **gift** (new) |
| `{"pot":"<dao>"}` | an Active member | contribution (unchanged) |
Parse order: link → gift → contribute. Both gift fields are required and nothing else is allowed (`deny_unknown_fields`).

Gift checks, in order (each refusal panics → the token refunds everything): Pot exists (`ERR_POT_NOT_FOUND`), open
(`ERR_POT_NOT_OPEN`), not paused (`ERR_PAUSED`), gifts on (`ERR_GIFTS_OFF`), all-or-nothing goal not missed / collecting
(`ERR_GOAL_MISSED` / `ERR_GOAL_COLLECTING`), ref valid (`ERR_GIFT_REF_INVALID`), sender ≠ the Pot / hub (`ERR_GIFT_SELF`),
amount ≥ 1_000_000 (`ERR_GIFT_TOO_SMALL`), amount ≤ MAX_AMOUNT and Pot gift total ≤ MAX_AMOUNT (`ERR_AMOUNT_TOO_LARGE`).

### New methods
| Method | Who | Deposit / gas | Returns |
|---|---|---|---|
| `set_gifts(pot, on: bool)` | any Active member (predecessor; relayable) | 0 relayed / 30 Tgas (R17 10-50); direct: ≤ 0.0012 NEAR on the first write, excess refunded | `GiftsView` |
| `on_gift_forwarded(pot, sender_id, amount, gift_ref)` | `#[private]` callback | — | `U128` unused amount |

### Views
- **New** `get_gifts(pot) → GiftsView | null`:
  `{pot, on, total, count, last_gift_ms|null, in_flight, accepting, refusal|null, min_amount}`;
  `refusal` ∈ `pot_not_open | paused | gifts_off | goal_collecting | goal_missed`. `accepting` = a gift sent now passes
  the hub's state checks (the relayer's pre-flight).
- `get_pot` + `gifts_on`, `gifts_total`, `gifts_count`; `balance_estimate` now includes gifts (also in `get_pots_of`).
- `get_goal` + `gifts_total`, `progress` (what counts toward the goal).
- `preview_close` + `gifts_total`, `split` (`"prorata" | "equal"`); `blocked_reason` + `"gift_in_flight"`;
  `"no_contributions"` now means no contributions and no gifts.
- `get_members.would_get_back` follows the close split (equal shares in a gifts-only Pot).
- `get_config.version` = `"1.2.0"`.

### Events (NEP-297 `pot`, version `1.2.0`)
- `gift_received {pot, from, amount, ref, gifts_total, gifts_count}` (after the forward succeeded; never on a refund)
- `gifts_set {pot, on, by}` (only when it changed)

### Errors (new)
`ERR_GIFTS_OFF ERR_GIFT_TOO_SMALL ERR_GIFT_REF_INVALID ERR_GIFT_SELF ERR_GIFT_IN_FLIGHT ERR_GOAL_COLLECTING`
(mirrored in `@pot/sdk` `HUB_ERROR_CODES`; the reconcile test checks errors.rs and events.rs).

### Invariant amendments (to fold into contracts-spec §7)
- **INV-08:** + a gift is recorded exactly once, only after its forward succeeded; it never changes
  `total_contributed` / `member.contributed`.
- **INV-11:** + the close pays `close_split` (pro-rata; equal among Active members when nobody contributed), and is
  refused while a gift forward is pending (≤ 60 s, self-healing).
- **INV-15:** + the hub sends a gift's USDC only to the Pot it names, or back to the giver (via the token's refund).

## 4. Storage and who pays
| What | Size | Paid by |
|---|---|---|
| Hub code | 574,805 B (was 557,296): **+17,509 B ≈ +0.175 NEAR** locked on the hub | hub (once, at the upgrade) |
| `GiftState` per Pot | 41 B value + 5 B key + 40 B overhead ≈ **86 B ≈ 0.00086 NEAR**, once per Pot | hub, on the Pot's first gift (bounded: one record per Pot; Pot creation is rate-limited); a direct `set_gifts` caller pays it on the first write |
| A gift | no other hub state | — |

## 5. Gas (measured in the sandbox, both Sputnik builds)
- Relayed gift at 100 Tgas: the whole chain burns **12.94 Tgas**. The smallest `ft_transfer_call` gas that records a
  gift is **40 Tgas**; the app sends **100** (like `add_money`, D-06 rule: never below 35).
- Static budgets: forward `GAS_FT_TRANSFER` 10, `GAS_ON_GIFT` 15, `unused_gas_weight(0)`.
- `set_gifts`: one write, ≈ 2-3 Tgas; SDK 30, relayer R17 10-50.

## 6. Deploy steps for the human (testnet preview; **needs explicit OK**, nothing below was run)
Pre-checks (read-only):
1. `scripts/run deploy status` → hub `version 1.1.0`, code sha256 `939c1963…` (= the fixture). The hub needs ≈ 0.18 NEAR
   more locked for code on top of `min_hub_reserve` (0.5): check `free_balance` in `get_config`. On 2026-11-02 it was
   **1.697 NEAR** (read-only RPC), so no top-up is needed; if it is under ≈ 0.8 NEAR, top up first
   (`scripts/with-testnet-lock.sh scripts/run deploy fund pots.potprev.testnet 1`).
2. Build: `contracts/scripts/build.sh` → `contracts/target/near/pot_hub/pot_hub.wasm`, **574,805 B, sha256
   `a78f4fdc707c53d1c962846842ab76e094e609d62bb0320ec7aab494812d7335`** (a rebuild on another machine may differ by
   toolchain paths; compare the size).
3. Tests on that wasm: `cd contracts && POT_NO_BUILD=1 cargo test --workspace` (≈ 20 min).
4. Upgrade (ONE DeployContract, no function call; signs with the hub's key in the legacy keychain):
   `scripts/with-testnet-lock.sh scripts/run deploy redeploy-hub`
   (= `near-cli-rs contract deploy pots.potprev.testnet use-file …/pot_hub.wasm without-init-call network-config testnet
   sign-with-legacy-keychain send`). It now refuses on a 1.0.0 hub, prints `1.1.0 → 1.2.0` and runs the status checks
   (on-chain code sha = local wasm). **Do not use `upgrade-hub`** (it requires 1.0.0 and calls `migrate`, which fails on
   1.1.0 state). Cost ≈ 0.001 NEAR gas + 0.175 NEAR storage lock.
5. Smoke (read-only): `get_config.version == "1.2.0"`; `get_gifts {"pot":"lisbon-trip.pots.potprev.testnet"}` →
   `on: true, accepting: true, total: "0"`; `get_pot` of the same Pot has `gifts_on: true` and an unchanged
   `balance_estimate`.
6. Then turn on `FLAG_GIFTS=true` (server) and `NEXT_PUBLIC_FLAG_GIFTS=true` (client) on the preview deployment and deploy
   the web app. Before step 4 the relayer refuses gifts anyway (`gifts_unavailable {why: hub_not_ready}`).
- Rollback: copy `contracts/tests/fixtures/pot_hub_v1.1.0.wasm` to `contracts/target/near/pot_hub/pot_hub.wasm` and run
  `redeploy-hub` again. The 1.1.0 code ignores the `0x0D` records (gifts already received stay in the DAOs and are part
  of the balance; only `gifts_total` stops being shown and a gifts-only Pot can't close until someone contributes).
- Mainnet clip: a fresh deploy with `new` (1.2.0 from the start); nothing to migrate.

## 7. SDK + relayer (done in this wave)
- **`@pot/sdk`:** `gifts.ts` (`giftMsg`, `parseGiftMsg`, `isValidGiftRef`/`GIFT_REF_RE`, `giftAmountError`,
  `parseGiftReceived`); types `GiftsView`, `GiftReceived`, `GiftRefusal`, `GIFT_LIMITS`, `RawGiftsView`; optional new
  fields on `PotView` (`giftsOn`, `giftsTotal`, `giftsCount`), `GoalView` (`giftsTotal`, `progress`), `ClosePreview`
  (`giftsTotal`, `split`), `RawCloseBlockedReason` + `gift_in_flight`; `parseGiftsView`; `HubViews.getGifts?`
  (implemented over RPC); intents `send_gift {pot, amount, giftRef}` (→ `usdc.ft_transfer_call`, 100 Tgas, 1 yocto) and
  `set_gifts {pot, on}` (30 Tgas; `directDeposit` 0.002 NEAR); `RELAY_POLICY.set_gifts` (R17); events `gift_received`,
  `gifts_set`; 6 error codes + synthetic `GIFT_REFUNDED`; API: `RELAY_INTENT_TYPES` + `send_gift`, `set_gifts`;
  `RelayResult` + `{type:"gift", recorded, amount, usedAmount, giftRef, giftsTotal?}` and `{type:"gifts", on, changed}`;
  reason `gifts_unavailable` (409); `closeSplit` / `closeSplitKind` twin. Tests: `src/gifts.test.ts` (17).
- **Relayer** (`apps/web/server/relay/`):
  - **R16 gift** (`policy.ts`): `usdc.ft_transfer_call` with msg exactly `{"pot","gift"}` from **any signed-in account**
    (R1's method / 1 yocto / 100-150 Tgas / receiver checks apply), ref `^[A-Za-z0-9_-]{1,32}$`, $1 ≤ amount ≤ $10,000,
    family `gift`, intent `send_gift`, hub budget 0.001 NEAR. `{"pot"}` alone stays R1 (`add_money`).
  - **R17 set_gifts** (hub, 0 deposit, 10-50 Tgas, `{pot, on: bool}`), family `rules`.
  - **FLAG_GIFTS gate (server side):** R16 and R17 are refused (`method_not_allowed {why: "gifts_off"}`) unless
    `deps.gifts.enabled()` (default: `process.env.FLAG_GIFTS` is `true`/`1`, read per call).
  - **Pre-flight** (`pipeline.ts` `giftPreflight`): Pot known and open; hub `get_gifts.accepting` (else 409
    `gifts_unavailable {why: <hub refusal>}`; a hub without `get_gifts` → `{why: "hub_not_ready"}`); then the web app's
    hook `validateGiftRef(pot, ref, amount, sender)` (`{ok:false, why}` → 409 `gifts_unavailable {why}`; absent = allow).
  - **Quotas** (`quotas.ts`): `user_gift` 10/day, `pot_gift` 100/day, `ip_gift` 30/day (charged when the route passes
    `RelayRequest.ipHash`), plus the usual burst / relay-yocto / hub-yocto budgets.
  - **Classify** (`classify.ts`): R16 like R1: used amount from `ft_resolve_transfer` + the trusted `gift_received`
    (this Pot, this sender, this amount, this ref) → `{type:"gift", recorded:true, …}`; else `inner_failed` with the hub's
    ERR code or `GIFT_REFUNDED`, `recorded:false`. R17 → `{type:"gifts", on, changed}`. Feed keys
    (`effects.ts`): `gift:<ref>:<tx>`, `gifts_set:<tx>`.
  - **Follow-ups** (deferred): a recorded gift → `deps.gifts.onGiftReceived({pot, from, amount, ref, txHash})` and
    `retryFailedPayouts` (new money); a bounced gift → `deps.gifts.onGiftFailed(ref)`. Hook errors are logged, never thrown.
  - Tests: `policy.test.ts` +24 cases (R16/R17 bounds + SDK `buildCall` reconciliation), `pipeline-gifts.test.ts` (9).

## 8. What the frontend / backend must do
- **Wire the relay hooks** in `apps/web/server/deps.ts` (not done here, to stay out of the parallel gifts-server work).
  The gifts server module already has functions of exactly these shapes:
  ```ts
  gifts: {
    enabled: giftsEnabled,
    validateGiftRef: giftRefValidator(db),                       // (pot, ref, amount, sender?) → GiftRefCheck
    onGiftReceived: (ev) => onGiftReceived({ db, hub, cfg, sender: push }, ev),
    onGiftFailed: (ref) => markGiftFailed(db, ref),
  }
  ```
  and pass `ipHash: ipHash(ctx.req)` into `relay(…)` in `app/api/relay/route.ts` for the per-IP gift quota.
- `server/features/gifts/chain.ts`'s `parseGiftsView` expects `gifts_on/gifts_total/gifts_count`: that is `get_pot`'s
  shape; `get_gifts` returns `{on, total, count, accepting, refusal, …}` (its fallback to `get_pot` works; switching to
  `@pot/sdk` `parseGiftsView` + `accepting`/`refusal` gives the goal and pause answers for free).
- **Send a gift:** `buildCall({type:"send_gift", pot, amount, giftRef})`, relay with intent `send_gift`. Show
  `getGifts(pot).refusal` before asking for money. Handle `gifts_unavailable` (409, `detail.why`) and
  `inner_failed` codes `ERR_GIFTS_OFF`, `ERR_GOAL_COLLECTING`, `ERR_GIFT_TOO_SMALL`, `ERR_POT_NOT_OPEN`, `GIFT_REFUNDED`
  ("your money came back").
- **Toggle:** `{type:"set_gifts", pot, on}` (intent `set_gifts`) from ••• → Gifts, any member.
- **Pot screen / close sheet:** `giftsTotal` is inside `balanceEstimate`, never in `totalIn`; `previewClose.split ===
  "equal"` → copy "Nobody added money, so it's split equally"; `blockedReason === "gift_in_flight"` → "A gift is arriving,
  try again in a minute". Goal progress: `getGoal.progress`.
- **Feed / push:** `gift_received` (`parseGiftReceived`) → "Ana sent a gift · $10 ☕" (the gifts module's
  `onGiftReceived` already pushes).

## 9. Tests
- `cargo test -p pot-hub`: **35** passed (24 + 11 new: ref rules, the 0x0D key layout, in-flight expiry, event JSON
  `ref`, close-split vectors + parity with the sdk copy, equal-split proptest (2,000 cases), and `unit_gifts.rs`: close
  blocked while a gift is in flight then allowed after the callback, a lost callback self-heals after exactly 60 s and the
  next gift resets the stale counter, a failed forward returns the amount, refusals, `set_gifts` storage charge).
- Sandbox `t_gifts.rs`, **14 new** (7 scenarios × builds A and B), all green:
  G1 a non-member's relayed gift at 100 Tgas recorded (event, DAO balance, hub holds 0, views), a member's gift is a gift
  (contributed / last_contributor unchanged), minimum gas 40 · G2 refusals with full refunds (< $1, bad / empty / long
  ref, extra key, numeric ref, unknown Pot, gifts off, paused), only members can `set_gifts`, no-op toggle emits nothing
  · G3 no busy window from a gift, the close shares gifts pro-rata ($240 = 150:50 → $180/$60), gifts refused while
  closing and after closed · G4 gifts-only Pot: `ERR_NO_CONTRIBUTIONS` before, equal split $33.333333 ×2 + $33.333334
  after, paid out · G5 gifts reach a normal goal (the gift emits `goal_reached`), refused while an all-or-nothing goal
  collects, accepted once reached, `progress` counts contributions only for all-or-nothing · G6 a failed forward (DAO
  unregistered) refunds and records nothing; a close raced into the gift's forward window is refused
  `ERR_GIFT_IN_FLIGHT` and then refused only for "no money" once it settles (timing-based: tries delays until one lands,
  hit at 300 ms on both builds; the exact path is also unit-tested) · G7 the 1.1.0 → 1.2.0 plain upgrade (§2 G-1).
- Existing tests: 2 assertions updated for the version string (`t20` `get_config.version`, `m1` after migrate now
  "1.2.0", the current build); `t_safety` T-80's private-callback list + `on_gift_forwarded`.
- `@pot/sdk`: 198 passed (17 new in `gifts.test.ts`), eslint clean. Web: relay suites 269 passed (24 new policy cases,
  9 new pipeline cases), web typecheck (`NEXT_DIST_DIR=.next-gifts-hub`) clean, eslint clean.

## 10. Open questions / known limits
1. **Spends in a gifts-only Pot:** nobody contributed, so every spend takes the `new_member` path (one-OK or the group
   decides; no instant spends). Intended? (The decision function is unchanged: gifts don't give anyone instant rights.)
2. A gift sent while an all-or-nothing goal is collecting is refused; the UI should say why before the giver pays
   (`getGifts.refusal === "goal_collecting"`). If a v2 Pot later switches to an all-or-nothing goal after receiving gifts,
   a goal refund pays those gifts out pro-rata to contributors (they're in the balance).
3. Gifts sent straight to the DAO (not through the hub) are not counted in `gifts_total` (same as direct contributions);
   they are still in the balance at close.
4. The in-flight self-heal relies on a 60 s wall-clock window; a callback that never runs (static gas has ≥ 3× margin,
   12.94 Tgas burnt of 100) would hold the close for at most 60 s.
5. The sandbox race test (G6) is timing-based; if a slow machine never lands the close inside the forward window it
   fails with a clear message; `unit_gifts.rs` is the deterministic proof.
6. Contracts-spec / decisions.md still describe 1.1.0; the INV amendments in §3 need folding in (not done here).

## 11. Wired end to end (2026-11-02, pre-deploy; nothing signed, deployed or committed)
- **Client** (`apps/web/lib/client/gifts/chain.ts`, no TODOs left): `sendGiftTransfer` sends the sdk's
  `{type:"send_gift", pot, amount, giftRef}` through `send()` (the relayer path Add money uses; wallet sessions via
  `walletSend`), throws the hub's ERR code on `inner_failed` and `GIFT_REFUNDED` when `result.recorded === false`;
  `setGiftsOnChain` sends `{type:"set_gifts", pot, on}`; `readGiftsView` = `chain().hub.getGifts(pot)` →
  `{on, total, count, accepting, refusal}` (null on a 1.1.0 hub). `giftErrorKey` maps `gifts_unavailable`, `ERR_GIFTS_OFF`,
  `ERR_GOAL_COLLECTING/MISSED`, `ERR_POT_NOT_OPEN`, `ERR_GIFT_TOO_SMALL`, `GIFT_REFUNDED` (new copy `gift.error.refunded`).
- **Server GiftChain** (`server/features/gifts/chain.ts`): `get_gifts` through the sdk's `parseGiftsView` after a shape
  check (`parseGetGifts`); falls back to `get_pot`'s `gifts_*` fields, and a 1.1.0 hub (neither) → null = unknown (pages
  stay usable; the relayer answers `gifts_unavailable {why: hub_not_ready}`). `takingOf` also uses the hub's `refusal`
  (`pot_not_open` → closed, `goal_collecting|goal_missed` → goal).
- **Relayer hooks** (`server/deps.ts` `giftRelayHooks`, imported from `features/gifts/{core,validate,received}` directly):
  `enabled: giftsEnabled`, `validateGiftRef: giftRefValidator(db)`, `onGiftReceived → onGiftReceived({db, hub, cfg,
  sender: push}, ev)`, `onGiftFailed → markGiftFailed(db, ref)`. `app/api/relay/route.ts` passes `ipHash: ipHash(req)`
  (the `ip_gift` quota).
- **Close math**: the mock's `closeMathWithGifts` and the client refund preview (`lib/client/refund.ts`) use the sdk's
  `closeSplit` (equal split when nobody contributed; the shared E1-E10 vectors are asserted in `refund.test.ts`); the
  live VM's last-resort "gets back" splits equally when `totalIn` is 0.
- **Known limit:** a wallet that can't sign delegates sends the gift itself (self-paid), so the relayer never sees it:
  the hub records it, but our `gift` row stays pending (no feed row, no push, not on the members' list). NEAR Auth and
  delegate-capable wallets (the e2e mock wallet) go through the relayer.

## 12. Post-deploy checklist (after the human deploys hub 1.2.0 per §6; not run)
1. Smoke (read-only, §6 step 5): `get_config.version == "1.2.0"`, `get_gifts` on a Pot → `on: true, accepting: true`.
2. Migration 0005 on the shared local DB (the private `pot_gifts` already has it), then on the preview's Neon DB:
   `DATABASE_URL_UNPOOLED=postgres://pot:pot@localhost:54329/pot pnpm --filter web exec drizzle-kit migrate`
   (Neon: the same command with the preview's unpooled URL from Vercel env).
3. Flags in `apps/web/.env.local` (add two lines; and the same two on the Vercel preview env):
   `FLAG_GIFTS=true` and `NEXT_PUBLIC_FLAG_GIFTS=true`.
4. Rebuild whatever serves the app (the client flag is baked in at build time): restart `next dev` on :3000, or
   `pnpm --filter web build` / redeploy the preview.
5. The testnet gifts e2e (from the repo root, private DB, under the lock; signs testnet txs, ≈ 0.1 NEAR):
   ```
   E2E_TESTNET=1 E2E_PORT=2947 NEXT_DIST_DIR=.next-gifts-testnet FLAG_GIFTS=true NEXT_PUBLIC_FLAG_GIFTS=true \
   DATABASE_URL=postgres://pot:pot@localhost:54329/pot_gifts DATABASE_URL_UNPOOLED=postgres://pot:pot@localhost:54329/pot_gifts \
   scripts/with-testnet-lock.sh pnpm --filter web exec playwright test -c e2e/testnet/playwright.config.ts gifts
   ```
