# UX research brief and reference flows
> Owner: product-ux. Last verified: 2026-10-21. Legend: ✅ verified · 📄 docs-only · ⚠️ unverified/conflicting
> For UI facts, ✅ means directly observed in a Mobbin capture (linked). The spec built from this file is [../plan/ux-spec.md](../plan/ux-spec.md); the test script is [../plan/hallway-test.md](../plan/hallway-test.md).

## TL;DR
- **The make-or-break moments** are (1) the invite landing → "You're in" (target ≤ 4 taps, median < 30 s) and (2) "Approved by Pot rules" for a small reimbursement. Everything else serves those two.
- **Show the Pot before asking for login.** Every converting competitor lets invitees see the group first (Settle Up, Cash App, PayPal, Splitwise Itemize). Then merge sign-in and accept into one button ("Sign up with Google and accept", Optimal Workshop ✅).
- **In-app browsers break Google sign-in.** Google blocks OAuth in embedded WebViews (WKWebView / Android WebView) with `403 disallowed_useragent`, enforced since Sep 30, 2021. 📄 Links opened inside Instagram, Facebook/Messenger and similar apps will fail at "Continue with Google". The landing must detect this and lead with "Open in Safari/Chrome" (Email stays available).
- **The biggest open UX risk is signing friction, not visuals.** The in-progress auth spike source shows each NEAR Auth signature goes through `requestDelegateActionSignature`, i.e. a **NEAR Auth popup per action**, with an MPC-derived key. It also notes "the SDK keeps tokens in memory, so a reload = logged out". The shared testnet client only allows `http://localhost:3000` as a callback. ⚠️ (spike comments, not results; see kb/near-auth.md). Any of these would turn "one-tap approve" into tap + popup + wait. The spec designs both paths. **→ auth**
- **Timing reality:** NEAR has 600 ms blocks and ~1.2 s finality (since May 2025). ⚠️ (secondary) But an auto-approved spend crosses several contracts (relayer → Rulebot → DAO add_proposal → vote → transfer → USDC). Treat the plan's "1.2 s Checking Pot rules" as a **minimum display time**, not a promise. Drive the UI from real states. **→ contracts / relayer** for measured block counts.
- **Sputnik facts that shape copy:** statuses are `InProgress, Approved, Rejected, Removed, Expired, Moved, Failed`. The default `proposal_period` is 7 days. **Expired is set lazily**: the contract computes it only when someone acts, so the UI must compute "expired" from `submission_time + proposal_period`. `Failed` = "failed when finalizing… allowed to re-finalize", the natural state for "approved, but the Pot was short". ✅ (source @ `5434a59`)
- **Install is a bonus, not a gate.** The app runs fully in a Safari tab, and installing only adds push. On iOS 26 the path is "More (•••) → Share → Add to Home Screen → Open as Web App → Add". iOS 27 (current) labels the first button "Page Menu". 📄 Apple. Coach after the first contribution, never on the landing.
- **WCAG 2.2 AA items with teeth for Pot:** 2.5.8 target ≥ 24×24 (we use 48), 2.4.11 focus not hidden under sticky bars or sheets, 2.5.7 a non-drag alternative for drawers, 3.3.8 no memory tests at login (OAuth or passkey; OTP paste allowed), 4.1.3 status messages via live regions, **3.3.4 financial actions must be reviewable/confirmable**. That rules out approving money straight from a notification button. 📄 W3C

## Plan check

