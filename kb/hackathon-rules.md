# Hackathon rules (live HACKATHON.md + nearhackathon.com)
> Owner: product-ux. Last verified: 2026-10-21. Legend: ✅ verified · 📄 docs-only · ⚠️ unverified/conflicting

Everything below comes from the live `https://nearhackathon.com/HACKATHON.md` (HTTP 200, `content-type: text/markdown`, fetched 2026-10-21 10:21 UTC), the homepage `https://nearhackathon.com/` and its JS bundle, unless another source is named. HACKATHON.md says: "read it again before submitting, because dates and rules may change." **Re-fetch it on Nov 1 and again on submission day.**

## Update 2026-11-10: re-checked before the final deploy
Live `HACKATHON.md` fetched 2026-11-10 13:38 UTC, snapshot [sources/HACKATHON-2026-11-10.md](sources/HACKATHON-2026-11-10.md)
(sha256 `6dd0c1ff…`). **No rule, date, field or limit changed** since Oct 29. Added:
- **The X post must tag `@NEARProtocol` and `#NEARHackathon`** (optionally `@NearLegion`, `@NearBuilders`), plus guidance: lead
  with the user problem, show one complete moment, say concretely what NEAR enables, link the demo and the repo, ask a real question.
- **Request changes** (`https://nearhackathon.com/request-changes`): a saved submission with a mistake is fixed by a request the
  organizers review by hand, never by submitting again (a second submission of the repo is a 409).
- Example prompts per track (`github.com/nearai/near-hackathon-prompt-examples`), Q-000 (NEAR AI credits), the builders' Telegram,
  and more partners (Agent Market, NEAR Builders, Gulf Labs, BRRRAIN, NEAR Business). None of it affects Pot.
- `GET /api/applications` → `{"count":451}`.

## Update 2026-10-29: the organizers revised HACKATHON.md
A snapshot is in [sources/HACKATHON-2026-10-29.md](sources/HACKATHON-2026-10-29.md) (sha256 `9da1c4b4…`). It adds a **Rules** section (Q-001…Q-017). **Where it conflicts with anything below, this update wins.**

| Topic | Before (Oct 21) | Now (Oct 29) | Effect on Pot |
|---|---|---|---|
| Code before Nov 1 | No clause; the homepage said "build your project during the hackathon", so we treated it as forbidden | **Allowed from the 2026-10-19 announcement** (Q-001). "Earlier commits are baseline" | ✅ All our work (spikes from Oct 21, build from Oct 22) is inside the window. The risk is gone |
| New repo | — | Not required; a branch or tags plus a README diff link also work (Q-003) | A fresh repo is still simplest |
| Libraries / AI code | — | Allowed; **list them in the README** (Q-005) | Add a "Built with" list: near-sdk, near-api-js, Sputnik wasm, shadcn, etc., plus AI-assisted code |
| 1Click JWT | Docs said +0.25% without one | Not required; **0.2% fee without** (Q-006). Register at partners.near-intents.org | Fix the copy and docs |
| Intents testnet | None | "None exists or is planned"; use mainnet, separate dev accounts, tiny amounts, `dry: true` (Q-007) | Our simulator is fine; the organizers' sanctioned proof is a small mainnet run |
| Testnet-only projects | Assumed fine | **Eligible in all tracks**; "mainnet only where the integration is mainnet-only" (Q-010) | ✅ The testnet-only decision stands; Intents is the one place where mainnet proof helps |
| Mandatory integrations | Hints | None; your own NEAR contract that fits the track is enough (Q-011) | ✅ |
| Demo | — | A local-only demo is OK, with a public repo, a reproducible README and an X video. **Screenshots alone are not enough** if judges can't open the demo. A hosted demo is a plus: **keep it up to Nov 18, ideally Nov 25** (Q-012) | Extend monitoring and funding to Nov 25 |
| Rights / license | — | The team keeps the rights (Q-013). **Add a LICENSE file**; any license, MIT is fine; repo public through judging (Q-014) | Add a LICENSE |
| One person, two projects | Not covered | Allowed, max 2 per person, if the projects are independent and **each README names the other** (Q-015) | Doesn't apply: Pot's team members aren't on another submission |
| Email | Unique per submission | **At most 2 submissions per email** | — |
| Uniqueness / 409 | `projectName` and `email` unique; 409 = name or email used | **`projectUrl` unique** (each repo submitted once); 409 = repo already submitted, or the email has 2 submissions. Name uniqueness is no longer stated | Keep a distinct name anyway |
| Payout | — | Single payment, no vesting, within 30 days of results (Q-016) | — |
| AI judges | "AI judges", role undocumented | Claude Code and Codex **screen**: reproducibility check, feature verification, structured report, preliminary score. Humans decide; a low AI score alone can't reject (Q-017) | The README's run steps must work on a clean machine, and every claim must be verifiable |
| Tracks | "Every track the project fits" | Same; still one submission per project. Winning in two tracks is still not stated | `["social","realworld"]` |
| Agent conduct | Never push, publish, post, sign, deploy to mainnet or submit without confirmation | Same list, plus "never commit secrets" (keys in env vars) | No change |
| Judges list, criteria | Named on the homepage | Not in HACKATHON.md; still on the homepage (not re-checked) | — |

