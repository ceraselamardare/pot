# Gifts: anyone can send a Pot a gift (approved 2026-11-02)

Buy-Me-a-Coffee style, not fundraising infra. A Pot stays a closed group; anyone can **send it a gift**.
Behind `FLAG_GIFTS` (server) / `NEXT_PUBLIC_FLAG_GIFTS` (client) until verified on testnet.

## Owner decisions (all accepted as recommended)
1. Word: **gift** ("Send a gift ☕"). "Chip in" stays the members' share.
2. Gift links are **on for every Pot** (old ones too); any member can turn gifts off (••• → Gifts).
   The **public page is off** until a member turns it on.
3. Gift money belongs to the group: **not refundable**, spendable like any Pot money, shared **pro-rata at close**
   (split **equally** among members if no member added money).
4. Goals: gifts **count toward a normal goal**; gifts are **refused while an all-or-nothing goal is still collecting**.
5. Lean create flow ships at the same time.

## Contract: hub 1.2.0 (no migration)
- `ft_on_transfer` accepts `{"pot":X,"gift":"<ref ≤32 chars>"}` from ANY account (parse order: link → gift → contribute).
  Checks: Pot open, not paused, gifts not off, amount ≥ $1 (1_000_000) and ≤ MAX_AMOUNT, no all-or-nothing goal collecting.
  On success forward to the DAO; callback adds `gifts_total`, `gifts_count`, emits `gift_received{pot,from,amount,ref}`;
  on a failed forward return the amount (the token refunds the sender).
- Gifts never touch `member.contributed` / `total_contributed` (so no refund/vote/budget effects).
- No 60 s busy window from gifts; an `in_flight` counter blocks close only while a gift forward is pending (self-heals ≤60 s).
- Close: `ERR_NO_CONTRIBUTIONS` → allowed when contributions + gifts > 0; existing pro-rata over the real balance shares gifts;
  NEW: if no member contributed, split equally (prorata.rs + the TS twin in packages/pot-sdk + shared vectors).
- Views: `balance_est` includes gifts; `get_pot` (or a new view) exposes `gifts_on`, `gifts_total`, `gifts_count`.
- `set_gifts(pot, on: bool)` callable by any active member (predecessor-authorized; relayable).
- State in a side map under a fresh prefix (e.g. 0x0D), not in the root struct → plain DeployContract upgrade from 1.1.0.
- Upgrade/deploy to testnet needs the human's explicit OK.

## Private gift links: enforced by our server (not on chain)
- Table `gift_link`: id (128-bit, url-safe), pot, created_by, amount (null = giver chooses), note (≤140), reusable bool
  (default reusable), uses, expires_at (default 14 d), revoked_at.
- URL: `/g/<slug>/<id>`. Share sheet gets tabs **Invite | Gift link** (QR first via components/share/QrPlate.tsx).
- Fixed amount → one button "Send $25"; open → presets ☕ $5 ×1/×2/×4 + custom (min $1, prefilled $5).

## Public gift page
- `/give/<slug>`: off until a member turns it on (••• → Gifts). Shows cover, name, member count, an optional one-liner
  from members, presets, QR, totals, and only givers who opted in to be shown.

## Giver flow (≤3 taps)
Open link / scan QR → sign in inline (Google via NEAR Auth, or NEAR wallet) → amount → optional name + 140-char note
(+ "show my name on the public page" opt-in) → Send → thank-you screen with "Start your own Pot".
Demo dollars: the existing faucet grant covers guests. "From any chain" = the existing simulated 1Click.

## Relayer
- R1 (or a new rule) accepts the gift msg from non-members; pre-flight: gifts on, ref known, link amount/uses/expiry valid.
- Quotas: `user_gift` 10/day, `pot_gift` 100/day, plus per-IP.
- Classify `gift_received` by ref → feed row "Ana sent a gift · $10 ☕", push to members.

## Privacy rule update
Off-chain data stays members-only, except: the giver sees their own note; the public page shows only notes/names
the giver chose to make public. Gift amounts and sender accounts are on the public ledger anyway.

## Lean create flow
One screen: name (emoji/colour by tapping the preview), "$150 each" inline, one rules row
"Small spends up to $100 go through on their own; bigger ones go to the group · [Change]" ([Change] opens today's
rules step unchanged, `?step=rules`), [Create Pot]. Gifts add zero create decisions.

## Freezes
Storage layout + ABI Nov 6, features Nov 10, copy Nov 11, hub lock Nov 12.
