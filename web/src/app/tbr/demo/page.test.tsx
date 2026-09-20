// G21-P1-B — /tbr/demo renders the Assessment Card (fixture data) once, above
// the executive summary, and the 8 dimension explainability cards.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/marketing/marketing-hero", () => ({
  MarketingHero: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

import TbrDemoPage from "./page";

async function html(): Promise<string> {
  const stream = await renderToReadableStream(<TbrDemoPage />);
  await stream.allReady;
  return new Response(stream).text();
}

describe("/tbr/demo (G21-P1-B)", () => {
  it("shows the Assessment Card once with SVI + Evidence Confidence, above the executive summary, and ≥ 1 dimension explainability card", async () => {
    const out = await html();
    expect((out.match(/data-testid="assessment-card"/g) ?? []).length).toBe(1);
    const card = out.slice(out.indexOf('data-testid="assessment-card"'), out.indexOf('id="tbr-executive"'));
    expect(card).toContain(">SVI<");
    expect(card).toContain(">Evidence Confidence<");
    expect(card).toContain("BlockID Verified L2");
    expect(out.indexOf('data-testid="assessment-card"')).toBeLessThan(out.indexOf('id="tbr-executive"'));
    expect(out.indexOf('data-testid="assessment-card"')).toBeGreaterThan(out.indexOf('id="tbr-cover"'));
    expect((out.match(/data-testid="dimension-explain"/g) ?? []).length).toBe(8);
    // No benchmark line until P1-C wires `benchmarkLabel(n)` through the `benchmarks` prop.
    expect(out).not.toContain("data-assessment-benchmark");
    expect(out).not.toContain("Australian average");
  });
});
