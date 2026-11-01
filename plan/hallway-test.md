# Hallway test: "join and pay in under 2 minutes"
> Drafted by product-ux on 2026-10-21 for **Cerasela (P2)** to run. Plan refs: the original plan C3 (Phase 0: "5 hallway tests with non-crypto friends (join and pay in under 2 minutes)") and C7 (day 7: "Test with 3 non-crypto friends").
> Design under test: [ux-spec.md](ux-spec.md). Hypotheses: [../kb/ux-research.md](../kb/ux-research.md) (H1-H4).

## 0. Two rounds, one script

| Round | When | What people use | n | Main question |
|---|---|---|---|---|
| **A** | Oct 27-31 (Phase 0: **no product code**, so this is a clickable Figma prototype) | Figma prototype on their own phone (share link / QR), with **simulated delays**: 6 s "Setting up", 1.2 s "Checking Pot rules" | 5 | Is the flow understandable and fast enough? Do the words work? |
| **B** | Nov 7 (MVP freeze, C7 day 7) | Testnet build on their phone, demo dollars | 3 (new people, if possible) | Do real latency, login and signing steps keep join + pay under 2 min? |
| C (optional) | Nov 11 | Same build, 1 VoiceOver user or Cerasela with VoiceOver | 1 | Join and approve with a screen reader (ux-spec §8) |

Round B depends on the auth question: the shared testnet NEAR Auth client allows only `localhost:3000` as a callback. If no hosted login exists by Nov 7, run round B with the labelled demo login and time the auth step separately on a laptop. → auth

**Rev 3 (review):** round B runs on a dedicated preview deployment with the preview-only **dev session** on ([api-spec.md](api-spec.md) §2.1, `POST /api/session/dev`, task B-04). Participants tap [Join with a test account] and type a first name instead of Google, so T1 measures everything except the Google screens; time Google sign-in separately on `localhost:3000`. The demo personas aren't used: participants join a real pre-Leo Pot (§10).

## 1. Goals and hypotheses
- **Primary metric:** T1 (join) + T2 (add share) completed **unassisted in < 2:00** by **≥ 4 of 5** (H1).
- H2: after T4, ≥ 4 of 5 explain in their own words that "small spends are automatic, big ones need the group".
- H3: the invite landing (real Pot, inviter, avatars, balance) is trusted. Nobody thinks Maya alone controls the money.
- H4: people look for a reason field when declining.
- Secondary: zero crypto words noticed on the main paths; tap counts within ux-spec §6 budgets (join ≤ 4 taps, add ≤ 2-3 taps).

## 2. Participants (5 for A, 3 for B)
**Recruit:** friends or friends-of-friends who
- **have never used a crypto wallet** (buying once on an exchange and forgetting it is OK; note it);
- use a smartphone daily;
- have shared trip or group costs in the last 12 months.

**Mix:**
- ≥ 2 iPhone and ≥ 2 Android;
- ≥ 1 person aged 35+;
- ≥ 1 person who usually organizes trips (Maya-like);
- ≥ 1 person who "just pays their share" (Leo-like).

**Exclude:** people working in crypto, fintech, product or UX; anyone who has seen Pot.

**Thank-you:** coffee, beer or a small gift. **No money changes hands** in the test (prototype, or testnet demo dollars only).

## 3. Setup
- **Roles:** facilitator (Cerasela) and note-taker (P1 or a friend). The facilitator also plays **Maya** from a second phone or laptop: sends the invite, triggers the $300 request.
- **Devices:** the participant's own phone in their usual browser (that is where Safari vs in-app browser problems show up). Keep one spare iPhone and one spare Android.
- **Invite delivery:** send the link **in a real chat app** the participant uses (WhatsApp / iMessage / Telegram). Note which one, because in-app browsers change the flow.
- **Accounts:**
  - Round A: login is simulated.
  - Round B: offer a **test Google account** (pre-signed-in on the spare phone) or let them use their own if they are comfortable. Testnet only; no personal data is stored beyond what NEAR Auth needs. → auth
  - Round B (rev3): on the hosted preview, participants use [Join with a test account] (dev session, a first name only, no Google). The test Google account is only for timing Google sign-in on `localhost:3000`.
- **Recording (with consent):** iOS Control Center / Android screen recorder **plus** the note-taker's stopwatch. Taps are counted from the recording afterwards.
- **Materials:** this script, scenario cards (§5), the observation sheet (§7, one per person), and an SEQ card (1-7 scale).
- **Before each session:**
  1. Reset the prototype or demo state (Pot = Lisbon Trip, $300 of $450, Maya + Sam). Round B: switch to the next fresh pre-Leo Pot from §10 (rev3).
  2. Check recording works.
  3. Phone at ≥ 50% battery, on their normal network.
  4. Notifications enabled for the chat app.

## 4. Facilitator script (≈ 20-25 min)
**Intro (2 min). Read it as written:**
> "Thanks for helping. We're testing an app, not you. There are no wrong answers, and if something is confusing, that's exactly what we need to find. Please think out loud: say what you're looking at, what you expect and what you're unsure about. I may not answer questions during the tasks, because I want to see what you'd do on your own. It's all pretend money. Is it OK if we record the screen and our voices? We'll delete the recording after we've taken notes."

