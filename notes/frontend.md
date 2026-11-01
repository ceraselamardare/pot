> **2026-11-02: Every spend opens its details; receipt details saved with the spend; the fingerprint check.** Server and
> chain side in notes/backend.md "receipt details saved with a spend".
> - **Details for every spend:** the request sheet (`ApproveSheet`) is now the details sheet of *every* spend: instant
>   ones (their feed row is a button now), decided ones, links. Opened from the feed (`RequestRow`, `LinkRow`), a
>   person's activity (rows about a spend are buttons: `ActivityRow onOpen`, `isSpendItem`), Requests (cards, "Your
>   requests", Decided) and You (`activityHref` → `?r=<id>` for every asked/voted spend). New in the sheet: a facts list
>   "Status" (the record's chip: Paid / Waiting / Declined…, `RecordStatusChip`, moved to its own module) and "Approved"
>   (By the Pot's rules / One OK by X / By the group / Not yet, `approvedByOf` + `approvedWords`); an instant spend's status
>   line "Approved by Pot rules · $84 was sent to Maya." (or "…to you."), no approval list for it; "Pot after this"
>   only while it waits. The title is "Sam asks for $300" while waiting, "Sam asked for $300" once decided, fixed for the
>   sheet's life (approving in it doesn't rename the dialog). Comments now work on instant spends too.
> - **Receipt card** (`components/receipt/SavedReceipt.tsx` `SpendReceiptSection`, members only): heading "Receipt";
>   one row merchant · day + the printed total; "Converted from €42.50 at 1.0852 (Oct 30)"; "Show 3 items" / "Hide items"
>   (`aria-expanded`) with tax and tip; "Read privately · Check it yourself ↗" (the proof link, when the reading carried
>   one) + "Read on Oct 30" (mock: "Sample reading: this test version didn't read a real photo."). Then the check
>   (`FingerprintCheck`): ShieldCheck "Receipt fingerprint matches · These are the details saved with the spend,
>   unchanged." or, when the recomputed fingerprint differs from the one the request carries, TriangleAlert "Receipt
>   details changed · They don't match the fingerprint saved with the spend, so they may have been edited since." (icon
>   + word; status colours on the icon only); "How does this work?" (disclosure) in plain words (no hash / chain /
>   transaction). The browser computes the fingerprint itself (`fingerprintStatus`) against `RequestVM.fingerprint`, which
>   the live VM reads from the hub's request (`receiptFingerprintOfRef(r.requestRef)`), never from our server. My own
>   spend whose save didn't land: "Saving the receipt details…" and a retry (then "…aren't saved yet. [Try again]"); a
>   fingerprint with no details: "A receipt fingerprint was saved with this spend, but its details weren't saved."
> - **"Receipt attached"** (`components/receipt/ReceiptIndicator.tsx`: Lucide ReceiptText + the word; not "Receipt", so
>   it can't be confused with the explorer's "Receipt ↗") on feed rows, link rows, request cards, "Your requests",
>   activity rows (`ActivityItemVM.hasReceipt`) and the public record (`RecordRow.receipt`, from the feed's public
>   `receipts`). On the record a visitor sees only that mark; a member also gets "See details" → `/p/<slug>?r=<id>`. Live
>   record fix: `member` is now "the feed returned memos" (the feed answers everyone, so `!!feed` called visitors members).
> - **Spend sheet:** asking sends the kept reading's details (`keptReceipt(snap)`; `readAt` + `nonce` fixed when the
>   reading arrives, so a retried ask has the same fingerprint); Remove → nothing is sent. "Read privately"'s body now
>   says the receipt's details are saved with the request for the group.
> - **Mock world:** `RequestRec.ref` (`mockOpKey(id)` + fingerprint), `World.receipts` ("slug:id"), `saveReceipt` /
>   `savedReceiptFor` (the server's rules), store `saveReceipt` (fault hook `pot.mock.fail = receipt_save`),
>   `RequestVM.fingerprint` / `hasReceipt`. Showcase seed: Ski Chalet request 103 (Maya's $35 food) has a saved €32.25
>   "Café du Col" receipt converted at 1.0852 with a model-only check link (`showcaseReceipt`).
> - **Copy:** `details.*`, `record.receipt.*`, `spend.receipt.private.body` (en.json, types regenerated); lint 1817
>   strings, 0 banned.
> - **Tests:** unit `components/__tests__/spend-details.test.tsx` (7), `lib/client/mock/receipts.test.ts` (6),
>   `lib/client/receipts/saved.test.ts` (3: saved with the id the spend got; a failed save stays pending and the retry
>   saves it; a mismatch is dropped), `receipt-snap.test.tsx` +1 (the ask carries the details, never image bytes; none
>   after Remove), `activity.test.ts` (an instant spend's href is `?r=`); plus the server ones (backend notes). Full unit
>   **1228 passed / 17 skipped** (DB on a private `pot_details`), sdk 182. e2e `e2e/mock/spend-details.spec.ts` (6 tests ×
>   3 projects, 320 px on mobile-day): instant spend with a scanned euro receipt → "Receipt attached" → details (approval,
>   status, card, items, sample note, ✓ + how) → a comment on it; vote-path spend with a receipt seen by Sam before
>   approving, then "By the group"; the showcase's check link and an edited receipt → the warning; person activity and
>   You open the details; the record: "See details" for members, only the mark for a visitor (no merchant, no items).
>   axe 0 serious + brand checks throughout. Updated: `comments.spec` / `pay-link.spec` / `trust.spec` (decided sheets
>   are "… asked for …"), `activity.spec` (the instant row opens its details), testnet `paylink.testnet.ts` (same title;
>   not run) and the new `e2e/testnet/spend-details.testnet.ts` (**not run**: needs the human's OK).
> - **Results:** `pnpm --filter web typecheck`, `pnpm --filter web lint` clean; `NEXT_DIST_DIR=.next-details
>   NEXT_PUBLIC_DATA_SOURCE=mock next build` OK; mock e2e on `next start -p 3310`: **317 passed, 31 skipped** (3 projects).
>   Screens: `notes/screens/spend-details-{day,night}.png`, `-check-`, `-mismatch-`, `-record-` (Day/Night).
> - **Open:** a spend sent with a fingerprint whose save never lands (another device, cleared storage) shows the
>   "details weren't saved" line forever; the details are kept 30 days on the requester's device only. Editing a saved
>   receipt is impossible by design (once); a wrong reading can only be explained in a comment.

> **2026-11-01: The Spend sheet in two steps, and receipts in other currencies converted.** Feedback: "the spend popup
> got a bit crowded, especially with the new snap a receipt button… make it more accessible without a lot of scrolling".
> Before (`notes/screens/spend-before-{day,night}.png`, 390 × 844, $84 typed): the body held 622 px of content in a
> 374 px window, so the receipt button, its help, "Read privately", the reason chips and the note were all below the fold.
> - **Step 1 "How much?"** (`SpendSheet`, `data-spend-body="1"`): "How much?" + the big amount, a compact secondary
>   **[📷 Scan receipt]** pill right under it (+ "Choose a photo" on touch screens; the old help sentence is now its
>   sr-only description), then the **decision line** (`DecisionLine` in `RulePreview.tsx`): icon + one line ("This will
>   be approved instantly" / "This needs one OK from anyone else" / "This needs 2 of 3 approvals"), the why behind an ⓘ
>   (`Info`, `aria-expanded`, "Why: more about this"): the rule's second line (the instant limit, raised by trust, over
>   the budget…) and "Once it's paid, you'd get back $X…" (`data-spend-refund`). A **blocked** spend shows its reason in
>   full (no ⓘ): over the balance, or the goal lock (Lucide `Lock`), which now shows on step 1 before anyone types: no
>   Scan, the keypad disabled, the button reads "Spending opens once the goal is reached.". Footer: **[Next]** (the one
>   marigold; off at $0 and when blocked) above the keypad; Enter on the keypad = Next.
> - **Step 2 "What's it for?"** (`?sheet=spend&step=details`, pushed like Create's `?step=rules`): the amount as a title
>   line (sr-only "How much?"), the reason chips (the `h3` "What's it for?" is the step heading: focus + the sheet's
>   live region on every step change), "Who gets paid?" (the same Me · A member · Someone else segmented control, member
>   avatars / link fields under it), the receipt in **one row**, the note. Footer: the decision line pinned over the ask
>   (same ⓘ), the error/offline lines, the ask (the one marigold), **[‹ Back]** (`SheetBack`, ghost). Back and the
>   browser's Back agree; everything typed is kept; browser Back from a sent request's result closes the sheet.
> - **Measured** (Playwright, 390 × 844, mock Lisbon Trip, $84, Groceries): step 1 body **220 px content in a 220 px
>   window** (footer 337 px, popup 622 px of 776); step 2 body **302 px in 302 px** (footer 197, popup 564): no
>   scrolling in either, Day and Night (`notes/screens/spend-step{1,2}-{day,night}.png`). Paying by link with a label
>   also fits (`paylink-spend-*`). 320 × 568: step 1 220 in 153 (the keypad keys drop to 48 px under 680 px of height:
>   `Keypad`, also in Add/Rules), step 2 302 in 261: a short scroll, no sideways scroll, the CTA and keypad pinned.
> - **Receipts** (`ReceiptSnap.tsx` is now `useReceiptSnap` (state owned by the sheet, so it survives the step change;
>   reset on each opening) + `ReceiptStart` (step 1) + `ReceiptCard` + `ReceiptInputs` (hidden inputs + the
>   `role=status` region, mounted on both steps)). A reading that fills a dollar amount the rules could take **jumps to
>   step 2 with amount, reason and note filled** (its heading gets focus; the reading is announced). Reading / failure
>   rows are compact on step 1; the keypad keeps working. The summary row: receipt icon · merchant · total · ⌄; the
>   details (day, the filled / converted notice, the rate's source, the items with tax/tip, [Scan again], [Remove],
>   "Read privately") open under it. Remove on step 2 that clears the amount goes back to step 1. "Snap the receipt" /
>   "Snap again" are now "Scan receipt" / "Scan again".
> - **Another currency is converted** (server: notes/backend.md "receipts in another currency are converted"): the row
>   shows "€42.50 ≈ $46.12 · rate 1.0852 from today" (`data-receipt-fx`, tabular; "from Oct 30" when the ECB rate is
>   from an earlier working day), the dollars are pre-filled and editable (Back → keypad), the details say "Rate from
>   the European Central Bank" / "Rate from exchangerate-api.com" / (mock) "Sample rate: this test version doesn't look up
>   today's rate." and "Your bank's rate may differ a little, so check the amount." The live region adds "That's about
>   $46.12.". With no rate: "This receipt is in EUR (€42.50). We couldn't get today's rate, so type the amount in
>   dollars." (or "We don't have a rate for it"), it stays on step 1 and offers [Use 42.50 as dollars] (now a link-style
>   button, so the step keeps one marigold).
> - **Links:** `?sheet=spend&amount=84` opens with $84 typed (1-6 digits, ≤ 2 decimals, > 0); `&step=details` with an
>   amount opens on step 2, without one the URL is corrected to step 1 (`replaceSheetParams`, new in `lib/client/sheet.ts`).
> - **Tests:** new `components/__tests__/spend-steps.test.tsx` (7); `receipt-snap.test.tsx` rewritten (13: jump to step 2,
>   details, conversion + source + day, three no-rate cases, failures, cancel, remove); e2e helper `spendFlow(page,
>   {amount, reason, payee, member, submit})` + `spendNext` + `spendWhy` in `e2e/fixtures/pot.ts`, used by every mock spec
>   that drives Spend (flows, activity, trust, pay-link, receipt, refund-preview, screens, states, a11y (keyboard: digits →
>   Enter = Next → step heading focused → Ask), avatars, comments, p2, pwa) and the testnet specs' Spend steps (comments,
>   flows, manual-request, paylink, wave4-trust-goal; edited, **not run**). `receipt.spec.ts`: the dollar receipt (and "no
>   scroll on step 2" asserted), the euro at the mock rate (then Back, edit, Next), no rate (`pot.mock.fail =
>   receipt_rate`), blurry/timeout, 320 px. Screens: `receipt-{day,night}.png` (step 2 after a scan),
>   `receipt-fx-{day,night}.png`.
> - **Results:** typecheck, `pnpm --filter web lint` (1787 strings, 0 banned), unit **1150 passed / 17 skipped** (80
>   files, DB tests on a private `pot_spend`), `NEXT_DIST_DIR=.next-spend NEXT_PUBLIC_DATA_SOURCE=mock next build`, mock
>   e2e on `next start -p 3410`: **301 passed, 29 skipped** (3 projects).
> - **Supersedes:** "Back in multi-step sheets" said Spend was one form; it now has two steps (same pattern). "Snap the
>   receipt" said another currency is never converted; it now is, with the rate shown.

> **2026-11-01: Earned trust, one OK, the Pot record, the all-or-nothing goal (hub 1.1.0, wave 4 UI).** Built on mocks
> and unit tests only; **the hub 1.1.0 isn't deployed** (notes/contracts-wave4.md §6 needs the human's OK). Against the
> deployed 1.0.0 hub every new read degrades to "off" (PotView parses to LEGACY_EXTRAS, get_trusts/get_goal/get_record
> aren't called or return nothing; the record falls back to get_requests), so a testnet build keeps working.
> - **Create step 2** (`CreatePotSheet` `ExtrasRules` + `GoalRule`, state `lib/client/wave4-form.ts`, machine event
>   `EXTRAS`): "Trust grows" switch (on) + "People who spend well get a bigger instant limit." + the numbers ("Every 3
>   paid spends raise someone's limit by $100, up to $300…"); "Spends up to $[300] need just one OK from anyone else"
>   (follows 3 × the instant limit until typed; $0 = off; below the instant limit → inline error, the hub's
>   ERR_EXTRAS_INVALID); "Set a goal (optional)" (off): Collect $[ ] by [date] + "All or nothing" (on: "If we don't
>   reach it, everyone gets their money back automatically." + "Spending opens once the goal is reached."). Date =
>   end of the picked local day, tomorrow … +365 d. Create **always sends `extras`** (links stay on for pay by link).
>   The off-chain "$X each" switch stays (it's the suggested share for /j and Add); the goal bar now shows the
>   on-chain goal when there is one (mock `potView`, live `livePotVM`: `goalDetail.amount` wins over `goalEachOf`).
> - **Rules tab / rules change:** new sentences (Trust grows…, Spends up to $300 need just one OK…, the goal with its
>   date / all-or-nothing promise), "Your instant limit" card (`components/wave4/Trust.tsx` `MyTrustCard`: "You can
>   spend up to $200 without asking" + a 3-step ink meter + "2 more paid spends to $300"), a "See every spend" link.
>   `RulesSheet` gained a third keypad card "One OK up to" (Off/$) and a "Trust grows" switch; `extras` are sent only
>   when they change (then whole, goal kept as it is: `currentExtras`); the review face diffs them. The goal itself
>   isn't editable in the sheet (deviation: a soft-goal edit needs a date picker in the change sheet).
> - **Members / person / You:** `TrustBadge` (Sprout "New" / ShieldCheck "Trusted" / BadgeCheck "Very trusted", ink on
>   sunken: trust isn't a status) + "Can spend up to $X without asking" per row (aria-label gains the level); the
>   person sheet says "Leo is New · Leo can spend up to $100 at a time… 1 paid spend so far."; You → "Your instant
>   limit" lists every open Pot with trust on (`components/wave4/YourTrust.tsx`).
> - **Spend sheet:** `previewSpend` (lib/client/rules.ts) takes `extras`, `trustLevel`, `goalBlocks` and returns
>   `tier` + `effectiveCap` (sdk `decideSpend`); `RulePreview` words the three tiers ("This will be approved instantly ·
>   You can spend up to $200…", Hand icon "This needs one OK from anyone else · It's over your $100 instant limit.",
>   "This needs 2 of 3 approvals"), CTA "Ask for one OK", result "Sent · One OK from anyone else in the group and it's
>   paid." (no k-of-n timeline). The live build still previews locally (no `preview_spend` round trip, as before);
>   the hub decides and the result card follows the request's own `tier`.
> - **Approve sheet / cards / feed:** for `tier === "one_ok"` with no "no" yet: why "Needs one OK from anyone in the
>   group…", a `OneOkLine` instead of the timeline, primary **[OK $250]** → `okRequest` (mock `world.okRequest`; live
>   `lib/client/live/wave4.ts` → relay R13 `ok_request`, 200 Tgas, outcomes mapped by `okResultOf`), Decline stays the
>   vote (it becomes an objection: then "Someone said no first · Now the group decides…" and the normal Approve).
>   The requester sees "Waiting for one OK" and no OK button. Decided: "Approved by Leo's OK · $250 was sent to Sam."
>   Inline cards say "Needs one OK" and [OK $250] (`approveInline` routes to `okRequest` via `canGiveOk`); feed rows
>   "Approved by Leo's OK"; goal feed lines (reached / refunding / refunded).
> - **Goal on the Pot** (`components/wave4/GoalBanner.tsx` in the hero's new `goalSlot`): collecting "$300 of $1,200 ·
>   3 days left" + Lock "Spending opens once the goal is reached." + the all-or-nothing promise; reached (check, calm,
>   no burst); refundable/refunding "Refunding everyone…" (typing dots); refunded "Everyone got their money back"
>   (on Activity, above the closed card); a soft goal past its date "The goal date passed". A "collecting" read past
>   its date shows what the hub will say. Spend is `aria-disabled` with an sr-only description and a toast while an
>   all-or-nothing goal isn't reached; a `?sheet=spend` deep link previews the hold and disables the CTA.
> - **Public Pot record** `/p/[slug]/record` (**outside** the (app) shell: readable signed out, noindex;
>   `components/record/RecordScreen.tsx`, data `lib/client/record-data.ts`, pure rows + CSV `lib/client/record.ts`):
>   every spend newest first: date, who asked, for what, amount, how approved (By the Pot's rules / One OK by X / By
>   the group / Not yet), status chip (Paid, Waiting, Processing, Declined, Expired, Withdrawn, Not sent yet,
>   Returned, Held for a link, Cancelled), receipt. A table from md, cards on phones (320 px clean). [Download CSV]:
>   `Date,Pot,Person,Amount (USD),Reason,Approved how,Status,Receipt URL`, ISO dates (UTC), plain `84.00`, RFC 4180
>   quoting, `'`-prefix for cells starting = + - @, BOM + CRLF, `<slug>-record-<date>.csv`. [Copy link]. No marigold.
>   **Product decision (privacy):** public by link, but a visitor sees only what's public on chain (amounts, reason
>   chips, account-derived first names via `nameFromAccount`); display names from the group, notes and receipts need
>   the member-gated feed route. Linked from the Rules tab and the Pot's ••• menu ("Pot record").
> - **Mock world** (`lib/client/mock/wave4.ts` + small hooks in world.ts/store.ts): extras/trust/goal on `PotRec`, tier
>   / okBy on requests, trust settle (once, when paid; amount × 10 ≥ cap; +1 per 3; max 2) and decline (−1), `okRequest`
>   (self / not_one_ok / objection / decided / failed), the goal (blocks spends, `ERR_GOAL_MISSED` on money in after the
>   date, reached once), a **mock cron** in the store (1 s tick while subscribed: refundable → refunding → refunded
>   after `REFUND_PHASE_MS` 5 s, everyone gets their contribution back, the Pot closes, the close is marked `refund`).
>   New mock Pots get the hub's defaults; Lisbon Trip / Porto Weekend stay 1.0.0-shaped (so every older spec is
>   unchanged). **Showcase seed:** Ski Chalet (Maya Trusted, Leo's $180 approved by Sam's OK, Sam's $250 lift passes
>   waiting for one OK) + Festival Fund ($300 of a $1,200 all-or-nothing goal, 3 days left). Added to a fresh world for
>   people; automated browsers (`navigator.webdriver`) keep the classic two-Pot seed unless
>   `localStorage['pot.mock.seed'] = 'showcase'` (the new specs do that). Fault hook `pot.mock.fail = "ok"`.
> - **Live:** bundle reads `get_trusts` (trust on) + `get_goal` (a goal) → `vm-wave4.ts` (`trustVMOf`, `goalVMOf` with
>   an extras.goal + goal_state fallback, `goalFeedOf`); requests carry `tier`/`okBy`; create/propose/set rules pass
>   `extras` through the sdk intents.
> - **Server:** reconcile step 2b `server/ops/goals.ts` → for open/closing Pots `get_goal`; `can_refund` + refundable →
>   `refund_unfunded` (phase 1), re-read, refunding → `refund_unfunded` again (phase 2), relayer-signed exactly like
>   the server's sync/retry_payout (submitter + RELAYER_KEYS pool; no key read), 300 Tgas, 0 deposit, relay_log op
>   `refund_unfunded` (RELAY_OPS; text column, no migration) with intent `refund_propose|refund_approve`, keys
>   `refund:<dao>:propose:<utc day>` / `…:approve:<id>:<day>`. Back-off (open question 6): refundable again with a
>   refund on record = rejected → wait 2^(n−1) days after our n-th proposal, give up after 4 (alert
>   `goal_refund_stuck:<dao>`). A 1.0.0 hub (MethodNotFound) stops the step. **Pushes** (`notify.ts`): `spend_requested`
>   tier one_ok → "Maya needs one OK · $180 for … · Anyone can OK it"; `spend_ok_approved` → "Approved: $180 is on its
>   way · Sam gave the OK for …" (same dedupe key as the sync's); `trust_level_changed` (settled, up) → "You're now
>   Trusted in Lisbon Trip · You can spend up to $200 without asking."; `goal_reached` / `goal_refund_proposed` (missed)
>   / `goal_refunded` (replaces "Pot closed" for that close). sdk `NotificationType` + `trust_up`, `goal`.
> - **Tests:** unit `lib/client/mock/wave4.test.ts` (17), `lib/client/record.test.ts` (6), `lib/client/wave4-form.test.ts`
>   (5), `lib/client/live/vm-wave4.test.ts` (5), `server/ops/goals.test.ts` (11, pot_test-style schema), 
>   `server/notify/notify-wave4.test.ts` (7), `components/__tests__/wave4.test.tsx` (9). Mock e2e `e2e/mock/trust.spec.ts`
>   (6) + `e2e/mock/goal.spec.ts` (4) × 3 projects: 28 passed, 2 skipped (320 px gate), axe 0 serious, brand checks.
>   Testnet `e2e/testnet/wave4-trust-goal.testnet.ts` **written, not run** (skips itself unless get_config.version is
>   1.1.x; 2 accounts + 2 Pots; run under the testnet lock with a private DB, see its header).
>   Screens: `notes/screens/trust-{members,rules,spend,approve,record}-{day,night}.png`,
>   `goal-{collecting,reached,refunding,refunded,create}-{day,night}.png`.
> - **Gates (2026-11-01):** `pnpm --filter web lint` (1,775 strings, 0 banned) · tsc clean · unit 73 files, 1,121 passed /
>   15 skipped (DATABASE_URL_TEST=…/pot_trust) · `NEXT_DIST_DIR=.next-trust next build` mock + testnet pass · full mock
>   e2e on :3717: **298 passed, 29 skipped, 0 failed**.
> - **Open:** (1) record privacy for visitors (chain-derived names only) — OK, or a per-Pot "show names publicly"?
>   (2) the goal can't be moved/dropped from the rules sheet yet; (3) live Spend preview is local (decide twin), not
>   `preview_spend`; (4) trust-level pushes say the new per-spend limit, not what's left of the per-person limit;
>   (5) the cron scans ≤ 500 open/closing Pots from the `pot` cache once a day (Hobby cron) — a missed goal refunds
>   within 24 h of its date, not at it.

> **2026-11-01: Pay anyone by link (hub 1.1.0; contracts in notes/contracts-wave4.md D4-4…D4-6).** **Needs the 1.1.0 hub
> deployed (human OK) before it works on testnet; built and tested on the mock data source + unit tests. Nothing signed.**
> - **Spend sheet:** the type control is now "Who gets paid?" **Me · A member · Someone else** (`paylink.who.*`; the old
>   `spend.type.*` keys stay for the /demo tour). "Someone else" (`components/paylink/PayLinkFields.tsx`) shows one line on
>   how it works and an optional **"Who's it for?"** label (≤ 40 chars, members only), then amount + reason + note and the
>   same tier preview (the link's payee counts as allowed, so instant / one OK / the group as for a member). CTA
>   "Send $84 by link" (instant) or the tier's own CTA. A Pot whose rules have links off (every pre-1.1.0 Pot until a rules
>   change; `pot.extras.links`) says so and can't submit. Submit (`lib/client/paylink/actions.ts requestLinkSpend`): a fresh
>   ed25519 key in the browser (the invite key shape, `lib/client/paylink/keys.ts`), `request_spend` with
>   `receiverId = hub` + `link {claimPk, expiresAtMs = now + 14 d}`; the secret is saved **only on this device**
>   (`localStorage['pot.paylinks.v1']`, `secrets.ts`; kept under its request_ref before the relay so a crash can't lose it);
>   the label is an off-chain note (`POST /api/notes` kind `link_label`, keyed by request_ref like a memo).
> - **Share card** (`LinkShare.tsx`): after the link holds the money (instant: right after "Approved by Pot rules"; group /
>   one OK: from the request sheet once approved) → "Your payment link is ready · Send it to Casa Lisboa host…", the link
>   `/c/<slug>/<id>#<secret>`, "Anyone who has this link can take the money", "saved only on this device; if it's lost,
>   cancel it, or the money goes back on <date>"; footer [Share payment link] (marigold, Web Share → copy fallback),
>   [Copy link] → "Link copied", [Show QR code] (the QR replaces the card, white plate in Night). Later: the request
>   sheet (`?r=`) shows a **Payment link** panel (`LinkPanel.tsx`: status chip, who it's for, [See payment link] →
>   `?sheet=paylink&link=<id>` (`PayLinkSheet`), **[Cancel and return the money]** with a confirm → `reclaim_link`). A link
>   made on another device: "can't be shown here; you can still cancel it".
> - **Claim page `/c/[slug]/[id]`** (`app/c/[slug]/[id]/page.tsx`, params inside `<Suspense>` + `connection()`; `claim-preview.ts`
>   server read: mock seed / testnet `get_link` + `get_pot` + the requester's display name; `opengraph-image.tsx` "Maya sent you
>   $30 · from Surf Camp"; headers `Referrer-Policy: same-origin` + `X-Robots-Tag: noindex` like `/j`). Island
>   `components/paylink/ClaimFlow.tsx` over a pure machine (`lib/client/paylink/claim.ts`): the #secret (kept in
>   sessionStorage across sign-in) is checked against the link's public key first; screens: ready [Get $84] → sign in
>   (live: `SignInOptions`, NEAR Auth or "I have a NEAR wallet"; mock: "Continue with Google" signs the guest in as **Alex**,
>   a new mock persona outside every seeded Pot) → claiming → **"$84 is yours"** (their Pot dollars balance, Receipt ↗,
>   [See my Pot dollars]; the fragment is stripped; a reload still shows it) · waiting for the group's OK (polls 4 s on
>   testnet, storage events on mock) · already claimed · cancelled · expired · not approved · link isn't complete · doesn't
>   match · not found · a claim in flight. A claimer who is a member is fine (their own Pot dollars). The claim is signed in
>   the browser over `pot-claim:v1:<hub>:<pot>:<id>:<me>` and relayed as `claim_link` (R14).
> - **Statuses everywhere:** feed rows (`LinkRow.tsx`, via `RequestRow`): "Maya sent Casa Lisboa host a $84 payment link for …"
>   + "Link sent · waiting to be claimed · Until Nov 15" / "Claimed by Alex" (a member or a Pot user by display name, else
>   "Claimed by someone outside the Pot") / "Returned to the Pot" / "Nobody took it in time · Returned to the Pot" / "Not
>   approved, so no link was sent"; `LinkStatusChip` (icon + word, `data-status="link-*"`). Person activity: "You sent a $84
>   payment link for …" with the link chip. Close sheet: `close.links_pending` (open links block a close).
> - **Data:** `RequestVM.link: LinkVM` (status waiting|ready|busy|claimed|expired|returned|void, label, expiresAt, claimer,
>   doneAt, returnedOnExpiry) from `linkStatusOf()` (`lib/client/paylink/link.ts`). Mock (`lib/client/mock/links.ts`): a link
>   request's receiver is `@link`; funding is derived (a paid request's link reads funded), claim / reclaim / the daily
>   sweep (on world load) / `openLinks` blocks `proposeClose`; claimer's Pot dollars include claimed links; showcase Pot
>   **Surf Camp** (Maya + Sam; #111 claimed by Alex, #112 expired → returned, #113 open, fixture secrets in `SURF_LINKS`)
>   added with the hub 1.1.0 showcase (`pot.mock.seed = showcase`; the classic seed is unchanged). Live
>   (`lib/client/live/paylink.ts`, `vm-paylink.ts`): `requestSpend` takes `link` + `requestRef`; the bundle reads `get_link`
>   per link request (finished ones cached per tab); feed route members-only `linkLabels` / `linkClaimers`.
> - **Backend:** note kind `link_label` (no migration: text column); `FEED_KINDS` + `link_funded|claimed|returned|voided`,
>   `RELAY_OPS` + `reclaim_link` (text columns, no migration); `server/features/paylink.ts linkEnrichment`; pushes
>   `link_claimed` → the requester ("Your $84 payment link was claimed · Alex got the money from …", the claimer named only
>   when a Pot user) and `link_returned` → every member except a requester who cancelled; **cron**
>   (`server/ops/links.ts`, a `runReconcile` step `links`): Pots active ≤ 45 days → last 50 requests with a funded (or
>   approved-but-unfunded) link → `get_link` → `selectReclaimable` (past its date, oldest first, ≤ 10 per run) →
>   relayer-signed `reclaim_link` (50 Tgas, 0 deposit, relay_log op `reclaim_link`, idempotent per (Pot, id, run cause)),
>   events → feed + pushes.
> - **Tests:** unit `lib/client/paylink/{link,keys,claim}.test.ts`, `lib/client/mock/links.test.ts` (44; keys checks the
>   signature against `@pot/sdk/sign`, raw noble and the contract's format string), `server/ops/links.test.ts` (7, DB:
>   selection, the reclaim tx, idempotency, bound, feed row, the reconcile step, link pushes, feed enrichment), component
>   `components/__tests__/paylink.test.tsx` (5); mock e2e `e2e/mock/pay-link.spec.ts` 5 tests × 3 projects (13 run + 2
>   skipped by the 320 px gate), axe 0 serious + brandChecks everywhere; testnet `e2e/testnet/paylink.testnet.ts`
>   (**written, not run**: needs hub 1.1.0; a fresh 0-NEAR claimer). Screens: `notes/screens/paylink-{spend,share,claim,
>   claimed,expired,feed}-{day,night}.png`.
> - **Decisions / open questions:** (1) M-7: the claim page and its preview name the requester (display name, never an
>   account id) only while the link is open; the path is guessable (slug + small id), so that name is visible to anyone who
>   guesses it during those ≤ 14 days. Flip `redact` in `claim-preview.ts` to always-null if that's too much. (2) The label is
>   members-only and never shown to the claimer. (3) Mock trust counts a link when it's paid (the hub counts it when
>   claimed). (4) Links default to 14 days (no UI to change it). (5) Pre-1.1.0 Pots need a rules change to turn links on.

> **2026-11-01: Snap the receipt.** In the Spend sheet, under the rule preview and refund line,
> `components/sheets/ReceiptSnap.tsx` shows a **secondary** [📷 Snap the receipt]. It is a hidden
> `<input type=file accept="image/*" capture="environment">`, so phones open the camera and desktop browsers open the
> file picker. Touch screens also get "Choose a photo" (no `capture`). Under it there is a hint line and
> **"Read privately"** (Lucide `ShieldCheck`), a disclosure in plain words: a sealed computer reads the photo, not even
> its operators can look in, Pot doesn't keep it, and only what you confirm goes with the request. "How do we know?"
> names the chip makers' certificates. Once a live reading has proof, it adds a [Check it yourself ↗] link to NEAR AI's
> public Verification Center. In the mock build it says it's a sample reading and the photo stayed on the device.
> - **Flow** (`lib/client/receipts/`): `image.ts` decodes the photo (EXIF orientation), scales the long edge to 1600 px
>   and re-encodes as JPEG ≤ 1.2 MB, which also strips the metadata. `read.ts` then reads it. On mock it picks a
>   sample by file name: `receipt-cafe-eur` = EUR, `blurry` = unreadable, anything else = Pingo Doce $84.20. Fault
>   hooks are `pot.mock.fail = receipt | receipt_timeout`. On testnet it sends `POST /api/receipts/read` with a 30 s
>   client timeout. `useReceiptsEnabled()` is always true on mock; on testnet it reads `GET /api/health`
>   `features.receipts`, so the option is hidden without a server key.
> - **Fill:** dollars only fill the amount (keypad string). The reason chip comes from the reading's category
>   (restaurant → Food). The note is "Pingo Doce · Oct 28" (≤ 80 characters, inside the 140-character memo rule).
>   Another currency is **never converted**: the summary says "This receipt is in EUR (€42.50). Pot counts in dollars…"
>   and offers [Use 42.50 as dollars] as an explicit choice.
> - **Summary card:** merchant (h3, takes focus), day, total (tabular), the filled / low-confidence / currency notice,
>   "Show n items" (`aria-expanded`, line totals + tax/tip), [Snap again], [Remove]. Remove undoes only the fields that
>   still hold what the reading put in.
> - **States:** "Reading your receipt…" with typing dots and [Type it in instead] (aborts; a late answer is ignored).
>   Errors: unreadable / timeout / open / too_large / busy / unavailable / offline, each with "title · body" copy and
>   [Try again]. The form never blocks.
> - **A11y:** the component has its own `role=status` region: "Receipt read: $84.20 at Pingo Doce", the failure, or
>   "Receipt removed.". Ask / Get money back stays the one marigold.
> - **Copy:** `spend.receipt.*` in en.json.
> - **Jargon list** (`i18n/banned.mjs`) gained `AI`, `TEEs?`, `LLMs?`, `OCR`, `attestations?` and `enclaves?`.
> - **SpendSheet edits are additive:** `receiptKey` remounts the component on reset, `filled` ref, `fillFromReceipt`,
>   `clearReceipt`. In the feed, a mock spend with a note reads "Maya got $84.20 back for Pingo Doce · Oct 28".
> - **Tests:**
>   - `lib/receipt.test.ts` (38)
>   - `lib/client/receipts/read.test.ts` (14)
>   - `components/__tests__/receipt-snap.test.tsx` (10)
>   - `e2e/mock/receipt.spec.ts`: 4 tests × mobile-day / mobile-night / desktop, 10 run + 2 skipped by the 320 px
>     gate. They cover the dollar receipt → instant spend with the note, the euro receipt, blurry + timeout, and
>     320 px. All run with axe 0 serious and brandChecks. Desktop goes through the real file chooser.
> - **Fixtures:** `e2e/fixtures/receipts/receipt-{pingo-doce,cafe-eur,blurry}.jpg`.
> - **Screens:** `notes/screens/receipt-{day,night}.png`.
> - **To check on a real phone:** `Permissions-Policy: camera=()` (next.config / `SECURITY_HEADERS`) governs
>   `getUserMedia`. The file input's `capture` hands off to the system camera app and should not be affected, but
>   this is unverified on iOS Safari and Android Chrome.

> **2026-11-01: Comments on requests.** A short thread on every spend request that opens the request sheet (waiting,
> your own, approved, declined, expired, failed; instant spends don't open a sheet, so they have none), so the group
> talks about a spend inside Pot. `components/comments/RequestComments.tsx` at the end of `ApproveSheet`: "Comments · N",
> avatar (`Avatar`, brand pictures) + name ("You" for mine) + relative time + text (pre-wrap, React-escaped), oldest
> first; empty state; a labelled one-line composer that grows to 4 lines (Enter sends, Shift+Enter breaks a line),
> 280 code points with a counter from 40 left ("n characters too many" + `aria-invalid`, Send disabled), hint "Everyone
> in {Pot} can read it."; [Send] is **secondary** (Approve / Done keep the one-marigold rule). Optimistic: the row shows
> "Sending…" at once, "Not sent." + [Try again] (same op key → never posted twice) / [Discard] on failure; the author
> deletes their own (soft → "Comment removed", focus back to the composer). The section's own `role=status` region (the
> app's region is outside the modal) says "Comment sent." / "Comment deleted." / the failure. Cards: `CommentCount`
> (Lucide `MessageCircle` + number + sr-only "n comments") on `RequestCard`, feed `RequestRow` sub-lines and the
> Requests "Your requests" rows, only when > 0. **Layout change:** Approve's action buttons moved from a `sticky`
> div inside the scroll body into the `Sheet` footer (portalled from `ApproveBody`, same look): with a thread at the
> end of the body, the sticky bar sat over the composer and axe failed `target-size` in `avatars`/`screens`.
> Data: `lib/client/comments.ts` (`useComments`, `sendComment`, `deleteComment`) — mock: `World.comments`
> (`CommentRec`), `world.commentsOf/addComment/removeComment`, `store.postComment/deleteComment` (fail hook
> `pot.mock.fail = "comment"`), `RequestVM.comments`; the seed now has a **declined $120 "Wine tasting" ask by Sam in
> Porto Weekend (id 11, Maya declined, balance unchanged) with two comments**, so Maya's/Sam's Requests show a
> "Decided" row. Live: React Query `['pot', dao, 'comments', id]` polled every 10 s while the sheet is open (visible
> tab), writes update it in place and `refreshQuery` the bundle; counts come from the feed's `commentCounts`
> (`live/vm.ts`). Text rule shared with the server: `lib/comment-text.ts`. i18n `comments.*`, `notif.comment.*`.
> Tests: `components/__tests__/comments.test.tsx` (10), `lib/client/mock/comments.test.ts` (4),
> `e2e/mock/comments.spec.ts` (4 × 3 projects, 320 px in mobile-day; axe + brand checks), testnet
> `e2e/testnet/comments.testnet.ts` (**written, not run yet**: needs the human's OK; run it against a private DB with
> 0003, see its header). Screens: `notes/screens/comments-{day,night}.png`.

> **2026-11-01: Refund preview (R-33 M-6).** "What would I get back if this Pot closed now?" in three places. (1) The
> hero's "Your share $122 · You put in $150" is now a quiet ink-muted button with a Lucide Info icon (≥ 44 px, hidden
> words "What you'd get back if the Pot closed now") → `?sheet=refund` (`components/sheets/RefundSheet.tsx`): "If the
> Pot closed now, you'd get back $122.00", You put in − Your part of the spending = You'd get back, one plain
> "how it's worked out" sentence, the rounding line; [Got it] secondary (no marigold); closing / closed variants.
> "Your share" was already would_get_back (mock `closeMath`; live preview_close → get_members → local floor). (2) Add
> sheet: "After this, you'd get back $166.40 if the Pot closed." (`data-add-refund`). (3) Spend sheet, only when the
> rules would take the spend: "Once it's paid, you'd get back $140 if the Pot closed. It comes out of everyone's
> part, by what each person put in." (`data-spend-refund`). Members already showed "Gets back" per person: unchanged.
> Math: `lib/client/refund.ts` = the hub's `prorata.rs` through the sdk twin (`floor(B × c_i / C)` over active members
> in join order, remainder to the last contributor, else the last in join order with c > 0; B = live
> `ft_balance_of(dao)`); Add = B + a, c_me + a, last = me; Spend = B − s. `PotVM.moneyUnit` (new): the mock's close
> runs in cents, so the preview does too (absent = 1 micro, testnet). Mock `potView.lastContributor` now uses the
> same fallback as `closeMath` (`lastContributorOf`). Tests: `lib/client/refund.test.ts` (contract vectors V1-V7,
> edges, mock and live-VM parity: predicted-before == shown-after), `lib/client/refund.live.test.ts` (read-only views,
> `LIVE_TESTNET=1` under the lock: hero share == get_members.would_get_back and the Spend preview == the hub's own
> preview_close at B − s on 5 preview Pots, dust included), `e2e/mock/refund-preview.spec.ts`. Screens:
> `notes/screens/refund-preview-{day,night}.png`.