| Original plan claim (C2/C5) | Status | Note |
|---|---|---|
| Invite onboarding "Target: 4 taps" | ⚠️ at risk | Achievable (link → Join with Google → account chooser → auto-join) only if NEAR Auth needs no extra consent screen and no per-action popup during join. → auth. |
| P-1 "Link to signed in in 3 steps or fewer, median under 30 s" | ⚠️ | Consistent with the above. The 3-8 s "Setting up your Pot account" is an estimate. → relayer. |
| "Approve: notification → sheet → one tap → optimistic" | ⚠️ at risk | One tap holds only if votes don't need a NEAR Auth popup (e.g. a scoped session key). Otherwise it's tap + confirm in popup. → auth / relayer. |
| "1.2 s 'Checking Pot rules' shimmer, then 'Approved by Pot rules. $84 sent to you'" | ⚠️ | Keep 1.2 s as a minimum for the beat. Split "Approved" (rule decision) from "Sent" (USDC arrived), because they land at different blocks. |
| iOS: "3-step coach mark in iOS Safari after the first contribution" | ✅ agree + update | Apple's steps are 5 taps (More/Page Menu → Share → scroll → Add to Home Screen → Add), and **iOS 27 is current** (Apple guide lists iOS 27 and 26). Plan text says "iOS 26". |
| "Android Chrome has `beforeinstallprompt`" | 📄 | Use our own "Install Pot" button calling `prompt()`. Menu wording varies by Chrome version. → web. |
| "48 px minimum touch targets" | ✅ exceeds 2.5.8 | WCAG minimum is 24×24 CSS px. Keep 48. |
| "status changes via `aria-live="polite"`" | ✅ | 4.1.3. Use `role="alert"` (assertive) only for failures that need action. |
| Login "Google, Apple, Email, Passkey… 'I have a NEAR wallet' in small text" | ✅ with order change | Show two platform-ordered buttons + "More ways" (email, passkey, NEAR wallet). Microsoft reports passkeys sign in at ~98% success vs 32% for passwords (May 2025). 📄 Offer "Use Face ID next time" after the first win, not as the first choice. |
| Vocabulary "Vote / council → Approve / organizers" | ⚠️ adjust | All members approve by majority in the MVP policy, so "organizers" misleads. Use "approvals" / "the group". Keep "organizers" for a future Club preset with an organizer role. |
| C1 "instant €84 reimbursement" vs C5/C8 "$84" | ❌ inconsistent | The Pot holds USDC, so every amount is **$**. Use $ everywhere (the demo is a Lisbon trip, so say "groceries $84"). |
| Votes "3-of-5" (C1), "2 of 3" (C8), "0 of 3" (C5 flow 3) | ⚠️ inconsistent | Fine if member counts differ, but pick one demo cast (e.g. 3 members → "2 of 3"). Also decide whether the requester's own approval counts (see open questions). |

## Reference

### Research brief
**Goal:** reach a design that a non-crypto person can use to join a Pot and add money in < 2 minutes, and that makes the rules-based instant approval feel trustworthy and delightful.

**Research questions:**
1. Does the invite landing make clear what Pot is, who invited me and what happens to my money, within 5 s?
2. Which login option do people pick, and does any step make them hesitate (Google consent, "Setting up your Pot account")?
3. Do people understand "Approved by Pot rules" and trust it? Who do they think controls the money?
4. Do people understand "Your share" / "You'd get back" and the pro-rata close?
5. Is any word on the main paths confusing (target: zero crypto words noticed)?
6. Will people install to the Home Screen when coached, and why or why not?

**Hypotheses (to falsify in the hallway test):**
- H1: ≥ 4 of 5 people join and add money in < 2 min without help.
- H2: ≥ 4 of 5 people can say in their own words "small spends are automatic, big ones need the group" after one instant reimbursement.
- H3: showing the Pot's real balance and avatars on the landing raises trust more than a feature list does (compare comments; no A/B at n=5).
- H4: people expect "Decline" to need a reason. We will see if they look for one.

**Assumptions the spec rests on (each routed to an owner):**

| Assumption | Owner | If false |
|---|---|---|
| NEAR Auth login works from the hosted Vercel origin on testnet (not only `localhost:3000`) | auth | Real social login can't run on the deployed URL. The landing shows the labelled demo login; the hallway test uses the prototype or localhost. |
| A session persists across reloads/relaunches of the installed PWA | auth | Every notification tap needs re-login. Design "Welcome back" one-tap re-auth plus read-only cached view. |
| Votes and requests can be signed without a per-action popup (scoped key) | auth / relayer / contracts | Add an explicit "Confirm it's you" step (+1 tap, +3-10 s) to Approve and Spend. |
| "Add money" (`ft_transfer_call` needs 1 yocto) needs full-access signing | relayer | Add money always shows the confirm step. Design it as the normal path. |
| Join = Rulebot auto-approves `AddMemberToRole` within ~2-4 s | contracts / sputnik | Keep "Adding you to Lisbon Trip…" with the time-out copy. |
| Invite link is multi-use (rotatable, expiring) | contracts | With one-time codes, the group-chat flow needs one link per person (worse). |
| Request notes stay off-chain (or are hashed) | contracts | Notes are public. Add "Visible to anyone on the public ledger" under the note field. |

