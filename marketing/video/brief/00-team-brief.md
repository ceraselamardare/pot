# Pot hackathon video: team brief (read this first)

Owner: the director (the main Claude session). Every agent on the video team reads this file before starting.

## What we are making
A **hypermotion demo video** for Pot's NEAR HACKATHON submission (Nov 1-14, 2026; tracks Social Money + Real-World Money).
It explains **the problem** first, then **how Pot solves it**, then **how NEAR makes it work**, in a fast, polished, kinetic style.
It ships as the video attached to the team's X post and linked from the README.

- **Format:** 1920 × 1080, **60 fps**, H.264 MP4. Remotion 4.0.537, React 19.3.1, TypeScript 5.9.3.
- **Length:** target 85-100 s. Hard max 2:20 (X's limit for free accounts).
- **Audience:** hackathon judges (Illia Polosukhin, a16z crypto, Helius, Electric Capital, Dragonfly...) plus AI judges and people scrolling X, many of them **muted**. So every idea must also read without sound: big kinetic words and optional captions.
- **Soundtrack:** an ElevenLabs voice-over, an ElevenLabs Music track on a **120 BPM grid**, and ElevenLabs sound effects.
- **Images:** OpenAI image generation, used sparingly for stickers and plates. Most visuals are built in code.

## What Pot is (one paragraph)
Pot is a phone web app where a group (a trip, a club, a team) puts dollars into one shared Pot.
- Small spends inside the group's rules are **approved automatically** by a contract ("Approved by Pot rules").
- Bigger spends need **most of the group** to approve.
- When the Pot closes, everyone gets back **their share of what's left**, split by what they put in.
- Login is Google (NEAR Auth). There is no wallet, no seed phrase and no gas: users hold 0 NEAR, and every action is relayed for free as a NEP-366 meta-transaction.
- Under the hood, **every Pot is a Sputnik DAO** on NEAR. The **Pot Hub** contract holds a 1-of-1 "rulebot" role, so it approves only spends inside the rules (and invite joins). Members approve bigger spends by majority.
- Money is USDC, shown as plain dollars.
- **Trust sentence** (the product's own words): "No one can take money out alone. Small spends follow the Pot's rules; bigger ones need the group."
- **Tagline:** "Group chat money that follows its own rules."

### The problem (the README's three bullets)
- On a group trip, one person fronts the money, keeps the receipts and chases everyone for weeks afterwards.
- Pooled-money apps pay out to one owner, so the group has to trust that one person with all of it.
- Split-the-bill apps track debts but hold no money, so nobody can actually pay from the group.

### The demo story (D-61; these numbers are binding everywhere)
- Pot **"Lisbon Trip" 🇵🇹**, Trip rules:
  - "Anyone can spend up to $100 without asking."
  - "Bigger spends need 2 of 3 approvals."
  - "Each person can spend up to $200 in total without asking."
- Members, in join order with their avatar colours: **Maya** (creator, `member-1` #ffd166), **Sam** (`member-2` #9ad7c2), **Leo** (`member-3` #b8c7ff).
- The story:
  1. Maya and Sam put in $150 each, so the Pot holds **$300 of $450** when Leo opens the invite.
  2. Leo joins and adds $150: **$450 of $450 collected**.
  3. Maya spends **$84 on Groceries 🛒**. Pot shows "Checking Pot rules…", then **"Approved by Pot rules"** (under the $100 instant limit) with the marigold burst, then **"$84 sent to you"**. The Pot now holds **$366.00**.
  4. Maya asks for **$300 for Tickets 🎟️ / the boat trip**: "This needs 2 of 3 approvals" → **Ask the group** → "Approvals · 1 of 2" (Maya's own approval counts). Leo gets the push "Maya needs your OK" → **Approve $300** → "Approved! $300 is on its way to Maya". The Pot now holds **$66.00**.
  5. **Close Pot**: everyone put in $150, so everyone **gets back $22.00**. "Pot closed."
- Real UI references: `notes/screens/*.png` (day-*, p2-day-*, live-*, night-*) and the components in `apps/web/components/**`. The UI strings are in `apps/web/i18n/en.json`.

## Brand rules (binding; brand/README.md has the detail)
1. **Colours come only from `brand/tokens.json`** (Day and Night sets, `member-1..6`, `approved` / `waiting` / `declined`). Never invent a colour. Gradients may blend token colours only. Shadows use the token shadows, or rgba of eggplant `#2b1b3a`.
2. **Marigold `#ffb320` is never a text colour.** Text on marigold is eggplant `#2b1b3a` (`on-brand`). Inside app-UI replicas, keep **one marigold button per screen**. In motion graphics, marigold works as a ground, a highlight block or a shape.
3. **Status colours always come with an icon and a word** (Lucide `check` / `clock` / `x`).
4. **Type:**
   - **Gabarito** for display: titles, big kinetic words, balances. Weights 700/800.
   - **Figtree** for text: UI text, captions, labels. Weights 400/600/700.
   - **Every amount** uses `fontVariantNumeric: "tabular-nums"` and shows two decimals ("$450.00"). Sentences and buttons keep whole dollars ("Add $150").
   - Use the U+2212 "−" for minus signs.
5. **Icons:** `lucide-react` at `strokeWidth={2}`.
6. **Logo:**
   - Never recolour it, distort it, add a coin or a dollar sign to it, or flip the bubble's tail.
   - The wordmark is always lowercase "pot".
   - The mark must appear together with the name in any resting logo shot. It may animate in before the wordmark arrives.
   - On marigold grounds, use the eggplant glyph plus the eggplant wordmark, as `og-image.png` does.
   - On the cream Day ground, use the lockup `pot-lockup-on-light.svg`.
   - Keep a quarter-tile clear space around it.
   - The files are in `marketing/video/public/brand/` (copied from `brand/logo/`).
7. **The typing dots** (three dots) are the brand's one motif. In the product they mean "Checking Pot rules…" and live inside the logo. In the video they are our **narrative thread**: chat "typing…" dots → the logo's dots → the rules check. Use them with meaning, never as random decoration.
8. **One celebration:** the marigold burst on "Approved by Pot rules" (10-12 marigold particles leaving the button's centre). In the video it may be bigger and more cinematic, but it stays reserved for that moment and the logo reveal.
9. **No coins and no piggy banks** in the visuals (a brand rule).

### Words
- Inside app-UI replicas, use the app's real copy from en.json. **Never** show: DAO, multisig, treasury, proposal, vote, bond, gas, wallet, account ID, transaction hash, USDC, Sputnik.
- The **voice-over and kinetic text** are for judges, so they may say "no wallet, no seed phrase, no gas". The NEAR tech words (Sputnik DAO, meta-transactions, NEAR) belong only in the **"under the hood"** act.
- In the product acts, use product words: Pot, rules, the group, approve, request.
- **Accuracy:** never claim more than the product does. Don't claim cross-chain deposits or mainnet. Say "no one can take money out alone", not "not even us".

## Look and feel (initial direction; the creative brief refines it)
- **Act 1, the problem:** the Night palette. The ground is `#1c1424`, with Night surfaces `#261c30` / `#33283f` and ink `#f6f1ea`. The mood is chaotic, dense and fast: a group chat drowning in "I'll pay you back".
- **Act 2, the reveal:** a marigold flood. The chat's typing dots become the logo's dots, the eggplant pot-bubble forms around them, then "pot" and the tagline appear.
- **Act 3, the product:** the Day palette. The ground is `#faf9f6`, with surface `#ffffff` and ink `#2b1b3a`. The app UI is rebuilt in code inside a 3D phone, with camera moves, UI pieces breaking out of the phone, and huge kinetic words.
- **Act 4, under the hood:** back to Night. An "x-ray" or exploded view of the stack: phone → Pot rules (Pot Hub) → each Pot is a Sputnik DAO → dollars (USDC) on NEAR.
- **Act 5, the end card:** `pot-lockup-on-light.svg` on cream, with the tagline, "Built at NEAR HACKATHON" and "Social Money · Real-World Money".

## Technical conventions (Remotion)
- **Every animation is driven by `useCurrentFrame()`.** No CSS transitions or animations, and no Tailwind animation classes. Write time in seconds × `fps`, or in beats with `beats(n)` from `src/motion/time.ts` (120 BPM → 1 beat = 30 frames at 60 fps).
- Use `interpolate(..., {extrapolateLeft: "clamp", extrapolateRight: "clamp"})`, `spring()` and `Easing.bezier`. Use the helpers in `src/motion/*` so the whole video moves the same way.
- **Premount every `<Sequence>`** (`premountFor`).
- Load assets with `staticFile()`, `<Img>` from `remotion`, and `<Audio>` from `@remotion/media`.
- **Fonts:** import `src/brand/fonts.ts` (it loads Gabarito and Figtree via `@remotion/google-fonts`). **Tokens:** `src/brand/tokens.ts`.
- Pure inline styles (no Tailwind). Components are deterministic: no `Math.random()`; use `random(seed)` from `remotion`.
- **Check your work by rendering stills.** From `marketing/video`, run:
  ```
  npx remotion still <CompositionId> out/stills/<name>.png --frame=<n> --scale=0.5
  ```
  Then look at the PNG with the Read tool. Run `npx tsc --noEmit` before you report back.
- Register your compositions in `src/Root.tsx` inside your own `<Folder>`. Keep edits to Root.tsx minimal and additive, because other agents edit it too. Re-read the file right before you edit it.

## Directory ownership (`marketing/video/`)
| Path | Owner |
|---|---|
| `brief/` | director (agents write only their own `brief/research-*.md` / `brief/tooling.md` / `brief/*-notes.md`) |
| `src/brand/` | director (tokens, fonts, logo components) |
| `src/ui/` | UI-kit agent (app replicas: phone, Pot screens, sheets, chat, notification) |
| `src/motion/` | motion-kit agent (camera, transitions, kinetic type, effects, timing helpers) |
| `src/scenes/<Scene>/` | the scene agent assigned to that scene |
| `src/audio/`, `public/audio/`, `scripts/audio-*` | audio agent |
| `public/images/`, `scripts/images-*` | image agent |
| `src/Video.tsx`, `src/Root.tsx` composition list | director (integration) |

Never edit files outside `marketing/video/` (the rest of the repo is read-only reference). Use the session scratchpad for temp files.

## Hard rules (from CLAUDE.md; non-negotiable)
- **No git commands at all.** Don't post anything anywhere. Don't sign or send any blockchain transaction. Don't deploy.
- **Secrets:** the API keys are in `marketing/.env` (`OPENAI_API_KEY`, `ELEVENLABS_API_KEY`).
  - **Never print, echo, cat, log or copy** them into files, code or output.
  - Load them only at runtime: `node --env-file=../.env scripts/x.mjs` (run from `marketing/video`), or `set -a; . ../.env; set +a; <cmd>` inside one shell command.
  - Never put a key in a URL query string or an error message.
- **Spend:** API calls cost money. Generate deliberately, cache every output on disk, and never regenerate something that already exists unless asked to.
