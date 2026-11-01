//! The complete v1 hub state layout (contracts-spec §2), including the Phase-2 fields
//! (`CloseRecord`, `Subject::{Close, Rules}`, `RequestStatus::Removed`) so later releases stay
//! layout-compatible (C-02). Borsh layouts here are FROZEN once prod v1 ships (C-13).

use near_sdk::json_types::{Base58CryptoHash, U128};
use near_sdk::{near, AccountId, BorshStorageKey, NearToken};

// ---------------------------------------------------------------------------------------------
// Constants (contracts-spec §2.3)
// ---------------------------------------------------------------------------------------------

pub const VERSION: &str = "1.1.0";
pub const ROLE_MEMBER: &str = "member";
pub const ROLE_RULEBOT: &str = "rulebot";
pub const PROPOSAL_PERIOD_NS: u64 = 604_800_000_000_000; // 7 days (D-04)
pub const PROPOSAL_PERIOD_MS: u64 = 604_800_000;
pub const JOIN_DOMAIN: &str = "pot-join:v1";
/// Pay-by-link claims sign `pot-claim:v1:<hub>:<dao>:<request_id>:<receiver>` (wave 4).
pub const CLAIM_DOMAIN: &str = "pot-claim:v1";
pub const MIN_SLUG_LEN: usize = 2;
pub const MAX_SLUG_LEN: usize = 32;
pub const MAX_ACCOUNT_LEN: usize = 64;
pub const MAX_NAME_CHARS: usize = 48;
pub const MAX_EMOJI_BYTES: usize = 16;
pub const MAX_ALLOWLIST: usize = 10;
/// 1e15 = $1B at 6 dp: keeps `balance × c_i ≤ 1e30 < u128::MAX` (INV-13).
pub const MAX_AMOUNT: u128 = 1_000_000_000_000_000;
pub const HARD_MAX_MEMBERS: u32 = 40;
pub const DEFAULT_INVITE_TTL_MS: u64 = 7 * 86_400_000;
pub const DEFAULT_INVITE_MAX_USES: u32 = 10;
pub const MAX_INVITE_TTL_MS: u64 = 30 * 86_400_000;
pub const MIN_INVITE_TTL_MS: u64 = 60_000;
pub const MAX_INVITE_USES: u32 = 40;
pub const CLOSE_COOLDOWN_MS: u64 = 86_400_000;
pub const BUSY_WINDOW_MS: u64 = 60_000;
pub const CLOSING_WINDOW_MS: u64 = 60_000;
pub const DAY_MS: u64 = 86_400_000;
pub const MAX_RELAYERS: usize = 4;

pub const MILLI_NEAR: u128 = 1_000_000_000_000_000_000_000;
pub const MIN_DAO_FLOAT_BOUND: u128 = 50 * MILLI_NEAR; // 0.05 NEAR
pub const MAX_DAO_FLOAT: u128 = 500 * MILLI_NEAR; // 0.5 NEAR
pub const MIN_HUB_RESERVE_BOUND: u128 = 500 * MILLI_NEAR; // 0.5 NEAR
pub const MAX_HUB_RESERVE: u128 = 50_000 * MILLI_NEAR; // 50 NEAR
/// `storage_balance_bounds` of the token (✅ 0.00125 NEAR).
pub const USDC_STORAGE_DEPOSIT: u128 = 1_250_000_000_000_000_000_000;

// Per-proposal prepay model (contracts-spec §3.11; calibrated in C-09, see CALIBRATION.md).
pub const PREPAY_PROPOSAL_OVERHEAD_BYTES: u64 = 250;
pub const PREPAY_FIRST_VOTE_BYTES: u64 = 160;
pub const PREPAY_EXTRA_VOTE_BYTES: u64 = 100;

