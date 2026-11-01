# Pot Hub gas and prepay calibration (C-09, C-17)

Measured on 2026-10-22 in the near-workspaces 0.23.0 sandbox (nearcore 2.13.4, protocol 86) on
**both** Sputnik builds:

- **A:** the testnet global contract `Ea8t…`, `278adc7`.
- **B:** mainnet v3.2 `DtHZ…`.

All calls are relayed NEP-366 delegates, as in production. A and B agree to within ±0.05 Tgas, so
the tables show build A.

Reproduce:

```bash
cargo test -p pot-tests --test t_calibrate -- --nocapture | grep CAL
cargo test -p pot-tests --test t_close40 -- --nocapture
```

Units: 1 Tgas = 10¹² gas ≈ 0.0001 NEAR at 10⁸ yocto/gas.

## 1. Changes to the spec's §8.2 constants

These come from the measurements below. A change only ever moves a constant up, unless a different
cap made a reduction necessary; the `join` row is that case.

| Constant | Spec | **Now** | Why |
|---|---|---|---|
| `GAS_ON_SPEND_ADDED` | 60 | **80** | At 60 the callback ran out of gas. It burns 3.75 and attaches 60 (act 40 + get_proposal 10 + status 10), and each outgoing function-call receipt also prepays its ≈ 2.3–2.5 Tgas exec fee. |
| `GAS_ON_SPEND_CHECKED` | 85 | **105** | It burns 3.3, attaches 90 (ADD 10 + `GAS_ON_SPEND_ADDED` 80), plus exec fees for 2 receipts. |
| `GAS_ON_JOIN_ADDED` | 60 | 60 | Unchanged, but see `GAS_ACT_JOIN`. |
| `GAS_ACT` for joins (**new `GAS_ACT_JOIN`**) | 40 | **20** | `act_proposal` on an AddMemberToRole has no payout and burns 2.57 (7.8×; 15 is the known minimum). With 40, `join` needed 95 of the relayer's 100 Tgas. With 20 it needs 75. |
| `GAS_ON_POT_CREATED` | 30 | **40** | It now attaches 20 (storage_deposit 10 + on_dao_registered 10). |
| `GAS_ON_DAO_REGISTERED` | 5 | **10** | Burns 1.68; 5 Tgas was 2.97×, under INV-07's 3×. |
| `GAS_ON_CLOSE_BALANCE` | 45 | **60** | Burns 3.3 at n = 3, and the pro-rata and close kind grow with n. It attaches 30. At n = 40 the whole `propose_close` burns 31.9. |
| **new `GAS_VIEW_DAO`** (`get_policy`, `get_proposal`) | 5 (`GAS_VIEW`) | **10** | `get_policy` burns 1.77 at n = 3, which is 2.8× at 5 Tgas. Both views grow with members and with close actions. |
| `GAS_VIEW` (`ft_balance_of`, `storage_balance_of`) | 5 | 5 | Burns 1.23–1.24, so 4.0×. |

The other §8.2 values are kept as specified:

- `GAS_ADD` 10 and `GAS_ADD_CLOSE` 20
- `GAS_ACT` 40 (FT payout)
- `GAS_FT_TRANSFER` 10 and `GAS_STORAGE_DEPOSIT` 10
- `GAS_DAO_NEW` 20
- `GAS_ON_CONTRIBUTION` 10 and `GAS_ON_STATUS` 10 (spend, join, retry, sync)
- `GAS_ON_CLOSE_ADDED` 10 and `GAS_ON_RULES_ADDED` 10
- `GAS_CLOSE_ACTION` 5 and `GAS_SET_RULES_ACTION` 15

**Caller gas is unchanged.** The relayer still attaches the §3.12 values. Section 3 shows each one is
enough.

## 2. Per-hop burn and INV-07

INV-07 requires static gas ≥ 3× the burn on every leaf hop. The test asserts this on every leaf hop
the hub controls.

