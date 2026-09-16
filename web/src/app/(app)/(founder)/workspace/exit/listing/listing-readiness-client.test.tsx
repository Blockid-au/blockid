// Colocated render test for the listing readiness client (S29-A).
//
// Pins the exchange tabs, the score strip (pct + the four counts), the
// indicator-not-advice note, one card per row with status / rule / as-at /
// basis and the next step only on non-met rows, the inputs line, the PDF
// button label per gate state (cost shown BEFORE export), editor-only
// controls (viewer sees neither the facts toggle nor the export), the
// no-project hint, the draft → PATCH mapping and the copy rule (no "PhD").

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildAsxChecklist, emptyListingFacts, LISTING_READINESS_NOTE, scoreReadiness } from "@/lib/listing/readiness";
import { canEditFacts, ListingReadinessClient, patchFromDraft, pdfButtonLabel, type ListingReadinessState } from "./listing-readiness-client";

const SEED = "33333333-3333-4333-8333-333333333333";

function state(over: Partial<ListingReadinessState> = {}): ListingReadinessState {
  const rows = buildAsxChecklist({
    ...emptyListingFacts(),
    holders: [
      { id: "f", name: "Jane Founder", role: "founder", sharesHeld: 800_000 },
      { id: SEED, name: "Seed Investor Pty Ltd", role: "investor", sharesHeld: 200_000 },
    ],
    sharePriceAud: 2,
    profile: { constitution_reviewed_at: "2026-07-01" },
  });
  return {
    exchange: "asx",
    role: "owner",
    rows,
    score: scoreReadiness(rows),
    facts: { constitution_reviewed_at: "2026-07-01" },
    inputs: { holders: 2, sharePriceAud: 2, profitLast12mAud: null, profitCoverageMonths: 4, incorporatedAt: "2021-03-01", shareholders: [{ id: "f", name: "Jane Founder", role: "founder", sharesHeld: 800_000, restricted: false }, { id: SEED, name: "Seed Investor Pty Ltd", role: "investor", sharesHeld: 200_000, restricted: false }] },
    pdf: { listedCost: 1, cost: 1, included: false, includedVia: null, alreadyCharged: false },
    ...over,
  };
}

const html = (s: ListingReadinessState) => renderToStaticMarkup(<ListingReadinessClient initial={s} />);

describe("ListingReadinessClient", () => {
  it("helpers", () => {
    expect(canEditFacts("editor")).toBe(true);
    expect(canEditFacts("viewer")).toBe(false);
    expect(canEditFacts(null)).toBe(false);
    expect(pdfButtonLabel({ listedCost: 1, cost: 1, included: false, includedVia: null, alreadyCharged: false })).toBe("Export PDF · 1 credit once per project");
    expect(pdfButtonLabel({ listedCost: 1, cost: 0, included: true, includedVia: "growth", alreadyCharged: false })).toBe("Export PDF · included (Growth+)");
    expect(pdfButtonLabel({ listedCost: 1, cost: 0, included: true, includedVia: "addon", alreadyCharged: false })).toBe("Export PDF · included (equity add-on)");
    expect(pdfButtonLabel({ listedCost: 1, cost: 0, included: false, includedVia: null, alreadyCharged: true })).toBe("Export PDF · paid, free re-download");
  });

  it("owner: tabs, score strip, note, rows with rule / as-at / basis / next step, inputs line, export label with the cost", () => {
    const out = html(state());
    expect(out).toContain('data-testid="listing-tab-asx"');
    expect(out).toContain('data-testid="listing-tab-nasdaq"');
    expect(out).toContain("67 %");
    expect(out).toContain("met ÷ (met + not met)");
    expect(out).toContain(LISTING_READINESS_NOTE.replace(/'/g, "&#x27;"));
    expect((out.match(/data-testid="listing-row"/g) ?? []).length).toBe(11);
    expect(out).toContain('data-status="met"');
    expect(out).toContain('data-status="not_met"');
    expect(out).toContain('data-status="confirm_current_rule"');
    expect(out).toContain("ASX LR 1.1 condition 8 · ASX Listing Rules, Chapter 1 (Admission) and Chapter 19 (Definitions) · checked 2026-09-13");
    expect(out).toContain("1 of 1 non-affiliated holders hold a parcel worth ≥ A$2,000 at A$2.00 per share");
    expect(out).toContain("What to do next:");
    // Met rows carry no next step: constitution + free float are met → 9 next steps for 11 rows.
    expect((out.match(/data-testid="listing-next-step"/g) ?? []).length).toBe(9);
    expect(out).toContain("Computed from 2 cap-table holders at A$2.00 per share (current mid); 4 months of bank lines — 12 needed for the profit rows; incorporated 2021-03-01.");
    expect(out).toContain("Export PDF · 1 credit once per project");
    expect(out).toContain('data-testid="listing-toggle-facts"');
    expect(out).not.toContain('data-testid="listing-facts-form"');
    expect(out).not.toMatch(/PhD/);
  });

  it("viewer: read-only — no facts toggle, no export; no project → hint", () => {
    const viewer = html(state({ role: "viewer" }));
    expect(viewer).not.toContain('data-testid="listing-toggle-facts"');
    expect(viewer).not.toContain('data-testid="listing-export"');
    const none = html(state({ role: null, rows: [], score: scoreReadiness([]), inputs: null }));
    expect(none).toContain('data-testid="listing-no-project"');
    expect(none).toContain("—");
  });

  it("included / paid gate states surface on the export button", () => {
    expect(html(state({ pdf: { listedCost: 1, cost: 0, included: true, includedVia: "growth", alreadyCharged: false } }))).toContain("Export PDF · included (Growth+)");
    expect(html(state({ pdf: { listedCost: 1, cost: 0, included: false, includedVia: null, alreadyCharged: true } }))).toContain("Export PDF · paid, free re-download");
  });

  it("patchFromDraft: empty → null (clears), FY labels normalised, profit rows paired, restricted ids", () => {
    const body = patchFromDraft(
      {
        audited_accounts_confirmed_at: "",
        constitution_reviewed_at: "2026-07-01",
        directors_total: "5",
        market_makers: "",
        nta_after_raise_aud: "4000000",
        aud_usd_rate: "0.65",
        audited_accounts_fys: "2025, fy2026",
        asx_test: "assets",
        fy0: "FY2026",
        profit0: "500000",
        fy1: "2025",
        profit1: "-20000",
        fy2: "",
        profit2: "1",
      },
      [SEED],
    );
    expect(body).toMatchObject({
      audited_accounts_confirmed_at: null,
      constitution_reviewed_at: "2026-07-01",
      directors_total: 5,
      market_makers: null,
      nta_after_raise_aud: 4_000_000,
      aud_usd_rate: 0.65,
      audited_accounts_fys: ["FY2025", "FY2026"],
      asx_test: "assets",
      profit_by_fy: [
        { fy: "FY2026", profit_aud: 500_000 },
        { fy: "FY2025", profit_aud: -20_000 },
      ],
      restricted_holder_ids: [SEED],
    });
    expect(patchFromDraft({}, []).restricted_holder_ids).toBeNull();
    expect(patchFromDraft({}, []).profit_by_fy).toBeNull();
  });
});
