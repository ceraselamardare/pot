# Contracts toolchain: near-sdk, cargo-near, Rust pin, sandbox tests (+ Sputnik wasm in sandbox)
> Owner: contracts. Last verified: 2026-10-21. Legend: ✅ verified · 📄 docs-only · ⚠️ unverified/conflicting

## TL;DR
- ✅ **Pin these versions:** `near-sdk = "=5.29.1"`, `near-contract-standards = "=5.29.1"`, and dev-only `near-workspaces = "=0.23.0"`. Use the CLIs **cargo-near 0.22.0** and **near-cli-rs 0.30.1**, with Rust **`1.93.0`** in `rust-toolchain.toml`, which is what `cargo near new` 0.22.0 generates. The MSRV of near-sdk, cargo-near and near-workspaces is **1.93**, so this machine's `stable` (1.82) and 1.85 cannot build them.
- ✅ **The "new Rust emits wasm features nearcore rejects" problem is solved for us.** Protocol 84 (nearcore 2.12) accepts reference-types, bulk-memory and nontrapping-fptoint. The `reftypes_bulk_memory` flag is `true` on testnet (protocol 87) and mainnet (86). near-sdk 5.29.1 declares `[package.metadata.near] min_protocol_version = 84`, so cargo-near drops its old **1.86** rustc ceiling and runs wasm-opt with `--enable-bulk-memory --enable-nontrapping-float-to-int`. Verified: a contract built with rustc **1.93.0 and 1.99.1** (the latest stable) deploys and runs on a protocol-86 sandbox. Multi-value stays disabled in nearcore, but rustc does not emit it.
- ✅ **Don't adopt the October release candidates:** near-sdk 5.30.0-rc.1, cargo-near 0.23.0-rc.2, near-workspaces 0.24.0-rc.2, near-sandbox 0.4.0-rc.2. They need MSRV 1.95, they target **protocol 88** while testnet runs 87 and mainnet 86 (the $20 mainnet clip needs protocol-86-safe code), and they carry breaking changes.
- ✅ **Always build with `cargo near build non-reproducible-wasm`.** near-sdk ≥ 5.27 needs `--cfg near`, which cargo-near injects. A plain `cargo build` hits a `compile_error!`, or on wasm it silently gets "pure-Rust fallbacks, not for on-chain use". A cold build takes **33-42 s** and a warm one **5-10 s** on this M5 Pro. cargo-near bundles wasm-opt (binaryen via wasm-opt-rs); the system `wasm-opt` v112 is never used.
- ✅ **The near-workspaces sandbox runs on this arm64 Mac.** It downloads nearcore **2.13.4** (protocol 86, the same as mainnet) for Darwin-arm64: a 29 MB tgz that unpacks to a 71.5 MB binary in `target/.../OUT_DIR`. The sandbox starts in 0.5-2 s. `near_workspaces::sandbox_with_version("2.14.0-rc.4")` gives protocol 88, which matches testnet's next version, and it was tested. **Intel Macs are not supported** by near-sandbox-rs.
- ✅ **Plan C8 is de-risked in the sandbox,** independently of testnet. The test used the exact live Sputnik factory and DAO wasm from **both** testnet and mainnet, a `rulebot` role (Group [rulebot], `transfer:AddProposal` + `transfer:VoteApprove`, threshold 1/1) and `proposal_bond "0"`. One `add_proposal` (2.2-2.4 Tgas) plus one `VoteApprove` (6.5-6.7 Tgas) executed the transfer, with status `Approved`. Both variants together take 15 s of wall time.
- ❌ **"Sputnik wasm in `res/`":** `near-daos/sputnik-dao-contract` `main` has **no `res/` folder any more** (it moved to reproducible builds, Mar 2025), and only the two old releases 2.0.0 and 3.0.0 exist. **Vendor the exact deployed artifacts instead.** The four files are listed below with their hashes and a tested fetch script.
- ⚠️ **Testnet and mainnet run different Sputnik builds.**
  - `sputnikv2.testnet` is the 2024 legacy build (commit `7764926`). It has no global contracts and deploys the **540 KB code into every DAO**, so each DAO needs at least 5.4 NEAR. Its signature is `act_proposal(id, action, memo)`.
  - `sputnik-dao.near` is the 2026 build (commit `2b0f34a`). It uses global contracts, its signature is `act_proposal(id, action, proposal, memo)`, and it rejects unknown arguments.
  - Test against both, and **always send `proposal`** (the legacy build ignores it). Details are in [contracts-patterns.md](contracts-patterns.md).
- ✅ **Reproducible (docker) builds** use `sourcescan/cargo-near:*` images, which are **amd64-only**. Docker Desktop here is 4.9.1 (2022, engine 20.10), so they would run under emulation. Use plain builds locally, and do reproducible builds only in Linux CI if we want nearblocks to show the contract as "verified" (optional).

