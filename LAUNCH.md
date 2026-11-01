# Pot: launch checklist (NEAR HACKATHON, Nov 1-14, 2026)

> Written 2026-10-27, after a scan of everything in the folder. Owners: **[You]** = Cerasela (anything that needs an account, money, a login, a phone or a judgment call), **[Claude]** = Claude Code sessions, **[Both]** = you decide, Claude executes.
>
> **Decisions this assumes:**
> - **Testnet only**; no mainnet contracts.
> - **Vercel Hobby.**
> - **No custom domain** (`<project>.vercel.app`).
> - **Repo:** `github.com/ceraselamardare/pot` (branch `main`; created Nov 1). Commits only when asked, and always confirm before a push.
> - **No wallet-less real accounts** (Rev 9): sign-in is NEAR wallet or Google (NEAR Auth) only. The simulated `/demo` tour stays.
>
> **Key dates (UTC):**
> - Submissions open Nov 1 00:00 and close Nov 14 23:59. The API returns 403 outside that window.
> - We submit **Nov 13 before 18:00**.
> - Judging runs Nov 16-18. Keep everything up and funded until **Nov 25**: the rules ask for Nov 18 at least and "ideally 2026-11-25" (Q-012).
>
> **Rules update of 2026-10-29** (`kb/hackathon-rules.md`, top section):
> - Code written since the Oct 19 announcement counts (Q-001), so all our work is in-window.
> - Testnet-only is eligible in every track (Q-010).
> - A LICENSE file is required (Q-014).
> - Claude Code and Codex screen for reproducibility (Q-017).

## Where things stand

| Area | State | Where |
|---|---|---|
| Contracts | Pot Hub + test USDC, 120 sandbox tests, both Sputnik builds. Deployed on testnet under `potprev.testnet`; token locked, **hub key still held** | `contracts/`, `notes/contracts.md`, `notes/deploy.md` |
| App (UI + API + relayer) | Every MVP and Phase-2 flow works on testnet. 770 unit, 164 mock e2e and the testnet e2e suites all pass | `apps/web/`, `notes/qa-report.md` |
| Landing page `/` | Built (two rounds, motion) | `notes/landing.md` |
| Demo video | 82 s, clean + captioned; motion graphics | `marketing/video/out/final/`, `notes/video.md` |
| Judge README | Written; `<APP_URL>` placeholders; CLI steps verified on testnet | `README.md` |
| CI | Workflow written, **never run** (the repo exists; Actions not yet enabled) | `.github/workflows/ci.yml` |
| Hosting | **Never deployed** (Vercel/Neon untested) | — |
| Real devices / real logins | **Never tested** | `notes/near-auth-manual-test.md` |

---

## Day 1 (Sun Nov 1): go live

Goal by end of day: the app runs at `https://<project>.vercel.app` on testnet, `/demo` works for a stranger, and CI is green.

