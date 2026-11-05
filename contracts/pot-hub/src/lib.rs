//! Pot Hub (`pots.<root>`): the Rulebot + factory + ledger for every Pot (D-02).
//! Spec: plan/contracts-spec.md (v1.0, Rev 5). Every Pot is a Sputnik DAO created from a global
//! contract by hash; the hub holds the 1-of-1 `rulebot` role in each.
//!
//! Conventions (contracts-spec §3.0):
//! - Authorization uses ONLY `predecessor_account_id` (INV-01). `signer_account_id` decides only
//!   who pays: the hub sponsors NEAR when the signer is in `config.relayers` (INV-18).
//! - Callbacks are `#[private]`, read promise results defensively and never panic (INV-07).
//! - Every hop uses static gas with `unused_gas_weight(0)`.

use near_sdk::json_types::{Base58CryptoHash, Base64VecU8, U128};
use near_sdk::serde::Deserialize;
use near_sdk::store::{LookupMap, LookupSet};
use near_sdk::{
    env, near, AccountId, CurveType, Gas, NearToken, PanicOnDefault, Promise, PromiseError, PromiseOrValue, PublicKey,
};

pub mod errors;
pub mod events;
pub mod ext;
pub mod gifts;
pub mod kinds;
pub mod ledger;
pub mod policy;
pub mod prorata;
pub mod security;
pub mod types;
pub mod views;
pub mod wave4;
#[cfg(test)]
mod unit_time;
#[cfg(test)]
mod unit_gifts;
#[cfg(test)]
mod unit_security;

use errors::*;
use events::*;
use ext::*;
use gifts::*;
use kinds::*;
use types::*;
use views::*;
use wave4::*;

// ---------------------------------------------------------------------------------------------
// Gas constants (contracts-spec §8.2; calibrated in C-09, see contracts/CALIBRATION.md)
// ---------------------------------------------------------------------------------------------
pub const GAS_VIEW: Gas = Gas::from_tgas(5);
/// `get_policy` / `get_proposal` on the DAO: their output grows with members / close actions
/// (C-09: 1.6-1.8 Tgas at n = 3; ≥ 3× margin kept at n = 40).
pub const GAS_VIEW_DAO: Gas = Gas::from_tgas(10);
pub const GAS_ADD: Gas = Gas::from_tgas(10);
pub const GAS_ADD_CLOSE: Gas = Gas::from_tgas(20);
pub const GAS_ACT: Gas = Gas::from_tgas(40);
/// `act_proposal(VoteApprove)` on an AddMemberToRole: no payout promise, ≈ 2.6 Tgas burnt (C-09),
/// min 15 ✅ — 20 keeps the whole join under the relayer's 100 Tgas.
pub const GAS_ACT_JOIN: Gas = Gas::from_tgas(20);
pub const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
pub const GAS_STORAGE_DEPOSIT: Gas = Gas::from_tgas(10);
pub const GAS_DAO_NEW: Gas = Gas::from_tgas(20);
pub const GAS_ON_CONTRIBUTION: Gas = Gas::from_tgas(10);
pub const GAS_ON_STATUS: Gas = Gas::from_tgas(10);
pub const GAS_ON_SPEND_ADDED: Gas = Gas::from_tgas(80);
pub const GAS_ON_SPEND_CHECKED: Gas = Gas::from_tgas(105);
pub const GAS_ON_JOIN_ADDED: Gas = Gas::from_tgas(60);
pub const GAS_ON_POT_CREATED: Gas = Gas::from_tgas(40);
pub const GAS_ON_DAO_REGISTERED: Gas = Gas::from_tgas(10);
pub const GAS_ON_CLOSE_BALANCE: Gas = Gas::from_tgas(60);
pub const GAS_ON_CLOSE_ADDED: Gas = Gas::from_tgas(10);
pub const GAS_ON_RULES_ADDED: Gas = Gas::from_tgas(10);
// wave 4: a link payout is `ft_transfer_call` to the hub, and Sputnik (278adc7 / v3.2) forwards
// act_proposal's remaining gas to it (kb/sputnik-dao.md R8); the token keeps 30 Tgas for itself.
pub const GAS_ACT_LINK: Gas = Gas::from_tgas(100);
pub const GAS_ON_SPEND_ADDED_LINK: Gas = Gas::from_tgas(140);
pub const GAS_ON_SPEND_CHECKED_LINK: Gas = Gas::from_tgas(165);
pub const GAS_ON_OK_CHECKED: Gas = Gas::from_tgas(80);
pub const GAS_ON_OK_CHECKED_LINK: Gas = Gas::from_tgas(140);
pub const GAS_ON_LINK_DONE: Gas = Gas::from_tgas(15);

/// Max bytes read from any promise result (a 40-member policy is ≈ 4 KB).
const MAX_RESULT_BYTES: usize = 64 * 1024;

// ---------------------------------------------------------------------------------------------
// State (contracts-spec §2.1). Layout frozen at C-13.
// ---------------------------------------------------------------------------------------------

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct PotHub {
    pub(crate) config: HubConfig,
    pub(crate) pot_count: u32,
    pub(crate) pots: LookupMap<AccountId, Pot>,
    pub(crate) members: LookupMap<(u32, AccountId), Member>,
    pub(crate) member_list: LookupMap<(u32, u32), AccountId>,
    pub(crate) pots_of: LookupMap<AccountId, Vec<AccountId>>,
    pub(crate) requests: LookupMap<(u32, u32), Request>,
    pub(crate) subjects: LookupMap<(u32, u64), Subject>,
    pub(crate) invites: LookupMap<(u32, [u8; 32]), Invite>,
    pub(crate) closes: LookupMap<u32, CloseRecord>,
    pub(crate) creator_daily: LookupMap<AccountId, DailyCount>,
    pub(crate) pending_pots: LookupSet<AccountId>,
    pub(crate) sponsored_today: DailyCount,
    // ---- wave 4 (hub 1.1.0; appended, created by `migrate`) ----
    pub(crate) pot_ext: LookupMap<u32, PotExt>,
    pub(crate) trust: LookupMap<(u32, AccountId), TrustRecord>,
    pub(crate) req_ext: LookupMap<(u32, u32), RequestExt>,
}

/// The hub 1.0.0 state layout, read once by `migrate` (wave 4).
#[near(serializers = [borsh])]
pub struct PotHubV1 {
    config: HubConfig,
    pot_count: u32,
    pots: LookupMap<AccountId, Pot>,
    members: LookupMap<(u32, AccountId), Member>,
    member_list: LookupMap<(u32, u32), AccountId>,
    pots_of: LookupMap<AccountId, Vec<AccountId>>,
    requests: LookupMap<(u32, u32), Request>,
    subjects: LookupMap<(u32, u64), Subject>,
    invites: LookupMap<(u32, [u8; 32]), Invite>,
    closes: LookupMap<u32, CloseRecord>,
    creator_daily: LookupMap<AccountId, DailyCount>,
    pending_pots: LookupSet<AccountId>,
    sponsored_today: DailyCount,
}

/// What `decide` returns: the ledger path, the reason shown to people, and the approval tier.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Decision {
    pub path: Path,
    pub reason: Reason,
    pub tier: Tier,
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
struct ContributeMsg {
    pot: AccountId,
}

/// `ft_on_transfer` msg from a Pot's DAO paying a link into escrow (wave 4).
#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
struct LinkFundMsg {
    link: u32,
}

// ---------------------------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------------------------

pub(crate) fn now_ms() -> u64 {
    env::block_timestamp_ms()
}
pub(crate) fn today() -> u32 {
    (now_ms() / DAY_MS) as u32
}
pub(crate) fn byte_cost() -> u128 {
    env::storage_byte_cost().as_yoctonear()
}
pub(crate) fn bytes_cost(bytes: u64) -> u128 {
    bytes as u128 * byte_cost()
}
pub(crate) fn free_balance() -> u128 {
    env::account_balance()
        .as_yoctonear()
        .saturating_sub(env::storage_usage() as u128 * byte_cost())
}

/// Reads promise result `idx` as JSON. Failed promise, oversize or bad JSON → `Err` (never panics).
pub(crate) fn promise_json<T: near_sdk::serde::de::DeserializeOwned>(idx: u64) -> Result<T, ()> {
    if env::promise_results_count() <= idx {
        return Err(());
    }
    match env::promise_result_checked(idx, MAX_RESULT_BYTES) {
        Ok(bytes) => near_sdk::serde_json::from_slice(&bytes).map_err(|_| ()),
        Err(PromiseError::Failed) | Err(_) => Err(()),
    }
}
/// `Ok` iff promise result `idx` succeeded (value ignored).
pub(crate) fn promise_ok(idx: u64) -> bool {
    env::promise_results_count() > idx && env::promise_result_checked(idx, MAX_RESULT_BYTES).is_ok()
}

pub(crate) fn pk_string(b: &[u8; 32]) -> String {
    format!("ed25519:{}", near_sdk::bs58::encode(b).into_string())
}
pub(crate) fn pk_bytes(pk: &PublicKey) -> Option<[u8; 32]> {
    let raw = pk.as_bytes();
    if pk.curve_type() != CurveType::ED25519 || raw.len() != 33 {
        return None;
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&raw[1..]);
    Some(out)
}

pub fn valid_slug(slug: &str) -> bool {
    let len = slug.len();
    if !(MIN_SLUG_LEN..=MAX_SLUG_LEN).contains(&len) {
        return false;
    }
    // ^[a-z0-9]+(-[a-z0-9]+)*$
    slug.split('-').all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit()))
}

/// Unicode format characters (Cf). ZWJ (U+200D) and VS16 (U+FE0F, Mn) are allowed by the caller.
pub fn is_format_char(c: char) -> bool {
    matches!(c as u32,
        0x00AD | 0x0600..=0x0605 | 0x061C | 0x06DD | 0x070F | 0x0890..=0x0891 | 0x08E2 | 0x180E
        | 0x200B..=0x200F | 0x202A..=0x202E | 0x2060..=0x2064 | 0x2066..=0x206F | 0xFEFF
        | 0xFFF9..=0xFFFB | 0x110BD | 0x110CD | 0x13430..=0x1343F | 0x1BCA0..=0x1BCA3
        | 0x1D173..=0x1D17A | 0xE0001 | 0xE0020..=0xE007F)
}
fn bad_char(c: char) -> bool {
    c.is_control() || (is_format_char(c) && c != '\u{200D}')
}
pub fn valid_name(name: &str) -> bool {
    let n = name.chars().count();
    n >= 1 && n <= MAX_NAME_CHARS && !name.chars().any(bad_char)
}
pub fn valid_emoji(e: &str) -> bool {
    !e.is_empty() && e.len() <= MAX_EMOJI_BYTES && !e.bytes().any(|b| b.is_ascii()) && !e.chars().any(bad_char)
}
pub fn valid_request_ref(r: &str) -> bool {
    (8..=32).contains(&r.len()) && r.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
}

pub(crate) fn validate_config(c: &HubConfig) {
    let l = &c.limits;
    let f = c.dao_float.as_yoctonear();
    let mf = c.min_dao_float.as_yoctonear();
    let r = l.min_hub_reserve.as_yoctonear();
    let ok = (MIN_DAO_FLOAT_BOUND..=MAX_DAO_FLOAT).contains(&f)
        && (MIN_DAO_FLOAT_BOUND..=f).contains(&mf)
        && c.relayers.len() <= MAX_RELAYERS
        && (2..=HARD_MAX_MEMBERS).contains(&l.max_members)
        && (1..=10).contains(&l.max_pots_per_creator_per_day)
        && (1..=200).contains(&l.max_sponsored_pots_per_day)
        && (1..=100).contains(&l.max_pots_per_account)
        && (1..=20).contains(&l.max_active_invites)
        && (1..=100).contains(&l.max_invites_total)
        && (1..=10).contains(&l.max_pending_per_member)
        && (1..=1000).contains(&l.max_requests_per_pot)
        && (MIN_HUB_RESERVE_BOUND..=MAX_HUB_RESERVE).contains(&r);
    check(ok, ERR_CONFIG_INVALID);
}

/// Storage prepay for a hub-created proposal (contracts-spec §3.11).
pub fn prepay_bytes(description: &str, kind: &DaoKind, extra_votes: u32) -> u64 {
    PREPAY_PROPOSAL_OVERHEAD_BYTES
        + description.len() as u64
        + to_json(kind).len() as u64
        + PREPAY_FIRST_VOTE_BYTES
        + PREPAY_EXTRA_VOTE_BYTES * extra_votes as u64
}

pub(crate) fn dao_status_expired(p: &DaoProposalLite) -> bool {
    p.status == "Expired"
        || (p.status == "InProgress"
            && p.submission_time.0.saturating_add(PROPOSAL_PERIOD_NS) < env::block_timestamp())
}

// ---------------------------------------------------------------------------------------------
// Internal state helpers
// ---------------------------------------------------------------------------------------------

