/**
 * Scene 6 — Outro. Wordmark + URL freeze-frame.
 */
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, FONT_MONO, FONT_STACK, SCENE_BG } from "./theme";
import { HOW_IT_WORKS_COPY } from "../../web/src/content/how-it-works-copy";

export const SceneOutro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 18, stiffness: 100 } });
  const scale = interpolate(s, [0, 1], [0.9, 1]);
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const underlineW = interpolate(frame, [40, 90], [0, 320], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{
      backgroundColor: SCENE_BG.outro, color: COLORS.paper, fontFamily: FONT_STACK,
      alignItems: "center", justifyContent: "center", gap: 36,
    }}>
      <div style={{ opacity, transform: `scale(${scale})`, display: "flex", alignItems: "baseline" }}>
        <span style={{ fontSize: 140, fontWeight: 800, color: COLORS.accent }}>Block</span>
        <span style={{ fontSize: 140, fontWeight: 800, color: COLORS.paper }}>ID</span>
      </div>
      <h2 style={{ fontSize: 56, fontWeight: 700, margin: 0, textAlign: "center" }}>
        Start your SVI in 60 seconds.
      </h2>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 44, color: COLORS.accent, letterSpacing: 2 }}>
          blockid.au
        </span>
        <div style={{ width: underlineW, height: 4, background: COLORS.accent, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 24, color: "#94A3B8", marginTop: 24 }}>
        {HOW_IT_WORKS_COPY.videoTagline.en}
      </span>
    </AbsoluteFill>
  );
};
