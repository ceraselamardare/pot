//! Wave 4: the hub 1.0.0 → 1.1.0 upgrade. Deploys the 1.0.0 build that runs on testnet
//! (`tests/fixtures/pot_hub_v1.0.0.wasm`, sha256 06861ce7…), makes live Pots / requests / invites,
//! upgrades with DeployContract + `migrate` in ONE transaction, and checks that the old Pots still
//! work (old rules, pending votes, invites) and can opt into the new rules. Builds A and B.

use near_workspaces::operations::Function;
use pot_tests::*;
use serde_json::{json, Value};

fn rref(n: u32) -> String {
    format!("migr{n:08}")
}

async fn m1(build: Build) -> anyhow::Result<()> {
    let env = Env::with(build, HubOpts { limits: Some(roomy_limits()), hub_wasm: Some(hub_v1_wasm()), ..Default::default() }).await?;
    assert_eq!(env.hub_view("get_config", json!({})).await["version"], "1.0.0");

    // ---- live 1.0.0 state: a Pot with members, money, an instant spend, a pending vote, an invite
    let (dao, sk, pk) = env.pot_with_members(&env.maya, "old", &[&env.sam, &env.leo], 150 * USDC).await;
    assert_eq!(env.request_spend(&env.maya, &dao, 84 * USDC, &env.maya.id, &rref(0)).await.json()["status"], "approved");
    let v = env.request_spend(&env.maya, &dao, 300 * USDC, &env.maya.id, &rref(1)).await.json();
    assert_eq!(v["status"], "pending");
    let pid = v["proposal_id"].as_u64().unwrap();
    let pot0 = env.pot(&dao).await;
    let members0 = env.hub_view("get_members", json!({"pot": dao, "balance": null})).await;

    // ---- the upgrade: DeployContract + migrate, one transaction signed by the hub account
    let new_code = hub_wasm();
    let r = env
        .hub_account
        .batch(env.hub_account.id())
        .deploy(&new_code)
        .call(Function::new("migrate").args_json(json!({})).gas(near_workspaces::types::Gas::from_tgas(50)))
        .transact()
        .await?;
    assert!(r.is_success(), "deploy + migrate: {r:?}");
    assert_eq!(env.hub_view("get_config", json!({})).await["version"], "1.1.0");
    // migrate runs once, and only as the hub itself
    let again = env
        .hub_account
        .call(env.hub_account.id(), "migrate")
        .args_json(json!({}))
        .gas(near_workspaces::types::Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(again.is_failure(), "a second migrate must fail (the state is already 1.1.0)");
    env.hub_call(&env.eve, "migrate", json!({}), 50, 0).await.expect_err("Method migrate is private");

    // ---- old records read unchanged; the old Pot keeps the 1.0.0 rules
    let pot1 = env.pot(&dao).await;
    for k in ["seq", "rules", "rules_version", "member_count", "total_contributed", "spent_instant", "spent_vote", "reserved", "balance_estimate", "request_count", "open_requests"] {
        assert_eq!(pot1[k], pot0[k], "{k}");
    }
    assert_eq!(pot1["extras"], json!({"trust": false, "one_ok_cap": "0", "links": false, "goal": null}));
    assert_eq!((pot1["policy_version"].as_u64(), pot1["open_links"].as_u64(), pot1["goal_state"].as_str()), (Some(1), Some(0), Some("none")));
    assert_eq!(env.hub_view("get_members", json!({"pot": dao, "balance": null})).await, members0);
    let r1 = env.hub_view("get_request", json!({"pot": dao, "request_id": 1})).await;
    assert_eq!((r1["status"].as_str(), r1["tier"].as_str(), r1["link_status"].as_str()), (Some("pending"), Some("group"), None));
    assert_eq!(env.hub_view("get_goal", json!({"pot": dao})).await, Value::Null);
    let t = env.hub_view("get_trust", json!({"pot": dao, "account_id": env.maya.id})).await;
    assert_eq!((t["enabled"].as_bool(), t["settled"].as_u64()), (Some(false), Some(0)), "no record before the upgrade");

    // ---- the pending vote from before the upgrade still completes
    let maya0 = env.ft_balance(&env.maya.id).await;
    env.vote(&env.sam, &dao, pid, "VoteApprove", 100).await.ok();
    env.vote(&env.leo, &dao, pid, "VoteApprove", 100).await.ok();
    assert_eq!(env.sync(&dao, pid).await.json()["hub_status"], "approved");
    assert_eq!(env.ft_balance(&env.maya.id).await - maya0, 300 * USDC);
    assert_eq!(env.hub_view("get_record", json!({"pot": dao, "from_index": 1, "limit": 1})).await[0]["approved_by"], "group");
    assert_eq!(env.contribute(&env.maya, &dao, 300 * USDC).await.json(), json!((300 * USDC).to_string()));
    // old Pot, old rules: instant within the cap, over the cap → the group (no one-OK, no links)
    assert_eq!(env.request_spend(&env.sam, &dao, 50 * USDC, &env.sam.id, &rref(2)).await.json()["tier"], "instant");
    let v = env.request_spend(&env.leo, &dao, 101 * USDC, &env.leo.id, &rref(3)).await.json();
    assert_eq!((v["path"].as_str(), v["tier"].as_str(), v["status"].as_str()), (Some("vote"), Some("group"), Some("pending")));
    env.hub_relay(&env.maya, "ok_request", json!({"pot": dao, "request_id": v["request_id"]}), 200).await.expect_err("ERR_NOT_ONE_OK");
    let (_, lpk) = Env::invite_key();
    env.request_link(&env.maya, &dao, 5 * USDC, &lpk, None, &rref(4)).await.expect_err("ERR_LINKS_OFF");
    // the invite made before the upgrade still works
    assert_eq!(env.join(&env.ana, &dao, &sk, &pk).await.json()["status"], "active");

    // ---- the old Pot opts in through the normal rules-change flow (group vote)
    let rules = json!({"instant_cap": "100000000", "member_budget": "200000000", "instant_payees": "members", "payee_allowlist": []});
    let extras = json!({"trust": true, "one_ok_cap": "300000000", "links": true, "goal": null});
    let o = env.hub_relay(&env.sam, "propose_rules", json!({"pot": dao, "rules": rules, "extras": extras}), 100).await;
    let rpid = o.json()["proposal_id"].as_u64().unwrap();
    for m in [&env.maya, &env.leo, &env.ana] {
        env.vote(m, &dao, rpid, "VoteApprove", 300).await.ok();
    }
    assert_eq!(env.proposal(&dao, rpid).await["status"], "Approved");
    let pot2 = env.pot(&dao).await;
    assert_eq!(pot2["extras"], extras);
    assert_eq!(pot2["rules_version"], 2);
    let (lsk, lpk) = Env::invite_key();
    let v = env.request_link(&env.maya, &dao, 20 * USDC, &lpk, None, &rref(5)).await.json();
    assert_eq!((v["status"].as_str(), v["link"].as_bool()), (Some("approved"), Some(true)));
    let rid = v["request_id"].as_u64().unwrap();
    let o = env
        .relay(&env.eve, &env.hub.clone(), "claim_link", json!({"pot": dao, "request_id": rid, "receiver_id": env.eve.id, "signature": env.claim_sig(&lsk, &dao, rid, &env.eve.id)}), 100, 0)
        .await;
    assert_eq!(o.json()["status"], "claimed");

    // ---- a Pot created after the upgrade gets the new defaults
    let (dao2, o) = env.create_pot(&env.eve, "fresh").await;
    assert_eq!(o.json()["ok"], true);
    assert_eq!(env.pot(&dao2).await["extras"], json!({"trust": true, "one_ok_cap": "300000000", "links": true, "goal": null}));
    Ok(())
}

dual!(m1_upgrade_1_0_to_1_1, m1);