## Plan check
| Claim in the original plan | Verdict |
|---|---|
| A: "Rust with near-sdk 5.x and cargo-near, near-workspaces" | ✅ Works on this machine. Exact pins are in the TL;DR. The official `cargo near new` template now tests with **near-sandbox + near-api** instead of near-workspaces, but both work (both run here). |
| A: "Pin on Nov 1 … near-sdk 5.x, near-contract-standards" | ✅ 5.29.1 (2026-09-17). ⚠️ Avoid 5.30.0-rc.1 (2026-10-19; MSRV 1.95, protocol 88, breaking). |
| C8: "near-workspaces-rs with the Sputnik wasm in `res/`" | ✅ The harness works (near-workspaces 0.23.0 + nearcore 2.13.4 sandbox). ❌ The `res/` files no longer come from the Sputnik repo; vendor them via RPC (below). |
| C8: "factory creates DAO and Rulebot … bond "0" accepted" | ✅ The DAO, the rulebot role and bond 0 are all verified. ⚠️ The factory/Rulebot naming in the plan is impossible (see patterns §C). |
| C3: "testnet factory (docs `sputnikv2.testnet`, README `sputnik-v2.testnet`; confirm)" | ✅ `sputnikv2.testnet` is the factory: `get_number_daos` = 5319, default code `AA4nA45…`, metadata version `[3,31]`. `sputnik-v2.testnet` has code but **no factory methods** (`MethodNotFound`). Live behaviour → sputnik agent. |
| Key findings: the factory moves "the whole deposit … to the new DAO, which uses a global contract" (0.01 NEAR) | ✅ True for `main` and mainnet (`sputnik-dao.near` imports `use_global_contract`). ❌ **False for testnet**: the `sputnikv2.testnet` factory imports only `promise_batch_action_deploy_contract`, and the sandbox measured a minimum of **5.39679 NEAR**. |
| C6: "Read `sputnikdao2/src/proposals.rs` on day 1 for `act_proposal` arguments" | ✅ Done: two signatures (see patterns §A). |
| C8 README step 5: "`pnpm i && pnpm test:contracts` → sandbox tests pass (no keys)" | ✅ Feasible. The sandbox needs no keys and no network, apart from crates and the first binary download from S3. It needs an arm64 Mac or Linux (x86_64/aarch64), or WSL2. |
| Caveats: "Package versions … were not verified" | ✅ Verified now (table below). |

## Reference

### Versions (crates.io API, npm, 2026-10-21)
| Package | Latest stable (date) | MSRV | Newest pre-release | Use |
|---|---|---|---|---|
| near-sdk | **5.29.1** (2026-09-17) | 1.93 | 5.30.0-rc.1 (10-19, MSRV 1.95, min protocol 88) | `=5.29.1` |
| near-contract-standards | **5.29.1** | 1.93 | 5.30.0-rc.1 | `=5.29.1` (test USDC, NEP-141/145) |
| cargo-near (CLI) | **0.22.0** (2026-07-14 on crates.io; changelog 07-13); npm `cargo-near@0.22.0` = latest | 1.93 | 0.23.0-rc.2 (10-19, 1.95) | 0.22.0 |
| cargo-near-build (lib) | 0.11.5 (2026-07-14) | 1.86 | — | only if tests build wasm (`build_with_cli`) |
| near-workspaces | **0.23.0** (2026-07-09) | 1.93 | 0.24.0-rc.2 (10-19, 1.95) | dev `=0.23.0` |
| near-sandbox (rs) | 0.3.16 (2026-09-04), default nearcore **2.13.4** | 1.86 | 0.4.0-rc.2 (10-14), default 2.14.0-rc.4 | pulled in by workspaces (`^0.3.12`) |
| near-api | 0.8.6 (2026-04-15) | 1.86 | — | alternative test client; has global-contract builders |
| near-cli-rs | 0.30.1 (`npx -y near-cli-rs@0.30.1`; `~/.cargo/bin/near` here) | — | — | deploy, keys, view |
| Rust | stable **1.99.1** (2026-10-13) | — | — | pin 1.93.0 (1.99.1 also verified) |

Machine state on 2026-10-21. The default toolchain is `nightly-2023-12-11` and must not be changed. `stable` = 1.82.0 and `1.85` = 1.85.1, both without wasm32. `1.93.0` has wasm32 (another agent installed it at 14:12). I installed `1.99.1` with wasm32, and accidentally auto-installed a duplicate `1.85.1` (see Gotchas). `~/.cargo/bin/cargo-near` is 0.22.0 and `~/.cargo/bin/near` is near-cli-rs 0.30.1.

Networks (RPC `status` / `EXPERIMENTAL_protocol_config`): **testnet** is at protocol 87 (latest 88) on nearcore 2.14.0-rc.5. **Mainnet** is at protocol 86 on nearcore 2.13.4, built with rustc 1.93.0. Both have `reftypes_bulk_memory: true` and `global_contract_host_fns: true`.

### Why the wasm-feature pitfall no longer bites (source-verified)
- rustc's default features for `wasm32-unknown-unknown` (the "generic" CPU) are multivalue, mutable-globals, reference-types and sign-ext, plus **nontrapping-fptoint and bulk-memory since Rust 1.87**. Nothing new has been added since. 📄 rustc platform doc.
- The nearcore validator (`runtime/near-vm-runner/src/features.rs`) accepts sign_extension, saturating_float_to_int, and reference_types + bulk_memory (the `REFTYPES_BULK_MEMORY` gate, protocol 84). It rejects **multi_value**, SIMD, threads, tail_call and exceptions. ✅
- cargo-near-build (`src/near/build/mod.rs`):
  - `BULK_MEMORY_PROTOCOL_VERSION = 84`.
  - `max_allowed_rustc(min_pv)` returns `None` when near-sdk's `min_protocol_version ≥ 84`; otherwise it returns **1.86.0** and the build fails with "wasm, compiled with rustc X exceeds the max allowed 1.86.0". The escape hatch is `--skip-rust-version-check`.
  - If rustc ≥ 1.87, it enables wasm-opt `TruncSat` + `BulkMemory`.
  - The wasm-opt step is `OptimizationOptions::new_optimize_for_size()` (`-Os`). ✅
