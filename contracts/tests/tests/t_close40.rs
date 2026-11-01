//! C-17 (T-73): close gas at n = 30 and n = 40 contributors, binary search on the deciding vote's
//! prepaid gas; plus T-97's "a contested 40-vote proposal never draws on the float" (prepay
//! covers member_count votes). Builds A and B.

use pot_tests::*;
use serde_json::json;

/// Binary-searches the gas of `voter`'s deciding VoteApprove on close `pid` (a vote with too
/// little gas fails as a whole and is not recorded, so retrying is safe).
async fn deciding_vote(env: &Env, dao: &near_workspaces::AccountId, pid: u64, voter: &Actor, start: u64) -> (u64, Outcome) {
    // upward scan in 5 Tgas steps: a failed deciding vote is not recorded, so retrying is safe
    let mut g = start;
    loop {
        assert!(g <= 300, "no deciding vote ≤ 300 Tgas executed the close");
        let o = env.vote(voter, dao, pid, "VoteApprove", g).await;
        let status = env.proposal(dao, pid).await["status"].as_str().unwrap().to_string();
        if status == "Approved" {
            return (g, o);
        }
        assert_eq!(status, "InProgress", "a failed deciding vote is not recorded");
        g += 5;
    }
}

async fn big_pot(env: &Env, slug: &str, joiners: &[Actor], each: u128) -> near_workspaces::AccountId {
    let (dao, o) = env.create_pot(&env.maya, slug).await;
    assert_eq!(o.json()["ok"], true);
    let (sk, pk) = Env::invite_key();
    env.hub_relay(&env.maya, "add_invite", json!({"pot": dao, "invite_pk": pk, "expires_at_ms": null, "max_uses": 40}), 30).await.ok();
    for a in joiners {
        assert_eq!(env.join(a, &dao, &sk, &pk).await.json()["status"], "active", "{}", a.id);
    }
    env.contribute(&env.maya, &dao, each).await;
    for a in joiners {
        assert_eq!(env.contribute(a, &dao, each).await.json(), json!(each.to_string()));
    }
    dao
}

async fn close_gas(build: Build) -> anyhow::Result<()> {
    let env = Env::new(build).await?;
    // 39 extra members (registered, funded)
    let mut joiners = vec![];
    for i in 0..39 {
        let a = env.new_actor(&format!("m{i:02}"), 3 * NEAR).await?;
        env.register(&a.id).await?;
        env.fund(&a, 20 * USDC).await?;
        joiners.push(a);
    }
    for (n, slug) in [(30usize, "thirty"), (40usize, "forty")] {
        let dao = big_pot(&env, slug, &joiners[..n - 1], 10 * USDC).await;
        let pot = env.pot(&dao).await;
        assert_eq!((pot["member_count"].as_u64(), pot["approvals_needed"].as_u64()), (Some(n as u64), Some(n as u64 / 2 + 1)));

        if n == 40 {
            // T-97: a contested vote with all 40 votes cast never draws on the float
            let before = env.account(&dao).await.unwrap();
            let v = env.request_spend(&env.maya, &dao, 101 * USDC, &env.maya.id, "contest01").await.json();
            let pid = v["proposal_id"].as_u64().unwrap();
            let after_prepay = env.account(&dao).await.unwrap();
            let mut all = vec![env.maya.clone()];
            all.extend(joiners.iter().cloned());
            for (i, a) in all.iter().enumerate() {
                let action = if i % 2 == 0 { "VoteApprove" } else { "VoteReject" };
                env.vote(a, &dao, pid, action, 100).await.ok();
            }
            assert_eq!(env.proposal(&dao, pid).await["status"], "InProgress", "20 vs 20: undecided");
            let after = env.account(&dao).await.unwrap();
            let prepaid = after_prepay.amount.as_yoctonear() - before.amount.as_yoctonear();
            let grew = (after.storage_usage - before.storage_usage) as u128 * 10u128.pow(19);
            println!("[{build:?}] T-97 40 votes: DAO storage +{} B, prepay {} B-equiv", after.storage_usage - before.storage_usage, prepaid / 10u128.pow(19));
            assert!(prepaid >= grew, "prepay {prepaid} < growth {grew}: the float would be drawn");
            // it expires undecided; for the close below it must not be open-ended: reject it out
            env.wait_busy_window().await;
        }

        env.wait_busy_window().await;
        let before = env.account(&dao).await.unwrap();
        let o = env.hub_relay(&env.maya, "propose_close", json!({"pot": dao}), 150).await;
        let v = o.json();
        assert_eq!(v["ok"], true, "{v}");
        let pid = v["proposal_id"].as_u64().unwrap();
        let balance = env.ft_balance(&dao).await;
        assert_eq!(v["payouts"].as_array().unwrap().len(), n);
        let prop = env.proposal(&dao, pid).await;
        assert_eq!(prop["kind"]["FunctionCall"]["actions"].as_array().unwrap().len(), n);
        println!(
            "[{build:?}] T-73 n={n}: propose_close {:.2} Tgas burnt, close_proposed event {} B",
            o.total_gas_burnt() as f64 / 1e12,
            o.logs().iter().find(|l| l.contains("close_proposed")).map(|l| l.len()).unwrap_or(0)
        );
        let after_prepay = env.account(&dao).await.unwrap();
        // approvals_needed − 1 non-deciding approvals, then binary-search the deciding vote's gas
        let need = n / 2 + 1;
        let mut voters = vec![env.maya.clone()];
        voters.extend(joiners.iter().cloned());
        for a in &voters[..need - 1] {
            env.vote(a, &dao, pid, "VoteApprove", 300).await.ok();
        }
        let (min, exec) = deciding_vote(&env, &dao, pid, &voters[need - 1], if n == 30 { 150 } else { 200 }).await;
        let burnt = exec.total_gas_burnt();
        println!(
            "[{build:?}] T-73 n={n}: deciding vote: min prepaid {min} Tgas (5 Tgas steps) (formula 15 + 5.4·n = {:.0}); burnt {:.2} Tgas",
            15.0 + 5.4 * n as f64,
            burnt as f64 / 1e12
        );
        assert!(min <= 300, "a 300 Tgas vote must execute the close at n = {n}");
        assert_eq!(env.ft_balance(&dao).await, 0, "Σ payouts == balance {balance}");
        let after = env.account(&dao).await.unwrap();
        let prepaid = after_prepay.amount.as_yoctonear() - before.amount.as_yoctonear();
        let grew = (after.storage_usage - before.storage_usage) as u128 * 10u128.pow(19);
        println!("[{build:?}] T-73 n={n}: DAO storage +{} B (proposal + {} votes), prepay {} B-equiv", after.storage_usage - before.storage_usage, need, prepaid / 10u128.pow(19));
        assert!(prepaid >= grew);
        assert_eq!(env.sync(&dao, pid).await.json()["hub_status"], "closed");
        for a in joiners.iter().take(n - 1) {
            assert!(env.ft_balance(&a.id).await >= 10 * USDC - 1);
        }
    }
    Ok(())
}
dual!(c17_close_gas_30_40, close_gas);
