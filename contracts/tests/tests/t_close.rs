//! C-16: close + pro-rata. T-70…T-72, T-74, T-75, T-92, T-88 (close views), T-14, T-55 (closing),
//! T-46 (close id) — builds A and B.

use base64::Engine;
use pot_tests::*;
use serde_json::{json, Value};

fn rref(n: u32) -> String {
    format!("close{n:08}")
}

/// The D-61 demo run on Pot `slug`: contributions `c` (Maya, Sam, Leo), the $84 instant and the
/// $300 vote (Maya + Leo approve), synced. Leaves $66 (for c summing to 450).
async fn demo_run(env: &Env, slug: &str, c: [u128; 3]) -> (near_workspaces::AccountId, ed25519_dalek::SigningKey, String) {
    let (dao, sk, pk) = env.pot_with_members(&env.maya, slug, &[&env.sam, &env.leo], 0).await;
    for (who, amt) in [(&env.maya, c[0]), (&env.sam, c[1]), (&env.leo, c[2])] {
        assert_eq!(env.contribute(who, &dao, amt).await.json(), json!(amt.to_string()));
    }
    assert_eq!(env.request_spend(&env.maya, &dao, 84 * USDC, &env.maya.id, &rref(0)).await.json()["status"], "approved");
    let pid = env.request_spend(&env.maya, &dao, 300 * USDC, &env.maya.id, &rref(1)).await.json()["proposal_id"].as_u64().unwrap();
    env.vote(&env.maya, &dao, pid, "VoteApprove", 100).await.ok();
    env.vote(&env.leo, &dao, pid, "VoteApprove", 100).await.ok();
    env.sync(&dao, pid).await.ok();
    env.wait_busy_window().await;
    (dao, sk, pk)
}

fn payouts(v: &Value) -> Vec<(String, String)> {
    v.as_array().unwrap().iter().map(|p| (p["account_id"].as_str().unwrap().to_string(), p["amount"].as_str().unwrap().to_string())).collect()
}

