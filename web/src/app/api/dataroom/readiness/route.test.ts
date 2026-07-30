// Unit tests for GET /api/dataroom/readiness — P5-dataroom-readiness-route.
//
// Route lives at src/app/api/dataroom/readiness/route.ts and computes a
// 13-section data-room readiness score from two Supabase sources:
//   1. data_room_documents (uploaded doc names)
//   2. svi_accounts.analysis.signals (has* boolean bonuses)
//
// The endpoint is directly wired to P5_investor_readiness_score in the
// atlassian-standard-mapping goal (dashboard tile + due-diligence badge).
// Route was previously untested — these tests pin the auth gates, section
// scoring semantics, first-word substring matcher, SVI-signal bonuses,
// tier boundaries (0..20 / 20..50 / 50..75 / 75..100), and the priority-
// actions ordering + slice contract.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

type Row = Record<string, unknown>;

interface FakeState {
  docs: Row[] | null;
  sviAccount: { analysis: unknown } | null;
  docsEqCol: string | null;
  docsEqVal: unknown;
  sviEqCol: string | null;
  sviEqVal: unknown;
}

const state: FakeState = {
  docs: [],
  sviAccount: null,
  docsEqCol: null,
  docsEqVal: null,
  sviEqCol: null,
  sviEqVal: null,
};

function makeFakeSupabase() {
  return {
    from(table: string) {
      if (table === "data_room_documents") {
        return {
          select: () => ({
            eq: async (col: string, val: unknown) => {
              state.docsEqCol = col;
              state.docsEqVal = val;
              return { data: state.docs, error: null };
            },
          }),
        };
      }
      if (table === "svi_accounts") {
        return {
          select: () => ({
            eq: (col: string, val: unknown) => {
              state.sviEqCol = col;
              state.sviEqVal = val;
              return {
                maybeSingle: async () => ({
                  data: state.sviAccount,
                  error: null,
                }),
              };
            },
          }),
        };
      }
      throw new Error(`fake supabase: unknown table ${table}`);
    },
  };
}

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { GET } from "./route";

const USER = { id: "user-abc", email: "founder@example.com" };

function resetState() {
  state.docs = [];
  state.sviAccount = null;
  state.docsEqCol = null;
  state.docsEqVal = null;
  state.sviEqCol = null;
  state.sviEqVal = null;
}

function docRow(name: string, folder = "company", status = "present"): Row {
  return { name, folder, status };
}

const req = {} as unknown as import("next/server").NextRequest;

beforeEach(() => {
  resetState();
  getCurrentUserMock.mockReset();
  getSupabaseAdminMock.mockReset();
});

