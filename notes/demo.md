# demo notes: the `/demo` explainer

Build notes for plan/design-direction/05-demo-explainer.md. The lead took every default in §9:
- the Pot is `lisbon-trip-7k2f`;
- Sam approves the close;
- the delegates are signed for real and the keys are never stored;
- the Meanwhile interlude is in;
- `/demo/all` is in.

The old live testnet demo (server-held keys, real transactions) was **removed in Rev 9** (2026-11-01, plan/decisions.md): its page,
API routes, demo Pot pool and flags are gone. `/demo` is the simulation only; no real transactions happen in it.

## Data

Written 2026-10-27 by the data-layer agent. This section covers the simulation dataset only; the pages and components are documented separately.

### Files

| What | Where |
|---|---|
| The committed dataset (the page imports it) | `apps/web/app/demo/_data/demo-script.json` (≈ 276 KB pretty-printed, ≈ 142 KB compact) |
| Its types, for the page | `apps/web/app/demo/_data/types.ts`. It is a type-only re-export of `@pot/sdk/demo`. |
| The types' source of truth (spec §7.3, plus the additions below) | `packages/pot-sdk/src/demo/types.ts` |
| The generator | `packages/pot-sdk/src/demo/generate.ts` (`generateDemoScript()`, `serializeDemoScript()`, `recapOf()`, `simHash()`, `DEMO`, `SIM_TX_REAL`) |
| The receipt templates (spec §7.2 step 5) | `packages/pot-sdk/src/demo/receipts.ts` |
| The TS twin of the hub's `prepay_bytes`/`bytes_cost` (step 6) | `packages/pot-sdk/src/demo/prepay.ts` |
| The real tx list and the read-only fetcher | `packages/pot-sdk/src/demo/real.ts` |
| A read-only snapshot of the 15 real chains | `packages/pot-sdk/src/demo/real-chains.json` |
| The CLIs | `scripts/gen-demo-script.ts`, `scripts/check-demo-real.ts` |
| Tests | `packages/pot-sdk/src/demo/demo.test.ts`, `prepay.test.ts` (in the sdk vitest project, so root `pnpm test` runs them) |

**Commands:**
- `pnpm gen:demo` regenerates the JSON. It runs offline and is deterministic.
- `pnpm check:demo` exits 1 if the committed JSON is stale. The drift test checks the same thing.
- `pnpm check:demo-real` re-reads the real txs. It is read-only, uses archival FastNEAR, needs no keys and needs no testnet lock. Add `--write` to refresh `real-chains.json`.
- `POT_DEMO_TESTNET=1 pnpm --filter @pot/sdk exec vitest run src/demo` also re-checks the real txs over RPC.

**How it's made:**
- MockChain runs on `testnetConfig("potprev")`, starting at `Date.UTC(2026, 10, 7, 9, 0)`, height 275,000,000 and 600 ms per block. It follows `fixtures.ts`'s order and time gaps.
- Every delegate goes through the real path: `KeyPairPotSigner.prepare` → `sign`, then `verifySignedDelegate`, then `MockChain.handleRelayBody`. That path checks the signature, key, nonce and expiry.
- Keys come from `sha256("pot-demo/v1/<maya|sam|leo|invite|relayer>")`. They exist in memory only. The output carries public keys and signatures, never a seed or a secret, and a test greps for that.
- The page never runs any of this. It imports the JSON, plus types only.

### The real testnet references

Every real link the dataset carries. All 15 were re-read on 2026-10-27 with `EXPERIMENTAL_tx_status` (read-only).

