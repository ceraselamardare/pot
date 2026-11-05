//! C-11: vote path + sync + retry_payout. T-29, T-40…T-46, T-97 (sandbox parts) — builds A and B.

use pot_tests::*;
use serde_json::json;

fn rref(n: u32) -> String {
    format!("vote{n:08}")
}

/// T-40 ★ majority (D-61) · T-45 sync idempotent · T-41 rejection · T-43 threshold moves.
async fn t40(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (dao, sk, pk) = env.pot_with_members(&env.maya, "boat", &[&env.sam, &env.leo], 150 * USDC).await;
    // the $84 instant first (D-61), then the $300 boat → vote
    assert_eq!(env.request_spend(&env.maya, &dao, 84 * USDC, &env.maya.id, &rref(0)).await.json()["status"], "approved");
    let v = env.request_spend(&env.maya, &dao, 300 * USDC, &env.maya.id, &rref(1)).await.json();
    assert_eq!((v["path"].as_str(), v["reason"].as_str(), v["status"].as_str(), v["approvals_needed"].as_u64()), (Some("vote"), Some("over_cap"), Some("pending"), Some(2)));
    let pid = v["proposal_id"].as_u64().unwrap();
    // H-10 client step: Maya approves her own request, then Leo approves (100 Tgas) → executes
    let maya0 = env.ft_balance(&env.maya.id).await;
    env.vote(&env.maya, &dao, pid, "VoteApprove", 100).await.ok();
    assert_eq!(env.proposal(&dao, pid).await["status"], "InProgress");
    let s = env.sync(&dao, pid).await;
    assert_eq!(s.json(), json!({"proposal_id": pid, "subject": "spend", "dao_status": "InProgress", "hub_status": "pending", "changed": false}));
    assert!(s.events().is_empty());
    let o = env.vote(&env.leo, &dao, pid, "VoteApprove", 100).await;
    o.ok();
    assert_eq!(env.proposal(&dao, pid).await["status"], "Approved");
    assert_eq!(env.ft_balance(&env.maya.id).await - maya0, 300 * USDC, "paid by the DAO without the hub");
    println!("[{build:?}] T-40 executing Transfer vote: {:.2} Tgas burnt", o.total_gas_burnt() as f64 / 1e12);
    let before = env.pot(&dao).await;
    // the relayer's sync after the vote
    let s = env.sync(&dao, pid).await;
    assert_eq!(s.json(), json!({"proposal_id": pid, "subject": "spend", "dao_status": "Approved", "hub_status": "approved", "changed": true}));
    assert_eq!(s.event("proposal_synced"), json!({"pot": dao, "proposal_id": pid, "subject": "spend", "request_id": 1, "member": null, "dao_status": "Approved", "hub_status": "approved"}));
    let pot = env.pot(&dao).await;
    assert_eq!((pot["spent_vote"].as_str(), pot["open_requests"].as_u64()), (Some("300000000"), Some(0)));
    assert_eq!(pot["balance_estimate"], "66000000");
    assert_eq!(u(&pot["seq"]), u(&before["seq"]) + 1, "sync bumps seq exactly once");
    let m = env.member(&dao, &env.maya.id).await;
    assert_eq!((m["spent"].as_str(), m["instant_used"].as_str()), (Some("384000000"), Some("84000000")), "budget unchanged by a vote spend");
    assert_eq!(env.hub_view("get_request", json!({"pot": dao, "request_id": 1})).await["status"], "approved");
    // T-45: idempotent; anyone may call it; unknown ids refused
    let s = env.call(&env.eve, &env.hub.clone(), "sync", json!({"pot": dao, "proposal_id": pid}), 50, 0).await;
    assert_eq!(s.json()["changed"], false);
    assert!(s.events().is_empty());
    env.sync(&dao, 999).await.expect_err("ERR_UNKNOWN_PROPOSAL");
    env.call(&env.eve, &env.hub.clone(), "sync", json!({"pot": format!("nope.{}", env.hub), "proposal_id": 0}), 50, 0).await.expect_err("ERR_POT_NOT_FOUND");
    // the "Gets back" view after the D-61 run: $22 each
    let ms = env.hub_view("get_members", json!({"pot": dao, "balance": (66 * USDC).to_string()})).await;
    for m in ms.as_array().unwrap() {
        assert_eq!(m["would_get_back"], "22000000");
        assert_eq!(m["balance_source"], "argument");
    }

    // T-41 rejection: 2 rejects → Rejected; sync → rejected
    let v = env.request_spend(&env.sam, &dao, 50 * USDC, &env.eve.id, &rref(2)).await.json();
    assert_eq!(v["reason"], "payee_not_allowed");
    let pid2 = v["proposal_id"].as_u64().unwrap();
    env.vote(&env.maya, &dao, pid2, "VoteReject", 100).await.ok();
    env.vote(&env.leo, &dao, pid2, "VoteReject", 100).await.ok();
    assert_eq!(env.proposal(&dao, pid2).await["status"], "Rejected");
    assert_eq!(env.sync(&dao, pid2).await.json()["hub_status"], "rejected");
    let m = env.member(&dao, &env.sam.id).await;
    assert_eq!(m["spent"], "0");
    assert_eq!(env.pot(&dao).await["open_requests"], 0);

    // T-43 threshold moves: pending at 1 of 2; a 4th member joins → needs 3
    let v = env.request_spend(&env.leo, &dao, 30 * USDC, &env.eve.id, &rref(3)).await.json();
    let pid3 = v["proposal_id"].as_u64().unwrap();
    env.vote(&env.leo, &dao, pid3, "VoteApprove", 100).await.ok();
    assert_eq!(env.join(&env.ana, &dao, &sk, &pk).await.json()["status"], "active");
    assert_eq!(env.pot(&dao).await["approvals_needed"], 3);
    env.vote(&env.sam, &dao, pid3, "VoteApprove", 100).await.ok();
    assert_eq!(env.proposal(&dao, pid3).await["status"], "InProgress", "2 of 4 is not a majority");
    env.vote(&env.ana, &dao, pid3, "VoteApprove", 100).await.ok();
    assert_eq!(env.proposal(&dao, pid3).await["status"], "Approved");
    assert_eq!(env.sync(&dao, pid3).await.json()["hub_status"], "approved");
    Ok(())
}
dual!(t40_vote_majority, t40);

