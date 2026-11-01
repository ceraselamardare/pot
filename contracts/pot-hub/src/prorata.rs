//! Close-out math (contracts-spec §3.9, D-09, INV-11). Pure; unit- and property-tested (P-01 /
//! PR-01). The TS twin in `packages/pot-sdk` must match `contracts/tests/vectors/prorata.json`.
//!
//! share_i = floor(B × c_i / C); dust = B − Σ share_i (< n); dust goes to the last contributor;
//! zero payouts are omitted (NEP-141 rejects 0); Σ payouts == B.

use near_sdk::AccountId;

#[derive(Clone, Debug, PartialEq)]
pub struct Prorata {
    /// Join order, zero payouts omitted.
    pub payouts: Vec<(AccountId, u128)>,
    pub dust: u128,
    pub dust_to: AccountId,
}

/// floor(a × b / c) without overflow for any a, b ≤ u128 range used here (c > 0).
fn mul_div_floor(a: u128, b: u128, c: u128) -> u128 {
    match a.checked_mul(b) {
        Some(p) => p / c,
        // exact identity: floor(a·b/c) = (a/c)·b + floor((a%c)·b / c)
        None => (a / c) * b + ((a % c) * b) / c,
    }
}

/// `None` when there is nothing to refund (B == 0) or nobody contributed (C == 0).
pub fn prorata(balance: u128, contributions: &[(AccountId, u128)], last_contributor: Option<&AccountId>) -> Option<Prorata> {
    let total: u128 = contributions.iter().map(|(_, c)| *c).sum();
    if balance == 0 || total == 0 {
        return None;
    }
    let mut shares: Vec<(AccountId, u128, u128)> = contributions
        .iter()
        .map(|(a, c)| (a.clone(), *c, mul_div_floor(balance, *c, total)))
        .collect();
    let paid: u128 = shares.iter().map(|(_, _, s)| *s).sum();
    let dust = balance - paid;
    // L has c_L > 0 by construction; fall back to the last account (join order) with c > 0.
    let idx = last_contributor
        .and_then(|l| shares.iter().position(|(a, c, _)| a == l && *c > 0))
        .or_else(|| shares.iter().rposition(|(_, c, _)| *c > 0))
        .expect("total > 0 implies a contributor");
    shares[idx].2 += dust;
    let dust_to = shares[idx].0.clone();
    let payouts: Vec<(AccountId, u128)> =
        shares.into_iter().filter(|(_, _, s)| *s > 0).map(|(a, _, s)| (a, s)).collect();
    debug_assert_eq!(payouts.iter().map(|(_, s)| *s).sum::<u128>(), balance);
    Some(Prorata { payouts, dust, dust_to })
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::serde_json::Value;
    use proptest::prelude::*;

    fn acc(s: &str) -> AccountId {
        s.parse().unwrap()
    }

    /// Runs every vector of a shared fixture file; returns how many were checked.
    fn check_vectors(raw: &str, file: &str) -> usize {
        let v: Value = near_sdk::serde_json::from_str(raw).unwrap_or_else(|e| panic!("{file}: {e}"));
        let vectors = v["vectors"].as_array().unwrap();
        for vec in vectors {
            let id = vec["id"].as_str().unwrap();
            let b: u128 = vec["balance"].as_str().unwrap().parse().unwrap();
            let contribs: Vec<(AccountId, u128)> = vec["contributions"]
                .as_array()
                .unwrap()
                .iter()
                .map(|c| (acc(c["account_id"].as_str().unwrap()), c["contributed"].as_str().unwrap().parse().unwrap()))
                .collect();
            let last = vec["last_contributor"].as_str().map(acc);
            let got = prorata(b, &contribs, last.as_ref());
            if vec["expected"]["nothing_to_refund"].as_bool() == Some(true) {
                assert!(got.is_none(), "{file} {id}");
                continue;
            }
            let got = got.unwrap_or_else(|| panic!("{file} {id}: expected payouts"));
            let want: Vec<(AccountId, u128)> = vec["expected"]["payouts"]
                .as_array()
                .unwrap()
                .iter()
                .map(|p| (acc(p["account_id"].as_str().unwrap()), p["amount"].as_str().unwrap().parse().unwrap()))
                .collect();
            assert_eq!(got.payouts, want, "{file} {id}");
            assert_eq!(got.dust.to_string(), vec["expected"]["dust"].as_str().unwrap(), "{file} {id}");
            assert_eq!(got.dust_to.as_str(), vec["expected"]["dust_to"].as_str().unwrap(), "{file} {id}");
        }
        vectors.len()
    }

    /// V1-V7 from the contracts fixture (test-plan §4.2).
    #[test]
    fn shared_vectors() {
        assert_eq!(check_vectors(include_str!("../../tests/vectors/prorata.json"), "contracts/tests/vectors/prorata.json"), 7);
    }

    /// PR-02 parity: the TS twin's fixtures in packages/pot-sdk (V1-V7 + 500 seeded random cases)
    /// give identical results in Rust. Skipped only when the sdk package is absent from the checkout.
    #[test]
    fn sdk_vectors_parity() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages/pot-sdk");
        if !root.exists() {
            eprintln!("packages/pot-sdk not in this checkout: skipping PR-02 parity");
            return;
        }
        let dir = root.join("src/math/vectors");
        let mut total = 0;
        for (file, min) in [("prorata.json", 7), ("prorata-random.json", 500)] {
            let raw = std::fs::read_to_string(dir.join(file)).unwrap_or_else(|e| panic!("{}: {e}", dir.join(file).display()));
            let n = check_vectors(&raw, file);
            assert!(n >= min, "{file}: {n} vectors");
            total += n;
        }
        assert!(total >= 507);
    }

    #[test]
    fn max_values_do_not_overflow() {
        // T-86: B = c_i = MAX_AMOUNT, 40 members.
        let m = crate::types::MAX_AMOUNT;
        let contribs: Vec<(AccountId, u128)> = (0..40).map(|i| (acc(&format!("m{i}.near")), m)).collect();
        let r = prorata(m, &contribs, Some(&acc("m39.near"))).unwrap();
        assert_eq!(r.payouts.iter().map(|p| p.1).sum::<u128>(), m);
        assert_eq!(mul_div_floor(u128::MAX / 2, 4, 8), u128::MAX / 4);
    }

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(10_000))]
        /// P-01 / PR-01.
        #[test]
        fn p01_prorata_properties(
            cs in proptest::collection::vec(0u128..=1_000_000_000_000u128, 1..=40),
            b in 0u128..=1_000_000_000_000_000u128,
            last_pick in 0usize..40,
        ) {
            let mut cs = cs;
            if cs.iter().all(|c| *c == 0) { cs[0] = 1; }
            let contribs: Vec<(AccountId, u128)> = cs.iter().enumerate().map(|(i, c)| (acc(&format!("m{i}.near")), *c)).collect();
            let nonzero: Vec<usize> = (0..cs.len()).filter(|i| cs[*i] > 0).collect();
            let last_i = nonzero[last_pick % nonzero.len()];
            let last = contribs[last_i].0.clone();
            let total: u128 = cs.iter().sum();
            let r = prorata(b, &contribs, Some(&last));
            if b == 0 { prop_assert!(r.is_none()); return Ok(()); }
            let r = r.unwrap();
            prop_assert_eq!(r.payouts.iter().map(|p| p.1).sum::<u128>(), b);
            prop_assert!(r.dust < cs.len() as u128);
            prop_assert_eq!(&r.dust_to, &last);
            for (i, (a, c)) in contribs.iter().enumerate() {
                let floor = b * c / total;
                let got = r.payouts.iter().find(|p| &p.0 == a).map(|p| p.1).unwrap_or(0);
                if *c == 0 { prop_assert_eq!(got, 0); prop_assert!(r.payouts.iter().all(|p| &p.0 != a)); }
                if i == last_i { prop_assert_eq!(got, floor + r.dust); } else { prop_assert_eq!(got, floor); }
                prop_assert!(got >= floor);
            }
            // join order preserved
            let idxs: Vec<usize> = r.payouts.iter().map(|p| contribs.iter().position(|c| c.0 == p.0).unwrap()).collect();
            prop_assert!(idxs.windows(2).all(|w| w[0] < w[1]));
        }
    }
}
