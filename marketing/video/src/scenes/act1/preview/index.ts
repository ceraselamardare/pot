// Act 1 preview entry (builder A). Separate from src/index.ts so other builders' work can't break these renders.
//   npx remotion still src/scenes/act1/preview/index.ts A1-S01Hook out/stills/s01-hook/x.png --frame=60 --scale=0.5
import { registerRoot } from "remotion";
import { Act1PreviewRoot } from "./Root";

registerRoot(Act1PreviewRoot);
