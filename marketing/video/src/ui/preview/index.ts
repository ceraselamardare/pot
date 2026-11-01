// Standalone preview entry for the UI kit (does not touch src/Root.tsx):
//   npx remotion still src/ui/preview/index.ts <CompId> out/stills/ui/<name>.png --frame=<n> --scale=1
import { registerRoot } from "remotion";
import { UiPreviewRoot } from "./Root";

registerRoot(UiPreviewRoot);