// Hub state budgets per hub-funded op: the bytes a direct (unsponsored) caller pays for
// (`cost(op)`, contracts-spec §3.0). Upper bounds at the §2.2 limits; C-09 measured the real
// growth (CALIBRATION.md) and these keep ≥ 1.5× margin.
pub const STATE_BYTES_CREATE: u64 = 1_500;
pub const STATE_BYTES_JOIN: u64 = 700;
pub const STATE_BYTES_REQUEST: u64 = 800; // wave 4: + RequestExt (tier, link) ≈ 150 B
pub const STATE_BYTES_INVITE: u64 = 300;
pub const STATE_BYTES_RULES: u64 = 200;
pub const STATE_BYTES_CLOSE_BASE: u64 = 400;
pub const STATE_BYTES_CLOSE_PER_PAYEE: u64 = 110;

// Wave 4: earned trust, one-OK tier, pay by link, all-or-nothing goal (notes/contracts-wave4.md).
/// Qualifying settled spends per trust level.
pub const TRUST_STEP: u8 = 3;
pub const TRUST_MAX_LEVEL: u8 = 2;
/// A settled spend counts toward the next level only if `amount × 10 ≥ base instant_cap`
/// (no levelling up with dust).
pub const TRUST_MIN_SPEND_DIV: u128 = 10;
/// The default one-OK ceiling for new Pots: 3 × the base instant cap.
pub const DEFAULT_ONE_OK_MULT: u128 = 3;
pub const DEFAULT_LINK_TTL_MS: u64 = 14 * 86_400_000;
pub const MIN_LINK_TTL_MS: u64 = 60_000;
pub const MAX_LINK_TTL_MS: u64 = 30 * 86_400_000;
/// A requester may take back an approved-but-unfunded link only this long after approval.
pub const LINK_SETTLE_MS: u64 = 60_000;
pub const MIN_GOAL_LEAD_MS: u64 = 60_000;
pub const MAX_GOAL_LEAD_MS: u64 = 366 * 86_400_000;
pub const STATE_BYTES_CLAIM: u64 = 100;
pub const LINK_MEMO: &str = "pot link payout";
pub const LINK_RETURN_MEMO: &str = "pot link returned";
/// Policy template versions (`PotExt.policy_v`): 1 = the v1 template (§3.2); 2 = v1 + the rulebot
/// may `VoteApprove`/`Finalize` `call` proposals (all-or-nothing Pots only, for the goal refund).
pub const POLICY_V1: u8 = 1;
pub const POLICY_V2: u8 = 2;

pub const RESERVED_SLUGS: &[&str] = &[
    "api", "app", "www", "demo", "admin", "root", "pot", "pots", "hub", "usdc", "treasury",
    "faucet", "users", "user", "relay", "relayer", "preview", "test", "testnet", "mainnet", "near",
    "sputnik", "trezu", "dao", "rulebot", "owner", "system", "support", "help", "about",
    "settings", "static", "assets", "auth", "login", "logout", "j", "p", "r", "new", "create",
    "null", "undefined",
];

// ---------------------------------------------------------------------------------------------
// Storage keys (one byte each: the variant index). NEVER reorder (layout freeze).
// ---------------------------------------------------------------------------------------------

#[near(serializers = [borsh])]
#[derive(BorshStorageKey)]
pub enum StorageKey {
    Pots,         // 0x00 DAO id → Pot
    Members,      // 0x01 (pot idx, account) → Member
    MemberList,   // 0x02 (pot idx, join_index) → account
    PotsOf,       // 0x03 account → Vec<DAO id>
    Requests,     // 0x04 (pot idx, request id) → Request
    Subjects,     // 0x05 (pot idx, DAO proposal id) → Subject
    Invites,      // 0x06 (pot idx, pk bytes) → Invite
    Closes,       // 0x07 pot idx → CloseRecord
    CreatorDaily, // 0x08 creator → DailyCount
    PendingPots,  // 0x09 DAO ids whose creation batch is in flight
    // ---- wave 4 (hub 1.1.0, added by `migrate`) ----
    PotExt,       // 0x0A pot idx → PotExt (rule extras, goal, links)
    Trust,        // 0x0B (pot idx, account) → TrustRecord
    RequestExt,   // 0x0C (pot idx, request id) → RequestExt (tier, one-OK, link)
}

