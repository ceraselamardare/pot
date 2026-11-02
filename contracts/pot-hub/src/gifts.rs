//! Hub 1.2.0: gifts. Anyone (member or not) can send a Pot a gift with
//! `usdc.ft_transfer_call(hub, amount, msg = {"pot":<dao>,"gift":"<ref>"})`. The hub forwards it to
//! the Pot's DAO and records it in a per-Pot side record. Gift money is group money: it is never part
//! of `total_contributed` / `member.contributed` (no refund, vote, budget or trust effects), it is
//! spendable like any Pot money, and the close shares it pro-rata (equally when nobody contributed).
//! Design, interface and the deploy: notes/contracts-gifts.md.
//!
//! State: one `GiftState` per Pot, stored DIRECTLY under the `StorageKey::Gifts` prefix (0x0D) with
//! the same key layout a `LookupMap<u32, GiftState>` would use (prefix ++ borsh(idx)). It is not a
//! field of the root struct, so the 1.1.0 state deserializes unchanged and 1.1.0 → 1.2.0 is a plain
//! code deploy (no `migrate`). A missing record = gifts on, nothing received.
//!
//! Conventions are the hub's: authorization by `predecessor_account_id` only; callbacks `#[private]`,
//! never panic; static gas with `unused_gas_weight(0)`.

use near_sdk::json_types::U128;
use near_sdk::serde::Deserialize;
use near_sdk::{env, near, AccountId, Gas, NearToken, PromiseOrValue};

use crate::errors::*;
use crate::events::*;
use crate::ext::*;
use crate::types::*;
use crate::{bytes_cost, goal_blocks_spends, goal_missed, now_ms, promise_ok, PotHub, GAS_FT_TRANSFER};
#[allow(unused_imports)]
use crate::PotHubExt;

/// `on_gift_forwarded`: reads the gift record, writes it, may emit `goal_reached`, emits
/// `gift_received`, bumps `seq` (≈ 3 Tgas measured; 15 keeps ≥ 3× margin).
pub const GAS_ON_GIFT: Gas = Gas::from_tgas(15);

/// `ft_on_transfer` msg for a gift (parse order: link → gift → contribute).
#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
pub(crate) struct GiftMsg {
    pub pot: AccountId,
    pub gift: String,
}

/// 1-32 chars of `[A-Za-z0-9_-]` (a 128-bit url-safe gift-link id fits; never free text).
pub fn valid_gift_ref(r: &str) -> bool {
    (1..=MAX_GIFT_REF_LEN).contains(&r.len()) && r.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}

/// The raw storage key of a Pot's gift record: `[0x0D] ++ borsh(idx)` (= `LookupMap<u32, _>`'s layout).
pub(crate) fn gift_key(idx: u32) -> Vec<u8> {
    let mut k = near_sdk::borsh::to_vec(&StorageKey::Gifts).expect("storage key");
    k.extend_from_slice(&idx.to_le_bytes());
    k
}

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct GiftsView {
    pub pot: AccountId,
    /// Gifts are on (the default for every Pot; any member can turn them off).
    pub on: bool,
    /// Σ gifts the Pot received (not part of `total_contributed`).
    pub total: U128,
    pub count: u32,
    pub last_gift_ms: Option<u64>,
    /// A gift forward is pending right now (the close waits for it, ≤ 60 s).
    pub in_flight: bool,
    /// A gift sent now would be accepted (Pot open, not paused, gifts on, no all-or-nothing goal collecting).
    pub accepting: bool,
    /// Why not, when `accepting` is false: "pot_not_open" | "paused" | "gifts_off" | "goal_collecting" | "goal_missed".
    pub refusal: Option<String>,
    /// The smallest gift (1_000_000 = $1).
    pub min_amount: U128,
}

impl PotHub {
    /// The Pot's gift record (default: gifts on, nothing received).
    pub(crate) fn gifts_of(&self, idx: u32) -> GiftState {
        env::storage_read(&gift_key(idx))
            .and_then(|b| near_sdk::borsh::from_slice::<GiftState>(&b).ok())
            .unwrap_or_default()
    }
    pub(crate) fn put_gifts(&mut self, idx: u32, g: &GiftState) {
        env::storage_write(&gift_key(idx), &near_sdk::borsh::to_vec(g).expect("gift state"));
    }
    pub(crate) fn has_gift_record(&self, idx: u32) -> bool {
        env::storage_has_key(&gift_key(idx))
    }

