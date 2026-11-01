# Trezu (and NEAR Business): DAO visibility, testnet support, deep links
> Owner: sputnik. Last verified: 2026-10-21. Legend: ✅ verified · 📄 docs-only · ⚠️ unverified/conflicting
> Related: [sputnik-dao.md](sputnik-dao.md) (policy, versions) · plan C1/C4 P-11/C8

## TL;DR
- ✅ **Production Trezu is mainnet-only.** The UI is `https://trezu.app`; the backend is `https://api.trezu.app/api`.
  - `GET /api/treasury/config?treasuryId=potspike-dao-svuw.sputnikv2.testnet` → `Account does not exist`.
  - The repo says "The production backend is mainnet-only".
  - No hosted testnet instance exists: `testnet.trezu.app` and `testnet.trezu.org` don't resolve.
  - **A testnet Pot cannot "open in Trezu"**, which breaks P-11/C1 as written.
- ✅ **Trezu shows any mainnet Sputnik DAO by account id**, not only treasuries it created. The backend's config, policy and proposals endpoints served `nearhub-dao.sputnik-dao.near` (created in 2021, not by Trezu).
  Opening a treasury in the UI calls `POST /api/monitored-accounts` ("Called when user visits a treasury to auto-register it"), which starts balance and activity tracking.
- ✅ **Deep links** (Next.js routes `app/(treasury)/[treasuryId]/…`, `treasuryId` = full DAO account id):
  - `https://trezu.app/<dao_id>`: dashboard (same as `/dashboard`)
  - `…/<dao_id>/requests`
  - `…/<dao_id>/requests/<proposal_id>`
  - `…/<dao_id>/members`
  - `…/<dao_id>/settings`
- ✅ **Role rendering.** Trezu's canonical roles are Requestor, Financial (on-chain `Approver`, called "Finance" in the docs) and Governance (on-chain `Admin`). The legacy names `Create Requests`/`Manage Members`/`Vote` are mapped. **Any other role name is shown raw**, so Pot's roles appear literally as `member` and `rulebot`. Issue #1724 (closed, fix PR #1771) was about raw names leaking into tooltips.
- ⚠️ **Trezu's "required approvals" is wrong for Pot's two-role policy.** `getApproversAndThreshold` merges every role that can vote on a kind, sums their ratios and applies the result to the union of accounts. For a transfer in a 3-member Pot plus the Rulebot, it shows **3 required** (the contract needs 2 members, or the rulebot alone). The Rulebot account is listed as an "approver". Status pills are derived from the chain status (`Approved` → "Executed"; `InProgress` past `proposal_period` → "Expired", computed client-side), so executed requests still display correctly.
- ✅ **Config metadata.** Trezu decodes `config.metadata` as base64(JSON) into `{primaryColor, flagLogo}`; `""` → none. Keep Pot's metadata `""` or base64 of a JSON object (unknown keys are ignored). ⚠️ Non-JSON bytes likely make `/treasury/config` fail, so the page 404s (inferred from code).
- ✅ **How Trezu creates a mainnet treasury** (live txs, read-only):
  1. `sponsor.trezu.near` calls `sputnik-dao.near.create` with **0.09 NEAR**.
  2. Every role (Requestor, Admin, Approver) starts as `[sponsor.trezu.near]`, with weight `"1"` thresholds, bond `"0"` and a 7-day period.
  3. The sponsor runs its setup proposals.
  4. A `ChangePolicy` hands all roles to the user, whose account id is a `0s…` deterministic id.
  5. All `act_proposal` calls pass `proposal` (v3.2 API).
