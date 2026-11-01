# apps/web: notes for coding agents

- Read `CLAUDE.md` at the repo root, then `plan/frontend-architecture.md` (in the product repo: `docs/plan/`).
- Platform setup, commands and versions: `notes/platform.md`.
- Next.js 16.4.2 with Cache Components on (D-43): read `params`/`searchParams`/`cookies()`/`headers()` only inside
  `<Suspense>`, and never export `dynamic`/`revalidate`/`fetchCache`/`dynamicParams`/`runtime` from a segment.
- Version-matched Next docs ship in `node_modules/next/dist/docs/`. `next dev` maintains its own block below.
- Brand: tokens only (`app/tokens.css` is generated: `pnpm --filter web gen:tokens`), one marigold
  `<Button variant="primary">` per screen, `tabular-nums` on every amount, Lucide at stroke 2.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
