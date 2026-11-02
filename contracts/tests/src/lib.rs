//! Sandbox harness for pot-hub (contracts-spec §7.2).
//!
//! - near-workspaces `=0.23.0` starts the sandbox (nearcore 2.13.4 = protocol 86) and creates /
//!   deploys accounts during setup.
//! - After setup every change call goes through this crate's raw-RPC client, which signs
//!   transactions itself. That lets a test send a **NEP-366 delegate** (signer = the relayer,
//!   predecessor = the user) — near-workspaces 0.23 has no meta-transaction support — and keeps
//!   nonces consistent between relayed and direct calls.
//! - Both Sputnik builds are published as global code with the vendored mainnet factory's
//!   owner-only `store()` in an earlier transaction than first use.

use std::path::{Path as FsPath, PathBuf};
use std::str::FromStr;
use std::sync::Once;
use std::time::{Duration, Instant};

use anyhow::{anyhow, bail, Context, Result};
use near_crypto::{SecretKey, Signer};
use near_jsonrpc_client::{methods, JsonRpcClient};
use near_jsonrpc_primitives::types::query::QueryResponseKind;
use near_primitives::action::delegate::{DelegateAction, NonDelegateAction, SignedDelegateAction};
use near_primitives::hash::CryptoHash;
use near_primitives::transaction::{Action, FunctionCallAction, SignedTransaction, Transaction, TransactionV0, TransferAction};
use near_primitives::types::{BlockReference, Finality, FunctionArgs, Gas};
use near_primitives::views::{
    AccountView, ExecutionStatusView, FinalExecutionOutcomeView, FinalExecutionOutcomeViewEnum, FinalExecutionStatus,
    QueryRequest, TxExecutionStatus,
};
use near_workspaces::network::Sandbox;
use near_workspaces::types::NearToken;
use near_workspaces::{Account, AccountId, Worker};
use serde_json::{json, Value};
use sha2::Digest;

pub use near_token::NearToken as Near;

// ---------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------

pub const USDC: u128 = 1_000_000; // 6 decimals
pub const MILLI: u128 = 1_000_000_000_000_000_000_000;
pub const NEAR: u128 = 1_000 * MILLI;
pub const SUPPLY: u128 = 1_000_000_000_000_000; // 1e15 = $1B
pub const HASH_A: &str = "Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD";
pub const HASH_B: &str = "DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF";

pub fn contracts_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Build {
    /// testnet global contract Ea8t… (sputnikdao2@278adc7) — what testnet Pots run
    A,
    /// mainnet v3.2 DtHZ… (sputnikdao2@2b0f34a) — the mainnet clip
    B,
}

impl Build {
    pub fn wasm_file(&self) -> &'static str {
        match self {
            Build::A => "sputnikdao2_testnet_global_278adc7.wasm",
            Build::B => "sputnikdao2_mainnet_v3_2.wasm",
        }
    }
    pub fn expected_hash(&self) -> &'static str {
        match self {
            Build::A => HASH_A,
            Build::B => HASH_B,
        }
    }
}

pub fn read_res(name: &str) -> Vec<u8> {
    std::fs::read(contracts_dir().join("res/sputnik").join(name)).unwrap_or_else(|e| panic!("res/sputnik/{name}: {e}"))
}

/// `SHA256SUMS` check (T-00, INV-17).
pub fn verify_sha256sums() -> Result<()> {
    let dir = contracts_dir().join("res/sputnik");
    let sums = std::fs::read_to_string(dir.join("SHA256SUMS"))?;
    for line in sums.lines().filter(|l| !l.trim().is_empty()) {
        let mut it = line.split_whitespace();
        let (want, file) = (it.next().unwrap(), it.next().unwrap());
        let got = hex(&sha2::Sha256::digest(std::fs::read(dir.join(file))?));
        if got != want {
            bail!("{file}: sha256 {got} != {want}");
        }
    }
    Ok(())
}

pub fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

// ---------------------------------------------------------------------------------------------
// Building the wasm (once per test binary)
// ---------------------------------------------------------------------------------------------

static BUILD: Once = Once::new();

fn newest_mtime(dir: &FsPath) -> std::time::SystemTime {
    let mut newest = std::time::SystemTime::UNIX_EPOCH;
    for e in std::fs::read_dir(dir).unwrap().flatten() {
        let p = e.path();
        let t = if p.is_dir() { newest_mtime(&p) } else { e.metadata().unwrap().modified().unwrap() };
        newest = newest.max(t);
    }
    newest
}

fn build_if_stale(crate_dir: &str, wasm: &str) {
    let root = contracts_dir();
    let out = root.join("target/near").join(wasm.trim_end_matches(".wasm")).join(wasm);
    let src = newest_mtime(&root.join(crate_dir).join("src")).max(
        std::fs::metadata(root.join(crate_dir).join("Cargo.toml")).unwrap().modified().unwrap(),
    );
    let fresh = std::fs::metadata(&out).map(|m| m.modified().unwrap() >= src).unwrap_or(false);
    if fresh || std::env::var("POT_NO_BUILD").is_ok() {
        return;
    }
    eprintln!("[harness] building {crate_dir} with cargo near …");
    let status = std::process::Command::new("cargo")
        .args(["near", "build", "non-reproducible-wasm"])
        .current_dir(root.join(crate_dir))
        .env_remove("CARGO_TARGET_DIR")
        .env_remove("RUSTFLAGS")
        .env_remove("CARGO_ENCODED_RUSTFLAGS")
        .status()
        .expect("cargo near build (is cargo-near 0.22.0 on PATH? see contracts/README.md)");
    assert!(status.success(), "cargo near build failed for {crate_dir}");
}

/// Builds `pot-hub` and `test-usdc` with cargo-near when their sources are newer than the wasm.
/// Set `POT_NO_BUILD=1` to use whatever is in `target/near` (CI builds first).
pub fn ensure_built() {
    BUILD.call_once(|| {
        build_if_stale("pot-hub", "pot_hub.wasm");
        build_if_stale("test-usdc", "test_usdc.wasm");
    });
}