| Chapter | Real tx | Mirrors | Label key |
|---|---|---|---|
| 1 | [3VpaA2MPY9LRoiobKFf7vLhNGoSKfY5TCGpV7XAmd2CY](https://testnet.nearblocks.io/txns/3VpaA2MPY9LRoiobKFf7vLhNGoSKfY5TCGpV7XAmd2CY) | `c1.create` | `demo.real.c1.create` |
| 2 (interlude) | [A3FUQBRNzPewHgnJwaVz96zCUVNAU39gfr5EZC1MgzG9](https://testnet.nearblocks.io/txns/A3FUQBRNzPewHgnJwaVz96zCUVNAU39gfr5EZC1MgzG9) | Sam joins | `demo.real.interlude.sam_joins` |
| 2 (interlude) | [E5f2JRgzUZHiRwUvyPrXk1rVXXPRaTC7NB2GxH6L5ASS](https://testnet.nearblocks.io/txns/E5f2JRgzUZHiRwUvyPrXk1rVXXPRaTC7NB2GxH6L5ASS) | Sam adds $150 | `demo.real.interlude.sam_adds` |
| 2 (interlude) | [HM56jUM6Eghp37iPq7tuJBynUcRKisipZGpchnqc3GVy](https://testnet.nearblocks.io/txns/HM56jUM6Eghp37iPq7tuJBynUcRKisipZGpchnqc3GVy) | Maya adds $150 | `demo.real.interlude.maya_adds` |
| 2 | [CA6KoGzoun9HLNho1561roToRerrLChySLwnyMUtoowd](https://testnet.nearblocks.io/txns/CA6KoGzoun9HLNho1561roToRerrLChySLwnyMUtoowd) | `c2.join` | `demo.real.c2.join` |
| 3 | [HFy2Vfzie3zk9LGoa2XAzR67Ahv4VKR7z1ZAYgWBf3Hy](https://testnet.nearblocks.io/txns/HFy2Vfzie3zk9LGoa2XAzR67Ahv4VKR7z1ZAYgWBf3Hy) | `c3.add` | `demo.real.c3.add` |
| 4 | [Gmoey4Le16CeqZN45AWpWmmtHgBtDNWnY37HkNnAYtMk](https://testnet.nearblocks.io/txns/Gmoey4Le16CeqZN45AWpWmmtHgBtDNWnY37HkNnAYtMk) | `c4.request` | `demo.real.c4.request` |
| 4 | [BXy7NYUUGt3SDGxL6Q2on5tBXh914SAHTDmsU52c7Fke](https://testnet.nearblocks.io/txns/BXy7NYUUGt3SDGxL6Q2on5tBXh914SAHTDmsU52c7Fke) | same shape | `demo.real.c4.same_shape` |
| 5 | [9D52NEhn1zduyrPVBkP2pR2WuSTCz5Q3qsvUzNQjMT2b](https://testnet.nearblocks.io/txns/9D52NEhn1zduyrPVBkP2pR2WuSTCz5Q3qsvUzNQjMT2b) | `c5.request` | `demo.real.c5.request` |
| 5 | [H8E7W9HdStBQZvyUCLcZ32kQjyjjY6TKeZMrLyLSJRfa](https://testnet.nearblocks.io/txns/H8E7W9HdStBQZvyUCLcZ32kQjyjjY6TKeZMrLyLSJRfa) | `c5.maya_vote` | `demo.real.c5.maya_vote` |
| 5 | [6D5MGdYb5hnFCATcL9VkuuHapYkcuZifA7tvwbQngvsH](https://testnet.nearblocks.io/txns/6D5MGdYb5hnFCATcL9VkuuHapYkcuZifA7tvwbQngvsH) | `c5.leo_vote` | `demo.real.c5.leo_vote` |
| 5 | [BSQFyv2HfngBDEMRw8svtwkZ8Vxk4NnZc834kriB7LFU](https://testnet.nearblocks.io/txns/BSQFyv2HfngBDEMRw8svtwkZ8Vxk4NnZc834kriB7LFU) | `c5.sync`, and the ≈ figures of `c6.sync` | `demo.real.c5.sync` |
| 6 | [CfC4hZgLtceLYmH4fEQWEUwv7kSM6oyvxJfJa8dvX6uG](https://testnet.nearblocks.io/txns/CfC4hZgLtceLYmH4fEQWEUwv7kSM6oyvxJfJa8dvX6uG) | `c6.propose` | `demo.real.c6.propose` |
| 6 | [3bR6AZBaMyUZ9noNADv5wNQ144ZkvcBwB7skCTjoWuxK](https://testnet.nearblocks.io/txns/3bR6AZBaMyUZ9noNADv5wNQ144ZkvcBwB7skCTjoWuxK) | `c6.maya_vote` | `demo.real.c6.maya_vote` |
| 6 | [MC1U7asQRbpqipa8o5qXasNYgqyWXghk8gHgUwaXhbK](https://testnet.nearblocks.io/txns/MC1U7asQRbpqipa8o5qXasNYgqyWXghk8gHgUwaXhbK) | `c6.sam_vote` | `demo.real.c6.sam_vote` |

### Deviations from spec §7

**Deviations:**
1. **The generator lives in the sdk** (`packages/pot-sdk/src/demo/`), not in `scripts/` + `_data/`.
   - Its inputs are therefore sdk files, not `_data/` files: `receipts.ts` (§7.2's `_data/receipt-templates.ts`) and `real-chains.json` (§7.4's `_data/real-chains.json`).
   - It needs the sdk's MockChain, signers and near-api-js.
   - `scripts/gen-demo-script.ts` is a thin CLI over it.
   - The command is `pnpm gen:demo`, or `scripts/run gen-demo-script`.
2. **Chapter 4 has 14 receipts, not 13.** The real chain (`Gmoey4Le…`, and `BXy7NYUU…`) has the Pot → Hub `Transfer 0` bond return after `on_proposal_callback`, which the §2 table omits. The template follows the real chain:
   - row 12 is that bond return;
   - rows 13-14 are `get_proposal` and `on_spend_status`.
   - So chapter 4 beat 8 explains rows 10-14.
3. **Gas refunds:** the count and amounts are the real run's. Chapter 1 has 6, not 5. Refund rows come after the real receipts, with `refund: true` and `approx: true`.
4. **`c6.sync` has no real twin.** No real close sync was recorded, so its ≈ gas, burnt NEAR and refunds come from the chapter 5 sync (`BSQFyv2H…`), which has the same three receipts. Its events are MockChain's: `pot_closed`, then `proposal_synced`.
5. **The no-op syncs are left out of `txs`.** The relayer also syncs after Maya's own approvals in chapters 5 and 6. MockChain runs those syncs, but they change nothing.
   - The spec's recap counts 12 transactions (10 delegates + 2 syncs), so those no-op syncs are not in `txs`.
6. **NEAR figures come in two kinds.**
   - Approx figures (copied from a real run: burnt gas and refunds) are rounded to 4 dp.
   - Exact figures (prepay, float, USDC registration, yocto deposits) keep every digit, e.g. "0.00125".
   - The prepay is computed for these ids, so it differs slightly from the real runs:
     - join 0.00513 (real 0.00506);
     - groceries 0.00586;
     - boat 0.00885 (real 0.00884, longer account ids);
     - close 0.01452.
7. **Proposal "before" states are reconstructed.** MockChain runs a relay atomically, so the "just filed, no votes yet" state of #2 (chapter 4 beat 6) is reconstructed from the final state with `filed()`. Every other proposal state is read from MockChain after its transaction.
8. **The nonces start from the generator's own blocks:**
   - Maya's first nonce is `275000000000001`; the spec's example is `274998000000001`.
   - The relayer's envelope nonces start at `274990000000001`.
   - The heights follow MockChain's clock.

**Additive fields**, all optional for the UI and each marked "(added)" in types.ts:
- `DemoScript.pot`: name, emoji, rules, refs and memos.
- `DemoScript.recap`: §2.7, computed by `recapOf()`.
- `Chapter.interlude`: `{key: "demo.interlude", real: […3 links]}`, on chapter 2. Chapter 1's last beat also carries a `note` card with key `demo.interlude`.
- On `Beat`:
  - `you`: the persona holding the phone;
  - `tap`: the phone shows its marigold primary, and tapping it = Next;
  - `appBefore`: the PushCard that opens the sheet, in chapter 5 beat 6 and chapter 6 beat 6;
  - `cards`: extra cards on one beat, e.g. "signed + proposal + note".
- On cards:
  - the `invite` card gets `param` (the `?i=` form);
  - the `proposal` card gets `proposal` (the get_proposal JSON at that beat) and `meter` (the vote meter: seats, k, n, approvals, the threshold math, the member row, and the rulebot text).
- On `SimTx`:
  - `envelope`: the relayer's outer tx, plus the D-24 check list;
  - `whoPaid`;
  - `realRef`;
  - `blockHeight`;
  - `burnt.yocto`.
- On `SignedDelegateJson`: `signed_hash`, the base58 sha256 of the NEP-461-prefixed bytes.
- On `Receipt`:
  - `approx`: gas copied from the real run;
  - `depositPaidBy`: "paid by the relayer" on chapter 3's 1 yocto.
- On `Snapshot`:
  - `pot.ledger` and `pot.requests`;
  - `dao.policy`, the raw Sputnik policy.
- **Conventions:**
  - `pot: null, dao: null` means the Pot doesn't exist yet (chapter 1 before).
  - `beat.app` is set on every beat: hood beats repeat the last phone screen.
  - The `rules` card's `check` is the hub field name (`instant_cap`, `member_budget`, `instant_payees`, `contributed`). Its plain words are copy, `demo.rules.<check>`.

### Copy keys the data references (the UI owns `en.json`)

- `demo.cN.bM`: every caption, verbatim from §2.
- `demo.note.{no_keys, status_lies, limits_in_hub, exact_kind, payout_separate, sync, busy, atomic, after_close}`: the notes (§6.3).
- `demo.interlude`: the Meanwhile card (§2.1).
- `demo.real.{c1.create, interlude.sam_joins, interlude.sam_adds, interlude.maya_adds, c2.join, c3.add, c4.request, c4.same_shape, c5.request, c5.maya_vote, c5.leo_vote, c5.sync, c6.propose, c6.maya_vote, c6.sam_vote}`: the real links.
- `demo.rules.{instant_cap, member_budget, instant_payees, contributed}`: the rules checks.
- `demo.g.<id>`: the glossary entries. The ids are `dao`, `sputnik_dao`, `proposal`, `role`, `threshold`, `quorum`, `rulebot`, `pot_hub`, `policy`, `delegate_action`, `relayer`, `transaction`, `receipt`, `callback`, `gas`, `yoctonear`, `deposit`, `storage_prepay`, `nonce`, `max_block_height`, `device_key`, `ed25519`, `invite_key`, `account`, `usdc`, `ft_transfer_call`, `global_contract`, `sync` and `pro_rata`.

### Tests (`demo.test.ts`, `prepay.test.ts`)

| Test | What it checks |
|---|---|
| Determinism | Two generations are byte-identical. |
| Drift | The committed JSON equals a fresh generation. |
| Shape | Six chapters; beat ids and caption keys in order; every `receipts.rows` and `tx` ref resolves; the only celebration is chapter 4 beat 7. |
| Recap totals | 11 signatures, 10 delegates, 1 invite signature, 12 transactions, 2 syncs. |
| Delegates | Each of the 10 verifies and decodes back from `transport_base64` to its JSON fields. A tampered byte fails. |
| Keys | Each delegate's public key is its persona's seed key. |
| Invite signature | It verifies for Leo and this Pot only. |
| No private keys | The JSON contains no key material. |
| D-61 numbers | $0 → $300 → $450 → $366 → $66 → $0. Dollars are conserved per chapter. $22 each comes back from the pro-rata split. People hold 0 NEAR throughout. |
| Proposals | Ids, kinds, descriptions, vote counts and requests; thresholds 2 of 2 → 2 of 3; the chapter 5 meter goes 0 → 1 → 2. |
| Sim hashes | They match `^sim-[1-9A-HJ-NP-Za-km-z]{32}$`, are unique and never decode as base58. |
| Real hashes | They are 32-byte base58, disjoint from the sim hashes and linked in the spec and in this file. |
| Receipt templates | Each of the 11 mirrored txs equals its real chain: from/to roles, methods, arg keys, attached gas (except `approx` rows), deposits, result shape and log or event shape. The refund count and burnt NEAR come from that run. |
| Prepay | The prepay twin reproduces every real prepay Transfer: joins, instant and vote spends, and the close upper bound. |
| `[testnet]` (`POT_DEMO_TESTNET=1`) | The real txs still resolve over RPC and match the snapshot. |

## UI

Rewritten 2026-10-27 by tour-builder for plan/design-direction/06 (the simple tour), with the director's answers to its §9: the phone's own primary is the tap's one marigold (Next stays secondary), "Under the hood", [Back to home], no Add money sheet (14 steps), the end says "demo dollars (test money)", `/demo/3` opens step 4, no phone on the end at 390, the cover phone is the Pot at $450, and `#near` opens the part's hood.

### Routes
| URL | What |
|---|---|
| `/demo` | The tour: cover → 14 steps in 5 parts → end ([Start a real Pot] → `/pots?sheet=create`). Static |
| `/demo/1`…`/demo/6` | The same tour, opened at 1, 3, 4, 6, 8, 12 (`TOUR_CHAPTER_START`); canonical `/demo`; `generateStaticParams` kept |
| `#step-n`, `#end` | Open a state; the fragment follows the tour (`replaceState`). Legacy `/demo/N#beat-k` → the nearest step |
| `#near`, `#g-<id>` / `#p3-g-<id>` | Open the part's "Under the hood" sheet (and its glossary word) |
| `/demo?step=3` | 308 → `/demo/3` (`next.config.ts`) |
| `/demo/all` | "How Pot works on NEAR (simulation)": the five parts, every chapter's full timeline open, the recap, every glossary word |
| (the old live demo) | Removed in Rev 9 |

### Files (`apps/web/components/demo/`)
- `tour.ts`: the tour as plain data, no `@/` imports (e2e can import it): `TOUR`, `TOUR_PARTS`, `TOUR_CHAPTER_START`, the timings, `stepForLegacyBeat`.
- `TourPage.tsx` (server): per-step phone props from the dataset (`tourPhones()`), the stage, the hood sheet and the no-JS story list. `TourPlayer.tsx` (client state, keys, fragment, live region, hood state), `Stage.tsx`, `TourPhone.tsx` (`TourPhone`, `StaticPhone`), `HoodSheet.tsx` (`HoodSheet`, `HoodSlot`, `TourStory`).
- `Chapter.tsx`: `HoodStack` (a part's hood: summary, the cards stacked, each group led by its 05 caption, real links, glossary, a link to `/demo/all`), `HoodPane` + `DemoAll` (the technical read), `phoneStory`/`phoneBeats`. `Slots.tsx`: `/demo/all`'s static `BeatSlot` and `YouChip`.
- Removed: `BeatPlayer.tsx`, `BeatBar.tsx`, `AppPane.tsx`, `IntroPhone.tsx`, the chapter rail/switcher, the pane tabs, `pot-demo-progress` storage.
- Copy: main path under `tour.*` (never allowlisted: a unit test pins it); hood additions `demo.near.*`, `demo.all.*`.

### How it behaves
- **Server HTML = the cover + the story list.** The list has, per part, a phone at its last screen, `<ol>` of `<li id="step-n">` captions and a closed `<details data-tour-hood>` holding the hood; then the end. With JS the list is `hidden` and the stage plays it.
- **The hood exists once.** While a part's sheet is open its content is portalled from the list into the sheet (`HoodSlot`), so there are no duplicate ids. Glossary ids are per part (`p3-g-rulebot`).
- **Selective hydration:** each hood sits in its own `<Suspense>`, so the stage is live in ≈ 0.68 s at 4× CPU (≈ 0.78 s without its `content-visibility`). The story list itself has **no** boundary: React outlines a large finished boundary (sent hidden at the end of the body, swapped in by a script), which left `#story` empty without JS (tour-tests, 10-27). The hoods' content is still outlined, so a no-JS *browser* opening a `<details>` sees it empty; the text is in the HTML (curl, AI judges). Each tour page carries all five hoods: ≈ 3.4 MB HTML, ≈ 306 KB gzipped.
- **Step 7:** checking (Next `aria-disabled` 1.2 s, also reduced) → approved + the one burst (first forward arrival only) → sent, the balance rolling to $366.00. The live region speaks after the hold. Steps 10 and 13 open on the push for 1.4 s.
- **Phones under 656 px tall:** the stage scrolls normally; nothing is sticky.

### Shared-code changes (small, additive)
1. `Sheet`: `wide` (from md `min(720px, 100vw − 48px)`), `theme="night"`, `className`.
2. `Scenes.tsx`: `YoureIn`'s primary can be live (step 4); `PrimaryHint` context for `aria-describedby`; the live primary has a ≥ 44 px invisible hit area (the phone is drawn at 0.5-0.8 scale).
3. `cards/Misc.tsx`: the state, balances and recap tables' scroll wrappers are named, focusable regions (axe at 390 in the sheet).
4. `GlossaryHashOpen` opens every closed `<details>` around the term.

### Polish after QA (tour-polish, 2026-10-27)
Fixes to `scratchpad/tour-qa.md` findings 2-7 (M1-M5, L1, L2), with the director's decisions:
- **Step 7's caption waits for the phone (F3):** during the 1.2 s hold the caption is `tour.s7.checking` ("Maya asks for her $84 back. Pot checks the rules…", `TourStep.holdCaptionKey`, `captionKeyAt()`); the approval caption swaps in with "Approved by Pot rules". The live region still speaks once, after the hold.
- **Phone buttons (F4):** [Share link] (2) and [Done] (7, 9, 11) are live tap steps now (marigold, = Next), as they are primary in the real sheets. Only 5 and 14 have no phone button. A tap on anything inert in the phone (Decline, ✕, Add money…) "pokes": the live button, or Next, rings twice (`data-poke`/`data-poke-to` on the stage, demo.css; a steady ring under reduced motion). Pointer only; keyboard users reach only live controls.
- **Visible tap hint (F5):** `tour.tap_hint` under the caption on the first tap step a visit lands on (not step 7), until the phone's own button is used once (`hintAt`, `tapped`, `showsTapHint()`). The pointer icon taps twice (1.6 s), none under reduced motion.
- **Step 9 (F6):** the vote card shows only "Sent to the group" (the app's "Needs 2 of 3 approvals" line is dropped in the demo's `SpendResult`, not in the app); the caption carries "two of the three"; the screen's one fraction is "1 of 2".
- **F7:** the Pot home's feed lists every member (Sam's $150 too; `.slice(0, 1)` removed). The share sheet's preview is a local `ShareBubble` (the landing's `InviteBubble` markup, not edited) with the seats of that moment: one, "1 friend is in".
- **Short phones (F2):** under 720 px of height the stage chrome tightens and the step phone is a 390/640 crop sized from its box (`container-type: size`, demo.css): **242 px wide at 390 × 664** (was ≈ 195), 227 on the hint step, 288 at 390 × 844, desktop unchanged.
- Not changed (Cerasela's call): step 14's phone line "Taking money out of Pot isn't available yet".

### Open
- `server/features/features.test.ts` "visitor ids are MAC'd" is flaky (≈ 1 in 58: the random id already ends in "0", so the tamper is a no-op). Not touched; backend owner.

## Site update (Nov 3)

Written 2026-11-03 by builder-tour (the website-update team; plan/design-direction/07-site-update.md, the copy table T1-T14 in the director's `site-facts.md`). The tour now tells the rules a Pot gets today (Pot Hub 1.2: one OK from anyone else covers spends up to 3 × the instant limit, so Maya's $300 tickets are a one-OK spend). The D-61 numbers are unchanged ($450 → $84 → $366 → $300 → $66 → $22 each).

**Captions** (`tour.*`, still never allowlisted):
- s1: "…and keeps the suggested rules: up to $100 without asking, bigger spends go to the group."
- s8: "…That's over the $100 limit, so she needs one OK from Sam or Leo."
- s9: "One OK from anyone else is enough. Sam and Leo both get a notification, and either one can give it."
- s10: "…He sees exactly what he'd give the OK for…"
- s11: "…Leo gave the OK, so the $300 goes to Maya. $66 is left."
- s13: "…Closing always needs most of the group."
- end.l3: "…Bigger ones wait for the group's OK."
- `tour.end.note` is kept ("You'll sign in with Google…", Cerasela's decision 1).
- The five `tour.create.*` keys are deleted. The captions total 268 words.

**The phone** (`Scenes.tsx`):
- `STORY_EXTRAS` holds the Create defaults (trust on, `oneOkCap` = 3 × $100). `storyPreview()` is the app's own `previewSpend` with those rules, and `isOneOk()` decides each screen.
  - Step 8: the `RulePreview` hand icon, "This needs one OK from anyone else · It's over your $100 instant limit.", and [Ask for one OK].
  - Step 9: "Sent · One OK from anyone else in the group and it's paid.", the "Needs one OK" chip, and `OneOkLine` (the Approve sheet's markup).
  - Step 10: the push `notif.one_ok.*`, then `approve.why.one_ok`, "One OK needed" + who, [OK $300] → "Sending your OK…".
  - Step 11: "Done. Your OK sent $300 to Maya." and "You · gave the OK".
  - The group path (vote copy, timeline, [Approve $300]) stays for a spend over the one-OK limit. Closing is unchanged.
- **Create (step 1)** is the lean one-screen "Start a Pot" (`CreatePot`, the sheet's markup). Both dataset create beats render it, and `CreateName`/`CreateRules` are gone. It has three deliberate differences from the sheet:
  - no "Tap the picture to change it." (the tour's picture doesn't change);
  - a `w-20` amount field;
  - a decorative switch with no 44 px hit box.

  The phone's screen is 370-390 logical px wide, so without these "each" wrapped and pushed the rules line under the footer at 390 × 664. Now nothing is clipped on the main path. On a deep link (sim line + tap hint, a 199 px phone) only the sheet's 16 px bottom padding is cut.
- `create.step1.title`, `create.step_of`, `create.cta.next` and `create.goal.each` lost their last use with the old naming and rules screens; site-QA deleted them from en.json (the video keeps its own copies in `marketing/video/src/ui/copy.ts`).

**The hood (T14, copy only)**:
- `demo.near.p4.summary` says that today Leo's OK goes to the Hub, and that the steps below were recorded before one OK existed, on the path spends over the one-OK limit still take.
- `demo.c1.b2` now reads "She keeps the suggested rules…".
- `demo.c5.aha` now reads "Above the one-OK limit…", so `/demo/all` doesn't contradict the phone beside it.
- No dataset change: `pnpm check:demo` passes.

**The end**: [Start a real Pot] is `<SignInLink next="/pots?sheet=create" source="tour">` (still the screen's one marigold, `data-tour-cta`, a real href without JS). Signed out, it opens the sign-in dialog at `?signin=1#end`, and closing it returns to `#end`. The no-JS story list keeps a plain link. `TourPlayer`'s ←/→ stand down while `signInOpen()` is true: a `[data-signin-panel]` inside a `[role=dialog]`, or one with a box. That also covers focus outside the dialog under NEAR Connect's picker. A panel kept hidden in another page doesn't count.

**The first-run intro** (`components/onboarding/Onboarding.tsx`, screen 1):
- `RulesView`/`RulesShown` show a new Pot's rules: "Anyone can spend up to $100 without asking." and "Spends up to $300 need just one OK from anyone else." The example's $300 boat trip shows the "Needs one OK" chip.
- A joiner sees their own Pot's rules: the one-OK row if `extras.oneOkCap > 0`, else "Bigger spends need k of n approvals.". The chip follows the same rules.

**Tests**:
- `demo-tour.test.tsx`: steps 1 and 8-11 in the app's words, closing still the group, the `tour.create.*` keys gone, the end's link, and the key guard.
- `onboarding.test.tsx`: the creator lines and chip, plus joiners with and without one OK.
- `e2e/mock/demo-explainer.spec.ts`: `PHONE_SAYS`; J-4 walks the one-OK path; J-1 and J-5 use `startRealPot()` (dialog in place, ←/→ inert even with focus outside it, Escape back to the same URL).
- `-nojs.spec.ts`: part 4's no-JS phone shows Leo's OK, and the note is in the HTML.
- `onboarding.spec.ts`: line 46 only.

**Open:** the lock-screen push (steps 10 and 13) shows faint light corners at the phone screen's rounded clip in screenshots. It also happens on step 13's untouched push, so it isn't from this change.
