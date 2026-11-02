//! C-12: safety. T-80…T-84, T-86, T-87, T-95, PR-05 — builds A and B.
//! (T-85 is a static unit test in pot-hub: tests::dao_action_surface; T-95's static
//! transfer-site check is tests::transfer_sites.)

use pot_tests::*;
use serde_json::{json, Value};

const CALLBACKS: &[&str] = &[
    "on_pot_created", "on_dao_registered", "on_contribution_forwarded", "on_spend_checked", "on_spend_added",
    "on_spend_status", "on_sync", "on_retry_status", "on_join_added", "on_join_status", "on_rules_added",
    "on_close_balance", "on_close_added", "on_gift_forwarded",
];

/// T-80 private callbacks · T-81 no deposits · T-82 owner + pause · T-95 config ranges.
async fn t80(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (dao, _, _) = env.pot_with_members(&env.maya, "safe", &[&env.sam], 100 * USDC).await;
    // T-80
    for cb in CALLBACKS {
        let e = env.hub_call(&env.eve, cb, json!({}), 30, 0).await.err();
        assert!(e.contains(&format!("Method {cb} is private")), "{cb}: {e}");
    }
    // T-81: 1 yocto on a method that isn't hub-funded → near-sdk refuses
    for (m, args) in [
        ("sync", json!({"pot": dao, "proposal_id": 0})),
        ("retry_payout", json!({"pot": dao, "proposal_id": 0})),
        ("revoke_invite", json!({"pot": dao, "invite_pk": Env::invite_key().1})),
        ("set_rules", json!({"pot": dao, "rules": {"instant_cap":"1","member_budget":"1","instant_payees":"members","payee_allowlist":[]}})),
        ("set_config", json!({"patch": {}})),
        ("ft_on_transfer", json!({"sender_id": env.maya.id, "amount": "1", "msg": "{}"})),
    ] {
        let e = env.hub_call(&env.maya, m, args, 30, 1).await.err();
        assert!(e.contains("doesn't accept deposit"), "{m}: {e}");
    }
    let (solo, _) = env.create_pot(&env.leo, "solo").await; // for the sole-member set_rules pause check
    // T-82: owner only
    env.hub_call(&env.eve, "set_config", json!({"patch": {"paused": true}}), 30, 0).await.expect_err("ERR_NOT_OWNER");
    // the patch can't carry owner / usdc / dao_code_hash (unknown fields fail deserialization)
    for extra in [json!({"owner": env.eve.id}), json!({"usdc": env.eve.id}), json!({"dao_code_hash": HASH_A})] {
        let e = env.hub_call(&env.owner, "set_config", json!({"patch": extra}), 30, 0).await.err();
        assert!(e.contains("Failed to deserialize"), "{e}");
    }
    let mut lim = roomy_limits();
    lim["bogus"] = json!(1);
    env.hub_call(&env.owner, "set_config", json!({"patch": {"limits": lim}}), 30, 0).await.expect_err("Failed to deserialize");
    // pause: blocks the listed methods only
    let o = env.hub_call(&env.owner, "set_config", json!({"patch": {"paused": true}}), 30, 0).await;
    o.ok();
    let ev = o.event("config_changed");
    assert_eq!((ev["by"].as_str(), ev["config"]["paused"].as_bool()), (Some(env.owner.id.as_str()), Some(true)));
    assert!(ev["config"].get("free_balance").is_none());
    env.create_pot(&env.leo, "paused").await.1.expect_err("ERR_PAUSED");
    env.request_spend(&env.maya, &dao, 1 * USDC, &env.maya.id, "paused01").await.expect_err("ERR_PAUSED");
    let (sk, pk) = Env::invite_key();
    env.hub_relay(&env.maya, "add_invite", json!({"pot": dao, "invite_pk": pk, "expires_at_ms": null, "max_uses": null}), 30).await.expect_err("ERR_PAUSED");
    env.join(&env.leo, &dao, &sk, &pk).await.expect_err("ERR_PAUSED");
    env.hub_relay(&env.maya, "propose_rules", json!({"pot": dao, "rules": {"instant_cap":"1","member_budget":"1","instant_payees":"members","payee_allowlist":[]}}), 100)
        .await
        .expect_err("ERR_PAUSED");
    env.hub_relay(&env.leo, "set_rules", json!({"pot": solo, "rules": {"instant_cap":"1","member_budget":"1","instant_payees":"members","payee_allowlist":[]}}), 30)
        .await
        .expect_err("ERR_PAUSED");
    assert_eq!(env.contribute(&env.maya, &dao, 1 * USDC).await.json(), json!("0"), "contributions refunded while paused");
    // never blocked: views, sync, revoke_invite, propose_close (the exit path)
    assert!(!env.pot(&dao).await.is_null());
    env.sync(&dao, 0).await.ok();
    let first_invite = env.hub_view("get_pot", json!({"pot": dao})).await["active_invites"].clone();
    assert_eq!(first_invite, 1);
    env.wait_busy_window().await;
    let c = env.hub_relay(&env.sam, "propose_close", json!({"pot": dao}), 150).await;
    assert_eq!(c.json()["ok"], true, "propose_close works while paused");
    env.hub_call(&env.owner, "set_config", json!({"patch": {"paused": false}}), 30, 0).await.ok();

    // T-95: every range edge OK, just outside → CONFIG_INVALID
    let base = || json!({"dao_float": "50000000000000000000000", "min_dao_float": "50000000000000000000000"});
    let envr = &env;
    let set = move |patch: Value| async move { envr.hub_call(&envr.owner, "set_config", json!({"patch": patch}), 30, 0).await };
    let milli = |m: u128| (m * MILLI).to_string();
    // dao_float / min_dao_float
    set(json!({"dao_float": milli(500), "min_dao_float": milli(50)})).await.ok();
    set(json!({"dao_float": (500 * MILLI + 1).to_string()})).await.expect_err("ERR_CONFIG_INVALID");
    set(json!({"dao_float": (50 * MILLI - 1).to_string(), "min_dao_float": (50 * MILLI - 1).to_string()})).await.expect_err("ERR_CONFIG_INVALID");
    set(json!({"dao_float": milli(100), "min_dao_float": milli(101)})).await.expect_err("ERR_CONFIG_INVALID");
    set(json!({"dao_float": milli(100), "min_dao_float": (50 * MILLI - 1).to_string()})).await.expect_err("ERR_CONFIG_INVALID");
    set(base()).await.ok();
    // relayers ≤ 4
    let r: Vec<String> = (0..4).map(|i| format!("r{i}.test.near")).collect();
    set(json!({"relayers": r})).await.ok();
    let r5: Vec<String> = (0..5).map(|i| format!("r{i}.test.near")).collect();
    set(json!({"relayers": r5})).await.expect_err("ERR_CONFIG_INVALID");
    set(json!({"relayers": [env.relayer.id]})).await.ok();
    // limits
    for (field, lo, hi) in [
        ("max_members", 2u64, 40u64),
        ("max_pots_per_creator_per_day", 1, 10),
        ("max_sponsored_pots_per_day", 1, 200),
        ("max_pots_per_account", 1, 100),
        ("max_active_invites", 1, 20),
        ("max_invites_total", 1, 100),
        ("max_pending_per_member", 1, 10),
        ("max_requests_per_pot", 1, 1000),
    ] {
        for (v, ok) in [(lo, true), (hi, true), (lo - 1, false), (hi + 1, false)] {
            let mut l = roomy_limits();
            l[field] = json!(v);
            let o = set(json!({"limits": l})).await;
            if ok {
                o.ok();
            } else {
                o.expect_err("ERR_CONFIG_INVALID");
            }
        }
    }
    for (v, ok) in [(500 * MILLI, true), (50 * NEAR, true), (500 * MILLI - 1, false), (50 * NEAR + 1, false)] {
        let mut l = roomy_limits();
        l["min_hub_reserve"] = json!(v.to_string());
        let o = set(json!({"limits": l})).await;
        if ok { o.ok(); } else { o.expect_err("ERR_CONFIG_INVALID"); }
    }
    set(json!({"limits": roomy_limits()})).await.ok();
    let cfg = env.hub_view("get_config", json!({})).await;
    assert_eq!((cfg["owner"].as_str(), cfg["usdc"].as_str(), cfg["dao_code_hash"].as_str()), (Some(env.owner.id.as_str()), Some(env.usdc.as_str()), Some(build.expected_hash())));
    // `new` rejects out-of-range config too
    let h2 = env.root.create_subaccount("pots2").initial_balance(near_workspaces::types::NearToken::from_near(10)).transact().await?.into_result()?;
    h2.deploy(&hub_wasm()).await?.into_result()?;
    for (f, mf, relayers) in [
        (600 * MILLI, 50 * MILLI, json!([])),
        (50 * MILLI, 60 * MILLI, json!([])),
        (50 * MILLI, 50 * MILLI, json!(["a.near", "b.near", "c.near", "d.near", "e.near"])),
    ] {
        let r = h2
            .call(h2.id(), "new")
            .args_json(json!({"owner": env.owner.id, "usdc": env.usdc, "dao_code_hash": HASH_A, "dao_float": f.to_string(), "min_dao_float": mf.to_string(), "relayers": relayers, "limits": null}))
            .gas(near_workspaces::types::Gas::from_tgas(30))
            .transact()
            .await?;
        assert!(format!("{:?}", r.into_result().unwrap_err()).contains("ERR_CONFIG_INVALID"));
    }
    let mut big = roomy_limits();
    big["max_members"] = json!(41);
    let r = h2
        .call(h2.id(), "new")
        .args_json(json!({"owner": env.owner.id, "usdc": env.usdc, "dao_code_hash": HASH_A, "dao_float": (50 * MILLI).to_string(), "min_dao_float": (50 * MILLI).to_string(), "relayers": [], "limits": big}))
        .gas(near_workspaces::types::Gas::from_tgas(30))
        .transact()
        .await?;
    assert!(format!("{:?}", r.into_result().unwrap_err()).contains("ERR_CONFIG_INVALID"));
    Ok(())
}
dual!(t80_privacy_deposits_owner, t80);

