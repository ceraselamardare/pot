//! Hub 1.2.0: gifts (notes/contracts-gifts.md). Anyone can send a Pot a gift with
//! `ft_transfer_call(hub, amount, {"pot","gift":"<ref>"})`; it is group money, shared at close.
//! Builds A and B. The exact in-flight / self-heal timing is also unit-tested (pot-hub unit_gifts.rs):
//! the sandbox can't pin a forward "in flight" deterministically.

use near_workspaces::AccountId;
use pot_tests::*;
use serde_json::{json, Value};

fn rref(n: u32) -> String {
    format!("gift{n:08}")
}

/// A refused gift: the token refunds everything (used "0") and the failure carries `code`.
async fn refused(env: &Env, who: &Actor, amount: u128, msg: String, code: &str) {
    let b0 = env.ft_balance(&who.id).await;
    let o = env.gift_msg(who, amount, msg.clone()).await;
    assert_eq!(o.json(), json!("0"), "{msg}: {}", o.dump());
    let f = o.failures().join(" ");
    assert!(f.contains(code), "{msg}: expected {code}, got {f}");
    assert_eq!(env.ft_balance(&who.id).await, b0, "{msg}: refunded");
    assert!(!o.event_names().contains(&"gift_received".to_string()));
}

async fn balances(env: &Env, who: &[&Actor]) -> Vec<u128> {
    let mut out = vec![];
    for a in who {
        out.push(env.ft_balance(&a.id).await);
    }
    out
}

fn gift_msg(pot: &AccountId, r: &str) -> String {
    json!({"pot": pot, "gift": r}).to_string()
}

/// G1: a non-member's relayed gift (100 Tgas) is recorded as a gift; a member's gift is a gift too
/// (never a contribution); views; the smallest working gas.
async fn g1(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (dao, _, _) = env.pot_with_members(&env.maya, "gifted", &[&env.sam], 100 * USDC).await;
    let g = env.gifts(&dao).await;
    assert_eq!(
        (g["on"].as_bool(), g["total"].as_str(), g["count"].as_u64(), g["accepting"].as_bool(), g["in_flight"].as_bool(), g["min_amount"].as_str()),
        (Some(true), Some("0"), Some(0), Some(true), Some(false), Some("1000000")),
        "gifts are on by default: {g}"
    );

    // a non-member (eve)
    let eve0 = env.ft_balance(&env.eve.id).await;
    let o = env.gift(&env.eve, &dao, 10 * USDC, "lnkA1").await;
    assert_eq!(o.json(), json!("10000000"), "used == amount\n{}", o.dump());
    assert_eq!(
        o.event("gift_received"),
        json!({"pot": dao, "from": env.eve.id, "amount": "10000000", "ref": "lnkA1", "gifts_total": "10000000", "gifts_count": 1})
    );
    assert!(o.logs().iter().any(|l| l.contains("\"event\":\"gift_received\"") && l.contains("\"version\":\"1.2.0\"")));
    assert!(!o.event_names().contains(&"contribution".to_string()));
    println!("[{build:?}] G1 relayed gift (100 Tgas) burnt {:.2} Tgas\n{}", o.total_gas_burnt() as f64 / 1e12, o.dump());
    assert_eq!(env.ft_balance(&dao).await, 210 * USDC);
    assert_eq!(env.ft_balance(&env.hub).await, 0, "the hub never keeps a gift");
    assert_eq!(eve0 - env.ft_balance(&env.eve.id).await, 10 * USDC);
    let pot = env.pot(&dao).await;
    assert_eq!((pot["total_contributed"].as_str(), pot["balance_estimate"].as_str()), (Some("200000000"), Some("210000000")));
    assert_eq!((pot["gifts_on"].as_bool(), pot["gifts_total"].as_str(), pot["gifts_count"].as_u64()), (Some(true), Some("10000000"), Some(1)));
    assert_eq!(env.member(&dao, &env.eve.id).await, Value::Null, "a giver doesn't become a member");
    let g = env.gifts(&dao).await;
    assert_eq!((g["total"].as_str(), g["count"].as_u64(), g["in_flight"].as_bool()), (Some("10000000"), Some(1), Some(false)));
    assert!(g["last_gift_ms"].as_u64().unwrap() > 0);

    // a member's gift is a gift: no contribution, no budget / refund effects
    let o = env.gift(&env.maya, &dao, 5 * USDC, "pub-1").await;
    assert_eq!(o.json(), json!("5000000"));
    assert_eq!(o.event("gift_received")["gifts_count"], 2);
    let m = env.member(&dao, &env.maya.id).await;
    assert_eq!(m["contributed"], "100000000");
    let pot = env.pot(&dao).await;
    assert_eq!((pot["total_contributed"].as_str(), pot["gifts_total"].as_str()), (Some("200000000"), Some("15000000")));
    assert_eq!(pot["last_contributor"], env.sam.id.as_str(), "a gift never moves last_contributor");

    // the smallest gas that records a gift (the app sends 100, like contributions)
    let mut min_ok = None;
    for gas in [40u64, 50, 60, 70] {
        let o = env
            .relay(&env.eve, &env.usdc.clone(), "ft_transfer_call", json!({"receiver_id": env.hub, "amount": "1000000", "msg": gift_msg(&dao, "gas")}), gas, 1)
            .await;
        if o.json() == json!("1000000") {
            min_ok = Some(gas);
            break;
        }
    }
    println!("[{build:?}] G1 minimum ft_transfer_call gas that records a gift: {min_ok:?} Tgas");
    assert!(min_ok.is_some(), "a gift records with ≤ 70 Tgas");
    Ok(())
}

