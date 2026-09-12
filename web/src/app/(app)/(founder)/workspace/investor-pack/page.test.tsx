import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// S18-B review P2-5 render test for /workspace/investor-pack. The pinned
// exit scenario used to be looked up via `svi_accounts.user_id` — a column
// that does not exist — so it never loaded. Pins: the account id comes from
// resolveSVIAccountIdForPage (owner find-or-creates, member reads the
// OWNER's row), exit_scenarios is keyed on that id, the SVI report on the
// OWNER's user id, share links on the CALLER, and a viewer gets readOnly.

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
vi.mock("@/components/legal/not-financial-advice", () => ({ NotFinancialAdvice: () => null }));
vi.mock("@/components/workspace/report-archive", () => ({ ReportArchive: () => null }));
vi.mock("./generate/InvestorPackGenerateForm", () => ({
  InvestorPackGenerateForm: (p: { readOnly?: boolean }) => <div data-form data-readonly={String(Boolean(p.readOnly))} />,
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
  state.accountId = "acct-1";
  state.account = { id: "acct-1" };
  state.calls.length = 0;
  sb = fakeSupabase({
    projects: [{ name: "Acme" }],
    svi_reports: [{ grade: "B+" }],
    investor_pack_shares: [],
    financial_models: [{ id: "fm-1", name: "Base case", scenario: "base" }],
    exit_scenarios: [{ id: "ex-1", scenario_name: "Trade sale 2029", exit_type: "acquisition" }],
  });
  sbState.sb = sb;
});

describe("/workspace/investor-pack (S18-B P2-5)", () => {
  it("owner: pinned exit via own account id (no svi_accounts.user_id probe), form editable", async () => {
    const out = await html();
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([
      { fn: "findOrCreateSVIAccount", email: state.callerEmail, projectId: "proj-1" },
    ]);
    expect(sb.find("svi_accounts", "select")).toEqual([]);
    expect(sb.hasEq("exit_scenarios", "account_id", "acct-1")).toBe(true);
    expect(sb.hasEq("financial_models", "project_id", "proj-1")).toBe(true);
    expect(out).toContain("Trade sale 2029");
    expect(out).toContain("Base case");
    expect(dataAttr(out, "readonly")).toBe("false");
  });

  it("member (viewer): OWNER's account + SVI report, CALLER's share links, readOnly + note", async () => {
    state.role = "viewer";
    const out = await html();
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([]);
    expect(keyCalls(state, "findSVIAccountWithFallback")[0]).toMatchObject({
      email: state.ownerEmail,
      projectId: "proj-1",
      opts: { callerEmail: state.callerEmail },
    });
    expect(sb.hasEq("exit_scenarios", "account_id", "acct-1")).toBe(true);
    expect(sb.hasEq("svi_reports", "user_id", state.ownerId)).toBe(true);
    expect(sb.hasEq("investor_pack_shares", "user_id", state.callerId)).toBe(true);
    expect(sb.find("svi_accounts", "insert")).toEqual([]);
    expect(out).toContain("Trade sale 2029");
    expect(dataAttr(out, "readonly")).toBe("true");
    expect(out).toContain('data-testid="viewer-readonly-note"');
  });

  it("member whose owner has no account yet: no exit_scenarios read, page still renders", async () => {
    state.role = "editor";
    state.account = null;
    const out = await html();
    expect(sb.find("exit_scenarios", "select")).toEqual([]);
    expect(out).not.toContain("Trade sale 2029");
    expect(dataAttr(out, "readonly")).toBe("false");
  });
});
