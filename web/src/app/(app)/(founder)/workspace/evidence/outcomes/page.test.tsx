import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// G21 P3-A render test for /workspace/evidence/outcomes: the h1 sits outside
// any gate, the owner gets the trajectory + the record form (kind / date /
// per-kind value fields) + proposals with confirm / reject on founder rows
// and "BlockID confirms" on register rows + the ledger, a member sees the
// list only, empty states, a missing 0427 table → the honest unavailable
// note (trajectory still renders), no project → prompt, anonymous → login.

const scopeState = vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
const svc = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], throwOnList: false }));
const traj = vi.hoisted(() => ({ snapshots: [] as Array<{ snapshot_date: string; svi_total: number; evidence_confidence: number | null; stage: number | null }> }));
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
vi.mock("@/lib/outcomes/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/outcomes/service")>("@/lib/outcomes/service");
  return {
    ...actual,
    listProjectOutcomes: async () => {
      if (svc.throwOnList) throw new Error('relation "startup_outcomes" does not exist');
      return svc.rows;
    },
  };
});
vi.mock("@/lib/svi/trajectory-load", async () => {
  const { buildTrajectory } = await import("@/lib/svi/trajectory");
  return { loadTrajectory: async () => buildTrajectory({ snapshots: traj.snapshots, evidenceRecords: [], outcomes: [], verificationLevel: "2" }) };
});
vi.mock("server-only", () => ({}));

import { renderPage } from "@/test/founder-page-harness";

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  return renderPage(Page());
}

const state = await scopeState;
const ROW = { id: "o-1", project_id: "proj-1", kind: "funding_raised", observed_at: "2026-08-15T00:00:00.000Z", value: { amount_aud: 500000, round: "seed", source_url: "https://x.io/news" }, source: "founder", confidence: 60, recorded_by: "u", status: "proposed", confirmed_by: null, confirmed_at: null, note: null, created_at: "2026-09-20", updated_at: "2026-09-20" };

beforeEach(() => {
  state.role = "owner";
  state.projectId = "proj-1";
  auth.anonymous = false;
  svc.rows = [];
  svc.throwOnList = false;
  traj.snapshots = [];
});

describe("/workspace/evidence/outcomes (G21 P3-A)", () => {
  it("owner: h1, the trajectory empty state, the record form with kind / date / per-kind fields, both empty states, the calibration link", async () => {
    const out = await html();
    expect(out).toMatch(/<h1[^>]*>Outcomes<\/h1>/);
    expect(out).toContain('data-testid="trajectory-timeline"');
    expect(out).toContain('data-testid="trajectory-empty"');
    expect(out).toContain('data-testid="outcomes-form"');
    expect(out).toContain('id="outcome-kind"');
    expect(out).toContain('id="outcome-date"');
    expect(out).toContain('id="outcome-amount_aud"');
    expect(out).toContain('id="outcome-source_url"');
    expect(out).toContain("Funding raised");
    expect(out).toContain("Product release");
    expect(out).toContain('data-testid="outcomes-proposals-empty"');
    expect(out).toContain('data-testid="outcomes-empty"');
    expect(out).toContain('href="/methodology/calibration"');
    expect(out).not.toMatch(/predict|forecast for you|accuracy/i);
  });

  it("owner: proposals with confirm / reject on a founder row, 'BlockID confirms' on a register row, the settled ledger, the trajectory series", async () => {
    svc.rows = [ROW, { ...ROW, id: "o-2", kind: "grant_success", source: "external_signal", confidence: 90, value: { program: "AEA Ignite" } }, { ...ROW, id: "o-3", status: "confirmed", confirmed_by: "u", confirmed_at: "2026-09-20" }, { ...ROW, id: "o-4", status: "rejected" }];
    traj.snapshots = [
      { snapshot_date: "2026-01-01", svi_total: 40, evidence_confidence: 20, stage: 1 },
      { snapshot_date: "2026-04-01", svi_total: 52, evidence_confidence: 41, stage: 2 },
    ];
    const out = await html();
    expect(out).toContain('data-trajectory-state="series"');
    expect(out).toContain('data-testid="outcomes-list"');
    expect(out.match(/data-outcome-status="proposed"/g)).toHaveLength(2);
    expect(out).toContain('data-testid="outcome-confirm"');
    expect(out).toContain('data-testid="outcome-reject"');
    expect(out).toContain('data-testid="outcome-awaits-blockid"');
    expect(out).toContain("A$500,000 · seed");
    expect(out).toContain("AEA Ignite");
    expect(out).toContain('data-outcome-status="confirmed"');
    expect(out).toContain('data-outcome-status="rejected"');
    expect(out).toContain('href="https://x.io/news"');
    // the owner's actor ids never reach the page
    expect(out).not.toContain("recorded_by");
  });

  it("viewer / editor member: no form, no confirm buttons, proposals + ledger still listed", async () => {
    svc.rows = [ROW];
    for (const role of ["viewer", "editor"] as const) {
      state.role = role;
      const out = await html();
      expect(out).not.toContain('data-testid="outcomes-form"');
      expect(out).not.toContain('data-testid="outcome-confirm"');
      expect(out).toContain('data-outcome-status="proposed"');
      if (role === "viewer") expect(out).toContain("record an outcome");
    }
  });

  it("0427 not applied → the honest unavailable note, the trajectory still renders", async () => {
    svc.throwOnList = true;
    const out = await html();
    expect(out).toContain('data-testid="outcomes-unavailable"');
    expect(out).toContain('data-testid="trajectory-timeline"');
    expect(out).not.toContain('data-testid="outcomes-form"');
  });

  it("no project → prompt; anonymous → login redirect", async () => {
    state.projectId = null;
    const out = await html();
    expect(out).toContain('data-testid="outcomes-no-project"');
    auth.anonymous = true;
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/evidence/outcomes");
  });
});
