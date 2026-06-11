import { AbsoluteFill, useCurrentFrame } from "remotion";

/**
 * Animated film grain: an SVG turbulence tile jittered every frame.
 * Rendered once as a data URI; only background-position changes per frame,
 * so it's cheap.
 */
const NOISE_TILE = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
    <filter id="n">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
    <rect width="100%" height="100%" filter="url(#n)"/>
  </svg>`,
)}`;

function jitter(seed: number) {
  const x = Math.sin(seed * 91.7 + 47.3) * 43758.5453;
  return (x - Math.floor(x)) * 256;
}

export const FilmGrain: React.FC<{ opacity?: number }> = ({ opacity = 0.05 }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `url("${NOISE_TILE}")`,
        backgroundRepeat: "repeat",
        backgroundPosition: `${jitter(frame)}px ${jitter(frame + 1000)}px`,
        opacity,
        mixBlendMode: "overlay",
        pointerEvents: "none",
      }}
    />
  );
};

/** Soft cinematic vignette, layered above everything. */
export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.5 }) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse 115% 115% at 50% 50%, transparent 58%, rgba(0,0,0,${strength}) 100%)`,
      pointerEvents: "none",
    }}
  />
);
