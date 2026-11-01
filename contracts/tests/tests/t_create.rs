//! C-03 / C-04: T-00…T-06, T-89 (create cases), T-90 — on builds A and B.

use pot_tests::*;
use serde_json::{json, Value};

fn norm_policy(mut p: Value) -> Value {
    if let Some(roles) = p["roles"].as_array_mut() {
        for r in roles.iter_mut() {
            if let Some(perms) = r["permissions"].as_array_mut() {
                perms.sort_by(|a, b| a.as_str().cmp(&b.as_str()));
            }
            if let Some(g) = r["kind"]["Group"].as_array_mut() {
                g.sort_by(|a, b| a.as_str().cmp(&b.as_str()));
            }
        }
        roles.sort_by(|a, b| a["name"].as_str().cmp(&b["name"].as_str()));
    }
    p
}

/// T-00 ★: the harness publishes both builds; hashes and SHA256SUMS match (INV-17).
async fn t00(build: Build) -> anyhow::Result<()> {
    verify_sha256sums()?;
    let env = Env::new(build).await?;
    assert_eq!(env.code_hash, build.expected_hash());
    Ok(())
}
dual!(t00_harness_publishes_build, t00);

/// T-01 ★: create_pot happy path (relayed = sponsored) (INV-14, 16, 17).
async fn t01(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (_sk, pk) = Env::invite_key();
    let hub_before = env.hub_free().await;
    let o = env
        .hub_relay(
            &env.maya,
            "create_pot",
            json!({"slug":"lisbon-trip","name":"  Lisbon Trip  ","preset":"trip","rules":null,"invite_pk":pk,"emoji":"🇵🇹","float":null}),
            150,
        )
        .await;
    let dao = env.dao_id("lisbon-trip");
    assert_eq!(
        o.json(),
        json!({"ok":true,"pot":dao,"slug":"lisbon-trip","float":"50000000000000000000000","usdc_registered":true})
    );
    // DAO exists, runs the published global code, holds the float, no access keys
    let acc = env.account(&dao).await.expect("dao exists");
    assert_eq!(acc.global_contract_hash.map(|h| h.to_string()), Some(build.expected_hash().to_string()));
    let amount = acc.amount.as_yoctonear();
    assert!(amount >= 50 * MILLI && amount < 51 * MILLI, "dao balance {amount}");
    // policy == the §3.2 template
    let want = json!({
        "roles": [
          { "name": "member", "kind": { "Group": [env.maya.id] },
            "permissions": ["*:AddProposal", "*:VoteApprove", "*:VoteReject", "*:Finalize"], "vote_policy": {} },
          { "name": "rulebot", "kind": { "Group": [env.hub] },
            "permissions": ["transfer:AddProposal", "transfer:VoteApprove", "transfer:Finalize",
                            "add_member_to_role:AddProposal", "add_member_to_role:VoteApprove", "call:AddProposal"],
            "vote_policy": {
              "transfer":           { "weight_kind": "RoleWeight", "quorum": "1", "threshold": [1, 1] },
              "add_member_to_role": { "weight_kind": "RoleWeight", "quorum": "1", "threshold": [1, 1] } } }
        ],
        "default_vote_policy": { "weight_kind": "RoleWeight", "quorum": "1", "threshold": [1, 2] },
        "proposal_bond": "0", "proposal_period": "604800000000000",
        "bounty_bond": "0", "bounty_forgiveness_period": "86400000000000"
    });
    assert_eq!(norm_policy(env.policy(&dao).await), norm_policy(want));
    let cfg = env.view(&dao, "get_config", json!({})).await;
    assert_eq!(cfg["name"], "Lisbon Trip");
    assert_eq!(cfg["metadata"], "");
    assert_eq!(cfg["purpose"], format!("Pot group fund (trip). Rules enforced by {}", env.hub));
    let fi = env.view(&dao, "get_factory_info", json!({})).await;
    assert_eq!(fi["factory_id"], env.hub.as_str());
    // registered with USDC
    let reg = env.view(&env.usdc.clone(), "storage_balance_of", json!({"account_id": dao})).await;
    assert!(!reg.is_null());
    // hub state + events
    let pot = env.pot(&dao).await;
    assert_eq!(pot["status"], "open");
    assert_eq!(pot["name"], "Lisbon Trip");
    assert_eq!(pot["emoji"], "🇵🇹");
    assert_eq!(pot["member_count"], 1);
    assert_eq!(pot["approvals_needed"], 1);
    assert_eq!(pot["rules_version"], 1);
    assert_eq!(pot["rules"], json!({"instant_cap":"100000000","member_budget":"200000000","instant_payees":"members","payee_allowlist":[]}));
    assert_eq!(pot["active_invites"], 1);
    // hub 1.1.0 (wave 4): + rule_extras_set (the new Pot's trust / one-OK / links / goal options)
    assert_eq!(o.event_names(), vec!["pot_created", "rule_extras_set", "invite_added"]);
    let ev = o.event("pot_created");
    assert_eq!(ev["pot"], dao.as_str());
    assert_eq!(ev["creator"], env.maya.id.as_str());
    assert_eq!(ev["preset"], "trip");
    assert_eq!(ev["float"], "50000000000000000000000");
    let inv = env.hub_view("get_invite", json!({"pot": dao, "invite_pk": pk})).await;
    assert_eq!(inv["status"], "active");
    assert_eq!(inv["max_uses"], 10);
    assert_eq!(u(&inv["expires_at_ms"]) - u(&inv["created_at_ms"]), 7 * 86_400_000);
    let pots = env.hub_view("get_pots_of", json!({"account_id": env.maya.id})).await;
    assert_eq!(pots.as_array().unwrap().len(), 1);
    // sponsored: the hub paid (float + registration + state)
    let hub_after = env.hub_free().await;
    let spent = hub_before - hub_after;
    assert!(spent > 51 * MILLI && spent < 70 * MILLI, "hub spent {spent}");
    let cfg = env.hub_view("get_config", json!({})).await;
    assert_eq!(cfg["sponsored_today"], 1);
    assert_eq!(cfg["pot_count"], 1);
    Ok(())
}
dual!(t01_create_happy, t01);

