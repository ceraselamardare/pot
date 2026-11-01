//! C-15: rules. T-60…T-62, T-91 — builds A and B.

use base64::Engine;
use pot_tests::*;
use serde_json::{json, Value};

fn rules(cap: u128, budget: u128) -> Value {
    json!({"instant_cap": cap.to_string(), "member_budget": budget.to_string(), "instant_payees": "members", "payee_allowlist": []})
}

/// T-60 sole member · T-61 ★ group rules · T-62 auth · T-91 one open rules proposal.
async fn t60(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    // T-60: the sole member applies at once
    let (solo, _) = env.create_pot(&env.maya, "solo").await;
    let o = env.hub_relay(&env.maya, "set_rules", json!({"pot": solo, "rules": rules(50 * USDC, 150 * USDC)}), 30).await;
    assert_eq!(o.json(), json!({"applied": true, "proposal_id": null, "rules_version": 2}));
    assert_eq!(
        o.event("rules_changed"),
        json!({"pot": solo, "rules": rules(50 * USDC, 150 * USDC), "rules_version": 2, "by": "sole_member", "actor": env.maya.id})
    );
    assert_eq!(env.pot(&solo).await["rules"], rules(50 * USDC, 150 * USDC));
    // T-62: invalid rules; outsider
    let bad = json!({"instant_cap": "1", "member_budget": "1", "instant_payees": "members", "payee_allowlist": [env.eve.id]});
    env.hub_relay(&env.maya, "set_rules", json!({"pot": solo, "rules": bad}), 30).await.expect_err("ERR_RULES_INVALID");
    let too_big = rules(1_000_000_000_000_001, 1);
    env.hub_relay(&env.maya, "set_rules", json!({"pot": solo, "rules": too_big}), 30).await.expect_err("ERR_RULES_INVALID");
    env.hub_relay(&env.eve, "set_rules", json!({"pot": solo, "rules": rules(1, 1)}), 30).await.expect_err("ERR_NOT_MEMBER");
    env.hub_relay(&env.eve, "propose_rules", json!({"pot": solo, "rules": rules(1, 1)}), 100).await.expect_err("ERR_NOT_MEMBER");

    // T-61 ★ group rules in a 3-member Pot
    let (dao, _, _) = env.pot_with_members(&env.maya, "group", &[&env.sam, &env.leo], 0).await;
    env.hub_relay(&env.sam, "set_rules", json!({"pot": dao, "rules": rules(1, 1)}), 30).await.expect_err("ERR_USE_PROPOSE_RULES");
    let new_rules = rules(50 * USDC, 150 * USDC);
    let o = env.hub_relay(&env.sam, "propose_rules", json!({"pot": dao, "rules": new_rules}), 100).await;
    let v = o.json();
    let pid = v["proposal_id"].as_u64().unwrap();
    assert_eq!(v, json!({"applied": false, "proposal_id": pid, "rules_version": 1}));
    assert_eq!(o.event("rules_change_proposed"), json!({"pot": dao, "proposal_id": pid, "by": env.sam.id, "rules": new_rules, "rules_version": 2}));
    println!("[{build:?}] T-61 propose_rules: {:.2} Tgas burnt", o.total_gas_burnt() as f64 / 1e12);
    let inner = format!(r#"{{"pot":"{dao}","rules":{{"instant_cap":"50000000","member_budget":"150000000","instant_payees":"members","payee_allowlist":[]}}}}"#);
    let prop = env.proposal(&dao, pid).await;
    assert_eq!(
        prop["kind"],
        json!({"FunctionCall": {"receiver_id": env.hub, "actions": [{
            "method_name": "set_rules", "args": base64::engine::general_purpose::STANDARD.encode(inner),
            "deposit": "0", "gas": "15000000000000"}]}})
    );
    assert_eq!(prop["description"], "Pot rules change v2");
    assert_eq!(env.pot(&dao).await["rules"], rules(100 * USDC, 200 * USDC), "unchanged until the vote");
    assert_eq!(env.pot(&dao).await["open_rules_proposal"], pid);
    let s = env.hub_view("get_proposal_subject", json!({"pot": dao, "proposal_id": pid})).await;
    assert_eq!((s["kind"].as_str(), s["rules_version"].as_u64(), s["live"].as_bool()), (Some("rules"), Some(2), Some(true)));
    // T-91: a 2nd proposal while one is open
    env.hub_relay(&env.maya, "propose_rules", json!({"pot": dao, "rules": rules(1, 1)}), 100).await.expect_err("ERR_RULES_PENDING");
    // 2 of 3 approve at 300 Tgas → the DAO calls hub.set_rules
    env.vote(&env.sam, &dao, pid, "VoteApprove", 300).await.ok();
    let o = env.vote(&env.leo, &dao, pid, "VoteApprove", 300).await;
    o.ok();
    println!("[{build:?}] T-61 executing rules vote: {:.2} Tgas burnt", o.total_gas_burnt() as f64 / 1e12);
    assert_eq!(env.proposal(&dao, pid).await["status"], "Approved");
    let ev = o.event("rules_changed");
    assert_eq!(ev, json!({"pot": dao, "rules": new_rules, "rules_version": 2, "by": "group", "actor": dao}));
    let pot = env.pot(&dao).await;
    assert_eq!((pot["rules"].clone(), pot["rules_version"].as_u64()), (new_rules.clone(), Some(2)));
    // the slot stays taken until sync sees the resolution (the relayer syncs after every vote)
    let s = env.sync(&dao, pid).await;
    assert_eq!((s.json()["hub_status"].as_str(), s.json()["changed"].as_bool()), (Some("resolved"), Some(true)));
    assert_eq!(env.pot(&dao).await["open_rules_proposal"], Value::Null);

    // T-91: rejected → sync frees the slot
    let v = env.hub_relay(&env.maya, "propose_rules", json!({"pot": dao, "rules": rules(10 * USDC, 10 * USDC)}), 100).await.json();
    let pid2 = v["proposal_id"].as_u64().unwrap();
    env.vote(&env.sam, &dao, pid2, "VoteReject", 300).await.ok();
    env.vote(&env.leo, &dao, pid2, "VoteReject", 300).await.ok();
    assert_eq!(env.proposal(&dao, pid2).await["status"], "Rejected");
    env.hub_relay(&env.maya, "propose_rules", json!({"pot": dao, "rules": rules(1, 1)}), 100).await.expect_err("ERR_RULES_PENDING");
    env.sync(&dao, pid2).await.ok();
    let v = env.hub_relay(&env.maya, "propose_rules", json!({"pot": dao, "rules": rules(20 * USDC, 20 * USDC)}), 100).await.json();
    let pid3 = v["proposal_id"].as_u64().unwrap();
    // T-91: expired → sync frees the slot (the group shortens the period; a later vote expires it)
    let kind = json!({"ChangePolicyUpdateParameters": {"parameters": {"proposal_period": "1000000000"}}});
    let id = env.relay(&env.maya, &dao, "add_proposal", json!({"proposal": {"description": "shorten", "kind": kind}}), 50, 0).await.json().as_u64().unwrap();
    env.vote(&env.maya, &dao, id, "VoteApprove", 100).await.ok();
    env.vote(&env.sam, &dao, id, "VoteApprove", 100).await.ok();
    env.fast_forward(10).await;
    env.vote(&env.leo, &dao, pid3, "VoteApprove", 300).await.ok();
    assert_eq!(env.proposal(&dao, pid3).await["status"], "Expired");
    let s = env.sync(&dao, pid3).await;
    assert_eq!((s.json()["dao_status"].as_str(), s.json()["hub_status"].as_str()), (Some("Expired"), Some("resolved")));
    assert_eq!(env.pot(&dao).await["open_rules_proposal"], Value::Null);
    assert_eq!(env.pot(&dao).await["rules"], new_rules, "an expired proposal never applies");

    // T-62: another Pot's DAO calling set_rules → ERR_NOT_POT_DAO (its proposal ends Failed)
    let args = format!(r#"{{"pot":"{dao}","rules":{{"instant_cap":"1","member_budget":"1","instant_payees":"members","payee_allowlist":[]}}}}"#);
    let kind = json!({"FunctionCall": {"receiver_id": env.hub, "actions": [{
        "method_name": "set_rules", "args": base64::engine::general_purpose::STANDARD.encode(args), "deposit": "0", "gas": "15000000000000"}]}});
    let id = env.relay(&env.maya, &solo, "add_proposal", json!({"proposal": {"description": "hijack", "kind": kind}}), 50, 0).await.json().as_u64().unwrap();
    let o = env.vote(&env.maya, &solo, id, "VoteApprove", 300).await;
    assert!(o.failures().join(" ").contains("ERR_NOT_POT_DAO"), "{}", o.dump());
    assert_eq!(env.proposal(&solo, id).await["status"], "Failed");
    assert_eq!(env.pot(&dao).await["rules"], new_rules);
    Ok(())
}
dual!(t60_rules, t60);
