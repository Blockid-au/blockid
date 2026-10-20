// G35 D26 — runGuestAnalysis delivery split.
//
//   no `report_data.payg` (the A$3 One-Click SKU — every order while
//   payg_enabled is OFF)  → today's path byte for byte: SVI PDF + sendGuestReport,
//                           the guest-Full hand-off is never touched;
//   payg tier snapshot    → today's path with the "preview" PDF cut;
//   payg tier full        → the 16-section TBR v2 hand-off (full-report.ts),
//                           no SVI PDF, no SVI e-mail; receipt + signed link.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ── Supabase double ────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
const db: {
  row: Row | null;
  updates: Array<{ patch: Row; filters: Array<[string, unknown]> }>;
  uploads: string[];
  /** G35 claim race: the paid→analyzing compare-and-set matched no row. */
  claimLost: boolean;
  /** Error returned for an update whose patch matches (null = none). */
  updateError: ((patch: Row) => { message: string } | null) | null;
} = {
  row: null,
  updates: [],
  uploads: [],
  claimLost: false,
  updateError: null,
};

function fakeSupabase() {
  return {
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: db.row, error: null }) }),
      }),
      update: (patch: Row) => {
        const entry = { patch, filters: [] as Array<[string, unknown]> };
        db.updates.push(entry);
        const error = db.updateError?.(patch) ?? null;
        const chain = {
          eq: (col: string, val: unknown) => {
            entry.filters.push([col, val]);
            return chain;
          },
          select: (_cols: string) => ({
            then: (resolve: (v: { data: Row[] | null; error: { message: string } | null }) => unknown) =>
              resolve({ data: error ? null : patch.status === "analyzing" && db.claimLost ? [] : [{ id: ID }], error }),
          }),
          then: (resolve: (v: { error: { message: string } | null }) => unknown) => resolve({ error }),
        };
        return chain;
      },
    }),
    storage: {
      getBucket: async () => ({ data: { id: "guest-reports" } }),
      createBucket: async () => ({}),
      from: () => ({
        upload: async (p: string) => {
          db.uploads.push(p);
          return { error: null };
        },
        createSignedUrl: async (p: string) => ({ data: { signedUrl: `https://storage.test/${p}?sig=1` } }),
      }),
    },
  };
}

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => fakeSupabase(),
}));

// ── Heavy / networked sub-agents ───────────────────────────────────────────

vi.mock("@/lib/rnd-input", () => ({
  detectInputType: () => "website",
  scrapeUrl: async () => ({
    title: "Acme Clinics",
    description: "Compliance software for Australian clinics",
    text: "Acme builds compliance software for Australian clinics. 40 paying customers, MRR A$12k, team of 6.",
    techHints: [],
  }),
}));
vi.mock("@/lib/agents/deep-valuation", () => ({
  buildDeepValuationAnalysis: () => {
    throw new Error("not under test");
  },
}));
vi.mock("@/lib/agents/maturity-detector", () => ({ detectMaturity: () => null, maturityValuationGuard: () => ({ override: false }) }));
vi.mock("@/lib/agents/cohort-percentile", () => ({ computeCohortPercentile: async () => null }));
vi.mock("@/lib/agents/antler-signals", () => ({ evaluateAntlerSignals: () => [] }));

const pdfCalls: Array<Record<string, unknown>> = [];
vi.mock("@/lib/pdf/svi-report-pdf", () => ({
  SVIReportPDF: (props: Record<string, unknown>) => {
    pdfCalls.push(props);
    return { pdf: true };
  },
}));
vi.mock("@react-pdf/renderer", () => ({ renderToBuffer: async () => Buffer.from("%PDF svi") }));

const sendGuestReport = vi.fn(async (_a: Record<string, unknown>) => undefined);
vi.mock("@/lib/email", () => ({ sendGuestReport: (a: Record<string, unknown>) => sendGuestReport(a) }));

const handOff = vi.fn(async (_o: Record<string, unknown>) => ({
  analysisId: "a1b2c3d4-0000-4000-8000-000000000001",
  reportUrl: "https://blockid.au/analyze/a1b2c3d4-0000-4000-8000-000000000001?t=signed",
  uploadedTmpPath: null as string | null,
}));
vi.mock("./full-report", () => ({ handOffGuestFullReport: (o: Record<string, unknown>) => handOff(o) }));

const sendGuestFullReportPaid = vi.fn(async (_a: Record<string, unknown>) => ({ ok: true as const, id: "m1" }));
vi.mock("@/lib/email/report-order-emails", () => ({
  sendGuestFullReportPaid: (a: Record<string, unknown>) => sendGuestFullReportPaid(a),
}));