**Still open (ask the organizers if it matters):** KYC or tax forms at payout; whether one project can place in two tracks.

## TL;DR (Oct 21; see the update above)
- **Window (UTC):** the hackathon starts `2026-11-01T00:00:00Z`; development and submissions end `2026-11-14T23:59:00Z`; judging starts `2026-11-16T00:00:00Z`; results are announced by `2026-11-18T23:59:00Z`. The API accepts submissions only inside the dev window and returns **403** outside it. 📄
- **Submit exactly once:** `POST https://nearhackathon.com/api/applications` with exactly 11 JSON fields, body ≤ 12,000 bytes. A submission cannot be edited. `projectName` (case-insensitive) and `email` must be unique, and a duplicate gets **409**. A `website` field is a spam trap. 📄 The site's own form JS builds the same payload (form fields + `tracks`, `size`, `consent`, `requestId`) and POSTs it to `/api/applications`. ✅
- **Order of operations:** make the repo public, then a human publishes the X demo post (saying "built at NEAR HACKATHON", with video or screenshots attached), then a human confirms the printed JSON, then you POST. **Agents must never push, make repos public, post, sign transactions, deploy to mainnet or submit without explicit human confirmation.** 📄
- **Tracks for Pot:** `social` ("Build shared budgets, programmable rewards, collective ownership and reputation-based access on top of Sputnik DAO and Trezu. Don't rebuild the multisig — build what communities do with it." Hints: SPUTNIK DAO, TREZU, NAMED ACCOUNTS) and `realworld` ("Build payroll, invoicing, remittances, merchant payments and stablecoin rails for real businesses. Something a normal company could use tomorrow." Hints: STABLECOINS, NEAR INTENTS, META TRANSACTIONS). Hints "are hints and wishes, not requirements". Name the ones you use in the README. 📄
- **Judges:** Illia Polosukhin (NEAR), Eddy Lazzarin (a16z crypto), Mert Mumtaz (Helius), Avichal Garg (Electric Capital), Kain Warwick (Synthetix & Infinex), Haseeb Qureshi (Dragonfly), Stepan Gershuni (cyber•Fund), plus **"Claude Code & Codex joining as AI judges"**. 📄
- **Criteria:** no rubric and no weights are published. The FAQ only says "Previous NEAR hackathons evaluated technical implementation, design, impact, originality and sustainability — a good guide to prepare by." 📄 Earlier NEAR Foundation hackathons on Devpost weighted these five **equally** and broke ties on technical implementation. That is a proxy, not this event's rule. ⚠️
- **Prizes: $250,000 "paid in NEAR".** The grand prize is $55K (×1). Each of the 13 tracks pays 1st $10K, 2nd $3K and 3rd $2K. The payout goes to the mainnet `nearAddress` in the submission. **No KYC, tax-form or eligibility restrictions are stated**, beyond "Developers, designers and people with ideas for the NEAR ecosystem." 📄
- **Pre-existing code:** HACKATHON.md has no clause on it, but the homepage submission steps start with "01 Build your project during the hackathon". Keep Phase 0 code-free, as already planned. 📄
- **Team size** must be exactly one of `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+`. Pot is built by Cerasela Mardare alone, so **`1`**. 📄
- **README for AI judges:** "what the product is, the problem it solves, and how to try it as 'do X - see Y' steps a judge can follow. No marketing." 📄

