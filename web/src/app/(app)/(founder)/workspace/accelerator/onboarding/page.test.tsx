import type React from "react";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Render test for /workspace/accelerator/onboarding — the Cohort onboarding
// kit (G25; was the pilot delivery kit, G21 P2-C). Pins: login redirect; an
// account without a Cohort seat gets the h1 + the "Start a cohort" card
// (→ the sold ladder, never a pilot / checkout / coupon) and NO cohort
// reads; a Cohort seat renders the six-step checklist with data-derived
// ticks, the metrics form (every offer metric, the case-study consent box,
// editable for the org owner) and the applicant consent screen with the
// approved data sentence verbatim; an invited seat and an admin preview get
// the form read-only; nothing on the page says "pilot".

vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));
const redirectMock = vi.fn((url: string) => {
  throw new Error("REDIRECT:" + url);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/workspace/accelerator/onboarding",
}));
const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
vi.mock("@/lib/projects", () => ({ getCurrentProjectIsSandbox: async () => false }));
const orgAdminMock = vi.fn();
vi.mock("@/lib/org/admin", () => ({ resolveOrgAdmin: (u: unknown) => orgAdminMock(u) }));
const readMetricsMock = vi.fn();
vi.mock("@/lib/accelerator/onboarding-store", () => ({ readOnboardingMetricsForOrg: (id: string) => readMetricsMock(id) }));
const intakeMock = vi.fn();
const journeyMock = vi.fn();
vi.mock("@/lib/evaluations/program-journey-data", () => ({
  loadIntakeSummary: (u: string) => intakeMock(u),
  loadProgramJourney: (u: unknown, o: unknown) => journeyMock(u, o),
}));
// G24-C: the demo pre-step + the "Load a demo cohort" CTA (evaluator entitlement).
const hasDemoMock = vi.fn(async () => false);
vi.mock("@/lib/evaluations/demo-cohort", () => ({ hasDemoBatch: (u: string) => hasDemoMock(u as never) }));
vi.mock("@/lib/evaluations/demo-cohort-labels", async () => {
  const shared = await import("@/lib/evaluations/demo-cohort-shared");
  return { loadDemoCohortLabels: async () => shared.DEMO_COHORT_LABELS_EN };
});
const flagsMock = vi.fn(async () => ["accelerator.cohort"]);
vi.mock("@/lib/entitlements", () => ({ getEntitlements: (...a: unknown[]) => flagsMock(...(a as [])) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

import { buildProgramJourney } from "@/lib/evaluations/program-journey";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/valuation-certificate/types";
import { ONBOARDING_METRIC_FIELDS } from "@/lib/accelerator/onboarding-metrics";

const USER = { id: "u-1", email: "prog@accel.au", displayName: "Pat", role: "user", plan: "accelerator_starter" };
const ORG = { id: "22222222-2222-4222-8222-222222222222", slug: "accel", name: "Accel", kind: "accelerator", owner_user_id: "u-1", is_personal: false };
const OWNER = { status: "ok", org: ORG, seats: ["u-1"], isOwner: true };

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  const el = await Page();
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  orgAdminMock.mockReset().mockResolvedValue(OWNER);
  readMetricsMock.mockReset().mockResolvedValue({ orgId: ORG.id, available: true, metrics: { satisfaction: 4, case_study_consent: true }, updatedAt: "2026-09-21T00:00:00.000Z" });
  intakeMock.mockReset().mockResolvedValue({ links: 1, submissions: 8, publicUrl: "https://blockid.au/apply/x", openLinks: 1 });
  hasDemoMock.mockReset().mockResolvedValue(false);
  flagsMock.mockReset().mockResolvedValue(["accelerator.cohort"]);
  journeyMock.mockReset().mockResolvedValue({ view: buildProgramJourney({ batch: null, batches: [], startups: [], intake: null, snapshots: [], overridesCount: 0 }), bundle: null });
});

describe("/workspace/accelerator/onboarding — Cohort onboarding kit", () => {
  it("redirects to login when signed out", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/accelerator/onboarding");
  });

  it("no Cohort seat: h1 + the Start a cohort card to the sold ladder, no cohort reads, no pilot / checkout / coupon", async () => {
    flagsMock.mockResolvedValue([]);
    const out = await html();
    expect(out).toContain("<h1");
    expect(out).toContain("Cohort onboarding kit");
    expect(out).toContain('data-testid="onboarding-start-card"');
    expect(out).toContain('href="/pricing?segment=programs"');
    expect(out).toContain("See the Cohort plans");
    expect(out).not.toContain('data-testid="onboarding-checklist"');
    expect(out).not.toContain('data-testid="onboarding-demo-actions"');
    expect(journeyMock).not.toHaveBeenCalled();
    expect(readMetricsMock).not.toHaveBeenCalled();
    expect(out).not.toMatch(/pilot/i);
    expect(out).not.toMatch(/coupon/i);
    expect(out).not.toContain("/api/stripe/checkout");
  });

  it("Cohort seat (owner): checklist ticks from data, every offer metric on the editable form, consent box, applicant consent screen verbatim", async () => {
    const out = await html();
    expect(out).toContain('data-testid="onboarding-checklist"');
    // G24-C: the demo pre-step comes first; not run yet → its own Import CSV + Load a demo cohort pair.
    expect(out).toContain('data-step="demo" data-done="0"');
    expect(out).toContain('data-testid="onboarding-checklist-demo-actions"');
    expect(out).toContain('data-testid="load-demo-cohort"');
    expect(out).toContain("Demo run");
    expect(out).toContain('data-step="setup" data-done="1"');
    expect(out).toContain('data-step="intake" data-done="1"');
    expect(out).toContain('data-step="assessment" data-done="0"');
    expect(out).toContain('data-step="workshop" data-done="1"');
    expect(out).toContain('data-step="report" data-done="0"');
    expect(out).toContain('data-testid="onboarding-metrics-form"');
    for (const f of ONBOARDING_METRIC_FIELDS) expect(out, f.key).toContain(`name="${f.key}"`);
    expect(out).toContain('data-testid="onboarding-case-study-consent"');
    expect(out).toContain('data-testid="applicant-consent-screen"');
    expect(out).toContain(DATA_PRINCIPLE_SENTENCE);
    expect(out).toContain("Your program is reviewing you on the Startup Value Index; you keep your data.");
    expect(out).toContain('data-testid="onboarding-metrics-save"');
    expect(out).toContain("Only what you fill in is saved");
    expect(out).not.toContain("Read-only");
    expect(readMetricsMock).toHaveBeenCalledWith(ORG.id);
    expect(journeyMock).toHaveBeenCalledWith(USER, expect.objectContaining({ intake: expect.objectContaining({ submissions: 8 }) }));
    expect(out).not.toMatch(/pilot/i);
  });

  it("invited seat: the kit renders but the form is read-only with the owner note", async () => {
    orgAdminMock.mockResolvedValue({ status: "not_owner", org: ORG, seats: ["u-1", "u-2"], isOwner: false });
    const out = await html();
    expect(out).toContain('data-testid="onboarding-checklist"');
    expect(out).toContain("only the organisation owner records these metrics");
    expect(out).toContain('data-testid="onboarding-metrics-save"');
  });

  it("before migration 0438 (available:false): read-only with the storage note", async () => {
    readMetricsMock.mockResolvedValue({ orgId: ORG.id, available: false, metrics: {}, updatedAt: null });
    const out = await html();
    expect(out).toContain("metrics storage is not enabled");
  });

  it("admin without a Cohort seat: read-only preview of the kit, no start card", async () => {
    getCurrentUserMock.mockResolvedValue({ ...USER, role: "admin" });
    flagsMock.mockResolvedValue([]);
    orgAdminMock.mockResolvedValue({ status: "no_org", org: null, seats: [], isOwner: false });
    const out = await html();
    expect(out).toContain("Admin preview");
    expect(out).toContain('data-testid="onboarding-checklist"');
    expect(out).toContain('data-step="setup" data-done="0"');
    expect(out).toContain("no organisation on this account");
    expect(out).not.toContain('data-testid="onboarding-start-card"');
  });
});