**Warm-up (2 min):**
- "Tell me about the last time you split costs for a trip or a group. How did you do it? What was annoying?"
- "Have you ever used a crypto wallet or bought crypto?" (record the answer)

**Rules during tasks:**
- Read each scenario card aloud, hand it over, and say "Start whenever you're ready".
- Allowed prompts only: "What are you thinking?", "What would you do next?", "What do you expect to happen?"
- If someone is stuck for > 60 s or asks for help twice, give the smallest possible hint and mark the task **Assisted**.
- Never use the words wallet, crypto, blockchain, approve rules or vote unless they use them first.

## 5. Tasks
Timing starts at the first touch after reading the card and ends at the stated end condition.

| # | Scenario card (read aloud) | End condition | Success | Targets (ux-spec §6) | Observe |
|---|---|---|---|---|---|
| **T1 Join** | "You're going to Lisbon with Maya and Sam. Maya just sent this to your group chat. Do whatever you'd normally do with it." | "You're in!" visible | Unassisted join | ≤ 4 taps · ≤ 45 s (median < 30 s) | Do they read the landing? Which login do they pick? Does the in-app browser block them? Reaction to "Setting up your Pot account" (6 s) |
| **T2 Add share** | "Everyone's putting in $150. Add your share." | "Added. Lisbon Trip now has $450." | Correct amount, unassisted | ≤ 3 taps · ≤ 45 s · **T1+T2 < 2:00** | Do they notice the suggested $150? Do they understand "Demo dollars (test money)"? Any hesitation at the source choice or confirm step? |
| **T3 Read the Pot** (no tapping) | "Without tapping anything: how much is in the Pot? How much did you put in? If the trip ended today, how much would you get back?" | Three answers | ≥ 2 of 3 correct | ≤ 30 s | Can they read "Your share" vs "You put in"? Are the hero and goal bar clear? |
| **T4 Get money back** | "At the supermarket you paid $84 for everyone's groceries. Get that money back from the Pot." | "$84 sent to you" | Unassisted | ≤ 6 taps · ≤ 45 s | Do they find Spend? Do they read the "approved instantly" preview? Reaction to the 1.2 s check and the celebration. **Ask afterwards:** "Why do you think that was approved straight away?" (H2) |
| **T5 Respond** | (Facilitator, as Maya, sends a $300 boat-trip request.) "Your phone just buzzed. Take a look." (Round B, rev3: push only arrives from Nov 10, so say "Maya just asked the group for something. Take a look.") | Approved or declined | Decision made, understanding shown | ≤ 2-3 taps · ≤ 30 s | Do they find it (push, Requests badge, or feed)? Do they read "Pot after this: $66"? **Ask:** "What happens now that you've approved?" If declining, do they look for a reason field? (H4) |
| **T6 Close (comprehension)** | Show the Close preview. "Maya wants to end the Pot. What would happen to the money?" | Explanation | Mentions "split by how much each person put in" or similar | ≤ 45 s | Can they read the refund table? Is the rounding note understood? |
| **T7 Home Screen** (optional) | "You'll use this all trip. Put it on your Home Screen so it's easy to find." | Icon on Home Screen (B), or the coach steps understood (A) | Completed | ≤ 60 s | Which step fails (iOS 26 "•••" / iOS 27 "page menu", Share, scroll, "Open as Web App")? |

**Trust and jargon checks** (after T5, 2 min):
1. "Who can take money out of this Pot?" (correct: no single person; small spends follow the rules, bigger ones need the group)
2. "Could Maya run off with the money?" (watch for H3 failures)
3. "Did you see any word you didn't understand or that felt odd?" (list every word)
4. "How comfortable would you be putting $150 of real money in here?" (1-5)

## 6. Metrics and decision rules

| Metric | Definition | Target / rule |
|---|---|---|
| Completion | U = unassisted, A = assisted, F = failed | T1, T2, T4: ≥ 4/5 U |
| Time on task | stopwatch, first touch → end condition | T1+T2 < 2:00 for ≥ 4/5; report median and max |
| Taps | deliberate taps counted from the recording | within ux-spec §6 budgets (join ≤ 4, add ≤ 3, reimburse ≤ 6, approve ≤ 3) |
| Hesitations | pauses > 3 s without input (note where) | none on the landing CTA or the Add CTA |
| Errors | wrong target, back-tracking, dismissing a sheet by mistake | ≤ 1 per task on average |
| SEQ | "Overall, how easy or difficult was this task?" 1-7 | median ≥ 6 on T1, T2, T4; anything < 5 is investigated |
| Comprehension | T3 and T6 answers + trust Q1-Q2 scored 0/1/2 | ≥ 80% of the maximum score |
| Trust | comfort with $150 of real money, 1-5 | median ≥ 4 (round B) |
| Jargon hits | words asked about or misread | **0** crypto words on main paths |
| Install (T7) | completed / steps understood | ≥ 3/5 (round A: understood the steps) |