- Logged during build: `INFO: contract's near-sdk targets protocol version 84; rustc 1.93.0 accepted (bulk-memory opcodes supported by nearcore VM)` ✅. The same line appears for 1.99.1.
- Sputnik's own repo pins Rust 1.86 because its near-sdk 5.24 predates the metadata. This doesn't affect us, because we vendor its wasm.

### Recommended project layout and pins
```toml
# rust-toolchain.toml  (identical to `cargo near new` 0.22.0)
[toolchain]
channel = "1.93.0"
components = ["rustfmt", "clippy", "rust-analyzer"]
targets = ["wasm32-unknown-unknown"]
```
```toml
# Cargo.toml (workspace root)
[workspace]
resolver = "3"                       # MSRV-aware resolver; keeps deps compatible with rust-version
members = ["contracts/rulebot", "contracts/test-usdc", "contracts/tests"]   # + pot-factory only if kept
[workspace.package]
edition = "2024"
rust-version = "1.93"
repository = "https://github.com/<org>/pot"   # NEP-330 contract_source_metadata, read by cargo-near
[profile.release]                     # = template; overflow-checks matters for money math
codegen-units = 1
opt-level = "z"
lto = true
debug = false
panic = "abort"
overflow-checks = true
```
```toml
# contracts/rulebot/Cargo.toml (per contract)
[lib]
crate-type = ["cdylib", "rlib"]
[dependencies]
near-sdk = "=5.29.1"                  # test-usdc: + near-contract-standards = "=5.29.1"
[dev-dependencies]
near-sdk = { version = "=5.29.1", features = ["unit-testing"] }
[lints.rust.unexpected_cfgs]
level = "warn"
check-cfg = ['cfg(near)']
# contracts/tests/Cargo.toml: [dev-dependencies] near-workspaces = "=0.23.0", tokio = { version = "1", features = ["full"] },
#                             serde_json = "1", anyhow = "1", base64 = "0.22"
```
- near-sdk features: `unit-testing` is for dev only. `deterministic-account-ids` is only needed for NEP-616 `state_init`. Global-contract `Promise` methods have needed no feature since 5.25. `legacy` exposes `near_sdk::collections`; near-contract-standards enables it itself. New code should use `near_sdk::store::{LookupMap, IterableMap, LookupSet, Vector, LazyOption}` ✅.