/// T-29 payout failure + sync + retry · T-46 retry rules.
async fn t29(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (dao, _, _) = env.pot_with_members(&env.maya, "retry", &[&env.sam, &env.leo], 100 * USDC).await;
    // vote-path request to a registered non-member receiver (ana)
    let v = env.request_spend(&env.maya, &dao, 40 * USDC, &env.ana.id, &rref(1)).await.json();
    let pid = v["proposal_id"].as_u64().unwrap();
    // T-46: not failed → NOT_RETRYABLE
    env.hub_relay(&env.maya, "retry_payout", json!({"pot": dao, "proposal_id": pid}), 100).await.expect_err("ERR_NOT_RETRYABLE");
    // T-46: a join id is not a spend → UNKNOWN_PROPOSAL
    env.hub_relay(&env.maya, "retry_payout", json!({"pot": dao, "proposal_id": 0}), 100).await.expect_err("ERR_UNKNOWN_PROPOSAL");
    // ana unregisters (balance → 0 first)
    let bal = env.ft_balance(&env.ana.id).await;
    env.call(&env.ana, &env.usdc.clone(), "ft_transfer", json!({"receiver_id": env.treasury.id, "amount": bal.to_string()}), 30, 1).await.ok();
    env.call(&env.ana, &env.usdc.clone(), "storage_unregister", json!({}), 30, 1).await.ok();
    // the group approves → the DAO's payout fails → Failed
    env.vote(&env.maya, &dao, pid, "VoteApprove", 100).await.ok();
    env.vote(&env.sam, &dao, pid, "VoteApprove", 100).await.ok();
    assert_eq!(env.proposal(&dao, pid).await["status"], "Failed");
    assert_eq!(env.ft_balance(&dao).await, 300 * USDC, "the money stays in the DAO");
    let s = env.sync(&dao, pid).await;
    assert_eq!(s.json()["hub_status"], "payout_failed");
    assert_eq!(s.event_names(), vec!["spend_payout_failed", "proposal_synced"]);
    assert_eq!(s.event("spend_payout_failed")["stage"], "payout");
    let pot = env.pot(&dao).await;
    assert_eq!((pot["unpaid_approved"].as_u64(), pot["spent_vote"].as_str()), (Some(1), Some("0")));
    let subj = env.hub_view("get_proposal_subject", json!({"pot": dao, "proposal_id": pid})).await;
    assert_eq!(subj["live"], true, "payout_failed stays live (Finalize allowed)");
    // A retry BEFORE the fix: Finalize re-executes, and the chained get_proposal reads "Approved"
    // before the DAO's detached payout callback marks it Failed again (OBJ-1: the re-read can't see
    // payouts). So the hub briefly says `approved`; the relayer's post-tx `sync` restores the truth.
    let r = env.hub_relay(&env.eve, "retry_payout", json!({"pot": dao, "proposal_id": pid}), 100).await;
    assert_eq!(r.json()["hub_status"], "approved");
    assert_eq!(env.proposal(&dao, pid).await["status"], "Failed", "the payout failed again");
    let s = env.sync(&dao, pid).await;
    assert_eq!((s.json()["hub_status"].as_str(), s.json()["changed"].as_bool()), (Some("payout_failed"), Some(true)));
    assert_eq!(env.pot(&dao).await["spent_vote"], "0");
    // register, then retry (anyone) → approved, ledger exact
    env.register(&env.ana.id).await?;
    let r = env.hub_relay(&env.eve, "retry_payout", json!({"pot": dao, "proposal_id": pid}), 100).await;
    assert_eq!(r.json(), json!({"proposal_id": pid, "retried": true, "dao_status": "Approved", "hub_status": "approved"}));
    assert_eq!(r.event("proposal_synced")["hub_status"], "approved");
    println!("[{build:?}] T-29 retry_payout chain: {:.2} Tgas burnt", r.total_gas_burnt() as f64 / 1e12);
    assert_eq!(env.ft_balance(&env.ana.id).await, 40 * USDC);
    let pot = env.pot(&dao).await;
    assert_eq!((pot["unpaid_approved"].as_u64(), pot["spent_vote"].as_str(), pot["open_requests"].as_u64()), (Some(0), Some("40000000"), Some(0)));
    assert_eq!(env.member(&dao, &env.maya.id).await["spent"], "40000000");
    assert_eq!(env.sync(&dao, pid).await.json()["changed"], false, "DAO Approved == hub approved");
    env.hub_relay(&env.maya, "retry_payout", json!({"pot": dao, "proposal_id": pid}), 100).await.expect_err("ERR_NOT_RETRYABLE");
    Ok(())
}
dual!(t29_payout_failure_retry, t29);

