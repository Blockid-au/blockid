// Iteration-8 T3 — shared JSX tree for the /showcase/blockid OG + Twitter
// cards. Split from the route files so both dimensions render an identical
// composition (single source of truth for typography, colours, layout).
//
// Intentionally free of `next/og` and Server-Component APIs — this file just
// returns a JSX subtree. The route files wrap the return value in
// `new ImageResponse(...)` after applying their per-card dimensions.
//
// Vitest smoke test (`showcase-og-image.test.ts`) calls this function with a
// range of phase inputs and asserts it does not throw and yields React
// elements. We deliberately do not render to PNG in tests — the Satori/edge
// pipeline needs a browser-like environment we don't want to spin up for a
// unit test.

import type { ReactElement } from "react";
import { phaseToStageLabel } from "@/lib/journey-map";

export interface ShowcaseOgImageProps {
  /**
   * 1..12 fine-grained phase from milestone state / report rows. `null` when
   * the workspace has no phase-tagged artefacts yet (fresh install, empty
   * showcase). Values outside 1..12 fall back to the "Live workspace" badge.
   */
  currentPhase: number | null;
  /** Full render surface — 1200x630 for OG, 1200x675 for Twitter. */
  width: number;
  height: number;
}

export function ShowcaseOgImage({
  currentPhase,
  width,
  height,
}: ShowcaseOgImageProps): ReactElement {
  const stage = phaseToStageLabel(currentPhase);
  const badge = stage
    ? `Phase ${currentPhase} of 12 · ${stage.label_en}`
    : "Live founder-journey workspace";

  return (
    <div
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background:
          "linear-gradient(135deg, #052e2b 0%, #0f766e 42%, #14b8a6 100%)",
        color: "#ffffff",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
        <div
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "12px",
            background: "rgba(255,255,255,0.95)",
            color: "#0f766e",
            fontSize: "26px",
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          B
        </div>
        <div style={{ fontSize: "26px", fontWeight: 700, letterSpacing: "-0.01em" }}>
          BlockID.au
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
        <div
          style={{
            alignSelf: "flex-start",
            padding: "8px 18px",
            borderRadius: "999px",
            background: "rgba(255,255,255,0.16)",
            border: "1px solid rgba(255,255,255,0.28)",
            fontSize: "22px",
            fontWeight: 600,
          }}
        >
          {badge}
        </div>
        <div style={{ fontSize: "68px", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
          BlockID.au — Startup Valuation Index
        </div>
        <div style={{ fontSize: "28px", color: "rgba(255,255,255,0.86)", lineHeight: 1.3, maxWidth: "980px" }}>
          A public, read-only mirror of our own workspace — current phase,
          milestone timeline, and C-Level agent activity in real time.
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ fontSize: "20px", color: "rgba(255,255,255,0.75)" }}>
          Valuation. Ownership. Growth.
        </div>
        <div style={{ fontSize: "20px", fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>
          blockid.au/showcase/blockid
        </div>
      </div>
    </div>
  );
}
