// Canonical startup-to-unicorn journey vocabulary — v1.0.0
// Single source of truth for stage names used across BlockID surfaces.
//
// Source of the taxonomy: standard VC/accelerator 8-stage synthesis documented
// in docs/plans/real-world-workflow-parity-audit-2026-07-23.md §3.
// Reference cases anchor each stage against a real Australian/APAC company
// journey (Atlassian, Canva, Airwallex, Xero, Culture Amp).
//
// This module replaces the four overlapping legacy taxonomies (SVI-8,
// Growth-12, SCN-5, 8-spiral roadmap). Legacy modules still export their own
// labels but must migrate to CANONICAL_STAGES / CANONICAL_STAGE_LABELS.

export const JOURNEY_VOCAB_VERSION = "1.0.0";

/**
 * The canonical 8-stage journey, ordered from earliest (idea) to latest
 * (public listing or exit). Keys are stable snake_case identifiers used in
 * storage and APIs. Human-facing copy lives in {@link CANONICAL_STAGE_LABELS}.
 */
export const CANONICAL_STAGES = [
  "idea",
  "validation",
  "mvp_early_revenue",
  "seed",
  "series_a",
  "series_b_c",
  "late_stage",
  "public_exit",
] as const;

export type StageKey = (typeof CANONICAL_STAGES)[number];

/** English + Vietnamese display labels per canonical stage. */
export const CANONICAL_STAGE_LABELS: Record<
  StageKey,
  { label_en: string; label_vi: string }
> = {
  idea: {
    label_en: "Idea",
    label_vi: "Ý tưởng",
  },
  validation: {
    label_en: "Validation (Pre-PMF)",
    label_vi: "Kiểm chứng (Trước PMF)",
  },
  mvp_early_revenue: {
    label_en: "MVP / Early Revenue",
    label_vi: "MVP / Doanh thu ban đầu",
  },
  seed: {
    label_en: "Seed (Post-PMF)",
    label_vi: "Vòng hạt giống (Sau PMF)",
  },
  series_a: {
    label_en: "Series A (Growth)",
    label_vi: "Series A (Tăng trưởng)",
  },
  series_b_c: {
    label_en: "Series B / C (Scale)",
    label_vi: "Series B / C (Mở rộng quy mô)",
  },
  late_stage: {
    label_en: "Late-stage (Pre-IPO)",
    label_vi: "Giai đoạn muộn (Trước IPO)",
  },
  public_exit: {
    label_en: "Public / Exit",
    label_vi: "Niêm yết / Thoái vốn",
  },
};

/**
 * What must be true *before* a startup can claim it has entered this stage.
 * Kept plain-English so founders can self-assess; 2-4 bullets per stage.
 */
export const STAGE_ENTRY_CRITERIA: Record<StageKey, string[]> = {
  idea: [
    "Founder(s) identified and committed",
    "Problem hypothesis articulated in one paragraph",
  ],
  validation: [
    "Written vision statement",
    "Ideal customer profile (ICP) defined",
    "First 5+ customer discovery interviews logged",
  ],
  mvp_early_revenue: [
    "Problem validated with 10+ users or letters of intent",
    "Buildable MVP scope agreed",
    "Founding team of 2-4 in place",
  ],
  seed: [
    "Live product with first paying customers",
    "Repeatable sales motion emerging",
    "Cap table and clean legal chassis established",
  ],
  series_a: [
    "Product-market fit demonstrated (Sean Ellis >=40% or NRR >100%)",
    "Approx. A$1-1.5M ARR with month-over-month growth",
    "Founding leadership team hired (5-15 people)",
  ],
  series_b_c: [
    "Approx. US$5-10M ARR at T2D3 pace",
    "Repeatable go-to-market playbook",
    "Series A capital deployed against a clear scale thesis",
  ],
  late_stage: [
    "Approx. US$25-100M ARR",
    "Clear path to profitability modelled",
    "Board pack + audited financials in place",
  ],
  public_exit: [
    "Two years of audited financials",
    "Bankability assessed (IPO or acquirer LOI)",
    "S-1 / prospectus / SPA draft prepared",
  ],
};

/**
 * What must be true *before* a startup can claim it has left this stage —
 * i.e. the exit gates to the next stage. Kept plain-English; 2-4 bullets each.
 */
