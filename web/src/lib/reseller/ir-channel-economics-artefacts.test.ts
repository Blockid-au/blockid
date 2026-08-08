// P13.7 IR advisory follow-up — colocated regression for the Channel Economics
// pitch-deck slide + data-room one-pager. Locks the invariants surfaced by
// docs/plans/reviews/plan-review-ir.md (recs #1 + #3).

import { describe, it, expect } from "vitest";

import {
  ONE_PAGER_REQUIRED_SECTIONS,
  RETAIL_BLOCKID_GROSS_INVARIANT_AUD,
  SELLER_OF_RECORD_ABN,
  SELLER_OF_RECORD_ENTITY,
  WHOLESALE_DESIGN_PARTNER,
  auditChannelEconomicsSlide,
  auditOnePager,
  readOnePager,
  readPitchDeck,
} from "./ir-channel-economics-artefacts";
import { resolve } from "node:path";

// Repo root is two levels up from web/src/lib/reseller.
const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");

describe("P13.7 IR advisory — pitch deck Slide 8 Channel Economics", () => {
  const pitchDeck = readPitchDeck(REPO_ROOT);
  const audit = auditChannelEconomicsSlide(pitchDeck);

  it("Slide 8 heading is present verbatim", () => {
    expect(audit.slideHeadingPresent).toBe(true);
  });

  it("cites Auschain PTY LTD as seller-of-record", () => {
    expect(audit.sellerOfRecordCited).toBe(true);
  });

  it("cites the single ABN on every invoice", () => {
    expect(audit.abnCited).toBe(true);
  });

  it("cites the A$59.40 BlockID gross invariant", () => {
    expect(audit.grossInvariantCited).toBe(true);
  });

  it("cites 0% wholesale commission", () => {
    expect(audit.wholesaleZeroCommissionCited).toBe(true);
  });

  it("cites 40% retail commission", () => {
    expect(audit.retailFortyPercentCited).toBe(true);
  });

  it("names InfoVision as wholesale design-partner reference", () => {
    expect(audit.wholesaleDesignPartnerCited).toBe(true);
  });

  it("cross-references the data-room one-pager", () => {
    expect(audit.onePagerCrossReferenced).toBe(true);
  });

  it("renders the retail truth-table with the A$59.40 gross column across all 5 tiers", () => {
    const slideStart = pitchDeck.indexOf("## Slide 8: Channel Economics");
    const slideEnd = pitchDeck.indexOf("\n## Slide 9", slideStart);
    const slice = pitchDeck.slice(slideStart, slideEnd);
    const grossHits = slice.match(new RegExp(`\\*\\*${RETAIL_BLOCKID_GROSS_INVARIANT_AUD}\\*\\*`, "g")) ?? [];
    // 5 tiers (0/10/20/30/40) each render the A$59.40 gross column bold-highlighted.
    expect(grossHits.length).toBeGreaterThanOrEqual(5);
  });
});

describe("P13.7 IR advisory — data-room one-pager (reseller-channel-gtm-lever.md)", () => {
  const onePager = readOnePager(REPO_ROOT);
  const audit = auditOnePager(onePager);

  it("carries every canonical section heading", () => {
    expect(audit.missingSections).toEqual([]);
  });

  it("cites Auschain PTY LTD as seller-of-record", () => {
    expect(audit.sellerOfRecordCited).toBe(true);
  });

  it("cites the ABN 79 659 615 111", () => {
    expect(audit.abnCited).toBe(true);
    expect(onePager).toContain(SELLER_OF_RECORD_ABN);
    expect(onePager).toContain(SELLER_OF_RECORD_ENTITY);
  });

  it("cites the A$59.40 BlockID gross invariant", () => {
    expect(audit.grossInvariantCited).toBe(true);
  });

  it("names InfoVision as wholesale design-partner reference", () => {
    expect(audit.wholesaleDesignPartnerCited).toBe(true);
    expect(onePager).toContain(WHOLESALE_DESIGN_PARTNER);
  });

  it("cross-references pitch-deck-v1.md Slide 8", () => {
    expect(audit.pitchDeckSlideCrossReferenced).toBe(true);
  });

  it("links /showcase/blockid as the hero traction proof-point", () => {
    expect(audit.showcaseLinkPresent).toBe(true);
  });

  it("required section list is non-empty (guard against accidental empty-list bypass)", () => {
    expect(ONE_PAGER_REQUIRED_SECTIONS.length).toBeGreaterThanOrEqual(9);
  });

  it("renders the 5-tier retail truth-table with the A$59.40 gross column", () => {
    const grossHits = onePager.match(new RegExp(`\\*\\*${RETAIL_BLOCKID_GROSS_INVARIANT_AUD}\\*\\*`, "g")) ?? [];
    expect(grossHits.length).toBeGreaterThanOrEqual(5);
  });
});

describe("P13.7 IR advisory — pitch-deck ↔ one-pager symmetric cross-reference", () => {
  const pitchDeck = readPitchDeck(REPO_ROOT);
  const onePager = readOnePager(REPO_ROOT);

  it("pitch deck references the one-pager filename", () => {
    expect(pitchDeck).toContain("reseller-channel-gtm-lever.md");
  });

  it("one-pager references the pitch-deck filename", () => {
    expect(onePager).toContain("pitch-deck-v1.md");
  });

  it("both artefacts agree on the seller-of-record entity", () => {
    expect(pitchDeck).toContain(SELLER_OF_RECORD_ENTITY);
    expect(onePager).toContain(SELLER_OF_RECORD_ENTITY);
  });

  it("both artefacts agree on the A$59.40 BlockID gross invariant", () => {
    expect(pitchDeck).toContain(RETAIL_BLOCKID_GROSS_INVARIANT_AUD);
    expect(onePager).toContain(RETAIL_BLOCKID_GROSS_INVARIANT_AUD);
  });
});
