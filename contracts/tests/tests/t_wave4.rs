//! Wave 4 (hub 1.1.0): earned trust + the one-OK tier (W1), pay by link (W2), failed escrow
//! payouts and Finalize (W3), the all-or-nothing goal (W4). Builds A and B. notes/contracts-wave4.md.

use pot_tests::*;
use serde_json::{json, Value};

fn rref(n: u32) -> String {
    format!("wave{n:08}")
}

async fn preview(env: &Env, pot: &near_workspaces::AccountId, who: &Actor, amount: u128, to: &near_workspaces::AccountId) -> Value {
    env.hub_view("preview_spend", json!({"pot": pot, "account_id": who.id, "amount": amount.to_string(), "receiver_id": to, "balance": null})).await
}

async fn trust(env: &Env, pot: &near_workspaces::AccountId, who: &Actor) -> Value {
    env.hub_view("get_trust", json!({"pot": pot, "account_id": who.id})).await
}

async fn ok_request(env: &Env, who: &Actor, pot: &near_workspaces::AccountId, request_id: u64) -> Outcome {
    env.hub_relay(who, "ok_request", json!({"pot": pot, "request_id": request_id}), 200).await
}

async fn record(env: &Env, pot: &near_workspaces::AccountId, request_id: u64) -> Value {
    let r = env.hub_view("get_record", json!({"pot": pot, "from_index": request_id, "limit": 1})).await;
    r.as_array().unwrap()[0].clone()
}

async fn link(env: &Env, pot: &near_workspaces::AccountId, request_id: u64) -> Value {
    env.hub_view("get_link", json!({"pot": pot, "request_id": request_id})).await
}

async fn claim(env: &Env, who: &Actor, pot: &near_workspaces::AccountId, request_id: u64, receiver: &near_workspaces::AccountId, sig: &str) -> Outcome {
    env.relay(who, &env.hub.clone(), "claim_link", json!({"pot": pot, "request_id": request_id, "receiver_id": receiver, "signature": sig}), 100, 0)
        .await
}

fn small_rules() -> Value {
    json!({"instant_cap": (20 * USDC).to_string(), "member_budget": (1000 * USDC).to_string(), "instant_payees": "members", "payee_allowlist": []})
}

