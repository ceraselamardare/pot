//! Wave 4 (hub 1.1.0): earned trust + the one-OK tier, pay by link, the all-or-nothing goal.
//! Design, interface, invariants and the migration: notes/contracts-wave4.md.
//!
//! Conventions are the hub's (contracts-spec §3.0): authorization by `predecessor_account_id`
//! only (a claim is authorized by its ed25519 signature, never by the signer); callbacks are
//! `#[private]`, read results defensively and never panic; static gas, `unused_gas_weight(0)`.

use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::serde_json::json;
use near_sdk::{env, near, AccountId, Gas, NearToken, Promise, PromiseOrValue, PublicKey};

use crate::errors::*;
use crate::events::*;
use crate::ext::*;
use crate::kinds::*;
use crate::types::*;
use crate::{
    bytes_cost, goal_missed, now_ms, pk_string, promise_json, promise_ok, PotHub, GAS_ACT, GAS_ACT_LINK, GAS_FT_TRANSFER,
    GAS_ON_CLOSE_BALANCE, GAS_ON_LINK_DONE, GAS_ON_OK_CHECKED, GAS_ON_OK_CHECKED_LINK, GAS_ON_STATUS, GAS_STORAGE_DEPOSIT,
    GAS_VIEW, GAS_VIEW_DAO,
};
#[allow(unused_imports)]
use crate::PotHubExt;

// ---------------------------------------------------------------------------------------------
// Wire shapes
// ---------------------------------------------------------------------------------------------

