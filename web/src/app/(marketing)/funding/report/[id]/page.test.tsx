// Render test for the minimal /funding/report/[id] page (T0242; T0244
// restyles it). Pins: 404 for an unauthorised viewer, and for a ready report
// the ranked grants (fit score, A$, status chip, ✓/✗/? checklist, official
// link), programs, month-grouped timeline, narrative, both disclaimers and
// the Founder Radar upsell.

import type React from "react";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));
const notFoundMock = vi.hoisted(() => vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }));
vi.mock("next/navigation", () => ({ notFound: () => notFoundMock() }));

const getCurrentUserMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const getFundingReportMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/funding/reports", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/funding/reports")>();
  return { ...orig, getFundingReport: (id: string) => getFundingReportMock(id) };
});

const ID = "11111111-1111-4111-8111-111111111111";

function grantRow() {
  return {
    id: "g1", name: "MVP Ventures", provider: null, level: "state", state: "NSW", funding_type: "matched_grant",
    amount_min_aud: 25000, amount_max_aud: 75000, amount_note: null, co_contribution: "1:1", stage_tags: ["mvp"],
    industry_tags: [], demographic_tags: [], eligibility: {}, application_window: null, opens_at: null,
    closes_at: "2026-11-30", lodgement_deadline: null, next_round_note: null, status: "open", superseded_by: null,
    exclude_from_matching: false, official_url: "https://www.investment.nsw.gov.au/mvp", source_url: null,
    summary: "s", how_to_apply: null, evidence_needed: [], last_verified_at: "2026-09-10", verified_by: "seed",
    status_confidence: "high", sources: null,
  };
}

const ROW = {
  id: ID,
  user_id: null,
  guest_email: "g@example.com",
  project_id: null,
  intake: { description: "Soil sensors for grain farmers", state: "NSW", stage: "mvp", industry_tags: ["agtech_food"] },
  grant_matches: [
    {
      kind: "grant", ref_id: "g1", name: "MVP Ventures", score: 82,
      breakdown: { stage: 30, industry: 20, amount: 12, demographic: 0, timing: 20 }, timing: "open_now",
      effective_status: "open", next_window: { kind: "dated", closes_at: "2026-11-30", days_until_close: 81, label: "closes 30 Nov 2026" },
      eligibility_checklist: [
        { label: "HQ state", status: "pass", detail: "NSW HQ" },
        { label: "Turnover cap", status: "unknown", detail: "not provided" },
        { label: "Founder group: women_led", status: "fail", detail: "reserved" },
      ],
      estimate_aud: 43500, estimate_note: "R&DTI 43.5% refundable offset", why: ["Fits MVP stage in NSW."], grant: grantRow(),
    },
  ],
  program_matches: [],
  timeline: [
    { month: "2026-10", kind: "grant", ref_id: "g1", name: "MVP Ventures", action: "Lodge the EOI", lead_time_days: 30, deadline: "2026-11-30", why: "x" },
    { month: "2026-10", kind: "tax", ref_id: "rdti", name: "R&D Tax Incentive", action: "Register activities", lead_time_days: 60, why: "y" },
    { month: "2027-02", kind: "program", ref_id: "p1", name: "Plus Eight", action: "Apply", lead_time_days: 60, why: "z" },
  ],
  narrative_md: "## Where you stand\n\nYou are **MVP** in NSW.",
  credits_cost: 0,
  paid_via: "one_off",
  stripe_session_id: "cs_live_1",
  status: "ready",
  access_token: "tok_secret",
  meta: {
    today: "2026-09-10", generated_at: "2026-09-10T00:00:00Z", tax: {}, narrative_source: "template", excluded: { grants: 0, programs: 0 }, disclaimer: "d",
    summary: { grant_count: 1, program_count: 0, top_grants: ["MVP Ventures"], top_programs: [], total_amount_max_aud: 75000, top_grants_amount_max_aud: 75000, timeline_count: 3 },
    actions: ["Lodge the MVP Ventures EOI", "Register R&D activities", "Book a Plus Eight info session"],
  },
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-10T00:00:00Z",
};

