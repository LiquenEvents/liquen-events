import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, SANS, TRANSITION_FRAMES } from "../constants";

interface Props {
  /** File inside remotion/public, e.g. "footage.mp4" */
  src: string;
  /** Where to start inside the source clip, in seconds */
  startFromSeconds: number;
  totalFrames: number;
  /** Small caption shown bottom-left, e.g. "Eventos reais" */
  caption?: string;
  /** Slow zoom direction */
  zoom?: "in" | "out";
}

/**
 * Real event footage interlude. Enters with a gold-edged wipe, letterbox
 * bars slide in, slow Ken Burns zoom, brand colour grade, caption with a
 * drawing gold line. Portrait-aware for the vertical (Reels) composition.
 */
export const FootageInterlude: React.FC<Props> = ({
  src,
  startFromSeconds,
  totalFrames,
  caption,
  zoom = "in",
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;

  /* ── Gold-edged wipe entry ── */
  const wipeT = interpolate(frame, [0, TRANSITION_FRAMES + 4], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const edgeOpacity = interpolate(
    frame,
    [0, 4, TRANSITION_FRAMES + 2, TRANSITION_FRAMES + 8],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );

  /* ── Ken Burns ── */
  const progress = frame / totalFrames;
  const scale = zoom === "in" ? 1.02 + progress * 0.07 : 1.09 - progress * 0.07;

  /* ── Letterbox bars slide in after the wipe ── */
  const BAR = portrait ? 0 : 96;
  const barT = interpolate(frame, [TRANSITION_FRAMES - 6, TRANSITION_FRAMES + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const barH = BAR * barT;

  /* ── Caption: gold line draws, text tracks in ── */
  const captionLineW = interpolate(
    frame,
    [TRANSITION_FRAMES + 6, TRANSITION_FRAMES + 24],
    [0, 28],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    },
  );
  const captionIn = interpolate(frame, [TRANSITION_FRAMES + 12, TRANSITION_FRAMES + 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: "#000",
        clipPath: `inset(0 ${(1 - wipeT) * 100}% 0 0)`,
      }}
    >
      {/* Video with slow zoom + brand grade */}
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <OffthreadVideo
          src={staticFile(src)}
          startFrom={Math.round(startFromSeconds * fps)}
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: `scale(${scale})`,
            filter: "saturate(1.08) contrast(1.05)",
          }}
        />
      </AbsoluteFill>

      {/* Brand grade: moss shadows, warm edges */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to top, rgba(10,13,9,0.4) 0%, transparent 28%, transparent 72%, rgba(10,13,9,0.32) 100%)",
          pointerEvents: "none",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 120% 100% at 50% 50%, transparent 60%, rgba(76,97,80,0.18) 100%)",
          mixBlendMode: "soft-light",
          pointerEvents: "none",
        }}
      />

      {/* Letterbox bars */}
      {BAR > 0 ? (
        <>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: barH,
              background: "#000",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: barH,
              background: "#000",
            }}
          />
        </>
      ) : null}

      {/* Caption */}
      {caption ? (
        <div
          style={{
            position: "absolute",
            bottom: portrait ? 110 : BAR + 28,
            left: portrait ? 54 : 64,
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: captionLineW,
              height: 1,
              background: COLORS.gold,
              boxShadow: "0 0 12px rgba(214,171,58,0.6)",
            }}
          />
          <span
            style={{
              color: "rgba(247,244,238,0.78)",
              fontSize: portrait ? 15 : 13,
              letterSpacing: "0.45em",
              textTransform: "uppercase",
              fontFamily: SANS,
              textShadow: "0 1px 8px rgba(0,0,0,0.8)",
              opacity: captionIn,
            }}
          >
            {caption}
          </span>
        </div>
      ) : null}

      {/* Gold leading edge of the wipe */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${wipeT * 100}%`,
          width: 3,
          marginLeft: -3,
          background: COLORS.gold,
          boxShadow: "0 0 26px 4px rgba(214,171,58,0.55)",
          opacity: edgeOpacity,
        }}
      />
    </AbsoluteFill>
  );
};