- **Recommendation**:
  - Show "View in Trezu" **only for mainnet Pots** (the plan's $20 mainnet clip). Link `https://trezu.app/<slug>.sputnik-dao.near/requests`.
  - On testnet, show "View on NEAR explorer" (`https://testnet.nearblocks.io/address/<dao>`) plus Pot's own read-only "On-chain rules" panel (`get_policy`/`get_proposals`), and keep the README `get_policy` CLI step.
  - For the video, use the mainnet Pot in Trezu, or a **local** Trezu in testnet mode (`bun run testnet:mock`, dev-only).

## Plan check
| Claim in the original plan | Status |
|---|---|
| Key Findings: Trezu "'Setup is on us — Trezu covers the network fees…'; free plan '1,000 sponsored actions/mo (we cover gas). Swap fees 0.70%'" | ✅ trezu.org today: "First 1,000 actions/mo on us. Standard network fees after", swap fee "0.70%". The repo's `docs/PRICING.md` differs (Free: exchange 0.35%, overage 0.20%, "fees … not currently collected"), so it is ⚠️ stale vs the site. NEAR Business press quotes 0.35% |
| "Its backend creates `<name>.sputnik-dao.near` with roles Requestor, Admin, Approver" | ✅ seen on chain: `sponsor.trezu.near` → `sputnik-dao.near.create`, 0.09 NEAR, mainnet DAO code v3.2 (global `DtHZ…`) |
| "No documented public creation API" | ✅ None in docs.trezu.org. The backend has many `/api/*` routes, but creation goes through their sponsor flow. Don't build on it |
| C1 "Every Pot is a real Sputnik DAO that opens in Trezu" | ⚠️ True only on **mainnet** (any factory, any role names). Testnet Pots don't open |
| P-3 "member visible in app and Trezu"; P-11 "'View in Trezu' opens the treasury; README shows `get_policy`" | ❌ testnet (prod is mainnet-only). ✅ mainnet (`member`/`rulebot` shown raw). Keep the README `get_policy` step: it works on testnet ✅ |
| C8 video "Every Pot is a Sputnik DAO you can open in Trezu" (2:30-2:45) | ⚠️ Film it with the mainnet Pot, or with local Trezu in testnet mode, and say which |
| Track hint `social`: "SPUTNIK DAO, TREZU" | ✅ still usable via the mainnet clip, plus the DAO-compatible policy (any mainnet Sputnik UI can read it) |

## Reference

### URLs ✅
| What | URL |
|---|---|
| Marketing / pricing | https://trezu.org |
| App (mainnet) | https://trezu.app · create: https://trezu.app/create |
| Treasury pages | `https://trezu.app/<dao_id>[/dashboard\|/requests\|/requests/<id>\|/members\|/settings\|/payments\|/vesting\|/address-book]` |
| Backend | `https://api.trezu.app/api/...` (the README also names `near-treasury-backend.onrender.com`) |
| Docs | https://docs.trezu.org (index: `/llms.txt`) |
| Source | https://github.com/NEAR-DevHub/trezu (`main` @ `8e8e432`, 2026-10-19 "point production deployment to release-1.31.0") |

### Backend read endpoints (observed with GET; no auth needed) ✅
```bash
curl "https://api.trezu.app/api/treasury/config?treasuryId=nearhub-dao.sputnik-dao.near"
# {"metadata":{"primaryColor":null,"flagLogo":null},"name":"nearhub-dao","purpose":"…","isConfidential":false}
curl "https://api.trezu.app/api/treasury/policy?treasuryId=nearhub-dao.sputnik-dao.near"     # = DAO get_policy JSON
curl "https://api.trezu.app/api/proposals/nearhub-dao.sputnik-dao.near?page=0&page_size=2"   # {"proposals":[ProposalOutput…], …}
curl "https://api.trezu.app/api/proposal/nearhub-dao.sputnik-dao.near/1"                     # one ProposalOutput (+ last_actions_log)
curl "https://api.trezu.app/api/treasury/config?treasuryId=potspike-dao-svuw.sputnikv2.testnet"  # → "Account does not exist"
```
Other routes, from source and not called: `/api/proposals/{dao}/approvers|proposers`, `/api/proposal/{dao}/{id}/tx`, `/api/recent-activity`, `/api/balance-history/chart`, `/api/monitored-accounts` (POST, registers tracking), `/api/relay/delegate-action`, `/api/intents/*`, `/api/auth/*`.

### Roles: Trezu vocabulary vs on-chain names ✅ (source `nt-fe/components/role-name.tsx`, docs "Members and Roles")
| Trezu UI / docs | On-chain role name (Trezu-created) | Permissions (initial policy observed) |
|---|---|---|
| Requestor | `Requestor` | `call:AddProposal`, `transfer:AddProposal`, `call:VoteRemove`, `transfer:VoteRemove`; vote_policy `call`/`transfer` threshold `"1"` |
| Financial ("Finance") | `Approver` | `call:VoteApprove`, `call:VoteReject`, `call:RemoveProposal`, `call:Finalize`, and the same four for `transfer`; vote_policy `call`/`transfer` threshold `"1"` (the user's chosen threshold after handover) |
| Governance | `Admin` | `config:*`, `policy:*`, `add_member_to_role:*`, `remove_member_from_role:*`, `upgrade_self:*`, `upgrade_remote:*`, `set_vote_token:*`, `add_bounty:*`, `bounty_done:*`, `factory_info_update:*`, `policy_add_or_update_role:*`, `policy_remove_role:*`, `policy_update_default_vote_policy:*`, `policy_update_parameters:*`; each threshold `"1"` |
| (anything else) | shown **raw** (e.g. `member`, `rulebot`) | — |
Defaults in Trezu's `create`: `default_vote_policy {RoleWeight, quorum "0", [1,2]}`, `proposal_bond "0"`, `bounty_bond "0"`, `proposal_period` and `bounty_forgiveness_period` both 7 days, `config {name:"", purpose:"managing digital assets", metadata:""}` (the display name lives in Trezu's DB `treasury_settings`) ✅ tx `3xUd3J2n…`.
**This is the role split mainstream NEAR treasury UIs expect**: separate proposers, money approvers and governance, with absolute thresholds per kind.

### How a Pot DAO would render in Trezu (mainnet; ⚠️ from source, not rendered live)
- Members page: every account in any Group, with role badges `member` / `rulebot`. The Rulebot is a contract account and looks like a member.
- Requests: Pot's USDC `Transfer` proposals appear as payment requests. Approve/Reject should work for members, since Trezu sends `act_proposal` with `proposal` (seen in its mainnet txs) and permissions are checked on chain ⚠️ inferred.
  The "x of y" counter uses Trezu's merged formula (3 required for 3 members + rulebot; `floor(Σnum/Σden · |approvers|) + 1` with each role's ratio counted twice). Rulebot-approved requests show as executed by one vote.