/// T-83 caps (Pots per account, hub reserve on every hub-funded op) · T-86 overflow.
async fn t83(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (dao, sk, pk) = env.pot_with_members(&env.maya, "caps", &[&env.sam], 100 * USDC).await;
    // Pots per account
    let mut l = roomy_limits();
    l["max_pots_per_account"] = json!(1);
    env.hub_call(&env.owner, "set_config", json!({"patch": {"limits": l}}), 30, 0).await.ok();
    env.create_pot(&env.maya, "second").await.1.expect_err("ERR_TOO_MANY_POTS");
    let (other, _) = env.create_pot(&env.leo, "other").await;
    let (sk2, pk2) = Env::invite_key();
    env.hub_relay(&env.leo, "add_invite", json!({"pot": other, "invite_pk": pk2, "expires_at_ms": null, "max_uses": null}), 30).await.ok();
    env.join(&env.maya, &other, &sk2, &pk2).await.expect_err("ERR_TOO_MANY_POTS");
    // hub reserve: raise min_hub_reserve above the hub's free balance → every hub-funded op refuses
    let mut l = roomy_limits();
    l["min_hub_reserve"] = json!((50 * NEAR).to_string());
    env.hub_call(&env.owner, "set_config", json!({"patch": {"limits": l}}), 30, 0).await.ok();
    env.create_pot(&env.ana, "poor").await.1.expect_err("ERR_HUB_LOW_BALANCE");
    env.request_spend(&env.maya, &dao, 1 * USDC, &env.maya.id, "lowbal01").await.expect_err("ERR_HUB_LOW_BALANCE");
    env.join(&env.leo, &dao, &sk, &pk).await.expect_err("ERR_HUB_LOW_BALANCE");
    env.hub_relay(&env.maya, "add_invite", json!({"pot": dao, "invite_pk": Env::invite_key().1, "expires_at_ms": null, "max_uses": null}), 30)
        .await
        .expect_err("ERR_HUB_LOW_BALANCE");
    env.hub_relay(&env.maya, "propose_rules", json!({"pot": dao, "rules": {"instant_cap":"1","member_budget":"1","instant_payees":"members","payee_allowlist":[]}}), 100)
        .await
        .expect_err("ERR_HUB_LOW_BALANCE");
    env.wait_busy_window().await;
    env.hub_relay(&env.maya, "propose_close", json!({"pot": dao}), 150).await.expect_err("ERR_HUB_LOW_BALANCE");
    env.hub_call(&env.owner, "set_config", json!({"patch": {"limits": roomy_limits()}}), 30, 0).await.ok();

    // T-86: total_contributed beyond MAX_AMOUNT → AMOUNT_TOO_LARGE (money recycled out and back in)
    let big = 600_000_000_000_000u128; // $600M, the supply is $1B
    env.fund(&env.leo, big).await?;
    let solo = other; // Leo's sole-member Pot from above
    assert_eq!(env.contribute(&env.leo, &solo, big).await.json(), json!(big.to_string()));
    let v = env.request_spend(&env.leo, &solo, big, &env.leo.id, "whale001").await.json();
    let pid = v["proposal_id"].as_u64().unwrap();
    env.vote(&env.leo, &solo, pid, "VoteApprove", 100).await.ok();
    assert_eq!(env.sync(&solo, pid).await.json()["hub_status"], "approved");
    let c = env.contribute(&env.leo, &solo, big).await;
    assert_eq!(c.json(), json!("0"), "refunded");
    assert!(c.failures().join(" ").contains("ERR_AMOUNT_TOO_LARGE"));
    assert_eq!(u(&env.pot(&solo).await["total_contributed"]), big);
    Ok(())
}
dual!(t83_caps_overflow, t83);

