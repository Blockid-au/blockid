// Colocated tests for the S17-B connected-revenue loader.
//
//   - Stripe `svi_signals.mrr_aud` rows → { provider: "stripe", mrrAud, capturedAt }
//   - Xero `svi_evidence.xero_revenue` (3-month P&L income) → mrr ≈ income / 3
//   - project scoping: `.eq("project_id")` when set, `.is("project_id", null)` otherwise
//   - Xero lookup skipped without an accountId; a failing table never throws

import { describe, expect, it, vi } from "vitest";
import {
  XERO_PL_WINDOW_MONTHS,
  loadConnectedRevenueSignals,
  sviSignalToRevenue,
  xeroEvidenceToSignal,
} from "./connected-revenue";

describe("sviSignalToRevenue", () => {
  it("maps a stripe mrr_aud row", () => {
    expect(
      sviSignalToRevenue({ provider: "stripe", signal_value_num: 8200, captured_at: "2026-09-01T00:00:00Z" }),
    ).toEqual({ provider: "stripe", mrrAud: 8200, capturedAt: "2026-09-01T00:00:00Z" });
  });

  it("rejects unknown providers, non-numeric values and missing timestamps", () => {
    expect(sviSignalToRevenue({ provider: "hubspot", signal_value_num: 1, captured_at: "2026-09-01T00:00:00Z" })).toBeNull();
    expect(sviSignalToRevenue({ provider: "stripe", signal_value_num: null, captured_at: "2026-09-01T00:00:00Z" })).toBeNull();
    expect(sviSignalToRevenue({ provider: "stripe", signal_value_num: 5, captured_at: null })).toBeNull();
  });
});

describe("xeroEvidenceToSignal", () => {
  it("derives MRR from the 3-month P&L income and uses verified_at", () => {
    const out = xeroEvidenceToSignal({
      value_or_url: JSON.stringify({ totalIncomeAud: 30_000, tenantName: "Acme" }),
      verified_at: "2026-09-02T00:00:00Z",
      created_at: "2026-08-01T00:00:00Z",
    });
    expect(out).toEqual({ provider: "xero", mrrAud: 30_000 / XERO_PL_WINDOW_MONTHS, capturedAt: "2026-09-02T00:00:00Z" });
  });

  it("falls back to created_at and rejects zero / malformed payloads", () => {
    expect(
      xeroEvidenceToSignal({ value_or_url: JSON.stringify({ totalIncomeAud: 9000 }), verified_at: null, created_at: "2026-08-01T00:00:00Z" }),
    ).toMatchObject({ mrrAud: 3000, capturedAt: "2026-08-01T00:00:00Z" });
    expect(xeroEvidenceToSignal({ value_or_url: JSON.stringify({ totalIncomeAud: 0 }), verified_at: null, created_at: "x" })).toBeNull();
    expect(xeroEvidenceToSignal({ value_or_url: "not json", verified_at: null, created_at: "x" })).toBeNull();
    expect(xeroEvidenceToSignal({ value_or_url: null, verified_at: null, created_at: "x" })).toBeNull();
  });
});

type Call = { op: string; args: unknown[] };

function makeSb(opts: {
  signals?: unknown[] | null;
  xero?: unknown | null;
  signalsThrow?: boolean;
}) {
  const signalCalls: Call[] = [];
  const evidenceCalls: Call[] = [];

  const signalBuilder: Record<string, unknown> = {};
  const chainS = (op: string) => (...args: unknown[]) => {
    signalCalls.push({ op, args });
    return signalBuilder;
  };
  signalBuilder.select = chainS("select");
  signalBuilder.eq = chainS("eq");
  signalBuilder.is = chainS("is");
  signalBuilder.order = chainS("order");
  signalBuilder.limit = vi.fn(async () => {
    if (opts.signalsThrow) throw new Error("boom");
    return { data: opts.signals ?? null, error: null };
  });

  const evidenceBuilder: Record<string, unknown> = {};
  const chainE = (op: string) => (...args: unknown[]) => {
    evidenceCalls.push({ op, args });
    return evidenceBuilder;
  };
  evidenceBuilder.select = chainE("select");
  evidenceBuilder.eq = chainE("eq");
  evidenceBuilder.order = chainE("order");
  evidenceBuilder.limit = chainE("limit");
  evidenceBuilder.maybeSingle = vi.fn(async () => ({ data: opts.xero ?? null, error: null }));

  const from = vi.fn((table: string) => {
    if (table === "svi_signals") return signalBuilder;
    if (table === "svi_evidence") return evidenceBuilder;
    throw new Error(`unexpected table ${table}`);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { sb: { from } as any, from, signalCalls, evidenceCalls };
}

describe("loadConnectedRevenueSignals", () => {
  it("reads stripe signals scoped to the project and xero evidence for the account", async () => {
    const { sb, signalCalls, evidenceCalls } = makeSb({
      signals: [{ provider: "stripe", signal_value_num: 8200, captured_at: "2026-09-01T00:00:00Z" }],
      xero: { value_or_url: JSON.stringify({ totalIncomeAud: 27_000 }), verified_at: "2026-09-03T00:00:00Z", created_at: null },
    });
    const out = await loadConnectedRevenueSignals(sb, { userId: "u-1", projectId: "p-1", accountId: "acc-1" });
    expect(out).toEqual([
      { provider: "stripe", mrrAud: 8200, capturedAt: "2026-09-01T00:00:00Z" },
      { provider: "xero", mrrAud: 9000, capturedAt: "2026-09-03T00:00:00Z" },
    ]);
    expect(signalCalls).toContainEqual({ op: "eq", args: ["user_id", "u-1"] });
    expect(signalCalls).toContainEqual({ op: "eq", args: ["signal_key", "mrr_aud"] });
    expect(signalCalls).toContainEqual({ op: "eq", args: ["project_id", "p-1"] });
    expect(evidenceCalls).toContainEqual({ op: "eq", args: ["account_id", "acc-1"] });
    expect(evidenceCalls).toContainEqual({ op: "eq", args: ["evidence_type", "xero_revenue"] });
  });

  it("uses IS NULL project scoping for legacy rows and skips xero without an account", async () => {
    const { sb, from, signalCalls } = makeSb({ signals: [] });
    const out = await loadConnectedRevenueSignals(sb, { userId: "u-1", projectId: null });
    expect(out).toEqual([]);
    expect(signalCalls).toContainEqual({ op: "is", args: ["project_id", null] });
    expect(from).not.toHaveBeenCalledWith("svi_evidence");
  });

  it("never throws when a lookup fails", async () => {
    const { sb } = makeSb({ signalsThrow: true, xero: null });
    await expect(loadConnectedRevenueSignals(sb, { userId: "u-1", projectId: "p-1", accountId: "a" })).resolves.toEqual([]);
  });
});
