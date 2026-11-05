//! Hub 1.3.0 security fixes (notes/security-audit-2026-11-04.md; design in notes/contracts.md,
//! "Hub 1.3.0 security fixes"). Sandbox tests named after the audit IDs; builds A and B.
//! - HUB-1 / GOV-2 / GOV-3 / GOV-4 / W4-7 / GOV-9: policy v3, members only vote. A creator alone (or
//!   sybils) can't file a raw Transfer / AddMemberToRole / ChangePolicy / FunctionCall, and every
//!   normal flow (join, instant, one OK, group vote, rules change, links, gifts, close) still works.
//! - W4-1 / HUB-2: the one-OK tier against sybils (stake, who may OK, the shared budget).
//! - W4-5 / W4-8: links awaiting funds don't block a close; no dust links.
//! - HUB-4 / HUB-6: t_close T-92 (a failed close payout, hub retry, confirmed by the balance) and
//!   t_wave4 W4 (the goal refund is "refunded" only once the money left); unit tests in
//!   pot-hub/src/unit_security.rs. The 1.2.0 → 1.3.0 upgrade: t_migrate m2.

use base64::Engine;
use near_workspaces::AccountId;
use pot_tests::*;
use serde_json::{json, Value};

fn rref(n: u32) -> String {
    format!("secu{n:08}")
}

async fn ok_request(env: &Env, who: &Actor, dao: &AccountId, id: u64) -> Outcome {
    env.hub_relay(who, "ok_request", json!({"pot": dao, "request_id": id}), 200).await
}

async fn claim(env: &Env, who: &Actor, dao: &AccountId, rid: u64, receiver: &AccountId, sig: &str) -> Outcome {
    env.relay(who, &env.hub.clone(), "claim_link", json!({"pot": dao, "request_id": rid, "receiver_id": receiver, "signature": sig}), 100, 0).await
}

async fn raw_proposal(env: &Env, who: &Actor, dao: &AccountId, description: &str, kind: Value) -> Outcome {
    env.relay(who, dao, "add_proposal", json!({"proposal": {"description": description, "kind": kind}}), 50, 0).await
}

fn sorted(v: &Value) -> Vec<String> {
    let mut out: Vec<String> = v.as_array().unwrap().iter().map(|x| x.as_str().unwrap().to_string()).collect();
    out.sort();
    out
}

async fn member_perms(env: &Env, dao: &AccountId) -> Vec<String> {
    let pol = env.policy(dao).await;
    sorted(&pol["roles"].as_array().unwrap().iter().find(|r| r["name"] == "member").unwrap()["permissions"])
}

