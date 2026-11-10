# Pot: the detailed judging guide

For AI judges and reviewers who want to check every claim. People new to Pot should start with the
[README](../README.md); its "Try it" section is the short version of these steps.

**What to expect:**
- The app: https://usepot.xyz, on NEAR testnet with test dollars.
- J-1 to J-6 use `/demo`, a simulation: nothing is signed or sent, and it needs no login or JavaScript for the
  server-rendered read (J-6).
- J-7 reads the live contracts with near-cli-rs: read-only, no keys.
- J-8 runs the tests: no keys; the app tests use a local Postgres (`pnpm db:up`).
- J-9 uses the live app with a NEAR testnet wallet.
- J-10 checks real testnet transactions for every core action with one read-only command: `node scripts/verify-proofs.mjs`.
- Every step is executed by an automated test; `scripts/check-readme-steps.ts` keeps this file and those tests in
  step (it runs in CI).

Related: [architecture](architecture.md) · [NEAR features in detail](near-features.md) · [costs](costs.md) ·
[testing](testing.md) · [security](../SECURITY.md)

---

Each step says what to do and what you should see.

## The demo (J-1 to J-6)

`https://usepot.xyz/demo` is a two-minute guided simulation: Maya, Sam and Leo share the money for a Lisbon trip, in 14 steps
over five parts. The phone is the real Pot app, with one short sentence per step. **Nothing is signed or sent.** Each
part has an **Under the hood** button: what each tap signed, what our relayer sent, every receipt, and the Sputnik DAO
proposal with its votes; every hash there starts with `sim-`, and each part links to a real equivalent on testnet. The
numbers are the demo story: everyone puts in $150 ($450); $84 of groceries is approved by the Pot's rules; a $300 boat
trip needs one OK from Sam or Leo; at close, everyone gets back $22.00. Step with Next (or →), or with the phone's own button.
Every step has a link (`/demo#step-7` is the $84 approval); `/demo/4` opens part 3 at the $84 spend, and `#near` opens
that part's Under the hood (`/demo/4#near`).

<!-- J-1 -->
**J-1. Open `https://usepot.xyz/demo` and tap "Show me how".**
Part 1, "Start a Pot": Maya keeps the suggested rules and taps "Create Pot", then gets one link to share. Under the hood: what
her one tap signed (`create_pot` to `pots.potprev.testnet`, 300 Tgas, deposit 0), the relayer's transaction around it,
and the receipts that create `lisbon-trip-7k2f.pots.potprev.testnet` as a Sputnik DAO with **no access keys** and two
roles: Maya, and the Pot Hub's `rulebot` seat.

<!-- J-2 -->
**J-2. Part 2, "Join and chip in": now you're Leo.**
The invite shows "Maya and Sam are in" and $300 of $450; "Join Lisbon Trip", then "You're in!" and "Add my $150 share";
the Pot shows "$450 of $450 collected". Under the hood: the invite signature (`pot-join:v1:<pot>:<account>`), the
`AddMemberToRole` proposal #1 approved by the Hub's seat (1 of 1), and `ft_transfer_call` with the 1 yoctoNEAR the
relayer pays.

<!-- J-3 -->
**J-3. Part 3, "Small spends": $84 of groceries.**
Tap "Get $84 back" in the phone: "Checking Pot rules…" (Next waits 1.2 s), then **"Approved by Pot rules"** and "$84
sent to you"; the Pot shows **$366.00**. Nobody voted: under the hood the Hub's rules check passes, it files proposal #2
(`Transfer`, `84000000`) and approves it with its 1-of-1 `rulebot` seat; 14 receipts, and Maya paid 0 NEAR.