    /// Why a gift to this Pot would be refused right now (None = accepted), with the panic code.
    pub(crate) fn gift_refusal(&self, p: &Pot, g: &GiftState) -> Option<(&'static str, &'static str)> {
        if !Self::is_open(p) {
            return Some((ERR_POT_NOT_OPEN, "pot_not_open"));
        }
        if self.config.paused {
            return Some((ERR_PAUSED, "paused"));
        }
        if g.off {
            return Some((ERR_GIFTS_OFF, "gifts_off"));
        }
        let ext = self.pext(p.idx);
        if goal_missed(&ext, now_ms()) {
            return Some((ERR_GOAL_MISSED, "goal_missed"));
        }
        if goal_blocks_spends(&ext) {
            // an all-or-nothing goal still collecting: its refund promise is "your contribution back"
            return Some((ERR_GOAL_COLLECTING, "goal_collecting"));
        }
        None
    }

    /// `ft_on_transfer` with a gift msg (any sender). Panics on a refusal: the token then refunds the
    /// whole amount to the sender (NEP-141), exactly like a refused contribution.
    pub(crate) fn receive_gift(&mut self, sender_id: AccountId, m: GiftMsg, amount: U128) -> PromiseOrValue<U128> {
        let dao = m.pot;
        let p = self.pot(&dao);
        let mut g = self.gifts_of(p.idx);
        if let Some((code, _)) = self.gift_refusal(&p, &g) {
            fail(code);
        }
        check(valid_gift_ref(&m.gift), ERR_GIFT_REF_INVALID);
        // a Pot can't gift itself (it would only inflate its own gift total)
        check(sender_id != dao && sender_id != Self::me(), ERR_GIFT_SELF);
        check(amount.0 >= MIN_GIFT, ERR_GIFT_TOO_SMALL);
        check(amount.0 <= MAX_AMOUNT && g.total.checked_add(amount.0).is_some_and(|t| t <= MAX_AMOUNT), ERR_AMOUNT_TOO_LARGE);
        // no 60 s busy window: only the close / goal refund waits for a pending forward (self-heals)
        let now = now_ms();
        if now >= g.in_flight_until_ms {
            g.in_flight = 0;
        }
        g.in_flight = g.in_flight.saturating_add(1);
        g.in_flight_until_ms = now + GIFT_FLIGHT_MS;
        self.put_gifts(p.idx, &g);
        PromiseOrValue::Promise(
            ext_ft::ext(self.config.usdc.clone())
                .with_attached_deposit(NearToken::from_yoctonear(1))
                .with_static_gas(GAS_FT_TRANSFER)
                .with_unused_gas_weight(0)
                .ft_transfer(dao.clone(), amount, Some(GIFT_MEMO.to_string()))
                .then(
                    Self::ext(Self::me())
                        .with_static_gas(GAS_ON_GIFT)
                        .with_unused_gas_weight(0)
                        .on_gift_forwarded(dao, sender_id, amount, m.gift),
                ),
        )
    }
}

#[near]
impl PotHub {
    /// Records the gift once, only after the forward to the DAO succeeded. Returns the UNUSED amount:
    /// 0 when forwarded, `amount` (→ the token refunds the sender) when the forward failed.
    #[private]
    pub fn on_gift_forwarded(&mut self, pot: AccountId, sender_id: AccountId, amount: U128, gift_ref: String) -> U128 {
        let ok = promise_ok(0);
        let Some(p) = self.pots.get(&pot).cloned() else { return if ok { U128(0) } else { amount } };
        let mut g = self.gifts_of(p.idx);
        g.in_flight = g.in_flight.saturating_sub(1);
        if !ok {
            self.put_gifts(p.idx, &g);
            return amount;
        }
        g.total = g.total.saturating_add(amount.0);
        g.count = g.count.saturating_add(1);
        g.last_gift_ms = now_ms();
        self.put_gifts(p.idx, &g);
        self.check_goal_reached(&pot, &p); // gifts count toward a normal (soft) goal
        PotEvent::GiftReceived {
            pot: pot.clone(),
            from: sender_id,
            amount,
            r#ref: gift_ref,
            gifts_total: U128(g.total),
            gifts_count: g.count,
        }
        .emit();
        self.save_pot(&pot, p);
        U128(0)
    }

