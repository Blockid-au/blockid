import type React from "react";
import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
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

describe("/funding interim landing", () => {
  it("renders live counts, the free directories and the A$3 / evaluator paths", async () => {
    const out = await html();
    expect(out).toContain("1 Australian grants worth up to");
    expect(out).toContain("/funding/grants");
    expect(out).toContain("/funding/programs/sydney");
    expect(out).toContain("A$3");
    expect(out).toContain("/pricing?segment=evaluator");
    expect(out).not.toMatch(/A\$5\.50|PhD/);
  });
});
