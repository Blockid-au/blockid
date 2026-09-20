import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// S-IA2 render test for /workspace/reports ("All reports", spec §A.1 +
// §B.4 block 5). Pins: the empty-state copy + its Generate CTA; the union
// of weekly / business / investor-pack / c-level artefacts sorted newest
// first with the right chip per source; the signed-out redirect target;
// and that weekly snapshots are read off the OWNER's svi_accounts row
// (member-aware) while packs / orders stay keyed on the CALLER.

const scopeState = vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
const sbState = vi.hoisted(() => ({ sb: null as unknown }));
const authState = vi.hoisted(() => ({ signedIn: true }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => sbState.sb }));
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(await scopeState);
});
vi.mock("@/lib/auth", async () => {
  const { founderUser } = await import("@/test/founder-page-harness");
  return { getCurrentUser: async () => (authState.signedIn ? founderUser(await scopeState) : null) };
});
vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { keyCalls } from "@/test/project-scope-mock";
import { renderPage } from "@/test/founder-page-harness";

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  return renderPage(Page());
}

/** `[kind, date]` for every rendered row, in document order. */
function rows(out: string): Array<[string, string]> {
  return [...out.matchAll(/data-testid="report-row" data-kind="([^"]+)" data-date="([^"]+)"/g)].map(
    (m) => [m[1], m[2]],
  );
}

const state = await scopeState;
let sb: FakeSupabase;

beforeEach(() => {
  authState.signedIn = true;
  state.role = "owner";
  state.projectId = "proj-1";
  state.accountId = "acct-1";
  state.account = { id: "acct-1" };
  state.calls.length = 0;
  sb = fakeSupabase({
    svi_snapshots: [],
    investor_pack_shares: [],
    assembled_reports: [],
    report_orders: [],
    clevel_trend_snapshots: [],
    projects: [{ id: "proj-1", name: "Acme" }],
  });
  sbState.sb = sb;
});