/// `request_spend(…, link)`: pay whoever holds the claim link. The secret key lives only in the
/// link's `#fragment`; the hub stores the public key.
#[near(serializers = [json])]
#[derive(Clone, Debug)]
#[serde(deny_unknown_fields)]
pub struct LinkSpec {
    pub claim_pk: PublicKey,
    /// default now + 14 days; allowed (now + 60 s, now + 30 days]
    #[serde(default)]
    pub expires_at_ms: Option<u64>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct OkOutcome {
    pub request_id: u32,
    pub ok: bool,
    /// a request status ("approved", "payout_failed", "pending", …) or "unknown"
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reason: Option<String>,
}

impl OkOutcome {
    fn no(request_id: u32, status: &str, reason: &str) -> Self {
        Self { request_id, ok: false, status: status.into(), reason: Some(reason.into()) }
    }
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct LinkOutcome {
    pub request_id: u32,
    pub ok: bool,
    pub status: LinkStatus,
    pub receiver_id: Option<AccountId>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reason: Option<String>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct TrustView {
    pub pot: AccountId,
    pub account_id: AccountId,
    /// the Pot's `extras.trust`
    pub enabled: bool,
    pub level: u8,
    pub max_level: u8,
    /// qualifying settled spends since the last level change / decline
    pub streak: u8,
    /// qualifying spends per level
    pub step: u8,
    /// qualifying spends still needed for the next level (0 at the top level or with trust off)
    pub next_level_in: u8,
    /// a settled spend counts toward a level only if it is ≥ this (base cap / 10)
    pub min_qualifying: U128,
    pub settled: u32,
    pub settled_amount: U128,
    pub declined: u32,
    pub last_declined_ms: Option<u64>,
    pub base_cap: U128,
    /// 1 + level with trust on, else 1
    pub multiplier: u8,
    /// base_cap × multiplier
    pub effective_cap: U128,
    pub budget_left: U128,
    /// what this member can spend instantly in one go right now: min(effective_cap, budget_left)
    pub instant_up_to: U128,
    pub one_ok_cap: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct GoalView {
    pub pot: AccountId,
    pub amount: U128,
    pub deadline_ms: u64,
    pub all_or_nothing: bool,
    pub total_contributed: U128,
    /// hub 1.2.0: gifts received (they count toward a normal goal, not an all-or-nothing one)
    pub gifts_total: U128,
    /// hub 1.2.0: what counts toward the goal (contributions + gifts for a normal goal)
    pub progress: U128,
    /// "collecting" | "reached" | "missed" | "refundable" | "refunding" | "refunded"
    pub state: String,
    pub reached_at_ms: Option<u64>,
    pub refund_proposal_id: Option<u64>,
    /// `refund_unfunded` would do something now (propose, approve or retry the refund close)
    pub can_refund: bool,
    /// why spends are blocked, if they are ("goal_not_reached")
    pub spends_blocked: bool,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct LinkView {
    pub pot: AccountId,
    pub request_id: u32,
    pub requester: AccountId,
    pub amount: U128,
    pub category: Category,
    pub request_status: RequestStatus,
    pub status: LinkStatus,
    pub claim_pk: String,
    pub expires_at_ms: u64,
    pub receiver_id: Option<AccountId>,
    pub funded_at_ms: Option<u64>,
    pub done_at_ms: Option<u64>,
    /// Funded and not expired (a valid signature still needed)
    pub claimable: bool,
}

/// One row of the public Pot record (who spent what, approved how and by whom, money status).
#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct RecordEntry {
    pub request_id: u32,
    pub proposal_id: Option<u64>,
    pub requester: AccountId,
    /// the payee; for a link, the claimer once claimed (else null)
    pub payee: Option<AccountId>,
    pub link: bool,
    pub amount: U128,
    pub category: Category,
    pub request_ref: String,
    /// "instant" | "one_ok" | "group"
    pub tier: Tier,
    /// how it was approved: "rules" (the hub alone) | "one_ok" | "group" | null (not approved)
    pub approved_by: Option<String>,
    /// the member whose OK approved it (one-OK)
    pub ok_by: Option<AccountId>,
    pub status: RequestStatus,
    /// "paid" | "held_for_link" | "awaiting_funds" | "returned" | "processing" | "awaiting_approval"
    /// | "failed" | "declined" | "expired" | "withdrawn" | "void"
    pub money: String,
    pub link_status: Option<LinkStatus>,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
}

// ---------------------------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------------------------

impl PotHub {
    /// `Err(code)` when the extras are invalid for these rules. `cur` = (pot, its current ext) for a
    /// rules change; None at creation (the creation picks the policy version).
    pub(crate) fn validate_extras(&self, rules: &Rules, x: &RuleExtras, cur: Option<(&Pot, &PotExt)>) -> Result<(), &'static str> {
        let one_ok = x.one_ok_cap.0;
        if one_ok > MAX_AMOUNT || (one_ok > 0 && one_ok < rules.instant_cap.0) {
            return Err(ERR_EXTRAS_INVALID);
        }
        if cur.is_some_and(|(_, e)| e.extras.goal == x.goal) {
            return Ok(()); // the goal is unchanged
        }
        let now = now_ms();
        if let Some((_, e)) = cur {
            // a missed all-or-nothing goal is locked: it can only be refunded
            if goal_missed(e, now) || e.refund_proposal.is_some() && e.goal_reached_at_ms == 0 {
                return Err(ERR_GOAL_LOCKED);
            }
        }
        if let Some(g) = &x.goal {
            if g.amount.0 == 0 || g.amount.0 > MAX_AMOUNT || g.deadline_ms <= now + MIN_GOAL_LEAD_MS || g.deadline_ms > now + MAX_GOAL_LEAD_MS {
                return Err(ERR_GOAL_INVALID);
            }
            if g.all_or_nothing && cur.is_some_and(|(_, e)| e.policy_v < POLICY_V2) {
                return Err(ERR_GOAL_UNSUPPORTED);
            }
        }
        Ok(())
    }

    /// What counts toward the goal: contributions, plus gifts for a normal goal (hub 1.2.0). An
    /// all-or-nothing goal counts contributions only (its promise is "your contribution back"; gifts
    /// are refused while it collects).
    pub(crate) fn goal_progress(&self, p: &Pot, g: &Goal) -> u128 {
        if g.all_or_nothing {
            p.total_contributed
        } else {
            p.total_contributed.saturating_add(self.gifts_of(p.idx).total)
        }
    }

    /// Marks the goal reached once its progress ≥ amount (an all-or-nothing goal only before its
    /// deadline). Never un-reaches.
    pub(crate) fn check_goal_reached(&mut self, dao: &AccountId, p: &Pot) {
        let mut e = self.pext(p.idx);
        let Some(g) = e.extras.goal.clone() else { return };
        let now = now_ms();
        let progress = self.goal_progress(p, &g);
        if e.goal_reached_at_ms == 0 && progress >= g.amount.0 && (!g.all_or_nothing || now < g.deadline_ms) {
            e.goal_reached_at_ms = now;
            self.pot_ext.insert(p.idx, e);
            PotEvent::GoalReached { pot: dao.clone(), goal: g, total: U128(progress) }.emit();
        }
    }

    /// "none" | "collecting" | "reached" | "missed" | "refundable" | "refunding" | "refunded"
    pub(crate) fn goal_state(&self, p: &Pot) -> &'static str {
        let e = self.pext(p.idx);
        let Some(g) = &e.extras.goal else { return "none" };
        match (&p.status, e.refund_proposal) {
            (PotStatus::Closing { proposal_id }, Some(r)) if *proposal_id == r => return "refunding",
            (PotStatus::Closed, Some(r)) if self.closes.get(&p.idx).and_then(|c| c.proposal_id) == Some(r) => return "refunded",
            _ => {}
        }
        if e.goal_reached_at_ms > 0 {
            "reached"
        } else if now_ms() < g.deadline_ms {
            "collecting"
        } else if g.all_or_nothing && p.status != PotStatus::Closed && e.policy_v >= POLICY_V2 {
            "refundable"
        } else {
            "missed"
        }
    }

    /// `ft_on_transfer` from the token with `msg = {"link":id}`: the DAO paying a link into escrow.
    /// Returns the UNUSED amount (the token refunds it to the DAO); never panics.
    pub(crate) fn fund_link(&mut self, dao: &AccountId, request_id: u32, amount: U128) -> U128 {
        let Some(p) = self.pots.get(dao).cloned() else { return amount };
        let key = (p.idx, request_id);
        let (Some(req), Some(mut rx)) = (self.requests.get(&key).cloned(), self.req_ext.get(&key).cloned()) else { return amount };
        let Some(mut link) = rx.link.clone() else { return amount };
        if link.status != LinkStatus::AwaitingFunds || req.amount != amount.0 || req.receiver_id != Self::me() {
            return amount;
        }
        link.status = LinkStatus::Funded;
        link.funded_at_ms = now_ms();
        let expires = link.expires_at_ms;
        rx.link = Some(link);
        self.req_ext.insert(key, rx);
        PotEvent::LinkFunded { pot: dao.clone(), request_id, amount, expires_at_ms: expires }.emit();
        self.save_pot(dao, p);
        U128(0)
    }

    fn link_parts(&self, pot: &AccountId, request_id: u32) -> Option<(Pot, Request, RequestExt, Link)> {
        let p = self.pots.get(pot).cloned()?;
        let req = self.requests.get(&(p.idx, request_id)).cloned()?;
        let rx = self.req_ext.get(&(p.idx, request_id)).cloned()?;
        let link = rx.link.clone()?;
        Some((p, req, rx, link))
    }

    fn put_link(&mut self, idx: u32, request_id: u32, mut rx: RequestExt, link: Link) {
        rx.link = Some(link);
        self.req_ext.insert((idx, request_id), rx);
    }

    /// A link left the open set (claimed / returned).
    fn close_link(&mut self, idx: u32, returned: u128) {
        let mut e = self.pext(idx);
        e.open_links = e.open_links.saturating_sub(1);
        e.links_returned = e.links_returned.saturating_add(returned);
        self.pot_ext.insert(idx, e);
    }

    fn link_outcome(request_id: u32, link: &Link, ok: bool, reason: Option<&str>) -> LinkOutcome {
        LinkOutcome { request_id, ok, status: link.status, receiver_id: link.receiver.clone(), reason: reason.map(|r| r.into()) }
    }

    fn trust_view(&self, pot: &AccountId, p: &Pot, e: &PotExt, a: &AccountId, m: &Member) -> TrustView {
        let t = self.trust_of(p.idx, a);
        let base = p.rules.instant_cap.0;
        let mult = if e.extras.trust { 1 + t.level } else { 1 };
        let eff = self.effective_cap(p, e, a);
        let left = p.rules.member_budget.0.saturating_sub(m.instant_used);
        TrustView {
            pot: pot.clone(),
            account_id: a.clone(),
            enabled: e.extras.trust,
            level: t.level,
            max_level: TRUST_MAX_LEVEL,
            streak: t.streak,
            step: TRUST_STEP,
            next_level_in: if e.extras.trust && t.level < TRUST_MAX_LEVEL { TRUST_STEP.saturating_sub(t.streak) } else { 0 },
            min_qualifying: U128(base.div_ceil(TRUST_MIN_SPEND_DIV)),
            settled: t.settled,
            settled_amount: U128(t.settled_amount),
            declined: t.declined,
            last_declined_ms: if t.last_declined_ms > 0 { Some(t.last_declined_ms) } else { None },
            base_cap: U128(base),
            multiplier: mult,
            effective_cap: U128(eff),
            budget_left: U128(left),
            instant_up_to: U128(eff.min(left)),
            one_ok_cap: e.extras.one_ok_cap,
        }
    }
}

fn money_of(r: &Request, rx: &RequestExt) -> &'static str {
    use RequestStatus::*;
    match (r.status, rx.link.as_ref().map(|l| l.status)) {
        (_, Some(LinkStatus::Claimed)) => "paid",
        (_, Some(LinkStatus::Returned)) => "returned",
        (_, Some(LinkStatus::Void)) => "void",
        (_, Some(LinkStatus::Funded | LinkStatus::Claiming | LinkStatus::Returning)) => "held_for_link",
        (Approved, Some(LinkStatus::AwaitingFunds)) => "awaiting_funds",
        (Approved, None) => "paid",
        (Checking | Proposing | Approving, _) => "processing",
        (Pending, _) => "awaiting_approval",
        (PayoutFailed, _) => "failed",
        (Rejected, _) => "declined",
        (Expired, _) => "expired",
        (Removed, _) => "withdrawn",
    }
}

// ---------------------------------------------------------------------------------------------
// Public methods
// ---------------------------------------------------------------------------------------------

#[near]
impl PotHub {
    // ------------------------------------------------------------------ one-OK tier