/// T-70 ★ close (V1 demo + V2 unequal) · T-14 · T-55 closing · T-88 preview parity.
async fn t70(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    for (slug, c, want) in [
        ("demo-run", [150 * USDC, 150 * USDC, 150 * USDC], ["22000000", "22000000", "22000000"]),
        ("unequal", [200 * USDC, 150 * USDC, 100 * USDC], ["29333333", "22000000", "14666667"]),
    ] {
        let (dao, sk, pk) = demo_run(&env, slug, c).await;
        assert_eq!(env.ft_balance(&dao).await, 66 * USDC);
        // T-88: preview_close before (argument and ledger agree here)
        let pv = env.hub_view("preview_close", json!({"pot": dao, "balance": (66 * USDC).to_string()})).await;
        assert_eq!((pv["can_propose"].as_bool(), pv["balance_source"].as_str()), (Some(true), Some("argument")));
        let want_payouts = vec![
            (env.maya.id.to_string(), want[0].to_string()),
            (env.sam.id.to_string(), want[1].to_string()),
            (env.leo.id.to_string(), want[2].to_string()),
        ];
        assert_eq!(payouts(&pv["payouts"]), want_payouts);
        assert_eq!(pv["dust_to"], env.leo.id.as_str());
        let pv_ledger = env.hub_view("preview_close", json!({"pot": dao, "balance": null})).await;
        assert_eq!(payouts(&pv_ledger["payouts"]), want_payouts);

        let o = env.hub_relay(&env.sam, "propose_close", json!({"pot": dao}), 150).await;
        let v = o.json();
        println!("[{build:?}] T-70 propose_close (n=3): {:.2} Tgas burnt\n{}", o.total_gas_burnt() as f64 / 1e12, o.dump());
        let pid = v["proposal_id"].as_u64().unwrap();
        assert_eq!((v["ok"].as_bool(), v["balance"].as_str(), v["approvals_needed"].as_u64()), (Some(true), Some("66000000"), Some(2)));
        assert_eq!(payouts(&v["payouts"]), want_payouts);
        assert_eq!(v["dust_to"], env.leo.id.as_str());
        let ev = o.event("close_proposed");
        assert_eq!((ev["proposal_id"].as_u64(), ev["by"].as_str()), (Some(pid), Some(env.sam.id.as_str())));
        // the exact FunctionCall: 3 actions, args, deposit "1", gas 5 T
        let b64 = |r: &str, a: &str| base64::engine::general_purpose::STANDARD.encode(format!(r#"{{"receiver_id":"{r}","amount":"{a}","memo":"pot refund"}}"#));
        let actions: Vec<Value> = want_payouts
            .iter()
            .map(|(r, a)| json!({"method_name": "ft_transfer", "args": b64(r, a), "deposit": "1", "gas": "5000000000000"}))
            .collect();
        let prop = env.proposal(&dao, pid).await;
        assert_eq!(prop["kind"], json!({"FunctionCall": {"receiver_id": env.usdc, "actions": actions}}));
        assert_eq!(prop["description"], "Pot close-out: refund 66000000 to 3 members");
        let pot = env.pot(&dao).await;
        assert_eq!((pot["status"].as_str(), pot["close_proposal_id"].as_u64()), (Some("closing"), Some(pid)));
        // T-14: contributions refunded while Closing; spends, joins, invites, rules refused
        assert_eq!(env.contribute(&env.maya, &dao, 5 * USDC).await.json(), json!("0"));
        env.request_spend(&env.maya, &dao, 1 * USDC, &env.maya.id, &rref(9)).await.expect_err("ERR_POT_NOT_OPEN");
        env.join(&env.ana, &dao, &sk, &pk).await.expect_err("ERR_POT_NOT_OPEN");
        let (_, pkx) = Env::invite_key();
        env.hub_relay(&env.maya, "add_invite", json!({"pot": dao, "invite_pk": pkx, "expires_at_ms": null, "max_uses": null}), 30).await.expect_err("ERR_POT_NOT_OPEN");
        env.hub_relay(&env.maya, "propose_rules", json!({"pot": dao, "rules": {"instant_cap":"1","member_budget":"1","instant_payees":"members","payee_allowlist":[]}}), 100)
            .await
            .expect_err("ERR_POT_NOT_OPEN");
        env.hub_relay(&env.maya, "propose_close", json!({"pot": dao}), 150).await.expect_err("ERR_CLOSE_IN_PROGRESS");
        // members' views now show the close record
        let m = env.member(&dao, &env.leo.id).await;
        assert_eq!((m["would_get_back"].as_str(), m["balance_source"].as_str()), (Some(want[2]), Some("close_record")));
        // 2 approvals at 300 Tgas → transfers execute atomically
        let before: Vec<u128> = futures_balances(&env).await;
        env.vote(&env.maya, &dao, pid, "VoteApprove", 300).await.ok();
        let o = env.vote(&env.leo, &dao, pid, "VoteApprove", 300).await;
        o.ok();
        println!("[{build:?}] T-70 executing close vote (n=3): {:.2} Tgas burnt", o.total_gas_burnt() as f64 / 1e12);
        assert_eq!(env.proposal(&dao, pid).await["status"], "Approved");
        let after: Vec<u128> = futures_balances(&env).await;
        let got: Vec<String> = after.iter().zip(&before).map(|(a, b)| (a - b).to_string()).collect();
        assert_eq!(got, want.iter().map(|s| s.to_string()).collect::<Vec<_>>());
        assert_eq!(env.ft_balance(&dao).await, 0, "Σ payouts == balance");
        // sync → Closed + pot_closed
        let s = env.sync(&dao, pid).await;
        assert_eq!(s.json()["hub_status"], "closed");
        let ev = s.event("pot_closed");
        assert_eq!((ev["balance"].as_str(), payouts(&ev["payouts"])), (Some("66000000"), want_payouts.clone()));
        let pot = env.pot(&dao).await;
        assert_eq!(pot["status"], "closed");
        assert!(pot["closed_at_ms"].is_u64());
        assert_eq!(pot["balance_estimate"], "0", "a Closed Pot's estimate is 0 (everything was paid out)");
        // T-14 closed: refunded; everything else refused
        assert_eq!(env.contribute(&env.sam, &dao, 5 * USDC).await.json(), json!("0"));
        env.hub_relay(&env.maya, "propose_close", json!({"pot": dao}), 150).await.expect_err("ERR_POT_NOT_OPEN");
        // T-88: preview_close == the executed close; get_pots_of after close
        let pv = env.hub_view("preview_close", json!({"pot": dao, "balance": null})).await;
        assert_eq!((pv["balance_source"].as_str(), pv["can_propose"].as_bool(), pv["blocked_reason"].as_str()), (Some("close_record"), Some(false), Some("pot_not_open")));
        assert_eq!(payouts(&pv["payouts"]), want_payouts);
        let mine = env.hub_view("get_pots_of", json!({"account_id": env.leo.id})).await;
        assert!(mine.as_array().unwrap().iter().any(|p| p["pot"] == dao.as_str() && p["status"] == "closed"));
        let subj = env.hub_view("get_proposal_subject", json!({"pot": dao, "proposal_id": pid})).await;
        assert_eq!((subj["kind"].as_str(), subj["live"].as_bool()), (Some("close"), Some(false)));
    }
    Ok(())
}
dual!(t70_close, t70);

async fn futures_balances(env: &Env) -> Vec<u128> {
    vec![env.ft_balance(&env.maya.id).await, env.ft_balance(&env.sam.id).await, env.ft_balance(&env.leo.id).await]
}

/// T-71 rejected close · T-46 close id → USE_DAO_FINALIZE · T-92 cooldown + one open close.
async fn t71(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (dao, _, _) = env.pot_with_members(&env.maya, "rej", &[&env.sam, &env.leo], 100 * USDC).await;
    env.wait_busy_window().await;
    let pid = env.hub_relay(&env.maya, "propose_close", json!({"pot": dao}), 150).await.json()["proposal_id"].as_u64().unwrap();
    // T-92: a 2nd propose_close while one is Pending
    env.hub_relay(&env.sam, "propose_close", json!({"pot": dao}), 150).await.expect_err("ERR_CLOSE_IN_PROGRESS");
    let pv = env.hub_view("preview_close", json!({"pot": dao, "balance": null})).await;
    assert_eq!(pv["blocked_reason"], "close_in_progress");
    env.vote(&env.sam, &dao, pid, "VoteReject", 300).await.ok();
    env.vote(&env.leo, &dao, pid, "VoteReject", 300).await.ok();
    assert_eq!(env.sync(&dao, pid).await.json()["hub_status"], "open");
    // T-71: Open again; contributions accepted
    assert_eq!(env.pot(&dao).await["status"], "open");
    assert_eq!(env.contribute(&env.sam, &dao, 10 * USDC).await.json(), json!("10000000"));
    // T-46: a close id → USE_DAO_FINALIZE
    env.hub_relay(&env.maya, "retry_payout", json!({"pot": dao, "proposal_id": pid}), 100).await.expect_err("ERR_USE_DAO_FINALIZE");
    // T-92: the same member within 24 h → COOLDOWN; another member → allowed
    env.wait_busy_window().await;
    env.hub_relay(&env.maya, "propose_close", json!({"pot": dao}), 150).await.expect_err("ERR_CLOSE_COOLDOWN");
    let v = env.hub_relay(&env.sam, "propose_close", json!({"pot": dao}), 150).await.json();
    assert_eq!(v["ok"], true);
    // (the 24 h expiry of the cooldown is a unit test: unit_time::close_cooldown_ends_after_24h)
    Ok(())
}
dual!(t71_rejected_close, t71);

/// T-72 failed close (a vote spend executes after propose_close) · T-92 replaced close not live ·
/// T-74 busy / payouts pending · T-75 nothing to refund.
async fn t72(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (dao, _, _) = env.pot_with_members(&env.maya, "fail", &[&env.sam, &env.leo], 100 * USDC).await;
    // T-74: a contribution just landed → BUSY
    env.hub_relay(&env.maya, "propose_close", json!({"pot": dao}), 150).await.expect_err("ERR_POT_BUSY");
    assert_eq!(env.hub_view("preview_close", json!({"pot": dao, "balance": null})).await["blocked_reason"], "busy");
    // a pending vote spend of $120, then the close reads $300
    let spend = env.request_spend(&env.maya, &dao, 120 * USDC, &env.maya.id, &rref(1)).await.json()["proposal_id"].as_u64().unwrap();
    env.wait_busy_window().await;
    let v = env.hub_relay(&env.maya, "propose_close", json!({"pot": dao}), 150).await.json();
    let close1 = v["proposal_id"].as_u64().unwrap();
    assert_eq!(v["balance"], "300000000");
    // the spend executes after the balance read
    env.vote(&env.sam, &dao, spend, "VoteApprove", 100).await.ok();
    env.vote(&env.leo, &dao, spend, "VoteApprove", 100).await.ok();
    assert_eq!(env.ft_balance(&dao).await, 180 * USDC);
    // the close executes → ft_transfers exceed the balance → atomic failure → Failed
    env.vote(&env.sam, &dao, close1, "VoteApprove", 300).await.ok();
    env.vote(&env.leo, &dao, close1, "VoteApprove", 300).await.ok();
    assert_eq!(env.proposal(&dao, close1).await["status"], "Failed");
    assert_eq!(env.ft_balance(&dao).await, 180 * USDC, "nothing moved");
    let s = env.sync(&dao, close1).await;
    assert_eq!((s.json()["dao_status"].as_str(), s.json()["hub_status"].as_str()), (Some("Failed"), Some("closing")));
    assert_eq!(env.sync(&dao, spend).await.json()["hub_status"], "approved");
    let subj = env.hub_view("get_proposal_subject", json!({"pot": dao, "proposal_id": close1})).await;
    assert_eq!(subj["live"], true, "a Failed close stays live until replaced");
    // propose_close again (Closing + Failed allowed) → new balance → executes
    let v = env.hub_relay(&env.leo, "propose_close", json!({"pot": dao}), 150).await.json();
    let close2 = v["proposal_id"].as_u64().unwrap();
    assert_eq!(v["balance"], "180000000");
    let subj = env.hub_view("get_proposal_subject", json!({"pot": dao, "proposal_id": close1})).await;
    assert_eq!(subj["live"], false, "the replaced close is no longer live");
    assert_eq!(env.sync(&dao, close1).await.json()["hub_status"], "replaced");
    let pv = env.hub_view("preview_close", json!({"pot": dao, "balance": null})).await;
    env.vote(&env.maya, &dao, close2, "VoteApprove", 300).await.ok();
    env.vote(&env.sam, &dao, close2, "VoteApprove", 300).await.ok();
    assert_eq!(env.proposal(&dao, close2).await["status"], "Approved");
    assert_eq!(env.ft_balance(&dao).await, 0);
    assert_eq!(env.sync(&dao, close2).await.json()["hub_status"], "closed");
    // T-88: the preview equals what executed: 60 each
    assert_eq!(payouts(&pv["payouts"]).iter().map(|p| p.1.clone()).collect::<Vec<_>>(), vec!["60000000"; 3]);

    // T-74: a payout_failed request blocks close → PAYOUTS_PENDING
    let (d2, _, _) = env.pot_with_members(&env.maya, "unpaid", &[], 100 * USDC).await;
    let pid = env.request_spend(&env.maya, &d2, 150 * USDC, &env.ana.id, &rref(2)).await; // > balance → refused
    assert_eq!(pid.json()["refusal"], "insufficient_balance");
    let pid = env.request_spend(&env.maya, &d2, 50 * USDC, &env.ana.id, &rref(3)).await.json()["proposal_id"].as_u64().unwrap();
    let bal = env.ft_balance(&env.ana.id).await;
    env.call(&env.ana, &env.usdc.clone(), "ft_transfer", json!({"receiver_id": env.treasury.id, "amount": bal.to_string()}), 30, 1).await.ok();
    env.call(&env.ana, &env.usdc.clone(), "storage_unregister", json!({}), 30, 1).await.ok();
    env.vote(&env.maya, &d2, pid, "VoteApprove", 100).await.ok();
    assert_eq!(env.sync(&d2, pid).await.json()["hub_status"], "payout_failed");
    env.wait_busy_window().await;
    env.hub_relay(&env.maya, "propose_close", json!({"pot": d2}), 150).await.expect_err("ERR_PAYOUTS_PENDING");
    assert_eq!(env.hub_view("preview_close", json!({"pot": d2, "balance": null})).await["blocked_reason"], "payouts_pending");

    // T-75: everything spent → nothing_to_refund; stays Open
    let (d3, _, _) = env.pot_with_members(&env.sam, "empty", &[], 40 * USDC).await;
    env.request_spend(&env.sam, &d3, 40 * USDC, &env.sam.id, &rref(4)).await.ok();
    env.wait_busy_window().await;
    assert_eq!(env.ft_balance(&d3).await, 0);
    let v = env.hub_relay(&env.sam, "propose_close", json!({"pot": d3}), 150).await.json();
    assert_eq!(v, json!({"ok": false, "reason": "nothing_to_refund"}));
    let pot = env.pot(&d3).await;
    assert_eq!((pot["status"].as_str(), pot["closing_in_flight"].as_bool()), (Some("open"), Some(false)));
    // and no contributions at all → NO_CONTRIBUTIONS
    let (d4, _) = env.create_pot(&env.leo, "nothing").await;
    env.hub_relay(&env.leo, "propose_close", json!({"pot": d4}), 150).await.expect_err("ERR_NO_CONTRIBUTIONS");
    Ok(())
}
dual!(t72_failed_close, t72);

/// T-92: a payee unregisters → the atomic close Failed → the Pot stays Closing → re-register →
/// Finalize (a member, 300 Tgas) → Approved → sync → Closed.
async fn t92(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (dao, _, _) = env.pot_with_members(&env.maya, "unreg", &[&env.ana], 100 * USDC).await;
    env.wait_busy_window().await;
    let pid = env.hub_relay(&env.maya, "propose_close", json!({"pot": dao}), 150).await.json()["proposal_id"].as_u64().unwrap();
    let bal = env.ft_balance(&env.ana.id).await;
    env.call(&env.ana, &env.usdc.clone(), "ft_transfer", json!({"receiver_id": env.treasury.id, "amount": bal.to_string()}), 30, 1).await.ok();
    env.call(&env.ana, &env.usdc.clone(), "storage_unregister", json!({}), 30, 1).await.ok();
    env.vote(&env.maya, &dao, pid, "VoteApprove", 300).await.ok();
    env.vote(&env.ana, &dao, pid, "VoteApprove", 300).await.ok();
    assert_eq!(env.proposal(&dao, pid).await["status"], "Failed");
    assert_eq!(env.sync(&dao, pid).await.json()["hub_status"], "closing");
    assert_eq!(env.ft_balance(&dao).await, 200 * USDC);
    env.register(&env.ana.id).await?;
    let o = env.vote(&env.maya, &dao, pid, "Finalize", 300).await;
    o.ok();
    assert_eq!(env.proposal(&dao, pid).await["status"], "Approved");
    assert_eq!(env.ft_balance(&env.ana.id).await, 100 * USDC);
    assert_eq!(env.sync(&dao, pid).await.json()["hub_status"], "closed");
    Ok(())
}
dual!(t92_close_finalize, t92);
