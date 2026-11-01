//! Exactly-once accounting (contracts-spec §2.4, INV-06). `apply_transition` is the ONLY code that
//! changes the request-derived counters: it subtracts the old `(path, status)` tuple's
//! contributions and adds the new one's.

use crate::types::{Member, Path, Pot, RequestStatus};

pub type State = Option<(Path, RequestStatus)>;

/// What one request in a given `(path, status)` contributes to each counter.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Contrib {
    pub instant_used: u128,  // member: path instant, status ∈ {checking, proposing, approving, approved, payout_failed}
    pub reserved: u128,      // pot: path instant, status ∈ {checking, proposing, approving, payout_failed}
    pub spent_instant: u128, // pot: path instant, status = approved
    pub spent_vote: u128,    // pot: path vote, status = approved
    pub member_spent: u128,  // requester: any path, status = approved
    pub pending_votes: u32,  // requester: path vote, status ∈ {checking, proposing, pending}
    pub unpaid_approved: u32, // pot: any path, status = payout_failed
    pub open_requests: u32,  // pot: path vote, status ∈ {checking, proposing, pending}
}

pub fn contrib(state: State, amount: u128) -> Contrib {
    use RequestStatus::*;
    let mut c = Contrib::default();
    let Some((path, status)) = state else { return c };
    match path {
        Path::Instant => {
            if matches!(status, Checking | Proposing | Approving | Approved | PayoutFailed) {
                c.instant_used = amount;
            }
            if matches!(status, Checking | Proposing | Approving | PayoutFailed) {
                c.reserved = amount;
            }
            if status == Approved {
                c.spent_instant = amount;
            }
        }
        Path::Vote => {
            if status == Approved {
                c.spent_vote = amount;
            }
            if matches!(status, Checking | Proposing | Pending) {
                c.pending_votes = 1;
                c.open_requests = 1;
            }
        }
    }
    if status == Approved {
        c.member_spent = amount;
    }
    if status == PayoutFailed {
        c.unpaid_approved = 1;
    }
    c
}

fn sub_u128(a: &mut u128, b: u128) {
    debug_assert!(*a >= b, "ledger underflow");
    *a = a.saturating_sub(b);
}
fn sub_u32(a: &mut u32, b: u32) {
    debug_assert!(*a >= b, "ledger underflow");
    *a = a.saturating_sub(b);
}

