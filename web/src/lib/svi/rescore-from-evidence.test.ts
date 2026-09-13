// Colocated vitest for the pure halves of the shared rescore (S25-A /
// S25-review). The DB-driven `rescoreAccountFromEvidence` is exercised by
// `api/svi/rescore-from-evidence/route.test.ts` and the resync suite; this
// file pins the carve-out arithmetic that both callers depend on:
//
//   * the revenue-connector rows the magnitude table replaces are keyed on
//     evidence type AND dimension (`stripe`/`tre`, `xero_revenue`/`tre`) —
//     the Stripe customer-count row (`stripe`/`mpc`) is NOT revenue and
//     keeps its flat +15 (S25-review regression: keying on type alone cost
//     every Stripe-linked account 15 MPC points);
//   * every other confidence level keeps the flat table;
//   * `freshestRevenueSignal` ignores non-positive / undated signals.

import { describe, expect, it } from "vitest";
import {
  EVIDENCE_BONUS,
  REVENUE_CONNECTOR_EVIDENCE_TYPES,
  flatEvidenceBonuses,
  freshestRevenueSignal,
  isRevenueConnectorRow,
} from "./rescore-from-evidence";

describe("isRevenueConnectorRow", () => {
  it("is true only for a connected_source revenue row on TRE", () => {
    expect(isRevenueConnectorRow({ evidence_type: "stripe", confidence_level: "connected_source", dimension: "tre" })).toBe(true);
    expect(isRevenueConnectorRow({ evidence_type: "xero_revenue", confidence_level: "connected_source", dimension: "tre" })).toBe(true);
    // The Stripe customer-count row lands on MPC — not revenue.
    expect(isRevenueConnectorRow({ evidence_type: "stripe", confidence_level: "connected_source", dimension: "mpc" })).toBe(false);
    // A self-declared "stripe" row is not a connector row.
    expect(isRevenueConnectorRow({ evidence_type: "stripe", confidence_level: "self_declared", dimension: "tre" })).toBe(false);
    expect(isRevenueConnectorRow({ evidence_type: "github", confidence_level: "connected_source", dimension: "tre" })).toBe(false);
    expect(REVENUE_CONNECTOR_EVIDENCE_TYPES).toEqual(new Set(["stripe", "xero_revenue"]));
  });
});

describe("flatEvidenceBonuses", () => {
  it("carves out the TRE revenue rows and keeps the Stripe MPC customer row at the flat +15", () => {
    const out = flatEvidenceBonuses([
      { evidence_type: "stripe", confidence_level: "connected_source", dimension: "tre", label: "Stripe: MRR $8.2k" },
      { evidence_type: "stripe", confidence_level: "connected_source", dimension: "mpc", label: "Stripe Customers: 57" },
      { evidence_type: "xero_revenue", confidence_level: "connected_source", dimension: "tre", label: "Xero Revenue Verified" },
      { evidence_type: "github", confidence_level: "connected_source", dimension: "ptd", label: "GitHub" },
      { evidence_type: "pitch_deck", confidence_level: "document_uploaded", dimension: "ftv", label: "Deck" },
      { evidence_type: "website", confidence_level: "public_url", dimension: "ftv", label: "Site" },
      { evidence_type: "note", confidence_level: null, dimension: "cgh", label: "Self" },
      { evidence_type: "xero_pl", confidence_level: "connected_source", dimension: "financial_health", label: "not a dimension" },
    ]);
    expect(out).toEqual({
      mpc: EVIDENCE_BONUS.connected_source, // 15 — kept
      ptd: EVIDENCE_BONUS.connected_source,
      ftv: EVIDENCE_BONUS.document_uploaded + EVIDENCE_BONUS.public_url,
      cgh: EVIDENCE_BONUS.self_declared,
    });
    expect(out.tre).toBeUndefined();
    expect(EVIDENCE_BONUS).toEqual({ self_declared: 3, public_url: 6, document_uploaded: 10, connected_source: 15 });
  });
});

describe("freshestRevenueSignal", () => {
  it("returns the newest positive dated signal, ignoring zero / NaN MRR and unparsable dates", () => {
    const best = freshestRevenueSignal([
      { provider: "stripe", mrrAud: 0, capturedAt: "2026-09-13T00:00:00Z", origin: "connector_snapshot" },
      { provider: "xero", mrrAud: 9_000, capturedAt: "2026-09-01T00:00:00Z", origin: "svi_evidence" },
      { provider: "stripe", mrrAud: 8_200, capturedAt: "2026-09-07T00:00:00Z", origin: "svi_signals" },
      { provider: "stripe", mrrAud: 99_999, capturedAt: "not-a-date", origin: "svi_signals" },
      { provider: "stripe", mrrAud: Number.NaN, capturedAt: "2026-09-12T00:00:00Z", origin: "svi_signals" },
    ]);
    expect(best).toMatchObject({ provider: "stripe", mrrAud: 8_200 });
    expect(freshestRevenueSignal([])).toBeNull();
  });
});
