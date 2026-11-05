//! C-08: request_spend (instant + vote), preview_spend parity, request views, prepay, subjects.
//! T-20…T-28, T-30, T-31, T-94, T-96, T-88 (spend views) — builds A and B.

use pot_tests::*;
use serde_json::{json, Value};

fn rref(n: u32) -> String {
    format!("ref{n:08}")
}

async fn preview(env: &Env, pot: &near_workspaces::AccountId, who: &Actor, amount: u128, to: &near_workspaces::AccountId) -> Value {
    env.hub_view("preview_spend", json!({"pot": pot, "account_id": who.id, "amount": amount.to_string(), "receiver_id": to, "balance": null})).await
}

/// T-20 ★ instant $84 · T-21 over cap · T-22 over budget · T-88 preview parity + request views.
async fn t20(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (dao, _, _) = env.pot_with_members(&env.maya, "lisbon", &[&env.sam, &env.leo], 150 * USDC).await;
    // T-88 parity: preview before each request
    let p = preview(&env, &dao, &env.maya, 84 * USDC, &env.maya.id).await;
    assert_eq!((p["path"].as_str(), p["reason"].as_str()), (Some("instant"), Some("within_rules")));
    assert_eq!(p["client_must_check"], json!(["payee_registered", "dao_membership"]));

    // T-20 ★
    let dao_acc0 = env.account(&dao).await.unwrap();
    let maya0 = env.ft_balance(&env.maya.id).await;
    let o = env.request_spend(&env.maya, &dao, 84 * USDC, &env.maya.id, "k3d9x1a2b4c6m7n8").await;
    let v = o.json();
    // hub 1.1.0 (wave 4) adds `tier` and `link`
    assert_eq!(v, json!({"tier":"instant","link":false,"request_id":0,"proposal_id":2,"path":"instant","reason":"within_rules","status":"approved","refusal":null,"approvals_needed":2}));
    assert_eq!(o.event_names(), vec!["spend_requested", "spend_auto_approved"]);
    let ev = o.event("spend_requested");
    assert_eq!(ev["path"], "instant");
    assert_eq!(ev["request_ref"], "k3d9x1a2b4c6m7n8");
    assert_eq!(ev["approvals_needed"], 2);
    assert_eq!(
        o.event("spend_auto_approved"),
        json!({"pot":dao,"request_id":0,"proposal_id":2,"requester":env.maya.id,"receiver_id":env.maya.id,"amount":"84000000","budget_used":"84000000","budget_left":"116000000"})
    );
    let prop = env.proposal(&dao, 2).await;
    assert_eq!(prop["status"], "Approved");
    assert_eq!(prop["votes"], json!({ env.hub.as_str(): "Approve" }));
    assert_eq!(prop["description"], "Pot request #0: groceries (ref k3d9x1a2b4c6m7n8)");
    assert_eq!(prop["kind"], json!({"Transfer":{"token_id":env.usdc,"receiver_id":env.maya.id,"amount":"84000000","msg":null}}));
    assert_eq!(env.ft_balance(&env.maya.id).await - maya0, 84 * USDC);
    let m = env.member(&dao, &env.maya.id).await;
    assert_eq!((m["instant_used"].as_str(), m["spent"].as_str(), m["budget_left"].as_str()), (Some("84000000"), Some("84000000"), Some("116000000")));
    let pot = env.pot(&dao).await;
    assert_eq!(pot["spent_instant"], "84000000");
    assert_eq!(pot["reserved"], "0");
    assert_eq!(pot["balance_estimate"], "366000000");
    // prepay ≥ the DAO's storage growth (proposal + rulebot vote), so the float is untouched
    let dao_acc1 = env.account(&dao).await.unwrap();
    let grew = (dao_acc1.storage_usage - dao_acc0.storage_usage) as u128 * 10u128.pow(19);
    let prepaid = dao_acc1.amount.as_yoctonear() - dao_acc0.amount.as_yoctonear();
    assert!(prepaid >= grew, "prepay {prepaid} < storage growth {grew}");
    println!(
        "[{build:?}] T-20 instant spend: {:.2} Tgas burnt, DAO storage +{} B, prepay {} B-equiv",
        o.total_gas_burnt() as f64 / 1e12,
        dao_acc1.storage_usage - dao_acc0.storage_usage,
        prepaid / 10u128.pow(19)
    );
    let r = env.hub_view("get_request", json!({"pot": dao, "request_id": 0})).await;
    assert_eq!(r["status"], "approved");
    assert_eq!(u(&r["expires_at_ms"]) - u(&r["created_at_ms"]), 604_800_000);
    let s = env.hub_view("get_proposal_subject", json!({"pot": dao, "proposal_id": 2})).await;
    assert_eq!(s, json!({"pot":dao,"proposal_id":2,"kind":"spend","request_id":0,"member":null,"rules_version":null,"live":false}));

    // T-21 over cap $101 → vote; boundary $100 → instant (Sam)
    let p = preview(&env, &dao, &env.maya, 101 * USDC, &env.maya.id).await;
    assert_eq!((p["path"].as_str(), p["reason"].as_str()), (Some("vote"), Some("over_cap")));
    let o = env.request_spend(&env.maya, &dao, 101 * USDC, &env.maya.id, &rref(1)).await;
    let v = o.json();
    assert_eq!((v["path"].as_str(), v["reason"].as_str(), v["status"].as_str()), (Some("vote"), Some("over_cap"), Some("pending")));
    let pid = v["proposal_id"].as_u64().unwrap();
    let prop = env.proposal(&dao, pid).await;
    assert_eq!(prop["status"], "InProgress");
    assert_eq!(prop["votes"], json!({}), "the hub never votes on a vote-path request");
    assert_eq!(o.event_names(), vec!["spend_requested"]);
    let m = env.member(&dao, &env.maya.id).await;
    assert_eq!(m["instant_used"], "84000000", "vote-path requests don't use the budget");
    let pot = env.pot(&dao).await;
    assert_eq!(pot["open_requests"], 1);
    let s = env.hub_view("get_proposal_subject", json!({"pot": dao, "proposal_id": pid})).await;
    assert_eq!(s["live"], true);
    let p = preview(&env, &dao, &env.sam, 100 * USDC, &env.sam.id).await;
    assert_eq!(p["path"], "instant");
    let v = env.request_spend(&env.sam, &dao, 100 * USDC, &env.sam.id, &rref(2)).await.json();
    assert_eq!((v["path"].as_str(), v["status"].as_str()), (Some("instant"), Some("approved")));

    // T-22 over budget: Maya 84 + 100 (instant) = 184; $20 → vote over_budget; $16 (= 200) → instant
    env.wait_busy_window().await;
    let v = env.request_spend(&env.maya, &dao, 100 * USDC, &env.maya.id, &rref(3)).await.json();
    assert_eq!(v["status"], "approved");
    let p = preview(&env, &dao, &env.maya, 20 * USDC, &env.maya.id).await;
    assert_eq!((p["path"].as_str(), p["reason"].as_str()), (Some("vote"), Some("over_budget")));
    let v = env.request_spend(&env.maya, &dao, 20 * USDC, &env.maya.id, &rref(4)).await.json();
    assert_eq!((v["path"].as_str(), v["reason"].as_str()), (Some("vote"), Some("over_budget")));
    let p = preview(&env, &dao, &env.maya, 16 * USDC, &env.maya.id).await;
    assert_eq!(p["path"], "instant");
    let v = env.request_spend(&env.maya, &dao, 16 * USDC, &env.maya.id, &rref(5)).await.json();
    assert_eq!((v["path"].as_str(), v["status"].as_str()), (Some("instant"), Some("approved")));
    assert_eq!(env.member(&dao, &env.maya.id).await["budget_left"], "0");

    // T-88 request views: paging, newest page, bounds
    let all = env.hub_view("get_requests", json!({"pot": dao, "from_index": 0, "limit": 50})).await;
    let ids: Vec<u64> = all.as_array().unwrap().iter().map(|r| r["request_id"].as_u64().unwrap()).collect();
    assert_eq!(ids, vec![0, 1, 2, 3, 4, 5]);
    let page = env.hub_view("get_requests", json!({"pot": dao, "from_index": 4, "limit": 2})).await;
    assert_eq!(page.as_array().unwrap().len(), 2);
    let capped = env.hub_view("get_requests", json!({"pot": dao, "from_index": 0, "limit": 500})).await;
    assert_eq!(capped.as_array().unwrap().len(), 6);
    let rules = env.hub_view("get_rules", json!({"pot": dao})).await;
    assert_eq!(rules["approvals_needed"], 2);
    assert_eq!(rules["proposal_period_ms"], 604_800_000u64);
    let cfg = env.hub_view("get_config", json!({})).await;
    for k in ["version","owner","usdc","dao_code_hash","dao_float","min_dao_float","relayers","limits","paused","pot_count","sponsored_today","free_balance"] {
        assert!(cfg.get(k).is_some(), "get_config.{k}");
    }
    assert_eq!(cfg["version"], "1.3.0"); // hub 1.3.0 (security fixes)
    assert_eq!(cfg["dao_code_hash"], build.expected_hash());
    Ok(())
}
dual!(t20_instant_cap_budget, t20);

