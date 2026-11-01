# Plan consistency review (Rev 3)

> Consistency reviewer, 2026-10-21. Scope: the 14 docs in `plan/`, checked against [decisions.md](decisions.md) and the facts in `kb/`. The security and fact-check pass is a separate review (`review-security.md`).
> Result: **all 32 conflicts resolved**, decisions.md moved to **Revision 3**, and [implementation-plan.md](implementation-plan.md) §10 is now the resolution log. Every ux-spec edit is minimal and marked "(rev3)".
> **Rev 4 note (2026-10-21):** the security review ([review-security.md](review-security.md)) moved decisions.md to **Revision 4**; its §7 is the resolution log for those fixes. Below, issue #5 and open questions #6, #19 and #20 are superseded, and H-17 is new.
> **Rev 5 note (2026-10-21):** decisions.md **Revision 5** dropped `transfer:RemoveProposal` from the day-1 policy and moved `withdraw_request` to Phase 3 (not built). The Rev 3 entries below that treat withdraw as Phase 2 are superseded.

## 1. What I checked

1. **The 32 conflicts** in implementation-plan §10. For each one, I edited every affected doc, not only the one the planner named.
2. **A cross-doc pass:**
   - account names;
   - hub methods, signatures and gas (decisions §8 ↔ contracts-spec §3-§5 ↔ api-spec R1-R12 ↔ frontend intents);
   - event names;
   - API routes and payload fields;
   - `reason` codes ↔ ux-spec copy keys;
   - DB tables used by the API;
   - the numbers: gas, costs, presets, the demo numbers ($450 → $84 → $366 → $300 → $66 → $22.00 each), limits, dates and times.
3. **Coverage:**
   - each of P-1…P-11 has at least one task and one test;
   - each hub method and view has a sandbox test;
   - each API route and workflow has an owning task;
   - each of H-01…H-16 has an owner and a deadline in phase0-checklist.
4. **The schedule:**
   - a per-day load recount from the §3 estimates;
   - the dependency order;
   - a fallback for every gate.
5. **Facts against kb/:** hackathon-rules, sputnik-dao, contracts-patterns, near-auth, intents-1click, notifications, pwa-push, backend-infra, accounts-onboarding, meta-tx-relayer. I found no factual errors in kb/, so no "Review corrections" sections were added. I found one error in decisions.md (below).

## 2. Fixes made