> **2026-11-01: Your balance, your history, receipts.** You → "Your Pot dollars" (`components/activity/YourBalance.tsx`,
> token `ft_balance_of(me)` on the 10 s heartbeat; mock = spends paid to you + close refunds − own-dollar adds,
> `world.ownDollarsOf`) and "Your activity" (`YourActivity.tsx`, by day, 30 a page). Data: `GET /api/me/activity`
> (`server/features/activity.ts`: feed_event rows I caused + close refunds naming me + my relayed approvals/declines from
> relay_log, minus my automatic approval of my own asks; merged cursor) ⊕ chain views of my Pots
> (`lib/client/activity.ts` `activityOfPerson`, `mergeActivity`: chain wins on status, server on time/receipt; keys in
> `lib/activity-api.ts`). Members → tap a person → `?sheet=person&who=` (`PersonActivitySheet`). Quiet "Receipt ↗"
> (`components/receipt/ReceiptLink.tsx`, only for a base58 32-byte hash, new tab, `rel=noopener`) on feed rows, history
> rows, the spend result and the Approve sheet; "View on explorer ↗" (the Pot account) under the Rules tab. Add sheet: the
> own-dollars source is disabled at $0 and offers "Use all $X". The mock gives settled items stand-in hashes
> (`mockTxHash`) so receipts render as on testnet; votes have none (no receipt). Live approvals seen only on chain use the
> request's time (Sputnik keeps no vote time). Tests: `server/features/activity.test.ts`, `lib/client/activity.test.ts`,
> `components/__tests__/activity.test.tsx`, `e2e/mock/activity.spec.ts`, `e2e/testnet/activity.testnet.ts`.
> Screens: `notes/screens/you-{day,night}.png`.

