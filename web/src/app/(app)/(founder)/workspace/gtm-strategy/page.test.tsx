import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// S18-B render test for /workspace/gtm-strategy — member-aware founder-feature page.
// Pins: owner reads their own rows (unchanged); a member reads the OWNER's
// rows (founderFeatureScope keyed on ownerUserId); a viewer gets
// `disabled` on the planner + the view-only note; editor does not.

const scopeState = vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
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
vi.mock("@/lib/platform-config", () => ({
  getPlatformConfig: async () => ({
    founder_features_copy: { gtm_intro: "intro", gtm_placeholder_segment: "seg", gtm_placeholder_value_prop: "vp" },
  }),
}));
const listMock = vi.fn();
vi.mock("@/lib/founder-features", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/founder-features")>();
  return { ...actual, getGtmStrategy: (scope: unknown) => listMock(scope) };
});
vi.mock("./gtm-strategy-client", () => ({
  GtmStrategyClient: (p: { initial: unknown; disabled: boolean }) => (
    <div data-planner data-count={p.initial ? 1 : 0} data-disabled={String(p.disabled)} />
  ),
}));

import { renderPage, dataAttr } from "@/test/founder-page-harness";

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  return renderPage(Page());
}

const state = await scopeState;

beforeEach(() => {
  state.role = "owner";
  state.projectId = "proj-1";
  state.calls.length = 0;
  listMock.mockReset();
  listMock.mockResolvedValue({ id: "g1", target_segment: "SMB" });
});

describe("/workspace/gtm-strategy (S18-B)", () => {
  it("owner: reads own rows under (callerId, project) and the planner is enabled", async () => {
    const out = await html();
    expect(listMock).toHaveBeenCalledWith({ ownerUserId: state.callerId, projectId: "proj-1" });
    expect(dataAttr(out, "count")).toBe("1");
    expect(dataAttr(out, "disabled")).toBe("false");
    expect(out).not.toContain("viewer-readonly-note");
  });

  it("member (editor): reads the OWNER's rows and can edit", async () => {
    state.role = "editor";
    const out = await html();
    expect(listMock).toHaveBeenCalledWith({ ownerUserId: state.ownerId, projectId: "proj-1" });
    expect(dataAttr(out, "count")).toBe("1");
    expect(dataAttr(out, "disabled")).toBe("false");
    expect(out).not.toContain("viewer-readonly-note");
  });

  it("member (viewer): sees the OWNER's rows read-only with the view-only note", async () => {
    state.role = "viewer";
    const out = await html();
    expect(listMock).toHaveBeenCalledWith({ ownerUserId: state.ownerId, projectId: "proj-1" });
    expect(dataAttr(out, "count")).toBe("1");
    expect(dataAttr(out, "disabled")).toBe("true");
    expect(out).toContain('data-testid="viewer-readonly-note"');
    expect(out).toContain("Shared · Viewer");
  });

  it("no project: legacy owner path — own id, null project, planner disabled with the create-startup hint", async () => {
    state.projectId = null;
    listMock.mockResolvedValue(null);
    const out = await html();
    expect(listMock).toHaveBeenCalledWith({ ownerUserId: state.callerId, projectId: null });
    expect(dataAttr(out, "disabled")).toBe("true");
    expect(out).toContain("Create or select a startup first");
    expect(out).not.toContain("viewer-readonly-note");
  });

  it("never resolves a scope below viewer and never touches svi_accounts", async () => {
    state.role = "viewer";
    await html();
    expect(state.lastMinRole).toBe("viewer");
    expect(state.calls.map((c) => c.fn)).toEqual([]);
  });
});
