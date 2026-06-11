import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { COLORS, SERIF, SANS, TRANSITION_FRAMES } from "../constants";
import { steppedScroll } from "../lib/motion";

/* iPhone mockup geometry inside the 1080×1920 frame */
const PHONE_W = 660;
const PHONE_H = 1340;
const BEZEL = 14;
const SCREEN_W = PHONE_W - BEZEL * 2;
const SCREEN_H = PHONE_H - BEZEL * 2;
/** Mobile screenshots are captured at 390 CSS px wide. */
const CSS_W = 390;
const IMG_SCALE = SCREEN_W / CSS_W;
const MAX_SCROLL_VIEWPORTS = 7;

interface Props {
  screenshotId: string;
  /** CSS pixel height of the captured mobile page */
  imageHeight: number;
  totalFrames: number;
  label: string;
  word: string;
  siteIndex: number;
  siteTotal: number;
}

export const PhoneSlide: React.FC<Props> = ({
  screenshotId,
  imageHeight,
  totalFrames,
  label,
  word,
  siteIndex,
  siteTotal,
}) => {
  const frame = useCurrentFrame();

  const enter = interpolate(frame, [0, TRANSITION_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitZoom = interpolate(frame, [totalFrames - TRANSITION_FRAMES, totalFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = enter;
  const sceneScale = 0.96 + enter * 0.04 + exitZoom * 0.045;

  /* Scroll */
  const SCROLL_START = TRANSITION_FRAMES + 8;
  const SCROLL_END = totalFrames - TRANSITION_FRAMES - 10;
  const displayedHeight = imageHeight * IMG_SCALE;
  const maxScroll = Math.min(
    Math.max(0, displayedHeight - SCREEN_H),
    SCREEN_H * MAX_SCROLL_VIEWPORTS,
  );
  const stops = Math.max(2, Math.min(5, Math.round(maxScroll / 1400)));
  const rawT = interpolate(frame, [SCROLL_START, SCROLL_END], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const scrollT = steppedScroll(rawT, stops, 0.28);
  const translateY = -scrollT * maxScroll;

  /* Ghost word */
  const wordDrift = interpolate(frame, [0, totalFrames], [30, -30]);
  const wordOpacity = interpolate(frame, [TRANSITION_FRAMES, TRANSITION_FRAMES + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  /* Phone life: push-in + tilt */
  const phoneScale = 1 + (frame / totalFrames) * 0.02;
  const tiltY = Math.sin(frame * 0.013) * 1.6;
  const tiltX = Math.cos(frame * 0.017) * 0.8;

  const footerIn = interpolate(frame, [TRANSITION_FRAMES + 4, TRANSITION_FRAMES + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const progressWidth = ((siteIndex + scrollT) / siteTotal) * 100;

  return (
    <AbsoluteFill style={{ opacity }}>
      {/* Stage background */}
      <AbsoluteFill style={{ background: COLORS.stageBg }}>
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse 70% 45% at 20% 6%, rgba(99,122,95,0.22) 0%, transparent 65%)`,
          }}
        />
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse 55% 35% at 85% 96%, rgba(214,171,58,0.07) 0%, transparent 65%)`,
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
        {/* Ghost word — vertical layout puts it higher */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "50%",
            transform: `translateY(-50%) translateX(${wordDrift}px)`,
            textAlign: "center",
            fontFamily: SERIF,
            fontStyle: "italic",
            fontWeight: 700,
            fontSize: 190,
            lineHeight: 1,
            color: "transparent",
            WebkitTextStroke: "1.5px rgba(247,244,238,0.12)",
            opacity: wordOpacity,
            whiteSpace: "nowrap",
            userSelect: "none",
          }}
        >
          {word}
        </div>

        {/* Phone */}
        <div style={{ perspective: 1800 }}>
          <div
            style={{
              width: PHONE_W,
              height: PHONE_H,
              transform: `scale(${phoneScale}) rotateY(${tiltY}deg) rotateX(${tiltX}deg)`,
              borderRadius: 64,
              background: "linear-gradient(145deg, #232823, #141714)",
              padding: BEZEL,
              boxShadow:
                "0 70px 140px rgba(0,0,0,0.65), 0 20px 55px rgba(0,0,0,0.5), 0 0 0 1px rgba(247,244,238,0.08), inset 0 0 0 2px rgba(247,244,238,0.04)",
              position: "relative",
            }}
          >
            {/* Side buttons */}
            <div
              style={{
                position: "absolute",
                left: -3,
                top: 280,
                width: 3,
                height: 64,
                borderRadius: 2,
                background: "#2a2f2a",
              }}
            />
            <div
              style={{
                position: "absolute",
                left: -3,
                top: 370,
                width: 3,
                height: 110,
                borderRadius: 2,
                background: "#2a2f2a",
              }}
            />
            <div
              style={{
                position: "absolute",
                right: -3,
                top: 330,
                width: 3,
                height: 150,
                borderRadius: 2,
                background: "#2a2f2a",
              }}
            />

            {/* Screen */}
            <div
              style={{
                position: "relative",
                width: SCREEN_W,
                height: SCREEN_H,
                borderRadius: 50,
                overflow: "hidden",
                background: COLORS.pageBg,
              }}
            >
              <Img
                src={staticFile(`screenshots/${screenshotId}-mobile.png`)}
                style={{
                  width: SCREEN_W,
                  height: "auto",
                  position: "absolute",
                  top: 0,
                  left: 0,
                  transform: `translateY(${translateY}px)`,
                  display: "block",
                }}
              />

              {/* Dynamic island */}
              <div
                style={{
                  position: "absolute",
                  top: 14,
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 160,
                  height: 38,
                  borderRadius: 22,
                  background: "#000",
                }}
              />
            </div>
          </div>
        </div>
      </AbsoluteFill>

      {/* Footer */}
      <div
        style={{
          position: "absolute",
          bottom: 56,
          left: 54,
          right: 54,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          opacity: footerIn,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 24,
              height: 1,
              background: COLORS.gold,
              boxShadow: "0 0 10px rgba(214,171,58,0.5)",
            }}
          />
          <span
            style={{
              color: "rgba(247,244,238,0.6)",
              fontSize: 14,
              letterSpacing: "0.4em",
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
            fontSize: 14,
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
          height: 3,
          width: `${progressWidth}%`,
          background: `linear-gradient(to right, rgba(214,171,58,0.4), ${COLORS.gold})`,
          opacity: footerIn,
        }}
      />
    </AbsoluteFill>
  );
};
