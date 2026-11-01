# Pot contracts

Three wasm artifacts are involved, and one of them is ours (contracts-spec §1):

| Artifact | What | Source |
|---|---|---|
| `pot_hub.wasm` | **Pot Hub**: the Rulebot, the factory and the ledger for every Pot (D-02) | `pot-hub/` (ours) |
| `test_usdc.wasm` | NEP-141 "USDC (test)", 6 decimals. The whole supply is minted to the owner at `new`; there is no mint method (D-11) | `test-usdc/`, vendored byte-for-byte from near-examples/FT@7721a49 (`test-usdc/UPSTREAM.md`) |
| Sputnik DAO v2 | One DAO per Pot, used by global code hash | `res/sputnik/` (vendored, read-only RPC download; `SHA256SUMS`) |

## Toolchain (D-12)

- Rust **1.93.0** from `rust-toolchain.toml`. rustup selects it automatically; never change
  `rustup default`.
- `near-sdk = "=5.29.1"`, `near-contract-standards = "=5.29.1"` and (in tests)
  `near-workspaces = "=0.23.0"`.
- **cargo-near 0.22.0**. Use `cargo install --locked cargo-near@0.22.0 --root contracts/.bin` (and add
  `contracts/.bin/bin` to PATH), or the installer from kb/contracts-toolchain.md. For one-off builds,
  `npx -y cargo-near@0.22.0 near build non-reproducible-wasm` also works.
- A plain `cargo build` of a contract is wrong for near-sdk ≥ 5.27. Always build with
  `cargo near build non-reproducible-wasm`.
- Don't use the protocol-88 release candidates (near-sdk 5.30-rc, cargo-near 0.23-rc,
  near-workspaces 0.24-rc).
- The sandbox runs on arm64 macOS and on Linux, but not on Intel Macs. On an Intel Mac, use CI.

## Build

```bash
cd contracts
./scripts/build.sh                    # both wasm + refreshes abi/pot_hub.json and abi/test_usdc.json
# or one crate:
(cd pot-hub && cargo near build non-reproducible-wasm)   # → target/near/pot_hub/pot_hub.wasm (+ embedded ABI)
```

Current sizes:

- `pot_hub.wasm`: 463.6 KB, ≈ 4.64 NEAR of storage on the hub account.
- `test_usdc.wasm`: 168.7 KB.

The ABI for `packages/pot-sdk` is at **`abi/pot_hub.json`** (NEAR ABI schema 0.4.0, 38 functions). A
promise-returning method (`create_pot`, `request_spend`, `join`, `sync`, `retry_payout`,
`propose_rules`, `propose_close`, `ft_on_transfer`) has no result type in the ABI. Its final value is
the return type of its last callback:

| Method | Final value | Last callback |
|---|---|---|
| `create_pot` | `CreatePotOutcome` | `on_dao_registered` / `on_pot_created` |
| `request_spend` | `SpendOutcome` | `on_spend_*` |
| `join` | `JoinOutcome` | `on_join_*` |
| `sync` | `SyncOutcome` | `on_sync` |
| `retry_payout` | `RetryOutcome` | `on_retry_status` |
| `propose_rules` | `RulesOutcome` | `on_rules_added` |
| `propose_close` | `CloseOutcome` | `on_close_*` |
| `ft_on_transfer` | the unused `U128` | `on_contribution_forwarded` |

To refresh the Sputnik artifacts and check their hashes:

```bash
./res/sputnik/fetch.sh    # testnet global Ea8t… (278adc7), mainnet v3.2 DtHZ…, mainnet factory; then shasum -c
```

## Test

```bash
cd contracts
cargo test                       # unit + proptest (pot-hub) and the whole sandbox suite (pot-tests)
cargo test -p pot-hub            # unit only: ledger PR-03, pro-rata P-01 + V1-V7 + sdk parity, policy/kind snapshots, time paths
cargo test -p pot-tests --test t_spend -- --nocapture   # one sandbox file
```

- The first run downloads the nearcore 2.13.4 sandbox (≈ 29 MB, protocol 86 = mainnet parity) and
  the crates.
- The sandbox harness rebuilds the wasm with `cargo near` when the contract sources are newer than
  `target/near`. Set `POT_NO_BUILD=1` to skip that (CI builds first).