**Decision rules (act on these, don't debate).** Round B has 3 people (rev3): read "≥ 2 of 5" below as "≥ 2 of 3", as implementation-plan gate G3 does.
- ≥ 2 of 5 fail T1 or T2 unassisted, or the median T1+T2 is ≥ 2:00 → fix onboarding **before Nov 1** (round A) or **before the MVP freeze** (round B). This applies to the landing, login order and setup copy.
- ≥ 2 of 5 can't explain the instant approval → revise RulePreview and the `feed.instant` copy, and make the rule sentence more visible.
- **Anyone** believes Maya can take the money alone → strengthen and move the trust sentence (landing, Pot header, Approve sheet).
- Any jargon word appears → fix the string and add it to the lint list.
- An in-app browser blocks someone → move the "Open in Safari/Chrome" banner up or change its copy.
- ≥ 2 of 5 look for a decline reason → make the reason field visible (H4).

## 7. Observation sheet (one per participant)
**Header:** P# · date · round A/B · device, OS version, browser · chat app used for the link · crypto experience (none / once / some) · organizer or member type · facilitator · note-taker

| Task | Start | End | Duration | Taps | U/A/F | Hesitations (where, how long) | Errors | Hints given | SEQ (1-7) | Quotes | Issues (severity 1-4) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| T1 Join | | | | | | | | | | | |
| T2 Add share | | | | | | | | | | | |
| T1+T2 total | | | | | | — | — | — | — | — | — |
| T3 Read Pot (answers: balance / put in / back) | — | — | | 0 | | | | | — | | |
| T4 Get $84 back | | | | | | | | | | | |
| T5 Respond to $300 | | | | | | | | | | | |
| T6 Close (explanation) | — | — | | — | | | | | — | | |
| T7 Home Screen | | | | | | | | | | | |

**Trust and jargon:** Q1 ___ (0/1/2) · Q2 ___ (0/1/2) · words flagged: ____ · comfort with $150 real (1-5): ___

**Severity scale:**
1. cosmetic
2. minor: slows them down
3. major: causes errors or needs a hint
4. blocker: can't complete

## 8. Debrief questions (5 min)
1. "In one sentence, what is this app for?"
2. "Who do you think holds the money? Who can take it out?"
3. "What happens to leftover money when the trip ends?"
4. "Was there a moment you felt unsure or worried? Where?"
5. "Which words or messages confused you?"
6. "How does this compare with how you split costs today (Splitwise, Revolut, bank transfer, cash)?"
7. "Would you use this for your next trip? 1-5, and why?"
8. "If you could change one thing, what would it be?"
9. "Would you put it on your Home Screen? Why or why not?"
10. (If they declined in T5) "Did you want to say why you declined?"
11. "Anything else you expected to be able to do?"

## 9. After the sessions
- **Same day:** the note-taker fills gaps from the recording (taps, exact times). Remove names and keep only P1-P5.
- **Synthesis (≤ 2 h):**
  1. Cluster issues on an affinity board.
  2. Rank them by severity × frequency.
  3. Pick the **top 5 fixes**, each with the owner, the ux-spec section to change, and the day.
- **Output:** a one-page summary (metrics table + top 5 fixes + quotes) appended below as "Results: round A/B". Update ux-spec §5 copy and §6 budgets.
- **Data hygiene:** delete recordings after synthesis (by Nov 14 at the latest). Store no personal data. Use testnet or the prototype only.

## 10. Pre-session checklist
- [ ] Prototype or build reset to the demo state: Lisbon Trip, $300 of $450, Maya + Sam; rules: $100 instant, $200 per person, 2 of 3.
- [ ] Round A: simulated delays set (setup 6 s, checking 1.2 s, sending 2 s); notification simulated with a prototype overlay.
- [ ] Round B (rev3, task X-19): on the hallway preview (`FLAG_DEV_SESSION` on), **one pre-Leo Pot per participant plus a spare (4)**, each made through the app: the facilitator's phone holds a dev-session "Maya" who creates Lisbon Trip and adds $150; a second device holds a dev-session "Sam" who joins and adds $150. The creator cap is 3 Pots per UTC day, so make 2 on Nov 6 and 2 on Nov 7 morning (or raise the preview hub's limit with `set_config`, a human signs). The facilitator sends each participant that Pot's invite link from Maya's Share sheet and later asks for the $300 as Maya. (Was: `/demo?as=maya`, which leases a post-Leo demo Pot the participant isn't in.)
- [ ] Round B: the preview is protected by Vercel Authentication, so open a Vercel Shareable Link on each participant's phone (or append its share parameter to the invite link) and test it from the participant's chat app before the session; test Google account ready for the localhost timing; preview relayer and treasury funded; the debug overlay (`?debug=1`) shows timers.
- [ ] Consent script printed; observation sheets × 5; SEQ card; stopwatch.
- [ ] Chat thread with the participant ready; the invite link tested from **that** chat app on **that** phone type.

## Results
_(to be filled after round A and round B)_