| File | Summary |
|---|---|
| decisions.md | **Revision 3** entry, plus these changes:<br>• §1 row 7: onboarding is ≈ 0.0085 NEAR *including* the 0.00125 USDC deposit (it was double-counted).<br>• D-05: 0.05 float on both testnet hubs, 0.1 on the mainnet clip.<br>• D-07b, D-09: 300 Tgas for `call`-proposal votes and Finalize.<br>• D-21: the MPC deposit default, and the relayer thresholds derived from it.<br>• D-33: a table of the three demo-Pot kinds (reference, pool, shared); ≈ 0.12 NEAR per seeded Pot.<br>• D-42: no push before install on Android unless Cerasela opts in.<br>• D-60 wording; D-65 shared visitor cookie.<br>• §8: hub additions, the `custom` preset, `POST /api/session/dev`, a pointer to the supporting routes.<br>• §9: H-13…H-16 |
| implementation-plan.md | • §10 rewritten as the resolution log.<br>• Task fixes: X-15 ↔ C-21 circular dependency; the X-12 draft required tests that don't exist yet; nobody created the preview reference Pot, Pots home, the You tab, `PATCH /api/me` or the Telegram link route (now X-05b, F-06, B-17); X-19 hallway set-up redone; C-14 moved to Nov 2; E-11 moved to P1.<br>• Day loads recounted, with a pre-agreed week-1 relief order.<br>• Judging balances fixed. |
| contracts-spec.md | • 0.05 float everywhere; `custom` needs explicit rules.<br>• `request_ref` = the client's 16-char op id (was "12 chars").<br>• `sync` after every relayed vote; stale 200-Tgas notes removed.<br>• §10 mirrors the plan's order and states the release rule.<br>• New test T-88 (views: `preview_spend`/`preview_close` parity, paging, `get_config`, `get_rules`); T-82 covers `ERR_CONFIG_INVALID`.<br>• §11 mapping (`Rules`, `Preset`, `PotView`, `withdrawn`); Q6-Q8 and the objections closed. |
| accounts-and-deploy.md | • 0.05 float in the budget, the init commands and the v2 fallback; the budget is the 75 NEAR column.<br>• First deploy on Nov 2 (C-05).<br>• Reference vs shared Pot rows and §3.8.<br>• Relayer top-up rule tied to `relayer_low`; mainnet clip dates. |
| architecture.md | Q-9 closed; dev-session rows (abuse table, environments); vote-request meter starts at an optimistic "1 of k". |
| api-spec.md | • Session kind `dev` and a full spec for `POST /api/session/dev`.<br>• Route index with phase **and owning task**.<br>• Fallbacks for `{flow}.error.*` copy keys that don't exist.<br>• R2 bounds (name 2-40, `custom`, allowlist ≤ 10).<br>• Derived relayer thresholds.<br>• The `FLAG_DEMO_PUSH` option (R-15).<br>• Demo cost 0.12 and the seed kinds; README twins with $84 and $300; display-name default. |
| data-model.md | Kind `dev`, proof `dev_session`, preset `custom`, `push_subscription.demo_pot_id`, reference-Pot seeding, open questions updated. |
| frontend-architecture.md | • Types follow the contract (`Rules`, `PresetId`, `withdrawn`, the `balance` view args, `getRequest`).<br>• New intents `propose_rules` and `withdraw_request` (rev5: Phase 3, not built); 300 Tgas `call` votes.<br>• Full flag list; persona `sam`; dev session.<br>• `/demo` reads the reference Pot; Playwright cookie sharing; `RelayOk` gets `final`, `relayId`, `result`.<br>• E1 is now a fallback.<br>• §12 mirrors the plan; §13 and §14 statuses updated. |
| ux-spec.md (50 × "(rev3)") | • `/j/[slug]?i=…#…`, multi-use links; Base UI drawer; Apple mainnet-only.<br>• `landing.cta.dev`; `invite.used` and `invite.invalid` wording; "…without asking" ×3.<br>• `xc.*` per D-50, plus the new `xc.instructions.min`.<br>• F4 "1 of 2", with Leo's vote 2nd of 2; 7-day expiry; withdraw is Phase 2 (rev5: now Phase 3, not built).<br>• No balance in the contribution push; Trezu mainnet-only; answered §13 items. |
| hallway-test.md | • Round B uses dev sessions on a preview; T5 runs without push.<br>• The "≥ 2 of 3" rule for n = 3.<br>• 4 pre-Leo Pots made through the app, with Cerasela's phone as Maya. |
| phase0-checklist.md | H-16 deadline and timeline row; account dates; Cerasela reviews the (rev3) edits; §5 #24 detail and a new #25 (gradient). |
| test-plan.md | • New tests T-88, M-16, A-21.<br>• Lease plan for the testnet tier: E-04 changes the close math; E-07 = E-10 J-6; E-06 is preview-only.<br>• E-03 proves `sync` on chain.<br>• Release rule; e2e-testnet blocking from Nov 9; protocol-88 job from Nov 2; A-20 thresholds; traceability updated. |
| submission-plan.md | The `deposit/submit` limitation; the pre-Leo Pot made through the app; both video devices must act in the same Pot; balances ≥ 10 NEAR. |
| risk-register.md | R-15 now points to the specified flag; R-23 wording (`limits.max_members`); new **R-31** for the week-1 overload. |

## 3. Remaining issues, by severity