/// T-87 change counter: each state-changing call/callback bumps `seq` once; views never do.
/// T-84 events: the exact §5 field sets.
async fn t87(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let seq = |v: Value| v["seq"].as_u64().unwrap();
    let (sk, pk) = Env::invite_key();
    let (dao, o) = env.create_pot_with(&env.maya, "seq", "trip", Value::Null, Some(pk.clone())).await;
    let mut events: Vec<(String, Value)> = o.events();
    assert_eq!(seq(env.pot(&dao).await), 1, "create = on_pot_created");
    let s0 = seq(env.pot(&dao).await);
    for _ in 0..3 {
        env.hub_view("get_members", json!({"pot": dao, "balance": null})).await;
        env.hub_view("preview_close", json!({"pot": dao, "balance": null})).await;
    }
    assert_eq!(seq(env.pot(&dao).await), s0, "views never bump");
    let expect = |label: &str, delta: u64, before: u64, after: u64| assert_eq!(after - before, delta, "{label}");
    let b = seq(env.pot(&dao).await);
    let o = env.join(&env.sam, &dao, &sk, &pk).await;
    events.extend(o.events());
    expect("join = join + on_join_added + on_join_status", 3, b, seq(env.pot(&dao).await));
    env.join(&env.leo, &dao, &sk, &pk).await.ok();
    let b = seq(env.pot(&dao).await);
    let o = env.contribute(&env.maya, &dao, 150 * USDC).await;
    events.extend(o.events());
    expect("contribution = ft_on_transfer + callback", 2, b, seq(env.pot(&dao).await));
    env.contribute(&env.sam, &dao, 150 * USDC).await.ok();
    env.contribute(&env.leo, &dao, 150 * USDC).await.ok();
    let b = seq(env.pot(&dao).await);
    let o = env.request_spend(&env.maya, &dao, 84 * USDC, &env.maya.id, "seqseq01").await;
    events.extend(o.events());
    expect("instant = request + checked + added + status", 4, b, seq(env.pot(&dao).await));
    let b = seq(env.pot(&dao).await);
    let o = env.request_spend(&env.maya, &dao, 300 * USDC, &env.maya.id, "seqseq02").await;
    events.extend(o.events());
    let pid = o.json()["proposal_id"].as_u64().unwrap();
    expect("vote = request + checked + added", 3, b, seq(env.pot(&dao).await));
    let b = seq(env.pot(&dao).await);
    env.sync(&dao, pid).await.ok();
    expect("sync without change", 0, b, seq(env.pot(&dao).await));
    env.vote(&env.maya, &dao, pid, "VoteApprove", 100).await.ok();
    env.vote(&env.leo, &dao, pid, "VoteApprove", 100).await.ok();
    let o = env.sync(&dao, pid).await;
    events.extend(o.events());
    expect("sync with change", 1, b, seq(env.pot(&dao).await));
    let (_, pk2) = Env::invite_key();
    let b = seq(env.pot(&dao).await);
    events.extend(env.hub_relay(&env.maya, "add_invite", json!({"pot": dao, "invite_pk": pk2, "expires_at_ms": null, "max_uses": null}), 30).await.events());
    events.extend(env.hub_relay(&env.sam, "revoke_invite", json!({"pot": dao, "invite_pk": pk2}), 30).await.events());
    expect("add_invite + revoke_invite", 2, b, seq(env.pot(&dao).await));
    let b = seq(env.pot(&dao).await);
    let o = env.hub_relay(&env.sam, "propose_rules", json!({"pot": dao, "rules": {"instant_cap":"1","member_budget":"1","instant_payees":"members","payee_allowlist":[]}}), 100).await;
    events.extend(o.events());
    let rp = o.json()["proposal_id"].as_u64().unwrap();
    expect("propose_rules = propose + on_rules_added", 2, b, seq(env.pot(&dao).await));
    env.vote(&env.maya, &dao, rp, "VoteApprove", 300).await.ok();
    let o = env.vote(&env.sam, &dao, rp, "VoteApprove", 300).await;
    events.extend(o.events());
    env.sync(&dao, rp).await.ok();
    env.wait_busy_window().await;
    let b = seq(env.pot(&dao).await);
    let o = env.hub_relay(&env.leo, "propose_close", json!({"pot": dao}), 150).await;
    events.extend(o.events());
    let cp = o.json()["proposal_id"].as_u64().unwrap();
    expect("propose_close = propose + on_close_added", 2, b, seq(env.pot(&dao).await));
    env.vote(&env.maya, &dao, cp, "VoteApprove", 300).await.ok();
    env.vote(&env.sam, &dao, cp, "VoteApprove", 300).await.ok();
    events.extend(env.sync(&dao, cp).await.events());
    let o = env.hub_call(&env.owner, "set_config", json!({"patch": {"paused": false}}), 30, 0).await;
    events.extend(o.events());

    // T-84: every §5 event appears with exactly its field set (spend_withdrawn is Phase 3)
    let want: &[(&str, &[&str])] = &[
        ("pot_created", &["pot", "slug", "name", "emoji", "preset", "creator", "rules", "float"]),
        ("member_joined", &["pot", "member", "proposal_id", "invite_pk"]),
        ("contribution", &["pot", "member", "amount", "member_total", "pot_total"]),
        // hub 1.1.0 (wave 4) adds `tier` and `link`
        ("spend_requested", &["pot", "request_id", "proposal_id", "requester", "receiver_id", "amount", "category", "request_ref", "path", "reason", "approvals_needed", "tier", "link"]),
        ("spend_auto_approved", &["pot", "request_id", "proposal_id", "requester", "receiver_id", "amount", "budget_used", "budget_left"]),
        ("rules_changed", &["pot", "rules", "rules_version", "by", "actor"]),
        ("invite_added", &["pot", "invite_pk", "by", "expires_at_ms", "max_uses"]),
        ("invite_revoked", &["pot", "invite_pk", "by"]),
        ("close_proposed", &["pot", "proposal_id", "by", "balance", "payouts", "dust", "dust_to"]),
        ("pot_closed", &["pot", "proposal_id", "balance", "payouts"]),
        ("rules_change_proposed", &["pot", "proposal_id", "by", "rules", "rules_version"]),
        ("proposal_synced", &["pot", "proposal_id", "subject", "request_id", "member", "dao_status", "hub_status"]),
        ("config_changed", &["by", "config"]),
    ];
    for (name, fields) in want {
        let ev = events.iter().find(|e| e.0 == *name).unwrap_or_else(|| panic!("no {name} event"));
        let mut got: Vec<&str> = ev.1.as_object().unwrap().keys().map(|k| k.as_str()).collect();
        got.sort();
        let mut w: Vec<&str> = fields.to_vec();
        w.sort();
        assert_eq!(got, w, "{name} fields");
    }
    // (spend_payout_failed's fields are asserted in t_spend T-28b and t_vote T-29)
    Ok(())
}
dual!(t87_seq_and_events, t87);

