/**
 * Scene 2 — Onboard. Icon: lucide "clipboard-list" (ISC © lucide contributors).
 */
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, SCENE_BG } from "./theme";
import { SceneShell } from "./composition";
import { HOW_IT_WORKS_COPY } from "../../web/src/content/how-it-works-copy";

const STEP_LABELS = [
  { title: "Phase", value: "Pre-seed · idea validated" },
  { title: "Goal", value: "Reach investor-ready in 90 days" },
  { title: "Team", value: "2 co-founders, 1 advisor" },
  { title: "Market", value: "Battery storage · APAC" },
  { title: "Ask", value: "A$750k SAFE · 12-month runway" },
];

const IconClipboard: React.FC = () => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none"
       stroke={COLORS.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x={8} y={2} width={8} height={4} rx={1} />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="M12 11h4M12 16h4M8 11h.01M8 16h.01" />
  </svg>
);

const Right: React.FC = () => {
  const frame = useCurrentFrame();
  const active = Math.min(4, Math.floor(frame / 20));
  const current = STEP_LABELS[active];
  return (
    <div style={{ width: 640, display: "flex", flexDirection: "column", gap: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        {STEP_LABELS.map((_, i) => {
          const on = i <= active;
          const scale = interpolate(frame, [i * 20, i * 20 + 8], [0.8, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          return (
            <React.Fragment key={i}>
              <div style={{
                width: 32, height: 32, borderRadius: 999,
                background: on ? COLORS.accent : COLORS.line,
                transform: on ? `scale(${scale})` : "scale(1)",
              }} />
              {i < STEP_LABELS.length - 1 && (
                <div style={{ flex: 1, height: 4, borderRadius: 2,
                              background: i < active ? COLORS.accent : COLORS.line }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div style={{
        background: COLORS.paper, border: `1px solid ${COLORS.line}`,
        borderRadius: 20, padding: "40px 44px",
        boxShadow: "0 12px 32px rgba(15,23,42,0.06)",
        display: "flex", flexDirection: "column", gap: 20,
      }}>
        <span style={{ fontSize: 22, letterSpacing: 3, textTransform: "uppercase", color: COLORS.muted }}>
          Step {active + 1} of 5
        </span>
        <span style={{ fontSize: 36, fontWeight: 700 }}>{current.title}</span>
        <div style={{ padding: "20px 24px", borderRadius: 14, background: COLORS.mist, fontSize: 28, color: COLORS.ink }}>
          {current.value}
        </div>
      </div>
    </div>
  );
};

export const SceneOnboard: React.FC = () => (
  <SceneShell stepNumber="02" title="Onboard in five steps."
    body={HOW_IT_WORKS_COPY.steps[1].body.en}
    bg={SCENE_BG.onboard} icon={<IconClipboard />} right={<Right />} />
);