| # | Severity | Issue | Suggested resolution |
|---|---|---|---|
| 1 | **High** | **Week-1 overload (R-31).** The §3 estimates sum to ≈ 69-70 h per person over Nov 1-7, against 63 h at 9 h a day. Most days are 10 h, not the 9-9.5 h the plan showed. | Accept the hot days and use the relief order now written in implementation-plan §4. The one step that changes an acceptance criterion needs a human OK: moving B-09 to Nov 9, so that G3 accepts "Approved" and "Sent" together at ≈ 5-6 s. |
| 2 | **High** | **CLAUDE.md tells every session to read `plan/README.md`, which doesn't exist.** I may not edit CLAUDE.md and didn't create an unrequested index. | The lead creates a short `plan/README.md` index before Oct 31, or edits CLAUDE.md. The repo's CLAUDE.md (implementation-plan §9.4) should cite decisions.md Rev 3. |
| 3 | Medium | CLAUDE.md repeats the corrected double count ("0.0085 NEAR + 0.00125 for USDC storage"). | Fix it in the same edit as #2. |
| 4 | Medium | **Push on an installed iPhone without H-01 (R-15).** The `FLAG_DEMO_PUSH` path is specified. The video still needs Maya's desktop and Leo's iPhone in the same lease, and the only way is to copy the visitor cookie with Web Inspector (submission-plan §2.3). | Decide at G4. The alternative is dev sessions on a preview with Deployment Protection off during the recording. |
| 5 | ~~Medium~~ | ~~MPC deposit unresolved (D-21, O-1).~~ **Resolved in Rev 4:** a 1-yocto `sign` is proven on chain (review-security F-6), so `MPC_SIGN_DEPOSIT_YOCTO = 1`, no reserve, warn/critical 5/2 NEAR. | Spike §C only confirms it. |
| 6 | Medium | **Hallway round B on a protected preview.** It is untested whether a Vercel Shareable Link survives opening from WhatsApp or Telegram in-app browsers. | Test it on Nov 6 evening during X-19 part 1. Fallback: switch Vercel Authentication off for previews during the session (testnet only). |
| 7 | Medium | **`xc.refunded` and `xc.incomplete` promise a refund.** In fact refunds land in the member's NEAR Intents balance, and recovering them is Phase 3. | Cerasela confirms the KB-derived wording; the README limitation already says it. |
| 8 | Low | The H-02 request of 75 NEAR keeps a 12 % buffer (77.3 NEAR at 15 %). | Ask for 80 if the source allows. |
| 9 | Low | A NEAR Auth user with no `given_name` (email + password) gets the display name "Friend". | Cerasela picks between that and a one-field name prompt. |
| 10 | Low | `close.open_requests` says requests "will be cancelled". On chain they stay open, can never be paid once the Pot is empty, and expire after 7 days. | Show them as cancelled once the Pot is closed (frontend status derivation), or reword. |
| 11 | Low | Before B-09 (Nov 7), a 202 "pending" relay can't be polled through `GET /api/relay/[relayId]`. | Clients retry the identical body (idempotent). Optionally, B-03 exposes the GET early. |
| 12 | Low | Spec headers still say "written against Revision 2", and the "(rev3)" markers remain in ux-spec. | Fine as history. Cerasela removes the markers after her review (phase0 §3). |

## 4. Open questions for the humans

Each has a default that applies if nobody decides.