/// T-02: slug rules (and names, emoji, presets) → errors; hub balance not lowered.
async fn t02(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let before = env.hub_free().await;
    let create = |slug: &str, name: &str, preset: &str, emoji: Value| {
        json!({"slug":slug,"name":name,"preset":preset,"rules":null,"invite_pk":null,"emoji":emoji,"float":null})
    };
    for slug in ["Lisbon", "a_b", "a.b", "a--b", "-ab", "ab-", "a", "0123456789abcdef0123456789abcdef0", "lisbon trip"] {
        env.hub_relay(&env.maya, "create_pot", create(slug, "x", "trip", Value::Null), 150).await.expect_err("ERR_SLUG_INVALID");
    }
    for slug in ["admin", "usdc", "demo", "pots", "undefined"] {
        env.hub_relay(&env.maya, "create_pot", create(slug, "x", "trip", Value::Null), 150).await.expect_err("ERR_SLUG_RESERVED");
    }
    for name in ["", "   ", "a\u{202E}b", "a\u{0007}", &"x".repeat(49)] {
        env.hub_relay(&env.maya, "create_pot", create("ok-slug", name, "trip", Value::Null), 150).await.expect_err("ERR_NAME_INVALID");
    }
    for e in ["", "a", "🇵🇹🇵🇹🇵🇹", "\u{200B}"] {
        env.hub_relay(&env.maya, "create_pot", create("ok-slug", "x", "trip", json!(e)), 150).await.expect_err("ERR_EMOJI_INVALID");
    }
    env.hub_relay(&env.maya, "create_pot", create("ok-slug", "x", "custom", Value::Null), 150).await.expect_err("ERR_RULES_INVALID");
    let bad_rules = json!({"instant_cap":"1","member_budget":"1","instant_payees":"members","payee_allowlist":[env.eve.id]});
    env.hub_relay(&env.maya, "create_pot", json!({"slug":"ok-slug","name":"x","preset":"custom","rules":bad_rules,"invite_pk":null,"emoji":null,"float":null}), 150)
        .await
        .expect_err("ERR_RULES_INVALID");
    let hub_dao = format!("x.{}", env.hub);
    let bad_rules = json!({"instant_cap":"1","member_budget":"1","instant_payees":"members_and_allowlist","payee_allowlist":[hub_dao]});
    env.hub_relay(&env.maya, "create_pot", json!({"slug":"ok-slug","name":"x","preset":"custom","rules":bad_rules,"invite_pk":null,"emoji":null,"float":null}), 150)
        .await
        .expect_err("ERR_RULES_INVALID");
    env.hub_relay(&env.maya, "create_pot", json!({"slug":"ok-slug","name":"x","preset":"trip","rules":null,"invite_pk":"secp256k1:99eUso3aSbE9tqGSTXzo3TLfKb9RkMTURrHKQ1K7Zh3BbeqPevr5E1iCbpTjqHuTFLtfxTTD5ekfVuZFzQyEQf8","emoji":null,"float":null}), 150)
        .await
        .expect_err("ERR_INVITE_PK_INVALID");
    // unknown preset → near-sdk deserialization failure
    env.hub_relay(&env.maya, "create_pot", create("ok-slug", "x", "party", Value::Null), 150).await.expect_err("Failed to deserialize");
    assert!(env.hub_free().await >= before, "refused creations never lower the hub's balance");
    // valid boundary: 32-char slug, 48-char name, ZWJ emoji
    let o = env
        .hub_relay(&env.maya, "create_pot", create("0123456789abcdef0123456789abcdef", &"x".repeat(48), "team", json!("👩\u{200D}🚀")), 150)
        .await;
    assert_eq!(o.json()["ok"], true);
    Ok(())
}
dual!(t02_slug_name_rules, t02);

