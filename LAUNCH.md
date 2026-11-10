# Pot: launch checklist (NEAR HACKATHON, Nov 1-14, 2026)

> Owners: **[You]** = Cerasela (anything that needs an account, money, a login, a phone or a judgment call), **[Claude]** =
> Claude Code sessions. Agents never push, make the repo public, post, sign or submit without your explicit OK.
>
> **Key dates (UTC):** submissions close **Nov 14 23:59** (the API answers 403 after that); we submit **Nov 13 before
> 18:00**. Judging runs Nov 16-18. Keep the app up and funded until **Nov 25** (Q-012: "ideally 2026-11-25").
>
> **Rules last re-checked 2026-11-10** (`kb/hackathon-rules.md`, snapshot `kb/sources/HACKATHON-2026-11-10.md`): no rule,
> date or field changed since Oct 29. New: the X post must tag `@NEARProtocol` and `#NEARHackathon`, and a saved
> submission is corrected at https://nearhackathon.com/request-changes, never by submitting again.

## Where things stand (2026-11-10: the final testnet deploy is done)

| Area | State | Where |
|---|---|---|
| Contracts | Pot Hub 1.3.0 + test USDC on testnet under `potprev.testnet`. `main` rebuilds both byte for byte (`contracts/scripts/build.sh`: hub `fa7af2fb…`, token `8253d223…`). **Hub, token and every Pot are keyless (locked).** | `contracts/`, `notes/deploy.md` |
| App (UI + API + relayer) | Live at https://usepot.xyz on testnet (`/api/health` shows the deployed commit) | `apps/web/`, `docs/testing.md` |
| Live proofs | The reference story in `reference-trip-2gzw.pots.potprev.testnet`; `node scripts/verify-proofs.mjs` checks every transaction | `docs/proofs.json`, `docs/judging-guide.md` J-10 |
| Judge path | README, judging guide J-1 to J-10, `AGENTS.md`, `scripts/judge-check.sh` | `README.md`, `docs/` |
| Demo video | 82 s, v3 (copy matches the app, Testnet badge, usepot.xyz on the end card) | `marketing/video/out/final/`, `notes/video.md` |
| Funding (Nov 10) | Hub 5.5 NEAR free (≈ 75 sponsored Pots), relayer 7.1 NEAR, treasury $976k test, holding account 32.4 NEAR | `scripts/run deploy status` |
| Repo visibility | **Private**: must be public before submitting (Q-014) | GitHub settings |

## The final testnet deploy (done)

- **Hub 1.3.0 with its build info fixed**, 2026-11-09: tx `GpsmmQ6kqSCEdjYd6k75CxUU42LJKJX1i7FgHAV9oEAK` (one DeployContract, no
  migrate). Code hash `HrmfMaz3CPm5U7uZrBgffngTmHdNPKpmMwX4jt1RDw8w`; NEP-330 says 1.3.0 and `github.com/ceraselamardare/pot`.
- **The reference story**, 2026-11-09: one Pot from create to close on the current hub; its transactions are J-10 and the demo's
  "real equivalent on testnet" links.
- **The lock (D-13)**, 2026-11-10: `scripts/with-testnet-lock.sh scripts/run deploy lock-hub` deleted the hub's only key
  (`ed25519:2WAUkD3T…`) in tx `AcwkiR93ouUFTip77ywpZGv88zMbH43U7FDYVJJpT1kT`, after checking that the chain runs exactly the local build. `list-keys` on the hub is
  empty, and `scripts/readme-cli-check.sh` now requires it.
  - Nobody can redeploy the hub any more. A bug fix would be a new hub (`pots-v2`, `plan/accounts-and-deploy.md` §3.11) for new
    Pots. The owner `potprev.testnet` can still `set_config`: pause new activity (a close always works), tune limits within the
    coded ranges, change the relayer list. Top-ups are plain transfers and need no key.
- **Checks before and after the lock:** `scripts/judge-check.sh --e2e` (everything keyless, the mocked UI suite and the contract
  tests) before; `scripts/run e2e-chain` against a local `next start` (the whole MVP story, 16 signed txs from create to close, on the locked hub: Pot `e2e-szg5n.pots.potprev.testnet`, refunds checked on chain),
  `scripts/readme-cli-check.sh`, `node scripts/verify-proofs.mjs` and `scripts/run deploy status` after.