## Plan check

| Original plan claim | Status | Note |
|---|---|---|
| Dev ends 2026-11-14T23:59:00Z; judging Nov 16-18 | ✅ confirmed (📄) | Judging starts 11-16 00:00Z; results by 11-18 23:59Z. |
| Submit once via `POST /api/applications`, no edits, unique name + email | ✅ confirmed (📄) | Name uniqueness is **case-insensitive**. A retry must reuse the same `requestId`. |
| README needs "do X - see Y" steps, no marketing | ✅ confirmed (📄) | Also: "write the README for a machine reader as well as a human one". |
| Track hints for `social` / `realworld` | ✅ confirmed, ❌ incomplete | The plan quotes only the hint tags. The full "Build" text of `realworld` asks for "real businesses… something a normal company could use tomorrow", which is a weaker fit for a trip Pot. Frame the Club and Team presets (club dues, team offsite budget) in the README. |
| "No explicit 'no pre-existing code' clause. Treat it as if it did." | ✅ confirmed (📄) | The homepage says "Build your project during the hackathon". Keep the rule. |
| Submission target "Nov 13 by 18:00 UTC" | ✅ compatible | Inside the window. Note that the repo must be public and the X post live **before** you POST. |
| Video "under 3:00" (C7) / 2:50 (C8) | ⚠️ conflicting | X's own API docs (docs.x.com) list default accounts as allowed **20 min** of video on a Post ("Post-video caps match the X app"), but several 2026 third-party guides still say **2:20** for free accounts. HACKATHON.md sets no length. **Cut a ≤ 2:20 version** or check in the posting account's composer before the day. |
| X post text (C8) contains "Built at NEAR HACKATHON" + video | ✅ meets the rule | The rule: "it says the project was built at NEAR HACKATHON and has the demo video or screenshots attached". |
| Judges / criteria / prizes | ❌ missing from the plan | Add them (see Reference). "Design" is a named criterion, which supports the plan's UX-first bet. "Sustainability" is not addressed in the plan: add a short "Costs and path to sustainability" section to the README. |
| Telegram, store and 1Click facts | n/a | Owned by infra, web and intents. Not hackathon rules. |

## Reference

### Timeline (all UTC) 📄

| Event | Time |
|---|---|
| Hackathon starts / submissions open | 2026-11-01T00:00:00Z |
| Development ends = submission deadline | 2026-11-14T23:59:00Z |
| Judging starts | 2026-11-16T00:00:00Z |
| Results announced by | 2026-11-18T23:59:00Z |
| Pot's own target (plan, Part A) | Submit 2026-11-13 by 18:00 UTC; Nov 14 is buffer |

Observed on 2026-10-21: `GET https://nearhackathon.com/api/applications` → `{"count":0}`. This is a public submission counter, and reading it is harmless. **Never POST to it in Phase 0.** ✅

### Submission API 📄 (field list also ✅ in the site's form JS)
`POST https://nearhackathon.com/api/applications`, `Content-Type: application/json`, body ≤ **12,000 bytes**. "Send exactly these fields":

| Field | Type | Rule |
|---|---|---|
| `requestId` | string | UUID, generated **once** (`uuidgen \| tr A-Z a-z`) and reused on retries. The server then treats a retry as the same submission. |
| `projectName` | string | 2-80 chars, unique (case-insensitive) |
| `leadName` | string | 2-80 chars |
| `email` | string | valid email, ≤ 160 chars, unique |
| `size` | string | exactly one of `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+` (spaces included) |
| `tracks` | string[] | one or more of `defi, thesis, privacy, business, swarms, security, agents, realworld, games, nfts, memecoins, social, open`, each once |
| `nearAddress` | string | 2-64 chars, lowercase, regex `^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$`. Mainnet named (`team.near`) or 64-char implicit. |
| `projectUrl` | string | http(s) URL of the **public** repo, ≤ 300 chars |
| `demoUrl` | string | http(s) URL of the **public X post**, ≤ 300 chars (form placeholder `https://x.com/your-team/status/…`) |
| `idea` | string | 20-2000 chars: "the problem, the product, and how NEAR fits in" |
| `consent` | boolean | `true` only after the human agreed to: "I agree that the organizers may use these details to review our submission and contact us about this hackathon." |

