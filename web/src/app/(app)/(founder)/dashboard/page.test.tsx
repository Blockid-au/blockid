import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// G13-W3-IA3 — render test for the founder landing (/dashboard): five
// blocks in benefit order, every block's §B.4 empty state, the member view,
// and the S18-B member facts the old page pinned:
//   owner    → own record (find-or-create), editable, onboarding redirect
//              still fires for a fresh owner with no analysis
//   member   → the OWNER's analyses / account / snapshots / evidence /
//              criteria; Money Radar hidden (§B.4); never bounced to
//              onboarding (P2-6); never inserts svi_accounts
//   viewer   → the view-only note + read-only CTAs on blocks 2 and 4
//   no proj  → legacy owner path
// The five blocks render for real (no mocks) so `data-landing-block` /
// `data-landing-empty` are asserted on the actual markup; the shell, the
// tour intro, the trackers and the Money Radar loader are mocked.

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
const userState = vi.hoisted(() => ({ onboardingCompleted: true }));
vi.mock("@/lib/auth", async () => {
  const { founderUser } = await import("@/test/founder-page-harness");
  return {
    getCurrentUser: async () => ({ ...founderUser(await scopeState), onboardingCompleted: userState.onboardingCompleted }),
  };
});
const tileMock = vi.fn();
vi.mock("@/lib/funding/tile-data", () => ({
  getMoneyRadarTileData: (...a: unknown[]) => tileMock(...a),
}));
vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children, currentPhase }: { children: React.ReactNode; currentPhase?: number }) => (
    <div data-shell data-shell-phase={currentPhase}>{children}</div>
  ),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
const NULL = () => null;
vi.mock("@/components/analytics/page-tracker", () => ({ PageTracker: NULL }));
vi.mock("@/components/dashboard/onboarding-welcome-modal", () => ({ OnboardingWelcomeModal: NULL }));
vi.mock("@/components/role/role-landing-intro", () => ({ RoleLandingIntro: NULL }));
// Client trackers: the viewed tracker becomes a data probe, the CTA a plain
// anchor that keeps its `data-landing-cta` / `data-testid` contract.
vi.mock("@/components/dashboard/landing/landing-tracker", () => ({
  LANDING_BLOCKS: ["where-you-stand", "next-best-action", "money-on-the-table", "evidence-to-add", "your-reports"],
  LandingViewedTracker: (p: { ctx: { phase: string; plan: string }; blocks: string[]; emptyBlocks: string[] }) => (
    <div data-viewed data-viewed-phase={p.ctx.phase} data-viewed-plan={p.ctx.plan} data-viewed-blocks={p.blocks.join(",")} data-viewed-empty={p.emptyBlocks.join(",")} />
  ),
  LandingCta: (p: { block: string; href: string; children: React.ReactNode; testId?: string; variant?: string }) => (
    <a href={p.href} data-landing-cta={p.block} data-testid={p.testId} data-variant={p.variant ?? "primary"}>{p.children}</a>
  ),
}));
vi.mock("./page.legacy", () => ({ LegacyDashboardPage: () => <div data-legacy-landing /> }));

import { extractSignals } from "@/lib/svi-analysis";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { keyCalls } from "@/test/project-scope-mock";
import { renderPage, dataAttr } from "@/test/founder-page-harness";

async function html(sp: Record<string, string> = {}): Promise<string> {
  const { default: Page } = await import("./page");
  return renderPage(Page({ searchParams: Promise.resolve(sp) }));
}

const BLOCKS = ["where-you-stand", "next-best-action", "money-on-the-table", "evidence-to-add", "your-reports"] as const;
function blockOrder(out: string): string[] {
  return [...out.matchAll(/data-landing-block="([a-z-]+)"/g)].map((m) => m[1]);
}
function isEmpty(out: string, block: string): boolean {
  return new RegExp(`data-landing-block="${block}" data-landing-empty="true"`).test(out);
}
function ctaHref(out: string, block: string): string | null {
  const m = out.match(new RegExp(`<a href="([^"]+)" data-landing-cta="${block}"`));
  return m ? m[1] : null;
}

const state = await scopeState;
let sb: FakeSupabase;

// A claimed /analyze run — `analyses` row shape (lib/analyses/payload.ts).
const INTAKE_ROW = {
  id: "an-1",
  intake: { signals: extractSignals({ rawText: "Acme is a Sydney pre-seed startup building an inspection drone; 3 paying pilots, A$40k revenue, team of 4, raising A$1.2M." }) },
  svi_total: 58,
  input_text: "Acme is a Sydney pre-seed startup.",
  created_at: "2026-09-13T00:00:00.000Z",
};