async function html(search: Record<string, string> = {}): Promise<string> {
  const { default: Page } = await import("./page");
  const el = await Page({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve(search) });
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!-- -->/g, "");
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(null);
  getFundingReportMock.mockReset().mockResolvedValue(ROW);
  notFoundMock.mockClear();
});

describe("/funding/report/[id] (T0242 minimal view)", () => {
  it("404s for a viewer with no token / session / ownership", async () => {
    await expect(html()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("renders the ranked grant with score, A$, chip, checklist glyphs and the official link", async () => {
    const out = await html({ t: "tok_secret" });
    expect(out).toContain('data-status="ready"');
    expect(out).toContain("1 grants and 0 programs, ranked for you");
    expect(out).toContain("NSW · MVP · Agtech / food");
    expect(out).toContain("#1 · fit 82/100");
    expect(out).toContain("A$25,000 – A$75,000");
    expect(out).toContain("est. A$43,500 for you");
    expect(out).toContain('data-status="open"');
    expect(out).toContain("closes 30 Nov 2026");
    expect(out).toContain("✓");
    expect(out).toContain("✗");
    expect(out).toContain("?</span>");
    expect(out).toContain('href="https://www.investment.nsw.gov.au/mvp"');
    expect(out).toContain("Up to <strong>A$75,000</strong>");
  });

  it("renders next actions, the month-grouped timeline, the narrative and both disclaimers + upsell", async () => {
    const out = await html({ s: "cs_live_1" });
    expect(out).toContain("Next 3 actions");
    expect(out).toContain("Lodge the MVP Ventures EOI");
    expect(out).toContain("October 2026");
    expect(out).toContain("February 2027");
    expect(out).toContain("deadline 2026-11-30");
    expect(out).toContain("Where you stand");
    expect(out).toContain("<strong>MVP</strong>");
    expect(out).toContain("data-funding-disclaimer");
    expect(out).toContain("a match is not an approval");
    expect(out).toContain('data-surface="funding_directory"');
    expect(out).toContain("Deadlines move — Founder Radar A$29/mo");
    // Secrets never reach the page.
    expect(out).not.toMatch(/tok_secret|g@example.com/);
  });

  // T0247 — the upsell block reads the report's own timeline (meta.today =
  // 2026-09-10; MVP Ventures closes 2026-11-30 = 81 days; Plus Eight is next
  // February so no other round this quarter).
  it("computes the Radar upsell copy from the timeline and links the Starter trial", async () => {
    const out = await html({ s: "cs_live_1" });
    expect(out).toContain('data-radar-upsell="true"');
    expect(out).toContain('data-variant="timeline"');
    expect(out).toContain('data-viewer="guest"');
    expect(out).toContain("<strong class=\"text-primary\">MVP Ventures</strong> closes in 81 days. Founder Radar watches them for you");
    expect(out).toContain('href="/signup?plan=founder_starter&amp;trial=1&amp;from=funding_report"');
    expect(out).not.toContain("Scout A$79");
  });

  it("offers the Scout secondary CTA to an evaluator viewer", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "inv-1", plan: "investor_angel", email: "x@y.z" });
    getFundingReportMock.mockResolvedValue({ ...ROW, user_id: "inv-1" });
    const out = await html();
    expect(out).toContain('data-viewer="evaluator"');
    expect(out).toContain("Scout A$79");
  });

  it("hides the upsell when the plan already paid for the report", async () => {
    getFundingReportMock.mockResolvedValue({ ...ROW, paid_via: "plan" });
    const out = await html({ t: "tok_secret" });
    expect(out).not.toContain("data-radar-upsell");
  });

  it("falls back to generic copy when the timeline has no dated deadline", async () => {
    getFundingReportMock.mockResolvedValue({ ...ROW, timeline: [] });
    const out = await html({ t: "tok_secret" });
    expect(out).toContain('data-variant="generic"');
    expect(out).toContain("Deadlines move and new rounds open through the year.");
  });

  it("shows the 'being prepared' state while the webhook is still generating", async () => {
    getFundingReportMock.mockResolvedValueOnce({ ...ROW, status: "paid", grant_matches: [], meta: {} });
    const out = await html({ t: "tok_secret" });
    expect(out).toContain("Your report is being prepared");
    expect(out).toContain("Payment received");
  });
});