"Do not add other fields. In particular `website` is a spam trap: any non-empty value rejects the submission." The form renders it as a hidden honeypot input (`name:"website", tabIndex:-1`). ✅

| Status | Meaning | Action (per HACKATHON.md) |
|---|---|---|
| 201 | saved | Tell the human. Done. |
| 400 | field failed validation | Fix the fields listed in `fields`, resend with the **same** `requestId` |
| 403 | not open, or request looked cross-site | Tell the human. **Do not retry.** |
| 409 | name or email already used | Already submitted. Ask the human. **Don't rename to get around it.** |
| 413 | body too large | Shorten `idea` |
| 503 | storage unavailable | Wait a minute, resend with the same `requestId` |

"What the human decides … Do not guess, generate or fill in placeholders for any of them": project name, lead name, email, size, tracks, mainnet payout account ("Never create or invent one on their behalf"), repo link, demo post link, the `idea` text, and consent. 📄

### Tracks relevant to Pot 📄

| id | Track | Build text | Hints |
|---|---|---|---|
| `social` | Social Money ("Coordinate value together") | Build shared budgets, programmable rewards, collective ownership and reputation-based access on top of Sputnik DAO and Trezu. Don't rebuild the multisig — build what communities do with it. | SPUTNIK DAO, TREZU, NAMED ACCOUNTS |
| `realworld` | Real-World Money ("Bring the boring money onchain") | Build payroll, invoicing, remittances, merchant payments and stablecoin rails for real businesses. Something a normal company could use tomorrow. | STABLECOINS, NEAR INTENTS, META TRANSACTIONS |

Multi-track: "Select every track your project fits… It is still one submission per team." Whether one project can win prizes in **two** tracks is **not stated**. ⚠️

### Judging 📄
- **Jury:** the 7 people listed in the TL;DR, plus "Claude Code & Codex (Anthropic & OpenAI)" as AI judges.
- **Criteria (FAQ):** "Previous NEAR hackathons evaluated technical implementation, design, impact, originality and sustainability — a good guide to prepare by." No weights.
- **Proxy wording (NEARCON IRL 2023 and MetaBUILD rules on Devpost, NEAR Foundation as sponsor):** "equally weighted criteria: Technological Implementation (Does the interaction with NEAR demonstrate quality software development?) Design (Is the user experience and design of the project well thought out?) Potential Impact (Is the Project Open Source and how big of an impact could the project have on the NEAR ecosystem?) Quality of the Idea (How creative and unique is the project?) Project Sustainability (Is the plan for the Project thought out and realistic?)". Ties went to the higher technical-implementation score. ⚠️ (proxy)
- **What AI judges run or read: not documented.** ⚠️ The only statement is that the README should serve "a machine reader as well as a human one". Assume a coding agent with repo access that reads `README.md` first, may run documented commands, and may fetch URLs **without JavaScript, login or a phone**. It probably cannot do Google login, install a PWA, receive push, or watch an X video. Therefore:
  1. `/demo` must server-render meaningful text (pot name, balance, feed) so a plain HTTP fetch sees it.
  2. Every "do X - see Y" step needs a non-UI twin: a `near … view` call, `curl` to a read-only JSON route, or a nearblocks link.
  3. Tests must run with no keys.
  4. Embed 4-6 screenshots with descriptive alt text so multimodal judges can assess "design".

### Prizes 📄

| Prize | Amount | Count | Total |
|---|---|---|---|
| Grand prize | $55K | 1 | $55K |
| 1st place (per track) | $10K | 13 | $130K |
| 2nd place | $3K | 13 | $39K |
| 3rd place | $2K | 13 | $26K |
| **Pool (aria-label "$250,000"), "paid in NEAR"** | | | **$250K** |

### README requirements 📄
"What the product is, the problem it solves, and how to try it as 'do X - see Y' steps a judge can follow. No marketing." Also "Lean on [the hints] that fit the idea and name them in the README." Plan C8 already follows this. Additions: name the hints used (SPUTNIK DAO, TREZU, NAMED ACCOUNTS, STABLECOINS, NEAR INTENTS, META TRANSACTIONS); add a two-line costs/sustainability section; add an OSS licence file (the proxy "Potential Impact" asks "Is the Project Open Source").