/// HUB-1 / GOV-2 / GOV-3 / GOV-4 / W4-7 / GOV-9: in a hub 1.3.0 Pot nobody but the hub can create
/// a proposal (the creator alone before anyone joins, a member later, an outsider), and the normal
/// flows all still work through the hub.
async fn hub_1(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    // ---- HUB-1: the creator alone, with money in, before anyone joins
    let (rigged, o) = env.create_pot(&env.maya, "rigged").await;
    assert_eq!(o.json()["ok"], true);
    assert_eq!(env.contribute(&env.maya, &rigged, 50 * USDC).await.json(), json!("50000000"));
    assert_eq!(member_perms(&env, &rigged).await, vec!["*:VoteApprove", "*:VoteReject"]);
    assert_eq!(env.pot(&rigged).await["policy_version"], 3);
    let alt_role = json!({"name": "member", "kind": {"Group": [env.maya.id, env.eve.id]},
        "permissions": ["*:AddProposal", "*:VoteApprove", "*:VoteReject", "*:Finalize"], "vote_policy": {}});
    let call_args = base64::engine::general_purpose::STANDARD.encode(json!({"receiver_id": env.maya.id, "amount": "50000000"}).to_string());
    let attempts = [
        ("drain", json!({"Transfer": {"token_id": env.usdc, "receiver_id": env.maya.id, "amount": "50000000", "msg": null}})),
        ("add my alt", json!({"AddMemberToRole": {"member_id": env.eve.id, "role": "member"}})),
        ("rig the policy", json!({"ChangePolicyAddOrUpdateRole": {"role": alt_role}})),
        ("lower the bar", json!({"ChangePolicyUpdateDefaultVotePolicy": {"vote_policy": {"weight_kind": "RoleWeight", "quorum": "0", "threshold": [1, 10]}}})),
        ("shorten", json!({"ChangePolicyUpdateParameters": {"parameters": {"proposal_period": "1000000000"}}})),
        ("any call", json!({"FunctionCall": {"receiver_id": env.usdc, "actions": [{"method_name": "ft_transfer", "args": call_args, "deposit": "1", "gas": "10000000000000"}]}})),
    ];
    for (d, kind) in &attempts {
        raw_proposal(&env, &env.maya, &rigged, d, kind.clone()).await.expect_err("ERR_PERMISSION_DENIED");
        raw_proposal(&env, &env.eve, &rigged, d, kind.clone()).await.expect_err("ERR_PERMISSION_DENIED");
    }
    assert_eq!(env.view(&rigged, "get_last_proposal_id", json!({})).await, json!(0), "GOV-4: no proposal was stored");
    assert_eq!(env.ft_balance(&rigged).await, 50 * USDC);

    // ---- the normal flows in a 3-member v3 Pot, all through the hub
    let (dao, sk, pk) = env.pot_with_members(&env.maya, "group", &[&env.sam, &env.leo], 200 * USDC).await;
    // GOV-2 (raw path): a member can't file a Transfer to themselves for the group to rubber-stamp
    raw_proposal(&env, &env.sam, &dao, "drain", attempts[0].1.clone()).await.expect_err("ERR_PERMISSION_DENIED");
    // instant
    assert_eq!(env.request_spend(&env.maya, &dao, 50 * USDC, &env.maya.id, &rref(1)).await.json()["status"], "approved");
    // one OK
    let v = env.request_spend(&env.maya, &dao, 150 * USDC, &env.maya.id, &rref(2)).await.json();
    assert_eq!((v["status"].as_str(), v["tier"].as_str()), (Some("pending"), Some("one_ok")));
    let o = ok_request(&env, &env.sam, &dao, v["request_id"].as_u64().unwrap()).await;
    assert_eq!(o.json()["status"], "approved", "{}", o.dump());
    // the group (over the one-OK ceiling): majority vote in the DAO, synced
    let v = env.request_spend(&env.leo, &dao, 350 * USDC, &env.leo.id, &rref(3)).await.json();
    assert_eq!((v["status"].as_str(), v["tier"].as_str()), (Some("pending"), Some("group")));
    let pid = v["proposal_id"].as_u64().unwrap();
    env.vote(&env.maya, &dao, pid, "VoteApprove", 100).await.ok();
    env.vote(&env.sam, &dao, pid, "VoteApprove", 100).await.ok();
    assert_eq!(env.sync(&dao, pid).await.json()["hub_status"], "approved");
    // a rules change (hub-proposed call, members vote)
    let rules = json!({"instant_cap": (50 * USDC).to_string(), "member_budget": (300 * USDC).to_string(), "instant_payees": "members", "payee_allowlist": []});
    let rpid = env.hub_relay(&env.sam, "propose_rules", json!({"pot": dao, "rules": rules}), 100).await.json()["proposal_id"].as_u64().unwrap();
    env.vote(&env.maya, &dao, rpid, "VoteApprove", 300).await.ok();
    env.vote(&env.leo, &dao, rpid, "VoteApprove", 300).await.ok();
    assert_eq!(env.pot(&dao).await["rules"], rules);
    assert_eq!(env.sync(&dao, rpid).await.json()["hub_status"], "resolved");
    // a link (instant), claimed by someone outside the Pot
    let (lsk, lpk) = Env::invite_key();
    let v = env.request_link(&env.leo, &dao, 20 * USDC, &lpk, None, &rref(4)).await.json();
    assert_eq!(v["status"], "approved");
    let rid = v["request_id"].as_u64().unwrap();
    assert_eq!(claim(&env, &env.eve, &dao, rid, &env.eve.id, &env.claim_sig(&lsk, &dao, rid, &env.eve.id)).await.json()["status"], "claimed");
    // a gift, and a join through the invite
    assert_eq!(env.gift(&env.eve, &dao, 10 * USDC, "sec1").await.json(), json!("10000000"));
    assert_eq!(env.join(&env.ana, &dao, &sk, &pk).await.json()["status"], "active");
    assert_eq!(env.contribute(&env.ana, &dao, 10 * USDC).await.json(), json!("10000000"));
    assert_eq!(member_perms(&env, &dao).await, vec!["*:VoteApprove", "*:VoteReject"], "joins don't widen the policy");
    // the close: everyone's share out, then Closed (confirmed by the DAO's balance)
    env.wait_busy_window().await;
    let v = env.hub_relay(&env.maya, "propose_close", json!({"pot": dao}), 150).await.json();
    assert_eq!(v["ok"], true, "{v}");
    let cpid = v["proposal_id"].as_u64().unwrap();
    for m in [&env.maya, &env.sam, &env.leo] {
        env.vote(m, &dao, cpid, "VoteApprove", 300).await.ok();
    }
    assert_eq!(env.ft_balance(&dao).await, 0);
    let s = env.sync(&dao, cpid).await;
    assert_eq!(s.json()["hub_status"], "closed", "{}", s.dump());
    assert_eq!(env.pot(&dao).await["status"], "closed");
    Ok(())
}
dual!(hub_1_gov_2_raw_proposals_refused, hub_1);