    /// Another active member OKs a one-OK request; the hub then approves it as rulebot. Refused if
    /// any member already voted Reject in the DAO (an objection means a majority decides).
    pub fn ok_request(&mut self, pot: AccountId, request_id: u32) -> Promise {
        let by = env::predecessor_account_id();
        let p = self.pot(&pot);
        check(!self.config.paused, ERR_PAUSED);
        check(Self::is_open(&p), ERR_POT_NOT_OPEN);
        check(self.active_member(p.idx, &by).is_some(), ERR_NOT_MEMBER);
        let req = self.requests.get(&(p.idx, request_id)).cloned().unwrap_or_else(|| fail(ERR_NOT_PENDING));
        let mut rx = self.rx(p.idx, &req);
        check(rx.tier == Tier::OneOk, ERR_NOT_ONE_OK);
        check(req.status == RequestStatus::Pending, ERR_NOT_PENDING);
        check(by != req.requester, ERR_OK_SELF);
        check(!rx.ok_in_flight, ERR_OK_IN_FLIGHT);
        let pid = req.proposal_id.unwrap_or_else(|| fail(ERR_NOT_PENDING));
        let link = rx.link.is_some();
        rx.ok_in_flight = true;
        rx.ok_by = Some(by.clone());
        self.req_ext.insert((p.idx, request_id), rx);
        self.save_pot(&pot, p);
        ext_dao::ext(pot.clone())
            .with_static_gas(GAS_VIEW_DAO)
            .with_unused_gas_weight(0)
            .get_proposal(pid)
            .and(ext_dao::ext(pot.clone()).with_static_gas(GAS_VIEW_DAO).with_unused_gas_weight(0).get_policy())
            .then(
                Self::ext(Self::me())
                    .with_static_gas(if link { GAS_ON_OK_CHECKED_LINK } else { GAS_ON_OK_CHECKED })
                    .with_unused_gas_weight(0)
                    .on_ok_checked(pot, request_id, by),
            )
    }