describe("GET /api/dataroom/readiness", () => {
  it("returns 401 when getCurrentUser resolves null (no cookie / stale session)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Authentication required" });
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
  });

  it("returns 503 when the admin Supabase client is null", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Database not configured" });
  });

  it("empty data-room → completePct=0, tier=not-started, badge=🔴", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    state.docs = [];
    state.sviAccount = null;

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.completePct).toBe(0);
    expect(body.tier).toBe("not-started");
    expect(body.badge).toContain("Not Started");
    expect(body.sections.complete).toBe(0);
    expect(body.sections.partial).toBe(0);
    expect(body.sections.missing).toBe(13);
  });

  it("both Supabase queries filter on account_id = user.id", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    await GET(req);
    expect(state.docsEqCol).toBe("account_id");
    expect(state.docsEqVal).toBe(USER.id);
    expect(state.sviEqCol).toBe("account_id");
    expect(state.sviEqVal).toBe(USER.id);
  });

  it("first-word substring matcher picks up 'Certificate' from 'certificate of formation.pdf'", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    state.docs = [docRow("Certificate of Formation.pdf")];

    const res = await GET(req);
    const body = await res.json();
    const company = (body.sectionDetails as Row[]).find((s) => s.id === "company");
    expect((company?.documents as string[]).some((d) => d.toLowerCase().includes("certificate"))).toBe(true);
    // The other two required docs (ABN/ACN, Constitution) should still be missing.
    expect(company?.missingDocs).toEqual(expect.arrayContaining(["ABN/ACN", "Constitution"]));
  });

  it("SVI signal hasCapTable + hasVesting stamps both bonuses onto the equity section", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    state.docs = [];
    state.sviAccount = {
      analysis: { signals: { hasCapTable: true, hasVesting: true } },
    };

    const res = await GET(req);
    const body = await res.json();
    const equity = (body.sectionDetails as Row[]).find((s) => s.id === "equity");
    expect(equity?.documents).toEqual(
      expect.arrayContaining([
        "Cap table (SVI signal)",
        "Vesting schedule (SVI signal)",
      ]),
    );
  });

  it("SVI signal hasPitchDeck stamps a bonus onto the pitch section but NOT the equity section", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    state.sviAccount = { analysis: { signals: { hasPitchDeck: true } } };

    const res = await GET(req);
    const body = await res.json();
    const pitch = (body.sectionDetails as Row[]).find((s) => s.id === "pitch");
    const equity = (body.sectionDetails as Row[]).find((s) => s.id === "equity");
    expect(pitch?.documents).toEqual(expect.arrayContaining(["Pitch deck (SVI signal)"]));
    expect(equity?.documents).toEqual([]);
  });

  it("SVI signal hasMarketSize + hasUsers seed the market and traction sections", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    state.sviAccount = {
      analysis: { signals: { hasMarketSize: true, hasUsers: true } },
    };

    const res = await GET(req);
    const body = await res.json();
    const market = (body.sectionDetails as Row[]).find((s) => s.id === "market");
    const traction = (body.sectionDetails as Row[]).find((s) => s.id === "traction");
    expect(market?.documents).toEqual(expect.arrayContaining(["Market research (SVI signal)"]));
    expect(traction?.documents).toEqual(expect.arrayContaining(["User metrics (SVI signal)"]));
  });

  it("bonus doc that matches a required doc's first word removes it from missingDocs", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    // "Cap table (SVI signal)" contains "cap" → matches required doc "Cap table".
    state.sviAccount = { analysis: { signals: { hasCapTable: true } } };

    const res = await GET(req);
    const body = await res.json();
    const equity = (body.sectionDetails as Row[]).find((s) => s.id === "equity");
    expect(equity?.missingDocs).not.toContain("Cap table");
    // ESOP pool + Shareholders Agreement are still missing.
    expect(equity?.missingDocs).toEqual(expect.arrayContaining(["ESOP pool", "Shareholders Agreement"]));
  });

  it("section score reaches 100 when every required doc is matched — status='complete'", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    // 3 required company docs: Certificate of Incorporation, ABN/ACN, Constitution.
    // First-word tokens: "certificate", "abn/acn", "constitution".
    state.docs = [
      docRow("Certificate of Incorporation.pdf"),
      docRow("ABN/ACN registration.pdf"),
      docRow("Constitution.docx"),
    ];

    const res = await GET(req);
    const body = await res.json();
    const company = (body.sectionDetails as Row[]).find((s) => s.id === "company");
    expect(company?.score).toBe(100);
    expect(company?.status).toBe("complete");
    expect(company?.missingDocs).toEqual([]);
  });

  it("section with 1/3 matched → score=33 → status='missing' (below the 40% partial floor)", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    state.docs = [docRow("Certificate of Incorporation.pdf")];

    const res = await GET(req);
    const body = await res.json();
    const company = (body.sectionDetails as Row[]).find((s) => s.id === "company");
    expect(company?.score).toBe(33);
    expect(company?.status).toBe("missing");
  });

  it("section with 2/3 matched → score=67 → status='partial' (between 40 and 80)", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    state.docs = [
      docRow("Certificate of Incorporation.pdf"),
      docRow("ABN/ACN registration.pdf"),
    ];

    const res = await GET(req);
    const body = await res.json();
    const company = (body.sectionDetails as Row[]).find((s) => s.id === "company");
    expect(company?.score).toBe(67);
    expect(company?.status).toBe("partial");
  });

  it("tier boundary: completePct in [20, 50) → tier='early', badge='🟡 In Progress'", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    // Complete the two highest-weight sections (equity=12, team=10) to land in
    // the 20..50 band. Weighted score ≈ (12+10)/94 * 100 ≈ 23.
    state.docs = [
      docRow("Cap Table.xlsx"),
      docRow("ESOP pool.xlsx"),
      docRow("Shareholders Agreement.pdf"),
      docRow("Founder CVs.pdf"),
      docRow("LinkedIn profiles.md"),
      docRow("Team bios.md"),
    ];

    const res = await GET(req);
    const body = await res.json();
    expect(body.tier).toBe("early");
    expect(body.badge).toContain("In Progress");
    expect(body.completePct).toBeGreaterThanOrEqual(20);
    expect(body.completePct).toBeLessThan(50);
  });

  it("tier boundary: completePct in [50, 75) → tier='investor-ready', badge='🔵 Investor Ready'", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    // Complete equity (12) + team (10) + financial (10) + traction (10) +
    // company (8) + product (8) → weighted ≈ 58/94 = 62%.
    state.docs = [
      docRow("Cap Table.xlsx"),
      docRow("ESOP pool.xlsx"),
      docRow("Shareholders Agreement.pdf"),
      docRow("Founder CVs.pdf"),
      docRow("LinkedIn profiles.md"),
      docRow("Team bios.md"),
      docRow("P&L statement.xlsx"),
      docRow("Cash flow.xlsx"),
      docRow("Financial projections.xlsx"),
      docRow("User metrics.xlsx"),
      docRow("Customer testimonials.md"),
      docRow("Case studies.md"),
      docRow("Certificate of Incorporation.pdf"),
      docRow("ABN/ACN.pdf"),
      docRow("Constitution.pdf"),
      docRow("Product demo.mp4"),
      docRow("Technical architecture.md"),
      docRow("Roadmap.md"),
    ];

    const res = await GET(req);
    const body = await res.json();
    expect(body.tier).toBe("investor-ready");
    expect(body.badge).toContain("Investor Ready");
    expect(body.completePct).toBeGreaterThanOrEqual(50);
    expect(body.completePct).toBeLessThan(75);
  });

  it("tier boundary: completePct ≥ 75 → tier='due-diligence-ready', badge='🟢'", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    // Match every required doc across all 13 sections — 100% completeness.
    state.docs = [
      docRow("Certificate of Incorporation.pdf"),
      docRow("ABN/ACN.pdf"),
      docRow("Constitution.pdf"),
      docRow("Founder CVs.pdf"),
      docRow("LinkedIn profiles.md"),
      docRow("Team bios.md"),
      docRow("Cap Table.xlsx"),
      docRow("ESOP pool.xlsx"),
      docRow("Shareholders Agreement.pdf"),
      docRow("P&L statement.xlsx"),
      docRow("Cash flow.xlsx"),
      docRow("Financial projections.xlsx"),
      docRow("Product demo.mp4"),
      docRow("Technical architecture.md"),
      docRow("Roadmap.md"),
      docRow("TAM/SAM analysis.md"),
      docRow("Competitive matrix.md"),
      docRow("Market research.md"),
      docRow("User metrics.xlsx"),
      docRow("Customer testimonials.md"),
      docRow("Case studies.md"),
      docRow("IP assignment.pdf"),
      docRow("Privacy policy.md"),
      docRow("Terms of service.md"),
      docRow("Customer contracts.pdf"),
      docRow("Vendor agreements.pdf"),
      docRow("Pitch deck.pdf"),
      docRow("Executive summary.pdf"),
      docRow("One-pager.pdf"),
      docRow("Trademark registrations.pdf"),
      docRow("GitHub access.md"),
      docRow("Patent applications.pdf"),
      docRow("Org chart.pdf"),
      docRow("Hiring plan.md"),
      docRow("Accelerator docs.pdf"),
      docRow("Previous fundraise info.pdf"),
    ];

    const res = await GET(req);
    const body = await res.json();
    expect(body.completePct).toBe(100);
    expect(body.tier).toBe("due-diligence-ready");
    expect(body.badge).toContain("Due Diligence Ready");
    expect(body.sections.complete).toBe(13);
    expect(body.sections.partial).toBe(0);
    expect(body.sections.missing).toBe(0);
  });

  it("priorityActions returns at most 5 entries and is sorted by section weight descending", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    // Empty data-room → all 13 sections are non-complete; top 5 by weight
    // should be equity(12), team(10), financial(10), traction(10), company(8).
    state.docs = [];

    const res = await GET(req);
    const body = await res.json();
    const actions = body.priorityActions as Array<{ section: string; missingDocs: string[]; sviImpact: string }>;
    expect(actions.length).toBe(5);
    expect(actions[0].section).toBe("Equity & Cap Table");
    // Second slot must have weight ≥ next slot (stable sort by weight desc).
    const weights = actions.map((a) => {
      if (a.section === "Equity & Cap Table") return 12;
      if (a.section === "Founder & Team") return 10;
      if (a.section === "Financial Statements") return 10;
      if (a.section === "Customer Traction") return 10;
      if (a.section === "Company Formation") return 8;
      if (a.section === "Product & Technology") return 8;
      if (a.section === "Market & Competitive") return 8;
      if (a.section === "Legal & Compliance") return 8;
      if (a.section === "Pitch Materials") return 8;
      return 0;
    });
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i - 1]).toBeGreaterThanOrEqual(weights[i]);
    }
  });

  it("priorityActions excludes sections that are already complete", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    // Fully complete the equity section only — it must NOT appear in priority.
    state.docs = [
      docRow("Cap Table.xlsx"),
      docRow("ESOP pool.xlsx"),
      docRow("Shareholders Agreement.pdf"),
    ];

    const res = await GET(req);
    const body = await res.json();
    const actions = body.priorityActions as Array<{ section: string }>;
    expect(actions.map((a) => a.section)).not.toContain("Equity & Cap Table");
  });

  it("priorityActions.missingDocs is capped at 2 entries per section", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    state.docs = [];

    const res = await GET(req);
    const body = await res.json();
    const actions = body.priorityActions as Array<{ section: string; missingDocs: string[] }>;
    for (const a of actions) {
      expect(a.missingDocs.length).toBeLessThanOrEqual(2);
    }
  });

  it("priorityActions.sviImpact is stamped as `+<round(weight*0.3)> SVI`", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    state.docs = [];

    const res = await GET(req);
    const body = await res.json();
    const actions = body.priorityActions as Array<{ section: string; sviImpact: string }>;
    const equityAction = actions.find((a) => a.section === "Equity & Cap Table");
    // weight=12 → round(12 * 0.3) = round(3.6) = 4
    expect(equityAction?.sviImpact).toBe("+4 SVI");
    const teamAction = actions.find((a) => a.section === "Founder & Team");
    // weight=10 → round(10 * 0.3) = 3
    expect(teamAction?.sviImpact).toBe("+3 SVI");
  });

  it("targets envelope surfaces the AU-market fundraise thresholds (Antler 70 / Seed 80 / Series A 95)", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());

    const res = await GET(req);
    const body = await res.json();
    expect(body.targets).toEqual({
      antlerPitch: 70,
      seedReady: 80,
      seriesA: 95,
    });
  });

  it("null svi_accounts row (no SVI ever run) does NOT throw and yields zero bonus docs", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    state.sviAccount = null;

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    const equity = (body.sectionDetails as Row[]).find((s) => s.id === "equity");
    const pitch = (body.sectionDetails as Row[]).find((s) => s.id === "pitch");
    expect(equity?.documents).toEqual([]);
    expect(pitch?.documents).toEqual([]);
  });

  it("svi_accounts row present but signals={} yields zero bonus docs (defensive-null branch)", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    state.sviAccount = { analysis: { signals: {} } };

    const res = await GET(req);
    const body = await res.json();
    for (const section of body.sectionDetails as Row[]) {
      const docs = (section as { documents: string[] }).documents;
      expect(docs.some((d) => d.includes("(SVI signal)"))).toBe(false);
    }
  });

  it("doc-name matching is case-insensitive — SHOUTING and lower-case tokens both count", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
    state.docs = [
      docRow("CERTIFICATE OF INCORPORATION.PDF"),
      docRow("abn/acn registration.pdf"),
    ];

    const res = await GET(req);
    const body = await res.json();
    const company = (body.sectionDetails as Row[]).find((s) => s.id === "company");
    // 2/3 required docs matched → score should be 67, status='partial'.
    expect(company?.score).toBe(67);
    expect(company?.status).toBe("partial");
  });

  it("sectionDetails contains exactly the 13 canonical sections in canonical order", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());

    const res = await GET(req);
    const body = await res.json();
    const ids = (body.sectionDetails as Row[]).map((s) => s.id);
    expect(ids).toEqual([
      "company",
      "team",
      "equity",
      "financial",
      "product",
      "market",
      "traction",
      "legal",
      "contracts",
      "pitch",
      "ip",
      "operations",
      "stage",
    ]);
  });

  it("weights across the 13 sections sum to 100 (100-point framework invariant)", async () => {
    getCurrentUserMock.mockResolvedValue(USER);
    getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());

    const res = await GET(req);
    const body = await res.json();
    const total = (body.sectionDetails as Array<{ weight: number }>).reduce(
      (s, sec) => s + sec.weight,
      0,
    );
    // company8 + team10 + equity12 + financial10 + product8 + market8 +
    // traction10 + legal8 + contracts6 + pitch8 + ip6 + operations4 + stage2
    // = 100 — the framework promise stamped into the readiness donut copy.
    expect(total).toBe(100);
  });
});