/// W4-1 / HUB-2: two sybils admitted by a leaked invite can't drain a Pot through the one-OK tier.
/// A 1-unit contribution is no stake; the one OK must come from a stakeholder who was a member
/// before the request and isn't the payee (nor, for a link, the claimer); and every one-OK spend is
/// charged to the requester's lifetime one-OK allowance (= the one-OK ceiling, $300), so the loop
/// stops there.
async fn w4_1(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (dao, sk, pk) = env.pot_with_members(&env.maya, "sybil", &[&env.sam], 600 * USDC).await;
    // the invite leaks: two sybils join
    for a in [&env.eve, &env.ana] {
        assert_eq!(env.join(a, &dao, &sk, &pk).await.json()["status"], "active");
    }
    // HUB-2: 1 unit is not a stake → no instant spend, no one-OK (the group decides)
    assert_eq!(env.contribute(&env.eve, &dao, 1).await.json(), json!("1"));
    let p = env.hub_view("preview_spend", json!({"pot": dao, "account_id": env.eve.id, "amount": (50 * USDC).to_string(), "receiver_id": env.eve.id, "balance": null})).await;
    assert_eq!((p["path"].as_str(), p["reason"].as_str(), p["tier"].as_str()), (Some("vote"), Some("new_member"), Some("group")));
    let v = env.request_spend(&env.eve, &dao, 150 * USDC, &env.eve.id, &rref(1)).await.json();
    assert_eq!((v["status"].as_str(), v["tier"].as_str()), (Some("pending"), Some("group")));
    ok_request(&env, &env.ana, &dao, v["request_id"].as_u64().unwrap()).await.expect_err("ERR_NOT_ONE_OK");
    // with $1 each the one-OK tier opens, but only up to each one's one-OK allowance ($300)
    assert_eq!(env.contribute(&env.eve, &dao, USDC - 1).await.json(), json!((USDC - 1).to_string()));
    assert_eq!(env.contribute(&env.ana, &dao, USDC).await.json(), json!(USDC.to_string()));
    for (i, left) in [(2, "150000000"), (3, "0")] {
        let v = env.request_spend(&env.eve, &dao, 150 * USDC, &env.eve.id, &rref(i)).await.json();
        assert_eq!(v["tier"], "one_ok");
        let o = ok_request(&env, &env.ana, &dao, v["request_id"].as_u64().unwrap()).await;
        assert_eq!(o.json()["status"], "approved", "{}", o.dump());
        let m = env.member(&dao, &env.eve.id).await;
        assert_eq!((m["one_ok_left"].as_str(), m["budget_left"].as_str()), (Some(left), Some("200000000")), "the instant budget is separate");
    }
    assert_eq!(env.member(&dao, &env.eve.id).await["one_ok_used"], "300000000");
    // eve again: her allowance is used up → the group; the sybil's OK is refused
    let v = env.request_spend(&env.eve, &dao, 150 * USDC, &env.eve.id, &rref(4)).await.json();
    assert_eq!((v["status"].as_str(), v["tier"].as_str()), (Some("pending"), Some("group")));
    ok_request(&env, &env.ana, &dao, v["request_id"].as_u64().unwrap()).await.expect_err("ERR_NOT_ONE_OK");
    // and the other way round, up to ana's allowance
    let v = env.request_spend(&env.ana, &dao, 300 * USDC, &env.ana.id, &rref(5)).await.json();
    assert_eq!(ok_request(&env, &env.eve, &dao, v["request_id"].as_u64().unwrap()).await.json()["status"], "approved");
    let v = env.request_spend(&env.ana, &dao, 101 * USDC, &env.ana.id, &rref(15)).await.json();
    assert_eq!(v["tier"], "group", "the loop stops at the two allowances ($300 each, never more)");

    // who may give the OK: not the payee, not someone who joined after the request
    let v = env.request_spend(&env.sam, &dao, 150 * USDC, &env.ana.id, &rref(6)).await.json();
    assert_eq!(v["tier"], "one_ok");
    let rid = v["request_id"].as_u64().unwrap();
    ok_request(&env, &env.ana, &dao, rid).await.expect_err("ERR_OK_NOT_ELIGIBLE: receiver");
    assert_eq!(env.join(&env.leo, &dao, &sk, &pk).await.json()["status"], "active");
    assert_eq!(env.contribute(&env.leo, &dao, 100 * USDC).await.json(), json!("100000000"));
    ok_request(&env, &env.leo, &dao, rid).await.expect_err("ERR_OK_NOT_ELIGIBLE: joined_after");
    let c = env.hub_view("get_ok_check", json!({"pot": dao, "request_id": rid, "account_id": env.leo.id})).await;
    assert_eq!((c["can_ok"].as_bool(), c["reason"].as_str()), (Some(false), Some("joined_after")));
    assert_eq!(env.hub_view("get_ok_check", json!({"pot": dao, "request_id": rid, "account_id": env.maya.id})).await["can_ok"], true);
    assert_eq!(ok_request(&env, &env.maya, &dao, rid).await.json()["status"], "approved");

    // a one-OK link can't be claimed by the member who OK'd it
    let (lsk, lpk) = Env::invite_key();
    let v = env.request_link(&env.maya, &dao, 150 * USDC, &lpk, None, &rref(7)).await.json();
    assert_eq!(v["tier"], "one_ok");
    let lid = v["request_id"].as_u64().unwrap();
    assert_eq!(ok_request(&env, &env.sam, &dao, lid).await.json()["status"], "approved");
    claim(&env, &env.sam, &dao, lid, &env.sam.id, &env.claim_sig(&lsk, &dao, lid, &env.sam.id)).await.expect_err("ERR_BAD_RECEIVER");
    assert_eq!(claim(&env, &env.leo, &dao, lid, &env.leo.id, &env.claim_sig(&lsk, &dao, lid, &env.leo.id)).await.json()["status"], "claimed");
    Ok(())
}
dual!(w4_1_hub_2_one_ok_sybils, w4_1);