/// T-23 payee rules · T-24 payee unregistered · T-25 insufficient balance · T-30 bad receiver ·
/// T-31 not member · T-88 refused ids absent.
async fn t23(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (dao, _, _) = env.pot_with_members(&env.maya, "trip", &[&env.sam], 100 * USDC).await;
    // T-23: non-member receiver → vote payee_not_allowed (vote path to a non-member is allowed)
    let p = preview(&env, &dao, &env.maya, 10 * USDC, &env.eve.id).await;
    assert_eq!((p["path"].as_str(), p["reason"].as_str()), (Some("vote"), Some("payee_not_allowed")));
    let v = env.request_spend(&env.maya, &dao, 10 * USDC, &env.eve.id, &rref(1)).await.json();
    assert_eq!((v["path"].as_str(), v["reason"].as_str(), v["status"].as_str()), (Some("vote"), Some("payee_not_allowed"), Some("pending")));
    // team preset with eve allow-listed → instant
    let team_rules = json!({"instant_cap":"250000000","member_budget":"1000000000","instant_payees":"members_and_allowlist","payee_allowlist":[env.eve.id]});
    let (team, _, _) = env.pot_with_members_rules(&env.maya, "team", "team", team_rules, &[], 300 * USDC).await;
    let eve0 = env.ft_balance(&env.eve.id).await;
    let p = preview(&env, &team, &env.maya, 40 * USDC, &env.eve.id).await;
    assert_eq!(p["path"], "instant");
    let v = env.request_spend(&env.maya, &team, 40 * USDC, &env.eve.id, &rref(2)).await.json();
    assert_eq!((v["path"].as_str(), v["status"].as_str()), (Some("instant"), Some("approved")));
    assert_eq!(env.ft_balance(&env.eve.id).await - eve0, 40 * USDC);

    // T-24: allow-listed but unregistered payee → refused payee_not_registered; no proposal;
    // record deleted; reservation released
    let nobody = env.new_actor("nobody", 2 * NEAR).await?;
    let rules2 = json!({"instant_cap":"250000000","member_budget":"1000000000","instant_payees":"members_and_allowlist","payee_allowlist":[nobody.id]});
    let (t2, _, _) = env.pot_with_members_rules(&env.maya, "team2", "team", rules2, &[], 100 * USDC).await;
    let last0 = env.view(&t2, "get_last_proposal_id", json!({})).await;
    let o = env.request_spend(&env.maya, &t2, 10 * USDC, &nobody.id, &rref(3)).await;
    let v = o.json();
    assert_eq!((v["status"].as_str(), v["refusal"].as_str(), v["proposal_id"].clone()), (Some("refused"), Some("payee_not_registered"), Value::Null));
    assert_eq!(env.view(&t2, "get_last_proposal_id", json!({})).await, last0, "no proposal");
    assert!(env.hub_view("get_request", json!({"pot": t2, "request_id": v["request_id"]})).await.is_null(), "record deleted");
    let m = env.member(&t2, &env.maya.id).await;
    assert_eq!(m["instant_used"], "0");
    assert_eq!(env.pot(&t2).await["reserved"], "0");
    assert!(o.events().is_empty());

    // T-25: insufficient balance → refused (instant and vote)
    let (small, _, _) = env.pot_with_members(&env.sam, "small", &[], 50 * USDC).await;
    let p = preview(&env, &small, &env.sam, 60 * USDC, &env.sam.id).await;
    assert_eq!((p["path"].as_str(), p["reason"].as_str()), (Some("blocked"), Some("insufficient_balance")));
    let v = env.request_spend(&env.sam, &small, 60 * USDC, &env.sam.id, &rref(4)).await.json();
    assert_eq!((v["path"].as_str(), v["refusal"].as_str()), (Some("instant"), Some("insufficient_balance")));
    let v = env.request_spend(&env.sam, &small, 150 * USDC, &env.sam.id, &rref(5)).await.json();
    assert_eq!((v["path"].as_str(), v["refusal"].as_str()), (Some("vote"), Some("insufficient_balance")));
    let pot = env.pot(&small).await;
    assert_eq!((pot["reserved"].as_str(), pot["open_requests"].as_u64()), (Some("0"), Some(0)));
    // T-88: refused ids are absent (gaps), the counter still advanced
    assert_eq!(pot["request_count"], 2);
    assert_eq!(env.hub_view("get_requests", json!({"pot": small, "from_index": 0, "limit": 50})).await, json!([]));

    // T-30: bad receiver
    for to in [env.hub.clone(), dao.clone(), env.usdc.clone()] {
        env.request_spend(&env.maya, &dao, 1 * USDC, &to, &rref(6)).await.expect_err("ERR_BAD_RECEIVER");
        assert_eq!(preview(&env, &dao, &env.maya, 1 * USDC, &to).await["reason"], "bad_receiver");
    }
    // other synchronous checks
    env.request_spend(&env.maya, &dao, 0, &env.maya.id, &rref(6)).await.expect_err("ERR_BAD_AMOUNT");
    env.request_spend(&env.maya, &dao, 1_000_000_000_000_001, &env.maya.id, &rref(6)).await.expect_err("ERR_BAD_AMOUNT");
    env.request_spend(&env.maya, &dao, 1 * USDC, &env.maya.id, "BAD").await.expect_err("ERR_BAD_REQUEST_REF");
    // T-31: non-member
    env.request_spend(&env.eve, &dao, 1 * USDC, &env.eve.id, &rref(7)).await.expect_err("ERR_NOT_MEMBER");
    assert_eq!(preview(&env, &dao, &env.eve, 1 * USDC, &env.eve.id).await["reason"], "not_member");
    Ok(())
}
dual!(t23_payee_balance_receiver, t23);