// ---------------------------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------------------------

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct HubConfig {
    pub owner: AccountId,
    pub usdc: AccountId,
    pub dao_code_hash: Base58CryptoHash,
    pub dao_float: NearToken,
    pub min_dao_float: NearToken,
    pub relayers: Vec<AccountId>,
    pub limits: Limits,
    pub paused: bool,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Limits {
    pub max_members: u32,
    pub max_pots_per_creator_per_day: u32,
    pub max_sponsored_pots_per_day: u32,
    pub max_pots_per_account: u32,
    pub max_active_invites: u32,
    pub max_invites_total: u32,
    pub max_pending_per_member: u32,
    pub max_requests_per_pot: u32,
    pub min_hub_reserve: NearToken,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            max_members: 40,
            max_pots_per_creator_per_day: 3,
            max_sponsored_pots_per_day: 50,
            max_pots_per_account: 100,
            max_active_invites: 20,
            max_invites_total: 100,
            max_pending_per_member: 10,
            max_requests_per_pot: 1000,
            min_hub_reserve: NearToken::from_near(2),
        }
    }
}

/// `set_config(patch)`: `owner`, `usdc` and `dao_code_hash` are NOT patchable; an unknown field
/// (e.g. `owner`) fails deserialization (rev4, INV-15).
#[near(serializers = [json])]
#[derive(Clone, Debug, Default)]
#[serde(deny_unknown_fields)]
pub struct ConfigPatch {
    pub dao_float: Option<NearToken>,
    pub min_dao_float: Option<NearToken>,
    pub relayers: Option<Vec<AccountId>>,
    pub limits: Option<Limits>,
    pub paused: Option<bool>,
}

// ---------------------------------------------------------------------------------------------
// Pot
// ---------------------------------------------------------------------------------------------

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Pot {
    pub idx: u32,
    pub seq: u64,
    pub slug: String,
    pub name: String,
    pub emoji: Option<String>,
    pub preset: Preset,
    pub rules: Rules,
    pub rules_version: u32,
    pub status: PotStatus,
    pub creator: AccountId,
    pub created_at_ms: u64,
    pub closed_at_ms: u64,
    pub closing_until_ms: u64,
    pub busy_until_ms: u64,
    pub member_count: u32,
    pub joining_count: u32,
    pub next_join_index: u32,
    pub request_seq: u32,
    pub active_invites: u32,
    pub invites_total: u32,
    pub unpaid_approved: u32,
    pub open_requests: u32,
    pub total_contributed: u128,
    pub spent_instant: u128,
    pub spent_vote: u128,
    pub reserved: u128,
    pub last_contributor: Option<AccountId>,
    pub float: NearToken,
    pub open_rules_proposal: Option<u64>,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq)]
