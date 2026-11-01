//! Contract-level unit tests for the time-dependent paths the sandbox can't reach: its
//! `fast_forward` advances ≈ 0.3 s of block time per block, so 7 days ≈ 2M blocks.
//! - T-90: the creator and global sponsored caps reset at UTC midnight.
//! - T-92: the 24 h close cooldown ends.
//! - T-97 / L-3: `sync` expires an InProgress proposal by the DAO's `submission_time`, and a late
//!   `Approved` moves `expired` → `approved` (the DAO is the source of truth).

use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, PromiseResult};
use std::panic::{catch_unwind, AssertUnwindSafe};

const DAY: u64 = 86_400_000;
const T0: u64 = 1_793_000_000_000; // ms

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn hub_id() -> AccountId {
    acc("pots.near")
}

fn set_ctx(pred: &str, signer: &str, ms: u64, deposit: u128, results: Vec<PromiseResult>) {
    let mut b = VMContextBuilder::new();
    b.current_account_id(hub_id())
        .predecessor_account_id(acc(pred))
        .signer_account_id(acc(signer))
        .block_timestamp(ms * 1_000_000)
        .account_balance(NearToken::from_near(100))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .prepaid_gas(Gas::from_tgas(300));
    testing_env!(b.build(), near_sdk::test_vm_config(), near_sdk::RuntimeFeesConfig::test(), Default::default(), results);
}

fn new_hub(limits: Option<Limits>) -> PotHub {
    set_ctx("owner.near", "owner.near", T0, 0, vec![]);
    PotHub::new(
        acc("owner.near"),
        acc("usdc.near"),
        "Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD".parse().unwrap(),
        NearToken::from_millinear(50),
        NearToken::from_millinear(50),
        vec![acc("relayer.near")],
        limits,
    )
}

