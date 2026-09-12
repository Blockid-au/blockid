import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// S18-B render test for /workspace/metrics. Pins: owner path unchanged; a
// member reads the OWNER's account (read-only lookup, no insert) and the
// startup_metrics rows under the OWNER's email + project (the key
// /api/metrics writes under); a viewer gets readOnly (no entry form).

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
}));
vi.mock("@/components/analytics/page-tracker", () => ({ PageTracker: () => null }));
vi.mock("./metrics-client", () => ({
  MetricsClient: (p: { metrics: unknown[]; stage: string; readOnly?: boolean }) => (
    <div data-metrics data-count={p.metrics.length} data-stage={p.stage} data-readonly={String(Boolean(p.readOnly))} />
  ),
}));

import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { keyCalls } from "@/test/project-scope-mock";
import { renderPage, dataAttr } from "@/test/founder-page-harness";

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  return renderPage(Page());
}

const state = await scopeState;
let sb: FakeSupabase;

beforeEach(() => {
  state.role = "owner";
  state.projectId = "proj-1";
  state.account = { id: "acct-1" };
  state.calls.length = 0;
  sb = fakeSupabase({
    svi_accounts: [{ id: "acct-1", current_stage: 2 }],
    startup_metrics: [{ id: "m1", metric_date: "2026-08-01", mrr_aud: 1000 }],
  });
  sbState.sb = sb;
});

describe("/workspace/metrics (S18-B)", () => {
  it("owner: own account + metrics under own email (unchanged), form enabled", async () => {
    const out = await html();
    expect(keyCalls(state, "findOrCreateSVIAccount")).toHaveLength(1);
    expect(sb.hasEq("startup_metrics", "email", state.callerEmail)).toBe(true);
    expect(sb.hasEq("startup_metrics", "project_id", "proj-1")).toBe(true);
    expect(dataAttr(out, "count")).toBe("1");
    expect(dataAttr(out, "stage")).toBe("series-a");
    expect(dataAttr(out, "readonly")).toBe("false");
  });

  it("member (editor): OWNER's account (read-only lookup) + metrics under the OWNER's email", async () => {
    state.role = "editor";
    const out = await html();
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([]);
    expect(keyCalls(state, "findSVIAccountWithFallback")[0]).toMatchObject({
      email: state.ownerEmail,
      projectId: "proj-1",
      opts: { callerEmail: state.callerEmail },
    });
    expect(sb.hasEq("startup_metrics", "email", state.ownerEmail)).toBe(true);
    expect(sb.hasEq("startup_metrics", "email", state.callerEmail)).toBe(false);
    expect(dataAttr(out, "count")).toBe("1");
    expect(dataAttr(out, "readonly")).toBe("false");
    expect(out).not.toContain("viewer-readonly-note");
  });

  it("member (viewer): dashboard only — readOnly + view-only note", async () => {
    state.role = "viewer";
    const out = await html();
    expect(dataAttr(out, "count")).toBe("1");
    expect(dataAttr(out, "readonly")).toBe("true");
    expect(out).toContain('data-testid="viewer-readonly-note"');
    expect(sb.find("svi_accounts", "insert")).toEqual([]);
  });

  it("member whose owner has no account: default stage, metrics still read under the owner's key, no insert", async () => {
    state.role = "viewer";
    state.account = null;
    const out = await html();
    expect(dataAttr(out, "stage")).toBe("pre-seed");
    expect(sb.hasEq("startup_metrics", "email", state.ownerEmail)).toBe(true);
    expect(sb.find("svi_accounts", "insert")).toEqual([]);
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([]);
  });
});
