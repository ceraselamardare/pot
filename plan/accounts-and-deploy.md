# Accounts, funding and deployment runbook (v1.0)

> Owner: onchain-architect. Written 2026-10-21. It follows decisions.md **Revision 1**: demo cast Maya / Sam / Leo; `propose_rules`; `withdraw_request` (rev5: Phase 3, not built).
> It finalizes the account map that D-02 delegates here. It is aligned with [architecture.md](architecture.md) §2.3, §3.15, §4.6 and §4.7 (secret names, key counts, persona names) and with [contracts-spec.md](contracts-spec.md) (hub interface, gas, costs).
> Legend: ✅ verified (KB, spike, or a near-cli-rs 0.30.1 `--help` / parse check) · ⚠️ estimate or assumption.
> **D-63:** every command that signs (`… send`) runs only after explicit human confirmation, on testnet too. Mainnet commands need a human at the keyboard. Agents only prepare them.
> **Rev 3 review (2026-10-21, [review.md](review.md)):** the DAO float is 0.05 NEAR on both testnet hubs (D-05 Rev 2), so the budget is the 75 NEAR column; the runbook's first deploy runs on **Nov 2** (task C-05), not Nov 1; `lisbon-trip` is only the permanent reference Pot, and the nightly shared Pot is a separate `lisbon-<yyyymmdd>` (D-33 Rev 3).
> **Rev 4 security fixes (2026-10-21, [review-security.md](review-security.md) §7):** key custody: the hub, root, reserve and treasury keys never sit on disk in the OS user that runs agents (§1.5); the token is locked on **Nov 2**, right after the mint and reserve split (§3.4 step 5); `init_hub` passes the relayer list (§3.5); CLI calls that aren't relayed attach the hub's cost (§3.8, §3.12); the reference personas lose their key after seeding; the MPC deposit is 1 yocto, so nothing is parked for MPC and the relayer thresholds are 5/2 NEAR (§2); the mainnet hub is locked right after the clip.

---

## 0. TL;DR

- **One root, two testnet environments, one mainnet clip.**
  - Production lives under `<root>.testnet`.
  - Preview lives under `preview.<root>.testnet`.
  - Each environment has its own hub, relayer, treasury and personas.
  - Both environments share one test token, `usdc.<root>.testnet`.
- **Keys.**
  - Humans hold the root, the deploy keys for hub and token, the cold `reserve` and the relayer and treasury recovery keys. Rev 4: they live in the near-cli-rs **legacy keychain of a separate macOS custody user** (or on a Ledger, or in the vault with import-on-demand), never in the OS user that runs AI coding agents and never in the macOS keychain, plus an encrypted backup (§1.5).
  - Vercel holds only the hot keys: `RELAYER_KEYS` (8 prod, 4 preview), `TREASURY_KEYS` (3) and `DEMO_PERSONA_KEY`. Agents only ever get the preview relayer keys, through env vars.
- **Locks.** Rev 4: `usdc.<root>` loses its only key on **Nov 2**, right after the mint and the reserve split (§3.4); `pots.<root>` on **Nov 12** (D-13); the mainnet hub right after the clip (§3.12). Every DAO has had no keys from birth, and the reference personas lose theirs after seeding. Judges verify all of it with `list-keys`.
- **Budget (H-02).** Request **≈ 74 testnet NEAR** (rev4: was 75; the 1-yocto MPC deposit frees the 6 NEAR that sat parked for MPC slots, and the nightly shared Pots are now budgeted). ≈ 13 NEAR of that is parked or refundable. The lean minimum is ≈ 45. Mainnet clip: **5 NEAR + ≈ $25 USDC** on Base (H-08).
- **Runbook** (§3): create the accounts (Nov 2) → build → token (mint to treasury, move the bulk to cold `reserve`, **lock**) → hub (preview on Nov 2, prod on Nov 6) → key pools → smoke checks → reference Pot (its personas then lose their key) → hub lock on Nov 12 → v2 fallback.

---

## 1. Account map

### 1.1 Testnet: production

`<root>` is the human-chosen name (H-05). The examples use `potapp.testnet`.

| Account | Purpose | Keys: who holds them | Funding at creation | Locked? |
|---|---|---|---|---|
| `<root>.testnet` | Team root. Parent of every prod account, `owner` of the hub config (set_config: float, limits, relayer list, pause, all within coded ranges; rev4), source of top-ups | 1 FAK in the **custody account** on P1's laptop (a separate macOS user's legacy keychain, or a Ledger; rev4, §1.5) + an encrypted backup in the team password manager (human) | faucet 10 NEAR + the H-02 grant | never (not a contract) |
| `pots.<root>.testnet` | **Pot Hub** (Rulebot + factory, D-02) | 1 FAK in the custody account (deploy key). **Never in Vercel** and never in the agents' OS user ([architecture.md](architecture.md) §4.7) | 20 NEAR, topped up to ≈ 24 over the event (§2.3) | **Yes, Nov 12**: delete the FAK (D-13) |
| `<slug>.pots.<root>.testnet` | One Sputnik DAO per Pot (holds the USDC) | **none, ever** (created keyless by the hub) | float from the hub | inherently |
| `usdc.<root>.testnet` | "USDC (test)", 6 dp, vendored near-examples/FT (D-11) | 1 FAK in the custody account, until the lock | 3 NEAR | **Yes, Nov 2** (rev4: right after the mint and the reserve split, §3.4 step 5; it has no admin method) |
| `reserve.<root>.testnet` 🆕 | **Cold** demo-dollar supply. Receives most of the 1e15 units from `treasury` right after mint | 1 FAK in the custody account + backup. Never in Vercel | 0.1 NEAR | no (it signs refills) |
| `treasury.<root>.testnet` | **Hot** demo-dollar float: `/api/faucet`, demo-pool seeding, simulator (D-11; architecture §3.7). The whole supply is minted here (D-11), then ≈ 99.9 % moves to `reserve` | recovery FAK (custody account) + **3 FAKs in `TREASURY_KEYS`** (Vercel prod Secret) | 1 NEAR | no |
| `users.<root>.testnet` | **Relayer** + parent of all user accounts (D-02, D-23, D-24); the hub's only sponsor (`config.relayers`, rev4) | recovery FAK (custody account) + **8 FAKs in `RELAYER_KEYS`** (Vercel prod Secret; key pool) | 10 NEAR; top up in ≤ 10 NEAR steps (blast radius, §5.1) | no |
| `u-<8>.users.<root>.testnet` | User accounts (NEAR Auth / device keys, D-21) | MPC FAK + device FAK, held by the user. The server holds none | 0 NEAR (NEP-448) | n/a |
| `maya` / `sam` / `leo` `.users.<root>.testnet` | Canonical demo personas (D-02 Rev 1), members of the **reference Pot only** (rev4: the nightly shared Pot gets fresh personas) | `DEMO_PERSONA_KEY` while seeding; rev4: the key is **deleted** once the reference Pot is seeded (§3.8, api-spec §5.2 step 9), so the reference Pot is read-only | 0 NEAR (relayed). For CLI seeding only: 0.5 NEAR each, swept back afterwards | **yes, after seeding** (rev4) |
| `maya-<k>` / `sam-<k>` / `leo-<k>` `.users.<root>.testnet` | Demo-pool personas (D-33), and since rev4 the personas of each nightly shared Pot. `<k>` = 4 chars of `[a-z0-9]`, the pool entry id | `DEMO_PERSONA_KEY` | 0 NEAR | no |
| `lisbon-trip.pots.<root>.testnet` | **Reference Pot** (D-33 Rev 3; env `DEMO_REFERENCE_POT`): permanent and never leased, so the README CLI twins and the `/demo` snapshot never change. Seeded once on Nov 6 (§3.8); rev4: read-only, because its personas hold no key | none | float from the hub | inherently |
| `lisbon-<k>.pots.<root>.testnet` | Demo-pool Pots, seeded by the refill Workflow (architecture §3.15) | none | hub float via `create_pot(float = min)` | inherently |
| `lisbon-<yyyymmdd>.pots.<root>.testnet` | **Shared** fallback Pot (D-33), used only when the pool is empty: a new one each night from the 04:00 UTC cron (`seedDemoPot`, kind `shared`), rev4: with fresh `maya-<k>` / `sam-<k>` / `leo-<k>` personas, no close or rules changes through the API, and a reseed when it drops below $300. A `demo_pot` DB row points to it, never an env var | none | hub float (0.05) | inherently |
| `pots-v2.<root>.testnet` | **Only if needed:** v2 hub after a post-lock bug (D-13, §3.11) | as `pots` | ≈ 5 NEAR | yes, after its own freeze |

