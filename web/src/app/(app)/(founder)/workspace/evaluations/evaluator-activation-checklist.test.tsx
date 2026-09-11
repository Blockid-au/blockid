// Colocated render test for EvaluatorActivationChecklist (S13-A). Uses
// renderToStaticMarkup — this workspace has no @testing-library/react —
// so it pins the server-rendered contract: 4 steps in order, done markers,
// one primary CTA on the next step, the thesis link, the blocked hint on
// step 2, the "n of 4" progress + trial days chip, the dismiss control, and
// the component vanishing once all 4 are done. Click-time behaviour
// (dismiss persistence, GA4 step event) is covered by the pure helpers in
// lib/evaluations/activation-checklist.test.ts + the typed analytics map.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EvaluatorActivationChecklist } from "./evaluator-activation-checklist";
import { EVALUATIONS_COPY } from "@/lib/evaluations/copy";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => {
    const attrs = Object.fromEntries(Object.entries(rest).filter(([k]) => k !== "onClick")) as Record<string, string>;
    return (
      <a href={href} {...attrs}>
        {children}
      </a>
    );
  },
}));

const noop = () => undefined;

function html(input: { evaluations: number; reports: number; sectors: number; discoverable: boolean }, extra: Partial<React.ComponentProps<typeof EvaluatorActivationChecklist>> = {}): string {
  return renderToStaticMarkup(<EvaluatorActivationChecklist input={input} onAddStartup={noop} onRunReport={noop} trialDaysLeft={5} {...extra} />);
}

describe("EvaluatorActivationChecklist", () => {
  it("fresh trial: 4 steps, 0 of 4, days chip, step 1 primary CTA, step 2 blocked, step 3 links to preferences", () => {
    const out = html({ evaluations: 0, reports: 0, sectors: 0, discoverable: false });
    expect(out).toContain('data-testid="evaluator-activation-checklist"');
    expect(out).toContain('data-completed="0"');
    expect(out).toContain(EVALUATIONS_COPY["checklist.title"]);
    expect((out.match(/data-testid="evaluator-checklist-step"/g) ?? []).length).toBe(4);
    expect(out).toMatch(/data-step="1"[\s\S]*data-step="2"[\s\S]*data-step="3"[\s\S]*data-step="4"/);
    expect(out).toContain("0 of 4 done");
    expect(out).toContain("5 days left in your trial");
    expect(out).toContain('aria-valuenow="0"');
    // Titles + bodies
    expect(out).toContain("Add the first startup you&#x27;re evaluating");
    expect(out).toContain("Run your included Trust BizReport");
    expect(out).toContain("Set your thesis so matching founders can find you");
    expect(out).toContain("Add a startup to your watchlist / cohort");
    expect(out).toContain(EVALUATIONS_COPY["checklist.step1.body"]);
    // CTAs
    expect(out).toContain('data-testid="evaluator-checklist-cta-1"');
    expect(out).toMatch(/data-testid="evaluator-checklist-cta-1"[^>]*class="[^"]*bg-brand-600/); // primary = next step
    expect(out).not.toContain('data-testid="evaluator-checklist-cta-2"');
    expect(out).toContain(EVALUATIONS_COPY["checklist.stepBlocked"]);
    expect(out).toMatch(/<a href="\/workspace\/investor\/preferences"[^>]*data-testid="evaluator-checklist-cta-3"/);
    expect(out).toContain('data-testid="evaluator-checklist-cta-4"');
    // Dismiss control is a labelled 44px button
    expect(out).toMatch(/<button[^>]*aria-label="Hide this checklist"[^>]*data-testid="evaluator-checklist-dismiss"/);
  });

  it("progress: done steps carry the tick and drop their CTA; the next undone step is primary", () => {
    const out = html({ evaluations: 1, reports: 1, sectors: 0, discoverable: false });
    expect(out).toContain('data-completed="2"');
    expect(out).toContain("2 of 4 done");
    expect(out).toContain('aria-valuenow="2"');
    expect(out).toMatch(/data-step="1" data-done="1"/);
    expect(out).toMatch(/data-step="2" data-done="1"/);
    expect(out).toMatch(/data-step="3" data-done="0"/);
    expect(out).not.toContain('data-testid="evaluator-checklist-cta-1"');
    expect(out).not.toContain('data-testid="evaluator-checklist-cta-2"');
    expect(out).toMatch(/data-testid="evaluator-checklist-cta-3"[^>]*class="[^"]*bg-brand-600/);
    expect(out).toMatch(/data-testid="evaluator-checklist-cta-4"[^>]*class="[^"]*border-brand-300/);
    expect(out).not.toContain(EVALUATIONS_COPY["checklist.stepBlocked"]);
  });

  it("step 2 CTA appears once a startup exists (run report on the first one)", () => {
    const out = html({ evaluations: 1, reports: 0, sectors: 0, discoverable: false });
    expect(out).toMatch(/<button[^>]*data-testid="evaluator-checklist-cta-2"[^>]*>Run the report<\/button>/);
  });

  it("no days chip when not trialing (null / 0)", () => {
    for (const d of [null, 0, undefined]) {
      const out = html({ evaluations: 0, reports: 0, sectors: 0, discoverable: false }, { trialDaysLeft: d });
      expect(out).not.toContain('data-testid="evaluator-checklist-days"');
      expect(out).not.toContain("left in your trial");
    }
    expect(html({ evaluations: 0, reports: 0, sectors: 0, discoverable: false }, { trialDaysLeft: 1 })).toContain("1 day left in your trial");
  });

  it("at the tracked-startup cap the add CTAs become the upgrade link", () => {
    const out = html({ evaluations: 1, reports: 1, sectors: 1, discoverable: true }, { canAdd: false });
    expect(out).toMatch(/<a href="\/pricing\?segment=evaluator"[^>]*data-testid="evaluator-checklist-cta-4"/);
    expect(out).toContain("Upgrade to track more");
  });

  it("renders nothing once all 4 steps are done", () => {
    expect(html({ evaluations: 2, reports: 1, sectors: 1, discoverable: true })).toBe("");
  });
});
