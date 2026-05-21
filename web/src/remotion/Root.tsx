import { registerRoot, Composition } from "remotion";
import { PitchVideo1Min } from "./compositions/PitchVideo1Min";
import { PitchVideo1MinV2 } from "./compositions/PitchVideo1MinV2";
import { PitchVideo3Min } from "./compositions/PitchVideo3Min";
import { PitchVideoSWC } from "./compositions/PitchVideoSWC";
import { BRAND } from "./styles/brand";

const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="PitchVideo1MinV2"
        component={PitchVideo1MinV2}
        durationInFrames={60 * BRAND.fps}
        fps={BRAND.fps}
        width={BRAND.width}
        height={BRAND.height}
      />
      <Composition
        id="PitchVideo1Min"
        component={PitchVideo1Min}
        durationInFrames={60 * BRAND.fps}
        fps={BRAND.fps}
        width={BRAND.width}
        height={BRAND.height}
      />
      <Composition
        id="PitchVideo3Min"
        component={PitchVideo3Min}
        durationInFrames={195 * BRAND.fps}
        fps={BRAND.fps}
        width={BRAND.width}
        height={BRAND.height}
      />
      <Composition
        id="PitchVideoSWC"
        component={PitchVideoSWC}
        durationInFrames={185 * BRAND.fps}
        fps={BRAND.fps}
        width={BRAND.width}
        height={BRAND.height}
      />
    </>
  );
};

registerRoot(RemotionRoot);
