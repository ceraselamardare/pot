//! C-10: invites + join (D-08). T-50…T-57, T-93 — builds A and B.
//! (T-55 "closing → ERR_POT_NOT_OPEN" is asserted in t_close.rs.)

use pot_tests::*;
use serde_json::json;

/// T-50 ★ join · T-51 bad signatures · T-52 front-run / replay · T-57 (sandbox side).
async fn t50(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (sk, pk) = Env::invite_key();
    let (dao, o) = env.create_pot_with(&env.maya, "join", "trip", serde_json::Value::Null, Some(pk.clone())).await;
    assert_eq!(o.json()["ok"], true);

    // T-51: signed for another account / another Pot / with a wrong key / malformed → BAD_SIGNATURE
    let for_sam = Env::join_sig(&sk, &dao, &env.sam.id);
    env.hub_relay(&env.leo, "join", json!({"pot": dao, "invite_pk": pk, "signature": for_sam}), 100).await.expect_err("ERR_BAD_SIGNATURE");
    let other_pot: near_workspaces::AccountId = format!("other.{}", env.hub).parse()?;
    let for_other = Env::join_sig(&sk, &other_pot, &env.leo.id);
    env.hub_relay(&env.leo, "join", json!({"pot": dao, "invite_pk": pk, "signature": for_other}), 100).await.expect_err("ERR_BAD_SIGNATURE");
    let (wrong, _) = Env::invite_key();
    let by_wrong = Env::join_sig(&wrong, &dao, &env.leo.id);
    env.hub_relay(&env.leo, "join", json!({"pot": dao, "invite_pk": pk, "signature": by_wrong}), 100).await.expect_err("ERR_BAD_SIGNATURE");
    env.hub_relay(&env.leo, "join", json!({"pot": dao, "invite_pk": pk, "signature": "AAAA"}), 100).await.expect_err("ERR_BAD_SIGNATURE");
    // T-52: front-run — eve submits leo's signature from her own account
    let for_leo = Env::join_sig(&sk, &dao, &env.leo.id);
    env.hub_relay(&env.eve, "join", json!({"pot": dao, "invite_pk": pk, "signature": for_leo}), 100).await.expect_err("ERR_BAD_SIGNATURE");

    // T-50 ★
    let o = env.hub_relay(&env.leo, "join", json!({"pot": dao, "invite_pk": pk, "signature": for_leo}), 100).await;
    let v = o.json();
    assert_eq!((v["ok"].as_bool(), v["status"].as_str()), (Some(true), Some("active")));
    let pid = v["proposal_id"].as_u64().unwrap();
    assert_eq!(o.event_names(), vec!["member_joined"]);
    assert_eq!(o.event("member_joined"), json!({"pot": dao, "member": env.leo.id, "proposal_id": pid, "invite_pk": pk}));
    let prop = env.proposal(&dao, pid).await;
    assert_eq!(prop["status"], "Approved");
    // T-57 (sandbox side): the only kind the hub proposes for a join
    assert_eq!(prop["kind"], json!({"AddMemberToRole": {"member_id": env.leo.id, "role": "member"}}));
    assert_eq!(prop["description"], "Pot join via invite");
    let group = env.policy(&dao).await["roles"].as_array().unwrap().iter().find(|r| r["name"] == "member").unwrap()["kind"]["Group"].clone();
    assert!(group.as_array().unwrap().iter().any(|a| a == env.leo.id.as_str()));
    let inv = env.hub_view("get_invite", json!({"pot": dao, "invite_pk": pk})).await;
    assert_eq!(inv["uses"], 1);
    let pot = env.pot(&dao).await;
    assert_eq!((pot["member_count"].as_u64(), pot["joining_count"].as_u64(), pot["approvals_needed"].as_u64()), (Some(2), Some(0), Some(2)));
    let pots = env.hub_view("get_pots_of", json!({"account_id": env.leo.id})).await;
    assert_eq!(pots[0]["pot"], dao.as_str());
    let m = env.member(&dao, &env.leo.id).await;
    assert_eq!((m["status"].as_str(), m["join_index"].as_u64()), (Some("active"), Some(1)));
    let s = env.hub_view("get_proposal_subject", json!({"pot": dao, "proposal_id": pid})).await;
    assert_eq!((s["kind"].as_str(), s["member"].as_str(), s["live"].as_bool()), (Some("join"), Some(env.leo.id.as_str()), Some(false)));
    println!("[{build:?}] T-50 join chain: {:.2} Tgas burnt", o.total_gas_burnt() as f64 / 1e12);
    // T-52: replay after success → ALREADY_MEMBER
    env.hub_relay(&env.leo, "join", json!({"pot": dao, "invite_pk": pk, "signature": for_leo}), 100).await.expect_err("ERR_ALREADY_MEMBER");
    // the creator can't join their own Pot
    let for_maya = Env::join_sig(&sk, &dao, &env.maya.id);
    env.hub_relay(&env.maya, "join", json!({"pot": dao, "invite_pk": pk, "signature": for_maya}), 100).await.expect_err("ERR_ALREADY_MEMBER");
    Ok(())
}
dual!(t50_join, t50);

