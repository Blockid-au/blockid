import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// S28-B render test for /workspace/investors. Pins: the page renders the
// client inside the workspace shell and reads NOTHING keyed on the caller
// (no svi_accounts lookup, no project-record read — the CRM API resolves
// the scope); an anonymous caller is redirected to login with `next`.

const scopeState = vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
const authState = vi.hoisted(() => ({ anonymous: false }));
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(await scopeState);
});
vi.mock("@/lib/auth", async () => {
  const { founderUser } = await import("@/test/founder-page-harness");
  return { getCurrentUser: async () => (authState.anonymous ? null : founderUser(await scopeState)) };
});
vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("./investors-client", () => ({ InvestorsClient: () => <div data-crm /> }));

import { keyCalls } from "@/test/project-scope-mock";
import { renderPage } from "@/test/founder-page-harness";

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  return renderPage(Page());
}

const state = await scopeState;

beforeEach(() => {
  state.role = "viewer";
  state.projectId = "proj-1";
  state.calls.length = 0;
  authState.anonymous = false;
});

describe("/workspace/investors (S28-B)", () => {
  it("renders the CRM client in the shell with no caller-keyed reads", async () => {
    const out = await html();
    expect(out).toContain("data-shell");
    expect(out).toContain("data-crm");
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([]);
    expect(keyCalls(state, "findSVIAccountWithFallback")).toEqual([]);
  });

  it("anonymous → login with next", async () => {
    authState.anonymous = true;
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/investors");
  });
});
