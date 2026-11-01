# Pot brand and design system

> For designers, engineers and AI coding agents. Integrated into the plan on 2026-10-21 (Phase 0: no product code before Nov 1, D-63).
> **Source of truth:** the Design System artifact <https://claude.ai/artifact/TfPiy6PHkWTSZsR2wDxwWN> (its README, `tokens.json`, logo and web assets) and this folder, which copies them. The design canvas <https://claude.ai/artifact/FAiVhgLDt1PtuJhddvQBad> shows the reasoning (boards: Main, Directions, Web icons, Logo system, Colour and type, In context). Its three phone mockups are illustrations, not specs.
> **Who wins when sources disagree:** [decisions.md](../plan/decisions.md) (numbers, login methods, policy) and [ux-spec.md](../plan/ux-spec.md) (copy, states, flows) win on product and content. This folder and the artifact win on the look: colour, type, shape, motion, icons, logo. §12 lists every known difference and how it was resolved.
> **Binding decisions:** D-67 (brand and design system) and D-45 (type) in decisions.md. Cerasela (P2, design lead) made the logo and the system with Claude.

**For AI coding agents, the six rules** (also in CLAUDE.md):
1. Use the tokens in [tokens.json](tokens.json) only; never invent a colour. Sizes that aren't tokens (keypad keys, row heights) come from ux-spec §7.3.
2. One marigold (`brand`) button per screen, always with eggplant `on-brand` text. Marigold is never text.
3. Status colours always come with an icon and a word.
4. Gabarito for display, Figtree for text. Every amount uses tabular figures.
5. Icons are Lucide at stroke 2.
6. Never recolour the logo. The mark always appears with the name, and the wordmark is always lowercase "pot".