    #[private]
    pub fn on_ok_checked(&mut self, pot: AccountId, request_id: u32, by: AccountId) -> PromiseOrValue<OkOutcome> {
        let prop: Result<DaoProposalLite, ()> = promise_json(0);
        let policy: Result<DaoPolicyLite, ()> = promise_json(1);
        let Some(p) = self.pots.get(&pot).cloned() else { return PromiseOrValue::Value(OkOutcome::no(request_id, "unknown", "unknown")) };
        let Some(req) = self.requests.get(&(p.idx, request_id)).cloned() else {
            return PromiseOrValue::Value(OkOutcome::no(request_id, "unknown", "unknown"));
        };
        let mut rx = self.rx(p.idx, &req);
        if !rx.ok_in_flight || rx.ok_by.as_ref() != Some(&by) {
            return PromiseOrValue::Value(OkOutcome::no(request_id, status_str(req.status), "stale"));
        }
        let reason = match (&prop, &policy) {
            (Err(_), _) | (_, Err(_)) => Some("dao_unavailable"),
            (Ok(prop), Ok(policy)) => {
                let group = policy.group(ROLE_MEMBER);
                if req.status != RequestStatus::Pending {
                    Some("not_pending")
                } else if prop.status != "InProgress" || crate::dao_status_expired(prop) {
                    Some("not_open")
                } else if prop.votes.values().any(|v| v == "Reject") {
                    Some("objection")
                } else if !group.contains(&by) || !group.contains(&req.requester) {
                    Some("not_in_dao_group")
                } else if !Self::is_open(&p) {
                    Some("pot_not_open")
                } else {
                    None
                }
            }
        };
        if let Some(r) = reason {
            rx.ok_in_flight = false;
            rx.ok_by = None;
            self.req_ext.insert((p.idx, request_id), rx);
            self.save_pot(&pot, p);
            return PromiseOrValue::Value(OkOutcome::no(request_id, status_str(req.status), r));
        }
        let is_link = rx.link.is_some();
        let kind = self.kind_for(&req, is_link);
        let pid = req.proposal_id.unwrap_or_default();
        // INV-03 (amended): the id comes from hub state (`on_spend_added` stored our own
        // add_proposal result), never from the caller, and the kind is rebuilt (ERR_WRONG_KIND guard).
        PromiseOrValue::Promise(
            ext_dao::ext(pot.clone())
                .with_static_gas(if is_link { GAS_ACT_LINK } else { GAS_ACT })
                .with_unused_gas_weight(0)
                .act_proposal(pid, DaoAction::VoteApprove, kind, Some("auto: one member OK".to_string()))
                .then(ext_dao::ext(pot.clone()).with_static_gas(GAS_VIEW_DAO).with_unused_gas_weight(0).get_proposal(pid))
                .then(
                    Self::ext(Self::me())
                        .with_static_gas(GAS_ON_STATUS)
                        .with_unused_gas_weight(0)
                        .on_ok_status(pot, request_id, by),
                ),
        )
    }

