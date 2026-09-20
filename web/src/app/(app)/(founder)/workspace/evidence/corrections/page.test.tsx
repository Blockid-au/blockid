import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// G21 P1-C render test for /workspace/evidence/corrections: the h1 sits
// outside any gate, the owner gets the form (kind / target / message fields),
// a member sees the list only, the data-ethics panel renders the counts +
// the existing revoke links, empty state when nothing is filed, no project →
// prompt, anonymous → login redirect.

const scopeState = vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
const svc = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: () => ({}) }) }));
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
vi.mock("@/lib/corrections/service", () => ({ listProjectCorrections: async () => svc.rows }));
vi.mock("@/lib/investor-links", () => ({
  listInvestorLinksForFounder: async () => [{ investorName: "Jane", investorEmail: "jane@fund.vc", fundName: "Fund A", revokedAt: null, expiresAt: null, viewCount: 3, lastViewedAt: "2026-09-18T00:00:00.000Z" }],
}));
vi.mock("@/lib/mentor/access-tiers-server", () => ({ loadAllGrantsForFounder: async () => [] }));
vi.mock("@/lib/project-members/scope", () => ({ listMembers: async () => [] }));
vi.mock("@/lib/oauth-connectors", () => ({ listConnections: async () => [{ provider: "github", status: "active", lastSyncAt: "2026-09-19T00:00:00.000Z", lastSyncError: null, tokenUnreadable: false }] }));
vi.mock("@/lib/connectors/snapshots", () => ({ loadSnapshotHistory: async () => ({}) }));

import { renderPage } from "@/test/founder-page-harness";

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
  svc.rows = [];
});

describe("/workspace/evidence/corrections (G21 P1-C)", () => {
  it("owner: h1, the form with kind / target / message fields, the data-ethics panel and the empty state", async () => {
    const out = await html();
    expect(out).toMatch(/<h1[^>]*>Corrections &amp; your data<\/h1>/);
    expect(out).toContain('data-testid="corrections-form"');
    expect(out).toContain('id="correction-kind"');
    expect(out).toContain('id="correction-target"');
    expect(out).toContain('id="correction-message"');
    expect(out).toContain("Incorrect data");
    expect(out).toContain("Unsupported statement in a report");
    expect(out).toContain("Traction &amp; Revenue Evidence");
    expect(out).toContain('data-testid="corrections-empty"');
    // data-ethics panel: counts, who has access (from the existing investor-link data), refresh, revoke links, score logic
    expect(out).toContain('data-testid="data-ethics-panel"');
    expect(out).toContain("Jane");
    expect(out).toContain("Fund A");
    expect(out).toContain('data-refresh-status="fresh"');
    expect(out).toContain('href="/workspace/investors/access#investor-links"');
    expect(out).toContain('href="/methodology/governance"');
    expect(out).toContain("3 opens");
  });

  it("lists filed corrections with status + resolution", async () => {
    svc.rows = [
      { id: "c1", project_id: "proj-1", kind: "stale_data", target_ref: "dimension:tre", message: "MRR is A$12k now.", proposed: {}, status: "accepted", submitted_by: "u", resolved_by: "a", resolution: "Accepted — recorded against the record.", resolved_at: "2026-09-19T00:00:00.000Z", created_at: "2026-09-18T00:00:00.000Z", updated_at: "2026-09-19T00:00:00.000Z" },
      { id: "c2", project_id: "proj-1", kind: "duplicate_company", target_ref: "profile:company", message: "Merged with the wrong Acme.", proposed: {}, status: "open", submitted_by: "u", resolved_by: null, resolution: null, resolved_at: null, created_at: "2026-09-20T00:00:00.000Z", updated_at: "2026-09-20T00:00:00.000Z" },
    ];
    const out = await html();
    expect(out).toContain('data-testid="corrections-list"');
    expect(out).toContain('data-correction-status="accepted"');
    expect(out).toContain('data-correction-status="open"');
    expect(out).toContain("Accepted — recorded against the record.");
    expect(out).toContain("Merged with the wrong Acme.");
    expect(out).not.toContain('data-testid="corrections-empty"');
  });

  it("member: no form (owner only), list + panel still render, view-only note for a viewer", async () => {
    state.role = "viewer";
    const out = await html();
    expect(out).not.toContain('data-testid="corrections-form"');
    expect(out).toContain('data-testid="corrections-owner-only"');
    expect(out).toContain('data-testid="data-ethics-panel"');
    expect(out).toContain("file a correction");
  });

  it("no project → prompt; anonymous → login redirect", async () => {
    state.projectId = null;
    const out = await html();
    expect(out).toContain('data-testid="corrections-no-project"');
    auth.anonymous = true;
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/evidence/corrections");
  });
});