### Personas (from C1, sharpened for testing)

| Persona | Job to be done | Must feel | Fails if |
|---|---|---|---|
| **Maya, 28, trip organizer** | "Get everyone's money in one place before the trip so I stop fronting and chasing." | In control without being the bank | She has to explain crypto; friends ask "is this safe?" |
| **Leo, 31, casual member** | "Pay my share in under 2 minutes and know I'll get leftovers back." | Effortless, fair | He sees "wallet", "gas", "seed", or has to install anything first |
| **Priya, 40, club treasurer** | "Run dues and small spends transparently so I'm not personally liable." | Protected by rules | Every $12 purchase needs a meeting; the rules aren't visible to members |

### Reference library by topic
Concrete references only (app, screen, pattern, why it matters). Links go to Mobbin captures.

**1. Create a group / Pot**

| App | Screen / flow | Pattern | Why it matters for Pot |
|---|---|---|---|
| Cash App | [Creating a new pool](https://mobbin.com/flows/b65be81e-03ff-4275-9334-83aa5c0cde6a) | "Start a $1 pool — For [Noodles] — [Start]": a one-field sheet; the pool page has a goal ring, [Add people] [Contribute] [Close pool] | Minimal create. The Pot exists after typing a name; rules come from the preset. |
| PayPal | [Creating a pool](https://mobbin.com/flows/8eb3e694-ad23-4997-bcf8-e8af208428ff) | "This is what others will see, so make it pop!" cover image, optional goal, "Accept contributions until" date, terms | The invitee's landing is the creator's preview, so say so. Optional deadline. |
| Plum | [Creating a pocket](https://mobbin.com/flows/56b5766b-0d7e-4e27-ac58-fbf5e00a8629) | Color + name + "I have a goal" toggle → "0% of £500 goal" | Goal toggle, not a required field. |
| Vivid | [Pocket sharing](https://mobbin.com/flows/1e4df5ae-5acc-4dec-9024-0ffa7ebfb00c) | Sharing blocked for non-customers: "Unable to share the Pocket…" | Anti-pattern: never wall the invitee. |

**2. Invite via link + join landing**

| App | Screen / flow | Pattern | Why it matters |
|---|---|---|---|
| Splitwise | [Copying a link](https://mobbin.com/flows/211ed153-bdc6-4a16-9688-adb6532a3e04) | "Anyone can follow this link to join "Winter Trip". Only share it with people you trust." [Share] [Copy] **[Change link]** | Multi-use link with rotation and a trust note. Matches the group-chat use. |
| Discord | [Copying an invite link](https://mobbin.com/flows/23084131-546e-400d-a8a0-1be09c96d94b) | "Invite links expire in 24 hours"; "Link Copied!" toast | State expiry at share time. |
| yope | [Invite a friend](https://mobbin.com/flows/524e5cf4-c1a0-4530-9c75-bd377180e53b) | Invite card: QR + short link + share targets (WhatsApp, Instagram, Messages) | Share sheet layout for Create step 3. |
| Abode | [Joining an Abode](https://mobbin.com/flows/844af9dc-5327-4704-89f0-4d230768b828) | "You're about to join Crunchy Coven" before confirming | Name the Pot on the confirm button ("Join Lisbon Trip"). |
| Optimal Workshop (web) | [invite screen](https://mobbin.com/screens/1b067f3a-09be-49d4-9175-9d165a543250) | "Sign up with Google and accept" | **Merge auth and accept** (saves a tap). |
| Charma (web) | [Accept Invite](https://mobbin.com/screens/786de17e-9ed0-493a-be6d-4617b9b9e604) | "Sign up now to join Jane Smith and 2 others…" | Inviter + count = social proof. |
| Craft (web) | [invited to join](https://mobbin.com/screens/42661382-7e20-4ccb-8383-485465f039c2) | "invited by Alex Smith" → "You joined Alex's Family" + [Visit Team] + "Launch in Browser" | Success state that points to the next action. |
| Zillow (web) | [invite](https://mobbin.com/screens/9b3b9259-9c96-41f5-ac4f-bdd7505e8bb2) | "Accept your invitation before it expires on May 29" | Expiry shown on the landing. |
| Attio (web) | [Almost there](https://mobbin.com/screens/cc9ec9af-d3e9-4a89-af5e-0e7ddaf46779) | "Do you want to accept your invite to this workspace? [Yes, take me there] [Not yet]" | Pattern for "already signed in as X" confirmation. |

**3. Add-money keypad**

| App | Screen | Pattern | Why it matters |
|---|---|---|---|
| Cash App | [Add](https://mobbin.com/screens/2028ff73-6093-4f97-b266-0e0fb8c060fa) | "From $10 to $1,500" range under the title; giant amount; CTA above keypad | Show limits before errors. |
| Chime | [Add Money](https://mobbin.com/screens/961dbd81-565d-4108-80b2-8362e0ecc7aa) | Quick chips "$25 / $100 / $200" + direct "Add Money with Apple Pay" | Suggested-share chip first. |
| Phantom | [Add Cash](https://mobbin.com/screens/f24392bf-872c-43fb-9213-4a8c26faa2d1) | Source row ("Card ⌄") between amount and [Review] | Source picker: Pot dollars / Another wallet / Demo dollars. |
| Revolut | [Add money](https://mobbin.com/screens/847a5d85-5571-4106-ba9e-e0aeb3570577) | Source pocket chip "Main · $18" + fee note | Show what you have available. |
| Dave / Believe | [Dave](https://mobbin.com/screens/5c6eddff-962f-4afc-8898-ddb1b73b0bfc), [Believe](https://mobbin.com/screens/474eef27-f742-48d4-beed-193d513a1b38) | Disabled CTA at $0; source row | Disabled state until valid. |

**4. Request money / approve**

| App | Screen / flow | Pattern | Why it matters |
|---|---|---|---|
| Airwallex | [Request detail](https://mobbin.com/screens/94e0c040-22b2-4151-b2a9-029c5b2fcd54) | "Awaiting approval" pill; amount, description, category, "Requested by"; [Approve] [Reject ⌄] | Template for the Approve sheet. |
| Monzo | [Pay a request](https://mobbin.com/flows/13477666-9c0a-4ce8-92a4-215eec896c78) | [Review payment] / [Decline request] → confirm sheet "£10.37 Personal Account → recipient" | Review-then-confirm satisfies WCAG 3.3.4. |
| bunq | [Approving a request](https://mobbin.com/flows/dc1f3c4a-a261-4d22-a8dc-4cc31cbc296f) | ✕ / ✓ buttons; "Accept Only this Request / Always Accept Requests from this User"; "Awaiting Events" on Home | Standing approvals = Pot rules; "waiting on you" on top. |
| Cash App / Chime | [Cash App cancel](https://mobbin.com/flows/4d61635b-5e87-4135-8d4a-9b385eba3b62), [Chime cancel](https://mobbin.com/flows/695180cd-d848-4fe7-8713-06bf78c79936) | "Pending — Waiting for X to pay this request"; "Cancel this request? [Cancel request] [Never mind]" → "Canceled" | Withdraw-my-request flow and states. |
| Wise | [Paying a request](https://mobbin.com/flows/772620e8-0360-41f0-93fc-0625a06ae29e) | "REQUEST PAID" celebration with confetti ribbon | Celebration tone for approval success. |
| IKEA Home smart | [host approval](https://mobbin.com/screens/8e96567b-3163-43ed-a090-b2870f56703c) | Numbered steps + "Waiting for approval" | Explains a multi-party wait. |

**5. Activity feed with inline actions**

| App | Screen | Pattern | Why it matters |
|---|---|---|---|
| Revolut | [Group bill chat](https://mobbin.com/screens/61d50a5b-ccad-4936-9b7d-1a380171de8b) | Bills as chat bubbles ("You lent $6.74"), "Marked as paid", [Add a bill] above composer, "You are settled up" header | Chat-like money feed (Party's chat-first idea, mainstream). |
| Splitwise | [Group detail](https://mobbin.com/screens/9f36de33-ee48-426a-b3df-65cba508f5b2) | Month separators; icon + title + "You paid $200.00"; right column "you lent / you borrowed" in green/orange; FAB "Add expense" | Scannable money rows with tabular amounts. |
| Expensify | [Trip budget group](https://mobbin.com/screens/57d2e59f-70a3-443a-8fa9-fa12c19656c2) | Split cards in a group chat ("Your split $5.00") | Request cards inside the feed. |
| Grab | [Activity](https://mobbin.com/screens/2fd1cc96-aa61-42e0-bfd2-5d19cddf5178) | "Ongoing" section above "Recent"; inline actions [Rate & tip →] [Rebook →] | Pin "Waiting on you" above history. |
| Gojek | [Activity](https://mobbin.com/screens/23267089-18b8-4654-8c21-3da243b49dd2) | Inline primary action per row ([Reorder], [Chat]) | Inline [Approve] on request rows. |

**6. Settle up / close**

| App | Screen / flow | Pattern | Why it matters |
|---|---|---|---|
| Splitwise | [Group balances](https://mobbin.com/flows/d12d2ff4-5576-4a34-ae8c-9ace8b28ecac) | "Alex Smith gets back $158.00 in total" + [Remind…] [Settle up] | Per-person outcome lines. |
| Buddy | [Settle up between members](https://mobbin.com/flows/9a6f51d4-b8c6-4863-889c-c55c418a19c5) | 1. How much? 2. Who paid most? 3. Settle up, with the arithmetic shown | **Show the pro-rata math** on Close. |
| Wanderlog | [Group balances](https://mobbin.com/flows/c4eaeff5-4e7e-4a85-8e5c-e5fdacf81884) | "Your summary / Group overview" toggle; one primary [Settle up] | You-first, then everyone. |
| Monzo | [Balances](https://mobbin.com/flows/c71be1b2-24c0-4470-b64e-f13bcfa8e4ca) | "Settle up — All or part of what you owe"; "owes you £1.13 [Send reminder]"; QR + split.monzo.me invite | Nudge copy; QR invite. |
| Revolut | [Members](https://mobbin.com/screens/9cefa3b7-4c45-4770-ae2f-9d45f86f4dd4) | "Smart settle"; [Leave group]; blocker "Alex can't leave yet" | Leave/close blockers when money is pending. |

**7. Onboarding with Google or passkey**

| App | Screen / flow | Pattern | Why it matters |
|---|---|---|---|
| Phantom | [welcome](https://mobbin.com/screens/542d8942-272f-4f0b-9158-a065e4acae93) | [Continue with Apple] [Continue with Google] + small "Import Wallet" | Same hierarchy as "I have a NEAR wallet". |
| Fuse (Squads) | [welcome](https://mobbin.com/screens/474e6442-766a-4654-b299-ce4c3be03e78) | "Your money, upgraded" + [Continue with Apple] + "Recover existing wallet" | Crypto app with zero crypto words up front. |
| Finimize | [finish setup](https://mobbin.com/screens/00e6fbb7-5c8c-418d-b3fc-8d25d2fd241f) | "Sam, finish your setup" personalised | Use the inviter's context: "Leo, join Maya's Pot". |
| Uber Eats | [Creating a passkey](https://mobbin.com/flows/a3f814ac-ec88-49d5-ba21-51a60c990693) | "Passkeys are easier and more secure than passwords… log in with Face ID / Touch ID / Passcode" [Create passkey] [Not now] → "Passkey created successfully!" | Post-success passkey upsell copy. |
| Shop | [Adding a passkey](https://mobbin.com/flows/adc75341-e2bf-419c-8be1-c5172427872a) | "Adding a passkey takes less than a minute." → system sheet → "Passkey added" | Time reassurance. |

**8. Install coach marks**

| App | Screen | Pattern | Why it matters |
|---|---|---|---|
| talabat | [widget how-to](https://mobbin.com/screens/2f68839e-8d97-493c-934f-6d0a0686860b) | Numbered 3-step sheet, a mini illustration per step, [Got it] | Format for the Safari coach. |
| Duolingo | [widget prompt](https://mobbin.com/screens/02616458-9551-4f91-bd89-5c9e16046dc8) | Benefit first: "I'll cheer you on from your home screen!" [ADD WIDGET] [NOT NOW] | Lead with the benefit ("Get told when friends need your OK"). |
| Speak | [widget prompt](https://mobbin.com/screens/17284763-b897-42fc-8570-5191e5edaabb) | One-line path "long press → Edit → Add Widget → Search for Speak" + [Sounds good] [Maybe later] | Compact inline variant for the You tab. |

### Platform facts that shape the UX

| Fact | Detail | Marker |
|---|---|---|
| iOS 26 Add to Home Screen | "Tap [More], then tap Share. If your Tabs layout is Bottom or Top, tap [Share]. Scroll down… tap Add to Home Screen… Turn on Open as Web App. Tap Add." | 📄 Apple iPhone User Guide (iOS 26) |
| iOS 27 (current) | Same, but the first button is "the Page Menu button" | 📄 Apple iPhone User Guide (iOS 27) |
| iOS 26+ default | Sites added to the Home Screen open as web apps by default (toggle on) | ⚠️ MacRumors / plan source [29][30] |
| Android Chrome | `beforeinstallprompt` → `prompt()` from a user gesture; menu fallback "Add to Home screen" / "Install" (wording varies) | 📄 Chrome docs (2018 post) ⚠️ wording → web |
| Google OAuth in WebViews | Blocked for "WKWebView… Android WebView"; error `disallowed_useragent`; allowed: SFSafariViewController, Custom Tabs, default browser | 📄 Google Developers Blog, Jun 29, 2021 |
| NEAR timing | 600 ms blocks, ~1.2 s finality (May 2025) | ⚠️ The Defiant / news |
| Sputnik statuses | `InProgress, Approved, Rejected, Removed ("Interfaces shouldn't show removed proposals"), Expired, Moved, Failed ("Allowed to re-finalize")`; default `proposal_period` 7 days; expiry checked in `vote` via `submission_time + proposal_period < block_timestamp` | ✅ `near-daos/sputnik-dao-contract@5434a59` proposals.rs:19-33, policy.rs:212,393 |
| 1Click statuses | `KNOWN_DEPOSIT_TX, PENDING_DEPOSIT, INCOMPLETE_DEPOSIT, PROCESSING, SUCCESS, REFUNDED, FAILED` | 📄 NEAR Intents docs (details → kb/intents-1click.md) |
| Passkeys | ~98% sign-in success vs 32% for passwords; 8× faster than password + MFA (Microsoft, May 1, 2025) | 📄 Microsoft Security blog |
| Fonts | Inter and Geist both ship `tnum` (Geist exposes `tnum`, `zero`) | ⚠️ fontsource / lexingtonthemes |

### Design principles derived from the research
1. **Show the Pot, then ask.** Real data before login; login inside the first action.
2. **One sentence of trust everywhere money moves:** "No one can take money out alone."
3. **Every number has words:** "You put in $150", "You'd get back $142". Never a bare signed number.
4. **Rules are visible sentences** and tappable from every auto-approval.
5. **States come from the chain, beats come from design:** minimum display times for delight, real events for truth.
6. **Review before money moves** (WCAG 3.3.4): sheets show the outcome before the button; notifications open sheets and never act on their own.
7. **Install and push are earned after value.**

## Snippets
None (no code in Phase 0). Copy lives in plan/ux-spec.md §5.

## Gotchas & failure modes

| Risk | Effect on UX | Mitigation in spec | Owner |
|---|---|---|---|
| Per-action NEAR Auth popup | "One tap" becomes 2-3 taps + 3-10 s; popups may be blocked if not opened inside the user gesture | `ConfirmStep` designed as a first-class step; build the payload before the tap (spike comment) | auth |
| Tokens in memory only | Logged out after reload, PWA relaunch or notification tap | Read-only cached view + "Welcome back, continue with Google" | auth |
| Shared testnet client callback = localhost:3000 | Social login can't run on the hosted URL | Labelled demo login on hosted builds; own client id if possible | auth |
| In-app browsers | Google 403 `disallowed_useragent`; passkeys unavailable; no Add to Home Screen | Detect → "Open in Safari/Chrome" first; Email as fallback | web / auth |
| One-time invite codes | Group-chat link works for one person only | Multi-use rotatable link | contracts |
| Lazy `Expired` | The chain says InProgress after the deadline | Compute expiry client-side; show "Expired" | contracts / web |
| `Failed` after approval (insufficient Pot balance) | Money promised but not sent | "Approved — waiting for money in the Pot" + retry | contracts |
| Public memos | "Rent for Leo's girlfriend" visible forever | Off-chain notes or a visibility hint | contracts |
| Latency of the auto-approve chain | The 1.2 s beat finishes before the money is real | Two-stage success: "Approved" then "Sent" | relayer / contracts |

## Costs, limits, latencies

| Moment | Budget (design target) | Basis |
|---|---|---|
| Invite landing first meaningful paint (4G) | ≤ 1.5 s (SSR) | target |
| Google OAuth round-trip | 5-10 s | ⚠️ estimate; measure in the auth spike |
| "Setting up your Pot account" | 3-8 s (plan) | ⚠️ estimate → relayer |
| Join (Rulebot approves AddMemberToRole) | ≤ 4 s | ⚠️ estimate → contracts |
| Instant reimbursement: "Checking Pot rules" | min 1.2 s display; switch at the real decision; "Still checking…" at 6 s; "Taking longer than usual" at 15 s | design + ⚠️ chain |
| Vote approval reflected | optimistic < 100 ms; reconcile ≤ 5 s | target |

## Open questions / needs a human
- **→ auth:** (1) Does every signature need a popup, and can votes/requests use a scoped function-call key? (2) Session persistence in an installed iOS PWA. (3) Can testnet use our own client id with the Vercel origin? (4) Is there an extra Auth0 consent screen on first Google login? (5) Do Google and passkey map to the same account, or risk duplicates?
- **→ relayer:** measured time for account setup (create + fund + USDC storage) and for a relayed `ft_transfer_call`.
- **→ contracts / sputnik:** invite multi-use + expiry; requester's own approval (auto-vote?); leave-before-close; memo privacy; retry after `Failed`; proposal period for Trip (suggest 72 h, not 7 days).
- **→ web:** in-app browser detection list; Android install menu wording; whether iOS 26/27 Safari UA reveals the version for picking the "More" vs "Page Menu" illustration.
- **→ intents:** what happens if a user sends after the quote deadline; refund address UX for `INCOMPLETE_DEPOSIT`.
- **Cerasela:** name; font (Inter vs Geist); whether to show Apple or Google first on iOS; the demo cast and amounts.

## Sources
- https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/: embedded-webview OAuth block, Sep 30, 2021. Accessed 2026-10-21.
- https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/26.0/ios/26.0 and …/27.0/ios/27.0: Add to Home Screen steps ("More" vs "Page Menu" button). Accessed 2026-10-21.
- https://www.macrumors.com/how-to/save-safari-bookmark-web-app-iphone-home-screen/ (via search): iOS 26 web-app default. Accessed 2026-10-21. ⚠️
- https://developer.chrome.com/blog/a2hs-updates: `beforeinstallprompt`, `prompt()`, menu entry (2018). Accessed 2026-10-21.
- https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/: new WCAG 2.2 SCs and summaries. Accessed 2026-10-21.
- https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html: SC 3.3.4 text. Accessed 2026-10-21.
- https://github.com/near-daos/sputnik-dao-contract/blob/5434a59dec23ee0c49df8c8c4350c208a7e75b0b/sputnikdao2/src/proposals.rs and …/policy.rs: ProposalStatus, default proposal_period, expiry check. Accessed 2026-10-21.
- https://docs.near-intents.org/api-reference/oneclick/check-swap-execution-status: 1Click status enum. Accessed 2026-10-21.
- https://thedefiant.io/news/blockchains/near-protocol-launches-600ms-blocks-1-2-second-finality-unlocking-defi-use-cases-490247d4 (via search): 600 ms / 1.2 s. Accessed 2026-10-21. ⚠️
- https://www.microsoft.com/en-us/security/blog/2025/05/01/pushing-passkeys-forward-microsofts-latest-updates-for-simpler-safer-sign-ins/ (via search): 98% vs 32%, 8× faster. Accessed 2026-10-21.
- https://fontsource.org/fonts/geist/about and https://lexingtonthemes.com/blog/geist-opentype-features (via search): Geist `tnum`. Accessed 2026-10-21. ⚠️
- ../spikes/near-auth/src/main.ts and index.html (in progress, owned by auth): popup signing, in-memory tokens, localhost:3000 callback. Read 2026-10-21. ⚠️
- Mobbin captures linked inline above. Accessed 2026-10-21.
