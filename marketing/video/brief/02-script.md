# Script v3 (voice-over + on-screen words)

v3 (2026-11-03, brief/06-update-v2.md): the app now has one-OK rules, so s10 is a new line; s10b-more is new ("And more"). All other lines are unchanged and verified true against the Nov 3 app.

v2 (2026-10-22, after brief/research-hypermotion.md): s03 and s05 are shorter so the logo reveal lands near 0:16 and the product near 0:22; s02+s03 play as one continuous shot.

Owner: the director. The VO lines below are the source of truth for the audio agent; scene IDs are the source of truth for file names (`public/audio/vo/<id>.mp3`).

**Narrator:** friendly, warm, energetic, confident; conversational product-launch energy (not a movie trailer, not a radio ad). Slight smile in the voice. Pace ~2.6 words/s, with real pauses where marked "…".

| ID | Act | VO line | On-screen (kinetic words / key visual) |
|---|---|---|---|
| s01-hook | 1 | Every group trip has a money problem. | Notification avalanche in a Night group chat; a giant bubble "who's holding the trip money?" |
| s02-front | 1 | One friend fronts it all… | Maya's avatar; expense chips slam in: Flat $840 · Car $210 · Dinner $186 → counter **$1,236.00** "fronted by Maya" |
| s03-chase | 1 | …then spends weeks chasing everyone to pay up. | Maya's reminders stack ("just a reminder 🙏", "Sam, the $412?", "Leo??"), day tags Day 2 · Day 9 · Day 23, "Seen"; "Leo is typing…" → the dots → nothing |
| s04-options | 1 | Split apps just keep score. Shared accounts hand one person all the money. | Two cards slam in and get struck: "Split apps: track debts, hold no money" ✗ · "Shared accounts: one person holds it all" ✗ |
| s05-pivot | 1 | What if the money lived right in the group chat? | Everything clears; one bubble with typing dots, centre frame; on "chat?" the camera pushes into the middle dot |
| s06-reveal | 2 | Meet Pot. … Group chat money that follows its own rules. | Dots → logo dots, marigold flood, the eggplant pot-bubble forms, "pot" wordmark, tagline |
| s07-create | 3 | Start a Pot for the trip, and set the rules in plain words. | Phone: Create → "Lisbon Trip" 🇵🇹; rule sentences fly out beside the phone: "Anyone can spend up to $100 without asking." · "Bigger spends need 2 of 3 approvals." |
| s08-join | 3 | Drop the link in the chat. Friends join with Google and chip in their share. No wallet. No seed phrase. No gas. | Chat (Day) with the Lisbon Trip link card → Leo taps → invite landing → Join with Google → You're in! → Add $150 → goal bar **$450 of $450**; stamps: No wallet · No seed phrase · No gas |
| s09-instant | 3 | Small spends approve themselves. Eighty-four dollars for groceries? Pot checks the rules… approved, and paid back in seconds. | Maya: Spend → 8, 4 → Groceries 🛒 → Get $84 back → "Checking Pot rules…" dots → **"Approved by Pot rules"** + marigold burst → "$84 sent to you" → hero $450.00 → **$366.00** |
| s10-group | 3 | Bigger spends need one OK. Leo taps it, right from a notification. | Maya: $300 → Tickets / the boat trip → "This needs one OK from anyone else" → Ask for one OK; Leo's push "Maya needs one OK" → [OK $300] → "Done. Your OK sent $300 to Maya." → **$66.00** |
| s10b-more | 3 | Plus: trust that grows, all-or-nothing goals, and links to pay in, or pay out. | Feature blitz with the app's own names: Trust grows · All or nothing · Ask anyone to pay in · Send by link |
| s11-close | 3 | When the trip's over, close the Pot. Everyone gets their fair share back. | Close Pot → refund table rows land: Maya / Sam / Leo put in $150.00 → get back **$22.00** each → "Pot closed" |
| s12-tech | 4 | Under the hood, every Pot is a Sputnik DAO on NEAR. Its rules are enforced on-chain, not by a person. Every action is gasless. And no one can take money out alone. | X-ray of the stack; labels: Google login (NEAR Auth) · gasless relay (NEP-366 meta-transactions) · Pot rules (Pot Hub contract, auto-approves only inside the rules) · each Pot = a Sputnik DAO (the group approves by majority) · dollars (USDC). End on the trust sentence, huge |
| s13-end | 5 | Pot. Built at NEAR Hackathon. | Lockup on cream, tagline, "Built at NEAR HACKATHON", "Social Money · Real-World Money" |

Pronunciation notes: "Sputnik DAO" → say "Sputnik D-A-O" or "dow" (check the take; use what sounds natural for crypto audiences, prefer "D-A-O"); "NEAR" = the word "near".

Timing intent (approximate; final timing comes from the VO takes, snapped to the 120 BPM grid):
- 0:00-0:01.5 cold open (notification buzz avalanche, no VO), VO starts on the downbeat after.
- The logo hit (s06) lands on a bar line after a 1-2 s riser; "Meet Pot." starts half a beat after the hit.
- Leave ~0.5-1 s VO gaps after s05, s09 ("approved"), s11 and s12 for music/SFX moments.
- Targets (research §4): hook within 3 s, logo hit ≈ 0:16, product from ≈ 0:22, under the hood ≈ 1:10-1:23, end card ≈ 1:23-1:30.