### Demo post and video 📄
- "The human records a demo and publishes a public post on X: it says the project was built at NEAR HACKATHON and has the demo video or screenshots attached." An agent "can draft the text; the human posts it and gives you the link."
- `demoUrl` must be the **X post** URL, not a YouTube link. There is no length rule. For the X upload limits see Gotchas.

### Pre-existing code, team, eligibility, KYC, payout 📄
- **Pre-existing code:** no clause. The homepage says "Build your project during the hackathon". "No sign-up to start."
- **Team:** "Build as a solo builder or with a team — one submission per team." (Superseded by Q-015 in the 2026-10-29 update; it doesn't apply to Pot, whose team members aren't on another submission.)
- **Eligibility:** "Developers, designers and people with ideas for the NEAR ecosystem." No age, country or sanctions text is published. ⚠️ The NEAR Foundation's 2023 Devpost rules excluded sanctioned jurisdictions and required age of majority (proxy only).
- **KYC / tax:** **not mentioned anywhere** on the site, in HACKATHON.md or in the JS bundle (grep for KYC, eligib, sanction, tax, verification: 0 hits). ⚠️ The NEAR Foundation's 2023 Devpost rules said winners "may be required to provide a completed form W-9 … or … W-8BEN". Expect that paperwork may be requested at payout.
- **Payout:** "TOTAL PRIZE POOL (paid in NEAR)". Form help text: "Your own wallet or your team's. If you win, the prize is sent here." "No wallet connection is needed to submit."

### Agent conduct rules (HACKATHON.md, "Never without the human's explicit confirmation") 📄
Send the submission (print the full JSON first and wait for a yes) · post anything on X or elsewhere · make the repository public, push or force-push · sign transactions, spend tokens or deploy to mainnet · commit secrets ("Keys belong in environment variables, never in the repository").

## Snippets
Payload **shape only**. Every value comes from a human; never send placeholders. (Not sent; documentation only.)
```json
{
  "requestId": "<uuid v4, lowercase, generated once and saved>",
  "projectName": "<human: 2-80 chars, unique>",
  "leadName": "<human: 2-80 chars>",
  "email": "<human: unique, ≤160>",
  "size": "1",
  "tracks": ["social", "realworld"],
  "nearAddress": "<human-created MAINNET account, lowercase>",
  "projectUrl": "<public GitHub URL>",
  "demoUrl": "<https://x.com/<handle>/status/<id>>",
  "idea": "<human-written, 20-2000 chars>",
  "consent": true
}
```
`nearAddress` regex, tested locally on 2026-10-21 ✅: `pot-team.near` PASS · `Pot.near` FAIL (uppercase) · `pot..near` FAIL · 64-hex implicit PASS · **`pot.testnet` PASS. The regex does not catch a testnet account, so check by eye that it is mainnet.**

## Gotchas & failure modes
- **One attempt.** A 409 means you already submitted. Generate `requestId` once, store it somewhere outside git (it is personal data), and reuse it on 400 or 503.
- **403 outside the window.** Don't test the endpoint before Nov 1.
- **The repo must be public before the POST**, and the X post must exist (its URL goes in `demoUrl`).
- **Project-name collisions:** "Pot" is short and generic, and the first team to submit it wins it. "Pot" is also NEAR-ecosystem jargon: PotLock calls its quadratic-funding rounds "Pots" (see competitors-ux-patterns.md). Decide on a distinctive submission name early.
- **`idea` is human-authored.** HACKATHON.md says agents must not "guess, generate or fill in" these values. An AI draft can only be a starting point the human rewrites and confirms.
- **X video length:** docs.x.com (accessed 2026-10-21) gives default accounts "0.5 seconds–20 minutes" for video on a Post (Premium: 125 min). Secondary 2026 guides (vid-crush, kompozy, bulkpublish) still say 2:20 or 2:00 for free accounts. ⚠️ Keep a ≤ 2:20 cut ready.
- **AI judges probably can't log in.** Without the `/demo` path and CLI proofs, an AI judge may score the project on the README alone.

## Costs, limits, latencies

