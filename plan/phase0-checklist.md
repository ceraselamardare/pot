# Phase 0 checklist (Oct 21-31)

> Owner: planner. Written 2026-10-21 (Wed). Covers everything humans do before the event opens on Sun Nov 1, 00:00 UTC (02:00 EET).
> Binding inputs: [decisions.md](decisions.md) Rev 4 §9 (H-01…H-17), [accounts-and-deploy.md](accounts-and-deploy.md) §1.4, §2, §3.1, [hallway-test.md](hallway-test.md), [ux-spec.md](ux-spec.md) §12-§13, [frontend-architecture.md](frontend-architecture.md) §15, [../spikes/near-auth/README.md](../spikes/near-auth/README.md), and the KB "Open questions / needs a human" sections.
> **Rule of Phase 0:** accounts, sign-ups, DNS, Figma, prototypes, hallway tests, toolchain installs and reading are fine. Product code, scaffolding and a repo with code are not (D-63, §6). Agents never contact anyone, sign transactions or sign up for services; every item below is a human action.
> H-13…H-16 are new human items added here (they were open questions in the KB). Rev 3: decisions.md §9 now lists them too.
> **Rev 4 (2026-10-21, security review, decisions.md Revision 4):** H-01 now asks for a **dedicated** NEAR Auth client id; new **H-17** key-custody set-up (Oct 23); the token is locked on **Nov 2** right after the mint (C-05); the MPC `sign` deposit is proven to be 1 yocto, so spike §C only confirms it; H-02 asks for ≈ 74 NEAR; Cerasela's list gains #26-#28.
> **Rev 6 (2026-10-21, brand; decisions.md Revision 6):**
> - Cerasela's "Figma tokens + logo" item is **done**: the logo, the web icons and the Day/Night tokens are in [../brand/](../brand/README.md) (D-67), and the 256×256 logo for the H-01 form is `brand/web/pot-mark-256.png`.
> - **H-06** (product name "Pot") is decided; the submission `projectName` stays open.
> - **H-10** loses palette and font (§5 #5, #6).
> - The Oct 23 design slot goes to the component kit and the MVP flows.

---

## 0. Timeline, ordered by lead time and deadline

| By | Item | Owner | Why this early |
|---|---|---|---|
| **Wed Oct 21 - Thu Oct 22** | H-11 OS check | P1 | blocks nothing, takes 1 min |
| Thu Oct 22 | H-06 product name + H-05 `<root>` (≤ 10 chars) + the Vercel project name. Rev 6: the product name is decided ("Pot", D-62); still due are the submission `projectName` (H-06/H-14), `<root>` and the project name | Cerasela + P1 | everything below needs a name (account ids, domain, the origin to whitelist, the logo) |
| Thu Oct 22 | Password vault "Pot hackathon" (§4.1) | P1 | keys created from today on go straight into it |
| Thu Oct 22 | H-07 domain bought (DNS can take up to 72 h; it also gives H-01 a stable origin) | P1 | longest DNS lead |
| Thu Oct 22 | **H-01 NEAR Auth request for a dedicated testnet client id** (rev4; a whitelist on the shared client is the fallback) **+ mainnet Typeform sent** | Cerasela | unknown lead time; decision on Nov 8 |
| Thu Oct 22 | **H-02 testnet NEAR requested** (organizers, DevRel) | P1 | unknown lead time; 33 NEAR needed on Nov 1 |
| Thu Oct 22 | H-15 questions to the organizers (two tracks, KYC) | Cerasela | answers affect the submission identity |
| Oct 22-24 | **Manual NEAR Auth spike** (§2) | Cerasela (P1 helps on Android) | decides H-12 and Pair from Safari; confirms the 1-yocto MPC deposit (rev4: already proven on chain) |
| Fri Oct 23 | **H-17 key-custody account** set up (rev4), then H-03 `<root>.testnet` reserved **from it** | P1 | the root key must never land in the agents' OS user; 10 faucet NEAR; account ids depend on it |
| Fri Oct 23 | ✅ **Done Oct 21 (rev6).** Figma tokens + logo (256×256, needed by the H-01 form): tokens in `brand/tokens.json`, logo in `brand/logo/`, the 256×256 PNG at `brand/web/pot-mark-256.png` (rendered from `pot-mark.svg`) | Cerasela | — |
| Sun Oct 25 | H-10 Cerasela's decisions (§5) and H-12 device-key adoption | Cerasela, P1 | feed the Figma flows and hallway round A |
| Sun Oct 25 | H-14 team email (unique to Pot) | Cerasela | identity for sign-ups below |
| Mon Oct 26 | Clickable Figma prototype; devices + test Google account ready | Cerasela | hallway round A starts Oct 27 |
| Tue Oct 27 | H-01 follow-up (if no answer) | Cerasela | — |
| **Wed Oct 28 (latest)** | H-07 Resend DNS records in place (≥ 3 days before Nov 1) | P1 | up to 72 h verification |
| Wed Oct 28 | H-04 Vercel tier + GitHub owner + repo visibility | both | Neon and env setup depend on it |
| Oct 27-31 | Hallway round A (5 people), synthesis, ux-spec copy fixes | Cerasela | fixes must land before Nov 1 |
| Oct 29-31 | Vercel team/project + Neon from the Marketplace (no code, no deploys) | P1 | readiness checklist |
| Fri Oct 30 | Toolchains on both laptops (§4.4) | both | Day 1 starts at 09:00 |
| Sat Oct 31 | H-08 1Click partner key (optional); H-09 bot usernames (optional); VAPID keys; H-14 X account confirmed | P1, Cerasela | small items |
| **Sat Oct 31, 20:00** | **Go/no-go review** (§7): ≥ 33 testnet NEAR in hand, H-01 status, spike result, Figma final | both | Day-1 plan depends on it |
| Sun Nov 1, 09:00 | Readiness checklist ([implementation-plan.md](implementation-plan.md) §8) + H-13 HACKATHON.md re-fetch | both | — |
| Wed Nov 4, 09:30 standup | H-16 FastNEAR key: buy only if server reads hit 429s after the first real traffic (Nov 3); re-check after B-19 on Nov 11 | P1 | spends money (a human decision) |
| Mon Nov 2 | **Token lock** (rev4, runbook §3.4 step 5, task C-05): right after the deploy, the mint and the move to `reserve`, a human deletes `usdc.<root>`'s only key from the custody account and checks `list-keys` is empty | P1 + a human | the token key could rewrite every balance; it is never needed again |
| Sun Nov 8 | H-08 mainnet funds in place (5 NEAR + ≈ $25 USDC on Base) | Cerasela | mainnet clip on Nov 10-11 |
| Thu Nov 12 | H-14 mainnet payout account confirmed (eyeballed as mainnet) | Cerasela | submission JSON |

---

## 1. Human actions

Each item: owner, deadline, exact steps, links (from the KB), and the fallback if it doesn't happen. Defaults come from decisions.md §9.

### H-01 · NEAR Auth: get a dedicated testnet client id (preferred) or a whitelist; submit the mainnet Typeform
- **Owner:** Cerasela. **Send by:** Thu Oct 22. **Follow up:** Oct 27, Nov 3. **Decision:** Sun Nov 8, 18:00 (G4, D-22).
- **Why:** the shared testnet client `np8paqIpMWmNbzT4xAvOOapZBjsOpptl` accepts callbacks only from `http://localhost:3000` (root path) and `https://example.fast-auth.com`. `*.vercel.app`, other ports, `127.0.0.1` and `/callback` paths get 403 "Callback URL mismatch" ([../kb/near-auth.md](../kb/near-auth.md)).
- **Steps:**
  1. Fix the exact origins first (H-06, H-07): production `https://app.<domain>` (or `https://<project>.vercel.app` if there is no domain), one stable preview alias (e.g. `https://preview.<domain>` as a Vercel branch domain) and `http://localhost:3000`. Avoid wildcard preview URLs: ask for exact origins.
  2. Contact the NEAR Auth / Peersyst team. Channels ⚠️ (the KB names the team, not a channel): an issue on <https://github.com/Peersyst/fast-auth>, the NEAR DevRel or hackathon organizer channels on NEAR Discord, and the contact field of the mainnet form. Ask for: (a) **a dedicated testnet `clientId`** for our origins (rev4: preferred; on the shared client every other whitelisted origin could replay its users' ID tokens to us, review-security M-1), or, as the fallback, our origins added to the shared testnet client; (b) callback = origin root `/`, allowed web origins, allowed logout URLs; (c) app name "Pot" (or the H-06 name) and our logo (rev6: `brand/web/pot-mark-256.png`, 256×256), so the approval screen stops saying "Example"; (d) testnet SLA for Nov 1-18; (e) the timing of "D13" (hashed `sub`), because a change to `sub` changes every derived MPC key (R-21).
  3. Submit the mainnet form <https://form.typeform.com/to/VWHjf3HV>: exact HTTPS callback, logout and web-origin URLs, a 256×256 logo (rev6: `brand/web/pot-mark-256.png`), MAU bracket, contact email (H-14). This is Phase 3, but its lead time is unknown.
  4. Log the date and the channel in the team notes; add the answer to [risk-register.md](risk-register.md) R-01.
- **Fallback (D-22, always shipped):** the hosted app offers (a) labeled `/demo` personas with server-held testnet keys and (b) NEAR Connect (gasless with Meteor, Intear, Ledger, NEAR CLI). The video shows NEAR Auth on `localhost:3000`.
- **Rev 4:** whatever H-01 yields, NEAR Auth goes live on a hosted origin only after the device-bound OIDC nonce (B-20, F-27) is in. With only a whitelist on the shared client, the residual replay risk is accepted for testnet (risk-register R-36).

### H-02 · Testnet NEAR (≈ 74 NEAR under D-05 Rev 2 and Rev 4)
- **Owner:** P1. **Ask by:** Thu Oct 22. **Gate:** ≥ 33 NEAR usable on Nov 1 morning (the first runbook deploy, C-05 on Nov 2 AM, needs ≈ 32.1), ≥ 55 by Nov 6 (prod hub 20), 75 by Nov 10 (top-ups, contingency).
- **Budget basis:** [accounts-and-deploy.md](accounts-and-deploy.md) §2.3, the "Plan" column: rev4 64.2 + 15 % buffer ≈ 74 (Rev 3: 67.2 → 75). The 1-yocto MPC deposit frees 6 NEAR that sat parked, and the nightly shared Pots are now budgeted. About 13 NEAR of the total is parked or refundable. Lean minimum ≈ 45.
- **Steps:**
  1. Ask the NEAR HACKATHON organizers and NEAR DevRel for a testnet grant of ≈ 74 NEAR (asking for 75-80 is fine) to `<root>.testnet` (after H-03).
  2. In parallel: near-faucet.io (captcha, ≈ 10 NEAR per request; <https://docs.near.org/getting-started/faucet>).
  3. Only with an explicit human OK (decisions.md H-02): create extra faucet accounts with `near account create-account sponsor-by-faucet-service <name>.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create` (10 NEAR each, measured) and sweep them with `near account delete-account <name>.testnet beneficiary <root>.testnet network-config testnet sign-with-legacy-keychain send`.
  4. After the spike (§2), sweep the leftover throwaway spike accounts the same way (≈ 4.2 NEAR in `potspike-relay-yoqw.testnet`, ≈ 2.6 in `potspike-dao-svuw.testnet`, plus the new `potspike-auth-*` account). Sweeping moves NEAR only; no spike code is touched.
- **Fallback:** the lean plan (≈ 45): preview hub funded with 4 NEAR, preview capped at 30 Pots, demo pool of 50 leases, no `pots-v2` reserve (the MPC deposit is already 1 yocto, D-21 Rev 4).

### H-03 · Reserve the root account names
- **Owner:** P1. **Deadline:** Fri Oct 23 (after H-05 and H-17).
- **Steps (rev4: in a terminal logged in as the custody user of H-17, never in the OS user that runs agents):**
  1. `near account create-account sponsor-by-faucet-service <root>.testnet autogenerate-new-keypair save-to-legacy-keychain network-config testnet create` (accounts-and-deploy §3.1). Never `save-to-keychain` (the macOS keychain is excluded).
  2. `near account view-account-summary <root>.testnet network-config testnet now` → ≈ 10 NEAR.
  3. Back up the custody user's `~/.near-credentials/testnet/<root>.testnet.json` into the vault (§4.1). Then check that the agents' user `~/.near-credentials/testnet` holds no such file.
  4. Mainnet `<root>.near` for the clip: a human creates it in a wallet, ideally on a Ledger (accounts-and-deploy §1.3). Any time before Nov 8.
- **Only these two accounts are created before Nov 1.** Everything else is created by the runbook once the code exists (accounts-and-deploy §1.4, D-63): `usdc`, `users`, `treasury`, `reserve` and `preview.*` on Nov 2 (C-05), the prod hub `pots` on Nov 6 (C-13).
- **Fallback:** if the name is taken, the next H-05 candidate (keep ≤ 10 chars).

### H-04 · Vercel tier, repo owner and visibility
- **Owner:** both. **Deadline:** Wed Oct 28.
- **Facts** ([../kb/backend-infra.md](../kb/backend-infra.md) R1): Hobby is non-commercial, cannot deploy a private repo in a GitHub org, deploys only the Hobby owner's commits from a private repo, runs crons once a day, keeps logs for 1 h. Pro costs $20 per seat per month; the 14-day trial started Nov 1 ends Nov 15, **before judging (Nov 16-18)**.
- **Recommended default:** **Pro for both seats, paid for November** (≈ $40), private repo in a GitHub org until the human makes it public on Nov 13. Alternative: Hobby + a **public** personal repo from day 1 (free GitHub Actions minutes; the design runs on Hobby).
- **Steps:** create the Vercel team; reserve the project name (it fixes `<project>.vercel.app`); decide the GitHub owner; note who holds admin on both; enable Protection Bypass for Automation once the project exists (the secret goes to GitHub as `VERCEL_AUTOMATION_BYPASS_SECRET` on Nov 1); install Neon from the Vercel Marketplace (Free, `iad1`, branches `main`, `preview`, `dev`; data-model §6).
- **Fallback:** Hobby + public repo; if a private repo is kept on Hobby, only the owner's commits deploy (P1 merges through the owner).

### H-05 · Root account name `<root>`
- **Owner:** Cerasela + P1. **Deadline:** Thu Oct 22.
- **Rule:** ≤ 10 characters, so 32-char slugs fit under `pots.preview.<root>.testnet` (accounts-and-deploy §1.4). Follows the product name (H-06). Pick two fallbacks.
- **Fallback:** `potapp` (the docs' example) if free.

### H-06 · Product name (PotLock collision)
- **Owner:** Cerasela. **Deadline:** Thu Oct 22.
- **Facts:** PotLock calls its quadratic-funding rounds "Pots", and NEAR judges know PotLock ([../kb/competitors-ux-patterns.md](../kb/competitors-ux-patterns.md)). The submission `projectName` must be unique, case-insensitive, and the first team to submit a name wins it ([../kb/hackathon-rules.md](../kb/hackathon-rules.md)).
- **Decide:** the product name (default "Pot") **and** a distinctive submission `projectName` with a fallback. Only humans choose these values.
- **Fallback:** "Pot" in the app; a longer, distinctive submission name.
- **Status (rev6, Oct 21): the product name is decided: "Pot"** (D-62, D-67). The brand's lowercase wordmark "pot" always sits beside the mark, which carries recognition because the word is common. **Still open (humans only):** the unique submission `projectName` and its fallback (H-14).

### H-07 · Domain + Resend DNS
- **Owner:** P1. **Buy by:** Thu Oct 22. **DNS in place by:** Wed Oct 28 (verification "often within 15 minutes… occasionally up to 72 hours", [../kb/notifications.md](../kb/notifications.md) N3).
- **Uses:** a stable origin for H-01; `VAPID_SUBJECT=mailto:push@<domain>`; the Resend sending subdomain `notify.<domain>`; a privacy-policy URL if the Telegram bot happens.
- **Steps:** buy the domain (Vercel DNS makes Resend auto-configuration easier); create the Resend account; add `notify.<domain>`; add MX `send.notify`, TXT SPF `send.notify`, TXT `resend._domainkey.notify`, `_dmarc.<domain>` `v=DMARC1; p=none`; wait for "verified"; store `RESEND_API_KEY` in the vault.
- **Fallback (default in decisions.md):** no email; push + in-app only; `VAPID_SUBJECT` = a team inbox `mailto:`.

### H-08 · 1Click partner key (optional) and mainnet funds for the clip
- **Owner:** P1 (key), Cerasela (funds). **Key by:** Sat Oct 31. **Funds by:** Sun Nov 8.
- **Key steps (5 min):** sign up at <https://partners.near-intents.org> (email, Google or GitHub) with the team email → create an organization → API keys. Note any KYB prompt. Store as `ONECLICK_API_KEY` in the vault (server-side only). Accepting the ToS binds the team ([../kb/intents-1click.md](../kb/intents-1click.md)).
- **Funds:** `<root>.near` with **5 NEAR** (accounts-and-deploy §2.5) and **≈ $25 USDC on Base** in a wallet a human controls (Base p50 29 s; Arbitrum 18.5 s as the alternative). Ledger recommended for `<root>.near`.
- **Fallback:** anonymous API (works today, 1 bp observed fee); no mainnet clip, the testnet simulator is labeled "simulated" in the video.

### H-09 · Telegram bots via BotFather (Phase 2, optional; first in the cut order)
- **Owner:** Cerasela. **Deadline:** Sat Oct 31 (only to reserve the usernames).
- **Steps** ([../kb/notifications.md](../kb/notifications.md) BotFather steps): `/newbot` twice, `<Name>Bot` (prod) and `<Name>DevBot` (preview); usernames are permanent; tokens into the vault only; `/setjoingroups` Enable; keep privacy Enabled; set a privacy-policy URL (needs H-07); **never** `/newapp`, a Main Mini App, a web-app menu button or Guest Mode.
- **Fallback (default):** no bot; "Post in Telegram" is a plain share link.

### H-10 · Cerasela's product and design decisions
- **Owner:** Cerasela. **Deadline:** Sun Oct 25 (before the Figma flows are final and hallway round A starts).
- **Items and defaults:** §5 below.
- **Fallback:** the defaults in §5 (D-60, D-61, ux-spec).
- **Status (rev6):** palette and font are decided by the brand (§5 #5, #6 closed; D-67, D-45). The rest stays open. Added: review the "(rev6)" ux-spec edits and the brand calls in [brand/README.md](../brand/README.md) §12 (frontend-architecture §15 Q16).

### H-11 · Teammates' OS
- **Owner:** P1. **Deadline:** Thu Oct 22.
- **Check:** the near-workspaces sandbox runs on arm64 Macs and Linux, **not Intel Macs**; Windows needs WSL2 ([../kb/contracts-toolchain.md](../kb/contracts-toolchain.md)).
- **Fallback:** sandbox tests run in CI only for whoever is on an Intel Mac (D-12).

### H-12 · Adopt the device-key model (D-21)
- **Owner:** Cerasela + P1. **Deadline:** Sun Oct 25, after §2 parts B-C.
- **Default:** adopt (NEAR Auth MPC key = recovery; a non-extractable WebCrypto device key signs every action with no popup). The spike's approval-screen timings (≈ 9 s MPC, raw JSON, "Example" branding) are the evidence.
- **Fallback:** per-action NEAR Auth signing (≈ 15-25 s and a popup per action). Not recommended; it breaks P-5's moment.

### H-13 · Re-read HACKATHON.md (added)
- **Owner:** Cerasela. **When:** Sat Oct 31 or Sun Nov 1 morning, Sat Nov 7, Fri Nov 13 morning.
- **Steps:** fetch <https://nearhackathon.com/HACKATHON.md>, diff it against [../kb/hackathon-rules.md](../kb/hackathon-rules.md), update [submission-plan.md](submission-plan.md) if anything changed. Never POST to `/api/applications` before the event (403, and one attempt only).

### H-14 · Submission identity (added)
- **Owner:** Cerasela. **Deadlines:** team email by Oct 25; X account confirmed by Oct 31; mainnet payout account by Nov 12.
- **Decide (humans only, never placeholders):** `projectName` (H-06), `leadName`, a team email unique to Pot, the X account that posts the demo (does it have X Premium? Check the video length in its composer: docs say 20 min for default accounts, third-party guides say 2:20), and the **mainnet** `nearAddress` for the payout, created by a human in a wallet. The regex accepts `.testnet` names, so check by eye that it is mainnet.

### H-15 · Questions to the organizers (added)
- **Owner:** Cerasela. **Ask by:** Thu Oct 22 (agents must not contact anyone).
- **Ask:** can one project win prizes in two tracks? Are KYC or tax forms required at payout? ([../kb/hackathon-rules.md](../kb/hackathon-rules.md) open questions).

### H-16 · Paid services decision (added)
- **Owner:** P1. **Deadline:** the Nov 4 standup, after the Nov 3 integration (not Phase 0); re-check on Nov 11 after the B-19 load test.
- **Decide:** buy a FastNEAR Dev key ($69/month, <https://dashboard.fastnear.com>) only if server-side reads show 429s from Vercel's shared egress IPs (R-04).

### H-17 · Key-custody account (added by Rev 4, review-security H-4)
- **Owner:** P1 (and whoever else will sign). **Deadline:** Fri Oct 23, before H-03. ≈ 30 min.
- **Why:** the plan's agents run shell commands in the macOS user that runs Claude Code. A `Bash` `cat` or a prompt-injected agent bypasses the Read deny rules, and before the Nov 12 lock the hub key can approve transfers in every DAO and push DAO code; the token key (until Nov 2) can rewrite every balance (decisions.md D-05, D-13, D-63).
- **Steps:**
  1. Create a **separate standard (non-admin) macOS user**, e.g. `potkeys`; `chmod 700` its home. Install near-cli-rs 0.30.1 for it. Or use a **Ledger** (`sign-with-ledger`) for `<root>` and the mainnet keys. Or keep keys in the vault and import on demand into that user, deleting them after use.
  2. From now on, every key of the runbook except the Vercel hot keys is created and used **only** there: `<root>` (H-03), the hub, the token (until its lock on Nov 2), `reserve`, the relayer and treasury recovery keys, the preview namespace keys, the mainnet keys. Signing runs in a terminal logged in as that user, never through `sudo` from an agent's shell.
  3. In the agents' user: `ls ~/.near-credentials/testnet` must list none of them (re-checked in X-01 and before every deploy). Agents only ever get the **preview relayer keys**, through env vars.
  4. Back up the custody keys encrypted in the vault (§4.1).
- **Fallback:** a Ledger for `<root>` and the mainnet keys, and the vault with import-on-demand for the rest. Never: keys in the agents' `~/.near-credentials`.

---

## 2. The manual NEAR Auth spike (Oct 22-24)

The agent-side checks are done ([../spikes/near-auth/RESULTS.md](../spikes/near-auth/RESULTS.md)); the human run is pending. Follow [../spikes/near-auth/README.md](../spikes/near-auth/README.md) sections A-F and fill in RESULTS.md. Testnet only; the spike stays throwaway and nothing from it is copied into the product.

| When | Part | Who | Device | What decides |
|---|---|---|---|---|
| Thu Oct 22, 1 h | 0 setup + A pre-flight + B login methods (Google, email + password, passkey; 3 runs each; redirect once; reload; same-account determinism) | Cerasela | Mac, Chrome, `http://localhost:3000` (never `127.0.0.1`) | P-1 taps and median seconds; H-12 |
| Thu Oct 22, 45 min | C account creation + relayed delegate (3 samples) + negative cases (> 70 s expiry, Deny, double relay) | Cerasela | Mac | relay validation rules (60 s JWT window, 7,168 B cap); the MPC deposit: the spike relay sends 1 yocto. Rev 4: 1 yocto is already proven on chain (tx `FzULQ33c…`, D-21), so this run only **confirms** it and blocks nothing |
| Fri Oct 23, 30 min | **D iPhone**: `https://example.fast-auth.com` in a Safari tab, then installed to the Home Screen ("Open as Web App" on): login popup, approval popup, passkey, relaunch | Cerasela | iPhone, iOS 26 (and iOS 27 if a device is available) | **outcome a/b/c** → whether "Pair from Safari" (D-21 fallback) becomes Phase-2 must-have |
| Fri Oct 23, 30 min | **E Android**: USB port forwarding (`chrome://inspect` → 3000, 3001), install the PWA, popup + redirect login, approve + relay inside the installed app | Cerasela + P1 | Android phone with Chrome | Android install path |
| Sat Oct 24, 20 min | F NEAR Connect fallback with Meteor or Intear (testnet account created beforehand) | Cerasela | Mac | gasless wallet path (D-22 b) |

**Record** (README "What to record" table): taps and seconds per method; the approval screen screenshot and text; `approvePopupMs`, `mpcSignTx`, `metaTx`, `total`, `yoctoBurnt`; `jwtLifetimeSec`, `jwtBytes`, `signPayloadBytes`; nearblocks links; iOS outcome a/b/c for popup, approval and passkey; Android outcomes; wallet outcomes.

**Decisions this produces (by Sun Oct 25):**
1. H-12 confirmed (device key) or not.
2. iOS installed outcome **a** → no pairing work; **b or c** → B-15 + the F-23 pairing UI move up the Phase-2 list, and the push demo on iPhone needs a paired device or the R-15 decision.
3. MPC deposit: rev4: already decided (`MPC_SIGN_DEPOSIT_YOCTO = 1`, no 2 NEAR slots, D-21); the spike confirms it.
4. P-1 timing baseline for the README and the video.

Cleanup: stop both terminals; leave the `u-xxxx` accounts; never commit `.keys/`; sweep the relayer's leftover NEAR into `<root>` (H-02 step 4) once `<root>` exists.

---

## 3. Cerasela's design work (no code)

All in Figma or FigJam. Nothing is written as code before Nov 1.

| By | Deliverable | Source | Notes |
|---|---|---|---|
| Fri Oct 23 | ✅ **Done Oct 21 (rev6).** **Tokens as Figma variables**, named like the CSS variables (`--pot-canvas`, `--pot-primary`, type scale, spacing, radii, shadows, motion durations) so the Nov 1 import into `globals.css` is mechanical. Now: the brand's Day + Night tokens in `brand/tokens.json`, which F-01 turns into CSS with a generator. Figma variables are optional; if made, they copy `tokens.json` names (`--pot-ground`, `--pot-brand`, …) | ux-spec §7, frontend-architecture §7.1 | light theme only; contrast ratios already computed (rev6: Night in scope; ratios re-computed for both themes, brand/README §3) |
| Fri Oct 23 | ✅ **Done Oct 21 (rev6).** Logo 256×256 + app icon set (192, 512, 512 maskable, 180 apple-icon, 96 monochrome badge, SVG). Now in `brand/`: mark, small cut, lockups, wordmark, glyphs; favicon SVG + ICO; the 180, 192, 512 and maskable 512 PNGs; `og-image.png`; and `web/pot-mark-256.png` for the H-01 form. Only `badge-96.png` is left: F-23 derives it from the glyph | frontend-architecture §8.1 | the logo is needed for the H-01 form |
| Sat Oct 24 | Component kit: shadcn base-nova equivalents + the custom components (BalanceHero, GoalBar, ActivityFeed/FeedItem, RequestCard, ApprovalMeter, RulePreview, RuleSentence, Keypad, SourcePicker, ResultCard, StatusChip, ConfirmStep, AccountSetupProgress, MemberRow, RefundTable, InviteCard, InstallCoach, banners, EmptyState). Rev 6: built on the brand tokens (the artifact has no component bundle yet); it can start on Oct 23 now that the token slot is free | ux-spec §3, frontend-architecture §7.5 | every status = icon + word + colour |
| Mon Oct 26 | **MVP flows**: invite landing (+ in-app variant, invite errors), setup progress, "You're in", Pots home, Pot (Activity, read-only Members and Rules), Add money, Spend + result card beats, Approve sheet (all states incl. own/decided/expired/failed), Requests, Create (3 steps) + Share, `/demo` page + DemoBanner, error/offline/relayer banners, empty states, skeletons | ux-spec §4, §6 | 390×844 first |
| Mon Oct 26 | **Clickable prototype** for hallway round A with simulated delays: setup 6 s, checking 1.2 s, sending 2 s; a notification overlay for T5 | hallway-test §0, §10 | — |
| Oct 27-31 | **Hallway round A**: 5 participants (≥ 2 iPhone, ≥ 2 Android, ≥ 1 aged 35+, organizer and member types), tasks T1-T7, observation sheets, SEQ | hallway-test §2-§7 | P1 takes notes where possible |
| Sat Oct 31 | Synthesis (≤ 2 h): top-5 fixes applied in Figma; "Results: round A" appended to hallway-test.md; ux-spec §5 copy and §6 budgets updated | hallway-test §9 | decision rules in hallway-test §6 |
| Sat Oct 31 | **Review the (rev3) and (rev4) edits in ux-spec** (rev6: and the "(rev6)" brand edits, with [brand/README.md](../brand/README.md) §12) (rev4: the `new_member` preview and approve copy, and the Share sheet's "share it only in your group chat" and joins-left copy, from the security review). Rev 3 review made the minimal consistency edits, each marked "(rev3)"; see [implementation-plan.md](implementation-plan.md) §10 #11-#18: `/j/<slug>?i=…#…` and multi-use invites; Base UI wording; "…without asking" in the per-person limit copy; F4 approvals per D-61; 7-day expiry; `xc.*` copy per D-50; no balances in push; Apple marked mainnet-only; the new `landing.cta.dev` and `xc.instructions.min` keys. Then accept or reword the ⓟ copy keys (frontend-architecture §15 Q11) and remove the "(rev3)" markers | Cerasela | so Claude Code builds from consistent copy |
| Phase 2 screens (any time before Nov 8) | Close sheet + RefundTable + closed state, rules editor, DepositStepper (5 steps + edge states), install coach (iOS 26 "•••", iOS 27 "Page Menu", Android prompt and menu, in-app), push pre-prompt, ConfirmStep, Advanced room, OG image template 1200×630 (rev6: done as `brand/web/og-image.png`; the per-invite variant follows its look, brand/README §11) | ux-spec §4.6, §4.8, §4.14, §9, §10 | — |
| Before Nov 7 | Video storyboard frames (FigJam) and README screenshot frames | [submission-plan.md](submission-plan.md) §2 | — |

---

## 4. Accounts, keys and setup

### 4.1 What to reserve, and when

| Account / service | When | Who | Notes |
|---|---|---|---|
| Password vault "Pot hackathon" (shared, encrypted) | Oct 22 | P1 | holds root key backups, API keys, VAPID private keys; never paste keys elsewhere |
| Key-custody macOS user (or Ledger) | Oct 23 | P1 | H-17 (rev4): holds every full-access key except the Vercel hot keys; agents' user holds none |
| `<root>.testnet` | Oct 23 | P1 | H-03, created from the custody user; the only testnet account before Nov 1 |
| `<root>.near` (mainnet, Ledger recommended) | before Nov 8 | Cerasela | H-03, H-08; funded with 5 NEAR by Nov 8 |
| Mainnet payout `nearAddress` | before Nov 12 | Cerasela | H-14; may differ from `<root>.near` |
| Team email | Oct 25 | Cerasela | H-14; used for sign-ups below |
| Domain + Resend | Oct 22 / Oct 28 | P1 | H-07 |
| GitHub owner (org or personal) | Oct 28 | both | H-04; the repo itself is created on Nov 1 |
| Vercel team + project name; Neon via Marketplace | Oct 28-31 | P1 | H-04; no code deployed |
| 1Click Partner Portal | Oct 31 | P1 | H-08, optional |
| BotFather usernames | Oct 31 | Cerasela | H-09, optional |
| X account that will post | Oct 31 | Cerasela | H-14 |
| Test Google account (hallway round B, spare phone) | Oct 26 | Cerasela | hallway-test §3 |
| Meteor and/or Intear testnet wallet accounts | Oct 23 | Cerasela | spike §F; NEAR Connect tests |
| FastNEAR dashboard | after Nov 3, only if needed | P1 | H-16 |

Created **on Nov 2** by the runbook, not before: `usdc`, `treasury`, `reserve`, `users`, `preview` and its children; `pots.<root>` on Nov 6 (accounts-and-deploy §3.2, §3.5).

### 4.2 Keys

- Create keys with near-cli-rs `save-to-legacy-keychain` or `print-to-terminal`; never `save-to-keychain` (accounts-and-deploy §1.5). Rev 4: only in the custody user (H-17), never in the OS user that runs agents.
- Back up the custody user's `~/.near-credentials/testnet/<root>.testnet.json` and any mainnet key file into the vault.
- **VAPID** (Oct 31, Cerasela or P1): run `npx web-push generate-vapid-keys --json` three times (dev, preview, prod); keep the private halves in the vault; never rotate the prod pair once users subscribe ([../kb/notifications.md](../kb/notifications.md)).
- `DEMO_PERSONA_KEY`, relayer and treasury key pools are generated on Nov 2 and Nov 6 by the runbook (§3.6), straight into Vercel Secret env vars.

### 4.3 Devices

iPhone on iOS 26 (and one on iOS 27 if possible), an Android phone with Chrome, cables for port forwarding, both charged on Nov 1. They are used for the spike (§2), QA-1 on Nov 3, hallway round B on Nov 7, and the video.

### 4.4 Toolchains (Oct 30-31, both laptops)

rustup with **1.93.0** + `wasm32-unknown-unknown`; cargo-near **0.22.0** via its installer; near-cli-rs **0.30.1**; Node **≥ 22.22.2**; pnpm **11**; Playwright browsers. Check with `--version` only: no `cargo near new`, no `create-next-app` before Nov 1. Do **not** install the October release candidates (D-12).

---

## 5. Decisions Cerasela must make (H-10 + frontend-architecture "Questions for Cerasela")

Decide by **Sun Oct 25**. If nothing is decided, the default applies.

| # | Decision | Default |
|---|---|---|
| 1 | Presets: Trip $100 instant / $200 per person (instant spends only); Club $50 / $150 + allowlist; Team $250 / $1,000 + allowlist | as listed (D-60, contracts-spec §6); MVP shows Trip only |
| 2 | Hero number | Pot balance; "Your share" and "You put in" under it |
| 3 | Login set and order | [Join with Google] + "More ways to join" (email, passkey, "I have a NEAR wallet"); no Apple on testnet (D-20). Rev 6 (brand mock + D-20): [Join with Google] (the one marigold button) + [Continue with email] as a visible secondary, then "More ways" (passkey if the tenant offers it, "I have a NEAR wallet"); Apple only if the tenant adds it (ux-spec §4.1) |
| 4 | Does the requester's own approval count? | **Yes, cast automatically** (D-61 Rev 2); also for the proposer of a close or rules change |
| 5 | Palette | ✅ **Decided (rev6):** the brand: marigold `#ffb320` + eggplant `#2b1b3a`, Day and Night (D-67). Was: terracotta `#B4441F` + honey |
| 6 | Font | ✅ **Decided (rev6):** Gabarito (display) + Figtree (text), both with `tnum` (D-45). Was: Geist, or Inter as a swap |
| 7 | Demo cast and amounts | Lisbon Trip; Maya, Sam, Leo; $150 each; $84 instant; $300 vote; $22.00 back each |
| 8 | iOS Dynamic Type makes the root 17 px (≈ 6 % larger than Figma) | accept |
| 9 | Approved → Sent beat when both arrive together | Approved ≥ 600 ms, then Sending ≥ 400 ms, then Sent |
| 10 | OG image | cover + name + avatars + "{n} friends", no balance (rev6: in the look of `brand/web/og-image.png`, which is the site default and the fallback) |
| 11 | Covers | emoji + gradient only (D-61) |
| 12 | Withdraw request | hidden; rev5: Phase 3, not built (decisions D-07) |
| 13 | Decline reason / Nudge | optional decline reason via `/api/notes` in the MVP; nudge cut by default |
| 14 | Inline approve with 4 s Undo for device-key users | on (Phase-2 polish, F-24) |
| 15 | Android install card after the first contribution | yes, same as iOS |
| 16 | Display name readable by page JS in `pot_hint` | OK (no secrets) |
| 17 | Display names visible to anyone with the Pot slug (architecture Q-4) | accept; first names; random slug suffix |
| 18 | Push pre-prompt in an Android Chrome tab before install (frontend O10) | no (D-42) unless you choose yes |
| 19 | Demo sessions may create Pots (api-spec §9.2 Q4) | yes, 1 per visitor per day |
| 20 | "Free: we cover the setup" once at Create | yes |
| 21 | New copy keys proposed by the specs (frontend §15 Q11, api-spec ⓟ) | accept |
| 22 | Desktop ≥ 768 px: every sheet as a Dialog, Create included | yes |
| 23 | Leaving a Pot before close (not supported in v1) | accept; refunds come at close |
| 24 | Push for demo sessions, so P-10 can be shown on a hosted iPhone without H-01 (R-15) | decide with P1 at G4 (Nov 8); default: allow behind a testnet-only flag (`FLAG_DEMO_PUSH`, pool leases only, api-spec §2.6) |
| 25 | Cover gradient: picked at Create or derived from the slug (data-model §8 Q1) | derived from the slug; no picker in the MVP (rev3) |
| 26 | Rev 4 (security review H-1): may a member who hasn't put money in make **instant** spends? | **no**: their requests go to the group (reason `new_member`, copy `preview.vote.new_member`); the demo is unaffected (everyone put in $150) |
| 27 | Rev 4 (M-7): add "The Pot name and amounts are public" to Create, and lock-screen-safe push bodies (no memo text)? | not in the MVP copy; the README discloses it |
| 28 | Rev 4 (M-6): show "If the Pot closed now you'd get back {x} of this" in the Add sheet when the Pot holds less than was put in? | no (Phase 3); README limitation |
| 29 | Rev 6: the brand calls in brand/README §12 (frontend-architecture §15 Q16): the Pot screen's marigold button, no burst for group approvals, two decimals in the hero, the disabled style, the Appearance copy | the defaults listed there (Add money; no burst; "$450.00"; 50 % opacity; Match my phone · Day · Night) |

---

## 6. What NOT to do before Nov 1

- **No product code** of any kind: no contract code, no Next.js app, no scripts, no `pot-sdk`.
- **No scaffolding:** no `cargo near new`, no `create-next-app`, no `shadcn init`, no `pnpm init` in a project folder.
- **No repo with code.** The GitHub repo is created on Nov 1 (D-63). Reserving an org name is fine.
- No copying anything from `spikes/` now or later (D-63).
- No product contract deploys and no product sub-accounts: only `<root>.testnet` and `<root>.near` exist before Nov 1 (accounts-and-deploy §1.4). Don't create `lisbon-trip` or any DAO.
- No Vercel deployments and no Neon schema or migrations.
- No POST (or test call) to `https://nearhackathon.com/api/applications` (403 before Nov 1, and a submission can't be edited).
- No public posts about Pot; the X demo post happens on Nov 13.
- No release-candidate toolchains (near-sdk 5.30-rc, cargo-near 0.23-rc, near-workspaces 0.24-rc) (D-12).
- No keys in chat, docs, issues or prompts; no `save-to-keychain`.
- Agents: no contacting people, no sign-ups, no signing (D-63).

---

## 7. Go/no-go review (Sat Oct 31, 20:00)

| Check | Pass | If not |
|---|---|---|
| Testnet NEAR | ≥ 33 usable by `<root>`; 75 promised | lean plan (H-02 fallback); preview hub 4 NEAR |
| H-01 | request sent; answer logged (or "pending") | D-22 fallbacks (already planned) |
| Spike §2 | iOS outcome known; H-12 decided; MPC deposit confirmed (rev4: 1 yocto is already proven) | assume outcome b (pairing on the Phase-2 list); the MPC deposit stays 1 yocto |
| Key custody (rev4) | H-17 done: the custody user (or Ledger) exists, `<root>` was created from it, the agents' `~/.near-credentials` holds no custody key | set it up before anything is signed on Nov 2; C-05 waits for it |
| Design | tokens + MVP flows final; round A synthesized (rev6: the tokens, logo and icons are done in `brand/`) | build from ux-spec tables; round B on Nov 7 carries more weight |
| Accounts and services | §4.1 rows done for Oct dates | the readiness checklist absorbs the rest on Nov 1 morning |
| Toolchains | `--version` checks pass on both laptops | install on Nov 1 before 09:00 |
| Rules | HACKATHON.md re-fetched (H-13) | re-fetch at 09:00 Nov 1 |