pub fn hub_wasm() -> Vec<u8> {
    ensure_built();
    std::fs::read(contracts_dir().join("target/near/pot_hub/pot_hub.wasm")).expect("pot_hub.wasm")
}
/// The hub 1.0.0 build deployed on testnet (`pots.potprev.testnet`, sha256 06861ce7…), kept as the
/// migration test's starting point (wave 4).
pub fn hub_v1_wasm() -> Vec<u8> {
    std::fs::read(contracts_dir().join("tests/fixtures/pot_hub_v1.0.0.wasm")).expect("tests/fixtures/pot_hub_v1.0.0.wasm")
}
/// The hub 1.1.0 build deployed on testnet (`pots.potprev.testnet`, sha256 939c1963…, code hash
/// AwCzDVnh…), the starting point of the 1.1.0 → 1.2.0 upgrade test (gifts).
pub fn hub_v11_wasm() -> Vec<u8> {
    std::fs::read(contracts_dir().join("tests/fixtures/pot_hub_v1.1.0.wasm")).expect("tests/fixtures/pot_hub_v1.1.0.wasm")
}
pub fn usdc_wasm() -> Vec<u8> {
    ensure_built();
    std::fs::read(contracts_dir().join("target/near/test_usdc/test_usdc.wasm")).expect("test_usdc.wasm")
}

// ---------------------------------------------------------------------------------------------
// Actors and the raw RPC client
// ---------------------------------------------------------------------------------------------

#[derive(Clone)]
pub struct Actor {
    pub id: AccountId,
    pub signer: Signer,
}

impl Actor {
    pub fn from_account(a: &Account) -> Self {
        let sk = SecretKey::from_str(&a.secret_key().to_string()).expect("secret key");
        let id: AccountId = a.id().clone();
        let signer = near_crypto::InMemorySigner::from_secret_key(id.as_str().parse().unwrap(), sk);
        Self { id, signer }
    }
    pub fn pid(&self) -> near_primitives::types::AccountId {
        self.id.as_str().parse().unwrap()
    }
}

fn pid(a: &AccountId) -> near_primitives::types::AccountId {
    a.as_str().parse().unwrap()
}

/// One executed receipt.
#[derive(Clone, Debug)]
pub struct ReceiptInfo {
    pub id: CryptoHash,
    pub executor: String,
    pub gas_burnt: u64,
    pub logs: Vec<String>,
    pub ok: bool,
    pub failure: Option<String>,
    pub receipt_ids: Vec<CryptoHash>,
    pub status: ExecutionStatusView,
}

/// One receipt with its method and the static gas it was given (calibration, C-09).
#[derive(Clone, Debug)]
pub struct Labeled {
    pub receiver: String,
    pub method: String,
    pub prepaid: u64,
    pub burnt: u64,
    /// Σ static gas of the function-call receipts this receipt created.
    pub children_prepaid: u64,
    pub ok: bool,
}

/// The result of one transaction (direct or relayed).
#[derive(Clone, Debug)]
pub struct Outcome {
    pub tx_hash: CryptoHash,
    pub signer: String,
    /// Final value of the call chain: for a direct call the tx's final status; for a relayed call
    /// the end of the `SuccessReceiptId` chain that starts at the inner function-call receipt.
    pub value: std::result::Result<Vec<u8>, String>,
    pub receipts: Vec<ReceiptInfo>,
    pub tx_gas_burnt: u64,
}

impl Outcome {
    pub fn is_ok(&self) -> bool {
        self.value.is_ok()
    }
    pub fn ok(&self) -> &Self {
        if let Err(e) = &self.value {
            panic!("expected success, got failure: {e}\nlogs: {:?}", self.logs());
        }
        self
    }
    pub fn json(&self) -> Value {
        let v = self.value.as_ref().unwrap_or_else(|e| panic!("call failed: {e}"));
        if v.is_empty() {
            return Value::Null;
        }
        serde_json::from_slice(v).unwrap_or_else(|e| panic!("bad json {e}: {}", String::from_utf8_lossy(v)))
    }
    pub fn err(&self) -> String {
        match &self.value {
            Err(e) => e.clone(),
            Ok(v) => panic!("expected failure, got success: {}", String::from_utf8_lossy(v)),
        }
    }
    /// Asserts the call failed with a message containing `code`.
    pub fn expect_err(&self, code: &str) -> &Self {
        let e = self.err();
        assert!(e.contains(code), "expected error containing {code:?}, got: {e}");
        self
    }
    pub fn logs(&self) -> Vec<String> {
        self.receipts.iter().flat_map(|r| r.logs.clone()).collect()
    }
    /// Every NEP-297 `pot` event, in execution order: `(event, data)`.
    pub fn events(&self) -> Vec<(String, Value)> {
        self.events_of("pot")
    }
    pub fn events_of(&self, standard: &str) -> Vec<(String, Value)> {
        self.logs()
            .iter()
            .filter_map(|l| l.strip_prefix("EVENT_JSON:"))
            .filter_map(|j| serde_json::from_str::<Value>(j).ok())
            .filter(|v| v["standard"] == standard)
            .map(|v| (v["event"].as_str().unwrap().to_string(), v["data"].clone()))
            .collect()
    }
    pub fn event_names(&self) -> Vec<String> {
        self.events().into_iter().map(|e| e.0).collect()
    }
    pub fn event(&self, name: &str) -> Value {
        self.events()
            .into_iter()
            .find(|e| e.0 == name)
            .map(|e| e.1)
            .unwrap_or_else(|| panic!("no {name} event in {:?}", self.event_names()))
    }
    pub fn failures(&self) -> Vec<String> {
        self.receipts.iter().filter_map(|r| r.failure.clone()).collect()
    }
    pub fn total_gas_burnt(&self) -> u64 {
        self.tx_gas_burnt + self.receipts.iter().map(|r| r.gas_burnt).sum::<u64>()
    }
    /// One line per receipt: executor, Tgas burnt, failure (debugging / calibration).
    pub fn dump(&self) -> String {
        self.receipts
            .iter()
            .map(|r| format!("  {:<40} {:>7.2} Tgas {}", r.executor, r.gas_burnt as f64 / 1e12, r.failure.clone().unwrap_or_default()))
            .collect::<Vec<_>>()
            .join("\n")
    }
    pub fn gas_burnt_by(&self, executor: &str) -> u64 {
        self.receipts.iter().filter(|r| r.executor == executor).map(|r| r.gas_burnt).sum()
    }
}

fn status_failure(s: &ExecutionStatusView) -> Option<String> {
    match s {
        ExecutionStatusView::Failure(e) => Some(format!("{e:?}")),
        _ => None,
    }
}

