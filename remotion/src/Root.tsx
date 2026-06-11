import { Composition } from "remotion";
import "./fonts";
import { Walkthrough } from "./compositions/Walkthrough";
import { FPS, VIDEO_WIDTH, VIDEO_HEIGHT, totalDurationInFrames } from "./constants";

export const RemotionRoot: React.FC = () => (
  <>
    {/* 16:9 — site, YouTube, apresentações */}
    <Composition
      id="Walkthrough"
      component={Walkthrough}
      durationInFrames={totalDurationInFrames(FPS)}
      fps={FPS}
      width={VIDEO_WIDTH}
      height={VIDEO_HEIGHT}
    />
    {/* 9:16 — Instagram Reels / TikTok / Stories (usa screenshots mobile) */}
    <Composition
      id="WalkthroughVertical"
      component={Walkthrough}
      durationInFrames={totalDurationInFrames(FPS)}
      fps={FPS}
      width={1080}
      height={1920}
    />
  </>
);
