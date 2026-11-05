//! Views and outcome shapes (contracts-spec §4). Every view is a bounded read: O(1),
//! O(members ≤ 40) or O(limit ≤ 50). Views never change state (T-87).

use near_sdk::json_types::U128;
use near_sdk::{near, AccountId, NearToken, PublicKey};

use crate::events::PayoutView;
use crate::types::*;
#[allow(unused_imports)]
use crate::PotHubExt;
use crate::{free_balance, now_ms, pk_bytes, pk_string, pot_status_str, prorata, subject_kind, PotHub};

// ---------------------------------------------------------------------------------------------
// Outcomes (final values of the change methods' promise chains)
// ---------------------------------------------------------------------------------------------

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct CreatePotOutcome {
    pub ok: bool,
    pub pot: AccountId,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub slug: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub float: Option<NearToken>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub usdc_registered: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reason: Option<String>,
}
impl CreatePotOutcome {
    pub fn created(pot: AccountId, slug: String, float: NearToken, registered: bool) -> Self {
        Self { ok: true, pot, slug: Some(slug), float: Some(float), usdc_registered: Some(registered), reason: None }
    }
    pub fn failed(pot: AccountId, reason: &str) -> Self {
        Self { ok: false, pot, slug: None, float: None, usdc_registered: None, reason: Some(reason.into()) }
    }
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct SpendOutcome {
    /// wave 4: "instant" | "one_ok" | "group"
    pub tier: Tier,
    /// wave 4: a pay-by-link request (receiver = the hub's escrow)
    pub link: bool,
    pub request_id: u32,
    pub proposal_id: Option<u64>,
    pub path: Path,
    pub reason: Reason,
    /// "approved" | "pending" | "approving" | "rejected" | "payout_failed" | "expired" | "removed" | "refused"
    pub status: String,
    /// payee_not_registered | insufficient_balance | not_in_dao_group | dao_unavailable | add_failed | hub_low_balance | pot_not_open
    pub refusal: Option<String>,
    pub approvals_needed: u32,
}
impl SpendOutcome {
    pub fn unknown(request_id: u32) -> Self {
        Self {
            tier: Tier::Group,
            link: false,
            request_id,
            proposal_id: None,
            path: Path::Vote,
            reason: Reason::WithinRules,
            status: "refused".into(),
            refusal: Some("unknown_request".into()),
            approvals_needed: 0,
        }
    }
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct SyncOutcome {
    pub proposal_id: u64,
    pub subject: String,
    pub dao_status: String,
    pub hub_status: String,
    pub changed: bool,
}
impl SyncOutcome {
    pub fn unchanged(proposal_id: u64, subject: &str, dao_status: &str, hub_status: &str) -> Self {
        Self { proposal_id, subject: subject.into(), dao_status: dao_status.into(), hub_status: hub_status.into(), changed: false }
    }
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct RetryOutcome {
    pub proposal_id: u64,
    pub retried: bool,
    pub dao_status: String,
    pub hub_status: String,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct JoinOutcome {
    pub ok: bool,
    /// "active" | "pending" | "failed"
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub proposal_id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reason: Option<String>,
}
impl JoinOutcome {
    pub fn failed(reason: &str) -> Self {
        Self { ok: false, status: "failed".into(), proposal_id: None, reason: Some(reason.into()) }
    }
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct RulesOutcome {
    pub applied: bool,
    pub proposal_id: Option<u64>,
    pub rules_version: u32,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reason: Option<String>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct CloseOutcome {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub proposal_id: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub balance: Option<U128>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub payouts: Vec<PayoutView>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub dust: Option<U128>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub dust_to: Option<AccountId>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub approvals_needed: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub reason: Option<String>,
}
impl CloseOutcome {
    pub fn failed(reason: &str) -> Self {
        Self {
            ok: false,
            proposal_id: None,
            balance: None,
            payouts: vec![],
            dust: None,
            dust_to: None,
            approvals_needed: None,
            reason: Some(reason.into()),
        }
    }
}

// ---------------------------------------------------------------------------------------------
// View shapes
// ---------------------------------------------------------------------------------------------

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct ConfigView {
    pub version: String,
    pub owner: AccountId,
    pub usdc: AccountId,
    pub dao_code_hash: String,
    pub dao_float: NearToken,
    pub min_dao_float: NearToken,
    pub relayers: Vec<AccountId>,
    pub limits: Limits,
    pub paused: bool,
    pub pot_count: u32,
    pub sponsored_today: u32,
    pub free_balance: NearToken,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct PotView {
    pub pot: AccountId,
    pub slug: String,
    pub name: String,
    pub emoji: Option<String>,
    pub preset: Preset,
    pub seq: u64,
    pub rules: Rules,
    pub rules_version: u32,
    /// "open" | "closing" | "closed"
    pub status: String,
    pub close_proposal_id: Option<u64>,
    pub creator: AccountId,
    pub created_at_ms: u64,
    pub closed_at_ms: Option<u64>,
    pub member_count: u32,
    pub joining_count: u32,
    pub approvals_needed: u32,
    pub proposal_period_ms: u64,
    pub total_contributed: U128,
    pub spent_instant: U128,
    pub spent_vote: U128,
    pub reserved: U128,
    pub balance_estimate: U128,
    pub last_contributor: Option<AccountId>,
    pub request_count: u32,
    pub open_requests: u32,
    pub active_invites: u32,
    pub unpaid_approved: u32,
    pub float: NearToken,
    pub usdc: AccountId,
    /// The hub-created rules proposal still open (≤ 1 per Pot), if any.
    pub open_rules_proposal: Option<u64>,
    /// True while a `propose_close` chain is in flight (money in is blocked).
    pub closing_in_flight: bool,
    /// wave 4: trust / one-OK / links / goal (all off for Pots created before hub 1.1.0)
    pub extras: RuleExtras,
    /// 1 = v1 policy; 2 = the rulebot can also approve the goal-refund close; hub 1.3.0: 3 = members
    /// only vote (every proposal is the hub's); 4 = 3 + the goal-refund approval
    pub policy_version: u8,
    /// hub 1.3.0 (HUB-4): the close was approved but the money isn't confirmed out of the Pot yet
    /// (status stays "closing" until a `sync` sees it left)
    pub close_settling: bool,
    /// wave 4: link requests not yet claimed / returned / void (they block closing)
    pub open_links: u32,
    /// wave 4: "none" | "collecting" | "reached" | "missed" | "refundable" | "refunding" | "refunded"
    pub goal_state: String,
    /// hub 1.2.0: gifts are on (default for every Pot; any member can turn them off)
    pub gifts_on: bool,
    /// hub 1.2.0: Σ gifts received (included in `balance_estimate`, never in `total_contributed`)
    pub gifts_total: U128,
    pub gifts_count: u32,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct PotSummary {
    pub pot: AccountId,
    pub slug: String,
    pub name: String,
    pub emoji: Option<String>,
    pub preset: Preset,
    pub status: String,
    pub seq: u64,
    pub member_count: u32,
    pub total_contributed: U128,
    pub balance_estimate: U128,
    pub contributed: U128,
    pub created_at_ms: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct MemberView {
    pub account_id: AccountId,
    pub join_index: u32,
    /// "active" | "joining"
    pub status: String,
    pub joined_at_ms: u64,
    pub contributed: U128,
    pub spent: U128,
    pub instant_used: U128,
    pub budget_left: U128,
    /// hub 1.3.0 (W4-1): one-OK spends approved for this member so far (lifetime)
    pub one_ok_used: U128,
    /// hub 1.3.0 (W4-1): how much more this member can get approved with one OK (one-OK ceiling − used)
    pub one_ok_left: U128,
    pub would_get_back: U128,
    pub share_of_spending: U128,
    pub is_last_contributor: bool,
    /// "argument" | "ledger" | "close_record"
    pub balance_source: String,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct RulesView {
    pub pot: AccountId,
    pub preset: Preset,
    pub rules: Rules,
    pub rules_version: u32,
    pub member_count: u32,
    pub approvals_needed: u32,
    pub proposal_period_ms: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct SpendPreview {
    /// "instant" | "vote" | "blocked"
    pub path: String,
    pub reason: String,
    pub approvals_needed: u32,
    pub member_count: u32,
    pub instant_cap: U128,
    pub member_budget: U128,
    pub budget_used: U128,
    pub budget_left: U128,
    pub balance_checked: Option<U128>,
    pub client_must_check: Vec<String>,
    /// wave 4: "instant" | "one_ok" | "group" (empty when blocked)
    pub tier: String,
    /// wave 4: the requester's instant cap after earned trust (before the budget)
    pub effective_cap: U128,
    pub trust_level: u8,
    pub one_ok_cap: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct ClosePayoutView {
    pub account_id: AccountId,
    pub contributed: U128,
    pub amount: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct ClosePreview {
    pub pot: AccountId,
    pub balance: U128,
    pub balance_source: String,
    pub total_contributed: U128,
    /// hub 1.2.0: gifts received (part of the balance; shared pro-rata, or equally when nobody contributed)
    pub gifts_total: U128,
    /// hub 1.2.0: "prorata" | "equal" (nobody contributed: a gifts-only Pot)
    pub split: String,
    pub approvals_needed: u32,
    pub open_requests: u32,
    pub payouts: Vec<ClosePayoutView>,
    pub dust: U128,
    pub dust_to: Option<AccountId>,
    pub can_propose: bool,
    pub blocked_reason: Option<String>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct RequestView {
    pub request_id: u32,
    pub pot: AccountId,
    pub requester: AccountId,
    pub receiver_id: AccountId,
    pub amount: U128,
    pub category: Category,
    pub request_ref: String,
    pub path: Path,
    pub reason: Reason,
    pub status: RequestStatus,
    pub proposal_id: Option<u64>,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
    pub expires_at_ms: u64,
    /// wave 4: "instant" | "one_ok" | "group"
    pub tier: Tier,
    /// wave 4: who gave the one-OK (also while it is being processed)
    pub ok_by: Option<AccountId>,
    /// wave 4: the link status for pay-by-link requests
    pub link_status: Option<LinkStatus>,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct InviteView {
    pub pot: AccountId,
    pub invite_pk: String,
    pub created_by: AccountId,
    pub created_at_ms: u64,
    pub expires_at_ms: u64,
    pub max_uses: u32,
    pub uses: u32,
    pub revoked: bool,
    /// "active" | "expired" | "used_up" | "revoked"
    pub status: String,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct SubjectView {
    pub pot: AccountId,
    pub proposal_id: u64,
    /// "spend" | "join" | "close" | "rules" | "sweep" (hub 1.3.0)
    pub kind: String,
    pub request_id: Option<u32>,
    pub member: Option<AccountId>,
    pub rules_version: Option<u32>,
    pub live: bool,
}

pub(crate) fn invite_view(pot: &AccountId, pk: &[u8; 32], inv: &Invite) -> InviteView {
    let status = if inv.revoked_at_ms.is_some() {
        "revoked"
    } else if now_ms() >= inv.expires_at_ms {
        "expired"
    } else if inv.uses >= inv.max_uses {
        "used_up"
    } else {
        "active"
    };
    InviteView {
        pot: pot.clone(),
        invite_pk: pk_string(pk),
        created_by: inv.created_by.clone(),
        created_at_ms: inv.created_at_ms,
        expires_at_ms: inv.expires_at_ms,
        max_uses: inv.max_uses,
        uses: inv.uses,
        revoked: inv.revoked_at_ms.is_some(),
        status: status.into(),
    }
}

/// `total_contributed − spent_instant − spent_vote` (saturating); 0 once the Pot is Closed (the
/// close paid the whole balance out). USDC sent straight to the DAO is not counted.
fn balance_estimate(p: &Pot) -> u128 {
    if p.status == PotStatus::Closed {
        return 0;
    }
    p.total_contributed.saturating_sub(p.spent_instant).saturating_sub(p.spent_vote)
}

pub(crate) fn request_view(pot: &AccountId, r: &Request, rx: &RequestExt) -> RequestView {
    RequestView {
        tier: rx.tier,
        ok_by: rx.ok_by.clone(),
        link_status: rx.link.as_ref().map(|l| l.status),
        request_id: r.id,
        pot: pot.clone(),
        requester: r.requester.clone(),
        receiver_id: r.receiver_id.clone(),
        amount: U128(r.amount),
        category: r.category,
        request_ref: r.request_ref.clone(),
        path: r.path,
        reason: r.reason,
        status: r.status,
        proposal_id: r.proposal_id,
        created_at_ms: r.created_at_ms,
        updated_at_ms: r.updated_at_ms,
        expires_at_ms: r.created_at_ms + PROPOSAL_PERIOD_MS,
    }
}

impl PotHub {
    /// The ledger estimate plus USDC that unclaimed links returned to the Pot (wave 4) plus the
    /// gifts it received (hub 1.2.0).
    pub(crate) fn balance_est(&self, p: &Pot) -> u128 {
        if p.status == PotStatus::Closed {
            return 0;
        }
        balance_estimate(p).saturating_add(self.pext(p.idx).links_returned).saturating_add(self.gifts_of(p.idx).total)
    }

    /// The close record whose payouts are authoritative (Closing / Closed).
    fn live_close_record(&self, p: &Pot) -> Option<CloseRecord> {
        match p.status {
            PotStatus::Open => None,
            _ => self.closes.get(&p.idx).cloned(),
        }
    }

    /// Why `propose_close` would refuse right now (None = it would proceed to the balance read).
    fn close_blocked(&self, p: &Pot) -> Option<&'static str> {
        let rec = self.closes.get(&p.idx);
        match p.status {
            PotStatus::Closed => return Some("pot_not_open"),
            PotStatus::Closing { .. } if rec.map(|r| r.status) != Some(CloseStatus::Failed) => {
                return Some("close_in_progress")
            }
            _ => {}
        }
        let now = now_ms();
        if p.closing_until_ms > now {
            return Some("close_in_progress");
        }
        if p.busy_until_ms > now {
            return Some("busy");
        }
        if p.unpaid_approved > 0 || p.reserved > 0 {
            return Some("payouts_pending");
        }
        // W4-5: only links holding escrowed money block a close
        if self.links_blocking_close(p.idx) > 0 {
            return Some("links_pending");
        }
        let gifts = self.gifts_of(p.idx);
        if gifts.in_flight_at(now) {
            return Some("gift_in_flight");
        }
        if p.total_contributed == 0 && gifts.total == 0 {
            return Some("no_contributions");
        }
        None
    }
}

#[near]
impl PotHub {
    pub fn get_config(&self) -> ConfigView {
        ConfigView {
            version: VERSION.to_string(),
            owner: self.config.owner.clone(),
            usdc: self.config.usdc.clone(),
            dao_code_hash: String::from(&self.config.dao_code_hash),
            dao_float: self.config.dao_float,
            min_dao_float: self.config.min_dao_float,
            relayers: self.config.relayers.clone(),
            limits: self.config.limits.clone(),
            paused: self.config.paused,
            pot_count: self.pot_count,
            sponsored_today: self.sponsored_today.count_on(crate::today()),
            free_balance: NearToken::from_yoctonear(free_balance()),
        }
    }

    pub fn get_pot(&self, pot: AccountId) -> Option<PotView> {
        let p = self.pots.get(&pot)?;
        Some(PotView {
            pot: pot.clone(),
            slug: p.slug.clone(),
            name: p.name.clone(),
            emoji: p.emoji.clone(),
            preset: p.preset,
            seq: p.seq,
            rules: p.rules.clone(),
            rules_version: p.rules_version,
            status: pot_status_str(&p.status).into(),
            close_proposal_id: match p.status {
                PotStatus::Closing { proposal_id } => Some(proposal_id),
                PotStatus::Closed => self.closes.get(&p.idx).and_then(|r| r.proposal_id),
                PotStatus::Open => None,
            },
            creator: p.creator.clone(),
            created_at_ms: p.created_at_ms,
            closed_at_ms: if p.closed_at_ms > 0 { Some(p.closed_at_ms) } else { None },
            member_count: p.member_count,
            joining_count: p.joining_count,
            approvals_needed: approvals_needed(p.member_count),
            proposal_period_ms: PROPOSAL_PERIOD_MS,
            total_contributed: U128(p.total_contributed),
            spent_instant: U128(p.spent_instant),
            spent_vote: U128(p.spent_vote),
            reserved: U128(p.reserved),
            balance_estimate: U128(self.balance_est(p)),
            last_contributor: p.last_contributor.clone(),
            request_count: p.request_seq,
            open_requests: p.open_requests,
            active_invites: p.active_invites,
            unpaid_approved: p.unpaid_approved,
            float: p.float,
            usdc: self.config.usdc.clone(),
            open_rules_proposal: p.open_rules_proposal.filter(|x| *x != u64::MAX),
            closing_in_flight: p.closing_until_ms > now_ms(),
            extras: self.pext(p.idx).extras,
            policy_version: self.pext(p.idx).policy_v,
            close_settling: matches!(p.status, PotStatus::Closing { .. })
                && self.closes.get(&p.idx).is_some_and(|r| r.status == CloseStatus::Approved),
            open_links: self.pext(p.idx).open_links,
            goal_state: self.goal_state(p).into(),
            gifts_on: !self.gifts_of(p.idx).off,
            gifts_total: U128(self.gifts_of(p.idx).total),
            gifts_count: self.gifts_of(p.idx).count,
        })
    }

    /// Active memberships of `account_id` (≤ max_pots_per_account), Closed Pots included.
    pub fn get_pots_of(&self, account_id: AccountId) -> Vec<PotSummary> {
        let Some(ids) = self.pots_of.get(&account_id) else { return vec![] };
        ids.iter()
            .filter_map(|id| {
                let p = self.pots.get(id)?;
                let contributed = self.members.get(&(p.idx, account_id.clone())).map(|m| m.contributed).unwrap_or(0);
                Some(PotSummary {
                    pot: id.clone(),
                    slug: p.slug.clone(),
                    name: p.name.clone(),
                    emoji: p.emoji.clone(),
                    preset: p.preset,
                    status: pot_status_str(&p.status).into(),
                    seq: p.seq,
                    member_count: p.member_count,
                    total_contributed: U128(p.total_contributed),
                    balance_estimate: U128(self.balance_est(p)),
                    contributed: U128(contributed),
                    created_at_ms: p.created_at_ms,
                })
            })
            .collect()
    }

    /// Members in join order (Active + Joining). `balance` = the client's
    /// `usdc.ft_balance_of(<dao>)`; otherwise the ledger estimate is used.
    pub fn get_members(&self, pot: AccountId, balance: Option<U128>) -> Vec<MemberView> {
        let Some(p) = self.pots.get(&pot) else { return vec![] };
        let (gets_back, source): (Vec<(AccountId, u128)>, &str) = match self.live_close_record(p) {
            Some(rec) => (rec.payouts.clone(), "close_record"),
            None => {
                let b = balance.map(|b| b.0).unwrap_or_else(|| self.balance_est(p));
                let src = if balance.is_some() { "argument" } else { "ledger" };
                let pr = prorata::close_split(b, &self.contributions(p), p.last_contributor.as_ref());
                (pr.map(|x| x.payouts).unwrap_or_default(), src)
            }
        };
        let mut out = vec![];
        for i in 0..p.next_join_index {
            let Some(a) = self.member_list.get(&(p.idx, i)) else { continue };
            let Some(m) = self.members.get(&(p.idx, a.clone())) else { continue };
            let back = gets_back.iter().find(|(x, _)| x == a).map(|(_, v)| *v).unwrap_or(0);
            out.push(MemberView {
                account_id: a.clone(),
                join_index: m.join_index,
                status: if m.status == MemberStatus::Active { "active".into() } else { "joining".into() },
                joined_at_ms: m.joined_at_ms,
                contributed: U128(m.contributed),
                spent: U128(m.spent),
                instant_used: U128(m.instant_used),
                budget_left: U128(p.rules.member_budget.0.saturating_sub(m.instant_used)),
                one_ok_used: U128(self.one_ok_used(p.idx, a)),
                one_ok_left: U128(self.pext(p.idx).extras.one_ok_cap.0.saturating_sub(self.one_ok_used(p.idx, a))),
                would_get_back: U128(back),
                share_of_spending: U128(m.contributed.saturating_sub(back)),
                is_last_contributor: p.last_contributor.as_ref() == Some(a),
                balance_source: source.into(),
            });
        }
        out
    }

    pub fn get_rules(&self, pot: AccountId) -> Option<RulesView> {
        let p = self.pots.get(&pot)?;
        Some(RulesView {
            pot: pot.clone(),
            preset: p.preset,
            rules: p.rules.clone(),
            rules_version: p.rules_version,
            member_count: p.member_count,
            approvals_needed: approvals_needed(p.member_count),
            proposal_period_ms: PROPOSAL_PERIOD_MS,
        })
    }

    /// The same decision function as `request_spend`, minus the cross-contract checks a view
    /// can't do (`client_must_check`).
    pub fn preview_spend(
        &self,
        pot: AccountId,
        account_id: AccountId,
        amount: U128,
        receiver_id: AccountId,
        balance: Option<U128>,
        link: Option<bool>,
    ) -> SpendPreview {
        let p = self.pot(&pot);
        let m = self.member(p.idx, &account_id);
        let used = m.as_ref().map(|m| m.instant_used).unwrap_or(0);
        let mut out = SpendPreview {
            path: "blocked".into(),
            reason: String::new(),
            approvals_needed: approvals_needed(p.member_count),
            member_count: p.member_count,
            instant_cap: p.rules.instant_cap,
            member_budget: p.rules.member_budget,
            budget_used: U128(used),
            budget_left: U128(p.rules.member_budget.0.saturating_sub(used)),
            balance_checked: balance,
            client_must_check: vec!["payee_registered".into(), "dao_membership".into()],
            tier: String::new(),
            effective_cap: U128(0),
            trust_level: 0,
            one_ok_cap: U128(0),
        };
        let ext = self.pext(p.idx);
        out.effective_cap = U128(self.effective_cap(&p, &ext, &account_id));
        out.trust_level = if ext.extras.trust { self.trust_of(p.idx, &account_id).level } else { 0 };
        out.one_ok_cap = ext.extras.one_ok_cap;
        // wave 4: `link: true` previews a pay-by-link request (receiver_id = the hub)
        let is_link = link.unwrap_or(false);
        match self.decide(&pot, &p, &account_id, amount.0, &receiver_id, None, is_link) {
            Err((_, why)) => out.reason = why.into(),
            Ok(crate::Decision { path, reason, tier }) => {
                let b = balance.map(|b| b.0).unwrap_or_else(|| self.balance_est(&p));
                if amount.0 > b.saturating_sub(p.reserved) {
                    out.reason = "insufficient_balance".into();
                } else {
                    out.tier = near_sdk::serde_json::to_value(tier).ok().and_then(|v| v.as_str().map(|s| s.to_string())).unwrap_or_default();
                    out.path = if path == Path::Instant { "instant".into() } else { "vote".into() };
                    out.reason = near_sdk::serde_json::to_value(reason)
                        .ok()
                        .and_then(|v| v.as_str().map(|s| s.to_string()))
                        .unwrap_or_default();
                }
            }
        }
        out
    }

    pub fn preview_close(&self, pot: AccountId, balance: Option<U128>) -> ClosePreview {
        let p = self.pot(&pot);
        let contribs = self.contributions(&p);
        let contributed_of = |a: &AccountId| contribs.iter().find(|(x, _)| x == a).map(|(_, c)| *c).unwrap_or(0);
        let mut blocked = self.close_blocked(&p);
        let (b, source, payouts, dust, dust_to) = match self.live_close_record(&p) {
            Some(rec) => (rec.balance, "close_record", rec.payouts.clone(), rec.dust, Some(rec.dust_to.clone())),
            None => {
                let b = balance.map(|b| b.0).unwrap_or_else(|| self.balance_est(&p));
                let src = if balance.is_some() { "argument" } else { "ledger" };
                match prorata::close_split(b, &contribs, p.last_contributor.as_ref()) {
                    Some(pr) => (b, src, pr.payouts, pr.dust, Some(pr.dust_to)),
                    None => {
                        if blocked.is_none() {
                            blocked = Some("nothing_to_refund");
                        }
                        (b, src, vec![], 0, None)
                    }
                }
            }
        };
        ClosePreview {
            pot: pot.clone(),
            balance: U128(b),
            balance_source: source.into(),
            total_contributed: U128(p.total_contributed),
            gifts_total: U128(self.gifts_of(p.idx).total),
            split: if contribs.iter().any(|(_, c)| *c > 0) { "prorata".into() } else { "equal".into() },
            approvals_needed: approvals_needed(p.member_count),
            open_requests: p.open_requests,
            payouts: payouts
                .iter()
                .map(|(a, x)| ClosePayoutView { account_id: a.clone(), contributed: U128(contributed_of(a)), amount: U128(*x) })
                .collect(),
            dust: U128(dust),
            dust_to,
            can_propose: blocked.is_none(),
            blocked_reason: blocked.map(|s| s.to_string()),
        }
    }

    /// Ids ascending; refused ids are absent (gaps). Newest page:
    /// `from_index = max(0, request_count − limit)`. `limit` ≤ 50.
    pub fn get_requests(&self, pot: AccountId, from_index: u32, limit: u32) -> Vec<RequestView> {
        let Some(p) = self.pots.get(&pot) else { return vec![] };
        let end = from_index.saturating_add(limit.min(50)).min(p.request_seq);
        (from_index..end).filter_map(|i| self.requests.get(&(p.idx, i)).map(|r| request_view(&pot, r, &self.rx(p.idx, r)))).collect()
    }

    pub fn get_request(&self, pot: AccountId, request_id: u32) -> Option<RequestView> {
        let p = self.pots.get(&pot)?;
        self.requests.get(&(p.idx, request_id)).map(|r| request_view(&pot, r, &self.rx(p.idx, r)))
    }

    pub fn get_invite(&self, pot: AccountId, invite_pk: PublicKey) -> Option<InviteView> {
        let p = self.pots.get(&pot)?;
        let pk = pk_bytes(&invite_pk)?;
        self.invites.get(&(p.idx, pk)).map(|inv| invite_view(&pot, &pk, inv))
    }

    /// What the hub created DAO proposal `proposal_id` for, or `null` for a proposal the hub
    /// didn't create. The relayer relays votes / Finalize only when non-null and `live` (rev4).
    pub fn get_proposal_subject(&self, pot: AccountId, proposal_id: u64) -> Option<SubjectView> {
        let p = self.pots.get(&pot)?;
        let Some(s) = self.subjects.get(&(p.idx, proposal_id)) else {
            // hub 1.3.0 (M-2): a sweep of a Closed Pot is hub-made too (votable while in its period)
            let sw = self.sweep_of(p.idx).filter(|s| s.proposal_id == proposal_id)?;
            return Some(SubjectView {
                pot,
                proposal_id,
                kind: "sweep".into(),
                request_id: None,
                member: None,
                rules_version: None,
                live: now_ms() < sw.created_at_ms.saturating_add(PROPOSAL_PERIOD_MS),
            });
        };
        let mut v = SubjectView {
            pot: pot.clone(),
            proposal_id,
            kind: subject_kind(s).into(),
            request_id: None,
            member: None,
            rules_version: None,
            live: false,
        };
        match s {
            Subject::Spend { request_id } => {
                v.request_id = Some(*request_id);
                v.live = self.requests.get(&(p.idx, *request_id)).is_some_and(|r| {
                    matches!(r.status, RequestStatus::Approving | RequestStatus::Pending | RequestStatus::PayoutFailed)
                });
            }
            Subject::Join { member } => {
                v.member = Some(member.clone());
                v.live = self
                    .members
                    .get(&(p.idx, member.clone()))
                    .is_some_and(|m| m.status == MemberStatus::Joining { proposal_id: Some(proposal_id) });
            }
            Subject::Close => v.live = p.status == PotStatus::Closing { proposal_id },
            Subject::Rules { version } => {
                v.rules_version = Some(*version);
                v.live = p.open_rules_proposal == Some(proposal_id);
            }
        }
        Some(v)
    }
}