/// W1 earned trust (level up, decline) + the one-OK tier (auth failures, objection) + trust off.
async fn w1(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let dao = env.pot_with_extras(&env.maya, "trust", small_rules(), Value::Null, &[&env.sam, &env.leo], 300 * USDC).await;
    // contract defaults for a new Pot: trust on, one-OK up to 3 × the cap, links on, no goal
    let pot = env.pot(&dao).await;
    assert_eq!(pot["extras"], json!({"trust": true, "one_ok_cap": "60000000", "links": true, "goal": null}));
    assert_eq!((pot["policy_version"].as_u64(), pot["goal_state"].as_str(), pot["open_links"].as_u64()), (Some(1), Some("none"), Some(0)));
    let t = trust(&env, &dao, &env.maya).await;
    assert_eq!(
        (t["level"].as_u64(), t["next_level_in"].as_u64(), t["effective_cap"].as_str(), t["min_qualifying"].as_str(), t["instant_up_to"].as_str()),
        (Some(0), Some(3), Some("20000000"), Some("2000000"), Some("20000000"))
    );
    let p = preview(&env, &dao, &env.maya, 30 * USDC, &env.maya.id).await;
    assert_eq!((p["path"].as_str(), p["tier"].as_str(), p["reason"].as_str()), (Some("vote"), Some("one_ok"), Some("over_cap")));

    // a $1 spend settles but is below the qualifying amount ($2 = cap / 10)
    let v = env.request_spend(&env.maya, &dao, USDC, &env.maya.id, &rref(0)).await.json();
    assert_eq!((v["status"].as_str(), v["tier"].as_str(), v["link"].as_bool()), (Some("approved"), Some("instant"), Some(false)));
    let t = trust(&env, &dao, &env.maya).await;
    assert_eq!((t["settled"].as_u64(), t["streak"].as_u64(), t["level"].as_u64()), (Some(1), Some(0), Some(0)));
    // three qualifying $5 spends → level 1 (2 × the cap)
    let mut last = None;
    for i in 1..=3 {
        let o = env.request_spend(&env.maya, &dao, 5 * USDC, &env.maya.id, &rref(i)).await;
        assert_eq!(o.json()["status"], "approved");
        last = Some(o);
    }
    let o = last.unwrap();
    assert_eq!(
        o.event("trust_level_changed"),
        json!({"pot": dao, "member": env.maya.id, "from": 0, "to": 1, "settled": 4, "declined": 0, "cause": "settled"})
    );
    let t = trust(&env, &dao, &env.maya).await;
    assert_eq!(
        (t["level"].as_u64(), t["streak"].as_u64(), t["multiplier"].as_u64(), t["effective_cap"].as_str(), t["settled_amount"].as_str()),
        (Some(1), Some(0), Some(2), Some("40000000"), Some("16000000"))
    );
    // $30 is now instant for Maya (still one-OK for Sam, who has no record)
    let p = preview(&env, &dao, &env.maya, 30 * USDC, &env.maya.id).await;
    assert_eq!((p["path"].as_str(), p["tier"].as_str(), p["trust_level"].as_u64()), (Some("instant"), Some("instant"), Some(1)));
    assert_eq!(preview(&env, &dao, &env.sam, 30 * USDC, &env.sam.id).await["tier"], "one_ok");
    assert_eq!(env.request_spend(&env.maya, &dao, 30 * USDC, &env.maya.id, &rref(4)).await.json()["path"], "instant");

    // one-OK: $55 (> 40, ≤ 60)
    let v = env.request_spend(&env.maya, &dao, 55 * USDC, &env.maya.id, &rref(5)).await.json();
    assert_eq!((v["path"].as_str(), v["tier"].as_str(), v["status"].as_str()), (Some("vote"), Some("one_ok"), Some("pending")));
    let rid = v["request_id"].as_u64().unwrap();
    let pid = v["proposal_id"].as_u64().unwrap();
    ok_request(&env, &env.maya, &dao, rid).await.expect_err("ERR_OK_SELF");
    ok_request(&env, &env.eve, &dao, rid).await.expect_err("ERR_NOT_MEMBER");
    let maya0 = env.ft_balance(&env.maya.id).await;
    let o = ok_request(&env, &env.sam, &dao, rid).await;
    assert_eq!(o.json(), json!({"request_id": rid, "ok": true, "status": "approved"}));
    assert_eq!(
        o.event("spend_ok_approved"),
        json!({"pot": dao, "request_id": rid, "proposal_id": pid, "requester": env.maya.id, "by": env.sam.id, "amount": "55000000"})
    );
    assert_eq!(env.proposal(&dao, pid).await["votes"], json!({ env.hub.as_str(): "Approve" }), "Sam's OK went through the hub");
    assert_eq!(env.ft_balance(&env.maya.id).await - maya0, 55 * USDC);
    println!("[{build:?}] W1 ok_request (one-OK approve + payout): {:.2} Tgas burnt", o.total_gas_burnt() as f64 / 1e12);
    ok_request(&env, &env.leo, &dao, rid).await.expect_err("ERR_NOT_PENDING");
    let r = record(&env, &dao, rid).await;
    assert_eq!(
        (r["tier"].as_str(), r["approved_by"].as_str(), r["ok_by"].as_str(), r["money"].as_str(), r["payee"].as_str()),
        (Some("one_ok"), Some("one_ok"), Some(env.sam.id.as_str()), Some("paid"), Some(env.maya.id.as_str()))
    );
    assert_eq!(record(&env, &dao, 0).await["approved_by"], "rules");
    let rv = env.hub_view("get_request", json!({"pot": dao, "request_id": rid})).await;
    assert_eq!((rv["tier"].as_str(), rv["ok_by"].as_str()), (Some("one_ok"), Some(env.sam.id.as_str())));

    // group tier (> 60): no OK shortcut
    let v = env.request_spend(&env.maya, &dao, 100 * USDC, &env.maya.id, &rref(6)).await.json();
    assert_eq!((v["tier"].as_str(), v["status"].as_str()), (Some("group"), Some("pending")));
    let group_rid = v["request_id"].as_u64().unwrap();
    let group_pid = v["proposal_id"].as_u64().unwrap();
    ok_request(&env, &env.sam, &dao, group_rid).await.expect_err("ERR_NOT_ONE_OK");

    // an objection (any Reject vote in the DAO) means the majority decides
    let v = env.request_spend(&env.maya, &dao, 50 * USDC, &env.maya.id, &rref(7)).await.json();
    let obj_rid = v["request_id"].as_u64().unwrap();
    let obj_pid = v["proposal_id"].as_u64().unwrap();
    env.vote(&env.leo, &dao, obj_pid, "VoteReject", 100).await.ok();
    let o = ok_request(&env, &env.sam, &dao, obj_rid).await;
    assert_eq!(o.json(), json!({"request_id": obj_rid, "ok": false, "status": "pending", "reason": "objection"}));
    let rv = env.hub_view("get_request", json!({"pot": dao, "request_id": obj_rid})).await;
    assert_eq!((rv["status"].as_str(), rv["ok_by"].as_str()), (Some("pending"), None));
    assert_eq!(env.proposal(&dao, obj_pid).await["status"], "InProgress");

    // a declined request drops Maya a level
    env.vote(&env.sam, &dao, group_pid, "VoteReject", 100).await.ok();
    env.vote(&env.leo, &dao, group_pid, "VoteReject", 100).await.ok();
    let s = env.sync(&dao, group_pid).await;
    assert_eq!(s.json()["hub_status"], "rejected");
    assert_eq!(
        s.event("trust_level_changed"),
        json!({"pot": dao, "member": env.maya.id, "from": 1, "to": 0, "settled": 6, "declined": 1, "cause": "declined"})
    );
    let t = trust(&env, &dao, &env.maya).await;
    assert_eq!((t["level"].as_u64(), t["declined"].as_u64(), t["effective_cap"].as_str()), (Some(0), Some(1), Some("20000000")));
    assert!(t["last_declined_ms"].is_u64());
    assert_eq!(record(&env, &dao, group_rid).await["money"], "declined");
    let all = env.hub_view("get_trusts", json!({"pot": dao})).await;
    assert_eq!(all.as_array().unwrap().len(), 3);

    // trust off and no one-OK: the 1.0.0 behaviour
    let off = json!({"trust": false, "one_ok_cap": "0", "links": false, "goal": null});
    let dao2 = env.pot_with_extras(&env.ana, "plain", small_rules(), off.clone(), &[&env.eve], 100 * USDC).await;
    let v = env.request_spend(&env.ana, &dao2, 30 * USDC, &env.ana.id, &rref(8)).await.json();
    assert_eq!((v["path"].as_str(), v["tier"].as_str()), (Some("vote"), Some("group")));
    ok_request(&env, &env.eve, &dao2, v["request_id"].as_u64().unwrap()).await.expect_err("ERR_NOT_ONE_OK");
    for _ in 0..3 {
        env.request_spend(&env.ana, &dao2, 5 * USDC, &env.ana.id, &rref(9)).await.ok();
    }
    let t = trust(&env, &dao2, &env.ana).await;
    assert_eq!((t["enabled"].as_bool(), t["level"].as_u64(), t["multiplier"].as_u64(), t["effective_cap"].as_str()), (Some(false), Some(1), Some(1), Some("20000000")));
    // invalid extras: a one-OK ceiling below the instant cap
    let bad = json!({"trust": true, "one_ok_cap": "1000000", "links": true, "goal": null});
    env.create_pot_extras(&env.ana, "badx", "custom", small_rules(), bad, None).await.1.expect_err("ERR_EXTRAS_INVALID");
    Ok(())
}

