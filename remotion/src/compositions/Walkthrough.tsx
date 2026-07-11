import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  SCENES,
  PAGE_SCENES,
  INTRO_SECONDS,
  OUTRO_SECONDS,
  FOOTAGE_FILE,
  MUSIC_FILE,
  TRANSITION_FRAMES,
  COLORS,
  SANS,
} from "../constants";
import { PageSlide } from "../components/PageSlide";
import { PhoneSlide } from "../components/PhoneSlide";
import { FootageInterlude } from "../components/FootageInterlude";
import { TitleCard } from "../components/TitleCard";
import { Intro } from "../components/Intro";
import { Outro } from "../components/Outro";
import { FilmGrain, Vignette } from "../components/FilmGrain";
import manifest from "../../public/screenshots/manifest.json";

type Manifest = Record<string, { height: number }>;

const DEFAULT_HEIGHT = 3240;
const DEFAULT_MOBILE_HEIGHT = 6000;

/** Cream flash that pops at each cross-zoom midpoint. */
const FLASH_HALF_LIFE = 7; // frames each side
const FLASH_PEAK = 0.3; // max overlay opacity

const FlashLayer: React.FC<{ midpoints: number[] }> = ({ midpoints }) => {
  const frame = useCurrentFrame();
  let strength = 0;
  for (const f of midpoints) {
    const d = Math.abs(frame - f);
    if (d < FLASH_HALF_LIFE) {
      strength = Math.max(strength, FLASH_PEAK * (1 - d / FLASH_HALF_LIFE));
    }
  }
  if (strength < 0.005) return null;
  return (
    <AbsoluteFill
      style={{
        background: `rgba(247,244,238,${strength})`,
        pointerEvents: "none",
        mixBlendMode: "screen",
      }}
    />
  );
};

const Soundtrack: React.FC<{ file: string }> = ({ file }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const volume = interpolate(
    frame,
    [0, 30, durationInFrames - 60, durationInFrames - 5],
    [0, 0.85, 0.85, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return <Audio src={staticFile(file)} volume={volume} />;
};

export const Walkthrough: React.FC = () => {
  const { fps, width, height } = useVideoConfig();
  const portrait = height > width;
  const m = manifest as Manifest;

  const introDur = Math.round(INTRO_SECONDS * fps);

  // Flash at the Intro → first scene boundary
  let cursor = introDur - TRANSITION_FRAMES;
  const flashMidpoints: number[] = [cursor + Math.floor(TRANSITION_FRAMES / 2)];

  let pageIndex = 0;

  const sequences = SCENES.map((scene) => {
    const dur = Math.round(scene.durationSeconds * fps);
    const start = cursor;
    cursor += dur - TRANSITION_FRAMES;

    // Flash at the boundary between this scene and the next
    flashMidpoints.push(cursor + Math.floor(TRANSITION_FRAMES / 2));

    if (scene.kind === "page") {
      const idx = pageIndex++;
      return (
        <Sequence key={scene.id} from={start} durationInFrames={dur}>
          {portrait ? (
            <PhoneSlide
              screenshotId={scene.id}
              imageHeight={m[`${scene.id}-mobile`]?.height ?? DEFAULT_MOBILE_HEIGHT}
              totalFrames={dur}
              label={scene.label}
              word={scene.word}
              siteIndex={idx}
              siteTotal={PAGE_SCENES.length}
            />
          ) : (
            <PageSlide
              screenshotId={scene.id}
              imageHeight={m[scene.id]?.height ?? DEFAULT_HEIGHT}
              totalFrames={dur}
              label={scene.label}
              word={scene.word}
              path={scene.path}
              siteIndex={idx}
              siteTotal={PAGE_SCENES.length}
              cursorTarget={scene.cursorTarget}
            />
          )}
        </Sequence>
      );
    }

    if (scene.kind === "title") {
      return (
        <Sequence key={scene.id} from={start} durationInFrames={dur}>
          <TitleCard heading={scene.heading} accent={scene.accent} totalFrames={dur} />
        </Sequence>
      );
    }

    return (
      <Sequence key={scene.id} from={start} durationInFrames={dur}>
        <FootageInterlude
          src={FOOTAGE_FILE}
          startFromSeconds={scene.startFromSeconds}
          totalFrames={dur}
          caption={scene.caption}
          zoom={scene.zoom}
        />
      </Sequence>
    );
  });

  const outroDur = Math.round(OUTRO_SECONDS * fps);

  return (
    <AbsoluteFill
      style={{
        background: "#080808",
        filter: "contrast(1.06) saturate(1.12)",
      }}
    >
      <Sequence from={0} durationInFrames={introDur}>
        <Intro totalFrames={introDur} />
      </Sequence>

      {sequences}

      <Sequence from={cursor} durationInFrames={outroDur}>
        <Outro totalFrames={outroDur} />
      </Sequence>

      {/* Global cinematic finish */}
      <Vignette strength={0.55} />
      <FilmGrain opacity={0.07} />

      {/* Cream flash beat at every cross-zoom transition */}
      <FlashLayer midpoints={flashMidpoints} />

      {/* Instagram handle — shown only in the 9:16 vertical composition */}
      {portrait && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 130,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.50) 0%, transparent 100%)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: 50,
            pointerEvents: "none",
            zIndex: 100,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: COLORS.gold,
                boxShadow: "0 0 8px rgba(214,171,58,0.75)",
              }}
            />
            <span
              style={{
                color: "rgba(247,244,238,0.88)",
                fontFamily: SANS,
                fontSize: 20,
                letterSpacing: "0.14em",
                textShadow: "0 1px 10px rgba(0,0,0,0.9)",
              }}
            >
              @liquen.events
            </span>
          </div>
        </div>
      )}

      {MUSIC_FILE ? <Soundtrack file={MUSIC_FILE} /> : null}
    </AbsoluteFill>
  );
};
