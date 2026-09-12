import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// S18-B render test for /workspace/esop/grants. Pins: listGrants is keyed on
// the OWNER's id + project for members (the key /api/esop/grants uses), on
// the caller's own id for the owner / no-project path; viewers get
// readOnly on GrantsClient + the view-only note.

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
const listGrantsMock = vi.fn();
vi.mock("@/lib/esop-grants", () => ({ listGrants: (u: string, p: string | null) => listGrantsMock(u, p) }));
vi.mock("@/lib/div83a-checker", () => ({ DIV83A_DISCLAIMER: "NFA" }));
vi.mock("./grants-client", () => ({
  GrantsClient: (p: { initialGrants: unknown[]; readOnly?: boolean }) => (
    <div data-grants data-count={p.initialGrants.length} data-readonly={String(Boolean(p.readOnly))} />
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
  listGrantsMock.mockReset();
  listGrantsMock.mockResolvedValue([{ id: "g1" }, { id: "g2" }]);
});

describe("/workspace/esop/grants (S18-B)", () => {
  it("owner: grants under own id + project, editable", async () => {
    const out = await html();
    expect(listGrantsMock).toHaveBeenCalledWith(state.callerId, "proj-1");
    expect(dataAttr(out, "count")).toBe("2");
    expect(dataAttr(out, "readonly")).toBe("false");
  });

  it("member (admin): grants under the OWNER's id, editable", async () => {
    state.role = "admin";
    const out = await html();
    expect(listGrantsMock).toHaveBeenCalledWith(state.ownerId, "proj-1");
    expect(dataAttr(out, "count")).toBe("2");
    expect(dataAttr(out, "readonly")).toBe("false");
    expect(out).not.toContain("viewer-readonly-note");
  });

  it("member (viewer): grants under the OWNER's id, read-only + note", async () => {
    state.role = "viewer";
    const out = await html();
    expect(listGrantsMock).toHaveBeenCalledWith(state.ownerId, "proj-1");
    expect(dataAttr(out, "readonly")).toBe("true");
    expect(out).toContain('data-testid="viewer-readonly-note"');
  });

  it("no project: legacy owner path (own id, null project)", async () => {
    state.projectId = null;
    await html();
    expect(listGrantsMock).toHaveBeenCalledWith(state.callerId, null);
  });
});
