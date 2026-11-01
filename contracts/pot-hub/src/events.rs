//! NEP-297 events (contracts-spec §5, D-10):
//! `EVENT_JSON:{"standard":"pot","version":"1.0.0","event":"<snake_case>","data":{…}}`.
//! Every event carries `pot` (the DAO id), except `config_changed`. Amounts are strings. Events
//! never contain memo text, emails or invite secrets.

use near_sdk::json_types::U128;
use near_sdk::{near, AccountId, NearToken};

use crate::types::{Category, Limits, Path, Preset, Reason, Rules};

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct PayoutView {
    pub account_id: AccountId,
    pub amount: U128,
}

pub fn payout_views(p: &[(AccountId, u128)]) -> Vec<PayoutView> {
    p.iter().map(|(a, x)| PayoutView { account_id: a.clone(), amount: U128(*x) }).collect()
}

/// The config as carried by `config_changed` (ConfigView without `free_balance`, counters).
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct ConfigCore {
    pub version: String,
    pub owner: AccountId,
    pub usdc: AccountId,
    pub dao_code_hash: String,
    pub dao_float: NearToken,
    pub min_dao_float: NearToken,
    pub relayers: Vec<AccountId>,
    pub limits: Limits,
    pub paused: bool,
}

#[near(event_json(standard = "pot"))]
pub enum PotEvent {
    #[event_version("1.0.0")]
    PotCreated {
        pot: AccountId,
        slug: String,
        name: String,
        emoji: Option<String>,
        preset: Preset,
        creator: AccountId,
        rules: Rules,
        float: NearToken,
    },
    #[event_version("1.0.0")]
    MemberJoined { pot: AccountId, member: AccountId, proposal_id: u64, invite_pk: Option<String> },
    #[event_version("1.0.0")]
    Contribution { pot: AccountId, member: AccountId, amount: U128, member_total: U128, pot_total: U128 },
    #[event_version("1.0.0")]
    SpendRequested {
        pot: AccountId,
        request_id: u32,
        proposal_id: u64,
        requester: AccountId,
        receiver_id: AccountId,
        amount: U128,
        category: Category,
        request_ref: String,
        path: Path,
        reason: Reason,
        approvals_needed: u32,
    },
    #[event_version("1.0.0")]
    SpendAutoApproved {
        pot: AccountId,
        request_id: u32,
        proposal_id: u64,
        requester: AccountId,
        receiver_id: AccountId,
        amount: U128,
        budget_used: U128,
        budget_left: U128,
    },
    #[event_version("1.0.0")]
    SpendPayoutFailed { pot: AccountId, request_id: u32, proposal_id: u64, stage: String, dao_status: String },
    #[event_version("1.0.0")]
    RulesChanged { pot: AccountId, rules: Rules, rules_version: u32, by: String, actor: AccountId },
    #[event_version("1.0.0")]
    InviteAdded { pot: AccountId, invite_pk: String, by: AccountId, expires_at_ms: u64, max_uses: u32 },
    #[event_version("1.0.0")]
    InviteRevoked { pot: AccountId, invite_pk: String, by: AccountId },
    #[event_version("1.0.0")]
    CloseProposed {
        pot: AccountId,
        proposal_id: u64,
        by: AccountId,
        balance: U128,
        payouts: Vec<PayoutView>,
        dust: U128,
        dust_to: AccountId,
    },
    #[event_version("1.0.0")]
    PotClosed { pot: AccountId, proposal_id: u64, balance: U128, payouts: Vec<PayoutView> },
    #[event_version("1.0.0")]
    RulesChangeProposed { pot: AccountId, proposal_id: u64, by: AccountId, rules: Rules, rules_version: u32 },
    #[event_version("1.0.0")]
    ProposalSynced {
        pot: AccountId,
        proposal_id: u64,
        subject: String,
        request_id: Option<u32>,
        member: Option<AccountId>,
        dao_status: String,
        hub_status: String,
    },
    #[event_version("1.0.0")]
    ConfigChanged { by: AccountId, config: ConfigCore },
}
