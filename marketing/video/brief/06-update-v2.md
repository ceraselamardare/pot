# Update v2 (2026-11-03): bring the film up to the current app and website

Owner: the director. **This is binding for the update round.** Where it conflicts with 00-05, this file wins. Everything else still applies:
- the brand rules, the motion grammar (03-storyboard "Film-wide grammar") and the research recipes;
- the one-world Act 3 staging and the handoff discipline.

**Goal of this round, from the design lead:**
1. Every claim in the film must be true for today's app.
2. The jury must see everything relevant that was added since Oct 22.

**Constraints:**
- **Same length:** 4920 f = 82.0 s.
- **Same style, animations and design language.**
- **Same music file:** the act boundaries stay where they are, at 1080 / 1440 / 3840-3870 / 4680.

## 1. What changed in the product since the film
The sources of truth, in order:
1. `apps/web/i18n/en.json` (all copy) and `apps/web/components/**` (the UI).
2. `notes/screens/*.png` (captured Nov 3).
3. The website copy `home.*` and `notes/landing.md`.
4. The demo tour, `notes/demo.md`.
5. `README.md` J-1..J-6.

The commits from Nov 1-3 are summarised by `git log --since=2026-10-31`.
- **One OK** (hub 1.1.0). A new Pot's default rules have three tiers:
  - "Anyone can spend up to $100 without asking."
  - "Spends up to $300 need just one OK from anyone else." (`rules.one_ok`)
  - Bigger spends need most of the group (2 of 3).
- **So the $300 boat needs ONE OK, not 2 of 3.** The copy, in order:
  - spend preview `preview.one_ok.over_cap`: "This needs one OK from anyone else · It's over your $100 instant limit.";
  - CTA "Ask for one OK";
  - sent: "Sent · One OK from anyone else in the group and it's paid.";
  - feed chip "Needs one OK";
  - push: "Maya needs one OK" / "$300 for the boat trip · Lisbon Trip · Anyone can OK it";
  - Approve sheet: "One OK needed", "Maya · asked, approval counted", "Anyone in Lisbon Trip except Maya can give it.", [OK $300] [Decline];
  - Leo's result: "Done. Your OK sent $300 to Maya." (`approve.ok.done`);
  - Maya's record: "Approved by Leo's OK · $300 was sent to Maya." (`approve.decided.ok`).
- **The majority (2 of 3)** is now for spends over $300, closing the Pot and rule changes. The website shows it on closing.
- **Trust grows** (on-chain per-member trust levels):
  - "People who spend well get a bigger instant limit."
  - Levels: New → Trusted → Very trusted. The limit goes 1× / 2× / 3×.
  - Level-up: "You're now Trusted in Lisbon Trip: you can spend up to $200 without asking."
- **All or nothing** (goal with a date): "If we don't reach it, everyone gets their money back automatically." "Spending opens once the goal is reached."
- **Ask anyone to pay in:** a link or QR, no joining; the tone is "A payment" or "A gift ☕".
  - "Your pay-in link is ready", "Scan to pay into Lisbon Trip".
  - Feed: "{name} paid in {amount} · by link".