- **Secret scan** of the full history, 2026-11-09 (gitleaks v8.30.1): only false positives. Re-run it if secrets-adjacent files
  change before the repo goes public: `docker run --rm -v "$PWD":/repo:ro ghcr.io/gitleaks/gitleaks:v8.30.1 git /repo --redact`.

## Left to do, in order

1. **[You] Make the repo public** (Settings → General → Change visibility) and open it logged out. Until then the README's
   source link and the hub's on-chain source link (NEP-330) return 404. Then **[You]** check that CI (GitHub Actions) is green
   on `main`.
2. **[You] Vercel and search, optional:** set `NEXT_PUBLIC_APP_URL=https://usepot.xyz` in Production; redirect `www`; add the
   sitemap in Google Search Console and Bing; keep the Vercel AI-bots firewall rule off (judges' agents must reach the site).
3. **[You] The video's s08 line** ("Friends join with Google… No wallet. No seed phrase.") describes mainnet. Keep it and say in
   the post that the testnet app signs in with a NEAR wallet, or re-record that line.
4. **[You] The X post** (`plan/submission-plan.md` §3; Claude can draft it): say it was built at NEAR HACKATHON, tag
   `@NEARProtocol` and `#NEARHackathon` (optionally `@NearLegion`, `@NearBuilders`), attach the captioned video, and link
   https://usepot.xyz and the repo. Lead with the problem, show one complete moment, say what NEAR does in it, end with a real
   question. Copy the public post URL.
5. **[You] The `idea` text** (20-2,000 chars), written by you; Claude may only draft a starting point.
6. **[Claude] The submission JSON:** exactly 11 fields, ≤ 12,000 bytes, `size: "1"` (Cerasela Mardare, solo builder),
   `tracks: ["social","realworld"]`, a `requestId` UUID generated once, **never** a `website` field (a spam trap).
7. **[You] Check every field:** `projectName` and `email` are yours (an email carries at most 2 submissions); `projectUrl` is the
   public repo (each repo is submitted once); `demoUrl` is the X post; `nearAddress` is a **mainnet** account you created. Read
   the consent text and say "submit".
8. **[Claude] `POST https://nearhackathon.com/api/applications`.** `201`: done. `400`: fix and resend with the same `requestId`.
   `503`: wait and resend. `403` or `409`: stop and tell you. A mistake in a saved submission goes through
   https://nearhackathon.com/request-changes (you send it), never a second submission.

## Nov 14-25: judging watch

- **[Claude]** Twice a day until Nov 25: `/api/health`; `scripts/run deploy status` (balances of hub, relayer, treasury); the
  daily cron ran; top up testnet NEAR from `pot-funds-65k8.testnet` if needed (plain transfers, so the locked hub can be topped up).
- **[You]** Don't redeploy Production during judging unless something is broken. Keep the repo public at least through judging
  (Q-014).

## Known gaps to accept
- No on-chain test of an instant spend that is approved and then refused (unit tests only).
- Visual snapshots, the PWA installability check, performance budgets and tap-target sizes aren't automated.
- `pnpm audit`: one high finding in a build-time-only shadcn CLI dependency, with no patch available.
- The report-only CSP for scripts and connections isn't emitted.
- `withdraw_request` is not built (Phase 3); requests expire after 7 days.
- No cash-out after close: money stays in the member's Pot account. The copy says so.
- Google sign-in works on a local run only until NEAR Auth allows https://usepot.xyz (requested 2026-11-09); then set
  `NEXT_PUBLIC_FLAG_NEAR_AUTH` and `FLAG_NEAR_AUTH` to `true` in `apps/web/.env.production`.

## Accounts and files cheat sheet
| What | Where |
|---|---|
| Testnet funding account | `pot-funds-65k8.testnet` (key in `~/.near-credentials/testnet/`) |
| Root (hub owner) / hub / token / relayer / treasury / reserve | `potprev.testnet`, `pots.`, `usdc.`, `users.`, `treasury.`, `reserve.` |
| Secrets for Vercel | `apps/web/.keys/` (gitignored, never commit) |
| Local env | `apps/web/.env.local` (gitignored) |
| Testnet lock for any testnet run | `scripts/with-testnet-lock.sh <cmd>` |
| Scripts (deploy status, keys, env, e2e) | `scripts/run <name>`, documented in `notes/deploy.md` |
