// Unit tests for POST /api/equity/documents — P5-equity-documents-route-test.
//
// The equity-documents route is the auth-gated founder-facing entry point on
// top of the pure `web/src/lib/equity/au-templates.ts` renderers (already
// covered by au-templates.test.ts). It ships the AU-native equity artefacts
// (ESOP grant letter, vesting agreement, founders' agreement, cap-table
// summary) surfaced from the workspace dashboard — so a silent regression
// here (dropping the auth guard, forgetting to guard against missing plan /
// kind, selecting the wrong member when a `targetMemberName` is supplied,
// or dispatching a founders_agreement to the wrong subject list) breaks the
// P5 dataroom-populate → founder-doc-render bridge.
//
// getCurrentUser + each au-template renderer is mocked so the assertions
// pin pure route wiring — the renderer contract itself (AU-statute anchors,
// en-AU number formatting, disclaimer footer, DOCUMENT_LABEL registry) is
// covered by src/lib/equity/au-templates.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Auth ────────────────────────────────────────────────────
const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

// ── au-templates renderers ──────────────────────────────────
type StartupCtxFake = {
  startupName: string;
  incorporationDate?: string | null;
  jurisdiction?: string;
  totalShares: number;
  preMoneyValuationAud?: number | null;
};
type MemberCtxFake = {
  name: string;
  email?: string | null;
  role: string;
  sharesIssued?: number;
  optionsGranted?: number;
  joinDate: string;
};
type VestingCtxFake = {
  totalShares: number;
  cliffMonths: number;
  vestMonths: number;
  scheduleType: string;
  startDate: string;
  accelerateOnExit?: boolean;
};
type CapTableCtxFake = {
  rows: Array<Record<string, unknown>>;
  totalShares: number;
  esopPoolPct?: number;
  preMoneyValuationAud?: number | null;
};

const esopGrantLetterMock = vi.fn<
  (s: StartupCtxFake, m: MemberCtxFake, v: VestingCtxFake, px: number) => string
>((_s, _m, _v, _px) => "ESOP_GRANT_MD");
const vestingAgreementMock = vi.fn<
  (s: StartupCtxFake, m: MemberCtxFake, v: VestingCtxFake) => string
>((_s, _m, _v) => "VESTING_MD");
const foundersAgreementMock = vi.fn<
  (s: StartupCtxFake, subjects: MemberCtxFake[]) => string
>((_s, _subjects) => "FOUNDERS_MD");
const capTableSummaryMock = vi.fn<
  (s: StartupCtxFake, cap: CapTableCtxFake) => string
>((_s, _cap) => "CAP_TABLE_MD");

vi.mock("@/lib/equity/au-templates", () => ({
  esopGrantLetter: (s: StartupCtxFake, m: MemberCtxFake, v: VestingCtxFake, px: number) =>
    esopGrantLetterMock(s, m, v, px),
  vestingAgreement: (s: StartupCtxFake, m: MemberCtxFake, v: VestingCtxFake) =>
    vestingAgreementMock(s, m, v),
  foundersAgreement: (s: StartupCtxFake, subjects: MemberCtxFake[]) =>
    foundersAgreementMock(s, subjects),
  capTableSummary: (s: StartupCtxFake, cap: CapTableCtxFake) => capTableSummaryMock(s, cap),
}));

// Import after mocks are wired.
import { POST } from "./route";

const ok = { id: "user-1", email: "founder@example.com" };

function makeRequest(body: unknown, opts: { raw?: string } = {}): Request {
  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts.raw !== undefined ? opts.raw : JSON.stringify(body),
  };
  return new Request("https://blockid.au/api/equity/documents", init);
}

const basePlan = {
  startup_name: "Acme AI",
  total_shares: 10_000_000,
  pre_money_valuation: 5_000_000,
  incorporation_date: "2024-02-01",
  jurisdiction: "AU",
};

const member = (over: Partial<Record<string, unknown>> = {}) => ({
  name: "Ada Lovelace",
  email: "ada@example.com",
  role: "employee",
  shares_issued: 0,
  options_granted: 50_000,
  join_date: "2024-03-15",
  ...over,
});

