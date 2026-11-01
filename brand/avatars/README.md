# Pot avatars

Ten brand pictures a person can pick in **You → Profile → Avatar** instead of their initials. With no pick, a person keeps the initials seat on their member colour (README §4), exactly as before.

- **Files:** `pot-01.svg` … `pot-10.svg`. They are byte-identical to `apps/web/public/avatars/` (the app serves them from there), and a unit test (`components/__tests__/avatars.test.tsx`) checks that the copies match.
- **Review sheets:** `notes/screens/avatars-{day,night}.png` (24/32/64/96 px, plus stacks mixed with initials), `notes/screens/avatars-picker-{day,night}.png` and `notes/screens/avatars-pot-{day,night}.png`.

## The set

| id | Name (picker label, `avatar.*`) | Alt text (docs, design files) | Disc |
|---|---|---|---|
| `pot-01` | Pot pal | A smiling cooking pot with a lid and rosy cheeks | `brand-soft` |
| `pot-02` | Sun | A smiling sun with eight rays | `member-3` |
| `pot-03` | Cat | A dark cat's face with marigold eyes | `member-4` |
| `pot-04` | Rocket | A rocket climbing to the upper right, marigold flame | `member-5` |
| `pot-05` | Sprout | A two-leaf sprout in a marigold flower pot | `member-6` |
| `pot-06` | Wave | A curling ocean wave with two drops of spray | `member-2` |
| `pot-07` | Party hat | A striped party hat with confetti | `member-1` |
| `pot-08` | Mountains | Two snow-capped peaks under a marigold sun | `member-3` |
| `pot-09` | Noodle bowl | A bowl of noodles with an egg and chopsticks | `member-4` |
| `pot-10` | Bird | A round dark bird with a marigold beak | `member-2` |

**In the app, the accessible name of an avatar is the person's name** (ux-spec WCAG 1.1.1, "Avatars alt = name"), never the picture's name. The `<img>` inside the round seat has `alt=""`. The picture names above are used only as the picker's radio labels.

## Rules the set follows

- **One family.** Every picture is one chunky eggplant (`#2b1b3a`) subject, in the logo's language, on a full disc of one member tint or `brand-soft`.
  - Marigold (`#ffb320`) is the accent. It sits on eggplant, or has an eggplant edge, because marigold and the tints have almost the same lightness.
  - Small highlights use the Day ground (`#faf9f6`).
- **Colours:** tokens only: `member-1..6`, `brand`, `brand-soft` (Day value), `on-brand`/eggplant and the Day ground. The pictures are the same in Day and Night, like the member colours and the logo.
- **Fit:**
  - The disc fills the 96 × 96 viewBox (r 48).
  - Each subject stays at least about 4 units inside the disc's edge, so on the dark Night ground every silhouette is ringed by its tint and never merges into the page.
  - The 2 px stack ring (`ground`/`surface`) still separates neighbours.
- **Legibility:** they read at 24 px (the `xs` seat) and are crisp at 96 px. Details that vanish at 24 px (eyes, spray) are extras, never the thing that identifies the picture.
- **Not the logo.** Pot pal is a character inspired by the pot-bubble, but it has no bubble tail and no typing dots, it has a face, and it sits on a round `brand-soft` disc rather than the marigold tile. The logo itself is never an avatar.
- **No money imagery:** no coins, dollar signs or piggy banks (README §8). No emoji, and no real people.
- **File hygiene:** `viewBox="0 0 96 96"`, no `<style>`, `<text>`, `<image>` or external refs, and under 2 KB each (the whole set is 6.6 KB). The component supplies `role`/`aria-label`.

## In code

- **Ids:** `apps/web/lib/avatars.ts` defines `AVATAR_IDS`, `isAvatarId` and `avatarOrNull`. An unknown id falls back to initials and never renders a broken image.
- **Rendering:** `components/pot/Avatar.tsx` renders `person.avatar` when it is set, and the initials seat otherwise.
- **Storage:** `app_user.avatar` (migration `0002_user_avatar.sql`, with `CHECK ^pot-(0[1-9]|10)$`), written by `PATCH /api/me` `{ avatar: "pot-03" | null }`.
- **Where it is returned:** `GET /api/session` (`session.avatar`) and the feed's `profiles[account].avatar`.