### 1. Repo
- [x] **[You]** GitHub repo created: `ceraselamardare/pot` ("init" commit; scanned clean of secrets). Make it **public** when you're ready; on a private Hobby repo only the owner's commits deploy.
- [ ] **[Claude]** Next commit (when you ask). Before committing:
  - check `.gitignore` covers `.env*`, `.keys/`, `node_modules`, `.next*`, `target/`;
  - run a secret scan over the staged files;
  - decide on `spikes/` (recommended: **exclude** it; it's throwaway pre-event code);
  - add a `LICENSE` file, which is **required** (Q-014; MIT is fine; you choose).
- [ ] **[You]** Push. The hackathon's agent rule is that pushes need your explicit OK, so Claude asks before every push.

### 2. Vercel + database
- [ ] **[You]** Vercel → New Project → import the repo.
  - **Root Directory: `apps/web`**, framework Next.js, region **iad1**.
  - Enable Corepack so Vercel uses pnpm 11 (`ENABLE_EXPERIMENTAL_COREPACK=1`, plus the `packageManager` field in the root `package.json`; Claude checks it).
- [ ] **[You]** Vercel → Storage / Marketplace → **Neon Postgres** (free) → connect to the project. This sets `DATABASE_URL` / `DATABASE_URL_UNPOOLED`.
- [ ] **[Claude]** Run the Drizzle migrations against Neon (`apps/web/db/migrations`).
- [ ] **[Both]** Add the env vars in Vercel. Secrets go in as **Sensitive**, from `apps/web/.keys/preview.env`; Claude prepares the list, and you paste the values.
  - **Public:** `NEXT_PUBLIC_NETWORK=testnet`, `NEXT_PUBLIC_APP_URL=https://<project>.vercel.app`, `NEXT_PUBLIC_HUB_ID=pots.potprev.testnet`, `NEXT_PUBLIC_USDC_ID=usdc.potprev.testnet`, `NEXT_PUBLIC_RPC_URLS` (FastNEAR, dRPC; **never** `rpc.testnet.near.org`), `NEXT_PUBLIC_TX_API`, `NEXT_PUBLIC_EXPLORER`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. Never `NEXT_PUBLIC_E2E_MOCK_WALLET` (the build refuses it on Vercel).
  - **Server:** `RELAYER_ACCOUNT_ID`, `TREASURY_ACCOUNT_ID`, `MPC_SIGN_DEPOSIT_YOCTO`, `RELAYER_*_NEAR`, `QUOTA_*`, `VAPID_SUBJECT`.
  - **Sensitive:** `RELAYER_KEYS`, `TREASURY_KEYS`, `APP_HMAC_SECRET` (a **new** random value), `VAPID_PRIVATE_KEY`, `CRON_SECRET`.
  - **Removed in Rev 9 (delete them if they were added):** the live demo and the test-account sign-in are gone, so Vercel needs none of `FLAG_DEMO`, `NEXT_PUBLIC_FLAG_DEMO`, `FLAG_DEMO_LIVE`, `FLAG_DEMO_PUSH`, `FLAG_DEV_SESSION`, `NEXT_PUBLIC_FLAG_DEV_SESSION`, `DEMO_REFERENCE_POT`, `DEMO_POOL_TARGET`, `QUOTA_GLOBAL_DEMO_YOCTO` or the `DEMO_PERSONA_KEY` secret.
  - **Separation:** use separate relayer keys for Preview and Production. Claude adds keys to `users.potprev.testnet`.
- [ ] **[Claude]** Confirm that the cron in `apps/web/vercel.json` (daily reconcile) is accepted on Hobby.
- [ ] **[You]** Deploy, and paste the URL in chat.

### 3. Smoke test the live URL
- [ ] **[Claude]** Run against the deployed URL:
  - `GET /api/health`;
  - the README judge steps J-1…J-7 (`scripts/readme-cli-check.sh`, `scripts/check-readme-steps.ts`).

  (The signing testnet Playwright suites run on a local build only: they sign in through the e2e mock wallet, which the
  build refuses on Vercel.)

  Run each through `scripts/with-testnet-lock.sh`.
- [ ] **[Claude]** Check the things never verified on Vercel:
  - relay latency (two-phase spend: first answer ≤ 4 s, final ≤ 10 s);
  - no function timeouts on `/api/relay`;
  - FastNEAR 429s from Vercel's shared IPs (failover to dRPC should absorb them; buy a FastNEAR key, H-16, only if it doesn't);
  - the security headers;
  - the PWA manifest and service worker served correctly.
- [ ] **[You]** Open the URL logged out on your phone and do the demo once.
- [ ] **[Claude]** Replace `<APP_URL>` in `README.md` (and in `scripts/check-readme-steps.ts` if needed), then re-run the README drift check.

### 4. CI
- [ ] **[You]** Allow GitHub Actions on the repo.
- [ ] **[Claude]** Push-triggered CI must go green. It has never run, so expect fixes to Ubuntu specifics: the Postgres 17 service, pnpm 11 setup, the cargo-near install, the sandbox download on Linux.
- [ ] **[Claude]** Add the testnet e2e job's protection-bypass step, or turn off Vercel Deployment Protection for Production, which judges need anyway.

### 5. Hackathon admin
- [ ] **[Claude]** Re-fetch `HACKATHON.md` and diff it against `kb/sources/HACKATHON-2026-10-29.md` (H-13). Repeat on Nov 7 and Nov 13.
- [x] ~~Ask whether pre-Nov-1 code is OK~~ Answered by the rules update: yes (Q-001).
- [ ] **[You]** Optional: ask on Discord about the two points the rules still don't cover, KYC/tax at payout and whether one project can place in two tracks.