/// T-03: slug taken / pending (incl. a same-block double create).
async fn t03(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (_, o) = env.create_pot(&env.maya, "taken").await;
    assert_eq!(o.json()["ok"], true);
    env.create_pot(&env.sam, "taken").await.1.expect_err("ERR_SLUG_TAKEN");
    // same block: two direct creations with deposits from two accounts
    let args = |s: &str| serde_json::to_vec(&json!({"slug":s,"name":"x","preset":"trip","rules":null,"invite_pk":null,"emoji":null,"float":null})).unwrap();
    let outs = env
        .rpc
        .call_many(vec![
            (env.sam.clone(), env.hub.clone(), "create_pot".into(), args("race"), 150, 70 * MILLI),
            (env.leo.clone(), env.hub.clone(), "create_pot".into(), args("race"), 150, 70 * MILLI),
        ])
        .await?;
    let oks = outs.iter().filter(|o| o.is_ok() && o.json()["ok"] == true).count();
    let taken = outs.iter().filter(|o| o.value.as_ref().err().map(|e| e.contains("ERR_SLUG_TAKEN")).unwrap_or(false)).count();
    assert_eq!((oks, taken), (1, 1), "{:?}", outs.iter().map(|o| o.value.clone().map(|v| String::from_utf8_lossy(&v).to_string())).collect::<Vec<_>>());
    Ok(())
}
dual!(t03_slug_taken, t03);

/// T-04: creation rollback. The hub points at a code hash that was never published, so the
/// creation batch fails (`UseGlobalContract` → GlobalContractDoesNotExist): ok:false, pending
/// cleared, float refunded to the hub, no DAO account, counters released.
async fn t04(build: Build) -> anyhow::Result<()> {
    let other = if build == Build::A { HASH_B } else { HASH_A };
    let env = Env::with(build, HubOpts { code_hash: Some(other.into()), limits: Some(roomy_limits()), ..Default::default() }).await?;
    let before = env.hub_free().await;
    let (dao, o) = env.create_pot(&env.maya, "doomed").await;
    assert_eq!(o.json(), json!({"ok": false, "pot": dao, "reason": "dao_create_failed"}));
    assert!(env.account(&dao).await.is_none(), "no DAO account");
    assert!(env.pot(&dao).await.is_null());
    env.fast_forward(3).await; // the float refund lands after the outcome
    let after = env.hub_free().await;
    assert!(after + MILLI / 100 >= before, "float refunded (before {before}, after {after})");
    assert_eq!(env.hub_view("get_config", json!({})).await["sponsored_today"], 0);
    // pending cleared: the same slug is not TAKEN, it fails the same way again
    let (_, o2) = env.create_pot(&env.maya, "doomed").await;
    assert_eq!(o2.json()["reason"], "dao_create_failed");
    Ok(())
}
dual!(t04_creation_rollback, t04);

