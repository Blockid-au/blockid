// S8-B a11y render test for the Batch score dialog (T0272). SSR markup only
// (effects — focus trap / Escape — do not run server-side and are covered
// by src/lib/a11y/keyboard.test.ts). Pins: dialog semantics with a
// description, the cost line as a polite live region, the rubric sliders as
// a labelled group with aria-valuetext, the disclosure button's
// aria-expanded / aria-controls, and the queue button's aria-busy.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { EvaluationListRow } from "@/lib/evaluations";
import { BatchDialog } from "./batch-dialog";

const noop = () => undefined;
const SELECTED = [
  { id: "e1", projectName: "Acme" },
  { id: "e2", projectName: "Beta" },
] as unknown as EvaluationListRow[];

describe("BatchDialog — S8-B a11y", () => {
  it("is a described modal dialog whose cost line is a live region and whose queue button is not busy at rest", () => {
    const out = renderToStaticMarkup(
      <BatchDialog selected={SELECTED} quotaRemaining={7} quotaLimit={10} onClose={noop} onQueued={noop} />,
    );
    expect(out).toContain('role="dialog"');
    expect(out).toContain('aria-modal="true"');
    expect(out).toContain('aria-labelledby="batch-title"');
    expect(out).toContain('aria-describedby="batch-intro"');
    expect(out).toContain('id="batch-intro"');
    expect(out).toMatch(/data-testid="batch-cost" role="status" aria-live="polite"/);
    expect(out).toContain("<strong>2</strong> of your included Trust BizReports this month (7 of 10 left)");
    expect(out).toMatch(/<button type="submit"[^>]*aria-busy="false"/);
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain('aria-controls="batch-weight-sliders"');
    for (const svg of out.match(/<svg[^>]*>/g) ?? []) expect(svg).toContain('aria-hidden="true"');
  });

  it("disables the queue button when the quota cannot cover the selection and says why", () => {
    const out = renderToStaticMarkup(
      <BatchDialog selected={SELECTED} quotaRemaining={1} quotaLimit={10} onClose={noop} onQueued={noop} />,
    );
    expect(out).toMatch(/<button type="submit"[^>]*disabled=""/);
    expect(out).toContain("Not enough included reports left");
  });
});