/// PR-05 (rev4): direct calls attaching exactly `cost(op)` never lower the hub's free balance.
/// Seeded random interleavings of the six hub-funded methods by 3 accounts. The check subtracts an
/// upper bound of the hub's own gas reward (30 % on protocol 86, 0 on testnet), so it also holds
/// on testnet.
async fn pr05(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let actors = [env.maya.clone(), env.sam.clone(), env.leo.clone()];
    let mut seed: u64 = if build == Build::A { 0x5eed_0001 } else { 0x5eed_0002 };
    let mut rnd = |n: u64| {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (seed >> 33) % n
    };
    // pots: (dao, members, invite sk/pk)
    let mut pots: Vec<(near_workspaces::AccountId, Vec<usize>, ed25519_dalek::SigningKey, String)> = vec![];
    let mut checked = 0;
    let mut slug_n = 0;
    for step in 0..36 {
        let op = rnd(6);
        let who = rnd(3) as usize;
        let a = &actors[who];
        let (method, args): (&str, Value) = match op {
            0 => {
                slug_n += 1;
                let (sk, pk) = Env::invite_key();
                let slug = format!("pr05-{slug_n}");
                pots.push((env.dao_id(&slug), vec![who], sk, pk.clone()));
                ("create_pot", json!({"slug": slug, "name": "x", "preset": "trip", "rules": null, "invite_pk": pk, "emoji": null, "float": null}))
            }
            _ if pots.is_empty() => continue,
            1 => {
                let i = rnd(pots.len() as u64) as usize;
                ("add_invite", json!({"pot": pots[i].0, "invite_pk": Env::invite_key().1, "expires_at_ms": null, "max_uses": null}))
            }
            2 => {
                let i = rnd(pots.len() as u64) as usize;
                let sig = Env::join_sig(&pots[i].2, &pots[i].0, &a.id);
                if !pots[i].1.contains(&who) {
                    pots[i].1.push(who);
                }
                ("join", json!({"pot": pots[i].0, "invite_pk": pots[i].3, "signature": sig}))
            }
            3 => {
                let i = rnd(pots.len() as u64) as usize;
                // make sure there is money and the request is plausible
                let _ = env.contribute(a, &pots[i].0, 20 * USDC).await;
                let amt = if rnd(2) == 0 { 5 * USDC } else { 150 * USDC };
                ("request_spend", json!({"pot": pots[i].0, "amount": amt.to_string(), "receiver_id": a.id, "category": "other", "request_ref": format!("pr05x{step:04}")}))
            }
            4 => {
                let i = rnd(pots.len() as u64) as usize;
                ("propose_rules", json!({"pot": pots[i].0, "rules": {"instant_cap":"1000000","member_budget":"2000000","instant_payees":"members","payee_allowlist":[]}}))
            }
            _ => {
                let i = rnd(pots.len() as u64) as usize;
                env.fast_forward(220).await;
                ("propose_close", json!({"pot": pots[i].0}))
            }
        };
        let gas = if method == "add_invite" { 30 } else { 150 };
        // 1) learn cost(op) from the refusal, 2) attach exactly that
        let probe = env.hub_call(a, method, args.clone(), gas, 0).await;
        let e = match &probe.value {
            Ok(_) => continue,
            Err(e) => e.clone(),
        };
        let Some(rest) = e.split("ERR_DEPOSIT_REQUIRED: ").nth(1) else { continue };
        let cost: u128 = rest.chars().take_while(|c| c.is_ascii_digit()).collect::<String>().parse()?;
        env.fast_forward(2).await;
        let before = env.hub_free().await;
        let o = env.hub_call(a, method, args, gas, cost).await;
        env.fast_forward(3).await;
        let after = env.hub_free().await;
        let reward_bound: u128 = o.receipts.iter().filter(|r| r.executor == env.hub.as_str() && r.ok).map(|r| r.gas_burnt as u128).sum::<u128>() * 100_000_000 * 3 / 10;
        let delta = after as i128 - before as i128 - reward_bound as i128;
        assert!(delta >= 0, "step {step} {method}: hub free balance fell by {} yocto (cost {cost}, ok={})", -delta, o.is_ok());
        checked += 1;
    }
    println!("[{build:?}] PR-05: {checked} paid direct calls, hub free balance never decreased");
    assert!(checked >= 8);
    Ok(())
}
dual!(pr05_no_hub_drain, pr05);
