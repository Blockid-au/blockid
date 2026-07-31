// web/src/components/unicorn/unicorn-dashboard-logic.ts
//
// Phase 6 Batch J · sub-J3 — pure ordering + block computation
// extracted from <UnicornPathDashboard/> so it can be tested without
// @testing-library/react.
//
// NO React import here. Server component consumes these helpers to
// project raw DB rows into the exact shape the SVG renderers expect.

import type { UnicornStageId } from "@/lib/unicorn/framework";
import { UNICORN_STAGES } from "@/lib/unicorn/framework";

// ─── Types ──────────────────────────────────────────────────────────

export interface SpiralNode {
  id: UnicornStageId;
  stageNumber: number;
  label: string;
  /** 'past' — already exited; 'current' — active; 'future' — not yet reached. */
  state: "past" | "current" | "future";
  /** SVG coordinate on the spiral (unit circle radius=1, centered at 0,0). */
  x: number;
  y: number;
}

/**
 * Six equidistant nodes on an outward spiral. Node i sits at angle
 * θᵢ = -π/2 + i·(2π/6) (so S0 is at the top, walking clockwise), on a
 * radius that grows linearly from r=0.35 (S0) to r=1.0 (S5). The
 * caller composes the actual pixel/viewBox scale.
 */
export function buildSpiralNodes(currentId: UnicornStageId): SpiralNode[] {
  const currentNum = UNICORN_STAGES.find((s) => s.id === currentId)!.stageNumber;
  return UNICORN_STAGES.map((stage, i) => {
    const theta = -Math.PI / 2 + (i * 2 * Math.PI) / 6;
    const r = 0.35 + (i / 5) * 0.65;
    return {
      id: stage.id,
      stageNumber: stage.stageNumber,
      label: stage.label,
      state:
        stage.stageNumber < currentNum
          ? "past"
          : stage.stageNumber === currentNum
            ? "current"
            : "future",
      x: Math.cos(theta) * r,
      y: Math.sin(theta) * r,
    };
  });
}

// ─── Trust arc geometry ─────────────────────────────────────────────

/**
 * Build a semi-circle arc path for the trust score meter (0..100 → 180°).
 * Returns the SVG `d` string and the endpoint of the "filled" segment
 * so the caller can drop a marker there.
 */
export function buildTrustArc(
  score: number,
  radius = 80,
  cx = 100,
  cy = 100,
): { fullPath: string; filledPath: string; markerX: number; markerY: number } {
  const clamped = Math.max(0, Math.min(100, score));
  const fraction = clamped / 100;
  const startAngle = Math.PI;
  const endAngle = startAngle + Math.PI * fraction;
  const fullPath = arcPath(cx, cy, radius, Math.PI, 2 * Math.PI, 0);
  const filledPath = arcPath(cx, cy, radius, startAngle, endAngle, 0);
  const markerX = cx + radius * Math.cos(endAngle);
  const markerY = cy + radius * Math.sin(endAngle);
  return { fullPath, filledPath, markerX, markerY };
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  largeArc: 0 | 1,
): string {
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

// ─── 12-slot Unicorn Path radar layout ─────────────────────────────
// This is the Unicorn Path dashboard radar (12 domain-specific stage
// signals: identity / ownership / governance / ...). It is NOT the
// Master Plan §6 13-area analysis framework — that lives in
// showcase/atlassian/stage-benchmark.ts › ANALYSIS_AREA_IDS.

export const RADAR_AREAS = [
  "identity",
  "ownership",
  "governance",
  "finance_baseline",
  "product",
  "revenue",
  "gtm",
  "customers",
  "compliance",
  "risk",
  "people",
  "ip",
] as const;

export interface RadarPoint {
  area: string;
  value: number; // 0..100
  angle: number; // radians
  x: number;
  y: number;
}

export function buildRadarPoints(
  scores: Record<string, number>,
): RadarPoint[] {
  return RADAR_AREAS.map((area, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / RADAR_AREAS.length;
    const raw = scores[area] ?? 0;
    const value = Math.max(0, Math.min(100, raw));
    const r = value / 100;
    return {
      area,
      value,
      angle,
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
    };
  });
}

// ─── Blocker queue ─────────────────────────────────────────────────

export interface RawBlocker {
  code: string;
  message: string;
  createdAt?: string;
  severity?: "critical" | "high" | "medium" | "low";
}

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Top-N blockers by severity, then by createdAt ascending (oldest
 * critical first). Stable and deterministic — pure sort, no I/O.
 */
export function topBlockers(
  raw: readonly RawBlocker[],
  n = 5,
): RawBlocker[] {
  return [...raw]
    .sort((a, b) => {
      const sa = SEVERITY_RANK[a.severity ?? "medium"] ?? 2;
      const sb = SEVERITY_RANK[b.severity ?? "medium"] ?? 2;
      if (sa !== sb) return sa - sb;
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : Infinity;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : Infinity;
      return ta - tb;
    })
    .slice(0, n);
}

// ─── Investor persona histogram ────────────────────────────────────

export interface CohortRow {
  currentStageId: UnicornStageId;
}

/** Bucket a portfolio by current stage id — the investor-persona view. */
export function stageHistogram(
  rows: readonly CohortRow[],
): Record<UnicornStageId, number> {
  const seed: Record<UnicornStageId, number> = {
    S0: 0,
    S1: 0,
    S2: 0,
    S3: 0,
    S4: 0,
    S5: 0,
  };
  for (const r of rows) seed[r.currentStageId] += 1;
  return seed;
}

// ─── Days-in-stage vs target ───────────────────────────────────────

export function daysInStage(entryIso: string, now: Date = new Date()): number {
  const entry = new Date(entryIso).getTime();
  const ms = now.getTime() - entry;
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}
