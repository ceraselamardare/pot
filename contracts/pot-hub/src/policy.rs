//! The DAO `new` args (contracts-spec §3.2, D-04 Rev 5, INV-16): the hardened policy with the
//! creator as the only member and the hub as the rulebot. No `transfer:RemoveProposal` (rev5).

use near_sdk::serde_json::{json, Value};
use near_sdk::AccountId;

use crate::types::{Preset, PROPOSAL_PERIOD_NS, ROLE_MEMBER, ROLE_RULEBOT};

pub const MEMBER_PERMISSIONS: &[&str] = &["*:AddProposal", "*:VoteApprove", "*:VoteReject", "*:Finalize"];
pub const RULEBOT_PERMISSIONS: &[&str] = &[
    "transfer:AddProposal",
    "transfer:VoteApprove",
    "transfer:Finalize",
    "add_member_to_role:AddProposal",
    "add_member_to_role:VoteApprove",
    "call:AddProposal",
];

pub fn rulebot_vote_policy() -> Value {
    json!({ "weight_kind": "RoleWeight", "quorum": "1", "threshold": [1, 1] })
}

pub fn dao_policy(creator: &AccountId, hub: &AccountId) -> Value {
    json!({
        "roles": [
            { "name": ROLE_MEMBER,
              "kind": { "Group": [creator] },
              "permissions": MEMBER_PERMISSIONS,
              "vote_policy": {} },
            { "name": ROLE_RULEBOT,
              "kind": { "Group": [hub] },
              "permissions": RULEBOT_PERMISSIONS,
              "vote_policy": {
                  "transfer": rulebot_vote_policy(),
                  "add_member_to_role": rulebot_vote_policy() } }
        ],
        "default_vote_policy": { "weight_kind": "RoleWeight", "quorum": "1", "threshold": [1, 2] },
        "proposal_bond": "0",
        "proposal_period": PROPOSAL_PERIOD_NS.to_string(),
        "bounty_bond": "0",
        "bounty_forgiveness_period": "86400000000000"
    })
}

/// `Config` + `Policy` use `deny_unknown_fields` in Sputnik, so exactly these keys are sent.
pub fn dao_new_args(name: &str, preset: Preset, creator: &AccountId, hub: &AccountId) -> Value {
    json!({
        "config": {
            "name": name,
            "purpose": format!("Pot group fund ({}). Rules enforced by {}", preset.as_str(), hub),
            "metadata": ""
        },
        "policy": dao_policy(creator, hub)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Snapshot of contracts-spec §3.2 (INV-16).
    #[test]
    fn policy_snapshot_matches_spec() {
        let creator: AccountId = "maya.users.potapp.testnet".parse().unwrap();
        let hub: AccountId = "pots.potapp.testnet".parse().unwrap();
        let got = dao_new_args("Lisbon Trip", Preset::Trip, &creator, &hub);
        let expected: Value = near_sdk::serde_json::from_str(r#"{
          "config": { "name": "Lisbon Trip", "purpose": "Pot group fund (trip). Rules enforced by pots.potapp.testnet", "metadata": "" },
          "policy": {
            "roles": [
              { "name": "member", "kind": { "Group": ["maya.users.potapp.testnet"] },
                "permissions": ["*:AddProposal", "*:VoteApprove", "*:VoteReject", "*:Finalize"], "vote_policy": {} },
              { "name": "rulebot", "kind": { "Group": ["pots.potapp.testnet"] },
                "permissions": ["transfer:AddProposal", "transfer:VoteApprove", "transfer:Finalize",
                                "add_member_to_role:AddProposal", "add_member_to_role:VoteApprove", "call:AddProposal"],
                "vote_policy": {
                  "transfer":           { "weight_kind": "RoleWeight", "quorum": "1", "threshold": [1, 1] },
                  "add_member_to_role": { "weight_kind": "RoleWeight", "quorum": "1", "threshold": [1, 1] } } }
            ],
            "default_vote_policy": { "weight_kind": "RoleWeight", "quorum": "1", "threshold": [1, 2] },
            "proposal_bond": "0", "proposal_period": "604800000000000",
            "bounty_bond": "0", "bounty_forgiveness_period": "86400000000000"
          }
        }"#).unwrap();
        assert_eq!(got, expected);
        let s = got.to_string();
        assert!(!s.contains("RemoveProposal"), "rev5: no RemoveProposal");
        assert!(!s.contains("\"quorum\":\"0\""));
    }
}