/// G2: refusals all refund the giver: too small, bad ref / msg, unknown Pot, gifts off, paused;
/// only an active member can turn gifts off / on.
async fn g2(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (dao, _, _) = env.pot_with_members(&env.maya, "nope", &[&env.sam], 0).await;
    refused(&env, &env.eve, 999_999, gift_msg(&dao, "r1"), "ERR_GIFT_TOO_SMALL").await;
    refused(&env, &env.eve, 5 * USDC, gift_msg(&dao, "bad ref!"), "ERR_GIFT_REF_INVALID").await;
    refused(&env, &env.eve, 5 * USDC, gift_msg(&dao, ""), "ERR_GIFT_REF_INVALID").await;
    refused(&env, &env.eve, 5 * USDC, gift_msg(&dao, &"x".repeat(33)), "ERR_GIFT_REF_INVALID").await;
    refused(&env, &env.eve, 5 * USDC, json!({"pot": dao, "gift": "r1", "x": 1}).to_string(), "ERR_BAD_MSG").await;
    refused(&env, &env.eve, 5 * USDC, json!({"pot": dao, "gift": 7}).to_string(), "ERR_BAD_MSG").await;
    refused(&env, &env.eve, 5 * USDC, gift_msg(&env.dao_id("nobody"), "r1"), "ERR_POT_NOT_FOUND").await;
    assert_eq!(env.gifts(&dao).await["total"], "0");

    // set_gifts: members only (relayed, predecessor-authorized)
    env.hub_relay(&env.eve, "set_gifts", json!({"pot": dao, "on": false}), 30).await.expect_err("ERR_NOT_MEMBER");
    let o = env.hub_relay(&env.sam, "set_gifts", json!({"pot": dao, "on": false}), 30).await;
    assert_eq!(o.event("gifts_set"), json!({"pot": dao, "on": false, "by": env.sam.id}));
    let v = o.json();
    assert_eq!((v["on"].as_bool(), v["accepting"].as_bool(), v["refusal"].as_str()), (Some(false), Some(false), Some("gifts_off")));
    assert_eq!(env.pot(&dao).await["gifts_on"], false);
    refused(&env, &env.eve, 5 * USDC, gift_msg(&dao, "r1"), "ERR_GIFTS_OFF").await;
    // turning off again changes nothing (no event)
    let o = env.hub_relay(&env.maya, "set_gifts", json!({"pot": dao, "on": false}), 30).await;
    assert!(o.event_names().is_empty());
    let o = env.hub_relay(&env.maya, "set_gifts", json!({"pot": dao, "on": true}), 30).await;
    assert_eq!(o.json()["accepting"], true);
    assert_eq!(env.gift(&env.eve, &dao, 5 * USDC, "r2").await.json(), json!("5000000"));

    // paused: refused (the token refunds), toggling still allowed
    env.hub_call(&env.owner, "set_config", json!({"patch": {"paused": true}}), 30, 0).await.ok();
    assert_eq!(env.gifts(&dao).await["refusal"], "paused");
    refused(&env, &env.eve, 5 * USDC, gift_msg(&dao, "r3"), "ERR_PAUSED").await;
    env.hub_call(&env.owner, "set_config", json!({"patch": {"paused": false}}), 30, 0).await.ok();
    assert_eq!(env.gift(&env.eve, &dao, 5 * USDC, "r4").await.json(), json!("5000000"));
    assert_eq!(env.gifts(&dao).await["total"], "10000000");
    Ok(())
}