fn parse_outcome(o: FinalExecutionOutcomeView, relayed: bool) -> Outcome {
    let receipts: Vec<ReceiptInfo> = o
        .receipts_outcome
        .iter()
        .map(|r| ReceiptInfo {
            id: r.id,
            executor: r.outcome.executor_id.to_string(),
            gas_burnt: r.outcome.gas_burnt.as_gas(),
            logs: r.outcome.logs.clone(),
            ok: !matches!(r.outcome.status, ExecutionStatusView::Failure(_)),
            failure: status_failure(&r.outcome.status),
            receipt_ids: r.outcome.receipt_ids.clone(),
            status: r.outcome.status.clone(),
        })
        .collect();
    let value = if !relayed {
        match &o.status {
            FinalExecutionStatus::SuccessValue(v) => Ok(v.clone()),
            FinalExecutionStatus::Failure(e) => Err(format!("{e:?}")),
            other => Err(format!("{other:?}")),
        }
    } else {
        // tx → delegate receipt (executor = sender) → inner receipt(s); follow the first
        // function-call receipt's SuccessReceiptId chain.
        let find = |id: &CryptoHash| receipts.iter().find(|r| &r.id == id);
        let first = o.transaction_outcome.outcome.receipt_ids.first().and_then(find);
        match first {
            None => Err("no delegate receipt".into()),
            Some(d) if !d.ok => Err(d.failure.clone().unwrap_or_default()),
            Some(d) => {
                let mut cur = d.receipt_ids.first().and_then(find);
                let mut out = Err("delegate produced no inner receipt".to_string());
                for _ in 0..64 {
                    let Some(r) = cur else { break };
                    match &r.status {
                        ExecutionStatusView::SuccessValue(v) => {
                            out = Ok(v.clone());
                            break;
                        }
                        ExecutionStatusView::SuccessReceiptId(next) => cur = find(next),
                        ExecutionStatusView::Failure(e) => {
                            out = Err(format!("{e:?}"));
                            break;
                        }
                        ExecutionStatusView::Unknown => {
                            out = Err("unknown".into());
                            break;
                        }
                    }
                }
                out
            }
        }
    };
    Outcome {
        tx_hash: o.transaction_outcome.id,
        signer: o.transaction.signer_id.to_string(),
        value,
        receipts,
        tx_gas_burnt: o.transaction_outcome.outcome.gas_burnt.as_gas(),
    }
}

pub struct Rpc {
    pub client: JsonRpcClient,
}

impl Rpc {
    pub fn new(addr: &str) -> Self {
        Self { client: JsonRpcClient::connect(addr) }
    }

    async fn access_key(&self, a: &Actor) -> Result<(u64, CryptoHash, u64)> {
        let req = methods::query::RpcQueryRequest {
            block_reference: BlockReference::Finality(Finality::None),
            request: QueryRequest::ViewAccessKey { account_id: a.pid(), public_key: a.signer.public_key() },
        };
        let resp = self.client.call(req).await.context("view access key")?;
        match resp.kind {
            QueryResponseKind::AccessKey(ak) => Ok((ak.nonce, resp.block_hash, resp.block_height)),
            other => bail!("unexpected {other:?}"),
        }
    }

    /// Receipts of `o` labelled with method name and prepaid static gas (EXPERIMENTAL_tx_status).
    pub async fn labeled(&self, o: &Outcome) -> Result<Vec<Labeled>> {
        use near_primitives::views::{ActionView, ReceiptEnumView};
        let req = methods::EXPERIMENTAL_tx_status::RpcTransactionStatusRequest {
            transaction_info: methods::EXPERIMENTAL_tx_status::TransactionInfo::TransactionId {
                tx_hash: o.tx_hash,
                sender_account_id: o.signer.parse()?,
            },
            wait_until: TxExecutionStatus::ExecutedOptimistic,
        };
        let resp = self.client.call(req).await?;
        let receipts = match resp.final_execution_outcome {
            Some(FinalExecutionOutcomeViewEnum::FinalExecutionOutcomeWithReceipt(w)) => w.receipts,
            _ => bail!("no receipts"),
        };
        let info = |id: &CryptoHash| -> (String, String, u64) {
            match receipts.iter().find(|r| &r.receipt_id == id) {
                Some(r) => match &r.receipt {
                    ReceiptEnumView::Action { actions, .. } => {
                        let mut m = String::new();
                        let mut g = 0u64;
                        for a in actions {
                            match a {
                                ActionView::FunctionCall { method_name, gas, .. } => {
                                    if !m.is_empty() {
                                        m.push('+');
                                    }
                                    m.push_str(method_name);
                                    g += gas.as_gas();
                                }
                                ActionView::Transfer { .. } if m.is_empty() => m = "transfer".into(),
                                ActionView::Delegate { .. } => m = "delegate".into(),
                                _ => {}
                            }
                        }
                        (r.receiver_id.to_string(), m, g)
                    }
                    _ => (r.receiver_id.to_string(), "data".into(), 0),
                },
                None => ("?".into(), "?".into(), 0),
            }
        };
        Ok(o.receipts
            .iter()
            .map(|r| {
                let (receiver, method, prepaid) = info(&r.id);
                let children_prepaid = r.receipt_ids.iter().map(|c| info(c).2).sum();
                Labeled { receiver, method, prepaid, burnt: r.gas_burnt, children_prepaid, ok: r.ok }
            })
            .collect())
    }

    pub async fn view_account(&self, id: &AccountId) -> Result<AccountView> {
        let req = methods::query::RpcQueryRequest {
            block_reference: BlockReference::Finality(Finality::None),
            request: QueryRequest::ViewAccount { account_id: pid(id) },
        };
        match self.client.call(req).await?.kind {
            QueryResponseKind::ViewAccount(a) => Ok(a),
            other => bail!("unexpected {other:?}"),
        }
    }

    /// `Err(message)` when the view panics.
    pub async fn view_raw(&self, contract: &AccountId, method: &str, args: &Value) -> std::result::Result<Vec<u8>, String> {
        let req = methods::query::RpcQueryRequest {
            block_reference: BlockReference::Finality(Finality::None),
            request: QueryRequest::CallFunction {
                account_id: pid(contract),
                method_name: method.to_string(),
                args: FunctionArgs::from(serde_json::to_vec(args).unwrap()),
            },
        };
        match self.client.call(req).await {
            Ok(r) => match r.kind {
                QueryResponseKind::CallResult(c) => Ok(c.result),
                other => Err(format!("unexpected {other:?}")),
            },
            Err(e) => Err(format!("{e:?}")),
        }
    }