    #[private]
    pub fn on_ok_status(&mut self, pot: AccountId, request_id: u32, by: AccountId) -> OkOutcome {
        let prop: Result<DaoProposalLite, ()> = promise_json(0);
        let Some(mut p) = self.pots.get(&pot).cloned() else { return OkOutcome::no(request_id, "unknown", "unknown") };
        let Some(mut req) = self.requests.get(&(p.idx, request_id)).cloned() else {
            return OkOutcome::no(request_id, "unknown", "unknown");
        };
        let mut rx = self.rx(p.idx, &req);
        rx.ok_in_flight = false;
        let pid = req.proposal_id.unwrap_or_default();
        let Ok(prop) = prop else {
            // unknown: keep ok_by (sync settles the status from the DAO)
            self.req_ext.insert((p.idx, request_id), rx);
            self.save_pot(&pot, p);
            return OkOutcome::no(request_id, status_str(req.status), "dao_unavailable");
        };
        let path = req.path;
        let target = match prop.status.as_str() {
            "Approved" => RequestStatus::Approved,
            "Failed" => RequestStatus::PayoutFailed,
            "Rejected" => RequestStatus::Rejected,
            "InProgress" if !crate::dao_status_expired(&prop) => RequestStatus::Pending,
            "InProgress" | "Expired" => RequestStatus::Expired,
            _ => RequestStatus::Removed,
        };
        let voted = prop.votes.get(&Self::me()).is_some_and(|v| v == "Approve");
        if !voted {
            rx.ok_by = None; // our vote didn't land
        }
        // write the ext BEFORE the transition: the transition may mark it `counted` (trust)
        self.req_ext.insert((p.idx, request_id), rx);
        if req.status != target {
            self.transition(&mut p, &mut req, Some((path, target)));
        }
        let ok = voted && matches!(target, RequestStatus::Approved | RequestStatus::PayoutFailed);
        if ok {
            PotEvent::SpendOkApproved {
                pot: pot.clone(),
                request_id,
                proposal_id: pid,
                requester: req.requester.clone(),
                by,
                amount: U128(req.amount),
            }
            .emit();
        }
        if target == RequestStatus::PayoutFailed {
            PotEvent::SpendPayoutFailed { pot: pot.clone(), request_id, proposal_id: pid, stage: "payout".into(), dao_status: prop.status.clone() }
                .emit();
        }
        self.save_pot(&pot, p);
        OkOutcome {
            request_id,
            ok,
            status: status_str(target).into(),
            reason: if ok { None } else { Some("approve_failed".into()) },
        }
    }

    // ------------------------------------------------------------------ pay by link

    /// Pays a Funded link to `receiver_id`. Authorized by the ed25519 signature of the link key over
    /// `pot-claim:v1:<hub>:<pot>:<request_id>:<receiver_id>`, never by the caller (works through a
    /// NEP-366 delegate from a brand-new 0-NEAR account, or relayer-signed). The hub registers the
    /// receiver on the token (≤ 0.00125 NEAR, refunded by the token if already registered); a direct
    /// unsponsored caller attaches it.
    #[payable]
    pub fn claim_link(&mut self, pot: AccountId, request_id: u32, receiver_id: AccountId, signature: Base64VecU8) -> Promise {
        check(!self.config.paused, ERR_PAUSED);
        let Some((p, req, rx, mut link)) = self.link_parts(&pot, request_id) else { fail(ERR_LINK_NOT_FOUND) };
        match link.status {
            LinkStatus::Funded => {}
            LinkStatus::AwaitingFunds => fail(ERR_LINK_NOT_FUNDED),
            LinkStatus::Claiming | LinkStatus::Returning => fail(ERR_LINK_BUSY),
            _ => fail(ERR_LINK_DONE),
        }
        check(now_ms() < link.expires_at_ms, ERR_LINK_EXPIRED);
        let hub = Self::me();
        check(
            receiver_id != hub && receiver_id != pot && receiver_id != self.config.usdc && !self.pots.contains_key(&receiver_id),
            ERR_BAD_RECEIVER,
        );
        let sig: [u8; 64] = signature.0.as_slice().try_into().unwrap_or_else(|_| fail(ERR_BAD_SIGNATURE));
        let msg = format!("{CLAIM_DOMAIN}:{hub}:{pot}:{request_id}:{receiver_id}");
        check(env::ed25519_verify(&sig, msg.as_bytes(), &link.pk), ERR_BAD_SIGNATURE);
        let excess = self.charge(self.sponsored(), USDC_STORAGE_DEPOSIT + bytes_cost(STATE_BYTES_CLAIM));
        self.require_free(USDC_STORAGE_DEPOSIT + 1, excess);
        Self::refund_excess(excess);
        link.status = LinkStatus::Claiming;
        link.receiver = Some(receiver_id.clone());
        self.put_link(p.idx, request_id, rx, link);
        self.save_pot(&pot, p);
        // one receipt: if ft_transfer fails, the registration is reverted and the deposit refunded
        let register = json!({ "account_id": receiver_id, "registration_only": true }).to_string().into_bytes();
        let transfer = json!({ "receiver_id": receiver_id, "amount": U128(req.amount), "memo": LINK_MEMO }).to_string().into_bytes();
        Promise::new(self.config.usdc.clone())
            .function_call("storage_deposit", register, NearToken::from_yoctonear(USDC_STORAGE_DEPOSIT), GAS_STORAGE_DEPOSIT)
            .function_call("ft_transfer", transfer, NearToken::from_yoctonear(1), GAS_FT_TRANSFER)
            .then(Self::ext(hub).with_static_gas(GAS_ON_LINK_DONE).with_unused_gas_weight(0).on_link_claimed(pot, request_id))
    }