pub enum PotStatus {
    Open,
    Closing { proposal_id: u64 },
    Closed,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Preset {
    Trip,
    Club,
    Team,
    Custom,
}

impl Preset {
    /// contracts-spec §6. `custom` has no default rules.
    pub fn default_rules(&self) -> Option<Rules> {
        let r = |cap: u128, budget: u128, payees: PayeeRule| Rules {
            instant_cap: U128(cap),
            member_budget: U128(budget),
            instant_payees: payees,
            payee_allowlist: vec![],
        };
        match self {
            Preset::Trip => Some(r(100_000_000, 200_000_000, PayeeRule::Members)),
            Preset::Club => Some(r(50_000_000, 150_000_000, PayeeRule::MembersAndAllowlist)),
            Preset::Team => Some(r(250_000_000, 1_000_000_000, PayeeRule::MembersAndAllowlist)),
            Preset::Custom => None,
        }
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            Preset::Trip => "trip",
            Preset::Club => "club",
            Preset::Team => "team",
            Preset::Custom => "custom",
        }
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Rules {
    pub instant_cap: U128,
    pub member_budget: U128,
    pub instant_payees: PayeeRule,
    pub payee_allowlist: Vec<AccountId>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PayeeRule {
    Members,
    MembersAndAllowlist,
}

// ---------------------------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------------------------

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Member {
    pub join_index: u32,
    pub status: MemberStatus,
    pub joined_at_ms: u64,
    pub invite_pk: Option<[u8; 32]>,
    pub contributed: u128,
    pub instant_used: u128,
    pub spent: u128,
    pub pending_votes: u32,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq)]
pub enum MemberStatus {
    Joining { proposal_id: Option<u64> },
    Active,
}

// ---------------------------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------------------------

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Request {
    pub id: u32,
    pub requester: AccountId,
    pub receiver_id: AccountId,
    pub amount: u128,
    pub category: Category,
    pub request_ref: String,
    pub path: Path,
    pub reason: Reason,
    pub status: RequestStatus,
    pub proposal_id: Option<u64>,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Path {
    Instant,
    Vote,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Reason {
    WithinRules,
    OverCap,
    OverBudget,
    PayeeNotAllowed,
    NewMember,
    AutoApproveFailed,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RequestStatus {
    Checking,
    Proposing,
    Approving,
    Pending,
    Approved,
    PayoutFailed,
    Rejected,
    Expired,
    Removed,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Category {
    Groceries,
    Food,
    Transport,
    Stay,
    Tickets,
    Other,
}

impl Category {
    pub fn as_str(&self) -> &'static str {
        match self {
            Category::Groceries => "groceries",
            Category::Food => "food",
            Category::Transport => "transport",
            Category::Stay => "stay",
            Category::Tickets => "tickets",
            Category::Other => "other",
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Invites, subjects, close
// ---------------------------------------------------------------------------------------------

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Invite {
    pub created_by: AccountId,
    pub created_at_ms: u64,
    pub expires_at_ms: u64,
    pub max_uses: u32,
    pub uses: u32,
    pub revoked_at_ms: Option<u64>,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq)]
pub enum Subject {
    Spend { request_id: u32 },
    Join { member: AccountId },
    Close,
    Rules { version: u32 },
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct CloseRecord {
    pub proposal_id: Option<u64>,
    pub status: CloseStatus,
    pub balance: u128,
    pub payouts: Vec<(AccountId, u128)>,
    pub dust: u128,
    pub dust_to: AccountId,
    pub proposed_by: AccountId,
    pub created_at_ms: u64,
}

#[near(serializers = [borsh])]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum CloseStatus {
    Proposing,
    Pending,
    Approved,
    Failed,
    Rejected,
    Expired,
}

impl CloseStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            CloseStatus::Proposing => "proposing",
            CloseStatus::Pending => "pending",
            CloseStatus::Approved => "approved",
            CloseStatus::Failed => "failed",
            CloseStatus::Rejected => "rejected",
            CloseStatus::Expired => "expired",
        }
    }
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug, Default, PartialEq)]
pub struct DailyCount {
    pub day: u32,
    pub count: u32,
}

impl DailyCount {
    /// The count for `day` (0 if the stored day is older).
    pub fn count_on(&self, day: u32) -> u32 {
        if self.day == day {
            self.count
        } else {
            0
        }
    }
}

pub fn status_str(s: RequestStatus) -> &'static str {
    match s {
        RequestStatus::Checking => "checking",
        RequestStatus::Proposing => "proposing",
        RequestStatus::Approving => "approving",
        RequestStatus::Pending => "pending",
        RequestStatus::Approved => "approved",
        RequestStatus::PayoutFailed => "payout_failed",
        RequestStatus::Rejected => "rejected",
        RequestStatus::Expired => "expired",
        RequestStatus::Removed => "removed",
    }
}

pub fn approvals_needed(member_count: u32) -> u32 {
    // Sputnik RoleWeight Ratio(1,2): min(n·1/2 + 1, n), at least 1 (quorum "1").
    std::cmp::max(1, std::cmp::min(member_count / 2 + 1, member_count))
}

// ---------------------------------------------------------------------------------------------
// Wave 4 (hub 1.1.0). Stored in side maps keyed by pot idx so the frozen v1 records (`Pot`,
// `Member`, `Request`) keep their Borsh layout: old records need no rewrite (notes/contracts-wave4.md).
// ---------------------------------------------------------------------------------------------

/// The rule options added in wave 4. JSON wire + Borsh (inside `PotExt`).
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct RuleExtras {
    /// Earned trust: the instant cap grows to `instant_cap × (1 + level)`.
    pub trust: bool,
    /// Spends over the (effective) instant cap but ≤ this need one other member's OK. 0 = off.
    pub one_ok_cap: U128,
    /// Pay by link (the payee is whoever holds a claim link).
    pub links: bool,
    #[serde(default)]
    pub goal: Option<Goal>,
}

impl RuleExtras {
    /// Behaviour of every Pot created before wave 4 (no `PotExt` record).
    pub fn legacy() -> Self {
        Self { trust: false, one_ok_cap: U128(0), links: false, goal: None }
    }
    /// The defaults for a new Pot whose creator sent no extras.
    pub fn defaults_for(rules: &Rules) -> Self {
        Self {
            trust: true,
            one_ok_cap: U128(rules.instant_cap.0.saturating_mul(DEFAULT_ONE_OK_MULT).min(MAX_AMOUNT)),
            links: true,
            goal: None,
        }
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Goal {
    pub amount: U128,
    pub deadline_ms: u64,
    /// Spends wait until the goal is reached; a missed goal refunds everyone (`refund_unfunded`).
    pub all_or_nothing: bool,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct PotExt {
    pub extras: RuleExtras,
    pub policy_v: u8,
    /// 0 = not reached.
    pub goal_reached_at_ms: u64,
    /// The hub's own refund close for a missed all-or-nothing goal (latest).
    pub refund_proposal: Option<u64>,
    /// Link requests not yet claimed / returned / void (they block `propose_close`).
    pub open_links: u32,
    /// USDC that came back to the Pot from unclaimed links.
    pub links_returned: u128,
}

impl PotExt {
    pub fn legacy() -> Self {
        Self { extras: RuleExtras::legacy(), policy_v: POLICY_V1, goal_reached_at_ms: 0, refund_proposal: None, open_links: 0, links_returned: 0 }
    }
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug, Default, PartialEq)]
pub struct TrustRecord {
    pub level: u8,
    /// Qualifying settled spends since the last level change or decline.
    pub streak: u8,
    pub settled: u32,
    pub settled_amount: u128,
    pub declined: u32,
    pub last_declined_ms: u64,
}

/// How a request gets approved.
#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Tier {
    /// Within the rules: the hub approves alone.
    Instant,
    /// One other member's OK (`ok_request`), then the hub approves.
    OneOk,
    /// A majority of members vote in the DAO.
    Group,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct RequestExt {
    pub tier: Tier,
    /// The member whose OK approved a one-OK request (or is being processed).
    pub ok_by: Option<AccountId>,
    pub ok_in_flight: bool,
    /// The requester's trust record already counted this request as settled.
    pub counted: bool,
    pub link: Option<Link>,
}

impl RequestExt {
    pub fn for_path(path: Path) -> Self {
        let tier = if path == Path::Instant { Tier::Instant } else { Tier::Group };
        Self { tier, ok_by: None, ok_in_flight: false, counted: false, link: None }
    }
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug, PartialEq)]
pub struct Link {
    pub pk: [u8; 32],
    pub expires_at_ms: u64,
    pub status: LinkStatus,
    pub receiver: Option<AccountId>,
    pub funded_at_ms: u64,
    pub done_at_ms: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LinkStatus {
    /// The request is not approved yet, or its payout to the hub hasn't arrived.
    AwaitingFunds,
    /// The hub holds the money for the link holder.
    Funded,
    Claiming,
    Claimed,
    Returning,
    /// The money went back to the Pot (expired or cancelled).
    Returned,
    /// The request was declined / expired / refused: no money ever moved.
    Void,
}

impl LinkStatus {
    pub fn is_open(&self) -> bool {
        matches!(self, LinkStatus::AwaitingFunds | LinkStatus::Funded | LinkStatus::Claiming | LinkStatus::Returning)
    }
}