| # | Question | Owner | Default | Deadline |
|---|---|---|---|---|
| 1 | `<root>` (≤ 10 chars), product name, a distinctive `projectName` (H-05, H-06) | Cerasela + P1 | `potapp` / "Pot" + a longer submission name | Oct 22 |
| 2 | NEAR Auth whitelist request and mainnet form (H-01) | Cerasela | D-22 fallbacks: `/demo` + NEAR Connect; NEAR Auth on localhost | send Oct 22; decide Nov 8, 18:00 (G4) |
| 3 | Testnet NEAR grant (H-02) | P1 | lean plan ≈ 45 NEAR | ask Oct 22; ≥ 33 by Oct 31, 20:00; ≥ 55 by Nov 5 |
| 4 | Organizer questions: two tracks, KYC (H-15) | Cerasela | — | Oct 22 |
| 5 | Domain + Resend DNS (H-07) | P1 | no email | buy Oct 22; DNS Oct 28 |
| 6 | ~~MPC `sign` deposit: 1 yocto vs 2 NEAR (D-21, O-1)~~ | — | **Resolved (Rev 4): 1 yocto**, proven on chain | — |
| 7 | iOS installed-PWA popup (spike §D) → is Pair from Safari needed? | Cerasela | assume outcome b: on the Phase-2 list | Oct 25 |
| 8 | Device-key model (H-12) | Cerasela + P1 | adopt | Oct 25 |
| 9 | H-10 bundle: Club/Team values, font, palette, hero, inline Undo, Android push before install, demo Pot creation, **gradient picker** (§5 #25), approve the (rev3) ux edits and the ⓟ keys | Cerasela | the phase0-checklist §5 defaults | Oct 25 (ux review by Oct 31) |
| 10 | Submission identity: team email, X account and its video limit, mainnet payout account (H-14) | Cerasela | none: humans only | email Oct 25; X Oct 31; payout Nov 12 |
| 11 | Vercel tier and repo owner/visibility (H-04) | both | Pro for both seats through Nov 18; private org repo until Nov 13 | Oct 28 |
| 12 | Create `plan/README.md` (CLAUDE.md points to it) | lead | create a short index | Oct 31 |
| 13 | Neon preview branching | P1 | one shared `preview` branch | Nov 1 (X-01) |
| 14 | If week 1 slips: move B-09 to Nov 9 and accept "Approved" + "Sent" together at G3 | lead + P1 | keep B-09 on Nov 7 | Nov 6, 09:30 standup |
| 15 | iPhone push demo without H-01: `FLAG_DEMO_PUSH` or dev sessions on an unprotected preview (R-15) | both | `FLAG_DEMO_PUSH` on (pool leases only) | Nov 8, 18:00 (G4) |
| 16 | Buy a FastNEAR key (H-16) | P1 | no | Nov 4 standup |
| 17 | Mainnet funds (H-08) and the clip go/no-go | Cerasela; both | no clip; the simulator is labeled | funds Nov 8; go/no-go Nov 10, 18:00 |
| 18 | Telegram bot usernames (H-09) | Cerasela | no bot | Oct 31 |
| 19 | Mainnet hub: lock or delete (rev4: **right after the clip**, once the clip Pots are closed, C-22) | humans | lock | Nov 11 |
| 20 | ~~Persona key rotation through a one-off `DeleteKey` rule~~ | — | Moot (Rev 4): the reference personas hold no key after seeding; pool and shared personas are re-created | — |
| 21 | Rev 4: key-custody account (H-17): a separate macOS user or a Ledger for every full-access key except the Vercel hot keys | P1 | Ledger for `<root>`, vault import-on-demand for the rest | Oct 23 |
| 22 | Rev 4: may a member who hasn't put money in spend instantly (H-10)? | Cerasela | no | Oct 25 |

## 5. Ready for Nov 1?

**Yes, if the items below hold.** The plan is now consistent: one float, one gas rule, one demo-Pot design, one schedule, and every route, method and acceptance criterion has an owner and a test. These must be true by Sun Nov 1, 09:00 EET:

1. `<root>.testnet` exists (≤ 10 chars), and its key is in the custody account (rev4, H-17) and in the vault (H-03, H-05).
2. ≥ 33 testnet NEAR is in hand for the C-05 deploy on Nov 2 AM, and ≥ 55 is promised by Nov 5 (H-02).
3. The Vercel plan and GitHub owner are chosen, and the Neon branches are ready. The repo is created empty on Nov 1 (H-04, D-63).
4. Toolchains work on both laptops (an arm64 Mac, or CI-only sandbox tests on Intel) (H-11).
5. Spike results are recorded (iOS outcome; the MPC deposit is already settled at 1 yocto by Rev 4), or their defaults are accepted (#7).
6. Cerasela's H-10 decisions are made (or defaulted), the (rev3) ux edits are reviewed, and the Figma tokens are final.
7. `plan/README.md` exists (or CLAUDE.md is updated), and the repo CLAUDE.md text cites decisions.md Rev 4 (was Rev 3).
8. HACKATHON.md has been re-fetched and diffed (H-13).
9. Both people accept the week-1 load and its relief order (R-31, implementation-plan §4).
10. Rev 4: the key-custody account exists and the agents' OS user holds no custody key (H-17, #21).
