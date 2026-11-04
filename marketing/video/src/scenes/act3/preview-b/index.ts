// Builder B preview entry for s10b-more (its own registerRoot, so other builders' half-finished code can't break it):
//   npx remotion studio src/scenes/act3/preview-b/index.ts
//   npx remotion still src/scenes/act3/preview-b/index.ts S10bMore out/stills/s10b-more/f000.png --frame=0 --scale=0.5
import { registerRoot } from "remotion";
import { PreviewBRoot } from "./Root";

registerRoot(PreviewBRoot);