    pub async fn view(&self, contract: &AccountId, method: &str, args: Value) -> Value {
        let raw = self
            .view_raw(contract, method, &args)
            .await
            .unwrap_or_else(|e| panic!("view {contract}.{method}({args}) failed: {e}"));
        serde_json::from_slice(&raw).unwrap_or(Value::Null)
    }

    fn sign_tx(signer: &Actor, nonce: u64, receiver: near_primitives::types::AccountId, block_hash: CryptoHash, actions: Vec<Action>) -> SignedTransaction {
        let tx = Transaction::V0(TransactionV0 {
            signer_id: signer.pid(),
            public_key: signer.signer.public_key(),
            nonce,
            receiver_id: receiver,
            block_hash,
            actions,
        });
        let (hash, _) = tx.get_hash_and_size();
        SignedTransaction::new(signer.signer.sign(hash.as_ref()), tx)
    }

    async fn send(&self, tx: SignedTransaction, relayed: bool) -> Result<Outcome> {
        let hash = tx.get_hash();
        let sender = tx.transaction.signer_id().clone();
        let req = methods::send_tx::RpcSendTransactionRequest { signed_transaction: tx, wait_until: TxExecutionStatus::ExecutedOptimistic };
        let resp = match self.client.call(req).await {
            Ok(r) => r,
            Err(e) => {
                // a timeout: poll the status
                let msg = format!("{e:?}");
                if !msg.contains("Timeout") && !msg.contains("TIMEOUT") {
                    bail!("send_tx: {msg}");
                }
                let mut tries = 0;
                loop {
                    tokio::time::sleep(Duration::from_millis(500)).await;
                    let st = methods::tx::RpcTransactionStatusRequest {
                        transaction_info: methods::tx::TransactionInfo::TransactionId { tx_hash: hash, sender_account_id: sender.clone() },
                        wait_until: TxExecutionStatus::ExecutedOptimistic,
                    };
                    if let Ok(r) = self.client.call(st).await {
                        break r;
                    }
                    tries += 1;
                    if tries > 60 {
                        bail!("tx {hash} never finished: {msg}");
                    }
                }
            }
        };
        let o = match resp.final_execution_outcome {
            Some(FinalExecutionOutcomeViewEnum::FinalExecutionOutcome(o)) => o,
            Some(FinalExecutionOutcomeViewEnum::FinalExecutionOutcomeWithReceipt(o)) => o.final_outcome,
            None => bail!("no outcome"),
        };
        Ok(parse_outcome(o, relayed))
    }

    /// A direct transaction signed by `signer` (signer == predecessor).
    pub async fn call(&self, signer: &Actor, receiver: &AccountId, method: &str, args: Vec<u8>, gas_tgas: u64, deposit: u128) -> Result<Outcome> {
        let (nonce, bh, _) = self.access_key(signer).await?;
        let action = Action::FunctionCall(Box::new(FunctionCallAction {
            method_name: method.into(),
            args,
            gas: Gas::from_teragas(gas_tgas),
            deposit: Near::from_yoctonear(deposit),
        }));
        self.send(Self::sign_tx(signer, nonce + 1, pid(receiver), bh, vec![action]), false).await
    }

    pub async fn transfer(&self, signer: &Actor, receiver: &AccountId, amount: u128) -> Result<Outcome> {
        let (nonce, bh, _) = self.access_key(signer).await?;
        let action = Action::Transfer(TransferAction { deposit: Near::from_yoctonear(amount) });
        self.send(Self::sign_tx(signer, nonce + 1, pid(receiver), bh, vec![action]), false).await
    }

    /// A NEP-366 meta transaction: `sender` signs a DelegateAction, `relayer` submits it
    /// (signer = relayer, predecessor of the inner call = sender). The relayer pays gas and
    /// any deposit.
    pub async fn relay(&self, relayer: &Actor, sender: &Actor, receiver: &AccountId, method: &str, args: Vec<u8>, gas_tgas: u64, deposit: u128) -> Result<Outcome> {
        let (snonce, _, height) = self.access_key(sender).await?;
        let inner = Action::FunctionCall(Box::new(FunctionCallAction {
            method_name: method.into(),
            args,
            gas: Gas::from_teragas(gas_tgas),
            deposit: Near::from_yoctonear(deposit),
        }));
        let da = DelegateAction {
            sender_id: sender.pid(),
            receiver_id: pid(receiver),
            actions: vec![NonDelegateAction::try_from(inner).map_err(|_| anyhow!("nested delegate"))?],
            nonce: snonce + 1,
            max_block_height: height + 1000,
            public_key: sender.signer.public_key(),
        };
        let signed = SignedDelegateAction::sign(&sender.signer, da);
        let (rnonce, bh, _) = self.access_key(relayer).await?;
        let tx = Self::sign_tx(relayer, rnonce + 1, sender.pid(), bh, vec![Action::Delegate(Box::new(signed))]);
        self.send(tx, true).await
    }

    /// Sends several direct calls without waiting in between (same-block races). Each item:
    /// (signer, receiver, method, args, gas, deposit). Nonces are allocated per signer.
    pub async fn call_many(&self, calls: Vec<(Actor, AccountId, String, Vec<u8>, u64, u128)>) -> Result<Vec<Outcome>> {
        let mut nonces: std::collections::HashMap<String, u64> = Default::default();
        let mut txs = vec![];
        for (s, r, m, a, g, d) in calls {
            let (n0, bh, _) = self.access_key(&s).await?;
            let n = nonces.entry(s.id.to_string()).or_insert(n0);
            *n += 1;
            let action = Action::FunctionCall(Box::new(FunctionCallAction {
                method_name: m,
                args: a,
                gas: Gas::from_teragas(g),
                deposit: Near::from_yoctonear(d),
            }));
            txs.push(Self::sign_tx(&s, *n, pid(&r), bh, vec![action]));
        }
        let futs = txs.into_iter().map(|tx| self.send(tx, false));
        futures_join_all(futs).await.into_iter().collect()
    }

