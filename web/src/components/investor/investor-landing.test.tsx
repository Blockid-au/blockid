import type React from "react";
import { describe, expect, it, vi } from "vitest";

// G13-W4-IA4 — render test for the evaluator landing: four blocks × three
// personas, every block's §C.1 empty state, the mandate-empty slot swap on
// the investor variant, the advisor / accelerator block-2 variants and the
// accelerator LP-report line. Blocks render for real; only the two client
// pieces (CTA + viewed tracker) are replaced by data probes.

vi.mock("@/components/investor/landing-cta", () => ({
  InvestorLandingCta: (p: { block: string; href: string; children: React.ReactNode; testId?: string; variant?: string; action?: string }) => (
    <a href={p.href} data-landing-cta={p.block} data-testid={p.testId} data-variant={p.variant ?? "primary"} data-action={p.action}>{p.children}</a>
  ),
  investorLandingClickPayload: (block: string, href: string, ctx: { persona: string }, action?: string) => ({ block, href, phase: "evaluator", action: action ?? href, persona: ctx.persona }),
}));
vi.mock("@/components/dashboard/landing/landing-tracker", () => ({
  LandingViewedTracker: (p: { ctx: { persona: string; plan: string }; blocks: string[]; emptyBlocks: string[] }) => (
    <div data-viewed data-viewed-persona={p.ctx.persona} data-viewed-blocks={p.blocks.join(",")} data-viewed-empty={p.emptyBlocks.join(",")} />
  ),
}));

import { renderPage, dataAttr } from "@/test/founder-page-harness";
import type { EvaluationListRow } from "@/lib/evaluations";
import type { EvaluatorProgressItem } from "@/lib/evaluations/progress-shared";
import { NO_TRIAL, type ReportQuota } from "@/lib/evaluations/report-quota";
import type { InvestorMandate } from "@/lib/investors/mandates-shared";
import {
  EMPTY_DEALFLOW,
  EMPTY_EVALUATING,
  blockOrderFor,
  mandateSummaryFor,
  summariseEvaluations,
  variantFor,
  type InvestorLandingData,
  type LandingPersona,
} from "@/lib/investors/landing-data";
import { InvestorLanding, emptyBlocksFor } from "./investor-landing";
import { quotaLine } from "./landing/quota-block";
import { consentLine } from "./landing/evaluating-block";
import { landingPersonaFor } from "./evaluator-hub-page";

const USER = { displayName: "Dana", email: "dana@fund.test", plan: "investor_angel" };
const NOW = new Date("2026-09-16T00:00:00Z");

function evalRow(over: Partial<EvaluationListRow> = {}): EvaluationListRow {
  return {
    id: "ev-1",
    evaluatorUserId: "u-1",
    projectId: "p-1",
    ownerKind: "investor",
    consentTier: "attributed_only",
    founderEmail: null,
    founderUserId: null,
    inviteToken: null,
    invitedAt: null,
    claimedAt: null,
    label: null,
    notes: null,
    website: null,
    state: "NSW",
    createdAt: "2026-09-10T00:00:00Z",
    updatedAt: "2026-09-10T00:00:00Z",
    projectName: "Acme Drones",
    projectSlug: "acme",
    projectIndustry: null,
    projectStage: 2,
    projectDescription: null,
    latestSvi: 64,
    latestSviAt: "2026-09-10",
    ...over,
  } as EvaluationListRow;
}

function mover(over: Partial<EvaluatorProgressItem> = {}): EvaluatorProgressItem {
  return {
    evaluationId: "ev-1",
    projectId: "p-1",
    projectSlug: "acme",
    name: "Acme Drones",
    label: null,
    sviNow: 64,
    sviPrev: 58,
    delta: 6,
    stageNow: 2,
    stagePrev: 2,
    stageChanged: false,
    newEvidence: 0,
    lastReport: null,
    money: { nextDeadline: null, deadlinesAhead: 0, newMatches: 0 },
    scoreHistory: [58, 64],
    ...over,
  };
}