- **Every sandbox test runs twice**: as `…::build_a` (Sputnik testnet global `Ea8t…`) and as
  `…::build_b` (mainnet v3.2 `DtHZ…`). Both are published as global code through the vendored
  mainnet factory's `store()` in an earlier transaction (contracts-spec §7.2).
- Relayed calls are real **NEP-366 delegates**: the harness signs `DelegateAction`s with
  near-primitives 0.37, because near-workspaces 0.23 has no meta-transaction support. So the
  sponsorship rule (`signer ∈ relayers`) is exercised end to end.
- Tests share no state: each test function starts its own sandbox (≈ 12 s of setup) and then runs
  many scenarios in it.

| File | Spec tests |
|---|---|
| `tests/t_create.rs` | T-00…T-06, T-89 (create), T-90 |
| `tests/t_contrib.rs` | T-10…T-13, T-15…T-17 |
| `tests/t_spend.rs` | T-20…T-28, T-30, T-31, T-88 (spend views), T-94, T-96 |
| `tests/t_vote.rs` | T-29, T-40…T-46, T-97 (sandbox part) |
| `tests/t_invite.rs` | T-50…T-57, T-93 |
| `tests/t_rules.rs` | T-60…T-62, T-91 |
| `tests/t_close.rs` | T-70…T-72, T-74, T-75, T-92, T-88 (close views), T-14, T-55 (closing) |
| `tests/t_close40.rs` | T-73 / C-17 (deciding-vote gas at n = 30 and 40), T-97 (40 votes vs. the prepay) |
| `tests/t_safety.rs` | T-80…T-84, T-86, T-87, T-95, PR-05 |
| `tests/t_calibrate.rs` | C-09: per-hop gas, INV-07, minimum caller gas, prepay vs. DAO storage (see `CALIBRATION.md`) |
| `pot-hub` unit | T-57, T-85, the T-95 static checks, PR-01/P-01, PR-02 parity (sdk vectors), PR-03, policy snapshot (INV-16), and the time paths for T-90, T-92 and T-97 (`unit_time.rs`) |

One sandbox limit shapes the tests. `fast_forward` advances only ≈ 0.3 s of block time per block, so
7 days would take ≈ 2M blocks. The time-dependent rules are therefore tested in three ways:

- **Unit tests** cover the 7-day expiry by the DAO's `submission_time`, the 24 h close cooldown and
  the UTC-midnight cap reset.
- **Short real windows** cover invite expiry (> now + 60 s) and the 60 s busy window.
- **A shortened DAO `proposal_period`** covers expiry seen through a vote.

## Layout

```
contracts/
  Cargo.toml              workspace (resolver 3): pot-hub, test-usdc, tests; release profile with overflow-checks
  rust-toolchain.toml     1.93.0 + wasm32
  pot-hub/src/
    lib.rs                state (§2.1), new/set_config, create_pot, ft_on_transfer, request_spend, sync,
                          retry_payout, invites + join, rules, close; gas constants (CALIBRATION.md)
    types.rs              the complete v1 borsh layout + constants (§2.2-2.3), incl. Phase-2 fields
    ledger.rs             apply_transition: the only code that moves request counters (§2.4, INV-06)
    prorata.rs            close math (§3.9); vectors in tests/vectors/prorata.json
    kinds.rs              the only proposal shapes the hub can create (INV-02) + descriptions
    policy.rs             DAO new args: the hardened policy (§3.2, D-04 Rev 5: no RemoveProposal)
    ext.rs                token/DAO interfaces (only act_proposal/get_proposal/get_policy on DAOs, T-85)
    events.rs             NEP-297 `pot` events (§5)
    views.rs              views + outcome shapes (§4)
    errors.rs             ERR_* codes (§3.13)
    unit_time.rs          unit tests for the time-dependent paths
  test-usdc/              vendored FT + UPSTREAM.md
  tests/                  sandbox harness (src/lib.rs) + suites (tests/*.rs) + vectors/prorata.json
  res/sputnik/            fetch.sh, SHA256SUMS, three vendored wasm
  abi/                    pot_hub.json (for the sdk), test_usdc.json
  scripts/build.sh        build both + refresh abi/
  CALIBRATION.md          measured gas / prepay (C-09, C-17)
```

The state layout is frozen once prod v1 ships (C-13). After that, only layout-compatible redeploys
are allowed: append, never reorder.

For deviations from contracts-spec.md and what other layers must do about them, see
`../notes/contracts.md`.
