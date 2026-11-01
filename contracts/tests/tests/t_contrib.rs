//! C-06: contributions (`ft_on_transfer` forward-and-refund), T-10…T-17 — builds A and B.
//! (T-14 closing/closed refunds are asserted in t_close.rs, where Pots get closed.)

use pot_tests::*;
use serde_json::json;

/// T-10 ★ contribution + T-11 non-member + T-12 bad msg + T-13 wrong token + T-17 same block.
async fn t10(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (dao, o) = env.create_pot(&env.maya, "lisbon").await;
    assert_eq!(o.json()["ok"], true);
    let maya0 = env.ft_balance(&env.maya.id).await;

    // T-10 ★
    let c = env.contribute(&env.maya, &dao, 150 * USDC).await;
    assert_eq!(c.json(), json!("150000000"), "resolve: used == amount");
    assert_eq!(env.ft_balance(&dao).await, 150 * USDC);
    assert_eq!(env.ft_balance(&env.hub).await, 0, "the hub never holds USDC");
    assert_eq!(maya0 - env.ft_balance(&env.maya.id).await, 150 * USDC);
    let ev = c.event("contribution");
    assert_eq!(ev, json!({"pot": dao, "member": env.maya.id, "amount": "150000000", "member_total": "150000000", "pot_total": "150000000"}));
    let pot = env.pot(&dao).await;
    assert_eq!(pot["total_contributed"], "150000000");
    assert_eq!(pot["last_contributor"], env.maya.id.as_str());
    assert_eq!(pot["balance_estimate"], "150000000");
    let m = env.member(&dao, &env.maya.id).await;
    assert_eq!(m["contributed"], "150000000");
    assert_eq!(m["would_get_back"], "150000000");
    assert_eq!(m["balance_source"], "ledger");
    let s = env.hub_view("get_pots_of", json!({"account_id": env.maya.id})).await;
    assert_eq!(s[0]["contributed"], "150000000");
    assert_eq!(s[0]["total_contributed"], "150000000");
    println!("[{build:?}] T-10 contribution chain burnt {:.2} Tgas", c.total_gas_burnt() as f64 / 1e12);

    // T-11 non-member → full refund, nothing recorded
    let eve0 = env.ft_balance(&env.eve.id).await;
    let c = env.contribute(&env.eve, &dao, 10 * USDC).await;
    assert_eq!(c.json(), json!("0"));
    assert!(c.logs().iter().any(|l| l.contains("ERR_NOT_MEMBER")) || c.failures().iter().any(|f| f.contains("ERR_NOT_MEMBER")));
    assert_eq!(env.ft_balance(&env.eve.id).await, eve0);
    assert_eq!(env.pot(&dao).await["total_contributed"], "150000000");

    // T-12 bad msg: malformed, unknown field, unknown Pot → refund
    for msg in ["{", "{\"pot\":1}", &json!({"pot": dao, "x": 1}).to_string(), &json!({"pot": "nope.pots.test.near"}).to_string(), "", "lisbon"] {
        let c = env
            .relay(&env.maya, &env.usdc.clone(), "ft_transfer_call", json!({"receiver_id": env.hub, "amount": "1000000", "msg": msg}), 100, 1)
            .await;
        assert_eq!(c.json(), json!("0"), "msg {msg:?}");
        let f = c.failures().join(" ");
        assert!(f.contains("ERR_BAD_MSG") || f.contains("ERR_POT_NOT_FOUND"), "{msg:?}: {f}");
    }
    assert_eq!(env.pot(&dao).await["total_contributed"], "150000000");
    assert_eq!(env.ft_balance(&dao).await, 150 * USDC);

    // T-13 wrong token: a second FT, and a direct call
    let fake = env.root.create_subaccount("fake").initial_balance(near_workspaces::types::NearToken::from_near(5)).transact().await?.into_result()?;
    fake.deploy(&usdc_wasm()).await?.into_result()?;
    fake.call(fake.id(), "new")
        .args_json(json!({"owner_id": env.maya.id, "total_supply": "1000000000", "metadata": {"spec":"ft-1.0.0","name":"Fake","symbol":"FAKE","icon":null,"reference":null,"reference_hash":null,"decimals":6}}))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    fake.call(fake.id(), "storage_deposit")
        .args_json(json!({"account_id": env.hub, "registration_only": true}))
        .deposit(near_workspaces::types::NearToken::from_millinear(2))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    let c = env
        .relay(&env.maya, fake.id(), "ft_transfer_call", json!({"receiver_id": env.hub, "amount": "1000000", "msg": json!({"pot": dao}).to_string()}), 100, 1)
        .await;
    assert_eq!(c.json(), json!("0"));
    assert!(c.failures().join(" ").contains("ERR_WRONG_TOKEN"));
    env.hub_call(&env.eve, "ft_on_transfer", json!({"sender_id": env.maya.id, "amount": "1", "msg": json!({"pot": dao}).to_string()}), 30, 0)
        .await
        .expect_err("ERR_WRONG_TOKEN");

    // T-17 same-block contributions by two members: both recorded once, totals add up
    let (sk, pk) = Env::invite_key();
    env.hub_relay(&env.maya, "add_invite", json!({"pot": dao, "invite_pk": pk, "expires_at_ms": null, "max_uses": null}), 30).await.ok();
    let j = env.join(&env.sam, &dao, &sk, &pk).await;
    println!("join receipts:\n{}", j.dump());
    assert_eq!(j.json()["status"], "active");
    let args = |amt: u128| serde_json::to_vec(&json!({"receiver_id": env.hub, "amount": amt.to_string(), "msg": json!({"pot": dao}).to_string()})).unwrap();
    let outs = env
        .rpc
        .call_many(vec![
            (env.maya.clone(), env.usdc.clone(), "ft_transfer_call".into(), args(7 * USDC), 100, 1),
            (env.sam.clone(), env.usdc.clone(), "ft_transfer_call".into(), args(11 * USDC), 100, 1),
            (env.sam.clone(), env.usdc.clone(), "ft_transfer_call".into(), args(13 * USDC), 100, 1),
        ])
        .await?;
    for o in &outs {
        assert_ne!(o.json(), json!("0"));
    }
    let pot = env.pot(&dao).await;
    assert_eq!(u(&pot["total_contributed"]), 181 * USDC);
    assert_eq!(env.ft_balance(&dao).await, 181 * USDC);
    assert_eq!(u(&env.member(&dao, &env.sam.id).await["contributed"]), 24 * USDC);
    assert_eq!(u(&env.member(&dao, &env.maya.id).await["contributed"]), 157 * USDC);
    Ok(())
}
dual!(t10_contributions, t10);