/// T-53 invite states · T-54 same-block double join · T-55 full · T-56 invite admin · T-93.
async fn t53(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (dao, o) = env.create_pot(&env.maya, "inv").await;
    assert_eq!(o.json()["ok"], true);
    let now = |v: &serde_json::Value| u(&v["created_at_ms"]);

    // T-93: add_invite defaults and bounds
    let (_sk1, pk1) = Env::invite_key();
    let v = env.hub_relay(&env.maya, "add_invite", json!({"pot": dao, "invite_pk": pk1, "expires_at_ms": null, "max_uses": null}), 30).await.json();
    assert_eq!((v["max_uses"].as_u64(), v["status"].as_str(), v["uses"].as_u64()), (Some(10), Some("active"), Some(0)));
    assert_eq!(u(&v["expires_at_ms"]) - now(&v), 7 * 86_400_000);
    let t = now(&v);
    let (_, pk2) = Env::invite_key();
    env.hub_relay(&env.maya, "add_invite", json!({"pot": dao, "invite_pk": pk2, "expires_at_ms": t + 31 * 86_400_000u128, "max_uses": null}), 30).await.expect_err("ERR_INVITE_EXPIRY_INVALID");
    env.hub_relay(&env.maya, "add_invite", json!({"pot": dao, "invite_pk": pk2, "expires_at_ms": t, "max_uses": null}), 30).await.expect_err("ERR_INVITE_EXPIRY_INVALID");
    env.hub_relay(&env.maya, "add_invite", json!({"pot": dao, "invite_pk": pk2, "expires_at_ms": null, "max_uses": 41}), 30).await.expect_err("ERR_INVITE_MAX_USES_INVALID");
    env.hub_relay(&env.maya, "add_invite", json!({"pot": dao, "invite_pk": pk2, "expires_at_ms": null, "max_uses": 0}), 30).await.expect_err("ERR_INVITE_MAX_USES_INVALID");
    env.hub_relay(&env.maya, "add_invite", json!({"pot": dao, "invite_pk": pk1, "expires_at_ms": null, "max_uses": null}), 30).await.expect_err("ERR_INVITE_EXISTS");
    let o = env.hub_relay(&env.maya, "add_invite", json!({"pot": dao, "invite_pk": pk2, "expires_at_ms": null, "max_uses": 40}), 30).await;
    assert_eq!(o.json()["max_uses"], 40);
    assert_eq!(o.event("invite_added")["by"], env.maya.id.as_str());

    // T-53 used-up (max_uses 1)
    let (sk3, pk3) = Env::invite_key();
    env.hub_relay(&env.maya, "add_invite", json!({"pot": dao, "invite_pk": pk3, "expires_at_ms": null, "max_uses": 1}), 30).await.ok();
    assert_eq!(env.join(&env.sam, &dao, &sk3, &pk3).await.json()["status"], "active");
    env.join(&env.leo, &dao, &sk3, &pk3).await.expect_err("ERR_INVITE_USED_UP");
    assert_eq!(env.hub_view("get_invite", json!({"pot": dao, "invite_pk": pk3})).await["status"], "used_up");
    // T-53 revoked (any member may revoke; the record is kept)
    let (sk4, pk4) = Env::invite_key();
    env.hub_relay(&env.maya, "add_invite", json!({"pot": dao, "invite_pk": pk4, "expires_at_ms": null, "max_uses": null}), 30).await.ok();
    let o = env.hub_relay(&env.sam, "revoke_invite", json!({"pot": dao, "invite_pk": pk4}), 30).await;
    o.ok();
    assert_eq!(o.event("invite_revoked"), json!({"pot": dao, "invite_pk": pk4, "by": env.sam.id}));
    env.hub_relay(&env.sam, "revoke_invite", json!({"pot": dao, "invite_pk": pk4}), 30).await.expect_err("ERR_INVITE_REVOKED");
    env.join(&env.leo, &dao, &sk4, &pk4).await.expect_err("ERR_INVITE_REVOKED");
    let iv = env.hub_view("get_invite", json!({"pot": dao, "invite_pk": pk4})).await;
    assert_eq!((iv["status"].as_str(), iv["revoked"].as_bool()), (Some("revoked"), Some(true)));
    // T-53 expired: the shortest allowed expiry (> now + 60 s), then advance block time.
    // (7-day expiry itself can't be fast-forwarded: the sandbox moves ≈ 0.3 s per block.)
    let (sk5, pk5) = Env::invite_key();
    let o = env.hub_relay(&env.maya, "add_invite", json!({"pot": dao, "invite_pk": pk5, "expires_at_ms": t + 3_600_000u128, "max_uses": null}), 30).await;
    let created = now(&o.json());
    let (sk6, pk6) = Env::invite_key();
    env.hub_relay(&env.maya, "add_invite", json!({"pot": dao, "invite_pk": pk6, "expires_at_ms": created + 62_000, "max_uses": null}), 30).await.ok();
    env.fast_forward(260).await; // ≥ 62 s of block time
    env.join(&env.leo, &dao, &sk6, &pk6).await.expect_err("ERR_INVITE_EXPIRED");
    assert_eq!(env.hub_view("get_invite", json!({"pot": dao, "invite_pk": pk6})).await["status"], "expired");
    assert!(env.hub_view("get_invite", json!({"pot": dao, "invite_pk": Env::invite_key().1})).await.is_null());

    // T-54 same-block double join by the same account → the 2nd is ALREADY_MEMBER
    let sig = Env::join_sig(&sk5, &dao, &env.leo.id);
    let a = serde_json::to_vec(&json!({"pot": dao, "invite_pk": pk5, "signature": sig}))?;
    let outs = env
        .rpc
        .call_many(vec![
            (env.leo.clone(), env.hub.clone(), "join".into(), a.clone(), 100, 20 * MILLI),
            (env.leo.clone(), env.hub.clone(), "join".into(), a, 100, 20 * MILLI),
        ])
        .await?;
    let joined = outs.iter().filter(|o| o.is_ok() && o.json()["status"] == "active").count();
    let dup = outs.iter().filter(|o| o.value.as_ref().err().map(|e| e.contains("ERR_ALREADY_MEMBER")).unwrap_or(false)).count();
    assert_eq!((joined, dup), (1, 1));
    assert_eq!(env.hub_view("get_invite", json!({"pot": dao, "invite_pk": pk5})).await["uses"], 1);

    // T-56 invite admin: non-member add/revoke → NOT_MEMBER; 21st active → TOO_MANY_INVITES
    let (_, pkx) = Env::invite_key();
    env.hub_relay(&env.eve, "add_invite", json!({"pot": dao, "invite_pk": pkx, "expires_at_ms": null, "max_uses": null}), 30).await.expect_err("ERR_NOT_MEMBER");
    env.hub_relay(&env.eve, "revoke_invite", json!({"pot": dao, "invite_pk": pk1}), 30).await.expect_err("ERR_NOT_MEMBER");
    let active = env.pot(&dao).await["active_invites"].as_u64().unwrap();
    for _ in active..20 {
        let (_, p) = Env::invite_key();
        env.hub_relay(&env.maya, "add_invite", json!({"pot": dao, "invite_pk": p, "expires_at_ms": null, "max_uses": null}), 30).await.ok();
    }
    assert_eq!(env.pot(&dao).await["active_invites"], 20);
    env.hub_relay(&env.maya, "add_invite", json!({"pot": dao, "invite_pk": pkx, "expires_at_ms": null, "max_uses": null}), 30).await.expect_err("ERR_TOO_MANY_INVITES");

    // T-55 full: with max_members = 3 (set_config; 40 is exercised in t_close40)
    let mut limits = roomy_limits();
    limits["max_members"] = json!(3);
    env.hub_call(&env.owner, "set_config", json!({"patch": {"limits": limits}}), 30, 0).await.ok();
    assert_eq!(env.pot(&dao).await["member_count"], 3);
    env.join(&env.ana, &dao, &sk5, &pk5).await.expect_err("ERR_POT_FULL");
    Ok(())
}
dual!(t53_invite_states, t53);