    /// Like `call_many`, but every call is signed first and then sent `delay_ms` after the start
    /// (the gift-in-flight race: the close must reach the hub between the gift's forward and its
    /// callback). Item: (signer, receiver, method, args, gas, deposit, delay_ms).
    pub async fn call_staggered(&self, calls: Vec<(Actor, AccountId, String, Vec<u8>, u64, u128, u64)>) -> Result<Vec<Outcome>> {
        let mut nonces: std::collections::HashMap<String, u64> = Default::default();
        let mut txs = vec![];
        for (s, r, m, a, g, d, delay) in calls {
            let (n0, bh, _) = self.access_key(&s).await?;
            let n = nonces.entry(s.id.to_string()).or_insert(n0);
            *n += 1;
            let action = Action::FunctionCall(Box::new(FunctionCallAction {
                method_name: m,
                args: a,
                gas: Gas::from_teragas(g),
                deposit: Near::from_yoctonear(d),
            }));
            txs.push((Self::sign_tx(&s, *n, pid(&r), bh, vec![action]), delay));
        }
        let futs = txs.into_iter().map(|(tx, delay)| async move {
            tokio::time::sleep(Duration::from_millis(delay)).await;
            self.send(tx, false).await
        });
        futures_join_all(futs).await.into_iter().collect()
    }
}

async fn futures_join_all<F: std::future::Future>(futs: impl IntoIterator<Item = F>) -> Vec<F::Output> {
    let handles: Vec<_> = futs.into_iter().map(Box::pin).collect();
    let mut out = Vec::with_capacity(handles.len());
    // poll concurrently
    let results = tokio_join_all(handles).await;
    out.extend(results);
    out
}

async fn tokio_join_all<F: std::future::Future + Unpin>(mut futs: Vec<F>) -> Vec<F::Output> {
    use std::task::Poll;
    let mut results: Vec<Option<F::Output>> = futs.iter().map(|_| None).collect();
    std::future::poll_fn(|cx| {
        let mut pending = false;
        for (i, f) in futs.iter_mut().enumerate() {
            if results[i].is_none() {
                match std::pin::Pin::new(f).poll(cx) {
                    Poll::Ready(v) => results[i] = Some(v),
                    Poll::Pending => pending = true,
                }
            }
        }
        if pending {
            Poll::Pending
        } else {
            Poll::Ready(())
        }
    })
    .await;
    results.into_iter().map(|r| r.unwrap()).collect()
}

// ---------------------------------------------------------------------------------------------
// Env: one sandbox with Sputnik build A or B, the token, the hub and the personas
// ---------------------------------------------------------------------------------------------

pub struct Env {
    pub build: Build,
    pub worker: Worker<Sandbox>,
    pub rpc: Rpc,
    pub root: Account,
    pub code_hash: String,
    pub factory: AccountId,
    pub usdc: AccountId,
    pub hub: AccountId,
    pub owner: Actor,
    pub relayer: Actor,
    pub treasury: Actor,
    pub maya: Actor,
    pub sam: Actor,
    pub leo: Actor,
    pub ana: Actor,
    pub eve: Actor,
    pub setup_secs: f64,
    /// The hub account itself (wave 4: code upgrades + `migrate` in the migration test).
    pub hub_account: Account,
}

#[derive(Clone, Debug)]
pub struct HubOpts {
    pub dao_float: u128,
    pub min_dao_float: u128,
    pub limits: Option<Value>,
    pub hub_balance: u128,
    /// Override the DAO code hash (T-04: an unpublished hash makes the creation batch fail).
    pub code_hash: Option<String>,
    /// Deploy this hub wasm instead of the freshly built one (wave 4: the 1.0.0 fixture).
    pub hub_wasm: Option<Vec<u8>>,
}

impl Default for HubOpts {
    fn default() -> Self {
        Self { dao_float: 50 * MILLI, min_dao_float: 50 * MILLI, limits: None, hub_balance: 30 * NEAR, code_hash: None, hub_wasm: None }
    }
}

/// Limits used by most scenario groups: the defaults, but 10 Pots per creator per day so one
/// sandbox can host many scenarios.
pub fn roomy_limits() -> Value {
    json!({"max_members":40,"max_pots_per_creator_per_day":10,"max_sponsored_pots_per_day":200,"max_pots_per_account":100,
           "max_active_invites":20,"max_invites_total":100,"max_pending_per_member":10,"max_requests_per_pot":1000,
           "min_hub_reserve":"2000000000000000000000000"})
}

impl Env {
    pub async fn new(build: Build) -> Result<Self> {
        Self::with(build, HubOpts { limits: Some(roomy_limits()), ..Default::default() }).await
    }

