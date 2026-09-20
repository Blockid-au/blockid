import type React from "react";
import { describe, expect, it, vi } from "vitest";

// G20-sweep (2026-09-20): /workspace/score/listing rendered TWO h1s — the
// page header and the NotAvailableYet card (its NotOfferedCard defaults to
// `h1`). The card is now `headingLevel="h2"`; the page keeps its own title.

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => ({ id: "u-1", email: "f@x.au", displayName: "F", role: "user", plan: "founder_free" }),
}));
vi.mock("@/lib/projects", () => ({ getCurrentProjectIsSandbox: async () => false }));
vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <main data-shell>{children}</main>,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { renderPage } from "@/test/founder-page-harness";

describe("/workspace/score/listing", () => {
  it("renders exactly one h1 (the page title) — the not-offered card is an h2", async () => {
    const { default: Page } = await import("./page");
    const out = await renderPage(Page());
    expect((out.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    expect(out).toMatch(/<h1[^>]*>\s*List your startup\s*<\/h1>/);
    expect(out).toMatch(/<h2[^>]*>Submit a listing<\/h2>/);
    expect(out).toContain('href="/workspace/exit/listing"');
  });
});
