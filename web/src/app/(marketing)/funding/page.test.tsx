import type React from "react";
import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));

// The intake resolves who is signed in after hydration; on the server both
// hooks return their "resolving" state.
vi.mock("@/hooks/useAuthUser", () => ({ useAuthUser: () => undefined }));
vi.mock("@/hooks/useEntitlement", () => ({
  useEntitlement: () => ({ user: null, entitlements: [], trial: null, isLoading: true, can: () => false, refresh: async () => undefined }),
}));

vi.mock("@/lib/funding/data", () => ({
  listGrants: vi.fn(async () => [
    { id: "g1", name: "MVP Ventures", status: "open", amount_max_aud: 75000, exclude_from_matching: false, last_verified_at: "2026-09-10" },
    { id: "g2", name: "Closed one", status: "closed", amount_max_aud: 1000, exclude_from_matching: false, last_verified_at: "2026-09-10" },
  ]),
  listPrograms: vi.fn(async () => [{ id: "p1", name: "Plus Eight", status: "open", last_verified_at: "2026-09-10" }]),
}));

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  const el = await Page();
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return await new Response(stream).text();
}

describe("/funding landing (T0242)", () => {
  it("renders live counts, the free directories and the A$3 / evaluator paths", async () => {
    const out = await html();
    expect(out).toContain("1 Australian grants worth up to");
    expect(out).toContain("/funding/grants");
    expect(out).toContain("/funding/programs/sydney");
    expect(out).toContain("A$3");
    expect(out).toContain("/pricing?segment=evaluator");
    expect(out).not.toMatch(/A\$5\.50|PhD|A\$99/);
  });

  it("renders the 3-question intake with 8 states + not incorporated, 5 stages and the improve-my-match drawer", async () => {
    const out = await html();
    expect(out).toContain('data-funding-intake');
    expect(out).toContain('id="fi-description"');
    for (const s of ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]) expect(out).toContain(`value="${s}"`);
    expect(out).toContain("Not incorporated yet");
    for (const s of ["idea", "pre_revenue_prototype", "mvp", "early_revenue", "scaling"]) expect(out).toContain(`value="${s}"`);
    expect(out).toContain("Improve my match");
    // Counts from the mocked catalogue feed the intro line.
    expect(out.replace(/<!-- -->/g, "")).toContain("1 grants and 1 programs are open right now");
    // Preview + paywall are not rendered until a submit.
    expect(out).not.toContain("data-funding-paywall");
  });

  it("links the 9 funding insight articles in a Read more strip (T0249)", async () => {
    const out = await html();
    expect(out).toContain('aria-label="Read more about startup funding in Australia"');
    for (const slug of [
      "government-grants-startups-australia-2026",
      "non-dilutive-funding-strategies-australia",
      "esic-and-rnd-tax-incentive-guide-2026",
      "r-and-d-tax-incentive-startups-australia",
      "esic-compliance-guide-early-stage-startups",
      "revenue-based-financing-australia",
      "australian-startup-funding-rounds-2026-guide",
      "venture-debt-vs-equity-funding-australia",
      "bootstrapping-vs-fundraising-australian-founders",
    ]) {
      expect(out).toContain(`href="/insights/${slug}"`);
    }
    // Title comes from the manifest, not hand-typed copy.
    expect(out).toContain("Australian Government Grants for Startups 2026");
  });

  it("carries the §5a positioning, the price ladder and the §5f disclaimer", async () => {
    const out = await html();
    expect(out).toContain("The lists are free.");
    expect(out).toContain("A$29/mo");
    expect(out).toContain("Founder Radar");
    expect(out).toContain('data-surface="funding_directory"');
    expect(out).toContain("Last verified");
  });
});
