import { describe, expect, it } from "vitest";
import {
  allChapterSlugs,
  getAdjacentChapters,
  getChapter,
  isChapterSlug,
  listChapters,
  type ChapterSlug,
} from "./startup-journey";
import { PHASE_LABELS } from "@/lib/showcase/gallery";

const EXPECTED_SLUGS: ChapterSlug[] = [
  "01-vision",
  "02-idea-validation",
  "03-market-research",
  "04-mvp",
  "05-pmf",
  "06-revenue",
  "07-growth",
  "08-team",
  "09-funding",
  "10-fundraise",
  "11-scale",
  "12-exit",
];

describe("startup-journey chapter registry", () => {
  it("publishes chapters 1–12 (B2 + B3 + B4) in order", () => {
    const chapters = listChapters();
    expect(chapters.map((c) => c.slug)).toEqual(EXPECTED_SLUGS);
    expect(chapters.map((c) => c.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(chapters.map((c) => c.phase)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("exposes the same slug set through allChapterSlugs()", () => {
    expect(allChapterSlugs()).toEqual(EXPECTED_SLUGS);
  });

  it("returns null for unknown slugs and never throws", () => {
    expect(getChapter("bogus")).toBeNull();
    expect(getChapter("13-post-exit")).toBeNull();
    expect(isChapterSlug("13-post-exit")).toBe(false);
  });

  it("resolves known slugs and confirms isChapterSlug()", () => {
    for (const slug of EXPECTED_SLUGS) {
      expect(isChapterSlug(slug)).toBe(true);
      const chapter = getChapter(slug);
      expect(chapter).not.toBeNull();
      expect(chapter?.slug).toBe(slug);
    }
  });
});

describe("chapter content coverage", () => {
  it("every chapter has non-empty EN + VI copy across all six required sections", () => {
    for (const chapter of listChapters()) {
      // (a) founder action
      expect(chapter.founderAction.en.length).toBeGreaterThan(0);
      expect(chapter.founderAction.vi.length).toBeGreaterThan(0);
      // (b) agents invoked — at least three bullets each
      expect(chapter.agentsInvoked.en.length).toBeGreaterThanOrEqual(3);
      expect(chapter.agentsInvoked.vi.length).toBe(chapter.agentsInvoked.en.length);
      // (c) expected outputs — at least three bullets each
      expect(chapter.expectedOutputs.en.length).toBeGreaterThanOrEqual(3);
      expect(chapter.expectedOutputs.vi.length).toBe(chapter.expectedOutputs.en.length);
      // (d) common pitfalls — at least three each
      expect(chapter.commonPitfalls.en.length).toBeGreaterThanOrEqual(3);
      expect(chapter.commonPitfalls.vi.length).toBe(chapter.commonPitfalls.en.length);
      // (e) showcase example + cta
      expect(chapter.showcaseExample.en.length).toBeGreaterThan(0);
      expect(chapter.showcaseExample.vi.length).toBeGreaterThan(0);
      expect(chapter.cta.en.length).toBeGreaterThan(0);
      expect(chapter.cta.vi.length).toBeGreaterThan(0);
      // title + summary
      expect(chapter.title.en.length).toBeGreaterThan(0);
      expect(chapter.title.vi.length).toBeGreaterThan(0);
      expect(chapter.summary.en.length).toBeGreaterThan(0);
      expect(chapter.summary.vi.length).toBeGreaterThan(0);
    }
  });

  it("phaseLabel is sourced from PHASE_LABELS so slug labels stay canonical", () => {
    for (const chapter of listChapters()) {
      expect(chapter.phaseLabel).toBe(PHASE_LABELS[chapter.phase]);
    }
  });
});

describe("qualifyingTests (Div 83A checklist on chapter 08)", () => {
  it("chapter 08-team publishes the eight Div 83A tests EN + VI", () => {
    const c = getChapter("08-team");
    expect(c).not.toBeNull();
    expect(c?.qualifyingTests).toBeDefined();
    expect(c?.qualifyingTests?.en.length).toBe(8);
    expect(c?.qualifyingTests?.vi.length).toBe(8);
    // Every test cites at least one statutory reference so the checklist stays
    // auditable against the div83a-checker.ts pure evaluator.
    for (const line of c?.qualifyingTests?.en ?? []) {
      expect(line.length).toBeGreaterThan(20);
    }
  });

  it("no other chapter carries qualifyingTests (single-chapter feature)", () => {
    for (const chapter of listChapters()) {
      if (chapter.slug === "08-team") continue;
      expect(chapter.qualifyingTests).toBeUndefined();
    }
  });
});

describe("R&D Tax Incentive section (chapter 06 P1j)", () => {
  it("chapter 06-revenue publishes a rnd-tax-incentive section EN + VI", () => {
    const c = getChapter("06-revenue");
    expect(c).not.toBeNull();
    expect(c?.sections).toBeDefined();
    const rnd = c?.sections?.find((s) => s.id === "rnd-tax-incentive");
    expect(rnd).toBeDefined();
    expect(rnd?.heading.en.length).toBeGreaterThan(0);
    expect(rnd?.heading.vi.length).toBeGreaterThan(0);
    // At least six substantive bullets each; both locales aligned.
    expect(rnd?.body.en.length).toBeGreaterThanOrEqual(6);
    expect(rnd?.body.vi.length).toBe(rnd?.body.en.length);
  });

  it("R&DTI section cites the anchors AU founders search for", () => {
    const c = getChapter("06-revenue");
    const rnd = c?.sections?.find((s) => s.id === "rnd-tax-incentive");
    const en = (rnd?.body.en ?? []).join("\n");
    // Statutory + programmatic anchors that make the copy auditable.
    for (const anchor of [
      "AusIndustry",
      "ATO",
      "A$20",              // A$20M turnover threshold + A$20,000 minimum spend
      "43.5",              // refundable-offset headline rate
      "10 month",          // registration deadline
      "Schedule 743",      // ATO claim schedule
      "s355-25",           // Industry Research and Development Act 1986 core-activity test
    ]) {
      expect(en).toContain(anchor);
    }
  });

  it("no other chapter carries sections yet (P1j + P1l + Q6/Q7 + P11 + P5-tax-invoice-checker-ch5-section + P12d-redomicile-decision + P7-ga4-measurement-plan-section — chapters 05, 06, 07, 08, 10, 11 and 12 only)", () => {
    const chaptersWithSections = new Set<ChapterSlug>([
      "05-pmf",
      "06-revenue",
      "07-growth",
      "08-team",
      "10-fundraise",
      "11-scale",
      "12-exit",
    ]);
    for (const chapter of listChapters()) {
      if (chaptersWithSections.has(chapter.slug)) continue;
      expect(chapter.sections).toBeUndefined();
    }
  });
});

describe("GA4 measurement plan section (chapter 07 P7-ga4-measurement-plan-section)", () => {
  it("chapter 07-growth publishes a ga4-measurement-plan section EN + VI", () => {
    const c = getChapter("07-growth");
    expect(c).not.toBeNull();
    expect(c?.sections).toBeDefined();
    const s = c?.sections?.find((x) => x.id === "ga4-measurement-plan");
    expect(s).toBeDefined();
    expect(s?.heading.en.length).toBeGreaterThan(0);
    expect(s?.heading.vi.length).toBeGreaterThan(0);
    // At least six substantive bullets each; both locales aligned.
    expect(s?.body.en.length).toBeGreaterThanOrEqual(6);
    expect(s?.body.vi.length).toBe(s?.body.en.length);
    for (const line of s?.body.en ?? []) {
      expect(line.length).toBeGreaterThan(40);
    }
    for (const line of s?.body.vi ?? []) {
      expect(line.length).toBeGreaterThan(40);
    }
  });

  it("GA4 measurement plan section cites the anchors AU founders search for", () => {
    const c = getChapter("07-growth");
    const s = c?.sections?.find((x) => x.id === "ga4-measurement-plan");
    const en = (s?.body.en ?? []).join("\n");
    for (const anchor of [
      "Privacy Act 1988",
      "APP1",
      "APP5",
      "APP8",
      "APP11",
      "Consent Mode v2",
      "GST Act s9-70",
      "purchase.value",
      "purchase.tax",
      "Wilson",
      "s18 Australian Consumer Law",
      "s1041H Corporations Act 2001 (Cth)",
      "au-ga4-measurement-plan",
      "Notifiable Data Breaches Scheme",
    ]) {
      expect(en).toContain(anchor);
    }
  });
});

describe("redomicile-decision-tree section (chapter 12 P12d-redomicile-decision)", () => {
  it("chapter 12-exit publishes a redomicile-decision-tree section EN + VI", () => {
    const c = getChapter("12-exit");
    expect(c).not.toBeNull();
    expect(c?.sections).toBeDefined();
    const s = c?.sections?.find((x) => x.id === "redomicile-decision-tree");
    expect(s).toBeDefined();
    expect(s?.heading.en.length).toBeGreaterThan(0);
    expect(s?.heading.vi.length).toBeGreaterThan(0);
    // At least six substantive bullets each; both locales aligned.
    expect(s?.body.en.length).toBeGreaterThanOrEqual(6);
    expect(s?.body.vi.length).toBe(s?.body.en.length);
  });

  it("redomicile section cites the anchors an AU founder needs to defend the call", () => {
    const c = getChapter("12-exit");
    const s = c?.sections?.find((x) => x.id === "redomicile-decision-tree");
    const en = (s?.body.en ?? []).join("\n");
    for (const anchor of [
      "Scheme of Arrangement",                 // core mechanism
      "Part 5.1",                              // Corps Act 2001 (Cth) — AU scheme regime
      "s411",                                  // Corps Act member-scheme section
      "Federal Court",                         // AU sanction court
      "UK High Court",                         // Atlassian 2022 precedent
      "Delaware",                              // Atlassian redomicile destination
      "Companies Act 2006",                    // UK scheme regime
      "Part 26",                               // UK Companies Act 2006 scheme part
      "Subdiv 124-M",                          // ITAA 1997 scrip-for-scrip rollover
      "ITAA 1997",                             // AU income-tax statute
      "CGT event A1",                          // ITAA 1997 s104-10 trigger
      "FIRB",                                  // Foreign Investment Review Board
      "Foreign Acquisitions and Takeovers Act 1975", // FIRB statute
      "A$339M",                                // 2026 FIRB non-sensitive threshold
      "PFIC",                                  // IRC §1297 exposure
      "CFC",                                   // IRC §957 CFC status post-redomicile
      "GILTI",                                 // IRC §951A exposure
      "s911A",                                 // Corps Act financial-services boundary
      "s923B",                                 // Corps Act misleading-representation boundary
      "/dashboard/exit-readiness",             // BlockID surface deep-link
    ]) {
      expect(en).toContain(anchor);
    }
  });

  it("redomicile section explicitly frames itself as narrow-scenario, not a default recommendation", () => {
    const c = getChapter("12-exit");
    const s = c?.sections?.find((x) => x.id === "redomicile-decision-tree");
    const en = (s?.body.en ?? []).join("\n").toLowerCase();
    // Guardrail: the section must route founders through a specialist rather
    // than framing redomicile as a productised offering. Mirrors the P1m
    // dual-class-decision guardrail — the platform surfaces the decision,
    // it does not auto-generate the scheme booklet or the Delaware certificate.
    expect(en).toContain("not yet, and possibly never");
    expect(en).toContain("specialist");
    expect(en).toContain("blockid does not auto-draft");
  });
});

describe("ATO tax-invoice checker section (chapter 05 P5-tax-invoice-checker-ch5-section)", () => {
  it("chapter 05-pmf publishes an ato-tax-invoice-checker section EN + VI", () => {
    const c = getChapter("05-pmf");
    expect(c).not.toBeNull();
    expect(c?.sections).toBeDefined();
    const s = c?.sections?.find((x) => x.id === "ato-tax-invoice-checker");
    expect(s).toBeDefined();
    expect(s?.heading.en.length).toBeGreaterThan(0);
    expect(s?.heading.vi.length).toBeGreaterThan(0);
    expect(s?.body.en.length).toBeGreaterThanOrEqual(6);
    expect(s?.body.vi.length).toBe(s?.body.en.length);
  });

  it("ATO tax-invoice section cites the anchors an AU founder needs to defend the format", () => {
    const c = getChapter("05-pmf");
    const s = c?.sections?.find((x) => x.id === "ato-tax-invoice-checker");
    const en = (s?.body.en ?? []).join("\n");
    for (const anchor of [
      "s 29-70(1)",                       // GST Act core rule
      "s 29-70(3)",                       // RCTI carve-out
      "A$82.50",                          // no-tax-invoice-required threshold
      "A$1,000",                          // large-invoice threshold
      "ABN",                              // required supplier + recipient identity
      "Total price includes GST",         // s 29-70(1) statement alternative
      "Recipient-Created Tax Invoice",    // RCTI (canonical)
      "/workspace/tax-invoice-checker",   // deep-link to the shipped wizard
      "/dashboard/compliance",            // deep-link to the panel
    ]) {
      expect(en).toContain(anchor);
    }
  });

  it("ATO tax-invoice section points founder at the shipped checker rather than issuing tax advice", () => {
    const c = getChapter("05-pmf");
    const s = c?.sections?.find((x) => x.id === "ato-tax-invoice-checker");
    const en = (s?.body.en ?? []).join("\n").toLowerCase();
    // Guardrail: the section must route founders to the wizard rather than
    // reading like tax advice on a specific invoice. The disclaimer that
    // ships on every checker output (TAX_INVOICE_DISCLAIMER, tax-invoice-
    // checker.ts) covers the AFSL / tax-agent boundary at runtime.
    expect(en).toContain("/workspace/tax-invoice-checker");
    expect(en).toContain("disclaimer");
  });
});

describe("culture-rituals-shipit section (chapter 08 Q7)", () => {
  it("chapter 08-team publishes a culture-rituals-shipit section EN + VI", () => {
    const c = getChapter("08-team");
    expect(c).not.toBeNull();
    expect(c?.sections).toBeDefined();
    const s = c?.sections?.find((x) => x.id === "culture-rituals-shipit");
    expect(s).toBeDefined();
    expect(s?.heading.en.length).toBeGreaterThan(0);
    expect(s?.heading.vi.length).toBeGreaterThan(0);
    expect(s?.body.en.length).toBeGreaterThanOrEqual(6);
    expect(s?.body.vi.length).toBe(s?.body.en.length);
  });

  it("ShipIt section cites the anchors an AU founder needs to defend the ritual", () => {
    const c = getChapter("08-team");
    const s = c?.sections?.find((x) => x.id === "culture-rituals-shipit");
    const en = (s?.body.en ?? []).join("\n");
    for (const anchor of [
      "24-hour",              // canonical timeframe
      "2005",                 // ShipIt start year
      "FedEx Day",            // original name
      "quarterly",            // cadence
      "Fair Work Act 2009",   // AU wage-hour anchor for paid participation
      "IP Assignment Deed",   // ownership rider
    ]) {
      expect(en).toContain(anchor);
    }
  });
});

describe("pledge-1-percent section (chapter 08 Q6)", () => {
  it("chapter 08-team publishes a pledge-1-percent section EN + VI", () => {
    const c = getChapter("08-team");
    expect(c).not.toBeNull();
    expect(c?.sections).toBeDefined();
    const s = c?.sections?.find((x) => x.id === "pledge-1-percent");
    expect(s).toBeDefined();
    expect(s?.heading.en.length).toBeGreaterThan(0);
    expect(s?.heading.vi.length).toBeGreaterThan(0);
    expect(s?.body.en.length).toBeGreaterThanOrEqual(6);
    expect(s?.body.vi.length).toBe(s?.body.en.length);
  });

  it("Pledge 1% section cites the anchors an AU founder needs to defend the pledge", () => {
    const c = getChapter("08-team");
    const s = c?.sections?.find((x) => x.id === "pledge-1-percent");
    const en = (s?.body.en ?? []).join("\n");
    for (const anchor of [
      "pledge1percent.org",   // authoritative deep-link
      "2014",                 // Pledge 1% co-founding year
      "Salesforce",           // co-founder attribution
      "Rally",                // co-founder attribution (Rally Software)
      "1% of equity",         // equity ledger
      "1% of product",        // product ledger
      "1% of profit",         // profit ledger
      "1% of employee time",  // time ledger
      "DGR",                  // Deductible Gift Recipient (ATO)
      "ITAA 1997 s30-15",     // AU tax-deductibility anchor
      "soft nudge only",      // guardrail language — the Q6 recommendation
    ]) {
      expect(en).toContain(anchor);
    }
  });

  it("Pledge 1% section explicitly frames itself as soft-nudge, not a fundraise gate", () => {
    const c = getChapter("08-team");
    const s = c?.sections?.find((x) => x.id === "pledge-1-percent");
    const en = (s?.body.en ?? []).join("\n").toLowerCase();
    // The guardrail matters: the SVI must not read the checkbox; the platform
    // must never opt a founder in. If either changes, Q6 needs a re-read.
    expect(en).toContain("never opt");
    expect(en).toContain("not a fundraise gate");
    expect(en).toContain("not a scoring input");
  });
});

describe("primary vs secondary section (chapter 10 P1l)", () => {
  it("chapter 10-fundraise publishes a primary-vs-secondary section EN + VI", () => {
    const c = getChapter("10-fundraise");
    expect(c).not.toBeNull();
    expect(c?.sections).toBeDefined();
    const s = c?.sections?.find((x) => x.id === "primary-vs-secondary");
    expect(s).toBeDefined();
    expect(s?.heading.en.length).toBeGreaterThan(0);
    expect(s?.heading.vi.length).toBeGreaterThan(0);
    // At least six substantive bullets each; both locales aligned.
    expect(s?.body.en.length).toBeGreaterThanOrEqual(6);
    expect(s?.body.vi.length).toBe(s?.body.en.length);
  });

  it("primary-vs-secondary section cites the anchors an AU founder needs to defend the call", () => {
    const c = getChapter("10-fundraise");
    const s = c?.sections?.find((x) => x.id === "primary-vs-secondary");
    const en = (s?.body.en ?? []).join("\n");
    // Atlassian precedent + AU statutory anchors that make the copy auditable.
    for (const anchor of [
      "Accel",                    // 2010 US$60M secondary
      "T. Rowe",                  // 2014 US$150M secondary
      "US$60M",                   // Accel 2010 headline
      "US$150M",                  // T. Rowe 2014 headline
      "s707",                     // Corps Act on-sale rule
      "s708",                     // exemption regime
      "Right of First Refusal",   // ROFR
      "CGT event A1",             // ITAA 1997 s104-10
      "Subscription Agreement",   // primary docs
      "Share Purchase Agreement", // secondary docs
      "Div 360",                  // ESIC — does NOT survive secondary
      "Form 484",                 // ASIC notification for both paths
    ]) {
      expect(en).toContain(anchor);
    }
  });
});

describe("dual-class decision section (chapter 10 P1m)", () => {
  it("chapter 10-fundraise publishes a dual-class-decision section EN + VI", () => {
    const c = getChapter("10-fundraise");
    expect(c).not.toBeNull();
    expect(c?.sections).toBeDefined();
    const s = c?.sections?.find((x) => x.id === "dual-class-decision");
    expect(s).toBeDefined();
    expect(s?.heading.en.length).toBeGreaterThan(0);
    expect(s?.heading.vi.length).toBeGreaterThan(0);
    // At least six substantive bullets each; both locales aligned.
    expect(s?.body.en.length).toBeGreaterThanOrEqual(6);
    expect(s?.body.vi.length).toBe(s?.body.en.length);
  });

  it("dual-class section cites the anchors an AU founder needs to defend the call", () => {
    const c = getChapter("10-fundraise");
    const s = c?.sections?.find((x) => x.id === "dual-class-decision");
    const en = (s?.body.en ?? []).join("\n");
    for (const anchor of [
      "Listing Rule 6.9",         // ASX prohibition on unequal voting
      "Class A",                   // dual-class nomenclature
      "Class B",                   // dual-class nomenclature
      "UK Plc",                    // Atlassian 2014 reorg path
      "Delaware",                  // 2022 redomicile + alt path
      "Scheme of Arrangement",     // Court-sanctioned reorg mechanism
      "Subdiv 124-M",              // ITAA 1997 scrip-for-scrip rollover
      "s911A",                     // Corps Act financial-services boundary
      "sunset",                    // sunset clauses on dual-class term sheets
      "single-class",              // AU default
    ]) {
      expect(en).toContain(anchor);
    }
  });
});

describe("acquisition-pattern section (chapter 11 P11-acquisition-pattern)", () => {
  it("chapter 11-scale publishes an acquisition-pattern section EN + VI", () => {
    const c = getChapter("11-scale");
    expect(c).not.toBeNull();
    expect(c?.sections).toBeDefined();
    const s = c?.sections?.find((x) => x.id === "acquisition-pattern");
    expect(s).toBeDefined();
    expect(s?.heading.en.length).toBeGreaterThan(0);
    expect(s?.heading.vi.length).toBeGreaterThan(0);
    // At least six substantive bullets each; both locales aligned.
    expect(s?.body.en.length).toBeGreaterThanOrEqual(6);
    expect(s?.body.vi.length).toBe(s?.body.en.length);
  });

  it("acquisition-pattern section cites the anchors an AU founder needs to defend the template", () => {
    const c = getChapter("11-scale");
    const s = c?.sections?.find((x) => x.id === "acquisition-pattern");
    const en = (s?.body.en ?? []).join("\n");
    // Atlassian precedent + AU statutory + regulatory anchors.
    for (const anchor of [
      "Trello",                    // 2017 US$425M
      "OpsGenie",                  // 2018 US$295M
      "Loom",                      // 2023 US$975M
      "US$425M",                   // Trello headline
      "US$295M",                   // OpsGenie headline
      "US$975M",                   // Loom headline
      "RSU",                       // retention consideration form
      "90%",                       // cash tranche share of the 90/10 template
      "Subdiv 124-M",              // ITAA 1997 scrip-for-scrip rollover boundary
      "scrip-for-scrip",           // rollover shorthand
      "escrow",                    // hold-back pattern
      "FIRB",                      // Foreign Investment Review Board
      "CGT event A1",              // ITAA 1997 s104-10 seller-side tax event
      "change-of-control",         // disclosure-schedule anchor
    ]) {
      expect(en).toContain(anchor);
    }
  });
});

describe("getAdjacentChapters()", () => {
  it("returns null previous for the first chapter and null next for the last", () => {
    expect(getAdjacentChapters("01-vision").previous).toBeNull();
    expect(getAdjacentChapters("01-vision").next?.slug).toBe("02-idea-validation");

    expect(getAdjacentChapters("12-exit").next).toBeNull();
    expect(getAdjacentChapters("12-exit").previous?.slug).toBe("11-scale");
  });

  it("returns both neighbours for a middle chapter", () => {
    const { previous, next } = getAdjacentChapters("02-idea-validation");
    expect(previous?.slug).toBe("01-vision");
    expect(next?.slug).toBe("03-market-research");
  });

  it("stitches the B2/B3 boundary at 04-mvp ↔ 05-pmf", () => {
    expect(getAdjacentChapters("04-mvp").next?.slug).toBe("05-pmf");
    expect(getAdjacentChapters("05-pmf").previous?.slug).toBe("04-mvp");
  });

  it("stitches the B3/B4 boundary at 08-team ↔ 09-funding", () => {
    expect(getAdjacentChapters("08-team").next?.slug).toBe("09-funding");
    expect(getAdjacentChapters("09-funding").previous?.slug).toBe("08-team");
  });
});
