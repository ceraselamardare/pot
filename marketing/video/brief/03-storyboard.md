# Storyboard v2 (shot by shot)

Owner: the director. v2 (2026-10-22) applies `brief/research-hypermotion.md`; read that doc too, because the numbers below come from it.
- **Lengths and VO offsets:** `src/data/timeline.ts` (frames at 60 fps; 1 beat = 30 f, an eighth = 15 f, a bar = 120 f).
- **Word sync:** `voWord(sceneId, "word", fallback)` from `src/data/vo.ts`. Voice-led visuals land **0-4 f before** the spoken word.

## Film-wide grammar (binding)
1. **Momentum, not maximum motion.** Moves take about 20 f; entries 24 f on `land`; opacity changes are helpers only (8-12 f); exits take 16-26 f on `exit`. Cut at peak velocity. **No dead frames**: holds keep a drift of 1-2 px/f or 0.5-1 % creep.
2. **One transition system:**
   - The **primary** transition is a blur-matched whip (14-16 f, directional smear) or a hard cut on motion with a carried object.
   - The **accents** are only these three: the dot → marigold **flood** (s05 → s06), the marigold **contracting into the phone screen** (s06 → s07), and the **screen-off to Night** (s11 → s12).
   - Banned: crossfades, white flashes, dips to black, 3D flips, star or clock wipes, light leaks.
3. **Springs:** the only visible bounce in the film is the **logo lid** (`{120,14}`). UI chips and checks use `uiPop` `{500,30}` (5.8 %, barely visible). Breakouts use `{150,20}`. Use `slam` at most once per act. Stickers may use the sticker spring once per scene.
4. **Kinetic type:**
   - Words rise 32-76 px out of blur (16 → 0) over 18-24 f into fixed slots, with no bounce. Only the thesis word may arrive from 1.4-1.9× scale.
   - Punchlines are 110-160 px Gabarito 800, tracking −1.5 % to −3 %.
   - Highlight blocks wipe left to right over 10-12 f.
   - Exits run one word every 2 f.
   - Reading time: hold about 0.2 s per word once the line is complete.
5. **Camera:**
   - Zoom in log space.
   - Push sizes: 1.25× for 12 f or less, 1.4× for 14-36 f, 1.5× for 38-90 f.
   - Reveal snaps: a 1-frame ratio jump of 0.56-0.77, then an 18-36 f `land` tail.
   - Drift: noise × 8 px, ±0.4°.
   - Dwell 1.5-2.5 s on hero moments.
6. **3D:** opacity, filter, clip-path, mask and overflow flatten preserve-3d. **Breakout cards are sibling layers** over the phone's screen rect, never children of the clipped screen.
7. **The dots are the thread.**
   - One geometry everywhere: 3 dots, gap = 3.33 r. They appear in "Leo is typing…", the s05 bubble, the logo's holes, "Checking Pot rules…" and the end card.
   - **The dots have a sound,** the `blips` motif. It resolves into the `impact` at s06, into the `success` chime at s09, and rests at s13.
8. **Sound system** (not a sound on every motion):
   - 3-5 SFX kinds per act and 1-3 hand-picked hits per act.
   - A whoosh starts 6-8 f before peak speed. Transients land on the event frame or 1 f early.
   - Rough levels: clicks −6 to −10 dB, whooshes −10 to −14, ticks −16 to −20, all under the VO.
9. **Finish:**
   - Night acts: grain 2-3 % monochrome, vignette ≤ 10 %.
   - Day acts: flat cream with token shadows only. **No member-colour glows.**
10. **Persona switching** (Act 3): **one world, two phones.** Maya's phone sits at x = 0 and Leo's at x = +1.2 W, in the same 3D space. The camera whips between them over 15 f, with a 40-60 px axis smear, anchored by a flying object (the link card, then the request card). The s10 split screen is a 1.6× pull-back that shows both.
11. **Presses, not ripples:** a press is a small eggplant touch dot at 18 % plus the button's `pressed` state: brand-deep at scale 0.97 over 4-6 f, released over 10-12 f.
12. **Breakouts** are one per beat: the rule sentences, the approved card, "Approvals · 1 of 2" and the refund table. Each has a 1.5-2.5 s camera dwell while numbers and dots keep moving.
13. **Numbers** roll one value per frame with decaying steps (15-23 values over 30-54 f), never overshoot, land exactly in tabular figures, and hold 0.5-1.2 s.
14. **Act 1 has no marigold.** The first marigold pixel in the film is s06 frame 0.

---

## ACT 1: THE PROBLEM (Night; ≈ 16 s)
Palette: ground `#1c1424`, surfaces `#261c30` / `#33283f`, line `#3f3350`, ink `#f6f1ea`, ink-muted `#bdb2c8`, member colours for people.

