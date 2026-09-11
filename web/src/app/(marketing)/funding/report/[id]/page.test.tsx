// Render test for /funding/report/[id] (T0242 minimal view → T0244 full
// view). Pins: 404 for an unauthorised viewer; for a ready report the header
// (summary, state / stage chips, generated + verified dates in AEST), the
// ranked grant cards (fit score bar, A$, RDStatus deadline chip, ✓/✗/?
// checklist, "Why you", official link), the SVG Gantt + table twin, the
// next-3 actions, narrative, both disclaimers and the Founder Radar upsell;
// guest-vs-owner differences (ICS / draft links, Download PDF / Save to data
// room only for the signed-in owner).

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

// First test pays the cold transform of the report view import graph
// (cards, Gantt, markdown, upsell); under full-suite load that exceeds the
// 5 s default, so the suite gets a wider per-test budget.
describe("/funding/report/[id] (T0244 full view)", { timeout: 20_000 }, () => {
  it("404s for a viewer with no token / session / ownership", async () => {
    await expect(html()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });

  it("renders the header, the ranked grant card with score bar, deadline chip, checklist, why-you and the official link (guest token)", async () => {
    const out = await html({ t: "tok_secret" });
    expect(out).toContain('data-status="ready"');
    expect(out).toContain("1 grants and 0 programs, ranked for you");
    // Header: startup summary + state / stage chips + dates in AEST.
    expect(out).toContain("Soil sensors for grain farmers");
    expect(out).toContain("New South Wales");
    expect(out).toContain(">MVP<");
    expect(out).toContain("NSW · MVP · Agtech / food");
    expect(out).toContain("Generated 10 Sep 2026, 10:00 AEST");
    expect(out).toContain("Catalogue verified as of 10 Sep 2026");
    // Card.
    expect(out).toContain("#1 · fit 82/100");
    expect(out).toContain('data-score="82"');
    expect(out).toContain('aria-valuenow="82"');
    expect(out).toContain("A$25,000 – A$75,000");
    expect(out).toContain("est. A$43,500 for you");
    expect(out).toContain('data-deadline-status="open"');
    expect(out).toContain("Closes 30 Nov 2026");
    expect(out).toContain("✓");
    expect(out).toContain("✗");
    expect(out).toContain("?</span>");
    expect(out).toContain("Why you: </span>Fits MVP stage in NSW.");
    expect(out).toContain('href="https://www.investment.nsw.gov.au/mvp"');
    expect(out).toContain("Up to <strong>A$75,000</strong>");
    // Guest: no calendar / draft links, no owner buttons.
    expect(out).not.toContain("data-ics");
    expect(out).not.toContain("data-draft");
    expect(out).not.toContain("data-report-owner-actions");
  });

  it("renders next actions, the SVG Gantt + table twin, the narrative and both disclaimers + upsell", async () => {
    const out = await html({ s: "cs_live_1" });
    expect(out).toContain("Your next 3 actions");
    expect(out).toContain("Lodge the MVP Ventures EOI");
    expect(out).toContain('data-timeline-gantt');
    expect(out).toContain('data-bars="3"');
    expect(out).toContain("data-today-marker");
    expect(out).toContain('data-month="2026-09"');
    expect(out).toContain('fill="var(--gantt-grant)"');
    expect(out).toContain('fill="var(--gantt-tax)"');
    expect(out).toContain('fill="var(--gantt-program)"');
    expect(out).toContain("data-timeline-table");
    expect(out).toContain("30 Nov 2026 (AEST)");
    expect(out).toContain("Where you stand");
    expect(out).toContain("<strong>MVP</strong>");
    expect(out).toContain("data-funding-disclaimer");
    expect(out).toContain("a match is not an approval");
    expect(out).toContain('data-surface="funding_directory"');
    expect(out).toContain("Deadlines move — Founder Radar A$29/mo");
    // Secrets never reach the page.
    expect(out).not.toMatch(/tok_secret|g@example.com/);
  });

  // S8-C 2026-09-11: the narrative is LLM text — raw HTML must stay escaped
  // (no rehype-raw), javascript: links must be dropped and every markdown
  // link must carry rel="noopener noreferrer nofollow".
  it("renders the narrative safely: HTML escaped, javascript: href dropped, links noopener", async () => {
    getFundingReportMock.mockResolvedValue({
      ...ROW,
      narrative_md: 'Read <script>alert(1)</script> the [official page](https://business.gov.au/x) and [not this](javascript:alert(1)) <img src=x onerror=alert(1)>',
    });
    const out = await html({ s: "cs_live_1" });
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toMatch(/<img[^>]*onerror/);
    expect(out).toMatch(/<a href="https:\/\/business\.gov\.au\/x" target="_blank" rel="noopener noreferrer nofollow">official page<\/a>/);
    expect(out).not.toContain('href="javascript:');
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

  it("gives the signed-in owner the PDF / data-room buttons and the ICS + draft links", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-1" });
    getFundingReportMock.mockResolvedValue({ ...ROW, user_id: "user-1", project_id: "proj-1" });
    const out = await html();
    expect(out).toContain("data-report-owner-actions");
    expect(out).toContain(`href="/api/funding/report/${ID}/pdf"`);
    expect(out).toContain("Save to data room");
    expect(out).toContain(`href="/api/funding/calendar.ics?report=${ID}&amp;ref=g1"`);
    expect(out).toContain('href="/workspace/funding?draft=g1&amp;kind=grant"');
    expect(out).toContain("Draft application (credits)");
  });

  it("signed-in non-owner viewing via token gets the links but not the owner buttons", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-9" });
    const out = await html({ t: "tok_secret" });
    expect(out).toContain("data-ics");
    expect(out).not.toContain("data-report-owner-actions");
  });

  it("shows the 'being prepared' state while the webhook is still generating", async () => {
    getFundingReportMock.mockResolvedValueOnce({ ...ROW, status: "paid", grant_matches: [], meta: {} });
    const out = await html({ t: "tok_secret" });
    expect(out).toContain("Your report is being prepared");
    expect(out).toContain("Payment received");
  });
});
