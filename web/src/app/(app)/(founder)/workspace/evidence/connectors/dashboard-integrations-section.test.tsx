import { beforeEach, describe, expect, it, vi } from "vitest";

// S18-B render test for the "Evidence sources" section of
// /workspace/evidence/connectors (ex /dashboard/integrations). Pins: a member
// reads the OWNER's integration evidence (read-only account lookup, no
// insert); OAuth linking (callbacks are admin+) renders for owner + admin
// only; the manual GitHub form (editor+) also renders for editors; viewers
// see status only.

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
vi.mock("@/lib/github", () => ({ isGitHubOAuthConfigured: () => true }));
vi.mock("@/lib/google-analytics-oauth", () => ({ isGoogleAnalyticsOAuthConfigured: () => true }));
vi.mock("@/components/dashboard/github-connect-form", () => ({
  GitHubConnectForm: (p: { initialRepo: string | null; oauthEnabled: boolean }) => (
    <div data-gh-form data-repo={String(p.initialRepo)} data-oauth={String(p.oauthEnabled)} />
  ),
}));

import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { keyCalls } from "@/test/project-scope-mock";
import { founderUser, renderPage, dataAttr } from "@/test/founder-page-harness";
import type { AppUser } from "@/lib/auth";

async function html(): Promise<string> {
  const { DashboardIntegrationsSection } = await import("./dashboard-integrations-section");
  return renderPage(DashboardIntegrationsSection({ user: founderUser(state) as AppUser }));
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

describe("/workspace/evidence/connectors — Evidence sources section (S18-B)", () => {
  it("owner: own account, GitHub form (OAuth on) + GA connect rendered", async () => {
    const out = await html();
    expect(keyCalls(state, "findOrCreateSVIAccount")).toHaveLength(1);
    expect(out).toContain("data-gh-form");
    expect(dataAttr(out, "oauth")).toBe("true");
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

  it("member (editor): manual GitHub form without OAuth, no GA link, admin-only note", async () => {
    state.role = "editor";
    const out = await html();
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([]);
    expect(out).toContain("data-gh-form");
    expect(dataAttr(out, "oauth")).toBe("false");
    expect(out).not.toContain("/api/integrations/google-analytics/start");
    expect(out).toContain("admin only");
  });

  it("member (viewer): status only — no connect form, no GA link, view-only note", async () => {
    state.role = "viewer";
    const out = await html();
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([]);
    expect(out).not.toContain("data-gh-form");
    expect(out).not.toContain("/api/integrations/google-analytics/start");
    expect(out).toContain("Connected · https://github.com/acme/app");
    expect(out).toContain('data-testid="viewer-readonly-note"');
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
