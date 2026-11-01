//! C-09: gas + prepay calibration (→ contracts/CALIBRATION.md). Builds A and B.
//! Prints `CAL|…` lines and asserts:
//! - INV-07: every leaf hop (hub callbacks that schedule nothing, DAO/token hops) has static gas
//!   ≥ 3× its measured burn;
//! - every hub-created proposal's prepay ≥ the DAO storage it causes (incl. member_count votes);
//! - the minimum caller gas of each flow (binary search) ≤ the gas the relayer attaches (§3.12).

use pot_tests::*;
use serde_json::{json, Value};
use std::future::Future;

fn tg(g: u64) -> f64 {
    g as f64 / 1e12
}

async fn report(env: &Env, flow: &str, o: &Outcome) {
    let l = env.rpc.labeled(o).await.expect("labeled");
    println!("CAL|{:?}|{flow}|total_burnt={:.2}", env.build, tg(o.total_gas_burnt()));
    for r in &l {
        if r.method.is_empty() || r.method == "data" {
            continue;
        }
        let leaf = r.children_prepaid == 0;
        println!(
            "CAL|{:?}|{flow}|{}.{}|static={:.1}|burnt={:.2}|children_static={:.1}|{}",
            env.build,
            r.receiver.split('.').next().unwrap(),
            r.method,
            tg(r.prepaid),
            tg(r.burnt),
            tg(r.children_prepaid),
            if leaf && r.prepaid > 0 { format!("ratio={:.1}x", r.prepaid as f64 / r.burnt as f64) } else { String::new() }
        );
        // INV-07 on leaf hops we control the static gas of (hub callbacks + hub → DAO/token hops)
        let ours = r.receiver == env.hub.as_str() && r.method.starts_with("on_")
            || (r.receiver != env.hub.as_str() && ["get_proposal", "get_policy", "ft_balance_of", "storage_balance_of", "add_proposal", "act_proposal", "storage_deposit"].contains(&r.method.as_str()) && o.signer != r.receiver);
        if leaf && ours && r.prepaid > 0 && r.ok {
            assert!(r.prepaid >= 3 * r.burnt, "{flow}: {}.{} static {:.1} < 3× burnt {:.2}", r.receiver, r.method, tg(r.prepaid), tg(r.burnt));
        }
    }
}

/// Smallest gas in [lo, hi] (1 Tgas resolution) for which `ok(g)` holds; assumes monotonic.
async fn min_gas<F, Fut>(mut lo: u64, mut hi: u64, mut ok: F) -> u64
where
    F: FnMut(u64) -> Fut,
    Fut: Future<Output = bool>,
{
    assert!(ok(hi).await, "fails even at {hi} Tgas");
    while lo < hi {
        let mid = (lo + hi) / 2;
        if ok(mid).await {
            hi = mid;
        } else {
            lo = mid + 1;
        }
    }
    hi
}

struct Storage {
    bytes: u64,
    amount: u128,
}
async fn dao_storage(env: &Env, dao: &near_workspaces::AccountId) -> Storage {
    let a = env.account(dao).await.unwrap();
    Storage { bytes: a.storage_usage, amount: a.amount.as_yoctonear() }
}
fn check_prepay(env: &Env, what: &str, before: &Storage, after_prepay: &Storage, after_all: &Storage) {
    let prepaid = after_prepay.amount.saturating_sub(before.amount); // + small gas rewards
    let grew = (after_all.bytes - before.bytes) as u128 * 10u128.pow(19);
    println!(
        "CAL|{:?}|prepay|{what}|prepaid_bytes_equiv={}|dao_storage_growth={} B|margin={:.0}%",
        env.build,
        prepaid / 10u128.pow(19),
        after_all.bytes - before.bytes,
        (prepaid as f64 / grew as f64 - 1.0) * 100.0
    );
    assert!(prepaid >= grew, "{what}: prepay {prepaid} < DAO storage growth {grew}");
}