<!-- J-4 -->
**J-4. Part 4, "Bigger spends": a $300 boat trip.**
The phone says "This needs one OK from someone else who has added money" (a new Pot's rules: one OK covers spends up to $300) and, after
"Ask for one OK", "Needs one OK". Then you're Leo: his lock screen shows "Maya needs one OK", and "OK $300" pays Maya
("Done. Your OK sent $300 to Maya."); the Pot shows **$66.00**. Part 4's Under the hood simulates the other path, the
one spends over the one-OK limit take, with Maya's and Leo's approvals as DAO votes (2 of 3, threshold
`min(3 × 1 ÷ 2 + 1, 3) = 2`). Its real links are both from the reference Pot (J-10): Sam's one OK on a $150 spend,
which the Hub approves with its seat, and Leo's deciding vote on a $310 spend that went to the group.

<!-- J-5 -->
**J-5. Part 5, "Close and share back".**
Maya taps "Ask the group to close"; then you're Sam, who taps "Approve closing". One `FunctionCall` proposal (#4) holds
three `ft_transfer`s; Sam's approval runs them in one receipt. Everyone gets back **$22.00**. Part 5's Under the hood
ends with the recap: 11 signatures by people, 12 transactions and 0 NEAR paid by Maya, Sam or Leo. "Finish" ends on
"That's Pot." and **Start a real Pot**.

<!-- J-6 -->
**J-6. Read it without a browser.** Every tour page is server-rendered with the whole story as an ordered list
(`<li id="step-1">`…`<li id="step-14">`) and each part's Under the hood in a closed `<details>`, with every decoded card
and the raw JSON: `curl -s https://usepot.xyz/demo/4 | grep -c "Approved by Pot rules"` prints `1` (`grep -c` counts the lines that contain it, and the story sits on one line). `https://usepot.xyz/demo/all` is the full
technical read on one page: every step and card, the recap and the glossary.

## The contracts, the tests and the live app (J-7 to J-9)

<!-- J-7 -->
**J-7. Read the contracts yourself (read-only, no keys).** `npx` runs near-cli-rs without an install:

```bash
near() { npx -y near-cli-rs@0.30.1 "$@"; }
ROOT=potprev.testnet; HUB=pots.$ROOT; POT=reference-trip-2gzw.$HUB
near contract call-function as-read-only $POT get_policy json-args '{}' network-config testnet now
near contract call-function as-read-only $HUB get_pot json-args "{\"pot\":\"$POT\"}" network-config testnet now
near contract call-function as-read-only usdc.$ROOT ft_balance_of json-args "{\"account_id\":\"$POT\"}" network-config testnet now
near account view-account-summary $POT network-config testnet now
near contract call-function as-read-only $POT get_factory_info json-args '{}' network-config testnet now
near account list-keys usdc.$ROOT network-config testnet now
near account list-keys $POT network-config testnet now
near account list-keys $HUB network-config testnet now
near contract call-function as-read-only $HUB contract_source_metadata json-args '{}' network-config testnet now
near account view-account-summary $HUB network-config testnet now
```

What you see (`scripts/readme-cli-check.sh` runs exactly these and asserts the values):
`reference-trip-2gzw` is the reference Pot: the whole story ran in it on testnet (J-10 lists every transaction), and it
ended with the close, so it reads as a finished Pot.
- `get_policy`: a Sputnik DAO with two roles. `member` (Maya, Sam and Leo, three test accounts; majority, default
  `threshold [1, 2]`) has only `*:VoteApprove` and `*:VoteReject`: members vote, and only the hub files proposals.
  `rulebot` (only `pots.potprev.testnet`, 1 of 1) may file and approve transfers and member additions, finalize
  transfers and function calls, and file function calls such as the close, which only members can approve.
  `proposal_bond` is `"0"` and `quorum` is `"1"`. (Pots made before hub 1.3.0, such as `lisbon-trip.$HUB`, keep
  their policy v1, where members may also file proposals.)
- `get_pot`: `"name": "Reference Trip"`, `status: "closed"`, `member_count: 3`, `policy_version: 3`,
  `total_contributed: "599990400"` ($599.99 put in over its life), rules `instant_cap` $100 and `member_budget` $200.
- `ft_balance_of`: `"0"`: the close paid everything back.
- `view-account-summary`: the Pot runs the global contract with SHA-256
  `c9a502ef08a06cef04e2fce82da60b1fbc78db3066ff41416110f4292fca39ce` (Sputnik DAO v2, testnet global code
  `Ea8tHXFSQVszVwGASyzAfLq65DjcRDhkfab4FcPaRpgD`) and "Account is locked (no access keys)".
- `get_factory_info`: `factory_id` is the hub, `pots.potprev.testnet`.
- `list-keys` on the token and on the Pot: an empty table. Nobody can sign for them.
- `list-keys` on the hub: an empty table too. The hub is locked, so nobody can change its code or sign as it; the
  code hash below is final (see [limitations](limitations.md)).
- `contract_source_metadata` on the hub (NEP-330): `version` `"1.3.0"` and `link`
  `https://github.com/ceraselamardare/pot`.
- `view-account-summary` on the hub: "Account is locked (no access keys)", and the code's SHA-256 is
  `fa7af2fb7f612acd8d114a791aa9c670cad5e3baeb756f78937aa8df71d5d984`. `contracts/scripts/build.sh` on this repo
  builds the same bytes (arm64 macOS or Linux, the pinned toolchain): the deployed hub is this source.

On a `-429` rate limit, add a FastNEAR network config or retry later; the default testnet config of near-cli-rs
0.30.1 already uses FastNEAR's RPC.

<!-- J-8 -->
**J-8. Run the tests (no keys):** `pnpm i && pnpm db:up && pnpm test` (Docker; the local Postgres on
port 54329, see [testing](testing.md) if that port is taken) and `cd contracts && cargo test`
(arm64 macOS or Linux; it downloads the NEAR sandbox, and a cold run compiles everything first, so expect about a
quarter of an hour, with "has been running for over 60 seconds" lines that are normal). Or run
`scripts/judge-check.sh`: every keyless check (typecheck, lint, the unit and DB tests, the contract tests, the J-7
reads and the live proofs) on its own database and ports, with a summary at the end. See [testing](testing.md).

<!-- J-9 -->
**J-9. Try the real thing on testnet (needs a NEAR testnet wallet, e.g. Meteor or Intear; 0 NEAR is fine).**
Open https://usepot.xyz → "Start a Pot" → "Continue with a NEAR wallet" and sign the sign-in message (NEP-413; no
transaction). Name the Pot and tap "Create Pot": the sheet says "Free: we cover the setup.", and a new account
`<slug>.pots.potprev.testnet` exists (Settings → "On the explorer"). "Add money" → "Free test dollars" shows
"+$X on the way", then the balance. "Spend" $20 → "This will be approved instantly" → "Approved by Pot rules" and
"$20 sent to you": the hub filed and approved the DAO transfer in one call chain, and you paid 0 NEAR. "Invite
friends" gives a QR and a link; a second wallet that opens it sees "<you> invited you to <Pot>" and joins.
The same flows run automatically in `apps/web/e2e/testnet/flows.testnet.ts`.

