import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// S18-B render test for /workspace/data-room. Pins: a member reads the
// OWNER's svi_account (read-only lookup, no findOrCreateSVIAccount) and the
// uploads under it; a viewer gets readOnly on DataRoomClient + the note; a
// member whose owner has no record gets the first-run empty state and NO
// svi_accounts insert.

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
vi.mock("@/lib/entitlements/require-tier-for-page", () => ({ requireTierForPage: async () => undefined }));
vi.mock("@/components/dashboard/empty-dashboard-state", () => ({
  EmptyDashboardState: (p: { title: string }) => <div data-empty>{p.title}</div>,
}));
vi.mock("./data-room-client", () => ({
  DataRoomClient: (p: { initialStates: unknown[]; readOnly?: boolean }) => (
    <div data-room data-count={p.initialStates.length} data-readonly={String(Boolean(p.readOnly))} />
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
  state.account = { id: "acct-1" };
  state.calls.length = 0;
  sb = fakeSupabase({
    svi_evidence: [
      { id: "e1", label: "pitch deck 2026", value_or_url: "https://x/deck.pdf", confidence_level: "verified", dimension: "iri" },
    ],
  });
  sbState.sb = sb;
});

describe("/workspace/data-room (S18-B)", () => {
  it("owner: own account (find-or-create), uploads mapped, editable", async () => {
    const out = await html();
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([
      { fn: "findOrCreateSVIAccount", email: state.callerEmail, projectId: "proj-1" },
    ]);
    expect(sb.hasEq("svi_evidence", "account_id", "acct-1")).toBe(true);
    expect(dataAttr(out, "count")).toBe("1");
    expect(dataAttr(out, "readonly")).toBe("false");
    expect(out).not.toContain("data-empty");
  });

  it("member (editor): OWNER's account via read-only lookup, uploads visible, editable", async () => {
    state.role = "editor";
    const out = await html();
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([]);
    expect(keyCalls(state, "findSVIAccountWithFallback")[0]).toMatchObject({
      email: state.ownerEmail,
      projectId: "proj-1",
      opts: { callerEmail: state.callerEmail },
    });
    expect(dataAttr(out, "count")).toBe("1");
    expect(dataAttr(out, "readonly")).toBe("false");
  });

  it("member (viewer): read-only checklist + note", async () => {
    state.role = "viewer";
    const out = await html();
    expect(dataAttr(out, "readonly")).toBe("true");
    expect(out).toContain('data-testid="viewer-readonly-note"');
  });

  it("member whose owner has no account: empty state, no insert", async () => {
    state.role = "viewer";
    state.account = null;
    const out = await html();
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([]);
    expect(sb.find("svi_accounts", "insert")).toEqual([]);
    expect(dataAttr(out, "count")).toBe("0");
    expect(out).toContain("data-empty");
  });
});
