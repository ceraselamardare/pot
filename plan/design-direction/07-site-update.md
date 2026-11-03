# Design direction 07: the site update (CTAs, the sign-in dialog, "What else a Pot can do")

Written 2026-11-03 for the design lead and the website-update builders. It changes three things in [03](03-landing.md) (the header, hero and final CTAs) and one line in [06](06-demo-simple.md) (the tour's end note). It adds the sign-in dialog and one landing block. Everything else in 03, 04 and 06 stands.

1. **There is one main action everywhere: [Start a Pot].** It opens the sign-in dialog in place, with no page change. After sign-in comes the app's intro, then Create. The hero's [Start a Pot] stays the page's only marigold. The header and the final card carry the same action as a secondary button, and the header gains a text "Sign in" for people who come back.
2. **The demo is the quiet second choice, called "See a demo".** It sits next to the marigold in the hero, in the final card, and as one text line at the bottom of the dialog ("Not ready yet? See a demo"). It is never in the header and never marigold, except in a build that has no way to sign in at all.
3. **The dialog shows only what the build really has.** Google comes first (the marigold), then email, then "I have a NEAR wallet" as a quieter row. On today's hosted build that leaves the wallet alone, so it becomes the marigold ("Continue with a NEAR wallet") with one honest line under it: "Google sign-in isn't on in this test version yet." The site's copy keeps telling the Google story (the design lead's decision 1).
4. **Every wait is the app's stepper.** After a tap, the options give way to three steps: "Finish with Google in the new window", then "Setting up your Pot account · Usually under 10 seconds", then "Name your Pot and pick its rules". The stepper comes with [Cancel] and "Can't see it? Open it again". Errors say what happened and that nothing changed.
5. **"What else a Pot can do" is four quiet cells:** an icon, the app's own name for the feature, and one line. They sit on `ground` between "Try the rules" and "Is it safe?", with no cards, no buttons and no motion. The block widens the story without competing with it.

> **For:** the design lead and the website-update builders (the team brief is `site-brief.md` in the director's scratchpad). **Written:** 2026-11-03 by site-ux. Direction only: no product code was changed.
> **Inputs:**
> - `CLAUDE.md`, `brand/README.md`, [03](03-landing.md), [04](04-landing-motion.md), [06](06-demo-simple.md), [01](01-join-and-money-in.md) §2, `plan/ux-spec.md` §1, §2, §4.1-4.2 and §9, `notes/landing.md`, `LAUNCH.md` and `plan/decisions.md` (Rev 9, D-20, D-22).
> - Code: `components/app-shell/Shell.tsx` (`SignedOutScreen`), `components/features/auth/SignInOptions.tsx`, `components/features/wallet/WalletSignIn.tsx`, `components/landing/JoinCta.tsx`, `components/landing/InAppBanner.tsx`, `components/sheets/Sheet.tsx`, `lib/signing/near-auth/client.ts`, `lib/signing/near-connect/wallet.ts`, the `Popup.js` of `@hot-labs/near-connect`, `Hero.tsx`, `SiteHeader.tsx`, `FinalCta.tsx`, `components/demo/Stage.tsx`, `i18n/banned.mjs`, `i18n/en.json`, and the flags in `.env.production` (flags only).
> - **A walk of the running site** (2026-11-03, dev server :3311 on the mock data source, Playwright, 390 × 844 and 1280 × 800, reduced motion). I captured `/`, `/demo` (the cover and `#end`), `/pots?sheet=create` signed out (with JS and without), and the app's Create sheet, for the sheet's geometry. There are 20 screenshots in the director's scratchpad, `shots/siteux/`. What I measured:
>   - **The dead end is real.** [Start a Pot] goes to `/pots?sheet=create`, which shows "Sign in to Pot". That screen's marigold is [Try the demo], and its body promises to "try Pot with test money" (`m-signedout.png`). The mock source has no sign-in at all. On a live build the only sign-in is a small "I have a NEAR wallet" link under two big buttons that lead away. **Without JS the screen is blank**: the only text is "Skip to content" (`m-signedout-nojs.png`).
>   - **What's on `/` today, at both sizes:**
>     - header: [Try the demo];
>     - hero: [Start a Pot] (the one marigold) and [Try the demo];
>     - tech band: [See how it works, step by step] → `/demo/4`;
>     - final card: [Start your Pot →] and [Try the demo].
>
>     That makes three demo buttons, one tech link into the tour, two ways to start and none to sign in.
>   - **Label widths** in the button style (`label`, Figtree 600 at 15 px), measured in the page:
>
>     | Label | Width |
>     |---|---|
>     | "Sign in" | 46 px |
>     | "Start a Pot" | 73 px |
>     | "See a demo" | 80 px |
>     | "Quick demo" | 82 px |
>     | "Try the demo" | 90 px |
>     | "See the demo" | 94 px |
>     | "See how it works" | 116 px |
>     | "See a quick demo" | 120 px |
>     | "Continue with email" | 137 px |
>     | "I have a NEAR wallet" | 141 px |
>     | "See a 2-minute demo" | 146 px |
>     | "Continue with Google" | 150 px |
>     | "Continue with a NEAR wallet" | 197 px |
>
>     The hero's two buttons are 158 px wide at 360 and 173 px at 390, with 48 px of padding. A hero label must therefore stay at or under 110 px to fit on one line from 360 px.
>   - **The header at 390** has 358 px. The lockup link is 107 px. Lockup + "Sign in" (≈ 70 px with its hit area) + [Start a Pot] (≈ 107 px) + gaps comes to ≈ 300 px: it fits from 360, and at 320 (288 px) "Sign in" must hide.
>   - **The app's `Sheet` is ready as it is:** a 390 px bottom sheet on phones, and a centred 440 × 576 px dialog at 1280 (the Create sheet, `d-app-sheet-create.png`).
> - **References:** 10 Mobbin searches (web and iOS screens, web flows, web sections). I looked at every returned image. I also read 6 web sources: Google's sign-in branding rules and its webview policy, NN/g on bottom sheets, Navattic's data on demo CTAs, and Privy's login-modal docs. §6 lists them all.
>
> **Notation:**
> - The same as 03 and 06: `token` is a brand token or its Tailwind class, type styles use the brand's names, and ⓟ marks a proposed `en.json` key.
> - "390" means phones (the design must also work at 320 with no horizontal scroll), "md" means 768-1023, and "lg" means ≥ 1024, designed at 1280 × 800.
> - A **build** is one deployment's config: its data source, `NEXT_PUBLIC_FLAG_NEAR_AUTH`, and whether the browser is an in-app one.

---

## 1. The CTA system

### 1.1 Three names, used everywhere

| Action | Label | Key | Why |
|---|---|---|---|
| Start | **Start a Pot** | `home.cta.start` | The label names the outcome. It is one name on every surface (brand §9: "an action keeps its name"), so the final card drops "Start your Pot". The tour end keeps **"Start a real Pot"** (`tour.end.cta`). That is the one deliberate variant: it contrasts with the made-up trip the reader just watched. |
| Demo | **See a demo** | `home.cta.demo` (was "Try the demo"), `signin.demo` | "See" promises looking, not doing, and "a demo" says it isn't the real thing. At 80 px it fits the hero at every width from 360. The fuller promise ("Two minutes, a made-up trip, no sign-in.") goes where there's room, in the dialog's demo row. "See a quick demo" (120 px) and "See a 2-minute demo" (146 px) don't fit the hero at 360 or 375. "Take the tour", the most common demo CTA in Navattic's data, reads as a sightseeing tour on a trip-money site. "Try the demo" also works (§5 Q1), but "try" is the word people use for the real product. |
| Sign in | **Sign in** | `home.nav.signin` ⓟ | For people who come back. It opens the same dialog; only its title and where you land afterwards differ (§2.5). |

### 1.2 Surface by surface

| Surface | The one marigold | Secondary | Quiet | Notes |
|---|---|---|---|---|
| **Landing header** (sticky) | none | [Start a Pot], secondary `sm`, 44 px | "Sign in", a text button in `ink` with a 44 px hit area, hidden below 360 | Both open the dialog. lg order: How it works · Rules · Under the hood · Sign in · [Start a Pot]. The header's demo button goes: the hero and the final card carry the demo. This is the Linear / Figma / Front / TheyDo pattern ("Log in" plus the main action), with the main action outlined because the hero has spent the marigold. |
| **Hero** | [Start a Pot] (unchanged) | [See a demo], secondary `lg`, beside it from 360 | the reassurance line (unchanged) | Start opens the dialog; the demo goes to `/demo`. |
| How it works, Try the rules, What else, Trust | none | none | none | No CTA mid-story. |
| **Under the hood** | none | [See how it works, step by step] → `/demo/4` (unchanged) | none | Judges' door into the tour, an allowlisted `home.tech.*` key. |
| **Final card** | none | [Start a Pot →] first, with the arrow, then [See a demo] | none | Both stay secondary; 03 §7's reasons stand. |
| Footer | none | none | none | Unchanged. |
| **Sign-in dialog** (its own screen) | the first real option: Google; the wallet when it's alone; [Open in Safari] in an in-app browser; [See a demo] when nothing can sign in | the other options | "Not ready yet? See a demo" (not in sign-in mode, and not when opened from the tour end) | §2. |
| **App signed-out screen** | as in the dialog | as in the dialog | "See a demo · What is Pot?" | `/pots`, `/requests`, `/you`, `/p/…` when signed out, and `/pots?sheet=create`, the target without JS or in a new tab. §2.10. |
| **Tour cover** | [Show me how] (unchanged) | none | "Skip to the end" (unchanged) | No start CTA here (06 S5: one control per state). The end screen is one tap away. |
| Tour steps | unchanged (the phone's own primary on tap steps) | [Back] [Next] | "Under the hood" | Unchanged. |
| **Tour end** | [Start a real Pot →] (unchanged; it now opens the dialog in place) | [Back to home] | `tour.end.note` (rewritten, §4) | The dialog hides its demo row here, since the reader has just seen it. |

### 1.3 How a start CTA behaves
- **Server HTML:** `<a href="/pots?sheet=create">`. It works without JS, in a new tab and for crawlers and AI judges. "Sign in" is `<a href="/pots">`.
- **After hydration** the link renders as `<button type="button" aria-haspopup="dialog">` with the same classes, the same swap as the tour's [Show me how] (`Stage.tsx`). It opens the dialog and pushes `?signin=start` (or `?signin=back`), so the browser's Back closes it and a reload reopens it (NN/g: support Back to dismiss a sheet). The param is read on the client only, so `/` stays static (Cache Components).
- **Load the dialog's code on intent** (pointerdown, focus or hover on a start CTA) with `next/dynamic`, not with the page. `/` already ships 382 KB of gzipped JS (notes/landing.md open item 1). Call NEAR Auth's `prepareNearAuthLogin()` when the dialog opens, not on the landing's idle: it calls `/api/session/challenge`.
- **Someone already signed in** never sees the dialog: `HomeRedirect` sends them to `/pots`, as today. If a session appears while the dialog is open, the dialog closes and the redirect wins.
- **After sign-in:**
  - start mode goes to `/pots?sheet=create`, so a first-timer gets the intro and then Create (`onboarding.ts` `intercept_create`);
  - sign-in mode goes to `/pots`.

  The NEAR Auth redirect fallback must carry the same destination in `returnTo` (§2.7).

### 1.4 Tests that move
- `e2e/smoke.spec.ts`:
  - "exactly one marigold" on `/` still holds while the dialog is closed (Base UI doesn't mount a closed popup);
  - "Start a Pot" is no longer unique and becomes a button after hydration, so scope it by region: `banner`, the hero `section`, `[data-final-cta]`.
- `e2e/mock/screens.spec.ts` "signed out: the app shell offers the demo" becomes "offers sign-in", and its H1 depends on the mode (§2.5).
- `brandChecks({ marigold: "at-most-one" })` counts inside the topmost open dialog when there is one, and on the page otherwise (the brief: a dialog is its own screen).
- The dialog's own states belong in the **integrations tier** (`e2e/integrations`): the real app in testnet mode against a fake NEAR Auth issuer, the e2e mock wallet and a fake RPC. Nothing there touches testnet, and no real login is involved.

---

## 2. The sign-in dialog

### 2.1 Job
At a glance, the dialog says what you're about to do (start your Pot), what it costs (nothing) and which ways in this build has, and it gives a way out if you're not ready. One tap starts the real thing.

### 2.2 What the references teach

| App | Screen | Borrow | Leave |
|---|---|---|---|
| Photoroom (iOS) | [Create your Space](https://mobbin.com/screens/a24501bb-f77a-4077-900d-f7817f12bf62) | The title names the outcome and the line says why to sign in ("Sign in to invite friends and colleagues to your Space"). Google is the one filled button; the legal line sits at the bottom. | Four providers, including Facebook |
| ChatGPT (iOS) | [Log in or sign up](https://mobbin.com/screens/893b981e-2865-44bd-93eb-7566d3f9f6ec) | A one-line promise under the title ("You'll get smarter responses…"), in a sheet with a visible ✕ | The email field first |
| Expedia (iOS) | [Sign in or create an account](https://mobbin.com/screens/a8760153-9bd0-4e7b-ada2-4efe09bc5cae) | The promise line in a sheet ("Unlock a world of travel…"), and one form of words for sign-in and sign-up | Three brands' logos |
| Phantom (iOS) | [Welcome](https://mobbin.com/screens/542d8942-272f-4f0b-9158-a065e4acae93) | Social first ([Continue with Apple], [Continue with Google]), with the wallet path as a quiet line under them ("Import Wallet"). It is the right order for a non-crypto reader. | The dark trading hero |
| Coinbase (web) | [Get started onchain](https://mobbin.com/screens/07fcaf8d-6751-4dd7-b19f-b6e17f23fe19) | The new-user path leads, then a labelled divider ("or connect an existing wallet"), then one quiet wallet row | "onchain" in the title |
| Coinbase Wallet (iOS) | [Welcome](https://mobbin.com/screens/11bb7b3a-733f-41e2-8249-3d9477a64508) | "I already have a wallet" as the familiar label for the second path, our "I have a NEAR wallet" | The coin stickers |
| Portrait (Privy, web) | [Welcome to Portrait](https://mobbin.com/screens/a9311893-ff3a-452c-8389-fa9991708af7), [login flow](https://mobbin.com/flows/963238da-1cb7-4dfa-82f8-f567ffc94df1) | A centred dialog over the dimmed landing at desktop size. The same dialog turns into its waiting state ("Sign to verify", a disabled "Connecting"). | Wallets listed first; "Protected by Privy" |
| OpenSea (web) | [Connect with OpenSea](https://mobbin.com/screens/642f1d7c-e592-45ef-9dc9-85a0dcc2cbdc) | The legal line sits under the options | The wallet list first: the order for a crypto-native audience, not ours |
| Acctual (Dynamic, web) | [Log in or sign up](https://mobbin.com/screens/2dcb43bf-91f7-4352-8723-36cf8499f98f) | Nothing | "Search through 553 wallets": the wall we must never show a non-crypto reader |
| Base (web) | [Sign into Base Account](https://mobbin.com/screens/29675edc-5900-4bdc-b81c-98ed9c9fb6af) | What a wallet user meets after the picker: a confirm screen saying what they allow. Our step wording is "Confirm it's you". | Address and balance on the screen |
| Higgsfield (web) | [Finish connecting in the new window](https://mobbin.com/screens/94ad55a3-35f8-4cda-9fc9-8945244e981b) | The waiting state: "Finish connecting Gmail in the new window · Don't see the window? Reopen it" | The empty dark modal |
| ClickUp (web) | [Connection instructions](https://mobbin.com/screens/44466483-7016-4bc0-82df-7795b35c7515) | An external window explained as numbered steps ("should open automatically… If it doesn't, click here to retry"), with [Cancel] | The grey spinner button |
| MagicPath (web) | [Check your email](https://mobbin.com/screens/3c996257-c47d-4179-a89c-3ccb06f4bbdf) | A checklist plus "Waiting for sign in…" inside the dialog | The spinner glyph (ours is the stepper's dots) |
| Gopuff (iOS) | [Welcome](https://mobbin.com/screens/8acb8611-fec9-4904-80ce-64aa694a0395) | "Take a look around", one underlined text link under the sign-in buttons and above the legal line: our demo row | The discount banner |
| Etsy (iOS) | [Sign in](https://mobbin.com/screens/0fe3b35a-4979-412f-8106-1443cf022e31) | "Continue as guest" between the options and the fine print | The email field first |
| foodpanda (iOS) | [Sign up or log in](https://mobbin.com/screens/4eb6720b-c5b2-42b8-ba20-ca85e7f4d1e7) | Nothing | "View more methods": we show every option directly, and there are never more than four |
| Cal AI (iOS) | [Sign In](https://mobbin.com/screens/8c9a9d91-341f-4c2d-875d-ee50364437d2) | A compact content-height sheet: one filled button, then outlined ones, then one privacy line | Apple first (testnet has no Apple, D-20) |
| Polarsteps (iOS, travel) | [Let's get you started](https://mobbin.com/screens/8be4d788-54c4-467e-8beb-eb1596a63092) | A warm, short title for a travel product, and the fine print in one line | The map photo |
| Synthesia (web) | [Welcome to Synthesia](https://mobbin.com/screens/6803f8e2-3e7d-4087-97ab-68db97569468) | A centred dialog over the app, with a calm help line under the legal line | Work email first |
| Hims (web) | [Login drawer](https://mobbin.com/screens/97b9ba8c-cc8e-4473-a9ec-0bd8decd8e4e) | Nothing | A right-side drawer on desktop: the brand centres dialogs from md |
| DoorDash (web) | [Sign in or Sign up](https://mobbin.com/screens/fccbb1ba-89e3-4295-8765-776a97487bc7) | A one-line reason banner at the top | The Sign In / Sign Up toggle (OAuth makes them one action) and its legal paragraph |

Sources from the web:
- **Google's rules** apply to the G button: "Continue with Google" is an approved label; the G "must be the standard color version… and appear on a white background"; and it "should be displayed at least as prominently as other third party sign-in options".
- **Google blocks its sign-in inside embedded webviews** (`disallowed_useragent`), which covers Instagram, Messenger and Telegram. That drives the in-app state.
- **Privy's modal** defaults to the title "Log in or sign up", caps its message at 100 characters, and moves options after the fourth to a second page.

### 2.3 Layout
The dialog reuses the app's `Sheet` as it is. It is not `full`: it takes its content's height, up to 92 dvh, with the grabber, a visible 44 px ✕, focus on the title when it opens, 360 ms in and 280 ms out, and a 120 ms fade under reduced motion. It never adds a side image, an illustration or the mark: the page behind it is the context.

```
390 × 844 · bottom sheet · content height ≈ 530 px (fits 390 × 664 Safari: 92 dvh = 611)
┌──────────────────────────────────────────────┐
│                     ━━━━                      │ grabber (phones only)
│ Sign in to start your Pot               [✕]  │ heading 19/24 · ✕ 44 px
│ It's free. Next you name it, pick its rules   │ body-sm ink-muted = the description
│ and share one link.                           │
│                                               │ space-5
│ [ (G)  Continue with Google               ]   │ primary 52 px: the one marigold
│ [ (✉)  Continue with email                ]   │ secondary 48 px
│ ─────────────────  or  ─────────────────      │ body-sm ink-muted between line rules
│ [ (▭)  I have a NEAR wallet               ]   │ ghost 48 px, label ink, Lucide wallet
│                                               │ space-4
│ Sign-in opens in a new window. For now, Pot   │ body-sm ink-muted (fine print)
│ runs on demo dollars (test money).            │
│ ───────────────────────────────────────────── │ line, space-5 above
│ Not ready yet?  See a demo ›                  │ body-sm ink-muted + link (label, ink), 44 px row
│ Two minutes, a made-up trip, no sign-in.      │ body-sm ink-muted
│                              + safe-area inset│
└──────────────────────────────────────────────┘
```

```
1280 × 800 · centred dialog (Sheet from md): 440 px wide, radius-lg, shadow-sheet, ≈ 520 px tall, over the scrim
┌ the landing, dimmed by --pot-scrim ─────────────────────────────────────────┐
│                ┌───────────────────────────────────────┐                     │
│                │ Sign in to start your Pot         [✕] │ px-6, pt-5          │
│                │ It's free. Next you name it, pick its │                     │
│                │ rules and share one link.             │                     │
│                │ [ (G)  Continue with Google        ]  │                     │
│                │ [ (✉)  Continue with email         ]  │                     │
│                │ ───────────── or ─────────────        │                     │
│                │ [ (▭)  I have a NEAR wallet        ]  │                     │
│                │ Sign-in opens in a new window. For    │                     │
│                │ now, Pot runs on demo dollars (test   │                     │
│                │ money).                               │                     │
│                │ ───────────────────────────────────── │                     │
│                │ Not ready yet?  See a demo ›          │                     │
│                │ Two minutes, a made-up trip, no …     │                     │
│                └───────────────────────────────────────┘                     │
└───────────────────────────────────────────────────────────────────────────────┘
```

- **Hierarchy has three weights:** marigold (Google), outlined (email) and ghost (wallet). The wallet is never styled like email: D-20 keeps it quieter than the paths everyone else uses.
- **The wallet row** is a ghost button with the Lucide `wallet` icon (20 px) and `landing.more.wallet` "I have a NEAR wallet" in `label` `ink`, full width and 48 px tall. It replaces today's small `text-link` line: Night `link` (`#ffc94d`) reads as marigold text, and the row must meet `tap-min`.
- **The "or" divider** appears only between the NEAR Auth group and the wallet. With one group, there is no divider.
- **The demo row** has the lead "Not ready yet?" in `ink-muted`, then the link "See a demo" in `label` `ink`, underlined on hover, with a `chevron-right`. Its accessible name is "See a demo", and `aria-describedby` points at the hint. It is never `link`-coloured, for the same Night reason.

### 2.4 Options by build

| Build | Options, in order | Marigold |
|---|---|---|
| NEAR Auth on (`NEXT_PUBLIC_FLAG_NEAR_AUTH=true` + a client id: localhost:3000 today, mainnet later) | [Continue with Google] · [Continue with email] · *or* · [I have a NEAR wallet] | Google |
| The same, plus tenant passkeys that open their own step | add [Use a passkey] (`landing.more.passkey` + its hint) after email, for at most four rows | Google |
| **The hosted testnet build today** (`.env.production`: `NEXT_PUBLIC_FLAG_NEAR_AUTH=false`) | [Continue with a NEAR wallet] alone, then the line `signin.google_later` "Google sign-in isn't on in this test version yet." | the wallet |
| Mock data source (design, CI, hallway replays; never deployed) | the full set, simulated: each option signs in as Maya with no network, like `JoinCta`'s mock Leo. A mock-only `?signin_preview=wallet\|inapp\|none\|unsupported` shows the other states for review. | Google |
| In-app browser (Instagram, Messenger, Telegram…, `useInstallContext().app`) | A notice card with [Open in {browser}] and [Copy link]. Under it, "Or continue here" with email (if on) and the wallet. Google and passkey are hidden. | [Open in {browser}] |
| A browser that can't hold a key (no IndexedDB or WebCrypto; NEAR Auth only) | `signin.unsupported_browser` in place of Google and email; the wallet stays | the wallet, or the demo if nothing is left |
| Nothing can sign in (a live build with every method off) | `signin.none.title`, `signin.none.body`, then [See a demo] | [See a demo]: the one case where the demo leads |

**Rules**
1. **Never a dead option.** No disabled "Google (soon)" button and no greyed rows: a missing method simply isn't there. The one sentence about Google on wallet-only builds is an explanation, not an option. It exists because the landing promises Google sign-in four times (hero, How it works, Trust, Under the hood).
2. **Show every available option directly** (at most four) with no "More ways" disclosure. The design lead asked for the options directly, and Privy moves options to a second page only after the fourth. Retire `signin.more`.
3. **The order follows who each option is for:**
   - Google first: most people, and one tap;
   - email second: no Google account, and the one method that survives in-app browsers;
   - the wallet last: D-20, for people who already have one.

   That is Phantom's and Coinbase's order, turned for a non-crypto reader.
4. **Passkey stays out for now.** Today it is a second door to the same NEAR Auth page as email: `SignInOptions.tsx` calls `login()` for both. It comes back only when it can open its own step.
5. **The Google button** is `GoogleMark` (the G in Google's colours on a white disc) inside the marigold, per 01's default. Google says the G must "appear on a white background", and the disc is that background. But it also says "Don't put the standard color Google 'G' icon on a colored background other than light, dark, or neutral" (§5 Q4). The fallback is Google's own "light" theme (`#FFFFFF` fill, a 1 px grey stroke, dark text), which is exactly Pot's secondary button. The dialog then has no marigold, which is allowed: at most one.
6. **The wallet-only marigold** says "Continue with a NEAR wallet" (`signin.wallet.only` ⓟ). It follows the "Continue with…" grammar of the other options and the design lead's word "connecting". It needs one exact-key jargon-lint exemption, like D-20's `landing.more.wallet` (§4). The fallback is the existing allowlisted "I have a NEAR wallet" as the marigold label.

### 2.5 Mode copy

| Mode | Opened from | Title (the dialog's name) | Description | Afterwards | Demo row |
|---|---|---|---|---|---|
| **start** | [Start a Pot] (header, hero, final card), [Start a real Pot] (tour end), `/pots?sheet=create` | `signin.start.title` ⓟ "Sign in to start your Pot" | `signin.start.body` ⓟ "It's free. Next you name it, pick its rules and share one link." | `/pots?sheet=create`: the intro on the first run, then Create | shown; hidden when opened from the tour end |
| **back** | header "Sign in" | `signin.title` "Sign in to Pot" | `signin.back.body` ⓟ "Use the same way as last time. New to Pot? This sets you up too." | `/pots` | hidden |
| **app** | the signed-out screen at app routes | `signin.title` (as the H1) | `signin.app.body` ⓟ "Sign in to see your Pots and anything waiting for you." | stays on the route it was opened on | "See a demo · What is Pot?" |

- **Why not title it "Start your Pot":** the Create sheet that follows is already called "Start a Pot". Two dialogs in a row with nearly the same name confuse screen-reader users, and the e2e helpers too (`openedSheet(page, "Start a Pot")`). "Sign in to start your Pot" names this step and its goal.
- **Fine print** (every mode): `signin.fine` ⓟ "Sign-in opens in a new window. For now, Pot runs on demo dollars (test money)." This is the honest line before a real action (06 Q5): Pots are real, and the money is test money.
- **No legal line.** There is no Terms page: `legal.terms` is unused and no route exists. "By signing in you agree to the Terms" would point at nothing, and `landing.legal` on the invite landing has the same problem. When a `/terms` page exists, add `signin.legal` ("By signing in you agree to the Terms.") with a real link under the fine print (§5 Q6).
- **Today's `signin.body`** ("Open an invite link from your group chat, or try Pot with test money.") is retired. `JoinCta.tsx` also prints it under the live sign-in options on the invite landing, so delete that line there rather than reword the key.

### 2.6 States

| State | When | What shows | Focus and announcements |
|---|---|---|---|
| **Idle** | the dialog opens | title, description, options, fine print, demo row | Focus goes to the title (the app's sheet convention, so screen readers read title + description), then Tab: ✕, the options in order, the demo link |
| **Opening** | tap on Google or email | `startNearAuthLogin()` opens the window synchronously inside the tap (as today). The tapped button gets `aria-busy`; the other options are disabled until the dialog swaps state. | Focus stays on the button |
| **Waiting for the window** (Google, email) | the window is open | The options give way to the stepper (`ProgressSteps`):<br>① "Finish with Google in the new window" (`signin.step.google` ⓟ; for email `signin.step.window` ⓟ "Finish in the sign-in window"), the current step with dots, and under it "Can't see it? Open it again" (`signin.step.again` ⓟ);<br>② "Setting up your Pot account" (`setup.progress.1`) · "Usually under 10 seconds" (`setup.time`);<br>③ "Name your Pot and pick its rules" (`signin.step.start` ⓟ), or "Open your Pots" (`signin.step.back` ⓟ).<br>Then [Cancel] (`signin.cancel` ⓟ), secondary, full width. The demo row and fine print are hidden: one thing to do. | `Sheet`'s `stepKey` moves focus to the step's heading (`[data-step-heading]`, here step ①'s label) and its live region reads it. "Open it again" focuses the open window, or restarts the sign-in if the person closed it: `window.open` with the same name would reset a sign-in already in progress. |
| **Waiting for the wallet** | tap on the wallet | NEAR Connect's picker opens on top (§2.7), and ours shows the stepper:<br>① "Confirm it's you in the window that opened" (`signin.step.wallet` ⓟ);<br>② "Signing you in…" (`signin.step.session` ⓟ);<br>③ as above. | Ours is non-modal while the picker is up (§2.7) |
| **Setting up** | the window answered | ① becomes ✓ "Signed in" (`signin.step.done` ⓟ) and ② is current, with dots. `setup.slow` appears at 10 s. | The live region reads ② |
| **Done** | the session exists | The dialog closes (280 ms) as the route changes: start mode to `/pots?sheet=create`, where the intro or Create slides up; back mode to `/pots`. There is no success screen and no burst: the next screen is the payoff. | The next sheet takes focus (its title) |
| **Cancelled** | the window or picker was closed by the person | idle again, silently (as today) | Focus returns to the option they used |
| **Error** | a failure | Idle again, with an alert line above the options: a Lucide `x` in `declined` and the text in `ink` (`JoinCta`'s pattern). The copy:<br>• blocked window: `auth.popup_blocked`;<br>• NEAR Auth down: `auth.service_down` (the wallet still works);<br>• anything else: `signin.failed` ⓟ;<br>• window timed out (180 s): `signin.timeout` ⓟ;<br>• the wallet sign-in failed: `signin.wallet.error`;<br>• a function-call key: `signin.wallet.limited`;<br>• no wallets listed: `signin.wallet.none` ⓟ;<br>• account setup failed: ② turns to error and shows `setup.error.relayer` with [Try again] (`setup.error.retry`). | `role="alert"`; focus stays on the option, or moves to [Try again] |
| **Offline** | `navigator.onLine` is false | The options get `aria-disabled`, and `signin.offline` ⓟ sits above them | Tapping an option explains it again |
| **In-app browser** | `useInstallContext().app` | On top, a `surface-sunken` `rounded-md p-4` card:<br>• `signin.inapp.title` ⓟ "Open Pot in {browser} to sign in";<br>• `signin.inapp.body` ⓟ "Google sign-in doesn't work inside {appName}." (on builds that offer Google), or `signin.inapp.body_any` ⓟ;<br>• [Open in {browser}] (`landing.inapp.open`, the marigold);<br>• [Copy link] (`landing.inapp.copy`).<br>Below the card, "Or continue here" (`signin.inapp.here` ⓟ) with email and the wallet. The escape link is the current URL plus `?signin=start`, so the browser reopens the dialog (`escapeHref`, as `InAppBanner` does). | as Idle |
| **Unsupported browser** | `deviceKeys()` returns null | Google and email are replaced by `signin.unsupported_browser` (rewritten, §4); the wallet stays | as Idle |
| **Nothing available** | no method in this build | `signin.none.title`, `signin.none.body` and [See a demo] | as Idle |
| **No JS** | — | The start links go to `/pots?sheet=create`, which today renders blank. Add a server `<noscript>` to the app layout with `signin.title`, `signin.nojs` ⓟ, [See a demo] → `/demo` (the tour reads fully without JS, 06 S10) and [What is Pot?] → `/`. | — |

### 2.7 External windows and NEAR Connect
- **Google and email.** NEAR Auth opens a real browser window inside the tap. If no window can open (a blocker, or iOS standalone), it falls back to a full-page redirect, and `NearAuthCallback` on `/` finishes the sign-in ("Finishing sign-in…", `auth.callback.working`). Store the mode's destination in the pending flow's `returnTo`, so the redirect path also ends in Create.
- **The wallet: NEAR Connect stacks its own sheet on ours.** `@hot-labs/near-connect` appends its picker to `body` (`.hot-connector-popup`, z-index 100 000 000, a bottom sheet on phones). Picking a wallet then opens that wallet's own window or extension prompt. Keep our dialog open behind it as the home base, in its waiting state. Closing ours would leave a cancelled pick on a bare landing with nothing to do.
  - **Our dialog must be non-modal while the picker is up** (Base UI `modal={false}`, or its focus trap off). Otherwise NEAR Connect's buttons can't keep keyboard focus. Ours ignores Escape and outside clicks meanwhile. Theirs closes on an outside click, which comes back to us as "cancelled", so we return to idle.
  - **The picker is the one surface we don't style,** and it says "wallet". It appears only after the person chose that word.
  - **No automated test sees the real picker:** the e2e mock wallet replaces the whole connector. This needs the human wallet check already in LAUNCH.md (Days 2-6, "Wallet"): open the dialog, pick Meteor or Intear, confirm, and also try Escape and an outside click on the picker, at 390 and 1280.
- **NN/g warns against making people track "the rapidly multiplying stack of overlays".** Here the second layer is a picker that resolves back into ours, and ours has shrunk to the stepper, so there is only ever one thing to do.

### 2.8 Accessibility
- **Names:** `role="dialog"` comes from `Sheet`. The dialog is named by the mode's title (`aria-labelledby`) and described by its description (`aria-describedby`).
- **Closing:** Escape, ✕, a tap on the backdrop and the browser's Back all close it in Idle and Error, and focus returns to the CTA that opened it.
  - While waiting for the window, Escape means [Cancel]: close our window handle and return to idle.
  - During the wallet picker, ours ignores Escape (§2.7).
  - The ✕ is always there (WCAG 2.5.7), even while setting up. Closing never breaks a sign-in in flight: the session still lands and `HomeRedirect` moves on.
- **Targets:** the options are 52 and 48 px, the demo row 44 px, and the header's "Sign in" 44 px. No control is smaller than `tap-min`.
- **Colour:** errors are a Lucide `x` in `declined` plus words in `ink`, and the stepper's done step is the `approved` check plus words, so colour never carries a state alone. In Night the marigold keeps `on-brand` text (8.9:1), the G's disc stays white, and the email button is transparent with a `line-strong` border.
- **Text size:** at 200 % text, buttons grow (they use min-heights) and labels wrap. At 320 and 100 % the longest label, "Continue with a NEAR wallet" (197 px plus its icon), still fits on one line inside the 288 px content width.
- **axe:** 0 violations in every state of §2.6, in Day and Night, with motion on and reduced, at 390, 1280 and 320.

### 2.9 Motion
- **In and out:** the `Sheet`'s own motion. At 390 the sheet slides up in 360 ms `ease-enter`; from md it rises 16 px and fades in over 360 ms; the scrim fades. It closes in 280 ms `ease-exit`. Under reduced motion it only fades, in 120 ms.
- **From one state to the next** (idle → waiting → setting up): the content crossfades (out 80 ms, in 200 ms from 40 %, the playground's swap). The sheet's height glides over 280 ms `ease-standard` (WAAPI, interruptible), so the top edge of a bottom sheet never jumps. Under reduced motion the swap is instant.
- **The stepper:**
  - the current step shows `ProgressSteps`' typing dots, which are already the app's wait;
  - the dots stop at 5 s and stay still (WCAG 2.2.2);
  - the done check pops on the spring (360 ms).
- **No celebration:** no burst, no confetti, no "You're in!". The brand's one celebration stays with "Approved by Pot rules".
- **NEAR Connect's picker animates itself** (it slides 50 px and fades), even under reduced motion. We can't change it.

### 2.10 The app's signed-out screen
It is the dialog's body inline, on a page, using the same component (for example `SignInChoices`, rendered either in the `Sheet` or in `<main>`). So there is one set of states, and the invite landing can adopt it later.
- **390:** a centred column `max-w-flow`, `py-12`. It holds the `Glyph` (56 px; the glyph alone is allowed for empty and loading states), then the H1 in `title` (the mode's title), the description in `body` `ink-muted`, the same option stack, the fine print, and then the quiet row "See a demo · What is Pot?" (`signin.demo` → `/demo`, `signin.home` → `/`), two 44 px text links in `ink`.
- **lg:** the same column, centred under the `TopBar` lockup.
- **Mode:** `/pots?sheet=create` uses start mode; every other app route uses app mode.
- **The one marigold** is the first real option, as in the dialog. Today's marigold [Try the demo] and the secondary [What is Pot?] button go.

---

## 3. "What else a Pot can do"

### 3.1 Job
After the core loop and the feel of the rules, show in one glance that a Pot does a little more. The block uses the app's own words, so the visitor recognises them later. It stays calm: no buttons and no new visual language.

### 3.2 What the references teach

| Site | Section | Borrow | Leave |
|---|---|---|---|
| Loom | [Features](https://mobbin.com/sites/sections/dbde8b55-4ad6-4bd1-9a03-eeead0dae6d1) | Four items in one row, each a small icon, a short title and one or two lines. It is the calmest form. | The dark icon discs |
| AngelList | [Advanced features](https://mobbin.com/sites/sections/6f1d7cf9-18ac-4359-baed-e65bf7aac05d) | Thin vertical rules between four columns, line icons, title, one line | The serif label column |
| Ramp | [Feature row](https://mobbin.com/sites/sections/c5ca75b6-8c2c-4e93-ae96-8671f79522a6) | Very compact cells where the bold lead carries the idea | Bold-lead run-on paragraphs (ours keeps title and line apart) |
| Square | [A little peace of mind](https://mobbin.com/sites/sections/b6639492-77d4-4be2-9525-2eeb42d9f1e3) | Four plain line icons over short titles | The "Learn more ↗" link in every cell |
| Current | [Do even more with your money](https://mobbin.com/sites/sections/36d06219-9c85-497c-9f88-c6aa12b1976d) | The heading idea ("Do even more…" = "What else a Pot can do") and the 2 × 2 for phones | Neon icon tiles |
| Current | [Credit building made easy](https://mobbin.com/sites/sections/cb958fa5-0ec4-4bb1-ac32-9f944834d427) | Hairline rules to separate cells instead of cards | — |
| Wise | [Feature 2 × 2](https://mobbin.com/sites/sections/3949a08d-c755-493c-be6d-d933eddf2041) | Nothing | A check icon on every item: in Pot a check means "Approved" |
| Fluz | [Not your average gift card](https://mobbin.com/sites/sections/6ecc4e3c-dd19-4152-9f47-2286233835d2) | Nothing | Six items: ours stays at four |
| Varo | [Feature tiles](https://mobbin.com/sites/sections/76628115-2102-41b9-acf8-65f9d30376fb) | Nothing | Loud tiles and a marquee: the opposite of calm |

### 3.3 Placement
**Between "Try the rules" (`#rules`, the sunken band) and "Is it safe?" (Trust).**
- After How it works and the playground, the visitor holds the main idea. This block widens it before the safety question. Its last item (receipts, read privately) hands over to "Is it safe?".
- It stays above the Night tech band, which non-crypto readers often skip.
- The sunken band separates it from How it works' five panels.
- It sits on `ground`, next to Trust (also `ground`), so the two must differ in shape: **no cards here**, cards there.
- Markup: `<section id="more" aria-labelledby>` with `Section`'s `scroll-mt`. No header nav link: the nav keeps its three.

### 3.4 Layout

```
390 · on ground, py-12
And more                                         eyebrow (label, ink-muted)
What else a Pot can do                           H2 (title)
                                                 space-6
──────────────────────────────────────────────   border-t line
 (sprout)               │ (target)
 Trust grows            │ All or nothing          label ink
 People who spend well  │ Set a goal and a date.  body-sm ink-muted
 get a bigger instant   │ Miss it, and everyone
 limit.                 │ gets their money back.
──────────────────────────────────────────────   border-t line
 (qr-code)              │ (receipt)
 Ask anyone to pay in   │ Scan receipts
 Share a link or QR     │ Snap a receipt and Pot
 code. Anyone can pay … │ fills in the amount. …
──────────────────────────────────────────────   border-b line
```

- **390:** `grid xs:grid-cols-2`, one column below 360. Each row has a `border-t border-line`, and a 1 px `line` rule runs between the two columns. Cells are `py-4`: the left one `pr-3`, the right one `pl-3`. No card, no shadow, no tile behind the icons. About 330 px of content.
- **md (768-1023):** 2 × 2, with `p-6` cells.
- **lg:** the head is left-aligned at full width (eyebrow → H2), then `space-8`, then **one row of four** (`lg:grid-cols-4`) under a `border-t border-line`, divided by 1 px `line` rules (`lg:divide-x`). Cells are `px-6 py-6`, and the first one is `pl-0`. The row is about 160 px tall: the Loom / AngelList / Square strip. If the section must be shorter, the alternative is the head in cols 1-4 with the four cells as a 2 × 2 in cols 5-12 (03's 5/7 grammar).
- **Night:** works as it is (`ground`, `line` rules, `ink` icons). No band of its own, so it never competes with the Night tech band.

### 3.5 Item anatomy and tone
1. **Icon:** Lucide at 24 px, stroke 2, `ink`, `aria-hidden`. It has no tile (Trust uses `surface-sunken` circles, and this block must look different) and no state colour.
2. **Title:** `label` (15/20, 600) in `ink`, `mt-3`, as an `<h3>` inside a `<li>` of a `<ul>`. **Use the name the visitor will meet in the app** ("Trust grows", "All or nothing", "Ask anyone to pay in", "Scan receipt"), so the site teaches the app's words. At most 20 characters.
3. **Line:** `body-sm` (14/20) in `ink-muted`, `mt-1`, one sentence of at most 60 characters with a full stop. Keep the four lines within ±15 characters of each other, so the lg row reads level. No numbers that need explaining.

**Tone:** what the group can do, said plainly. No "powerful", "seamless" or "smart", no exclamation marks and no tech words. This block uses linted `home.more.*` keys, not `home.tech.*`.

**Not in this block:** buttons, "Learn more" links, chips, stickers (03 keeps them out of trust and tech and they don't belong here), `brand-soft` (it means "the rules did this"), marigold, or the page's scroll reveal (04 keeps Trust still, and this block too).

### 3.6 The four slots
The facts agent confirms what's shipped and **on in the production config**: Pot Hub 1.2, `FLAG_GIFTS` (on in `.env.production`), and `features.receipts` from `/api/health` (that needs the receipt-reading key on the server). Below are the four defaults (the director's candidates) in the app's words, then the alternates.

| Slot | Title | Line | It echoes (en.json) | On when | Lucide |
|---|---|---|---|---|---|
| A | Trust grows | People who spend well get a bigger instant limit. | `create.trust.label`, `create.trust.hint` (word for word), `rules.trust` | Hub 1.2 (wave 4) | `sprout` |
| B | All or nothing | Set a goal and a date. Miss it, and everyone gets their money back. | `create.target.aon.label`, `goal.aon.note`, `rules.goal.aon` | Hub 1.2 (the rulebot closes Pots that miss) | `target` |
| C | Ask anyone to pay in | Share a link or QR code. Anyone can pay into the Pot without joining. | `payin.title`, `payin.intro`, `payin.qr.hint` | `FLAG_GIFTS` | `qr-code` |
| D | Scan receipts | Snap a receipt and Pot fills in the amount. It's read privately. | `spend.receipt.snap`, `spend.receipt.hint`, `spend.receipt.private` | `features.receipts`; mock builds show a sample reading | `receipt` |
| alt | Members only | Receipts, notes and comments stay inside the group. | `privacy.title`, `privacy.members.*` | the privacy model | `eye-off` |
| alt | Comments on every spend | Ask a question or add a detail for the group. | `comments.empty`, `comments.composer.hint` | comments | `pen-line` |
| alt | Send by link | Pay someone outside the Pot with a link they open. | `paylink.cta`, `settings.sending` | send by link | `send` |
| alt | Every spend on record | One page with every spend and its receipt, plus a CSV. | `record.title`, `record.csv.*` | the record | `list` |

**Watch-outs**
- **D, receipts.** Say no more than the app does: "read privately" is the app's own phrase. If production still returns a sample reading (`spend.receipt.private.sample`), swap D for "Members only".
- **B, the goal.** Check that "everyone gets their money back" matches what the Hub does when a Pot misses (`feed.goal.refunding` / `refunded`).
- **C, pay-ins.** The money can't be taken back (`settings.taking.on`), but the line needn't say so.
- **Order** A → D: rules, then goals, then money from outside, then receipts, so the last item leads into "Is it safe?".
- **Icons to avoid:** the `check` icon (it means approved); padlocks, shields, coins and piggy banks (03, brand §8); and chat bubbles (the pot-bubble is the logo).

---

## 4. Copy keys
Every new string goes through the jargon lint. **One exemption is needed:** add `signin.wallet.only` to `ALLOW_KEYS` in `i18n/banned.mjs`. It is the same exact-key exemption D-20 gave `landing.more.wallet`, for the same option. Every other string below passes `findBanned()` from `i18n/banned.mjs` (run on all 54 proposed strings on 2026-11-03); the builders' `lint-copy` run is the real check.

**Landing (`home.*`)**

| Key | English | Where | Note |
|---|---|---|---|
| `home.cta.start` | Start a Pot | header, hero, final card | unchanged; now opens the dialog |
| `home.cta.demo` | See a demo | hero, final card | **changed** (was "Try the demo") |
| `home.nav.signin` ⓟ | Sign in | header | new |
| `home.final.cta.start` | — | — | **retire**: the final card uses `home.cta.start` |
| `home.more.eyebrow` ⓟ | And more | §3 | |
| `home.more.title` ⓟ | What else a Pot can do | §3 H2 | |
| `home.more.trust.title` / `.body` ⓟ | Trust grows / People who spend well get a bigger instant limit. | slot A | |
| `home.more.goal.title` / `.body` ⓟ | All or nothing / Set a goal and a date. Miss it, and everyone gets their money back. | slot B | |
| `home.more.payin.title` / `.body` ⓟ | Ask anyone to pay in / Share a link or QR code. Anyone can pay into the Pot without joining. | slot C | |
| `home.more.receipts.title` / `.body` ⓟ | Scan receipts / Snap a receipt and Pot fills in the amount. It's read privately. | slot D | |
| `home.more.privacy.*`, `.comments.*`, `.sendlink.*`, `.record.*` ⓟ | as in §3.6 | alternates | only the four used ship |

**The dialog and the signed-out screen (`signin.*`; existing keys reused where the words are the same)**

| Key | English | Note |
|---|---|---|
| `signin.start.title` ⓟ | Sign in to start your Pot | start mode |
| `signin.start.body` ⓟ | It's free. Next you name it, pick its rules and share one link. | start mode |
| `signin.title` | Sign in to Pot | unchanged; back and app modes |
| `signin.back.body` ⓟ | Use the same way as last time. New to Pot? This sets you up too. | back mode |
| `signin.app.body` ⓟ | Sign in to see your Pots and anything waiting for you. | app mode |
| `signin.google` | Continue with Google | unchanged |
| `landing.more.email` | Continue with email | reused |
| `signin.or` | or | unchanged |
| `landing.more.wallet` | I have a NEAR wallet | reused (allowlisted) |
| `signin.wallet.only` ⓟ | Continue with a NEAR wallet | wallet-only builds; **add to `ALLOW_KEYS`** |
| `signin.google_later` ⓟ | Google sign-in isn't on in this test version yet. | wallet-only builds |
| `signin.fine` ⓟ | Sign-in opens in a new window. For now, Pot runs on demo dollars (test money). | every mode |
| `signin.demo.lead` ⓟ | Not ready yet? | demo row |
| `signin.demo` | See a demo | **changed** (was "Try the demo") |
| `signin.demo.hint` ⓟ | Two minutes, a made-up trip, no sign-in. | demo row |
| `signin.home` | What is Pot? | unchanged; signed-out screen |
| `signin.step.google` ⓟ | Finish with Google in the new window | stepper ① |
| `signin.step.window` ⓟ | Finish in the sign-in window | stepper ① (email) |
| `signin.step.wallet` ⓟ | Confirm it's you in the window that opened | stepper ① (wallet) |
| `signin.step.again` ⓟ | Can't see it? Open it again | under ① |
| `setup.progress.1` · `setup.time` · `setup.slow` | Setting up your Pot account… · Usually under 10 seconds · This is taking a little longer than usual… | reused, stepper ② |
| `signin.step.session` ⓟ | Signing you in… | stepper ② (wallet) |
| `signin.step.done` ⓟ | Signed in | ① when done |
| `signin.step.start` ⓟ | Name your Pot and pick its rules | stepper ③, start mode |
| `signin.step.back` ⓟ | Open your Pots | stepper ③, back mode |
| `signin.cancel` ⓟ | Cancel | waiting |
| `signin.failed` ⓟ | Sign-in didn't work, and nothing changed. Try again, or pick another way. | error (replaces `auth.failed`'s "…another way to join" here) |
| `signin.timeout` ⓟ | The sign-in window closed before it finished. Nothing changed. Try again. | error |
| `signin.wallet.none` ⓟ | We couldn't load the list of sign-in apps. Try again in a minute. | error |
| `auth.popup_blocked` · `auth.service_down` · `signin.wallet.error` · `signin.wallet.limited` · `setup.error.relayer` · `setup.error.retry` | (existing) | reused |
| `signin.offline` ⓟ | You're offline. Connect to sign in. | offline |
| `signin.inapp.title` ⓟ | Open Pot in {browser} to sign in | in-app |
| `signin.inapp.body` ⓟ | Google sign-in doesn't work inside {appName}. | in-app, builds with Google |
| `signin.inapp.body_any` ⓟ | Signing in works best in {browser}, not inside {appName}. | in-app, wallet-only builds |
| `landing.inapp.open` · `landing.inapp.copy` | Open in {browser} · Copy link | reused |
| `signin.inapp.here` ⓟ | Or continue here | in-app |
| `signin.unsupported_browser` | This browser can't keep a Google or email sign-in safe. Try another browser, or turn off private browsing. | **changed** (it sent people to "the demo") |
| `signin.none.title` ⓟ | Sign-in isn't open here yet | nothing available |
| `signin.none.body` ⓟ | This version of Pot doesn't take sign-ins yet. You can still see how it works. | nothing available |
| `signin.nojs` ⓟ | Pot needs JavaScript to sign in. Turn it on, or see a demo first. | `<noscript>` on app routes |
| `signin.body` · `signin.more` | — | **retire** (and drop `signin.body` from `JoinCta.tsx`) |

**The tour (`tour.*`, linted)**

| Key | English | Note |
|---|---|---|
| `tour.end.note` | Next, you sign in and set up your Pot. For now it runs on demo dollars (test money). | **changed**: "You'll sign in with Google" is untrue on the hosted build. The story captions (`tour.s4`, `tour.end.l2`) keep the Google story. |

---

## 5. Open questions (defaults in brackets)

| # | Question | Default |
|---|---|---|
| 1 | The demo's label: "See a demo", or keep "Try the demo"? | [See a demo]: it says "look, it isn't the real thing", and 80 px fits the hero from 360 |
| 2 | Header: replace [Try the demo] with "Sign in" + [Start a Pot] (secondary)? | [Yes]: the main action stays reachable while scrolling. *Could:* fade the header's [Start a Pot] in only once the hero's button has scrolled away, with a CSS scroll timeline like 04's hairline, always visible where that's unsupported or under reduced motion |
| 3 | Wallet-only builds: allowlist `signin.wallet.only` ("Continue with a NEAR wallet") as the marigold, or reuse "I have a NEAR wallet"? | [Allowlist the one exact key] |
| 4 | Google button: the marigold with the G on a white disc (01's default, today's `GoogleMark`), or Google's "light" theme (our secondary) given "Don't put the… 'G' icon on a colored background other than light, dark, or neutral"? | [The marigold with the disc]; switch to light if the design lead reads the rule strictly |
| 5 | Wallet-only builds: show "Google sign-in isn't on in this test version yet."? | [Yes]: the landing promises Google sign-in four times, and judges will look for it |
| 6 | Legal line: none until a `/terms` page exists? This also applies to `landing.legal`'s "By joining you agree to the Terms". | [None; fine print only] |
| 7 | Mock builds: simulated sign-in options (they sign in as Maya, with no network), so design review and mock e2e can walk Start → intro → Create? | [Yes, like `JoinCta`'s mock Leo], plus a mock-only `?signin_preview=` |
| 8 | "What else": between Try the rules and Trust, or after Trust? | [Before Trust] |
| 9 | The final card: rename [Start your Pot] to [Start a Pot] and scope the tests by region? | [Yes] |
| 10 | Side note, out of scope: `home.footer.preview` says "nothing here is real", but Pots are real and only the money is test money. | Reword to "Preview: Pots use test money (demo dollars) for now, so no real money is at risk." |

**Not in scope:** the hero and problem visuals, landing motion beyond the dialog, the video, mainnet, deploying, the story and number fixes ("$300 needs one OK", the D-61 wording, the Hub 1.2 facts), and the invite landing's own CTA stack (ux-spec §4.1). The invite landing should later adopt §2.6's waiting and error states through the shared component.

---

## 6. References
**Mobbin** (10 searches, all images viewed; patterns only, since Pot's look comes from its brand):
- **Sign-in:** the 21 rows of §2.2.
- **Feature block:** the 9 rows of §3.2.
- **CTA hierarchy:**

| Site | Section | Borrow | Leave |
|---|---|---|---|
| Steep | [Get started for free](https://mobbin.com/sites/sections/3065bb4b-1544-41d4-9d31-86cb701d02d8) | The final call to action repeats the hero's pair: [Get started] and [Request a demo →], with "Play around with it first" as the reassurance | The illustration |
| Front | [Final CTA + header](https://mobbin.com/sites/sections/b85a68a5-4c98-44a1-8da2-6293074ea801) | The header carries "Sign In" (text) and the main action; the final card repeats [Try for Free] and [Request a Demo] | Two filled buttons in one view |
| TheyDo | [Hero](https://mobbin.com/sites/sections/a97d0693-1eea-451d-949d-df1415a9f6f0) | [Sign in] in the header beside the main action, then the hero's primary + "Request a demo" outlined | — |
| Maze | [Hero](https://mobbin.com/sites/sections/26e3e993-5f8b-43a3-82a3-92893f3150b4) | A primary + "Request a demo" pair centred under the H1 | "Contact sales" as the header's filled button |
| Linear | [Header](https://mobbin.com/sites/sections/192414ab-334b-4a7f-a278-1d4cf5bdc095) | "Log in" as text plus one small button: restraint | The dark UI |
| Figma | [Header](https://mobbin.com/sites/sections/5f84e90e-f4ae-48e5-bdb0-9b0b9b303f03) | "Log in" outlined next to the main action | "Contact sales" |
| Customer.io | [Hero](https://mobbin.com/sites/sections/011c0409-bd9a-478c-9e35-0267c8914aef) | "Sign in" as text in the header, and a row of short reassurances under the hero's buttons (ours: `home.hero.reassure`) | The demo as the filled button |
| Calendly | [Hero](https://mobbin.com/sites/sections/5092c090-266f-4bce-b5f5-1475a6ba3d29) | Nothing | Sign-in buttons in the hero itself: the design lead wants one popup |
| Tines | [CTA card](https://mobbin.com/sites/sections/8ecbe226-92d2-42ab-bf23-a8bf9e1d930a) | "Already have an account? Log in." as one quiet line: the idea behind the sign-in mode | The scattered-shapes background |

**Web:**
- [Google Identity: Sign in with Google branding guidelines](https://developers.google.com/identity/branding-guidelines):
  - approved labels ("Continue with Google");
  - the G "must be the standard color version… and appear on a white background";
  - "Don't put the standard color Google 'G' icon on a colored background other than light, dark, or neutral";
  - the light theme is `#FFFFFF` fill, `#747775` 1 px stroke and `#1F1F1F` text;
  - "displayed at least as prominently as other third party sign-in options".
- [Google Developers Blog: OAuth in embedded webviews](https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/): Google blocks sign-in inside embedded webviews (`disallowed_useragent`), which is why in-app browsers get "Open in Safari" first.
- [NN/g, Bottom sheets](https://www.nngroup.com/articles/bottom-sheet/): a visible Close; support Back to dismiss; don't make users track "the rapidly multiplying stack of overlays".
- [Navattic, State of the Interactive Product Demo 2025](https://www.navattic.com/report/state-of-the-interactive-product-demo-2025):
  - the most common demo CTA texts are "Take a tour" (65 uses, 52.3 % engagement), "Explore product" (25, 56.4 %) and "Watch or try demo" (25, 52.6 %), "within a similar range";
  - "73% of top performing demo CTAs were visible above the fold".

  So the label is about clarity, not a magic word, and the hero is the right home.
- [Navattic, How to increase conversions for interactive demos](https://www.navattic.com/blog/increase-conversions-for-interactive-demos): demos higher on the page had 3.5× the engagement of those below the fold; the tour CTA sits beside the signup ("Take a short tour").
- [Privy, Configuring appearance](https://docs.privy.io/basics/get-started/dashboard/configuring-appearance): the default title is "Log in or sign up"; the login message is "100 or less" characters; ordering is configurable, with "overflow items (after the first four) going to a secondary page"; `showWalletLoginFirst` picks web2 or web3 first.

All Mobbin links are the canonical `mobbin.com` pages; their image links expire after 30 days.
