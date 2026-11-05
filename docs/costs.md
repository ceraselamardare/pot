# Costs and sustainability

Testnet NEAR, from the calibration notes (✅ measured, ⚠️ estimated). Gas price is 1e8 yocto/gas.

| Who pays | Item | NEAR |
|---|---|---|
| relayer | onboarding a person (account + token registration + gas) | 0.0085 ✅ |
| hub | a new Pot: DAO float 0.05 + token registration + hub state | ≈ 0.061 ⚠️ |
| hub + relayer | a join | ≈ 0.009 + 0.002 ⚠️ |
| relayer | adding money | ≈ 0.0011 ✅ |
| hub + relayer | an instant spend (storage prepay + gas) | ≈ 0.0085 + 0.003 ⚠️ |
| hub + relayer | a vote spend with 2 votes and the follow-up `sync` | ≈ 0.0115 + 0.0033 ⚠️ |
| hub + relayer | a close for 3 members | ≈ 0.017 + 0.0033 ⚠️ |

A whole trip (3 people onboarded, 1 Pot, 2 joins, 3 contributions, 1 instant spend, 1 vote spend, 1 close) is
≈ 0.17 NEAR, of which ≈ 0.12 is storage staked in the DAO and the hub. Costs grow with actions, not balances, and
are capped on chain (Pots per creator per day, sponsored Pots per day, members, open requests) and by the relayer's
daily budgets. Two ways to pay for it without new contracts: a small app fee on cross-chain deposits through
1Click's app fees, and paid plans for clubs and teams.
