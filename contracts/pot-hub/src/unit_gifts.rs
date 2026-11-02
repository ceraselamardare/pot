//! Hub 1.2.0 gift paths that need exact control of block time and promise results (the sandbox
//! can't pin a forward "in flight" or skip a callback): the in-flight counter blocks the close and
//! the goal refund only while a forward is pending, a lost callback self-heals after 60 s, a failed
//! forward returns the amount, and a gifts-only Pot closes with an equal split.

use super::*;
use near_sdk::test_utils::{get_logs, VMContextBuilder};
use near_sdk::{testing_env, PromiseResult};
use std::panic::{catch_unwind, AssertUnwindSafe};

const T0: u64 = 1_793_000_000_000; // ms

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

fn set_ctx(pred: &str, signer: &str, ms: u64, deposit: u128, results: Vec<PromiseResult>) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(acc("pots.near"))
        .predecessor_account_id(acc(pred))
        .signer_account_id(acc(signer))
        .block_timestamp(ms * 1_000_000)
        .account_balance(NearToken::from_near(100))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .prepaid_gas(Gas::from_tgas(300));
    testing_env!(b.build(), near_sdk::test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(), results);
}

fn panics_with<R>(code: &str, f: impl FnOnce() -> R) {
    let err = match catch_unwind(AssertUnwindSafe(f)) {
        Ok(_) => panic!("expected panic {code}"),
        Err(e) => e,
    };
    let msg = err.downcast_ref::<String>().cloned().or_else(|| err.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or_default();
    assert!(msg.contains(code), "expected {code}, got {msg}");
}

fn hub_with_pot(members: &[&str]) -> (PotHub, AccountId) {
    set_ctx("owner.near", "owner.near", T0, 0, vec![]);
    let mut hub = PotHub::new(
        acc("owner.near"),
        acc("usdc.near"),
        "Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD".parse().unwrap(),
        NearToken::from_millinear(50),
        NearToken::from_millinear(50),
        vec![acc("relayer.near")],
        None,
    );
    set_ctx(members[0], "relayer.near", T0, 0, vec![]);
    let _ = hub.create_pot("trip".into(), "x".into(), Preset::Trip, None, None, None, None, None);
    let dao = acc("trip.pots.near");
    set_ctx("pots.near", "relayer.near", T0, 0, vec![PromiseResult::Successful(vec![])]);
    let rules = Preset::Trip.default_rules().unwrap();
    let _ = hub.on_pot_created(dao.clone(), "trip".into(), "x".into(), None, Preset::Trip, rules, acc(members[0]), None, NearToken::from_millinear(50), true, (T0 / DAY_MS) as u32, None, None);
    let idx = hub.pots.get(&dao).unwrap().idx;
    for (i, m) in members.iter().enumerate().skip(1) {
        hub.members.insert(
            (idx, acc(m)),
            Member { join_index: i as u32, status: MemberStatus::Active, joined_at_ms: T0, invite_pk: None, contributed: 0, instant_used: 0, spent: 0, pending_votes: 0 },
        );
        hub.member_list.insert((idx, i as u32), acc(m));
    }
    let mut p = hub.pots.get(&dao).unwrap().clone();
    p.member_count = members.len() as u32;
    p.next_join_index = members.len() as u32;
    hub.pots.insert(dao.clone(), p);
    (hub, dao)
}

fn gift_msg(dao: &AccountId, r: &str) -> String {
    format!("{{\"pot\":\"{dao}\",\"gift\":\"{r}\"}}")
}

/// ft_on_transfer (the forward is scheduled, not resolved).
fn start_gift(hub: &mut PotHub, dao: &AccountId, from: &str, amount: u128, ms: u64) {
    set_ctx("usdc.near", "relayer.near", ms, 0, vec![]);
    match hub.ft_on_transfer(acc(from), U128(amount), gift_msg(dao, "lnk1")) {
        PromiseOrValue::Promise(_) => {}
        PromiseOrValue::Value(v) => panic!("expected a forward, got value {v:?}"),
    }
}

fn finish_gift(hub: &mut PotHub, dao: &AccountId, from: &str, amount: u128, ms: u64, ok: bool) -> U128 {
    let r = if ok { PromiseResult::Successful(vec![]) } else { PromiseResult::Failed };
    set_ctx("pots.near", "relayer.near", ms, 0, vec![r]);
    hub.on_gift_forwarded(dao.clone(), acc(from), U128(amount), "lnk1".into())
}

#[test]
fn in_flight_blocks_close_until_the_callback_or_60s() {
    let (mut hub, dao) = hub_with_pot(&["maya.near", "sam.near"]);
    // a non-member's gift: in flight
    start_gift(&mut hub, &dao, "stranger.near", 10_000_000, T0);
    assert!(hub.get_gifts(dao.clone()).unwrap().in_flight);
    set_ctx("maya.near", "relayer.near", T0 + 1_000, 0, vec![]);
    panics_with(ERR_GIFT_IN_FLIGHT, || hub.propose_close(dao.clone()));
    assert_eq!(hub.preview_close(dao.clone(), None).blocked_reason.as_deref(), Some("gift_in_flight"));
    // the callback lands: recorded, not in flight, the close may go ahead (gifts > 0, nobody contributed)
    assert_eq!(finish_gift(&mut hub, &dao, "stranger.near", 10_000_000, T0 + 2_000, true), U128(0));
    let logs = get_logs();
    assert!(logs.iter().any(|l| l.contains("\"event\":\"gift_received\"") && l.contains("\"ref\":\"lnk1\"") && l.contains("\"version\":\"1.2.0\"")), "{logs:?}");
    let g = hub.get_gifts(dao.clone()).unwrap();
    assert_eq!((g.total, g.count, g.in_flight), (U128(10_000_000), 1, false));
    let pv = hub.get_pot(dao.clone()).unwrap();
    assert_eq!((pv.total_contributed, pv.balance_estimate, pv.gifts_total, pv.gifts_on), (U128(0), U128(10_000_000), U128(10_000_000), true));
    // gifts never touch member contributions
    assert!(hub.get_members(dao.clone(), None).iter().all(|m| m.contributed == U128(0)));
    let pc = hub.preview_close(dao.clone(), None);
    assert_eq!((pc.can_propose, pc.split.as_str()), (true, "equal"));
    assert_eq!(pc.payouts.iter().map(|x| x.amount.0).collect::<Vec<_>>(), vec![5_000_000, 5_000_000]);
    set_ctx("maya.near", "relayer.near", T0 + 3_000, 0, vec![]);
    let _ = hub.propose_close(dao.clone());
}

/// A lost callback (never ran): the close is blocked for 60 s only, then heals.
#[test]
fn a_lost_callback_self_heals_after_60s() {
    let (mut hub, dao) = hub_with_pot(&["maya.near"]);
    start_gift(&mut hub, &dao, "stranger.near", 2_000_000, T0);
    set_ctx("maya.near", "relayer.near", T0 + GIFT_FLIGHT_MS - 1, 0, vec![]);
    panics_with(ERR_GIFT_IN_FLIGHT, || hub.propose_close(dao.clone()));
    set_ctx("maya.near", "relayer.near", T0 + GIFT_FLIGHT_MS, 0, vec![]);
    assert!(!hub.get_gifts(dao.clone()).unwrap().in_flight);
    // nothing was recorded (the forward never confirmed): no contributions, no gifts → refused for that
    panics_with(ERR_NO_CONTRIBUTIONS, || hub.propose_close(dao.clone()));
    // the next gift after the heal resets the stale counter (1, not 2), and its callback clears it
    start_gift(&mut hub, &dao, "stranger.near", 2_000_000, T0 + GIFT_FLIGHT_MS + 1);
    let idx = hub.pots.get(&dao).unwrap().idx;
    assert_eq!(hub.gifts_of(idx).in_flight, 1);
    finish_gift(&mut hub, &dao, "stranger.near", 2_000_000, T0 + GIFT_FLIGHT_MS + 2, true);
    assert_eq!(hub.gifts_of(idx).in_flight, 0);
}

#[test]
fn failed_forward_returns_the_amount_and_clears_in_flight() {
    let (mut hub, dao) = hub_with_pot(&["maya.near"]);
    start_gift(&mut hub, &dao, "stranger.near", 3_000_000, T0);
    assert_eq!(finish_gift(&mut hub, &dao, "stranger.near", 3_000_000, T0 + 1_000, false), U128(3_000_000));
    assert!(get_logs().iter().all(|l| !l.contains("gift_received")));
    let g = hub.get_gifts(dao.clone()).unwrap();
    assert_eq!((g.total, g.count, g.in_flight), (U128(0), 0, false));
    // an unknown Pot in the callback never panics
    set_ctx("pots.near", "relayer.near", T0, 0, vec![PromiseResult::Failed]);
    assert_eq!(hub.on_gift_forwarded(acc("nope.pots.near"), acc("x.near"), U128(5), "r".into()), U128(5));
}

#[test]
fn refusals() {
    let (mut hub, dao) = hub_with_pot(&["maya.near", "sam.near"]);
    let call = |hub: &mut PotHub, from: &str, amount: u128, msg: String| {
        set_ctx("usdc.near", "relayer.near", T0, 0, vec![]);
        let _ = hub.ft_on_transfer(acc(from), U128(amount), msg);
    };
    panics_with(ERR_GIFT_TOO_SMALL, || call(&mut hub, "x.near", 999_999, gift_msg(&dao, "r1")));
    panics_with(ERR_AMOUNT_TOO_LARGE, || call(&mut hub, "x.near", MAX_AMOUNT + 1, gift_msg(&dao, "r1")));
    panics_with(ERR_GIFT_REF_INVALID, || call(&mut hub, "x.near", 5_000_000, gift_msg(&dao, "has space")));
    panics_with(ERR_GIFT_REF_INVALID, || call(&mut hub, "x.near", 5_000_000, gift_msg(&dao, "")));
    panics_with(ERR_GIFT_SELF, || call(&mut hub, dao.as_str(), 5_000_000, gift_msg(&dao, "r1")));
    panics_with(ERR_BAD_MSG, || call(&mut hub, "x.near", 5_000_000, format!("{{\"pot\":\"{dao}\",\"gift\":\"r\",\"x\":1}}")));
    panics_with(ERR_POT_NOT_FOUND, || call(&mut hub, "x.near", 5_000_000, gift_msg(&acc("nope.pots.near"), "r1")));
    // gifts off (a member) → refused; a non-member can't toggle
    set_ctx("stranger.near", "relayer.near", T0, 0, vec![]);
    panics_with(ERR_NOT_MEMBER, || hub.set_gifts(dao.clone(), false));
    set_ctx("sam.near", "relayer.near", T0, 0, vec![]);
    let v = hub.set_gifts(dao.clone(), false);
    assert_eq!((v.on, v.accepting, v.refusal.as_deref()), (false, false, Some("gifts_off")));
    panics_with(ERR_GIFTS_OFF, || call(&mut hub, "x.near", 5_000_000, gift_msg(&dao, "r1")));
    // a direct (unsponsored) caller pays the record's storage only on its first write
    set_ctx("maya.near", "maya.near", T0, 0, vec![]);
    let v = hub.set_gifts(dao.clone(), true); // the record exists: free
    assert!(v.accepting);
    // paused → refused
    set_ctx("owner.near", "owner.near", T0, 0, vec![]);
    hub.set_config(ConfigPatch { paused: Some(true), ..Default::default() });
    panics_with(ERR_PAUSED, || call(&mut hub, "x.near", 5_000_000, gift_msg(&dao, "r1")));
}

#[test]
fn direct_set_gifts_pays_the_first_write() {
    let (mut hub, dao) = hub_with_pot(&["maya.near"]);
    set_ctx("maya.near", "maya.near", T0, 0, vec![]);
    panics_with(ERR_DEPOSIT_REQUIRED, || hub.set_gifts(dao.clone(), false));
    // turning on what is already on writes nothing and costs nothing
    set_ctx("maya.near", "maya.near", T0, 0, vec![]);
    assert!(hub.set_gifts(dao.clone(), true).on);
    set_ctx("maya.near", "maya.near", T0, bytes_cost(STATE_BYTES_GIFTS), vec![]);
    assert!(!hub.set_gifts(dao.clone(), false).on);
}
