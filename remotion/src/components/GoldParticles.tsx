import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "../constants";

/**
 * Subtle floating gold dust, deterministic per index so renders are stable.
 */
function pseudoRandom(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Positive modulo — JS % returns negatives for negative operands. */
function mod(n: number, m: number) {
  return ((n % m) + m) % m;
}

interface Props {
  opacity?: number;
  count?: number;
  maxOpacity?: number;
}

export const GoldParticles: React.FC<Props> = ({ opacity = 1, count = 38, maxOpacity = 0.7 }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity }}>
      {Array.from({ length: count }).map((_, i) => {
        const rx = pseudoRandom(i + 1);
        const ry = pseudoRandom(i + 100);
        const rs = pseudoRandom(i + 200);
        const rSpeed = pseudoRandom(i + 300);
        const rPhase = pseudoRandom(i + 400) * Math.PI * 2;

        const size = 1.5 + rs * 3.5;
        const baseX = rx * width;
        const baseY = ry * height;

        // Slow upward drift with horizontal sway; wraps around smoothly
        const drift = frame * (0.18 + rSpeed * 0.35);
        const y = mod(baseY - drift, height + 40) - 20;
        const sway = Math.sin(frame * 0.02 + rPhase) * 14;

        const twinkle =
          (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(frame * 0.06 + rPhase * 3))) * maxOpacity;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: baseX + sway,
              top: y,
              width: size,
              height: size,
              borderRadius: "50%",
              background: COLORS.gold,
              opacity: twinkle,
              boxShadow: `0 0 ${size * 3}px ${size}px rgba(214,171,58,0.25)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
