//! The DAO `new` args (contracts-spec §3.2, D-04 Rev 5, INV-16): the hardened policy with the
//! creator as the only member and the hub as the rulebot. No `transfer:RemoveProposal` (rev5).
//!
//! Hub 1.3.0 (audit HUB-1 / GOV-2 / GOV-3 / GOV-4 / W4-7 / GOV-9 / HUB-6): new Pots get policy
//! **v3**, where members can only vote. Only the rulebot (the hub) can create proposals, so:
//! - a creator alone can't add alt accounts or rewrite the policy before friends join (HUB-1);
//! - sybils admitted by an invite can't file a raw `Transfer` and approve it (GOV-2, raw path);
//! - a majority can't upgrade the DAO, change its policy or make arbitrary calls (GOV-3); it can
//!   only approve or reject what the hub proposed (spends, joins, rules changes, closes);
//! - nobody can spam zero-bond proposals into the DAO's storage float (GOV-4);
//! - every `call` proposal is the hub's own (a rules change or a close), so the v4 rulebot's
//!   `call` approval can't touch a member-made call (W4-7);
//! - members can't be removed in the DAO behind the hub's back (GOV-9);
//! - members have no `Finalize`: a failed close can only be retried by the hub, and only while it
//!   is the Pot's current close, so a stale failed close can never pay out later (HUB-6).
//! v1 / v2 Pots keep the policy they were created with (Sputnik policies are per DAO).

use near_sdk::serde_json::{json, Value};
use near_sdk::AccountId;

use crate::types::{policy_members_propose, policy_rulebot_approves_call, Preset, POLICY_V1, POLICY_V3, PROPOSAL_PERIOD_NS, ROLE_MEMBER, ROLE_RULEBOT};

/// v1 / v2 (legacy): members may also create any proposal and finalize.
pub const MEMBER_PERMISSIONS: &[&str] = &["*:AddProposal", "*:VoteApprove", "*:VoteReject", "*:Finalize"];
/// v3 / v4 (hub 1.3.0): members vote on the hub's proposals, nothing else.
pub const MEMBER_PERMISSIONS_V3: &[&str] = &["*:VoteApprove", "*:VoteReject"];
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
/// Policy v3: the rulebot may `Finalize` a failed `call` proposal. Finalize never approves anything:
/// it re-runs a proposal the group already approved (a close whose payout failed, HUB-4) or expires
/// one past its period. The hub only finalizes the Pot's current close.
pub const RULEBOT_PERMISSIONS_V3_EXTRA: &[&str] = &["call:Finalize"];
/// Policy v4 = v3 + approving `call` (the goal refund, as in v2).
pub const RULEBOT_PERMISSIONS_V4_EXTRA: &[&str] = &["call:VoteApprove", "call:Finalize"];

pub fn rulebot_vote_policy() -> Value {
    json!({ "weight_kind": "RoleWeight", "quorum": "1", "threshold": [1, 1] })
}

pub fn dao_policy(creator: &AccountId, hub: &AccountId) -> Value {
    dao_policy_v(creator, hub, POLICY_V1)
}

pub fn dao_policy_v(creator: &AccountId, hub: &AccountId, v: u8) -> Value {
    let mut perms: Vec<&str> = RULEBOT_PERMISSIONS.to_vec();
    let mut votes = json!({
        "transfer": rulebot_vote_policy(),
        "add_member_to_role": rulebot_vote_policy() });
    let extra = match v {
        _ if v >= POLICY_V3 && policy_rulebot_approves_call(v) => RULEBOT_PERMISSIONS_V4_EXTRA,
        _ if v >= POLICY_V3 => RULEBOT_PERMISSIONS_V3_EXTRA,
        _ if policy_rulebot_approves_call(v) => RULEBOT_PERMISSIONS_V2_EXTRA,
        _ => &[],
    };
    perms.extend_from_slice(extra);
    if policy_rulebot_approves_call(v) {
        votes["call"] = rulebot_vote_policy();
    }
    let members = if policy_members_propose(v) { MEMBER_PERMISSIONS } else { MEMBER_PERMISSIONS_V3 };
    json!({
        "roles": [
            { "name": ROLE_MEMBER,
              "kind": { "Group": [creator] },
              "permissions": members,
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
    dao_new_args_v(name, preset, creator, hub, POLICY_V1)
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

    fn perms(v: &Value, role: usize) -> Vec<String> {
        v["policy"]["roles"][role]["permissions"].as_array().unwrap().iter().map(|x| x.as_str().unwrap().to_string()).collect()
    }

    /// HUB-1 / GOV-2 / GOV-3 / GOV-4 / W4-7 / GOV-9 / HUB-6: policy v3 = v1 where members can only
    /// vote (no `AddProposal`, no `Finalize`) and the rulebot may also `Finalize` a failed `call`.
    #[test]
    fn hub_1_policy_v3_members_only_vote() {
        let creator: AccountId = "maya.users.potapp.testnet".parse().unwrap();
        let hub: AccountId = "pots.potapp.testnet".parse().unwrap();
        let v1 = dao_new_args("Fund", Preset::Custom, &creator, &hub);
        let v3 = dao_new_args_v("Fund", Preset::Custom, &creator, &hub, crate::types::POLICY_V3);
        assert_eq!(perms(&v3, 0), vec!["*:VoteApprove", "*:VoteReject"]);
        assert!(!v3.to_string().contains("*:AddProposal") && !v3.to_string().contains("*:Finalize"));
        let mut rb1 = perms(&v1, 1);
        rb1.push("call:Finalize".into());
        assert_eq!(perms(&v3, 1), rb1, "the rulebot gains only call:Finalize");
        assert!(v3["policy"]["roles"][1]["vote_policy"].get("call").is_none(), "v3: the rulebot can't approve a call");
        // everything else is the v1 template
        let mut a = v1.clone();
        let mut b = v3.clone();
        for x in [&mut a, &mut b] {
            x["policy"]["roles"][0]["permissions"] = json!([]);
            x["policy"]["roles"][1]["permissions"] = json!([]);
        }
        assert_eq!(a, b);
        assert!(!v3.to_string().contains("RemoveProposal"));
    }

    /// v4 = v3 + the rulebot's `call:VoteApprove` and `call` 1/1 (all-or-nothing Pots: the refund).
    #[test]
    fn hub_1_policy_v4_is_v3_plus_refund_approval() {
        let creator: AccountId = "maya.users.potapp.testnet".parse().unwrap();
        let hub: AccountId = "pots.potapp.testnet".parse().unwrap();
        let v3 = dao_new_args_v("Fund", Preset::Custom, &creator, &hub, crate::types::POLICY_V3);
        let mut v4 = dao_new_args_v("Fund", Preset::Custom, &creator, &hub, crate::types::POLICY_V4);
        assert_eq!(perms(&v4, 0), vec!["*:VoteApprove", "*:VoteReject"]);
        let rb = &mut v4["policy"]["roles"][1];
        assert_eq!(rb["vote_policy"]["call"], rulebot_vote_policy());
        rb["vote_policy"].as_object_mut().unwrap().remove("call");
        rb["permissions"].as_array_mut().unwrap().retain(|x| x != "call:VoteApprove");
        assert_eq!(v3, v4, "v4 differs from v3 only in the rulebot's call approval");
    }
}
