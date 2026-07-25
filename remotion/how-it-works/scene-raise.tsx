/**
 * Scene 5 — Raise. Icon: lucide "rocket" (ISC © lucide contributors).
 */
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, SCENE_BG } from "./theme";
import { SceneShell } from "./composition";
import { HOW_IT_WORKS_COPY } from "../../web/src/content/how-it-works-copy";

const INVESTORS = [
  { name: "Blackbird", tint: "#111827" },
  { name: "Y Combinator", tint: "#F97316" },
  { name: "AirTree", tint: "#059669" },
];

const IconRocket: React.FC = () => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none"
       stroke={COLORS.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </svg>
);

const Check: React.FC<{ opacity: number }> = ({ opacity }) => (
  <svg viewBox="0 0 24 24" width={28} height={28} style={{ opacity }}
       fill="none" stroke={COLORS.ok} strokeWidth={3}
       strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const Right: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{ width: 720, position: "relative", height: 480 }}>
      <div style={{
        position: "absolute", left: 60, top: 160, width: 340, height: 200,
        background: COLORS.paper, border: `1px solid ${COLORS.line}`,
        borderRadius: 20, boxShadow: "0 16px 40px rgba(15,23,42,0.10)",
        display: "flex", flexDirection: "column", padding: 24, gap: 12,
      }}>
        <svg viewBox="0 0 24 16" width={72} height={48} fill="none"
             stroke={COLORS.accent} strokeWidth={1.4}>
          <rect x={1} y={1} width={22} height={14} rx={2} />
          <path d="m1 3 11 8 11-8" />
        </svg>
        <span style={{ fontSize: 22, fontWeight: 700 }}>Investor package</span>
        <span style={{ fontSize: 18, color: COLORS.muted }}>
          Deck · SVI report · Cap table · Term sheet
        </span>
      </div>
      {INVESTORS.map((inv, i) => {
        const s = 20 + i * 20;
        const t = interpolate(frame, [s, s + 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const tx = { x: 560, y: 60 + i * 130 };
        const cx = 420, cy = 100 + i * 40;
        const x = (1 - t) * (1 - t) * 230 + 2 * (1 - t) * t * cx + t * t * tx.x;
        const y = (1 - t) * (1 - t) * 260 + 2 * (1 - t) * t * cy + t * t * tx.y;
        const landed = t >= 1;
        return (
          <div key={inv.name} style={{
            position: "absolute", left: x, top: y,
            transform: "translate(-50%,-50%)",
            padding: "14px 20px", borderRadius: 999,
            background: COLORS.paper, border: `2px solid ${inv.tint}`,
            color: inv.tint, fontSize: 22, fontWeight: 700,
            boxShadow: "0 8px 20px rgba(15,23,42,0.10)",
            opacity: interpolate(frame, [s, s + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            display: "flex", alignItems: "center", gap: 10,
          }}>
            {inv.name}
            <Check opacity={landed ? 1 : 0} />
          </div>
        );
      })}
    </div>
  );
};

export const SceneRaise: React.FC = () => (
  <SceneShell stepNumber="05" title="Raise with confidence."
    body={HOW_IT_WORKS_COPY.steps[4].body.en}
    bg={SCENE_BG.raise} icon={<IconRocket />} right={<Right />} />
);
