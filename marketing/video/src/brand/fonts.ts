// Brand type: Gabarito (display) + Figtree (text). Import this module once (Root.tsx does) before using the families.
import { loadFont as loadGabarito } from "@remotion/google-fonts/Gabarito";
import { loadFont as loadFigtree } from "@remotion/google-fonts/Figtree";

const gabarito = loadGabarito("normal", { weights: ["500", "600", "700", "800", "900"], subsets: ["latin"] });
const figtree = loadFigtree("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin"] });

/** Display family: wordmark-like titles, big kinetic words, balances. */
export const DISPLAY = `${gabarito.fontFamily}, ${figtree.fontFamily}, system-ui, sans-serif`;
/** Text family: UI text, captions, labels. */
export const SANS = `${figtree.fontFamily}, system-ui, -apple-system, "Segoe UI", sans-serif`;

/** Every amount uses tabular figures (brand rule). Spread into a style object. */
export const TABULAR: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };
