import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "../constants";
import { easeInOutCubic } from "../lib/motion";

interface Props {
  /** Target position in px, relative to the container this sits in */
  targetX: number;
  targetY: number;
  /** Frame (scene-local) when the cursor starts entering */
  enterFrame: number;
  /** Frame when the click happens */
  clickFrame: number;
  /** Where the cursor enters from, in px */
  fromX: number;
  fromY: number;
}

/**
 * A polished fake cursor: drifts along a gently curved path to the target,
 * settles, then clicks — ripple ring + tiny dip. Used to "press" the CTA
 * on the orçamento page.
 */
export const Cursor: React.FC<Props> = ({
  targetX,
  targetY,
  enterFrame,
  clickFrame,
  fromX,
  fromY,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const travelT = interpolate(frame, [enterFrame, clickFrame - 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const eased = easeInOutCubic(travelT);

  // Curved path: perpendicular sine bulge that fades as we arrive
  const x = fromX + (targetX - fromX) * eased;
  const y = fromY + (targetY - fromY) * eased + Math.sin(eased * Math.PI) * -46 * (1 - eased * 0.4);

  const visible = interpolate(frame, [enterFrame, enterFrame + 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Click: cursor dips, ripple expands
  const clickSpring = spring({
    frame,
    fps,
    delay: clickFrame,
    config: { damping: 12, stiffness: 200 },
    durationInFrames: 18,
  });
  const dip = frame >= clickFrame ? 1 - Math.abs(1 - clickSpring * 2) : 0;
  const cursorScale = 1 - dip * 0.18;

  const rippleT = interpolate(frame, [clickFrame, clickFrame + 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rippleVisible = frame >= clickFrame && rippleT < 1;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        pointerEvents: "none",
        opacity: visible,
        zIndex: 5,
      }}
    >
      {/* Ripple */}
      {rippleVisible ? (
        <div
          style={{
            position: "absolute",
            left: x - 30 * rippleT,
            top: y - 30 * rippleT,
            width: 60 * rippleT,
            height: 60 * rippleT,
            borderRadius: "50%",
            border: `2px solid ${COLORS.gold}`,
            opacity: 1 - rippleT,
            boxShadow: `0 0 18px rgba(214,171,58,${0.5 * (1 - rippleT)})`,
          }}
        />
      ) : null}

      {/* Pointer */}
      <svg
        width="26"
        height="30"
        viewBox="0 0 26 30"
        style={{
          position: "absolute",
          left: x,
          top: y,
          transform: `scale(${cursorScale})`,
          transformOrigin: "4px 4px",
          filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.45))",
        }}
      >
        <path
          d="M4 2 L4 24 L9.5 19 L13 27 L16.5 25.4 L13.2 17.6 L21 17 Z"
          fill="#fdfdfb"
          stroke="#1c1f1b"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