/// T-55 (pot full) + T-93 (create-time invite: 10 uses; the 11th join → USED_UP).
async fn t93(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    let (sk, pk) = Env::invite_key();
    let (dao, o) = env.create_pot_with(&env.maya, "ten", "trip", serde_json::Value::Null, Some(pk.clone())).await;
    assert_eq!(o.json()["ok"], true);
    let inv = env.hub_view("get_invite", json!({"pot": dao, "invite_pk": pk})).await;
    assert_eq!((inv["max_uses"].as_u64(), u(&inv["expires_at_ms"]) - u(&inv["created_at_ms"])), (Some(10), 7 * 86_400_000));
    for i in 0..10 {
        let a = env.new_actor(&format!("j{i}"), 2 * NEAR).await?;
        assert_eq!(env.join(&a, &dao, &sk, &pk).await.json()["status"], "active", "joiner {i}");
    }
    let extra = env.new_actor("j10", 2 * NEAR).await?;
    env.join(&extra, &dao, &sk, &pk).await.expect_err("ERR_INVITE_USED_UP");
    // T-55: Pot full at max_members (11 members now; cap it at 11)
    let mut limits = roomy_limits();
    limits["max_members"] = json!(11);
    env.hub_call(&env.owner, "set_config", json!({"patch": {"limits": limits}}), 30, 0).await.ok();
    let (sk2, pk2) = Env::invite_key();
    env.hub_relay(&env.maya, "add_invite", json!({"pot": dao, "invite_pk": pk2, "expires_at_ms": null, "max_uses": null}), 30).await.ok();
    env.join(&extra, &dao, &sk2, &pk2).await.expect_err("ERR_POT_FULL");
    assert_eq!(env.pot(&dao).await["member_count"], 11);
    assert_eq!(env.pot(&dao).await["approvals_needed"], 6);
    Ok(())
}
dual!(t93_invite_uses_and_full, t93);