    #[private]
    pub fn on_link_claimed(&mut self, pot: AccountId, request_id: u32) -> LinkOutcome {
        let ok = promise_ok(0);
        let Some((p, req, rx, mut link)) = self.link_parts(&pot, request_id) else {
            return LinkOutcome { request_id, ok: false, status: LinkStatus::Void, receiver_id: None, reason: Some("unknown".into()) };
        };
        if link.status != LinkStatus::Claiming {
            return Self::link_outcome(request_id, &link, false, Some("stale"));
        }
        if !ok {
            link.status = LinkStatus::Funded;
            link.receiver = None;
            let out = Self::link_outcome(request_id, &link, false, Some("transfer_failed"));
            self.put_link(p.idx, request_id, rx, link);
            self.save_pot(&pot, p);
            return out;
        }
        link.status = LinkStatus::Claimed;
        link.done_at_ms = now_ms();
        let receiver = link.receiver.clone().unwrap_or_else(Self::me);
        let out = Self::link_outcome(request_id, &link, true, None);
        self.put_link(p.idx, request_id, rx, link);
        self.close_link(p.idx, 0);
        self.trust_settle(&p, &req); // a link counts as settled when it is claimed
        PotEvent::LinkClaimed { pot: pot.clone(), request_id, receiver_id: receiver, amount: U128(req.amount) }.emit();
        self.save_pot(&pot, p);
        out
    }

    /// Sends an unclaimed link's money back to the Pot. The requester may do it any time (cancel);
    /// anyone may after expiry. An approved link whose escrow payment never arrived (the DAO kept
    /// the money) is just closed.
    pub fn reclaim_link(&mut self, pot: AccountId, request_id: u32) -> PromiseOrValue<LinkOutcome> {
        let by = env::predecessor_account_id();
        let Some((p, req, rx, mut link)) = self.link_parts(&pot, request_id) else { fail(ERR_LINK_NOT_FOUND) };
        let now = now_ms();
        let expired = now >= link.expires_at_ms;
        let requester = by == req.requester;
        match link.status {
            LinkStatus::Funded => {
                check(expired || requester, ERR_LINK_NOT_EXPIRED);
                link.status = LinkStatus::Returning;
                self.put_link(p.idx, request_id, rx, link);
                self.save_pot(&pot, p);
                PromiseOrValue::Promise(
                    ext_ft::ext(self.config.usdc.clone())
                        .with_attached_deposit(NearToken::from_yoctonear(1))
                        .with_static_gas(GAS_FT_TRANSFER)
                        .with_unused_gas_weight(0)
                        .ft_transfer(pot.clone(), U128(req.amount), Some(LINK_RETURN_MEMO.to_string()))
                        .then(
                            Self::ext(Self::me())
                                .with_static_gas(GAS_ON_LINK_DONE)
                                .with_unused_gas_weight(0)
                                .on_link_returned(pot, request_id, by),
                        ),
                )
            }
            LinkStatus::AwaitingFunds if req.status == RequestStatus::Approved => {
                // approved, but the escrow payment bounced: the money never left the DAO
                check(expired || (requester && now >= req.updated_at_ms + LINK_SETTLE_MS), ERR_LINK_NOT_EXPIRED);
                link.status = LinkStatus::Returned;
                link.done_at_ms = now;
                let out = Self::link_outcome(request_id, &link, true, None);
                self.put_link(p.idx, request_id, rx, link);
                self.close_link(p.idx, req.amount);
                PotEvent::LinkReturned { pot: pot.clone(), request_id, amount: U128(req.amount), by, moved: false }.emit();
                self.save_pot(&pot, p);
                PromiseOrValue::Value(out)
            }
            LinkStatus::AwaitingFunds => fail(ERR_LINK_NOT_FINAL),
            LinkStatus::Claiming | LinkStatus::Returning => fail(ERR_LINK_BUSY),
            _ => fail(ERR_LINK_DONE),
        }
    }

