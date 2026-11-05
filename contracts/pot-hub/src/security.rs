//! Hub 1.3.0: fixes for the 2026-11-04 security audit (notes/security-audit-2026-11-04.md; design and
//! upgrade in notes/contracts.md, "Hub 1.3.0 security fixes"). The policy v3 templates live in
//! `policy.rs`; this module holds the new per-Pot / per-member side records and the one-OK rules.
//!
//! State (no migration): like the gift records (`gifts.rs`), every record lives DIRECTLY under a new
//! storage prefix with the key layout a `LookupMap` would use (`prefix ++ borsh(key)`). None is a
//! field of the root struct, so the 1.2.0 state deserializes unchanged and 1.2.0 → 1.3.0 is a plain
//! code deploy. A missing record reads as its default:
//! - `OneOkUsed` (0x0E) `(pot idx, account) → u128`: one-OK spends charged to the member's one-OK
//!   allowance (W4-1 (c)).
//! - `OkCharge` (0x0F) `(pot idx, request id) → u128`: the charge one OK put on that allowance, so it is
//!   released exactly once if the approval doesn't land.
//! - `LinkTrack` (0x10) `pot idx → LinkTrack` + `LinkPending` (0x11) `(pot idx, request id) → ()`: the
//!   Pot's plain pending links, the only open links that don't block a close (W4-5 / M-1).
//! - `CloseSeen` (0x12) `pot idx → CloseSeen`: when `sync` first saw the close `Approved` (M-2).
//! - `Sweep` (0x13) `pot idx → SweepRecord`: the latest sweep of a Closed Pot (M-2).

use near_sdk::json_types::U128;
use near_sdk::{env, AccountId, Promise, PromiseOrValue};

use crate::errors::*;
use crate::events::*;
use crate::events::{payout_views, PayoutView};
use crate::ext::*;
use crate::kinds::*;
use crate::types::*;
use crate::views::CloseOutcome;
#[allow(unused_imports)]
use crate::PotHubExt;
use crate::{bytes_cost, now_ms, prepay_bytes, promise_json, GAS_ADD_CLOSE, GAS_ON_CLOSE_ADDED, GAS_ON_CLOSE_BALANCE, GAS_VIEW};
use crate::{goal_blocks_spends, PotHub};

fn key_of<K: near_sdk::borsh::BorshSerialize>(prefix: StorageKey, k: &K) -> Vec<u8> {
    let mut out = near_sdk::borsh::to_vec(&prefix).expect("storage key");
    out.extend_from_slice(&near_sdk::borsh::to_vec(k).expect("key"));
    out
}

fn read<V: near_sdk::borsh::BorshDeserialize>(key: &[u8]) -> Option<V> {
    env::storage_read(key).and_then(|b| near_sdk::borsh::from_slice::<V>(&b).ok())
}

fn write<V: near_sdk::borsh::BorshSerialize>(key: &[u8], v: &V) {
    env::storage_write(key, &near_sdk::borsh::to_vec(v).expect("value"));
}

pub(crate) fn one_ok_used_key(idx: u32, a: &AccountId) -> Vec<u8> {
    key_of(StorageKey::OneOkUsed, &(idx, a.clone()))
}
pub(crate) fn ok_charge_key(idx: u32, request_id: u32) -> Vec<u8> {
    key_of(StorageKey::OkCharge, &(idx, request_id))
}
pub(crate) fn link_pending_key(idx: u32, request_id: u32) -> Vec<u8> {
    key_of(StorageKey::LinkPending, &(idx, request_id))
}
pub(crate) fn close_seen_key(idx: u32) -> Vec<u8> {
    key_of(StorageKey::CloseSeen, &idx)
}
pub(crate) fn sweep_key(idx: u32) -> Vec<u8> {
    key_of(StorageKey::Sweep, &idx)
}
pub(crate) fn link_track_key(idx: u32) -> Vec<u8> {
    key_of(StorageKey::LinkTrack, &idx)
}

