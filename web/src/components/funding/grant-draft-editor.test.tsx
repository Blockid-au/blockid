// S8-B a11y render test for the grant application draft editor (T0251).
// renderToStaticMarkup only (no @testing-library here), so the assertions
// are on the SSR markup: an always-mounted polite live region for the
// generate / save / copy outcomes, textarea ↔ guidance + word-count wiring
// via aria-describedby, a visible focus ring on the textareas, the
// transparent-pricing line, and every icon decorative.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GrantDraftEditor } from "./grant-draft-editor";

const GRANT = { id: "mvp-ventures", name: "MVP Ventures", official_url: "https://www.nsw.gov.au/mvp", closes_at: "2026-11-30" };
const PROMPTS = [
  { id: "project", question: "Describe the project.", guidance: "Two paragraphs, plain English.", max_words: 300 },
  { id: "budget", question: "Budget and milestones.", guidance: "generic", max_words: null },
];

function render(over: Partial<Parameters<typeof GrantDraftEditor>[0]> = {}) {
  return renderToStaticMarkup(
    <GrantDraftEditor
      grant={GRANT}
      prompts={PROMPTS as Parameters<typeof GrantDraftEditor>[0]["prompts"]}
      generic={false}
      projectId="proj-1"
      initial={null}
      cost={2}
      unlimited={false}
      allowed
      {...over}
    />,
  );
}

describe("GrantDraftEditor — S8-B a11y", () => {
  it("mounts the live region before any notice exists and prices the draft up front", () => {
    const out = render();
    expect(out).toContain('role="status" aria-live="polite" data-draft-status');
    expect(out).not.toContain("data-draft-notice");
    expect(out).toContain('aria-labelledby="grant-draft-title"');
    expect(out).toContain("Generate draft — 2 credits");
    expect(out).toContain('class="sr-only">(opens in a new tab)</span>');
  });

  it("wires each textarea to its guidance and word count, with a visible focus ring", () => {
    const out = render();
    expect(out).toMatch(/<textarea id="draft-project" aria-describedby="draft-project-guidance draft-project-count"/);
    expect(out).toContain('id="draft-project-guidance"');
    expect(out).toContain('id="draft-project-count"');
    // Generic guidance is not rendered, so the description is the count only.
    expect(out).toMatch(/<textarea id="draft-budget" aria-describedby="draft-budget-count"/);
    expect(out).toContain("focus:ring-2 focus:ring-action/30");
    for (const svg of out.match(/<svg[^>]*>/g) ?? []) expect(svg).toContain("aria-hidden");
  });

  it("surfaces a failed previous AI run inside the live region with the warn tokens (not fixed amber)", () => {
    const out = render({ initial: { id: "d1", answers: { project: "Draft text" }, status: "draft", updated_at: "2026-09-10T00:00:00Z", ai_ok: false } });
    expect(out).toContain('data-draft-notice="warn"');
    expect(out).toContain("bg-warn/10 text-warn");
    expect(out).not.toContain("bg-amber-50");
  });
});