/// W4-5: a link still awaiting its money doesn't block the close; while the Pot closes, the hub
/// refuses the escrow payment (the token returns it to the Pot) and the close pays everything out.
/// A funded link still blocks. W4-8: no link under $1.
async fn w4_5(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (dao, _, _) = env.pot_with_members(&env.maya, "links", &[&env.sam, &env.leo], 100 * USDC).await;
    let (_, lpk) = Env::invite_key();
    // W4-8
    env.request_link(&env.maya, &dao, USDC / 2, &lpk, None, &rref(1)).await.expect_err("ERR_LINK_TOO_SMALL");
    // a link over the instant cap: pending (one OK), awaiting funds
    let v = env.request_link(&env.maya, &dao, 250 * USDC, &lpk, None, &rref(2)).await.json();
    assert_eq!((v["status"].as_str(), v["tier"].as_str()), (Some("pending"), Some("one_ok")));
    let (rid, lpid) = (v["request_id"].as_u64().unwrap(), v["proposal_id"].as_u64().unwrap());
    env.wait_busy_window().await;
    let pv = env.hub_view("preview_close", json!({"pot": dao, "balance": null})).await;
    assert_eq!((pv["can_propose"].as_bool(), pv["blocked_reason"].as_str()), (Some(true), None), "{pv}");
    let v = env.hub_relay(&env.maya, "propose_close", json!({"pot": dao}), 150).await.json();
    assert_eq!((v["ok"].as_bool(), v["balance"].as_str()), (Some(true), Some("300000000")), "{v}");
    let cpid = v["proposal_id"].as_u64().unwrap();
    // the group approves the link (by majority) while the Pot closes: the escrow payment is refused and
    // returned
    env.vote(&env.sam, &dao, lpid, "VoteApprove", 100).await.ok();
    env.vote(&env.leo, &dao, lpid, "VoteApprove", 100).await.ok();
    assert_eq!(env.ft_balance(&env.hub).await, 0, "the hub holds no escrow for a closing Pot");
    assert_eq!(env.ft_balance(&dao).await, 300 * USDC);
    env.sync(&dao, lpid).await.ok();
    assert_eq!(env.hub_view("get_link", json!({"pot": dao, "request_id": rid})).await["status"], "awaiting_funds");
    // the close pays the whole balance out
    let before = [env.ft_balance(&env.maya.id).await, env.ft_balance(&env.sam.id).await];
    env.vote(&env.sam, &dao, cpid, "VoteApprove", 300).await.ok();
    env.vote(&env.leo, &dao, cpid, "VoteApprove", 300).await.ok();
    assert_eq!(env.sync(&dao, cpid).await.json()["hub_status"], "closed");
    assert_eq!(env.ft_balance(&dao).await, 0);
    assert_eq!(env.ft_balance(&env.maya.id).await - before[0], 100 * USDC);
    assert_eq!(env.ft_balance(&env.sam.id).await - before[1], 100 * USDC);

    // a funded link holds escrow: it still blocks the close until claimed (or returned)
    let (dao2, _, _) = env.pot_with_members(&env.maya, "held", &[&env.sam], 100 * USDC).await;
    let (lsk, lpk) = Env::invite_key();
    let v = env.request_link(&env.maya, &dao2, 20 * USDC, &lpk, None, &rref(3)).await.json();
    assert_eq!(v["status"], "approved");
    let rid = v["request_id"].as_u64().unwrap();
    env.wait_busy_window().await;
    env.hub_relay(&env.sam, "propose_close", json!({"pot": dao2}), 150).await.expect_err("ERR_LINKS_PENDING");
    claim(&env, &env.eve, &dao2, rid, &env.eve.id, &env.claim_sig(&lsk, &dao2, rid, &env.eve.id)).await.ok();
    assert_eq!(env.hub_relay(&env.sam, "propose_close", json!({"pot": dao2}), 150).await.json()["ok"], true);
    Ok(())
}
dual!(w4_5_w4_8_links_and_the_close, w4_5);

