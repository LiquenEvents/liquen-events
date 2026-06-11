import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, SERIF, SANS, SITE_DOMAIN, TRANSITION_FRAMES } from "../constants";
import { GoldParticles } from "./GoldParticles";
import { LogoLockup } from "./LogoLockup";

/** Same photo as the intro — the film opens and closes on the same place. */
const BG_PHOTO = "intro-bg.jpg";

/**
 * Closing card: headline rises, logo settles, gold line, animated CTA
 * button with a shine sweep, domain + Instagram.
 */
export const Outro: React.FC<{ totalFrames: number }> = ({ totalFrames }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const k = portrait ? width / 1240 : width / 1920;

  const fadeIn = interpolate(frame, [0, TRANSITION_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const headlineIn = spring({
    frame,
    fps,
    delay: 12,
    config: { damping: 70, stiffness: 70 },
  });

  const logoIn = spring({
    frame,
    fps,
    delay: 32,
    config: { damping: 90, stiffness: 40, mass: 1.2 },
  });
  const logoBlur = (1 - logoIn) * 16;

  const lineWidth = interpolate(frame, [48, 74], [0, 330 * k], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });

  /* CTA button: pops in, then a shine band sweeps across */
  const ctaIn = spring({
    frame,
    fps,
    delay: 58,
    config: { damping: 60, stiffness: 90 },
  });
  const shineX = interpolate(frame, [88, 118], [-40, 140], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shineOpacity = interpolate(frame, [88, 94, 112, 118], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const metaIn = interpolate(frame, [74, 92], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const glowPulse = 0.5 + 0.5 * Math.sin(frame * 0.045);
  const sceneScale = 1 + frame * 0.0005;

  const fadeOut = interpolate(frame, [totalFrames - 22, totalFrames - 2], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* Photo pulls back slowly — mirrors the intro's push-in */
  const photoScale = 1.12 - (frame / totalFrames) * 0.05;

  return (
    <AbsoluteFill style={{ background: COLORS.heroBg, opacity: Math.min(fadeIn, fadeOut) }}>
      {/* Bookend photo, darker than the intro so the CTA owns the frame */}
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <Img
          src={staticFile(BG_PHOTO)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            transform: `scale(${photoScale})`,
          }}
        />
        <AbsoluteFill style={{ background: "rgba(0,0,0,0.58)" }} />
        <AbsoluteFill
          style={{
            background:
              "linear-gradient(to top, rgba(8,8,8,0.9) 0%, rgba(8,8,8,0.3) 50%, rgba(8,8,8,0.55) 100%)",
          }}
        />
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 60% 50% at 50% 48%, rgba(99,122,95,${(0.35 + glowPulse * 0.2) * 0.35}) 0%, transparent 70%)`,
        }}
      />

      <GoldParticles opacity={fadeIn} />

      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${sceneScale})`,
        }}
      >
        {/* Headline */}
        <h2
          style={{
            color: COLORS.cream,
            fontSize: 64 * k * (portrait ? 1.1 : 1),
            fontWeight: 700,
            letterSpacing: "-0.02em",
            fontFamily: SERIF,
            margin: 0,
            textAlign: "center",
            opacity: headlineIn,
            transform: `translateY(${(1 - headlineIn) * 26}px)`,
          }}
        >
          O seu evento <span style={{ color: COLORS.moss, fontStyle: "italic" }}>começa aqui</span>
        </h2>

        {/* Logo */}
        <div
          style={{
            marginTop: 40,
            opacity: logoIn,
            transform: `scale(${1.08 - logoIn * 0.08})`,
            filter: `blur(${logoBlur}px) drop-shadow(0 0 50px rgba(99,122,95,0.3))`,
          }}
        >
          <LogoLockup width={360 * k * (portrait ? 1.2 : 1)} />
        </div>

        {/* Gold line */}
        <div
          style={{
            width: lineWidth,
            height: 1,
            marginTop: 10,
            background: `linear-gradient(to right, transparent, ${COLORS.gold}, transparent)`,
            boxShadow: "0 0 18px rgba(214,171,58,0.5)",
          }}
        />

        {/* CTA button */}
        <div
          style={{
            marginTop: 36,
            opacity: ctaIn,
            transform: `translateY(${(1 - ctaIn) * 16}px) scale(${0.94 + ctaIn * 0.06})`,
            position: "relative",
            overflow: "hidden",
            background: COLORS.moss,
            borderRadius: 2,
            padding: "20px 52px",
            boxShadow: "0 18px 50px rgba(99,122,95,0.35), 0 4px 18px rgba(0,0,0,0.4)",
          }}
        >
          <span
            style={{
              color: COLORS.cream,
              fontSize: 16,
              fontWeight: 500,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              fontFamily: SANS,
            }}
          >
            Pedir Orçamento →
          </span>
          {/* Shine sweep */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: shineOpacity,
              background: `linear-gradient(105deg, transparent ${shineX - 15}%, rgba(255,255,255,0.35) ${shineX}%, transparent ${shineX + 15}%)`,
            }}
          />
        </div>

        {/* Domain + Instagram */}
        <div
          style={{
            marginTop: 34,
            display: "flex",
            alignItems: "center",
            gap: 22,
            opacity: metaIn,
          }}
        >
          <span
            style={{
              color: "rgba(247,244,238,0.5)",
              fontSize: 14,
              letterSpacing: "0.4em",
              textTransform: "uppercase",
              fontFamily: SANS,
            }}
          >
            {SITE_DOMAIN}
          </span>
          <span style={{ color: "rgba(247,244,238,0.18)" }}>·</span>
          <span
            style={{
              color: "rgba(247,244,238,0.5)",
              fontSize: 14,
              letterSpacing: "0.18em",
              fontFamily: SANS,
            }}
          >
            @liquen.events
          </span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