/// W2 pay by link: instant link, claim by a brand-new 0-NEAR account through the relayer (the hub
/// registers it on the token), signature / replay failures, one-OK link, cancel, expiry, close block.
async fn w2(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let dao = env.pot_with_extras(&env.maya, "party", Value::Null, Value::Null, &[&env.sam, &env.leo], 200 * USDC).await;
    let hub = env.hub.clone();
    let (sk, pk) = Env::invite_key();
    // shapes: a link names the hub; nothing else may
    env.request_spend(&env.maya, &dao, 10 * USDC, &hub, &rref(0)).await.expect_err("ERR_BAD_RECEIVER");
    env.hub_relay(
        &env.maya,
        "request_spend",
        json!({"pot": dao, "amount": "1000000", "receiver_id": env.maya.id, "category": "food", "request_ref": rref(0), "link": {"claim_pk": pk, "expires_at_ms": null}}),
        250,
    )
    .await
    .expect_err("ERR_BAD_RECEIVER");
    let p = env.hub_view("preview_spend", json!({"pot": dao, "account_id": env.maya.id, "amount": (25 * USDC).to_string(), "receiver_id": hub, "balance": null, "link": true})).await;
    assert_eq!((p["path"].as_str(), p["tier"].as_str()), (Some("instant"), Some("instant")), "a link is an allowed payee");
    assert_eq!(preview(&env, &dao, &env.maya, 25 * USDC, &hub).await["reason"], "bad_receiver", "the hub is a receiver only for a link");

    // an instant link: the DAO pays the hub (escrow) with ft_transfer_call
    let hub0 = env.ft_balance(&hub).await;
    let o = env.request_link(&env.maya, &dao, 25 * USDC, &pk, None, &rref(1)).await;
    let v = o.json();
    assert_eq!((v["status"].as_str(), v["link"].as_bool(), v["tier"].as_str()), (Some("approved"), Some(true), Some("instant")), "{}", o.dump());
    let rid = v["request_id"].as_u64().unwrap();
    let pid = v["proposal_id"].as_u64().unwrap();
    assert!(o.event_names().contains(&"link_funded".to_string()), "{:?}", o.event_names());
    assert_eq!(o.event("spend_requested")["link"], true);
    println!("[{build:?}] W2 instant link request: {:.2} Tgas burnt", o.total_gas_burnt() as f64 / 1e12);
    assert_eq!(env.ft_balance(&hub).await - hub0, 25 * USDC);
    let prop = env.proposal(&dao, pid).await;
    assert_eq!(
        prop["kind"],
        json!({"Transfer": {"token_id": env.usdc, "receiver_id": hub, "amount": "25000000", "msg": format!("{{\"link\":{rid}}}")}})
    );
    let l = link(&env, &dao, rid).await;
    assert_eq!((l["status"].as_str(), l["claimable"].as_bool(), l["claim_pk"].as_str()), (Some("funded"), Some(true), Some(pk.as_str())));
    let ttl = u(&l["expires_at_ms"]) - u(&l["funded_at_ms"]);
    assert!(ttl <= 14 * 86_400_000 && ttl > 14 * 86_400_000 - 600_000, "default link expiry ≈ 14 days: {ttl}");
    assert_eq!(env.pot(&dao).await["open_links"], 1);

    // the claimer: a brand-new account with 0 NEAR, not registered on the token
    let vendor = env.new_actor("vendor", 0).await?;
    assert_eq!(env.view(&env.usdc.clone(), "storage_balance_of", json!({"account_id": vendor.id})).await, Value::Null);
    let (other, _) = Env::invite_key();
    claim(&env, &vendor, &dao, rid, &vendor.id, &env.claim_sig(&other, &dao, rid, &vendor.id)).await.expect_err("ERR_BAD_SIGNATURE");
    // a signature for another receiver can't be redirected
    claim(&env, &vendor, &dao, rid, &vendor.id, &env.claim_sig(&sk, &dao, rid, &env.eve.id)).await.expect_err("ERR_BAD_SIGNATURE");
    // nor replayed on another request id
    claim(&env, &vendor, &dao, rid, &vendor.id, &env.claim_sig(&sk, &dao, rid + 1, &vendor.id)).await.expect_err("ERR_BAD_SIGNATURE");
    let hub_near0 = env.balance(&hub).await;
    let o = claim(&env, &vendor, &dao, rid, &vendor.id, &env.claim_sig(&sk, &dao, rid, &vendor.id)).await;
    assert_eq!(o.json(), json!({"request_id": rid, "ok": true, "status": "claimed", "receiver_id": vendor.id}), "{}", o.dump());
    assert_eq!(o.event("link_claimed"), json!({"pot": dao, "request_id": rid, "receiver_id": vendor.id, "amount": "25000000"}));
    println!("[{build:?}] W2 claim_link (+registration): {:.2} Tgas burnt, hub NEAR −{}", o.total_gas_burnt() as f64 / 1e12, hub_near0.saturating_sub(env.balance(&hub).await));
    assert_eq!(env.ft_balance(&vendor.id).await, 25 * USDC);
    assert_eq!(env.ft_balance(&hub).await, hub0);
    assert!(hub_near0.saturating_sub(env.balance(&hub).await) <= 2 * 1_250_000_000_000_000_000_000, "≤ one registration + state");
    claim(&env, &vendor, &dao, rid, &vendor.id, &env.claim_sig(&sk, &dao, rid, &vendor.id)).await.expect_err("ERR_LINK_DONE");
    let r = record(&env, &dao, rid).await;
    assert_eq!(
        (r["payee"].as_str(), r["link"].as_bool(), r["money"].as_str(), r["approved_by"].as_str(), r["link_status"].as_str()),
        (Some(vendor.id.as_str()), Some(true), Some("paid"), Some("rules"), Some("claimed"))
    );
    assert_eq!(trust(&env, &dao, &env.maya).await["settled"], 1, "a link settles when claimed");

    // a one-OK link ($150 > $100 cap): no money moves until the OK
    let (sk2, pk2) = Env::invite_key();
    let v = env.request_link(&env.maya, &dao, 150 * USDC, &pk2, None, &rref(2)).await.json();
    assert_eq!((v["status"].as_str(), v["tier"].as_str()), (Some("pending"), Some("one_ok")));
    let rid2 = v["request_id"].as_u64().unwrap();
    assert_eq!(link(&env, &dao, rid2).await["status"], "awaiting_funds");
    claim(&env, &env.eve, &dao, rid2, &env.eve.id, &env.claim_sig(&sk2, &dao, rid2, &env.eve.id)).await.expect_err("ERR_LINK_NOT_FUNDED");
    env.hub_relay(&env.maya, "reclaim_link", json!({"pot": dao, "request_id": rid2}), 50).await.expect_err("ERR_LINK_NOT_FINAL");
    let o = ok_request(&env, &env.sam, &dao, rid2).await;
    assert_eq!(o.json()["status"], "approved", "{}", o.dump());
    assert!(o.event_names().contains(&"link_funded".to_string()));
    assert_eq!(link(&env, &dao, rid2).await["status"], "funded");
    // only the requester may cancel before expiry
    env.hub_relay(&env.sam, "reclaim_link", json!({"pot": dao, "request_id": rid2}), 50).await.expect_err("ERR_LINK_NOT_EXPIRED");
    let dao0 = env.ft_balance(&dao).await;
    let o = env.hub_relay(&env.maya, "reclaim_link", json!({"pot": dao, "request_id": rid2}), 50).await;
    assert_eq!(o.json(), json!({"request_id": rid2, "ok": true, "status": "returned", "receiver_id": null}));
    assert_eq!(o.event("link_returned"), json!({"pot": dao, "request_id": rid2, "amount": "150000000", "by": env.maya.id, "moved": true}));
    assert_eq!(env.ft_balance(&dao).await - dao0, 150 * USDC);
    assert_eq!(env.ft_balance(&hub).await, hub0, "the hub holds nothing");
    claim(&env, &env.eve, &dao, rid2, &env.eve.id, &env.claim_sig(&sk2, &dao, rid2, &env.eve.id)).await.expect_err("ERR_LINK_DONE");
    let pot = env.pot(&dao).await;
    assert_eq!((pot["open_links"].as_u64(), pot["balance_estimate"].as_str()), (Some(0), Some("575000000")));
    assert_eq!(record(&env, &dao, rid2).await["money"], "returned");

    // a short link: claims stop at expiry; then anyone may send it back
    let (sk3, pk3) = Env::invite_key();
    let exp = env.now_ms().await + 70_000;
    let v = env.request_link(&env.maya, &dao, 10 * USDC, &pk3, Some(exp), &rref(3)).await.json();
    assert_eq!(v["status"], "approved");
    let rid3 = v["request_id"].as_u64().unwrap();
    env.request_link(&env.maya, &dao, 10 * USDC, &pk3, Some(env.now_ms().await + 31 * 86_400_000), &rref(4)).await.expect_err("ERR_LINK_EXPIRY_INVALID");
    while env.now_ms().await <= exp + 1_000 {
        env.fast_forward(100).await;
    }
    // a close waits for open links
    env.hub_relay(&env.sam, "propose_close", json!({"pot": dao}), 150).await.expect_err("ERR_LINKS_PENDING");
    assert_eq!(env.hub_view("preview_close", json!({"pot": dao, "balance": null})).await["blocked_reason"], "links_pending");
    claim(&env, &env.eve, &dao, rid3, &env.eve.id, &env.claim_sig(&sk3, &dao, rid3, &env.eve.id)).await.expect_err("ERR_LINK_EXPIRED");
    let o = env.call(&env.eve, &hub, "reclaim_link", json!({"pot": dao, "request_id": rid3}), 50, 0).await;
    assert_eq!(o.json()["status"], "returned");
    assert_eq!(env.hub_view("preview_close", json!({"pot": dao, "balance": null})).await["can_propose"], true);

    // a direct (unsponsored) claim pays the token registration itself
    let (sk4, pk4) = Env::invite_key();
    let rid4 = env.request_link(&env.sam, &dao, 5 * USDC, &pk4, None, &rref(5)).await.json()["request_id"].as_u64().unwrap();
    let args = json!({"pot": dao, "request_id": rid4, "receiver_id": env.eve.id, "signature": env.claim_sig(&sk4, &dao, rid4, &env.eve.id)});
    env.call(&env.eve, &hub, "claim_link", args.clone(), 100, 0).await.expect_err("ERR_DEPOSIT_REQUIRED");
    let eve0 = env.ft_balance(&env.eve.id).await;
    let o = env.call(&env.eve, &hub, "claim_link", args, 100, 10 * MILLI).await;
    assert_eq!(o.json()["status"], "claimed");
    assert_eq!(env.ft_balance(&env.eve.id).await - eve0, 5 * USDC);

    // links off
    let off = json!({"trust": true, "one_ok_cap": "300000000", "links": false, "goal": null});
    let dao2 = env.pot_with_extras(&env.ana, "nolinks", Value::Null, off, &[], 50 * USDC).await;
    let (_, pk5) = Env::invite_key();
    env.request_link(&env.ana, &dao2, 5 * USDC, &pk5, None, &rref(6)).await.expect_err("ERR_LINKS_OFF");
    Ok(())
}

