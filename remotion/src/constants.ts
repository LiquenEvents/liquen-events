export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const FPS = 30;

export const COLORS = {
  heroBg: "#080808",
  stageBg: "#0a0d09",
  pageBg: "#ffffff",
  moss: "#637a5f",
  mossLight: "#86997f",
  mossDark: "#4c6150",
  gold: "#d6ab3a",
  cream: "#f7f4ee",
  ink: "#2a2620",
} as const;

export const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
export const SANS = "'Inter', system-ui, sans-serif";

/** Real event footage placed in remotion/public/ */
export const FOOTAGE_FILE = "footage.mp4";

/**
 * Optional soundtrack: drop an mp3 in remotion/public/ (e.g. "music.mp3")
 * and set this to its filename. null = silent.
 */
export const MUSIC_FILE: string | null = null;

/** Frames of cross-zoom overlap between consecutive scenes. */
export const TRANSITION_FRAMES = 14;

export const SITE_DOMAIN = "liquen-events.com";

export type SceneDef =
  | {
      kind: "page";
      id: string;
      label: string;
      /** Huge ghost word drifting behind the browser window */
      word: string;
      path: string;
      durationSeconds: number;
      /**
       * Optional animated cursor that drifts to this viewport-fraction
       * position (after the final scroll) and clicks — used on the CTA.
       */
      cursorTarget?: { x: number; y: number };
    }
  | {
      kind: "footage";
      id: string;
      caption: string;
      /** Seconds into the source clip to start from */
      startFromSeconds: number;
      durationSeconds: number;
      zoom: "in" | "out";
    };

/**
 * The film: site pages intercut with real event footage.
 * Footage startFromSeconds are starting guesses — scrub the source in the
 * Studio and tune.
 */
export const SCENES: SceneDef[] = [
  {
    kind: "page",
    id: "home",
    label: "Início",
    word: "Líquen",
    path: "/",
    durationSeconds: 12,
  },
  {
    kind: "footage",
    id: "footage-1",
    caption: "Eventos reais",
    startFromSeconds: 10,
    durationSeconds: 6,
    zoom: "in",
  },
  {
    kind: "page",
    id: "sobre",
    label: "Sobre Nós",
    word: "História",
    path: "/sobre",
    durationSeconds: 11,
  },
  {
    kind: "page",
    id: "servicos",
    label: "Serviços",
    word: "Detalhe",
    path: "/servicos",
    durationSeconds: 12,
  },
  {
    kind: "footage",
    id: "footage-2",
    caption: "Team building · Empresas",
    startFromSeconds: 45,
    durationSeconds: 6,
    zoom: "out",
  },
  {
    kind: "page",
    id: "galeria",
    label: "Galeria",
    word: "Momentos",
    path: "/galeria",
    durationSeconds: 10,
  },
  {
    kind: "page",
    id: "orcamento",
    label: "Pedir Orçamento",
    word: "Vamos?",
    path: "/orcamento",
    durationSeconds: 7,
    cursorTarget: { x: 0.61, y: 0.82 },
  },
];

export const INTRO_SECONDS = 4.5;
export const OUTRO_SECONDS = 6;

export const PAGE_SCENES = SCENES.filter((s) => s.kind === "page");

/** Total film length in frames, accounting for scene overlaps. */
export function totalDurationInFrames(fps: number): number {
  const sceneFrames = SCENES.reduce((acc, s) => acc + Math.round(s.durationSeconds * fps), 0);
  const overlaps = (SCENES.length + 1) * TRANSITION_FRAMES;
  return Math.round(INTRO_SECONDS * fps) + sceneFrames + Math.round(OUTRO_SECONDS * fps) - overlaps;
}