/// Moves one request (owned by `member`, the requester) from `old` to `new`.
/// `None` means "no record" (before creation / after deletion of a refused request).
pub fn apply_transition(pot: &mut Pot, member: &mut Member, amount: u128, old: State, new: State) {
    if old == new {
        return;
    }
    let o = contrib(old, amount);
    let n = contrib(new, amount);
    // subtract the old contributions …
    sub_u128(&mut member.instant_used, o.instant_used);
    sub_u128(&mut pot.reserved, o.reserved);
    sub_u128(&mut pot.spent_instant, o.spent_instant);
    sub_u128(&mut pot.spent_vote, o.spent_vote);
    sub_u128(&mut member.spent, o.member_spent);
    sub_u32(&mut member.pending_votes, o.pending_votes);
    sub_u32(&mut pot.unpaid_approved, o.unpaid_approved);
    sub_u32(&mut pot.open_requests, o.open_requests);
    // … and add the new ones (checked: overflow-checks = true, amounts ≤ MAX_AMOUNT, INV-13).
    member.instant_used += n.instant_used;
    pot.reserved += n.reserved;
    pot.spent_instant += n.spent_instant;
    pot.spent_vote += n.spent_vote;
    member.spent += n.member_spent;
    member.pending_votes += n.pending_votes;
    pot.unpaid_approved += n.unpaid_approved;
    pot.open_requests += n.open_requests;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::*;
    use near_sdk::json_types::U128;
    use near_sdk::NearToken;
    use proptest::prelude::*;

    pub fn blank_pot() -> Pot {
        Pot {
            idx: 0,
            seq: 0,
            slug: "t".into(),
            name: "t".into(),
            emoji: None,
            preset: Preset::Trip,
            rules: Rules {
                instant_cap: U128(0),
                member_budget: U128(0),
                instant_payees: PayeeRule::Members,
                payee_allowlist: vec![],
            },
            rules_version: 1,
            status: PotStatus::Open,
            creator: "a.near".parse().unwrap(),
            created_at_ms: 0,
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
            float: NearToken::from_yoctonear(0),
            open_rules_proposal: None,
        }
    }
    pub fn blank_member() -> Member {
        Member {
            join_index: 0,
            status: MemberStatus::Active,
            joined_at_ms: 0,
            invite_pk: None,
            contributed: 0,
            instant_used: 0,
            spent: 0,
            pending_votes: 0,
        }
    }

    /// The §2.4 table, row by row.
    #[test]
    fn contrib_table() {
        use RequestStatus::*;
        let a = 7;
        let row = |p, s| contrib(Some((p, s)), a);
        for s in [Checking, Proposing, Approving] {
            assert_eq!(row(Path::Instant, s), Contrib { instant_used: a, reserved: a, ..Default::default() });
        }
        assert_eq!(
            row(Path::Instant, Approved),
            Contrib { instant_used: a, spent_instant: a, member_spent: a, ..Default::default() }
        );
        assert_eq!(
            row(Path::Instant, PayoutFailed),
            Contrib { instant_used: a, reserved: a, unpaid_approved: 1, ..Default::default() }
        );
        for s in [Pending, Rejected, Expired, Removed] {
            if s == Pending {
                continue;
            }
            assert_eq!(row(Path::Instant, s), Contrib::default());
            assert_eq!(row(Path::Vote, s), Contrib::default());
        }
        for s in [Checking, Proposing, Pending] {
            assert_eq!(row(Path::Vote, s), Contrib { pending_votes: 1, open_requests: 1, ..Default::default() });
        }
        assert_eq!(row(Path::Vote, Approving), Contrib::default());
        assert_eq!(row(Path::Vote, Approved), Contrib { spent_vote: a, member_spent: a, ..Default::default() });
        assert_eq!(row(Path::Vote, PayoutFailed), Contrib { unpaid_approved: 1, ..Default::default() });
        assert_eq!(contrib(None, a), Contrib::default());
    }

    fn all_states() -> Vec<State> {
        use RequestStatus::*;
        let mut v = vec![None];
        for p in [Path::Instant, Path::Vote] {
            for s in [Checking, Proposing, Approving, Pending, Approved, PayoutFailed, Rejected, Expired, Removed] {
                v.push(Some((p, s)));
            }
        }
        v
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(2000))]
        /// PR-03: random sequences of transitions keep every counter equal to its definition
        /// (recomputed from the request set); each reservation is released exactly once.
        #[test]
        fn pr03_counters_match_definition(
            steps in proptest::collection::vec((0usize..6, 0usize..19, 1u128..1_000_000_000_000u128), 1..200)
        ) {
            let states = all_states();
            let mut pot = blank_pot();
            let mut members = vec![blank_member(), blank_member()];
            // requests: (owner, amount, state)
            let mut reqs: Vec<(usize, u128, State)> = vec![];
            for (sel, st, amt) in steps {
                let new = states[st];
                if sel < 2 || reqs.is_empty() {
                    // create a new request owned by member sel % 2
                    let owner = sel % 2;
                    let mut m = members[owner].clone();
                    apply_transition(&mut pot, &mut m, amt, None, new);
                    members[owner] = m;
                    reqs.push((owner, amt, new));
                } else {
                    let i = sel % reqs.len();
                    let (owner, amount, old) = reqs[i];
                    let mut m = members[owner].clone();
                    apply_transition(&mut pot, &mut m, amount, old, new);
                    members[owner] = m;
                    reqs[i].2 = new;
                }
                // recompute from scratch
                let mut want_pot = blank_pot();
                let mut want_m = vec![blank_member(), blank_member()];
                for (o, a, s) in &reqs {
                    let c = contrib(*s, *a);
                    want_m[*o].instant_used += c.instant_used;
                    want_m[*o].spent += c.member_spent;
                    want_m[*o].pending_votes += c.pending_votes;
                    want_pot.reserved += c.reserved;
                    want_pot.spent_instant += c.spent_instant;
                    want_pot.spent_vote += c.spent_vote;
                    want_pot.unpaid_approved += c.unpaid_approved;
                    want_pot.open_requests += c.open_requests;
                }
                prop_assert_eq!(pot.reserved, want_pot.reserved);
                prop_assert_eq!(pot.spent_instant, want_pot.spent_instant);
                prop_assert_eq!(pot.spent_vote, want_pot.spent_vote);
                prop_assert_eq!(pot.unpaid_approved, want_pot.unpaid_approved);
                prop_assert_eq!(pot.open_requests, want_pot.open_requests);
                for k in 0..2 {
                    prop_assert_eq!(members[k].instant_used, want_m[k].instant_used);
                    prop_assert_eq!(members[k].spent, want_m[k].spent);
                    prop_assert_eq!(members[k].pending_votes, want_m[k].pending_votes);
                }
            }
            // release everything: every counter returns to zero (each reservation released once)
            for (o, a, s) in reqs.clone() {
                let mut m = members[o].clone();
                apply_transition(&mut pot, &mut m, a, s, None);
                members[o] = m;
            }
            prop_assert_eq!(pot.reserved, 0);
            prop_assert_eq!(pot.open_requests, 0);
            prop_assert_eq!(pot.unpaid_approved, 0);
            prop_assert_eq!(pot.spent_instant + pot.spent_vote, 0);
            for m in &members {
                prop_assert_eq!(m.instant_used, 0);
                prop_assert_eq!(m.pending_votes, 0);
                prop_assert_eq!(m.spent, 0);
            }
        }
    }
}
