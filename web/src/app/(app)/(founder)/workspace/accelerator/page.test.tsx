import type React from "react";
import { darkSurfaceOffences } from "@/design/light-markup";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Render test for /workspace/accelerator — the BlockID Cohort journey (G21
// P2-C) on the evaluator hub. Pins: the h1 renders outside any gate, the
// six stage tabs with their state chips, `?stage=` picks the panel, the
// empty states, the data-backed Program / Demo-day / Sponsor panels, and
// a founder-track user gets no journey (and no cohort reads).

vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));
const hubMock = vi.fn();
vi.mock("@/components/investor/evaluator-hub-page", () => ({ loadEvaluatorHub: (o: unknown) => hubMock(o) }));
const intakeMock = vi.fn();
const journeyMock = vi.fn();
vi.mock("@/lib/evaluations/program-journey-data", () => ({
  loadIntakeSummary: (u: string) => intakeMock(u),
  loadProgramJourney: (u: unknown, o: unknown) => journeyMock(u, o),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error("REDIRECT:" + url);
  },
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/workspace/accelerator",
}));

import { buildProgramJourney, emptyEvidenceSummary, summariseEvidence, type JourneyStartup } from "@/lib/evaluations/program-journey";

const USER = { id: "u-1", email: "prog@accel.au", displayName: "Pat", role: "user", plan: "investor_vc_small" };
const BATCH_ID = "11111111-1111-4111-8111-111111111111";

function startup(over: Partial<JourneyStartup>): JourneyStartup {
  return { itemId: 1, evaluationId: "e-1", projectId: "p-1", projectSlug: "acme", name: "Acme Robotics", status: "done", svi: 71, confidence: 60, verification: 2, stage: 3, delta: 9, topStrength: "Founder & Team", topGap: "Traction & Revenue", dimensionScores: { ftv: 80, tre: 40, mpc: 60 }, decision: null, assessmentStatus: null, shortlisted: false, evidence: emptyEvidenceSummary(), scoreHistory: [62, 71], reportUrl: null, dossierUrl: "/workspace/evaluations/e-1", profileUrl: "/s/acme", dossierProduced: false, feedbackLetterSent: false, ...over };
}

function emptyView() {
  return buildProgramJourney({ batch: null, batches: [], startups: [], intake: { links: 0, submissions: 0, publicUrl: null, openLinks: 0 }, snapshots: [], overridesCount: 0 });
}

function fullView() {
  const batch = { id: BATCH_ID, name: "Cohort 5", status: "done" as const, createdAt: "2026-09-01T00:00:00Z" };
  return buildProgramJourney({
    batch,
    batches: [batch],
    startups: [
      startup({ decision: "proceed", assessmentStatus: "submitted", dossierProduced: true, evidence: summariseEvidence([{ dimension: "tre", evidence_type: "revenue_proof", confidence_level: "transaction_data" }]) }),
      startup({ itemId: 2, evaluationId: "e-2", projectId: "p-2", projectSlug: "beta", name: "Beta Health", svi: 55, decision: "pass", assessmentStatus: "submitted", dossierUrl: "/workspace/evaluations/e-2", profileUrl: "/s/beta" }),
    ],
    intake: { links: 1, submissions: 2, publicUrl: "https://blockid.au/apply/cohort-5-abc", openLinks: 1 },
    snapshots: [{ id: "s1", takenAt: "2026-09-02T00:00:00Z", n: 2, medianSvi: 60 }],
    overridesCount: 1,
  });
}

