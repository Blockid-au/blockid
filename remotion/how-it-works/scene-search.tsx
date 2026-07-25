/**
 * Scene 1 — Search (frames 0-149).
 * Typing search bar rendering "quantum battery startup" char-by-char
 * with a blinking caret, then three staggered result pills.
 *
 * Icon: lucide "search" (ISC © lucide contributors).
 */
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS, SCENE_BG, EASE_OUT } from "./theme";
import { SceneShell } from "./composition";
import { HOW_IT_WORKS_COPY } from "../../web/src/content/how-it-works-copy";

const QUERY = "quantum battery startup";
const RESULTS = [
  { name: "QuantumCell Pty Ltd", meta: "Newcastle · Battery R&D" },
  { name: "IonForge Labs", meta: "Melbourne · Solid-state cells" },
  { name: "Aurora Energy Systems", meta: "Perth · Grid storage" },
];

const IconSearch: React.FC = () => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none"
       stroke={COLORS.accent} strokeWidth={2}
       strokeLinecap="round" strokeLinejoin="round">
    <circle cx={11} cy={11} r={8} />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const Right: React.FC = () => {
  const frame = useCurrentFrame();
  // Type across 60 frames starting at f=10
  const typed = Math.max(
    0,
    Math.min(QUERY.length, Math.floor((frame - 10) / (60 / QUERY.length))),
  );
  const caretOn = Math.floor(frame / 15) % 2 === 0;
  return (
    <div style={{ width: 640, display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          height: 96,
          borderRadius: 20,
          background: COLORS.paper,
          border: `2px solid ${COLORS.line}`,
          boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
          display: "flex",
          alignItems: "center",
          padding: "0 28px",
          gap: 20,
          fontSize: 34,
          color: COLORS.ink,
        }}
      >
        <div style={{ width: 36, height: 36, opacity: 0.6 }}>
          <IconSearch />
        </div>
        <span>{QUERY.slice(0, typed)}</span>
        <span
          style={{
            width: 3,
            height: 40,
            background: COLORS.ink,
            opacity: caretOn ? 1 : 0,
          }}
        />
      </div>
      {RESULTS.map((r, i) => {
        const start = 80 + i * 15;
        const opacity = interpolate(frame, [start, start + 20], [0, 1], {
          extrapolateRight: "clamp",
          extrapolateLeft: "clamp",
          easing: (t) => t,
        });
        const y = interpolate(frame, [start, start + 20], [16, 0], {
          extrapolateRight: "clamp",
          extrapolateLeft: "clamp",
          easing: (t) =>
            1 - Math.pow(1 - t, 4), // ease-out quart approximation
        });
        return (
          <div
            key={r.name}
            style={{
              opacity,
              transform: `translateY(${y}px)`,
              padding: "20px 28px",
              borderRadius: 16,
              background: COLORS.paper,
              border: `1px solid ${COLORS.line}`,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 26, fontWeight: 600 }}>{r.name}</span>
            <span style={{ fontSize: 20, color: COLORS.muted }}>{r.meta}</span>
          </div>
        );
      })}
      {/* silence unused-easing warning */}
      <span style={{ display: "none" }}>{EASE_OUT.join(",")}</span>
    </div>
  );
};

export const SceneSearch: React.FC = () => {
  const step = HOW_IT_WORKS_COPY.steps[0];
  return (
    <SceneShell
      stepNumber="01"
      title="Search any idea."
      body={step.body.en}
      bg={SCENE_BG.search}
      icon={<IconSearch />}
      right={<Right />}
    />
  );
};
