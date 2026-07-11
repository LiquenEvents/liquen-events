import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, SANS, TRANSITION_FRAMES } from "../constants";

function pr(seed: number) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

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
            filter: "saturate(1.16) contrast(1.08)",
          }}
        />
      </AbsoluteFill>

      {/* Brand grade: moss shadows, warm edges */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to top, rgba(10,13,9,0.48) 0%, transparent 28%, transparent 72%, rgba(10,13,9,0.38) 100%)",
          pointerEvents: "none",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 120% 100% at 50% 50%, transparent 58%, rgba(76,97,80,0.24) 100%)",
          mixBlendMode: "soft-light",
          pointerEvents: "none",
        }}
      />

      {/* Cinematic bokeh — large, blurred, drifting light orbs */}
      <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden", opacity: wipeT * 0.9 }}>
        {Array.from({ length: 7 }).map((_, i) => {
          const size = 100 + pr(i + 30) * 200;
          const baseX = pr(i + 10) * width;
          const baseY = pr(i + 20) * height;
          const drift = frame * (0.05 + pr(i + 40) * 0.09);
          const y =
            ((((baseY - drift) % (height + size)) + (height + size)) % (height + size)) - size / 2;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: baseX - size / 2,
                top: y,
                width: size,
                height: size,
                borderRadius: "50%",
                background: `radial-gradient(circle, rgba(99,122,95,0.13) 0%, transparent 70%)`,
                filter: `blur(${Math.round(size * 0.38)}px)`,
              }}
            />
          );
        })}
      </AbsoluteFill>

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

      {/* Gold leading edge of the wipe — thicker, more glow */}
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${wipeT * 100}%`,
          width: 5,
          marginLeft: -5,
          background: COLORS.gold,
          boxShadow: "0 0 36px 8px rgba(214,171,58,0.70)",
          opacity: edgeOpacity,
        }}
      />
    </AbsoluteFill>
  );
};