impl PotHub {
    pub(crate) fn pot(&self, id: &AccountId) -> Pot {
        self.pots.get(id).cloned().unwrap_or_else(|| fail(ERR_POT_NOT_FOUND))
    }
    pub(crate) fn member(&self, idx: u32, a: &AccountId) -> Option<Member> {
        self.members.get(&(idx, a.clone())).cloned()
    }
    pub(crate) fn active_member(&self, idx: u32, a: &AccountId) -> Option<Member> {
        self.member(idx, a).filter(|m| m.status == MemberStatus::Active)
    }
    /// Bumps the change counter and writes the Pot (exactly once per state-changing call, T-87).
    pub(crate) fn save_pot(&mut self, id: &AccountId, mut pot: Pot) {
        pot.seq += 1;
        self.pots.insert(id.clone(), pot);
    }
    fn put_member(&mut self, idx: u32, a: &AccountId, m: Member) {
        self.members.insert((idx, a.clone()), m);
    }
    pub(crate) fn is_open(pot: &Pot) -> bool {
        pot.status == PotStatus::Open && pot.closing_until_ms <= now_ms()
    }
    pub(crate) fn sponsored(&self) -> bool {
        self.config.relayers.contains(&env::signer_account_id())
    }
    /// The hub keeps `cost` from a direct (unsponsored) caller and refunds the excess in the same
    /// call (rev4, §3.0). Returns the excess being refunded (0 when sponsored).
    pub(crate) fn charge(&self, sponsored: bool, cost: u128) -> u128 {
        if sponsored {
            return 0;
        }
        let attached = env::attached_deposit().as_yoctonear();
        if attached < cost {
            fail_with(ERR_DEPOSIT_REQUIRED, cost);
        }
        attached - cost
    }
    pub(crate) fn refund_excess(excess: u128) {
        if excess > 0 {
            Promise::new(env::predecessor_account_id()).transfer(NearToken::from_yoctonear(excess)).detach();
        }
    }
    /// The hub never spends below `min_hub_reserve` (INV-12).
    pub(crate) fn require_free(&self, spend: u128, excess: u128) {
        let need = spend + excess + self.config.limits.min_hub_reserve.as_yoctonear();
        check(free_balance() >= need, ERR_HUB_LOW_BALANCE);
    }
    pub(crate) fn hub_has_free(&self, spend: u128) -> bool {
        free_balance() >= spend + self.config.limits.min_hub_reserve.as_yoctonear()
    }
    pub(crate) fn me() -> AccountId {
        env::current_account_id()
    }

    /// Contributions in join order (members with contributed > 0 are paid at close).
    pub(crate) fn contributions(&self, pot: &Pot) -> Vec<(AccountId, u128)> {
        let mut out = vec![];
        for i in 0..pot.next_join_index {
            if let Some(a) = self.member_list.get(&(pot.idx, i)) {
                if let Some(m) = self.members.get(&(pot.idx, a.clone())) {
                    if m.status == MemberStatus::Active {
                        out.push((a.clone(), m.contributed));
                    }
                }
            }
        }
        out
    }

    /// Prepay-batch: `Transfer(prepay)` precedes `add_proposal` in ONE receipt, so a failed
    /// `add_proposal` reverts the prepay too (§3.11).
    pub(crate) fn propose_batch(dao: &AccountId, prepay: u128, description: &str, kind: &DaoKind, gas: Gas) -> Promise {
        Promise::new(dao.clone()).transfer(NearToken::from_yoctonear(prepay)).function_call(
            "add_proposal",
            add_proposal_args(description, kind),
            NearToken::from_yoctonear(0),
            gas,
        )
    }

    fn spend_prepay(&self, pot: &Pot, req: &Request, is_link: bool) -> u128 {
        let desc = spend_description(req.id, req.category, &req.request_ref);
        let kind = self.kind_for(req, is_link);
        let extra = if req.path == Path::Vote { pot.member_count } else { 0 };
        bytes_cost(prepay_bytes(&desc, &kind, extra))
    }

    /// The decision function shared verbatim by `request_spend` and `preview_spend`
    /// (contracts-spec §3.4 rows 1-11). `Err((code, preview_reason))`.
    pub(crate) fn decide(
        &self,
        dao: &AccountId,
        pot: &Pot,
        requester: &AccountId,
        amount: u128,
        receiver: &AccountId,
        request_ref: Option<&str>,
        is_link: bool,
    ) -> Result<Decision, (&'static str, &'static str)> {
        if self.config.paused {
            return Err((ERR_PAUSED, "paused"));
        }
        if !Self::is_open(pot) {
            return Err((ERR_POT_NOT_OPEN, "pot_not_open"));
        }
        let Some(member) = self.active_member(pot.idx, requester) else {
            return Err((ERR_NOT_MEMBER, "not_member"));
        };
        if amount == 0 || amount > MAX_AMOUNT {
            return Err((ERR_BAD_AMOUNT, "bad_amount"));
        }
        // a link request names the hub (the escrow) as receiver; nothing else may
        if (receiver == &Self::me()) != is_link || receiver == dao || receiver == &self.config.usdc {
            return Err((ERR_BAD_RECEIVER, "bad_receiver"));
        }
        let ext = self.pext(pot.idx);
        if is_link && !ext.extras.links {
            return Err((ERR_LINKS_OFF, "links_off"));
        }
        // W4-8: no dust links (each claim may cost the hub a token registration)
        if is_link && amount < MIN_LINK_AMOUNT {
            return Err((ERR_LINK_TOO_SMALL, "link_too_small"));
        }
        if let Some(r) = request_ref {
            if !valid_request_ref(r) {
                return Err((ERR_BAD_REQUEST_REF, "bad_request_ref"));
            }
        }
        if pot.request_seq >= self.config.limits.max_requests_per_pot {
            return Err((ERR_TOO_MANY_REQUESTS, "too_many_requests"));
        }
        if goal_blocks_spends(&ext) {
            return Err((ERR_GOAL_NOT_REACHED, "goal_not_reached"));
        }
        let rules = &pot.rules;
        // a link counts as an allowed payee when links are on: the requester could pay themselves anyway
        let receiver_ok = is_link
            || self.active_member(pot.idx, receiver).is_some()
            || (rules.instant_payees == PayeeRule::MembersAndAllowlist && rules.payee_allowlist.contains(receiver));
        let cap = self.effective_cap(pot, &ext, requester);
        let decision = if cap == 0 || amount > cap {
            (Path::Vote, Reason::OverCap)
        } else if member.instant_used + amount > rules.member_budget.0 {
            (Path::Vote, Reason::OverBudget)
        } else if !receiver_ok {
            (Path::Vote, Reason::PayeeNotAllowed)
        } else if member.contributed < MIN_STAKE {
            // HUB-2: adding 1 unit no longer makes a stranger an instant spender
            (Path::Vote, Reason::NewMember)
        } else {
            (Path::Instant, Reason::WithinRules)
        };
        if decision.0 == Path::Vote && member.pending_votes >= self.config.limits.max_pending_per_member {
            return Err((ERR_TOO_MANY_PENDING, "too_many_pending"));
        }
        // W4-1 (a) / (c): one OK only for a requester who added ≥ MIN_STAKE, within the one-OK ceiling and
        // their one-OK allowance; everything else goes to the group (`ok_request` re-checks it at OK time)
        let tier = if decision.0 == Path::Instant {
            Tier::Instant
        } else if self.one_ok_rules(pot, &ext, requester, &member, amount, None).is_ok() {
            Tier::OneOk
        } else {
            Tier::Group
        };
        Ok(Decision { path: decision.0, reason: decision.1, tier })
    }

    // ---------------------------------------------------------------- wave 4 helpers

    /// The Pot's wave-4 record; Pots created before wave 4 behave as `PotExt::legacy()`.
    pub(crate) fn pext(&self, idx: u32) -> PotExt {
        self.pot_ext.get(&idx).cloned().unwrap_or_else(PotExt::legacy)
    }
    pub(crate) fn rx(&self, idx: u32, req: &Request) -> RequestExt {
        self.req_ext.get(&(idx, req.id)).cloned().unwrap_or_else(|| RequestExt::for_path(req.path))
    }
    pub(crate) fn is_link(&self, idx: u32, id: u32) -> bool {
        self.req_ext.get(&(idx, id)).is_some_and(|x| x.link.is_some())
    }
    pub(crate) fn trust_of(&self, idx: u32, a: &AccountId) -> TrustRecord {
        self.trust.get(&(idx, a.clone())).cloned().unwrap_or_default()
    }
    /// `instant_cap × (1 + level)` with trust on, else `instant_cap` (the budget still applies).
    pub(crate) fn effective_cap(&self, pot: &Pot, ext: &PotExt, a: &AccountId) -> u128 {
        let level = if ext.extras.trust { self.trust_of(pot.idx, a).level } else { 0 };
        pot.rules.instant_cap.0.saturating_mul(1 + level as u128)
    }
    /// The DAO kind a request's payout uses (INV-04: rebuilt, never stored).
    pub(crate) fn kind_for(&self, req: &Request, is_link: bool) -> DaoKind {
        if is_link {
            link_transfer_kind(&self.config.usdc, &Self::me(), req.amount, req.id)
        } else {
            transfer_kind(&self.config.usdc, &req.receiver_id, req.amount)
        }
    }
    pub(crate) fn dao_of(pot: &Pot) -> AccountId {
        format!("{}.{}", pot.slug, Self::me()).parse().expect("pot ids are valid")
    }

    /// Trust + link side effects of a request status change (called by `transition` only).
    fn after_transition(&mut self, pot: &Pot, req: &Request, old: RequestStatus, new: Option<RequestStatus>) {
        if new == Some(old) {
            return;
        }
        // W4-1 (c): a one-OK charge stays on the allowance only while the spend is (being) paid
        match new {
            None | Some(RequestStatus::Rejected | RequestStatus::Expired | RequestStatus::Removed) => self.release_one_ok(pot.idx, req),
            Some(RequestStatus::Approved) => self.settle_one_ok_charge(pot.idx, req.id),
            _ => {}
        }
        let is_link = self.is_link(pot.idx, req.id);
        // M-1: only a plain pending link request (no OK in flight) lets a close through
        if is_link {
            match new {
                Some(RequestStatus::Pending) if !self.rx(pot.idx, req).ok_in_flight => self.mark_link_pending(pot.idx, req.id),
                Some(RequestStatus::Checking | RequestStatus::Proposing | RequestStatus::Pending) => {}
                _ => self.unmark_link_pending(pot.idx, req.id),
            }
        }
        match new {
            Some(RequestStatus::Approved) if !is_link => self.trust_settle(pot, req),
            Some(RequestStatus::Rejected) => {
                self.trust_decline(pot, req);
                if is_link {
                    self.void_link(pot, req.id);
                }
            }
            Some(RequestStatus::Expired) | Some(RequestStatus::Removed) | None if is_link => self.void_link(pot, req.id),
            _ => {}
        }
        if new.is_none() {
            self.req_ext.remove(&(pot.idx, req.id));
        }
    }

    /// Counts a settled (paid) spend once per request; levels up after `TRUST_STEP` qualifying ones.
    pub(crate) fn trust_settle(&mut self, pot: &Pot, req: &Request) {
        let key = (pot.idx, req.id);
        let mut rx = self.rx(pot.idx, req);
        if rx.counted {
            return;
        }
        rx.counted = true;
        self.req_ext.insert(key, rx);
        let mut t = self.trust_of(pot.idx, &req.requester);
        t.settled = t.settled.saturating_add(1);
        t.settled_amount = t.settled_amount.saturating_add(req.amount);
        if req.amount.saturating_mul(TRUST_MIN_SPEND_DIV) >= pot.rules.instant_cap.0 {
            t.streak = (t.streak + 1).min(TRUST_STEP);
            if t.streak >= TRUST_STEP && t.level < TRUST_MAX_LEVEL {
                let from = t.level;
                t.level += 1;
                t.streak = 0;
                PotEvent::TrustLevelChanged {
                    pot: Self::dao_of(pot),
                    member: req.requester.clone(),
                    from,
                    to: t.level,
                    settled: t.settled,
                    declined: t.declined,
                    cause: "settled".into(),
                }
                .emit();
            }
        }
        self.trust.insert((pot.idx, req.requester.clone()), t);
    }

    /// A declined request drops the requester one level and restarts the streak.
    fn trust_decline(&mut self, pot: &Pot, req: &Request) {
        let mut t = self.trust_of(pot.idx, &req.requester);
        let from = t.level;
        t.level = t.level.saturating_sub(1);
        t.streak = 0;
        t.declined = t.declined.saturating_add(1);
        t.last_declined_ms = now_ms();
        if from != t.level {
            PotEvent::TrustLevelChanged {
                pot: Self::dao_of(pot),
                member: req.requester.clone(),
                from,
                to: t.level,
                settled: t.settled,
                declined: t.declined,
                cause: "declined".into(),
            }
            .emit();
        }
        self.trust.insert((pot.idx, req.requester.clone()), t);
    }