const sendTelegram = vi.fn(async (_t: string) => true);
vi.mock("@/lib/telegram", () => ({ sendTelegram: (t: string) => sendTelegram(t) }));

import { runGuestAnalysis } from "./runner";

const ID = "11111111-2222-4333-8444-555555555555";

function baseRow(over: Row = {}): Row {
  return {
    id: ID,
    email: "Founder@Acme.com.au",
    input_type: "website_url",
    input_value: "https://acme.com.au",
    input_filename: null,
    status: "paid",
    report_data: null,
    paid_amount_aud_cents: null,
    amount_paid_aud_cents: 300,
    ...over,
  };
}

beforeEach(() => {
  db.row = null;
  db.updates = [];
  db.uploads = [];
  db.claimLost = false;
  db.updateError = null;
  sendTelegram.mockClear();
  pdfCalls.length = 0;
  sendGuestReport.mockClear();
  handOff.mockClear();
  sendGuestFullReportPaid.mockClear();
});

function finalPatch(): Row {
  return db.updates[db.updates.length - 1].patch;
}

describe("runGuestAnalysis — flag OFF / legacy A$3 (no payg stamp)", () => {
  it("runs today's SVI PDF + guest e-mail path and never touches the guest-Full hand-off", async () => {
    db.row = baseRow();
    const out = await runGuestAnalysis(ID);
    expect(out).toEqual({ success: true });

    expect(handOff).not.toHaveBeenCalled();
    expect(sendGuestFullReportPaid).not.toHaveBeenCalled();

    expect(pdfCalls).toHaveLength(1);
    expect(pdfCalls[0].tier).toBe("standard");
    expect(db.uploads).toEqual([`${ID}/report.pdf`]);

    const patch = finalPatch();
    expect(patch.status).toBe("delivered");
    const rd = patch.report_data as Row;
    expect(rd).not.toHaveProperty("payg");
    expect(rd).not.toHaveProperty("fullReport");
    expect(patch.report_pdf_url).toBe(`https://storage.test/${ID}/report.pdf?sig=1`);

    expect(sendGuestReport).toHaveBeenCalledTimes(1);
    const args = sendGuestReport.mock.calls[0][0];
    // Exactly the pre-v5 argument set: no tier label, no paid amount override.
    expect(Object.keys(args).sort()).toEqual(["email", "guestAnalysisId", "pdfUrl", "reportData"]);
    expect(args.email).toBe("founder@acme.com.au");
  });
});

describe("runGuestAnalysis — claim race (every guest order)", () => {
  it("the paid→analyzing flip is a compare-and-set: 0 rows changed → stop, nothing analysed or sent", async () => {
    db.row = baseRow();
    db.claimLost = true;
    const out = await runGuestAnalysis(ID);
    expect(out).toEqual({ success: false, error: "claim_lost" });
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0].filters).toEqual([["id", ID], ["status", "paid"]]);
    expect(pdfCalls).toHaveLength(0);
    expect(sendGuestReport).not.toHaveBeenCalled();
    expect(handOff).not.toHaveBeenCalled();
  });

  it("a guest Full order that lost the claim is never handed off twice", async () => {
    db.row = baseRow({ report_data: { payg: { tier: "full", sku: "report_full", pricing_version: "v5" } } });
    db.claimLost = true;
    expect(await runGuestAnalysis(ID)).toEqual({ success: false, error: "claim_lost" });
    expect(handOff).not.toHaveBeenCalled();
    expect(sendGuestFullReportPaid).not.toHaveBeenCalled();
  });
});

describe("runGuestAnalysis — guest Snapshot (payg tier snapshot)", () => {
  it("keeps the SVI path with the preview cut and the tier on the tax-invoice line", async () => {
    db.row = baseRow({ report_data: { payg: { tier: "snapshot", sku: "report_snapshot", pricing_version: "v5" } }, paid_amount_aud_cents: 1900 });
    await runGuestAnalysis(ID);
    expect(handOff).not.toHaveBeenCalled();
    expect(pdfCalls[0].tier).toBe("preview");
    const args = sendGuestReport.mock.calls[0][0];
    expect(args.tierLabel).toBe("Snapshot report");
    expect(args.amountPaidCents).toBe(1900);
  });
});

