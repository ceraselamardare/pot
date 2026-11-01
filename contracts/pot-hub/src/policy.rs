//! The DAO `new` args (contracts-spec §3.2, D-04 Rev 5, INV-16): the hardened policy with the
//! creator as the only member and the hub as the rulebot. No `transfer:RemoveProposal` (rev5).

use near_sdk::serde_json::{json, Value};
use near_sdk::AccountId;

use crate::types::{Preset, POLICY_V2, PROPOSAL_PERIOD_NS, ROLE_MEMBER, ROLE_RULEBOT};

pub const MEMBER_PERMISSIONS: &[&str] = &["*:AddProposal", "*:VoteApprove", "*:VoteReject", "*:Finalize"];
pub const RULEBOT_PERMISSIONS: &[&str] = &[
    "transfer:AddProposal",
    "transfer:VoteApprove",
    "transfer:Finalize",
    "add_member_to_role:AddProposal",
    "add_member_to_role:VoteApprove",
    "call:AddProposal",
];

/// Policy v2 (wave 4, all-or-nothing Pots only): the rulebot may also approve and finalize `call`
/// proposals, so `refund_unfunded` can approve the refund close of a missed goal. The hub only ever
/// votes on a close it proposed itself (INV-03 amended, notes/contracts-wave4.md).
pub const RULEBOT_PERMISSIONS_V2_EXTRA: &[&str] = &["call:VoteApprove", "call:Finalize"];

pub fn rulebot_vote_policy() -> Value {
    json!({ "weight_kind": "RoleWeight", "quorum": "1", "threshold": [1, 1] })
}

pub fn dao_policy(creator: &AccountId, hub: &AccountId) -> Value {
    dao_policy_v(creator, hub, 1)
}

pub fn dao_policy_v(creator: &AccountId, hub: &AccountId, v: u8) -> Value {
    let mut perms: Vec<&str> = RULEBOT_PERMISSIONS.to_vec();
    let mut votes = json!({
        "transfer": rulebot_vote_policy(),
        "add_member_to_role": rulebot_vote_policy() });
    if v >= POLICY_V2 {
        perms.extend_from_slice(RULEBOT_PERMISSIONS_V2_EXTRA);
        votes["call"] = rulebot_vote_policy();
    }
    json!({
        "roles": [
            { "name": ROLE_MEMBER,
              "kind": { "Group": [creator] },
              "permissions": MEMBER_PERMISSIONS,
              "vote_policy": {} },
            { "name": ROLE_RULEBOT,
              "kind": { "Group": [hub] },
              "permissions": perms,
              "vote_policy": votes }
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
    dao_new_args_v(name, preset, creator, hub, 1)
}

pub fn dao_new_args_v(name: &str, preset: Preset, creator: &AccountId, hub: &AccountId, v: u8) -> Value {
    json!({
        "config": {
            "name": name,
            "purpose": format!("Pot group fund ({}). Rules enforced by {}", preset.as_str(), hub),
            "metadata": ""
        },
        "policy": dao_policy_v(creator, hub, v)
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

    /// Policy v2 = v1 + `call:VoteApprove`/`call:Finalize` and a 1/1 `call` vote policy for the
    /// rulebot only; the member role and every other field are unchanged.
    #[test]
    fn policy_v2_only_adds_rulebot_call() {
        let creator: AccountId = "maya.users.potapp.testnet".parse().unwrap();
        let hub: AccountId = "pots.potapp.testnet".parse().unwrap();
        let v1 = dao_new_args("Fund", Preset::Custom, &creator, &hub);
        let mut v2 = dao_new_args_v("Fund", Preset::Custom, &creator, &hub, 2);
        let rb = &mut v2["policy"]["roles"][1];
        assert_eq!(rb["vote_policy"]["call"], json!({ "weight_kind": "RoleWeight", "quorum": "1", "threshold": [1, 1] }));
        let perms: Vec<String> = rb["permissions"].as_array().unwrap().iter().map(|x| x.as_str().unwrap().to_string()).collect();
        assert!(perms.contains(&"call:VoteApprove".to_string()) && perms.contains(&"call:Finalize".to_string()));
        rb["vote_policy"].as_object_mut().unwrap().remove("call");
        let p = rb["permissions"].as_array_mut().unwrap();
        p.retain(|x| x != "call:VoteApprove" && x != "call:Finalize");
        assert_eq!(v1, v2, "v2 differs from v1 only in the rulebot's call rights");
        assert!(!v2.to_string().contains("RemoveProposal"));
    }
}
