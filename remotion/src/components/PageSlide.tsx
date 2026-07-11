import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { COLORS, SERIF, SANS, SITE_DOMAIN, TRANSITION_FRAMES } from "../constants";
import { steppedScroll } from "../lib/motion";
import { Cursor } from "./Cursor";

/* Browser window geometry inside the 1920×1080 frame */
const WIN_W = 1560;
const WIN_H = 902;
const BAR_H = 52;
const VIEW_H = WIN_H - BAR_H;
/** Screenshots are captured at 1920px wide and displayed at WIN_W. */
const IMG_SCALE = WIN_W / 1920;
/** Cap the travelled distance so very tall pages don't blur past. */
const MAX_SCROLL_VIEWPORTS = 6;

interface Props {
  screenshotId: string;
  imageHeight: number;
  totalFrames: number;
  label: string;
  word: string;
  path: string;
  siteIndex: number;
  siteTotal: number;
  /** Viewport-fraction position the fake cursor drifts to and clicks */
  cursorTarget?: { x: number; y: number };
}

export const PageSlide: React.FC<Props> = ({
  screenshotId,
  imageHeight,
  totalFrames,
  label,
  word,
  path,
  siteIndex,
  siteTotal,
  cursorTarget,
}) => {
  const frame = useCurrentFrame();

  /* ── Entry / exit (cross-zoom hand-off with neighbours) ── */
  const enter = interpolate(frame, [0, TRANSITION_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitZoom = interpolate(frame, [totalFrames - TRANSITION_FRAMES, totalFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = enter;
  const sceneScale = 0.965 + enter * 0.035 + exitZoom * 0.04;

  /* ── Scroll: eased section-by-section ── */
  const SCROLL_START = TRANSITION_FRAMES + 8;
  // With a cursor choreography the page must be still before the click.
  const SCROLL_END = cursorTarget ? totalFrames - 95 : totalFrames - TRANSITION_FRAMES - 10;

  const displayedHeight = imageHeight * IMG_SCALE;
  const maxScroll = Math.min(Math.max(0, displayedHeight - VIEW_H), VIEW_H * MAX_SCROLL_VIEWPORTS);
  // ~1 stop per 1100px of scroll, clamped 2..5 — short pages glide, long
  // pages visit their sections.
  const stops = Math.max(2, Math.min(5, Math.round(maxScroll / 1100)));

  const rawT = interpolate(frame, [SCROLL_START, SCROLL_END], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scrollT = steppedScroll(rawT, stops, 0.28);
  const translateY = -scrollT * maxScroll;

  /* ── Ghost word drifting behind the window ── */
  const wordDrift = interpolate(frame, [0, totalFrames], [40, -40]);
  const wordOpacity = interpolate(frame, [TRANSITION_FRAMES, TRANSITION_FRAMES + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* ── Window: slow push-in + living 3D tilt ── */
  const windowScale = 1 + (frame / totalFrames) * 0.018;
  const tiltY = Math.sin(frame * 0.013) * 1.3;
  const tiltX = Math.cos(frame * 0.017) * 0.7;

  /* ── In-window scrollbar ── */
  const trackH = VIEW_H - 16;
  const thumbH = Math.max(48, (VIEW_H / displayedHeight) * trackH);
  const thumbTop = scrollT * (trackH - thumbH);
  const scrollbarVisible = maxScroll > 0;

  /* ── Footer info ── */
  const footerIn = interpolate(frame, [TRANSITION_FRAMES + 4, TRANSITION_FRAMES + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const progressWidth = ((siteIndex + scrollT) / siteTotal) * 100;

  return (
    <AbsoluteFill style={{ opacity }}>
      {/* Stage background — deep green-black with brand glows */}
      <AbsoluteFill style={{ background: COLORS.stageBg }}>
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse 55% 60% at 18% 8%, rgba(99,122,95,0.22) 0%, transparent 65%)`,
          }}
        />
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse 45% 45% at 88% 95%, rgba(214,171,58,0.07) 0%, transparent 65%)`,
          }}
        />
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          transform: `scale(${sceneScale})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Ghost word — larger and slightly rotated for depth */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "50%",
            transform: `translateY(-50%) translateX(${wordDrift}px) rotate(-2deg)`,
            textAlign: "center",
            fontFamily: SERIF,
            fontStyle: "italic",
            fontWeight: 700,
            fontSize: 320,
            lineHeight: 1,
            color: "transparent",
            WebkitTextStroke: "1.5px rgba(247,244,238,0.13)",
            opacity: wordOpacity,
            whiteSpace: "nowrap",
            userSelect: "none",
          }}
        >
          {word}
        </div>

        {/* Secondary ghost echo — smaller, opposite drift */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "50%",
            transform: `translateY(-15%) translateX(${-wordDrift * 0.4}px) rotate(1.5deg)`,
            textAlign: "center",
            fontFamily: SERIF,
            fontStyle: "italic",
            fontWeight: 700,
            fontSize: 180,
            lineHeight: 1,
            color: "transparent",
            WebkitTextStroke: "1px rgba(247,244,238,0.05)",
            opacity: wordOpacity * 0.6,
            whiteSpace: "nowrap",
            userSelect: "none",
          }}
        >
          {word}
        </div>

        {/* Floor glow under the window */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, 430px)",
            width: 1300,
            height: 150,
            background:
              "radial-gradient(ellipse 50% 50% at 50% 50%, rgba(99,122,95,0.16) 0%, transparent 70%)",
            filter: "blur(8px)",
          }}
        />

        {/* Browser window (3D-tilted) */}
        <div style={{ perspective: 1600 }}>
          <div
            style={{
              width: WIN_W,
              height: WIN_H,
              transform: `scale(${windowScale}) rotateY(${tiltY}deg) rotateX(${tiltX}deg)`,
              borderRadius: 16,
              overflow: "hidden",
              boxShadow:
                "0 60px 130px rgba(0,0,0,0.62), 0 18px 50px rgba(0,0,0,0.45), 0 0 0 1px rgba(247,244,238,0.07)",
              display: "flex",
              flexDirection: "column",
              background: "#101310",
            }}
          >
            {/* Chrome bar */}
            <div
              style={{
                height: BAR_H,
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                paddingLeft: 22,
                paddingRight: 22,
                gap: 18,
                background: "linear-gradient(to bottom, #181c17, #131613)",
                borderBottom: "1px solid rgba(247,244,238,0.06)",
              }}
            >
              {/* Traffic lights */}
              <div style={{ display: "flex", gap: 8 }}>
                {["#3e4a3b", "#4c5a48", "#637a5f"].map((c) => (
                  <div
                    key={c}
                    style={{
                      width: 11,
                      height: 11,
                      borderRadius: "50%",
                      background: c,
                    }}
                  />
                ))}
              </div>
              {/* URL pill */}
              <div
                style={{
                  flex: 1,
                  maxWidth: 560,
                  margin: "0 auto",
                  height: 30,
                  borderRadius: 15,
                  background: "rgba(247,244,238,0.05)",
                  border: "1px solid rgba(247,244,238,0.07)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {/* Lock */}
                <svg width="10" height="12" viewBox="0 0 10 12" style={{ opacity: 0.45 }}>
                  <rect x="1" y="5" width="8" height="6" rx="1.5" fill={COLORS.cream} />
                  <path
                    d="M3 5V3.5a2 2 0 1 1 4 0V5"
                    stroke={COLORS.cream}
                    strokeWidth="1.4"
                    fill="none"
                  />
                </svg>
                <span
                  style={{
                    fontFamily: SANS,
                    fontSize: 13.5,
                    letterSpacing: "0.02em",
                    color: "rgba(247,244,238,0.62)",
                  }}
                >
                  {SITE_DOMAIN}
                  <span style={{ color: "rgba(247,244,238,0.32)" }}>
                    {path === "/" ? "" : path}
                  </span>
                </span>
              </div>
              {/* Spacer mirroring traffic lights for symmetry */}
              <div style={{ width: 49 }} />
            </div>

            {/* Viewport */}
            <div
              style={{
                position: "relative",
                width: WIN_W,
                height: VIEW_H,
                overflow: "hidden",
                background: COLORS.pageBg,
              }}
            >
              <Img
                src={staticFile(`screenshots/${screenshotId}.png`)}
                style={{
                  width: WIN_W,
                  height: "auto",
                  position: "absolute",
                  top: 0,
                  left: 0,
                  transform: `translateY(${translateY}px)`,
                  display: "block",
                }}
              />

              {/* Fake cursor → CTA click */}
              {cursorTarget ? (
                <Cursor
                  targetX={cursorTarget.x * WIN_W}
                  targetY={cursorTarget.y * VIEW_H}
                  enterFrame={totalFrames - 78}
                  clickFrame={totalFrames - 34}
                  fromX={WIN_W * 0.92}
                  fromY={VIEW_H * 1.06}
                />
              ) : null}

              {/* Scrollbar */}
              {scrollbarVisible ? (
                <div
                  style={{
                    position: "absolute",
                    right: 5,
                    top: 8,
                    width: 4,
                    height: trackH,
                    borderRadius: 2,
                    background: "rgba(0,0,0,0.06)",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: thumbTop,
                      width: 4,
                      height: thumbH,
                      borderRadius: 2,
                      background: "rgba(0,0,0,0.3)",
                    }}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </AbsoluteFill>

      {/* Footer: label + counter + progress */}
      <div
        style={{
          position: "absolute",
          bottom: 30,
          left: 70,
          right: 70,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          opacity: footerIn,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 26,
              height: 1,
              background: COLORS.gold,
              boxShadow: "0 0 10px rgba(214,171,58,0.5)",
            }}
          />
          <span
            style={{
              color: "rgba(247,244,238,0.6)",
              fontSize: 12,
              letterSpacing: "0.42em",
              textTransform: "uppercase",
              fontFamily: SANS,
            }}
          >
            {label}
          </span>
        </div>
        <span
          style={{
            color: "rgba(247,244,238,0.3)",
            fontSize: 12,
            letterSpacing: "0.3em",
            fontFamily: SANS,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {String(siteIndex + 1).padStart(2, "0")} / {String(siteTotal).padStart(2, "0")}
        </span>
      </div>

      {/* Progress hairline */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          height: 2,
          width: `${progressWidth}%`,
          background: `linear-gradient(to right, rgba(214,171,58,0.4), ${COLORS.gold})`,
          opacity: footerIn,
        }}
      />
    </AbsoluteFill>
  );
};