> **2026-11-01: brand avatars.** Ten pictures (`brand/avatars/README.md`; files in `apps/web/public/avatars/pot-01..10.svg`,
> byte-identical copies in `brand/avatars/`) a person may pick in You → Profile → Avatar (`components/app-shell/AvatarPicker.tsx`:
> native radios in a fieldset, "Use my initials" first = default, 48 px tiles, saves itself after a 400 ms settle, "Saving…/Saved"
> status, failure reverts + toast; no marigold). `Avatar` renders `person.avatar` (`PersonVM.avatar`), else the unchanged initials
> seat; unknown ids fall back to initials (`lib/avatars.ts`). Data: `app_user.avatar` + CHECK (**migration `0002_user_avatar.sql` —
> apply it to the local/preview DB before running a new live build**, or app_user selects fail), `PATCH /api/me {avatar}` (new route;
> strict, active device), `GET /api/session` `session.avatar`, feed `profiles[a].avatar`, invite landing seats (`displayProfiles`).
> Mock: `World.avatars` + `store.setAvatar` (fail hook `pot.mock.fail = "avatar"`). Tests: `components/__tests__/avatars.test.tsx`,
> `server/features/profile.test.ts`, `lib/client/mock/avatars.test.ts`, `lib/client/live/vm.test.ts` (2 added), e2e `e2e/mock/avatars.spec.ts`.
> Screens: `notes/screens/avatars-{day,night}.png` (contact sheet), `avatars-picker-*`, `avatars-pot-*`.

