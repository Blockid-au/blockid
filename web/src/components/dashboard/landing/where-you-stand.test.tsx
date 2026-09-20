// Block 1 · Where you stand — SSR pins (G13-W3-IA3 §B.1 row 1 / §B.4 row 1 / §B.5).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", () => ({ trackEvent: () => undefined }));

import { WHERE_YOU_STAND_EMPTY, WhereYouStand, phasePill } from "./where-you-stand";

const ctx = { phase: "customer_dev", plan: "founder_free", persona: "founder" };
const SUBS = [
  { key: "ftv", label: "Founder & Team", value: 62 },
  { key: "mpc", label: "Market & Problem", value: 48 },
  { key: "ptd", label: "Product & Tech", value: 40 },
  { key: "tre", label: "Traction", value: 22 },
];

describe("WhereYouStand", () => {
  it("empty state: the §B.4 copy + Run analysis → /analyze, flagged empty", () => {
    const html = renderToStaticMarkup(<WhereYouStand ctx={ctx} sviScore={null} delta={null} percentile={null} growthPhaseId={null} />);
    expect(html).toContain('data-landing-block="where-you-stand" data-landing-empty="true"');
    expect(html).toContain(WHERE_YOU_STAND_EMPTY);
    expect(html).toContain('href="/analyze"');
    expect(html).toContain("Run analysis");
    expect(html).not.toContain('data-visual-kind="radar"');
    expect(html).not.toContain("data-landing-delta");
  });

  it("scored: ring, delta, percentile, phase label pill, radar, See full score → /workspace/score", () => {
    const html = renderToStaticMarkup(
      <WhereYouStand ctx={ctx} sviScore={64} delta={6} percentile={72} percentileLabel="benchmark (n = 47)" growthPhaseId="customer_dev" subs={SUBS} startupName="Acme" scoredAt="2026-09-01T00:00:00.000Z" />,
    );
    expect(html).toContain('data-landing-block="where-you-stand"');
    expect(html).not.toContain("data-landing-empty");
    expect(html).toContain("+6 vs last snapshot");
    expect(html).toContain("Top 28% of the AU cohort at your stage — benchmark (n = 47)");
    expect(html).toContain("Customer Development");
    expect(html).not.toMatch(/Phase \d/);
    expect(html).toContain('data-visual-kind="radar"');
    expect(html).toContain('href="/workspace/score"');
    expect(html).toContain("See full score");
  });

  it("negative delta is styled bear; fewer than 3 dimensions skips the radar", () => {
    const html = renderToStaticMarkup(<WhereYouStand ctx={ctx} sviScore={40} delta={-3} percentile={null} growthPhaseId={null} stageLabel="Concept" subs={SUBS.slice(0, 2)} />);
    expect(html).toContain("text-bear");
    expect(html).toContain("-3 vs last snapshot");
    expect(html).toContain("Concept");
    expect(html).not.toContain('data-visual-kind="radar"');
    expect(html).toContain("Dimension breakdown appears after your next analysis.");
  });

  it("phasePill prefers the canonical label, falls back to the analysis stage label", () => {
    expect(phasePill("legal_equity", "Concept")).toBe("Legal & Equity");
    expect(phasePill(null, "  Concept ")).toBe("Concept");
    expect(phasePill(null, "")).toBeNull();
    expect(phasePill(null, null)).toBeNull();
  });
});