/// T-31 (DAO side) · T-28a · T-28b · T-27 · T-96: the live DAO policy is respected.
async fn t28(build: Build) -> anyhow::Result<()> {
    // hub 1.3.0: Pots made by hub 1.3.0 (policy v3) let members only vote, so the raw DAO proposals
    // this test needs come from Pots made by the 1.2.0 hub (policy v1); the hub is upgraded right after
    let env = Env::legacy(build).await?;
    let (dao, _, _) = env.pot_with_members(&env.maya, "rm", &[&env.sam, &env.leo], 100 * USDC).await;
    let (d2, _, _) = env.pot_with_members(&env.maya, "norb", &[&env.sam], 100 * USDC).await;
    let (d3, _, _) = env.pot_with_members(&env.maya, "weak", &[&env.sam], 100 * USDC).await;
    env.upgrade_hub().await?;
    assert_eq!(env.pot(&dao).await["policy_version"], 1);
    // T-31: a member removed in the DAO by a group vote → refused not_in_dao_group
    let kind = json!({"RemoveMemberFromRole": {"member_id": env.leo.id, "role": "member"}});
    let id = env.relay(&env.maya, &dao, "add_proposal", json!({"proposal": {"description": "remove leo", "kind": kind}}), 50, 0).await.json().as_u64().unwrap();
    env.vote(&env.maya, &dao, id, "VoteApprove", 100).await.ok();
    env.vote(&env.sam, &dao, id, "VoteApprove", 100).await.ok();
    assert_eq!(env.proposal(&dao, id).await["status"], "Approved");
    let v = env.request_spend(&env.leo, &dao, 5 * USDC, &env.leo.id, &rref(1)).await.json();
    assert_eq!((v["status"].as_str(), v["refusal"].as_str()), (Some("refused"), Some("not_in_dao_group")));
    // …and instant payees under the `members` rule must be in the live Group too
    let v = env.request_spend(&env.maya, &dao, 5 * USDC, &env.leo.id, &rref(2)).await.json();
    assert_eq!((v["path"].as_str(), v["refusal"].as_str()), (Some("instant"), Some("not_in_dao_group")));

    // T-27 / T-96: a proposal Maya adds herself is never voted by the hub; sync/retry refuse it
    let kind = json!({"Transfer":{"token_id": env.usdc, "receiver_id": env.maya.id, "amount": "1000000", "msg": null}});
    let own = env.relay(&env.maya, &dao, "add_proposal", json!({"proposal": {"description": "mine", "kind": kind}}), 50, 0).await.json().as_u64().unwrap();
    assert_eq!(env.proposal(&dao, own).await["votes"], json!({}));
    assert!(env.hub_view("get_proposal_subject", json!({"pot": dao, "proposal_id": own})).await.is_null());
    env.sync(&dao, own).await.expect_err("ERR_UNKNOWN_PROPOSAL");
    env.hub_relay(&env.maya, "retry_payout", json!({"pot": dao, "proposal_id": own}), 100).await.expect_err("ERR_UNKNOWN_PROPOSAL");

    // T-28a: rulebot removed by the group → instant request refused add_failed (prepay reverted)
    let kind = json!({"ChangePolicyRemoveRole": {"role": "rulebot"}});
    let id = env.relay(&env.maya, &d2, "add_proposal", json!({"proposal": {"description": "drop rulebot", "kind": kind}}), 50, 0).await.json().as_u64().unwrap();
    env.vote(&env.maya, &d2, id, "VoteApprove", 100).await.ok();
    env.vote(&env.sam, &d2, id, "VoteApprove", 100).await.ok();
    assert_eq!(env.proposal(&d2, id).await["status"], "Approved");
    let dao_near0 = env.balance(&d2).await;
    let v = env.request_spend(&env.maya, &d2, 5 * USDC, &env.maya.id, &rref(3)).await.json();
    assert_eq!((v["status"].as_str(), v["refusal"].as_str()), (Some("refused"), Some("add_failed")));
    assert!(env.balance(&d2).await < dao_near0 + MILLI, "the prepay (≈ 0.0058 NEAR) was reverted with the batch (gas rewards only)");
    let m = env.member(&d2, &env.maya.id).await;
    assert_eq!(m["instant_used"], "0");
    assert_eq!(env.pot(&d2).await["reserved"], "0");

    // T-28b: rulebot vote not decisive (quorum 2) → pending, auto_approve_failed, payout_failed{approve}
    let role = json!({"name":"rulebot","kind":{"Group":[env.hub]},
        "permissions":["transfer:AddProposal","transfer:VoteApprove","transfer:Finalize","add_member_to_role:AddProposal","add_member_to_role:VoteApprove","call:AddProposal"],
        "vote_policy":{"transfer":{"weight_kind":"RoleWeight","quorum":"2","threshold":[1,1]},
                       "add_member_to_role":{"weight_kind":"RoleWeight","quorum":"1","threshold":[1,1]}}});
    let id = env
        .relay(&env.maya, &d3, "add_proposal", json!({"proposal": {"description": "weaken", "kind": {"ChangePolicyAddOrUpdateRole": {"role": role}}}}), 50, 0)
        .await
        .json()
        .as_u64()
        .unwrap();
    env.vote(&env.maya, &d3, id, "VoteApprove", 100).await.ok();
    env.vote(&env.sam, &d3, id, "VoteApprove", 100).await.ok();
    assert_eq!(env.proposal(&d3, id).await["status"], "Approved");
    let o = env.request_spend(&env.maya, &d3, 5 * USDC, &env.maya.id, &rref(4)).await;
    let v = o.json();
    assert_eq!((v["path"].as_str(), v["reason"].as_str(), v["status"].as_str()), (Some("vote"), Some("auto_approve_failed"), Some("pending")));
    assert_eq!(o.event_names(), vec!["spend_requested", "spend_payout_failed"]);
    let ev = o.event("spend_payout_failed");
    assert_eq!(ev["stage"], "approve");
    let mut keys: Vec<&str> = ev.as_object().unwrap().keys().map(|k| k.as_str()).collect();
    keys.sort();
    assert_eq!(keys, vec!["dao_status", "pot", "proposal_id", "request_id", "stage"], "T-84 spend_payout_failed fields");
    let m = env.member(&d3, &env.maya.id).await;
    assert_eq!(m["instant_used"], "0", "reservation released");
    let pot = env.pot(&d3).await;
    assert_eq!((pot["reserved"].as_str(), pot["open_requests"].as_u64()), (Some("0"), Some(1)));
    Ok(())
}
dual!(t28_live_policy, t28);

