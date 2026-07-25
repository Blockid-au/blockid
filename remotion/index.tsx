/**
 * Remotion entry point.
 * Registered composition: HowItWorks — 30s, 1920x1080 @ 30fps.
 *
 * Preview:  cd web && npm run video:preview
 * Render:   cd web && npm run video:render
 */
import React from "react";
import { Composition, registerRoot } from "remotion";
import { HowItWorksComposition } from "./how-it-works/composition";
import { TOTAL_FRAMES } from "./how-it-works/theme";

const Root: React.FC = () => (
  <>
    <Composition
      id="HowItWorks"
      component={HowItWorksComposition}
      durationInFrames={TOTAL_FRAMES}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);

registerRoot(Root);