### 1.2 Testnet: preview

Preview builds and Playwright use this set. It is redeployed freely and never locked. Its hub is initialized with `dao_float` = `min_dao_float` = 0.05 NEAR, the same as prod (D-05 Rev 2).

| Account | Purpose | Keys | Funding |
|---|---|---|---|
| `preview.<root>.testnet` | Namespace parent; owner of the preview hub config | FAK in the custody account (rev4) | 18 NEAR (it funds its children) |
| `pots.preview.<root>.testnet` | Preview hub (`relayers = [users.preview.<root>]`) | FAK in the custody account (rev4) | 7 NEAR → top up |
| `users.preview.<root>.testnet` | Preview relayer + parent of preview users and personas | recovery FAK in the custody account + **4 FAKs in `RELAYER_KEYS`** (Vercel **preview** Secret; the only keys agents may get, through env vars, rev4) | 4 NEAR |
| `treasury.preview.<root>.testnet` | Preview hot treasury ($100k test working float, refilled from `reserve`) | recovery FAK in the custody account + 3 FAKs in `TREASURY_KEYS` (preview) | 0.5 NEAR |
| `maya` / `sam` / `leo` `[-<k>]` `.users.preview.<root>.testnet` | Preview personas | `DEMO_PERSONA_KEY` (preview value) | 0 |
| (shared) `usdc.<root>.testnet` | same token; the preview hub is registered on it | — | — |

### 1.3 Mainnet: the Phase 2 clip (D-03, D-50, D-52; human-run, D-63)

