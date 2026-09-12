import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// S18-B review P2-1 render test for /workspace/tech-analysis. Pins: the
// project's website/github URLs are read under the OWNER's id; owner +
// editor get an enabled panel; a viewer gets `readOnly` + the view-only
// note (the route is editor+, so the Run button must not be offered).

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
vi.mock("@/components/founder/tech-intelligence-panel", () => ({
  TechIntelligencePanel: (p: { startupId: string; initialWebsiteUrl?: string; initialGithubUrl?: string; readOnly?: boolean }) => (
    <div
      data-panel
      data-startup={p.startupId}
      data-website={p.initialWebsiteUrl ?? ""}
      data-github={p.initialGithubUrl ?? ""}
      data-readonly={String(Boolean(p.readOnly))}
    />
  ),
}));

import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
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
  state.calls.length = 0;
  sb = fakeSupabase({
    projects: [{ website_url: "https://acme.test", github_url: "https://github.com/acme/x" }],
  });
  sbState.sb = sb;
});

describe("/workspace/tech-analysis (S18-B P2-1)", () => {
  it("owner: project URLs under own id, panel editable, no note", async () => {
    const out = await html();
    expect(sb.hasEq("projects", "id", "proj-1")).toBe(true);
    expect(sb.hasEq("projects", "user_id", state.callerId)).toBe(true);
    expect(dataAttr(out, "website")).toBe("https://acme.test");
    expect(dataAttr(out, "readonly")).toBe("false");
    expect(out).not.toContain("viewer-readonly-note");
  });

  it("member (editor): project URLs under the OWNER's id, panel editable", async () => {
    state.role = "editor";
    const out = await html();
    expect(sb.hasEq("projects", "user_id", state.ownerId)).toBe(true);
    expect(sb.hasEq("projects", "user_id", state.callerId)).toBe(false);
    expect(dataAttr(out, "startup")).toBe("proj-1");
    expect(dataAttr(out, "github")).toBe("https://github.com/acme/x");
    expect(dataAttr(out, "readonly")).toBe("false");
    expect(out).not.toContain("viewer-readonly-note");
  });

  it("member (viewer): OWNER's URLs, panel readOnly + view-only note", async () => {
    state.role = "viewer";
    const out = await html();
    expect(sb.hasEq("projects", "user_id", state.ownerId)).toBe(true);
    expect(dataAttr(out, "readonly")).toBe("true");
    expect(out).toContain('data-testid="viewer-readonly-note"');
    expect(out).toContain("Shared · Viewer");
  });

  it("no project → redirect to /workspace/projects, nothing read", async () => {
    state.projectId = null;
    await expect(html()).rejects.toThrow("REDIRECT:/workspace/projects");
    expect(sb.calls).toEqual([]);
  });

  it("resolves the scope at viewer only (never throws for a viewer)", async () => {
    state.role = "viewer";
    await html();
    expect(state.lastMinRole).toBe("viewer");
  });
});
