// The /demo dataset's types (plan/design-direction/05 §7.3). The source of truth is
// packages/pot-sdk/src/demo/types.ts, next to the generator; this file only re-exports them so
// the page can `import type { DemoScript } from "./_data/types"`. Type-only: no sdk code reaches
// the bundle. The data is ./demo-script.json (generated: `pnpm gen:demo`; never edit by hand).
export type * from "@pot/sdk/demo"
