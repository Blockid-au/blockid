// P13.7 IR advisory follow-up — Channel Economics pitch-deck slide + data-room
// one-pager invariants (plan-review-ir.md recs #1 + #3).
//
// The two artefacts (Slide 8 in web/content/pitch/pitch-deck-v1.md and the
// data-room memo at web/content/pitch/reseller-channel-gtm-lever.md) already
// shipped in-tree; this module pins the canonical invariants so a future edit
// that (a) removes the slide, (b) drops the memo, (c) breaks the A$59.40
// invariant, (d) drifts the seller-of-record entity, or (e) severs the
// pitch-deck ↔ one-pager cross-reference trips CI via the colocated vitest.
//
// Pure Node helpers (fs + path only) — no framework surface, so it never
// crosses the /api/reseller/** scope-boundary R-01..R-10 lints.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const PITCH_DECK_PATH = "web/content/pitch/pitch-deck-v1.md";
export const ONE_PAGER_PATH = "web/content/pitch/reseller-channel-gtm-lever.md";

/** Auschain remains sole seller-of-record on every invoice (plan §U.1 / H.13). */
export const SELLER_OF_RECORD_ENTITY = "Auschain PTY LTD";
export const SELLER_OF_RECORD_ABN = "79 659 615 111";

/** BlockID gross-per-A$99-seat invariant across retail tiers 0/10/20/30/40. */
export const RETAIL_BLOCKID_GROSS_INVARIANT_AUD = "59.40";
export const RETAIL_LIST_SKU_AUD = "99";

/** Wholesale channel keeps 100% of list at 0% commission. */
export const WHOLESALE_COMMISSION_RATE = "0%";
export const RETAIL_COMMISSION_RATE = "40%";

/** InfoVision seed row is the wholesale design-partner reference. */
export const WHOLESALE_DESIGN_PARTNER = "InfoVision";

/** Canonical slide heading — used by both the pitch deck and the memo cross-ref. */
export const CHANNEL_ECONOMICS_SLIDE_HEADING = "## Slide 8: Channel Economics";

/** Canonical memo section headings — every one must survive a rewrite. */
export const ONE_PAGER_REQUIRED_SECTIONS = [
  "## 1. Why this memo exists",
  "## 2. Seller-of-record rationale",
  "## 3. Two channel models, one platform",
  "## 4. Commission truth-table — retail, A$99 SKU",
  "## 5. InfoVision as design-partner reference",
  "## 6. Forward pipeline (retail-partner categories)",
  "## 7. Diligence-readiness artefacts (already shipped)",
  "## 8. What to link from the deck",
  "## 9. Cross-references",
] as const;

export function readPitchDeck(repoRoot: string = process.cwd()): string {
  return readFileSync(join(repoRoot, PITCH_DECK_PATH), "utf8");
}

export function readOnePager(repoRoot: string = process.cwd()): string {
  return readFileSync(join(repoRoot, ONE_PAGER_PATH), "utf8");
}

export interface ChannelEconomicsSlideAudit {
  slideHeadingPresent: boolean;
  sellerOfRecordCited: boolean;
  abnCited: boolean;
  grossInvariantCited: boolean;
  wholesaleZeroCommissionCited: boolean;
  retailFortyPercentCited: boolean;
  wholesaleDesignPartnerCited: boolean;
  onePagerCrossReferenced: boolean;
}

export function auditChannelEconomicsSlide(pitchDeck: string): ChannelEconomicsSlideAudit {
  const slideStart = pitchDeck.indexOf(CHANNEL_ECONOMICS_SLIDE_HEADING);
  const slideEnd = slideStart >= 0 ? pitchDeck.indexOf("\n## Slide 9", slideStart) : -1;
  const slice =
    slideStart >= 0
      ? pitchDeck.slice(slideStart, slideEnd > 0 ? slideEnd : pitchDeck.length)
      : "";
  return {
    slideHeadingPresent: slideStart >= 0,
    sellerOfRecordCited: slice.includes(SELLER_OF_RECORD_ENTITY),
    abnCited: slice.includes(SELLER_OF_RECORD_ABN),
    grossInvariantCited: slice.includes(RETAIL_BLOCKID_GROSS_INVARIANT_AUD),
    wholesaleZeroCommissionCited:
      slice.includes(`${WHOLESALE_COMMISSION_RATE} commission`) ||
      slice.includes("0% commission"),
    retailFortyPercentCited: slice.includes(RETAIL_COMMISSION_RATE),
    wholesaleDesignPartnerCited: slice.includes(WHOLESALE_DESIGN_PARTNER),
    onePagerCrossReferenced: slice.includes("reseller-channel-gtm-lever.md"),
  };
}

export interface OnePagerAudit {
  missingSections: string[];
  sellerOfRecordCited: boolean;
  abnCited: boolean;
  grossInvariantCited: boolean;
  wholesaleDesignPartnerCited: boolean;
  pitchDeckSlideCrossReferenced: boolean;
  showcaseLinkPresent: boolean;
}

export function auditOnePager(onePager: string): OnePagerAudit {
  const missingSections = ONE_PAGER_REQUIRED_SECTIONS.filter((h) => !onePager.includes(h));
  return {
    missingSections,
    sellerOfRecordCited: onePager.includes(SELLER_OF_RECORD_ENTITY),
    abnCited: onePager.includes(SELLER_OF_RECORD_ABN),
    grossInvariantCited: onePager.includes(`A$${RETAIL_BLOCKID_GROSS_INVARIANT_AUD}`),
    wholesaleDesignPartnerCited: onePager.includes(WHOLESALE_DESIGN_PARTNER),
    pitchDeckSlideCrossReferenced:
      onePager.includes("Slide 8") && onePager.includes("pitch-deck-v1.md"),
    showcaseLinkPresent: onePager.includes("/showcase/blockid"),
  };
}