/// G3: gifts open no busy window; the close shares gifts pro-rata to contributions; gifts are
/// refused while the Pot is closing and once it is closed.
async fn g3(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (dao, _, _) = env.pot_with_members(&env.maya, "share", &[&env.sam], 0).await;
    assert_eq!(env.contribute(&env.maya, &dao, 150 * USDC).await.json(), json!("150000000"));
    assert_eq!(env.contribute(&env.sam, &dao, 50 * USDC).await.json(), json!("50000000"));
    env.wait_busy_window().await;
    assert_eq!(env.gift(&env.eve, &dao, 40 * USDC, "big").await.json(), json!("40000000"));
    // no busy window from a gift: the close goes ahead right away
    let pc = env.hub_view("preview_close", json!({"pot": dao, "balance": null})).await;
    assert_eq!((pc["can_propose"].as_bool(), pc["split"].as_str(), pc["gifts_total"].as_str()), (Some(true), Some("prorata"), Some("40000000")));
    let o = env.hub_relay(&env.maya, "propose_close", json!({"pot": dao}), 150).await;
    let v = o.json();
    assert_eq!((v["ok"].as_bool(), v["balance"].as_str()), (Some(true), Some("240000000")), "{}", o.dump());
    // $240 split 150:50 → $180 / $60 (the gift is shared pro-rata)
    assert_eq!(v["payouts"], json!([{"account_id": env.maya.id, "amount": "180000000"}, {"account_id": env.sam.id, "amount": "60000000"}]));
    let pid = v["proposal_id"].as_u64().unwrap();
    refused(&env, &env.eve, 5 * USDC, gift_msg(&dao, "late"), "ERR_POT_NOT_OPEN").await;
    let before = balances(&env, &[&env.maya, &env.sam]).await;
    env.vote(&env.maya, &dao, pid, "VoteApprove", 300).await.ok();
    env.vote(&env.sam, &dao, pid, "VoteApprove", 300).await.ok();
    assert_eq!(env.sync(&dao, pid).await.json()["hub_status"], "closed");
    let after = balances(&env, &[&env.maya, &env.sam]).await;
    assert_eq!((after[0] - before[0], after[1] - before[1]), (180 * USDC, 60 * USDC));
    assert_eq!(env.ft_balance(&dao).await, 0);
    refused(&env, &env.eve, 5 * USDC, gift_msg(&dao, "later"), "ERR_POT_NOT_OPEN").await;
    assert_eq!(env.gifts(&dao).await["refusal"], "pot_not_open");
    Ok(())
}

