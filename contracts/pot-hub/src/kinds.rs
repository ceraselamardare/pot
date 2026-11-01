//! Kind builders (contracts-spec §3.0): the ONLY proposal shapes the hub may ever propose (INV-02).
//! Deterministic, so the same inputs rebuild the same kind for `act_proposal` (INV-04); kinds are
//! never stored.

use near_sdk::json_types::{Base64VecU8, U128, U64};
use near_sdk::serde::Serialize;
use near_sdk::AccountId;

use crate::ext::{DaoActionCall, DaoKind};
use crate::types::{Category, Rules, ROLE_MEMBER};

pub const CLOSE_ACTION_GAS: u64 = 5_000_000_000_000; // GAS_CLOSE_ACTION, 5 Tgas per ft_transfer
pub const SET_RULES_ACTION_GAS: u64 = 15_000_000_000_000; // GAS_SET_RULES_ACTION
pub const CLOSE_MEMO: &str = "pot refund";

pub fn transfer_kind(usdc: &AccountId, receiver: &AccountId, amount: u128) -> DaoKind {
    DaoKind::Transfer {
        token_id: usdc.to_string(),
        receiver_id: receiver.clone(),
        amount: U128(amount),
        msg: None,
    }
}

/// Role is ALWAYS "member" and member_id is the joiner (INV-09, T-57).
pub fn join_kind(joiner: &AccountId) -> DaoKind {
    DaoKind::AddMemberToRole { member_id: joiner.clone(), role: ROLE_MEMBER.to_string() }
}

/// The exact `ft_transfer` args of one close payout (byte-for-byte, key order fixed).
pub fn close_transfer_args(receiver: &AccountId, amount: u128) -> String {
    format!(r#"{{"receiver_id":"{receiver}","amount":"{amount}","memo":"{CLOSE_MEMO}"}}"#)
}

pub fn close_kind(usdc: &AccountId, payouts: &[(AccountId, u128)]) -> DaoKind {
    DaoKind::FunctionCall {
        receiver_id: usdc.clone(),
        actions: payouts
            .iter()
            .map(|(a, amt)| DaoActionCall {
                method_name: "ft_transfer".to_string(),
                args: Base64VecU8::from(close_transfer_args(a, *amt).into_bytes()),
                deposit: U128(1),
                gas: U64(CLOSE_ACTION_GAS),
            })
            .collect(),
    }
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
struct SetRulesArgs<'a> {
    pot: &'a AccountId,
    rules: &'a Rules,
}

pub fn set_rules_args(pot: &AccountId, rules: &Rules) -> String {
    near_sdk::serde_json::to_string(&SetRulesArgs { pot, rules }).expect("serializable")
}

pub fn rules_kind(hub: &AccountId, pot: &AccountId, rules: &Rules) -> DaoKind {
    DaoKind::FunctionCall {
        receiver_id: hub.clone(),
        actions: vec![DaoActionCall {
            method_name: "set_rules".to_string(),
            args: Base64VecU8::from(set_rules_args(pot, rules).into_bytes()),
            deposit: U128(0),
            gas: U64(SET_RULES_ACTION_GAS),
        }],
    }
}

// Descriptions: ASCII, no user text beyond the category (D-07).
pub fn spend_description(id: u32, category: Category, request_ref: &str) -> String {
    format!("Pot request #{id}: {} (ref {request_ref})", category.as_str())
}
pub fn join_description() -> String {
    "Pot join via invite".to_string()
}
pub fn close_description(balance: u128, n: usize) -> String {
    format!("Pot close-out: refund {balance} to {n} members")
}
pub fn rules_description(version: u32) -> String {
    format!("Pot rules change v{version}")
}

pub fn to_json<T: Serialize>(v: &T) -> String {
    near_sdk::serde_json::to_string(v).expect("serializable")
}

/// `add_proposal` args, as sent in the prepay batch (§3.11).
pub fn add_proposal_args(description: &str, kind: &DaoKind) -> Vec<u8> {
    #[derive(Serialize)]
    #[serde(crate = "near_sdk::serde")]
    struct Input<'a> {
        description: &'a str,
        kind: &'a DaoKind,
    }
    #[derive(Serialize)]
    #[serde(crate = "near_sdk::serde")]
    struct Args<'a> {
        proposal: Input<'a>,
    }
    near_sdk::serde_json::to_vec(&Args { proposal: Input { description, kind } }).expect("serializable")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::PayeeRule;

    fn acc(s: &str) -> AccountId {
        s.parse().unwrap()
    }

    #[test]
    fn transfer_kind_exact_json() {
        let k = transfer_kind(&acc("usdc.potapp.testnet"), &acc("maya.users.potapp.testnet"), 84_000_000);
        assert_eq!(
            to_json(&k),
            r#"{"Transfer":{"token_id":"usdc.potapp.testnet","receiver_id":"maya.users.potapp.testnet","amount":"84000000","msg":null}}"#
        );
    }

    /// T-57: role fixed to "member", member_id == the joiner.
    #[test]
    fn join_kind_role_fixed() {
        let k = join_kind(&acc("leo.users.potapp.testnet"));
        assert_eq!(
            to_json(&k),
            r#"{"AddMemberToRole":{"member_id":"leo.users.potapp.testnet","role":"member"}}"#
        );
    }

    #[test]
    fn close_kind_exact_json() {
        let k = close_kind(&acc("usdc.potapp.testnet"), &[(acc("maya.testnet"), 22_000_000)]);
        let args = near_sdk::base64::Engine::encode(
            &near_sdk::base64::engine::general_purpose::STANDARD,
            r#"{"receiver_id":"maya.testnet","amount":"22000000","memo":"pot refund"}"#,
        );
        assert_eq!(
            to_json(&k),
            format!(
                r#"{{"FunctionCall":{{"receiver_id":"usdc.potapp.testnet","actions":[{{"method_name":"ft_transfer","args":"{args}","deposit":"1","gas":"5000000000000"}}]}}}}"#
            )
        );
    }

    #[test]
    fn rules_kind_exact_json() {
        let rules = Rules {
            instant_cap: U128(50_000_000),
            member_budget: U128(150_000_000),
            instant_payees: PayeeRule::Members,
            payee_allowlist: vec![],
        };
        let k = rules_kind(&acc("pots.potapp.testnet"), &acc("lisbon.pots.potapp.testnet"), &rules);
        let inner = r#"{"pot":"lisbon.pots.potapp.testnet","rules":{"instant_cap":"50000000","member_budget":"150000000","instant_payees":"members","payee_allowlist":[]}}"#;
        assert_eq!(set_rules_args(&acc("lisbon.pots.potapp.testnet"), &rules), inner);
        let args = near_sdk::base64::Engine::encode(&near_sdk::base64::engine::general_purpose::STANDARD, inner);
        assert_eq!(
            to_json(&k),
            format!(
                r#"{{"FunctionCall":{{"receiver_id":"pots.potapp.testnet","actions":[{{"method_name":"set_rules","args":"{args}","deposit":"0","gas":"15000000000000"}}]}}}}"#
            )
        );
    }

    #[test]
    fn descriptions_ascii() {
        assert_eq!(spend_description(3, Category::Groceries, "k3d9x1a2b4c6m7n8"), "Pot request #3: groceries (ref k3d9x1a2b4c6m7n8)");
        assert_eq!(close_description(66_000_000, 3), "Pot close-out: refund 66000000 to 3 members");
        assert_eq!(rules_description(2), "Pot rules change v2");
    }
}
