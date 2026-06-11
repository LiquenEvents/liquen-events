/**
 * Loads the site's real typefaces into the Remotion render:
 * Playfair Display (display serif) and Inter (UI sans).
 * Imported for its side effects from Root.tsx.
 */
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

loadPlayfair("normal", { weights: ["700"], subsets: ["latin", "latin-ext"] });
loadPlayfair("italic", { weights: ["700"], subsets: ["latin", "latin-ext"] });
loadInter("normal", {
  weights: ["400", "500"],
  subsets: ["latin", "latin-ext"],
});