### s01-hook. VO: "Every group trip has a money problem."
- **Frame 0 is mid-avalanche.**
  - Generic chat notification banners for the group "Lisbon Trip ✈️", each with a member-colour avatar, slam in from the top. The gaps are 8, 6, 6, 5, 4, 4 and 3 f.
  - Each banner slides 65-110 px on `snap` with a 1 f vertical smear. The stack drops in one-frame jumps.
  - Sound: a `buzz` under the first banner and `notif` on 2 or 3 of them, not all.
  - The messages:
    - Sam: "who booked the flat??"
    - Leo: "i'll pay you back!!"
    - Sam: "wait how much was the car"
    - Leo: "can someone front the tickets 🙏"
    - Maya: "I paid for dinner btw"
    - Sam: "how much do I owe again?"
- **On the VO's first word,** the camera snaps back (ratio 0.6, 24 f `land` tail) to a wall of bubbles, centred on one giant incoming bubble: **"who's holding the trip money?"**
- **Kinetic line on the voice:** "Every group trip" / "has a **money problem**." in Gabarito 800 Night ink. "money problem" gets a `member-4` pink highlight block with eggplant text.
- **Out:** a blur-matched whip left on the last word.

### s02-front + s03-chase (one continuous shot). VO s02: "One friend fronts it all…", VO s03: "…then spends weeks chasing everyone to pay up."
- **s02:**
  - Maya's avatar (M on `member-1`, label "Maya") lands on "friend".
  - Expense chips stack beside her on eighths, with one `thud` total and not three: "Flat · $840.00", "Car · $210.00", "Dinner · $186.00".
  - On "fronts", **$1,236.00** rolls in about 20 steps over 42 f (Gabarito 800, about 200 px, tabular), labelled "fronted by Maya". The **receipt sticker** may sit behind the chips (at most one sticker).
- **s03:** the camera keeps moving down. The counter becomes the top of a Night chat thread of Maya's outgoing bubbles:
  - "hey! just a reminder 🙏", "Sam, the $412?", "Leo??", "anyone??", each with "Seen" in ink-muted.
  - Day stamps flip on the left: Day 2 → Day 9 → Day 23, with quiet `tick`s.
  - "**weeks**" punches big for about 1 s on its word.
- **The joke:** "Leo is typing…" appears with the dots pulsing on eighths (`blips`, quiet). After about 24 f, the bubble vanishes in a **1 f cut**, followed by about 30 f of near-silence (the director dips the music).
- **Out:** a hard cut on the beat.

### s04-options. VO: "Split apps just keep score. Shared accounts hand one person all the money."
- **Two cards rise and occlude the frame,** one after the other on the VO. They are Night surface, `radius-lg`, with a token shadow.
  - **Card 1** (on "Split"): Lucide `receipt`, "Split apps", "Track who owes what." / "Hold no money." Its chip **✕ "Can't pay for anything"** (`declined` + `x` + words) stamps on with a 3-5 % settle and a `stamp` sound.
  - **Card 2** (on "Shared"): Lucide `user-round`, "Shared accounts", "One person holds it all." / "Everyone else just hopes." Its chip **✕ "One person in charge"**.
- After each chip, a strike-through draws across the card title over 12 f (`scribble` once).
- **Out:** both cards leave on `exit`, thrown down and off frame.

### s05-pivot. VO: "What if the money lived right in the group chat?"
- **The breath:** an empty Night ground for about 1 s. **One incoming bubble** pops in at the centre with the **three typing dots** pulsing in ink-muted.
- The question rises word by word above it, with "**in the group chat**" bold.
- **On "chat?":** push into the **middle dot** 1 → 6× in log space over 60 f on `crashOut`. The `riser` ends dead on the next bar line, and the music clears 15-30 f before it.
- **Out:** a match cut. s06 starts with the same dot geometry at the same scale.

---

## ACT 2: THE REVEAL (marigold; s06 frame 0 sits on a bar line ≈ 0:16)