/// G4: a Pot where nobody added money but gifts arrived closes with an equal split.
async fn g4(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (dao, _, _) = env.pot_with_members(&env.ana, "equal", &[&env.leo, &env.sam], 0).await;
    let pc = env.hub_view("preview_close", json!({"pot": dao, "balance": null})).await;
    assert_eq!(pc["blocked_reason"], "no_contributions");
    env.hub_relay(&env.ana, "propose_close", json!({"pot": dao}), 150).await.expect_err("ERR_NO_CONTRIBUTIONS");
    assert_eq!(env.gift(&env.maya, &dao, 100 * USDC, "lnkB2").await.json(), json!("100000000"));
    let pc = env.hub_view("preview_close", json!({"pot": dao, "balance": null})).await;
    assert_eq!((pc["can_propose"].as_bool(), pc["split"].as_str()), (Some(true), Some("equal")), "{pc}");
    let want = json!([
        {"account_id": env.ana.id, "amount": "33333333"},
        {"account_id": env.leo.id, "amount": "33333333"},
        {"account_id": env.sam.id, "amount": "33333334"}
    ]);
    let ms = env.hub_view("get_members", json!({"pot": dao, "balance": null})).await;
    assert_eq!(ms.as_array().unwrap().iter().map(|m| m["would_get_back"].clone()).collect::<Vec<_>>(), vec![json!("33333333"), json!("33333333"), json!("33333334")]);
    let o = env.hub_relay(&env.ana, "propose_close", json!({"pot": dao}), 150).await;
    let v = o.json();
    assert_eq!((v["ok"].as_bool(), v["balance"].as_str(), v["dust"].as_str(), v["dust_to"].as_str()), (Some(true), Some("100000000"), Some("1"), Some(env.sam.id.as_str())), "{}", o.dump());
    assert_eq!(v["payouts"], want);
    let pid = v["proposal_id"].as_u64().unwrap();
    let before = balances(&env, &[&env.ana, &env.leo, &env.sam]).await;
    env.vote(&env.ana, &dao, pid, "VoteApprove", 300).await.ok();
    env.vote(&env.leo, &dao, pid, "VoteApprove", 300).await.ok();
    assert_eq!(env.sync(&dao, pid).await.json()["hub_status"], "closed");
    let after = balances(&env, &[&env.ana, &env.leo, &env.sam]).await;
    let got: Vec<u128> = after.iter().zip(&before).map(|(a, b)| a - b).collect();
    assert_eq!(got, vec![33_333_333, 33_333_333, 33_333_334]);
    assert_eq!(env.ft_balance(&dao).await, 0);
    Ok(())
}

/// G5: gifts count toward a normal goal; they are refused while an all-or-nothing goal collects
/// (and accepted once it is reached).
async fn g5(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let deadline = env.now_ms().await as u64 + 3_600_000;
    let soft = json!({"trust": true, "one_ok_cap": "300000000", "links": true, "goal": {"amount": (50 * USDC).to_string(), "deadline_ms": deadline, "all_or_nothing": false}});
    let dao = env.pot_with_extras(&env.eve, "soft", Value::Null, soft, &[], 0).await;
    let o = env.gift(&env.sam, &dao, 20 * USDC, "s1").await;
    assert_eq!(o.json(), json!("20000000"));
    assert!(!o.event_names().contains(&"goal_reached".to_string()));
    let g = env.hub_view("get_goal", json!({"pot": dao})).await;
    assert_eq!((g["state"].as_str(), g["progress"].as_str(), g["gifts_total"].as_str(), g["total_contributed"].as_str()), (Some("collecting"), Some("20000000"), Some("20000000"), Some("0")));
    // the last $30 is a gift too: the gift reaches the goal
    let o = env.gift(&env.maya, &dao, 30 * USDC, "s2").await;
    assert_eq!(o.json(), json!("30000000"));
    assert_eq!(o.event("goal_reached")["total"], "50000000");
    let g = env.hub_view("get_goal", json!({"pot": dao})).await;
    assert_eq!((g["state"].as_str(), g["progress"].as_str()), (Some("reached"), Some("50000000")));

    // all-or-nothing: refused while collecting (its promise is "your contribution back")
    let aon = json!({"trust": true, "one_ok_cap": "300000000", "links": true, "goal": {"amount": (100 * USDC).to_string(), "deadline_ms": deadline, "all_or_nothing": true}});
    let dao2 = env.pot_with_extras(&env.leo, "allin", Value::Null, aon, &[], 0).await;
    assert_eq!(env.gifts(&dao2).await["refusal"], "goal_collecting");
    refused(&env, &env.maya, 10 * USDC, gift_msg(&dao2, "a1"), "ERR_GOAL_COLLECTING").await;
    let o = env.contribute(&env.leo, &dao2, 100 * USDC).await;
    assert_eq!(o.event("goal_reached")["total"], "100000000");
    assert_eq!(env.gift(&env.maya, &dao2, 10 * USDC, "a2").await.json(), json!("10000000"));
    let g = env.hub_view("get_goal", json!({"pot": dao2})).await;
    assert_eq!((g["progress"].as_str(), g["gifts_total"].as_str()), (Some("100000000"), Some("10000000")), "an all-or-nothing goal counts contributions only");
    let _ = rref(0);
    Ok(())
}