const SUBS = [
  { key: "ftv", label: "Founder & Team", value: 62 },
  { key: "mpc", label: "Market & Problem", value: 48 },
  { key: "ptd", label: "Product & Tech", value: 40 },
  { key: "tre", label: "Traction & Revenue", value: 22 },
  { key: "cgh", label: "Cap table", value: 30 },
  { key: "iri", label: "Investor readiness", value: 35 },
  { key: "lco", label: "Legal", value: 44 },
  { key: "svm", label: "Vision & Moat", value: 50 },
];
const ANALYSIS = {
  id: "an-1",
  analysis_json: { totalSVI: 64, stageLabel: "Validated", stage: 2, subs: SUBS, summary: "s" },
  total_svi: 64,
  created_at: "2026-09-01",
  raw_input: "Acme drone inspection",
  input_type: "text",
};
const OLDER = { id: "an-0", analysis_json: { totalSVI: 58, stage: 2, subs: [] }, total_svi: 58, created_at: "2026-08-01", raw_input: "older", input_type: "text" };

const RADAR = {
  state: "buyer",
  counts: { grants: 12, programs: 7, capital: 3 },
  top3: [{ ref_kind: "grant", ref_id: "g1", name: "MVP Ventures", why: "fits", amount_max_aud: 45_000, closes_at: "2026-09-30", deadline: null, url: null }],
  next_deadlines: [{ ref_kind: "grant", ref_id: "g1", name: "MVP Ventures", closes_at: "2026-09-30", days_until: 14, status: "closing_soon", date_label: "30 Sep 2026 (AEST)", url: null }],
  new_matches_week: 0,
  next_public_event: null,
  next_step: "Apply",
  industry_label: "SaaS",
  state_label: "NSW",
  user_state: "NSW",
  report_id: "r1",
  calendar_href: null,
  today: "2026-09-16",
};

beforeEach(() => {
  state.role = "owner";
  state.projectId = "proj-1";
  state.account = { id: "acct-1" };
  state.accountId = "acct-1";
  state.calls.length = 0;
  state.projectExtra = undefined;
  userState.onboardingCompleted = true;
  tileMock.mockReset();
  tileMock.mockResolvedValue(RADAR);
  delete process.env.NAV_IA_V4;
  delete process.env.PERSONA_LANDING;
  sb = fakeSupabase({
    svi_analyses: [ANALYSIS, OLDER],
    svi_accounts: [{ id: "acct-1", startup_name: "Acme", current_svi: 64, current_stage: 2 }],
    svi_snapshots: [{ snapshot_date: "2026-09-01", svi_total: 64, delta: 3 }],
    svi_dimension_evidence: [{ dimension: "ftv", evidence_type: "founder_linkedin" }],
    evaluation_criteria: [],
  });
  sbState.sb = sb;
});