async fn calibrate(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    // ---- flows on the D-61 Pot
    let (sk, pk) = Env::invite_key();
    let o = env
        .hub_relay(&env.maya, "create_pot", json!({"slug":"cal","name":"Cal","preset":"trip","rules":null,"invite_pk":pk,"emoji":null,"float":null}), 150)
        .await;
    report(&env, "create_pot", &o).await;
    let dao = env.dao_id("cal");
    let s0 = dao_storage(&env, &dao).await;
    let o = env.join(&env.sam, &dao, &sk, &pk).await;
    report(&env, "join", &o).await;
    let s1 = dao_storage(&env, &dao).await;
    check_prepay(&env, "join (AddMemberToRole + rulebot vote + policy growth)", &s0, &s1, &s1);
    env.join(&env.leo, &dao, &sk, &pk).await.ok();
    let o = env.contribute(&env.maya, &dao, 150 * USDC).await;
    report(&env, "contribution", &o).await;
    env.contribute(&env.sam, &dao, 150 * USDC).await.ok();
    env.contribute(&env.leo, &dao, 150 * USDC).await.ok();
    let s0 = dao_storage(&env, &dao).await;
    let o = env.request_spend(&env.maya, &dao, 84 * USDC, &env.maya.id, "calcal01").await;
    report(&env, "request_spend instant", &o).await;
    let s1 = dao_storage(&env, &dao).await;
    check_prepay(&env, "instant spend (Transfer + rulebot vote)", &s0, &s1, &s1);
    let s0 = dao_storage(&env, &dao).await;
    let o = env.request_spend(&env.maya, &dao, 300 * USDC, &env.maya.id, "calcal02").await;
    report(&env, "request_spend vote", &o).await;
    let pid = o.json()["proposal_id"].as_u64().unwrap();
    let s1 = dao_storage(&env, &dao).await;
    env.vote(&env.sam, &dao, pid, "VoteReject", 100).await.ok();
    env.vote(&env.maya, &dao, pid, "VoteApprove", 100).await.ok();
    let o = env.vote(&env.leo, &dao, pid, "VoteApprove", 100).await;
    report(&env, "member vote executing a Transfer (100 Tgas)", &o).await;
    let s2 = dao_storage(&env, &dao).await;
    check_prepay(&env, "vote spend, 3 members, 3 votes", &s0, &s1, &s2);
    let o = env.sync(&dao, pid).await;
    report(&env, "sync (changed)", &o).await;
    let o = env.hub_relay(&env.maya, "add_invite", json!({"pot": dao, "invite_pk": Env::invite_key().1, "expires_at_ms": null, "max_uses": 40}), 30).await;
    report(&env, "add_invite", &o).await;
    let rules = json!({"instant_cap":"50000000","member_budget":"150000000","instant_payees":"members_and_allowlist","payee_allowlist":[env.ana.id, env.eve.id]});
    let s0 = dao_storage(&env, &dao).await;
    let o = env.hub_relay(&env.sam, "propose_rules", json!({"pot": dao, "rules": rules}), 100).await;
    report(&env, "propose_rules", &o).await;
    let rp = o.json()["proposal_id"].as_u64().unwrap();
    let s1 = dao_storage(&env, &dao).await;
    env.vote(&env.maya, &dao, rp, "VoteReject", 300).await.ok();
    env.vote(&env.sam, &dao, rp, "VoteApprove", 300).await.ok();
    let o = env.vote(&env.leo, &dao, rp, "VoteApprove", 300).await;
    report(&env, "member vote executing set_rules (300 Tgas)", &o).await;
    let s2 = dao_storage(&env, &dao).await;
    check_prepay(&env, "rules, 3 members, 3 votes", &s0, &s1, &s2);
    env.sync(&dao, rp).await.ok();
    env.wait_busy_window().await;
    let s0 = dao_storage(&env, &dao).await;
    let o = env.hub_relay(&env.leo, "propose_close", json!({"pot": dao}), 150).await;
    report(&env, "propose_close n=3", &o).await;
    let cp = o.json()["proposal_id"].as_u64().unwrap();
    let s1 = dao_storage(&env, &dao).await;
    env.vote(&env.sam, &dao, cp, "VoteReject", 300).await.ok();
    env.vote(&env.maya, &dao, cp, "VoteApprove", 300).await.ok();
    let o = env.vote(&env.leo, &dao, cp, "VoteApprove", 300).await;
    report(&env, "member vote executing close n=3 (300 Tgas)", &o).await;
    let s2 = dao_storage(&env, &dao).await;
    check_prepay(&env, "close n=3, 3 votes", &s0, &s1, &s2);

    // ---- minimum caller gas per flow (binary search; static gas makes success all-or-nothing)
    let mut n = 0u32;
    let creators = [env.maya.clone(), env.sam.clone(), env.leo.clone(), env.ana.clone(), env.eve.clone()];
    let g_create = min_gas(20, 300, |g| {
        n += 1;
        let c = creators[(n % 5) as usize].clone();
        let slug = format!("cg{n}");
        let env = &env;
        async move { env.hub_relay(&c, "create_pot", json!({"slug": slug,"name":"x","preset":"trip","rules":null,"invite_pk":null,"emoji":null,"float":null}), g).await.is_ok() }
    })
    .await;
    let (sp, ssk, spk) = env.pot_with_members(&env.ana, "cal-spend", &[&env.maya, &env.sam], 0).await;
    for a in [&env.ana, &env.maya, &env.sam] {
        env.contribute(a, &sp, 300 * USDC).await.ok();
    }
    let mut k = 0u32;
    let g_instant = min_gas(20, 300, |g| {
        k += 1;
        let r = format!("gasinst{k:03}");
        let (env, sp) = (&env, sp.clone());
        async move {
            let a = json!({"pot": sp, "amount": (1 * USDC).to_string(), "receiver_id": env.ana.id, "category": "food", "request_ref": r});
            env.hub_relay(&env.ana, "request_spend", a, g).await.value.map(|v| String::from_utf8_lossy(&v).contains("approved")).unwrap_or(false)
        }
    })
    .await;
    let voters = [env.ana.clone(), env.maya.clone(), env.sam.clone()];
    let g_vote = min_gas(20, 300, |g| {
        k += 1;
        let r = format!("gasvote{k:03}");
        let who = voters[(k % 3) as usize].clone();
        let (env, sp) = (&env, sp.clone());
        async move {
            let a = json!({"pot": sp, "amount": (101 * USDC).to_string(), "receiver_id": who.id, "category": "food", "request_ref": r});
            env.hub_relay(&who, "request_spend", a, g).await.value.map(|v| String::from_utf8_lossy(&v).contains("pending")).unwrap_or(false)
        }
    })
    .await;
    let mut j = 0u32;
    let mut joiners = vec![];
    for i in 0..12 {
        joiners.push(env.new_actor(&format!("gj{i}"), 2 * NEAR).await?);
    }
    let (isk, ipk) = Env::invite_key();
    env.hub_relay(&env.ana, "add_invite", json!({"pot": sp, "invite_pk": ipk, "expires_at_ms": null, "max_uses": 40}), 30).await.ok();
    let _ = (ssk, spk);
    // (joiner index advances only on success: a failed join changes nothing)
    let g_join = {
        let mut lo = 20u64;
        let mut hi = 300u64;
        while lo < hi {
            let mid = (lo + hi) / 2;
            let who = joiners[j as usize].clone();
            let sig = Env::join_sig(&isk, &sp, &who.id);
            let o = env.hub_relay(&who, "join", json!({"pot": sp, "invite_pk": ipk, "signature": sig}), mid).await;
            if o.value.map(|v| String::from_utf8_lossy(&v).contains("active")).unwrap_or(false) {
                hi = mid;
                j += 1;
            } else {
                lo = mid + 1;
            }
        }
        hi
    };
    let g_invite = min_gas(5, 100, |g| {
        let (env, sp) = (&env, sp.clone());
        async move { env.hub_relay(&env.ana, "add_invite", json!({"pot": sp, "invite_pk": Env::invite_key().1, "expires_at_ms": null, "max_uses": null}), g).await.is_ok() }
    })
    .await;
    let g_sync = min_gas(5, 100, |g| {
        let (env, dao) = (&env, dao.clone());
        async move { env.call(&env.relayer, &env.hub.clone(), "sync", json!({"pot": dao, "proposal_id": pid}), g, 0).await.is_ok() }
    })
    .await;
    // rules + close need a fresh 1-member Pot per success
    let mut m = 0u32;
    let mut fresh = |creator: Actor| {
        m += 1;
        let slug = format!("fresh{m}");
        let env = &env;
        async move {
            let (d, _) = env.create_pot(&creator, &slug).await;
            env.contribute(&creator, &d, 10 * USDC).await.ok();
            d
        }
    };
    let rot = [env.ana.clone(), env.eve.clone(), env.sam.clone(), env.leo.clone(), env.maya.clone()];
    let mut ri = 0usize;
    let mut lo = 10u64;
    let mut hi = 300u64;
    let mut owner_r = rot[ri].clone();
    let mut pot_r = fresh(owner_r.clone()).await;
    while lo < hi {
        let mid = (lo + hi) / 2;
        let o = env.hub_relay(&owner_r, "propose_rules", json!({"pot": pot_r, "rules": {"instant_cap":"1","member_budget":"1","instant_payees":"members","payee_allowlist":[]}}), mid).await;
        let added = o.value.map(|v| {
            let t = String::from_utf8_lossy(&v).to_string();
            t.contains("\"proposal_id\":") && !t.contains("\"proposal_id\":null")
        });
        if added.unwrap_or(false) {
            hi = mid;
            ri += 1;
            owner_r = rot[ri % 5].clone();
            pot_r = fresh(owner_r.clone()).await;
        } else {
            lo = mid + 1;
        }
    }
    let g_rules = hi;
    let mut lo = 10u64;
    let mut hi = 300u64;
    let mut pot_c = fresh(env.leo.clone()).await;
    env.wait_busy_window().await;
    while lo < hi {
        let mid = (lo + hi) / 2;
        let o = env.hub_relay(&env.leo, "propose_close", json!({"pot": pot_c}), mid).await;
        if o.value.map(|v| String::from_utf8_lossy(&v).contains("\"ok\":true")).unwrap_or(false) {
            hi = mid;
            pot_c = fresh(env.leo.clone()).await;
            env.wait_busy_window().await;
        } else {
            lo = mid + 1;
        }
    }
    let g_close = hi;
    let mins: Vec<(&str, u64, u64)> = vec![
        ("create_pot", g_create, 150),
        ("request_spend instant", g_instant, 150),
        ("request_spend vote", g_vote, 150),
        ("join", g_join, 100),
        ("add_invite", g_invite, 30),
        ("propose_rules", g_rules, 100),
        ("propose_close n=1", g_close, 150),
        ("sync", g_sync, 50),
    ];
    for (flow, min, attach) in &mins {
        println!("CAL|{build:?}|min_caller_gas|{flow}|min={min} Tgas|relayer attaches {attach} Tgas");
        assert!(min <= attach, "{flow}: needs {min} Tgas > the {attach} Tgas the relayer attaches");
    }
    let _: Value = Value::Null;
    Ok(())
}
dual!(c09_calibration, calibrate);
