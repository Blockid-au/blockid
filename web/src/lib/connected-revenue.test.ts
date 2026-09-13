// Colocated tests for the S17-B connected-revenue loader.
//
//   - Stripe `svi_signals.mrr_aud` rows → { provider: "stripe", mrrAud, capturedAt }
//   - Xero `svi_evidence.xero_revenue` (3-month P&L income) → mrr ≈ income / 3
//   - project scoping: `.eq("project_id")` when set, `.is("project_id", null)` otherwise
//   - Xero lookup skipped without an accountId; a failing table never throws
//   - S25-A: `connector_snapshots` (0349) is read first and carries the
//     90-day prior + churn; a provider with a snapshot skips its legacy row

import { describe, expect, it, vi } from "vitest";
import {
  XERO_PL_WINDOW_MONTHS,
  loadConnectedRevenueSignals,
  stripeEvidenceToSignal,
  sviSignalToRevenue,
  xeroEvidenceToSignal,
} from "./connected-revenue";

describe("stripeEvidenceToSignal (S25-A — legacy api/oauth/stripe/callback row)", () => {
  it("reads `mrr` from the evidence JSON and dates it by verified_at", () => {
    expect(
      stripeEvidenceToSignal({ value_or_url: JSON.stringify({ mrr: 8_200.4, customerCount: 12 }), verified_at: "2026-09-02T00:00:00Z", created_at: null }),
    ).toEqual({ provider: "stripe", mrrAud: 8_200, capturedAt: "2026-09-02T00:00:00Z", origin: "svi_evidence" });
    expect(stripeEvidenceToSignal({ value_or_url: JSON.stringify({ mrr: 0 }), verified_at: "x", created_at: null })).toBeNull();
    expect(stripeEvidenceToSignal({ value_or_url: "12", verified_at: "x", created_at: null })).toBeNull();
  });
});

describe("sviSignalToRevenue", () => {
  it("maps a stripe mrr_aud row", () => {
    expect(
      sviSignalToRevenue({ provider: "stripe", signal_value_num: 8200, captured_at: "2026-09-01T00:00:00Z" }),
    ).toEqual({ provider: "stripe", mrrAud: 8200, capturedAt: "2026-09-01T00:00:00Z", origin: "svi_signals" });
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
    expect(out).toEqual({ provider: "xero", mrrAud: 30_000 / XERO_PL_WINDOW_MONTHS, capturedAt: "2026-09-02T00:00:00Z", origin: "svi_evidence" });
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
  /** S25-A — connector_snapshots rows (DESC by taken_at). Omit → table missing (pre-0349). */
  snapshots?: unknown[];
}) {
  const signalCalls: Call[] = [];
  const evidenceCalls: Call[] = [];
  const snapshotCalls: Call[] = [];

  const snapshotBuilder: Record<string, unknown> = {};
  const chainN = (op: string) => (...args: unknown[]) => {
    snapshotCalls.push({ op, args });
    return snapshotBuilder;
  };
  snapshotBuilder.select = chainN("select");
  snapshotBuilder.eq = chainN("eq");
  snapshotBuilder.is = chainN("is");
  snapshotBuilder.order = chainN("order");
  snapshotBuilder.limit = vi.fn(async () => ({ data: opts.snapshots ?? [], error: null }));

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
    if (table === "connector_snapshots") {
      if (opts.snapshots === undefined) throw new Error("relation connector_snapshots does not exist");
      return snapshotBuilder;
    }
    throw new Error(`unexpected table ${table}`);
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { sb: { from } as any, from, signalCalls, evidenceCalls, snapshotCalls };
}

describe("loadConnectedRevenueSignals", () => {
  it("reads stripe signals scoped to the project and xero evidence for the account", async () => {
    const { sb, signalCalls, evidenceCalls } = makeSb({
      signals: [{ provider: "stripe", signal_value_num: 8200, captured_at: "2026-09-01T00:00:00Z" }],
      xero: { value_or_url: JSON.stringify({ totalIncomeAud: 27_000 }), verified_at: "2026-09-03T00:00:00Z", created_at: null },
    });
    const out = await loadConnectedRevenueSignals(sb, { userId: "u-1", projectId: "p-1", accountId: "acc-1" });
    expect(out).toEqual([
      { provider: "stripe", mrrAud: 8200, capturedAt: "2026-09-01T00:00:00Z", origin: "svi_signals" },
      { provider: "xero", mrrAud: 9000, capturedAt: "2026-09-03T00:00:00Z", origin: "svi_evidence" },
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

  it("S25-A: prefers connector_snapshots (with the 90-day prior + churn) and skips that provider's legacy row", async () => {
    const snap = (provider: string, taken_at: string, metrics: Record<string, unknown>) => ({
      id: `s-${provider}-${taken_at}`, user_id: "u-1", project_id: "p-1", provider, taken_at, metrics, source: "resync",
    });
    const { sb, snapshotCalls } = makeSb({
      snapshots: [
        snap("stripe", "2026-09-07T05:00:00Z", { mrrAud: 12_000, churnRate90dPct: 4.2 }),
        snap("stripe", "2026-07-01T05:00:00Z", { mrrAud: 10_000, churnRate90dPct: 2 }),
        snap("stripe", "2026-06-01T05:00:00Z", { mrrAud: 9_000, churnRate90dPct: 1 }),
      ],
      signals: [
        { provider: "stripe", signal_value_num: 8200, captured_at: "2026-09-01T00:00:00Z" },
        { provider: "xero", signal_value_num: 5000, captured_at: "2026-08-20T00:00:00Z" },
      ],
      xero: null,
    });
    const out = await loadConnectedRevenueSignals(sb, { userId: "u-1", projectId: "p-1", accountId: "acc-1" });
    expect(out[0]).toEqual({
      provider: "stripe",
      mrrAud: 12_000,
      capturedAt: "2026-09-07T05:00:00Z",
      priorMrrAud: 9_000, // the 2026-06-01 row: ≥ 90 d before the latest (07-01 is only 68 d)
      priorCapturedAt: "2026-06-01T05:00:00Z",
      churnRate90dPct: 4.2,
      origin: "connector_snapshot",
    });
    // Stripe's legacy svi_signals row is skipped; Xero's (no snapshot) is kept.
    expect(out.filter((s) => s.provider === "stripe")).toHaveLength(1);
    expect(out[1]).toMatchObject({ provider: "xero", mrrAud: 5000, origin: "svi_signals" });
    expect(snapshotCalls).toContainEqual({ op: "eq", args: ["user_id", "u-1"] });
    expect(snapshotCalls).toContainEqual({ op: "eq", args: ["project_id", "p-1"] });
  });

  it("S25-A: a Xero snapshot maps income / windowMonths to MRR", async () => {
    const { sb } = makeSb({
      snapshots: [{ id: "x1", user_id: "u-1", project_id: null, provider: "xero", taken_at: "2026-09-07T05:00:00Z", metrics: { totalIncomeAud: 27_000, windowMonths: 3 }, source: "resync" }],
      signals: [],
    });
    const out = await loadConnectedRevenueSignals(sb, { userId: "u-1", projectId: null });
    expect(out).toEqual([
      { provider: "xero", mrrAud: 9000, capturedAt: "2026-09-07T05:00:00Z", priorMrrAud: null, priorCapturedAt: null, churnRate90dPct: null, origin: "connector_snapshot" },
    ]);
  });
});
