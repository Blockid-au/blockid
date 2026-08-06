// Colocated render test for the onboarding progress bar rendered atop the
// welcome wizard on every step transition (Segment → Startup). Rendered via
// react-dom/server's renderToStaticMarkup — cheap, no JSDOM, matching the
// pattern in showcase/atlassian-benchmark.test.ts.
//
// The bar is the founder's *only* visual cue that Step 6 exists (the
// real-world audit #8 activation-moment slot). A silent regression that
// dropped the sixth label, decoupled the "active" ring class, or lost the
// aria-current="step" hook would violate the WCAG "list w/ current step"
// contract the parent /onboarding wizard relies on, and the guidance track
// promise (see docs/plans/atlassian-standard-mapping-goal.md) that every
// founder-facing step surfaces the same 6-step vocabulary end-to-end.
//
// vitest.config.ts globs `src/**/*.test.tsx`.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WizardProgress } from "./wizard-progress";
import { WIZARD_TOTAL_STEPS, type WizardState } from "./wizard-types";

const STEP_LABELS = [
  "Segment",
  "Goal",
  "Plan",
  "Trial",
  "Payment",
  "Startup",
] as const;

function render(step: WizardState["step"]): string {
  return renderToStaticMarkup(createElement(WizardProgress, { step }));
}

function occurrences(hay: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let idx = hay.indexOf(needle);
  while (idx !== -1) {
    count += 1;
    idx = hay.indexOf(needle, idx + needle.length);
  }
  return count;
}

describe("WizardProgress — outer scaffolding", () => {
  it("exposes an accessible list container with the onboarding aria-label", () => {
    const html = render(1);
    expect(html).toContain('role="list"');
    expect(html).toContain('aria-label="Onboarding progress"');
  });

  it("renders exactly one listitem per wizard step (matches WIZARD_TOTAL_STEPS)", () => {
    const html = render(1);
    expect(occurrences(html, 'role="listitem"')).toBe(WIZARD_TOTAL_STEPS);
    expect(WIZARD_TOTAL_STEPS).toBe(STEP_LABELS.length);
  });

  it("renders exactly N-1 connector segments between the dots", () => {
    const html = render(1);
    // The connector class prefix is stable ("h-px flex-1 transition-colors")
    // and only used by the connector element in this component.
    expect(occurrences(html, "h-px flex-1 transition-colors")).toBe(
      STEP_LABELS.length - 1,
    );
  });

  it("hides each connector from AT (aria-hidden='true') so only dots contribute to the list", () => {
    const html = render(3);
    // Every connector — 5 of them — must carry aria-hidden="true". Total
    // aria-hidden="true" occurrences equals the connector count.
    expect(occurrences(html, 'aria-hidden="true"')).toBe(
      STEP_LABELS.length - 1,
    );
  });
});

describe("WizardProgress — labels", () => {
  it("renders every step label in the label row, in step order", () => {
    const html = render(1);
    let cursor = 0;
    for (const label of STEP_LABELS) {
      const idx = html.indexOf(`>${label}<`, cursor);
      expect(idx, `label "${label}" missing or out of order`).toBeGreaterThan(
        -1,
      );
      cursor = idx + label.length;
    }
  });

  it("renders each label text exactly once (no duplicate labels)", () => {
    const html = render(4);
    for (const label of STEP_LABELS) {
      expect(occurrences(html, `>${label}<`)).toBe(1);
    }
  });
});

describe("WizardProgress — aria-current tracks the active step", () => {
  it("marks aria-current='step' on the active listitem's dot exactly once (step=1)", () => {
    const html = render(1);
    expect(occurrences(html, 'aria-current="step"')).toBe(1);
    // First dot must be the one carrying it.
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('aria-label="Step 1: Segment"');
  });

  it("marks aria-current='step' on the mid-range active dot exactly once (step=4)", () => {
    const html = render(4);
    expect(occurrences(html, 'aria-current="step"')).toBe(1);
    expect(html).toContain('aria-label="Step 4: Trial"');
  });

  it("marks aria-current='step' on the terminal Step-6 dot exactly once (step=6)", () => {
    const html = render(6);
    expect(occurrences(html, 'aria-current="step"')).toBe(1);
    expect(html).toContain('aria-label="Step 6: Startup"');
  });
});

describe("WizardProgress — completed-step aria labelling", () => {
  it("labels every prior step with ' (completed)' when the founder is on step 3", () => {
    const html = render(3);
    expect(html).toContain('aria-label="Step 1: Segment (completed)"');
    expect(html).toContain('aria-label="Step 2: Goal (completed)"');
    // Active step (no completed suffix).
    expect(html).toContain('aria-label="Step 3: Plan"');
    expect(html).not.toContain('aria-label="Step 3: Plan (completed)"');
    // Pending steps carry neither current nor completed.
    expect(html).toContain('aria-label="Step 4: Trial"');
    expect(html).toContain('aria-label="Step 5: Payment"');
    expect(html).toContain('aria-label="Step 6: Startup"');
  });

  it("labels every prior step with ' (completed)' when the founder is on step 6", () => {
    const html = render(6);
    for (let i = 1; i <= 5; i += 1) {
      const label = STEP_LABELS[i - 1];
      expect(html).toContain(`aria-label="Step ${i}: ${label} (completed)"`);
    }
    expect(html).toContain('aria-label="Step 6: Startup"');
    expect(html).not.toContain('aria-label="Step 6: Startup (completed)"');
  });

  it("emits no ' (completed)' suffix when the founder is on step 1", () => {
    const html = render(1);
    expect(html).not.toContain("(completed)");
  });
});

