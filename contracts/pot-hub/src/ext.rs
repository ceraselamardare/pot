//! External interfaces (contracts-spec §3.0). JSON shapes match both Sputnik builds
//! (A = testnet global 278adc7, B = mainnet v3.2 2b0f34a).
//!
//! INV-14 / T-85: the hub calls only `add_proposal` (always as a low-level prepay batch, see
//! `lib.rs::propose_batch`), `act_proposal`, `get_proposal` and `get_policy` on DAOs.

use std::collections::HashMap;

use near_sdk::json_types::{Base64VecU8, U128, U64};
use near_sdk::serde_json::Value;
use near_sdk::{ext_contract, near, AccountId};

#[allow(dead_code)]
#[ext_contract(ext_ft)]
pub trait Ft {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
    fn ft_balance_of(&self, account_id: AccountId) -> U128;
    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalanceLite>;
    fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>) -> StorageBalanceLite;
}

#[allow(dead_code)]
#[ext_contract(ext_dao)]
pub trait Dao {
    /// ALWAYS pass `proposal` (required by both A and B, D-05).
    fn act_proposal(&mut self, id: u64, action: DaoAction, proposal: DaoKind, memo: Option<String>);
    fn get_proposal(&self, id: u64) -> DaoProposalLite;
    fn get_policy(&self) -> DaoPolicyLite;
}

/// Rev5: no `RemoveProposal` (withdraw is Phase 3). The hub never sends any other action.
#[near(serializers = [json])]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum DaoAction {
    VoteApprove,
    Finalize,
}

/// Externally tagged, = Sputnik JSON.
#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub enum DaoKind {
    Transfer { token_id: String, receiver_id: AccountId, amount: U128, msg: Option<String> },
    AddMemberToRole { member_id: AccountId, role: String },
    FunctionCall { receiver_id: AccountId, actions: Vec<DaoActionCall> },
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct DaoActionCall {
    pub method_name: String,
    pub args: Base64VecU8,
    pub deposit: U128,
    pub gas: U64,
}

/// Only the fields the hub reads; the others are ignored.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct DaoProposalLite {
    pub status: String,
    #[serde(default)]
    pub votes: HashMap<AccountId, String>,
    pub submission_time: U64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct DaoPolicyLite {
    pub roles: Vec<DaoRoleLite>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct DaoRoleLite {
    pub name: String,
    pub kind: Value,
}

impl DaoPolicyLite {
    /// Accounts in the Group of role `name` (empty if the role is missing or not a Group).
    pub fn group(&self, name: &str) -> Vec<AccountId> {
        self.roles
            .iter()
            .find(|r| r.name == name)
            .and_then(|r| r.kind.get("Group"))
            .and_then(|g| g.as_array())
            .map(|a| a.iter().filter_map(|v| v.as_str()).filter_map(|s| s.parse().ok()).collect())
            .unwrap_or_default()
    }
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct StorageBalanceLite {
    pub total: U128,
    pub available: U128,
}