---

## Days 2-6 (Nov 2-6): validate on real devices and real people

- [ ] **[You] NEAR Auth.** Request a **dedicated testnet client** for `https://<project>.vercel.app` (and `http://localhost:3000`), with app name "Pot" and the logo `brand/web/pot-mark-256.png`. Channel: GitHub `Peersyst/fast-auth` or NEAR Discord. Without it, Google/email login works only on localhost, and the hosted app offers `/demo` + NEAR Connect wallets. **Decide on Nov 8 (G4).**
- [ ] **[You] Real Google login on localhost**, following the checklist in `notes/near-auth-manual-test.md` (about 20 min).
- [ ] **[You] Phones**, on the live URL. **[Claude]** fixes whatever breaks.
  - iPhone (Safari): open an invite, `/demo`, Add to Home Screen, open the installed app, turn on notifications, get a push ("needs your approval" from a second phone).
  - Android (Chrome): the install prompt, then the same push test.
  - Open an invite link inside Telegram or WhatsApp and check the "Open in Safari" guidance.
- [ ] **[You] Wallet.** Sign in with Meteor or Intear on testnet ("I have a NEAR wallet"), and do one gasless action.
- [ ] **[You] Hallway test (round A).** 3-5 non-crypto friends on the live URL, following `plan/hallway-test.md` (join and pay in under 2 min). **[Claude]** fixes the top 5 findings.
- [ ] **[You] Design calls.** Go through the 44 defaulted questions in `notes/frontend.md`, and the landing decisions 1-7 in `notes/landing.md`. Claude applies your answers.
- [ ] **[Claude] Abuse check (E-12).** A scripted run against Preview: faucet limits, wallet sign-in limits, create caps, a relay of a non-hub vote.
- [ ] **[Claude] Testnet funding.** Keep `pot-funds-65k8.testnet` ≥ 30 NEAR (faucet top-ups, verified on chain), hub ≥ 5 NEAR free, relayer ≥ 3 NEAR, treasury ≥ $50k test dollars. Log it in `notes/deploy.md`.

## Days 7-10 (Nov 7-10): freeze features, decide the extras

- [ ] **[Both] Nov 7: MVP freeze.** Full regression (`notes/qa-report.md` matrix) against the live URL.
- [ ] **[Both] Optional: Tidepool**, the community testnet 1Click. It enables a real deposit from Base, Arbitrum or Ethereum Sepolia, with the simulator kept as fallback. Two blockers first:
  - it pays out **its own** USDC token, so we either move testnet Pots to that token or convert 1:1;
  - it's one community operator with no SLA.

  Go/no-go **Nov 8**, otherwise ship the simulator. Notes are in the chat of 2026-10-27.
- [ ] **[You] Recommended: a mainnet 1Click proof clip** (about $5 USDC Base → your own NEAR account, from a separate dev account; no Pot contracts on mainnet). This is the organizers' own advice for Intents (Q-007, Q-010), and the "realworld" track hints NEAR INTENTS. A partner key from partners.near-intents.org is optional; without one the fee is 0.2% (Q-006). Decide **Nov 9**.
- [ ] **[You] Video.**
  - Decide the ElevenLabs licence: upgrade to Starter, or credit them.
  - Optionally record a human voice-over.
  - **[Claude]** re-renders the end card with the repo URL (`repoUrl`) once the repo is public, plus any copy changes from the design calls.
- [ ] **[Both] Nov 10: feature freeze.** After this, fixes only.

## Days 11-12 (Nov 11-12): release and lock

- [ ] **[Claude] Final regression** on the live URL: contracts, unit, mock e2e, integrations tier, the live backend suite, `scripts/e2e-chain.ts`, every testnet suite, the README CLI check.
- [ ] **[You] Lock the hub** (`pots.potprev.testnet`): delete its full-access key per `plan/accounts-and-deploy.md`.
  - After the lock nobody can fix the contract; the fallback is a redeploy as `pots-v2`.
  - **[Claude]** then runs `EXPECT_HUB_LOCKED=1 scripts/readme-cli-check.sh` and updates the README line about keys.
  - If you'd rather keep the ability to hot-fix during judging, skip the lock and say so in the README limitations.