impl PotHub {
    // ------------------------------------------------------------------ W4-1 (c): the one-OK allowance
    //
    // Every one-OK approval is charged to the requester's lifetime one-OK allowance, which equals the
    // Pot's one-OK ceiling (`extras.one_ok_cap`): a member can get at most that much approved with one
    // OK in total; after that the group decides. So two accounts OK-ing each other's requests stop
    // after one ceiling each, instead of looping. It is separate from `member_budget` (instant spends)
    // on purpose: the default ceiling (3 × the instant cap, $300 on Trip) is above the default budget
    // ($200), and "a $300 spend needs one OK" must keep working. Per member, the most that can move
    // without a group vote over the Pot's life is `member_budget + one_ok_cap`.

    /// One-OK spends charged to this member's allowance (lifetime, like `instant_used`).
    pub(crate) fn one_ok_used(&self, idx: u32, a: &AccountId) -> u128 {
        read(&one_ok_used_key(idx, a)).unwrap_or(0)
    }

    /// The charge one OK put on this request (0 = none).
    pub(crate) fn ok_charge(&self, idx: u32, request_id: u32) -> u128 {
        read(&ok_charge_key(idx, request_id)).unwrap_or(0)
    }

    /// The request was paid: its charge stays on the allowance for good, so drop the marker (the
    /// hub stops paying its storage).
    pub(crate) fn settle_one_ok_charge(&mut self, idx: u32, request_id: u32) {
        env::storage_remove(&ok_charge_key(idx, request_id));
    }

    /// Reserves the requester's allowance for one OK in flight (released if it doesn't land).
    pub(crate) fn charge_one_ok(&mut self, idx: u32, req: &Request) {
        let k = ok_charge_key(idx, req.id);
        if env::storage_has_key(&k) {
            return;
        }
        write(&k, &req.amount);
        let used = self.one_ok_used(idx, &req.requester).saturating_add(req.amount);
        write(&one_ok_used_key(idx, &req.requester), &used);
    }

    /// Gives the reserved allowance back (the OK was refused, didn't land, or the request was declined /
    /// expired / withdrawn). Idempotent: a request's charge is released at most once.
    pub(crate) fn release_one_ok(&mut self, idx: u32, req: &Request) {
        let k = ok_charge_key(idx, req.id);
        let Some(charged) = read::<u128>(&k) else {
            return;
        };
        env::storage_remove(&k);
        let used = self.one_ok_used(idx, &req.requester).saturating_sub(charged);
        let uk = one_ok_used_key(idx, &req.requester);
        if used == 0 {
            env::storage_remove(&uk);
        } else {
            write(&uk, &used);
        }
    }

