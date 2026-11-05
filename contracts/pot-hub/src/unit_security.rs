//! Hub 1.3.0 security fixes (notes/security-audit-2026-11-04.md), tested at the contract level with
//! exact control of block time and promise results. Test names start with the audit ID.
//! - HUB-2: a 1-unit contribution doesn't make a member an instant spender.
//! - W4-1: who may ask for / give the one OK, the tier re-check at OK time, and the one-OK allowance
//!   (two accounts OK-ing each other can't loop past it).
//! - HUB-4: a close is Closed only once the DAO's USDC shows the payout left; a failed close is
//!   retryable by the hub; a close confirmed too early that the DAO reports Failed reopens.
//! - HUB-6: only the Pot's current failed close can be retried.
//! - W4-5: links awaiting funds don't block a close, and a closing Pot refuses to fund a link.
//! - W4-8: no links under $1.
//! The sandbox twins are in contracts/tests/tests/t_security.rs.

use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, PromiseResult};
use std::panic::{catch_unwind, AssertUnwindSafe};

const T0: u64 = 1_793_000_000_000; // ms
const USD: u128 = 1_000_000;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn set_ctx(pred: &str, ms: u64, results: Vec<PromiseResult>) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("pots.near"))
        .predecessor_account_id(acc(pred))
        .signer_account_id(acc("relayer.near"))
        .block_timestamp(ms * 1_000_000)
        .block_height(ms / 1_000) // one block per second
        .account_balance(NearToken::from_near(100))
        .prepaid_gas(Gas::from_tgas(300));
    testing_env!(b.build(), near_sdk::test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(), results);
}

fn ok(v: &str) -> PromiseResult {
    PromiseResult::Successful(v.as_bytes().to_vec())
}