/// G6: a failed forward (the Pot's DAO unregistered from the token) refunds the giver and records
/// nothing; a close that reaches the hub while a gift forward is pending is refused
/// (ERR_GIFT_IN_FLIGHT) and the block clears as soon as the forward settles.
async fn g6(build: Build) -> anyhow::Result<()> {
    use base64::Engine;
    // hub 1.3.0: Pots made by hub 1.3.0 (policy v3) let members only vote, so the raw DAO proposals
    // this test needs come from Pots made by the 1.2.0 hub (policy v1); the hub is upgraded right after
    let env = Env::legacy(build).await?;
    let (dao, _) = env.create_pot(&env.maya, "unreg").await;
    env.upgrade_hub().await?;
    let kind = json!({"FunctionCall": {"receiver_id": env.usdc, "actions": [{
        "method_name": "storage_unregister",
        "args": base64::engine::general_purpose::STANDARD.encode("{}"),
        "deposit": "1", "gas": "10000000000000"}]}});
    let id = env
        .relay(&env.maya, &dao, "add_proposal", json!({"proposal": {"description": "unregister", "kind": kind}}), 50, 0)
        .await
        .json()
        .as_u64()
        .unwrap();
    env.vote(&env.maya, &dao, id, "VoteApprove", 300).await.ok();
    assert!(env.view(&env.usdc.clone(), "storage_balance_of", json!({"account_id": dao})).await.is_null());
    let eve0 = env.ft_balance(&env.eve.id).await;
    let o = env.gift(&env.eve, &dao, 5 * USDC, "f1").await;
    assert_eq!(o.json(), json!("0"), "a failed forward returns the whole amount\n{}", o.dump());
    assert_eq!(env.ft_balance(&env.eve.id).await, eve0);
    assert_eq!(env.ft_balance(&env.hub).await, 0);
    assert!(o.events().is_empty(), "no gift_received on a refund");
    let g = env.gifts(&dao).await;
    assert_eq!((g["total"].as_str(), g["count"].as_u64(), g["in_flight"].as_bool()), (Some("0"), Some(0), Some(false)));

    // the race: a direct gift, and a direct close sent `delay` ms later. Every gift here fails its
    // forward (refunded), so the close is refused either ERR_GIFT_IN_FLIGHT (forward pending) or
    // ERR_NO_CONTRIBUTIONS (before / after it): the Pot stays open and the race can be retried.
    let gift_args = serde_json::to_vec(&json!({"receiver_id": env.hub, "amount": (2 * USDC).to_string(), "msg": gift_msg(&dao, "race")}))?;
    let close_args = serde_json::to_vec(&json!({"pot": dao}))?;
    let mut hits = 0;
    let mut tried = vec![];
    for delay in [300u64, 250, 350, 200, 400, 150, 450, 500, 100, 600, 50, 700, 800, 1000] {
        let outs = env
            .rpc
            .call_staggered(vec![
                (env.eve.clone(), env.usdc.clone(), "ft_transfer_call".into(), gift_args.clone(), 100, 1, 0),
                (env.maya.clone(), env.hub.clone(), "propose_close".into(), close_args.clone(), 150, 200 * MILLI, delay),
            ])
            .await?;
        assert_eq!(outs[0].json(), json!("0"), "the gift is refunded");
        let e = outs[1].err();
        let hit = e.contains("ERR_GIFT_IN_FLIGHT");
        assert!(hit || e.contains("ERR_NO_CONTRIBUTIONS"), "delay {delay}: {e}");
        tried.push((delay, hit));
        // after both settled: never stuck in flight; the close is refused only for "no money"
        assert_eq!(env.gifts(&dao).await["in_flight"], false);
        if hit {
            hits += 1;
            env.hub_call(&env.maya, "propose_close", json!({"pot": dao}), 150, 200 * MILLI).await.expect_err("ERR_NO_CONTRIBUTIONS");
            break;
        }
    }
    println!("[{build:?}] G6 gift/close race (delay ms, hit ERR_GIFT_IN_FLIGHT): {tried:?}");
    assert!(hits > 0, "no attempt landed the close inside the gift's forward window: {tried:?} (the path is unit-tested in unit_gifts.rs)");
    assert_eq!(env.ft_balance(&env.eve.id).await, eve0, "every raced gift was refunded");
    Ok(())
}