    /// W4-1 (a) / (c): is `amount` still a one-OK spend for this requester right now? `Err(why)`.
    /// Used when the request is made (`decide`) and again when someone gives the OK (the rules, the
    /// requester's one-OK allowance or their stake may have changed since).
    /// `own` = the request being OK'd, whose own earlier charge (an OK whose result was unknown, L-1)
    /// doesn't count against it.
    pub(crate) fn one_ok_rules(
        &self,
        pot: &Pot,
        ext: &PotExt,
        requester: &AccountId,
        m: &Member,
        amount: u128,
        own: Option<u32>,
    ) -> Result<(), &'static str> {
        let cap = ext.extras.one_ok_cap.0;
        if cap == 0 {
            return Err("off");
        }
        if amount > cap {
            return Err("over_one_ok_cap");
        }
        if pot.member_count < 2 {
            return Err("alone");
        }
        if m.contributed < MIN_STAKE {
            return Err("no_stake");
        }
        let used = self.one_ok_used(pot.idx, requester).saturating_sub(own.map(|id| self.ok_charge(pot.idx, id)).unwrap_or(0));
        if used.saturating_add(amount) > cap {
            return Err("one_ok_used_up");
        }
        if goal_blocks_spends(ext) {
            return Err("goal_not_reached");
        }
        Ok(())
    }

    /// W4-1 (b): who may give the one OK. `Err("self" | "not_member" | "receiver" | "joined_after" |
    /// "no_stake")`. The OK-er must be another Active member, not the payee, a member since before
    /// the request was made, and must have added at least `MIN_STAKE` themselves: a fresh sybil
    /// admitted by a leaked invite can't wave a request through.
    pub(crate) fn ok_giver_rules(&self, idx: u32, by: &AccountId, req: &Request) -> Result<(), &'static str> {
        if by == &req.requester {
            return Err("self");
        }
        let Some(m) = self.active_member(idx, by) else {
            return Err("not_member");
        };
        if by == &req.receiver_id {
            return Err("receiver");
        }
        if m.joined_at_ms >= req.created_at_ms {
            return Err("joined_after");
        }
        if m.contributed < MIN_STAKE {
            return Err("no_stake");
        }
        Ok(())
    }

    /// `ok_giver_rules`, panicking with `ERR_OK_SELF` / `ERR_NOT_MEMBER` / `ERR_OK_NOT_ELIGIBLE: <why>`.
    pub(crate) fn check_ok_giver(&self, idx: u32, by: &AccountId, req: &Request) {
        match self.ok_giver_rules(idx, by, req) {
            Ok(()) => {}
            Err("self") => fail(ERR_OK_SELF),
            Err("not_member") => fail(ERR_NOT_MEMBER),
            Err(why) => fail_with(ERR_OK_NOT_ELIGIBLE, why),
        }
    }

    // ------------------------------------------------------------------ W4-5 / M-1: links and the close

    /// The Pot's link tracking record (`None` = not tracked: open links made before hub 1.3.0).
    pub(crate) fn link_track(&self, idx: u32) -> Option<LinkTrack> {
        read(&link_track_key(idx))
    }

    /// Called when a link request is created: starts tracking when no link is open (the count is then
    /// exact), and counts the new link as a plain pending request.
    pub(crate) fn track_new_link(&mut self, idx: u32, request_id: u32, open_before: u32) {
        if self.link_track(idx).is_none() {
            if open_before > 0 {
                return;
            }
            write(&link_track_key(idx), &LinkTrack::default());
        }
        self.mark_link_pending(idx, request_id);
    }

    /// The link request is a plain pending one again (an OK that didn't land, an approval that fell back).
    pub(crate) fn mark_link_pending(&mut self, idx: u32, request_id: u32) {
        let Some(t) = self.link_track(idx) else { return };
        if !self.is_link(idx, request_id) {
            return;
        }
        let k = link_pending_key(idx, request_id);
        if env::storage_has_key(&k) {
            return;
        }
        env::storage_write(&k, &[]);
        write(&link_track_key(idx), &LinkTrack { pending: t.pending.saturating_add(1) });
    }

    /// The link request is no longer plain pending: an OK is in flight, it was approved (its money
    /// may be moving to the escrow), or it ended. Idempotent.
    pub(crate) fn unmark_link_pending(&mut self, idx: u32, request_id: u32) {
        let k = link_pending_key(idx, request_id);
        if !env::storage_remove(&k) {
            return;
        }
        if let Some(t) = self.link_track(idx) {
            write(&link_track_key(idx), &LinkTrack { pending: t.pending.saturating_sub(1) });
        }
    }

    /// Open links that block a close: every open link except plain pending requests (W4-5). An
    /// approved link whose escrow payment may be in flight, or one with an OK in flight, blocks it (M-1):
    /// the close's balance read could miss money that the token then returns to the DAO. Untracked
    /// Pots count every open link (the hub 1.1.0 rule, conservative).
    pub(crate) fn links_blocking_close(&self, idx: u32) -> u32 {
        let open = self.pext(idx).open_links;
        match self.link_track(idx) {
            Some(t) => open.saturating_sub(t.pending),
            None => open,
        }
    }

    // ------------------------------------------------------------------ M-2: confirming a close

    /// Whether a close `sync` sees `Approved` is final: the first sighting is recorded; one at least
    /// `CLOSE_CONFIRM_BLOCKS` later is final (Sputnik's payout callback, the only thing that can still
    /// turn it into `Failed`, has run by then). Money that reaches the DAO afterwards can't hold it.
    pub(crate) fn close_approved_long_enough(&mut self, idx: u32, proposal_id: u64) -> bool {
        let now = env::block_height();
        match read::<CloseSeen>(&close_seen_key(idx)) {
            Some(s) if s.proposal_id == proposal_id => now >= s.block_height.saturating_add(CLOSE_CONFIRM_BLOCKS),
            _ => {
                write(&close_seen_key(idx), &CloseSeen { proposal_id, block_height: now });
                false
            }
        }
    }

    /// Restarts the clock: the close was seen not `Approved` (e.g. `Failed`), or its payout is re-run.
    pub(crate) fn forget_close_seen(&mut self, idx: u32) {
        env::storage_remove(&close_seen_key(idx));
    }

    pub(crate) fn sweep_of(&self, idx: u32) -> Option<SweepRecord> {
        read(&sweep_key(idx))
    }
}