describe("runGuestAnalysis — guest Full (payg tier full)", () => {
  const FULL = { payg: { tier: "full", sku: "report_full", pricing_version: "v5" } };

  it("hands the order to the TBR v2 job: no SVI PDF, no SVI e-mail, receipt with the signed link", async () => {
    db.row = baseRow({ report_data: FULL, paid_amount_aud_cents: 4900 });
    const out = await runGuestAnalysis(ID);
    expect(out).toEqual({ success: true });

    expect(handOff).toHaveBeenCalledTimes(1);
    expect(handOff.mock.calls[0][0]).toEqual({
      guestAnalysisId: ID,
      email: "founder@acme.com.au",
      inputType: "website_url",
      inputValue: "https://acme.com.au",
      inputFilename: null,
    });

    expect(pdfCalls).toHaveLength(0);
    expect(db.uploads).toHaveLength(0);
    expect(sendGuestReport).not.toHaveBeenCalled();

    // paid → analyzing (compare-and-set), then the link is written and the
    // order STAYS analyzing ("handed to the report job") — the job settles
    // it (G35 P2-3, full-settle.ts).
    expect(db.updates[0].patch).toEqual({ status: "analyzing" });
    expect(db.updates[0].filters).toContainEqual(["status", "paid"]);
    expect(db.updates).toHaveLength(2);
    const last = db.updates[db.updates.length - 1];
    expect(last.filters).toContainEqual(["status", "analyzing"]);
    expect(last.patch).not.toHaveProperty("status");
    expect(last.patch).not.toHaveProperty("delivered_at");
    expect(last.patch.report_pdf_url).toBeNull();
    const rd = last.patch.report_data as { payg: Row; fullReport: Row };
    expect(rd.payg).toEqual(FULL.payg);
    expect(rd.fullReport).toMatchObject({ analysisId: "a1b2c3d4-0000-4000-8000-000000000001", pipeline: "tbr-v2" });
    // The signed token is never stored.
    expect(JSON.stringify(rd)).not.toContain("t=signed");

    expect(sendGuestFullReportPaid).toHaveBeenCalledWith({
      to: "founder@acme.com.au",
      guestOrderId: ID,
      amountCents: 4900,
      reportUrl: "https://blockid.au/analyze/a1b2c3d4-0000-4000-8000-000000000001?t=signed",
    });
  });

  it("a failed hand-off marks the order failed (as the A$3 path does)", async () => {
    db.row = baseRow({ report_data: FULL, paid_amount_aud_cents: 4900 });
    handOff.mockRejectedValueOnce(new Error("empty_input_after_extraction"));
    const out = await runGuestAnalysis(ID);
    expect(out).toEqual({ success: false, error: "empty_input_after_extraction" });
    expect(finalPatch()).toEqual({ status: "failed", error_message: "empty_input_after_extraction" });
    expect(sendGuestFullReportPaid).not.toHaveBeenCalled();
  });

  it("a receipt that fails to send does not fail the order", async () => {
    db.row = baseRow({ report_data: FULL, paid_amount_aud_cents: null, amount_paid_aud_cents: null });
    sendGuestFullReportPaid.mockRejectedValueOnce(new Error("smtp down"));
    expect(await runGuestAnalysis(ID)).toEqual({ success: true });
    // No amount on the row → the Full catalogue amount on the receipt.
    expect(sendGuestFullReportPaid.mock.calls[0][0].amountCents).toBe(4900);
  });

  it("G35 P2-3: a failed link write after the hand-off never marks the order failed (the job holds it); ops alerted", async () => {
    db.row = baseRow({ report_data: FULL, paid_amount_aud_cents: 4900 });
    db.updateError = (patch) => ("report_data" in patch ? { message: "connection reset" } : null);
    const out = await runGuestAnalysis(ID);
    expect(out).toEqual({ success: true });
    expect(db.updates.some((u) => u.patch.status === "failed")).toBe(false);
    expect(sendTelegram).toHaveBeenCalledTimes(1);
    expect(sendTelegram.mock.calls[0][0]).toContain(ID);
    expect(sendTelegram.mock.calls[0][0]).not.toContain("founder@acme.com.au");
    // The guest still gets the receipt with the signed link.
    expect(sendGuestFullReportPaid).toHaveBeenCalledTimes(1);
  });

  it("only a paid row runs (duplicate webhook / reconcile is a no-op)", async () => {
    db.row = baseRow({ report_data: FULL, status: "delivered" });
    const out = await runGuestAnalysis(ID);
    expect(out.success).toBe(false);
    expect(handOff).not.toHaveBeenCalled();
  });
});