    /// A link whose request can no longer be paid: no money ever moved (AwaitingFunds → Void).
    pub(crate) fn void_link(&mut self, pot: &Pot, id: u32) {
        let key = (pot.idx, id);
        let Some(mut rx) = self.req_ext.get(&key).cloned() else { return };
        let Some(mut link) = rx.link.clone() else { return };
        if link.status != LinkStatus::AwaitingFunds {
            return;
        }
        link.status = LinkStatus::Void;
        link.done_at_ms = now_ms();
        rx.link = Some(link);
        self.req_ext.insert(key, rx);
        let mut e = self.pext(pot.idx);
        e.open_links = e.open_links.saturating_sub(1);
        self.pot_ext.insert(pot.idx, e);
        PotEvent::LinkVoided { pot: Self::dao_of(pot), request_id: id }.emit();
    }

    pub(crate) fn validate_rules(&self, rules: &Rules) -> bool {
        let hub = Self::me();
        let suffix = format!(".{hub}");
        if rules.instant_cap.0 > MAX_AMOUNT || rules.member_budget.0 > MAX_AMOUNT {
            return false;
        }
        if rules.payee_allowlist.len() > MAX_ALLOWLIST {
            return false;
        }
        if rules.instant_payees == PayeeRule::Members && !rules.payee_allowlist.is_empty() {
            return false;
        }
        let mut seen = std::collections::BTreeSet::new();
        for a in &rules.payee_allowlist {
            if !seen.insert(a.clone()) {
                return false;
            }
            if a == &hub || a.as_str().ends_with(&suffix) || a == &self.config.usdc {
                return false;
            }
        }
        true
    }

    pub(crate) fn spend_outcome(&self, pot: &Pot, req: &Request, status: &str, refusal: Option<&str>) -> SpendOutcome {
        let tier = self.req_ext.get(&(pot.idx, req.id)).map(|x| x.tier).unwrap_or(if req.path == Path::Instant { Tier::Instant } else { Tier::Group });
        SpendOutcome {
            tier,
            link: self.is_link(pot.idx, req.id),
            request_id: req.id,
            proposal_id: req.proposal_id,
            path: req.path,
            reason: req.reason,
            status: status.to_string(),
            refusal: refusal.map(|s| s.to_string()),
            approvals_needed: approvals_needed(pot.member_count),
        }
    }

    /// Moves request `req` to `new` (None = delete) through the ledger (INV-06).
    pub(crate) fn transition(&mut self, pot: &mut Pot, req: &mut Request, new: ledger::State) {
        let old_status = req.status;
        self.ledger_transition(pot, req, new);
        self.after_transition(pot, req, old_status, new.map(|(_, s)| s));
    }

    fn ledger_transition(&mut self, pot: &mut Pot, req: &mut Request, new: ledger::State) {
        let old = Some((req.path, req.status));
        let mut m = self.member(pot.idx, &req.requester).expect("requester exists");
        ledger::apply_transition(pot, &mut m, req.amount, old, new);
        self.put_member(pot.idx, &req.requester.clone(), m);
        match new {
            Some((p, s)) => {
                req.path = p;
                req.status = s;
                req.updated_at_ms = now_ms();
                self.requests.insert((pot.idx, req.id), req.clone());
            }
            None => {
                self.requests.remove(&(pot.idx, req.id));
            }
        }
    }

    /// Refuses a request discovered in a callback: release + delete (record absent = gap).
    pub(crate) fn refuse_spend(&mut self, dao: &AccountId, mut pot: Pot, mut req: Request, refusal: &str) -> SpendOutcome {
        self.transition(&mut pot, &mut req, None);
        let out = self.spend_outcome(&pot, &req, "refused", Some(refusal));
        self.save_pot(dao, pot);
        out
    }

    pub(crate) fn emit_synced(&self, dao: &AccountId, pid: u64, subject: &str, request_id: Option<u32>, member: Option<AccountId>, dao_status: &str, hub_status: &str) {
        PotEvent::ProposalSynced {
            pot: dao.clone(),
            proposal_id: pid,
            subject: subject.to_string(),
            request_id,
            member,
            dao_status: dao_status.to_string(),
            hub_status: hub_status.to_string(),
        }
        .emit();
    }

    fn add_pot_of(&mut self, account: &AccountId, dao: &AccountId) {
        let mut v = self.pots_of.get(account).cloned().unwrap_or_default();
        if !v.contains(dao) {
            v.push(dao.clone());
        }
        self.pots_of.insert(account.clone(), v);
    }

    /// Deletes a Joining member whose join failed (INV-06: releases uses and joining_count).
    fn drop_joiner(&mut self, pot: &mut Pot, joiner: &AccountId, m: &Member) {
        self.members.remove(&(pot.idx, joiner.clone()));
        self.member_list.remove(&(pot.idx, m.join_index));
        pot.joining_count = pot.joining_count.saturating_sub(1);
        if let Some(pk) = m.invite_pk {
            if let Some(inv) = self.invites.get_mut(&(pot.idx, pk)) {
                inv.uses = inv.uses.saturating_sub(1);
            }
        }
    }

    fn activate_joiner(&mut self, dao: &AccountId, pot: &mut Pot, joiner: &AccountId, mut m: Member, pid: u64) {
        m.status = MemberStatus::Active;
        m.joined_at_ms = now_ms();
        let pk = m.invite_pk;
        self.put_member(pot.idx, joiner, m);
        pot.joining_count = pot.joining_count.saturating_sub(1);
        pot.member_count += 1;
        self.add_pot_of(joiner, dao);
        PotEvent::MemberJoined { pot: dao.clone(), member: joiner.clone(), proposal_id: pid, invite_pk: pk.map(|b| pk_string(&b)) }
            .emit();
    }

    fn config_core(&self) -> ConfigCore {
        ConfigCore {
            version: VERSION.to_string(),
            owner: self.config.owner.clone(),
            usdc: self.config.usdc.clone(),
            dao_code_hash: String::from(&self.config.dao_code_hash),
            dao_float: self.config.dao_float,
            min_dao_float: self.config.min_dao_float,
            relayers: self.config.relayers.clone(),
            limits: self.config.limits.clone(),
            paused: self.config.paused,
        }
    }

    /// Upper bound of the close prepay at the current contributors (amount strings at max width);
    /// every Active member when nobody contributed (the equal split of a gifts-only Pot, hub 1.2.0).
    pub(crate) fn close_prepay_upper_bound(&self, pot: &Pot) -> (u128, usize) {
        let contribs = self.contributions(pot);
        let anyone = contribs.iter().any(|(_, c)| *c > 0);
        let payees: Vec<(AccountId, u128)> =
            contribs.into_iter().filter(|(_, c)| *c > 0 || !anyone).map(|(a, _)| (a, MAX_AMOUNT)).collect();
        let n = payees.len();
        let kind = close_kind(&self.config.usdc, &payees);
        let desc = close_description(MAX_AMOUNT, n);
        (bytes_cost(prepay_bytes(&desc, &kind, pot.member_count)), n)
    }
}

// ---------------------------------------------------------------------------------------------
// Public methods
// ---------------------------------------------------------------------------------------------

#[near]
impl PotHub {
    // ------------------------------------------------------------------ init + config (§3.1, §3.10)

    #[init]
    pub fn new(
        owner: AccountId,
        usdc: AccountId,
        dao_code_hash: Base58CryptoHash,
        dao_float: NearToken,
        min_dao_float: NearToken,
        relayers: Vec<AccountId>,
        limits: Option<Limits>,
    ) -> Self {
        let config = HubConfig {
            owner,
            usdc,
            dao_code_hash,
            dao_float,
            min_dao_float,
            relayers,
            limits: limits.unwrap_or_default(),
            paused: false,
        };
        validate_config(&config);
        Self {
            config,
            pot_count: 0,
            pots: LookupMap::new(StorageKey::Pots),
            members: LookupMap::new(StorageKey::Members),
            member_list: LookupMap::new(StorageKey::MemberList),
            pots_of: LookupMap::new(StorageKey::PotsOf),
            requests: LookupMap::new(StorageKey::Requests),
            subjects: LookupMap::new(StorageKey::Subjects),
            invites: LookupMap::new(StorageKey::Invites),
            closes: LookupMap::new(StorageKey::Closes),
            creator_daily: LookupMap::new(StorageKey::CreatorDaily),
            pending_pots: LookupSet::new(StorageKey::PendingPots),
            sponsored_today: DailyCount::default(),
            pot_ext: LookupMap::new(StorageKey::PotExt),
            trust: LookupMap::new(StorageKey::Trust),
            req_ext: LookupMap::new(StorageKey::RequestExt),
        }
    }

