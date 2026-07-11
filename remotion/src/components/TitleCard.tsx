import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, SERIF, SANS, TRANSITION_FRAMES } from "../constants";
import { GoldParticles } from "./GoldParticles";

interface Props {
  heading: string;
  accent: string;
  totalFrames: number;
}

export const TitleCard: React.FC<Props> = ({ heading, accent, totalFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const k = portrait ? width / 1080 : width / 1920;

  const enter = interpolate(frame, [0, TRANSITION_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exit = interpolate(frame, [totalFrames - TRANSITION_FRAMES, totalFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Spring scale entry — dramatic "whump" on arrival
  const entryScale = spring({
    frame,
    fps,
    delay: 0,
    config: { damping: 58, stiffness: 130, mass: 0.85 },
  });
  const scaleValue = 0.92 + entryScale * 0.08;

  // Breathing ambient glow
  const glowPulse = 0.5 + 0.5 * Math.sin(frame * 0.07);

  // Lines expand outward from center, slightly thicker
  const lineW = interpolate(frame, [TRANSITION_FRAMES, TRANSITION_FRAMES + 26], [0, 250 * k], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });

  // Heading slides up
  const headingIn = interpolate(frame, [TRANSITION_FRAMES + 6, TRANSITION_FRAMES + 28], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });

  // Massive ghost background word
  const bgWordIn = interpolate(frame, [TRANSITION_FRAMES - 6, TRANSITION_FRAMES + 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const bgWordDrift = interpolate(frame, [0, totalFrames], [40, -40]);

  // Letter-by-letter accent reveal
  const letters = accent.split("");
  const LETTER_START = TRANSITION_FRAMES + 14;
  const LETTER_DELAY = 2;
  const LETTER_DUR = 18;
  const fontSize = (portrait ? 80 : 92) * k;

  return (
    <AbsoluteFill style={{ opacity: Math.min(enter, 1 - exit) }}>
      {/* Background: breathing side beams + center glow */}
      <AbsoluteFill style={{ background: COLORS.stageBg }}>
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse 80% 70% at 50% 50%, rgba(99,122,95,${0.09 + glowPulse * 0.18}) 0%, transparent 70%)`,
          }}
        />
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse 38% 65% at 2% 50%, rgba(99,122,95,${0.05 + glowPulse * 0.07}) 0%, transparent 72%)`,
          }}
        />
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse 38% 65% at 98% 50%, rgba(99,122,95,${0.05 + glowPulse * 0.07}) 0%, transparent 72%)`,
          }}
        />
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse 48% 40% at 75% 78%, rgba(214,171,58,0.07) 0%, transparent 65%)`,
          }}
        />
      </AbsoluteFill>

      {/* Giant ghost word drifting behind everything */}
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            fontFamily: SERIF,
            fontStyle: "italic",
            fontWeight: 700,
            fontSize: (portrait ? 330 : 430) * k,
            lineHeight: 1,
            color: "transparent",
            WebkitTextStroke: `2px rgba(99,122,95,${bgWordIn * 0.1})`,
            whiteSpace: "nowrap",
            userSelect: "none",
            transform: `translateX(${bgWordDrift}px)`,
            letterSpacing: "-0.04em",
            opacity: bgWordIn,
          }}
        >
          {accent}
        </div>
      </AbsoluteFill>

      {/* Gold dust particles */}
      <GoldParticles count={portrait ? 16 : 26} maxOpacity={0.44} opacity={enter * (1 - exit)} />

      {/* Content — springs to scale */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${scaleValue})`,
        }}
      >
        {/* Top pulsing gold line */}
        <div
          style={{
            width: lineW,
            height: 1.5,
            background: `linear-gradient(to right, transparent, ${COLORS.gold}, transparent)`,
            boxShadow: `0 0 ${12 + glowPulse * 14}px rgba(214,171,58,${0.34 + glowPulse * 0.26})`,
            marginBottom: 36,
          }}
        />

        {/* Small heading */}
        <p
          style={{
            margin: 0,
            color: "rgba(247,244,238,0.50)",
            fontFamily: SERIF,
            fontSize: fontSize * 0.52,
            fontWeight: 400,
            letterSpacing: "0.30em",
            textTransform: "uppercase",
            opacity: headingIn,
            transform: `translateY(${(1 - headingIn) * 20}px)`,
            marginBottom: 10,
          }}
        >
          {heading}
        </p>

        {/* Accent word — drops in letter by letter */}
        <div style={{ display: "flex", alignItems: "baseline" }}>
          {letters.map((letter, i) => {
            const ls = LETTER_START + i * LETTER_DELAY;
            const lo = interpolate(frame, [ls, ls + LETTER_DUR], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const ly = interpolate(frame, [ls, ls + LETTER_DUR], [34, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: (t) => 1 - Math.pow(1 - t, 3),
            });
            return (
              <span
                key={i}
                style={{
                  color: COLORS.moss,
                  fontFamily: SERIF,
                  fontSize,
                  fontWeight: 700,
                  fontStyle: "italic",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                  opacity: lo,
                  display: "inline-block",
                  transform: `translateY(${ly}px)`,
                  textShadow: `0 0 55px rgba(99,122,95,${lo * (0.22 + glowPulse * 0.14)})`,
                }}
              >
                {letter === " " ? " " : letter}
              </span>
            );
          })}
        </div>

        {/* Bottom pulsing gold line */}
        <div
          style={{
            width: lineW,
            height: 1.5,
            background: `linear-gradient(to right, transparent, ${COLORS.gold}, transparent)`,
            boxShadow: `0 0 ${12 + glowPulse * 14}px rgba(214,171,58,${0.34 + glowPulse * 0.26})`,
            marginTop: 36,
          }}
        />
      </AbsoluteFill>

      {/* Bottom label */}
      <div
        style={{
          position: "absolute",
          bottom: portrait ? 60 : 44,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          opacity: Math.min(headingIn, 1 - exit) * 0.38,
        }}
      >
        <span
          style={{
            color: COLORS.cream,
            fontFamily: SANS,
            fontSize: 11 * k,
            letterSpacing: "0.52em",
            textTransform: "uppercase",
          }}
        >
          liquen events · évora
        </span>
      </div>
    </AbsoluteFill>
  );
};
