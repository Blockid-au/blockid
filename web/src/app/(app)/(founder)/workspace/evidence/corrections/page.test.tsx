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
// Table-aware admin client: `scores` (investor-link attribution), `evaluations`
// + `app_users` (evaluator seats) answer from `db`; every other table throws
// so the page's `safe()` fallbacks are exercised.
const db = vi.hoisted(() => ({
  scores: [] as Array<{ id: string; company_name: string | null }>,
  evaluations: [] as Array<{ evaluator_user_id: string; consent_tier: string | null; claimed_at: string | null }>,
  app_users: [] as Array<{ id: string; email: string | null }>,
  queried: [] as string[],
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      db.queried.push(table);
      const rows = (db as Record<string, unknown>)[table];
      if (!Array.isArray(rows)) return {};
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (resolve: (v: { data: unknown[] }) => void) => resolve({ data: rows }),
      };
      return chain;
    },
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
vi.mock("@/lib/corrections/service", () => ({ listProjectCorrections: async () => svc.rows }));
const links = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/lib/investor-links", () => ({
  // Founder-wide: one link on THIS startup's score (s-1 → company "P"), one on another startup (s-2 → "Other Co").
  listInvestorLinksForFounder: async () => {
    links.calls++;
    return [
      { scoreId: "s-1", investorName: "Jane", investorEmail: "jane@fund.vc", fundName: "Fund A", revokedAt: null, expiresAt: null, viewCount: 3, lastViewedAt: "2026-09-18T00:00:00.000Z" },
      { scoreId: "s-2", investorName: "Zed", investorEmail: "zed@other.vc", fundName: "Other Fund", revokedAt: null, expiresAt: null, viewCount: 9, lastViewedAt: "2026-09-19T00:00:00.000Z" },
    ];
  },
}));
vi.mock("@/lib/mentor/access-tiers-server", () => ({
  // One grant scoped to another project (dropped), one founder-wide (kept).
  loadAllGrantsForFounder: async () => [
    { id: "g1", reseller_id: "r1", mentor_user_id: "m1", founder_user_id: "u", project_id: "proj-OTHER", tier: "full_mentor", granted_at: "2026-09-01T00:00:00.000Z", expires_at: null, revoked_at: null, report_toggles: {} },
    { id: "g2", reseller_id: null, mentor_user_id: "m2", founder_user_id: "u", project_id: null, tier: "reports_shared", granted_at: "2026-09-01T00:00:00.000Z", expires_at: null, revoked_at: null, report_toggles: {} },
  ],
}));
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
  links.calls = 0;
  db.queried.length = 0;
  db.scores = [
    { id: "s-1", company_name: "P" },
    { id: "s-2", company_name: "Other Co" },
  ];
  db.evaluations = [];
  db.app_users = [];
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

  it("scopes the access panel to THIS project: the other startup's investor link and the other project's mentor grant are dropped, founder-wide grant kept, unattributed count shown", async () => {
    const out = await html();
    expect(out).toContain("Jane");
    expect(out).not.toContain("Zed");
    expect(out).not.toContain("Other Fund");
    expect(out).not.toContain("9 opens");
    expect(out).toContain('data-testid="data-ethics-unattributed"');
    expect(out).toContain('data-count="1"');
    expect(out).toContain("Mentor");
    expect(out).toContain("reports shared access");
    expect(out).not.toContain("Advisor / program (reseller grant)");
    expect(db.queried).toContain("scores");
    expect(db.queried).toContain("evaluations");
  });

  it("lists the evaluator seats on the project (they read claims via the evaluator API), masked, with consent tier + claimed state", async () => {
    db.evaluations = [
      { evaluator_user_id: "ev-1", consent_tier: "reports_shared", claimed_at: "2026-09-10T00:00:00.000Z" },
      { evaluator_user_id: "ev-2", consent_tier: "attributed_only", claimed_at: null },
    ];
    db.app_users = [
      { id: "ev-1", email: "scout@fund.vc" },
      { id: "ev-2", email: "analyst@program.org" },
    ];
    const out = await html();
    expect(out).toContain('data-access-kind="evaluator"');
    expect(out).toContain("s***@fund.vc");
    expect(out).toContain("a***@program.org");
    expect(out).not.toContain("scout@fund.vc");
    expect(out).toContain("reports shared — claim records without source links");
    expect(out).toContain("not yet claimed by you");
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

  it("viewer / editor member: no form, list renders, NO access panel (owner + admin only) and the founder-wide readers are never called", async () => {
    for (const role of ["viewer", "editor"] as const) {
      state.role = role;
      links.calls = 0;
      db.queried.length = 0;
      const out = await html();
      expect(out).not.toContain('data-testid="corrections-form"');
      expect(out).toContain('data-testid="corrections-owner-only"');
      expect(out).not.toContain('data-testid="data-ethics-panel"');
      expect(out).toContain('data-testid="data-ethics-owner-only"');
      expect(out).not.toContain("Jane");
      expect(links.calls).toBe(0);
      expect(db.queried).not.toContain("evaluations");
      if (role === "viewer") expect(out).toContain("file a correction");
    }
  });

  it("admin member: no form (the record is the founder's) but the access panel renders", async () => {
    state.role = "admin";
    const out = await html();
    expect(out).not.toContain('data-testid="corrections-form"');
    expect(out).toContain('data-testid="data-ethics-panel"');
    expect(out).not.toContain('data-testid="data-ethics-owner-only"');
    expect(out).toContain("Jane");
    expect(links.calls).toBe(1);
  });

  it("no project → prompt; anonymous → login redirect", async () => {
    state.projectId = null;
    const out = await html();
    expect(out).toContain('data-testid="corrections-no-project"');
    auth.anonymous = true;
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/evidence/corrections");
  });
});