/// T-42 expiry (the group shortens the DAO's period, so a later vote expires it) · T-44 pending
/// cap · T-97 (sandbox part: expiry follows the DAO's status).
async fn t42(build: Build) -> anyhow::Result<()> {
    // hub 1.3.0: Pots made by hub 1.3.0 (policy v3) let members only vote, so the raw DAO proposals
    // this test needs come from Pots made by the 1.2.0 hub (policy v1); the hub is upgraded right after
    let env = Env::legacy(build).await?;
    let (dao, _, _) = env.pot_with_members(&env.maya, "exp", &[&env.sam, &env.leo], 150 * USDC).await;
    env.upgrade_hub().await?;
    let v = env.request_spend(&env.maya, &dao, 120 * USDC, &env.maya.id, &rref(1)).await.json();
    let pid = v["proposal_id"].as_u64().unwrap();
    // T-44: 10 open vote requests max per requester
    for i in 2..=10 {
        let v = env.request_spend(&env.maya, &dao, 101 * USDC, &env.maya.id, &rref(i)).await.json();
        assert_eq!(v["status"], "pending");
    }
    assert_eq!(env.member(&dao, &env.maya.id).await.get("pending_votes"), None, "pending_votes is internal");
    env.request_spend(&env.maya, &dao, 101 * USDC, &env.maya.id, &rref(11)).await.expect_err("ERR_TOO_MANY_PENDING");
    let p = env.hub_view("preview_spend", json!({"pot": dao, "account_id": env.maya.id, "amount": (101 * USDC).to_string(), "receiver_id": env.maya.id, "balance": null})).await;
    assert_eq!((p["path"].as_str(), p["reason"].as_str()), (Some("blocked"), Some("too_many_pending")));
    // instant still works
    assert_eq!(env.request_spend(&env.maya, &dao, 10 * USDC, &env.maya.id, &rref(12)).await.json()["status"], "approved");

    // T-42: the 7-day period can't be fast-forwarded in the sandbox (≈ 0.3 s per block), so the
    // group shortens the DAO's proposal_period to 1 s; a later vote then marks it Expired.
    let kind = json!({"ChangePolicyUpdateParameters": {"parameters": {"proposal_period": "1000000000"}}});
    let id = env.relay(&env.maya, &dao, "add_proposal", json!({"proposal": {"description": "shorten", "kind": kind}}), 50, 0).await.json().as_u64().unwrap();
    env.vote(&env.maya, &dao, id, "VoteApprove", 100).await.ok();
    env.vote(&env.sam, &dao, id, "VoteApprove", 100).await.ok();
    env.fast_forward(10).await;
    let o = env.vote(&env.sam, &dao, pid, "VoteApprove", 100).await;
    o.ok();
    assert_eq!(env.proposal(&dao, pid).await["status"], "Expired", "a vote after the period expires it");
    let s = env.sync(&dao, pid).await;
    assert_eq!(s.json(), json!({"proposal_id": pid, "subject": "spend", "dao_status": "Expired", "hub_status": "expired", "changed": true}));
    let pot = env.pot(&dao).await;
    assert_eq!(pot["open_requests"], 9);
    assert_eq!(pot["spent_vote"], "0");
    // a slot freed: Maya can open a new vote request again
    // (the DAO's period is now 1 s, so it's Expired on the next action; the hub only tracks it)
    let v = env.request_spend(&env.maya, &dao, 101 * USDC, &env.maya.id, &rref(13)).await.json();
    assert_eq!(v["status"], "pending");
    Ok(())
}
dual!(t42_expiry_pending_cap, t42);
