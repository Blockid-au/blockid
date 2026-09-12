import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// S18-B render test for /dashboard/integrations. Pins: a member reads the
// OWNER's integration evidence (read-only account lookup, no insert); the
// connect forms (OAuth callbacks are admin+) render for owner + admin only,
// editors/viewers see the status + view-only note.

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
vi.mock("@/lib/github", () => ({ isGitHubOAuthConfigured: () => true }));
vi.mock("@/lib/google-analytics-oauth", () => ({ isGoogleAnalyticsOAuthConfigured: () => true }));
vi.mock("@/components/dashboard/github-connect-form", () => ({
  GitHubConnectForm: (p: { initialRepo: string | null }) => <div data-gh-form data-repo={String(p.initialRepo)} />,
}));

import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { keyCalls } from "@/test/project-scope-mock";
import { renderPage, dataAttr } from "@/test/founder-page-harness";

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  return renderPage(Page({ searchParams: Promise.resolve({}) }));
}

const state = await scopeState;
let sb: FakeSupabase;

beforeEach(() => {
  state.role = "owner";
  state.projectId = "proj-1";
  state.account = { id: "acct-1" };
  state.calls.length = 0;
  sb = fakeSupabase({ svi_evidence: [{ value_or_url: "https://github.com/acme/app", label: "GA4" }] });
  sbState.sb = sb;
});

describe("/dashboard/integrations (S18-B)", () => {
  it("owner: own account, GitHub form + GA connect rendered", async () => {
    const out = await html();
    expect(keyCalls(state, "findOrCreateSVIAccount")).toHaveLength(1);
    expect(out).toContain("data-gh-form");
    expect(dataAttr(out, "repo")).toBe("https://github.com/acme/app");
    expect(out).toContain("/api/integrations/google-analytics/start");
    expect(out).not.toContain("viewer-readonly-note");
  });

  it("member (admin): OWNER's evidence, can connect", async () => {
    state.role = "admin";
    const out = await html();
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([]);
    expect(keyCalls(state, "findSVIAccountWithFallback")[0]).toMatchObject({ email: state.ownerEmail, projectId: "proj-1" });
    expect(sb.hasEq("svi_evidence", "account_id", "acct-1")).toBe(true);
    expect(out).toContain("data-gh-form");
    expect(out).not.toContain("viewer-readonly-note");
  });

  it("member (editor / viewer): status only — no connect form, view-only note", async () => {
    for (const role of ["editor", "viewer"] as const) {
      state.role = role;
      state.calls.length = 0;
      const out = await html();
      expect(keyCalls(state, "findOrCreateSVIAccount"), role).toEqual([]);
      expect(out, role).not.toContain("data-gh-form");
      expect(out, role).not.toContain("/api/integrations/google-analytics/start");
      expect(out, role).toContain("Connected · https://github.com/acme/app");
      expect(out, role).toContain('data-testid="viewer-readonly-note"');
    }
  });

  it("member whose owner has no account: nothing connected, no insert", async () => {
    state.role = "viewer";
    state.account = null;
    const out = await html();
    expect(sb.find("svi_accounts", "insert")).toEqual([]);
    expect(sb.find("svi_evidence", "select")).toEqual([]);
    expect(out).not.toContain("Connected ·");
  });
});
