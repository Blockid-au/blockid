import type React from "react";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Render test for /workspace/accelerator/pilot — the pilot delivery kit
// (G21 P2-C). Pins: login redirect; a non-pilot account gets the h1 + the
// "Book a pilot" card (→ /pilot) and NO cohort reads; a live paid order
// renders the five-step checklist with data-derived ticks, the metrics
// form (every offer metric, the case-study consent box) and the applicant
// consent screen with the approved data sentence verbatim; an admin
// without an order sees the read-only preview.

vi.mock("@/components/workspace/workspace-layout", () => ({
  WorkspaceLayout: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));
const redirectMock = vi.fn((url: string) => {
  throw new Error("REDIRECT:" + url);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => "/workspace/accelerator/pilot",
}));
const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
vi.mock("@/lib/projects", () => ({ getCurrentProjectIsSandbox: async () => false }));
const orderMock = vi.fn();
vi.mock("@/lib/pilots/paid-orders", () => ({ findActivePilotOrder: (u: string) => orderMock(u) }));
const intakeMock = vi.fn();
const journeyMock = vi.fn();
vi.mock("@/lib/evaluations/program-journey-data", () => ({
  loadIntakeSummary: (u: string) => intakeMock(u),
  loadProgramJourney: (u: unknown, o: unknown) => journeyMock(u, o),
}));

import { buildProgramJourney } from "@/lib/evaluations/program-journey";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/valuation-certificate/types";
import { PILOT_METRIC_FIELDS } from "@/lib/pilots/metrics";

const USER = { id: "u-1", email: "prog@accel.au", displayName: "Pat", role: "user", plan: "accelerator_starter" };
const ORDER = { id: "22222222-2222-4222-8222-222222222222", user_id: "u-1", project_id: null, buyer_email: "prog@accel.au", sku: "cohort_pilot_25", applicants_cap: 25, amount_cents: 150000, currency: "aud", stripe_session_id: "cs_1", stripe_payment_intent: null, status: "paid", entitlement_until: "2026-12-19T00:00:00Z", metrics: { satisfaction: 4, case_study_consent: true }, created_at: "2026-09-20T00:00:00Z", updated_at: "2026-09-20T00:00:00Z" };

async function html(): Promise<string> {
  const { default: Page } = await import("./page");
  const el = await Page();
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  orderMock.mockReset().mockResolvedValue(null);
  intakeMock.mockReset().mockResolvedValue({ links: 1, submissions: 8, publicUrl: "https://blockid.au/apply/x", openLinks: 1 });
  journeyMock.mockReset().mockResolvedValue({ view: buildProgramJourney({ batch: null, batches: [], startups: [], intake: null, snapshots: [], overridesCount: 0 }), bundle: null });
});

describe("/workspace/accelerator/pilot — pilot delivery kit", () => {
  it("redirects to login when signed out", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await expect(html()).rejects.toThrow("REDIRECT:/auth/login?next=/workspace/accelerator/pilot");
  });

  it("no pilot order: h1 + the Book a pilot card, no cohort reads", async () => {
    const out = await html();
    expect(out).toContain("<h1");
    expect(out).toContain("Pilot delivery kit");
    expect(out).toContain('data-testid="pilot-book-card"');
    expect(out).toContain('href="/pilot"');
    expect(out).not.toContain('data-testid="pilot-checklist"');
    expect(journeyMock).not.toHaveBeenCalled();
  });

  it("live order: checklist ticks from data, every offer metric on the form, consent box, applicant consent screen verbatim", async () => {
    orderMock.mockResolvedValue(ORDER);
    const out = await html();
    expect(out).toContain("up to 25 applicants");
    expect(out).toContain('data-testid="pilot-checklist"');
    expect(out).toContain('data-step="setup" data-done="1"');
    expect(out).toContain('data-step="intake" data-done="1"');
    expect(out).toContain('data-step="assessment" data-done="0"');
    expect(out).toContain('data-step="workshop" data-done="1"');
    expect(out).toContain('data-step="report" data-done="0"');
    expect(out).toContain('data-testid="pilot-metrics-form"');
    for (const f of PILOT_METRIC_FIELDS) expect(out, f.key).toContain(`name="${f.key}"`);
    expect(out).toContain('data-testid="pilot-case-study-consent"');
    expect(out).toContain('data-testid="pilot-consent-screen"');
    expect(out).toContain(DATA_PRINCIPLE_SENTENCE);
    expect(out).toContain("Your program is reviewing you on the Startup Value Index; you keep your data.");
    expect(out).toContain('data-testid="pilot-metrics-save"');
    expect(journeyMock).toHaveBeenCalledWith(USER, expect.objectContaining({ intake: expect.objectContaining({ submissions: 8 }) }));
  });

  it("admin without an order: read-only preview of the kit", async () => {
    getCurrentUserMock.mockResolvedValue({ ...USER, role: "admin" });
    const out = await html();
    expect(out).toContain("Admin preview");
    expect(out).toContain('data-testid="pilot-checklist"');
    expect(out).toContain('data-step="setup" data-done="0"');
    expect(out).toContain("Read-only preview.");
    expect(out).not.toContain('data-testid="pilot-book-card"');
  });
});
