import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, SANS } from "../constants";
import { GoldParticles } from "./GoldParticles";
import { LogoLockup } from "./LogoLockup";

const BG_PHOTO = "intro-bg.jpg";

/**
 * Cinematic opening over a real event photo: fade from black with a slow
 * push-in on the image, the logo wipes in left→right (no blur mush), a
 * light shimmer crosses it, gold line draws, tagline tracks in.
 */
export const Intro: React.FC<{ totalFrames: number }> = ({ totalFrames }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const portrait = height > width;
  const k = portrait ? width / 1240 : width / 1920;

  const logoW = 620 * k * (portrait ? 1.25 : 1);

  /* ── Photo: fade from black + slow Ken Burns ── */
  const photoIn = interpolate(frame, [0, 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const photoScale = 1.06 + (frame / totalFrames) * 0.06;

  /* ── Logo: soft wipe reveal left→right + gentle rise ── */
  const wipeX = interpolate(frame, [16, 52], [-12, 115], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 2.4),
  });
  const logoRise = interpolate(frame, [16, 48], [14, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });

  /* ── Shimmer pass once the logo is fully revealed ── */
  const shimmerX = interpolate(frame, [62, 94], [-30, 140], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shimmerOpacity = interpolate(frame, [62, 68, 88, 94], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ── Gold line + tagline ── */
  const lineWidth = interpolate(frame, [44, 72], [0, 340 * k], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const taglineOpacity = interpolate(frame, [56, 80], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const taglineTracking = interpolate(frame, [56, 96], [0.85, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 2),
  });

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {/* Event photo with slow push-in */}
      <AbsoluteFill style={{ opacity: photoIn, overflow: "hidden" }}>
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
        {/* Same hero treatment as the site: darken + bottom gradient */}
        <AbsoluteFill style={{ background: "rgba(0,0,0,0.42)" }} />
        <AbsoluteFill
          style={{
            background:
              "linear-gradient(to top, rgba(8,8,8,0.85) 0%, rgba(8,8,8,0.15) 45%, rgba(8,8,8,0.35) 100%)",
          }}
        />
      </AbsoluteFill>

      <GoldParticles
        count={20}
        maxOpacity={0.45}
        opacity={interpolate(frame, [18, 50], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
      />

      {/* Lockup */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            transform: `translateY(${logoRise}px)`,
            WebkitMaskImage: `linear-gradient(100deg, black ${wipeX - 10}%, transparent ${wipeX + 10}%)`,
            maskImage: `linear-gradient(100deg, black ${wipeX - 10}%, transparent ${wipeX + 10}%)`,
            filter: "drop-shadow(0 6px 30px rgba(0,0,0,0.55))",
          }}
        >
          <LogoLockup width={logoW} shimmerX={shimmerX} shimmerOpacity={shimmerOpacity} />
        </div>

        {/* Gold line */}
        <div
          style={{
            width: lineWidth,
            height: 1,
            marginTop: 34,
            background: `linear-gradient(to right, transparent, ${COLORS.gold}, transparent)`,
            boxShadow: "0 0 16px rgba(214,171,58,0.45)",
          }}
        />

        {/* Tagline */}
        <p
          style={{
            color: "rgba(247,244,238,0.66)",
            fontSize: (portrait ? 15 : 17) * (portrait ? 1 : k),
            letterSpacing: `${taglineTracking}em`,
            textTransform: "uppercase",
            marginTop: 26,
            fontFamily: SANS,
            opacity: taglineOpacity,
            whiteSpace: "nowrap",
            textShadow: "0 1px 10px rgba(0,0,0,0.7)",
          }}
        >
          Organização de Eventos
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