| Flow (hops in order) | Static → burnt (Tgas) | Ratio |
|---|---|---|
| **create_pot** | `create_pot` 150 (caller) → 4.13 · DAO batch `CreateAccount+Transfer+UseGlobalContract+new` 20 → 9.58 (action fees included; `new` itself ≈ 3.1 ✅ KB) · `on_pot_created` 40 → 3.65 · `usdc.storage_deposit` 10 → 1.49 · `on_dao_registered` 10 → 1.68 | 6.7× · 6.0× |
| **contribution** (`ft_transfer_call` 100) | `ft_on_transfer` → 2.72 · `ft_transfer` 10 → 1.74 · `on_contribution_forwarded` 10 → 2.17 · `ft_resolve_transfer` 5 → 1.30 | 5.8× · 4.6× · 3.8× |
| **request_spend instant** | `request_spend` 150 → 3.84 · `ft_balance_of` 5 → 1.24 · `storage_balance_of` 5 → 1.23 · `get_policy` 10 → 1.77 · `on_spend_checked` 105 → 3.27 · prepay+`add_proposal` 10 → 2.09 · `on_spend_added` 80 → 3.75 · `act_proposal` 40 → 2.98 (+ DAO payout `ft_transfer` 1.75 + `on_proposal_callback` 2.29) · `get_proposal` 10 → 1.66 · `on_spend_status` 10 → 2.45 | 4.0–6.0× on the leaves |
| **request_spend vote** | same first five hops · `on_spend_added` 80 → 2.59 (returns a value) | |
| **join** | `join` 100 → 3.59 · prepay+`add_proposal` 10 → 2.05 · `on_join_added` 60 → 3.40 · `act_proposal` 20 → 2.57 · `get_proposal` 10 → 1.63 · `on_join_status` 10 → 2.39 | 4.9× · 7.8× · 6.1× · 4.2× |
| **sync** (changed) | `sync` 50 → 2.54 · `get_proposal` 10 → 1.70 · `on_sync` 10 → 2.51 | 5.9× · 4.0× |
| **retry_payout** (T-29) | whole chain 17.1 | |
| **add_invite** | 30 → 2.32 | 12.9× |
| **propose_rules** | `propose_rules` 100 → 2.99 · prepay+`add_proposal` 10 → 2.17 · `on_rules_added` 10 → 2.21 | 4.6× · 4.5× |
| **member vote executing `set_rules`** (300) | DAO → `hub.set_rules` 15 → 2.05 | 7.3× |
| **propose_close** n = 3 | `propose_close` 150 → 3.26 · `ft_balance_of` 5 → 1.24 · `on_close_balance` 60 → 3.33 · prepay+`add_proposal` 20 → 2.23 · `on_close_added` 10 → 2.46 | 4.0× · 9.0× · 4.1× |
| **member vote executing close** n = 3 (300) | DAO → USDC `ft_transfer`×3 at 5 each → 4.90 in total | 3.1× |

## 3. Totals per flow, and the minimum caller gas

The minimum caller gas comes from a binary search at 1 Tgas resolution. Because every hop uses
static gas, a flow either schedules all its hops or fails at the first receipt with no state change.

| Flow | Burnt in total (relayed) | ≈ NEAR (relayer) | **Minimum caller gas** | Relayer attaches (§3.12) | Headroom |
|---|---|---|---|---|---|
| `create_pot` | 22.7 | 0.0023 + 0.007 creation charge | **73** | 150 | 77 |
| contribution (`ft_transfer_call`) | 12.6 | 0.0013 | **35** (T-16) | 100 | 65 |
| `request_spend` instant | 32.5 | 0.0033 | **132** | 150 | 18 |
| `request_spend` vote | 18.7 | 0.0019 | **132** | 150 | 18 |
| member vote executing a Transfer | 9.3 | 0.0009 | (≥ 25 ✅ KB) | 100 | |
| `join` | 18.5 | 0.0018 | **75** | 100 | 25 |
| `add_invite` / `revoke_invite` | 3.6 | 0.0004 | **5** | 30 | 25 |
| `sync` | 7.5 | 0.0008 | **24** | 50 | 26 |
| `propose_rules` | 9.1 | 0.0009 | **24** | 100 | 76 |
| member vote executing `set_rules` | 9.7 | 0.0010 | | 300 | |
| `propose_close` n = 1 | 14.7 (n = 3) | 0.0015 | **69** | 150 | 81 |
| `propose_close` n = 30 / 40 | 27.2 / 31.9 | 0.003 | | 150 | |
| `retry_payout` | 17.1 | 0.0017 | (≈ 60 static) | 100 | |

`request_spend` has the tightest margin: it needs 132 of 150 Tgas (12 %). If a future change adds
hops, raise the relayer's `request_spend` gas to 200. That needs an api-spec change.

