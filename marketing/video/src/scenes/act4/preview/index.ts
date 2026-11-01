// Builder E's preview entry (own registerRoot; another builder's half-finished scene can't break these renders):
//   npx remotion still src/scenes/act4/preview/index.ts S11Close out/stills/s11/x.png --frame=200 --scale=0.5
//   npx remotion render src/scenes/act4/preview/index.ts S12Tech out/scenes/s12-tech.mp4 --scale=0.5
import { registerRoot } from "remotion";
import { ActFourPreviewRoot } from "./Root";

registerRoot(ActFourPreviewRoot);