> **2026-11-01: Create uses customizable "Pot rules", no templates.** Step 2 is one form (`CreatePotSheet` `RulesStep`,
> logic in `lib/client/create-rules.ts`, machine events in `machines/create.ts`): instant limit and per-person limit as
> inline amount fields (defaults $100 / $200; $0 allowed with a helper line; per-person ≥ instant; relayer bounds
> $1,000 / $100,000), "Members only" / "Members and people I name" (≤ 10 names, format / duplicate / hub-Pot-token
> checks), the editable "$X each" goal, the fixed rules as plain lines, `create.rules.footer`. Creation always sends
> `preset: "custom"` + the rules (live and mock). Client `Rules` gained `payeeAllowlist` (a rules change keeps it);
> `TRIP_RULES` → `DEFAULT_RULES`. The Rules tab drops the "Trip rules" badge and shows the Pot's own rules (a $0 limit
> reads "Every spend needs k of n approvals", named people listed, leftovers and size rows). Landing label "Pot rules";
> `/j` goal no longer depends on the preset. The `/demo` tour is unchanged (its copy moved to `tour.create.*`; only
> `demo.f.rules_null` reworded). Relayer `checkRules` now also refuses the hub, its Pots and the token in the named list.
> Tests: `lib/client/create-rules.test.ts`, `components/__tests__/create-rules.test.tsx`, policy rows, mock `flows (d)` +
> `screens` "Create step 2", testnet `e2e/testnet/create-rules.testnet.ts` (one Pot, `get_rules` + `preview_spend` $30 → vote).
> Screens: `notes/screens/create-rules-{day,night}.png`.

# Frontend notes: wave 1 (F-02, F-04, F-06, F-07, F-13/F-15/F-16 UI) on mocks

> Written 2026-10-22 by the frontend engineer. Specs: plan/frontend-architecture.md, plan/ux-spec.md, plan/design-direction/, brand/README.md + tokens.json, decisions.md Rev 7.
> Review screenshots (390×844 @3x, Day + Night): `notes/screens/{day,night}-{pot,invite-landing,instant-approval}.png`.

> **Rev 9 (2026-11-01, plan/decisions.md): removed** the live persona demo client (`/demo/live`, `DemoForms`, `DemoSigner`,
> `startDemoSession`, `signInDemo`/`switchPersona`/`resetDemo`), the `DemoBanner` (person switcher + reset; the mock specs now switch
> people with the `becomePerson` fixture: localStorage + reload) and the test-account sign-in (`DevSignIn`, `startDevSession`,
> `signInDev`, `FLAG_DEV_SESSION`, the "Join with a test account" form in `JoinCta`; i18n `signin.dev.*`, `landing.cta.dev`,
> `demo.banner/switch/reset/as/choose/maya/sam/leo/intro/try.*/snapshot.*/readonly/readme`). Signed out on testnet, the app offers
> NEAR Auth and "I have a NEAR wallet" only; the join landing's NEAR Auth button is always the marigold. The mock data source stays
> (tests, design); its session kind is `mock` (was `demo`). **E2E mock wallet:** `lib/signing/near-connect/e2e-mock-wallet.ts` now
> also signs `signDelegateActions` (nonce from the chain, NEP-366 via `@pot/sdk/sign`), so the testnet tier follows the real wallet
> path. It is imported as `pot-e2e-mock-wallet`, which `next.config.ts` aliases to the file only when `NEXT_PUBLIC_E2E_MOCK_WALLET=1`
> (refused on Vercel and mainnet) and to a throwing stub (`e2e-mock-wallet.off.ts`) otherwise: a normal build contains none of its code
> (verified 2026-11-01). `walletSend` retries once on `expired`/`nonce_used`/`nonce_pending`, like the device path. The testnet suites
> (`flows`, `p2`, `deposit`) sign in with throwaway accounts (`e2e/testnet/accounts.ts`); `demo.testnet.ts` and `screens.testnet.ts`
> are gone (the live Pot screenshots are taken in `flows` E-c).

## Status

