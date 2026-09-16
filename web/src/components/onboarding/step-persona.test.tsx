// Step 1 "Who are you" — G13-W5-IA5 (W4 review P3-a) persona lock.
// renderToStaticMarkup: the five cards by default; only the allowed cards
// when the page narrows `options`; the locked copy replaces the subtitle.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WIZARD_PERSONAS, personaOptionsFor } from "@/lib/onboarding/flow";

vi.mock("@/lib/use-locale", () => ({ useLocale: () => ["en", () => undefined] }));

import { StepPersona } from "./step-persona";

const noop = () => undefined;

function cards(html: string): string[] {
  return [...html.matchAll(/data-persona-option="([a-z_]+)"/g)].map((m) => m[1]);
}

describe("StepPersona — persona lock (S-IA5)", () => {
  it("offers all five wizard personas by default and is not locked", () => {
    const html = renderToStaticMarkup(<StepPersona value={undefined} onChange={noop} onContinue={noop} />);
    expect(cards(html)).toEqual([...WIZARD_PERSONAS]);
    expect(html).toContain('data-persona-locked="0"');
    expect(html).toContain("You can change this later in Settings.");
  });

  it("hides the evaluator cards for a locked founder (owns a project / onboarding complete) and says why", () => {
    const options = personaOptionsFor("founder", { onboardingCompleted: false, ownsProject: true });
    const html = renderToStaticMarkup(<StepPersona value="founder" options={options} onChange={noop} onContinue={noop} />);
    expect(cards(html)).toEqual(["founder"]);
    for (const evaluator of ["investor_angel", "investor_vc", "advisor", "accelerator"]) {
      expect(html).not.toContain(`data-persona-option="${evaluator}"`);
    }
    expect(html).toContain('data-persona-locked="1"');
    expect(html).toContain("Your desk is already set up for this role.");
    expect(html).toMatch(/data-persona-option="founder"[^>]*data-on="1"/);
  });

  it("an onboarded evaluator keeps their own single card", () => {
    const options = personaOptionsFor("accelerator", { onboardingCompleted: true, ownsProject: false });
    const html = renderToStaticMarkup(<StepPersona value="accelerator" options={options} onChange={noop} onContinue={noop} />);
    expect(cards(html)).toEqual(["accelerator"]);
  });
});
