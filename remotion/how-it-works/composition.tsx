/**
 * HowItWorks master composition + shared SceneShell.
 * Six 150-frame sequences: Search, Onboard, Score, Build, Raise, Outro.
 * Copy is imported from web/src/content/how-it-works-copy.ts (.en only).
 */
import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { COLORS, FONT_STACK, SCENE_FRAMES } from "./theme";
import { SceneSearch } from "./scene-search";
import { SceneOnboard } from "./scene-onboard";
import { SceneScore } from "./scene-score";
import { SceneBuild } from "./scene-build";
import { SceneRaise } from "./scene-raise";
import { SceneOutro } from "./scene-outro";

const SCENES: readonly React.FC[] = [
  SceneSearch, SceneOnboard, SceneScore, SceneBuild, SceneRaise, SceneOutro,
];

export interface SceneShellProps {
  readonly stepNumber: string;
  readonly title: string;
  readonly body: string;
  readonly bg: string;
  readonly icon: React.ReactNode;
  readonly right: React.ReactNode;
}

export const SceneShell: React.FC<SceneShellProps> = ({
  stepNumber, title, body, bg, icon, right,
}) => (
  <AbsoluteFill style={{
    backgroundColor: bg, fontFamily: FONT_STACK, color: COLORS.ink,
    padding: "96px 128px", display: "flex", flexDirection: "row",
    alignItems: "center", gap: 96,
  }}>
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 32 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 24,
        color: COLORS.accent, fontSize: 40, fontWeight: 700, letterSpacing: 4,
      }}>
        <span>{stepNumber}</span>
        <div style={{ width: 64, height: 64 }}>{icon}</div>
      </div>
      <h1 style={{ fontSize: 96, fontWeight: 800, lineHeight: 1.05, margin: 0 }}>
        {title}
      </h1>
      <p style={{ fontSize: 32, lineHeight: 1.4, color: COLORS.inkSoft, margin: 0, maxWidth: 640 }}>
        {body}
      </p>
    </div>
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {right}
    </div>
  </AbsoluteFill>
);

export const HowItWorksComposition: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: "#FFFFFF" }}>
    {SCENES.map((Scene, i) => (
      <Sequence key={i} from={i * SCENE_FRAMES} durationInFrames={SCENE_FRAMES}
                name={Scene.name || `Scene${i + 1}`}>
        <Scene />
      </Sequence>
    ))}
  </AbsoluteFill>
);