async function html(sp: Record<string, string> = {}): Promise<string> {
  const { default: Page } = await import("./page");
  const el = await Page({ searchParams: Promise.resolve(sp) });
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

beforeEach(() => {
  hubMock.mockReset().mockResolvedValue({ user: USER, isSandbox: false, evaluator: true, content: <div data-landing /> });
  intakeMock.mockReset().mockResolvedValue({ links: 0, submissions: 0, publicUrl: null, openLinks: 0 });
  journeyMock.mockReset().mockResolvedValue({ view: emptyView(), bundle: null });
});

describe("/workspace/accelerator — BlockID Cohort journey", () => {
  it("h1 outside any gate, six tabs (all not started), intake empty state by default, landing below", async () => {
    const out = await html();
    expect(out).toContain("<h1");
    expect(out).toContain("Program journey");
    expect(darkSurfaceOffences(out), "G26 light template").toEqual([]);
    expect(out).toContain('data-testid="journey-tabs"');
    for (const s of ["intake", "assessment", "selection", "program", "demo-day", "sponsor"]) expect(out).toContain(`data-stage-tab="${s}"`);
    expect((out.match(/data-stage-state="not_started"/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(out).toContain('data-testid="panel-intake"');
    expect(out).toContain('data-testid="journey-empty"');
    expect(out).toContain('href="/workspace/accelerator/applications"');
    expect(out).toContain('data-testid="onboarding-kit-link"');
    expect(out).toContain("data-landing");
    // G25: no pilot banner on the desk any more (the paid pilot is retired).
    expect(out).not.toMatch(/pilot-active-banner|Cohort Validation Pilot/);
    expect(journeyMock).toHaveBeenCalledWith(USER, { batchId: null, intake: { links: 0, submissions: 0, publicUrl: null, openLinks: 0 } });
  });

  it("?stage= picks the panel; an unknown stage falls back to intake; ?batch= is forwarded", async () => {
    expect(await html({ stage: "sponsor" })).toContain('data-testid="panel-sponsor"');
    expect(await html({ stage: "nope" })).toContain('data-testid="panel-intake"');
    await html({ stage: "program", batch: BATCH_ID });
    expect(journeyMock).toHaveBeenLastCalledWith(USER, expect.objectContaining({ batchId: BATCH_ID }));
  });

  it("data-backed panels: program rows with mentor gaps + sparkline + re-score, demo-day table with dossier / profile links + pack, sponsor report links, selection feedback panel", async () => {
    journeyMock.mockResolvedValue({ view: fullView(), bundle: { role: "owner" } });
    const program = await html({ stage: "program" });
    expect((program.match(/data-testid="program-row"/g) ?? []).length).toBe(2);
    expect(program).toContain('data-testid="mentor-gap-list"');
    expect(program).toContain("Traction &amp; Revenue");
    expect(program).toContain('data-testid="sparkline"');
    expect(program).toContain('data-testid="rescore-button"');
    const demo = await html({ stage: "demo-day" });
    expect((demo.match(/data-testid="demo-day-row"/g) ?? []).length).toBe(1);
    expect(demo).toContain('href="/workspace/evaluations/e-1"');
    expect(demo).toContain('href="/s/acme"');
    expect(demo).toContain(`/api/reports/demo-day-pack?batch=${BATCH_ID}`);
    const sponsor = await html({ stage: "sponsor" });
    expect(sponsor).toContain(`/api/reports/cohort?batch=${BATCH_ID}&amp;format=pdf`);
    expect(sponsor).toContain(`/api/reports/cohort?batch=${BATCH_ID}&amp;format=csv`);
    expect(sponsor).toContain('href="/workspace/accelerator/quarterly-report"');
    const selection = await html({ stage: "selection" });
    expect(selection).toContain('data-testid="feedback-letters-panel"');
    expect(selection).toContain(`/workspace/evaluations/cohort/${BATCH_ID}?shortlist=1`);
    expect(selection).toContain('data-testid="feedback-preview"');
    const intake = await html({ stage: "intake" });
    expect(intake).toContain("https://blockid.au/apply/cohort-5-abc");
    expect(intake).toContain('data-testid="intake-import-link"');
  });

  it("founder-track user: h1 + the hub content, no journey and no cohort reads", async () => {
    hubMock.mockResolvedValue({ user: USER, isSandbox: false, evaluator: false, content: <div data-gate /> });
    const out = await html();
    expect(out).toContain("<h1");
    expect(out).not.toContain('data-testid="program-journey"');
    expect(out).toContain("data-gate");
    expect(journeyMock).not.toHaveBeenCalled();
    expect(intakeMock).not.toHaveBeenCalled();
  });
});