function mandate(over: Partial<InvestorMandate> = {}): InvestorMandate {
  return {
    id: "m-1",
    org_id: null,
    owner_user_id: "u-1",
    label: "Seed AU SaaS",
    thesis: null,
    is_default: true,
    discoverable: false,
    is_active: true,
    kind: "angel",
    sectors_include: ["software_saas"],
    sectors_exclude: [],
    business_models: [],
    customer_types: [],
    stages: [],
    cheque_min_aud: null,
    cheque_max_aud: null,
    lead_or_follow: null,
    ownership_target_pct: null,
    followon_reserve_pct: null,
    geographies: [],
    revenue_min_aud: null,
    growth_min_pct: null,
    min_svi: null,
    tags_include: [],
    tags_exclude: [],
    esg_constraints: [],
    risk_tolerance: null,
    weights: {},
    created_at: "",
    updated_at: "",
    ...over,
  } as InvestorMandate;
}

const QUOTA_OK: ReportQuota = { limit: 3, used: 1, remaining: 2, unlimited: false, configured: true, trial: NO_TRIAL };
const QUOTA_NONE: ReportQuota = { limit: 0, used: 0, remaining: 0, unlimited: false, configured: true, trial: NO_TRIAL };
const QUOTA_TRIAL: ReportQuota = {
  limit: 1,
  used: 0,
  remaining: 1,
  unlimited: false,
  configured: true,
  trial: { active: true, ends_at: "2026-09-21T00:00:00Z", started_at: "2026-09-14T00:00:00Z", allowance: 1, used: 0, plan_id: "investor_angel" },
};

const FULL_MANDATE = mandate({ stages: ["seed"], geographies: ["NSW"], cheque_min_aud: 25_000, cheque_max_aud: 100_000 });

function data(persona: LandingPersona, over: Partial<InvestorLandingData> = {}): InvestorLandingData {
  const rows = [evalRow(), evalRow({ id: "ev-2", projectId: "p-2", projectName: "Beta Bio", latestSvi: null, claimedAt: "2026-09-11", consentTier: "reports_shared" })];
  return {
    persona,
    variant: variantFor(persona),
    evaluating: summariseEvaluations(rows, [mover(), mover({ evaluationId: "ev-2", name: "Beta Bio", delta: -3, sviNow: 40 })]),
    dealflow: {
      migrated: true,
      mandate: FULL_MANDATE,
      neverComputed: false,
      totalAboveFloor: 8,
      rows: [
        { project_id: "p-9", company_name: "Gamma Grid", svi: 71, svi_delta_30d: 4, industry: "software_saas", industry_secondary: null, business_model: "subscription", stage_key: "seed", hq_state: "VIC", tags: [], unclassified: false, fit: 82, reasons: [], gaps: [], blockers: [], computed_at: null, updated_at: null },
      ],
    },
    quota: { quota: QUOTA_OK, credits: 12, planId: "investor_angel", planLabel: "Scout" },
    mandate: mandateSummaryFor(FULL_MANDATE),
    ...over,
  };
}

const EMPTY = (persona: LandingPersona): InvestorLandingData => ({
  persona,
  variant: variantFor(persona),
  evaluating: EMPTY_EVALUATING,
  dealflow: EMPTY_DEALFLOW,
  quota: { quota: QUOTA_NONE, credits: 0, planId: null, planLabel: "Free" },
  mandate: mandateSummaryFor(null),
});

async function html(d: InvestorLandingData): Promise<string> {
  return renderPage(<InvestorLanding data={d} user={USER} now={NOW} />);
}
const blocks = (out: string) => [...out.matchAll(/data-landing-block="([a-z-]+)"/g)].map((m) => m[1]);
const isEmpty = (out: string, b: string) => new RegExp(`data-landing-block="${b}" data-landing-slot="\\d" data-landing-empty="true"`).test(out);
const cta = (out: string, b: string) => out.match(new RegExp(`<a href="([^"]+)" data-landing-cta="${b}"`))?.[1] ?? null;