- [ ] **[Claude]** Finalize the README:
  - the URL;
  - costs and sustainability;
  - limitations: testnet only (eligible per Q-010); NEAR Auth origin; Trezu mainnet-only; the demo is a simulation; the 1Click simulator on testnet;
  - **"Built with"**: libraries, templates and AI-assisted code (Q-005: near-sdk, near-contract-standards, the vendored Sputnik wasm, near-api-js, Next.js, shadcn/Base UI, etc.);
  - a **reproducibility path** an AI judge can run on a clean machine with no secrets or keys (Q-017). Make sure `pnpm i && pnpm test` passes or skips cleanly without Postgres or testnet credentials, and say exactly what Docker or Rust adds;
  - track hints used: SPUTNIK DAO, NAMED ACCOUNTS, STABLECOINS, NEAR INTENTS, META TRANSACTIONS;
  - 4-6 screenshots.
- [ ] **[Claude]** Make sure `CLAUDE.md` and the notes contain no secrets, and run a secret scan over the full git history (`gitleaks`).

## Day 13 (Fri Nov 13): submit

Order matters (`plan/submission-plan.md` §5). Agents never post, make repos public or submit without your OK.
1. [ ] **[You]** The repo is public and opens logged out.
2. [ ] **[You]** Post on X with the captioned video. Say "built at NEAR HACKATHON", and include the repo link and the demo link. Copy the public post URL.
3. [ ] **[You]** Write the `idea` text yourself (20-2,000 chars). It must be human-written; Claude may only draft a starting point.
4. [ ] **[Claude]** Build the JSON: **exactly 11 fields**, ≤ 12,000 bytes, `size: "2 - 4"`, `tracks: ["social","realworld"]`, a `requestId` UUID generated once. **Never** a `website` field (it's a spam trap).
5. [ ] **[You]** Check every field:
   - `projectName` and `email` are the team's own (an email can carry at most 2 submissions);
   - `projectUrl` is unique, because each repo can be submitted only once;
   - `nearAddress` is a **mainnet** address;
   - `projectUrl` is the repo, and `demoUrl` is the X post.

   Then read the consent text, and say "submit".
6. [ ] **[Claude]** `POST https://nearhackathon.com/api/applications`.
   - `201` means done.
   - `400`: fix the fields and resend with the same `requestId`.
   - `503`: wait and resend.
   - `403` or `409` (409 means the repo was already submitted, or the email already has 2 submissions): stop and tell you; never change the link or email to get around it.

## Nov 14-25: buffer and judging watch

- [ ] **[Claude]** Twice a day until **Nov 25** (Q-012: "keep it up to 2026-11-18, ideally 2026-11-25"):
  - `/api/health`;
  - balances (hub, relayer, treasury);
  - the cron runs (Hobby crons are daily);
  - top up testnet NEAR if needed.
- [ ] **[You]** Don't redeploy Production during judging unless something is broken. Keep the repo public at least through judging (Q-014).

---

## Known gaps to accept or fix
- No on-chain test of an instant spend that is approved and then refused (unit tests only).
- Visual snapshots, the PWA installability check, performance budgets and tap-target sizes aren't automated.
- `pnpm audit`: one high finding in a build-time-only shadcn CLI dependency, with no patch available.
- The report-only CSP for scripts and connections isn't emitted.
- `withdraw_request` is not built (Phase 3); requests expire after 7 days.
- No cash-out after close: money stays in the member's Pot account. The copy says so.

## Accounts and files cheat sheet
| What | Where |
|---|---|
| Testnet funding account | `pot-funds-65k8.testnet` (key in `~/.near-credentials/testnet/`) |
| Preview root / hub / token / relayer / treasury | `potprev.testnet`, `pots.`, `usdc.`, `users.`, `treasury.` (+ `reserve.`) |
| Secrets for Vercel | `apps/web/.keys/preview.env` (gitignored, never commit) |
| Local env | `apps/web/.env.local` (gitignored) |
| Testnet lock for any testnet run | `scripts/with-testnet-lock.sh <cmd>` |
| Scripts (deploy status, keys, env, e2e) | `scripts/run <name>`, documented in `notes/deploy.md` |