/// Whether `account_id` could give the one OK on a request right now (the "OK it" button).
#[near_sdk::near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct OkCheck {
    pub pot: AccountId,
    pub request_id: u32,
    pub account_id: AccountId,
    pub can_ok: bool,
    /// why not: "not_one_ok" | "not_pending" | "in_flight" | "self" | "not_member" | "receiver" |
    /// "joined_after" | "no_stake" | the requester's side: "off" | "over_one_ok_cap" | "alone" |
    /// "one_ok_used_up" | "goal_not_reached" | "requester_not_member" | "pot_not_open" | "paused"
    pub reason: Option<String>,
}

#[near_sdk::near]
impl PotHub {
    /// Hub 1.3.0 (W4-1): the same checks `ok_request` makes before the hub reads the DAO.
    pub fn get_ok_check(&self, pot: AccountId, request_id: u32, account_id: AccountId) -> Option<OkCheck> {
        let p = self.pots.get(&pot)?;
        let req = self.requests.get(&(p.idx, request_id))?;
        let rx = self.rx(p.idx, req);
        let why: Option<&str> = if self.config.paused {
            Some("paused")
        } else if !Self::is_open(p) {
            Some("pot_not_open")
        } else if rx.tier != Tier::OneOk {
            Some("not_one_ok")
        } else if req.status != RequestStatus::Pending {
            Some("not_pending")
        } else if rx.ok_in_flight {
            Some("in_flight")
        } else if let Err(w) = self.ok_giver_rules(p.idx, &account_id, req) {
            Some(w)
        } else {
            match self.active_member(p.idx, &req.requester) {
                None => Some("requester_not_member"),
                Some(m) => self.one_ok_rules(p, &self.pext(p.idx), &req.requester, &m, req.amount, Some(req.id)).err(),
            }
        };
        Some(OkCheck { pot, request_id, account_id, can_ok: why.is_none(), reason: why.map(|w| w.to_string()) })
    }
}

/// The latest sweep of a Closed Pot (M-2).
#[near_sdk::near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct SweepView {
    pub pot: AccountId,
    pub proposal_id: Option<u64>,
    pub balance: U128,
    pub payouts: Vec<PayoutView>,
    pub created_at_ms: u64,
    /// when the next `propose_sweep` is allowed
    pub next_allowed_ms: u64,
}

pub fn sweep_description(balance: u128, n: usize) -> String {
    format!("Pot sweep: pay out {balance} left after the close to {n} members")
}

#[near_sdk::near]
impl PotHub {
    /// M-2: pays out USDC left in a Closed Pot's DAO (sent straight to it after the close, or a link
    /// payment the token returned late). In a v3 / v4 Pot nobody but the hub can propose anything, so
    /// without this such money would be stuck. Anyone may ask; the hub reads the DAO's whole USDC
    /// balance and proposes paying it out like the close (pro-rata to contributions; equally when
    /// nobody contributed). Members approve it by majority, like a close. One per Pot per day; the
    /// caller pays the proposal's storage unless a relayer signs.
    #[payable]
    pub fn propose_sweep(&mut self, pot: AccountId) -> Promise {
        let by = env::predecessor_account_id();
        let p = self.pot(&pot);
        check(p.status == PotStatus::Closed, ERR_NOT_CLOSED);
        let now = now_ms();
        if let Some(s) = self.sweep_of(p.idx) {
            check(now >= s.created_at_ms.saturating_add(SWEEP_COOLDOWN_MS), ERR_SWEEP_COOLDOWN);
        }
        let (prepay, n) = self.close_prepay_upper_bound(&p);
        let excess = self.charge(self.sponsored(), prepay + bytes_cost(STATE_BYTES_CLOSE_BASE + STATE_BYTES_CLOSE_PER_PAYEE * n as u64));
        self.require_free(prepay, excess);
        Self::refund_excess(excess);
        // reserve the day's slot synchronously (u64::MAX = proposal in flight; removed if it fails)
        write(&sweep_key(p.idx), &SweepRecord { proposal_id: u64::MAX, balance: 0, payouts: vec![], created_at_ms: now });
        ext_ft::ext(self.config.usdc.clone()).with_static_gas(GAS_VIEW).with_unused_gas_weight(0).ft_balance_of(pot.clone()).then(
            Self::ext(Self::me()).with_static_gas(GAS_ON_CLOSE_BALANCE).with_unused_gas_weight(0).on_sweep_balance(pot, by, U128(prepay)),
        )
    }