describe("InvestorLanding — four blocks × three personas (G13-W4-IA4 §C.1)", () => {
  it("investor (angel): 1 evaluating · 2 deal flow · 3 quota, block 4 hidden once ≥ 3 mandate sections are set", async () => {
    const out = await html(data("investor_angel"));
    expect(blocks(out)).toEqual(["evaluating", "dealflow", "quota"]);
    expect(dataAttr(out, "landing-persona")).toBe("investor_angel");
    expect(dataAttr(out, "landing-variant")).toBe("investor");
    expect(out).toContain("Startups I&#x27;m evaluating");
    expect(out).toContain('data-landing-count="2"');
    expect(out).toContain('data-landing-avg-svi="64"'); // only the scored row counts
    expect(out).toContain("1 unscored");
    expect(out).toContain('data-landing-movers="2"');
    expect(out).toContain("1 claimed · 1 sharing reports · 1 attributed only");
    expect(cta(out, "evaluating")).toBe("/workspace/evaluations");
    // block 2: sector · stage · state · SVI · fit %
    expect(out).toContain("Gamma Grid");
    expect(out).toMatch(/SaaS[^<]*·[^<]*Seed[^<]*·[^<]*VIC/); // industry · stage · state
    expect(out).toContain("SVI 71");
    expect(out).toContain('data-landing-fit="82"');
    expect(cta(out, "dealflow")).toBe("/workspace/investor/dealflow");
    expect(out).toContain("See all (8)");
    // block 3
    expect(out).toContain("1/3 reports this month");
    expect(out).toContain('data-landing-credits="12"');
    expect(out).toContain('data-landing-plan="investor_angel"');
    expect(out).toContain(">Scout<");
    expect(cta(out, "quota")).toBe("/workspace/evaluations");
    expect(out).not.toContain("data-landing-lp-report");
    for (const b of ["evaluating", "dealflow", "quota"]) expect(isEmpty(out, b), b).toBe(false);
    expect(dataAttr(out, "viewed-blocks")).toBe("evaluating,dealflow,quota");
    expect(dataAttr(out, "viewed-empty")).toBe("");
    expect(dataAttr(out, "viewed-persona")).toBe("investor_angel");
    expect(out).toContain("Your deal desk, Dana");
  });

  it("investor (VC): partial mandate (< 3 sections) → block 4 trails in slot 4 with the completeness bar", async () => {
    const out = await html(data("investor_vc", { mandate: mandateSummaryFor(mandate()) }));
    expect(blocks(out)).toEqual(["evaluating", "dealflow", "quota", "mandate"]);
    expect(out).toContain('data-landing-block="mandate" data-landing-slot="4"');
    expect(out).toContain('data-landing-mandate-sections="2"'); // identity (label) + appetite (sectors)
    expect(out).toContain('aria-valuenow="2"');
    expect(cta(out, "mandate")).toBe("/workspace/investor/mandate");
    expect(out).toContain(">Complete it<");
    expect(isEmpty(out, "mandate")).toBe(false);
  });

  it("investor: EMPTY mandate → block 4 takes block 2's slot (wide), deal flow is not rendered (R11)", async () => {
    const out = await html(data("investor_angel", { mandate: mandateSummaryFor(null), dealflow: { ...EMPTY_DEALFLOW, migrated: true } }));
    expect(blocks(out)).toEqual(["evaluating", "mandate", "quota"]);
    expect(out).toContain('data-landing-block="mandate" data-landing-slot="2" data-landing-empty="true"');
    expect(out).toMatch(/data-landing-block="mandate"[^>]*class="[^"]*lg:col-span-6/);
    expect(out).toContain("Tell us your sectors, stages, states and cheque size");
    expect(out).toContain(">Set mandate<");
    expect(dataAttr(out, "viewed-blocks")).toBe("evaluating,mandate,quota");
    expect(dataAttr(out, "viewed-empty")).toBe("mandate");
  });

  it("investor: every block has an empty state with its §C.1 copy + CTA", async () => {
    const out = await html(EMPTY("investor_angel"));
    expect(blocks(out)).toEqual(["evaluating", "mandate", "quota"]);
    for (const b of ["evaluating", "mandate", "quota"]) expect(isEmpty(out, b), b).toBe(true);
    expect(out).toContain("Add your first startup — paste a website or pick from the Startup Index.");
    expect(cta(out, "evaluating")).toBe("/workspace/evaluations?add=1");
    expect(out).toContain(">Add startup<");
    expect(out).toContain("1 free Trusted Business Report on trial");
    expect(cta(out, "quota")).toBe("/pricing?segment=evaluator");
    expect(out).toContain(">Upgrade<");
    expect(out).toContain("Tell us your sectors, stages, states and cheque size");
    expect(dataAttr(out, "viewed-empty")).toBe("evaluating,quota,mandate");
    const notMigrated = await html({ ...EMPTY("investor_angel"), mandate: mandateSummaryFor(null, false) });
    expect(notMigrated).toContain("Mandates are not enabled on this environment yet.");
  });

  it("investor: deal flow empty states — never computed vs nothing above the floor vs not migrated", async () => {
    const base = data("investor_angel");
    const never = await html({ ...base, dealflow: { ...base.dealflow, rows: [], neverComputed: true } });
    expect(isEmpty(never, "dealflow")).toBe(true);
    expect(never).toContain("Matches land here tomorrow.");
    expect(cta(never, "dealflow")).toBe("/workspace/investor/mandate");
    const none = await html({ ...base, dealflow: { ...base.dealflow, rows: [], neverComputed: false } });
    expect(none).toContain("No startup clears your fit floor yet.");
    const notMigrated = await html({ ...base, dealflow: { ...base.dealflow, rows: [], migrated: false } });
    expect(notMigrated).toContain("Deal flow v2 is not enabled on this environment yet.");
  });

  it("advisor: Clients · Client movers · quota · Coverage", async () => {
    const out = await html(data("advisor", { mandate: mandateSummaryFor(mandate()) }));
    expect(blocks(out)).toEqual(["evaluating", "dealflow", "quota", "mandate"]);
    expect(out).toContain(">Clients<");
    expect(out).toContain("2 <span");
    expect(out).toContain(">Open client list<");
    expect(out).toContain(">Client movers<");
    expect(out).toContain('data-landing-delta="6"');
    expect(out).toContain('data-landing-delta="-3"');
    expect(out).toContain(">See all movers<");
    expect(cta(out, "dealflow")).toBe("/workspace/evaluations");
    expect(out).toContain(">Coverage<");
    expect(out).toContain("Your client desk, Dana");
    expect(out).not.toContain("Gamma Grid"); // deal-flow rows are never shown on the advisor variant
  });

  it("advisor: empty states — no clients, no movers, coverage unset", async () => {
    const out = await html({ ...EMPTY("advisor"), mandate: mandateSummaryFor(null, true) });
    expect(blocks(out)).toEqual(["evaluating", "dealflow", "quota", "mandate"]);
    for (const b of blocks(out)) expect(isEmpty(out, b), b).toBe(true);
    expect(out).toContain(">Add client<");
    expect(out).toContain("No client moved this week");
    expect(out).toContain("Set your coverage");
    expect(out).toContain(">Set coverage<");
    expect(dataAttr(out, "viewed-empty")).toBe("evaluating,dealflow,quota,mandate");
  });

  it("accelerator: Cohort · Applications to review (unscored startups) · quota + LP report · Program criteria", async () => {
    const out = await html(data("accelerator", { mandate: mandateSummaryFor(mandate()) }));
    expect(blocks(out)).toEqual(["evaluating", "dealflow", "quota", "mandate"]);
    expect(out).toContain(">Cohort<");
    expect(out).toContain(">Applications to review<");
    expect(out).toContain('data-landing-review-count="1"');
    expect(out).toContain("Beta Bio");
    expect(out).not.toContain("Acme Drones</span><span class=\"rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-semibold text-tertiary\">Not scored");
    expect(out).toContain(">Review applications<");
    expect(out).toContain("data-landing-lp-report");
    expect(out).toContain('href="/workspace/accelerator/quarterly-report" data-landing-cta="quota"');
    expect(out).toContain(">Program criteria<");
    expect(out).toContain("Your program desk, Dana");
  });

  it("accelerator: empty states — no cohort, nothing to review, criteria unset", async () => {
    const out = await html({ ...EMPTY("accelerator"), mandate: mandateSummaryFor(null, true) });
    for (const b of blocks(out)) expect(isEmpty(out, b), b).toBe(true);
    expect(out).toContain(">Add to cohort<");
    expect(out).toContain("Nothing waiting for review");
    expect(out).toContain("Set your program criteria");
    expect(out).toContain(">Set criteria<");
  });

  it("quota block: trialing → days left + allowance; unlimited; not configured → empty", async () => {
    const trial = await html(data("investor_angel", { quota: { quota: QUOTA_TRIAL, credits: 0, planId: "investor_angel", planLabel: "Scout" } }));
    expect(trial).toContain("0/1 trial report used");
    expect(trial).toContain("Trial: 5 days left · 1 full Trusted Business Report included");
    expect(isEmpty(trial, "quota")).toBe(false);
    expect(quotaLine({ ...QUOTA_OK, unlimited: true, limit: Number.MAX_SAFE_INTEGER, used: 4 })).toEqual({ headline: "4 this month · unlimited", detail: null, empty: false });
    expect(quotaLine({ ...QUOTA_OK, configured: false, limit: 0 }).empty).toBe(true);
    expect(quotaLine(QUOTA_NONE).empty).toBe(true);
  });

  it("user without a display name is greeted by the email local part", async () => {
    const out = await renderPage(<InvestorLanding data={data("advisor")} user={{ displayName: null, email: "kim@x.test", plan: null }} now={NOW} />);
    expect(out).toContain("Your client desk, kim");
    expect(out).toContain('data-landing-plan="investor_angel"'); // planId comes from the loader, not the user prop
  });
});