    pub async fn with(build: Build, opts: HubOpts) -> Result<Self> {
        let t0 = Instant::now();
        let hub_code = opts.hub_wasm.clone().unwrap_or_else(hub_wasm);
        let usdc_code = usdc_wasm();
        // POT_SANDBOX_VERSION=2.14.0-rc.4 → protocol 88 (testnet parity, the CI ★ job); default
        // nearcore 2.13.4 = protocol 86 (mainnet parity).
        let worker = match std::env::var("POT_SANDBOX_VERSION") {
            Ok(v) if !v.is_empty() => near_workspaces::sandbox_with_version(&v).await?,
            _ => near_workspaces::sandbox().await?,
        };
        let root = worker.root_account()?;
        let rpc = Rpc::new(&worker.rpc_addr());
        if std::env::var("POT_SANDBOX_VERSION").map(|v| !v.is_empty()).unwrap_or(false) {
            let st = rpc.client.call(methods::status::RpcStatusRequest).await?;
            eprintln!("[harness] sandbox {} protocol {}", st.version.version, st.protocol_version);
        }

        // 1. Sputnik factory publishes the DAO build as global code (earlier tx than first use).
        let factory = root.create_subaccount("sputnik").initial_balance(NearToken::from_near(100)).transact().await?.into_result()?;
        factory.deploy(&read_res("sputnikdao_factory2_mainnet.wasm")).await?.into_result()?;
        factory.call(factory.id(), "new").args_json(json!({})).max_gas().transact().await?.into_result()?;
        let code_hash: String = factory
            .call(factory.id(), "store")
            .args(read_res(build.wasm_file()))
            .deposit(NearToken::from_near(50))
            .max_gas()
            .transact()
            .await?
            .json()?;

        // 2. accounts
        let usdc_acc = mk(&root, "usdc", 10 * NEAR).await?;
        let hub_acc = mk(&root, "pots", opts.hub_balance).await?;
        let owner = mk(&root, "owner", 10 * NEAR).await?;
        let relayer = mk(&root, "users", 50 * NEAR).await?;
        let treasury = mk(&root, "treasury", 10 * NEAR).await?;
        let maya = mk(&root, "maya", 10 * NEAR).await?;
        let sam = mk(&root, "sam", 10 * NEAR).await?;
        let leo = mk(&root, "leo", 10 * NEAR).await?;
        let ana = mk(&root, "ana", 10 * NEAR).await?;
        let eve = mk(&root, "eve", 10 * NEAR).await?;

        // 3. token: "USDC (test)", 6 decimals, whole supply to the treasury, no mint (D-11)
        usdc_acc.deploy(&usdc_code).await?.into_result()?;
        usdc_acc
            .call(usdc_acc.id(), "new")
            .args_json(json!({
                "owner_id": treasury.id(),
                "total_supply": SUPPLY.to_string(),
                "metadata": {"spec":"ft-1.0.0","name":"USDC (test)","symbol":"USDC","icon":null,"reference":null,"reference_hash":null,"decimals":6}
            }))
            .max_gas()
            .transact()
            .await?
            .into_result()?;

        // 4. hub
        hub_acc.deploy(&hub_code).await?.into_result()?;
        let hash = opts.code_hash.clone().unwrap_or_else(|| code_hash.clone());
        hub_acc
            .call(hub_acc.id(), "new")
            .args_json(json!({
                "owner": owner.id(), "usdc": usdc_acc.id(), "dao_code_hash": hash,
                "dao_float": opts.dao_float.to_string(), "min_dao_float": opts.min_dao_float.to_string(),
                "relayers": [relayer.id()], "limits": opts.limits,
            }))
            .gas(near_workspaces::types::Gas::from_tgas(30))
            .transact()
            .await?
            .into_result()?;

        let env = Env {
            build,
            rpc,
            code_hash,
            factory: factory.id().clone(),
            usdc: usdc_acc.id().clone(),
            hub: hub_acc.id().clone(),
            owner: Actor::from_account(&owner),
            relayer: Actor::from_account(&relayer),
            treasury: Actor::from_account(&treasury),
            maya: Actor::from_account(&maya),
            sam: Actor::from_account(&sam),
            leo: Actor::from_account(&leo),
            ana: Actor::from_account(&ana),
            eve: Actor::from_account(&eve),
            hub_account: hub_acc.clone(),
            root,
            worker,
            setup_secs: 0.0,
        };
        // 5. registrations (deploy-time step for the hub; onboarding for users) + demo dollars
        let hub_id = env.hub.clone();
        env.register(&hub_id).await?;
        for p in env.personas() {
            env.register(&p.id).await?;
            env.fund(&p, 1_000 * USDC).await?;
        }
        let mut env = env;
        env.setup_secs = t0.elapsed().as_secs_f64();
        Ok(env)
    }

    pub fn personas(&self) -> Vec<Actor> {
        vec![self.maya.clone(), self.sam.clone(), self.leo.clone(), self.ana.clone(), self.eve.clone()]
    }

    /// Creates an extra funded account (sub-account of root).
    pub async fn new_actor(&self, name: &str, near: u128) -> Result<Actor> {
        let a = self
            .root
            .create_subaccount(name)
            .initial_balance(NearToken::from_yoctonear(near))
            .transact()
            .await?
            .into_result()?;
        Ok(Actor::from_account(&a))
    }

    // ---------------------------------------------------------------- calls

    pub async fn call(&self, who: &Actor, receiver: &AccountId, method: &str, args: Value, gas_tgas: u64, deposit: u128) -> Outcome {
        self.rpc
            .call(who, receiver, method, serde_json::to_vec(&args).unwrap(), gas_tgas, deposit)
            .await
            .unwrap_or_else(|e| panic!("rpc {method}: {e:?}"))
    }

    /// A direct (unsponsored) hub call.
    pub async fn hub_call(&self, who: &Actor, method: &str, args: Value, gas_tgas: u64, deposit: u128) -> Outcome {
        self.call(who, &self.hub.clone(), method, args, gas_tgas, deposit).await
    }

    /// A relayed (sponsored) hub call: the relayer signs, `who` is the predecessor.
    pub async fn relay(&self, who: &Actor, receiver: &AccountId, method: &str, args: Value, gas_tgas: u64, deposit: u128) -> Outcome {
        self.rpc
            .relay(&self.relayer, who, receiver, method, serde_json::to_vec(&args).unwrap(), gas_tgas, deposit)
            .await
            .unwrap_or_else(|e| panic!("relay {method}: {e:?}"))
    }

    pub async fn hub_relay(&self, who: &Actor, method: &str, args: Value, gas_tgas: u64) -> Outcome {
        self.relay(who, &self.hub.clone(), method, args, gas_tgas, 0).await
    }

    pub async fn view(&self, contract: &AccountId, method: &str, args: Value) -> Value {
        self.rpc.view(contract, method, args).await
    }

    pub async fn hub_view(&self, method: &str, args: Value) -> Value {
        self.view(&self.hub.clone(), method, args).await
    }

    pub async fn hub_view_err(&self, method: &str, args: Value) -> String {
        match self.rpc.view_raw(&self.hub.clone(), method, &args).await {
            Err(e) => e,
            Ok(v) => panic!("expected view failure, got {}", String::from_utf8_lossy(&v)),
        }
    }

    pub async fn balance(&self, id: &AccountId) -> u128 {
        self.rpc.view_account(id).await.map(|a| a.amount.as_yoctonear()).unwrap_or(0)
    }

    pub async fn account(&self, id: &AccountId) -> Option<AccountView> {
        self.rpc.view_account(id).await.ok()
    }

    /// The hub's free balance per `get_config` (balance − storage, at the current block).
    pub async fn hub_free(&self) -> u128 {
        self.hub_view("get_config", json!({})).await["free_balance"].as_str().unwrap().parse().unwrap()
    }

    pub async fn fast_forward(&self, blocks: u64) {
        self.worker.fast_forward(blocks).await.expect("fast_forward");
    }

    // ---------------------------------------------------------------- token helpers

    pub async fn register(&self, who: &AccountId) -> Result<()> {
        let o = self
            .call(&self.treasury, &self.usdc.clone(), "storage_deposit", json!({"account_id": who, "registration_only": true}), 30, 1_250_000_000_000_000_000_000)
            .await;
        o.value.map_err(|e| anyhow!(e))?;
        Ok(())
    }

