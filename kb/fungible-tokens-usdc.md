# Fungible tokens (NEP-141/145) and the USDC choice
> Owner: relayer. Last verified: 2026-10-21. Legend: ✅ verified · 📄 docs-only · ⚠️ unverified/conflicting

## TL;DR
- ✅ **Demo token recommendation: deploy our own reference NEP-141** "USDC (test)" (6 decimals) as `usdc.pot-<team>.testnet`. Mint the whole supply to a treasury, and serve **"Demo dollars (testnet)" from a rate-limited `/api/faucet`** (server `ft_transfer` from the treasury). No public `mint` means nothing to grief, no captcha and no third party. Cost ≈ **2.2 NEAR** of storage for a ~216 kB wasm (⚠️ estimate from `fungible-token.testnet`).
- ❌ **`usdc.fakes.testnet` is out**: anyone can `mint`, and **anyone can `burn` anyone's balance** (we burned 1.0 of U1's tokens from another account, [Ehr1JeVH…](https://testnet.nearblocks.io/txns/Ehr1JeVHKCXHnT5KqiDNuih7gZrC4FQBXKpss5EkDGR6)). A griefer could zero a Pot's DAO balance mid-judging.
- ⚠️ **Circle testnet USDC** `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af` is real (6 dec, `storage_balance_bounds` 0.00125 NEAR) but its faucet gives **20 USDC per 2 h per address**, through a web form. That is too little for judges to self-serve; use it only for a realism side-demo.
- ✅ **Mainnet USDC** `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`: `{"name":"USDC","symbol":"USDC","decimals":6,"spec":"ft-1.0.0"}`, `storage_balance_bounds` min = max = **0.00125 NEAR**, supply 77,388,746.56 USDC (read-only, 2026-10-21). Circle's contract (321 kB, code `DVJx7F3d…`) exports `blocklist`/`unblocklist`/`is_blocklisted`, `pausers`, `mint`/`burn` (minters), allowance (`approve`, `transfer_from`) and multisig admin methods. The testnet contract exports the same set.
- ✅ Rules: every `ft_transfer`/`ft_transfer_call`/`storage_withdraw`/`storage_unregister` needs **exactly 1 yocto**. In a meta tx the **relayer** pays it, and an FC key cannot attach it, so a **full-access** key is required. The receiver must be registered (`storage_deposit`), and **anyone can register anyone**: the relayer does it at onboarding (0.00125 NEAR).
- ✅ Refund semantics, measured: if `ft_on_transfer` **panics**, the whole amount comes back; if it returns `"N"`, N is refunded. `ft_resolve_transfer` returns the **used** amount. The relayed tx's top-level status stays `SuccessValue("")` in both cases, so read the resolve result or the receipts.
- ✅ Measured gas: `ft_transfer` 1.85 Tgas at the token; relayed `ft_transfer_call` → contract → resolve **8.9-9.2 Tgas total (0.0008 NEAR)**; `storage_deposit` 2.12 Tgas (0.00019 NEAR) + 0.00125 NEAR deposit.

## Plan check

| Plan claim | Status |
|---|---|
| C6 "USDC: team NEP-141 'USDC (test)' with 6 decimals on testnet" | ✅ recommended, with a treasury + `/api/faucet` (no public mint) |
| C6 "on mainnet, confirm the contract from 1Click `/v0/tokens`" | ✅ Circle's docs and on-chain metadata confirm `17208628…36133a1` (6 dec). → intents: cross-check the `nep141:17208628…` assetId in `/v0/tokens` |
| C6 Costs "0.00125 NEAR USDC storage" | ✅ `storage_balance_bounds` = {min = max = 1250000000000000000000} on mainnet USDC, Circle testnet USDC, wrap.testnet and usdc.fakes |
| C4 P-4 "`ft_transfer_call` to Rulebot with `{"pot":"<slug>"}`; contribution recorded and forwarded" | ✅ the mechanics work relayed (1 yocto paid by the relayer). The Rulebot must return the unused amount as a string; panics refund the user |
| C5 Add money "Demo dollars (testnet)" | ✅ feasible with a faucet route. ❌ not with Circle's faucet (20 USDC/2 h, manual) |
| C6 "If that step fails, funds stay in the member's account and the UI shows 'Finish adding $150'" | ✅ consistent with the refund semantics, but detect the failure from the receipts or the resolve value, not the tx status |

## Reference

### NEP-141 core (JSON args; amounts are base-10 strings)

| Method | Deposit | Args → return |
|---|---|---|
| `ft_transfer` | **exactly 1 yocto** | `{receiver_id, amount, memo?}` → `()` |
| `ft_transfer_call` | **exactly 1 yocto** | `{receiver_id, amount, memo?, msg}` → `U128` (used amount, from resolve) |
| receiver's `ft_on_transfer` | — (called by the token) | `{sender_id, amount, msg}` → `U128` **unused** amount (`"0"` = keep all) |
| `ft_resolve_transfer` (private) | — | `{sender_id, receiver_id, amount}` → `U128` used |
| `ft_total_supply`, `ft_balance_of {account_id}`, `ft_metadata` | view | `ft_metadata`: `{spec:"ft-1.0.0", name, symbol, icon, reference, reference_hash, decimals}` |
| Events (NEP-297 log) | — | `EVENT_JSON:{"standard":"nep141","version":"1.0.0","event":"ft_transfer"\|"ft_mint"\|"ft_burn","data":[{old_owner_id,new_owner_id,amount,memo?}]}` |

**Resolve logic** (near-contract-standards master `fungible_token/core_impl.rs:169-235`): `unused = min(parse_U128(promise_result) or amount if the call failed or returned garbage, amount)`. If `unused > 0` and the receiver still holds tokens, it moves back `min(receiver_balance, unused)` and emits `ft_transfer` with memo `"refund"`. If the sender unregistered meanwhile, that amount is **burned**. `ft_on_transfer` gets all remaining gas (`with_unused_gas_weight(1)`), and resolve gets a static **5 Tgas**. ✅ source, ✅ observed on wrap.testnet (logs `Refund 1000000000000000000000 from ref-finance-101.testnet to u1…`).

### NEP-145 storage management

| Method | Deposit | Notes |
|---|---|---|
| `storage_deposit {account_id?, registration_only?}` | ≥ `min` | `account_id` defaults to the caller. **Anyone can pay for anyone** ✅. `registration_only: true` refunds everything above `min` (and everything if already registered) 📄 NEP-145 L404-409 |
| `storage_balance_of {account_id}` | view | `{total, available}` or `null` if not registered |
| `storage_balance_bounds` | view | `{min, max|null}`. FTs: min = max = 0.00125 NEAR ✅ |
| `storage_withdraw {amount?}` | 1 yocto | refunds `available` |
| `storage_unregister {force?}` | 1 yocto | `force` burns a remaining FT balance |

An unregistered receiver makes `ft_transfer` panic (`The account … is not registered`), so register the Rulebot, the DAO and every user at creation. ⚠️ Non-FT contracts differ: Ref's `registration_only` gave only the 0.00102 min, and depositing then failed with `E11: insufficient $NEAR storage deposit` ✅.

### Token candidates (on-chain checks 2026-10-21)

| Token | id | Metadata | Mint | Verdict |
|---|---|---|---|---|
| Circle USDC (mainnet) | `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` | USDC/USDC/6, bounds 0.00125, supply 77,388,746.56, code `DVJx7F3d…` | minters only | ✅ mainnet clip and 1Click |
| Circle USDC (testnet) | `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af` | USDC/USDC/6, bounds 0.00125, supply 14,081,220,210.07, code `EoAUFWEL…` (315 kB); exports `mint, minter_allowance, is_minter, master_minters, blocklist, unblocklist, pausers, approve, transfer_from, create_multisig_request…` | minters only; faucet 20 USDC/2 h/address (faucet.circle.com, NEAR Testnet listed) | ⚠️ realistic but not self-serve |
| `usdc.fakes.testnet` (Ref test token; same code as `usdt/dai.fakes.testnet`) | — | "Bridged USDC"/`USDC.e`/6 | **public `mint` and public `burn`** ✅ tested; `set_decimals/set_token_name/set_icon` exported (not called) | ❌ griefable |
| `ft.predeployed.examples.testnet` / `ft.examples.testnet` (NEAR docs tutorials) | — | "Team Token FT Tutorial"/`gtNEAR`/**24 dec**; "Example NEAR fungible token"/`TeamTokens`/**0 dec** | `ft_mint` exported (⚠️ not called) | ❌ wrong decimals and branding; shared |
| Own reference FT (near-examples/FT) | e.g. `usdc.pot-<team>.testnet` | `new(owner_id, total_supply, metadata)` mints everything to `owner_id` | none (server faucet) | ✅ **recommended** |

Variant: a capped public `mint(amount ≤ X)` per account per day needs custom Rust (→ contracts). Not needed, because `/api/faucet` already sits behind the same rate limits as `/api/relay`.

## Snippets
### Register someone else and check registration (tested: `05-onboarding.ts`, `01-setup.ts`)
```ts
const reg = await provider.callFunction({ contractId: USDC, method: 'storage_balance_of', args: { account_id } }); // null => not registered
if (!reg) await relayer.signAndSendTransaction({ receiverId: USDC,
  actions: [actions.functionCall('storage_deposit', { account_id, registration_only: true }, teraToGas('30'), nearToYocto('0.00125'))] });
```
### Relayed contribution (tested with wrap.testnet → ref-finance-101.testnet: `03-relay-ft-transfer-call.ts`)
```ts
const { signedDelegate } = await user.createSignedMetaTransaction({ receiverId: USDC, actions: [
  actions.functionCall('ft_transfer_call', { receiver_id: RULEBOT, amount: '150000000' /* $150 @ 6 dec */, msg: JSON.stringify({ pot: slug }) },
                       teraToGas('150'), 1n)], blockHeightTtl: 120 });