    #[private]
    pub fn on_link_returned(&mut self, pot: AccountId, request_id: u32, by: AccountId) -> LinkOutcome {
        let ok = promise_ok(0);
        let Some((p, req, rx, mut link)) = self.link_parts(&pot, request_id) else {
            return LinkOutcome { request_id, ok: false, status: LinkStatus::Void, receiver_id: None, reason: Some("unknown".into()) };
        };
        if link.status != LinkStatus::Returning {
            return Self::link_outcome(request_id, &link, false, Some("stale"));
        }
        if !ok {
            link.status = LinkStatus::Funded;
            let out = Self::link_outcome(request_id, &link, false, Some("transfer_failed"));
            self.put_link(p.idx, request_id, rx, link);
            self.save_pot(&pot, p);
            return out;
        }
        link.status = LinkStatus::Returned;
        link.done_at_ms = now_ms();
        let out = Self::link_outcome(request_id, &link, true, None);
        self.put_link(p.idx, request_id, rx, link);
        self.close_link(p.idx, req.amount);
        PotEvent::LinkReturned { pot: pot.clone(), request_id, amount: U128(req.amount), by, moved: true }.emit();
        self.save_pot(&pot, p);
        out
    }

    // ------------------------------------------------------------------ all-or-nothing goal

    /// Permissionless (our cron). For a missed all-or-nothing goal: phase 1 (Pot Open) proposes the
    /// pro-rata refund close as the hub (the `propose_close` chain); phase 2 (that close pending, or
    /// Failed) approves / finalizes it as rulebot, then maps the result like `sync`. Call it twice.
    #[payable]
    pub fn refund_unfunded(&mut self, pot: AccountId) -> Promise {
        let mut p = self.pot(&pot);
        let e = self.pext(p.idx);
        check(e.extras.goal.as_ref().is_some_and(|g| g.all_or_nothing), ERR_NO_GOAL);
        let now = now_ms();
        check(goal_missed(&e, now), ERR_GOAL_NOT_MISSED);
        check(e.policy_v >= POLICY_V2, ERR_GOAL_UNSUPPORTED);
        match p.status.clone() {
            PotStatus::Open => {
                check(p.closing_until_ms <= now, ERR_CLOSE_IN_PROGRESS);
                let (prepay, n) = self.close_prepay_upper_bound(&p);
                let state = bytes_cost(STATE_BYTES_CLOSE_BASE + STATE_BYTES_CLOSE_PER_PAYEE * n as u64);
                let excess = self.charge(self.sponsored(), prepay + state);
                check(p.busy_until_ms <= now, ERR_POT_BUSY);
                check(p.unpaid_approved == 0 && p.reserved == 0, ERR_PAYOUTS_PENDING);
                check(e.open_links == 0, ERR_LINKS_PENDING);
                check(!self.gifts_of(p.idx).in_flight_at(now), ERR_GIFT_IN_FLIGHT);
                check(p.total_contributed > 0, ERR_NO_CONTRIBUTIONS);
                self.require_free(prepay, excess);
                Self::refund_excess(excess);
                p.closing_until_ms = now + CLOSING_WINDOW_MS;
                self.save_pot(&pot, p);
                ext_ft::ext(self.config.usdc.clone())
                    .with_static_gas(GAS_VIEW)
                    .with_unused_gas_weight(0)
                    .ft_balance_of(pot.clone())
                    .then(
                        Self::ext(Self::me())
                            .with_static_gas(GAS_ON_CLOSE_BALANCE)
                            .with_unused_gas_weight(0)
                            .on_close_balance(pot, Self::me(), U128(prepay)),
                    )
            }
            PotStatus::Closing { proposal_id } if e.refund_proposal == Some(proposal_id) => {
                let rec = self
                    .closes
                    .get(&p.idx)
                    .cloned()
                    .filter(|r| r.proposal_id == Some(proposal_id))
                    .unwrap_or_else(|| fail(ERR_CLOSE_IN_PROGRESS));
                let action = match rec.status {
                    CloseStatus::Pending => DaoAction::VoteApprove,
                    CloseStatus::Failed => DaoAction::Finalize,
                    _ => fail(ERR_CLOSE_IN_PROGRESS),
                };
                let kind = close_kind(&self.config.usdc, &rec.payouts);
                // the executing vote pays every ft_transfer (5 Tgas each): ≈ 15 + 6·n (CALIBRATION §4)
                let gas = Gas::from_tgas((20 + 6 * rec.payouts.len() as u64).min(265));
                ext_dao::ext(pot.clone())
                    .with_static_gas(gas)
                    .with_unused_gas_weight(0)
                    .act_proposal(proposal_id, action, kind, Some("auto: goal missed, refund everyone".to_string()))
                    .then(ext_dao::ext(pot.clone()).with_static_gas(GAS_VIEW_DAO).with_unused_gas_weight(0).get_proposal(proposal_id))
                    .then(Self::ext(Self::me()).with_static_gas(GAS_ON_STATUS).with_unused_gas_weight(0).on_sync(pot, proposal_id))
            }
            PotStatus::Closing { .. } => fail(ERR_CLOSE_IN_PROGRESS),
            PotStatus::Closed => fail(ERR_POT_NOT_OPEN),
        }
    }

    // ------------------------------------------------------------------ views