/// T-05: creation limits: 4th Pot in a day (direct and sponsored alike), pause, low hub balance.
async fn t05(build: Build) -> anyhow::Result<()> {
    let env = Env::with(build, HubOpts::default()).await?; // default limits: 3 per creator per day
    for i in 0..2 {
        assert_eq!(env.create_pot(&env.maya, &format!("m{i}")).await.1.json()["ok"], true);
    }
    // the 3rd is direct (paid), and counts too
    let o = env
        .hub_call(&env.maya, "create_pot", json!({"slug":"m2","name":"x","preset":"trip","rules":null,"invite_pk":null,"emoji":null,"float":null}), 150, 70 * MILLI)
        .await;
    assert_eq!(o.json()["ok"], true);
    env.create_pot(&env.maya, "m3").await.1.expect_err("ERR_CREATOR_DAILY_LIMIT");
    env.hub_call(&env.maya, "create_pot", json!({"slug":"m3","name":"x","preset":"trip","rules":null,"invite_pk":null,"emoji":null,"float":null}), 150, 70 * MILLI)
        .await
        .expect_err("ERR_CREATOR_DAILY_LIMIT");
    // pause blocks creation
    env.hub_call(&env.owner, "set_config", json!({"patch":{"paused":true}}), 30, 0).await.ok();
    env.create_pot(&env.sam, "s0").await.1.expect_err("ERR_PAUSED");
    env.hub_call(&env.owner, "set_config", json!({"patch":{"paused":false}}), 30, 0).await.ok();
    // low hub balance: a hub whose free balance is under float + registration + 2 NEAR reserve
    let poor = Env::with(build, HubOpts { hub_balance: 6_500 * MILLI, ..Default::default() }).await?;
    poor.create_pot(&poor.maya, "poor").await.1.expect_err("ERR_HUB_LOW_BALANCE");
    Ok(())
}
dual!(t05_creation_limits, t05);

/// T-06: float clamp (float may only lower the default, down to min_dao_float).
async fn t06(build: Build) -> anyhow::Result<()> {
    let env = Env::with(build, HubOpts { dao_float: 100 * MILLI, min_dao_float: 50 * MILLI, limits: Some(roomy_limits()), ..Default::default() }).await?;
    let mk = |slug: &str, f: Value| json!({"slug":slug,"name":"x","preset":"trip","rules":null,"invite_pk":null,"emoji":null,"float":f});
    for (slug, f, want) in [
        ("f-null", Value::Null, 100 * MILLI),
        ("f-low", json!((10 * MILLI).to_string()), 50 * MILLI),
        ("f-high", json!((200 * MILLI).to_string()), 100 * MILLI),
        ("f-mid", json!((70 * MILLI).to_string()), 70 * MILLI),
    ] {
        let o = env.hub_relay(&env.maya, "create_pot", mk(slug, f), 150).await;
        assert_eq!(u(&o.json()["float"]), want, "{slug}");
        let pot = env.pot(&env.dao_id(slug)).await;
        assert_eq!(u(&pot["float"]), want);
        let a = env.account(&env.dao_id(slug)).await.unwrap().amount.as_yoctonear();
        assert!(a >= want && a < want + MILLI, "{slug}: dao balance {a}");
    }
    Ok(())
}
dual!(t06_float_clamp, t06);