- Settings/voting: Trezu's threshold editor assumes its three-role model. **Don't let Pot users edit policy in Trezu** (it could rewrite roles). Pot owns the policy.
- Membership data syncs in the background every ~5 minutes (code comment), and immediately after votes made in Trezu.

### Testnet viewing (dev-only) ✅ README / ⚠️ not run here
```bash
git clone https://github.com/NEAR-DevHub/trezu && cd trezu/nt-fe && bun install
bun run testnet:mock          # mock backend on :8889: proposals/policy/config straight from testnet RPC; other /api calls forwarded to prod
NEXT_PUBLIC_NEAR_NETWORK=testnet NEXT_PUBLIC_NEAR_RPC_URL=https://rpc.testnet.fastnear.com \
NEXT_PUBLIC_BACKEND_API_BASE=http://127.0.0.1:8889 bun run dev
open http://localhost:3000/<dao>.sputnikv2.testnet/requests     # "Execution-transaction links, assets and activity stay empty for testnet DAOs"
```
Not run here: `bun` isn't installed on this machine and global installs are off-limits. It is untested whether the UI parses v3.31's numeric `vote_counts` (→ [sputnik-dao.md](sputnik-dao.md) R10).

### NEAR Business ✅/📄
NEAR Business launched **2026-10-20**, invite-only: a "confidential multisig treasury … on NEAR's mainnet [that] follows SputnikDAO multisig principles". The Trezu repo files bugs under "Near Business - …", so it is the same codebase.
Treat it as mainnet-only as well. It is not a testnet option.

## Snippets
```ts
// Pot UI: build the Trezu link only for mainnet DAOs (✅ route format; untested component)
export const trezuUrl = (daoId: string, proposalId?: number) =>
  daoId.endsWith('.near') ? `https://trezu.app/${daoId}${proposalId != null ? `/requests/${proposalId}` : ''}` : null;