fn panics_with<R>(code: &str, f: impl FnOnce() -> R) {
    let err = match catch_unwind(AssertUnwindSafe(f)) {
        Ok(_) => panic!("expected panic {code}"),
        Err(e) => e,
    };
    let msg = err.downcast_ref::<String>().cloned().or_else(|| err.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or_default();
    assert!(msg.contains(code), "expected {code}, got {msg}");
}

/// A Trip Pot (cap $100, budget $200) created by hub 1.3.0 defaults (one-OK $300, links on, policy
/// v3) with `members` (the first is the creator), all joined at T0.
fn hub_with_pot(members: &[&str]) -> (PotHub, AccountId) {
    set_ctx("owner.near", T0, vec![]);
    let mut hub = PotHub::new(
        acc("owner.near"),
        acc("usdc.near"),
        "Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD".parse().unwrap(),
        NearToken::from_millinear(50),
        NearToken::from_millinear(50),
        vec![acc("relayer.near")],
        None,
    );
    set_ctx(members[0], T0, vec![]);
    let _ = hub.create_pot("trip".into(), "x".into(), Preset::Trip, None, None, None, None, None);
    let dao = acc("trip.pots.near");
    set_ctx("pots.near", T0, vec![PromiseResult::Successful(vec![])]);
    let rules = Preset::Trip.default_rules().unwrap();
    let extras = RuleExtras::defaults_for(&rules);
    let _ = hub.on_pot_created(
        dao.clone(),
        "trip".into(),
        "x".into(),
        None,
        Preset::Trip,
        rules,
        acc(members[0]),
        None,
        NearToken::from_millinear(50),
        true,
        (T0 / DAY_MS) as u32,
        Some(extras),
        Some(POLICY_V3),
    );
    for m in &members[1..] {
        add_member(&mut hub, &dao, m, T0);
    }
    (hub, dao)
}

fn add_member(hub: &mut PotHub, dao: &AccountId, who: &str, joined_ms: u64) {
    let mut p = hub.pots.get(dao).unwrap().clone();
    let i = p.next_join_index;
    hub.members.insert(
        (p.idx, acc(who)),
        Member {
            join_index: i,
            status: MemberStatus::Active,
            joined_at_ms: joined_ms,
            invite_pk: None,
            contributed: 0,
            instant_used: 0,
            spent: 0,
            pending_votes: 0,
        },
    );
    hub.member_list.insert((p.idx, i), acc(who));
    p.member_count += 1;
    p.next_join_index += 1;
    hub.pots.insert(dao.clone(), p);
}

fn contribute(hub: &mut PotHub, dao: &AccountId, who: &str, amount: u128, ms: u64) {
    set_ctx("usdc.near", ms, vec![]);
    let _ = hub.ft_on_transfer(acc(who), U128(amount), format!("{{\"pot\":\"{dao}\"}}"));
    set_ctx("pots.near", ms, vec![PromiseResult::Successful(vec![])]);
    assert_eq!(hub.on_contribution_forwarded(dao.clone(), acc(who), U128(amount)), U128(0));
}

fn preview(hub: &PotHub, dao: &AccountId, who: &str, amount: u128, to: &str) -> SpendPreview {
    hub.preview_spend(dao.clone(), acc(who), U128(amount), acc(to), Some(U128(10_000 * USD)), None)
}

fn policy_json(members: &[&str]) -> String {
    let g: Vec<String> = members.iter().map(|m| format!("\"{m}\"")).collect();
    format!(
        r#"{{"roles":[{{"name":"member","kind":{{"Group":[{}]}}}},{{"name":"rulebot","kind":{{"Group":["pots.near"]}}}}]}}"#,
        g.join(",")
    )
}

fn proposal(status: &str, votes: &str, ms: u64) -> PromiseResult {
    ok(&format!(r#"{{"status":"{status}","votes":{{{votes}}},"submission_time":"{}"}}"#, ms * 1_000_000))
}

/// request_spend → on_spend_checked → on_spend_added for a vote-path request; returns (request id, proposal id).
fn vote_request(
    hub: &mut PotHub,
    dao: &AccountId,
    who: &str,
    amount: u128,
    to: &str,
    pid: u64,
    ms: u64,
    group: &[&str],
) -> (u32, SpendOutcome) {
    set_ctx(who, ms, vec![]);
    let _ = hub.request_spend(dao.clone(), U128(amount), acc(to), Category::Food, format!("ref{pid:08}"), None);
    let id = hub.pots.get(dao).unwrap().request_seq - 1;
    set_ctx(
        "pots.near",
        ms,
        vec![ok("\"1000000000\""), ok(r#"{"total":"1250000000000000000000","available":"0"}"#), ok(&policy_json(group))],
    );
    let _ = hub.on_spend_checked(dao.clone(), id, U128(10u128.pow(22)));
    set_ctx("pots.near", ms, vec![ok(&pid.to_string())]);
    match hub.on_spend_added(dao.clone(), id) {
        PromiseOrValue::Value(o) => (id, o),
        PromiseOrValue::Promise(_) => panic!("a vote-path request returns a value"),
    }
}

/// ok_request → on_ok_checked → on_ok_status with the hub's approval landing (`Approved`).
fn give_ok(hub: &mut PotHub, dao: &AccountId, by: &str, id: u32, ms: u64, group: &[&str]) -> OkOutcome {
    set_ctx(by, ms, vec![]);
    let _ = hub.ok_request(dao.clone(), id);
    set_ctx("pots.near", ms, vec![proposal("InProgress", "", ms), ok(&policy_json(group))]);
    let _ = hub.on_ok_checked(dao.clone(), id, acc(by));
    set_ctx("pots.near", ms, vec![proposal("Approved", r#""pots.near":"Approve""#, ms)]);
    hub.on_ok_status(dao.clone(), id, acc(by))
}

fn one_ok_used(hub: &PotHub, dao: &AccountId, who: &str) -> u128 {
    hub.one_ok_used(hub.pots.get(dao).unwrap().idx, &acc(who))
}

/// HUB-2: a member who added 1 unit ($0.000001) is still a new member: no instant spend, and no
/// one-OK either (the group decides). From $1 on they spend within the rules.
#[test]
fn hub_2_one_unit_contribution_is_not_a_stake() {
    let (mut hub, dao) = hub_with_pot(&["maya.near", "sam.near", "eve.near"]);
    contribute(&mut hub, &dao, "maya.near", 100 * USD, T0);
    contribute(&mut hub, &dao, "eve.near", 1, T0);
    let p = preview(&hub, &dao, "eve.near", 50 * USD, "eve.near");
    assert_eq!((p.path.as_str(), p.reason.as_str(), p.tier.as_str()), ("vote", "new_member", "group"));
    contribute(&mut hub, &dao, "eve.near", MIN_STAKE - 2, T0);
    assert_eq!(preview(&hub, &dao, "eve.near", 50 * USD, "eve.near").reason, "new_member", "$0.999999 is still under the stake");
    contribute(&mut hub, &dao, "eve.near", 1, T0);
    let p = preview(&hub, &dao, "eve.near", 50 * USD, "eve.near");
    assert_eq!((p.path.as_str(), p.reason.as_str(), p.tier.as_str()), ("instant", "within_rules", "instant"));
    // over the cap with a stake → one OK
    assert_eq!(preview(&hub, &dao, "eve.near", 150 * USD, "eve.near").tier, "one_ok");
}

/// W4-1 (b): the one OK must come from another member who is not the payee, joined before the
/// request, and added ≥ $1. Each refusal is synchronous (nothing reserved, nothing voted).
#[test]
fn w4_1_ok_giver_rules() {
    let (mut hub, dao) = hub_with_pot(&["maya.near", "sam.near", "leo.near", "eve.near"]);
    let group = ["maya.near", "sam.near", "leo.near", "eve.near", "bob.near"];
    for m in ["maya.near", "sam.near", "leo.near"] {
        contribute(&mut hub, &dao, m, 100 * USD, T0);
    }
    // Maya asks $150 for Sam (over her cap, within her budget): one OK
    let (id, out) = vote_request(&mut hub, &dao, "maya.near", 150 * USD, "sam.near", 5, T0 + 10, &group);
    assert_eq!((out.status.as_str(), out.tier), ("pending", Tier::OneOk));
    set_ctx("maya.near", T0 + 20, vec![]);
    panics_with(ERR_OK_SELF, || hub.ok_request(dao.clone(), id));
    set_ctx("sam.near", T0 + 20, vec![]);
    panics_with("ERR_OK_NOT_ELIGIBLE: receiver", || hub.ok_request(dao.clone(), id));
    set_ctx("eve.near", T0 + 20, vec![]);
    panics_with("ERR_OK_NOT_ELIGIBLE: no_stake", || hub.ok_request(dao.clone(), id));
    // Bob joins after the request was made, and adds money: still not allowed
    add_member(&mut hub, &dao, "bob.near", T0 + 15);
    contribute(&mut hub, &dao, "bob.near", 100 * USD, T0 + 16);
    set_ctx("bob.near", T0 + 20, vec![]);
    panics_with("ERR_OK_NOT_ELIGIBLE: joined_after", || hub.ok_request(dao.clone(), id));
    set_ctx("stranger.near", T0 + 20, vec![]);
    panics_with(ERR_NOT_MEMBER, || hub.ok_request(dao.clone(), id));
    assert_eq!(one_ok_used(&hub, &dao, "maya.near"), 0, "nothing reserved by a refused OK");
    // the view tells the UI the same thing
    let why = |who: &str| hub.get_ok_check(dao.clone(), id, acc(who)).unwrap().reason;
    assert_eq!(why("sam.near").as_deref(), Some("receiver"));
    assert_eq!(why("eve.near").as_deref(), Some("no_stake"));
    assert_eq!(why("bob.near").as_deref(), Some("joined_after"));
    assert_eq!(why("leo.near"), None);
    // Leo (member before the request, added money, not the payee) can
    let o = give_ok(&mut hub, &dao, "leo.near", id, T0 + 20, &group);
    assert!(o.ok, "{o:?}");
    assert_eq!(o.status, "approved");
    assert_eq!(one_ok_used(&hub, &dao, "maya.near"), 150 * USD, "the one-OK spend is charged to Maya's allowance");
}

/// W4-1 (a) + (c): two members OK-ing each other's requests can't loop: every one-OK approval is
/// charged to the requester's lifetime one-OK allowance (= the Pot's one-OK ceiling, $300 here);
/// once it is used up, requests go to the group. It is separate from the instant budget ($200), so
/// "a $300 spend needs one OK" still works. The tier is re-checked when the OK is given.
#[test]
fn w4_1_one_ok_loop_is_bounded_by_the_allowance() {
    let (mut hub, dao) = hub_with_pot(&["maya.near", "a.near", "b.near"]);
    let group = ["maya.near", "a.near", "b.near"];
    for m in ["maya.near", "a.near", "b.near"] {
        contribute(&mut hub, &dao, m, 1 * USD, T0);
    }
    // A: $300 to self (over the $200 budget too), B OKs → paid; A's one-OK allowance is used up
    let (id, out) = vote_request(&mut hub, &dao, "a.near", 300 * USD, "a.near", 1, T0 + 10, &group);
    assert_eq!(out.tier, Tier::OneOk);
    assert!(give_ok(&mut hub, &dao, "b.near", id, T0 + 20, &group).ok);
    let ms = hub.get_members(dao.clone(), None);
    let a = ms.iter().find(|m| m.account_id == acc("a.near")).unwrap();
    assert_eq!((a.one_ok_used.0, a.one_ok_left.0, a.budget_left.0), (300 * USD, 0, 200 * USD));
    // A again, any amount over the cap → the group decides
    let p = preview(&hub, &dao, "a.near", 101 * USD, "a.near");
    assert_eq!((p.reason.as_str(), p.tier.as_str()), ("over_cap", "group"));
    // the instant budget is separate: A still spends ≤ $100 at once, up to $200 in all
    assert_eq!(preview(&hub, &dao, "a.near", 100 * USD, "a.near").path, "instant");

    // two one-OK requests that each fit the allowance, but not together: the second OK is refused
    let (r1, o1) = vote_request(&mut hub, &dao, "b.near", 200 * USD, "b.near", 2, T0 + 30, &group);
    let (r2, o2) = vote_request(&mut hub, &dao, "b.near", 150 * USD, "b.near", 3, T0 + 30, &group);
    assert_eq!((o1.tier, o2.tier), (Tier::OneOk, Tier::OneOk));
    assert!(give_ok(&mut hub, &dao, "maya.near", r1, T0 + 40, &group).ok);
    set_ctx("maya.near", T0 + 40, vec![]);
    panics_with("ERR_NOT_ONE_OK: one_ok_used_up", || hub.ok_request(dao.clone(), r2));
    assert_eq!(hub.get_ok_check(dao.clone(), r2, acc("maya.near")).unwrap().reason.as_deref(), Some("one_ok_used_up"));
    // the reservation is taken synchronously: an OK whose DAO read then fails gives it back
    let (r3, _) = vote_request(&mut hub, &dao, "maya.near", 150 * USD, "maya.near", 4, T0 + 50, &group);
    set_ctx("a.near", T0 + 60, vec![]);
    let _ = hub.ok_request(dao.clone(), r3);
    assert_eq!(one_ok_used(&hub, &dao, "maya.near"), 150 * USD, "reserved while the OK is in flight");
    set_ctx("pots.near", T0 + 60, vec![proposal("InProgress", r#""sam.near":"Reject""#, T0 + 50), ok(&policy_json(&group))]);
    match hub.on_ok_checked(dao.clone(), r3, acc("a.near")) {
        PromiseOrValue::Value(o) => assert_eq!(o.reason.as_deref(), Some("objection")),
        _ => panic!("an objection stops the OK"),
    }
    assert_eq!(one_ok_used(&hub, &dao, "maya.near"), 0, "released on the objection");
    // an approval that didn't land (the group rejected first) releases it too
    set_ctx("a.near", T0 + 70, vec![]);
    let _ = hub.ok_request(dao.clone(), r3);
    set_ctx("pots.near", T0 + 70, vec![proposal("InProgress", "", T0 + 50), ok(&policy_json(&group))]);
    let _ = hub.on_ok_checked(dao.clone(), r3, acc("a.near"));
    set_ctx("pots.near", T0 + 70, vec![proposal("Rejected", r#""sam.near":"Reject""#, T0 + 50)]);
    let o = hub.on_ok_status(dao.clone(), r3, acc("a.near"));
    assert!(!o.ok);
    assert_eq!(o.status, "rejected");
    assert_eq!(one_ok_used(&hub, &dao, "maya.near"), 0);
}

/// HUB-4: `Approved` alone never closes a Pot. Without a balance read (the goal refund's own chain)
/// or while the DAO still holds the money, the Pot stays closing ("settling"); a sync that sees the
/// money gone closes it; a DAO-reported Failed leaves it retryable; a close confirmed too early
/// that the DAO later reports Failed reopens as a failed close.
#[test]
fn hub_4_close_waits_for_the_money_to_leave() {
    let (mut hub, dao) = hub_with_pot(&["maya.near", "sam.near"]);
    contribute(&mut hub, &dao, "maya.near", 100 * USD, T0);
    contribute(&mut hub, &dao, "sam.near", 100 * USD, T0);
    let t1 = T0 + 120_000;
    set_ctx("maya.near", t1, vec![]);
    let _ = hub.propose_close(dao.clone());
    set_ctx("pots.near", t1, vec![ok("\"200000000\"")]);
    let _ = hub.on_close_balance(dao.clone(), acc("maya.near"), U128(10u128.pow(22)));
    set_ctx("pots.near", t1, vec![ok("9")]);
    let payouts = vec![
        PayoutView { account_id: acc("maya.near"), amount: U128(100 * USD) },
        PayoutView { account_id: acc("sam.near"), amount: U128(100 * USD) },
    ];
    assert!(hub.on_close_added(dao.clone(), acc("maya.near"), U128(200 * USD), payouts, U128(0), acc("sam.near")).ok);
    let approved = || proposal("Approved", r#""maya.near":"Approve","sam.near":"Approve""#, t1);
    let status = |hub: &PotHub| hub.get_pot(dao.clone()).unwrap();

    // a chain without the balance read (refund phase 2 / retry): settling, not closed
    set_ctx("pots.near", t1 + 1_000, vec![approved()]);
    let s = hub.on_sync(dao.clone(), 9);
    assert_eq!((s.hub_status.as_str(), s.changed), ("closing", true));
    assert!(status(&hub).close_settling);
    assert_eq!(hub.preview_close(dao.clone(), None).blocked_reason.as_deref(), Some("close_in_progress"));
    // the DAO still holds the money (payout in flight): still settling, no change
    set_ctx("pots.near", t1 + 2_000, vec![approved(), ok("\"200000000\"")]);
    assert_eq!((hub.on_sync(dao.clone(), 9).hub_status.as_str(), status(&hub).status.as_str()), ("closing", "closing"));
    // the payout callback turned it into Failed: retryable, never "closed"
    set_ctx("pots.near", t1 + 3_000, vec![proposal("Failed", "", t1), ok("\"200000000\"")]);
    let s = hub.on_sync(dao.clone(), 9);
    assert_eq!((s.hub_status.as_str(), s.changed), ("closing", true));
    assert!(!status(&hub).close_settling);
    assert_eq!(hub.closes.get(&0).unwrap().status, CloseStatus::Failed);
    // retry (the hub finalizes the current close: v3 lets the rulebot finalize a call)
    set_ctx("relayer.near", t1 + 4_000, vec![]);
    let _ = hub.retry_payout(dao.clone(), 9);
    // the retry's own read is provisional → settling; the next sync sees the money out → closed
    set_ctx("pots.near", t1 + 4_000, vec![approved()]);
    assert_eq!(hub.on_sync(dao.clone(), 9).hub_status, "closing");
    set_ctx("pots.near", t1 + 5_000, vec![approved(), ok("\"0\"")]);
    let s = hub.on_sync(dao.clone(), 9);
    assert_eq!((s.hub_status.as_str(), s.changed), ("closed", true));
    assert_eq!(status(&hub).status, "closed");
    // a later read where the DAO says Failed (e.g. an earlier confirmation raced a concurrent spend):
    // the Pot reopens as a failed close instead of claiming everyone was paid
    set_ctx("pots.near", t1 + 6_000, vec![proposal("Failed", "", t1), ok("\"150000000\"")]);
    let s = hub.on_sync(dao.clone(), 9);
    assert_eq!((s.hub_status.as_str(), s.changed), ("closing", true));
    assert_eq!(hub.pots.get(&dao).unwrap().status, PotStatus::Closing { proposal_id: 9 });
    assert_eq!(hub.closes.get(&0).unwrap().status, CloseStatus::Failed);
    // the retry can't run on a close that is not failed / not current
    set_ctx("pots.near", t1 + 7_000, vec![approved(), ok("\"0\"")]);
    assert_eq!(hub.on_sync(dao.clone(), 9).hub_status, "closed");
    set_ctx("relayer.near", t1 + 8_000, vec![]);
    panics_with(ERR_NOT_RETRYABLE, || hub.retry_payout(dao.clone(), 9));
}

/// HUB-6: after a failed close is replaced by a new one, the hub never finalizes the old one (and in
/// a v3 Pot members can't finalize at all), so a stale split can't pay out later.
#[test]
fn hub_6_only_the_current_failed_close_is_retried() {
    let (mut hub, dao) = hub_with_pot(&["maya.near", "sam.near"]);
    contribute(&mut hub, &dao, "maya.near", 100 * USD, T0);
    let close = |hub: &mut PotHub, pid: u64, ms: u64| {
        set_ctx("maya.near", ms, vec![]);
        let _ = hub.propose_close(dao.clone());
        set_ctx("pots.near", ms, vec![ok("\"100000000\"")]);
        let _ = hub.on_close_balance(dao.clone(), acc("maya.near"), U128(10u128.pow(22)));
        set_ctx("pots.near", ms, vec![ok(&pid.to_string())]);
        let pv = vec![PayoutView { account_id: acc("maya.near"), amount: U128(100 * USD) }];
        assert!(hub.on_close_added(dao.clone(), acc("maya.near"), U128(100 * USD), pv, U128(0), acc("maya.near")).ok);
    };
    let t1 = T0 + 120_000;
    close(&mut hub, 4, t1);
    set_ctx("pots.near", t1 + 1_000, vec![proposal("Failed", "", t1), ok("\"100000000\"")]);
    let _ = hub.on_sync(dao.clone(), 4);
    // re-proposed (Failed → re-propose is allowed): close 6 replaces close 4
    close(&mut hub, 6, t1 + 2_000);
    set_ctx("relayer.near", t1 + 3_000, vec![]);
    panics_with(ERR_NOT_RETRYABLE, || hub.retry_payout(dao.clone(), 4));
    // close 6 is rejected → the Pot is open again; the old close stays dead
    set_ctx("pots.near", t1 + 4_000, vec![proposal("Rejected", "", t1 + 2_000), ok("\"100000000\"")]);
    assert_eq!(hub.on_sync(dao.clone(), 6).hub_status, "open");
    set_ctx("relayer.near", t1 + 5_000, vec![]);
    panics_with(ERR_USE_DAO_FINALIZE, || hub.retry_payout(dao.clone(), 4));
    // and a sync of the old close changes nothing
    set_ctx("pots.near", t1 + 6_000, vec![proposal("Failed", "", t1), ok("\"100000000\"")]);
    let s = hub.on_sync(dao.clone(), 4);
    assert_eq!((s.hub_status.as_str(), s.changed), ("replaced", false));
}

/// W4-5: a link still awaiting funds doesn't block a close (only escrowed money does), and once the
/// Pot is closing the hub refuses to fund a link (the token returns the money to the Pot).
/// W4-8: links under $1 are refused.
#[test]
fn w4_5_w4_8_links_and_the_close() {
    let (mut hub, dao) = hub_with_pot(&["maya.near", "sam.near", "leo.near"]);
    let group = ["maya.near", "sam.near", "leo.near"];
    for m in group {
        contribute(&mut hub, &dao, m, 100 * USD, T0);
    }
    let pk: PublicKey = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".parse().unwrap();
    let link_req = |hub: &mut PotHub, amount: u128, ms: u64| {
        set_ctx("maya.near", ms, vec![]);
        hub.request_spend(
            dao.clone(),
            U128(amount),
            acc("pots.near"),
            Category::Food,
            "linkref001".into(),
            Some(LinkSpec { claim_pk: pk.clone(), expires_at_ms: None }),
        )
    };
    // W4-8
    panics_with(ERR_LINK_TOO_SMALL, || link_req(&mut hub, MIN_LINK_AMOUNT - 1, T0 + 10));
    assert_eq!(
        hub.preview_spend(dao.clone(), acc("maya.near"), U128(999_999), acc("pots.near"), None, Some(true)).reason,
        "link_too_small"
    );
    // a $250 link (over the instant cap): pending (one OK), awaiting funds
    let _ = link_req(&mut hub, 250 * USD, T0 + 10);
    let id = hub.pots.get(&dao).unwrap().request_seq - 1;
    set_ctx("pots.near", T0 + 10, vec![ok("\"300000000\""), ok(r#"{"total":"1","available":"0"}"#), ok(&policy_json(&group))]);
    let _ = hub.on_spend_checked(dao.clone(), id, U128(10u128.pow(22)));
    set_ctx("pots.near", T0 + 10, vec![ok("3")]);
    let _ = hub.on_spend_added(dao.clone(), id);
    let pv = hub.get_pot(dao.clone()).unwrap();
    assert_eq!(pv.open_links, 1);
    assert_eq!(hub.links_blocking_close(0), 0, "a plain pending link doesn't block the close");
    let t1 = T0 + 120_000;
    set_ctx("maya.near", t1, vec![]);
    assert_eq!(hub.preview_close(dao.clone(), None).blocked_reason, None, "a pending link no longer blocks the close");
    set_ctx("maya.near", t1, vec![]);
    let _ = hub.propose_close(dao.clone());
    set_ctx("pots.near", t1, vec![ok("\"300000000\"")]);
    let _ = hub.on_close_balance(dao.clone(), acc("maya.near"), U128(10u128.pow(22)));
    set_ctx("pots.near", t1, vec![ok("9")]);
    let pv = vec![PayoutView { account_id: acc("maya.near"), amount: U128(300 * USD) }];
    assert!(hub.on_close_added(dao.clone(), acc("maya.near"), U128(300 * USD), pv, U128(0), acc("maya.near")).ok);
    // the group approves the link while the Pot is closing: the hub refuses the escrow
    set_ctx("usdc.near", t1 + 1_000, vec![]);
    match hub.ft_on_transfer(dao.clone(), U128(250 * USD), format!("{{\"link\":{id}}}")) {
        PromiseOrValue::Value(v) => assert_eq!(v, U128(250 * USD), "returned to the Pot"),
        _ => panic!("funding a link never forwards"),
    }
    assert_eq!(hub.get_link(dao.clone(), id).unwrap().status, LinkStatus::AwaitingFunds);
}

/// W4-5 (upgrade): a Pot with open links made before hub 1.3.0 has no tracking record, so all its
/// open links keep blocking the close until they are settled; tracking starts with the next link
/// requested while none is open.
#[test]
fn w4_5_untracked_pots_keep_the_old_rule() {
    let (mut hub, _dao) = hub_with_pot(&["maya.near", "sam.near"]);
    let mut e = hub.pext(0);
    e.open_links = 2; // two 1.2.0 links, no LinkTrack record
    hub.pot_ext.insert(0, e.clone());
    assert_eq!(hub.links_blocking_close(0), 2);
    hub.track_new_link(0, 7, 2); // a new link while old ones are open: still untracked
    assert!(hub.link_track(0).is_none());
    // (only a link request can be marked pending)
    hub.req_ext.insert(
        (0, 8),
        RequestExt {
            link: Some(Link {
                pk: [0; 32],
                expires_at_ms: 0,
                status: LinkStatus::AwaitingFunds,
                receiver: None,
                funded_at_ms: 0,
                done_at_ms: 0,
            }),
            ..RequestExt::for_path(Path::Vote)
        },
    );
    e.open_links = 0;
    hub.pot_ext.insert(0, e.clone());
    hub.track_new_link(0, 8, 0);
    e.open_links = 1;
    hub.pot_ext.insert(0, e);
    assert_eq!(hub.link_track(0), Some(LinkTrack { pending: 1 }));
    assert_eq!(hub.links_blocking_close(0), 0);
    hub.unmark_link_pending(0, 8); // approved / OK in flight
    hub.unmark_link_pending(0, 8); // idempotent
    assert_eq!(hub.links_blocking_close(0), 1);
    hub.mark_link_pending(0, 9); // not a link: ignored
    assert_eq!(hub.link_track(0), Some(LinkTrack { pending: 0 }));
}

// ---------------------------------------------------------------------------------------------
// Review of the 1.3.0 diff (2026-11-05): the reviewer's proof tests audit_a1-a4, ported with the
// fixed behaviour asserted.
// ---------------------------------------------------------------------------------------------

/// L-1 (audit_a1): an OK whose status read failed keeps its charge (the hub may have voted), but a
/// second OK on the SAME request isn't refused for it: the request's own charge doesn't count.
#[test]
fn l_1_reok_after_unknown_status() {
    let (mut hub, dao) = hub_with_pot(&["maya.near", "a.near", "b.near"]);
    let group = ["maya.near", "a.near", "b.near"];
    for m in group {
        contribute(&mut hub, &dao, m, 1 * USD, T0);
    }
    let (id, out) = vote_request(&mut hub, &dao, "a.near", 200 * USD, "a.near", 1, T0 + 10, &group);
    assert_eq!(out.tier, Tier::OneOk);
    set_ctx("b.near", T0 + 20, vec![]);
    let _ = hub.ok_request(dao.clone(), id);
    set_ctx("pots.near", T0 + 20, vec![proposal("InProgress", "", T0 + 10), ok(&policy_json(&group))]);
    let _ = hub.on_ok_checked(dao.clone(), id, acc("b.near"));
    set_ctx("pots.near", T0 + 20, vec![PromiseResult::Failed]); // the status read failed
    let o = hub.on_ok_status(dao.clone(), id, acc("b.near"));
    assert!(!o.ok);
    assert_eq!(one_ok_used(&hub, &dao, "a.near"), 200 * USD, "charge kept (the hub may have voted)");
    assert_eq!(hub.get_ok_check(dao.clone(), id, acc("maya.near")).unwrap().reason, None);
    let o = give_ok(&mut hub, &dao, "maya.near", id, T0 + 30, &group);
    assert!(o.ok, "{o:?}");
    assert_eq!(one_ok_used(&hub, &dao, "a.near"), 200 * USD, "charged once");
    assert_eq!(hub.ok_charge(0, id), 0, "the marker is dropped once paid (storage)");
}

/// L-2 (audit_a2): a rules change that turns the one-OK tier off, landing between `ok_request` and
/// its callback, stops the hub's approval; the reservation is released.
#[test]
fn l_2_rules_change_races_ok() {
    let (mut hub, dao) = hub_with_pot(&["maya.near", "a.near", "b.near"]);
    let group = ["maya.near", "a.near", "b.near"];
    for m in group {
        contribute(&mut hub, &dao, m, 1 * USD, T0);
    }
    let (id, _) = vote_request(&mut hub, &dao, "a.near", 200 * USD, "a.near", 1, T0 + 10, &group);
    set_ctx("b.near", T0 + 20, vec![]);
    let _ = hub.ok_request(dao.clone(), id);
    set_ctx(dao.as_str(), T0 + 21, vec![]); // a group-approved rules change executes: one OK off
    let rules = hub.pots.get(&dao).unwrap().rules.clone();
    let mut x = hub.pext(0).extras.clone();
    x.one_ok_cap = U128(0);
    let _ = hub.set_rules(dao.clone(), rules, Some(x));
    set_ctx("pots.near", T0 + 22, vec![proposal("InProgress", "", T0 + 10), ok(&policy_json(&group))]);
    match hub.on_ok_checked(dao.clone(), id, acc("b.near")) {
        PromiseOrValue::Value(o) => assert_eq!(o.reason.as_deref(), Some("not_one_ok")),
        PromiseOrValue::Promise(_) => panic!("the hub must not approve after the one-OK tier was turned off"),
    }
    assert_eq!(one_ok_used(&hub, &dao, "a.near"), 0, "released");
}

/// M-2 (audit_a3): after a successful payout, USDC sent straight to the DAO (≥ what the close read)
/// can't keep the Pot "settling": a sync at least CLOSE_CONFIRM_BLOCKS after the first `Approved`
/// confirms it; the leftover is then paid out by a hub-proposed sweep the members approve.
#[test]
fn m_2_settling_confirms_by_age_then_sweep() {
    let (mut hub, dao) = hub_with_pot(&["maya.near", "sam.near"]);
    contribute(&mut hub, &dao, "maya.near", 5 * USD, T0);
    let t1 = T0 + 120_000;
    set_ctx("maya.near", t1, vec![]);
    let _ = hub.propose_close(dao.clone());
    set_ctx("pots.near", t1, vec![ok("\"5000000\"")]);
    let _ = hub.on_close_balance(dao.clone(), acc("maya.near"), U128(10u128.pow(22)));
    set_ctx("pots.near", t1, vec![ok("9")]);
    let pv = vec![PayoutView { account_id: acc("maya.near"), amount: U128(5 * USD) }];
    assert!(hub.on_close_added(dao.clone(), acc("maya.near"), U128(5 * USD), pv, U128(0), acc("maya.near")).ok);
    let approved = || proposal("Approved", r#""maya.near":"Approve","sam.near":"Approve""#, t1);
    // paid, but $5 sent straight to the DAO: the balance reads 5 = rec.balance
    set_ctx("pots.near", t1 + 1_000, vec![approved(), ok("\"5000000\"")]);
    assert_eq!(hub.on_sync(dao.clone(), 9).hub_status, "closing", "first sighting: settling");
    set_ctx("pots.near", t1 + 1_000 * (CLOSE_CONFIRM_BLOCKS - 1), vec![approved(), ok("\"5000000\"")]);
    assert_eq!(hub.on_sync(dao.clone(), 9).hub_status, "closing", "not old enough yet");
    set_ctx("pots.near", t1 + 1_000 * (CLOSE_CONFIRM_BLOCKS + 1), vec![approved(), ok("\"5000000\"")]);
    let s = hub.on_sync(dao.clone(), 9);
    assert_eq!((s.hub_status.as_str(), s.changed), ("closed", true));
    // the $5 left in the Closed Pot: anyone may ask the hub to propose a sweep
    let t2 = t1 + 60_000;
    set_ctx("relayer.near", t2, vec![]);
    let _ = hub.propose_sweep(dao.clone());
    set_ctx("relayer.near", t2, vec![]);
    panics_with(ERR_SWEEP_COOLDOWN, || hub.propose_sweep(dao.clone()));
    set_ctx("pots.near", t2, vec![ok("\"5000000\"")]);
    match hub.on_sweep_balance(dao.clone(), acc("relayer.near"), U128(10u128.pow(22))) {
        PromiseOrValue::Promise(_) => {}
        PromiseOrValue::Value(v) => panic!("{v:?}"),
    }
    set_ctx("pots.near", t2, vec![ok("12")]);
    let pv = vec![PayoutView { account_id: acc("maya.near"), amount: U128(5 * USD) }];
    let o = hub.on_sweep_added(dao.clone(), acc("relayer.near"), U128(5 * USD), pv, U128(0), acc("maya.near"));
    assert_eq!((o.ok, o.proposal_id), (true, Some(12)));
    let sw = hub.get_sweep(dao.clone()).unwrap();
    assert_eq!((sw.proposal_id, sw.balance.0), (Some(12), 5 * USD));
    // members vote on it through the app: the hub vouches for it
    let subj = hub.get_proposal_subject(dao.clone(), 12).unwrap();
    assert_eq!((subj.kind.as_str(), subj.live), ("sweep", true));
    // the next one only tomorrow; an open Pot can't be swept
    set_ctx("relayer.near", t2 + 1_000, vec![]);
    panics_with(ERR_SWEEP_COOLDOWN, || hub.propose_sweep(dao.clone()));
    let (mut hub2, dao2) = hub_with_pot(&["maya.near"]);
    set_ctx("relayer.near", T0, vec![]);
    panics_with(ERR_NOT_CLOSED, || hub2.propose_sweep(dao2.clone()));
}

/// M-1 (audit_a4): an APPROVED link whose escrow payment may still be in flight blocks a close (the
/// close's balance read could miss money the token then returns), as does one with an OK in flight.
#[test]
fn m_1_link_in_transit_blocks_the_close() {
    let (mut hub, dao) = hub_with_pot(&["maya.near", "sam.near", "leo.near"]);
    let group = ["maya.near", "sam.near", "leo.near"];
    for m in group {
        contribute(&mut hub, &dao, m, 100 * USD, T0);
    }
    let pk: PublicKey = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".parse().unwrap();
    set_ctx("maya.near", T0 + 10, vec![]);
    let _ = hub.request_spend(
        dao.clone(),
        U128(250 * USD),
        acc("pots.near"),
        Category::Food,
        "linkref001".into(),
        Some(LinkSpec { claim_pk: pk, expires_at_ms: None }),
    );
    let id = hub.pots.get(&dao).unwrap().request_seq - 1;
    set_ctx("pots.near", T0 + 10, vec![ok("\"300000000\""), ok(r#"{"total":"1","available":"0"}"#), ok(&policy_json(&group))]);
    let _ = hub.on_spend_checked(dao.clone(), id, U128(10u128.pow(22)));
    set_ctx("pots.near", T0 + 10, vec![ok("3")]);
    let _ = hub.on_spend_added(dao.clone(), id);
    let t1 = T0 + 120_000;
    set_ctx("leo.near", t1, vec![]);
    assert_eq!(hub.preview_close(dao.clone(), None).blocked_reason, None, "plain pending: no block");
    // sam's OK in flight → blocks
    set_ctx("sam.near", t1, vec![]);
    let _ = hub.ok_request(dao.clone(), id);
    assert_eq!(hub.preview_close(dao.clone(), None).blocked_reason.as_deref(), Some("links_pending"));
    set_ctx("pots.near", t1, vec![proposal("InProgress", "", T0 + 10), ok(&policy_json(&group))]);
    let _ = hub.on_ok_checked(dao.clone(), id, acc("sam.near"));
    set_ctx("pots.near", t1, vec![proposal("Approved", r#""pots.near":"Approve""#, T0 + 10)]);
    assert!(hub.on_ok_status(dao.clone(), id, acc("sam.near")).ok);
    // approved, the DAO's ft_transfer_call in flight: still blocks
    assert_eq!(hub.get_link(dao.clone(), id).unwrap().status, LinkStatus::AwaitingFunds);
    set_ctx("leo.near", t1 + 1_000, vec![]);
    panics_with(ERR_LINKS_PENDING, || hub.propose_close(dao.clone()));
    // the escrow lands (Pot open) → funded: blocks until claimed or returned, as before
    set_ctx("usdc.near", t1 + 2_000, vec![]);
    match hub.ft_on_transfer(dao.clone(), U128(250 * USD), format!("{{\"link\":{id}}}")) {
        PromiseOrValue::Value(v) => assert_eq!(v, U128(0), "funded"),
        _ => panic!(),
    }
    assert_eq!(hub.get_link(dao.clone(), id).unwrap().status, LinkStatus::Funded);
    set_ctx("leo.near", t1 + 3_000, vec![]);
    panics_with(ERR_LINKS_PENDING, || hub.propose_close(dao.clone()));
    // an OK refused by an objection makes a link plain pending again
    let _ = link_free_pending_roundtrip(&mut hub, &dao, &group);
}

/// A second link: an OK refused by an objection returns it to "plain pending" (no close block).
fn link_free_pending_roundtrip(hub: &mut PotHub, dao: &AccountId, group: &[&str]) -> u32 {
    let pk: PublicKey = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".parse().unwrap();
    set_ctx("leo.near", T0 + 30, vec![]);
    let _ = hub.request_spend(
        dao.clone(),
        U128(20 * USD),
        acc("pots.near"),
        Category::Food,
        "linkref002".into(),
        Some(LinkSpec { claim_pk: pk, expires_at_ms: None }),
    );
    let id = hub.pots.get(dao).unwrap().request_seq - 1;
    // (leo's $20 is instant; force it to a pending vote for this check)
    let mut r = hub.requests.get(&(0, id)).unwrap().clone();
    r.path = Path::Vote;
    r.status = RequestStatus::Pending;
    r.proposal_id = Some(5);
    hub.requests.insert((0, id), r);
    let mut rx = hub.req_ext.get(&(0, id)).unwrap().clone();
    rx.tier = Tier::OneOk;
    hub.req_ext.insert((0, id), rx);
    let before = hub.link_track(0).unwrap().pending;
    set_ctx("sam.near", T0 + 40, vec![]);
    let _ = hub.ok_request(dao.clone(), id);
    assert_eq!(hub.link_track(0).unwrap().pending, before - 1);
    set_ctx("pots.near", T0 + 40, vec![proposal("InProgress", r#""maya.near":"Reject""#, T0 + 30), ok(&policy_json(group))]);
    let _ = hub.on_ok_checked(dao.clone(), id, acc("sam.near"));
    assert_eq!(hub.link_track(0).unwrap().pending, before, "plain pending again");
    id
}

/// L-5: a link funded while a close attempt is still reading the balance (`closing_until_ms`) is
/// accepted: if that attempt then fails, the link isn't lost.
#[test]
fn l_5_link_fundable_during_a_close_attempt() {
    let (mut hub, dao) = hub_with_pot(&["maya.near", "sam.near", "leo.near"]);
    let group = ["maya.near", "sam.near", "leo.near"];
    for m in group {
        contribute(&mut hub, &dao, m, 100 * USD, T0);
    }
    let pk: PublicKey = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp".parse().unwrap();
    set_ctx("maya.near", T0 + 10, vec![]);
    let _ = hub.request_spend(
        dao.clone(),
        U128(250 * USD),
        acc("pots.near"),
        Category::Food,
        "linkref001".into(),
        Some(LinkSpec { claim_pk: pk, expires_at_ms: None }),
    );
    let id = hub.pots.get(&dao).unwrap().request_seq - 1;
    set_ctx("pots.near", T0 + 10, vec![ok("\"300000000\""), ok(r#"{"total":"1","available":"0"}"#), ok(&policy_json(&group))]);
    let _ = hub.on_spend_checked(dao.clone(), id, U128(10u128.pow(22)));
    set_ctx("pots.near", T0 + 10, vec![ok("3")]);
    let _ = hub.on_spend_added(dao.clone(), id);
    let t1 = T0 + 120_000;
    set_ctx("leo.near", t1, vec![]);
    let _ = hub.propose_close(dao.clone()); // the balance read is in flight (closing_until_ms set)
                                            // the group approved the link in the same block: its escrow arrives → accepted
    set_ctx("usdc.near", t1, vec![]);
    match hub.ft_on_transfer(dao.clone(), U128(250 * USD), format!("{{\"link\":{id}}}")) {
        PromiseOrValue::Value(v) => assert_eq!(v, U128(0), "funded"),
        _ => panic!(),
    }
    assert_eq!(hub.get_link(dao.clone(), id).unwrap().status, LinkStatus::Funded);
    // the close attempt fails (balance unavailable): the Pot is open, the link claimable
    set_ctx("pots.near", t1, vec![PromiseResult::Failed]);
    let _ = hub.on_close_balance(dao.clone(), acc("leo.near"), U128(10u128.pow(22)));
    assert_eq!(hub.get_pot(dao.clone()).unwrap().status, "open");
    assert!(hub.get_link(dao.clone(), id).unwrap().claimable);
}

/// M-2: only an unbroken run of `Approved` sightings ages a close: a `Failed` in between (and every
/// retry) restarts the clock, so a provisional read right after a retry can't confirm it.
#[test]
fn m_2_failed_restarts_the_clock() {
    let (mut hub, dao) = hub_with_pot(&["maya.near", "sam.near"]);
    contribute(&mut hub, &dao, "maya.near", 5 * USD, T0);
    let t1 = T0 + 120_000;
    set_ctx("maya.near", t1, vec![]);
    let _ = hub.propose_close(dao.clone());
    set_ctx("pots.near", t1, vec![ok("\"5000000\"")]);
    let _ = hub.on_close_balance(dao.clone(), acc("maya.near"), U128(10u128.pow(22)));
    set_ctx("pots.near", t1, vec![ok("9")]);
    let pv = vec![PayoutView { account_id: acc("maya.near"), amount: U128(5 * USD) }];
    assert!(hub.on_close_added(dao.clone(), acc("maya.near"), U128(5 * USD), pv, U128(0), acc("maya.near")).ok);
    let approved = || proposal("Approved", "", t1);
    set_ctx("pots.near", t1 + 1_000, vec![approved()]); // a provisional read (no balance)
    assert_eq!(hub.on_sync(dao.clone(), 9).hub_status, "closing");
    set_ctx("pots.near", t1 + 3_000, vec![proposal("Failed", "", t1), ok("\"5000000\"")]);
    assert_eq!(hub.on_sync(dao.clone(), 9).hub_status, "closing");
    set_ctx("relayer.near", t1 + 60_000, vec![]);
    let _ = hub.retry_payout(dao.clone(), 9);
    set_ctx("pots.near", t1 + 60_000, vec![approved()]); // the retry's own provisional read
    assert_eq!(hub.on_sync(dao.clone(), 9).hub_status, "closing", "60 blocks after the first sighting, but the clock restarted");
    set_ctx("pots.near", t1 + 60_000 + 1_000 * CLOSE_CONFIRM_BLOCKS, vec![approved(), ok("\"5000000\"")]);
    assert_eq!(hub.on_sync(dao.clone(), 9).hub_status, "closed");
}
