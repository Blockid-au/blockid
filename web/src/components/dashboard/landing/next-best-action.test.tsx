// Block 2 · Next best action — SSR pins (G13-W3-IA3 §B.1 row 2 / §B.2 / §B.4).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", () => ({ trackEvent: () => undefined }));

import { recommendNextStep } from "@/lib/nav/next-step-recommender";
import { NextBestAction, formatAud, impactLine } from "./next-best-action";

const ctx = { phase: "customer_dev", plan: "founder_free", persona: "founder" };

describe("NextBestAction", () => {
  it("phase 0: the recommender's start step → /analyze, flagged empty (§B.4 row 2)", () => {
    const step = recommendNextStep({ currentPhase: 0 });
    const html = renderToStaticMarkup(<NextBestAction ctx={{ ...ctx, phase: "none" }} step={step} growthPhaseId={null} />);
    expect(html).toContain('data-landing-block="next-best-action" data-landing-empty="true"');
    expect(html).toContain("Run your 8-dimension SVI evaluation");
    expect(html).toContain('href="/analyze"');
    expect(html).toContain('data-testid="landing-next-best-action-cta"');
    expect(html).toContain("Because you haven&#x27;t started your evaluation yet");
    expect(html).not.toContain("data-landing-impact");
  });

  it("phase step: label, reason, the step's own ctaLabel, impact pill, Money Finder secondary, tour anchor", () => {
    const step = recommendNextStep({
      currentPhase: 0,
      growthPhaseId: "customer_dev",
      signals: { topEvidenceGapPts: 8, topMoney: { label: "MVP Ventures", amountAud: 45_000, closesAt: "2026-09-30" } },
    });
    const html = renderToStaticMarkup(<NextBestAction ctx={ctx} step={step} growthPhaseId="customer_dev" />);
    expect(html).not.toContain("data-landing-empty");
    expect(html).toContain("Log your first customer evidence");
    expect(html).toContain('href="/workspace/evidence"');
    expect(html).toContain(">Add evidence<");
    expect(html).toContain("Because you&#x27;re at Customer Development");
    expect(html).toContain("+8 SVI pts · A$45k · MVP Ventures closes 30 Sep");
    expect(html).toContain('data-testid="landing-next-best-action-secondary"');
    expect(html).toContain('href="/workspace/funding"');
    expect(html).toContain('data-tour="dashboard-spotlight"');
    expect(html).not.toContain("data-landing-member-note");
  });

  it("member view: 'ask {owner}' copy and a secondary CTA", () => {
    const step = recommendNextStep({ currentPhase: 0, growthPhaseId: "team" });
    const html = renderToStaticMarkup(<NextBestAction ctx={ctx} step={step} growthPhaseId="team" ownerLabel="jane" canEdit={false} />);
    expect(html).toContain("data-landing-member-note");
    expect(html).toContain("jane&#x27;s next action — ask jane");
    expect(html).toContain("border-line-subtle bg-surface px-3"); // secondary variant
    expect(html).not.toContain("data-landing-impact");
  });

  it("impactLine / formatAud", () => {
    expect(impactLine({ href: "/x", label: "", reason: "", ctaLabel: "", icon: "sparkles" })).toBeNull();
    expect(impactLine({ href: "/x", label: "", reason: "", ctaLabel: "", icon: "sparkles", impact: { sviDelta: 6 } })).toBe("+6 SVI pts");
    expect(impactLine({ href: "/x", label: "", reason: "", ctaLabel: "", icon: "sparkles", impact: { moneyAud: 1_500_000 } })).toBe("A$1.5M");
    expect(impactLine({ href: "/x", label: "", reason: "", ctaLabel: "", icon: "sparkles", impact: { moneyAud: 500, moneyClosesAt: "not-a-date" } })).toBe("A$500");
    expect(formatAud(2_000_000)).toBe("A$2M");
    expect(formatAud(45_000)).toBe("A$45k");
  });
});