/// T-26 concurrency (same block): beyond the budget → the 2nd is a vote; beyond the balance →
/// at most one succeeds and nothing overdraws.
async fn t26(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (dao, _, _) = env.pot_with_members(&env.maya, "race", &[&env.sam], 300 * USDC).await;
    let v = env.request_spend(&env.maya, &dao, 84 * USDC, &env.maya.id, &rref(1)).await.json();
    assert_eq!(v["status"], "approved");
    let args = |n: u32, amt: u128, to: &near_workspaces::AccountId| {
        serde_json::to_vec(&json!({"pot": dao, "amount": amt.to_string(), "receiver_id": to, "category": "food", "request_ref": rref(n)})).unwrap()
    };
    let outs = env
        .rpc
        .call_many(vec![
            (env.maya.clone(), env.hub.clone(), "request_spend".into(), args(2, 100 * USDC, &env.maya.id), 150, 60 * MILLI),
            (env.maya.clone(), env.hub.clone(), "request_spend".into(), args(3, 100 * USDC, &env.maya.id), 150, 60 * MILLI),
        ])
        .await?;
    let paths: Vec<String> = outs.iter().map(|o| o.json()["path"].as_str().unwrap().to_string()).collect();
    assert!(paths.contains(&"instant".to_string()) && paths.contains(&"vote".to_string()), "{paths:?}");
    assert!(u(&env.member(&dao, &env.maya.id).await["instant_used"]) <= 200 * USDC);

    // balance race: the DAO holds 416; two members ask 250 + 250 instant… (Team rules)
    let rules = json!({"instant_cap":"250000000","member_budget":"1000000000","instant_payees":"members_and_allowlist","payee_allowlist":[]});
    let (team, _, _) = env.pot_with_members_rules(&env.leo, "race2", "team", rules, &[&env.ana], 150 * USDC).await;
    let targs = |n: u32, to: &near_workspaces::AccountId| {
        serde_json::to_vec(&json!({"pot": team, "amount": (200 * USDC).to_string(), "receiver_id": to, "category": "food", "request_ref": rref(n)})).unwrap()
    };
    let outs = env
        .rpc
        .call_many(vec![
            (env.leo.clone(), env.hub.clone(), "request_spend".into(), targs(10, &env.leo.id), 150, 60 * MILLI),
            (env.ana.clone(), env.hub.clone(), "request_spend".into(), targs(11, &env.ana.id), 150, 60 * MILLI),
        ])
        .await?;
    let approved = outs.iter().filter(|o| o.json()["status"] == "approved").count();
    assert!(approved <= 1, "at most one succeeds: {:?}", outs.iter().map(|o| o.json()).collect::<Vec<_>>());
    let bal = env.ft_balance(&team).await;
    assert_eq!(bal, 300 * USDC - approved as u128 * 200 * USDC, "nothing overdraws");
    let pot = env.pot(&team).await;
    assert_eq!(pot["reserved"], "0");
    Ok(())
}
dual!(t26_concurrency, t26);