describe("WizardProgress — dot colour classes track state", () => {
  it("uses the active brand-cyan ring on the current step exactly once (step=2)", () => {
    const html = render(2);
    // The ring pattern is unique to the active dot.
    expect(occurrences(html, "bg-brand-cyan ring-brand-cyan/20")).toBe(1);
  });

  it("uses the muted done colour for every step below the active one (step=4 → 3 done dots)", () => {
    const html = render(4);
    // Done dot class: "bg-brand-cyan/60 ring-transparent" appears once per
    // done step. Three prior steps are done.
    expect(occurrences(html, "bg-brand-cyan/60 ring-transparent")).toBe(3);
  });

  it("uses the pending colour for every step above the active one (step=2 → 4 pending dots)", () => {
    const html = render(2);
    expect(occurrences(html, "bg-brand-ink-muted/30 ring-transparent")).toBe(4);
  });

  it("emits no done or pending dot classes on step 1 for the sole active dot", () => {
    const html = render(1);
    expect(occurrences(html, "bg-brand-cyan ring-brand-cyan/20")).toBe(1);
    // Step 1 → 5 pending, 0 done.
    expect(occurrences(html, "bg-brand-ink-muted/30 ring-transparent")).toBe(5);
    expect(occurrences(html, "bg-brand-cyan/60 ring-transparent")).toBe(0);
  });

  it("emits no pending dots on step 6 (all prior done, current active)", () => {
    const html = render(6);
    expect(occurrences(html, "bg-brand-cyan ring-brand-cyan/20")).toBe(1);
    expect(occurrences(html, "bg-brand-cyan/60 ring-transparent")).toBe(5);
    expect(occurrences(html, "bg-brand-ink-muted/30 ring-transparent")).toBe(0);
  });
});

describe("WizardProgress — connector colour tracks progress", () => {
  it("colours every connector left of the active dot with the brand-cyan variant (step=5 → 4 lit)", () => {
    const html = render(5);
    // Connector lit variant is "bg-brand-cyan/60"; the done-dot class
    // "bg-brand-cyan/60 ring-transparent" also contains that substring, so
    // subtract the done-dot occurrences to count connectors only.
    const lit = occurrences(html, "bg-brand-cyan/60");
    const doneDots = occurrences(html, "bg-brand-cyan/60 ring-transparent");
    expect(lit - doneDots).toBe(4);
  });

  it("colours every connector right of the active dot with the muted variant (step=2 → 4 muted connectors)", () => {
    const html = render(2);
    // Muted connector class: "bg-brand-ink-muted/20" is unique to connectors.
    expect(occurrences(html, "bg-brand-ink-muted/20")).toBe(4);
  });

  it("lights all 5 connectors when the founder reaches the final step (step=6)", () => {
    const html = render(6);
    const lit = occurrences(html, "bg-brand-cyan/60");
    const doneDots = occurrences(html, "bg-brand-cyan/60 ring-transparent");
    expect(lit - doneDots).toBe(5);
    expect(occurrences(html, "bg-brand-ink-muted/20")).toBe(0);
  });

  it("lights zero connectors when the founder is on the first step (step=1)", () => {
    const html = render(1);
    const lit = occurrences(html, "bg-brand-cyan/60");
    const doneDots = occurrences(html, "bg-brand-cyan/60 ring-transparent");
    expect(lit - doneDots).toBe(0);
    expect(occurrences(html, "bg-brand-ink-muted/20")).toBe(5);
  });
});

describe("WizardProgress — label colour tracks state", () => {
  it("colours the active label with text-brand-cyan exactly once (step=3)", () => {
    const html = render(3);
    // "text-brand-cyan" as a class token also appears as a substring of
    // other cyan classes ("bg-brand-cyan", "bg-brand-cyan/20", etc.). Match
    // on the exact quoted attribute value the active label carries.
    expect(occurrences(html, 'class="text-brand-cyan"')).toBe(1);
  });

  it("colours done labels with text-brand-ink-muted and pending labels with the /50 variant (step=3)", () => {
    const html = render(3);
    // Step 3: 2 done labels + 3 pending labels + 1 active label.
    expect(occurrences(html, 'class="text-brand-ink-muted"')).toBe(2);
    expect(occurrences(html, 'class="text-brand-ink-muted/50"')).toBe(3);
  });

  it("colours every label as done except the active one on the final step (step=6)", () => {
    const html = render(6);
    expect(occurrences(html, 'class="text-brand-ink-muted"')).toBe(5);
    expect(occurrences(html, 'class="text-brand-brand-cyan"')).toBe(0);
    expect(occurrences(html, 'class="text-brand-ink-muted/50"')).toBe(0);
    expect(occurrences(html, 'class="text-brand-cyan"')).toBe(1);
  });
});