    pub async fn fund(&self, who: &Actor, amount: u128) -> Result<()> {
        let o = self
            .call(&self.treasury, &self.usdc.clone(), "ft_transfer", json!({"receiver_id": who.id, "amount": amount.to_string()}), 30, 1)
            .await;
        o.value.map_err(|e| anyhow!(e))?;
        Ok(())
    }

    pub async fn ft_balance(&self, id: &AccountId) -> u128 {
        self.view(&self.usdc.clone(), "ft_balance_of", json!({"account_id": id}))
            .await
            .as_str()
            .unwrap()
            .parse()
            .unwrap()
    }

    /// Relayed contribution (D-06): `ft_transfer_call` 1 yocto, 100 Tgas. Returns the outcome; the
    /// final value is the `ft_resolve_transfer` used amount.
    pub async fn contribute(&self, who: &Actor, pot: &AccountId, amount: u128) -> Outcome {
        self.contribute_gas(who, pot, amount, 100).await
    }

    pub async fn contribute_gas(&self, who: &Actor, pot: &AccountId, amount: u128, gas: u64) -> Outcome {
        self.relay(
            who,
            &self.usdc.clone(),
            "ft_transfer_call",
            json!({"receiver_id": self.hub, "amount": amount.to_string(), "msg": json!({"pot": pot}).to_string()}),
            gas,
            1,
        )
        .await
    }

    // ---------------------------------------------------------------- hub helpers

    pub fn dao_id(&self, slug: &str) -> AccountId {
        format!("{slug}.{}", self.hub).parse().unwrap()
    }

    /// Relayed `create_pot` with Trip defaults.
    pub async fn create_pot(&self, creator: &Actor, slug: &str) -> (AccountId, Outcome) {
        let o = self
            .hub_relay(creator, "create_pot", json!({"slug": slug, "name": format!("Pot {slug}"), "preset": "trip", "rules": null, "invite_pk": null, "emoji": null, "float": null}), 150)
            .await;
        (self.dao_id(slug), o)
    }

    pub async fn create_pot_with(&self, creator: &Actor, slug: &str, preset: &str, rules: Value, invite_pk: Option<String>) -> (AccountId, Outcome) {
        let o = self
            .hub_relay(creator, "create_pot", json!({"slug": slug, "name": format!("Pot {slug}"), "preset": preset, "rules": rules, "invite_pk": invite_pk, "emoji": null, "float": null}), 150)
            .await;
        (self.dao_id(slug), o)
    }

    pub async fn pot(&self, pot: &AccountId) -> Value {
        self.hub_view("get_pot", json!({"pot": pot})).await
    }

    pub async fn member(&self, pot: &AccountId, who: &AccountId) -> Value {
        let ms = self.hub_view("get_members", json!({"pot": pot, "balance": null})).await;
        ms.as_array().unwrap().iter().find(|m| m["account_id"] == who.as_str()).cloned().unwrap_or(Value::Null)
    }

    pub async fn policy(&self, dao: &AccountId) -> Value {
        self.view(dao, "get_policy", json!({})).await
    }

    pub async fn proposal(&self, dao: &AccountId, id: u64) -> Value {
        self.view(dao, "get_proposal", json!({"id": id})).await
    }

    pub async fn request_spend(&self, who: &Actor, pot: &AccountId, amount: u128, receiver: &AccountId, rref: &str) -> Outcome {
        self.hub_relay(
            who,
            "request_spend",
            json!({"pot": pot, "amount": amount.to_string(), "receiver_id": receiver, "category": "groceries", "request_ref": rref}),
            150,
        )
        .await
    }

    /// A member's DAO vote, relayed, always passing the stored kind (D-05).
    pub async fn vote(&self, who: &Actor, dao: &AccountId, id: u64, action: &str, gas: u64) -> Outcome {
        let p = self.proposal(dao, id).await;
        self.relay(who, dao, "act_proposal", json!({"id": id, "action": action, "proposal": p["kind"]}), gas, 0).await
    }

    pub async fn sync(&self, pot: &AccountId, id: u64) -> Outcome {
        // the relayer sends a relayer-signed tx (not a delegate)
        self.call(&self.relayer, &self.hub.clone(), "sync", json!({"pot": pot, "proposal_id": id}), 50, 0).await
    }

    /// Invite helper: a fresh ed25519 keypair.
    pub fn invite_key() -> (ed25519_dalek::SigningKey, String) {
        let sk = ed25519_dalek::SigningKey::generate(&mut rand::rngs::OsRng);
        let pk = format!("ed25519:{}", bs58::encode(sk.verifying_key().to_bytes()).into_string());
        (sk, pk)
    }

    /// The joiner's signature over `pot-join:v1:<dao>:<joiner>` (base64, padded).
    pub fn join_sig(sk: &ed25519_dalek::SigningKey, dao: &AccountId, joiner: &AccountId) -> String {
        use base64::Engine;
        use ed25519_dalek::Signer as _;
        let msg = format!("pot-join:v1:{dao}:{joiner}");
        base64::engine::general_purpose::STANDARD.encode(sk.sign(msg.as_bytes()).to_bytes())
    }

    pub async fn join(&self, who: &Actor, pot: &AccountId, sk: &ed25519_dalek::SigningKey, pk: &str) -> Outcome {
        let sig = Self::join_sig(sk, pot, &who.id);
        self.hub_relay(who, "join", json!({"pot": pot, "invite_pk": pk, "signature": sig}), 100).await
    }

    /// Creates a Trip Pot owned by `creator` with `members` joined via an invite, each member
    /// contributing `contrib` (0 = no contributions). Returns (dao, invite secret, invite pk).
    pub async fn pot_with_members(&self, creator: &Actor, slug: &str, members: &[&Actor], contrib: u128) -> (AccountId, ed25519_dalek::SigningKey, String) {
        self.pot_with_members_rules(creator, slug, "trip", Value::Null, members, contrib).await
    }

