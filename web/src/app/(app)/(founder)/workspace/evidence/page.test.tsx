import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// S18-B render test for /workspace/evidence — svi_accounts-backed page.
// Pins: owner find-or-creates their own account (unchanged); a member READS
// the owner's account via findSVIAccountWithFallback(ownerEmail, project,
// { callerEmail }) and never calls findOrCreateSVIAccount (no split row);
// analyses are read under dataEmail; a viewer gets readOnly + the note; a
// member whose owner has no record yet gets the empty vault, not a row.

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
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/analytics/page-tracker", () => ({ PageTracker: () => null }));
vi.mock("@/components/workspace/cap-table-health-widget", () => ({ CapTableHealthWidget: () => <div data-cap /> }));
vi.mock("@/lib/oauth-connectors", () => ({
  listConnections: async () => [],
  isProviderConfigured: () => true,
}));
vi.mock("@/components/svi/evidence-vault-client", () => ({
  EvidenceVaultClient: (p: { initialEvidence: unknown[]; currentSVI: number | null; readOnly?: boolean }) => (
    <div data-vault data-count={p.initialEvidence.length} data-svi={String(p.currentSVI)} data-readonly={String(Boolean(p.readOnly))} />
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
    svi_accounts: [{ id: "acct-1", current_svi: 72 }],
    svi_evidence: [{ id: "e1", label: "Pitch deck" }, { id: "e2", label: "Stripe" }],
    svi_analyses: [{ analysis_json: { evidenceGaps: [{ label: "Add revenue proof", priority: "P1" }] } }],
  });
  sbState.sb = sb;
});

describe("/workspace/evidence (S18-B)", () => {
  it("owner: find-or-creates their OWN account + reads analyses under their email (unchanged)", async () => {
    const out = await html();
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([
      { fn: "findOrCreateSVIAccount", email: state.callerEmail, projectId: "proj-1" },
    ]);
    expect(keyCalls(state, "findSVIAccountWithFallback")).toEqual([]);
    expect(sb.hasEq("svi_analyses", "email", state.callerEmail)).toBe(true);
    expect(dataAttr(out, "count")).toBe("2");
    expect(dataAttr(out, "svi")).toBe("72");
    expect(dataAttr(out, "readonly")).toBe("false");
  });

  it("member (editor): reads the OWNER's account read-only — no findOrCreateSVIAccount, analyses under the owner's email", async () => {
    state.role = "editor";
    const out = await html();
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([]);
    expect(keyCalls(state, "findSVIAccountWithFallback")).toEqual([
      { fn: "findSVIAccountWithFallback", email: state.ownerEmail, projectId: "proj-1", opts: { callerEmail: state.callerEmail } },
    ]);
    expect(sb.hasEq("svi_analyses", "email", state.ownerEmail)).toBe(true);
    expect(sb.hasEq("svi_analyses", "email", state.callerEmail)).toBe(false);
    expect(sb.hasEq("svi_evidence", "account_id", "acct-1")).toBe(true);
    expect(dataAttr(out, "count")).toBe("2");
    expect(dataAttr(out, "readonly")).toBe("false");
    expect(out).not.toContain("viewer-readonly-note");
  });

  it("member (viewer): same owner data, vault is readOnly and the view-only note renders", async () => {
    state.role = "viewer";
    const out = await html();
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([]);
    expect(dataAttr(out, "count")).toBe("2");
    expect(dataAttr(out, "readonly")).toBe("true");
    expect(out).toContain('data-testid="viewer-readonly-note"');
  });

  it("member whose owner has no account yet: empty vault, no svi_accounts insert", async () => {
    state.role = "viewer";
    state.account = null;
    const out = await html();
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([]);
    expect(sb.find("svi_accounts", "insert")).toEqual([]);
    expect(sb.find("svi_evidence", "select")).toEqual([]);
    expect(dataAttr(out, "count")).toBe("0");
    expect(dataAttr(out, "svi")).toBe("null");
  });

  it("no project: legacy owner path (own email, null project)", async () => {
    state.projectId = null;
    await html();
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([
      { fn: "findOrCreateSVIAccount", email: state.callerEmail, projectId: null },
    ]);
    expect(sb.calls.some((c) => c.table === "svi_analyses" && c.op === "is" && c.args[0] === "project_id")).toBe(true);
  });
});