describe("/workspace/reports (S-IA2 All reports)", () => {
  it("signed out: redirects to login with next=/workspace/reports", async () => {
    authState.signedIn = false;
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/reports");
  });

  it("empty union: §B.4 copy + Generate CTA to the business report tab", async () => {
    const out = await html();
    expect(out).toContain('data-testid="reports-empty"');
    expect(out).toContain("Your first Business Report is free (10 pages).");
    expect(out).toContain("It is what investors and evaluators read first.");
    expect(out).toMatch(/<a[^>]*href="\/workspace\/reports\/business"[^>]*>Generate<\/a>/);
    expect(rows(out)).toEqual([]);
    // Generate row still links every tab + both LP generators.
    for (const href of [
      "/workspace/reports/business",
      "/workspace/reports/investor-pack",
      "/workspace/reports/c-level",
      "/workspace/reports/weekly",
      "/workspace/lp-report",
      "/dashboard/reports/lp-quarterly",
    ]) {
      expect(out).toContain(`href="${href}"`);
    }
  });

  it("populated union: newest first with the right chip and link per source", async () => {
    sb.rows.svi_snapshots.push({ id: "snap-1", snapshot_date: "2026-09-01", svi_total: 142, delta: 3 });
    sb.rows.investor_pack_shares.push({
      id: "pack-1",
      share_id: "share-abc",
      created_at: "2026-09-10T02:00:00Z",
      expires_at: "2099-01-01T00:00:00Z",
    });
    sb.rows.report_orders.push({
      id: "order-1",
      status: "READY",
      created_at: "2026-09-11T00:00:00Z",
      paid_at: "2026-09-11T00:00:00Z",
      generated_at: "2026-09-12T00:00:00Z",
      report_id: "rpt-ordered",
    });
    sb.rows.assembled_reports.push(
      // Represented by order-1 above → must not be listed twice.
      { id: "rpt-ordered", project_id: "proj-1", analysis_id: "an-2", tier: "standard", created_at: "2026-09-12T00:00:00Z", total_words: 5000, title: "Ordered" },
      { id: "rpt-free", project_id: "proj-1", analysis_id: "an-1", tier: "standard", created_at: "2026-08-20T00:00:00Z", total_words: 4200, title: "Acme report" },
    );
    sb.rows.clevel_trend_snapshots.push({ id: "trend-1", snapshot_date: "2026-09-05", week_number: 36 });

    const out = await html();
    expect(out).not.toContain('data-testid="reports-empty"');

    const seen = rows(out);
    // 1 order + 1 free assembled + 1 pack + 1 weekly + 5 c-level roles (fake sb
    // returns the same trend row for every role query).
    expect(seen).toHaveLength(9);
    expect(seen[0]).toEqual(["business", "2026-09-12T00:00:00Z"]);
    expect(seen[1]).toEqual(["investor-pack", "2026-09-10T02:00:00Z"]);
    expect(seen.slice(2, 7).map((r) => r[0])).toEqual(["c-level", "c-level", "c-level", "c-level", "c-level"]);
    expect(seen[7]).toEqual(["weekly", "2026-09-01"]);
    expect(seen[8]).toEqual(["business", "2026-08-20T00:00:00Z"]);
    const times = seen.map(([, d]) => Date.parse(d));
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    // Chip labels.
    expect(out).toContain('data-report-kind="weekly"');
    expect(out).toContain('data-report-kind="business"');
    expect(out).toContain('data-report-kind="investor-pack"');
    expect(out).toContain('data-report-kind="c-level"');
    expect(out).toContain(">Business report<");
    expect(out).toContain(">Investor pack<");

    // Links per source.
    // G19-S45 (D4): a paid order opens the ReportV2 page, never the markdown wall.
    expect(out).toContain('href="/workspace/reports/business?order=order-1"');
    expect(out).not.toContain('href="/workspace/reports/order?order=order-1"');
    expect(out).toContain('href="/workspace/reports/an-1"');
    expect(out).not.toContain('href="/workspace/reports/rpt-ordered"');
    expect(out).toContain('href="/api/investor-pack/download/share-abc"');
    expect(out).toContain('href="/workspace/reports/c-level/cfo"');
    expect(out).toContain('href="/workspace/reports/c-level/cdo"');
    expect(out).toContain('href="/workspace/reports/weekly"');
    expect(out).toContain("SVI 142 (+3)");
    expect(out).toContain("Week 36");
  });

  it("owner: weekly snapshots keyed on own svi_accounts id; packs + orders on the caller", async () => {
    await html();
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([
      { fn: "findOrCreateSVIAccount", email: state.callerEmail, projectId: "proj-1" },
    ]);
    expect(sb.hasEq("svi_snapshots", "account_id", "acct-1")).toBe(true);
    expect(sb.hasEq("investor_pack_shares", "user_id", state.callerId)).toBe(true);
    expect(sb.hasEq("report_orders", "user_id", state.callerId)).toBe(true);
    expect(sb.hasEq("assembled_reports", "user_id", state.callerId)).toBe(true);
    expect(sb.hasEq("clevel_trend_snapshots", "project_id", "proj-1")).toBe(true);
  });

  it("member (viewer): reads the OWNER's account without creating one; caller-keyed artefacts unchanged", async () => {
    state.role = "viewer";
    await html();
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([]);
    expect(keyCalls(state, "findSVIAccountWithFallback")[0]).toMatchObject({
      email: state.ownerEmail,
      projectId: "proj-1",
      opts: { callerEmail: state.callerEmail },
    });
    expect(sb.hasEq("svi_snapshots", "account_id", "acct-1")).toBe(true);
    expect(sb.hasEq("investor_pack_shares", "user_id", state.callerId)).toBe(true);
    expect(sb.find("svi_accounts", "insert")).toEqual([]);
  });

  it("supabase unavailable: renders the empty state instead of failing", async () => {
    sbState.sb = null;
    const out = await html();
    expect(out).toContain('data-testid="reports-empty"');
  });
});
