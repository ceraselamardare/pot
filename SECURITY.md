# Security

Pot moves group money, so this page states plainly what protects it, what we trust, and what is still open.
It is **testnet software**: test dollars, test NEAR, and a hub contract that is still upgradeable on purpose.

- Full audit: [notes/security-audit-2026-11-04.md](notes/security-audit-2026-11-04.md).
- What we fixed afterwards, and how each fix is tested: [Fixes since the audit](#fixes-since-the-audit) below.
- Reporting a problem: open a GitHub issue without exploit details and ask for a private channel. If you are
  reporting a public pay-in page, use the "Report this page" link on that page.

## Trust model

| Party | What it can do | What stops it doing more |
|---|---|---|
| **Pot members (a majority)** | Approve any spend that goes to a vote, change the rules, close the Pot | In new Pots (policy v3), members can only vote on proposals the hub files. They cannot file raw DAO proposals (transfers, policy changes, new members, code calls). Every money move therefore appears in the app, where everyone can see it and vote on it. |
| **One member** | Spend within the rules on their own: instant spends up to the cap and the member budget. With one OK from someone else, a bigger spend up to the one-OK ceiling. | The hub checks every rule on chain. An instant or one-OK spend needs the requester to have added at least $1. The person giving the OK must be someone else who joined before the request and has also added at least $1, and must not be the one receiving the money. Each member's one-OK spending has a lifetime cap. |
| **The Pot Hub (`pots.<root>`)** | Holds the 1-of-1 "rulebot" seat in every Pot, so it files and auto-approves the spends the rules allow | Its code is public and its decisions are tested (unit, property, sandbox tests). **Testnet stage:** the hub still has an owner key and can be redeployed, and Pots accept code updates from it. This is deliberate while we iterate; the plan is to lock the hub (delete its keys) before any real money. |
| **Our relayer (server)** | Pays gas for the actions people sign | It is not trusted with money. It can only forward one allowlisted function call per signed delegate, to the hub, the token or a Pot. Deposits and gas are exact. Arguments are checked key by key. It can't make up an action, because people sign every action in their own browser. |
| **The web app** | Shows balances and builds the actions people sign | A strict Content-Security-Policy with no `eval` and a short `connect-src` allowlist, so an injected script can't send a signed action to anyone else's relayer. The Approve screen shows who gets the money before you vote. Public pages say they were made by a user, not by Pot, and have a Report link. |
| **Token (test USDC)** | — | No keys and no mint method. The hub accepts money only from this token. |

## What protects the money

- **Rules on chain, not in the server.** The hub decides whether a spend is instant, needs one OK or needs a group
  vote (`contracts/pot-hub/src/lib.rs`, `security.rs`). The app only shows what the hub would decide.
- **No credit before the money arrives.** Contributions and gifts are recorded only in the callback after the
  token transfer to the Pot has succeeded. Every callback is `#[private]`.
- **A close isn't done until the money has left.** Sputnik reports a close as `Approved` before its payout settles.
  The hub keeps the Pot "settling" until the Pot's balance shows the money has gone out. A failed payout
  stays retryable and is never shown as refunded.
- **Two rounds of review.** The six-reviewer audit and then an independent review of the fixes themselves, whose
  findings are fixed too. The contracts have unit, token and sandbox tests, run on two Sputnik builds.
- **Pro-rata math** is overflow-safe and the shares add up exactly.
- **Sign-in:** NEAR Auth tokens are checked for issuer, audience, nonce and device binding. Wallet sign-in
  signatures must be addressed to this deployment's own host. Sessions are `__Host-` HttpOnly cookies, stored
  hashed and bound to the browser.
- **Abuse limits:** per-account, per-IP and new-account quotas. Global caps are sized to the sponsor balances, and
  a guard refuses work when the relayer or hub is running low instead of draining them.

## Fixes since the audit

| Audit ID | Problem | Fix | Proof |
|---|---|---|---|
| HUB-1, GOV-2, GOV-3, GOV-4, W4-7, GOV-9 | A creator alone, or fake accounts invited in, could file raw DAO proposals: add alts, change the policy, transfer everything | New Pots get policy v3 (v4 with a funding goal): members can only vote; only the hub files proposals | `t_security::hub_1_gov_2_raw_proposals_refused`, `unit_security::hub_1_*` |
| W4-1, HUB-2 | Two fake accounts could loop one-OK spends; a $0.000001 contribution unlocked instant spends | $1 stake; the OK-giver rules above; a lifetime one-OK allowance per member, checked again at OK time | `t_security::w4_1_hub_2_one_ok_sybils`, `unit_security::w4_1_*`, `hub_2_*` |
| HUB-4, HUB-6 | A close counted as done on Sputnik's provisional `Approved`; an old failed close could be finalized later | "Settling" until the money has left; only the hub retries, and only the Pot's current close | `t_close` T-92, `unit_security::hub_4_*`, `hub_6_*` |
| W4-5, W4-8 | Unfunded links blocked the close; tiny links farmed the hub's NEAR | Only links that hold or may be moving money block the close; $1 minimum per link | `t_security::w4_5_w4_8_links_and_the_close` |
| Review M-1, M-2, L-1, L-2, L-5 (second, independent review of the fixes) | Link money in transit at close time could be left out of the split; money sent straight to a Pot after its payout could keep it "settling"; edge cases around re-OKs, rules changes and failed close attempts | Approved-but-unfunded links block the close; a close is confirmed once the money has left or after 10 blocks; a new `propose_sweep` pays out leftovers in a closed Pot (members approve it); the OK is re-checked in the callback | `unit_security::m_1_*`, `m_2_*`, `l_1_*`, `l_2_*`, `l_5_*`; `t_security::m_2_sweep_after_close` |
| CLI-1, APP-5 | No script restrictions | CSP with no `unsafe-eval` and a `connect-src` allowlist (`apps/web/lib/security/csp.ts`) | `e2e/mock/csp.spec.ts` (0 violations across every page and the wallet picker) |
| CLI-3 | The vote screen didn't show who gets the money | A "Goes to" block, a "Not in this Pot" badge, and duplicate names told apart | `e2e/mock/security.spec.ts` |
| CLI-4 | Public pay pages could pass as official | "Made by people who use Pot" notice, Report link, reserved names enforced on the server | `e2e/mock/security.spec.ts`, `reserved-names.test.ts` |
| CLI-6, CLI-7, CLI-9, CLI-10, GOV-7 | Link secrets kept after sign-out; invite secret left in the URL; CSV formula injection; deposit address shape; server-chosen account keys | Cleared on sign-out; stripped from the URL; hardened guard; shape check; the client checks the new account's key list | unit tests next to each file |
| CLI-8 | Next.js behind a security release | 16.4.5 | — |
| APP-1, APP-2, HUB-5 | Fake accounts could exhaust sponsor budgets; USDC registration paid at every sign-in; one unregistered payee blocks a close | Per-IP and new-account quotas, sponsor-balance guard, lazy registration, a separate close-payee budget, payees registered before every close vote | `server/relay/pipeline-security.test.ts` |
| APP-3, APP-7, APP-8, APP-9, APP-4 (part) | Weak defaults outside production; previews accepting production sign-ins; delivery without a network guard; header trust, a nonce race | Fail closed; sign-ins bound to the host; a guard at the delivery boundary; a unique index for in-flight nonces; sessions bound to the browser | server unit tests |

## Known limitations (open)

- **Testnet stage (by design):**
  - The hub's owner key can redeploy the hub, and Pots accept the hub's code updates. Before mainnet: lock the hub,
    turn off DAO auto-update, keep custody keys off developer machines, and give each environment its own
    low-balance relayer. (GOV-1, GOV-5, GOV-6, GOV-8)
  - **Older Pots (policy v1/v2)** keep their old policy: there, members can still file raw DAO proposals.
- **Invites are trust.** An invite link is a bearer pass that expires after 7 days and 10 joins by default, and a
  Pot holds at most 40 members.
  - Whoever gathers a majority of members can approve a group-vote spend. The vote now happens in the app, where
    everyone sees it, but it is still a vote. (GOV-2 residual)
  - Per-member limits multiply with every extra account. Someone who invites their own alts, each adding $1, can
    spend each alt's member budget and one-OK allowance without a vote. Members can see every join and every spend
    as it happens. (Independent review M-3)
  - Tying unvoted spending to what each member has put in would close this, but it changes how Pot feels to use,
    so it is a product decision we haven't made.
- **The device key is full-access** and signs without a prompt. Signing out does not delete it on chain.
  (CLI-1 second half, CLI-2)
- **The close payout is one batch.** A payee who can never receive (a blocklisted address on mainnet) fails the
  whole close; pull-based payouts would fix it. (HUB-5, W4-6)
- **Refunds are pro rata to lifetime contributions,** so a large late contribution captures a share of gifts.
  (HUB-3, W4-2)
- **No minority exit.** A deadlocked group can't get its money out without a majority. (GOV-11)
- The leftover sweep (`propose_sweep`) is on chain, but the app doesn't show it yet.
- A pay-in link stuck mid-claim has no timed cleanup yet. Escrow totals aren't tracked separately, which matters
  only around an upgrade. (W4-3, W4-4)