    /// Wave 4 state migration (hub 1.0.0 → 1.1.0): appends the three side maps. Old records are
    /// untouched (their Borsh layouts are frozen); Pots without a `PotExt` keep the 1.0.0 rules.
    /// Deploy + migrate in ONE transaction (DeployContract + FunctionCall), see notes/contracts-wave4.md.
    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let old: PotHubV1 = env::state_read().unwrap_or_else(|| fail(ERR_MIGRATE));
        Self {
            config: old.config,
            pot_count: old.pot_count,
            pots: old.pots,
            members: old.members,
            member_list: old.member_list,
            pots_of: old.pots_of,
            requests: old.requests,
            subjects: old.subjects,
            invites: old.invites,
            closes: old.closes,
            creator_daily: old.creator_daily,
            pending_pots: old.pending_pots,
            sponsored_today: old.sponsored_today,
            pot_ext: LookupMap::new(StorageKey::PotExt),
            trust: LookupMap::new(StorageKey::Trust),
            req_ext: LookupMap::new(StorageKey::RequestExt),
        }
    }

    /// Owner only. Bounded to the §3.10 ranges; `owner`, `usdc`, `dao_code_hash` immutable (INV-15).
    pub fn set_config(&mut self, patch: ConfigPatch) {
        check(env::predecessor_account_id() == self.config.owner, ERR_NOT_OWNER);
        let mut c = self.config.clone();
        if let Some(v) = patch.dao_float {
            c.dao_float = v;
        }
        if let Some(v) = patch.min_dao_float {
            c.min_dao_float = v;
        }
        if let Some(v) = patch.relayers {
            c.relayers = v;
        }
        if let Some(v) = patch.limits {
            c.limits = v;
        }
        if let Some(v) = patch.paused {
            c.paused = v;
        }
        validate_config(&c);
        self.config = c;
        PotEvent::ConfigChanged { by: env::predecessor_account_id(), config: self.config_core() }.emit();
    }

    // ------------------------------------------------------------------ create_pot (§3.2)

    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn create_pot(
        &mut self,
        slug: String,
        name: String,
        preset: Preset,
        rules: Option<Rules>,
        invite_pk: Option<PublicKey>,
        emoji: Option<String>,
        float: Option<NearToken>,
        extras: Option<RuleExtras>,
    ) -> Promise {
        let creator = env::predecessor_account_id();
        let hub = Self::me();
        check(!self.config.paused, ERR_PAUSED);
        if !valid_slug(&slug) {
            fail(ERR_SLUG_INVALID);
        }
        if RESERVED_SLUGS.contains(&slug.as_str()) {
            fail(ERR_SLUG_RESERVED);
        }
        let dao: AccountId = format!("{slug}.{hub}").parse().unwrap_or_else(|_| fail(ERR_SLUG_INVALID));
        check(dao.as_str().len() <= MAX_ACCOUNT_LEN, ERR_SLUG_INVALID);
        check(!self.pots.contains_key(&dao) && !self.pending_pots.contains(&dao), ERR_SLUG_TAKEN);
        let name = name.trim().to_string();
        check(valid_name(&name), ERR_NAME_INVALID);
        if let Some(e) = &emoji {
            check(valid_emoji(e), ERR_EMOJI_INVALID);
        }
        let rules = match rules {
            Some(r) => r,
            None => preset.default_rules().unwrap_or_else(|| fail(ERR_RULES_INVALID)),
        };
        check(self.validate_rules(&rules), ERR_RULES_INVALID);
        let extras = extras.unwrap_or_else(|| RuleExtras::defaults_for(&rules));
        if let Err(code) = self.validate_extras(&rules, &extras, None) {
            fail(code);
        }
        // Hub 1.3.0 (HUB-1 / GOV-2 / GOV-3): members of a new Pot can only vote, so every proposal is
        // the hub's. The rulebot may approve `call` proposals only in all-or-nothing Pots (the goal refund).
        let policy_v = if extras.goal.as_ref().is_some_and(|g| g.all_or_nothing) { POLICY_V4 } else { POLICY_V3 };
        let day = today();
        let daily = self.creator_daily.get(&creator).cloned().unwrap_or_default();
        check(daily.count_on(day) < self.config.limits.max_pots_per_creator_per_day, ERR_CREATOR_DAILY_LIMIT);
        let sponsored = self.sponsored();
        if sponsored {
            check(
                self.sponsored_today.count_on(day) < self.config.limits.max_sponsored_pots_per_day,
                ERR_GLOBAL_DAILY_LIMIT,
            );
        }
        let f = float
            .unwrap_or(self.config.dao_float)
            .as_yoctonear()
            .clamp(self.config.min_dao_float.as_yoctonear(), self.config.dao_float.as_yoctonear());
        let cost = f + USDC_STORAGE_DEPOSIT + bytes_cost(STATE_BYTES_CREATE);
        let excess = self.charge(sponsored, cost);
        let n_pots = self.pots_of.get(&creator).map(|v| v.len()).unwrap_or(0);
        check((n_pots as u32) < self.config.limits.max_pots_per_account, ERR_TOO_MANY_POTS);
        let pk = invite_pk.as_ref().map(|pk| pk_bytes(pk).unwrap_or_else(|| fail(ERR_INVITE_PK_INVALID)));
        self.require_free(f + USDC_STORAGE_DEPOSIT, excess);
        check(creator != hub, ERR_NOT_MEMBER);

        // state before the promise (INV-06 reservations)
        self.pending_pots.insert(dao.clone());
        self.creator_daily.insert(creator.clone(), DailyCount { day, count: daily.count_on(day) + 1 });
        if sponsored {
            self.sponsored_today = DailyCount { day, count: self.sponsored_today.count_on(day) + 1 };
        }
        Self::refund_excess(excess);

        let args = policy::dao_new_args_v(&name, preset, &creator, &hub, policy_v).to_string().into_bytes();
        Promise::new(dao.clone())
            .create_account()
            .transfer(NearToken::from_yoctonear(f))
            .use_global_contract(self.config.dao_code_hash)
            .function_call("new", args, NearToken::from_yoctonear(0), GAS_DAO_NEW)
            .then(
                Self::ext(hub)
                    .with_static_gas(GAS_ON_POT_CREATED)
                    .with_unused_gas_weight(0)
                    .on_pot_created(dao, slug, name, emoji, preset, rules, creator, pk.map(|b| pk_string(&b)), NearToken::from_yoctonear(f), sponsored, day, Some(extras), Some(policy_v)),
            )
    }

    #[private]
    #[allow(clippy::too_many_arguments)]
    pub fn on_pot_created(
        &mut self,
        dao: AccountId,
        slug: String,
        name: String,
        emoji: Option<String>,
        preset: Preset,
        rules: Rules,
        creator: AccountId,
        invite_pk: Option<String>,
        float: NearToken,
        sponsored: bool,
        day: u32,
        extras: Option<RuleExtras>,
        policy_v: Option<u8>,
    ) -> PromiseOrValue<CreatePotOutcome> {
        self.pending_pots.remove(&dao);
        if !promise_ok(0) {
            // The batch reverted: the float is refunded to the hub; no DAO account exists.
            if let Some(d) = self.creator_daily.get(&creator).cloned() {
                if d.day == day && d.count <= 1 {
                    self.creator_daily.remove(&creator); // full rollback: no residual storage
                } else if d.day == day {
                    self.creator_daily.insert(creator.clone(), DailyCount { day, count: d.count - 1 });
                }
            }
            if sponsored && self.sponsored_today.day == day {
                self.sponsored_today.count = self.sponsored_today.count.saturating_sub(1);
            }
            return PromiseOrValue::Value(CreatePotOutcome::failed(dao, "dao_create_failed"));
        }
        let now = now_ms();
        let idx = self.pot_count;
        self.pot_count += 1;
        let pk_bytes_opt: Option<[u8; 32]> =
            invite_pk.as_ref().and_then(|s| s.parse::<PublicKey>().ok()).and_then(|pk| pk_bytes(&pk));
        let mut pot = Pot {
            idx,
            seq: 0,
            slug: slug.clone(),
            name: name.clone(),
            emoji: emoji.clone(),
            preset,
            rules: rules.clone(),
            rules_version: 1,
            status: PotStatus::Open,
            creator: creator.clone(),
            created_at_ms: now,
            closed_at_ms: 0,
            closing_until_ms: 0,
            busy_until_ms: 0,
            member_count: 1,
            joining_count: 0,
            next_join_index: 1,
            request_seq: 0,
            active_invites: 0,
            invites_total: 0,
            unpaid_approved: 0,
            open_requests: 0,
            total_contributed: 0,
            spent_instant: 0,
            spent_vote: 0,
            reserved: 0,
            last_contributor: None,
            float,
            open_rules_proposal: None,
        };
        self.put_member(
            idx,
            &creator,
            Member {
                join_index: 0,
                status: MemberStatus::Active,
                joined_at_ms: now,
                invite_pk: None,
                contributed: 0,
                instant_used: 0,
                spent: 0,
                pending_votes: 0,
            },
        );
        self.member_list.insert((idx, 0), creator.clone());
        self.add_pot_of(&creator, &dao);
        PotEvent::PotCreated {
            pot: dao.clone(),
            slug: slug.clone(),
            name,
            emoji,
            preset,
            creator: creator.clone(),
            rules,
            float,
        }
        .emit();
        if let Some(extras) = extras {
            let pv = policy_v.unwrap_or(POLICY_V1);
            PotEvent::RuleExtrasSet { pot: dao.clone(), extras: extras.clone(), rules_version: 1, policy_version: pv }.emit();
            self.pot_ext.insert(idx, PotExt { extras, policy_v: pv, ..PotExt::legacy() });
        }
        if let Some(b) = pk_bytes_opt {
            let inv = Invite {
                created_by: creator.clone(),
                created_at_ms: now,
                expires_at_ms: now + DEFAULT_INVITE_TTL_MS,
                max_uses: DEFAULT_INVITE_MAX_USES,
                uses: 0,
                revoked_at_ms: None,
            };
            PotEvent::InviteAdded {
                pot: dao.clone(),
                invite_pk: pk_string(&b),
                by: creator,
                expires_at_ms: inv.expires_at_ms,
                max_uses: inv.max_uses,
            }
            .emit();
            self.invites.insert((idx, b), inv);
            pot.active_invites = 1;
            pot.invites_total = 1;
        }
        self.save_pot(&dao, pot);
        if free_balance() >= USDC_STORAGE_DEPOSIT {
            PromiseOrValue::Promise(
                ext_ft::ext(self.config.usdc.clone())
                    .with_attached_deposit(NearToken::from_yoctonear(USDC_STORAGE_DEPOSIT))
                    .with_static_gas(GAS_STORAGE_DEPOSIT)
                    .with_unused_gas_weight(0)
                    .storage_deposit(Some(dao.clone()), Some(true))
                    .then(
                        Self::ext(Self::me())
                            .with_static_gas(GAS_ON_DAO_REGISTERED)
                            .with_unused_gas_weight(0)
                            .on_dao_registered(dao, slug, float),
                    ),
            )
        } else {
            PromiseOrValue::Value(CreatePotOutcome::created(dao, slug, float, false))
        }
    }

    #[private]
    pub fn on_dao_registered(&mut self, dao: AccountId, slug: String, float: NearToken) -> CreatePotOutcome {
        CreatePotOutcome::created(dao, slug, float, promise_ok(0))
    }

    // ------------------------------------------------------------------ contributions (§3.3)

    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        check(env::predecessor_account_id() == self.config.usdc, ERR_WRONG_TOKEN);
        if let Ok(l) = near_sdk::serde_json::from_str::<LinkFundMsg>(&msg) {
            // wave 4: a Pot's DAO paying a link into escrow (never panics; refunds on any mismatch)
            return PromiseOrValue::Value(self.fund_link(&sender_id, l.link, amount));
        }
        if let Ok(g) = near_sdk::serde_json::from_str::<GiftMsg>(&msg) {
            // hub 1.2.0: a gift from ANY account (member or not); never a contribution
            return self.receive_gift(sender_id, g, amount);
        }
        let m: ContributeMsg = near_sdk::serde_json::from_str(&msg).unwrap_or_else(|_| fail(ERR_BAD_MSG));
        let dao = m.pot;
        let mut pot = self.pot(&dao);
        check(Self::is_open(&pot), ERR_POT_NOT_OPEN);
        check(!self.config.paused, ERR_PAUSED);
        check(self.active_member(pot.idx, &sender_id).is_some(), ERR_NOT_MEMBER);
        let ext = self.pext(pot.idx);
        check(!goal_missed(&ext, now_ms()), ERR_GOAL_MISSED);
        check(
            amount.0 > 0 && pot.total_contributed.checked_add(amount.0).is_some_and(|t| t <= MAX_AMOUNT),
            ERR_AMOUNT_TOO_LARGE,
        );
        pot.busy_until_ms = now_ms() + BUSY_WINDOW_MS;
        self.save_pot(&dao, pot);
        PromiseOrValue::Promise(
            ext_ft::ext(self.config.usdc.clone())
                .with_attached_deposit(NearToken::from_yoctonear(1))
                .with_static_gas(GAS_FT_TRANSFER)
                .with_unused_gas_weight(0)
                .ft_transfer(dao.clone(), amount, Some("Pot contribution".to_string()))
                .then(
                    Self::ext(Self::me())
                        .with_static_gas(GAS_ON_CONTRIBUTION)
                        .with_unused_gas_weight(0)
                        .on_contribution_forwarded(dao, sender_id, amount),
                ),
        )
    }

    /// Records the contribution exactly once, only after the forward succeeded (INV-08). Returns the
    /// UNUSED amount: 0 when forwarded, `amount` (→ the token refunds the sender) otherwise.
    #[private]
    pub fn on_contribution_forwarded(&mut self, pot: AccountId, sender_id: AccountId, amount: U128) -> U128 {
        if !promise_ok(0) {
            return amount;
        }
        let Some(mut p) = self.pots.get(&pot).cloned() else { return U128(0) };
        let mut member_total = 0;
        if let Some(mut m) = self.member(p.idx, &sender_id) {
            m.contributed += amount.0;
            member_total = m.contributed;
            self.put_member(p.idx, &sender_id, m);
        }
        p.total_contributed += amount.0;
        p.last_contributor = Some(sender_id.clone());
        self.check_goal_reached(&pot, &p);
        PotEvent::Contribution {
            pot: pot.clone(),
            member: sender_id,
            amount,
            member_total: U128(member_total),
            pot_total: U128(p.total_contributed),
        }
        .emit();
        self.save_pot(&pot, p);
        U128(0)
    }

    // ------------------------------------------------------------------ request_spend (§3.4)

    #[payable]
    pub fn request_spend(
        &mut self,
        pot: AccountId,
        amount: U128,
        receiver_id: AccountId,
        category: Category,
        request_ref: String,
        link: Option<LinkSpec>,
    ) -> Promise {
        let requester = env::predecessor_account_id();
        let mut p = self.pot(&pot);
        let now = now_ms();
        let link = link.map(|l| {
            let pk = pk_bytes(&l.claim_pk).unwrap_or_else(|| fail(ERR_LINK_PK_INVALID));
            let exp = match l.expires_at_ms {
                None => now + DEFAULT_LINK_TTL_MS,
                Some(e) => {
                    check(e > now + MIN_LINK_TTL_MS && e <= now + MAX_LINK_TTL_MS, ERR_LINK_EXPIRY_INVALID);
                    e
                }
            };
            Link { pk, expires_at_ms: exp, status: LinkStatus::AwaitingFunds, receiver: None, funded_at_ms: 0, done_at_ms: 0 }
        });
        let is_link = link.is_some();
        let Decision { path, reason, tier } = self
            .decide(&pot, &p, &requester, amount.0, &receiver_id, Some(&request_ref), is_link)
            .unwrap_or_else(|(code, _)| fail(code));
        let mut req = Request {
            id: p.request_seq,
            requester: requester.clone(),
            receiver_id: receiver_id.clone(),
            amount: amount.0,
            category,
            request_ref,
            path,
            reason,
            status: RequestStatus::Checking,
            proposal_id: None,
            created_at_ms: now,
            updated_at_ms: now,
        };
        let prepay = self.spend_prepay(&p, &req, is_link);
        let sponsored = self.sponsored();
        let excess = self.charge(sponsored, prepay + bytes_cost(STATE_BYTES_REQUEST));
        self.require_free(prepay, excess);
        Self::refund_excess(excess);

        p.request_seq += 1;
        let mut m = self.member(p.idx, &requester).expect("active");
        ledger::apply_transition(&mut p, &mut m, req.amount, None, Some((path, RequestStatus::Checking)));
        self.put_member(p.idx, &requester, m);
        self.requests.insert((p.idx, req.id), req.clone());
        let open_before = self.pext(p.idx).open_links;
        if is_link {
            let mut e = self.pext(p.idx);
            e.open_links += 1;
            self.pot_ext.insert(p.idx, e);
        }
        self.req_ext.insert((p.idx, req.id), RequestExt { tier, ok_by: None, ok_in_flight: false, counted: false, link });
        if is_link {
            self.track_new_link(p.idx, req.id, open_before); // W4-5: a plain pending link until approved
        }
        if path == Path::Instant {
            p.busy_until_ms = now + BUSY_WINDOW_MS;
        }
        req.status = RequestStatus::Checking;
        let usdc = self.config.usdc.clone();
        let id = req.id;
        self.save_pot(&pot, p);

        ext_ft::ext(usdc.clone())
            .with_static_gas(GAS_VIEW)
            .with_unused_gas_weight(0)
            .ft_balance_of(pot.clone())
            .and(ext_ft::ext(usdc).with_static_gas(GAS_VIEW).with_unused_gas_weight(0).storage_balance_of(receiver_id))
            .and(ext_dao::ext(pot.clone()).with_static_gas(GAS_VIEW_DAO).with_unused_gas_weight(0).get_policy())
            .then(
                Self::ext(Self::me())
                    .with_static_gas(if is_link && path == Path::Instant { GAS_ON_SPEND_CHECKED_LINK } else { GAS_ON_SPEND_CHECKED })
                    .with_unused_gas_weight(0)
                    .on_spend_checked(pot, id, U128(prepay)),
            )
    }

    #[private]
    pub fn on_spend_checked(&mut self, pot: AccountId, request_id: u32, prepay: U128) -> PromiseOrValue<SpendOutcome> {
        let balance: Result<U128, ()> = promise_json(0);
        let registration: Result<Option<StorageBalanceLite>, ()> = promise_json(1);
        let policy: Result<DaoPolicyLite, ()> = promise_json(2);
        let Some(p) = self.pots.get(&pot).cloned() else {
            return PromiseOrValue::Value(SpendOutcome::unknown(request_id));
        };
        let Some(req) = self.requests.get(&(p.idx, request_id)).cloned() else {
            return PromiseOrValue::Value(SpendOutcome::unknown(request_id));
        };
        let (Ok(balance), Ok(registration), Ok(policy)) = (balance, registration, policy) else {
            return PromiseOrValue::Value(self.refuse_spend(&pot, p, req, "dao_unavailable"));
        };
        let group = policy.group(ROLE_MEMBER);
        if !group.contains(&req.requester) {
            return PromiseOrValue::Value(self.refuse_spend(&pot, p, req, "not_in_dao_group"));
        }
        // The live DAO Group gates instant payees under the `members` rule (vote-path requests to
        // non-members are legitimate: reason payee_not_allowed).
        let is_link = self.is_link(p.idx, req.id);
        if req.path == Path::Instant && !is_link && p.rules.instant_payees == PayeeRule::Members && !group.contains(&req.receiver_id) {
            return PromiseOrValue::Value(self.refuse_spend(&pot, p, req, "not_in_dao_group"));
        }
        if registration.is_none() {
            return PromiseOrValue::Value(self.refuse_spend(&pot, p, req, "payee_not_registered"));
        }
        let own = if req.path == Path::Instant { req.amount } else { 0 };
        let others = p.reserved.saturating_sub(own);
        if req.amount > balance.0.saturating_sub(others) {
            return PromiseOrValue::Value(self.refuse_spend(&pot, p, req, "insufficient_balance"));
        }
        if !Self::is_open(&p) {
            return PromiseOrValue::Value(self.refuse_spend(&pot, p, req, "pot_not_open"));
        }
        if !self.hub_has_free(prepay.0) {
            return PromiseOrValue::Value(self.refuse_spend(&pot, p, req, "hub_low_balance"));
        }
        let mut p = p;
        let mut req = req;
        let path = req.path;
        self.transition(&mut p, &mut req, Some((path, RequestStatus::Proposing)));
        let desc = spend_description(req.id, req.category, &req.request_ref);
        let kind = self.kind_for(&req, is_link);
        self.save_pot(&pot, p);
        PromiseOrValue::Promise(Self::propose_batch(&pot, prepay.0, &desc, &kind, GAS_ADD).then(
            Self::ext(Self::me())
                .with_static_gas(if is_link && path == Path::Instant { GAS_ON_SPEND_ADDED_LINK } else { GAS_ON_SPEND_ADDED })
                .with_unused_gas_weight(0)
                .on_spend_added(pot, request_id),
        ))
    }

    #[private]
    pub fn on_spend_added(&mut self, pot: AccountId, request_id: u32) -> PromiseOrValue<SpendOutcome> {
        let pid: Result<u64, ()> = promise_json(0);
        let Some(mut p) = self.pots.get(&pot).cloned() else {
            return PromiseOrValue::Value(SpendOutcome::unknown(request_id));
        };
        let Some(mut req) = self.requests.get(&(p.idx, request_id)).cloned() else {
            return PromiseOrValue::Value(SpendOutcome::unknown(request_id));
        };
        let Ok(pid) = pid else {
            // the prepay was refunded with the reverted batch
            return PromiseOrValue::Value(self.refuse_spend(&pot, p, req, "add_failed"));
        };
        req.proposal_id = Some(pid);
        self.subjects.insert((p.idx, pid), Subject::Spend { request_id });
        let path = req.path;
        let next = if path == Path::Vote { RequestStatus::Pending } else { RequestStatus::Approving };
        self.transition(&mut p, &mut req, Some((path, next)));
        let rx = self.rx(p.idx, &req);
        let is_link = rx.link.is_some();
        PotEvent::SpendRequested {
            pot: pot.clone(),
            request_id,
            proposal_id: pid,
            requester: req.requester.clone(),
            receiver_id: req.receiver_id.clone(),
            amount: U128(req.amount),
            category: req.category,
            request_ref: req.request_ref.clone(),
            path: req.path,
            reason: req.reason,
            approvals_needed: approvals_needed(p.member_count),
            tier: rx.tier,
            link: is_link,
        }
        .emit();
        if path == Path::Vote {
            let out = self.spend_outcome(&p, &req, "pending", None);
            self.save_pot(&pot, p);
            return PromiseOrValue::Value(out);
        }
        let kind = self.kind_for(&req, is_link);
        self.save_pot(&pot, p);
        // INV-03: vote only on the id our own add_proposal returned in THIS chain.
        PromiseOrValue::Promise(
            ext_dao::ext(pot.clone())
                .with_static_gas(if is_link { GAS_ACT_LINK } else { GAS_ACT })
                .with_unused_gas_weight(0)
                .act_proposal(pid, DaoAction::VoteApprove, kind, Some("auto: within Pot rules".to_string()))
                .then(ext_dao::ext(pot.clone()).with_static_gas(GAS_VIEW_DAO).with_unused_gas_weight(0).get_proposal(pid))
                .then(
                    Self::ext(Self::me())
                        .with_static_gas(GAS_ON_STATUS)
                        .with_unused_gas_weight(0)
                        .on_spend_status(pot, request_id),
                ),
        )
    }

    #[private]
    pub fn on_spend_status(&mut self, pot: AccountId, request_id: u32) -> SpendOutcome {
        let prop: Result<DaoProposalLite, ()> = promise_json(0);
        let Some(mut p) = self.pots.get(&pot).cloned() else { return SpendOutcome::unknown(request_id) };
        let Some(mut req) = self.requests.get(&(p.idx, request_id)).cloned() else {
            return SpendOutcome::unknown(request_id);
        };
        let pid = req.proposal_id.unwrap_or_default();
        let Ok(prop) = prop else {
            // leave `approving`; sync fixes it
            return self.spend_outcome(&p, &req, "approving", None);
        };
        let hub = Self::me();
        let (new, label): (ledger::State, &str) = match prop.status.as_str() {
            "Approved" => (Some((req.path, RequestStatus::Approved)), "approved"),
            "InProgress" => {
                req.reason = Reason::AutoApproveFailed;
                (Some((Path::Vote, RequestStatus::Pending)), "pending")
            }
            "Rejected" => (Some((req.path, RequestStatus::Rejected)), "rejected"),
            "Failed" => (Some((req.path, RequestStatus::PayoutFailed)), "payout_failed"),
            "Expired" => (Some((req.path, RequestStatus::Expired)), "expired"),
            _ => (Some((req.path, RequestStatus::Removed)), "removed"),
        };
        self.transition(&mut p, &mut req, new);
        match label {
            "approved" => {
                if prop.votes.get(&hub).map(|v| v == "Approve").unwrap_or(false) {
                    let m = self.member(p.idx, &req.requester).expect("requester");
                    PotEvent::SpendAutoApproved {
                        pot: pot.clone(),
                        request_id,
                        proposal_id: pid,
                        requester: req.requester.clone(),
                        receiver_id: req.receiver_id.clone(),
                        amount: U128(req.amount),
                        budget_used: U128(m.instant_used),
                        budget_left: U128(p.rules.member_budget.0.saturating_sub(m.instant_used)),
                    }
                    .emit();
                }
            }
            "pending" => PotEvent::SpendPayoutFailed {
                pot: pot.clone(),
                request_id,
                proposal_id: pid,
                stage: "approve".into(),
                dao_status: prop.status.clone(),
            }
            .emit(),
            "payout_failed" => PotEvent::SpendPayoutFailed {
                pot: pot.clone(),
                request_id,
                proposal_id: pid,
                stage: "payout".into(),
                dao_status: prop.status.clone(),
            }
            .emit(),
            _ => {}
        }
        let out = self.spend_outcome(&p, &req, label, None);
        self.save_pot(&pot, p);
        out
    }

    // ------------------------------------------------------------------ sync (§3.5)

    /// Permissionless and idempotent; allowed in every Pot status and while paused.
    pub fn sync(&mut self, pot: AccountId, proposal_id: u64) -> Promise {
        let p = self.pot(&pot);
        let subject = self.subjects.get(&(p.idx, proposal_id)).cloned().unwrap_or_else(|| fail(ERR_UNKNOWN_PROPOSAL));
        let read = ext_dao::ext(pot.clone()).with_static_gas(GAS_VIEW_DAO).with_unused_gas_weight(0).get_proposal(proposal_id);
        // HUB-4: a close is confirmed only by the DAO's USDC balance (promise 1), never by `Approved`
        // alone (Sputnik stores Approved before its payout callback can set Failed)
        let read = if subject == Subject::Close {
            read.and(ext_ft::ext(self.config.usdc.clone()).with_static_gas(GAS_VIEW).with_unused_gas_weight(0).ft_balance_of(pot.clone()))
        } else {
            read
        };
        read.then(
                Self::ext(Self::me())
                    .with_static_gas(GAS_ON_STATUS)
                    .with_unused_gas_weight(0)
                    .on_sync(pot, proposal_id),
            )
    }

    #[private]
    pub fn on_sync(&mut self, pot: AccountId, proposal_id: u64) -> SyncOutcome {
        let prop: Result<DaoProposalLite, ()> = promise_json(0);
        let Some(mut p) = self.pots.get(&pot).cloned() else {
            return SyncOutcome::unchanged(proposal_id, "unknown", "unavailable", "unknown");
        };
        let Some(subject) = self.subjects.get(&(p.idx, proposal_id)).cloned() else {
            return SyncOutcome::unchanged(proposal_id, "unknown", "unavailable", "unknown");
        };
        let Ok(prop) = prop else {
            return SyncOutcome::unchanged(proposal_id, subject_kind(&subject), "unavailable", "unchanged");
        };
        let expired = dao_status_expired(&prop);
        let ds = if expired && prop.status == "InProgress" { "Expired".to_string() } else { prop.status.clone() };
        match subject {
            Subject::Spend { request_id } => {
                let Some(mut req) = self.requests.get(&(p.idx, request_id)).cloned() else {
                    return SyncOutcome::unchanged(proposal_id, "spend", &prop.status, "unknown");
                };
                let target: Option<(Path, RequestStatus)> = match prop.status.as_str() {
                    "Approved" => Some((req.path, RequestStatus::Approved)),
                    "Failed" => Some((req.path, RequestStatus::PayoutFailed)),
                    "Rejected" => Some((req.path, RequestStatus::Rejected)),
                    "Removed" | "Moved" => Some((req.path, RequestStatus::Removed)),
                    _ if expired => Some((req.path, RequestStatus::Expired)),
                    "InProgress" if req.status == RequestStatus::Approving => {
                        req.reason = Reason::AutoApproveFailed;
                        Some((Path::Vote, RequestStatus::Pending))
                    }
                    _ => None,
                };
                let changed = matches!(target, Some(t) if t != (req.path, req.status));
                if changed {
                    self.transition(&mut p, &mut req, target);
                    if req.status == RequestStatus::PayoutFailed {
                        PotEvent::SpendPayoutFailed {
                            pot: pot.clone(),
                            request_id,
                            proposal_id,
                            stage: "payout".into(),
                            dao_status: prop.status.clone(),
                        }
                        .emit();
                    }
                    let hs = status_str(req.status);
                    self.emit_synced(&pot, proposal_id, "spend", Some(request_id), None, &ds, hs);
                    self.save_pot(&pot, p);
                }
                SyncOutcome { proposal_id, subject: "spend".into(), dao_status: ds, hub_status: status_str(req.status).into(), changed }
            }
            Subject::Join { member } => {
                let Some(m) = self.member(p.idx, &member) else {
                    return SyncOutcome::unchanged(proposal_id, "join", &ds, "removed");
                };
                if m.status != (MemberStatus::Joining { proposal_id: Some(proposal_id) }) {
                    let hs = if m.status == MemberStatus::Active { "active" } else { "joining" };
                    return SyncOutcome::unchanged(proposal_id, "join", &ds, hs);
                }
                let hs = match prop.status.as_str() {
                    "Approved" => {
                        self.activate_joiner(&pot, &mut p, &member, m, proposal_id);
                        "active"
                    }
                    "Rejected" | "Removed" | "Moved" | "Failed" => {
                        self.drop_joiner(&mut p, &member, &m);
                        "removed"
                    }
                    _ if expired => {
                        self.drop_joiner(&mut p, &member, &m);
                        "removed"
                    }
                    _ => return SyncOutcome::unchanged(proposal_id, "join", &ds, "joining"),
                };
                self.emit_synced(&pot, proposal_id, "join", None, Some(member), &ds, hs);
                self.save_pot(&pot, p);
                SyncOutcome { proposal_id, subject: "join".into(), dao_status: ds, hub_status: hs.into(), changed: true }
            }
            Subject::Close => {
                // HUB-4: only `sync` reads the DAO's USDC balance (promise 1); other chains pass none
                let dao_balance: Option<u128> = promise_json::<U128>(1).ok().map(|b| b.0);
                let current = p.status == (PotStatus::Closing { proposal_id });
                let Some(mut rec) = self.closes.get(&p.idx).cloned().filter(|r| r.proposal_id == Some(proposal_id)) else {
                    return SyncOutcome::unchanged(proposal_id, "close", &ds, "replaced");
                };
                if !current {
                    if p.status == PotStatus::Closed && prop.status == "Failed" {
                        // HUB-4: a close confirmed on an earlier read whose payout the DAO now reports
                        // Failed: the money never left, so the Pot is a failed close again (retryable)
                        rec.status = CloseStatus::Failed;
                        p.status = PotStatus::Closing { proposal_id };
                        p.closed_at_ms = 0;
                        self.closes.insert(p.idx, rec);
                        self.emit_synced(&pot, proposal_id, "close", None, None, &ds, "closing");
                        self.save_pot(&pot, p);
                        return SyncOutcome { proposal_id, subject: "close".into(), dao_status: ds, hub_status: "closing".into(), changed: true };
                    }
                    let hs = if p.status == PotStatus::Closed { "closed" } else { "replaced" };
                    return SyncOutcome::unchanged(proposal_id, "close", &ds, hs);
                }
                // HUB-4 / M-2: Sputnik stores `Approved` when the vote passes, before its payout callback
                // can turn it into `Failed`. So `Approved` alone is provisional. It is final when either
                // - the money is visibly out: the payout is ONE atomic batch of ft_transfers paying the
                //   whole balance the close read (Σ payouts == rec.balance), and money in is refused
                //   while closing, so the DAO holding less than that means it was paid (fast path); or
                // - a sync saw it `Approved` at least CLOSE_CONFIRM_BLOCKS ago (the callback has run by
                //   then), so USDC that reaches the DAO afterwards can't keep the Pot settling (M-2).
                // Until then the Pot stays closing ("settling": record Approved). A later `Failed` reopens
                // it as a retryable failed close; USDC left in a Closed Pot can be swept (`propose_sweep`).
                let aged = prop.status == "Approved" && self.close_approved_long_enough(p.idx, proposal_id);
                if prop.status != "Approved" {
                    self.forget_close_seen(p.idx); // only an unbroken run of Approved sightings ages
                }
                let paid = dao_balance.is_some_and(|b| b < rec.balance);
                let (new_status, new_rec): (PotStatus, CloseStatus) = match prop.status.as_str() {
                    "Approved" if paid || aged => (PotStatus::Closed, CloseStatus::Approved),
                    "Approved" => (PotStatus::Closing { proposal_id }, CloseStatus::Approved),
                    "Rejected" | "Removed" | "Moved" => (PotStatus::Open, CloseStatus::Rejected),
                    "Failed" => (PotStatus::Closing { proposal_id }, CloseStatus::Failed),
                    _ if expired => (PotStatus::Open, CloseStatus::Expired),
                    _ => return SyncOutcome::unchanged(proposal_id, "close", &ds, "closing"),
                };
                if rec.status == new_rec && p.status == new_status {
                    return SyncOutcome::unchanged(proposal_id, "close", &ds, pot_status_str(&p.status));
                }
                rec.status = new_rec;
                p.status = new_status.clone();
                if new_status == PotStatus::Closed {
                    p.closed_at_ms = now_ms();
                    if self.pext(p.idx).refund_proposal == Some(proposal_id) {
                        PotEvent::GoalRefunded { pot: pot.clone(), proposal_id }.emit();
                    }
                    PotEvent::PotClosed {
                        pot: pot.clone(),
                        proposal_id,
                        balance: U128(rec.balance),
                        payouts: payout_views(&rec.payouts),
                    }
                    .emit();
                }
                self.closes.insert(p.idx, rec);
                let hs = pot_status_str(&p.status);
                self.emit_synced(&pot, proposal_id, "close", None, None, &ds, hs);
                self.save_pot(&pot, p);
                SyncOutcome { proposal_id, subject: "close".into(), dao_status: ds, hub_status: hs.into(), changed: true }
            }
            Subject::Rules { .. } => {
                let open = p.open_rules_proposal == Some(proposal_id);
                if open && (prop.status != "InProgress" || expired) {
                    p.open_rules_proposal = None;
                    self.emit_synced(&pot, proposal_id, "rules", None, None, &ds, "resolved");
                    self.save_pot(&pot, p);
                    return SyncOutcome { proposal_id, subject: "rules".into(), dao_status: ds, hub_status: "resolved".into(), changed: true };
                }
                let hs = if open { "open" } else { "resolved" };
                SyncOutcome::unchanged(proposal_id, "rules", &ds, hs)
            }
        }
    }

    // ------------------------------------------------------------------ retry_payout (§3.6)

    pub fn retry_payout(&mut self, pot: AccountId, proposal_id: u64) -> Promise {
        let p = self.pot(&pot);
        // HUB-4: the Pot's current close, Failed, is retried by the hub too (not for an Open Pot)
        if self.subjects.get(&(p.idx, proposal_id)) == Some(&Subject::Close) && p.status != PotStatus::Open {
            return self.retry_close(&pot, &p, proposal_id);
        }
        check(Self::is_open(&p), ERR_POT_NOT_OPEN);
        let request_id = match self.subjects.get(&(p.idx, proposal_id)) {
            Some(Subject::Spend { request_id }) => *request_id,
            Some(Subject::Close) | Some(Subject::Rules { .. }) => fail(ERR_USE_DAO_FINALIZE),
            _ => fail(ERR_UNKNOWN_PROPOSAL),
        };
        let req = self.requests.get(&(p.idx, request_id)).cloned().unwrap_or_else(|| fail(ERR_NOT_RETRYABLE));
        check(req.status == RequestStatus::PayoutFailed, ERR_NOT_RETRYABLE);
        let is_link = self.is_link(p.idx, request_id);
        let kind = self.kind_for(&req, is_link);
        // INV-03: Finalize only on hub-tracked Transfer proposals in payout_failed.
        ext_dao::ext(pot.clone())
            .with_static_gas(if is_link { GAS_ACT_LINK } else { GAS_ACT })
            .with_unused_gas_weight(0)
            .act_proposal(proposal_id, DaoAction::Finalize, kind, Some("retry".to_string()))
            .then(ext_dao::ext(pot.clone()).with_static_gas(GAS_VIEW_DAO).with_unused_gas_weight(0).get_proposal(proposal_id))
            .then(
                Self::ext(Self::me())
                    .with_static_gas(GAS_ON_STATUS)
                    .with_unused_gas_weight(0)
                    .on_retry_status(pot, proposal_id),
            )
    }

    /// HUB-4 / HUB-6: re-runs the payout of the Pot's CURRENT close after it failed (e.g. a payee
    /// wasn't registered on the token), as rulebot `Finalize` (policy v2+; members of v3 / v4 Pots
    /// can't finalize). Never an older close: one replaced by a re-proposal can't pay out later.
    /// Like any approval, the result is provisional: the Pot stays closing until `sync` sees the
    /// money out of the DAO.
    fn retry_close(&mut self, pot: &AccountId, p: &Pot, proposal_id: u64) -> Promise {
        check(p.status == (PotStatus::Closing { proposal_id }), ERR_NOT_RETRYABLE);
        let rec = self
            .closes
            .get(&p.idx)
            .cloned()
            .filter(|r| r.proposal_id == Some(proposal_id) && r.status == CloseStatus::Failed)
            .unwrap_or_else(|| fail(ERR_NOT_RETRYABLE));
        check(policy_rulebot_finalizes_call(self.pext(p.idx).policy_v), ERR_USE_DAO_FINALIZE);
        self.forget_close_seen(p.idx); // M-2: the re-run payout's `Approved` must age from now
        let kind = close_kind(&self.config.usdc, &rec.payouts);
        ext_dao::ext(pot.clone())
            .with_static_gas(close_act_gas(rec.payouts.len()))
            .with_unused_gas_weight(0)
            .act_proposal(proposal_id, DaoAction::Finalize, kind, Some("retry".to_string()))
            .then(ext_dao::ext(pot.clone()).with_static_gas(GAS_VIEW_DAO).with_unused_gas_weight(0).get_proposal(proposal_id))
            .then(Self::ext(Self::me()).with_static_gas(GAS_ON_STATUS).with_unused_gas_weight(0).on_sync(pot.clone(), proposal_id))
    }

    #[private]
    pub fn on_retry_status(&mut self, pot: AccountId, proposal_id: u64) -> RetryOutcome {
        let prop: Result<DaoProposalLite, ()> = promise_json(0);
        let unchanged = |ds: &str, hs: &str| RetryOutcome { proposal_id, retried: false, dao_status: ds.into(), hub_status: hs.into() };
        let Some(mut p) = self.pots.get(&pot).cloned() else { return unchanged("unavailable", "unknown") };
        let Some(Subject::Spend { request_id }) = self.subjects.get(&(p.idx, proposal_id)).cloned() else {
            return unchanged("unavailable", "unknown");
        };
        let Some(mut req) = self.requests.get(&(p.idx, request_id)).cloned() else { return unchanged("unavailable", "unknown") };
        let Ok(prop) = prop else { return unchanged("unavailable", status_str(req.status)) };
        let target = match prop.status.as_str() {
            "Approved" => RequestStatus::Approved,
            "Expired" => RequestStatus::Expired,
            _ => return unchanged(&prop.status, status_str(req.status)),
        };
        if req.status == target {
            return unchanged(&prop.status, status_str(req.status));
        }
        let path = req.path;
        self.transition(&mut p, &mut req, Some((path, target)));
        self.emit_synced(&pot, proposal_id, "spend", Some(request_id), None, &prop.status, status_str(target));
        self.save_pot(&pot, p);
        RetryOutcome { proposal_id, retried: target == RequestStatus::Approved, dao_status: prop.status, hub_status: status_str(target).into() }
    }

    // ------------------------------------------------------------------ invites + join (§3.7)

    #[payable]
    pub fn add_invite(&mut self, pot: AccountId, invite_pk: PublicKey, expires_at_ms: Option<u64>, max_uses: Option<u32>) -> InviteView {
        let by = env::predecessor_account_id();
        let mut p = self.pot(&pot);
        check(self.active_member(p.idx, &by).is_some(), ERR_NOT_MEMBER);
        check(Self::is_open(&p), ERR_POT_NOT_OPEN);
        check(!self.config.paused, ERR_PAUSED);
        let pk = pk_bytes(&invite_pk).unwrap_or_else(|| fail(ERR_INVITE_PK_INVALID));
        check(!self.invites.contains_key(&(p.idx, pk)), ERR_INVITE_EXISTS);
        let now = now_ms();
        let expires = match expires_at_ms {
            None => now + DEFAULT_INVITE_TTL_MS,
            Some(e) => {
                check(e > now + MIN_INVITE_TTL_MS && e <= now + MAX_INVITE_TTL_MS, ERR_INVITE_EXPIRY_INVALID);
                e
            }
        };
        let uses = match max_uses {
            None => DEFAULT_INVITE_MAX_USES,
            Some(u) => {
                check((1..=MAX_INVITE_USES).contains(&u), ERR_INVITE_MAX_USES_INVALID);
                u
            }
        };
        check(
            p.active_invites < self.config.limits.max_active_invites && p.invites_total < self.config.limits.max_invites_total,
            ERR_TOO_MANY_INVITES,
        );
        let excess = self.charge(self.sponsored(), bytes_cost(STATE_BYTES_INVITE));
        self.require_free(0, excess);
        Self::refund_excess(excess);
        let inv = Invite { created_by: by.clone(), created_at_ms: now, expires_at_ms: expires, max_uses: uses, uses: 0, revoked_at_ms: None };
        self.invites.insert((p.idx, pk), inv.clone());
        p.active_invites += 1;
        p.invites_total += 1;
        PotEvent::InviteAdded { pot: pot.clone(), invite_pk: pk_string(&pk), by, expires_at_ms: expires, max_uses: uses }.emit();
        self.save_pot(&pot, p);
        invite_view(&pot, &pk, &inv)
    }

    /// Any Active member may revoke any invite of the Pot. Allowed while paused.
    pub fn revoke_invite(&mut self, pot: AccountId, invite_pk: PublicKey) {
        let by = env::predecessor_account_id();
        let mut p = self.pot(&pot);
        check(self.active_member(p.idx, &by).is_some(), ERR_NOT_MEMBER);
        let pk = pk_bytes(&invite_pk).unwrap_or_else(|| fail(ERR_INVITE_NOT_FOUND));
        let mut inv = self.invites.get(&(p.idx, pk)).cloned().unwrap_or_else(|| fail(ERR_INVITE_NOT_FOUND));
        check(inv.revoked_at_ms.is_none(), ERR_INVITE_REVOKED);
        inv.revoked_at_ms = Some(now_ms());
        self.invites.insert((p.idx, pk), inv);
        p.active_invites = p.active_invites.saturating_sub(1);
        PotEvent::InviteRevoked { pot: pot.clone(), invite_pk: pk_string(&pk), by }.emit();
        self.save_pot(&pot, p);
    }

    #[payable]
    pub fn join(&mut self, pot: AccountId, invite_pk: PublicKey, signature: Base64VecU8) -> Promise {
        let joiner = env::predecessor_account_id();
        let mut p = self.pot(&pot);
        check(!self.config.paused, ERR_PAUSED);
        check(Self::is_open(&p), ERR_POT_NOT_OPEN);
        check(self.member(p.idx, &joiner).is_none(), ERR_ALREADY_MEMBER);
        check(p.member_count + p.joining_count < self.config.limits.max_members, ERR_POT_FULL);
        let n_pots = self.pots_of.get(&joiner).map(|v| v.len()).unwrap_or(0);
        check((n_pots as u32) < self.config.limits.max_pots_per_account, ERR_TOO_MANY_POTS);
        let pk = pk_bytes(&invite_pk).unwrap_or_else(|| fail(ERR_INVITE_NOT_FOUND));
        let mut inv = self.invites.get(&(p.idx, pk)).cloned().unwrap_or_else(|| fail(ERR_INVITE_NOT_FOUND));
        check(inv.revoked_at_ms.is_none(), ERR_INVITE_REVOKED);
        let now = now_ms();
        check(now < inv.expires_at_ms, ERR_INVITE_EXPIRED);
        check(inv.uses < inv.max_uses, ERR_INVITE_USED_UP);
        let sig: [u8; 64] = signature.0.as_slice().try_into().unwrap_or_else(|_| fail(ERR_BAD_SIGNATURE));
        let msg = format!("{JOIN_DOMAIN}:{pot}:{joiner}");
        check(env::ed25519_verify(&sig, msg.as_bytes(), &pk), ERR_BAD_SIGNATURE);
        check(joiner != Self::me(), ERR_BAD_SIGNATURE);
        let kind = join_kind(&joiner);
        let desc = join_description();
        let prepay = bytes_cost(prepay_bytes(&desc, &kind, 0));
        let excess = self.charge(self.sponsored(), prepay + bytes_cost(STATE_BYTES_JOIN));
        self.require_free(prepay, excess);
        Self::refund_excess(excess);

        inv.uses += 1;
        self.invites.insert((p.idx, pk), inv);
        let join_index = p.next_join_index;
        p.next_join_index += 1;
        p.joining_count += 1;
        self.put_member(
            p.idx,
            &joiner,
            Member {
                join_index,
                status: MemberStatus::Joining { proposal_id: None },
                joined_at_ms: now,
                invite_pk: Some(pk),
                contributed: 0,
                instant_used: 0,
                spent: 0,
                pending_votes: 0,
            },
        );
        self.member_list.insert((p.idx, join_index), joiner.clone());
        self.save_pot(&pot, p);
        Self::propose_batch(&pot, prepay, &desc, &kind, GAS_ADD).then(
            Self::ext(Self::me())
                .with_static_gas(GAS_ON_JOIN_ADDED)
                .with_unused_gas_weight(0)
                .on_join_added(pot, joiner),
        )
    }

    #[private]
    pub fn on_join_added(&mut self, pot: AccountId, member: AccountId) -> PromiseOrValue<JoinOutcome> {
        let pid: Result<u64, ()> = promise_json(0);
        let Some(mut p) = self.pots.get(&pot).cloned() else { return PromiseOrValue::Value(JoinOutcome::failed("unknown")) };
        let Some(mut m) = self.member(p.idx, &member) else { return PromiseOrValue::Value(JoinOutcome::failed("unknown")) };
        let Ok(pid) = pid else {
            self.drop_joiner(&mut p, &member, &m);
            self.save_pot(&pot, p);
            return PromiseOrValue::Value(JoinOutcome::failed("add_failed"));
        };
        m.status = MemberStatus::Joining { proposal_id: Some(pid) };
        self.put_member(p.idx, &member, m);
        self.subjects.insert((p.idx, pid), Subject::Join { member: member.clone() });
        self.save_pot(&pot, p);
        PromiseOrValue::Promise(
            ext_dao::ext(pot.clone())
                .with_static_gas(GAS_ACT_JOIN)
                .with_unused_gas_weight(0)
                .act_proposal(pid, DaoAction::VoteApprove, join_kind(&member), Some("auto: valid Pot invite".to_string()))
                .then(ext_dao::ext(pot.clone()).with_static_gas(GAS_VIEW_DAO).with_unused_gas_weight(0).get_proposal(pid))
                .then(
                    Self::ext(Self::me())
                        .with_static_gas(GAS_ON_STATUS)
                        .with_unused_gas_weight(0)
                        .on_join_status(pot, member),
                ),
        )
    }

    #[private]
    pub fn on_join_status(&mut self, pot: AccountId, member: AccountId) -> JoinOutcome {
        let prop: Result<DaoProposalLite, ()> = promise_json(0);
        let Some(mut p) = self.pots.get(&pot).cloned() else { return JoinOutcome::failed("unknown") };
        let Some(m) = self.member(p.idx, &member) else { return JoinOutcome::failed("unknown") };
        let MemberStatus::Joining { proposal_id: Some(pid) } = m.status else {
            return JoinOutcome { ok: m.status == MemberStatus::Active, status: "active".into(), proposal_id: None, reason: None };
        };
        match prop.as_ref().map(|x| x.status.as_str()) {
            Ok("Approved") => {
                self.activate_joiner(&pot, &mut p, &member, m, pid);
                self.save_pot(&pot, p);
                JoinOutcome { ok: true, status: "active".into(), proposal_id: Some(pid), reason: None }
            }
            // the group may still approve; sync activates it. Err: leave it for sync too.
            Ok("InProgress") | Err(_) => JoinOutcome { ok: true, status: "pending".into(), proposal_id: Some(pid), reason: None },
            Ok(other) => {
                let reason = if other == "Rejected" { "rejected" } else { "failed" };
                self.drop_joiner(&mut p, &member, &m);
                self.save_pot(&pot, p);
                JoinOutcome { ok: false, status: "failed".into(), proposal_id: Some(pid), reason: Some(reason.into()) }
            }
        }
    }

    // ------------------------------------------------------------------ rules (§3.8)

    pub fn set_rules(&mut self, pot: AccountId, rules: Rules, extras: Option<RuleExtras>) -> RulesOutcome {
        let caller = env::predecessor_account_id();
        let mut p = self.pot(&pot);
        check(self.validate_rules(&rules), ERR_RULES_INVALID);
        let cur = self.pext(p.idx);
        if let Some(x) = &extras {
            if let Err(code) = self.validate_extras(&rules, x, Some((&p, &cur))) {
                fail(code);
            }
        }
        let by = if caller == pot {
            // a group-approved `call` proposal executing in the DAO; never blocked by pause
            check(p.status != PotStatus::Closed, ERR_POT_NOT_OPEN);
            "group"
        } else if self.pots.contains_key(&caller) {
            fail(ERR_NOT_POT_DAO)
        } else if self.active_member(p.idx, &caller).is_some() {
            check(p.member_count == 1 && p.joining_count == 0, ERR_USE_PROPOSE_RULES);
            check(Self::is_open(&p), ERR_POT_NOT_OPEN);
            check(!self.config.paused, ERR_PAUSED);
            "sole_member"
        } else {
            fail(ERR_NOT_MEMBER)
        };
        p.rules = rules.clone();
        p.rules_version += 1;
        let v = p.rules_version;
        PotEvent::RulesChanged { pot: pot.clone(), rules, rules_version: v, by: by.into(), actor: caller }.emit();
        if let Some(x) = extras {
            let mut e = cur;
            if e.extras.goal != x.goal {
                e.goal_reached_at_ms = 0;
            }
            e.extras = x;
            PotEvent::RuleExtrasSet { pot: pot.clone(), extras: e.extras.clone(), rules_version: v, policy_version: e.policy_v }.emit();
            self.pot_ext.insert(p.idx, e);
            self.check_goal_reached(&pot, &p);
        }
        self.save_pot(&pot, p);
        RulesOutcome { applied: true, proposal_id: None, rules_version: v, reason: None }
    }

    #[payable]
    pub fn propose_rules(&mut self, pot: AccountId, rules: Rules, extras: Option<RuleExtras>) -> Promise {
        let by = env::predecessor_account_id();
        let mut p = self.pot(&pot);
        check(self.active_member(p.idx, &by).is_some(), ERR_NOT_MEMBER);
        check(Self::is_open(&p), ERR_POT_NOT_OPEN);
        check(!self.config.paused, ERR_PAUSED);
        check(self.validate_rules(&rules), ERR_RULES_INVALID);
        check(p.open_rules_proposal.is_none(), ERR_RULES_PENDING);
        if let Some(x) = &extras {
            let cur = self.pext(p.idx);
            if let Err(code) = self.validate_extras(&rules, x, Some((&p, &cur))) {
                fail(code);
            }
        }
        let version = p.rules_version + 1;
        let kind = rules_kind(&Self::me(), &pot, &rules, extras.as_ref());
        let desc = rules_description(version);
        let prepay = bytes_cost(prepay_bytes(&desc, &kind, p.member_count));
        let excess = self.charge(self.sponsored(), prepay + bytes_cost(STATE_BYTES_RULES));
        self.require_free(prepay, excess);
        Self::refund_excess(excess);
        // reserve the single rules slot synchronously (u64::MAX = proposal in flight)
        p.open_rules_proposal = Some(u64::MAX);
        self.save_pot(&pot, p);
        Self::propose_batch(&pot, prepay, &desc, &kind, GAS_ADD).then(
            Self::ext(Self::me())
                .with_static_gas(GAS_ON_RULES_ADDED)
                .with_unused_gas_weight(0)
                .on_rules_added(pot, version, rules, by),
        )
    }

    #[private]
    pub fn on_rules_added(&mut self, pot: AccountId, version: u32, rules: Rules, by: AccountId) -> RulesOutcome {
        let pid: Result<u64, ()> = promise_json(0);
        let Some(mut p) = self.pots.get(&pot).cloned() else {
            return RulesOutcome { applied: false, proposal_id: None, rules_version: 0, reason: Some("unknown".into()) };
        };
        let current = p.rules_version;
        match pid {
            Ok(pid) => {
                self.subjects.insert((p.idx, pid), Subject::Rules { version });
                p.open_rules_proposal = Some(pid);
                PotEvent::RulesChangeProposed { pot: pot.clone(), proposal_id: pid, by, rules, rules_version: version }.emit();
                self.save_pot(&pot, p);
                RulesOutcome { applied: false, proposal_id: Some(pid), rules_version: current, reason: None }
            }
            Err(_) => {
                p.open_rules_proposal = None;
                self.save_pot(&pot, p);
                RulesOutcome { applied: false, proposal_id: None, rules_version: current, reason: Some("add_failed".into()) }
            }
        }
    }

    // ------------------------------------------------------------------ close (§3.9)

    /// Allowed even while paused (close is the exit path).
    #[payable]
    pub fn propose_close(&mut self, pot: AccountId) -> Promise {
        let by = env::predecessor_account_id();
        let mut p = self.pot(&pot);
        check(self.active_member(p.idx, &by).is_some(), ERR_NOT_MEMBER);
        let rec = self.closes.get(&p.idx).cloned();
        match &p.status {
            PotStatus::Open => {}
            PotStatus::Closing { .. } if rec.as_ref().map(|r| r.status) == Some(CloseStatus::Failed) => {}
            PotStatus::Closing { .. } => fail(ERR_CLOSE_IN_PROGRESS),
            PotStatus::Closed => fail(ERR_POT_NOT_OPEN),
        }
        let now = now_ms();
        check(p.closing_until_ms <= now, ERR_CLOSE_IN_PROGRESS);
        if let Some(r) = &rec {
            let cooled = matches!(r.status, CloseStatus::Rejected | CloseStatus::Expired)
                && r.proposed_by == by
                && now < r.created_at_ms + CLOSE_COOLDOWN_MS;
            check(!cooled, ERR_CLOSE_COOLDOWN);
        }
        let (prepay, n) = self.close_prepay_upper_bound(&p);
        let state = bytes_cost(STATE_BYTES_CLOSE_BASE + STATE_BYTES_CLOSE_PER_PAYEE * n as u64);
        let excess = self.charge(self.sponsored(), prepay + state);
        check(p.busy_until_ms <= now, ERR_POT_BUSY);
        check(p.unpaid_approved == 0 && p.reserved == 0, ERR_PAYOUTS_PENDING);
        // W4-5 / M-1: every open link blocks a close except plain pending requests (not approved, no
        // OK in flight); while the Pot is closing the hub refuses to fund those, so no escrow outlives it
        check(self.links_blocking_close(p.idx) == 0, ERR_LINKS_PENDING);
        // hub 1.2.0: a gift forward still pending would land after the balance read
        let gifts = self.gifts_of(p.idx);
        check(!gifts.in_flight_at(now), ERR_GIFT_IN_FLIGHT);
        // a gifts-only Pot can close too (split equally, prorata::close_split)
        check(p.total_contributed > 0 || gifts.total > 0, ERR_NO_CONTRIBUTIONS);
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
                    .on_close_balance(pot, by, U128(prepay)),
            )
    }

    #[private]
    pub fn on_close_balance(&mut self, pot: AccountId, by: AccountId, prepay: U128) -> PromiseOrValue<CloseOutcome> {
        let balance: Result<U128, ()> = promise_json(0);
        let Some(p) = self.pots.get(&pot).cloned() else { return PromiseOrValue::Value(CloseOutcome::failed("unknown")) };
        let fail_out = |hub: &mut Self, mut p: Pot, reason: &str| {
            p.closing_until_ms = 0;
            hub.save_pot(&pot, p);
            PromiseOrValue::Value(CloseOutcome::failed(reason))
        };
        let Ok(balance) = balance else { return fail_out(self, p, "balance_unavailable") };
        let contribs = self.contributions(&p);
        // pro-rata to contributions; equal shares when nobody contributed (gifts only, hub 1.2.0)
        let Some(pr) = prorata::close_split(balance.0, &contribs, p.last_contributor.as_ref()) else {
            return fail_out(self, p, "nothing_to_refund");
        };
        let kind = close_kind(&self.config.usdc, &pr.payouts);
        let desc = close_description(balance.0, pr.payouts.len());
        // the call-time upper bound always covers the real proposal (amount strings ≤ max width)
        let prepay = prepay.0.max(bytes_cost(prepay_bytes(&desc, &kind, p.member_count)));
        if !self.hub_has_free(prepay) {
            return fail_out(self, p, "hub_low_balance");
        }
        PromiseOrValue::Promise(Self::propose_batch(&pot, prepay, &desc, &kind, GAS_ADD_CLOSE).then(
            Self::ext(Self::me())
                .with_static_gas(GAS_ON_CLOSE_ADDED)
                .with_unused_gas_weight(0)
                .on_close_added(pot, by, balance, payout_views(&pr.payouts), U128(pr.dust), pr.dust_to),
        ))
    }

    #[private]
    pub fn on_close_added(
        &mut self,
        pot: AccountId,
        by: AccountId,
        balance: U128,
        payouts: Vec<PayoutView>,
        dust: U128,
        dust_to: AccountId,
    ) -> CloseOutcome {
        let pid: Result<u64, ()> = promise_json(0);
        let Some(mut p) = self.pots.get(&pot).cloned() else { return CloseOutcome::failed("unknown") };
        p.closing_until_ms = 0;
        let Ok(pid) = pid else {
            self.save_pot(&pot, p);
            return CloseOutcome::failed("add_failed");
        };
        p.status = PotStatus::Closing { proposal_id: pid };
        let rec = CloseRecord {
            proposal_id: Some(pid),
            status: CloseStatus::Pending,
            balance: balance.0,
            payouts: payouts.iter().map(|x| (x.account_id.clone(), x.amount.0)).collect(),
            dust: dust.0,
            dust_to: dust_to.clone(),
            proposed_by: by.clone(),
            created_at_ms: now_ms(),
        };
        self.closes.insert(p.idx, rec);
        self.subjects.insert((p.idx, pid), Subject::Close);
        if by == Self::me() {
            // the hub's own refund close of a missed all-or-nothing goal (refund_unfunded)
            let mut e = self.pext(p.idx);
            e.refund_proposal = Some(pid);
            if let Some(goal) = e.extras.goal.clone() {
                PotEvent::GoalRefundProposed { pot: pot.clone(), proposal_id: pid, goal, total: U128(p.total_contributed) }.emit();
            }
            self.pot_ext.insert(p.idx, e);
        }
        PotEvent::CloseProposed {
            pot: pot.clone(),
            proposal_id: pid,
            by,
            balance,
            payouts: payouts.clone(),
            dust,
            dust_to: dust_to.clone(),
        }
        .emit();
        let needed = approvals_needed(p.member_count);
        self.save_pot(&pot, p);
        CloseOutcome { ok: true, proposal_id: Some(pid), balance: Some(balance), payouts, dust: Some(dust), dust_to: Some(dust_to), approvals_needed: Some(needed), reason: None }
    }
}

