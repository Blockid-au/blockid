// Colocated render test for the DRIP panel (S28-A).
//
// Pins the constitution / SHA + s 254X notice, the elections table (active
// / revoked, price basis label, revoke for editor+ only), the "Add election"
// control only while an electable shareholder exists, the next-allocation
// preview (shares, reinvested, cash, skip reason), the allocations list
// with the share-issue resolution button, the market-price line, the empty
// state and the copy rule (no "PhD").

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DRIP_NOTICE, DripPanel, canManageDrip, priceBasisLabel, type DripPanelState } from "./drip-panel";

function state(over: Partial<DripPanelState> = {}): DripPanelState {
  return {
    role: "owner",
    elections: [
      { id: "e1", shareholderId: "j", shareholderName: "Jane Founder", role: "founder", sharesHeld: 600_000, participationPct: 50, priceBasis: "share_price_mid", manualPriceAud: null, electedAt: "2026-07-01T00:00:00Z", revokedAt: null, active: true },
      { id: "e2", shareholderId: "s", shareholderName: "Seed Investor Pty Ltd", role: "investor", sharesHeld: 400_000, participationPct: 100, priceBasis: "manual", manualPriceAud: 2.5, electedAt: "2026-05-01T00:00:00Z", revokedAt: "2026-06-01T00:00:00Z", active: false },
    ],
    allocations: [
      { id: "a1", recordId: "r0", shareholderName: "Jane Founder", status: "recorded", skipReason: null, participationPct: 50, priceAud: 1.37, shares: 10_948, reinvestedAud: 14_998.76, residualAud: 1.24, shareTransactionId: "tx-1", createdAt: "2026-07-16T02:00:00Z" },
      { id: "a2", recordId: "r0", shareholderName: "Seed Investor Pty Ltd", status: "skipped", skipReason: "no_price", participationPct: 100, priceAud: 0, shares: 0, reinvestedAud: 0, residualAud: 0, shareTransactionId: null, createdAt: "2026-07-16T02:00:00Z" },
    ],
    shareholders: [
      { id: "j", name: "Jane Founder", role: "founder", sharesHeld: 600_000, electing: true },
      { id: "s", name: "Seed Investor Pty Ltd", role: "investor", sharesHeld: 400_000, electing: false },
    ],
    marketPriceAud: 1.37,
    preview: {
      recordId: "r1",
      period: "2026-06",
      totalDividendAud: 50_000,
      rows: [{ electionId: "e1", shareholderName: "Jane Founder", participationPct: 50, priceBasis: "share_price_mid", priceAud: 1.37, netCashAud: 30_000, estShares: 10_948, estReinvestedAud: 14_998.76, estResidualAud: 1.24, estCashPaidAud: 15_001.24, skipReason: null }],
    },
    ...over,
  };
}

const html = (s: DripPanelState) => renderToStaticMarkup(<DripPanel initial={s} />);

describe("DripPanel", () => {
  it("helpers", () => {
    expect(canManageDrip("editor")).toBe(true);
    expect(canManageDrip("viewer")).toBe(false);
    expect(priceBasisLabel("manual", 2.5)).toBe("plan price A$2.50");
    expect(priceBasisLabel("share_price_mid", null)).toBe("share price (mid) at issue");
  });

  it("owner: notice, elections (active / revoked, revoke on active only), add control, preview, allocations with the resolution button", () => {
    const out = html(state());
    expect(out).toContain(DRIP_NOTICE.replace(/'/g, "&#x27;"));
    expect(out).toContain("constitution and shareholders&#x27; agreement");
    expect(out).toContain("s 254X, Form 484");
    expect(out).toContain("Current share price (mid): A$1.37");
    // Elections.
    expect(out).toContain('data-testid="drip-election-row" data-active="1"');
    expect(out).toContain('data-testid="drip-election-row" data-active="0"');
    expect(out).toContain("50% of each net dividend · share price (mid) at issue");
    expect(out).toContain("100% of each net dividend · plan price A$2.50");
    expect((out.match(/data-testid="drip-revoke"/g) ?? []).length).toBe(1);
    expect(out).toContain('data-testid="drip-add"'); // Seed Investor can still elect
    // Preview.
    expect(out).toContain('data-testid="drip-preview"');
    expect(out).toContain("Next allocation — dividend 2026-06");
    expect(out).toContain("10,948");
    expect(out).toContain("A$14,998.76");
    expect(out).toContain("A$15,001.24");
    // Allocations.
    expect(out).toContain('data-testid="drip-allocation-row" data-status="recorded"');
    expect(out).toContain("10,948 shares at A$1.37");
    expect(out).toContain("residual A$1.24 in cash");
    expect(out).toContain("paid in cash (no_price)");
    expect(out).toContain("DRIP — 10,948 shares to Jane Founder");
    expect(out).not.toMatch(/PhD/);
  });

  it("viewer: no add / revoke; every shareholder electing → no add; empty state; no-price notice", () => {
    const viewer = html(state({ role: "viewer" }));
    expect(viewer).not.toContain('data-testid="drip-add"');
    expect(viewer).not.toContain('data-testid="drip-revoke"');
    expect(viewer).toContain("View only — viewer on this project cannot change elections.");

    const all = html(state({ shareholders: [{ id: "j", name: "Jane Founder", role: "founder", sharesHeld: 1, electing: true }] }));
    expect(all).not.toContain('data-testid="drip-add"');

    const empty = html(state({ elections: [], allocations: [], preview: null, marketPriceAud: null }));
    expect(empty).toContain('data-testid="drip-election-empty"');
    expect(empty).not.toContain('data-testid="drip-preview"');
    expect(empty).not.toContain('data-testid="drip-allocations"');

    const noPrice = html(state({ marketPriceAud: null, preview: { recordId: "r1", period: "2026-06", totalDividendAud: 50_000, rows: [{ electionId: "e1", shareholderName: "Jane Founder", participationPct: 50, priceBasis: "share_price_mid", priceAud: 0, netCashAud: 30_000, estShares: 0, estReinvestedAud: 0, estResidualAud: 0, estCashPaidAud: 30_000, skipReason: "no_price" }] } }));
    expect(noPrice).toContain("No usable share price yet");
    expect(noPrice).toContain("no usable share price — paid in cash");
  });
});