    #[private]
    pub fn on_sweep_balance(&mut self, pot: AccountId, by: AccountId, prepay: U128) -> PromiseOrValue<CloseOutcome> {
        let balance: Result<U128, ()> = promise_json(0);
        let Some(p) = self.pots.get(&pot).cloned() else { return PromiseOrValue::Value(CloseOutcome::failed("unknown")) };
        let fail_out = |reason: &str| {
            env::storage_remove(&sweep_key(p.idx));
            PromiseOrValue::Value(CloseOutcome::failed(reason))
        };
        let Ok(balance) = balance else { return fail_out("balance_unavailable") };
        let Some(pr) = crate::prorata::close_split(balance.0, &self.contributions(&p), p.last_contributor.as_ref()) else {
            return fail_out("nothing_to_sweep");
        };
        let kind = close_kind(&self.config.usdc, &pr.payouts);
        let desc = sweep_description(balance.0, pr.payouts.len());
        let prepay = prepay.0.max(bytes_cost(prepay_bytes(&desc, &kind, p.member_count)));
        if !self.hub_has_free(prepay) {
            return fail_out("hub_low_balance");
        }
        PromiseOrValue::Promise(Self::propose_batch(&pot, prepay, &desc, &kind, GAS_ADD_CLOSE).then(
            Self::ext(Self::me()).with_static_gas(GAS_ON_CLOSE_ADDED).with_unused_gas_weight(0).on_sweep_added(
                pot,
                by,
                balance,
                payout_views(&pr.payouts),
                U128(pr.dust),
                pr.dust_to,
            ),
        ))
    }

    #[private]
    pub fn on_sweep_added(
        &mut self,
        pot: AccountId,
        by: AccountId,
        balance: U128,
        payouts: Vec<PayoutView>,
        dust: U128,
        dust_to: AccountId,
    ) -> CloseOutcome {
        let pid: Result<u64, ()> = promise_json(0);
        let Some(p) = self.pots.get(&pot).cloned() else { return CloseOutcome::failed("unknown") };
        let Ok(pid) = pid else {
            env::storage_remove(&sweep_key(p.idx));
            return CloseOutcome::failed("add_failed");
        };
        let rec = SweepRecord {
            proposal_id: pid,
            balance: balance.0,
            payouts: payouts.iter().map(|x| (x.account_id.clone(), x.amount.0)).collect(),
            created_at_ms: now_ms(),
        };
        write(&sweep_key(p.idx), &rec);
        PotEvent::SweepProposed { pot: pot.clone(), proposal_id: pid, by, balance, payouts: payouts.clone() }.emit();
        CloseOutcome {
            ok: true,
            proposal_id: Some(pid),
            balance: Some(balance),
            payouts,
            dust: Some(dust),
            dust_to: Some(dust_to),
            approvals_needed: Some(approvals_needed(p.member_count)),
            reason: None,
        }
    }

    pub fn get_sweep(&self, pot: AccountId) -> Option<SweepView> {
        let p = self.pots.get(&pot)?;
        let s = self.sweep_of(p.idx)?;
        Some(SweepView {
            pot,
            proposal_id: (s.proposal_id != u64::MAX).then_some(s.proposal_id),
            balance: U128(s.balance),
            payouts: payout_views(&s.payouts),
            created_at_ms: s.created_at_ms,
            next_allowed_ms: s.created_at_ms.saturating_add(SWEEP_COOLDOWN_MS),
        })
    }
}