    pub async fn pot_with_members_rules(&self, creator: &Actor, slug: &str, preset: &str, rules: Value, members: &[&Actor], contrib: u128) -> (AccountId, ed25519_dalek::SigningKey, String) {
        let (sk, pk) = Self::invite_key();
        let (dao, o) = self.create_pot_with(creator, slug, preset, rules, Some(pk.clone())).await;
        let v = o.json();
        assert_eq!(v["ok"], true, "create_pot {slug}: {v}");
        for m in members {
            let j = self.join(m, &dao, &sk, &pk).await;
            assert_eq!(j.json()["status"], "active", "join {}: {:?}", m.id, j.value);
        }
        if contrib > 0 {
            let mut all = vec![creator];
            all.extend_from_slice(members);
            for m in all {
                let c = self.contribute(m, &dao, contrib).await;
                assert_eq!(c.json(), json!(contrib.to_string()), "contribution by {}", m.id);
            }
        }
        (dao, sk, pk)
    }

    // ---------------------------------------------------------------- wave 4 helpers

    /// The latest final block's timestamp (ms): what `env::block_timestamp_ms` sees next.
    pub async fn now_ms(&self) -> u128 {
        let b = self
            .rpc
            .client
            .call(methods::block::RpcBlockRequest { block_reference: BlockReference::Finality(Finality::Final) })
            .await
            .expect("block");
        (b.header.timestamp / 1_000_000) as u128
    }

    /// Relayed `create_pot` with explicit wave-4 `extras` (Value::Null = the contract defaults).
    pub async fn create_pot_extras(&self, creator: &Actor, slug: &str, preset: &str, rules: Value, extras: Value, invite_pk: Option<String>) -> (AccountId, Outcome) {
        let o = self
            .hub_relay(
                creator,
                "create_pot",
                json!({"slug": slug, "name": format!("Pot {slug}"), "preset": preset, "rules": rules, "invite_pk": invite_pk, "emoji": null, "float": null, "extras": extras}),
                150,
            )
            .await;
        (self.dao_id(slug), o)
    }

    /// Like `pot_with_members_rules`, with explicit extras.
    pub async fn pot_with_extras(&self, creator: &Actor, slug: &str, rules: Value, extras: Value, members: &[&Actor], contrib: u128) -> AccountId {
        let (sk, pk) = Self::invite_key();
        let preset = if rules.is_null() { "trip" } else { "custom" };
        let (dao, o) = self.create_pot_extras(creator, slug, preset, rules, extras, Some(pk.clone())).await;
        assert_eq!(o.json()["ok"], true, "create_pot {slug}: {:?}", o.value);
        for m in members {
            let j = self.join(m, &dao, &sk, &pk).await;
            assert_eq!(j.json()["status"], "active", "join {}: {:?}", m.id, j.value);
        }
        if contrib > 0 {
            let mut all = vec![creator];
            all.extend_from_slice(members);
            for m in all {
                let c = self.contribute(m, &dao, contrib).await;
                assert_eq!(c.json(), json!(contrib.to_string()), "contribution by {}", m.id);
            }
        }
        dao
    }

    /// A relayed link request (`receiver_id` = the hub, the escrow).
    pub async fn request_link(&self, who: &Actor, pot: &AccountId, amount: u128, claim_pk: &str, expires_at_ms: Option<u128>, rref: &str) -> Outcome {
        self.hub_relay(
            who,
            "request_spend",
            json!({"pot": pot, "amount": amount.to_string(), "receiver_id": self.hub, "category": "food", "request_ref": rref,
                   "link": {"claim_pk": claim_pk, "expires_at_ms": expires_at_ms.map(|x| x as u64)}}),
            250,
        )
        .await
    }

    /// The link holder's signature over `pot-claim:v1:<hub>:<dao>:<request_id>:<receiver>` (base64).
    pub fn claim_sig(&self, sk: &ed25519_dalek::SigningKey, dao: &AccountId, request_id: u64, receiver: &AccountId) -> String {
        use base64::Engine;
        use ed25519_dalek::Signer as _;
        let msg = format!("pot-claim:v1:{}:{dao}:{request_id}:{receiver}", self.hub);
        base64::engine::general_purpose::STANDARD.encode(sk.sign(msg.as_bytes()).to_bytes())
    }

    /// A relayer-signed hub call (not a delegate): what the cron / the relayer's own calls look like.
    pub async fn relayer_call(&self, method: &str, args: Value, gas_tgas: u64) -> Outcome {
        self.call(&self.relayer.clone(), &self.hub.clone(), method, args, gas_tgas, 0).await
    }

    // ---------------------------------------------------------------- hub 1.2.0 (gifts)

    /// A relayed gift (`ft_transfer_call` 1 yocto, 100 Tgas, msg `{"pot","gift"}`): what the app sends
    /// for anyone, member or not. The final value is the `ft_resolve_transfer` used amount.
    pub async fn gift(&self, who: &Actor, pot: &AccountId, amount: u128, gift_ref: &str) -> Outcome {
        self.gift_msg(who, amount, json!({"pot": pot, "gift": gift_ref}).to_string()).await
    }

    pub async fn gift_msg(&self, who: &Actor, amount: u128, msg: String) -> Outcome {
        self.relay(who, &self.usdc.clone(), "ft_transfer_call", json!({"receiver_id": self.hub, "amount": amount.to_string(), "msg": msg}), 100, 1)
            .await
    }

    pub async fn gifts(&self, pot: &AccountId) -> Value {
        self.hub_view("get_gifts", json!({"pot": pot})).await
    }

    /// Advances block time past the hub's 60 s busy / closing windows.
    pub async fn wait_busy_window(&self) {
        self.fast_forward(260).await; // ≈ 0.3 s per block → ≥ 75 s
    }
}

async fn mk(root: &Account, name: &str, bal: u128) -> Result<Account> {
    Ok(root.create_subaccount(name).initial_balance(NearToken::from_yoctonear(bal)).transact().await?.into_result()?)
}

/// Runs `f` against build A and build B (contracts-spec §7.2: every sandbox test runs twice).
#[macro_export]
macro_rules! dual {
    ($name:ident, $body:path) => {
        mod $name {
            use super::*;
            #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
            async fn build_a() -> anyhow::Result<()> {
                $body($crate::Build::A).await
            }
            #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
            async fn build_b() -> anyhow::Result<()> {
                $body($crate::Build::B).await
            }
        }
    };
}

pub fn u(v: &Value) -> u128 {
    match v {
        Value::String(s) => s.parse().unwrap(),
        Value::Number(n) => n.as_u64().unwrap() as u128,
        other => panic!("not an amount: {other}"),
    }
}

pub fn yocto_str(v: u128) -> String {
    v.to_string()
}