/// T-15: DAO unregistered (members pass a DAO FunctionCall{usdc, storage_unregister} first) →
/// the forward fails → full refund; the hub holds 0.
async fn t15(build: Build) -> anyhow::Result<()> {
    use base64::Engine;
    let env = Env::new(build).await?;
    let (dao, _) = env.create_pot(&env.maya, "unreg").await;
    let kind = json!({"FunctionCall": {"receiver_id": env.usdc, "actions": [{
        "method_name": "storage_unregister",
        "args": base64::engine::general_purpose::STANDARD.encode("{}"),
        "deposit": "1", "gas": "10000000000000"}]}});
    let id: u64 = env
        .relay(&env.maya, &dao, "add_proposal", json!({"proposal": {"description": "unregister", "kind": kind}}), 50, 0)
        .await
        .json()
        .as_u64()
        .unwrap();
    env.vote(&env.maya, &dao, id, "VoteApprove", 300).await.ok();
    assert_eq!(env.proposal(&dao, id).await["status"], "Approved");
    assert!(env.view(&env.usdc.clone(), "storage_balance_of", json!({"account_id": dao})).await.is_null());
    let maya0 = env.ft_balance(&env.maya.id).await;
    let c = env.contribute(&env.maya, &dao, 5 * USDC).await;
    assert_eq!(c.json(), json!("0"));
    assert_eq!(env.ft_balance(&env.maya.id).await, maya0);
    assert_eq!(env.ft_balance(&env.hub).await, 0);
    assert_eq!(env.pot(&dao).await["total_contributed"], "0");
    assert!(c.events().is_empty(), "no contribution event on a refund");
    Ok(())
}
dual!(t15_dao_unregistered, t15);

/// T-16: low gas. With too little gas `ft_on_transfer` can't schedule its hops → full refund
/// (used "0"), nothing recorded; with ≥ the documented minimum the contribution is recorded.
async fn t16(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (dao, _) = env.create_pot(&env.maya, "lowgas").await;
    let c = env.contribute_gas(&env.maya, &dao, 1 * USDC, 30).await;
    assert_eq!(c.json(), json!("0"), "30 Tgas → refunded");
    assert_eq!(env.pot(&dao).await["total_contributed"], "0");
    // find the minimum that records (D-06 documents ≥ 35; we attach 100)
    let mut min_ok = None;
    for g in [35u64, 40, 45, 50] {
        let c = env.contribute_gas(&env.maya, &dao, 1 * USDC, g).await;
        if c.json() == json!("1000000") {
            min_ok = Some(g);
            break;
        }
    }
    let g = min_ok.expect("a contribution with ≤ 50 Tgas records");
    println!("[{build:?}] T-16 minimum ft_transfer_call gas that records: {g} Tgas");
    assert_eq!(env.pot(&dao).await["total_contributed"], "1000000");
    let c = env.contribute(&env.maya, &dao, 1 * USDC).await;
    assert_eq!(c.json(), json!("1000000"), "100 Tgas (D-06) records");
    Ok(())
}
dual!(t16_low_gas, t16);