**What a judge can't do from here:** sign in with Google (NEAR Auth's shared testnet client only accepts
`http://localhost:3000`, so the hosted app offers a NEAR wallet only, although the demo story shows Maya and Leo
signing in with Google), receive push notifications (needs an installed phone app), or see real money move (testnet).

## Live proofs on testnet (J-10)

<!-- J-10 -->
**J-10. Check that each thing Pot does has happened on chain (read-only, no keys, no install):**

```bash
node scripts/verify-proofs.mjs
```

It reads every transaction below from archival FastNEAR RPC and checks four things: our relayer sent it, inside is
the person's signed NEP-366 delegate to the right contract and method, no receipt failed (a relayed transaction's
top-level status hides inner failures, so it reads every receipt), and the events and logs below appear. It ends
with a line saying every proof holds. It exits 1 if a proof doesn't hold, and 2 if the RPC didn't answer (FastNEAR's
free tier rate-limits bursts; run it again in a minute). The list itself is `docs/proofs.json`, with the expected events per transaction.

| Action | Transaction | What it shows |
|---|---|---|
| Start a Pot under the current rules (policy v3) | [`DMStMzsU…`](https://testnet.nearblocks.io/txns/DMStMzsUAkBQph7BZuos3ADmhizyxitrjQUugybMMXXw) | Maya's one signed call: the hub creates reference-trip-2gzw.pots.potprev.testnet as a Sputnik DAO from the global code (policy v3: members only vote), with trip rules ($100 instant, $200 each), one OK up to $300, earned trust and pay links on, and its first invite. |
| Join with an invite link | [`CTk22gc9…`](https://testnet.nearblocks.io/txns/CTk22gc9qp2fumUjFRKCaznd4DihZpkZfy68z9KCykTr) | Sam signs with the invite link's key; the hub checks the ed25519 signature, files AddMemberToRole in the DAO and approves it with its 1-of-1 rulebot seat. |
| Put money in | [`HsfSKzGz…`](https://testnet.nearblocks.io/txns/HsfSKzGztF3FVHpJHtrxD7TCWVUD4bZVs8XScPN6pNfD) | Maya's ft_transfer_call to the hub moves $200 of test dollars into the Pot's DAO and records her contribution (the relayer pays the 1 yoctoNEAR deposit). |
| A small spend approved by the rules alone | [`AcobWgTJ…`](https://testnet.nearblocks.io/txns/AcobWgTJZMyosrP1nEhiE5YB1UCfZtkXcSwuFwEtXzke) | Maya asks for $40: within the $100 rule, so the hub files a Transfer proposal and approves it with its rulebot seat, and the DAO pays out in the same call chain. Nobody voted. |
| A bigger spend paid after one other member's OK | [`9K4beHZV…`](https://testnet.nearblocks.io/txns/9K4beHZV1BkxKvXgaQ2WY8KAz5MPrHSkHTj5NqGL1HVr) | Maya's $150 is over the instant limit but within one OK. Sam's OK goes to the hub, which checks it is allowed (not the payee, joined earlier, has put money in) and approves the DAO transfer: it is paid. |
| A spend with a scanned receipt's fingerprint | [`2ZD6Y71v…`](https://testnet.nearblocks.io/txns/2ZD6Y71vEusAaTLwhdKRuqi97F4yRUSZwmh63rHeX2yJ) | The $30 spend's request_ref is its 16-character operation key followed by 5ac7a261e59f1c99, the first 64 bits of the saved receipt's SHA-256. It is Maya's third paid spend, so the hub raises her trust to level 1 in the same call. |
| A spend decided by a group vote | [`9YfZ6DtZ…`](https://testnet.nearblocks.io/txns/9YfZ6DtZ2Ey5trk5CVPqDTKByfEasLYyvsbTZJwTbNAM) | Maya's $310 is over the one-OK limit, so the group decides. Leo's VoteApprove goes straight to the Pot's DAO; it is the deciding vote (2 of 3), so the DAO pays in the same transaction. |
| Someone outside the group chips in | [`4vFJWr4E…`](https://testnet.nearblocks.io/txns/4vFJWr4ERpzZ9u7WaLugZpo53x5KC97gwWCWCJwS5ySd) | Gus, who never joined, pays $25 into the Pot through a gift link; the hub records it as a gift, not a member's contribution. |
| Pay someone outside the Pot by link | [`3kd2RTE1…`](https://testnet.nearblocks.io/txns/3kd2RTE1Tycj2CmqsbHL6KSaCEdp9iedXfhF1gJTadfL) | Maya pays $20 by link: the rules approve it, and the DAO pays it into the hub's escrow until whoever holds the link claims it. |
| Get paid by a pay link | [`AdYtneka…`](https://testnet.nearblocks.io/txns/AdYtnekaHQxCfdjbznuW412tnkMoD5EPjD5S1e3c6y6X) | Gus, outside the Pot, claims it with a brand-new signature from the link's key; the hub checks the signature and pays him from escrow. |
| Money from another chain arrives (simulated on testnet) | [`2c38cRZh…`](https://testnet.nearblocks.io/txns/2c38cRZh4JGVQ2wMkJhB2Mud4EAjXMoEDxGmkDbDjZA5) | There is no NEAR Intents testnet, so after a 1Click-priced quote the simulator (treasury.potprev.testnet) delivers the quoted $49.99 to Leo; the next row is Leo putting it in. |
| …and goes into the Pot | [`46mThvqC…`](https://testnet.nearblocks.io/txns/46mThvqCzWX9wFXb34WZTeJ49ApZPdjjd16vzM249q1j) | The delivered dollars go into the Pot in one tap, recorded as Leo's contribution. |
| Ask the group to close the Pot | [`EjggW51d…`](https://testnet.nearblocks.io/txns/EjggW51daS5saiJ3w4cSRJ2WJ2siKfmMnTKLAKJPsSSY) | The hub files one FunctionCall proposal holding every member's pro-rata refund; members then approve it. |
| Close: everyone gets their share back | [`6Si9m42f…`](https://testnet.nearblocks.io/txns/6Si9m42frwXBTiKTWbd3Xgmz895uULXSsbcPsH9Vken7) | Sam's deciding approval of the close runs every refund in one receipt (3 ft_transfers, one per member). |

| View (read-only) | Call | What it shows |
|---|---|---|
| hub | `pots.potprev.testnet` `get_config` | The hub's version, its only relayer and the DAO code it deploys |
| pot | `pots.potprev.testnet` `get_pot` | The reference Pot: closed after the whole story, policy v3, one OK and trust on |
| policy-v3 | `reference-trip-2gzw.pots.potprev.testnet` `get_policy` | A current Pot: members can only vote; only the hub files proposals |
| trust | `pots.potprev.testnet` `get_trust` | Earned trust: after three paid spends, Maya's instant limit doubled |
| record | `pots.potprev.testnet` `get_record` | The public record: every spend with its tier and who approved it |

To check one by hand: `curl -s https://archival-rpc.testnet.fastnear.com -H 'content-type: application/json' -d
'{"jsonrpc":"2.0","id":1,"method":"EXPERIMENTAL_tx_status","params":{"tx_hash":"<hash>","sender_account_id":"users.potprev.testnet","wait_until":"NONE"}}'`
and read `receipts_outcome[].outcome.logs` for the `EVENT_JSON` lines. Use the archival RPC: the regular one forgets
transactions after a few days. The nearblocks links are for a browser; nearblocks may refuse plain `curl`.

They all come from one run of the whole story in one Pot, `reference-trip-2gzw.pots.potprev.testnet` (J-7), on the
current hub: `scripts/run e2e-chain --reference`, which writes `docs/proofs.json` only once every proof holds on chain.
Maya, Sam, Leo and Gus are throwaway test accounts (`*.e2e-*.pot-funds-65k8.testnet`) with 0 NEAR. The one-OK, trust
and close rules also run in the contract sandbox tests (J-8).

---