## Contents
1. [Files](#1-files)
2. [Logo system](#2-logo-system)
3. [Colour](#3-colour)
4. [State and member colours](#4-state-and-member-colours)
5. [Type](#5-type)
6. [Spacing, radius, shadow, layout](#6-spacing-radius-shadow-layout)
7. [Themes: Day and Night](#7-themes-day-and-night)
8. [Interaction, motion, iconography](#8-interaction-motion-iconography)
9. [Content fundamentals](#9-content-fundamentals)
10. [Tokens, fonts and theme in code](#10-tokens-fonts-and-theme-in-code)
11. [Web assets in Next.js 16](#11-web-assets-in-nextjs-16)
12. [Plan reconciliations](#12-plan-reconciliations)

---

## 1. Files

| Path | What it is | Use |
|---|---|---|
| `logo/pot-mark.svg` | Primary mark: marigold tile, eggplant pot-bubble, marigold typing dots | App icon, avatar, header; 33 px and up (§2) |
| `logo/pot-mark-small.svg` | Small-size cut: pot scaled 1.06, dots r 18 → 26 units | 32 px and below; the favicon's source |
| `logo/pot-lockup-on-light.svg` | Mark + wordmark in eggplant `#2b1b3a` | Day header, invite landing, README, docs |
| `logo/pot-lockup-on-dark.svg` | Mark + wordmark in Night `ink` `#f6f1ea` | Night header, dark slides |
| `logo/pot-wordmark.svg` | "pot", Gabarito ExtraBold, outlined, eggplant | Next to the mark only |
| `logo/pot-glyph-eggplant.svg` | The pot-bubble alone, dots cut through | Empty states, loading, link preview, on light and marigold grounds |
| `logo/pot-glyph-marigold.svg` | The same in marigold | The same uses on dark (Night) grounds |
| `web/favicon.svg` | The small-size cut (same drawing as `pot-mark-small.svg`) | Browser tab |
| `web/favicon.ico` | 16, 32 and 48 px PNGs in one ICO | Legacy browsers, `/favicon.ico` requests |
| `web/favicon-32.png` | 32 × 32 PNG | Optional; not referenced by the head tags |
| `web/apple-touch-icon.png` | 180 × 180, full-bleed marigold square (iOS rounds it) | iOS Add to Home Screen |
| `web/icon-192.png`, `web/icon-512.png` | Rounded tile on transparency, purpose `any` | PWA manifest |
| `web/icon-maskable-512.png` | Full bleed, the pot at 78 % inside the 80 % safe circle | PWA manifest, purpose `maskable` |
| `web/og-image.png` | 1200 × 630: marigold ground, eggplant glyph, wordmark, tagline | Link previews (WhatsApp, Telegram, iMessage, X) |
| `web/site.webmanifest`, `web/head-snippet.html` | Generic templates | Translated into Next.js code in §11; not copied as-is |
| `explorations/pot-option-{huddle,chip-in,table}.svg` | The three dropped directions | Reference only. Never use |
| `tokens.json` | Colour (Day and Night), type, spacing, radius, shadow and layout tokens | The machine-readable source for §3-§6 and for code (§10) |
| `web/pot-mark-256.png` | 256 × 256 PNG of `pot-mark.svg` (rounded tile, transparent corners) | Forms that want a logo upload: the H-01 NEAR Auth request and the mainnet Typeform |

**Provenance (checked 2026-10-21):**
- The 20 pack files are byte-identical (sha256) to `pot-brand.zip`. The zip lists 24 entries: 20 files and 4 folders.
- `tokens.json` is an exact copy of the artifact's (sha256 `fb05543e505eedf463f9913bb08302fea56a184092959553f193411940d37d5f`). The canvas holds the same file.
- `web/pot-mark-256.png` is derived, not part of the pack: `rsvg-convert -w 256 -h 256 logo/pot-mark.svg` (librsvg 2.61.3).
- Every pack SVG and PNG embeds a C2PA content-credentials manifest (an SVG `<metadata>` block, a PNG `caBX` chunk). It adds about 7.7 KB per SVG and 5.8 KB per PNG, which is why `pot-mark.svg` is 8,490 B here and 769 B in the artifact's file list. The drawings are identical.
- In the product repo (D-64), copy this folder to `docs/brand/` next to `docs/plan/` and `docs/kb/`. The web files also go to `apps/web/public/` (§11), and a CI check keeps both copies byte-identical (test-plan U-WEB-09).

---

## 2. Logo system

The mark is a cooking pot that is also a chat bubble with typing dots: the group's money and the group's conversation are the same thing. Marigold and eggplant carry the whole identity.

**Which file, when**

| Situation | File |
|---|---|
| 33 px and up (app icon, avatar, a header without the name) | `pot-mark.svg` |
| 32 px and below (tab favicon, tiny avatars) | `pot-mark-small.svg` |
| Header, invite landing, README, slides | `pot-lockup-on-light.svg` (Day) or `pot-lockup-on-dark.svg` (Night) |
| Empty states, loading, a link preview | `pot-glyph-eggplant.svg` on light and marigold grounds; `pot-glyph-marigold.svg` on Night |
| The name alone, set big | `pot-wordmark.svg`, only where the mark or glyph is also present |

The artifact's file list says "40 px and up" for `pot-mark.svg`, while its minimum-size rule switches to the small cut only below 33 px. Sizes from 33 to 39 px use `pot-mark.svg`.

**Geometry**
- Tile: 512 × 512 with a 112-unit corner radius (22 %; `tokens.json` records this ratio with `radius-lg`).
- Lockup (viewBox 1265 × 512): the wordmark's x-height is 0.42 of the tile height (490 font units × 0.43878 = 215 of 512), centred on the tile. The gap from tile to wordmark is 0.22 of the tile (112 of 512).
- **Clear space:** a quarter of the tile height on every side (128 units at 512; 10 px around a 40 px mark).
- **Minimum sizes:** mark 16 px; lockup 96 px wide (its tile is then about 39 px).
- **Small-size cut:** at 32 px and below, `pot-mark-small.svg` scales the pot 1.06 around its centre and grows the dots from r 18 to r 26 units, so they still read as three dots after pixel rounding (tab bar, favicon).

**Do not**
- Recolour it. The mark is always marigold `#ffb320` and eggplant `#2b1b3a` and never changes between Day and Night. Only the lockup's wordmark colour switches.
- Remove the typing dots, add a coin or a dollar sign to the pot, or flip the bubble tail.
- Capitalise the wordmark.
- Use the pot-bubble as an icon inside a button.

**Name.** In copy the product is "Pot", with a capital P. Only the wordmark is lowercase. "Pot" is a common word in group-payment products (Collctiv pots, Happy Pot, Potje, Monzo Shared Pots, and PotLock's "Pots" on NEAR), so the mark carries recognition, not the name. Always show the mark with the name (D-67, H-06).

---

## 3. Colour

Values come from `tokens.json`. The contrast ratios are WCAG 2.x, computed on 2026-10-21 from those values against `ground` / `surface` / `surface-sunken`. Where a range is shown, the lowest value is on `surface-sunken`. Every claim in the artifact was re-checked and holds.

| Token | Day | Night | Role and usage | Contrast (Day · Night) |
|---|---|---|---|---|
| `ground` | `#faf9f6` | `#1c1424` | Page background; also the `theme-color` for each theme | — |
| `surface` | `#ffffff` | `#261c30` | Cards, sheets, the Pot hero, list groups | — |
| `surface-sunken` | `#f1eee9` | `#33283f` | Inputs, the amount keypad, segmented controls, hovered rows | every text token ≥ 4.5:1 on it, in both themes |
| `line` | `#e6e1da` | `#3f3350` | Dividers between feed items and rows. Decorative only | 1.1-1.3 · 1.2-1.5 (decorative) |
| `line-strong` | `#8f8597` | `#8e819e` | Input and secondary-button borders, unchecked controls | 3.0-3.5 · 3.8-4.9 (≥ 3:1 non-text) |
| `ink` | `#2b1b3a` | `#f6f1ea` | Primary text, balances, the wordmark | 13.7-15.9 · 12.3-15.9 |
| `ink-muted` | `#645a70` | `#bdb2c8` | Secondary text: who and when in the feed, helper copy, "Your share" | 5.6-6.5 · 6.8-8.8 |
| `brand` | `#ffb320` | `#ffb320` | Marigold, the logo tile. The primary button's fill (for example the Add money and Spend sheets' CTAs) and the goal bar fill. One marigold button per screen. **Never text** | `on-brand` on it 8.9; vs Day ground only 1.7, hence the Day border |
| `brand-soft` | `#ffe7a8` | `#4a3a22` | Goal bar track, selected chip, the highlight behind "Approved by Pot rules" | `ink` on it 13.1 · 9.7; `ink-muted` 5.3 · 5.4 |
| `brand-deep` | `#b87800` | `#e39a00` | Pressed primary button; in Day also the 1 px border on marigold buttons | 3.5 on Day ground (a border, not text); `on-brand` text on it 4.3 · 6.7 (the brief pressed state) |
| `on-brand` | `#2b1b3a` | `#2b1b3a` | Text and icons on marigold: eggplant, the logo's pot | 8.9 on `brand`. Never on Night `brand-soft` (1.45) |
| `link` | `#5b3a8c` | `#ffc94d` | Inline links and text buttons such as "View details" | 7.5-8.7 · 9.1-11.7 |
| `focus` | `#5b3a8c` | `#ffc94d` | Focus ring: 2 px solid, 2 px offset, on every interactive element | as `link`. Against a marigold button 4.8 · 1.2, so the 2 px offset gap is required in Night |
| `approved` | `#1e7a54` | `#5fd3a0` | Approved, money arrived, Pot closed. Always with an icon and a word | 4.6-5.3 · 7.5-9.6; only 4.35 on Day `brand-soft` |
| `waiting` | `#2d5bc9` | `#93b0ff` | Waiting for approvals ("1 of 2 approvals", "Sent to the group"). Blue, so it differs from `approved` in hue and lightness | 5.3-6.1 · 6.5-8.4 |
| `declined` | `#c0373c` | `#ff8a8f` | Not approved, failed deposit, refunded. Always with an icon and a word | 4.7-5.5 · 6.1-7.9 |
| `member-1`…`member-6` | §4 | §4 | Member avatar backgrounds | §4 |

**Rules**
1. **One marigold button per screen**, with `on-brand` text. In Day, add a 1 px `brand-deep` border, because marigold against the Day ground is only 1.7:1. Night has no border (10:1). Every other button is secondary: `surface` fill (transparent in Night), `line-strong` border, `ink` text.
2. **Marigold is never text**, and neither is `brand-deep`. On `brand-soft`, text is `ink` or `ink-muted`: `on-brand` fails there in Night (1.45:1), and `approved` green fails there in Day (4.35:1). Put the state colour on the icon, where 3:1 is enough.
3. **The goal bar** fill against its track is 1.5:1 in Day (6.1:1 in Night). That is acceptable only because the bar always has its text twin ("$450 of $450 collected"), so the bar never carries information alone. Never ship the bar without the sentence.
4. `line` is decorative. Any boundary people need to see (inputs, secondary buttons, unchecked controls) uses `line-strong`.
5. Keep the 2 px `focus` offset. In Night the ring colour sits close to marigold (1.2:1), and the gap of `ground` between the ring and the button keeps it visible (11.7:1 against Night ground).

---

## 4. State and member colours

**States: always an icon, a word and the colour together.** Never colour alone, and never a dot instead of the icon (the canvas pills use dots; the rule wins).

| State | Token | Lucide icon | Words (ux-spec keys) | Where |
|---|---|---|---|---|
| Approved, money arrived, Pot closed | `approved` | `check` | "Approved", "Sent", "Approved by Pot rules" (`chip.approved`, `chip.sent`, `spend.approved`) | status chips, feed sub-lines, incoming "+ $150.00" amounts |
| Waiting for the group | `waiting` | `clock` | "Needs approval", "1 of 2 approvals", "Sent to the group" (`chip.needs`, `approve.progress`, `spend.vote_sent`) | chips, ApprovalMeter, the Requests tab badge |
| Declined, failed, refunded | `declined` | `x` | "Not approved", "Not sent yet" (`chip.declined`, `chip.failed`) | chips, inline errors |

- `chip.sending` ("Sending…") and `chip.expired` ("Expired") are neutral: `ink-muted` with an icon. The brand defines only the three states above.
- On the `brand-soft` highlight (an instant-approval row, the result card), "Approved by Pot rules" is set in `ink`, and only the `check` icon is `approved`, because green text on Day `brand-soft` is 4.35:1.
- Chips are `radius-pill`, `label` type, on `surface-sunken`, as on the Colour and type board.
- The Requests tab badge counts what is waiting on you, so it uses a `waiting` fill with `surface` text (6.1:1 Day, 7.7:1 Night), not red (§12 #11).

**Member avatars.** Colours are assigned in join order. The initials are eggplant `on-brand` in both themes.

| Token | Hex (both themes) | Initials contrast |
|---|---|---|
| `member-1` | `#ffd166` | 11.0:1 |
| `member-2` | `#9ad7c2` | 9.8:1 |
| `member-3` | `#b8c7ff` | 9.6:1 |
| `member-4` | `#f5b3c8` | 9.2:1 |
| `member-5` | `#d7c1f0` | 9.7:1 |
| `member-6` | `#c9e3a6` | 11.4:1 |

- Colour = `member-((join_index mod 6) + 1)`, where `join_index` comes from `get_members` (`MemberView.join_index`, 0 = the creator; contracts-spec §4). Members 7 and up reuse the cycle. A person keeps the same colour on every screen of that Pot: feed, Members, the Approve sheet, Requests.
- In the demo: Maya `member-1`, Sam `member-2`, Leo `member-3`.
- An invited person who hasn't joined has no join index. Plan default: `surface-sunken` with `ink-muted` initials.
- Overlapping avatars in a stack overlap by `space-2` (8 px), with a 2 px ring in the colour they sit on (`ground` or `surface`).

---

## 5. Type

**Families**
- **Gabarito** (`--font-display`) for the wordmark (outlined in the SVG, never typeset), balances, Pot names and headings. Stack: `Gabarito, Figtree, system-ui, sans-serif`.
- **Figtree** (`--font-sans`) for everything else. Stack: `Figtree, system-ui, -apple-system, "Segoe UI", sans-serif`.
- Both are OFL fonts on Google Fonts, and both are in `next/font/google` for next **16.4.2**, read from that version's `font-data.json` (tarball from `npm pack next@16.4.2`, 2026-10-21):
  - Gabarito: variable `wght` 400-900, normal only, subsets `latin` and `latin-ext`.
  - Figtree: variable `wght` 300-900, normal and italic, subsets `latin` and `latin-ext`.
  - next's capsize metrics include both, so `adjustFontFallback` (on by default) produces a size-adjusted fallback, which keeps layout shift on swap small.

**Styles.** Use rem so text follows the browser setting and D-45's Dynamic Type. The px values below assume the 16 px root.

| Style | Family | Size / line height | Weight | Letter spacing | Usage |
|---|---|---|---|---|---|
| `wordmark` | display | 40 / 40 px | 800 | — | Reference only: the wordmark ships as outlines (`pot-wordmark.svg`). Always lowercase |
| `balance-hero` | display | 44 / 48 px (2.75 / 3 rem); **36 px below 360 px wide** | 800 | −0.02em | The Pot balance in the hero. Also the big amount in the Approve sheet, the keypad display and the result card. Tabular figures |
| `title` | display | 26 / 30 px | 700 | −0.01em | Pot name, screen titles |
| `heading` | display | 19 / 24 px | 700 | 0 | Section and sheet headings |
| `body` | sans | 16 / 24 px | 400 | 0 | Default text. Also inputs: 16 px keeps iOS Safari from zooming |
| `body-sm` | sans | 14 / 20 px | 400 | 0 | Feed meta, helper text, captions, in `ink-muted` |
| `label` | sans | 15 / 20 px | 600 | 0 | Buttons, tabs, chips. Sentence case |
| `amount` | sans | 17 / 24 px | 700 | 0 | Amounts in the feed and member list. Tabular figures; incoming prefixed "+" |

**Tabular figures: verified on 2026-10-21.** Method: the woff2 files next/font self-hosts were fetched from the Google Fonts css2 API with next 16.4.2's own user agent (Chrome/104), plus the static TTFs, and inspected with fontTools 4.67.0 in a scratch venv.
- **Both fonts have the OpenType `tnum` feature** (and `pnum`), in the static TTFs and in the variable latin woff2 at every weight Pot uses. No workaround is needed.
- **Both have proportional default figures.** The digit advances vary by 205-232 units per 1000; in Gabarito 800 a "1" is 371 units wide and a "4" is 596. So `font-variant-numeric: tabular-nums` (Tailwind `tabular-nums`) is mandatory on every amount. Without it, a live balance jitters as it updates.
- **With `tnum`, all ten digits share one advance:**

  | Font | Weights and digit advance (units per 1000) |
  |---|---|
  | Gabarito | 400: 540 · 700: 560 · 800: 568 · 900: 576 |
  | Figtree | 400: 623 · 600: 629 · 700: 632 |

- **Only the digits change.** `$`, `.` and `,` stay proportional, so an amount keeps its width while its digit count stays the same. Going from "$66.00" to "$366.00" still adds a digit. Show two decimals everywhere (§9), and give the hero its own left-aligned line, as on the canvas, so a width change never moves other elements.
- **Signs:** "+" and U+2212 "−" have the same advance in both fonts (Gabarito 670; Figtree 623-632), while the hyphen-minus is about 40 % narrower. Write money out with U+2212.
- In code, every amount renders through `MoneyText`, which always adds `tabular-nums` (frontend-architecture §7.2), and test M-22 checks it (test-plan §5.1).

---

## 6. Spacing, radius, shadow, layout

**Spacing.** A 4 px scale. Tailwind v4's default `--spacing: 0.25rem` produces the same numbers, so `p-4` = `space-4`. Use only these steps.

| Token | Value | Usage |
|---|---|---|
| `space-1` | 4 px | Icon-to-label gap |
| `space-2` | 8 px | Chip padding, avatar stack overlap |
| `space-3` | 12 px | Feed item padding |
| `space-4` | 16 px | Page gutter on phones, card padding |
| `space-6` | 24 px | Card padding at 768 px and up, gap between sections |
| `space-8` | 32 px | Section spacing on desktop |
| `space-12` | 48 px | Top margin of the invite landing page |

**Radius.** Friendly and round.

| Token | Value | Usage |
|---|---|---|
| `radius-sm` | 10 px | Inputs and chips |
| `radius-md` | 16 px | Buttons, feed cards, toasts |
| `radius-lg` | 24 px | The Pot hero card, bottom sheets (top corners), dialogs. The logo tile uses the same 22 % ratio at icon size |
| `radius-pill` | 999 px | Avatars, status pills, the goal bar, segmented controls |

**Shadow.** Everything else is flat on `ground` or `surface`.

| Token | Day | Night | Usage |
|---|---|---|---|
| `shadow-card` | `0 1px 2px rgba(43,27,58,.06), 0 8px 24px rgba(43,27,58,.08)` | `0 1px 0 rgba(255,255,255,.04) inset, 0 8px 24px rgba(0,0,0,.35)` | The Pot hero; Pot cards on the Pots home. Plan mapping: also toasts and the sticky CTA bar |
| `shadow-sheet` | `0 -8px 32px rgba(43,27,58,.16)` | `0 -8px 32px rgba(0,0,0,.5)` | Bottom sheets: Add money, Spend, Approve |

**Layout**

| Token | Value | Meaning | In Tailwind |
|---|---|---|---|
| `bp-sm` | 360 px | Below it, `balance-hero` drops to 36 px | custom `xs` breakpoint (`max-xs:`), so shadcn's `sm` (640) is untouched |
| `bp-md` | 768 px | Sheets become centred dialogs; the gutter grows to `space-6` | `md` (Tailwind's default 48 rem) |
| `bp-lg` | 1024 px | Two columns: the Pot on the left, Requests and members on the right | `lg` (default 64 rem) |
| `container-flow` | 440 px | Max width of sheets and flows: Add money, Spend, Approve, the join landing | `max-w-flow` |
| `container-app` | 1080 px | Max width of the app on desktop | `max-w-app` |
| `tap-min` | 44 px | Minimum touch target. Primary buttons are 52 px tall | `min-h-11`; primary `h-13` |

- Designed at 390 px first. Phones have three bottom tabs (Pots, Requests, You). From `bp-lg` the app uses two columns.
- Primary actions sit in the bottom 40 % of the phone screen, 52 px tall and full width. Pinned buttons respect `env(safe-area-inset-bottom)`.
- Sheets (`container-flow`, 440 px) slide up on phones and become centred dialogs from `bp-md`.
- ux-spec keeps its stricter sizes, all above `tap-min`: secondary buttons 48 px, RequestCard buttons ≥ 48 px, list rows ≥ 56 px, keypad keys 64 × 56.

---

## 7. Themes: Day and Night

- **Day is the default and the identity.** **Night** follows `prefers-color-scheme: dark`. People can override it in **You → Settings** ("Appearance": Match my phone · Day · Night; ux-spec §4.15, rev6).
- **`data-theme` goes on `<html>`** (`day` or `night`), set by an **inline script in `<head>` before first paint**, so there is no flash. The override is stored in `localStorage` under `pot-theme`; no entry means "match my phone".
- **The logo never changes between themes.** The lockup swaps only its wordmark file (`on-light` / `on-dark`), and the glyph is eggplant on Day and marigold grounds, marigold on Night.
- **`theme-color`:** Day `#faf9f6`, Night `#1c1424`. Android uses it. Safari 26 ignores `theme-color` and samples the page background instead ([pwa-push.md](../kb/pwa-push.md)), so `html, body` must get `background: var(--pot-ground)`.

```html
<!-- inline in <head>: a parser-blocking script runs before the body paints; this is the whole no-flash mechanism -->
<script>
(function(){var d=document.documentElement,t=null;try{t=localStorage.getItem('pot-theme')}catch(e){}
if(t!=='day'&&t!=='night')t=matchMedia('(prefers-color-scheme: dark)').matches?'night':'day';
d.dataset.theme=t;d.style.colorScheme=t==='night'?'dark':'light'})()
</script>
```

Without JavaScript (for example, the `/demo` HTML an AI judge reads), CSS still applies Night under `@media (prefers-color-scheme: dark) { :root:not([data-theme]) { … } }`. The full implementation is in frontend-architecture §7.1.

---

## 8. Interaction, motion, iconography

**Interaction**
- Real `<button>` and `<a>` everywhere.
- **Hover:** rows lighten to `surface-sunken`, and so do secondary buttons. Tailwind v4's `hover:` already applies only on devices that can hover.
- **Pressed:** the primary button changes to `brand-deep`.
- **Focus:** a 2 px `focus` ring with a 2 px offset, on `:focus-visible`, for every interactive element (`outline: 2px solid var(--pot-focus); outline-offset: 2px`).
- **Optimistic updates** show a "Sending…" chip. Failures revert, with a toast that says what happened (ux-spec §1.4).
- **Disabled** is not defined by the brand. Plan default (Cerasela to confirm): keep the fill at 50 % opacity with `cursor: not-allowed`, and explain on tap (`*.offline` copy). WCAG's contrast minimums don't apply to disabled controls.

**Motion**
- **One celebration.** When Pot rules approve a request, a **600 ms marigold burst** comes from the button, then the line "Approved by Pot rules. $84 sent to you" (ux-spec §6.3).
  - Spec: 10-12 `brand` particles (6-8 px circles) leave the button's centre, travel 40-72 px and scale and fade to 0, ease-out, once.
  - The particles are `aria-hidden` with `pointer-events: none`. The live region speaks only the line.
  - It plays for the person whose request Pot rules approved. It never plays on page load or for other people's approvals, and group approvals get the check and the message without a burst (§12 #14).
- **Typing dots, the brand's one motif.** Two uses only:
  - The **"Checking Pot rules…" loader**: three dots pulse in sequence (opacity 0.35 → 1, a 1200 ms loop, 150 ms stagger) in `ink-muted`.
  - The **empty feed**, as the glyph with its static dots.

  Never use them as decoration. Like every loop, the pulse stops at 5 s (WCAG 2.2.2) and becomes static dots with "Still checking…".
- **Everything else answers the person's own action:** press feedback, sheets in and out, the 500 ms count-up. Durations and easings are in ux-spec §7.6.
- **`prefers-reduced-motion: reduce`:** no burst, just the message. The dots stay still, nothing translates or scales, and number rolls swap instantly. The 1.2 s "Checking Pot rules" beat stays, because it is pacing, not motion.

**Iconography**
- Line icons with a 2 px stroke on a 24 px grid, rounded caps and joins: **Lucide (`lucide-react`) at `strokeWidth={2}`**, which is Lucide's default. This replaces ux-spec's earlier 1.75. Use 20 or 24 px, in `ink` or the state colour (`currentColor`).
- State icons: `check`, `clock`, `x` (§4).
- Icons always come with a text label on primary actions.
- The pot-bubble is a logo, never an icon in a button. Empty states use the glyph. No coins and no piggy banks: the dropped "chip in" direction showed why.
- Suggestion (Cerasela's call): overflow menus could use Lucide `ellipsis-vertical`, so three horizontal dots stay the brand motif.

---

## 9. Content fundamentals

The vocabulary and the copy are owned by **[ux-spec.md](../plan/ux-spec.md)**:
- §1.2 vocabulary ("Never show" / "Show instead"), §1.3 money formatting, §1.4 tone;
- §5, every string by `en.json` key;
- the jargon lint (D-44) enforces the vocabulary.

Where the artifact's short "Never show / Show instead" table differs, ux-spec wins: "the group", not "organizers"; measured timing copy; where refunds go (§12 #3, #4, #6).

The brand's principles apply to every string:
- Write for Leo, who has never used crypto and wants to pay his share in under 2 minutes. No crypto words in any main path.
- Every screen answers two things: how much is in the Pot, and what is needed from me.
- Sentence case, plain verbs: "Add money", "Spend", "Approve", "Close Pot".
- An action keeps its name: "Add $150" → "Adding $150…" → "Added." (ux-spec `add.*`).
- Rules are sentences: "Anyone can spend up to $100 without asking."
- Errors say what happened, whether money moved and what to do, without apology.
- Waiting copy gives a time. Use ux-spec's measured timing ("Usually under a minute" for conversions; measured 18-84 s, D-50), not "1 to 3 minutes".
- **Money:**
  - Every displayed amount has two decimals and tabular figures, the hero included ("$450.00").
  - In the feed's amount column, money in is "+ $150.00" and money out "− $84.00", always beside the words of the row's sentence.
  - Sentences and buttons keep whole dollars where the amount is whole: "Your share $150", "Add $150" (ux-spec §1.3, rev6).
- **Tagline:** "Group chat money that follows its own rules." It is used in the manifest, the OG image, the README and the meta description.

---

## 10. Tokens, fonts and theme in code

The full sketch is frontend-architecture §7 (Tailwind v4 `@theme`, shadcn base-nova). The naming scheme:

| Layer | Naming | Example |
|---|---|---|
| Raw token, switched per theme | `--pot-<token>`, exactly the `tokens.json` names | `--pot-ground`, `--pot-ink-muted`, `--pot-brand`, `--pot-member-3`, `--pot-shadow-sheet` |
| Tailwind theme (`@theme inline`) | `--color-<token>`, `--text-<style>`, `--radius-*`, `--shadow-*`, `--container-*`, `--font-display` / `--font-sans` | `bg-ground text-ink`, `border-line-strong`, `bg-brand text-on-brand`, `font-display text-balance-hero tabular-nums`, `rounded-lg shadow-sheet max-w-flow` |
| shadcn variables | `--background`, `--primary`, `--ring`… pointing at `--pot-*` | `--primary: var(--pot-brand)`, `--primary-foreground: var(--pot-on-brand)`, `--ring: var(--pot-focus)` |

- `apps/web/app/tokens.css` is **generated** from `tokens.json` (at `docs/brand/tokens.json` in the repo) by `scripts/gen-tokens.mjs` (F-01). The output is committed, and CI fails on a diff, so the code can't drift from the artifact.
- Ban the classes `text-brand*` with a lint rule (marigold and `brand-deep` are never text).
- Make shadcn's Button default to the secondary variant, so marigold is opt-in (`variant="primary"`). Test M-20 enforces one per screen.

```ts
// app/fonts.ts: variable fonts (no `weight` = the whole wght axis). display 'swap' and a size-adjusted fallback are next/font defaults.
import { Gabarito, Figtree } from 'next/font/google'
export const display = Gabarito({ subsets: ['latin'], variable: '--font-display', fallback: ['Figtree', 'system-ui', 'sans-serif'] })
export const sans = Figtree({ subsets: ['latin'], variable: '--font-sans', fallback: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'] })
// `subsets` only picks what is preloaded: next keeps every @font-face from Google's CSS, so latin-ext (ă, ș, ț in names) still loads on demand.
```

The latin variable woff2 files are 34 KB (Gabarito) and 20 KB (Figtree). The OG image renderer needs TTFs instead (§11).

---

## 11. Web assets in Next.js 16

**Files.** Copy these to `apps/web/public/` with the same names, so the brand's paths stay valid:
- `favicon.ico`, `favicon.svg`, `apple-touch-icon.png`;
- `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`;
- `og-image.png`.

Also:
- `badge-96.png` is the monochrome Android notification badge, which is not in the pack. Derive it in F-23 from `pot-glyph-eggplant.svg` as an alpha mask: Android draws only its alpha, in the system colour, so it is a platform mask, not a recoloured logo.
- Don't add `app/favicon.ico`, `app/icon.*` or `app/apple-icon.*`. Those file conventions emit a second set of tags. Use one mechanism: `public/` plus the metadata API.

**`app/manifest.ts`.** This replaces `site.webmanifest`. It keeps the brand's name, description, colours and icons, and adds the plan's fields (frontend-architecture §8.1):

```ts
import type { MetadataRoute } from 'next'
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/', name: 'Pot', short_name: 'Pot',
    description: 'Group chat money that follows its own rules.',   // = en.json app.description
    start_url: '/pots?source=pwa', scope: '/', display: 'standalone', orientation: 'portrait',
    background_color: '#faf9f6', theme_color: '#faf9f6',             // Day ground; Night is set per media in `viewport`
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // plus screenshots, categories, lang, dir, prefer_related_applications (frontend-architecture §8.1)
  }
}
```

`start_url` differs from the brand file's `/` on purpose: installed users land on their Pots. Next emits `<link rel="manifest">` itself.

**Head tags.** Use the metadata API in the root `app/layout.tsx`, not a pasted `head-snippet.html`:

```ts
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL!),          // makes og:image absolute (the snippet's YOUR-DOMAIN)
  title: { default: 'Pot', template: '%s · Pot' },
  description: 'Group chat money that follows its own rules.',
  applicationName: 'Pot',
  appleWebApp: { capable: true, title: 'Pot', statusBarStyle: 'default' },   // apple-mobile-web-app-title
  icons: {
    icon: [{ url: '/favicon.ico', sizes: '48x48' }, { url: '/favicon.svg', type: 'image/svg+xml' }],
    apple: '/apple-touch-icon.png',
  },
  openGraph: { type: 'website', siteName: 'Pot', title: 'Pot', description: 'Group chat money that follows its own rules.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Pot: group chat money that follows its own rules' }] },
  twitter: { card: 'summary_large_image' },   // no twitter.images: X falls back to og:image, so /j pages show their own image
  formatDetection: { telephone: false },
}
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover', interactiveWidget: 'resizes-content',
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf9f6' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1424' },
  ],
}
```

- **Fonts come from next/font** (self-hosted at build time), so drop the snippet's Google Fonts `<link>` and `preconnect` tags. The browser makes no runtime request to Google, and the CSP needs no extra host.
- **A manual Day/Night override** doesn't change the media-matched `theme-color` metas. The theme setting updates their `content` on the client (only Android reads it).
- **The no-flash script (§7) goes in the root layout's `<head>`.** It is static content, so if F-25's report-only CSP gains `script-src`, allow it by its sha256 hash.

**OG image**
- **`og-image.png` is the site-wide default** for every route, and the card for any Pot link posted to X, WhatsApp, Telegram or iMessage.
- **Invite links (`/j/[slug]`) get their own image** from `app/j/[slug]/opengraph-image.tsx` (F-24): "{inviter} invited you to {potName}", the emoji and the member count, no balance (frontend-architecture §2.5). It is drawn in the brand's look: marigold ground, the eggplant glyph, the title in Gabarito 800 eggplant, the lowercase wordmark.
- `ImageResponse` (Satori) can't read woff2. Commit the static TTFs (Gabarito ExtraBold, Figtree SemiBold, OFL) under `apps/web/assets/fonts/`.
- Until F-24 lands, and whenever the image route throws, it returns the bytes of `og-image.png`.

---

## 12. Plan reconciliations

These are the places where the brand material (the artifact's README, the canvas mockups) and the plan disagree, with the resolution. "Docs" names the plan files updated on 2026-10-21. Changes to ux-spec are marked "(rev6)" there for Cerasela to review.

| # | Topic | Brand material | Plan | Resolution: which wins | Docs |
|---|---|---|---|---|---|
| 1 | Login buttons | Invite mock: [Continue with Google] [Continue with Apple] [Continue with email] | D-20: the testnet NEAR Auth tenant has Google and email + password (plus passkeys where the tenant offers them), **no Apple** | **Plan.** On testnet: [Join with Google] (the screen's one marigold button), [Continue with email] (secondary), then "More ways to join" (passkey if offered; "I have a NEAR wallet"). Apple appears only if the tenant adds it (`FLAG_APPLE`). The Google label stays ux-spec's "Join with Google", because one tap signs in **and** joins | ux-spec §4.1, §6.1, §13; frontend-architecture §5.1; phase0 §5 |
| 2 | Demo numbers and cast | Mocks: "Leo wants $400 for the boat", "1 of 3 approved", "$366.00"; Ana adding money from Base; a $900 goal; the landing at $450 | D-61: Maya, Sam and Leo; Leo joins at $300 of $450; $84 groceries → $366; a **$300** boat requested by **Maya**, whose own approval is counted automatically → "1 of 2 approvals", and Leo's is the 2nd → $66 → $22.00 each | **Plan** for the demo, README, video and tests. The mocks are illustrative. ($366.00 is right after the groceries; the $400 request was the original plan's bug, decisions §1 row 17) | — (no plan change) |
| 3 | Who decides | Artifact README: "Vote, council → Approve, organizers" | ux-spec §1.2, D-60, §1 row 17: "the group" (member majority); "organizers" is banned by the jargon lint | **Plan: "the group".** "Organizers" only for a future Club preset that has an organizer role | — |
| 4 | Waiting time | "Converting to Pot dollars, usually 1 to 3 minutes" | D-50: measured p50 18-84 s; `xc.step.converting` "Usually under a minute"; "Taking longer" at 5 min | **Plan:** ux-spec's timing copy | — |
| 5 | Palette, type, dark mode | Marigold + eggplant; Gabarito + Figtree; Day + Night | ux-spec §7: provisional terracotta `#B4441F` + honey, ink `#1F1A17`; Inter or Geist; "dark mode out of scope". D-45: Geist | **Brand.** The provisional tokens, Geist and Inter are superseded, and Night is in scope | decisions D-45, D-67, H-10; ux-spec §0, §7, §8, §13; frontend-architecture §0, §7, §8; kb/frontend-stack |
| 6 | Refund copy | Example error: "Your money went back to your Base wallet" | D-50: `refundTo` = the member's NEAR account with `refundType: INTENTS`, so refunds land in their NEAR Intents balance, not the origin wallet | **Plan:** ux-spec `xc.refunded` ("Your money is safe and wasn't added to the Pot") | — |
| 7 | Approval count wording | State table: "2 of 3 approved"; mock: "1 of 3 approved" | ux-spec `approve.progress` "{count} of {k} approvals", where k = approvals needed (2 of 3 members) | **Plan** for the words ("1 of 2 approvals"); **brand** for the look (`waiting`, `clock` icon) | — |
| 8 | Marigold buttons on the Pot screen | Mock: marigold [Add money] in the hero **and** a marigold [Approve] on the pending card, against the brand's own rule | Brand rule + ux-spec §1.1 #2: one primary action per screen; ux-spec §4.4: Add money is filled | **The rule.** On the Pot screen, Add money is the marigold button. RequestCard buttons ([Approve], [Review], [Decline]) are secondary. Approve is marigold inside the Approve sheet. Cerasela may instead make the pinned request the marigold action, but only one | ux-spec §3, §4.4; frontend-architecture §7.5 (Button variants); test-plan M-20 |
| 9 | Status chips | Colour and type board: a coloured dot + word | Artifact README and ux-spec StatusChip: icon + word + colour | **Artifact README:** Lucide `check` / `clock` / `x`, not dots | — |
| 10 | Off-token sizes in mocks | Button labels 16 px/700; feed text 14/12 px; sheet radius 28 px; hero 40 px; Pot title 24 px; feed buttons ≈ 40 px tall, radius 12 | `tokens.json`: `label` 15/600, `body` 16, `body-sm` 14, `radius-lg` 24, `balance-hero` 44, `title` 26, `tap-min` 44, `radius-md` 16; ux-spec: RequestCard buttons ≥ 48 px | **Tokens.** The mocks are illustrative | — |
| 11 | Requests tab badge | Mock: `declined` red with white text (that pair would be 2.3:1 in Night) | Brand rule: state colours carry meaning; the badge counts items **waiting** on me | **The rule:** a `waiting` fill with `surface` text (6.1:1 Day, 7.7:1 Night) | — |
| 12 | Hero decimals | `balance-hero` sample "$450.00"; "dollars with 2 decimals" | ux-spec §1.3: "the hero drops .00 for whole amounts ('$450')" | **Brand:** two decimals on every displayed amount, which also keeps the tabular hero's width stable while it updates. Whole dollars stay in sentences and buttons | ux-spec §1.3, §4.4; frontend-architecture §7.5 `MoneyText` |
| 13 | Signed amounts | Feed column "+ $150.00", "- $84.00" | ux-spec §1.1 #4: "never '+$142'"; every number carries words | **Both:** the row's sentence carries the words, so the column may show the sign; the sign is never the only cue. Use U+2212 "−" | ux-spec §1.3 |
| 14 | Celebration | "One celebration: when Pot rules approve a request, a 600 ms marigold burst" | ux-spec §6.3: a 12-particle honey/terracotta burst plus a `success-subtle` tint; §4.10 also bursts when your vote completes a group approval | **Brand:** one marigold burst, only for "Approved by Pot rules"; the result card's highlight is `brand-soft`; group approvals get the check and `approve.final` without a burst | ux-spec §4.10, §6.3, §7.6; frontend-architecture §5.4, §7.4 |
| 15 | Loading motif | "The three typing dots… the loading indicator ('Checking Pot rules') and the empty feed" | ux-spec §7.6, frontend-architecture §7.4: a shimmer, and a static `honey-subtle` tint under reduced motion | **Brand:** the typing-dots loader | ux-spec §7.6; frontend-architecture §7.4 |
| 16 | Icons and illustration | Lucide at stroke 2; the glyph for empty states; never a coin on the pot | ux-spec §7.7: lucide 1.75 stroke; spot illustrations "pot, coins, friends" in honey/terracotta | **Brand** | ux-spec §7.7; frontend-architecture §1.1 |
| 17 | Focus ring | 2 px `focus` (plum `#5b3a8c` Day, `#ffc94d` Night), 2 px offset | ux-spec §7.1, §8: a 2 px ink ring | **Brand** | ux-spec §7.1, §8; frontend-architecture §10 |
| 18 | Content width and desktop | `container-flow` 440, `container-app` 1080, two columns at `bp-lg` | ux-spec §2: content max-width 480 px, centred on desktop | **Brand** (the Dialog at ≥ 768 px already matched `bp-md`) | ux-spec §2; frontend-architecture §2.5, §7.3 |
| 19 | Avatar colours | `member-1`…`member-6` in join order, eggplant initials | ux-spec §7.1 tints (peach, sand, sage, mist, lilac, rose); frontend-architecture: tint "picked by hash"; api-spec §0.3 `AvatarTint` + `PATCH /api/me` and data-model §2.1 `avatar_tint`: a per-user profile tint | **Brand:** the colour comes from `join_index` (§4). **Not edited here:** api-spec and data-model still carry `avatar_tint`, which the UI no longer reads (P1 can drop it or leave it unused) | ux-spec §7.1; frontend-architecture §7.5 |
| 20 | Link preview | Web README: "Invite links unfurl with" `og-image.png` | ux-spec §2, frontend-architecture §2.5, F-24: a per-invite OG image ("{inviter} invited you to {potName}") | **Both:** `og-image.png` is the site default and the fallback; the per-invite image wins on content and follows the brand on look (§11) | frontend-architecture §2.5; implementation-plan F-01, F-24 |
| 21 | Manifest and icons | `site.webmanifest`: `start_url "/"`, 3 PNG icons, `#faf9f6`; icons at the site root | frontend-architecture §8.1: `start_url /pots?source=pwa`, `id`, `scope`, screenshots, an extra `icon.svg`; icons under `/icons/`; `#FBF7F2` | **Brand** for name, description, colours, icons and paths (the SVG icon entry is dropped; the small-cut favicon isn't meant for large icons); **plan** for `start_url` and the extra fields | frontend-architecture §1.2, §8.1, §8.2 |
| 22 | Settings | "Night… overridable in You, Settings" | ux-spec §4.15 You: no theme setting | **Brand:** a new "Appearance" row (Match my phone · Day · Night); copy keys proposed (rev6, ⓟ) | ux-spec §4.15, §5.13 |
| 23 | Tagline | "Group chat money that follows its own rules." | submission-plan README line "group money that follows its own rules" | **Brand** tagline everywhere | submission-plan §1.1 |
| 24 | Keypad and result amount | No style beyond `balance-hero` | ux-spec §7.2 `display-amount` 56/60 px, shrinking to 40 | **Brand:** `balance-hero` (as in the canvas's Approve sheet). Cerasela can add a larger style to the artifact if the keypad needs one | ux-spec §7.2; frontend-architecture §7.1 |
| 25 | Product name | "Pot", lowercase wordmark; "the mark, not the name, carries recognition" | H-06 / D-62 open (PotLock "Pots" collision) | **Decided: "Pot".** The unique submission `projectName` is still a human decision (H-14) | decisions D-62, H-06; phase0 H-06 |