| Account | Purpose | Keys | Funding | Locked? |
|---|---|---|---|---|
| `<root>.near` | Mainnet root (H-08's "mainnet NEAR account") | **Ledger** recommended (`sign-with-ledger`); otherwise the custody account's legacy keychain (rev4, §1.5) | ≈ 5 NEAR | never |
| `pots.<root>.near` | Mainnet hub (same wasm as testnet; init per [contracts-spec.md](contracts-spec.md) §9.2, `relayers: []`) | FAK in the custody account or on the Ledger (rev4) | ≈ 3.7 NEAR | rev4: **right after the clip** (Nov 11, C-22): close the clip Pots, then lock it, or delete it to reclaim ≈ 3 NEAR (a human call) |
| `<slug>.pots.<root>.near` | 1-2 clip Pots, `UseGlobalContract(DtHZA1…)` | none | 0.1 float each | inherently |
| `maya.<root>.near`, `leo.<root>.near` (+ `sam` optional) | Clip personas. They **sign their own txs** (no mainnet relayer) and attach the hub's cost to hub calls (rev4: `create_pot` 0.12 NEAR, `join` 0.02, contracts-spec §3.0) | FAK in the custody account on the recording laptop | maya 0.4, leo 0.2, sam 0.1 NEAR (rev4) + USDC from the 1Click deposit | no |
| `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` | Circle USDC (not ours) ✅ | — | — | — |

### 1.4 Naming rules and length budget

- A full id is ≤ 64 chars ✅. A DAO id is `<slug>.pots.<root>.testnet`; a preview DAO id is `<slug>.pots.preview.<root>.testnet`.
- With `len(<root>) = R`, the longest preview slug is `64 − 1 − len("pots.preview.") − R − len(".testnet") = 42 − R`.
- **Keep `R ≤ 10`** (e.g. `potapp`, `potsapp`) so 32-char slugs work everywhere. Production allows `50 − R`.
- Users: `u-<8>.users.<root>.testnet` is 25 + R chars. Pool personas: `maya-<k>.users.preview.<root>.testnet` is 37 + R chars. Both fit.
- **Reserve before Nov 1 (H-03):** only `<root>.testnet` (plus `<root>.near` for the clip). Everything else is created by the runbook once the code exists (D-63): the accounts, token and preview hub on **Nov 2** (task C-05, after the sandbox tests pass on Nov 1-2), and the prod hub `pots.<root>` on Nov 6 (C-13).

### 1.5 Key custody rules

1. Create keys with near-cli-rs `autogenerate-new-keypair save-to-legacy-keychain` or `… print-to-terminal`. **Never** use `save-to-keychain` or `sign-with-keychain` (the macOS keychain is excluded by the toolchain rules, [contracts-toolchain.md](../kb/contracts-toolchain.md)).
2. Legacy keychain path: `~/.near-credentials/testnet/<account>.json`, or `~/.near-credentials/testnet/<account>/<pk>.json` when an account has several keys. Back these files up encrypted in the team password manager. Never paste a key into docs, chat, an issue or the repo.
   - **Rev 4 (review-security H-4): the custody account.** The hub, root, reserve and treasury full-access keys, and every other full-access key in this runbook except the Vercel hot keys (the token key until Nov 2, the relayer and treasury recovery keys, the preview namespace keys, the mainnet keys), are **never stored on disk in the macOS user account that runs AI coding agents**. The `.claude/settings.json` Read deny rules don't stop a `Bash` `cat`/`cp` or a prompt-injected agent. Use one of:
     - a **separate standard macOS user** (e.g. `potkeys`, no admin rights, home `chmod 700`) whose `~/.near-credentials` holds them; every signing command of §3 runs in a terminal logged in as that user (`login potkeys`), never through `sudo` from the agent's shell (sudo caches its ticket);
     - a **hardware wallet** (`sign-with-ledger`; recommended for `<root>` and the mainnet keys);
     - the **password vault with import-on-demand**: import the key into the custody user's keychain just before a step and delete the file right after.
   - The agents' user `~/.near-credentials` holds no key from this list (checked in X-01 and before every deploy: `ls ~/.near-credentials/testnet`).
   - Agents only ever get the **preview relayer keys** (`RELAYER_KEYS`, preview value), through env vars, for local development. Flows that need the treasury or persona keys are tested against the preview deployment.
   - Set up on Oct 23 with H-03 (H-17, phase0-checklist).
3. Vercel holds only `RELAYER_KEYS`, `TREASURY_KEYS` and `DEMO_PERSONA_KEY` as **Secret** env vars, with different values for prod and preview ([architecture.md](architecture.md) §4.7). Non-secret ids: `RELAYER_ACCOUNT_ID`, `TREASURY_ACCOUNT_ID`, `NEXT_PUBLIC_HUB_ID`, `NEXT_PUBLIC_USDC_ID`, `DEMO_REFERENCE_POT`.
4. Hot accounts keep a **recovery key** in the custody account that Vercel never sees, so a leaked hot key can be revoked (§5).
5. Hot balances stay small: relayer ≤ 15 NEAR, treasury ≤ 1 NEAR and ≤ $1M test. Refills come from `<root>` and `reserve`.
6. Rev 4: the hub's own key is used only for planned deploys; the cron alerts on any other tx it signs (`hub_key_used`, api-spec §5.3), and the pre-lock checklist re-checks it (§3.10).

---

## 2. Funding budget

### 2.1 Unit costs (testnet NEAR)

| Item | Cost | Paid by | Basis |
|---|---|---|---|
| Sub-account creation via CLI `fund-myself` | 0.0071 + the initial balance | parent | ✅ [accounts-onboarding.md](../kb/accounts-onboarding.md) |
| User or persona onboarding (0-NEAR named account + USDC registration) | **0.0085** | relayer | ✅ measured 0.0085312 |
| USDC registration (any account) | 0.00125 | caller | ✅ |
| Token code + state (≈ 216 KB) | ≈ 2.2 | `usdc` account | ⚠️ (D-11) |
| Hub code + state (≈ 250-300 KB wasm) | ≈ 3.0 | hub account | ⚠️ (near-sdk 5 contract of this size; Sputnik's own is 430 KB) |
| Pot creation: DAO float | **0.05** on testnet, prod and preview (D-05 Rev 2); 0.1 on the mainnet clip | hub when relayed; the caller's deposit when not (rev4, contracts-spec §3.0) | contracts-spec §3.11 |
| Pot creation: DAO USDC registration + hub state | 0.00125 + ≈ 0.0094 | hub | ⚠️ contracts-spec §8.4 |
| Pot creation: gas + `account_creation_charge` | ≈ 0.0015 + **0.007** | relayer (signer) | ✅ / ⚠️ |
| Join: hub state + DAO prepay / gas | ≈ 0.009 / ≈ 0.002 | hub / relayer | ⚠️ |
| Contribution (gas only) | ≈ 0.0011 | relayer | ✅ 10.1 Tgas |
| Instant spend: hub + prepay / gas | ≈ 0.0085 / ≈ 0.003 | hub / relayer | ⚠️ |
| Vote spend incl. 2 votes + `sync` | ≈ 0.0115 / ≈ 0.0033 (rev4: prepay covers `member_count` votes) | hub / relayer | ⚠️ |
| Close (3 members) incl. 2 votes + `sync` | ≈ 0.017 / ≈ 0.0033 (rev4: same) | hub / relayer | ⚠️ |
| Faucet or seeding `ft_transfer` | ≈ 0.0003 | treasury | ✅ 0.000284 |
| NEAR Auth `sign` (new device) | ≈ 0.0045 spent; the deposit is **1 yocto** (refunded), so nothing is parked (rev4) | relayer | ✅ D-21 Rev 4 (1 yocto proven on chain, tx `FzULQ33c…`, review-security F-6) |
| Relayer gas prepay | 0.1-0.3 NEAR **parked** per in-flight tx (refunded) | relayer | ✅ (1e9 purchase price) |
| Hub `min_hub_reserve` | 2 NEAR **parked** (never spent) | hub | contracts-spec §2.2 |

### 2.2 Volume assumptions (Nov 1-18) ⚠️

| | Production | Preview |
|---|---|---|
| Real users onboarded (NEAR Auth / wallets) | 150 | 30 |
| User-created Pots | 60 (float 0.05) | — |
| Demo-pool leases (judges, visitors, team, Playwright on `main` + nightly) | 100 → **106 pool Pots** (pool of 6, architecture §3.15) | 60 Pots (Playwright per PR + dev; float 0.05) |
| Personas created | 3 × 106 = 318 | 180 |
| Joins / contributions (non-demo) | 100 / 300 | 100 / 300 |
| Instant / vote / close (non-demo) | 200 / 60 / 20 | 100 / 40 / 20 |
| Per demo lease | 1 instant + 1 vote spend + 1 close | same |
| NEAR Auth signs | 100 | 10 |
| Faucet transfers | 1,000 | 200 |

### 2.3 Totals by account (testnet)

| Account | Line items | Superseded: 0.25 user float | **Plan: D-05 Rev 2, 0.05 float, Rev 4** |
|---|---|---|---|
| `pots.<root>` (hub) | code 3.0 + reserve 2.0 (parked) + user Pots 60 × 0.061 = 3.7 (superseded: × 0.261 = 15.6) + demo Pots 106 × 0.061 = 6.4 + rev4: shared Pots (13 nightly + ≤ 10 reseeds) 23 × 0.079 = 1.8 + joins 312 × 0.009 = 2.8 + instant 300 × 0.0085 = 2.6 + vote 160 × 0.0115 = 1.8 + close 120 × 0.017 = 2.0 | 36.0 | **26.1** |
| `users.<root>` (relayer) | onboarding 468 × 0.0085 = 4.0 + Pot creation 166 × 0.0085 = 1.4 + joins 0.6 + contributions 618 × 0.0011 = 0.7 + spends 0.9 + votes and syncs 0.9 + NEAR Auth signs 0.45 + rev4: shared-Pot personas and gas 23 × 0.038 = 0.9 + **parked**: prepay 8 × 0.3 = 2.4 (rev4: no MPC slots, the deposit is 1 yocto) | 15.4 | **12.3** |
| `usdc.<root>` | code + state | 3.0 | 3.0 |
| `treasury.<root>` / `reserve.<root>` | gas for ≈ 1,320 transfers | 1.0 / 0.1 | 1.0 / 0.1 |
| Preview (`preview.<root>` and children) | hub: code 3 + reserve 2 + 60 × 0.061 + actions ≈ 2.5 = 11.1; relayer: onboarding 1.8 + gas 1.0 + prepay 4 × 0.3 = 4.0 (rev4: no MPC slot); treasury 0.5 | 17.6 | **15.6** |
| `<root>` operating balance | CLI gas, top-ups in flight, account-creation charges | 1.1 | 1.1 |
| v2 contingency (`pots-v2`) | code 3 + reserve 2, spent only if needed (§3.11) | 5.0 | 5.0 |
| **Subtotal** | | 79.2 | **64.2** (Rev 3: 67.2) |
| Buffer 15 % | | 11.9 | 9.6 |
| **Request (H-02)** | | ≈ 90 NEAR | **≈ 74 NEAR** (73.8 with the full buffer; Rev 3 asked for 75) |

Notes:
- **Parked or refundable:** hub reserves 4, relayer prepay 3.6 and the v2 contingency 5, ≈ 13 NEAR in all (rev4: the 6 NEAR of MPC slots is gone, D-21). The actually consumed spend is ≈ 52 NEAR (plan) or ≈ 60 NEAR (superseded 0.25 float).
- **Why the request only drops by ≈ 1 NEAR (rev4):** the MPC saving (6 NEAR) is offset by the nightly shared Pots and reseeds, which Rev 3 didn't budget (≈ 2.7 NEAR with fresh personas each night), and by the extra prepaid vote (≈ 0.3 NEAR).
- **Lean minimum ≈ 45 NEAR:** 50 demo leases, no v2 reserve, preview capped at 30 Pots (the 1-yocto MPC deposit is now the default). Use it if H-02 yields only 40-60.
- **Sources** (H-02): an organizer or DevRel grant. The near-cli-rs faucet gives 10 NEAR per new account ✅. **Sweeping** several faucet accounts (`delete-account … beneficiary <root>`) needs a human OK.
- **Order of spending:** on Nov 2 (C-05), the accounts, token, prod relayer and preview set need ≈ 32.1 NEAR (§2.4). The prod hub's 20 NEAR follows on Nov 6, and the demo pool from Nov 6-7.

### 2.4 Initial allocation and top-up rules

| When | From → to | Amount |
|---|---|---|
| Oct (H-03) | faucet → `<root>` | 10 |
| by Nov 2 | H-02 grant → `<root>` | the rest |
| Nov 2 (C-05) | `<root>` → `usdc` 3, `treasury` 1, `reserve` 0.1, `users` 10, `preview` 18 (→ `pots.preview` 7, `users.preview` 4, `treasury.preview` 0.5) | ≈ 32.1 |
| Nov 6 | `<root>` → `pots` (prod hub deploy) | 20 |
| Nov 7-18 | `<root>` → `pots` | when `get_config.free_balance` < 5 NEAR (alert `hub_low`), add 5-10 |
| Nov 7-18 | `<root>` → `users` | when the alert `relayer_low` fires (api-spec §3.5: available < 5 NEAR = critical 2 NEAR + 3; rev4: no MPC reserve, since the `sign` deposit is 1 yocto), top up to 15 NEAR (never hold more than 15) |
| as needed | `reserve` → `treasury` (USDC test) | keep the hot treasury ≤ $1M test (alert `treasury_low`) |

Top-ups still work after the Nov 12 lock: a plain NEAR transfer to a keyless account needs no key on the receiver.

### 2.5 Mainnet budget (clip; human-run)

| Item | NEAR | Basis |
|---|---|---|
| `pots.<root>.near` creation + code storage + state | 0.007 + ≈ 3.0 + 0.05 | ⚠️ wasm size |
| Hub `min_hub_reserve` (mainnet init 0.5) | 0.5 (parked) | contracts-spec §9.2 |
| Hub USDC registration on Circle USDC | 0.00125 | ✅ |
| 2 clip Pots × (float 0.1 + registration + hub state + prepays ≈ 0.03) | ≈ 0.27, rev4: paid by Maya's deposits, not by the hub (`relayers: []`, contracts-spec §3.0) | ⚠️ |
| 3 personas: creation 3 × 0.007 + funding maya 0.4 (2 × `create_pot` deposit 0.12 + gas), leo 0.2 (`join` deposit 0.02 + gas + USDC registration), sam 0.1 | ≈ 0.72 (includes the line above) | ✅ / ⚠️ |
| Gas for deploy, init, ≈ 30 txs | ≈ 0.1 | ⚠️ |
| **Total** | **≈ 4.4 → budget 5 NEAR** | + **≈ $25 USDC on Base** for the 1Click clip (H-08), + Base gas |

Recoverable: rev4, right after the clip (Nov 11, C-22) the clip Pots are closed (the real USDC goes back to the personas) and the mainnet hub is locked; if the humans **delete** it instead of locking it, `delete-account` refunds ≈ 3 NEAR of storage, and the personas can be deleted too. The DAOs keep their floats.

---

## 3. Deployment runbook (near-cli-rs 0.30.1, non-interactive, legacy keychain)

### 3.0 Conventions

```bash
# ~/.pot-deploy.env  (NOT committed; `source` it in each shell)
export NET=testnet                    # near-cli-rs connection name; switch to testnet-fastnear (test.rpc.fastnear.com) on -429s ✅
export ROOT=potapp.testnet            # H-05
export HUB=pots.$ROOT  USDC=usdc.$ROOT  TREASURY=treasury.$ROOT  RESERVE=reserve.$ROOT  RELAYER=users.$ROOT
export PV=preview.$ROOT HUB_PV=pots.preview.$ROOT RELAYER_PV=users.preview.$ROOT TREASURY_PV=treasury.preview.$ROOT
export DAO_HASH=Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD       # testnet global Sputnik 278adc7 (D-03)
export W=contracts/target/near                                     # cargo-near output dir
export TMP=$(mktemp -d)                                            # scratch for JSON args (file-args)
```

- Every write ends with `network-config $NET sign-with-legacy-keychain send`. Every read ends with `network-config $NET now`. Both are ✅ shapes used in the spikes and parse-checked with 0.30.1.
- **Rev 4 (key custody, §1.5):** every signing command in this runbook runs in a terminal logged in as the custody user (or with `sign-with-ledger`), never in the macOS user that runs agents; `~/.pot-deploy.env` and `~/.pot-secrets/` live in the custody user's home.
- **Rev 4 (sponsorship):** a hub call signed directly by a CLI account (not relayed) is not sponsored, so it attaches the hub's cost as a deposit (contracts-spec §3.0 table: `create_pot` 0.07 NEAR on testnet, `join` 0.02; the hub refunds any excess).
- `near` = `~/.cargo/bin/near` 0.30.1, or `npx -y near-cli-rs@0.30.1`.
- Running `near` the first time may migrate `config.toml` (V4 → V5). That is benign ✅.
- Deposits are written as `'0 NEAR'`, `'0.00125 NEAR'` or `'1 yoctoNEAR'` (✅ parse check). Gas is written as `'100.0 Tgas'`.
- Nested JSON (e.g. `ft_transfer_call.msg`) goes through `file-args <path>` built with `jq` (✅ subcommand present).

### 3.1 Before Nov 1: reserve the root (H-03; human)

Rev 4: run this as the custody user (H-17, §1.5), so the root key is never written to the agents' `~/.near-credentials`.

```bash
near account create-account sponsor-by-faucet-service $ROOT autogenerate-new-keypair save-to-legacy-keychain network-config $NET create
near account view-account-summary $ROOT network-config $NET now          # ≈ 10 NEAR
# mainnet (clip): create <root>.near with a wallet or Ledger; human only (D-63)
```

### 3.2 Nov 2 (task C-05): create the accounts

```bash
mk() { near account create-account fund-myself "$1" "$2" autogenerate-new-keypair save-to-legacy-keychain \
         sign-as "$3" network-config $NET sign-with-legacy-keychain send; }
mk $USDC     '3 NEAR'    $ROOT
mk $TREASURY '1 NEAR'    $ROOT
mk $RESERVE  '0.1 NEAR'  $ROOT
mk $RELAYER  '10 NEAR'   $ROOT
mk $PV       '18 NEAR'   $ROOT
mk $HUB_PV      '7 NEAR'   $PV
mk $RELAYER_PV  '4 NEAR'   $PV
mk $TREASURY_PV '0.5 NEAR' $PV
# the prod hub is created on Nov 6 (§3.5), when v1 is frozen:
# mk $HUB '20 NEAR' $ROOT
```

### 3.3 Build and record hashes

```bash
cd contracts && cargo near build non-reproducible-wasm --manifest-path test-usdc/Cargo.toml \
             && cargo near build non-reproducible-wasm --manifest-path pot-hub/Cargo.toml && cd ..
shasum -a 256 $W/test_usdc/test_usdc.wasm $W/pot_hub/pot_hub.wasm   # record in RELEASES.md together with the git commit
```

`view-account-summary` later prints the deployed code's sha256 hex, which must match these ✅. This is the judge-verifiable link between the repo and the chain.

### 3.4 Token: deploy, mint, register, move the bulk to cold storage

```bash
# 1. deploy + init: the whole supply (1e15 = $1,000,000,000 test) goes to treasury (D-11; no mint method exists)
near contract deploy $USDC use-file $W/test_usdc/test_usdc.wasm with-init-call new json-args \
  "{\"owner_id\":\"$TREASURY\",\"total_supply\":\"1000000000000000\",\"metadata\":{\"spec\":\"ft-1.0.0\",\"name\":\"USDC (test)\",\"symbol\":\"USDC\",\"decimals\":6,\"icon\":null,\"reference\":null,\"reference_hash\":null}}" \
  prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' network-config $NET sign-with-legacy-keychain send

# 2. register accounts that must hold or receive USDC (anyone can pay for anyone ✅); paid by root
reg() { near contract call-function as-transaction $USDC storage_deposit json-args "{\"account_id\":\"$1\",\"registration_only\":true}" \
          prepaid-gas '30.0 Tgas' attached-deposit '0.00125 NEAR' sign-as $ROOT network-config $NET sign-with-legacy-keychain send; }
reg $RESERVE; reg $HUB_PV; reg $TREASURY_PV          # $HUB is registered on Nov 6 (§3.5)

# 3. keep $1,000,000 test in the hot treasury and move the rest to cold reserve
near contract call-function as-transaction $USDC ft_transfer json-args \
  "{\"receiver_id\":\"$RESERVE\",\"amount\":\"999000000000000\",\"memo\":\"cold reserve\"}" \
  prepaid-gas '30.0 Tgas' attached-deposit '1 yoctoNEAR' sign-as $TREASURY network-config $NET sign-with-legacy-keychain send
# 4. the preview float ($100,000) comes from the reserve
near contract call-function as-transaction $USDC ft_transfer json-args \
  "{\"receiver_id\":\"$TREASURY_PV\",\"amount\":\"100000000000\",\"memo\":\"preview float\"}" \
  prepaid-gas '30.0 Tgas' attached-deposit '1 yoctoNEAR' sign-as $RESERVE network-config $NET sign-with-legacy-keychain send

# 5. rev4 (review-security H-4): lock the token NOW. It has no admin method, and whoever holds its key could redeploy it
#    and rewrite every Pot's balance. A token bug later means usdc2 + pots-v2 anyway (§5.5). Registering the hubs later
#    (`storage_deposit`) needs no token key.
near account list-keys $USDC network-config $NET now                  # expect exactly 1 row (full access): copy its public key
near account delete-keys $USDC public-keys ed25519:<that key> network-config $NET sign-with-legacy-keychain send
near account list-keys $USDC network-config $NET now                  # expect an EMPTY table
```

### 3.5 Hub: deploy and init (preview on Nov 2; prod on Nov 6)

```bash
init_hub() { # $1 = hub account, $2 = owner, $3 = default float (yocto), $4 = min float (yocto), $5 = the relayer it sponsors (rev4)
  near contract deploy "$1" use-file $W/pot_hub/pot_hub.wasm with-init-call new json-args \
    "{\"owner\":\"$2\",\"usdc\":\"$USDC\",\"dao_code_hash\":\"$DAO_HASH\",\"dao_float\":\"$3\",\"min_dao_float\":\"$4\",\"relayers\":[\"$5\"],\"limits\":null}" \
    prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' network-config $NET sign-with-legacy-keychain send; }

# preview (Nov 2): float 0.05 for every Pot; sponsors only the preview relayer
init_hub $HUB_PV $PV 50000000000000000000000 50000000000000000000000 $RELAYER_PV
# prod (Nov 6, after the v1 freeze): float 0.05 for every Pot too (D-05 Rev 2); sponsors only the prod relayer
mk $HUB '20 NEAR' $ROOT && reg $HUB
init_hub $HUB $ROOT 50000000000000000000000 50000000000000000000000 $RELAYER
```

Later preview redeploys of the **same layout** keep their state:

```bash
near contract deploy $HUB_PV use-file $W/pot_hub/pot_hub.wasm without-init-call network-config $NET sign-with-legacy-keychain send
```

### 3.6 Key pools for Vercel (relayer and treasury)

```bash
# generate N keys in the custody user's terminal (rev4, §1.5); the secret halves go ONLY into Vercel Secret env vars
for i in 1 2 3 4 5 6 7 8; do
  near account add-key $RELAYER grant-full-access autogenerate-new-keypair print-to-terminal \
    network-config $NET sign-with-legacy-keychain send      # signed by the custody recovery key; copy the printed secret key
done
# → Vercel prod: RELAYER_KEYS="ed25519:…,ed25519:…" (8), RELAYER_ACCOUNT_ID=$RELAYER
# repeat: $TREASURY ×3 → TREASURY_KEYS; $RELAYER_PV ×4 and $TREASURY_PV ×3 → the preview values
# DEMO_PERSONA_KEY: generate once per environment (scripts/keys.ts or `near account get-public-key from-plaintext-private-key`)
near account list-keys $RELAYER network-config $NET now     # expect 9 rows: 1 recovery + 8 pool
```

### 3.7 Smoke checks (read-only, after each deploy)

```bash
near contract call-function as-read-only $HUB get_config json-args '{}' network-config $NET now
#   expect owner=$ROOT, usdc=$USDC, dao_code_hash=Ea8t…, relayers=[$RELAYER] (rev4), paused=false, version "1.0.0"
near contract call-function as-read-only $USDC ft_metadata json-args '{}' network-config $NET now          # "USDC (test)", 6 decimals
near contract call-function as-read-only $USDC ft_total_supply json-args '{}' network-config $NET now      # "1000000000000000"
near contract call-function as-read-only $USDC storage_balance_of json-args "{\"account_id\":\"$HUB\"}" network-config $NET now   # not null
near contract call-function as-read-only $USDC ft_balance_of json-args "{\"account_id\":\"$RESERVE\"}" network-config $NET now
near account view-account-summary $HUB network-config $NET now    # contract sha256 == pot_hub.wasm from §3.3
near contract call-function as-read-only $HUB get_pot json-args "{\"pot\":\"nope.$HUB\"}" network-config $NET now   # null
near account list-keys $USDC network-config $NET now               # rev4: empty table (locked on Nov 2, §3.4 step 5)
```

### 3.8 Reference demo Pot `lisbon-trip` (D-61 Rev 1, via CLI)

The pool Pots are seeded by the Workflow (architecture §3.15). This manual path makes the canonical **reference** Pot: Maya, Sam and Leo with $150 each = $450, three members, no spends.

Rev 3: the preferred way to make the reference Pot (prod on Nov 6, preview the same day) is B-08's seeding script with `--kind reference`, which runs the same eight steps through the relay pipeline ([api-spec.md](api-spec.md) §5.2). That also writes the `pot`, `invite_meta`, `app_user` and `feed_event` rows, so the `/demo` snapshot has activity lines. The CLI path below is the fallback; after it, the reference Pot's activity lines stay empty unless `seed-db.ts` backfills `feed_event` rows (source `seed`) from the tx hashes.

Rev 4 (review-security H-5, C-1): both paths end by **deleting the reference personas' only key**, so the reference Pot is read-only for everyone, the server included (api-spec §5.2 step 9). Through the relay pipeline the relayer signs, so the hub sponsors the calls; the CLI path below signs as the personas, so `create_pot` and `join` attach the hub's cost (contracts-spec §3.0). Run it in the custody user's terminal (§1.5).

```bash
# personas, created by the relayer (parent) with DEMO_PERSONA_KEY's public half; 0.5 NEAR each for CLI gas (swept back below)
DEMO_PK=$(near account get-public-key from-plaintext-private-key "$(cat ~/.pot-secrets/demo_persona_key)" 2>/dev/null \
          | grep 'Public key' | grep -o 'ed25519:[1-9A-HJ-NP-Za-km-z]*')   # ✅ prints "Public key (printed to stdout): ed25519:…"; stderr (echoes the secret) discarded
for p in maya sam leo; do
  F='0.5 NEAR'; [ $p = maya ] && F='0.6 NEAR'      # rev4: Maya also pays create_pot's 0.07 NEAR deposit
  near account create-account fund-myself $p.$RELAYER "$F" use-manually-provided-public-key $DEMO_PK \
    sign-as $RELAYER network-config $NET sign-with-legacy-keychain send
  reg $p.$RELAYER
  near contract call-function as-transaction $USDC ft_transfer json-args "{\"receiver_id\":\"$p.$RELAYER\",\"amount\":\"150000000\"}" \
    prepaid-gas '30.0 Tgas' attached-deposit '1 yoctoNEAR' sign-as $TREASURY network-config $NET sign-with-legacy-keychain send
  # put the persona key into the legacy keychain so the CLI can sign as the persona (testnet demo key only)
  jq -n --arg a "$p.$RELAYER" --arg pk "$DEMO_PK" --arg sk "$(cat ~/.pot-secrets/demo_persona_key)" \
     '{account_id:$a, public_key:$pk, private_key:$sk}' > ~/.near-credentials/testnet/$p.$RELAYER.json
done

# Maya creates the Pot with an invite key (scripts/invite.ts prints pk + secret and signs join messages; contracts-spec §3.7)
INV=$(pnpm -s tsx scripts/invite.ts new)          # → {"pk":"ed25519:…","pk_b58":"…","secret":"<base64url>"}
near contract call-function as-transaction $HUB create_pot json-args \
  "{\"slug\":\"lisbon-trip\",\"name\":\"Lisbon Trip\",\"preset\":\"trip\",\"rules\":null,\"invite_pk\":$(echo $INV | jq .pk),\"emoji\":\"🇵🇹\",\"float\":null}" \
  prepaid-gas '150.0 Tgas' attached-deposit '0.07 NEAR' sign-as maya.$RELAYER network-config $NET sign-with-legacy-keychain send
#   rev4: not relayed, so not sponsored: attach dao_float + 0.02 (the hub refunds the excess); 0 NEAR → ERR_DEPOSIT_REQUIRED
POT=lisbon-trip.$HUB

contribute() { jq -n --arg hub "$HUB" --arg pot "$POT" '{receiver_id:$hub, amount:"150000000", msg:({pot:$pot}|tojson)}' > $TMP/c.json
  near contract call-function as-transaction $USDC ft_transfer_call file-args $TMP/c.json \
    prepaid-gas '100.0 Tgas' attached-deposit '1 yoctoNEAR' sign-as "$1" network-config $NET sign-with-legacy-keychain send; }
join() { SIG=$(pnpm -s tsx scripts/invite.ts sign "$(echo $INV | jq -r .secret)" "$POT" "$1")   # base64 of the ed25519 signature
  near contract call-function as-transaction $HUB join json-args "{\"pot\":\"$POT\",\"invite_pk\":$(echo $INV | jq .pk),\"signature\":\"$SIG\"}" \
    prepaid-gas '100.0 Tgas' attached-deposit '0.02 NEAR' sign-as "$1" network-config $NET sign-with-legacy-keychain send; }   # rev4: join's cost

contribute maya.$RELAYER
join sam.$RELAYER && contribute sam.$RELAYER
join leo.$RELAYER && contribute leo.$RELAYER

near contract call-function as-read-only $USDC ft_balance_of json-args "{\"account_id\":\"$POT\"}" network-config $NET now   # "450000000"
near contract call-function as-read-only $HUB get_members json-args "{\"pot\":\"$POT\"}" network-config $NET now             # 3 × 150
# sweep the CLI gas money back
for p in maya sam leo; do near tokens $p.$RELAYER send-near $RELAYER '0.45 NEAR' network-config $NET sign-with-legacy-keychain send; done
# rev4: lock the reference personas (each deletes its only key), so nobody can act in the reference Pot again
for p in maya sam leo; do
  near account delete-keys $p.$RELAYER public-keys $DEMO_PK network-config $NET sign-with-legacy-keychain send
  near account list-keys $p.$RELAYER network-config $NET now          # empty table
  rm ~/.near-credentials/testnet/$p.$RELAYER.json
done
# Vercel: DEMO_REFERENCE_POT=lisbon-trip.pots.<root>.testnet
```

The **nightly shared Pot** (the D-33 fallback, used only when the pool is empty) is a different Pot: the 04:00 UTC cron seeds a fresh `lisbon-<yyyymmdd>` through `seedDemoPot` (kind `shared`, rev4: with fresh personas) and points a `demo_pot` row at it ([api-spec.md](api-spec.md) §5.3, §7.2). `lisbon-trip` and `DEMO_REFERENCE_POT` never change, so the README CLI twins stay deterministic. Nothing on chain can be "reset".

### 3.9 Redeploys before the lock

- **Preview:** redeploy freely. If the storage layout changes (any borsh struct in contracts-spec §2.2), state no longer deserializes. Then `delete-account $HUB_PV beneficiary $PV` and recreate it via §3.2 + §3.5. Old preview DAOs are orphaned (test data), and their slugs stay taken.
- **Prod, from Nov 6:** the layout is **frozen**. Any redeploy must be layout-compatible:
  - no field added to or removed from a stored struct;
  - new data goes only into new collections with new prefixes.

  Redeploy with `deploy … without-init-call` (§3.5), then rerun §3.7 and the sandbox suite. If a breaking change is unavoidable, use §3.11 (v2) instead. Never delete and recreate `pots.<root>`: existing DAOs would point at an empty hub.

### 3.10 Nov 12: lock the hub (D-13; the token was locked on Nov 2, §3.4 step 5)

Pre-lock checklist (a human ticks every line; D-63):
1. The deployed code sha256 (`view-account-summary $HUB`) == the release build in `RELEASES.md` and the git tag. The same holds for `$USDC`.
2. `get_config` is correct; `paused` is false.
3. `$HUB` free balance ≥ projected need through Nov 18 (§2.3). Top up now if unsure (plain transfers still work after the lock).
4. CI green on Sputnik builds A and B, plus the protocol-88 job.
5. The README §4 commands work against the current state.
6. Rev 4: no tx signed by `$HUB` since the last deploy except planned ones (FastNEAR Tx API, signer = `$HUB`; the cron's `hub_key_used` alert never fired).
7. Rev 4: `get_config().relayers` = `[$RELAYER]`, `limits.max_sponsored_pots_per_day` = 50, and `list-keys $USDC` is still an empty table.

```bash
near account list-keys $HUB network-config $NET now          # expect exactly 1 row (full access): copy its public key
near account delete-keys $HUB public-keys ed25519:<that key> network-config $NET sign-with-legacy-keychain send
near account list-keys $HUB network-config $NET now          # expect an EMPTY table (header only) ✅ (format seen on keyless accounts)
near account list-keys $USDC network-config $NET now         # still empty (locked on Nov 2)
```

After the lock:
- The `owner` (`<root>`) can still call `set_config` (float, limits, relayer list, pause, each within its coded range; rev4), which is the incident switch (§5.5). It can't move funds or change the owner.
- Nobody can change the code or move the hub's state.
- Because `factory_info.factory_id` of every DAO = the hub (contracts-spec INV-14), nobody can upgrade any DAO either.
- Keep `$PV` and the preview hub unlocked.

### 3.11 Redeploy-as-v2 fallback (a bug found after the lock)

```bash
mk pots-v2.$ROOT '5 NEAR' $ROOT && reg pots-v2.$ROOT
init_hub pots-v2.$ROOT $ROOT 50000000000000000000000 50000000000000000000000 $RELAYER
# same smoke checks (§3.7) against pots-v2.$ROOT, then:
#  - Vercel: NEXT_PUBLIC_HUB_ID=pots-v2.<root>.testnet; relayer allowlist += pots-v2.<root>, *.pots-v2.<root> (D-24)
#  - demo pool: retire v1 pool Pots, refill on v2; new reference Pot lisbon-trip.pots-v2.<root>
#  - README: list both hubs; v1 locked (and paused if S1, §5.5); old Pots keep working for votes, close and sync
#  - lock pots-v2 after its own checklist (§3.10)
```

v2 hubs do not adopt v1 Pots. Their DAOs name the v1 hub as rulebot, and a migration would need every group to vote a policy change. That is Phase 3 (D-13).

### 3.12 Mainnet clip (Nov 10-11, tasks C-20 and X-13; every step human-confirmed, D-63)

```bash
export NET=mainnet MROOT=<root>.near MUSDC=17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1
near account create-account fund-myself pots.$MROOT '3.7 NEAR' autogenerate-new-keypair save-to-legacy-keychain \
  sign-as $MROOT network-config $NET sign-with-legacy-keychain send          # or sign-with-ledger for $MROOT
near contract call-function as-transaction $MUSDC storage_deposit json-args "{\"account_id\":\"pots.$MROOT\",\"registration_only\":true}" \
  prepaid-gas '30.0 Tgas' attached-deposit '0.00125 NEAR' sign-as $MROOT network-config $NET sign-with-legacy-keychain send
near contract deploy pots.$MROOT use-file $W/pot_hub/pot_hub.wasm with-init-call new file-args mainnet-hub-init.json \
  prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' network-config $NET sign-with-legacy-keychain send
#   mainnet-hub-init.json = contracts-spec §9.2 (usdc = Circle id, dao_code_hash = DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF, float 0.1, tight limits,
#   rev4: "relayers": [] so the hub sponsors nothing)
# personas maya/leo(/sam).$MROOT: fund-myself maya 0.4, leo 0.2, sam 0.1 NEAR (rev4: their hub calls attach the hub's cost:
#   create_pot attached-deposit '0.12 NEAR', join '0.02 NEAR'; the excess comes back); they receive USDC via 1Click
#   (it registers recipients ✅) and sign their own txs. All mainnet keys follow §1.5 (custody user or Ledger).
# Trezu check (D-03, Nov 10, C-20): open https://trezu.app/<slug>.pots.<root>.near/requests and /members (contracts-spec §9.2)

# rev4, Nov 11 right after the X-13 recording (task C-22, a human at the keyboard):
# 1. close each clip Pot: propose_close (attached-deposit '0.15 NEAR') + the members' approvals → the real USDC goes back to the personas
# 2. lock the hub: list-keys pots.$MROOT → delete-keys pots.$MROOT public-keys ed25519:<that key> → list-keys (empty)
#    (or, a human call, delete-account pots.$MROOT beneficiary $MROOT to reclaim ≈ 3 NEAR; either way no hub key remains)
```

---

## 4. README commands for AI judges (read-only, no keys)

The placeholders are `<root>` and `<slug>`. The reference Pot is `lisbon-trip`. `network-config testnet` is near-cli-rs's default connection ✅ (FastNEAR archival). If it returns `-429`, use `testnet-fastnear`.

```bash
# near-cli-rs 0.30.1:  npx -y near-cli-rs@0.30.1 <command>   (or cargo install near-cli-rs)
ROOT=<root>.testnet;  HUB=pots.$ROOT;  POT=<slug>.pots.$ROOT        # e.g. POT=lisbon-trip.pots.<root>.testnet

# 1. Every Pot is a Sputnik DAO. "member" = the group (majority [1,2], quorum 1); "rulebot" = the hub (1 of 1, transfers and joins only); bond 0
near contract call-function as-read-only $POT get_policy json-args '{}' network-config testnet now

# 2. The hub's view of the Pot: rules ($100 instant limit, $200 per person), members, totals
near contract call-function as-read-only $HUB get_pot json-args "{\"pot\":\"$POT\"}" network-config testnet now
near contract call-function as-read-only $HUB get_members json-args "{\"pot\":\"$POT\"}" network-config testnet now

# 3. Nobody holds a key to the hub (locked Nov 12), the token (locked Nov 2) or any Pot (keyless from birth): empty key tables
near account list-keys $HUB network-config testnet now
near account list-keys usdc.$ROOT network-config testnet now
near account list-keys $POT network-config testnet now
#    rev4: the reference Pot's personas hold no key either, so nobody can act in it
near account list-keys maya.users.$ROOT network-config testnet now

# 4. The money sits in the Pot's own account, in USDC (test), 6 decimals ("450000000" = $450.00); the hub holds none
near contract call-function as-read-only usdc.$ROOT ft_balance_of json-args "{\"account_id\":\"$POT\"}" network-config testnet now
near contract call-function as-read-only usdc.$ROOT ft_balance_of json-args "{\"account_id\":\"$HUB\"}" network-config testnet now

# 5. The Pot runs the official Sputnik code by global hash (sha256 c9a502ef…39ce = Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD)
near account view-account-summary $POT network-config testnet now
near contract call-function as-read-only $POT get_factory_info json-args '{}' network-config testnet now   # factory_id = the keyless hub

# 6. Requests and votes, from both sides
near contract call-function as-read-only $POT get_proposals json-args '{"from_index":0,"limit":10}' network-config testnet now
near contract call-function as-read-only $HUB get_requests json-args "{\"pot\":\"$POT\",\"from_index\":0,\"limit\":10}" network-config testnet now

# 7. Contract tests, no keys, no network (arm64 Mac or Linux): both Sputnik builds
cd contracts && cargo test -p pot-tests
```

---

## 5. Key rotation and incident response

### 5.1 A relayer key leaks (`RELAYER_KEYS`)

- **Blast radius:**
  - The relayer's NEAR (≤ 15 by policy).
  - The power to create `*.users.<root>` accounts.
  - The power to sign anything as the relayer, including **deleting its other keys**.
  - It **cannot** touch user accounts (a parent has no rights over sub-accounts ✅), Pots, DAOs, the hub or the token.
- **Response:**
  1. **Stop:** set the Vercel flag that disables `/api/relay` (architecture `FLAG_*`), or remove `RELAYER_KEYS` and redeploy.
  2. **Race to revoke, from the recovery key in the custody account:** `near account list-keys $RELAYER network-config $NET now`, then delete **every** pool key and any unknown key in one call: `near account delete-keys $RELAYER public-keys ed25519:a…,ed25519:b…,… network-config $NET sign-with-legacy-keychain send`.
  3. **Drain to safety:** `near tokens $RELAYER send-near $ROOT '<balance − 0.5> NEAR' network-config $NET sign-with-legacy-keychain send`.
  4. **Rotate:** run §3.6 again with 8 fresh keys, update `RELAYER_KEYS`, redeploy and re-enable.
- **If the attacker deleted the recovery key first:** the account is lost.
  - Create `users2.<root>` as the new relayer and parent, and update `RELAYER_ACCOUNT_ID` and the allowlist.
  - Existing users and personas keep working: their keys are their own.
  - New sign-ups and new pool personas go under `users2`.
- **Afterwards:** audit with the FastNEAR Tx API (D-32). Preview keys are separate, so preview is unaffected.

### 5.2 A treasury key leaks (`TREASURY_KEYS`)

- **Blast radius:** ≤ $1M of test dollars and ≤ 1 NEAR. The cold `reserve` holds the rest, so faucet supply survives (no mint exists, D-11).
- **Response:**
  1. Revoke with the recovery key in the custody account (same as §5.1).
  2. Rotate `TREASURY_KEYS`.
  3. Refill from `reserve` (§3.4 step 3, in reverse).

### 5.3 `DEMO_PERSONA_KEY` leaks

- **Blast radius:** the attacker can act as any pool or shared demo persona in demo Pots, with test money only. Rev 4: not in the reference Pot, whose personas hold no key after seeding.
- **Response:**
  1. Pause demo leasing (flag).
  2. Generate a new key and set it in Vercel. New pool and shared personas use it.
  3. Retire the existing pool Pots and reseed the shared Pot.
  4. Rev 4: nothing to rotate for the reference personas (no key).

### 5.4 The root / owner key leaks (`<root>`)

- **Blast radius:**
  - root's NEAR;
  - creating sub-accounts under root (squatting `pots-v2.<root>`);
  - the hub `owner` powers: pause, float, limits, the relayer list (rev4: each within a coded range; `owner` itself can't be changed). That is denial of service, plus bounded NEAR: an attacker can add their own account to `relayers` and have the hub sponsor up to `max_sponsored_pots_per_day` floats a day into Pots they control. The owner can't move USDC or change rules (contracts-spec §3.10, INV-15).
- **Response:**
  1. With the backup key, add a new key and delete the old one.
  2. Move NEAR out.
  3. If the attacker already called `set_config` (e.g. `paused: true`, or their own account in `relayers`), set it back once the key is recovered; pause the hub if they are draining floats. Pot USDC is never at risk. Groups can still close (`propose_close` ignores pause) or vote directly in their DAOs. Then deploy v2 under a **new root** if `<root>` itself is lost.
- **Prevention:** rev4: the root key lives only in the custody account or on a Ledger (§1.5), keep its balance small (top up from the grant source), and use a Ledger on mainnet.

### 5.5 A hub bug found after the lock

| Severity | Example | Response |
|---|---|---|
| **S1: funds at risk** | The hub can be tricked into creating or approving a transfer or join it shouldn't | (1) **Owner pause within minutes:** `near contract call-function as-transaction $HUB set_config json-args '{"patch":{"paused":true}}' prepaid-gas '30.0 Tgas' attached-deposit '0 NEAR' sign-as $ROOT network-config $NET sign-with-legacy-keychain send`. This blocks `create_pot`, `request_spend`, `join`, `add_invite`, `propose_rules`, sole-member `set_rules` and contributions. `propose_close`, `sync`, `retry_payout` and votes keep working. (2) README banner + limitation note. (3) v2 via §3.11 for new Pots. (4) Affected groups may vote `ChangePolicyRemoveRole{"role":"rulebot"}` in their DAO, which cuts the hub out for good and leaves a plain majority DAO. |
| **S2: liveness** | A flow fails or is refused wrongly; no funds at risk | App-side workaround (hide the flow, route around it). If it blocks the demo, v2 for new Pots (§3.11) and rebuild the demo pool there. |
| **S3: cosmetic / view** | A view returns a wrong derived number | Compute it client-side in `pot-sdk` from the raw fields; document it. |

**Token bug after the lock** (unlikely: vendored reference FT): `usdc` is immutable in the hub, so the fix is a new token `usdc2` **and** a v2 hub initialized with it. The old Pots keep their old token.

### 5.6 A DAO float or the hub runs low

- **A DAO's float runs low:** anyone can refill it with a plain transfer: `near tokens $ROOT send-near <dao> '0.1 NEAR' network-config $NET sign-with-legacy-keychain send`. This is the architecture's `after()` backstop. With per-proposal prepay it should be rare (contracts-spec §3.11).
- **The hub runs low** (`ERR_HUB_LOW_BALANCE`, alert `hub_low`): top it up the same way, which works after the lock. If NEAR runs out, first lower the demo-pool target (fewer seeded Pots), then lower `limits.max_sponsored_pots_per_day` with `set_config`. The float is already at its 0.05 NEAR floor (rev4: `dao_float` ∈ [0.05, 0.5], contracts-spec §3.10).

---

## 6. Open questions

1. **H-05 root name:** keep it ≤ 10 chars (§1.4).
2. ~~H-02: 90 vs 75 NEAR depends on OBJ-2.~~ Resolved: 75 NEAR (D-05 Rev 2 adopted the 0.05 float). The lean plan needs ≈ 45.
3. ~~`reserve.<root>`: accept it?~~ Resolved: D-02 Rev 2 includes it.
4. ~~Mainnet hub after judging: lock it or delete it?~~ Rev 4: right after the clip (C-22), close the clip Pots, then lock it; deleting it to reclaim ≈ 3 NEAR stays a human call (§3.12).
5. ~~Persona key rotation (§5.3).~~ Rev 4: moot; the reference personas hold no key after seeding, and pool and shared personas are simply re-created.

No objections beyond those in [contracts-spec.md](contracts-spec.md) §13.

## Sources (accessed 2026-10-21)

- KB: [accounts-onboarding.md](../kb/accounts-onboarding.md) (creation charge, 0-NEAR accounts, 0.0085 onboarding, faucet 10 NEAR, parent rules), [meta-tx-relayer.md](../kb/meta-tx-relayer.md) (deposits paid by the relayer, key pool, gas prepay at 1e9, per-action costs), [fungible-tokens-usdc.md](../kb/fungible-tokens-usdc.md) (FT example `new`, storage 0.00125, mainnet USDC id), [contracts-toolchain.md](../kb/contracts-toolchain.md) (near-cli-rs 0.30.1, legacy keychain rule, build output paths), [sputnik-dao.md](../kb/sputnik-dao.md) (global hashes), [near-auth.md](../kb/near-auth.md) (MPC sign cost), [backend-infra.md](../kb/backend-infra.md).
- Plan: [decisions.md](decisions.md) Rev 1 (D-02, D-11, D-13, D-21, D-24, D-33, D-61, D-63), [contracts-spec.md](contracts-spec.md), [architecture.md](architecture.md) §2.3, §3.15, §4.6, §4.7, O-1, O-2.
- Local near-cli-rs 0.30.1:
  - `--help` and non-TTY parse checks for every command shape above;
  - read-only `list-keys` on a keyed testnet DAO (one row) and on keyless `nearhub-dao.sputnik-dao.near` (an empty table);
  - read-only `view-account-summary` showing "Global Contract (by Hash: SHA-256 checksum hex)".