### s06-reveal. VO: "Meet Pot. … Group chat money that follows its own rules."
1. **Frame 0:** the dot turns marigold in 1 f (the film's first marigold). The off-centre `flood` reaches the corners in 15 f on `snap`. The **`impact`** transient lands on frame 0.
2. **The logo builds.** An eggplant iris centred on the middle dot reveals the glyph body over 18 f, so the three dots re-emerge as its marigold holes (`PotMark variant="glyph"`, `dots` props).
   - The **lid drops on `{120,14}`**, the one visible spring in the film.
   - The handles step in 3 f apart.
   - The **eggplant burst** plays as the lid lands (`burst`).
3. **"pot"** is wiped on in 10 f just before "Pot" is spoken, using `Lockup on="marigold"` with `wordmarkReveal`. The tagline "Group chat money that follows its own rules." follows the voice word by word, in eggplant Gabarito 700 at about 64 px. Hold at least 1 s.
4. **Out (accent 2): the marigold contracts into the phone screen.**
   - The lockup lifts out and away (`exit`).
   - The marigold full frame contracts to the phone's screen rect (`clip-path: inset(… round r)`, 30 f, `inOut`). Cream Day ground is revealed around it.
   - The phone body appears in a 1 f step, then the **held-pose entry** begins.
   - Build this as a reusable piece (`MarigoldToPhone`), because it may straddle the s06/s07 boundary.

---

## ACT 3: HOW IT WORKS (Day; ≈ 0:22-1:10)
Palette: ground `#faf9f6`, surface `#ffffff`, ink `#2b1b3a`, ink-muted `#645a70`; marigold only as fills and blocks.

**Staging:**
- **One world, two phones** (grammar rule 10).
- Big type sits on the phone's free side: Gabarito 800, 110-160 px for punchlines, 64-90 px for sentences, with highlight blocks behind key words.
- When the camera arrives at a phone, a small persona pill (avatar + name) sits above it for 1-2 s.
- At most one sticker per scene: 1.3 → 1.0 on `snap`, placed off the phone's edge.

### s07-create. VO: "Start a Pot for the trip, and set the rules in plain words."
- **The held-pose entry ends:** Maya's phone shows CreatePotSheet.
  - "Lisbon Trip" types in bursts of 14-30 chars/s with a solid caret; 🇵🇹 is picked; the Trip preset is selected with a press.
  - The **tram sticker** appears on "trip".
- **On "rules":** the two rule sentences **break out** as RuleRow cards and become big type beside the phone, on beats:
  - "Anyone can spend up to **$100** without asking." (`zap`)
  - "Bigger spends need **2 of 3** approvals." (`users`)
- **Out:** a whip toward the chat, keeping the same phone, as the screen changes.

### s08-join. VO: "Drop the link in the chat. Friends join with Google and chip in their share. No wallet. No seed phrase. No gas."
1. **"Drop the link in the chat":** the Day ChatScreen. Maya's message "Join our Lisbon Trip Pot so we can chip in together" lands with the marigold link-preview card (`pop`). Sam: "in!", Leo: "joining now".
2. **"Friends join with Google":** the **link card flies** out of Maya's phone toward Leo's (the anchor). A 15 f whip to **Leo's phone** (persona pill "Leo").
   - The InviteLanding shows "Maya invited you to Lisbon Trip", $300.00, "$300 of $450 collected".
   - A press on **Join with Google** (`click`), then the quick "You're in!" moment.
3. **"chip in their share":** Add my $150 share → AddMoney sheet → press **Add $150** → "Adding $150…" → "Added."
   - The hero **rolls $300.00 → $450.00** and the **goal bar fills**: "$450 of $450 collected".
4. **"No wallet. No seed phrase. No gas.":** three lines stack as big type beside Leo's phone, each landing on its spoken "No" (`stamp`, quiet), with each "No" on a marigold block (eggplant text).
- **Out:** a whip back to Maya's phone, anchored by a "+ $150.00" chip flying across.

### s09-instant. VO: "Small spends approve themselves. Eighty-four dollars for groceries? Pot checks the rules… approved, and paid back in seconds."
1. Big type: "Small spends **approve themselves**." Maya's PotScreen at $450.00. A press on **Spend** → the SpendSheet rises.
2. **"Eighty-four dollars for groceries?":**
   - Keypad presses 8 and 4 (`keypad` ×2, quiet), and the amount grows to $84.
   - "Groceries 🛒" is selected (`pop`), and the **grocery sticker** appears.
   - The preview reads "This will be approved instantly · Anyone can spend up to $100 without asking."
   - A press on **Get $84 back**.
3. **"Pot checks the rules…":** "Checking Pot rules…" with the TypingDots holds about 90 f (`blips`), then a 0.7 snap toward the dots. The music clears 15 f before the hit.
4. **"approved":** **"Approved by Pot rules"** lands (`success` + `burst`).
   - The brand's one celebration plays: 12 marigold particles, 12-16 px, with an optional 1 px `brand-deep` rim on cream. They leave in 1 f, 30° apart ± a seeded 8°, and travel 120-220 px plus +200 px in Z on `land` over 36 f, fading from 40 % of their life.
   - The approved card **breaks out** and holds for 1.5-2 s.
5. **"paid back in seconds":** "$84 sent to you" plus the Sent chip. The big MoneyRoll beside the phone goes **$450.00 → $366.00**.
- **Out:** the camera keeps going and stays on Maya's phone for s10.

### s10-group. VO: "Bigger spends go to the group. The three-hundred-dollar boat trip needs two of three… so Leo approves, right from a notification."
1. **Maya:** Spend → 3, 0, 0 → Tickets 🎟️ with the note "Boat trip" (**boat sticker**).
   - The preview "This needs 2 of 3 approvals · It's over the $100 instant limit." is highlighted.
   - A press on **Ask the group**.
2. **"needs two of three":** "Sent to the group" + the ApprovalTimeline, "Approvals · 1 of 2" (Maya ✓ "asked, approval counted"), which **breaks out**. Big type "**2 of 3**".
3. **The split screen:** a 1.6× pull-back reveals Leo's phone at +1.2 W on a lock screen.
   - The **request card flies** from Maya's phone to Leo's (`whoosh-long`) and lands as the push "Maya needs your OK · $300 for tickets · Lisbon Trip" (`notif`).
4. **"Leo approves":** the camera pushes to Leo's phone.
   - A press on the push → the ApproveSheet → a press on **Approve $300** (`click`).
   - **"Approved! $300 is on its way to Maya."** The timeline reads 2 of 2.
   - There is **no burst** (a group approval).
5. Back to the wide shot: Maya's hero rolls **$366.00 → $66.00**.

### s11-close. VO: "When the trip's over, close the Pot. Everyone gets their fair share back."
- **Maya:** ⋮ → **Close Pot** → the CloseSheet: "$66.00 left · split by how much each person put in".
- **On "fair share":** the **RefundTable breaks out** big. Its rows land 3-4 f apart, and each "Gets back" rolls to **$22.00**. "Put in $150.00" is shown in muted text.
- Big type: "**$22.00** each."
- A short "Pot closed" moment: the glyph with an approved check badge, and "Everyone got their share back."
- **Out (accent 3):**
  - The phone's screen goes Night in 1 f.
  - The dark rect grows to fill the frame over 24 f.
  - The phone outline rotates toward isometric (rotateX 55°, rotateZ −35°) as Act 4 begins.

---

## ACT 4: UNDER THE HOOD (Night; ≈ 1:10-1:23)

### s12-tech. VO: "Under the hood, every Pot is a Sputnik DAO on NEAR. Its rules are enforced on-chain, not by a person. Every action is gasless. And no one can take money out alone."
- **The setup:**
  - The isometric phone becomes an x-ray: line-art in Night line-strong, with translucent fills.
  - **Five slabs** separate 140-180 px apart in Z, starting 4-6 f apart.
  - Each slab is Night surface, `radius-lg`, with a 1 px Night line border, a Lucide icon and labels that blur-resolve.
- **The slabs:**
  1. **App** · "Sign in with Google (NEAR Auth) · no wallet, no seed phrase" (`smartphone`)
  2. **Gasless relay** · "NEP-366 meta-transactions · people hold 0 NEAR" (`zap`)
  3. **Pot rules** · "Pot Hub contract · approves only what the rules allow" (`shield-check`)
  4. **Your Pot** · "a Sputnik DAO · the group approves bigger spends" (`users`)
  5. **Dollars** · "USDC on NEAR" (`banknote`)
- **The request pulse:** a small marigold dot follows a path down the stack (`getPointAtLength`), and each slab's border lights as it passes. Each slab gets a 15-20 f sweep and a 60-90 f dwell keyed to its VO word:
  - "Sputnik DAO" → slab 4;
  - "enforced on-chain" → slab 3, with a small sub-label of the app's own copy: "The Pot enforces these rules itself. No one, including Maya, can skip them.";
  - "gasless" → slab 2.
- **On "no one can take money out alone":**
  - The stack collapses.
  - **"No one can take money out alone."** fills the frame at 120-140 px in Gabarito 800, Night ink, with a `shield-check` icon.
  - Track chips: "Sputnik DAO · Meta-transactions · Named accounts · Stablecoins" (small, ink-muted pills).
- **Out:** a hard cut to cream on the bar line.

---

## ACT 5: END CARD (Day cream; ≈ 1:23-1:30)

### s13-end. VO: "Pot. Built at NEAR Hackathon."
- `Lockup on="light"` arrives 1.15 → 1.0 over 36-48 f, centred, about 200 px tall, with a quarter-tile clear space. The dots blip once on "Pot." (`blips`) and then rest.
- The tagline "Group chat money that follows its own rules." blur-resolves at 8 f per word (Figtree 600, ink-muted, about 44 px).
- Then the pill "Built at NEAR HACKATHON" and the line "Social Money · Real-World Money" (small, ink-muted).
- Hold 2.5-3 s with 1-2 % creep. The final music chord rings out. **No fade to black.**
