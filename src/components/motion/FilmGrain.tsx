// Cinematic film-grain overlay — a fixed, non-interactive texture that gives
// the whole site the feel of a wedding film rather than a flat web page. Pure
// CSS (a tiny tiled SVG-noise data URI jittered in steps); costs one composited
// layer, no JS. Auto-hidden under `prefers-reduced-motion` (see globals.css),
// so it never adds motion for users who opted out. `aria-hidden` — decorative.
export default function FilmGrain() {
  return <div className="film-grain" aria-hidden />;
}
