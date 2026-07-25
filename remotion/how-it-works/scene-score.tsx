/**
 * Scene 3 — Score. Icon: lucide "gauge" (ISC © lucide contributors).
 */
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS, SCENE_BG } from "./theme";
import { SceneShell } from "./composition";
import { HOW_IT_WORKS_COPY } from "../../web/src/content/how-it-works-copy";

const IconGauge: React.FC = () => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none"
       stroke={COLORS.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 14 4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" />
  </svg>
);

const BAR_TARGETS = [82, 68, 75, 90, 55, 71, 63, 77, 84, 60, 88, 66, 73];
const SPARK = [40, 46, 52, 49, 58, 62, 66, 70, 68, 72];

const Right: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const g = spring({ frame: frame - 5, fps, config: { damping: 20 } });
  const gaugeValue = Math.round(g * 72);
  const arc = interpolate(g, [0, 1], [0, Math.PI]);
  const cx = 140, cy = 140, r = 110;
  const end = { x: cx - r * Math.cos(arc), y: cy - r * Math.sin(arc) };
  const arcPath = `M ${cx - r} ${cy} A ${r} ${r} 0 ${arc > Math.PI ? 1 : 0} 1 ${end.x} ${end.y}`;
  const bgPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  const sW = 280, sH = 60;
  const sparkPath = SPARK.map((v, i) => {
    const x = (i / (SPARK.length - 1)) * sW;
    const y = sH - ((v - 40) / 32) * sH;
    return `${i === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ");
  const sparkLen = 400;
  const sparkOffset = interpolate(frame, [40, 110], [sparkLen, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <div style={{ width: 680, display: "flex", flexDirection: "column", gap: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
        <svg width={280} height={160}>
          <path d={bgPath} stroke={COLORS.line} strokeWidth={18} fill="none" strokeLinecap="round" />
          <path d={arcPath} stroke={COLORS.ok} strokeWidth={18} fill="none" strokeLinecap="round" />
          <text x={cx} y={cy - 10} textAnchor="middle" fontSize={56} fontWeight={800} fill={COLORS.ink}>{gaugeValue}</text>
          <text x={cx} y={cy + 24} textAnchor="middle" fontSize={18} fill={COLORS.muted}>SVI</text>
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span style={{ fontSize: 24, color: COLORS.muted }}>30-day trend</span>
          <svg width={sW} height={sH}>
            <path d={sparkPath} stroke={COLORS.accent} strokeWidth={4} fill="none"
                  strokeLinecap="round" strokeLinejoin="round"
                  strokeDasharray={sparkLen} strokeDashoffset={sparkOffset} />
          </svg>
        </div>
      </div>
      <div style={{
        background: COLORS.paper, border: `1px solid ${COLORS.line}`,
        borderRadius: 20, padding: 28, display: "flex", flexDirection: "column", gap: 10,
      }}>
        {BAR_TARGETS.map((target, i) => {
          const startF = 20 + i * 3;
          const w = interpolate(frame, [startF, startF + 25], [0, target], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const color = target >= 80 ? COLORS.ok : target >= 65 ? COLORS.accent : COLORS.warn;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 28, fontSize: 16, color: COLORS.muted,
                             fontVariantNumeric: "tabular-nums", textAlign: "right" }}>Q{i + 1}</span>
              <div style={{ flex: 1, height: 12, borderRadius: 6, background: COLORS.mist, overflow: "hidden" }}>
                <div style={{ width: `${w}%`, height: "100%", background: color, borderRadius: 6 }} />
              </div>
              <span style={{ width: 44, fontSize: 16, color: COLORS.inkSoft, fontVariantNumeric: "tabular-nums" }}>
                {Math.round(w)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const SceneScore: React.FC = () => (
  <SceneShell stepNumber="03" title="Score against 13 criteria."
    body={HOW_IT_WORKS_COPY.steps[2].body.en}
    bg={SCENE_BG.score} icon={<IconGauge />} right={<Right />} />
);
