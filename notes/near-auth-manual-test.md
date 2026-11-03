# NEAR Auth: manual test on localhost:3000 (for Cerasela)

> Written 2026-10-22 by the integrations engineer. Automated tests cover the whole code path against a local fake
> issuer and a fake chain (`e2e/integrations/*.int.ts`, `server/features/{nearauth,devices}/*.test.ts`). What they
> can't do is a real Google login on the shared testnet client, which only accepts `http://localhost:3000`
> (kb/near-auth.md). About 15 minutes. Steps 1-4 sign nothing themselves; account creation and step 5 spend testnet
> NEAR from our relayer (≈ 0.0085 + ≈ 0.005 NEAR). Don't run it while a live test or a testnet Playwright run holds
> the testnet lock.

## Setup (once)

1. Below the marker line of `apps/web/.env.local` (the part `scripts/run env` keeps), add:
   ```
   NEXT_PUBLIC_DATA_SOURCE=testnet
   NEXT_PUBLIC_FLAG_NEAR_AUTH=true
   NEXT_PUBLIC_NEAR_AUTH_CLIENT_ID=np8paqIpMWmNbzT4xAvOOapZBjsOpptl
   NEAR_AUTH_CLIENT_ID=np8paqIpMWmNbzT4xAvOOapZBjsOpptl
   NEAR_AUTH_REQUIRE_NONCE=true
   ```
   (The client id is the public shared testnet client from kb/near-auth.md; it isn't a secret.)
2. `cd apps/web && pnpm exec next dev -p 3000`, then open **`http://localhost:3000`**. Not `127.0.0.1` and not
   another port: the tenant answers "Callback URL mismatch" (403) for anything else.
3. Use a normal Chrome window with popups allowed for localhost:3000. Open DevTools → Network if you can.

## 1. Google sign-in in the popup (F-14, F-27, B-07, B-20), from the site's sign-in dialog

Since 2026-11-03 the site's [Start a Pot] opens a sign-in dialog in place (notes/frontend.md "Sign-in dialog").
Use a browser profile that has never opened Pot on localhost:3000 (or clear its site data), so you also see the
first-run intro.

- [ ] Go to `http://localhost:3000/` and tap the hero's **[Start a Pot]**. A dialog "Sign in to start your Pot"
      slides up (a centred dialog on a laptop) and the address bar shows `/?signin=1`. It offers, in this order:
      **[Continue with Google]** (the marigold, with the G on a white disc), [Continue with email], "or",
      "I have a NEAR wallet", then the line "Sign-in opens in a new window…" and "Not ready? See a quick demo".
- [ ] Press Escape: it closes and you're back on `/`. Tap [Start a Pot] again.
- [ ] Tap [Continue with Google]. A window opens **at once**, inside the tap. It's NEAR Auth's page (branded
      "Example"), then Google's account picker. The dialog now shows the steps "Finish with Google in the new
      window" (with "Can't see it? Open it again" and [Cancel]), "Setting up your Pot account…", "Name your Pot and
      pick its rules".
- [ ] Optional, once: tap "Can't see it? Open it again" while the window is behind this one: it comes to the front.
      [Cancel] closes the window and brings the options back (nothing changed).
- [ ] Pick your account. The window closes by itself, the first step turns into "Signed in", then the dialog closes
      and the app's first-run intro ("Welcome to Pot") slides up at `/pots?sheet=intro&then=create`; Skip it and
      "Start a Pot" (Create) opens. It must **not** stop at a bare `/pots` on the way. Time from tap to the intro:
      ____ s.
- [ ] Signed out on an app route (`/pots`) you see the same options inline under "Sign in to Pot": Google is the
      marigold, [See a demo] is secondary, "What is Pot?" a quiet link. Steps 2-5 start there.
- [ ] Network: the window's `/authorize` request has `code_challenge_method=S256`, `response_mode=web_message`,
      `connection=google-oauth2` and a 43-character `nonce`; then `POST /oauth/token` → 200 and `POST /api/session`
      → 200 with `isNew: true`.
- [ ] You → Advanced shows `u-xxxxxxxx.users.potprev.testnet`. On `https://testnet.nearblocks.io/address/<that>`
      the account has **two** full-access keys (the NEAR Auth key and this browser's key) and a USDC registration.
- [ ] Optional: sign out (You → Sign out) and sign in again with Google: same account id, `isNew: false`. Signing
      out destroys this browser's key, so the new key is **pending** now, exactly the step-5 situation (you can run
      step 5 here instead of in a second browser).

If the window shows "Callback URL mismatch" you're not on `http://localhost:3000`. If `POST /oauth/token` fails
with a CORS error, the shared client doesn't list localhost:3000 as an Allowed Web Origin: note it (that's an H-01
question for the NEAR Auth team), and step 2 still works.