/// Gas for the vote / Finalize that executes a close: the DAO pays every ft_transfer (5 Tgas each),
/// ≈ 15 + 6·n burnt (CALIBRATION §4); capped so the whole call fits in 300 Tgas.
pub(crate) fn close_act_gas(payees: usize) -> Gas {
    Gas::from_tgas((20 + 6 * payees as u64).min(265))
}

/// An all-or-nothing goal that isn't reached yet blocks spends (collecting or missed).
pub(crate) fn goal_blocks_spends(e: &PotExt) -> bool {
    e.extras.goal.as_ref().is_some_and(|g| g.all_or_nothing) && e.goal_reached_at_ms == 0
}

/// An all-or-nothing goal whose deadline passed without being reached.
pub(crate) fn goal_missed(e: &PotExt, now: u64) -> bool {
    goal_blocks_spends(e) && e.extras.goal.as_ref().is_some_and(|g| now >= g.deadline_ms)
}

pub(crate) fn subject_kind(s: &Subject) -> &'static str {
    match s {
        Subject::Spend { .. } => "spend",
        Subject::Join { .. } => "join",
        Subject::Close => "close",
        Subject::Rules { .. } => "rules",
    }
}

pub(crate) fn pot_status_str(s: &PotStatus) -> &'static str {
    match s {
        PotStatus::Open => "open",
        PotStatus::Closing { .. } => "closing",
        PotStatus::Closed => "closed",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slug_rules() {
        for ok in ["ab", "lisbon-trip", "lisbon-trip-7k2f", "a1", "0123456789abcdef0123456789abcdef"] {
            assert!(valid_slug(ok), "{ok}");
        }
        for bad in ["a", "-ab", "ab-", "a--b", "a_b", "a.b", "AB", "lisbon trip", "0123456789abcdef0123456789abcdef0", ""] {
            assert!(!valid_slug(bad), "{bad}");
        }
    }

    #[test]
    fn name_and_emoji_rules() {
        assert!(valid_name("Lisbon Trip"));
        assert!(valid_name("Été à Lisboa 🇵🇹"));
        assert!(!valid_name(""));
        assert!(!valid_name("a\u{0007}b"));
        assert!(!valid_name("a\u{202E}b")); // RTL override (Cf)
        assert!(!valid_name("a\u{200B}b")); // zero-width space (Cf)
        assert!(valid_name("a\u{200D}b")); // ZWJ allowed
        assert!(!valid_name(&"x".repeat(49)));
        assert!(valid_name(&"x".repeat(48)));
        assert!(valid_emoji("🇵🇹"));
        assert!(valid_emoji("👩\u{200D}🚀")); // ZWJ sequence, 11 bytes
        assert!(!valid_emoji("👩\u{200D}👩\u{200D}👧")); // 18 bytes > 16
        assert!(valid_emoji("❤\u{FE0F}"));
        assert!(!valid_emoji(""));
        assert!(!valid_emoji("a"));
        assert!(!valid_emoji("1\u{FE0F}\u{20E3}")); // keycap contains ASCII
        assert!(!valid_emoji("🇵🇹🇵🇹🇵🇹")); // 24 bytes
        assert!(!valid_emoji("\u{200B}"));
    }

    #[test]
    fn request_ref_rules() {
        assert!(valid_request_ref("k3d9x1a2b4c6m7n8"));
        assert!(valid_request_ref("abcdefgh"));
        assert!(!valid_request_ref("abcdefg"));
        assert!(!valid_request_ref("ABCDEFGH"));
        assert!(!valid_request_ref(&"a".repeat(33)));
    }

    #[test]
    fn approvals() {
        assert_eq!(approvals_needed(1), 1);
        assert_eq!(approvals_needed(2), 2);
        assert_eq!(approvals_needed(3), 2);
        assert_eq!(approvals_needed(4), 3);
        assert_eq!(approvals_needed(30), 16);
        assert_eq!(approvals_needed(40), 21);
    }

    fn code_only(src: &str) -> String {
        src.split("#[cfg(test)]\nmod tests")
            .next()
            .unwrap()
            .lines()
            .filter(|l| !l.trim_start().starts_with("//"))
            .collect::<Vec<_>>()
            .join("\n")
    }

    /// T-85 (static): the hub's DAO actions are VoteApprove and Finalize only, and the DAO call
    /// surface is act_proposal / get_proposal / get_policy (+ the add_proposal batch builder).
    #[test]
    fn dao_action_surface() {
        assert_eq!(to_json(&DaoAction::VoteApprove), "\"VoteApprove\"");
        assert_eq!(to_json(&DaoAction::Finalize), "\"Finalize\"");
        let ext = include_str!("ext.rs");
        let trait_body = ext.split("pub trait Dao {").nth(1).unwrap().split('}').next().unwrap();
        let fns: Vec<&str> = trait_body.lines().filter(|l| l.trim_start().starts_with("fn ")).collect();
        assert_eq!(fns.len(), 3, "ext_dao must have exactly act_proposal, get_proposal, get_policy");
        let all = [
            code_only(include_str!("lib.rs")),
            code_only(ext),
            code_only(include_str!("kinds.rs")),
            code_only(include_str!("wave4.rs")),
            code_only(include_str!("gifts.rs")),
            code_only(include_str!("security.rs")),
        ]
        .concat();
        for forbidden in ["RemoveProposal", "VoteReject", "VoteRemove", "store_blob", "remove_blob", "\"update\"", "deploy_contract", "add_full_access_key", "delete_account"] {
            assert!(!all.contains(forbidden), "{forbidden} appears in hub code");
        }
        let calls: Vec<&str> = all.matches("ext_dao::ext(").collect();
        assert!(!calls.is_empty());
    }

    /// T-95 (static): the only `Promise::transfer` sites are the float, the prepay batch, the
    /// USDC registration deposit (attached deposit, not a transfer) and the excess refund (INV-15).
    #[test]
    fn transfer_sites() {
        let code = code_only(include_str!("lib.rs"));
        assert_eq!(code.matches(".transfer(").count(), 3, "float, prepay batch, excess refund");
        // wave 4 moves USDC (claim / return) only as ft_transfer function calls, never NEAR transfers
        assert_eq!(code_only(include_str!("wave4.rs")).matches(".transfer(").count(), 0);
        // hub 1.2.0: gifts move USDC only (the forward to the DAO), never NEAR
        assert_eq!(code_only(include_str!("gifts.rs")).matches(".transfer(").count(), 0);
        // hub 1.3.0: the security module moves no money itself (a sweep is a DAO proposal members approve)
        assert_eq!(code_only(include_str!("security.rs")).matches(".transfer(").count(), 0);
        assert_eq!(code_only(include_str!("security.rs")).matches("ft_transfer").count(), 0);
    }
}