export const explorerUrl = (daoId: string) =>
  daoId.endsWith('.testnet') ? `https://testnet.nearblocks.io/address/${daoId}` : `https://nearblocks.io/address/${daoId}`;
```

## Gotchas & failure modes
1. **Visiting a treasury in the Trezu UI registers it** with Trezu's backend (`POST /api/monitored-accounts`), creating a third-party record. That's fine for a public demo, but don't script it.
2. Trezu reads `config.metadata` as base64(JSON). Never store raw binary there.
3. Trezu's approval counter and threshold editor assume its 3-role model. Pot's multi-role math displays wrong, and editing voting settings in Trezu could break the Rulebot role.
4. Role names are shown raw, so pick readable on-chain names. `member`/`rulebot` work. "Members" or "Pot rules bot" would read better in Trezu but cost bytes and must match Rulebot code exactly ⚠️ product choice.
5. Mainnet-only also means the README's "open in Trezu" step can't be a judge step on testnet. Make it a clearly labelled mainnet link.

## Costs, limits, latencies
| Item | Value |
|---|---|
| Trezu treasury creation (mainnet) | 0.09 NEAR deposit by `sponsor.trezu.near` (free to the user); DAO uses 2,252 B right after creation ✅ |
| Free tier | "First 1,000 actions/mo on us"; swaps 0.70% (trezu.org) 📄 |
| Backend latency | `/treasury/config` and `/treasury/policy` GETs: 0.24-0.85 s (n=6, from Europe) ✅ |

## Open questions / needs a human
- **Decision (lead/product-ux):** drop "View in Trezu" from the testnet UI (keep it for the mainnet clip). Alternatively, run a hosted Trezu fork in testnet mode, which means more ops and is a "don't rebuild" risk. I recommend dropping it.
- **Human:** if the mainnet clip shows Pot in Trezu, note that opening it registers the DAO with Trezu's backend (third-party data), and that Pot's custom roles render raw. Optionally ask NEAR DevHub whether a testnet Trezu is planned. That means contacting someone, so a human must do it.
- → web: the `trezuUrl` helper above, and hide the button on testnet.
- → auth: Trezu users are `0s…` deterministic accounts (42 chars). Check whether NEAR Auth also yields these (relevant to address display and length).

## Sources
- https://github.com/NEAR-DevHub/trezu (`README.md`, `nt-fe/README.md` "Viewing a testnet DAO locally", `nt-fe/app/(treasury)/[treasuryId]/*`, `nt-fe/lib/config-utils.ts` `getApproversAndThreshold`, `nt-fe/components/role-name.tsx`, `nt-fe/lib/api.ts` `openTreasury`, `nt-be/src/handlers/treasury/config.rs`, `nt-be/src/utils/base64json.rs`, `nt-fe/scripts/testnet-mock-backend.mjs`, `docs/PRICING.md`) @ `8e8e432`: everything marked source; accessed 2026-10-21
- https://github.com/NEAR-DevHub/trezu/issues/1724: raw role names in tooltips; closed; fix PR #1771; accessed 2026-10-21
- https://api.trezu.app/api/treasury/config, /treasury/policy, /proposals/{dao}, /proposal/{dao}/{id} (GET): mainnet-only behaviour and support for any DAO; accessed 2026-10-21
- https://trezu.org: "First 1,000 actions/mo on us", swap 0.70%; accessed 2026-10-21
- https://docs.trezu.org/governance/members-and-roles.md, https://docs.trezu.org/governance/voting-settings.md: Requestor/Finance/Governance semantics; accessed 2026-10-21
- NearBlocks mainnet API `/v1/account/8rzrd.sputnik-dao.near/txns` + RPC `EXPERIMENTAL_tx_status 3xUd3J2neP5iwYVS3aWXMGpUZyeTxhgANhGoRzdi9pFA`: Trezu creation flow and deposit (read-only); accessed 2026-10-21
- https://cryptobriefing.com/near-protocol-launches-near-business-treasury/ (+ WebSearch results for "NEAR Business"): launch 2026-10-20, mainnet, SputnikDAO principles, invite-only, 0.35% swaps (secondary sources ⚠️); accessed 2026-10-21