## 2. The redirect fallback (no popup)

- [ ] Sign out. In Chrome's site settings, block pop-ups for localhost:3000.
- [ ] Tap [Continue with Google]. The whole page goes to NEAR Auth / Google, then back to `http://localhost:3000/`
      with a short "Finishing sign-in…" bar, then to `/pots`, signed in. The URL has no `?code=` left in it.
- [ ] Sign out and do the same from the landing's dialog (`/` → [Start a Pot] → [Continue with Google]): after
      "Finishing sign-in…" you land on `/pots?sheet=create` (the intro or Create), not on `/pots`.
- [ ] Allow pop-ups again.

## 3. Errors

- [ ] Tap [Continue with Google] and close the window without picking an account: nothing happens, no error.
- [ ] [Continue with email] (shown directly on `/pots` and in the dialog; the invite page keeps it under "More ways
      to join"): NEAR Auth's email page opens (sign-up or sign-in). Optional: sign up with a throwaway email and
      password; you land in Pots with a new account.

## 4. Joining from an invite

- [ ] As yourself (signed in from step 1), create a Pot and copy its invite link from the Share sheet.
- [ ] Open the link in a **private window** (a new browser key). The landing shows **[Join with Google]**; tap it,
      pick a different Google account if you have one, and check you land on "You're in!".

## 5. "Confirm it's you" on a second device (B-13, live; spends ≈ 0.005 NEAR)

This is the only live check of the MPC path. It needs a browser key that isn't on your account yet: the same
Google account in a second browser profile (or Firefox), or the same browser after "Sign out" (step 1, optional).

- [ ] In the second browser, open `http://localhost:3000/pots` and sign in with the **same** Google account as step 1.
      You're signed in, but this device isn't on your account yet (`GET /api/session` → `device.status: "pending"`).
- [ ] Tap "Start a Pot", give it a name, and tap Create. The "Confirm it's you" sheet opens ("Add this device to
      your Pot account"). The button is disabled for under a second while the request is prepared.
- [ ] Tap [Continue with Google]. The NEAR Auth window opens at once and asks you to approve: on the shared client
      it reads "**Example** wants to sign a DelegateAction" with raw JSON (known; H-01). Tap Approve.
- [ ] The sheet shows "Approved" → "Adding this device" → "Done" (time: ____ s; expected 12-25 s), closes, and the
      Pot is created without another tap.
- [ ] Network: `POST /api/devices` → 200 with `signTxHash` and `addKeyTxHash`. On nearblocks:
      - `signTxHash`: `users.potprev.testnet` → `fast-auth.testnet` `sign`, 300 Tgas, **1 yocto**, final value
        `{"scheme":"Ed25519","signature":[…]}`;
      - `addKeyTxHash`: a relayed delegate on your account with one `AddKey` (full access);
      - your account now has **three** full-access keys.
- [ ] Optional: in the NEAR Auth window tap Deny, or close it: the sheet goes back to its button without an error
      (a deny is treated like a cancel), and no `sign` tx appears.

## Record here

| Step | Result | Time | Notes (requestId, tx hashes, screenshots) |
|---|---|---|---|
| 1 popup | | | |
| 2 redirect | | | |
| 3 errors | | | |
| 4 join | | | |
| 5 confirm | | | |

Afterwards, remove the five lines from `.env.local` again (hosted builds keep NEAR Auth off until H-01, D-22).