fn panics_with<R>(code: &str, f: impl FnOnce() -> R) {
    let r = catch_unwind(AssertUnwindSafe(f));
    let err = match r {
        Ok(_) => panic!("expected panic {code}"),
        Err(e) => e,
    };
    let msg = err.downcast_ref::<String>().cloned().or_else(|| err.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or_default();
    assert!(msg.contains(code), "expected {code}, got {msg}");
}

fn create(hub: &mut PotHub, creator: &str, slug: &str, ms: u64) {
    set_ctx(creator, "relayer.near", ms, 0, vec![]);
    let _ = hub.create_pot(slug.into(), "x".into(), Preset::Trip, None, None, None, None);
}

/// Creates and confirms a Pot (create_pot + on_pot_created Ok).
fn make_pot(hub: &mut PotHub, creator: &str, slug: &str, ms: u64) -> AccountId {
    create(hub, creator, slug, ms);
    let dao = acc(&format!("{slug}.pots.near"));
    set_ctx("pots.near", "relayer.near", ms, 0, vec![PromiseResult::Successful(vec![])]);
    let rules = Preset::Trip.default_rules().unwrap();
    let _ = hub.on_pot_created(dao.clone(), slug.into(), "x".into(), None, Preset::Trip, rules, acc(creator), None, NearToken::from_millinear(50), true, (ms / DAY) as u32);
    dao
}

fn contribute(hub: &mut PotHub, dao: &AccountId, who: &str, amount: u128, ms: u64) {
    set_ctx("usdc.near", "relayer.near", ms, 0, vec![]);
    let _ = hub.ft_on_transfer(acc(who), U128(amount), format!("{{\"pot\":\"{dao}\"}}"));
    set_ctx("pots.near", "relayer.near", ms, 0, vec![PromiseResult::Successful(vec![])]);
    assert_eq!(hub.on_contribution_forwarded(dao.clone(), acc(who), U128(amount)), U128(0));
}

/// T-90: both creation caps reset at UTC midnight.
#[test]
fn creation_caps_reset_at_utc_midnight() {
    let mut limits = Limits::default();
    limits.max_sponsored_pots_per_day = 4;
    let mut hub = new_hub(Some(limits));
    let day_start = (T0 / DAY + 1) * DAY; // 00:00 UTC
    let late = day_start + DAY - 1_000; // 23:59:59
    for i in 0..3 {
        create(&mut hub, "maya.near", &format!("m{i}"), late);
    }
    panics_with(ERR_CREATOR_DAILY_LIMIT, || create(&mut hub, "maya.near", "m3", late));
    create(&mut hub, "sam.near", "s0", late);
    panics_with(ERR_GLOBAL_DAILY_LIMIT, || create(&mut hub, "leo.near", "l0", late));
    // one second later it is a new UTC day
    let next = day_start + DAY;
    create(&mut hub, "maya.near", "m3", next);
    create(&mut hub, "leo.near", "l0", next);
    assert_eq!(hub.sponsored_today, DailyCount { day: (next / DAY) as u32, count: 2 });
}

/// T-92: the same member can't re-propose a close for 24 h after their close was Rejected;
/// another member can; the first member can after 24 h.
#[test]
fn close_cooldown_ends_after_24h() {
    let mut hub = new_hub(None);
    let dao = make_pot(&mut hub, "maya.near", "trip", T0);
    let idx = hub.pots.get(&dao).unwrap().idx;
    // a second member, added directly (joins are covered in the sandbox)
    hub.members.insert(
        (idx, acc("sam.near")),
        Member { join_index: 1, status: MemberStatus::Active, joined_at_ms: T0, invite_pk: None, contributed: 0, instant_used: 0, spent: 0, pending_votes: 0 },
    );
    hub.member_list.insert((idx, 1), acc("sam.near"));
    let mut p = hub.pots.get(&dao).unwrap().clone();
    p.member_count = 2;
    p.next_join_index = 2;
    hub.pots.insert(dao.clone(), p);
    contribute(&mut hub, &dao, "maya.near", 100, T0);
    let t1 = T0 + 120_000; // past the busy window
    set_ctx("maya.near", "relayer.near", t1, 0, vec![]);
    let _ = hub.propose_close(dao.clone());
    set_ctx("pots.near", "relayer.near", t1, 0, vec![PromiseResult::Successful(b"\"100\"".to_vec())]);
    let _ = hub.on_close_balance(dao.clone(), acc("maya.near"), U128(10u128.pow(22)));
    set_ctx("pots.near", "relayer.near", t1, 0, vec![PromiseResult::Successful(b"7".to_vec())]);
    let out = hub.on_close_added(dao.clone(), acc("maya.near"), U128(100), vec![PayoutView { account_id: acc("maya.near"), amount: U128(100) }], U128(0), acc("maya.near"));
    assert!(out.ok);
    assert_eq!(hub.pots.get(&dao).unwrap().status, PotStatus::Closing { proposal_id: 7 });
    // the group rejects it → sync → Open, record Rejected
    let rejected = format!("{{\"status\":\"Rejected\",\"votes\":{{}},\"submission_time\":\"{}\"}}", t1 * 1_000_000);
    set_ctx("pots.near", "relayer.near", t1 + 1_000, 0, vec![PromiseResult::Successful(rejected.into_bytes())]);
    let s = hub.on_sync(dao.clone(), 7);
    assert_eq!((s.hub_status.as_str(), s.changed), ("open", true));
    // within 24 h: Maya refused, Sam allowed
    set_ctx("maya.near", "relayer.near", t1 + 3_600_000, 0, vec![]);
    panics_with(ERR_CLOSE_COOLDOWN, || hub.propose_close(dao.clone()));
    set_ctx("sam.near", "relayer.near", t1 + 3_600_000, 0, vec![]);
    let _ = hub.propose_close(dao.clone());
    // (reset Sam's in-flight close chain for the next check)
    let mut p = hub.pots.get(&dao).unwrap().clone();
    p.closing_until_ms = 0;
    hub.pots.insert(dao.clone(), p);
    // after 24 h: Maya allowed
    set_ctx("maya.near", "relayer.near", t1 + CLOSE_COOLDOWN_MS + 1, 0, vec![]);
    let _ = hub.propose_close(dao.clone());
}

/// T-97 / L-3: expiry by the DAO's submission_time (not the hub's created_at_ms); a late
/// Approved moves `expired` → `approved`.
#[test]
fn sync_expiry_uses_dao_submission_time() {
    let mut hub = new_hub(None);
    let dao = make_pot(&mut hub, "maya.near", "boat", T0);
    // a vote-path request (over cap)
    set_ctx("maya.near", "relayer.near", T0, 0, vec![]);
    let _ = hub.request_spend(dao.clone(), U128(300_000_000), acc("maya.near"), Category::Tickets, "abcdefgh1".into());
    let policy = br#"{"roles":[{"name":"member","kind":{"Group":["maya.near"]}},{"name":"rulebot","kind":{"Group":["pots.near"]}}]}"#;
    set_ctx(
        "pots.near",
        "relayer.near",
        T0,
        0,
        vec![
            PromiseResult::Successful(b"\"500000000\"".to_vec()),
            PromiseResult::Successful(br#"{"total":"1250000000000000000000","available":"0"}"#.to_vec()),
            PromiseResult::Successful(policy.to_vec()),
        ],
    );
    let _ = hub.on_spend_checked(dao.clone(), 0, U128(10u128.pow(22)));
    set_ctx("pots.near", "relayer.near", T0, 0, vec![PromiseResult::Successful(b"3".to_vec())]);
    match hub.on_spend_added(dao.clone(), 0) {
        PromiseOrValue::Value(o) => assert_eq!(o.status, "pending"),
        _ => panic!("vote path returns a value"),
    }
    // the DAO's submission_time is 2 s after the hub's created_at_ms
    let submitted_ns = (T0 + 2_000) * 1_000_000;
    let in_progress = format!("{{\"status\":\"InProgress\",\"votes\":{{}},\"submission_time\":\"{submitted_ns}\"}}");
    // created + 7 d + 1 s, but submission + 7 d not reached → no change
    set_ctx("pots.near", "relayer.near", T0 + 7 * DAY + 1_000, 0, vec![PromiseResult::Successful(in_progress.clone().into_bytes())]);
    let s = hub.on_sync(dao.clone(), 3);
    assert_eq!((s.hub_status.as_str(), s.changed), ("pending", false));
    // submission + 7 d + 1 ms → expired
    set_ctx("pots.near", "relayer.near", T0 + 2_000 + 7 * DAY + 1, 0, vec![PromiseResult::Successful(in_progress.into_bytes())]);
    let s = hub.on_sync(dao.clone(), 3);
    assert_eq!((s.dao_status.as_str(), s.hub_status.as_str(), s.changed), ("Expired", "expired", true));
    let p = hub.pots.get(&dao).unwrap().clone();
    assert_eq!(p.open_requests, 0);
    // the DAO later reports Approved (e.g. its period was lengthened): the DAO is the truth
    let approved = format!("{{\"status\":\"Approved\",\"votes\":{{}},\"submission_time\":\"{submitted_ns}\"}}");
    set_ctx("pots.near", "relayer.near", T0 + 8 * DAY, 0, vec![PromiseResult::Successful(approved.into_bytes())]);
    let s = hub.on_sync(dao.clone(), 3);
    assert_eq!((s.hub_status.as_str(), s.changed), ("approved", true));
    let p = hub.pots.get(&dao).unwrap().clone();
    assert_eq!(p.spent_vote, 300_000_000);
    assert_eq!(p.open_requests, 0);
    // garbage from the DAO never panics a callback (INV-07)
    set_ctx("pots.near", "relayer.near", T0 + 8 * DAY, 0, vec![PromiseResult::Successful(b"not json".to_vec())]);
    let s = hub.on_sync(dao.clone(), 3);
    assert!(!s.changed);
    set_ctx("pots.near", "relayer.near", T0 + 8 * DAY, 0, vec![PromiseResult::Failed]);
    assert!(!hub.on_sync(dao, 3).changed);
}