| Command (from the repo root) | Result |
|---|---|
| `pnpm --filter web typecheck` | clean |
| `pnpm --filter web lint` | `lint-copy: 558 strings, 0 banned words`; `messages.d.ts is up to date`; eslint 0 errors (my code 0 warnings) |
| `pnpm --filter web test` | 21 files, 460 passed, 1 skipped (includes the backend's tests) |
| `pnpm --filter web build` | passes; `/`, `/demo`, `/pots`, `/requests`, `/you` static; `/p/[slug]`, `/j/[slug]` partial prerender |
| `E2E_PORT=3317 pnpm --filter web test:e2e` | **69 passed** (mobile-day, mobile-night, desktop) |

**E2E port:** another agent's `next-server` sat on :3100 during this work, and `reuseExistingServer` silently reused it (no security headers → everything failed). Run with `E2E_PORT=<free port>` or stop the stray server.

## Screens built

| Route / sheet | Notes |
|---|---|
| `/` lite landing | lockup H1, tagline, sample Pot card ($450.00), [Start a Pot] (marigold) + [Try the demo]; redirects signed-in users to `/pots` |
| `/j/[slug]` invite landing (F-13 UI) | SSR body inside `<Suspense>` (params + `?i=`), cover banner, "Maya invited you to …", seats + dashed "You" seat, Pot card + GoalBar + "Everyone's chipping in $150", trust callout, rules peek, expiry; invite error states (invalid/expired/used/replaced/closed/incomplete/already member); privacy rule: names only with an active `?i=`; `generateMetadata` (title, noindex) |
| Join island | `#secret` → sessionStorage, device key pre-generated on idle, join machine with ProgressSteps ("Welcome, Leo" → setup → joining → "You're in!" sheet, focus on its heading, one announcement), strips the fragment, [Add my $150 share] → `/p/<slug>?sheet=add&amount=150` |
| `(app)` shell | SessionGate (signed out → "Sign in to Pot" with the demo), DemoBanner (switch person / reset), OfflineBanner + "Back online", one polite LiveRegion, TabBar (Pots · Requests · You, 56 px + safe area; badge in **ink**) and a 64 px TopBar from bp-lg |
| `/pots` | header "+", waiting strip, PotCards (cover, seats, $ in Gabarito, share, waiting chip or goal bar), dashed ghost "Start a Pot", empty state with the glyph; 2-col grid from md |
| `/p/[slug]` | header (back, cover, H1, seats, ••• menu: Share invite, Close Pot "coming soon"), BalanceHero (two decimals, 500 ms count-up, "+$150 on the way"), GoalBar with brand-deep edge + text twin, [Add money] marigold + [Spend] secondary (52 px), SegmentedTabs Activity · Members · Rules (`?tab=` replaceState), "Waiting on you" RequestCards, feed by day; **bp-lg two columns**: Activity · Rules left, Waiting on you / Your requests / Members right (sticky) |
| Members / Rules tabs | totals strip, "Gets back" rows, explainer; rule rows with icons + personal ink meter |
| Add money sheet | amount → chips → source (Demo dollars preselected, Pot dollars, "Another app or exchange" soon) → first-time USDC note → outcome line → [Add $150] → keypad; closes at once, op shows "Adding $150…" + Sending… |
| Spend sheet | Reimburse me / Pay a member, keypad, RulePreview (instant / 2 of 3 / blocked), reason chips, note; result card: typing dots ≥ 1.2 s → brand-soft "Approved by Pot rules" + the 600 ms burst → "Sending…" → "$84 sent to you" (one announcement) → [Done]; vote path: "Sent to the group" + ApprovalTimeline |
| Approve sheet (`?r=`) | amount, reason, why box, ApprovalTimeline, Pot after this, Expires; [Approve $300] marigold + [Decline] (optional reason); own / already / decided / expired / failed states; final = check + `approve.final`, **no burst** |
| `/requests` | Waiting on you · Your requests · Decided; empty states; sheet via `?r=&pot=` |
| Create Pot (`/pots?sheet=create`) | step 1 name + emoji grid + 6 gradient swatches + live preview; step 2 Trip card, Club/Team "coming soon", "$150 each" switch (ink); step 3 ProgressSteps "Free: we cover the setup" → `/p/<slug>?sheet=share` |
| Share sheet | chat-preview card, share body, expiry + joins left, the full link, [Share link] (Web Share, copy fallback), [Copy link] → "Link copied" in place, QR (lazy, white plate in Night), [Make a new link] with confirm |
| `/you`, `/you/advanced` | profile, **Appearance** (Match my phone · Day · Night, live + persisted), rows, sign out; Advanced room (account id, network) lint-exempt |
| `/demo` (F-15 UI) | prerendered; banner, "Try Pot as…", three real `<form method=post action=/api/demo/session>` (work without JS; with JS the island switches persona locally), What to try, reference-Pot snapshot read through **@pot/sdk ChainViews** (`lisbonTrip("seeded")`, `'use cache'` 30 s), JSON link, `?as=` and `?ro=1` islands |

## Code map

- `i18n/en.json` (558 strings: ux-spec §5 + proposed keys), `messages.d.ts` (generated), `t.ts` (typed `t()`, plurals, `tLines()` for "title · body" keys, `pageTitle()`), `banned.mjs` (one list for both layers), `lint-copy.mjs`, `gen-types.mjs`.
- `eslint.config.mjs`: `react/jsx-no-literals` on app/components (ui + advanced exempt), jargon regex on JSXText + UI attributes, **no `text-brand*` classes**, import guards (near-api-js, @pot/sdk/sign, @auth0, @hot-labs).
- `lib/client/`: `money.ts` (over @pot/sdk money + keypad helpers), `rules.ts` (over sdk `previewSpendDecision`, `approvalsNeeded`, `shareOf`), `machines/{spend,join,create}.ts`, `ops/store.ts`, `keys/device-key-store.ts`, `mock/{fixtures,types,world,store}.ts`, `data.ts` (hooks returning view models), `actions.ts`, `sheet.ts` (URL sheet state), `browser.ts` (online, reduced motion, 150 ms delay, live region), `invite.ts` (sdk links/seeds), `time.ts`, `cn.ts`.
- `components/`: `pot/*`, `sheets/*`, `money/{MoneyText,Keypad,Celebration}`, `feedback/{TypingDots,States}`, `app-shell/*`, `landing/*`, `brand/Glyph`, `advanced/*`.
- Tests: unit next to code + `components/__tests__/*` (jsdom); e2e `e2e/mock/{flows,screens,states,demo-nojs}.spec.ts`, helpers `e2e/fixtures/pot.ts`, updated `e2e/smoke.spec.ts`.

## F-07 DeviceKeyStore
WebCrypto Ed25519 non-extractable (`generateKey(..., false, …)`), structured-clone `CryptoKey` in IndexedDB `pot-keys` v1 / store `device`; noble fallback with an AES-GCM-wrapped seed; `ensurePending` (idempotent, run on idle on `/j`), `promotePending(account)`, `sign`, `popMessage`/`pop` (`pot-session-v1|b64url(sha256(idToken))|ts`), `clear`, `persistStorage()`, and `nearSigner()` = `@pot/sdk/sign` **HashSigner** loaded lazily. Tests: both paths verify, reload survival, non-extractable, PoP bytes, HashSigner.

## Data source and the sdk
- Today the UI reads a **persistent browser mock world** (`lib/client/mock`, localStorage, shared across tabs, deterministic latencies, `localStorage['pot.mock.fail']='add|spend|vote|create|join'` fault injection). Reason: the sdk's `MockChain` is in-memory per page, and the flows need state to survive navigations, reloads and persona switches.
- It is kept honest against the sdk: money formatting/parsing, decide(), k-of-n, pro-rata and invite links **are** the sdk functions, and `mock/sdk-parity.test.ts` checks the story against `lisbonTrip()` / `LISBON_EXPECTED` (450 → 366 → 66, $22 each, same `wouldGetBack`).
- `/demo` already reads through the `ChainViews` interface (MockChain); F-05/F-15 swap `lisbonTrip()` for `createChainViews(cfg)`.

## Deviations (with reasons)
1. **Invite story runs on a second fixture Pot, "Porto Weekend"** ($300 of $450, Maya + Sam), because the seeded Lisbon Trip is the post-Leo D-61 README state that flows (b)/(c) and `/demo` need. With MockChain wiring, `/j/lisbon-trip` at `pre_leo` replaces it.
2. **Mock sign-in: "Join with Google" / email / passkey sign the invitee in as Leo without a popup** (no NEAR Auth in this wave). The join machine already has the `authorizing` state for F-14.
3. **One Drawer for all widths** (bottom sheet < 768 px, centred 440 px dialog ≥ 768 px via CSS) instead of Drawer + Dialog: no viewport branching at hydration, same a11y (role dialog, focus title, Esc, ✕).
4. **Motion in CSS, not `motion/react`:** typing dots (4 × 1200 ms, stops < 5 s), the 12-particle 600 ms burst, check pop, feed insert, Undo hairline. All honour reduced motion (burst not rendered). Saves the Motion chunk.
5. **`tabular-nums` on `body`** as a safety net (every digit is tabular), plus `MoneyText` on every displayed amount.
6. **`cn()` replaced by `lib/client/cn.ts`** (`createCn` with the brand type scale). The stock merger read `text-balance-hero`/`text-label` as colours and dropped them next to `text-ink` (the hero rendered at 16 px; every Button lost `text-label`). `components/ui/button.tsx` now imports it too. `lib/utils.ts` (outside my paths) still exports the stock one: **switch it** (or delete it) so shadcn additions don't regress.
7. **Approve sheet doesn't auto-close after the final approval;** it shows the check + `approve.final` and a [Done] (design-direction says close after 1.5 s).
8. **"Another wallet or exchange" → "Another app or exchange"** (`add.source.other_wallet` isn't allowlisted; design-direction default).
9. **Requests badge is `ink`** (task + design-direction), not the brand README's `waiting` fill.
10. **Inline Approve is on** for the mock signer (device-key users); `RequestCard needsGesture` shows [Review] instead.
11. **`/j` without JS:** the body streams behind `<Suspense>` (Cache Components), so it's in the HTML (bots, previews; tested) but showing it needs JS. `/demo` is fully static and works without JS.
12. **Goal = $150 × max(3, members)** for the mock (ux-spec: × invited count, which we don't know yet).
13. Package changes (unavoidable): `package.json` lint script = `lint-copy && i18n --check && eslint`, + `lint:copy`, `i18n:gen`, `i18n:check`; devDeps `@testing-library/react 16.3.3`, `@testing-library/dom 10.4.2`, `@testing-library/user-event 14.6.8`, `jsdom 30.1.3`, `fake-indexeddb 6.2.6` (Testing Library was mandated, nothing was installed). `eslint.config.mjs` edited (F-02 needs it). `app/layout.tsx`, `app/globals.css` (keyframes, glyph swap), `app/page.tsx` edited.

## Open design questions I defaulted (Cerasela)
1. Hero "Your share" = pro-rata part ($122 after the $84 spend) vs the contribution: kept ux-spec wording; DD-02 Q3 suggests "Your part".
2. Night `link` (#ffc94d) next to marigold buttons (text links like "Add a note", "Make a new link"): kept the token.
3. Tab labels and badges use `body-sm` 14 px / `text-xs` 12 px (no 12/16 caption token yet).
4. Disabled primary = `surface-sunken` fill + `ink-muted` label (DD-01), not 50 % marigold — so a screen never shows a dead marigold.
5. Google "G" on a white disc inside the marigold button (Google branding rules unchecked).
6. "Pay a member" kept; preview says "needs 2 of 3", after sending "Approvals · 1 of 2" (DD-02 Q10 rename to "It needs 1 more" not applied).
7. Pots tab icon `House` (no pot or coin icons, brand rule).
8. Empty member feed: dots + "Be the first to add money." (no ghost row).

Proposed copy keys added (ⓟ, not in ux-spec §5 yet): `home.*`, `landing.title.fallback`, `landing.share`, `landing.members.count`, `landing.no_app`, `landing.more.*` hints, `auth.continue_in_window`, `setup.greeting/time/progress.3/retry/body_plain/cta_plain`, `signin.*`, `invite.incomplete.*`, `pots.empty.join_hint`, `pots.waiting_strip`, `pots.card.*` extras, `pot.closing`, `pot.menu.*`, `feed.*.sub`, `feed.instant.rule`, `feed.day.*`, `feed.created`, `chip.not_sent`, `members.refund_hint/totals/gets_back/only_you`, `rules.budget.used/new_member/change.in_flight`, `add.after(.goal)`, `add.source.short/test_pill/soon`, `spend.reason.word.*`, `spend.sent.member`, `spend.done`, `approve.timeline.*`, `approve.own.hint`, `requests.section.waiting.empty`, `requests.mine.row`, `create.step_of/preview_hint/name.*/cover.color`, `share.preview_hint/link.label/qr.*`, `close.busy/in_flight/retry`, `you.settings/profile.demo/soon`, `generic.checking`, `stale.updated`, `demo.sam/intro/try.*/snapshot.*/readonly`, `notif.*` (push/bot table), `a11y.*`, `time.*`.

## Pending for testnet wiring
- **F-05:** replace `lib/client/data.ts` bodies with TanStack queries over `createChainViews(cfg)` + `GET /api/pots/[pot]/feed` (heartbeat on `PotView.seq`), keep the view models; delete `lib/client/mock` from runtime (keep for e2e).
- **F-08:** signing engine in `lib/signing/` (HashSigner via `DeviceKeyStore.nearSigner()`, SigningQueue, relay client + §4.8 error map); `actions.ts` swaps `mock/store` calls for `intent → sign → POST /api/relay`, ops settle by `blockHeight ≥ executedAtBlock`.
- **F-13/F-14:** `/j` preview from views + DB names (`invite-preview.ts` keeps its shape), `?i=` via `invitePkFromParam` (done), join = sdk `signJoinWebCrypto` + relay `join`; NEAR Auth popup in the `authorizing` state; `pot_hint` cookie in `useMe()`.
- **F-15:** `/demo` forms already post to the backend's `/api/demo/session`; the JS island should `fetch` it (BotID) instead of switching locally; snapshot from `createChainViews` over `DEMO_REFERENCE_POT`.
- **Contract facts from the sdk:** after close show `usdc.ft_balance_of(dao)` not `balanceEstimate`; `ERR_POT_BUSY` → `close.busy` + retry (copy added; Close sheet is P2); disable rules change / Close while `openRulesProposal` / `closingInFlight` (`rules.change.in_flight`, `close.in_flight` added); Approve sheet must render `decodeCloseKind`/`decodeRulesKind`/Transfer from the proposal and act only on `getProposalSubject(...).live` (rev4, M-17).
- Not built this wave: Close sheet (P2), deposit stepper (P2), install coach / push (F-23), receipts sheet, Telegram, the real Requests `direct_change` cards (needs live proposals).


---

# Wave 2: testnet wiring (F-05, F-08…F-13, F-15, F-16, X-07)

> Written 2026-10-22 by the frontend-integration engineer, against the preview deploy in notes/deploy.md
> (hub `pots.potprev.testnet`, token `usdc.potprev.testnet`, reference Pot `lisbon-trip`, pool Pots `lisbon-qg6e/fhq8/fpcz`).

## Status (actual output)

| Command | Result |
|---|---|
| `pnpm --filter web typecheck` | clean |
| `pnpm --filter web lint` | `lint-copy: 564 strings, 0 banned words` · `messages.d.ts is up to date` · eslint clean |
| `pnpm --filter web test` | `Test Files 22 passed \| 3 skipped (25)` · `Tests 486 passed \| 13 skipped (499)` |
| `pnpm --filter web build` (default = mock) | passes; also passes with `NEXT_PUBLIC_DATA_SOURCE=testnet` |
| `E2E_PORT=3517 NEXT_PUBLIC_DATA_SOURCE=mock pnpm exec playwright test` | **69 passed (32.4s)** |
| testnet `flows.testnet.ts` (E-a…E-d, E-f) | **5 passed (2.5m)** |
| testnet `demo.testnet.ts` (E-e = README J-1…J-5) | **4 passed (50.4s)** |
| testnet `screens.testnet.ts` (read-only) | 1 passed → `notes/screens/live-{day,night}-pot.png`; `live-{day,night}-join.png` come from E-b |

Testnet run (gated, signs testnet txs through the app's relayer only; never while the backend live tests run):
```
E2E_TESTNET=1 E2E_PORT=3417 pnpm --filter web exec playwright test -c e2e/testnet/playwright.config.ts
```
The config builds and starts its own server (`NEXT_PUBLIC_DATA_SOURCE=testnet`, `NEXT_PUBLIC_APP_URL=http://localhost:<port>`
so the API's Origin check passes) and passes local-only overrides: `QUOTA_IP_FAUCET_USD` ($50k, one laptop IP),
`QUOTA_GLOBAL_HUB_YOCTO` (2 NEAR/day, the shared preview cap was exhausted), browsers on dRPC first / server on FastNEAR first.
**Cost:** `flows` creates exactly 1 Pot + 2 dev accounts per run (≈ 0.07 NEAR hub float + relayer gas); `demo` creates none and
reuses its lease across runs (`test-results/testnet-demo-visitor.json`, `E2E_DEMO_FRESH=1` for a new one); `screens` signs nothing.

Tx evidence (passing flows run, `https://testnet.nearblocks.io/txns/<hash>`): create_pot `57jrRAmGAmxivHzQD8DxjqvYP1YQbTSAM5auGfApNWEx`,
join `T9G9rLURwcgqmer2742XuBGkcwd2RwoXHSqB46Bv11W`, adds `aLoYSm9DeCdYMKE2xrMeEa9gcg4pLcw2hPGT3cjGPAy` / `72iaYiGhAWpPhs4Y9reDThkFfP3cwHF7mqbzLbCC3SMC`,
instant $20 `BXy7NYUUGt3SDGxL6Q2on5tBXh914SAHTDmsU52c7Fke`, vote request $120 `HPV7WRZ8zkjK46LMGWCix9FW6Cfq39w9oy3zB4fENY4a`
+ own approval `8tD1muMJ2AdDZsRc41MCJECrb77gv8ek9HXszTRsdw99` + friend's approval `8zygU8j9R1JKBmbJEfuGVks5V9v4jYAmnD2mbwm6qvx6`,
propose_close `4kJ7cJtb…` (ERR_POT_BUSY → "Money just moved…" → Try again) then `CfC4hZgLtceLYmH4fEQWEUwv7kSM6oyvxJfJa8dvX6uG`,
close approvals `3bR6AZBaMyUZ9noNADv5wNQ144ZkvcBwB7skCTjoWuxK` / `MC1U7asQRbpqipa8o5qXasNYgqyWXghk8gHgUwaXhbK` → refunds $44 / $66, Pot 0.
Demo (lease `lisbon-fhq8`): instant $20 `Gmoey4Le16CeqZN45AWpWmmtHgBtDNWnY37HkNnAYtMk`, $300 request `9D52NEhn1zduyrPVBkP2pR2WuSTCz5Q3qsvUzNQjMT2b`,
Maya `H8E7W9HdStBQZvyUCLcZ32kQjyjjY6TKeZMrLyLSJRfa`, Leo `6D5MGdYb5hnFCATcL9VkuuHapYkcuZifA7tvwbQngvsH` → $130.
(The `refused` spend state and the add-money settle tweak landed after that flows run; they're covered by unit tests and the demo
run on the rebuilt server. The flows suite wasn't re-run to spare the hub's sponsorship balance.)

## What's wired

- **Switch** `lib/client/config.ts`: `NEXT_PUBLIC_DATA_SOURCE=mock|testnet` (inlined at build; default mock). `data.ts`, `actions.ts`,
  `session.ts` are the only things components import; each picks the mock store or `lib/client/live/*` per build. The mock suite is unchanged.
  `.env.local` is not edited: run a testnet build with `NEXT_PUBLIC_DATA_SOURCE=testnet` in the environment (or add it below the marker).
- **F-05 reads** `live/queries.ts` + `live/vm.ts`: TanStack keys `['pot',dao,'view'|'balance']` (3 s on the Pot, 10 s on lists, visible
  only), `['pot',dao,'bundle']` (members, requests, feed route, this device's invite; refetched when `seq`/totals/balance change),
  `['pot',dao,'proposals',ids]` (3 s only while a proposal is InProgress), `['potsOf',me]`, `['usdc','balance',me]`. Every chain value keeps
  its block height; `live/settle.ts` keeps an op's projection until the views read at ≥ the relay's `executedAtBlock` (10 s fallback).
  The Pot screen never drops back to its skeleton once ready (an open sheet would unmount mid-flow).
- **F-16 feed merge** (`vm.ts`, pure, `vm.test.ts`): feed route contributions (receipts) ⊕ chain joins/requests/close ⊕ synthesized
  contributions the route never saw; DAO status wins over the hub's lagging one; expiry computed client-side; names from feed profiles →
  session name → persona account (`maya-qg6e` → Maya) → "A friend".
- **F-08 signing** `keys/engine.ts` (the only `@pot/sdk/sign` importer, lazy) + `live/signing.ts`: `DeviceKeySigner` (WebCrypto key via
  `HashSigner`, nonce = max(chain optimistic, last)+1, TTL 200 blocks, sign + relay inside `SigningQueue` per key, re-sign once on
  `expired`/`nonce_used`/`nonce_pending`), `DemoSigner` (`{demo:{intent}}`). Signing-path reads use an unbudgeted RPC client so heartbeats
  can't queue an action. `live/relay.ts`: 202 → poll `GET /api/relay/[id]`; network error → same body ×2; two-phase `followRelay`.
  `errors.ts`: reason → class (§4.8) → `*.error.relayer` / `*.error.generic` / `relayer.cap`.
- **F-09** create = one `create_pot` delegate with the invite key, silent re-suffix on `slug_taken`, seed in IndexedDB `pot-invites`,
  gradient in `context.meta`; Share shows expiry + joins left from `get_invite`; other devices get [Make a new link] (`add_invite` /
  `rotate_invite`). **F-10** add = faucet top-up when demo dollars fall short (≥ $50) → `ft_transfer_call`; "+$X on the way" until settled.
  **F-11** spend = memo first, `request_spend`; instant: early answer → Approved → final poll → Sent / payout failed / **refused** (new
  state + `spend.refused`, never a false "Sent"); vote: own approval with the exact kind (waits for the `final` view to show the new
  proposal). **F-12** Approve: `get_proposal_subject.live` check, Transfer kind must match amount + receiver, already/decided/expired.
  **Close (P-9, live only)**: `CloseSheet` (refund table, `propose_close` + own approval at 300 Tgas, `close.busy` + Try again, approve
  face for the others decoded from the proposal's `ft_transfer`s, closed face with who got what).
- **F-13** `/j/[slug]` SSR reads the real Pot (`app/_lib/chain.ts`, server RPC, DB display names, `?i=` checked with `get_invite`);
  [Join with a test account] (FLAG_DEV_SESSION) → dev session → D-08 signature → relay `join`. **F-15** `/demo` snapshot over
  `DEMO_REFERENCE_POT`; persona forms `fetch` `/api/demo/session` (no-JS form post still works); `?as=` auto-switch; banner switch/reset.
- Dev sign-in on the signed-out screen (FLAG_DEV_SESSION). NEAR Auth live login is not wired (F-14).

## Deviations
1. The faucet top-up happens on submit, not when the Add sheet opens (one claim per real add; the faucet's min is $50).
2. "$X each" goal is off-chain and per device (`localStorage pot.goal.<slug>`), default $150 for Trip; needs X-05b meta.
3. Close is enabled on testnet builds only (mock keeps "coming soon"); no FLAG_CLOSE client flag was read.
4. Members' "Gets back" uses `get_members(balance)` / the close record, never `balance_estimate`.

## Flaky areas
- **One IP for everything:** two phones + runner + relayer + other agents → FastNEAR 429s without CORS (console noise; failover works).
- **Shared relayer keys with the backend live tests** (`pot_test` leases don't see the dev DB's): a broadcast lost to a nonce clash left
  a `request_spend` `pending` forever (UNKNOWN_TRANSACTION). Don't run both together.
- Fresh dev accounts: the client waits for finality to pass the new key's block before signing (see request 1).
- Shared preview caps (`global_hub_yocto` 1 NEAR/day, `ip_faucet_usd` $1k/day) run out across agents.

## Requests to backend
1. `pipeline.ts` nonce check `nonce >= final_head × 10⁶ → bad_request too_large` rejects the first delegate of a key added a block ago
   (its nonce is (optimistic block) × 10⁶). Compare against the optimistic head or allow +2 blocks. Client workaround in `signing.ts`.
2. A failed broadcast leaves `relay_log.status = pending` and `GET /api/relay/[id]` pending forever; mark it failed (or re-broadcast)
   after `tx` returns UNKNOWN_TRANSACTION past the TTL, so the client can say "nothing moved".
3. Feed `profiles` only cover actors on the page; include every active member (the creator often has no item) so names don't fall back.
4. Partition `RELAYER_KEYS` between live tests and dev servers (or share one lease DB).
5. Pool refill: each demo e2e lease retires a seeded Pot; `refillDemoPool` (or the seeding script) needs to run on preview.
6. `/api/demo/state` and `/api/health` log "bail out of prerendering" errors during `next build` (they read headers at build time).


---

# Wave 3: Phase 2 (F-20, F-22, F-23, F-24, F-25 + design-direction leftovers)

> Written 2026-10-22 by the frontend-phase-2 engineer. Screens (390×844 @3x, Day + Night): `notes/screens/p2-{day,night}-*.png`
> (rules, rules-change, rules-review, close, close-approve, closed-moment, pot-closed, coach-card, coach-ios, push-prompt,
> inapp-landing, advanced) and `p2-day-og-image.png` (1200×630).

## Status (actual output)

| Command (apps/web) | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm lint` | `lint-copy: 752 strings, 0 banned words` · `messages.d.ts is up to date` · eslint clean |
| `pnpm test` | `Test Files 34 passed \| 3 skipped (37)` · `Tests 625 passed \| 13 skipped (638)` |
| `pnpm build` (mock) | passes; `/j/[slug]/opengraph-image` is a dynamic route |
| `E2E_PORT=3637 NEXT_PUBLIC_DATA_SOURCE=mock pnpm exec playwright test` | **164 passed, 13 skipped (1.0m)**: the 69 earlier + 95 new (p2, pwa, a11y in 3 projects); the 13 skips are per-project gates (e.g. 320 px only in mobile-day, keyboard only on desktop, no coach on desktop) |
| `E2E_TESTNET=1 E2E_PORT=3427 scripts/with-testnet-lock.sh pnpm --filter web exec playwright test -c e2e/testnet/playwright.config.ts p2.testnet.ts` | **3 passed (2.3m)**: setup (1 new Pot, 43.1s) · P2-a rules change A→B, `get_rules` $50, `preview_spend($60)` = vote/over_cap, `$40` instant (44.1s) · P2-b full close, RefundTable = `preview_close`, payouts $100/$150 landed, Pot 0 and closed (43.7s) |

Shared-tree hazard: `.next/` and `test-results/` are shared with other agents' builds and Playwright runs (a rebuild mid-run serves
500s for chunks; a parallel run deletes trace files). I ran Playwright with `--output=<private dir>` and rebuilt before each run.

## What's new

- **F-20 Members / Rules.** "Gets back" is hub `preview_close` at the live balance (bundle query; mock: the sdk `prorata` twin, dust
  included), with "How it's worked out" (a small sheet). Rules are sentences (`ruleSentences()` shared with the change sheet).
  [Ask the group to change a rule] (secondary) → `?sheet=rules` (`components/sheets/RulesSheet.tsx`): two selectable cards
  (instant limit, limit per person) edited with the keypad, a live preview of the new sentences, "This needs k of n approvals",
  [Ask the group] = `propose_rules` + the proposer's own `VoteApprove` (FunctionCall kind → 300 Tgas via `voteGas`). While
  `open_rules_proposal` is set the button gives way to a waiting card (+ [Review]) or, if this device can't decode it yet,
  `rules.change.in_flight`. Reviewers see the old sentence struck through above the new one, decoded from the proposal
  (`decodeRulesKind`, must target this Pot). Sole member: [Change rules] → `set_rules`, applied at once.
  Advanced: account + per-Pot explorer links, Pot (DAO) + Rules (hub) ids, and the **On-chain rules** panel (get_policy +
  get_rules + get_pot: members, rulebot, threshold → k/n, quorum, period, instant_cap, member_budget, payees, rules_version,
  open_rules_proposal). No Trezu on testnet (D-52).
- **F-22 Close.** `CloseSheet` has four faces: propose (RefundTable from `preview_close`, remainder line, open requests,
  "what happens next", [Ask the group to close] / [Keep the Pot open]), vote ([Approve closing] 300 Tgas / [Say no], payouts decoded
  from the proposal's `ft_transfer`s), waiting ("Your approval is counted. It needs 1 more." + timeline), closed (calm: glyph + check,
  no burst). Errors: `ERR_POT_BUSY` → `close.busy` + [Try again]; `ERR_CLOSE_IN_PROGRESS`/`closing_in_flight` → `close.in_flight`;
  `ERR_CLOSE_COOLDOWN`, `ERR_PAYOUTS_PENDING`, nothing to refund. While closing (or a close is in flight) Add/Spend are
  `aria-disabled` with `pot.closing` and a closing note sits on the Pot. Closed Pot: hero "Closed Oct 22", no money buttons, a closed
  card "$22.00 is in your Pot account." + "It stays in your Pot dollars… Taking money out of Pot isn't available yet." (honest: no
  cash-out in the MVP), announced once per device; Pots card shows "You got back $22.00". `RefundTable` is a real `<table>` (You
  first on surface-sunken, a total row, names truncate visually only). Close now works in the mock build too (no more "coming soon").
- **F-23 PWA.** `public/sw.js`: install/activate (skipWaiting/claim) + `push` + `notificationclick` only (no fetch, no cache).
  Declarative + flat payloads; icon `/icon-192.png`, badge `/icons/badge-96.png` (the glyph as a white alpha mask, 96 px); app badge
  from `app_badge`; same-origin only; an approval's `?r=<proposalId>` is rewritten to `?pid=`, which the Pot screen resolves to the
  spend request (`?r=<requestId>`), the close (`?sheet=close`) or the rules change (`?sheet=rules`). Open window → focus +
  `pot:navigate` → `SwBridge` `router.push`. `lib/client/pwa/`: `platform.ts` (iOS 26 vs 27 by `Version/2x`, in-app browsers incl.
  Telegram globals, Android prompt capture, `x-safari-https` escape keeping the `#fragment`; Android intent only without a fragment),
  `coach.ts` (≤ 2 auto shows, 7-day snooze, first contribution on this device or a new Pot, never desktop/installed), `push.ts`
  (`requestPermission()` first inside the tap, `pushManager.subscribe` with `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, POST/DELETE
  `/api/push/subscription` per api-spec §2.6; logout deletes), `badge.ts` (iOS: standalone + permission; else installed only).
  Components: `CoachCard` (on the Pot after the trigger), `CoachSheet` (`?sheet=coach`), `PushPrompt` (`?sheet=push`, opens itself
  only on a Home Screen launch, lock-screen-safe examples), `PwaHost` (in the app shell) + You rows (Notifications status/toggle,
  Add Pot to your Home Screen).
- **F-24** `app/j/[slug]/opengraph-image.tsx`: 1200×630 marigold, cover tile in the middle square, Gabarito 800 name in on-brand,
  initials-only avatars + "{n} friends are in" / "Closed", glyph + wordmark; no balance, no names; unknown slug or any error → the
  static `og-image.png`. Fonts: static TTFs in `apps/web/assets/fonts/` (Gabarito 800, Figtree 600, OFL). In-app browsers on `/j`:
  "Open in Safari to join" banner above the CTAs, [Open in Safari] (marigold there) + [Copy link]; Google and passkey hidden, email stays.
- **F-25** fixes: skip link ("Skip to content", first Tab stop); sheet bodies that scroll become a focusable named region (axe
  `scrollable-region-focusable` was serious on the Close sheet); 200 % text: the Pot name wraps instead of truncating to nothing, the
  hero amount caps at 15vw, hero buttons stack (rem-based auto-fit), Buttons use min-heights and wrap (were `whitespace-nowrap` with
  fixed heights), tab-bar and segmented labels cap at ~4vw, the Members header and Pots grid wrap, long words break (`overflow-wrap`).
  Rules/Close sheet titles stay put through their faces (the dialog keeps its name).

## Tests added
- Unit (vitest): `lib/client/pwa/pwa.test.ts` (context detection for 10 UAs, escape links, coach caps, push support/auto-prompt,
  VAPID decode, badge rule), `lib/client/pwa/sw.test.ts` (sw.js in a fake worker: handlers, payload shapes, `?pid=` rewrite,
  same-origin, focus vs openWindow), `lib/client/mock/world-p2.test.ts` (close math incl. the unequal $29.33/$22.00/$14.67 + dust,
  majority, reopen on no, sole member; rules propose/approve/apply/pending/sole), `lib/client/live/vm-p2.test.ts` (preview_close
  Gets back, rules decode + wrong-Pot guard, close payouts decode, closing in flight), `components/__tests__/p2.test.tsx`
  (RefundTable semantics, error copy maps, changed rules, `?pid=` resolver).
- Mock e2e: `e2e/mock/p2.spec.ts` (rules change Maya→Sam, then a $60 spend needs the group; sole member; ERR_RULES_PENDING; close
  with ERR_POT_BUSY → Try again → Sam approves → closed/read-only/Leo's view; `?pid=` deep link; Members; Advanced), `pwa.spec.ts`
  (coach iOS 26 / iOS 27 / Android prompt / Android menu / Instagram landing + coach / desktop; push granted (mocked route) / denied /
  not now / tab / iOS tab; badge; `/sw.js` headers; OG image), `a11y.spec.ts` (320 px on 14 screens, 200 % desktop zoom, 200 % text,
  join + approve reading order and focus, keyboard-only approve and rules change, reduced motion). Every new sheet runs axe (0
  serious) and the brand checks (one marigold, marigold never text, tabular figures).
- Testnet: `e2e/testnet/p2.testnet.ts` (one Pot per run). `flows.testnet.ts` E-f updated for the new close copy.

## Deviations
1. The push example notifications say "Maya needs your OK · A request is waiting in Lisbon Trip" (lock-screen safe, no note text;
   frontend-architecture Q14 default), not "$300 for Tickets".
2. The closed copy is "Pot closed. $22.00 is in your Pot account." everywhere (`close.done.self`, `notif.closed.body` reworded too):
   "on its way back to you" promised a cash-out the MVP doesn't have (design-direction Q11/Q15).
3. The "closed moment" is a card on the Pot (announced once) plus the sheet face for whoever made the last approval, not a sheet that
   opens by itself for everyone.
4. Tab-bar, segmented-control labels and the hero amount cap at a viewport-relative size under large text (vw caps), so 200 % text
   never scrolls sideways; everything else scales fully.
5. The rules change sheet edits the two amounts only (instant limit, per-person limit). Recipients/allowlist and the period aren't
   editable (period is a DAO setting; allowlist is Phase 3).
6. Android in-app escape: no "Open in Chrome" link when the URL carries the invite `#secret` (an intent URL can't keep it); Copy link.
7. `components/ui/button.tsx`: `whitespace-nowrap` + fixed heights → `text-center` + min-heights (same look at normal size).
8. The hide-Change rule for the shared demo Pot (demo_forbidden) isn't applied: the UI can't tell the shared Pot from a lease. It shows
   `rules.change.error` if refused.

## Requests to backend
7. **VAPID public key for the client:** the browser reads `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (frontend-architecture §1.5 env table); it isn't
   in `.env.local` / the preview env yet. Until it is set, [Turn on notifications] ends in `push.error`.
8. **Push `navigate` for approvals:** keep `/p/<slug>?r=<proposalId>` **and** `data.proposalId` in the payload (as `payload.ts` does):
   the SW rewrites it to `?pid=`, which the app resolves to the request, the close or the rules change. A close or rules request
   with only `?r=` and no `data.proposalId` would open as a (missing) spend request.
9. **Feed route:** add `rule_change` items for `rules_change_proposed` with `proposalId` (actor = the member who asked); the UI falls
   back to the first approval to name who asked (the DAO proposer is the hub). Same for `close_requested` with `proposalId`.
10. **Relayer R11 for rules votes:** `vote` on the hub's set_rules FunctionCall proposal at exactly 300 Tgas, `get_proposal_subject.kind
    = "rules"`, `live` while `open_rules_proposal == id`; and `sync` after it so `open_rules_proposal` clears (the UI keeps the button
    held while it is set).

## Open questions for Cerasela (every one I know of, with the default this build uses)
Defaults in brackets. Sources: plan/design-direction/README.md (DD), 01 (DD-01), 02 (DD-02), frontend-architecture §15 (FA), ux-spec §13 (UX).

| # | Question | Default used | Source |
|---|---|---|---|
| 1 | Google button "Join with Google" vs "Continue with Google"; G on a white disc inside marigold OK with Google's rules? | ["Join with Google", G on a white disc] | DD 1, DD-01 2 |
| 2 | Landing: add "Everyone's chipping in $150", drop "No crypto needed"? | [added; dropped] | DD 2, DD-01 3 |
| 3 | "wallet" in main paths vs "Another app or exchange" | [renamed] | DD 3, DD-01 4 |
| 4 | Outcome line above Add money ("Lisbon Trip will have $450") | [yes] | DD 4, DD-01 5 |
| 5 | First Home Screen launch: lazy "Confirm it's you", or bundle it with the push prompt as "Finish setting up"? | [push pre-prompt alone; confirm stays lazy (integrations' area)] | DD 5, DD-01 6 |
| 6 | Testnet deposit: "Simulate sending $150" as the marigold, hide Copy address | [yes, integrations' sheet] | DD 6, DD-01 7 |
| 7 | Create: Club/Team as "Coming soon" cards or hidden; six cover gradients | [cards; six gradients] | DD 7, DD-01 8 |
| 8 | Link-preview emoji: Twemoji vs the gradient + Gabarito initial | [Twemoji on the cover gradient] | DD 8, DD-01 9 |
| 9 | Marigold when something waits on you: Add money stays, inline Approve secondary? | [Add money stays] | DD 9, DD-02 1 |
| 10 | Hero actions vs "bottom 40 %": documented exception or a sticky bar | [exception] | DD 10, DD-02 2 |
| 11 | "Your share" means $150 and $122: rename to "Your part"/"You'd get back"? | [kept "Your share"] | DD 11, DD-02 3 |
| 12 | Burst only on "Approved by Pot rules", or also final group approval / Pot closed? | [rules only; Pot closed is calm] | DD 12, DD-02 4 |
| 13 | Expired = ink-muted + hourglass + "Expired" | [yes] | DD 13, DD-02 7 |
| 14 | Copy: "Pay a member", "Ask the group to change a rule", "Approve closing", "It needs 1 more" | [all four for close/rules; spends keep "Approvals · 1 of 2"] | DD 14, DD-02 10 |
| 15 | After close, where does Leo's $22 go (no cash-out in the MVP)? | ["$22.00 is in your Pot account." + "Taking money out of Pot isn't available yet."; P1 to confirm] | DD 15, DD-02 11 |
| 16 | Mockups to D-61 numbers before hallway round A | [the build uses D-61] | DD 16, DD-02 12 |
| 17 | FA §15 Q16 brand calls + Appearance copy; unused `avatar_tint` | [Match my phone · Day · Night; tint unused] | DD 17 |
| 18 | Night `link`/`focus` #FFC94D next to marigold: keep or light plum / underlined ink? | [kept the token] | DD-02 5, DD-01 10 |
| 19 | Requests badge in `ink` instead of `declined` red | [ink] | DD-02 6 |
| 20 | Status pills: Lucide check/clock/x instead of 8 px dots | [icons] | DD-02 8 |
| 21 | Small text: a 12/16 caption style, or everything ≥ body-sm 14? | [body-sm 14; badges 12] | DD-02 9 |
| 22 | Eggplant on pressed `brand-deep` is 4.33:1: lighten Day `brand-deep`? | [accepted as a momentary state] | DD table, DD-01 1 |
| 23 | Brand tokens replace ux-spec §7; Gabarito/Figtree `tnum` | [yes; tabular-nums on body + MoneyText] | DD-01 1 |
| 24 | Dynamic Type 17 px root on iOS: accept or compensate? | [accept] | FA 1 |
| 25 | Approved → Sent beat when both arrive together (≥ 600 ms / ≥ 400 ms) | [kept the beats] | FA 2 |
| 26 | OG image without the balance, initials only | [yes] | FA 3 |
| 27 | Covers emoji-only in the MVP | [yes] | FA 4 |
| 28 | Inline Approve with Undo on by default for device-key users | [on] | FA 7, UX 4 |
| 29 | Android: [Install Pot] card after the first contribution, or only in You? | [card after the first contribution (and after Create), plus You] | FA 8 |
| 30 | Session hint cookie: display name readable by page JS | [OK] | FA 9 |
| 31 | New ⓟ copy keys into ux-spec §5 (FA list + this wave: `rules.change.*`, `approve.rules.*`, `close.*` extras, `push.prompt.prime/settings`, `push.example.*`, `coach.*` extras, `og.*`, `members.how.*`, `pots.card.closed_refund`, `advanced.onchain.*`) | [added to en.json, lint-clean] | FA 11 |
| 32 | Desktop: a 440 px dialog for every sheet, Create included | [yes] | FA 12 |
| 33 | New members: instant spends need money put in first (`new_member`) | [yes] | FA 13 |
| 34 | Privacy copy at Create ("name and amounts are public") and a lock-screen-safe push body | [no Create copy; push examples lock-screen safe; server body is P1's] | FA 14 |
| 35 | Late-money hint in the Add sheet | [not shown; README] | FA 15 |
| 36 | FA §15 Q16: one marigold = Add money; no burst on group approval; two decimals in the hero; disabled style; switch colour; ••• icon | [Add money; none; two decimals; disabled primary = surface-sunken (wave 1) but hero buttons while closing/offline = 50 % opacity; ink; ellipsis-vertical] | FA 16 |
| 37 | Hero number: balance vs "Your share" | [balance] | UX 1 |
| 38 | Login set and order on testnet | [Join with Google (marigold) + Continue with email + More ways] | UX 2 |
| 39 | Trip limits $100 instant / $200 per person | [yes] | UX 3 |
| 40 | Decline reason optional | [optional] | UX 9 |
| 41 | Say "Free" once at Create | [yes] | UX 10 |
| 42 | (this wave) Rules change edits only the two amounts | [yes; see deviation 5] | new |
| 43 | (this wave) Close cooldown copy "You can ask again tomorrow" vs the exact time | [tomorrow] | new |
| 44 | (this wave) Large-text caps for tab labels / hero amount (vw) | [capped; see deviation 4] | new |

## QA wave 4 (2026-10-22): live data fixes (details in notes/qa-report.md §2)
- **Q3:** never `invalidateQueries` the bundle from a change detector: it cancels the fetch in flight, whose RPC reads
  still drain the tab's 100/min FIFO bucket, and the bundle never landed under a burst of changes. Use
  `lib/client/live/refresh.ts` `refreshQuery()` (no cancel, one trailing refetch). `invalidatePot` passes
  `cancelRefetch: false`. The open proposals' votes are read through `signingChain()` (unbudgeted, ≤ 1 call / 3 s).

## Back in multi-step sheets (2026-11-01)
Request: "We should have a back button in this flow, if I want to change something without closing it" (the
"Add from another wallet or exchange" sheet had only ✕).

- **Pattern:** the Create flow's: a ghost **[‹ Back]** (Lucide `chevron-left` + `sheet.back` "Back") under the step's
  primary, full width, `SheetBack` in `components/sheets/Sheet.tsx`. It's never marigold, so each screen keeps
  exactly one marigold button. Create step 2 and the /demo tour's Create scene use the same component and copy
  (`create.back` was renamed to `sheet.back`).
- **One history entry per step.** `lib/client/sheet.ts` stores `potSheet` (the depth) in `history.state` on every
  entry it pushes:
  - `pushSheetStep()` pushes the next step.
  - `sheetStepBack()` is `history.back()` when the entry below is the same sheet's. Otherwise (a deep link straight
    to a later step) it replaces the entry with the previous step, so the person stays in the app.
  - `closeSheet()` unwinds every step with `history.go(-depth)`, so ✕ on step 3 lands on the Pot, not on step 2.
    A cold deep link (depth 0) is still stripped with `replaceState`.

  As a result the in-sheet [Back] and the browser's or Android's Back are the same move. The old module-level
  `pushedUrl` is gone.
- **Add money** (`components/sheets/AddFlow.tsx`, `lib/client/machines/add-flow.ts`):
  - The steps are amount + source (`?sheet=add`) → network (`&src=xc&amount=`) → address + QR (`&d=`, now pushed
    rather than replaced) → tracking (the stepper on that same entry).
  - The reducer keeps what was typed, the source and the picked network while the flow is open. Back from the
    address step finds the network still picked, and Back from the network step finds the amount still there.
    Leaving the flow (no `?sheet=add`) resets everything.
  - The "‹ Base · Change" pill on the address step does the same thing as [Back].
- **No Back once money is on its way.** That means after [Simulate sending] (or a real send), or on any stepper
  state. The reasons:
  - The transfer can't be undone. Going back to the address or network picker would suggest you can change the
    network or amount of money that is already moving, and a second [Get address] would create a second deposit.
  - The stepper already says "You can close this screen. We'll let you know when it arrives", and the Pot card
    keeps showing progress.

  So the reducer marks the flow `tracking`. A browser Back from there closes the whole flow (`closing` →
  `closeSheet()`) instead of stepping back into the address step, the same as ✕. While Simulate is busy, [Back]
  is disabled. "Get a new address" on an expired deposit is the one way back to the network step from the
  stepper (`NEW_ADDRESS`).
- **Create:** step 2 is `?step=rules` (pushed). Browser Back on step 2 returns to step 1 with everything kept,
  instead of closing the sheet, and Forward goes to step 2 again. Step 3 (creating) has no Back.
- **Accessibility:** `Sheet` takes `stepKey`. When the step changes inside an open sheet, focus moves to the
  step's heading (`[data-step-heading]`: the network legend, or the address step's `h3`; otherwise the sheet
  title), and the sheet's own `role="status"` region reads it. The app's live region sits outside the modal.
  Going back to the Add sheet reopens it, so the drawer focuses its title. [Back] is a real `<button>` with a text
  label, and the chevron is `aria-hidden`.
- **Other multi-step sheets were checked:**
  - Spend, Close, Rules change and "Confirm it's you" are each one form followed by a result or progress, so
    there is no step to go back to. Their result states are in flight, and only Done or ✕ apply.
  - Approve's "Decline" sub-step already has its cancel button ("Cancel", `approve.decline.cancel`). It is a
    confirm rather than a URL step, so the browser's Back still closes that sheet.
- **Tests:**
  - `lib/client/machines/add-flow.test.ts` (Back keeps the amount, source and network; no Back from tracking;
    Back out of tracking closes the flow).
  - `lib/client/sheet.test.ts` (jsdom history: push, pop, unwind, deep link, cold link).
  - `components/__tests__/create-rules.test.tsx`, "Create: Back".
  - e2e `deposit.spec.ts`, "Back: …": address → Back → network (Solana kept, heading focused, announced) → Back →
    Add sheet ($100 kept) → forward → the browser's Back twice → closed. After "Simulate sending" there is no
    Back, and the browser's Back closes the flow. It also covers "✕ on the address step closes the whole flow",
    with axe and the one-marigold rule on both steps.
  - e2e `flows.spec.ts`, "Create: step 2 [Back] and the browser's Back…".
- **Results:**
  - `pnpm typecheck`, `pnpm lint` and `pnpm test` (763 passed, 9 skipped) are green.
  - `NEXT_DIST_DIR=.next-back NEXT_PUBLIC_DATA_SOURCE=mock next build` passes.
  - The mock e2e suite against `next start -p 3500` gave **216 passed, 21 skipped** (3 projects).

## Hub 1.1.0 testnet run: Add money 422 (2026-11-02)
First run of `e2e/testnet/paylink.testnet.ts` + `wave4-trust-goal.testnet.ts` against the upgraded hub 1.1.0.
- **paylink setup, "Add $150" → hero stays $0.00, `POST /api/relay` 422.** Body (from the Playwright trace):
  `{"reason":"args_invalid","detail":{"field":"amount","why":"range"}}`. The delegate was
  `usdc.ft_transfer_call {receiver_id: pots.potprev.testnet, amount: "150150000000", msg: {"pot": …}}`, i.e.
  **$150,150**. Nothing to do with hub 1.1.0, `extras` or policy v2: the Add sheet prefills "your share" ($150, D-61),
  the spec typed "150" on top (the keypad appends → "150150"), and `getByRole("button", { name: "Add $150" })`
  matched "Add $150,150" by substring. The relayer's R1 cap (`MAX_CONTRIBUTION` $10,000) refused it, correctly.
  - Spec: clears the prefill first (6 × delete, as flows/p2 do) and uses `exact: true` for "Add $150" (both specs).
  - App: the Add sheet now stops at **$10,000 per add** (`MAX_ADD` in `lib/client/money.ts` = the relayer's
    `MAX_CONTRIBUTION`): over it the button is off and an alert says "You can add up to $10,000 at a time."
    (`add.error.max`), instead of sending a delegate that comes back 422 with the money never moving.
    Test: `components/__tests__/add-max.test.tsx` (also pins `MAX_ADD === MAX_CONTRIBUTION`).
  - Still open (pre-existing): a demo-dollars add above "own + $500" claims only $500 from the faucet
    (`FAUCET_MAX`, `lib/client/live/actions.ts`) and the `ft_transfer_call` then fails on chain.
- **wave4-trust-goal "Error: signed in" in 158 ms:** `walletSignIn()` only taps "I have a NEAR wallet"; the spec read
  `/api/session` right after, before the NEP-413 sign-in had landed. `accountOf()` (e2e/testnet/chain.ts) now polls
  the session for up to 30 s.
- **wave4-trust-goal, then two wrong expectations in the spec (the hub 1.1.0 is right, per notes/contracts-wave4.md):**
  - `nextLevelIn` is 2, not 3: the paid $180 one-OK spend counts toward trust too (D4-2: every request that reaches
    `approved` with amount × 10 ≥ the base cap). $180, $20, $20 → level 1 (streak 0), the third $20 → streak 1. The
    Rules tab says "2 more paid spends to $300".
  - "$150 is instant for Ben now" was false twice: `previewSpend`'s 5th argument is the **Pot balance** (the spec passed
    $60, the money left, so `insufficient_balance`), and the per-person budget still bounds trust ($200 − $60 = $140 →
    `instantUpTo` $140, a $150 spend is `over_budget` → one OK). The spec now checks $120 instant and $150 one-OK
    against a $300 balance, plus `budgetLeft`/`instantUpTo` $140.
- **e2e/testnet/accounts.ts `release()`** retries the parent's delete with backoff over FastNEAR → dRPC: one run's
  delete hit FastNEAR's 429 and stranded ≈ 0.019 NEAR in `e2e-hu34bn.pot-funds-65k8.testnet` (its key lived only in
  that process).
- **Results:** paylink 4/4 and wave4-trust-goal 2/2 green on hub 1.1.0 (preview); unit 1153 passed; lint and typecheck
  clean; mock e2e 310 passed, 3 failed = `receipt.spec.ts:95` in every project, unrelated and time-of-day dependent:
  the sample FX date is `isoDayUtc(now)` (lib/receipt.ts) but `fxLine()` compares it with the **local** day, so between
  local midnight and UTC midnight (00:00-02:00 in Romania) it says "from Nov 1" instead of "from today".