    pub fn get_trust(&self, pot: AccountId, account_id: AccountId) -> Option<TrustView> {
        let p = self.pots.get(&pot)?;
        let m = self.members.get(&(p.idx, account_id.clone()))?;
        Some(self.trust_view(&pot, p, &self.pext(p.idx), &account_id, m))
    }

    /// Every member's trust, in join order (≤ 40).
    pub fn get_trusts(&self, pot: AccountId) -> Vec<TrustView> {
        let Some(p) = self.pots.get(&pot) else { return vec![] };
        let e = self.pext(p.idx);
        (0..p.next_join_index)
            .filter_map(|i| {
                let a = self.member_list.get(&(p.idx, i))?;
                let m = self.members.get(&(p.idx, a.clone()))?;
                (m.status == MemberStatus::Active).then(|| self.trust_view(&pot, p, &e, a, m))
            })
            .collect()
    }

    pub fn get_goal(&self, pot: AccountId) -> Option<GoalView> {
        let p = self.pots.get(&pot)?;
        let e = self.pext(p.idx);
        let g = e.extras.goal.clone()?;
        let state = self.goal_state(p);
        let can_refund = match state {
            "refundable" => {
                p.status == PotStatus::Open
                    && p.unpaid_approved == 0
                    && p.reserved == 0
                    && e.open_links == 0
                    && p.total_contributed > 0
                    && !self.gifts_of(p.idx).in_flight_at(now_ms())
            }
            "refunding" => self.closes.get(&p.idx).is_some_and(|r| matches!(r.status, CloseStatus::Pending | CloseStatus::Failed)),
            _ => false,
        };
        Some(GoalView {
            pot: pot.clone(),
            amount: g.amount,
            deadline_ms: g.deadline_ms,
            all_or_nothing: g.all_or_nothing,
            total_contributed: U128(p.total_contributed),
            gifts_total: U128(self.gifts_of(p.idx).total),
            progress: U128(self.goal_progress(p, &g)),
            state: state.into(),
            reached_at_ms: if e.goal_reached_at_ms > 0 { Some(e.goal_reached_at_ms) } else { None },
            refund_proposal_id: e.refund_proposal,
            can_refund,
            spends_blocked: crate::goal_blocks_spends(&e),
        })
    }

    /// The claim page's view: everything public about a link (never the secret).
    pub fn get_link(&self, pot: AccountId, request_id: u32) -> Option<LinkView> {
        let (_, req, _, link) = self.link_parts(&pot, request_id)?;
        Some(LinkView {
            pot: pot.clone(),
            request_id,
            requester: req.requester.clone(),
            amount: U128(req.amount),
            category: req.category,
            request_status: req.status,
            status: link.status,
            claim_pk: pk_string(&link.pk),
            expires_at_ms: link.expires_at_ms,
            receiver_id: link.receiver.clone(),
            funded_at_ms: if link.funded_at_ms > 0 { Some(link.funded_at_ms) } else { None },
            done_at_ms: if link.done_at_ms > 0 { Some(link.done_at_ms) } else { None },
            claimable: link.status == LinkStatus::Funded && now_ms() < link.expires_at_ms,
        })
    }

    /// The public Pot record: ids ascending (refused ids are gaps), `limit` ≤ 50.
    pub fn get_record(&self, pot: AccountId, from_index: u32, limit: u32) -> Vec<RecordEntry> {
        let Some(p) = self.pots.get(&pot) else { return vec![] };
        let end = from_index.saturating_add(limit.min(50)).min(p.request_seq);
        (from_index..end)
            .filter_map(|i| {
                let r = self.requests.get(&(p.idx, i))?;
                let rx = self.rx(p.idx, r);
                let approved = matches!(r.status, RequestStatus::Approved | RequestStatus::PayoutFailed);
                let approved_by = approved.then(|| {
                    match (rx.tier, &rx.ok_by, r.path) {
                        (_, _, Path::Instant) => "rules",
                        (Tier::OneOk, Some(_), _) => "one_ok",
                        _ => "group",
                    }
                    .to_string()
                });
                let link = rx.link.as_ref();
                Some(RecordEntry {
                    request_id: r.id,
                    proposal_id: r.proposal_id,
                    requester: r.requester.clone(),
                    payee: match link {
                        Some(l) => l.receiver.clone().filter(|_| l.status == LinkStatus::Claimed),
                        None => Some(r.receiver_id.clone()),
                    },
                    link: link.is_some(),
                    amount: U128(r.amount),
                    category: r.category,
                    request_ref: r.request_ref.clone(),
                    tier: rx.tier,
                    approved_by,
                    ok_by: if approved { rx.ok_by.clone() } else { None },
                    status: r.status,
                    money: money_of(r, &rx).into(),
                    link_status: link.map(|l| l.status),
                    created_at_ms: r.created_at_ms,
                    updated_at_ms: r.updated_at_ms,
                })
            })
            .collect()
    }
}