describe("/dashboard — five blocks (G13-W3-IA3 §B.1)", () => {
  it("owner: renders exactly the five blocks in benefit order, none empty, with the spec'd CTAs", async () => {
    const out = await html();
    expect(blockOrder(out)).toEqual([...BLOCKS]);
    for (const b of BLOCKS) expect(isEmpty(out, b), `${b} not empty`).toBe(false);
    expect(ctaHref(out, "where-you-stand")).toBe("/workspace/score");
    expect(ctaHref(out, "money-on-the-table")).toBe("/workspace/funding");
    expect(ctaHref(out, "evidence-to-add")).toBe("/workspace/evidence/gaps");
    expect(ctaHref(out, "your-reports")).toBe("/workspace/reports");
    // block 1 facts
    expect(out).toContain("data-landing-delta");
    expect(out).toContain("+6 vs last snapshot"); // 64 − 58 from the previous svi_analyses row
    expect(out).toContain("data-landing-percentile");
    expect(out).toContain('data-visual-kind="radar"');
    // block 3 counts
    expect(out).toMatch(/data-landing-grants="true">12</);
    expect(out).toMatch(/data-landing-programs="true">7</);
    expect(out).toContain("MVP Ventures");
    // block 4 — three gaps on three dimensions
    expect((out.match(/data-gap-dimension="/g) ?? []).length).toBe(3);
    // block 5 — two reports
    expect((out.match(/href="\/workspace\/reports\/an-/g) ?? []).length).toBe(2);
    // S18-B owner keys
    expect(sb.hasEq("svi_analyses", "email", state.callerEmail)).toBe(true);
    expect(sb.hasEq("svi_analyses", "project_id", "proj-1")).toBe(true);
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([{ fn: "findOrCreateSVIAccount", email: state.callerEmail, projectId: "proj-1" }]);
    expect(tileMock).toHaveBeenCalledTimes(1);
    expect(tileMock.mock.calls[0][3]).toEqual({ ownerUserId: state.callerId, dataEmail: state.callerEmail });
    expect(out).not.toContain("viewer-readonly-note");
  });

  it("block 2: ONE recommendation from the recommender — a scored founder with no declared phase gets the earliest phase of their SVI band, with the evidence-gap impact", async () => {
    const out = await html();
    // SVI 64 → band 2 → revenue_model → /workspace/strategy/pricing
    expect(ctaHref(out, "next-best-action")).toBe("/workspace/strategy/pricing");
    expect(out).toContain("Define your revenue model");
    expect(out).toContain("Because you&#x27;re at Revenue &amp; Business Models");
    expect(out).not.toMatch(/Phase \d/);
    // impact: the Money Finder line carries the top grant (phases 1–3), no SVI claim on a pricing step
    expect(out).toContain('href="/workspace/funding" data-landing-cta="next-best-action"');
    expect(out).toContain("data-landing-impact");
    expect(out).toContain("A$45k · MVP Ventures closes 30 Sep");
    expect(out).toContain('data-tour="dashboard-spotlight"');
    expect(dataAttr(out, "viewed-phase")).toBe("revenue_model");
    expect(dataAttr(out, "viewed-empty")).toBe("");
  });

  it("a declared growth phase wins for block 1's pill, block 2 and the phase gate", async () => {
    state.projectExtra = { growth_phase_current: "legal_equity" };
    const out = await html();
    expect(out).toContain("Legal &amp; Equity");
    expect(ctaHref(out, "next-best-action")).toBe("/workspace/equity");
    expect(dataAttr(out, "viewed-phase")).toBe("legal_equity");
    expect(dataAttr(out, "landing-phase")).toBe("legal_equity");
    expect(out).toContain("data-landing-gate");
    expect(sb.hasEq("evaluation_criteria", "account_id", "acct-1")).toBe(true);
  });

  it("empty states (§B.4): zero data → every block still renders something useful with its CTA", async () => {
    sb.rows.svi_analyses = [];
    sb.rows.svi_dimension_evidence = [];
    tileMock.mockResolvedValue({ ...RADAR, state: "no_profile", top3: [], next_deadlines: [], counts: { grants: 56, programs: 199, capital: 0 } });
    const out = await html();
    expect(blockOrder(out)).toEqual([...BLOCKS]);
    for (const b of BLOCKS) expect(isEmpty(out, b), `${b} empty`).toBe(true);
    expect(out).toContain("No score yet. A free analysis takes 3 minutes");
    expect(ctaHref(out, "where-you-stand")).toBe("/analyze");
    expect(out).toContain("Run your 8-dimension SVI evaluation");
    expect(ctaHref(out, "next-best-action")).toBe("/analyze");
    expect(out).toContain("Tell us your industry and state to match 56 grants and 199 programs.");
    expect(ctaHref(out, "money-on-the-table")).toBe("/onboarding?step=2");
    expect(out).toContain("Connect one source (Stripe, GA4, GitHub, Xero, LinkedIn)");
    expect(ctaHref(out, "evidence-to-add")).toBe("/workspace/evidence/connectors");
    expect(out).toContain("Your first Business Report is free (10 pages)");
    expect(ctaHref(out, "your-reports")).toBe("/workspace/reports/business");
    expect(dataAttr(out, "viewed-phase")).toBe("none");
    expect(dataAttr(out, "viewed-empty")).toBe(BLOCKS.join(","));
    expect(dataAttr(out, "shell-phase")).toBe("0");
  });

  it("a failed Money Radar read degrades block 3 to its empty state and never breaks the landing", async () => {
    tileMock.mockRejectedValue(new Error("boom"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await html();
    expect(blockOrder(out)).toEqual([...BLOCKS]);
    expect(isEmpty(out, "money-on-the-table")).toBe(true);
    expect(isEmpty(out, "where-you-stand")).toBe(false);
    warn.mockRestore();
  });

  it("S31-B: with no svi_analyses row the latest /analyze run (owner's) feeds block 1", async () => {
    sb.rows.svi_analyses = [];
    sb.rows.analyses = [INTAKE_ROW];
    const out = await html();
    expect(isEmpty(out, "where-you-stand")).toBe(false);
    expect(sb.hasEq("analyses", "user_id", state.callerId)).toBe(true);
    // no svi_analyses rows → block 5 falls back to its empty state
    expect(isEmpty(out, "your-reports")).toBe(true);
  });
});

describe("/dashboard — member view (§B.4) + S18-B facts", () => {
  it("member (editor): the OWNER's record everywhere, block 3 hidden, Money Radar never read, no svi_accounts insert", async () => {
    state.role = "editor";
    const out = await html();
    expect(blockOrder(out)).toEqual(BLOCKS.filter((b) => b !== "money-on-the-table"));
    expect(tileMock).not.toHaveBeenCalled();
    expect(dataAttr(out, "viewed-blocks")).toBe("where-you-stand,next-best-action,evidence-to-add,your-reports");
    expect(sb.hasEq("svi_analyses", "email", state.ownerEmail)).toBe(true);
    expect(sb.hasEq("svi_analyses", "email", state.callerEmail)).toBe(false);
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([]);
    expect(keyCalls(state, "findSVIAccountWithFallback")[0]).toMatchObject({ email: state.ownerEmail, projectId: "proj-1", opts: { callerEmail: state.callerEmail } });
    expect(sb.hasEq("svi_accounts", "id", "acct-1")).toBe(true);
    expect(sb.hasEq("svi_dimension_evidence", "project_id", "proj-1")).toBe(true);
    expect(sb.find("svi_accounts", "insert")).toEqual([]);
    // an editor can act: primary CTAs, no member note
    expect(out).not.toContain("data-landing-member-note");
    expect(out).not.toContain("viewer-readonly-note");
  });

  it("member (viewer): view-only note, block 2 shows the owner's next action with 'ask {owner}' copy, blocks 2 + 4 read-only", async () => {
    state.role = "viewer";
    const out = await html();
    expect(out).toContain('data-testid="viewer-readonly-note"');
    expect(out).toContain("Shared · Viewer");
    expect(out).toContain("data-landing-member-note");
    expect(out).toContain(`ask ${state.ownerEmail.split("@")[0]}`);
    expect(out).toMatch(/data-landing-cta="next-best-action" data-testid="landing-next-best-action-cta" data-variant="secondary"/);
    expect(out).toMatch(/data-landing-cta="evidence-to-add" data-testid="landing-evidence-cta" data-variant="secondary"/);
    expect(out).toContain(">View gaps<");
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([]);
  });

  it("P2-6: a member who has not completed onboarding is NOT bounced to /onboarding", async () => {
    state.role = "editor";
    userState.onboardingCompleted = false;
    const out = await html();
    expect(blockOrder(out).length).toBe(4);
    expect(sb.hasEq("svi_analyses", "email", state.callerEmail)).toBe(false);
  });

  it("owner who has not completed onboarding and has no analysis IS redirected to the single /onboarding wizard (S-IA4)", async () => {
    userState.onboardingCompleted = false;
    sb.rows.svi_analyses = [];
    await expect(html()).rejects.toThrow("REDIRECT:/onboarding");
    expect(sb.hasEq("svi_analyses", "email", state.callerEmail)).toBe(true);
  });

  it("S31-B: an /analyze run (analyses table) counts as a prior analysis for the onboarding redirect", async () => {
    userState.onboardingCompleted = false;
    sb.rows.svi_analyses = [];
    sb.rows.analyses = [INTAKE_ROW];
    const out = await html();
    expect(blockOrder(out)).toEqual([...BLOCKS]);
    expect(sb.hasEq("analyses", "user_id", state.callerId)).toBe(true);
  });

  it("member whose owner has no analysis / account yet: empty states, no svi_accounts insert", async () => {
    state.role = "viewer";
    state.account = null;
    sb.rows.svi_analyses = [];
    const out = await html();
    expect(isEmpty(out, "where-you-stand")).toBe(true);
    expect(isEmpty(out, "next-best-action")).toBe(true);
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([]);
    expect(sb.find("svi_accounts", "insert")).toEqual([]);
  });

  it("no project: legacy owner path (own email, project_id IS NULL, find-or-create)", async () => {
    state.projectId = null;
    const out = await html();
    expect(blockOrder(out)).toEqual([...BLOCKS]);
    expect(sb.hasEq("svi_analyses", "email", state.callerEmail)).toBe(true);
    expect(sb.calls.some((c) => c.table === "svi_analyses" && c.op === "is" && c.args[0] === "project_id")).toBe(true);
    expect(keyCalls(state, "findOrCreateSVIAccount")).toEqual([{ fn: "findOrCreateSVIAccount", email: state.callerEmail, projectId: null }]);
    expect(tileMock.mock.calls[0][1]).toBeNull();
    // no project → no svi_dimension_evidence read, block 4 in its empty state
    expect(sb.find("svi_dimension_evidence", "eq")).toEqual([]);
    expect(isEmpty(out, "evidence-to-add")).toBe(true);
  });
});

describe("/dashboard — banner slot + rollback flag", () => {
  it("ONE banner slot: checkout success outranks welcome; never stacked", async () => {
    const both = await html({ checkout: "success", plan: "Growth", welcome: "1" });
    expect(both).toContain('data-landing-banner="checkout"');
    expect(both).not.toContain('data-landing-banner="welcome"');
    expect(both).toContain("Your Growth plan is now active.");
    const welcome = await html({ welcome: "1" });
    expect(welcome).toContain('data-landing-banner="welcome"');
    expect(await html()).not.toContain("data-landing-banner");
  });

  it("NAV_IA_V4=off mounts the legacy page (rollback for one deploy) and reads nothing", async () => {
    process.env.NAV_IA_V4 = "off";
    const out = await html();
    expect(out).toContain("data-legacy-landing");
    expect(out).not.toContain("data-landing-block");
    expect(sb.calls).toEqual([]);
  });
});

// G13-W4-IA4 (spec §C.1): /dashboard stays the universal post-login URL; an
// evaluator persona is bounced to PERSONAS[persona].landingHref before any
// founder loader runs. `PERSONA_LANDING=off` restores the old behaviour.
describe("/dashboard — persona redirect (G13-W4-IA4 §C.1)", () => {
  const CASES: Array<[string, string]> = [
    ["investor_angel", "/workspace/investor"],
    ["investor_vc", "/workspace/investor"],
    ["investor", "/workspace/investor"], // legacy account_type → angel rung
    ["advisor", "/workspace/advisor"],
    ["accelerator", "/workspace/accelerator"],
  ];
  for (const [accountType, landing] of CASES) {
    it(`account_type=${accountType} → redirect(${landing}) with no founder reads`, async () => {
      sb.rows.app_users = [{ account_type: accountType, segment: null, onboarding_completed: true }];
      await expect(html()).rejects.toThrow(`REDIRECT:${landing}`);
      expect(sb.hasEq("app_users", "id", state.callerId)).toBe(true);
      expect(sb.find("svi_analyses", "select")).toEqual([]);
      expect(tileMock).not.toHaveBeenCalled();
    });
  }

  it("a legacy `investor` account_type defers to segment=investor_vc (finer signal) — still /workspace/investor", async () => {
    sb.rows.app_users = [{ account_type: "investor", segment: "investor_vc", onboarding_completed: true }];
    await expect(html()).rejects.toThrow("REDIRECT:/workspace/investor");
  });

  it("founder / reseller / journalist personas render the founder landing (no redirect)", async () => {
    for (const accountType of ["founder", "reseller", "journalist", null]) {
      sb.rows.app_users = [{ account_type: accountType, segment: null, onboarding_completed: true }];
      const out = await html();
      expect(blockOrder(out)).toEqual([...BLOCKS]);
    }
  });

  it("PERSONA_LANDING=off: an evaluator lands on the founder dashboard again (rollback)", async () => {
    process.env.PERSONA_LANDING = "off";
    sb.rows.app_users = [{ account_type: "investor_angel", segment: null, onboarding_completed: true }];
    const out = await html();
    expect(blockOrder(out)).toEqual([...BLOCKS]);
  });

  it("an evaluator who has not completed onboarding is still redirected to the hub (the hub owns the wizard gate)", async () => {
    userState.onboardingCompleted = false;
    sb.rows.app_users = [{ account_type: "advisor", segment: null, onboarding_completed: false }];
    await expect(html()).rejects.toThrow("REDIRECT:/workspace/advisor");
  });
});