### cargo-near commands
| Command | What it does |
|---|---|
| `cargo near build non-reproducible-wasm` | Builds into `target/near/<crate>/<crate>.wasm` plus `<crate>_abi.json` and `<crate>_abi.zst`. The ABI is embedded and exported as `__contract_abi`. In a workspace the output goes to `<ws>/target/near/<crate>/`. `--locked` is passed by default, so commit `Cargo.lock` (or pass `--no-locked`). Flags: `--no-abi`, `--no-embed-abi`, `--no-wasmopt`, `--features`, `--abi-features`, `--profile`. ✅ |
| `cargo near check` (0.22.0+) | Type-checks with `--cfg near` on wasm32, without wasm or ABI output. 📄 |
| `cargo near build reproducible-wasm` | Runs in Docker. Requires a clean committed tree, `Cargo.lock` in git, a `[package.metadata.near.reproducible_build]` image and digest, and the `repository` field. The newest image is `sourcescan/cargo-near:0.22.0-rust-1.99.1` (amd64 only); `ghcr.io/near/cargo-near` images started on 2026-10-19 (PR #463). 📄 |
| `cargo near deploy …` / `near contract deploy <acc> use-file <wasm> …` | Deploy. Global contracts use `near contract deploy-as-global use-file <wasm> as-global-account-id <acc>` (or `as-global-hash`). 📄 commands present in 0.30.1 ✅ |
| `cargo near abi` / `near contract download-abi` | Produces the ABI JSON. 📄 |

### Sandbox and test harness facts
- **Version chain:** near-workspaces 0.23.0 → near-sandbox `^0.3.12` resolves to 0.3.16 → nearcore **2.13.4**: `neard (release 2.13.4) … (rustc 1.93.0) (min_protocol 83) (protocol 86)`. `sandbox_with_version("2.14.0-rc.4")` gives **protocol 88** (tested; first download plus start took 6.6 s). ✅
- **Binary:** `https://s3-us-west-1.amazonaws.com/build.nearprotocol.com/nearcore/{Darwin-arm64|Linux-x86_64|Linux-aarch64}/{version}/near-sandbox.tar.gz`. For 2.13.4 the sizes are Darwin-arm64 28.9 MB and Linux-x86_64 35.2 MB.
  - It is cached **per target dir** at `target/debug/build/near-sandbox-*/out/.near/near-sandbox-<ver>/near-sandbox`. The `global_install` feature moves it to `~/.near/`.
  - Env vars: `NEAR_SANDBOX_BIN_PATH` uses a local binary; `SANDBOX_ARTIFACT_URL` overrides the download URL. ✅
- **Platforms:** darwin-arm64, linux-x86_64 and linux-aarch64. **Darwin-x86_64 returns `UnsupportedPlatformError`.** A Darwin-x86_64 tarball does exist on S3 (2.13.4, 31.7 MB), so `NEAR_SANDBOX_BIN_PATH` might work. ⚠️ untested. Windows → WSL2.
- **near-workspaces API facts:**
  - The root account is `test.near`, with sub-accounts via `root.create_subaccount("x")`.
  - `call` defaults to **10 Tgas** and 0 deposit. `max_gas()` = **1 PGas**.
  - `fast_forward(n)` skips blocks.
  - `ExecutionFinalResult.{json(), into_result()}` **consume** the result. `outcomes()` and `receipt_outcomes()` give per-receipt `gas_burnt`, `tokens_burnt` and `logs`. ✅
- **Global contracts:** near-workspaces 0.23 transactions have **no deploy-global or use-global actions**. Contracts can still do both through promises (the Sputnik factory's `store` and `create` did, ✅). near-api 0.8.6 has `Contract::deploy_global_contract_code(code).as_hash()/.as_account_id(..)`, `Contract::deploy(id).use_global_hash(h)/.use_global_account_id(id)`, and `Contract::global_wasm()`. 📄 source.
- **Template harness:** the `cargo near new` template tests with `near-sandbox 0.3.12 + near-api 0.8 + cargo-near-build 0.11`, and so do Sputnik's own tests (migrated Nov 2025). `cargo_near_build::build_with_cli` **spawns `cargo near build`**, so `cargo-near` must be on `PATH`; npx alone is not enough. ✅ source plus run.

### Sputnik wasm to vendor into Pot's `res/` (third-party artifacts, fine to commit)
| File | Bytes | NEAR code hash (base58 sha256) | sha256 hex | Origin |
|---|---|---|---|---|
| `sputnikdao_factory2_testnet.wasm` | 808,766 | `77dkUJRCHKRxJxo6UtYgBtRP6hsEX2v4vXjmFuY7dktb` | `5ad928c1…3943d31c` | `view_code sputnikv2.testnet`. Byte-identical to `sputnikdao-factory2/res/sputnikdao_factory2.wasm` at commit `7764926` (2024-08-24). Legacy factory: embeds the DAO code and `deploy_contract`s it per DAO. ✅ |
| `sputnikdao2_testnet_v3_31.wasm` | 539,647 | `AA4nA45vauiac3jdVwJTzSdUP3oj2r1fDaPAb2mHdgcH` | `880bae9a…80952da` | `sputnikv2.testnet.get_code({code_hash})`, which equals `sputnikdao2/res/sputnikdao2.wasm` at `7764926` (near-sdk 4.0.0-pre.4). It is the testnet default (metadata `[3,31]`). ✅ |
| `sputnikdao_factory2_mainnet.wasm` | 198,307 | `BXd5idTXSnC7WRfxHmi7z4crw2F5WXQJ6MZUEv8DfnnY` | `9c6d1741…14e675` | `view_code sputnik-dao.near`. Global-contracts factory: `store` → `deploy_global_contract`, `create` → `use_global_contract`. ✅ |
| `sputnikdao2_mainnet_v3_2.wasm` | 444,088 | `DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF` | `bf6f951e…37e0d7f6` | `view_global_contract_code` on mainnet. Metadata `[3,2]`, commit `2b0f34a` (2026-02-25). Exports `get_actions_log`, `__contract_abi`, `contract_source_metadata`. ✅ |

The mainnet DAO code is **not** published as a global contract on testnet, and neither is the testnet one (`NO_GLOBAL_CONTRACT_CODE` for both hashes) ✅. Sputnik `main` (`5434a59`, 2026-05-28) is two commits after mainnet's `2b0f34a`: #233 added a 2-week delay to factory auto-updates, and #235 fixed a typo.

### Sandbox bootstrap sequence (measured on nearcore 2.13.4)
| Step | Legacy testnet factory | Global (main/mainnet) factory |
|---|---|---|
| Factory account balance needed | ~20 NEAR (808 KB code + 540 KB stored DAO code) | ~60 NEAR (`store` burns 44.41 NEAR + 4.44 NEAR local copy) |
| `new()` | 41.6 Tgas; stores the embedded DAO code | 1.6 Tgas |
| Publish the DAO code | (automatic) | `store(<raw wasm as args>)`, deposit **50 NEAR**, max gas → 69.6 Tgas, returns `"DtHZA1…"`; then `set_default_code_hash({"code_hash": …})` |
| `create({"name": "<n>", "args": base64(json{config, policy})})` | deposit **≥ 5.39679 NEAR** (`ERR_NOT_ENOUGH_DEPOSIT:5396790000000000000000000` at 5 NEAR), 300 Tgas attached, **88.5 Tgas** burnt, 0.0151 NEAR burnt; DAO storage 540,404 B | deposit ≥ 0.01 NEAR (`MINIMAL_DEPOSIT`), **15.0 Tgas**, 0.0077 NEAR burnt; DAO storage **846 B**, `GlobalHash(DtHZA1…)`. ⚠️ Fund ≥ 0.25 NEAR anyway (proposal storage, patterns §E). |
| DAO account | `<n>.<factory>` | same |

## Snippets

**1. Vendor the Sputnik wasm (tested 2026-10-21; reproduces the hashes above)**
```bash
mkdir -p res && python3 - <<'EOF'
import json, base64, urllib.request
def rpc(url, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "query", "params": params}).encode()
    return json.load(urllib.request.urlopen(urllib.request.Request(url, body, {"Content-Type": "application/json"})))["result"]
T = "https://test.rpc.fastnear.com"; M = "https://free.rpc.fastnear.com"   # rpc.testnet.fastnear.com returned -429 for us
def w(p, b): open(p, "wb").write(b)
w("res/sputnikdao_factory2_testnet.wasm", base64.b64decode(rpc(T, {"request_type": "view_code", "finality": "final", "account_id": "sputnikv2.testnet"})["code_base64"]))
a = base64.b64encode(b'{"code_hash":"AA4nA45vauiac3jdVwJTzSdUP3oj2r1fDaPAb2mHdgcH"}').decode()
w("res/sputnikdao2_testnet_v3_31.wasm", bytes(rpc(T, {"request_type": "call_function", "finality": "final", "account_id": "sputnikv2.testnet", "method_name": "get_code", "args_base64": a})["result"]))
w("res/sputnikdao_factory2_mainnet.wasm", base64.b64decode(rpc(M, {"request_type": "view_code", "finality": "final", "account_id": "sputnik-dao.near"})["code_base64"]))
w("res/sputnikdao2_mainnet_v3_2.wasm", base64.b64decode(rpc(M, {"request_type": "view_global_contract_code", "finality": "final", "code_hash": "DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF"})["code_base64"]))
EOF
shasum -a 256 res/*.wasm
```

**2. Harness skeleton: Sputnik + rulebot role, near-workspaces 0.23.0 (condensed from the passing spike test).** Swap the factory for the legacy one and use deposit `6 NEAR` to test the testnet variant. The legacy factory needs no `store` call.
```rust
use base64::Engine as _;
use near_workspaces::{types::{Gas, NearToken}, AccountId};
use serde_json::{json, Value};

const FACTORY: &[u8] = include_bytes!("../../res/sputnikdao_factory2_mainnet.wasm");
const DAO: &[u8] = include_bytes!("../../res/sputnikdao2_mainnet_v3_2.wasm");

#[tokio::test]
async fn rulebot_role_executes_transfer() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;                 // nearcore 2.13.4 = protocol 86
    let root = worker.root_account()?;                               // test.near
    let factory = root.create_subaccount("sputnik").initial_balance(NearToken::from_near(100)).transact().await?.into_result()?;
    factory.deploy(FACTORY).await?.into_result()?;
    factory.call(factory.id(), "new").args_json(json!({})).max_gas().transact().await?.into_result()?;
    let hash: String = factory.call(factory.id(), "store").args(DAO.to_vec())   // raw bytes, not JSON
        .deposit(NearToken::from_near(50)).max_gas().transact().await?.json()?;
    factory.call(factory.id(), "set_default_code_hash").args_json(json!({ "code_hash": hash }))
        .max_gas().transact().await?.into_result()?;

    let maya = root.create_subaccount("maya").initial_balance(NearToken::from_near(20)).transact().await?.into_result()?;
    let rulebot = root.create_subaccount("rulebot").initial_balance(NearToken::from_near(5)).transact().await?.into_result()?;
    let alice = root.create_subaccount("alice").initial_balance(NearToken::from_near(1)).transact().await?.into_result()?;
    let policy = json!({
        "roles": [
            { "name": "member", "kind": { "Group": [maya.id()] },
              "permissions": ["*:AddProposal", "*:VoteApprove", "*:VoteReject", "*:VoteRemove", "*:Finalize"], "vote_policy": {} },
            { "name": "rulebot", "kind": { "Group": [rulebot.id()] },
              "permissions": ["transfer:AddProposal", "transfer:VoteApprove"],
              "vote_policy": { "transfer": { "weight_kind": "RoleWeight", "quorum": "0", "threshold": [1, 1] } } }
        ],
        "default_vote_policy": { "weight_kind": "RoleWeight", "quorum": "0", "threshold": [1, 2] },
        "proposal_bond": "0", "proposal_period": "604800000000000",
        "bounty_bond": "0", "bounty_forgiveness_period": "86400000000000"
    });
    let args = json!({ "config": { "name": "pot", "purpose": "test", "metadata": "" }, "policy": policy });
    maya.call(factory.id(), "create")
        .args_json(json!({ "name": "pot", "args": base64::engine::general_purpose::STANDARD.encode(args.to_string()) }))
        .deposit(NearToken::from_millinear(250)).gas(Gas::from_tgas(300)).transact().await?.into_result()?;
    let dao: AccountId = format!("pot.{}", factory.id()).parse()?;
    root.transfer_near(&dao, NearToken::from_near(5)).await?.into_result()?;   // NEAR payout source

    let kind = json!({ "Transfer": { "token_id": "", "receiver_id": alice.id(),
        "amount": NearToken::from_near(1).as_yoctonear().to_string(), "msg": null } });
    let id: u64 = rulebot.call(&dao, "add_proposal")
        .args_json(json!({ "proposal": { "description": "Groceries (auto)", "kind": kind } }))
        .gas(Gas::from_tgas(30)).transact().await?.json()?;                 // deposit 0 == bond "0"
    let before = alice.view_account().await?.balance;
    rulebot.call(&dao, "act_proposal")
        .args_json(json!({ "id": id, "action": "VoteApprove", "proposal": kind }))
        .gas(Gas::from_tgas(100)).transact().await?.into_result()?;
    assert_eq!(alice.view_account().await?.balance.as_yoctonear() - before.as_yoctonear(),
               NearToken::from_near(1).as_yoctonear());
    let p: Value = worker.view(&dao, "get_proposal").args_json(json!({ "id": id })).await?.json()?;
    assert_eq!(p["status"], "Approved");
    Ok(())
}
```

**3. Build and test commands (as run here)**
```bash
cd contracts/rulebot && cargo near build non-reproducible-wasm     # or: npx -y cargo-near@0.22.0 near build non-reproducible-wasm
cargo test -p tests -- --nocapture --test-threads=1                 # sandbox tests; sequential keeps logs readable
```

### Day-1 setup checklist

**This Mac (arm64, macOS 26).** Don't touch `rustup default`, and don't use `brew` or `npm i -g`.
1. `rustup toolchain install 1.93.0 --profile minimal --target wasm32-unknown-unknown --component rustfmt,clippy`. This is already present here; running it again is a no-op. The repo's `rust-toolchain.toml` then selects it automatically.
2. cargo-near: `~/.cargo/bin/cargo-near` is already 0.22.0. Keep it, because `build_with_cli` tests need it on PATH. If needed, run `npx -y cargo-near@0.22.0 near build non-reproducible-wasm` ad hoc.
3. near-cli: `~/.cargo/bin/near` 0.30.1, or `npx -y near-cli-rs@0.30.1`. Never use the keychain options; use `legacy-keychain` or `.keys` files.
4. The first `cargo test` downloads crates and the sandbox (29 MB). Expect about 35 s for a cold compile of the near-workspaces harness on this M5 Pro, and about 2.5 GB of disk per target dir.
5. Sanity: `rustc --version` inside the repo should print `rustc 1.93.0`, and `cargo near build non-reproducible-wasm` should print `INFO: … protocol version 84; rustc 1.93.0 accepted`.

**A teammate's machine**
1. Install rustup, then from the repo root run `rustup toolchain install` (reads `rust-toolchain.toml`; rustup ≥ 1.28). Implicit auto-install is deprecated, so make it explicit.
2. Install cargo-near 0.22.0 with one of:
   - `curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/cargo-near/releases/download/cargo-near-v0.22.0/cargo-near-installer.sh | sh` (the template's CI uses this pinned URL);
   - `cargo install --locked cargo-near@0.22.0` (compiles from source);
   - npm `cargo-near@0.22.0`.
3. Install near-cli-rs 0.30.1 (npx or its installer).
4. **OS check:** arm64 Mac or Linux x86_64/aarch64 is fine. **An Intel Mac cannot run the sandbox via near-sandbox-rs** (use Linux CI or a Linux VM, or try `NEAR_SANDBOX_BIN_PATH` with the S3 Darwin-x86_64 build ⚠️). Windows needs WSL2.
5. Docker is **not** needed unless we choose reproducible builds (amd64 images).
6. CI (GitHub Actions `ubuntu-latest`): checkout, run the installer from step 2, then `cargo test`. That mirrors the template's `test.yml`.

## Gotchas & failure modes
- **The wrong toolchain fails loudly.** The machine default is nightly-2023-12-11 (rustc 1.76), and stable is 1.82. near-sdk 5.29.1 needs 1.93. Rely on `rust-toolchain.toml`.
- **rustup 1.29 auto-installs** any toolchain named in `+ver` or in a toolchain file, and only warns that this is deprecated. I accidentally installed a duplicate `1.85.1` by running `rustup target list --installed --toolchain 1.85.1`. It is harmless, but it's disk space.
- **`cargo build` ≠ `cargo near build`.** near-sdk 5.29.1 has a `compile_error!` that says "Use `cargo near build` instead of `cargo build`". The only valid cfgs are `near` (set by cargo-near) and `target_family="wasm"` (pure-Rust fallbacks, "not for on-chain use"), plus the test, ABI and doc cfgs. If a different builder is ever used, it must set `RUSTFLAGS="--cfg near"`.
- **`build_with_cli` shells out to `cargo near`.** Tests that compile wasm at test time, such as the template or `near_workspaces::compile_project` under the `unstable` feature, fail on machines without cargo-near on PATH. Alternative: build first, then `include_bytes!` or `std::fs::read("target/near/...")` in tests.
- **The near-workspaces default gas is 10 Tgas.** Any cross-contract flow needs `.gas(Gas::from_tgas(..))` or `.max_gas()`.
- **The Sputnik factory's `create` result is the DAO `new` receipt, not `on_create`'s bool.** The tx carries no `true`/`false`. Check for the DAO with `get_policy` on `<name>.<factory>`, or check that the tx failed.
- **Refunds land after the final outcome.** The creator's balance was 0.0107 NEAR "too low" right after `transact()` and settled within 3 blocks. Use `worker.fast_forward(3)` before balance asserts. This matches the relayer findings ([meta-tx-relayer.md](meta-tx-relayer.md)).
- **near-cli config ping-pong.** cargo-near 0.22.0 (which embeds an older near-cli-rs) and near-cli-rs 0.30.1 both rewrite `~/Library/Application Support/near-cli/config.toml`. cargo-near sees `version = "5"`, treats it as V1, migrates it to "4" and drops the `nearblocks_url` entries. near-cli-rs migrates it back to "5". This is benign: only default network entries are rewritten. I left it at v5.
- **Docker 20.10 plus amd64-only images:** reproducible builds on this Mac would need emulation, and that wasn't tried. Use CI instead.
- **Old system wasm-opt (`~/.cargo/bin/wasm-opt` v112).** cargo-near doesn't use it. Running it by hand on rustc ≥ 1.87 output requires `--enable-bulk-memory --enable-nontrapping-float-to-int`. ⚠️ inferred from cargo-near source.
- **RPC rate limits:** `rpc.testnet.fastnear.com` and `archival-rpc.testnet.fastnear.com` returned `-429` on this shared IP. `test.rpc.fastnear.com` worked, and `rpc.testnet.near.org` is deprecated (`-429` "STOP USING IT"). → infra.
- **The sandbox protocol (86) is lower than testnet's (87).** Protocol 87 adds the removal of gas rewards (30% → 0%), universal `0u` accounts, `GlobalContractSameChunkCallFix` and the contract-loading-error fix. For testnet parity, add one CI job with `sandbox_with_version("2.14.0-rc.4")` (protocol 88, tested).

## Costs, limits, latencies (measured vs documented)
| Item | Measured (this Mac, M5 Pro) | Note |
|---|---|---|
| `cargo near new hello` | 6.6 s (npx, warm cache) | Includes `git init` and a commit |
| `cargo near build` hello, cold, rustc 1.93.0 | **32.6 s** (ABI dev pass 17.7 s + release 9.5 s + wasm-opt 0.16 s); 102,866 B | ✅ |
| Same, cold, rustc 1.99.1 | 41.7 s; 102,611 B | ✅ deploys and runs on protocol 86 |
| Warm rebuild of a small contract | 4.6-9.9 s | ✅ |
| Template `cargo test` (7 unit + 1 sandbox test), cold | 1 min 23 s total; sandbox test 18.6 s | ✅ |
| Cold compile of the near-workspaces harness | 34.9 s wall (148 s CPU) | ✅ |
| Sandbox start | 0.5-2 s (cached), 6.6 s including first download of 2.14.0-rc.4 | ✅ |
| Key Sputnik spike, both variants | 15.4 s | ✅ |
| Full spike suite (t1-t10) | ≈ 4 min total | ✅ |
| Disk | spike target dir 2.5 GB; hello 1.9 GB | ✅ |
| Gas, Sputnik bootstrap | legacy `new` 41.6 Tgas / `create` 88.5 Tgas; global `new` 1.6 / `store` 69.6 / `create` 15.0 Tgas | ✅ |
| NEAR burnt, global `store` of a 444,088 B DAO | 44.41 NEAR (= 0.0001 NEAR/B) | ✅ = 📄 "10 NEAR per 100 KB" |
| Max prepaid gas per tx | **1 PGas** (testnet, mainnet and sandbox `max_total_prepaid_gas`); near-workspaces `max_gas()` = 1 PGas | ✅ |

## Open questions / needs a human
- **Does anyone on the team use an Intel Mac or Windows?** If so, they run sandbox tests in CI or a Linux VM. Nothing to sign up for.
- **Do we want reproducible builds and nearblocks "verified contract" for judges?** It needs a public repo plus a Linux CI job, and costs about half a day. My recommendation: no for the MVP, and maybe on day 12.
- → sputnik: testnet runs the **legacy** Sputnik (≥ 5.4 NEAR per DAO; `act_proposal` without `proposal`). Mainnet runs the 2026 global-contract build. Should Pot on testnet use `sputnikv2.testnet` (canonical, likely what Trezu testnet indexes), or our own factory deployed from `main`? Our own factory costs about 51 testnet NEAR once, then about 0.25 NEAR per Pot (≈ 0.0177 NEAR measured minimum, plus a proposal-storage float), and might not be visible in Trezu. Cost math is in [contracts-patterns.md](contracts-patterns.md) §C.
- → relayer: the testnet NEAR budget changes if we keep `sputnikv2.testnet`, because each Pot locks about 5.5 NEAR in its DAO.
- → infra: the FastNEAR testnet RPC rate-limits shared IPs (`-429`). The indexer and CI need a keyed endpoint, or `test.rpc.fastnear.com`.

## Sources
- crates.io API `https://crates.io/api/v1/crates/{near-sdk,near-contract-standards,cargo-near,cargo-near-build,near-workspaces,near-sandbox,near-api,near-gas,near-token,near-abi}`: versions, dates, MSRV: 2026-10-21
- `npm view cargo-near versions` (latest 0.22.0): 2026-10-21
- https://static.rust-lang.org/dist/channel-rust-stable.toml : Rust stable 1.99.1 (2026-10-13): 2026-10-21
- https://github.com/near/near-sdk-rs/blob/near-sdk-v5.29.1/near-sdk/Cargo.toml : `rust-version 1.93`, features, `[package.metadata.near] min_protocol_version = 84`: 2026-10-21
- https://github.com/near/near-sdk-rs/blob/a0d61a03533b1ab9a80467d1dbaf2f2c2c988a1d/CHANGELOG.md : 5.30.0-rc.1 breaking changes, MSRV 1.95, protocol 88: 2026-10-21
- https://github.com/near/near-sdk-rs/blob/near-sdk-v5.29.1/near-sdk/src/lib.rs#L140-L160 : `compile_error!` and valid cfgs (`cfg(near)`): 2026-10-21
- https://github.com/near/cargo-near/blob/af385b03add890cf25c5a8f68f8b68afdf6f7d3b/cargo-near-build/src/near/build/mod.rs#L21-L105 and #L400-L425 : protocol-84 rustc ceiling logic, wasm-opt features: 2026-10-21
- https://github.com/near/cargo-near/blob/af385b03add890cf25c5a8f68f8b68afdf6f7d3b/CHANGELOG.md : 0.20.2 `--cfg near`, 0.20.3 dynamic max-rustc, 0.22.0 `cargo near check`: 2026-10-21
- https://github.com/near/cargo-near/tree/cargo-near-v0.22.0/cargo-near/src/commands/new/new-project-template : template `rust-toolchain.toml` (1.93.0), Cargo.toml (near-sdk 5.29, near-sandbox 0.3.12, near-api 0.8), CI installer URL: 2026-10-21
- https://github.com/near/cargo-near/blob/af385b03add890cf25c5a8f68f8b68afdf6f7d3b/README.md : install methods, reproducible-wasm requirements: 2026-10-21
- https://hub.docker.com/v2/repositories/sourcescan/cargo-near/tags : image tags, all `amd64` only (newest `0.22.0-rust-1.99.1`, 2026-10-16): 2026-10-21
- https://raw.githubusercontent.com/rust-lang/rust/master/src/doc/rustc/src/platform-support/wasm32-unknown-unknown.md : default enabled wasm features: 2026-10-21
- https://github.com/near/nearcore/blob/1441cd3ad4581109649e29609b87f874540b0a84/runtime/near-vm-runner/src/features.rs : accepted wasm features (no multi-value): 2026-10-21
- https://github.com/near/near-sandbox-rs/blob/6dceb29ceb084c34aac753f8a57ea17c0e53e165/src/runner/mod.rs#L88-L170 and #L246-L259 : platforms, S3 URL, env vars, download path; `src/lib.rs#L28` default 2.14.0-rc.4 (0.4.0-rc), 2.13.4 at 0.3.16: 2026-10-21
- https://github.com/near/near-workspaces-rs/blob/near-workspaces-v0.23.0/workspaces/Cargo.toml : near-sandbox ^0.3.12, rust-version 1.93; `workspaces/src/operations.rs#L32` (MAX_GAS 1 PGas), `workspaces/src/rpc/client.rs#L48` (default 10 Tgas): 2026-10-21
- https://github.com/near-daos/sputnik-dao-contract (main `5434a59`; commit `7764926`, `2b0f34a`; releases page lists only 2.0.0 and 3.0.0): repo layout, toolchain 1.86, factory sources: 2026-10-21
- Testnet RPC `https://test.rpc.fastnear.com` / `https://rpc.testnet.fastnear.com`: `status`, `EXPERIMENTAL_protocol_config`, `view_code sputnikv2.testnet`, `sputnikv2.testnet.{get_default_code_hash,get_contracts_metadata,get_number_daos,get_code}`, `view_global_contract_code` (`NO_GLOBAL_CONTRACT_CODE`): 2026-10-21
- Mainnet RPC `https://free.rpc.fastnear.com`: `view_code sputnik-dao.near`, `get_default_code_hash` / `get_contracts_metadata`, `view_global_contract_code DtHZA1…`: 2026-10-21
- https://docs.near.org/smart-contracts/global-contracts : "10 NEAR per 100KB", burnt; CLI `deploy-as-global` (📄): 2026-10-21
- Local measurements: throwaway spike crates `scratchpad/contracts/{hello,hello199,spike}` (session scratchpad, not committed; tests t1-t10): 2026-10-21

## Review corrections (2026-10-21)

From the security review's fact check ([../plan/review-security.md](../plan/review-security.md) §4, F-04a). The body above is unchanged.
- **Testnet moved to protocol 88** (nearcore 2.14.0-rc.5) on 2026-10-21, between ≈ 08:00 and 14:00 UTC; it was 87 when this file was written. **Mainnet is still at protocol 86** (nearcore 2.13.4), and the mainnet clip needs protocol-86-safe code, so **the pins stay**: near-sdk `=5.29.1`, cargo-near 0.22.0, near-workspaces `=0.23.0`, Rust 1.93.0, and no October release candidates.
- The `sandbox_with_version("2.14.0-rc.4")` CI job (protocol 88) is now testnet's **current** protocol, not its next one; the default sandbox (2.13.4, protocol 86) is still mainnet parity. The 88 features (`FailCallToMissingGlobalContract`, `FixSelfMappedShardBandwidthRequest`, `UpdatedEthWalletContract`, `max_globals_per_contract` 65,536) don't affect Pot.
