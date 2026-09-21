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

describe("/tbr/demo (G21-P1-B → G27 v3)", () => {
  it("opens with the Dashboard — SVI + Evidence Confidence tiles once, above the Investment view — then the 8 dimension chapters", async () => {
    const out = await html();
    // G27: the v3 Dashboard is the ONE surface for SVI + Evidence Confidence (the
    // G21 Assessment Card's numbers now live in its tiles); it renders once,
    // ahead of the Investment view, and never a benchmark line without n.
    expect((out.match(/id="tbr-dashboard"/g) ?? []).length).toBe(1);
    const dash = out.slice(out.indexOf('id="tbr-dashboard"'), out.indexOf('id="tbr-investment-view"'));
    expect(dash).toContain('data-tbr-tile="svi"');
    expect(dash).toContain('data-tbr-tile="evidence"');
    expect(dash).toContain("Evidence confidence");
    expect(out.indexOf('id="tbr-dashboard"')).toBeLessThan(out.indexOf('id="tbr-investment-view"'));
    expect(out.indexOf('id="tbr-investment-view"')).toBeLessThan(out.indexOf('id="tbr-dim-'));
    expect((out.match(/id="tbr-dim-[a-z]+"/g) ?? []).length).toBe(8);
    expect(out).toContain('id="tbr-risk-matrix"');
    expect(out).not.toContain("Australian average");
    expect(out).not.toMatch(/\[ev:|\[unevidenced\]/);
  });
});
