// Builder C preview entry (s07-create, s08-join): its own registerRoot, so other builders' half-finished code
// can't break these renders.
//   npx remotion still src/scenes/act3/preview-c/index.ts S07Create out/stills/s07-create/f000.png --frame=0 --scale=0.5
import { registerRoot } from "remotion";
import { PreviewCRoot } from "./Root";

registerRoot(PreviewCRoot);