describe("landing-data pure helpers", () => {
  it("summariseEvaluations: count / avg / consent / unscored / movers (|Δ| desc, own evaluations only, Δ≠0)", () => {
    const rows = [evalRow(), evalRow({ id: "ev-2", projectId: "p-2", latestSvi: 50, consentTier: "full_mentor", claimedAt: "x" }), evalRow({ id: "ev-3", projectId: "p-3", latestSvi: null })];
    const s = summariseEvaluations(rows, [mover({ delta: 2 }), mover({ evaluationId: "ev-2", delta: -9 }), mover({ evaluationId: "other", delta: 30 }), mover({ evaluationId: "ev-3", delta: 0 })]);
    expect(s.count).toBe(3);
    expect(s.scored).toBe(2);
    expect(s.avgSvi).toBe(57);
    expect(s.consent).toEqual({ attributed_only: 2, reports_shared: 0, full_mentor: 1, claimed: 1 });
    expect(s.unscored.map((r) => r.id)).toEqual(["ev-3"]);
    expect(s.movers.map((m) => [m.evaluationId, m.delta])).toEqual([["ev-2", -9], ["ev-1", 2]]);
    expect(summariseEvaluations([])).toBe(EMPTY_EVALUATING);
  });

  it("mandateSummaryFor: empty / partial / complete", () => {
    expect(mandateSummaryFor(null)).toMatchObject({ empty: true, needsSetup: true, sectionsFilled: 0 });
    expect(mandateSummaryFor(mandate())).toMatchObject({ empty: false, needsSetup: true, sectionsFilled: 2 });
    expect(mandateSummaryFor(mandate({ label: "", sectors_include: [] }))).toMatchObject({ empty: false, needsSetup: true, sectionsFilled: 0 });
    expect(mandateSummaryFor(FULL_MANDATE)).toMatchObject({ empty: false, needsSetup: false, sectionsFilled: 4 });
  });

  it("blockOrderFor: the mandate-empty swap is investor-only", () => {
    expect(blockOrderFor("investor", { empty: true, needsSetup: true })).toEqual(["evaluating", "mandate", "quota"]);
    expect(blockOrderFor("investor", { empty: false, needsSetup: true })).toEqual(["evaluating", "dealflow", "quota", "mandate"]);
    expect(blockOrderFor("investor", { empty: false, needsSetup: false })).toEqual(["evaluating", "dealflow", "quota"]);
    expect(blockOrderFor("advisor", { empty: true, needsSetup: true })).toEqual(["evaluating", "dealflow", "quota", "mandate"]);
    expect(blockOrderFor("accelerator", { empty: false, needsSetup: false })).toEqual(["evaluating", "dealflow", "quota"]);
  });

  it("emptyBlocksFor only reports blocks that are rendered", () => {
    expect(emptyBlocksFor(EMPTY("investor_angel"), NOW)).toEqual(["evaluating", "quota", "mandate"]);
    expect(emptyBlocksFor(data("investor_angel"), NOW)).toEqual([]);
  });

  it("consentLine + landingPersonaFor", () => {
    expect(consentLine({ attributed_only: 0, reports_shared: 0, full_mentor: 0, claimed: 0 })).toBe("");
    expect(consentLine({ attributed_only: 1, reports_shared: 2, full_mentor: 0, claimed: 3 })).toBe("3 claimed · 2 sharing reports · 1 attributed only");
    expect(landingPersonaFor("investor", "investor_vc")).toBe("investor_vc");
    expect(landingPersonaFor("investor", "investor_angel")).toBe("investor_angel");
    expect(landingPersonaFor("investor", "founder")).toBe("investor_angel");
    expect(landingPersonaFor("advisor", "investor_vc")).toBe("advisor");
    expect(landingPersonaFor("accelerator", "founder")).toBe("accelerator");
  });
});
