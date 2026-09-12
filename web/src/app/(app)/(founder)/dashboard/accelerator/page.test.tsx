import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// S18-B review P2-5 render test for /dashboard/accelerator. The page used
// to read `svi_accounts.account_id = userId` / `score` / `stage` — columns
// that do not exist (migrations 0008 + 0020) — so the SVI card was always
// empty. Pins: the account is resolved via resolveSVIAccountIdForPage
// (owner find-or-creates, member reads the OWNER's row) and both the
// account and svi_milestones reads are keyed on `svi_accounts.id`.

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
vi.mock("./accelerator-client", () => ({
  AcceleratorClient: (p: { currentSvi: number; stage: number; startupName: string; milestones: Array<{ title: string }> }) => (
    <div
      data-accel
      data-svi={p.currentSvi}
      data-stage={p.stage}
      data-name={p.startupName}
      data-milestones={p.milestones.map((m) => m.title).join("|")}
    />
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
  state.accountId = "acct-1";
  state.account = { id: "acct-1" };
  state.calls.length = 0;
  sb = fakeSupabase({
    svi_accounts: [{ id: "acct-1", current_svi: 142, current_stage: 3, startup_name: "Acme" }],
    svi_milestones: [{ id: "m1", badge_label: "First revenue", achieved_at: "2026-08-01" }],
  });
  sbState.sb = sb;
});

describe("/dashboard/accelerator (S18-B P2-5)", () => {
  it("owner: find-or-creates own account, reads svi_accounts by id and milestones by account_id (real columns)", async () => {
    const out = await html();
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([
      { fn: "findOrCreateSVIAccount", email: state.callerEmail, projectId: "proj-1" },
    ]);
    expect(sb.hasEq("svi_accounts", "id", "acct-1")).toBe(true);
    expect(sb.hasEq("svi_accounts", "account_id", state.callerId)).toBe(false);
    expect(sb.hasEq("svi_milestones", "account_id", "acct-1")).toBe(true);
    expect(sb.hasEq("svi_milestones", "account_id", state.callerId)).toBe(false);
    const select = sb.find("svi_accounts", "select")[0];
    expect(select.args[0]).toBe("current_svi, current_stage, startup_name");
    expect(dataAttr(out, "svi")).toBe("142");
    expect(dataAttr(out, "stage")).toBe("3");
    expect(dataAttr(out, "name")).toBe("Acme");
    expect(dataAttr(out, "milestones")).toBe("First revenue");
  });

  it("member (viewer): reads the OWNER's account (no find-or-create), same card data", async () => {
    state.role = "viewer";
    const out = await html();
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([]);
    expect(keyCalls(state, "findSVIAccountWithFallback")[0]).toMatchObject({
      email: state.ownerEmail,
      projectId: "proj-1",
      opts: { callerEmail: state.callerEmail },
    });
    expect(sb.hasEq("svi_accounts", "id", "acct-1")).toBe(true);
    expect(sb.hasEq("svi_milestones", "account_id", "acct-1")).toBe(true);
    expect(sb.find("svi_accounts", "insert")).toEqual([]);
    expect(dataAttr(out, "svi")).toBe("142");
    expect(dataAttr(out, "milestones")).toBe("First revenue");
  });

  it("member whose owner has no account yet: empty card, no reads, no insert", async () => {
    state.role = "editor";
    state.account = null;
    const out = await html();
    expect(sb.calls).toEqual([]);
    expect(dataAttr(out, "svi")).toBe("0");
    expect(dataAttr(out, "milestones")).toBe("");
  });

  it("no project: legacy owner path (own email, null project)", async () => {
    state.projectId = null;
    await html();
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([
      { fn: "findOrCreateSVIAccount", email: state.callerEmail, projectId: null },
    ]);
    expect(sb.hasEq("svi_accounts", "id", "acct-1")).toBe(true);
  });
});
