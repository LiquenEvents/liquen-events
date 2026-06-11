import { Img, staticFile } from "remotion";

const LOGO = "logo-liquen-branco.png";

/**
 * The logo PNG has large empty margins (artwork ≈62%×59% of the canvas,
 * optically right of centre). This component crops to the artwork's
 * bounding box via CSS so animations work on the actual lockup.
 *
 * TRIM fractions of the source canvas — tune here if the crop drifts.
 */
const TRIM = {
  // left includes the -0.075 calibration made in the Studio (was a fixed
  // 71.1px nudge at imgW≈947 — folded here so it scales with any width).
  left: 0.195,
  top: 0.236,
  width: 0.655,
  height: 0.635,
};
/** Source aspect ratio (h/w) of logo-liquen-branco.png (3747×2238). */
const SRC_ASPECT = 2238 / 3747;

interface Props {
  /** Rendered width of the cropped artwork */
  width: number;
  /** Optional light-band shimmer position, 0..100+ (undefined = none) */
  shimmerX?: number;
  shimmerOpacity?: number;
  style?: React.CSSProperties;
}

export const LogoLockup: React.FC<Props> = ({ width, shimmerX, shimmerOpacity = 0, style }) => {
  const imgW = width / TRIM.width;
  const imgH = imgW * SRC_ASPECT;
  const offsetX = -TRIM.left * imgW;
  const offsetY = -TRIM.top * imgH;
  const boxH = imgH * TRIM.height;

  return (
    <div
      style={{
        position: "relative",
        width,
        height: boxH,
        overflow: "hidden",
        ...style,
      }}
    >
      <Img
        src={staticFile(LOGO)}
        style={{
          position: "absolute",
          left: offsetX,
          top: offsetY,
          width: imgW,
          height: imgH,
          display: "block",
        }}
      />
      {shimmerX !== undefined && shimmerOpacity > 0 ? (
        <div
          style={{
            position: "absolute",
            left: offsetX,
            top: offsetY,
            width: imgW,
            height: imgH,
            opacity: shimmerOpacity,
            WebkitMaskImage: `url(${staticFile(LOGO)})`,
            WebkitMaskSize: "100% 100%",
            WebkitMaskRepeat: "no-repeat",
            maskImage: `url(${staticFile(LOGO)})`,
            maskSize: "100% 100%",
            maskRepeat: "no-repeat",
            background: `linear-gradient(105deg, transparent ${shimmerX - 14}%, rgba(255,255,255,0.45) ${shimmerX}%, transparent ${shimmerX + 14}%)`,
          }}
        />
      ) : null}
    </div>
  );
};