/// G7: the testnet 1.1.0 build (fixture) → 1.2.0 (fixture, the build deployed on testnet) with a plain
/// DeployContract (NO migrate): live Pots, requests, a funded link, a goal and an invite all keep
/// working; gifts default ON for old Pots. (1.2.0 → 1.3.0 is t_migrate m2.)
async fn g7(build: Build) -> anyhow::Result<()> {
    let env = Env::with(build, HubOpts { limits: Some(roomy_limits()), hub_wasm: Some(hub_v11_wasm()), ..Default::default() }).await?;
    assert_eq!(env.hub_view("get_config", json!({})).await["version"], "1.1.0");

    // ---- live 1.1.0 state
    let (dao, sk, pk) = env.pot_with_members(&env.maya, "old", &[&env.sam, &env.leo], 150 * USDC).await;
    assert_eq!(env.request_spend(&env.maya, &dao, 50 * USDC, &env.maya.id, &rref(1)).await.json()["status"], "approved");
    let v = env.request_spend(&env.maya, &dao, 350 * USDC, &env.maya.id, &rref(2)).await.json();
    assert_eq!((v["status"].as_str(), v["tier"].as_str()), (Some("pending"), Some("group")));
    let vote_pid = v["proposal_id"].as_u64().unwrap();
    let (lsk, lpk) = Env::invite_key();
    let v = env.request_link(&env.sam, &dao, 20 * USDC, &lpk, None, &rref(3)).await.json();
    assert_eq!((v["status"].as_str(), v["link"].as_bool()), (Some("approved"), Some(true)));
    let link_id = v["request_id"].as_u64().unwrap();
    let deadline = env.now_ms().await as u64 + 3_600_000;
    let soft = json!({"trust": true, "one_ok_cap": "300000000", "links": true, "goal": {"amount": (500 * USDC).to_string(), "deadline_ms": deadline, "all_or_nothing": false}});
    let dao2 = env.pot_with_extras(&env.eve, "goal", Value::Null, soft, &[], 0).await;
    assert_eq!(env.contribute(&env.eve, &dao2, 40 * USDC).await.json(), json!("40000000"));
    // a 1.1.0 hub has no gifts: the gift msg is a bad contribution msg → refunded
    refused(&env, &env.ana, 5 * USDC, gift_msg(&dao, "pre"), "ERR_BAD_MSG").await;
    let snap = |m: &'static str, a: Value| {
        let env = &env;
        async move { env.hub_view(m, a).await }
    };
    let pot0 = snap("get_pot", json!({"pot": dao})).await;
    let members0 = snap("get_members", json!({"pot": dao, "balance": null})).await;
    let reqs0 = snap("get_requests", json!({"pot": dao, "from_index": 0, "limit": 50})).await;
    let link0 = snap("get_link", json!({"pot": dao, "request_id": link_id})).await;
    let goal0 = snap("get_goal", json!({"pot": dao2})).await;
    let trusts0 = snap("get_trusts", json!({"pot": dao})).await;
    let record0 = snap("get_record", json!({"pot": dao, "from_index": 0, "limit": 50})).await;
    let close0 = snap("preview_close", json!({"pot": dao, "balance": null})).await;
    let pots_of0 = snap("get_pots_of", json!({"account_id": env.maya.id})).await;
    let cfg0 = snap("get_config", json!({})).await;

    // ---- the upgrade: ONE DeployContract action, no function call
    let r = env.hub_account.deploy(&hub_v12_wasm()).await?;
    assert!(r.is_success(), "plain deploy: {:?}", r.details);
    let cfg1 = env.hub_view("get_config", json!({})).await;
    assert_eq!(cfg1["version"], "1.2.0");
    for k in ["owner", "usdc", "dao_code_hash", "dao_float", "min_dao_float", "relayers", "limits", "paused", "pot_count"] {
        assert_eq!(cfg1[k], cfg0[k], "get_config.{k}");
    }
    // `migrate` is for 1.0.0 state only: on 1.1.0 state it fails and changes nothing
    let m = env.hub_account.call(env.hub_account.id(), "migrate").args_json(json!({})).gas(near_workspaces::types::Gas::from_tgas(50)).transact().await?;
    assert!(m.is_failure(), "migrate must not run on 1.1.0 state");

    // ---- every old view reads the same; the new fields default to "gifts on, none yet"
    let pot1 = env.pot(&dao).await;
    for (k, v) in pot0.as_object().unwrap() {
        assert_eq!(&pot1[k.as_str()], v, "get_pot.{k}");
    }
    assert_eq!((pot1["gifts_on"].as_bool(), pot1["gifts_total"].as_str(), pot1["gifts_count"].as_u64()), (Some(true), Some("0"), Some(0)));
    assert_eq!(env.hub_view("get_members", json!({"pot": dao, "balance": null})).await, members0);
    assert_eq!(env.hub_view("get_requests", json!({"pot": dao, "from_index": 0, "limit": 50})).await, reqs0);
    assert_eq!(env.hub_view("get_link", json!({"pot": dao, "request_id": link_id})).await, link0);
    assert_eq!(env.hub_view("get_trusts", json!({"pot": dao})).await, trusts0);
    assert_eq!(env.hub_view("get_record", json!({"pot": dao, "from_index": 0, "limit": 50})).await, record0);
    assert_eq!(env.hub_view("get_pots_of", json!({"account_id": env.maya.id})).await, pots_of0);
    let goal1 = env.hub_view("get_goal", json!({"pot": dao2})).await;
    for (k, v) in goal0.as_object().unwrap() {
        assert_eq!(&goal1[k.as_str()], v, "get_goal.{k}");
    }
    let close1 = env.hub_view("preview_close", json!({"pot": dao, "balance": null})).await;
    for (k, v) in close0.as_object().unwrap() {
        assert_eq!(&close1[k.as_str()], v, "preview_close.{k}");
    }
    let g = env.gifts(&dao).await;
    assert_eq!((g["on"].as_bool(), g["accepting"].as_bool(), g["total"].as_str()), (Some(true), Some(true), Some("0")));

    // ---- old things still work after the upgrade
    let maya0 = env.ft_balance(&env.maya.id).await;
    env.vote(&env.sam, &dao, vote_pid, "VoteApprove", 100).await.ok();
    env.vote(&env.leo, &dao, vote_pid, "VoteApprove", 100).await.ok();
    assert_eq!(env.sync(&dao, vote_pid).await.json()["hub_status"], "approved");
    assert_eq!(env.ft_balance(&env.maya.id).await - maya0, 350 * USDC, "the vote made before the upgrade pays out");
    let o = env
        .relay(&env.ana, &env.hub.clone(), "claim_link", json!({"pot": dao, "request_id": link_id, "receiver_id": env.ana.id, "signature": env.claim_sig(&lsk, &dao, link_id, &env.ana.id)}), 100, 0)
        .await;
    assert_eq!(o.json()["status"], "claimed", "the link funded before the upgrade is claimed after it");
    assert_eq!(env.join(&env.ana, &dao, &sk, &pk).await.json()["status"], "active", "the old invite still works");
    assert_eq!(env.request_spend(&env.sam, &dao, 30 * USDC, &env.sam.id, &rref(4)).await.json()["status"], "approved");

    // ---- gifts are ON for the old Pots
    let o = env.gift(&env.eve, &dao, 10 * USDC, "first").await;
    assert_eq!(o.json(), json!("10000000"), "{}", o.dump());
    assert_eq!(o.event("gift_received")["gifts_total"], "10000000");
    let o = env.gift(&env.maya, &dao2, 460 * USDC, "goal").await;
    assert_eq!(o.event("goal_reached")["total"], "500000000", "an old Pot's normal goal counts the gift");
    let pot2 = env.pot(&dao).await;
    assert_eq!(u(&pot2["balance_estimate"]), u(&pot1["balance_estimate"]) - 350 * USDC - 30 * USDC + 10 * USDC);
    // a member can turn them off on an old Pot
    env.hub_relay(&env.leo, "set_gifts", json!({"pot": dao, "on": false}), 30).await.ok();
    refused(&env, &env.eve, 5 * USDC, gift_msg(&dao, "off"), "ERR_GIFTS_OFF").await;
    // a Pot created after the upgrade: gifts on
    let (dao3, o) = env.create_pot(&env.sam, "fresh").await;
    assert_eq!(o.json()["ok"], true);
    assert_eq!(env.pot(&dao3).await["gifts_on"], true);
    Ok(())
}

dual!(g1_gift_recorded, g1);
dual!(g2_gift_refusals, g2);
dual!(g3_gifts_shared_at_close, g3);
dual!(g4_gifts_only_equal_split, g4);
dual!(g5_gifts_and_goals, g5);
dual!(g6_failed_forward_and_in_flight, g6);
dual!(g7_upgrade_1_1_to_1_2, g7);
