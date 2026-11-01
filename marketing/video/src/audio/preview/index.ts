// Audio-agent preview entry (kept out of src/Root.tsx): renders the soundtrack alone for checks.
//   npx remotion render src/audio/preview/index.ts SoundtrackVO out/audio-tmp/soundtrack-vo.wav --codec=wav
import { registerRoot } from "remotion";
import { AudioPreviewRoot } from "./Root";

registerRoot(AudioPreviewRoot);