| Limit | Value | Status |
|---|---|---|
| Body | ≤ 12,000 bytes | 📄 |
| `idea` | 20-2000 chars | 📄 |
| `projectName` / `leadName` | 2-80 chars | 📄 |
| `email` | ≤ 160 | 📄 |
| URLs | ≤ 300 | 📄 |
| `nearAddress` | 2-64, lowercase, regex above | 📄, regex ✅ tested |
| Submissions | 1 per team | 📄 |
| Fee | none mentioned | 📄 |

## Open questions / needs a human
1. **Cerasela (or P1):** final submission `projectName` (and a fallback if taken), `leadName`, team email, mainnet payout account (created by a human in a wallet), who owns and posts the X demo, and whether that account has X Premium.
2. **Human decision:** ask organizers (NEAR Discord) whether a project can win in two tracks, and whether KYC or tax forms are required at payout? Agents must not contact anyone, so this is Cerasela's call.
3. **Human:** on Nov 1 and Nov 13, re-fetch HACKATHON.md and diff it against this file ("dates and rules may change").
4. **P1/P2:** add a "Costs and sustainability" README section (the cost per Pot and per user that the sponsor covers, and who pays at scale) to answer "sustainability".

## Compliance checklist for Pot
- [ ] Phase 0 (now to Oct 31): no product code. Spikes stay throwaway (kb/README rule; homepage "Build your project during the hackathon").
- [ ] Nov 1: re-read HACKATHON.md, diff against this file, and update the dates in the plan if they changed.
- [ ] Repo: public before 2026-11-14T23:59Z (target Nov 13). OSS licence file. No secrets (demo keys only in hosting env vars). Lockfile committed.
- [ ] No agent pushes, publishes, deploys to mainnet, signs or posts without explicit human confirmation.
- [ ] README: opens with what it is and the problem (2-3 lines, no marketing); "do X - see Y" steps with a non-UI twin for each; `/demo` server-renders; tests run without keys; names the track hints used; includes Why web-first, Limitations, and Costs/sustainability; 4-6 screenshots with alt text.
- [ ] Demo video ≤ 2:20 (or length verified in the posting account). The X post says "built at NEAR HACKATHON" and attaches the video (or screenshots). A human posts it.
- [ ] Payload: `tracks: ["social","realworld"]`, `size: "1"`, unique `projectName` and `email`, **mainnet** `nearAddress` checked by eye, `projectUrl` = public repo, `demoUrl` = X post, human-written `idea` (20-2000 chars), `consent: true` only after the notice is read verbatim, no `website` field, ≤ 12,000 bytes.
- [ ] `requestId` generated once, stored outside git, reused on 400/503. Stop on 403/409.
- [ ] The JSON is printed and a human says "yes" before the POST. Submit by Nov 13 18:00 UTC. Tell the human about the 201.

## Sources
- https://nearhackathon.com/HACKATHON.md: all rules, API contract, tracks, timeline, agent conduct. Accessed 2026-10-21.
- https://nearhackathon.com/: prizes ($250,000 aria-label; per-place table), judges, FAQ (criteria, eligibility, multi-track), "Build your project during the hackathon", form help texts. Accessed 2026-10-21.
- https://nearhackathon.com/_next/static/chunks/*.js (site bundle): form posts `requestId` + fields to `/api/applications`; hidden `website` honeypot; FAQ strings; WebMCP tool `stage_team_application` ("Does not submit anything"). Accessed 2026-10-21.
- https://nearhackathon.com/api/applications (GET): `{"count":0}` on 2026-10-21. Accessed 2026-10-21.
- https://nearcon-hackathon.devpost.com/rules and https://metabuild.devpost.com/rules: proxy criteria (equally weighted five), tie-break, W-9/W-8BEN wording, sanctions text, <3-minute video norm. Accessed 2026-10-21.
- https://docs.x.com/x-api/media/quickstart/best-practices (`.md`): Post video 0.5 s-20 min default, 125 min Premium/verified; "Post-video caps match the X app". Accessed 2026-10-21.
- https://kompozy.io/specs/x-twitter-video-length-limit and https://vid-crush.com/blog/twitter-video-upload-limits/ (via search): conflicting 2:00 / 2:20 claims for free accounts. Accessed 2026-10-21.