## 4. Closing with the 300 Tgas `call` vote (T-73, C-17)

The deciding member vote on a close proposal pays for every `ft_transfer` (5 Tgas static each) plus
the DAO's own work. A vote with too little gas fails as a whole and is not recorded. The test scans
upward in 5 Tgas steps:

| n (payees) | Minimum prepaid gas for the deciding vote | Burnt | Spec formula 15 + 5.4·n |
|---|---|---|---|
| 3 | (300 used) | 13.1 | 31 |
| 30 | **195** (190 fails) | 64.6 | 177 |
| 40 | **255** (250 fails) | 83.7 | 231 |

- **Measured: ≈ 15 + 6·n.** 300 Tgas covers n ≤ 47, so `HARD_MAX_MEMBERS = 40` holds with 45 Tgas
  to spare.
- The spec formula underestimates by ≈ 0.6 Tgas per payee, which is the per-action receipt
  overhead.
- The KB's "150 Tgas worked at n = 30" used 3 Tgas per action, and we use 5.
- At n = 40, `propose_close` burns 31.9 Tgas and its `close_proposed` event is 2,261 B, far under the
  16 KB per-receipt log cap.

## 5. Prepay compared with the DAO's real storage growth

Prepay is computed in §3.11:

```
prepay = (250 + len(description) + len(kind_json) + 160 + 100 × extra_votes) × 10¹⁹
```

`extra_votes` is `member_count` for member-voted kinds and 0 for hub-approved ones. The test
asserts `prepay ≥ growth` for every kind, so the DAO's float is never touched.

| Proposal | Prepaid (B-equiv) | DAO storage growth (B) | Margin |
|---|---|---|---|
| Instant spend (Transfer + rulebot vote) | 572 | 351 | +63 % |
| Join (AddMemberToRole + rulebot vote + policy growth) | 504 | 321 | +57 % |
| Vote spend, 3 members, 3 votes cast | 860 | 470 | +83 % |
| Rules, 3 members, 3 votes | 1,116 | 643 | +74 % |
| Close n = 3, 3 votes | 1,377 | 785 | +76 % |
| Close n = 30, 16 votes | 9,049 | 4,050 | +123 % |
| Close n = 40, 21 votes | 11,890 | 5,319 | +124 % |
| **T-97:** vote spend in a 40-member Pot, **all 40 votes cast** (20 for, 20 against) | 4,563 | 1,107 | +312 % |

- The model is deliberately conservative. A later vote costs ≈ 27 B on both builds, against the
  100 B the model assumes.
- The close prepay uses the call-time upper bound: full-width amount strings and every member
  voting.
- Lowering `PREPAY_EXTRA_VOTE_BYTES` to 50 would save ≈ 0.002 NEAR per vote-path request at n = 40.
  It is not done: the hub's NEAR is cheap, and an underfunded DAO breaks proposals.

## 6. Direct (unsponsored) `cost(op)` (rev4 §3.0)

`cost(op)` is what the hub keeps from a direct caller, and `ERR_DEPOSIT_REQUIRED: <yocto>` carries
it. It is the NEAR the hub sends out plus a state budget:

| Op | `cost(op)` | Testnet (float 0.05) | §3.0 attach value |
|---|---|---|---|
| `create_pot` | f + 0.00125 + 1,500 B | 0.06625 | 0.07 ✅ |
| `request_spend` | prepay(path) + 600 B | 0.0117 instant / ≤ 0.052 vote at n = 40 | 0.06 ✅ |
| `join` | join prepay + 700 B | 0.0120 | 0.02 ✅ |
| `add_invite` | 300 B | 0.003 | 0.005 ✅ |
| `propose_rules` | prepay(member_count votes) + 200 B | ≤ 0.059 at n = 40, 10-entry allowlist | 0.06 ✅ |
| `propose_close` | close prepay upper bound + 400 + 110·n B | ≈ 0.016 (n = 3), ≈ 0.17 (n = 40: 0.119 prepay + 0.048 state) | 0.15 ⚠️ under at n ≥ ≈ 35 |

`propose_close` at n = 40: callers must attach the amount in the error detail, or 0.2 NEAR. PR-05
(t_safety) checks that a direct call attaching exactly `cost(op)` never lowers the hub's free
balance. It subtracts an upper bound of the protocol-86 gas reward, so the result holds on testnet,
where that reward is 0.