/// T-94: a link-joiner with contributed == 0 → vote `new_member`; after $10 → instant.
async fn t94(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (dao, sk, pk) = env.pot_with_members(&env.maya, "newbie", &[&env.sam], 150 * USDC).await;
    assert_eq!(env.join(&env.leo, &dao, &sk, &pk).await.json()["status"], "active");
    let p = preview(&env, &dao, &env.leo, 50 * USDC, &env.leo.id).await;
    assert_eq!((p["path"].as_str(), p["reason"].as_str()), (Some("vote"), Some("new_member")));
    let o = env.request_spend(&env.leo, &dao, 50 * USDC, &env.leo.id, &rref(1)).await;
    let v = o.json();
    assert_eq!((v["path"].as_str(), v["reason"].as_str()), (Some("vote"), Some("new_member")));
    assert_eq!(env.proposal(&dao, v["proposal_id"].as_u64().unwrap()).await["votes"], json!({}));
    assert_eq!(env.contribute(&env.leo, &dao, 10 * USDC).await.json(), json!("10000000"));
    assert_eq!(preview(&env, &dao, &env.leo, 50 * USDC, &env.leo.id).await["path"], "instant");
    let v = env.request_spend(&env.leo, &dao, 50 * USDC, &env.leo.id, &rref(2)).await.json();
    assert_eq!((v["path"].as_str(), v["status"].as_str()), (Some("instant"), Some("approved")));
    Ok(())
}
dual!(t94_new_member, t94);
