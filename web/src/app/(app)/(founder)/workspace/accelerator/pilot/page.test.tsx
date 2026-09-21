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
const latestMock = vi.fn();
vi.mock("@/lib/pilots/paid-orders", () => ({ findActivePilotOrder: (u: string) => orderMock(u), findLatestPilotOrder: (u: string) => latestMock(u) }));
const intakeMock = vi.fn();
const journeyMock = vi.fn();
vi.mock("@/lib/evaluations/program-journey-data", () => ({
  loadIntakeSummary: (u: string) => intakeMock(u),
  loadProgramJourney: (u: unknown, o: unknown) => journeyMock(u, o),
}));

import { buildProgramJourney } from "@/lib/evaluations/program-journey";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/valuation-certificate/types";
import { PILOT_METRIC_FIELDS } from "@/lib/pilots/metrics";
import { PLANS_V2, formatAud } from "@/lib/plans-v2";
import { PILOT_SKUS } from "@/lib/pricing/pilot-skus";
import { resolveConvertResponse } from "./pilot-convert-card";

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
  latestMock.mockReset().mockResolvedValue(null);
  delete process.env.STRIPE_COUPON_PILOT_CREDIT_25;
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

// G23-B — "Convert to Cohort 25 / Cohort 100 (annual)" card.
describe("/workspace/accelerator/pilot — conversion card (G23-B)", () => {
  const starter = PLANS_V2.find((p) => p.id === "accelerator_starter")!;
  const annual = formatAud(starter.annual_aud);
  const fee = formatAud(PILOT_SKUS.cohort_pilot_25.amountInclGstCents / 100);
  const firstYear = formatAud(starter.annual_aud! - PILOT_SKUS.cohort_pilot_25.amountInclGstCents / 100);

  it("no pilot order: no card at all (nothing to convert)", async () => {
    const out = await html();
    expect(out).not.toContain('data-testid="pilot-convert-card"');
    expect(latestMock).toHaveBeenCalledWith("u-1");
  });

  it("live order, coupon env NAME unset → contact fallback with the annual price, the credit line and the first-year figure from the constants", async () => {
    orderMock.mockResolvedValue(ORDER);
    const out = await html();
    expect(out).toContain('data-testid="pilot-convert-card"');
    expect(out).toContain('data-convert-mode="contact"');
    expect(out).toContain('data-convert-plan="accelerator_starter"');
    expect(out).toContain(`Convert to ${starter.name} (annual)`);
    const flat = out.replace(/<!-- -->/g, "");
    expect(flat).toContain(`${annual} inc. GST`);
    expect(flat).toContain(fee);
    expect(flat).toContain(firstYear);
    expect(flat).toContain(`${starter.trial_days}-day free trial`);
    expect(flat).toContain("60 days of the pilot ending");
    expect(out).toContain('href="/contact?topic=pilot"');
    expect(out).toContain('data-testid="pilot-convert-contact"');
    expect(out).not.toContain('data-testid="pilot-convert-checkout"');
    expect(out).toContain("applied by our team");
  });

  it("live order, coupon configured → the checkout button (posts convert_from_pilot); the coupon value never renders", async () => {
    process.env.STRIPE_COUPON_PILOT_CREDIT_25 = "cpn_secret_value";
    orderMock.mockResolvedValue(ORDER);
    const out = await html();
    expect(out).toContain('data-convert-mode="checkout"');
    expect(out).toContain('data-testid="pilot-convert-checkout"');
    expect(out).toContain("Continue to secure checkout");
    expect(out).not.toContain("cpn_secret_value");
    expect(out).not.toContain("STRIPE_COUPON_PILOT_CREDIT_25");
  });

  it("ended pilot inside the 60-day window: the Book card + the conversion card from the latest paid order; converted → done state; closed → no control", async () => {
    latestMock.mockResolvedValue({ ...ORDER, entitlement_until: new Date(Date.now() - 10 * 86_400_000).toISOString() });
    let out = await html();
    expect(out).toContain('data-testid="pilot-book-card"');
    expect(out).toContain('data-convert-mode="contact"');

    latestMock.mockResolvedValue({ ...ORDER, converted_at: "2026-10-01T00:00:00Z", converted_plan: "accelerator_starter" });
    out = await html();
    expect(out).toContain('data-convert-mode="converted"');
    expect(out).toContain('data-testid="pilot-convert-done"');
    expect(out).toContain(`Converted to ${starter.name} (annual)`);

    latestMock.mockResolvedValue({ ...ORDER, entitlement_until: new Date(Date.now() - 90 * 86_400_000).toISOString() });
    out = await html();
    expect(out).toContain('data-convert-mode="closed"');
    expect(out).toContain("The credit window closed on");
    expect(out).not.toContain('data-testid="pilot-convert-checkout"');
  });

  it("?converted=1 shows the thank-you banner; resolveConvertResponse maps 401 / 409+fallback / url / error", async () => {
    orderMock.mockResolvedValue(ORDER);
    const { default: Page } = await import("./page");
    const el = await Page({ searchParams: Promise.resolve({ converted: "1" }) });
    const stream = await renderToReadableStream(el);
    await stream.allReady;
    const out = await new Response(stream).text();
    expect(out).toContain('data-testid="pilot-converted-banner"');

    expect(resolveConvertResponse(401, null, "/workspace/accelerator/pilot")).toEqual({ kind: "login", href: "/auth/login?next=%2Fworkspace%2Faccelerator%2Fpilot" });
    expect(resolveConvertResponse(409, { error: "coupon_unconfigured", fallback: "/contact?topic=pilot" }, "/x")).toEqual({ kind: "fallback", href: "/contact?topic=pilot" });
    expect(resolveConvertResponse(200, { ok: true, url: "https://checkout.stripe.com/c/1" }, "/x")).toEqual({ kind: "navigate", href: "https://checkout.stripe.com/c/1" });
    expect(resolveConvertResponse(409, { error: "conversion_plan_mismatch", message: "This pilot converts to Cohort 25 (annual)." }, "/x")).toEqual({ kind: "error", message: "This pilot converts to Cohort 25 (annual)." });
    expect(resolveConvertResponse(500, null, "/x")).toEqual({ kind: "error", message: "Could not start the checkout — please try again." });
  });
});
