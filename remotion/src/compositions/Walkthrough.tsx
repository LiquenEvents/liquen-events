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
} from "../constants";
import { PageSlide } from "../components/PageSlide";
import { PhoneSlide } from "../components/PhoneSlide";
import { FootageInterlude } from "../components/FootageInterlude";
import { Intro } from "../components/Intro";
import { Outro } from "../components/Outro";
import { FilmGrain, Vignette } from "../components/FilmGrain";
import manifest from "../../public/screenshots/manifest.json";

type Manifest = Record<string, { height: number }>;

const DEFAULT_HEIGHT = 3240;
const DEFAULT_MOBILE_HEIGHT = 6000;

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

  // Scenes overlap their predecessor by TRANSITION_FRAMES: the incoming
  // scene fades in on top while the outgoing one keeps pushing in — a
  // cross-zoom hand-off.
  let cursor = introDur - TRANSITION_FRAMES;
  let pageIndex = 0;

  const sequences = SCENES.map((scene) => {
    const dur = Math.round(scene.durationSeconds * fps);
    const start = cursor;
    cursor += dur - TRANSITION_FRAMES;

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
        // Gentle global grade — a touch of contrast and saturation
        filter: "contrast(1.02) saturate(1.04)",
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
      <Vignette strength={0.42} />
      <FilmGrain opacity={0.05} />

      {MUSIC_FILE ? <Soundtrack file={MUSIC_FILE} /> : null}
    </AbsoluteFill>
  );
};