    /// Any Active member turns the Pot's gifts on or off (relayable: authorized by the predecessor).
    /// Allowed while paused; not on a Closed Pot. The first write of the record costs a direct
    /// (unsponsored) caller `STATE_BYTES_GIFTS` of storage (excess refunded); relayer-signed: 0.
    #[payable]
    pub fn set_gifts(&mut self, pot: AccountId, on: bool) -> GiftsView {
        let by = env::predecessor_account_id();
        let p = self.pot(&pot);
        check(self.active_member(p.idx, &by).is_some(), ERR_NOT_MEMBER);
        check(p.status != PotStatus::Closed, ERR_POT_NOT_OPEN);
        let mut g = self.gifts_of(p.idx);
        let change = g.off == on;
        let cost = if change && !self.has_gift_record(p.idx) { bytes_cost(STATE_BYTES_GIFTS) } else { 0 };
        let excess = self.charge(self.sponsored(), cost);
        self.require_free(0, excess);
        Self::refund_excess(excess);
        if change {
            g.off = !on;
            self.put_gifts(p.idx, &g);
            PotEvent::GiftsSet { pot: pot.clone(), on, by }.emit();
            self.save_pot(&pot, p.clone());
        }
        self.gifts_view(&pot, &p)
    }

    /// The Pot's gifts (null: unknown Pot). The relayer's gift pre-flight reads `accepting`.
    pub fn get_gifts(&self, pot: AccountId) -> Option<GiftsView> {
        let p = self.pots.get(&pot)?;
        Some(self.gifts_view(&pot, p))
    }
}

impl PotHub {
    pub(crate) fn gifts_view(&self, pot: &AccountId, p: &Pot) -> GiftsView {
        let g = self.gifts_of(p.idx);
        let refusal = self.gift_refusal(p, &g).map(|(_, why)| why.to_string());
        GiftsView {
            pot: pot.clone(),
            on: !g.off,
            total: U128(g.total),
            count: g.count,
            last_gift_ms: if g.last_gift_ms > 0 { Some(g.last_gift_ms) } else { None },
            in_flight: g.in_flight_at(now_ms()),
            accepting: refusal.is_none(),
            refusal,
            min_amount: U128(MIN_GIFT),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gift_refs() {
        for ok in ["a", "AbC-_09", "k3d9x1a2b4c6m7n8", &"x".repeat(32), "Zm9vYmFyYmF6cXV4MTIzNA"] {
            assert!(valid_gift_ref(ok), "{ok}");
        }
        for bad in ["", &"x".repeat(33), "a b", "a.b", "a/b", "é", "a\nb", "a+b", "a=b"] {
            assert!(!valid_gift_ref(bad), "{bad:?}");
        }
    }

    #[test]
    fn gift_key_is_the_lookup_map_layout() {
        assert_eq!(near_sdk::borsh::to_vec(&StorageKey::Gifts).unwrap(), vec![0x0D]);
        assert_eq!(gift_key(7), vec![0x0D, 7, 0, 0, 0]);
        assert_eq!(gift_key(0x0102_0304), vec![0x0D, 4, 3, 2, 1]);
    }

    #[test]
    fn in_flight_self_heals() {
        let g = GiftState { in_flight: 2, in_flight_until_ms: 1_000, ..Default::default() };
        assert!(g.in_flight_at(999));
        assert!(!g.in_flight_at(1_000));
        assert!(!GiftState::default().in_flight_at(0));
    }

    #[test]
    fn gift_event_json() {
        let a: AccountId = "a.near".parse().unwrap();
        let e = PotEvent::GiftReceived { pot: a.clone(), from: a, amount: U128(5), r#ref: "x1".into(), gifts_total: U128(5), gifts_count: 1 };
        let s = near_sdk::serde_json::to_string(&e).unwrap();
        assert!(s.contains("\"ref\":\"x1\""), "{s}");
        assert!(!s.contains("r#ref"), "{s}");
    }
}