/// W3 a link payout that fails (the DAO is short when the OK lands) → payout_failed → contribute →
/// `retry_payout` (Finalize, link gas) → funded → claimed.
async fn w3(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let dao = env.pot_with_extras(&env.maya, "retry", Value::Null, Value::Null, &[&env.sam, &env.leo], 100 * USDC).await;
    let (sk, pk) = Env::invite_key();
    let v = env.request_link(&env.maya, &dao, 250 * USDC, &pk, None, &rref(0)).await.json();
    assert_eq!((v["status"].as_str(), v["tier"].as_str()), (Some("pending"), Some("one_ok")));
    let rid = v["request_id"].as_u64().unwrap();
    let pid = v["proposal_id"].as_u64().unwrap();
    // others spend first: the Pot drops to $100
    assert_eq!(env.request_spend(&env.sam, &dao, 100 * USDC, &env.sam.id, &rref(1)).await.json()["status"], "approved");
    assert_eq!(env.request_spend(&env.leo, &dao, 100 * USDC, &env.leo.id, &rref(2)).await.json()["status"], "approved");
    // the hub's approve lands; the payout (a detached promise) fails afterwards: the outcome is
    // optimistic (D7), the relayer's sync after it finds the failure
    let o = ok_request(&env, &env.leo, &dao, rid).await;
    assert_eq!(o.json(), json!({"request_id": rid, "ok": true, "status": "approved"}), "{}", o.dump());
    assert!(!o.event_names().contains(&"link_funded".to_string()));
    assert_eq!(env.proposal(&dao, pid).await["status"], "Failed");
    let s = env.sync(&dao, pid).await;
    assert_eq!(s.json()["hub_status"], "payout_failed");
    assert_eq!(link(&env, &dao, rid).await["status"], "awaiting_funds");
    assert_eq!(env.pot(&dao).await["unpaid_approved"], 1);
    assert_eq!(record(&env, &dao, rid).await["money"], "failed");
    env.hub_relay(&env.maya, "reclaim_link", json!({"pot": dao, "request_id": rid}), 50).await.expect_err("ERR_LINK_NOT_FINAL");
    // top up, then the relayer's retry (Finalize with the link's gas)
    assert_eq!(env.contribute(&env.maya, &dao, 200 * USDC).await.json(), json!((200 * USDC).to_string()));
    let o = env.relayer_call("retry_payout", json!({"pot": dao, "proposal_id": pid}), 150).await;
    assert_eq!(o.json(), json!({"proposal_id": pid, "retried": true, "dao_status": "Approved", "hub_status": "approved"}), "{}", o.dump());
    assert_eq!(link(&env, &dao, rid).await["status"], "funded");
    assert_eq!(env.ft_balance(&env.hub.clone()).await, 250 * USDC);
    let o = claim(&env, &env.sam, &dao, rid, &env.sam.id, &env.claim_sig(&sk, &dao, rid, &env.sam.id)).await;
    assert_eq!(o.json()["status"], "claimed");
    assert_eq!(env.ft_balance(&env.hub.clone()).await, 0);
    let r = record(&env, &dao, rid).await;
    assert_eq!((r["approved_by"].as_str(), r["ok_by"].as_str(), r["money"].as_str()), (Some("one_ok"), Some(env.leo.id.as_str()), Some("paid")));

    // a group-tier link ($350 > one-OK $300) approved by member votes at the relayer's 100 Tgas: the
    // deciding vote's payout (ft_transfer_call → the hub) has enough gas to fund the escrow
    assert_eq!(env.contribute(&env.maya, &dao, 400 * USDC).await.json(), json!((400 * USDC).to_string()));
    let (_, pk2) = Env::invite_key();
    let v = env.request_link(&env.maya, &dao, 350 * USDC, &pk2, None, &rref(3)).await.json();
    assert_eq!((v["status"].as_str(), v["tier"].as_str()), (Some("pending"), Some("group")));
    let rid2 = v["request_id"].as_u64().unwrap();
    let pid2 = v["proposal_id"].as_u64().unwrap();
    env.vote(&env.sam, &dao, pid2, "VoteApprove", 100).await.ok();
    let o = env.vote(&env.leo, &dao, pid2, "VoteApprove", 100).await;
    o.ok();
    assert!(o.event_names().contains(&"link_funded".to_string()), "{:?}", o.event_names());
    assert_eq!(env.proposal(&dao, pid2).await["status"], "Approved");
    assert_eq!(env.sync(&dao, pid2).await.json()["hub_status"], "approved");
    assert_eq!(link(&env, &dao, rid2).await["status"], "funded");
    assert_eq!(record(&env, &dao, rid2).await["approved_by"], "group");
    let o = env.hub_relay(&env.maya, "reclaim_link", json!({"pot": dao, "request_id": rid2}), 50).await;
    assert_eq!(o.json()["status"], "returned");
    assert_eq!(env.ft_balance(&env.hub.clone()).await, 0);
    Ok(())
}

