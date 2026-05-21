import { registerRoot, Composition } from "remotion";
import { PitchVideo1Min } from "./compositions/PitchVideo1Min";
import { PitchVideo3Min } from "./compositions/PitchVideo3Min";
import { BRAND } from "./styles/brand";

const RemotionRoot: React.FC = () => {
  return (
    <>
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
    </>
  );
};

registerRoot(RemotionRoot);