// server: in receipts_outcome, take the receipt executed by USDC whose status is {SuccessReceiptId: X};
// receipt X is ft_resolve_transfer: used = JSON.parse(atob(X.outcome.status.SuccessValue))  ("IjAi" → "0")
// used === amount → recorded; used === "0" → refunded ("Finish adding $150")
```
### Deploy our "USDC (test)" (⚠️ not executed; near-cli-rs 0.30.1 syntax checked with `--help`; wasm built from near-examples/FT by the contracts toolchain)
```sh
npx -y near-cli-rs@0.30.1 contract deploy usdc.pot-<team>.testnet use-file fungible_token.wasm \
  with-init-call new json-args '{"owner_id":"faucet.pot-<team>.testnet","total_supply":"1000000000000000",
  "metadata":{"spec":"ft-1.0.0","name":"USDC (test)","symbol":"USDC","decimals":6,"icon":"data:image/svg+xml,…"}}' \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-legacy-keychain send
# 1e15 units = 1,000,000,000 USDC (test). Register the Rulebot, DAOs and users with storage_deposit as they are created.
```
### `/api/faucet` (design, not tested): `POST {amount}` → auth session → cap (e.g. ≤ $500 per user per day) → `storage_deposit` if needed → treasury `ft_transfer {receiver_id: user, amount}` with 1 yocto → return the receipt link. Then the user's relayed `ft_transfer_call` to the Rulebot records the contribution. Two steps keep the attribution trustless (plan C6).

## Gotchas & failure modes
1. **The 1 yocto comes from the relayer**, not the user (meta-tx rule). Allow `deposit == 1` only on FT methods.
2. **FC keys can't move FTs** (`DepositWithFunctionCall`). NEAR Auth / wallet keys used for contributions must be full-access (→ auth).
3. **False success**: a refunded `ft_transfer_call` still has top-level `SuccessValue("")` ([G7joFZ8B…](https://testnet.nearblocks.io/txns/G7joFZ8B9DRxnFMsaA6NkKZfXavvWeCjurKvZqpnvUT6)). Use the resolve return value (`"0"` = refunded).
4. **Receiver registration**: the Rulebot and each DAO must be registered on the token before the first `ft_transfer_call` or forward, or the transfer panics. The Rulebot's own forward (`ft_transfer` to the DAO) also needs its 1 yocto, which comes from the Rulebot's balance (→ contracts).
5. **`ft_on_transfer` must return a JSON string U128** (`"0"`). If the return value is garbage, the token treats it as "refund everything".
6. **Sender unregistered mid-flight** means refunded tokens are **burned** (standard behaviour). Don't let users `storage_unregister` the token in-app.
7. **Circle mainnet USDC has blocklist and pauser roles** (`blocklist`, `pausers` exported): a blocklisted DAO, Rulebot or user can't move funds. Disclose it in the README for the mainnet clip.
8. **Decimals**: USDC has 6 (`150 USDC = "150000000"`); wNEAR has 24. Never hardcode; read `ft_metadata` once and cache it.
9. Testnet "fake" tokens are shared state: other people mint, burn and possibly rename them. Never point a judged demo at a token you don't control.

## Costs, limits, latencies (measured vs documented)

| Item | Measured (testnet) | Documented |
|---|---|---|
| `storage_deposit` (FT, registration_only) | ✅ 0.00125 NEAR deposit + 2.12 Tgas (0.00019 NEAR); 3.5-4.2 s to FINAL | 📄 NEAR Docs FT integration: min = max = `1250000000000000000000` (example token); `ft_transfer_call` example uses 100 Tgas |
| Relayed `ft_transfer` (1 yocto) | ✅ 3.06-3.33 Tgas, 0.00028-0.00029 NEAR; token receipt 1.85 Tgas | — |
| Relayed `ft_transfer_call` → `ft_on_transfer` → resolve | ✅ 8.9-9.2 Tgas, 0.00080-0.00083 NEAR (100 Tgas attached); receiver 2.8-3.1 T, resolve 1.37 T (used) / 1.86 T (refund) | resolve static 5 Tgas (source) |
| Own FT deployment | ⚠️ ≈ 2.2 NEAR (216,572 B of `fungible-token.testnet` × 1e19) + init gas | — |
| Circle testnet faucet | 📄 "20 USDC on testnet every 2 hours, per address, and per blockchain" | faucet.circle.com |
| Mainnet USDC supply | ✅ 77,388,746.560469 USDC | — |

## Open questions / needs a human
- **Needs a human (optional)**: if we want Circle testnet USDC for a "real USDC" side-demo, someone must request it at faucet.circle.com (20 USDC/2 h). Untested: its `ft_transfer_call` gas needs and whether it passes `ft_on_transfer` the same way (it exports `ft_resolve_transfer`, so probably yes).
- → contracts: build and deploy the near-examples/FT wasm (cargo-near), or decide on a capped public `mint`. The Rulebot must register itself and the DAO on the token, return the unused U128 from `ft_on_transfer`, and fund its own forward `ft_transfer` 1 yocto.
- → intents: confirm that 1Click `/v0/tokens` lists `nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` as NEAR USDC, and that deliveries to a fresh user account need the user registered on USDC first (if 1Click doesn't pay `storage_deposit` itself, our onboarding must).
- → product-ux: label the test token "USDC (test)" / "Demo dollars". Should the symbol be `USDC` or `tUSDC` to avoid confusion with Circle's testnet USDC in explorers?

## Sources
- https://github.com/near/NEPs/blob/master/neps/nep-0141.md : NEP-141 methods, 1 yocto, `ft_on_transfer` / `ft_resolve_transfer` semantics: 2026-10-21
- https://github.com/near/NEPs/blob/master/neps/nep-0145.md : storage management, `registration_only` refund rules (L404-409), bounds: 2026-10-21
- https://github.com/near/near-sdk-rs/blob/master/near-contract-standards/src/fungible_token/core_impl.rs (HEAD a0d61a0) : `ft_transfer_call` gas weights, `GAS_FOR_RESOLVE_TRANSFER` 5 Tgas, refund/burn logic: 2026-10-21
- https://developers.circle.com/stablecoins/usdc-contract-addresses : NEAR mainnet `17208628…` and testnet `3e2210e1…` USDC ids: 2026-10-21
- https://faucet.circle.com/ : "20 USDC on testnet every 2 hours, per address, and per blockchain"; NEAR Testnet listed: 2026-10-21
- RPC `call_function` `ft_metadata` / `storage_balance_bounds` / `ft_total_supply` and `view_code` on https://rpc.mainnet.fastnear.com and https://rpc.testnet.fastnear.com : on-chain metadata, bounds, supply, exported methods: 2026-10-21
- https://github.com/near-examples/FT (commit 7721a49, 2025-10-29) `src/lib.rs` : `new(owner_id, total_supply, metadata)`, no mint: 2026-10-21
- `fungible-token.testnet` `view_account` (storage_usage 216,572) and `view_code` exports : deployment size estimate: 2026-10-21
- https://docs.near.org/integrations/fungible-tokens : 0.00125 NEAR storage min (example), 1 yocto on `ft_transfer`, 100 Tgas for `ft_transfer_call` (example): 2026-10-21
- [spikes/meta-tx/RESULTS.md](../spikes/meta-tx/RESULTS.md) : relayed `ft_transfer(_call)`, refund runs, usdc.fakes mint/burn probe, tx hashes: 2026-10-21