/// W4 the all-or-nothing goal: blocked spends, missed → refund_unfunded (propose, then approve as
/// rulebot) → everyone gets their contribution back; reached → spends open; rules edits.
async fn w4(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let now = env.now_ms().await;
    let deadline = now + 150_000;
    let goal = json!({"amount": (300 * USDC).to_string(), "deadline_ms": deadline as u64, "all_or_nothing": true});
    let extras = json!({"trust": true, "one_ok_cap": "300000000", "links": true, "goal": goal});
    let (sk, pk) = Env::invite_key();
    let (dao, o) = env.create_pot_extras(&env.maya, "fund", "trip", Value::Null, extras.clone(), Some(pk.clone())).await;
    assert_eq!(o.json()["ok"], true, "{}", o.dump());
    assert_eq!(o.event("rule_extras_set")["policy_version"], 2);
    // policy v2: the rulebot may also approve / finalize `call` proposals
    let pol = env.policy(&dao).await;
    let rb = pol["roles"].as_array().unwrap().iter().find(|r| r["name"] == "rulebot").unwrap().clone();
    assert!(rb["permissions"].as_array().unwrap().contains(&json!("call:VoteApprove")));
    assert_eq!(rb["vote_policy"]["call"], json!({"weight_kind": "RoleWeight", "quorum": "1", "threshold": [1, 1]}));
    for m in [&env.sam, &env.leo] {
        assert_eq!(env.join(m, &dao, &sk, &pk).await.json()["status"], "active");
    }
    let g = env.hub_view("get_goal", json!({"pot": dao})).await;
    assert_eq!((g["state"].as_str(), g["spends_blocked"].as_bool(), g["can_refund"].as_bool()), (Some("collecting"), Some(true), Some(false)));
    for (m, x) in [(&env.maya, 100), (&env.sam, 50), (&env.leo, 30)] {
        assert_eq!(env.contribute(m, &dao, x * USDC).await.json(), json!((x * USDC).to_string()));
    }
    env.request_spend(&env.maya, &dao, 10 * USDC, &env.maya.id, &rref(0)).await.expect_err("ERR_GOAL_NOT_REACHED");
    assert_eq!(preview(&env, &dao, &env.maya, 10 * USDC, &env.maya.id).await["reason"], "goal_not_reached");
    env.relayer_call("refund_unfunded", json!({"pot": dao}), 300).await.expect_err("ERR_GOAL_NOT_MISSED");
    while env.now_ms().await <= deadline + 1_000 {
        env.fast_forward(100).await;
    }
    // missed: money in is refused (the token refunds), the goal is locked
    let sam0 = env.ft_balance(&env.sam.id).await;
    assert_eq!(env.contribute(&env.sam, &dao, 10 * USDC).await.json(), json!("0"));
    assert_eq!(env.ft_balance(&env.sam.id).await, sam0);
    let rules = json!({"instant_cap": "100000000", "member_budget": "200000000", "instant_payees": "members", "payee_allowlist": []});
    let moved = json!({"trust": true, "one_ok_cap": "300000000", "links": true,
                       "goal": {"amount": (100 * USDC).to_string(), "deadline_ms": (deadline + 3_600_000) as u64, "all_or_nothing": true}});
    env.hub_relay(&env.sam, "propose_rules", json!({"pot": dao, "rules": rules, "extras": moved}), 100).await.expect_err("ERR_GOAL_LOCKED");
    let g = env.hub_view("get_goal", json!({"pot": dao})).await;
    assert_eq!((g["state"].as_str(), g["can_refund"].as_bool()), (Some("refundable"), Some(true)));

    // phase 1: the hub proposes the pro-rata refund close
    let o = env.relayer_call("refund_unfunded", json!({"pot": dao}), 300).await;
    let v = o.json();
    assert_eq!((v["ok"].as_bool(), v["balance"].as_str()), (Some(true), Some("180000000")), "{}", o.dump());
    let pid = v["proposal_id"].as_u64().unwrap();
    assert_eq!(o.event("goal_refund_proposed")["proposal_id"], pid);
    assert_eq!(o.event("close_proposed")["by"], env.hub.as_str());
    assert_eq!(env.hub_view("get_goal", json!({"pot": dao})).await["state"], "refunding");
    env.hub_relay(&env.maya, "propose_close", json!({"pot": dao}), 150).await.expect_err("ERR_CLOSE_IN_PROGRESS");
    // phase 2: the hub approves it as rulebot; everyone gets exactly their contribution back
    let before: Vec<u128> = futures_balances(&env, &[&env.maya, &env.sam, &env.leo]).await;
    let o = env.relayer_call("refund_unfunded", json!({"pot": dao}), 300).await;
    assert_eq!(o.json(), json!({"proposal_id": pid, "subject": "close", "dao_status": "Approved", "hub_status": "closed", "changed": true}), "{}", o.dump());
    assert!(o.event_names().contains(&"goal_refunded".to_string()) && o.event_names().contains(&"pot_closed".to_string()));
    println!("[{build:?}] W4 refund approve (n=3): {:.2} Tgas burnt", o.total_gas_burnt() as f64 / 1e12);
    let after: Vec<u128> = futures_balances(&env, &[&env.maya, &env.sam, &env.leo]).await;
    let got: Vec<u128> = after.iter().zip(&before).map(|(a, b)| a - b).collect();
    assert_eq!(got, vec![100 * USDC, 50 * USDC, 30 * USDC]);
    assert_eq!(env.ft_balance(&dao).await, 0);
    assert_eq!(env.proposal(&dao, pid).await["votes"], json!({ env.hub.as_str(): "Approve" }));
    assert_eq!(env.hub_view("get_goal", json!({"pot": dao})).await["state"], "refunded");
    env.relayer_call("refund_unfunded", json!({"pot": dao}), 300).await.expect_err("ERR_POT_NOT_OPEN");

    // reached: spends open as soon as the goal is met
    let goal2 = json!({"amount": (200 * USDC).to_string(), "deadline_ms": (env.now_ms().await + 3_600_000) as u64, "all_or_nothing": true});
    let x2 = json!({"trust": true, "one_ok_cap": "300000000", "links": true, "goal": goal2});
    let dao2 = env.pot_with_extras(&env.ana, "reach", Value::Null, x2, &[&env.eve], 0).await;
    env.contribute(&env.ana, &dao2, 120 * USDC).await;
    let o = env.contribute(&env.eve, &dao2, 80 * USDC).await;
    assert_eq!(o.event("goal_reached")["total"], "200000000");
    assert_eq!(env.hub_view("get_goal", json!({"pot": dao2})).await["state"], "reached");
    assert_eq!(env.request_spend(&env.ana, &dao2, 50 * USDC, &env.ana.id, &rref(1)).await.json()["status"], "approved");
    env.relayer_call("refund_unfunded", json!({"pot": dao2}), 300).await.expect_err("ERR_GOAL_NOT_MISSED");

    // rules edits before the deadline (sole member): move the goal; a 1.0-policy Pot can't add all-or-nothing
    let g3 = json!({"amount": (500 * USDC).to_string(), "deadline_ms": (env.now_ms().await + 3_600_000) as u64, "all_or_nothing": true});
    let (dao3, o) = env.create_pot_extras(&env.leo, "solo", "trip", Value::Null, json!({"trust": true, "one_ok_cap": "0", "links": false, "goal": g3}), None).await;
    assert_eq!(o.json()["ok"], true);
    let lower = json!({"amount": (50 * USDC).to_string(), "deadline_ms": (env.now_ms().await + 7_200_000) as u64, "all_or_nothing": true});
    let o = env.hub_relay(&env.leo, "set_rules", json!({"pot": dao3, "rules": rules, "extras": {"trust": true, "one_ok_cap": "0", "links": false, "goal": lower}}), 30).await;
    assert_eq!(o.json()["applied"], true, "{}", o.dump());
    assert_eq!(o.event("rule_extras_set")["extras"]["goal"]["amount"], "50000000");
    let past = json!({"amount": "1", "deadline_ms": 1u64, "all_or_nothing": false});
    env.hub_relay(&env.leo, "set_rules", json!({"pot": dao3, "rules": rules, "extras": {"trust": true, "one_ok_cap": "0", "links": false, "goal": past}}), 30)
        .await
        .expect_err("ERR_GOAL_INVALID");
    let (dao4, _) = env.create_pot_extras(&env.eve, "v1pol", "trip", Value::Null, Value::Null, None).await;
    let aon = json!({"amount": "1000000", "deadline_ms": (env.now_ms().await + 3_600_000) as u64, "all_or_nothing": true});
    env.hub_relay(&env.eve, "set_rules", json!({"pot": dao4, "rules": rules, "extras": {"trust": true, "one_ok_cap": "300000000", "links": true, "goal": aon}}), 30)
        .await
        .expect_err("ERR_GOAL_UNSUPPORTED");
    let soft = json!({"amount": "1000000", "deadline_ms": (env.now_ms().await + 3_600_000) as u64, "all_or_nothing": false});
    let o = env.hub_relay(&env.eve, "set_rules", json!({"pot": dao4, "rules": rules, "extras": {"trust": true, "one_ok_cap": "300000000", "links": true, "goal": soft}}), 30).await;
    assert_eq!(o.json()["applied"], true);
    assert_eq!(env.hub_view("get_goal", json!({"pot": dao4})).await["spends_blocked"], false);
    env.relayer_call("refund_unfunded", json!({"pot": dao4}), 300).await.expect_err("ERR_NO_GOAL");
    Ok(())
}

async fn futures_balances(env: &Env, who: &[&Actor]) -> Vec<u128> {
    let mut out = vec![];
    for a in who {
        out.push(env.ft_balance(&a.id).await);
    }
    out
}

dual!(w1_trust_one_ok, w1);
dual!(w2_pay_by_link, w2);
dual!(w3_link_payout_retry, w3);
dual!(w4_all_or_nothing_goal, w4);