export const STAGE_EXIT_CRITERIA: Record<StageKey, string[]> = {
  idea: [
    "Vision statement written",
    "ICP defined and documented",
  ],
  validation: [
    "10+ paid pilots or 'hair-on-fire' letters of intent",
    "First revenue signal (paid pilot, LOI value, or waitlist)",
  ],
  mvp_early_revenue: [
    "Live product used weekly by paying customers",
    "First A$0-500K ARR booked",
    "Terms of service, privacy policy, and IP assignments signed",
  ],
  seed: [
    "40%+ 'very disappointed' Sean Ellis test or NRR >100%",
    "Approx. A$300K-1.5M ARR with retention proven",
    "Priced seed round closed with clean cap table",
  ],
  series_a: [
    "Approx. US$5-10M ARR at T2D3 pace",
    "Repeatable sales pipeline with named ICP segments",
    "Series A closed with functional VC dataroom",
  ],
  series_b_c: [
    "Approx. US$25-100M ARR",
    "International expansion or multi-product proven",
    "ESOP top-up and subsidiary structure in place",
  ],
  late_stage: [
    "Audited financials covering two full years",
    "S-1 draft or acquisition SPA circulated",
    "SOX-lite controls / big-4 audit signed off",
  ],
  public_exit: [
    "IPO priced and listing bell rung, or",
    "Acquisition close with escrow released",
  ],
};

/**
 * One real-world anchor per stage, drawn from the Atlassian / Canva /
 * Airwallex / Xero / Culture Amp reference set enumerated in the audit doc
 * (§2). `citation_hint` is a source pointer that the report renderer or a
 * downstream fact-checker can resolve to a full citation.
 */
export const STAGE_REFERENCE_CASE: Record<
  StageKey,
  {
    company: string;
    milestone: string;
    year_or_range: string;
    citation_hint: string;
  }
> = {
  idea: {
    company: "Atlassian",
    milestone:
      "Bootstrapped in Sydney on an A$10K credit card by UNSW graduates; Jira 1.0 shipped",
    year_or_range: "2002",
    citation_hint:
      "atlassian.com/blog '20 years, 20 lessons'; en.wikipedia.org/wiki/Atlassian",
  },
  validation: {
    company: "Canva",
    milestone:
      "Fusion Books precursor built and rejection tour of investors before Canva itself launched",
    year_or_range: "2007-2012",
    citation_hint:
      "canva.com/newsroom; SMH founder interviews (Melanie Perkins)",
  },
  mvp_early_revenue: {
    company: "Airwallex",
    milestone:
      "Y Combinator W17 batch — MVP cross-border payments product with first paying customers",
    year_or_range: "2017",
    citation_hint: "ycombinator.com/companies/airwallex",
  },
  seed: {
    company: "Culture Amp",
    milestone: "Blackbird-led seed round of approximately A$1M",
    year_or_range: "2013",
    citation_hint:
      "blackbird.vc portfolio (Culture Amp); founder-review needed on exact seed size",
  },
  series_a: {
    company: "Airwallex",
    milestone: "Sequoia + Tencent Series A of US$13M",
    year_or_range: "2017",
    citation_hint: "techcrunch.com Airwallex Series A coverage",
  },
  series_b_c: {
    company: "Xero",
    milestone:
      "US expansion round US$180M led by Peter Thiel and Matrix Partners",
    year_or_range: "Feb 2014",
    citation_hint: "nzherald.co.nz Xero Peter Thiel Matrix funding",
  },
  late_stage: {
    company: "Canva",
    milestone:
      "US$200M secondary/primary round at US$40B valuation ahead of any listing",
    year_or_range: "Sep 2021",
    citation_hint: "reuters.com/technology/canva-hits-40-billion-valuation",
  },
  public_exit: {
    company: "Atlassian",
    milestone:
      "IPO on NASDAQ (ticker TEAM) priced at US$21, US$462M raised, first-day pop 32%, market cap approx. US$5.8B",
    year_or_range: "Dec 2015",
    citation_hint: "SEC S-1 (Atlassian Corporation Plc); en.wikipedia.org/wiki/Atlassian",
  },
};

// ─── Legacy migration helpers ────────────────────────────────────────────────

/**
 * Map a legacy SVI stage index (0-7, keyed by {@link
 * import("./svi-analysis").LEGACY_SVI_STAGE_LABELS}) to a canonical stage key.
 *
 * The SVI-8 taxonomy overlaps but does not line up 1:1 with the canonical
 * vocabulary — for example, SVI's "Early Traction" is closest to Seed, and
 * "Corporation" collapses late-stage and public/exit. This mapping was
 * ratified in docs/plans/real-world-workflow-parity-audit-2026-07-23.md §5.
 *
 * Values outside 0-7 fall back to `"idea"` — the safe, earliest bucket.
 */
export function sviStageToCanonical(sviStage: number): StageKey {
  switch (sviStage) {
    case 0:
      return "idea";
    case 1:
      return "validation";
    case 2:
      return "mvp_early_revenue";
    case 3:
      return "seed";
    case 4:
      return "series_a";
    case 5:
      return "series_b_c";
    case 6:
      return "late_stage";
    case 7:
      return "public_exit";
    default:
      return "idea";
  }
}
