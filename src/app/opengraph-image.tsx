import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Líquen Events — Organização de eventos em Évora e Portugal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const MOSS = "#7c854b";
const GOLD = "#c8b97a";
const CREAM = "#f8f4eb";
const INK = "#0d0f09";
const INK_MID = "#1a2010";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: `linear-gradient(145deg, ${INK} 0%, ${INK_MID} 55%, #0f1a0b 100%)`,
        padding: "72px 80px",
        fontFamily: "Georgia, 'Times New Roman', serif",
        position: "relative",
      }}
    >
      {/* Moss glow — bottom-left */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "600px",
          height: "400px",
          background:
            "radial-gradient(ellipse at 0% 100%, rgba(124,133,75,0.18) 0%, transparent 65%)",
          pointerEvents: "none",
        }}
      />

      {/* Top: location tag */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div style={{ width: "28px", height: "1px", background: GOLD, flexShrink: 0 }} />
        <span
          style={{
            fontSize: "12px",
            letterSpacing: "5px",
            color: "rgba(255,255,255,0.28)",
            textTransform: "uppercase",
          }}
        >
          Évora · Alentejo · Lisboa · Portugal
        </span>
      </div>

      {/* Main: brand name + tagline */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            fontSize: "96px",
            fontWeight: "700",
            color: CREAM,
            letterSpacing: "-4px",
            lineHeight: "0.9",
            marginBottom: "36px",
          }}
        >
          Líquen
          <br />
          <span style={{ color: MOSS }}>Events</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "36px",
              height: "1px",
              background: "rgba(200,185,122,0.4)",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: "17px",
              color: "rgba(248,244,235,0.42)",
              letterSpacing: "3.5px",
              textTransform: "uppercase",
            }}
          >
            Organizamos eventos · Eternizamos memórias
          </span>
        </div>
      </div>

      {/* Bottom-right: year */}
      <div
        style={{
          position: "absolute",
          bottom: "72px",
          right: "80px",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: "4px",
        }}
      >
        <span
          style={{
            fontSize: "10px",
            color: "rgba(255,255,255,0.18)",
            letterSpacing: "4px",
            textTransform: "uppercase",
          }}
        >
          desde
        </span>
        <span
          style={{
            fontSize: "48px",
            fontWeight: "700",
            color: "rgba(255,255,255,0.07)",
            letterSpacing: "-2px",
            lineHeight: "1",
          }}
        >
          2018
        </span>
      </div>
    </div>,
    { width: 1200, height: 630 },
  );
}