- **Send by link** (pay anyone outside the Pot): "Your link to send $40 is ready", "Send it to {who}. Whoever opens it gets $40."
- **UI changes visible in the film:**
  - **Pot hero:**
    - The line reads "You'd get back $150 · You put in $150 ⓘ".
    - The two pill buttons are replaced by a round action row: Add money (the one marigold), Spend, Ask, More.
    - Tabs are Activity · Members · **Settings**.
    - Feed rows are compact ("Leo · Added money", "Receipt ↗", amount and time).
    - The tab bar's third tab shows the person's Pot dollars balance (e.g. "$0.00").
  - **Create** is one screen: cover card (emoji + name + "Just you so far"), "Pot name", "Everyone chips in $150 each", a rules summary with [Change], and [Create Pot]. The rules open on a "Pot rules" screen of cards.
  - **Spend** is two steps: How much? → details (What's it for? · Who gets paid? Me / A member / Someone else · preview · CTA).
  - **Add money** is two steps: How much? (Your share $150 · $50 · $100, [Next]) → how to add it.
  - **Invite landing:** "Maya and 1 other are in" (names are private now). The rules line reads "Up to $100 without asking · up to $300 with one OK · bigger spends need most of the group".
- **Unchanged and still true:**
  - Act 1's problem.
  - "Join with Google" (the site still says "Sign in with Google").
  - The $84 instant spend ("Approved by Pot rules / Under the $100 instant limit", "$84 sent to you").
  - Closing needs the group: "Ask the group to close", 2 of 3, "Pot closed. $22.00 is in your Pot account.".
  - $22.00 each.
  - "No one can take money out alone."
  - Every Pot is a Sputnik DAO with 0 keys; NEP-366 gasless relay; "Gas and deposits are on us".

## 2. Truth audit of the current film (v1.3)
| Where | Now | Verdict | Fix |
|---|---|---|---|
| s07 rule card 2 "Bigger spends need 2 of 3 approvals." | true only above $300 | incomplete: the $300 boat later contradicts it | Show the three tiers: $100 without asking · up to $300 with one OK · bigger: most of the group |
| s07 Create (Trip preset, steps) | presets are gone; one-screen Create + Pot rules screen | outdated UI | New Create (UI kit) |
| s08 invite "Maya and Sam are in", rules line | "Maya and 1 other are in"; one-OK rules line | outdated | UI kit |
| s08 Add money | two-step sheet | outdated UI | UI kit |
| Pot hero / action buttons / Rules tab / feed rows / tab bar, in every Act 3 shot | new hero line, action row, Settings tab, compact rows, balance tab | outdated UI | UI kit (PotScreen) |
| s09 Spend sheet (one long sheet) | two steps | outdated UI | UI kit (SpendSheet) + s09 retime |
| **s10 VO "needs two of three… so Leo approves"; "2 of 3" big type; "Approvals · 1 of 2"; push "Maya needs your OK"; [Approve $300]** | **one OK** | **false** | Rebuild s10 as the one-OK flow + a new VO line |
| s12 tie-back "$300 → Your Pot · Approved by Maya and Leo" | the hub approves the $300 after Leo's one OK | **false** | $300 stops at Pot rules: "✓ Approved by Leo's OK"; the majority pulse is the **close** (Maya + Sam, 2 of 3) at Your Pot |
| s12 slab 4 "the group approves bigger spends" | the majority = spends over $300, closing, rule changes | slightly off | "a Sputnik DAO · bigger calls need most of the group" |
| s12 slab 5 "USDC on NEAR" | test USDC on testnet today (the site says so) | honest but vague | "USDC on NEAR · testnet today" |
| VO s12 "Every action is gasless." | the site: "Gas and deposits are on us" | ok | keep |
| s11 order (refund table, then ask, then Sam approves) | fine, but needs a shorter cut | — | retime (§4) |
| Everything in Acts 1, 2 and 5 | true | ok | no change |

## 3. Story v3 (82.0 s, same music, same acts)
Act 3 keeps its window (1440 → 3870, 2430 f) but tells six beats instead of five. The new beat is s10b, **"And more"**: a hypermotion feature blitz mirroring the website's "What else a Pot can do".

| # | Scene | Frames (budget) | VO | What changes |
|---|---|---|---|---|
| s07 | create | **330** (was 360) | unchanged | New one-screen Create; the rules break out as **three tiers** (§5.1) |
| s08 | join | **480** (was 510) | unchanged | New invite landing + two-step Add money; tighter holds |
| s09 | instant | **540** (was 570) | unchanged | Two-step Spend; tighter tail |
| s10 | one OK | **360** (was 570) | **NEW** (§4), 4.985 s, at f15 | Rebuilt: Ask for one OK → push "Maya needs one OK" → [OK $300] → "Done. Your OK sent $300 to Maya." → Maya $366.00 → $66.00. No burst |
| s10b | and more (NEW) | **360** | **NEW** (§4), 4.893 s, at f15 | Feature blitz: Trust grows · All or nothing · Ask anyone to pay in · Send by link |
| s11 | close | **360** (was 420) | unchanged | Re-ordered: Ask the group → Sam approves (2 of 3) → "$22.00 each" breakout → Pot closed → screen-off at the same global frame **3840** |
| s12 | tech | 810 | unchanged | Tie-back fixed (§2); slab copy tweaks |

**Locked in `src/data/timeline.ts` v2:** s07@1440 (330) · s08@1770 (480) · s09@2250 (540) · s10@2790 (360) · s10b@3150 (360) · s11@3510 (360) · s12@3870 (810) · s13@4680 (240) · end 4920. **s11's screen-off stays on global 3840, and s12 still starts at 3870.**

## 4. New voice-over lines (same voice Dior, eleven_v4, same settings)
- **s10-group (replaces the old line):** "Bigger spends need one OK. Leo taps it, right from a notification."
  - Fallback if it reads unclear: "Bigger spends need one OK from the group. Leo taps it, right from a notification."
- **s10b-more (new):** "Plus: trust that grows, all-or-nothing goals, and links to pay in, or pay out."
  - Shorter fallback: "Plus: trust that grows, all-or-nothing goals, and payment links."

## 5. Scene direction for the changed beats
**5.1 s07, the three tiers.** Keep the style of the current rule breakouts: Gabarito type in the TypeZone, Lucide icons, marigold blocks behind the numbers. The lines:
- "Anyone can spend up to **$100** without asking." (zap)
- "Up to **$300**? Just **one OK**." (hand), or the app's exact "Spends up to $300 need just one OK from anyone else." if it fits.
- "Bigger spends need **most of the group**." (users)

The third line can be smaller or quicker. All three must be readable for ≥ 1.2 s together.

**5.2 s10, one OK.**
- Same world, same phones, the same flying request card and push.
- Leo's push now reads "Maya needs one OK"; his sheet is the one-OK Approve sheet; the press is on [OK $300].
- Big type in the TypeZone keyed to the VO, e.g. "Bigger spends need **one OK**." then "Leo taps it." Show the app's "One OK from anyone else" somewhere readable.
- End on Maya's hero ticking $366.00 → $66.00 in the big right-side MoneyRoll, as s09 and the current s10 do.
- No burst: it's not a rules-only approval.

**5.3 s10b, "And more".** A fast, premium blitz in the Act 3 world (Day):
- Four feature cards, built from the app's real UI fragments, land one per VO beat around or over Maya's phone. Use the website's icons: Lucide sprout / target / qr-code / send.
  1. **Trust grows.** Maya's member row with the ✓ "Trusted" badge; the limit rolls $100 → $200 ("You can spend up to $200 at a time without asking").
  2. **All or nothing.** A goal card: "$450 of $450 collected", or the lock line "Spending opens once the goal is reached." plus the all-or-nothing note.
  3. **Ask anyone to pay in.** The pay-in QR card ("Scan to pay into Lisbon Trip", "A gift ☕"), then a feed row "Grandma paid in $25.00 · by link".
  4. **Send by link.** "Your link to send $40 is ready", "Whoever opens it gets $40", a QR, then a ✓.
- The title of each card is the app's own name: "Trust grows", "All or nothing", "Ask anyone to pay in", "Send by link".
- **Motion:** the film's breakout grammar (lift on `{150,20}`, token shadows, smear on fast moves), a camera that keeps moving, one card per beat. The words land on the VO.
- **Exit:** clear back to Maya's PotScreen at $66.00 on CAM.maya (the s11 handoff).

**5.4 s11, close in 360 f.**
1. ••• or More → Close Pot → the close sheet.
2. On "close the Pot", press "Ask the group to close".
3. "Approvals · 1 of 2" → Sam approves → "2 of 2" (hold ≥ 30 f).
4. On "fair share", the refund table breaks out and rolls to $22.00 each, with "$22.00 each." big.
5. "Pot closed. $22.00 is in your Pot account."
6. Screen-off on global 3840.

**5.5 s12, tie-back.**
- The $84 pulse stops at Pot rules: "✓ Approved by Pot rules" (as now).
- The $300 pulse also stops at Pot rules, with Leo's dot: "✓ Approved by Leo's OK".
- A third pulse, "Close · 2 of 3", lights Your Pot with Maya's and Sam's dots: "✓ Approved by Maya and Sam".
- Slab copy:
  - slab 4: "a Sputnik DAO · bigger calls need most of the group";
  - slab 5: "USDC on NEAR · testnet today".
- Keep the rest.

## 6. Who does what (in order)
1. **UI kit** (the UI-kit agent): update the replicas to today's app (§1 "UI changes") with backward-compatible props. Add the one-OK states. Re-measure LAYOUT, refresh the galleries and compare against `notes/screens/*`.
2. **Audio** (the audio agent, in parallel with 1): generate the two lines (§4), QA them, finalize the JSON and the registry, and report durations.
3. **Director:** timeline v2 from the measured durations; captions; music dips; registry entries for s10b.
4. **Scene builders** (after 1 and 2):
   - C: s07 + s08;
   - D: s09 + s10;
   - B: s10b (new);
   - E: s11 + s12.
5. **Critic** pass, then fixes, then the final render.


## 7. After review-3 (2026-11-04)
- **s07's third tier reads "Over $300? Most of the group."** It mirrors "Up to $300? Just one OK." and can't contradict s10's "Bigger spends need one OK."
- **s10b keeps the Trust card as Maya's honest state** (New, 2 of 3 paid spends, "1 more paid spend to $200"). The other three cards belong to **other Pots** with their own numbers, so none of them changes Lisbon's $66.00 or Maya's trust:
  - All or nothing: Festival Fund, $300 of $1,200, 3 days left, by Nov 6;
  - Ask anyone to pay in: Porto Weekend;
  - Send by link: Surf Camp, $50, Casa Lisboa host.
  - Pay-ins never go to a Pot still collecting for an all-or-nothing goal; the app blocks that.
- **s10b opens on a big "And more." type moment.**
- **Captions are off for all of s10:** its big type carries every word.
