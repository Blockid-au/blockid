import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// S-R5 render test for /workspace/evidence/founder: the latest
// founder_signals row for the project is shown; editors get the form,
// viewers are read-only; no project → prompt; anonymous → login redirect.

const scopeState = vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
const sbState = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: (_c: string, v: string) => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: sbState.rows.find((r) => r.project_id === v) ?? null, error: null }) }) }) }) }),
    }),
  }),
}));
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(await scopeState);
});
const auth = vi.hoisted(() => ({ anonymous: false }));
vi.mock("@/lib/auth", async () => {
  const { founderUser } = await import("@/test/founder-page-harness");
  return { getCurrentUser: async () => (auth.anonymous ? null : founderUser(await scopeState)) };
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
vi.mock("./founder-client", () => ({
  FounderSignalsClient: (p: { initial: { founderName: string | null; exits: number } | null; readOnly?: boolean }) => (
    <div data-founder data-name={p.initial?.founderName ?? ""} data-exits={String(p.initial?.exits ?? "")} data-readonly={String(Boolean(p.readOnly))} />
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
  auth.anonymous = false;
  sbState.rows = [
    { id: "fs-1", project_id: "proj-1", source: "linkedin_pdf", profile_url: null, founder_name: "Jane Doe", headline: "CEO", current_role: "CEO at Acme", years_experience: "13.6", years_in_domain: "8.7", prior_companies: ["Atlassian"], exits: 1, team_size_on_page: 14, roles: [], education: [], confidence: "1", parsed_at: "2026-09-16T00:00:00Z" },
  ];
});

describe("/workspace/evidence/founder (S-R5)", () => {
  it("owner: latest signals for the project, form enabled", async () => {
    const out = await html();
    expect(dataAttr(out, "name")).toBe("Jane Doe");
    expect(dataAttr(out, "exits")).toBe("1");
    expect(dataAttr(out, "readonly")).toBe("false");
    expect(out).toContain("Founder evidence");
  });

  it("viewer: read-only; no row → empty initial", async () => {
    state.role = "viewer";
    sbState.rows = [];
    const out = await html();
    expect(dataAttr(out, "readonly")).toBe("true");
    expect(dataAttr(out, "name")).toBe("");
    expect(out).toContain("upload founder evidence");
  });

  it("no project → prompt; anonymous → login redirect with next", async () => {
    state.projectId = null;
    expect(await html()).toContain("Create or select a project first");
    auth.anonymous = true;
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/evidence/founder");
  });
});