describe("POST /api/equity/documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(ok);
  });

  it("returns 401 when getCurrentUser returns null (auth guard fires before body parse)", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ kind: "esop_grant", plan: basePlan, members: [member()] }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: "Auth required" });
    // No renderer should have been called.
    expect(esopGrantLetterMock).not.toHaveBeenCalled();
    expect(vestingAgreementMock).not.toHaveBeenCalled();
    expect(foundersAgreementMock).not.toHaveBeenCalled();
    expect(capTableSummaryMock).not.toHaveBeenCalled();
  });

  it("returns 400 invalid JSON when body is unparseable", async () => {
    const res = await POST(makeRequest(undefined, { raw: "{not json" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: "Invalid JSON" });
    expect(esopGrantLetterMock).not.toHaveBeenCalled();
  });

  it("returns 400 when body.kind is missing", async () => {
    const res = await POST(makeRequest({ plan: basePlan, members: [member()] }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: "kind and plan required" });
  });

  it("returns 400 when body.plan is missing", async () => {
    const res = await POST(makeRequest({ kind: "esop_grant", members: [member()] }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: "kind and plan required" });
  });

  it("returns 400 unknown kind for unrecognised kind literal", async () => {
    const res = await POST(makeRequest({ kind: "mystery_doc", plan: basePlan, members: [member()] }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({ ok: false, error: "Unknown kind: mystery_doc" });
  });

  describe("esop_grant", () => {
    it("dispatches to esopGrantLetter with the first member when targetMemberName is omitted", async () => {
      const m1 = member({ name: "First Member" });
      const m2 = member({ name: "Second Member", options_granted: 999 });
      const res = await POST(
        makeRequest({
          kind: "esop_grant",
          plan: basePlan,
          members: [m1, m2],
          exercisePriceAud: 0.05,
        }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ ok: true, markdown: "ESOP_GRANT_MD" });

      expect(esopGrantLetterMock).toHaveBeenCalledTimes(1);
      const [ctx, mem, vest, px] = esopGrantLetterMock.mock.calls[0]!;
      expect(ctx).toEqual({
        startupName: "Acme AI",
        incorporationDate: "2024-02-01",
        jurisdiction: "AU",
        totalShares: 10_000_000,
        preMoneyValuationAud: 5_000_000,
      });
      expect(mem).toMatchObject({ name: "First Member", email: "ada@example.com" });
      expect(vest).toEqual({
        totalShares: 50_000, // options_granted fallback (no vesting.total_shares)
        cliffMonths: 12,
        vestMonths: 48,
        scheduleType: "monthly",
        startDate: "2024-03-15", // join_date fallback
        accelerateOnExit: false,
      });
      expect(px).toBe(0.05);
    });

    it("honours targetMemberName to pick a specific member", async () => {
      const m1 = member({ name: "First Member" });
      const m2 = member({ name: "Target Member", role: "cto" });
      const res = await POST(
        makeRequest({
          kind: "esop_grant",
          plan: basePlan,
          members: [m1, m2],
          targetMemberName: "Target Member",
        }),
      );
      expect(res.status).toBe(200);
      const [, mem] = esopGrantLetterMock.mock.calls[0]!;
      expect(mem).toMatchObject({ name: "Target Member", role: "cto" });
    });

    it("defaults exercisePriceAud to 0.01 when omitted (AU nominal-value default)", async () => {
      await POST(
        makeRequest({ kind: "esop_grant", plan: basePlan, members: [member()] }),
      );
      const [, , , px] = esopGrantLetterMock.mock.calls[0]!;
      expect(px).toBe(0.01);
    });

    it("prefers vesting.total_shares over options_granted when supplied", async () => {
      const m = member({
        vesting: {
          total_shares: 100_000,
          cliff_months: 6,
          vest_months: 36,
          schedule_type: "quarterly",
          start_date: "2024-04-01",
          accelerate_on_exit: true,
        },
      });
      await POST(makeRequest({ kind: "esop_grant", plan: basePlan, members: [m] }));
      const [, , vest] = esopGrantLetterMock.mock.calls[0]!;
      expect(vest).toEqual({
        totalShares: 100_000,
        cliffMonths: 6,
        vestMonths: 36,
        scheduleType: "quarterly",
        startDate: "2024-04-01",
        accelerateOnExit: true,
      });
    });

    it("returns 400 when targetMemberName does not match any member", async () => {
      const res = await POST(
        makeRequest({
          kind: "esop_grant",
          plan: basePlan,
          members: [member({ name: "Someone Else" })],
          targetMemberName: "Ghost",
        }),
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toEqual({ ok: false, error: "No member to grant to" });
      expect(esopGrantLetterMock).not.toHaveBeenCalled();
    });

    it("returns 400 when members list is empty and no targetMemberName is supplied", async () => {
      const res = await POST(
        makeRequest({ kind: "esop_grant", plan: basePlan, members: [] }),
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toEqual({ ok: false, error: "No member to grant to" });
    });

    it("falls back to shares_issued when vesting.total_shares and options_granted are both nullish", async () => {
      // options_granted must be undefined (not 0) — the `??` chain treats 0 as
      // a real value and would take it over shares_issued.
      const m = member({ options_granted: undefined, shares_issued: 7_777 });
      await POST(makeRequest({ kind: "esop_grant", plan: basePlan, members: [m] }));
      const [, , vest] = esopGrantLetterMock.mock.calls[0]!;
      expect(vest.totalShares).toBe(7_777);
    });
  });

  describe("vesting_agreement", () => {
    it("dispatches to vestingAgreement with the first member and returns markdown", async () => {
      const m = member();
      const res = await POST(
        makeRequest({ kind: "vesting_agreement", plan: basePlan, members: [m] }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ ok: true, markdown: "VESTING_MD" });

      expect(vestingAgreementMock).toHaveBeenCalledTimes(1);
      const [ctx, mem, vest] = vestingAgreementMock.mock.calls[0]!;
      expect(ctx).toMatchObject({ startupName: "Acme AI", jurisdiction: "AU" });
      expect(mem).toMatchObject({ name: "Ada Lovelace" });
      expect(vest.cliffMonths).toBe(12);
      // No exercise price argument on vestingAgreement — 3 args only.
      expect(vestingAgreementMock.mock.calls[0]).toHaveLength(3);
    });

    it("returns 400 when no member is available", async () => {
      const res = await POST(
        makeRequest({ kind: "vesting_agreement", plan: basePlan, members: [] }),
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json).toEqual({ ok: false, error: "No member" });
      expect(vestingAgreementMock).not.toHaveBeenCalled();
    });
  });

  describe("founders_agreement", () => {
    it("filters members with role founder|cofounder before dispatching", async () => {
      const founder = member({ name: "Founder One", role: "founder" });
      const cofounder = member({ name: "Cofounder Two", role: "cofounder" });
      const employee = member({ name: "Employee", role: "employee" });
      const res = await POST(
        makeRequest({
          kind: "founders_agreement",
          plan: basePlan,
          members: [founder, employee, cofounder],
        }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ ok: true, markdown: "FOUNDERS_MD" });

      const [, subjects] = foundersAgreementMock.mock.calls[0]!;
      expect(subjects).toHaveLength(2);
      expect(subjects.map((s: { name: string }) => s.name)).toEqual([
        "Founder One",
        "Cofounder Two",
      ]);
    });

    it("falls back to all members when no founder/cofounder role is present", async () => {
      const a = member({ name: "Alice", role: "employee" });
      const b = member({ name: "Bob", role: "contractor" });
      const res = await POST(
        makeRequest({
          kind: "founders_agreement",
          plan: basePlan,
          members: [a, b],
        }),
      );
      expect(res.status).toBe(200);
      const [, subjects] = foundersAgreementMock.mock.calls[0]!;
      expect(subjects).toHaveLength(2);
      expect(subjects.map((s: { name: string }) => s.name)).toEqual(["Alice", "Bob"]);
    });

    it("passes an empty subject list through when members[] is empty (renderer owns the empty-state)", async () => {
      const res = await POST(
        makeRequest({ kind: "founders_agreement", plan: basePlan, members: [] }),
      );
      expect(res.status).toBe(200);
      const [, subjects] = foundersAgreementMock.mock.calls[0]!;
      expect(subjects).toEqual([]);
    });
  });

  describe("cap_table_summary", () => {
    it("forwards body.cap verbatim when supplied", async () => {
      const cap = [
        {
          name: "Alice",
          role: "founder",
          shareClass: "Ordinary",
          shares: 4_000_000,
          options: 0,
          ownershipPct: 40,
          fullyDilutedPct: 38,
          valueAud: 2_000_000,
        },
      ];
      const res = await POST(
        makeRequest({
          kind: "cap_table_summary",
          plan: basePlan,
          members: [member()],
          cap,
          esopPct: 12.5,
        }),
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ ok: true, markdown: "CAP_TABLE_MD" });

      const [ctx, arg] = capTableSummaryMock.mock.calls[0]!;
      expect(ctx).toMatchObject({ startupName: "Acme AI" });
      expect(arg).toEqual({
        rows: cap,
        totalShares: 10_000_000,
        esopPoolPct: 12.5,
        preMoneyValuationAud: 5_000_000,
      });
    });

    it("synthesises rows from members when body.cap is omitted", async () => {
      const m1 = member({ name: "Alice", role: "founder", shares_issued: 4_000_000, options_granted: 0 });
      const m2 = member({ name: "Bob", role: "employee", shares_issued: 0, options_granted: 25_000 });
      const res = await POST(
        makeRequest({
          kind: "cap_table_summary",
          plan: basePlan,
          members: [m1, m2],
        }),
      );
      expect(res.status).toBe(200);
      const [, arg] = capTableSummaryMock.mock.calls[0]!;
      expect(arg.rows).toEqual([
        {
          name: "Alice",
          role: "founder",
          shareClass: "Ordinary",
          shares: 4_000_000,
          options: 0,
          ownershipPct: 0,
          fullyDilutedPct: 0,
          valueAud: 0,
        },
        {
          name: "Bob",
          role: "employee",
          shareClass: "Ordinary",
          shares: 0,
          options: 25_000,
          ownershipPct: 0,
          fullyDilutedPct: 0,
          valueAud: 0,
        },
      ]);
    });

    it("passes esopPoolPct=undefined through when body.esopPct is omitted", async () => {
      await POST(
        makeRequest({
          kind: "cap_table_summary",
          plan: basePlan,
          members: [member()],
        }),
      );
      const [, arg] = capTableSummaryMock.mock.calls[0]!;
      expect(arg.esopPoolPct).toBeUndefined();
    });

    it("passes preMoneyValuationAud=null when body.plan.pre_money_valuation is omitted", async () => {
      const plan = { startup_name: "Acme", total_shares: 1_000_000 };
      await POST(
        makeRequest({
          kind: "cap_table_summary",
          plan,
          members: [member()],
        }),
      );
      const [, arg] = capTableSummaryMock.mock.calls[0]!;
      expect(arg.preMoneyValuationAud).toBeNull();
    });
  });

  describe("startup context defaults", () => {
    it("substitutes '[Startup]' when body.plan.startup_name is empty string", async () => {
      const plan = { ...basePlan, startup_name: "" };
      await POST(makeRequest({ kind: "esop_grant", plan, members: [member()] }));
      const [ctx] = esopGrantLetterMock.mock.calls[0]!;
      expect(ctx.startupName).toBe("[Startup]");
    });

    it("defaults jurisdiction to 'AU' when body.plan.jurisdiction is omitted", async () => {
      const plan = { startup_name: "Acme", total_shares: 1_000_000 };
      await POST(makeRequest({ kind: "vesting_agreement", plan, members: [member()] }));
      const [ctx] = vestingAgreementMock.mock.calls[0]!;
      expect(ctx.jurisdiction).toBe("AU");
    });

    it("respects a non-default jurisdiction when supplied", async () => {
      const plan = { ...basePlan, jurisdiction: "NZ" };
      await POST(makeRequest({ kind: "founders_agreement", plan, members: [member()] }));
      const [ctx] = foundersAgreementMock.mock.calls[0]!;
      expect(ctx.jurisdiction).toBe("NZ");
    });

    it("preserves incorporationDate=null when body.plan.incorporation_date is omitted", async () => {
      const plan = { startup_name: "Acme", total_shares: 1_000_000 };
      await POST(makeRequest({ kind: "esop_grant", plan, members: [member()] }));
      const [ctx] = esopGrantLetterMock.mock.calls[0]!;
      expect(ctx.incorporationDate).toBeNull();
    });
  });

  describe("route module surface", () => {
    it("exports dynamic = 'force-dynamic' so Next.js does not attempt static evaluation", async () => {
      const mod = await import("./route");
      expect(mod.dynamic).toBe("force-dynamic");
    });
  });
});
