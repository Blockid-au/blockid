// Smoke test for the canonical-stage badge overlay used on the four showcase
// timelines (Atlassian, Canva, Xero, SafetyCulture). Guards the mechanical
// path from a 12-phase ordinal → canonical StageKey → EN+VI display copy.

import { describe, expect, it } from "vitest";

import { CANONICAL_STAGE_LABELS } from "@/lib/journey-vocabulary";
import { PHASE_TO_STAGE } from "@/lib/journey-map";

import { canonicalStageBadgeText } from "./canonical-stage-badge";

describe("canonicalStageBadgeText", () => {
  it("renders the canonical bucket text for phase 1 (Vision → idea)", () => {
    const text = canonicalStageBadgeText(1);
    expect(text).toBe("Stage: Idea · Ý tưởng");
  });

  it("renders series_b_c for phase 10 (Fundraise / Term Sheet)", () => {
    const text = canonicalStageBadgeText(10);
    expect(text).toContain("Series B / C");
    expect(text).toContain("Series B / C (Mở rộng quy mô)");
  });

  it("renders public_exit for phase 12 (Exit / Beyond)", () => {
    const text = canonicalStageBadgeText(12);
    expect(text).toBe(
      `Stage: ${CANONICAL_STAGE_LABELS.public_exit.label_en} · ${CANONICAL_STAGE_LABELS.public_exit.label_vi}`,
    );
  });

  it("returns null for phases outside 1..12 so the UI can skip rendering", () => {
    expect(canonicalStageBadgeText(0)).toBeNull();
    expect(canonicalStageBadgeText(13)).toBeNull();
    expect(canonicalStageBadgeText(Number.NaN)).toBeNull();
  });

  it("stays consistent with every entry in PHASE_TO_STAGE", () => {
    for (const [phaseStr, stage] of Object.entries(PHASE_TO_STAGE)) {
      const phase = Number(phaseStr);
      const text = canonicalStageBadgeText(phase);
      const labels = CANONICAL_STAGE_LABELS[stage];
      expect(text).toBe(`Stage: ${labels.label_en} · ${labels.label_vi}`);
    }
  });
});
