import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";

// S18-B review P2-4 — the "Export to investor pack" form posted to
// /api/investor-pack/append, a route that does not exist. The CTA is now a
// link to the one-click generator page (which shows the credit cost before
// charging). Pins: the CTA targets an existing route file; editor+ see it,
// a viewer does not; the report is read per project only.

const scopeState = vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
const sbState = vi.hoisted(() => ({ sb: null as unknown }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => sbState.sb }));
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(await scopeState);
});
vi.mock("@/lib/auth", async () => {
  const { founderUser } = await import("@/test/founder-page-harness");
  return { getCurrentUser: async () => founderUser(await scopeState) };
});
vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { renderPage } from "@/test/founder-page-harness";

async function html(role = "cfo"): Promise<string> {
  const { default: Page } = await import("./page");
  return renderPage(Page({ params: Promise.resolve({ role }) }));
}

const state = await scopeState;
let sb: FakeSupabase;

const APP_ROOT = join(__dirname, "..", "..", "..", "..");

beforeEach(() => {
  state.role = "owner";
  state.projectId = "proj-1";
  state.calls.length = 0;
  sb = fakeSupabase({
    clevel_reports_v2: [{ title: "CFO base", summary: "s", scenario: "base", generated_at: "2026-09-01T00:00:00Z", body_markdown: null }],
    clevel_trend_snapshots: [],
  });
  sbState.sb = sb;
});

describe("/dashboard/c-level-reports/[role] (S18-B P2-4)", () => {
  it("owner: investor-pack CTA links to a page that exists (no dead /api/investor-pack/append form)", async () => {
    const out = await html();
    expect(out).toContain('data-testid="clevel-investor-pack-link"');
    expect(out).toContain('href="/workspace/investor-pack/generate?from=c-level-cfo"');
    expect(out).not.toContain("/api/investor-pack/append");
    expect(out).not.toContain("<form");
    expect(existsSync(join(APP_ROOT, "(founder)", "workspace", "investor-pack", "generate", "page.tsx"))).toBe(true);
    expect(existsSync(join(APP_ROOT, "..", "api", "investor-pack", "append"))).toBe(false);
  });

  it("member (editor): report read per project, CTA shown", async () => {
    state.role = "editor";
    const out = await html("ceo");
    expect(sb.hasEq("clevel_reports_v2", "project_id", "proj-1")).toBe(true);
    expect(sb.hasEq("clevel_reports_v2", "role", "ceo")).toBe(true);
    expect(out).toContain('data-testid="clevel-investor-pack-link"');
    expect(out).toContain("CFO base");
  });

  it("member (viewer): same report, no investor-pack CTA", async () => {
    state.role = "viewer";
    const out = await html();
    expect(out).toContain("CFO base");
    expect(out).not.toContain('data-testid="clevel-investor-pack-link"');
  });

  it("unknown role → notFound", async () => {
    await expect(html("cxo")).rejects.toThrow("NOT_FOUND");
  });
});