/// M-2 (review of the 1.3.0 diff): USDC that reaches a Closed Pot's DAO (here sent straight to it)
/// isn't stuck even though members of a v3 Pot can't propose anything: anyone asks the hub for a
/// sweep, the hub proposes paying it out like the close, the members approve it, the money goes out.
async fn m_2(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (dao, _, _) = env.pot_with_members(&env.maya, "swept", &[&env.sam], 50 * USDC).await;
    env.hub_call(&env.maya, "propose_sweep", json!({"pot": dao}), 150, 0).await.expect_err("ERR_NOT_CLOSED");
    env.wait_busy_window().await;
    let cpid = env.hub_relay(&env.maya, "propose_close", json!({"pot": dao}), 150).await.json()["proposal_id"].as_u64().unwrap();
    for m in [&env.maya, &env.sam] {
        env.vote(m, &dao, cpid, "VoteApprove", 300).await.ok();
    }
    assert_eq!(env.sync(&dao, cpid).await.json()["hub_status"], "closed");
    // $30 sent straight to the closed Pot's DAO (the hub can't refuse a plain ft_transfer)
    env.call(&env.treasury, &env.usdc.clone(), "ft_transfer", json!({"receiver_id": dao, "amount": (30 * USDC).to_string()}), 30, 1).await.ok();
    let o = env.relayer_call("propose_sweep", json!({"pot": dao}), 150).await;
    let v = o.json();
    assert_eq!((v["ok"].as_bool(), v["balance"].as_str()), (Some(true), Some("30000000")), "{}", o.dump());
    let spid = v["proposal_id"].as_u64().unwrap();
    assert_eq!(o.event("sweep_proposed")["proposal_id"], spid);
    let subj = env.hub_view("get_proposal_subject", json!({"pot": dao, "proposal_id": spid})).await;
    assert_eq!((subj["kind"].as_str(), subj["live"].as_bool()), (Some("sweep"), Some(true)));
    env.relayer_call("propose_sweep", json!({"pot": dao}), 150).await.expect_err("ERR_SWEEP_COOLDOWN");
    let before = [env.ft_balance(&env.maya.id).await, env.ft_balance(&env.sam.id).await];
    for m in [&env.maya, &env.sam] {
        env.vote(m, &dao, spid, "VoteApprove", 300).await.ok();
    }
    assert_eq!(env.proposal(&dao, spid).await["status"], "Approved");
    assert_eq!(env.ft_balance(&dao).await, 0);
    assert_eq!(env.ft_balance(&env.maya.id).await - before[0], 15 * USDC);
    assert_eq!(env.ft_balance(&env.sam.id).await - before[1], 15 * USDC);
    assert_eq!(env.pot(&dao).await["status"], "closed");
    Ok(())
}
dual!(m_2_sweep_after_close, m_2);
