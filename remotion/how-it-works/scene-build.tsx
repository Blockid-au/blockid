/**
 * Scene 4 — Build. Icon: lucide "folder-kanban" (ISC © lucide contributors).
 */
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, SCENE_BG } from "./theme";
import { SceneShell } from "./composition";
import { HOW_IT_WORKS_COPY } from "../../web/src/content/how-it-works-copy";

const TEMPLATES = [
  "Pitch deck", "Cap table", "Financial model", "Vesting schedule", "Term sheet",
  "Company profile", "Product one-pager", "Customer pipeline", "IP register", "Board pack",
];
const CAP_TABLE = [
  { holder: "Founder A", pct: 42 },
  { holder: "Founder B", pct: 30 },
  { holder: "ESOP pool", pct: 15 },
  { holder: "Seed SAFE", pct: 13 },
];

const IconFolder: React.FC = () => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none"
       stroke={COLORS.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 20V6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
    <path d="M8 10v8M12 10v6M16 10v4" />
  </svg>
);

const Right: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ width: 720, display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        {TEMPLATES.map((label, i) => {
          const s = spring({ frame: frame - i * 6, fps, config: { damping: 14, stiffness: 120 } });
          const y = interpolate(s, [0, 1], [40, 0]);
          return (
            <div key={label} style={{
              opacity: s, transform: `translateY(${y}px)`,
              padding: "22px 24px", borderRadius: 16,
              background: COLORS.paper, border: `1px solid ${COLORS.line}`,
              display: "flex", alignItems: "center", gap: 14,
              boxShadow: "0 6px 20px rgba(15,23,42,0.05)",
            }}>
              <div style={{ width: 12, height: 12, borderRadius: 4, background: COLORS.accent }} />
              <span style={{ fontSize: 22, fontWeight: 600 }}>{label}</span>
            </div>
          );
        })}
      </div>
      <div style={{
        background: COLORS.paper, border: `1px solid ${COLORS.line}`,
        borderRadius: 16, padding: 20,
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        <span style={{ fontSize: 18, color: COLORS.muted, letterSpacing: 2 }}>CAP TABLE</span>
        {CAP_TABLE.map((row, i) => {
          const s = 70 + i * 10;
          const opacity = interpolate(frame, [s, s + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const w = interpolate(frame, [s, s + 30], [0, row.pct], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <div key={row.holder} style={{ opacity, display: "flex", alignItems: "center", gap: 14, fontSize: 20 }}>
              <span style={{ width: 180, color: COLORS.inkSoft }}>{row.holder}</span>
              <div style={{ flex: 1, height: 10, background: COLORS.mist, borderRadius: 5 }}>
                <div style={{ width: `${w * 2}%`, height: "100%", background: COLORS.accentDark, borderRadius: 5 }} />
              </div>
              <span style={{ width: 52, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {Math.round(w)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const SceneBuild: React.FC = () => (
  <SceneShell stepNumber="04" title="Build your data room."
    body={HOW_IT_WORKS_COPY.steps[3].body.en}
    bg={SCENE_BG.build} icon={<IconFolder />} right={<Right />} />
);
