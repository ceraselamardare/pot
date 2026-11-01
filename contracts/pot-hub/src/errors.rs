//! Stable error codes (contracts-spec §3.13). Clients match the `ERR_` prefix.
//! Synchronous checks panic with `ERR_<CODE>` or `ERR_<CODE>: <detail>`; callbacks never panic
//! (they return outcome values with a `reason`, INV-07).

use near_sdk::env;

pub const ERR_PAUSED: &str = "ERR_PAUSED";
pub const ERR_NOT_OWNER: &str = "ERR_NOT_OWNER";
pub const ERR_CONFIG_INVALID: &str = "ERR_CONFIG_INVALID";
pub const ERR_POT_NOT_FOUND: &str = "ERR_POT_NOT_FOUND";
pub const ERR_POT_NOT_OPEN: &str = "ERR_POT_NOT_OPEN";
pub const ERR_POT_BUSY: &str = "ERR_POT_BUSY";
pub const ERR_PAYOUTS_PENDING: &str = "ERR_PAYOUTS_PENDING";
pub const ERR_CLOSE_IN_PROGRESS: &str = "ERR_CLOSE_IN_PROGRESS";
pub const ERR_CLOSE_COOLDOWN: &str = "ERR_CLOSE_COOLDOWN";
pub const ERR_NO_CONTRIBUTIONS: &str = "ERR_NO_CONTRIBUTIONS";
pub const ERR_NOT_MEMBER: &str = "ERR_NOT_MEMBER";
pub const ERR_NOT_POT_DAO: &str = "ERR_NOT_POT_DAO";
pub const ERR_USE_PROPOSE_RULES: &str = "ERR_USE_PROPOSE_RULES";
pub const ERR_EMOJI_INVALID: &str = "ERR_EMOJI_INVALID";
pub const ERR_ALREADY_MEMBER: &str = "ERR_ALREADY_MEMBER";
pub const ERR_POT_FULL: &str = "ERR_POT_FULL";
pub const ERR_TOO_MANY_POTS: &str = "ERR_TOO_MANY_POTS";
pub const ERR_SLUG_INVALID: &str = "ERR_SLUG_INVALID";
pub const ERR_SLUG_RESERVED: &str = "ERR_SLUG_RESERVED";
pub const ERR_SLUG_TAKEN: &str = "ERR_SLUG_TAKEN";
pub const ERR_NAME_INVALID: &str = "ERR_NAME_INVALID";
pub const ERR_RULES_INVALID: &str = "ERR_RULES_INVALID";
pub const ERR_RULES_PENDING: &str = "ERR_RULES_PENDING";
pub const ERR_CREATOR_DAILY_LIMIT: &str = "ERR_CREATOR_DAILY_LIMIT";
pub const ERR_GLOBAL_DAILY_LIMIT: &str = "ERR_GLOBAL_DAILY_LIMIT";
pub const ERR_DEPOSIT_REQUIRED: &str = "ERR_DEPOSIT_REQUIRED";
pub const ERR_HUB_LOW_BALANCE: &str = "ERR_HUB_LOW_BALANCE";
pub const ERR_INVITE_PK_INVALID: &str = "ERR_INVITE_PK_INVALID";
pub const ERR_INVITE_EXISTS: &str = "ERR_INVITE_EXISTS";
pub const ERR_INVITE_NOT_FOUND: &str = "ERR_INVITE_NOT_FOUND";
pub const ERR_INVITE_REVOKED: &str = "ERR_INVITE_REVOKED";
pub const ERR_INVITE_EXPIRED: &str = "ERR_INVITE_EXPIRED";
pub const ERR_INVITE_USED_UP: &str = "ERR_INVITE_USED_UP";
pub const ERR_INVITE_EXPIRY_INVALID: &str = "ERR_INVITE_EXPIRY_INVALID";
pub const ERR_INVITE_MAX_USES_INVALID: &str = "ERR_INVITE_MAX_USES_INVALID";
pub const ERR_TOO_MANY_INVITES: &str = "ERR_TOO_MANY_INVITES";
pub const ERR_BAD_SIGNATURE: &str = "ERR_BAD_SIGNATURE";
pub const ERR_WRONG_TOKEN: &str = "ERR_WRONG_TOKEN";
pub const ERR_BAD_MSG: &str = "ERR_BAD_MSG";
pub const ERR_AMOUNT_TOO_LARGE: &str = "ERR_AMOUNT_TOO_LARGE";
pub const ERR_BAD_AMOUNT: &str = "ERR_BAD_AMOUNT";
pub const ERR_BAD_RECEIVER: &str = "ERR_BAD_RECEIVER";
pub const ERR_BAD_REQUEST_REF: &str = "ERR_BAD_REQUEST_REF";
pub const ERR_TOO_MANY_PENDING: &str = "ERR_TOO_MANY_PENDING";
pub const ERR_TOO_MANY_REQUESTS: &str = "ERR_TOO_MANY_REQUESTS";
pub const ERR_UNKNOWN_PROPOSAL: &str = "ERR_UNKNOWN_PROPOSAL";
pub const ERR_NOT_RETRYABLE: &str = "ERR_NOT_RETRYABLE";
pub const ERR_USE_DAO_FINALIZE: &str = "ERR_USE_DAO_FINALIZE";

/// Panics with `code`.
pub fn fail(code: &str) -> ! {
    env::panic_str(code)
}

/// Panics with `code: detail`.
pub fn fail_with(code: &str, detail: impl std::fmt::Display) -> ! {
    env::panic_str(&format!("{code}: {detail}"))
}

/// `require!`-style helper with a stable code.
pub fn check(cond: bool, code: &str) {
    if !cond {
        fail(code)
    }
}
