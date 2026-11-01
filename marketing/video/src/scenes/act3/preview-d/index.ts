// Builder D's own preview entry (s09-instant, s10-group), separate from src/index.ts:
//   npx remotion studio src/scenes/act3/preview-d/index.ts
//   npx remotion still src/scenes/act3/preview-d/index.ts S09Instant out/stills/s09-instant/x.png --frame=354 --scale=0.5
import { registerRoot } from "remotion";
import { DPreviewRoot } from "./Root";

registerRoot(DPreviewRoot);