/// T-89 ★ (create cases): direct without deposit → ERR_DEPOSIT_REQUIRED, hub unchanged; with
/// 0.07 NEAR → created, excess refunded, hub balance not lower; relayed → sponsored.
async fn t89_create(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let args = |slug: &str| json!({"slug":slug,"name":"x","preset":"trip","rules":null,"invite_pk":null,"emoji":null,"float":null});
    let h0 = env.hub_free().await;
    let e = env.hub_call(&env.eve, "create_pot", args("eve-1"), 150, 0).await.err();
    assert!(e.contains("ERR_DEPOSIT_REQUIRED"), "{e}");
    let required: u128 = e.split("ERR_DEPOSIT_REQUIRED: ").nth(1).unwrap().chars().take_while(|c| c.is_ascii_digit()).collect::<String>().parse()?;
    assert!(required > 51 * MILLI && required <= 70 * MILLI, "cost(create) = {required}");
    env.hub_call(&env.eve, "create_pot", args("eve-1"), 150, required - 1).await.expect_err("ERR_DEPOSIT_REQUIRED");
    assert!(env.hub_free().await >= h0, "refused direct calls never lower the hub's balance");
    // direct with the documented 0.07 NEAR: created, excess refunded, hub not poorer
    let eve0 = env.balance(&env.eve.id).await;
    let h1 = env.hub_free().await;
    let o = env.hub_call(&env.eve, "create_pot", args("eve-1"), 150, 70 * MILLI).await;
    assert_eq!(o.json()["ok"], true);
    env.fast_forward(3).await;
    let h2 = env.hub_free().await;
    assert!(h2 >= h1, "direct creation must not lower the hub's free balance ({h1} → {h2})");
    let eve_paid = eve0 - env.balance(&env.eve.id).await;
    assert!(eve_paid >= required && eve_paid < required + 10 * MILLI, "eve paid {eve_paid} (cost {required} + gas)");
    assert_eq!(env.hub_view("get_config", json!({})).await["sponsored_today"], 0, "direct creations are not sponsored");
    // relayed → sponsored (0 deposit), hub pays
    let o = env.hub_relay(&env.eve, "create_pot", args("eve-2"), 150).await;
    assert_eq!(o.json()["ok"], true);
    assert!(env.hub_free().await < h2);
    assert_eq!(env.hub_view("get_config", json!({})).await["sponsored_today"], 1);
    // a sole member who created a Pot directly can withdraw at most what they paid: the DAO holds
    // exactly the float (no other NEAR path), and a Transfer of NEAR needs the DAO's own balance.
    let dao = env.dao_id("eve-1");
    let a = env.account(&dao).await.unwrap().amount.as_yoctonear();
    assert!(a < required, "DAO NEAR {a} ≤ what eve paid {required}");
    // store_blob by a non-member: Sputnik charges (len + 32) B but stores more, so each call eats
    // a little of the DAO's float (review-security M-4; measured here, not fixable in the hub)
    let blob = vec![7u8; 1000];
    let before = env.account(&dao).await.unwrap();
    let o = env.rpc.call(&env.sam, &dao, "store_blob", blob, 50, (1000 + 32) * 10u128.pow(19)).await?;
    if o.is_ok() {
        let after = env.account(&dao).await.unwrap();
        let grew = after.storage_usage as i128 - before.storage_usage as i128;
        let paid = (after.amount.as_yoctonear() as i128 - before.amount.as_yoctonear() as i128) / 10i128.pow(19);
        println!("[{build:?}] T-89 store_blob(1000 B) by a non-member: DAO storage +{grew} B, deposit kept {paid} B-equiv → float eaten ≈ {} B", grew - paid);
    } else {
        println!("[{build:?}] T-89 store_blob refused: {}", o.err());
    }
    Ok(())
}
dual!(t89_sponsorship_create, t89_create);

/// T-90: creation caps: the global sponsored cap (3 in this config) → ERR_GLOBAL_DAILY_LIMIT for
/// a 4th sponsored creation by a 4th creator; a direct paid creation still succeeds and does not
/// count. (The UTC-midnight reset is a unit test: the sandbox advances ≈ 0.3 s per block.)
async fn t90(build: Build) -> anyhow::Result<()> {
    let mut limits = roomy_limits();
    limits["max_sponsored_pots_per_day"] = json!(3);
    let env = Env::with(build, HubOpts { limits: Some(limits), ..Default::default() }).await?;
    for (who, slug) in [(&env.maya, "g1"), (&env.sam, "g2"), (&env.leo, "g3")] {
        assert_eq!(env.create_pot(who, slug).await.1.json()["ok"], true);
    }
    env.create_pot(&env.ana, "g4").await.1.expect_err("ERR_GLOBAL_DAILY_LIMIT");
    let o = env
        .hub_call(&env.ana, "create_pot", json!({"slug":"g4","name":"x","preset":"trip","rules":null,"invite_pk":null,"emoji":null,"float":null}), 150, 70 * MILLI)
        .await;
    assert_eq!(o.json()["ok"], true);
    assert_eq!(env.hub_view("get_config", json!({})).await["sponsored_today"], 3);
    Ok(())
}
dual!(t90_creation_caps, t90);
