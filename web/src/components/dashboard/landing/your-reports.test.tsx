// Block 5 · Your reports — SSR pins (G13-W3-IA3 §B.1 row 5 / §B.4 row 5).

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", () => ({ trackEvent: () => undefined }));

import { REPORTS_EMPTY, YourReports, reportTitle } from "./your-reports";

const ctx = { phase: "vision", plan: "founder_free", persona: "founder" };

describe("YourReports", () => {
  it("empty state: the §B.4 copy + Generate → /workspace/reports/business", () => {
    const html = renderToStaticMarkup(<YourReports ctx={ctx} reports={[]} />);
    expect(html).toContain('data-landing-block="your-reports" data-landing-empty="true"');
    expect(html).toContain(REPORTS_EMPTY);
    expect(html).toContain('href="/workspace/reports/business"');
    expect(html).toContain(">Generate<");
  });

  it("lists at most three artefacts with links and Open reports → /workspace/reports", () => {
    const reports = [1, 2, 3, 4].map((n) => ({ id: `r${n}`, total_svi: 60 + n, created_at: `2026-09-0${n}T00:00:00.000Z`, input_type: "text", raw_input: n === 1 ? "Acme drone inspection" : null }));
    const html = renderToStaticMarkup(<YourReports ctx={ctx} reports={reports} />);
    expect(html).not.toContain("data-landing-empty");
    expect((html.match(/href="\/workspace\/reports\/r\d"/g) ?? []).length).toBe(3);
    expect(html).toContain("Acme drone inspection");
    expect(html).toContain("SVI 62");
    expect(html).toContain('href="/workspace/reports"');
    expect(html).toContain(">Open reports<");
  });

  it("reportTitle truncates long input and falls back to the date", () => {
    expect(reportTitle({ id: "a", total_svi: null, created_at: "", input_type: null, raw_input: "x".repeat(80) })).toBe(`${"x".repeat(60)}…`);
    expect(reportTitle({ id: "a", total_svi: null, created_at: "2026-09-01T00:00:00.000Z", input_type: null, raw_input: "  " })).toMatch(/^Analysis \d/);
    expect(reportTitle({ id: "a", total_svi: null, created_at: "", input_type: null, raw_input: null })).toBe("Analysis");
  });
});
