// P12d-redomicile-wizard — pure helper that runs a founder-supplied redomicile
// scenario through the Chapter 12 decision tree section (see /guide/12-exit
// redomicile-decision-tree). Signal, not advice. The section body (P12d-
// redomicile-decision) walks the same rules narratively; this module makes
// them evaluatable so a founder can see red/amber/green live in the
// /dashboard/exit-readiness wizard.
//
// The honest founder-facing answer for most AU startups is "hold" — the
// section exists to help founders rule redomicile out cleanly rather than
// sell an offshoring project. The wizard mirrors that posture: "proceed"
// requires at least two strong triggers AND runway to fund it; anything
// less lands on "hold" or "prepare".

export type RedomicileInput = {
  has_delaware_acquirer_signal?: boolean;
  plans_us_listing?: boolean;
  wants_dual_class_founder_control?: boolean;
  us_resident_cap_table_pct?: number | null;
  annual_burn_aud?: number | null;
  is_pre_series_a?: boolean;
  has_scrip_only_offer?: boolean;
  ip_already_in_delaware?: boolean;
  target_industry_keywords?: readonly string[];
};

export type RedomicileRecommendation =
  | "hold"
  | "prepare"
  | "proceed"
  | "reconsider";

export type RedomicileMechanism =
  | "scheme_of_arrangement_s411"
  | "takeover_bid"
  | "direct_asset_transfer"
  | null;

export type RedomicileTrigger =
  | "delaware_acquirer"
  | "us_listing_dual_class"
  | "pfic_exposure"
  | "ip_already_in_delaware"
  | "scrip_only_offer";

export type RedomicileDecision = {
  recommendation: RedomicileRecommendation;
  triggers: RedomicileTrigger[];
  mechanism: RedomicileMechanism;
  pfic_exposure_flagged: boolean;
  subdiv_124m_rollover_available: boolean;
  can_fund_redomicile: boolean;
  warnings: string[];
  next_steps: string[];
  disclaimer: string;
};

// Section body reference — kept in lock-step with the copy at
// web/src/lib/guide/startup-journey.ts (Chapter 12 redomicile-decision-tree).
// Bumping these thresholds requires bumping the section body too so the two
// surfaces cannot drift.
export const PFIC_CAP_TABLE_THRESHOLD_PCT = 0.5;
export const REDOMICILE_MIN_BUDGET_AUD = 300_000;
export const REDOMICILE_MAX_BUDGET_AUD = 800_000;
// Redomicile absorbs ~9 months of a founder's runway on the scheme + tax +
// FIRB side. Anything less than ~A$100k annual burn signals a pre-revenue
// team that cannot fund the transaction without diluting further first.
export const REDOMICILE_FLOOR_BURN_AUD = 100_000;

export const REDOMICILE_DISCLAIMER =
  "Signal, not advice — the Chapter 12 redomicile decision tree walks the " +
  "UK Companies Act 2006 Part 26 / Corps Act 2001 (Cth) Part 5.1 s411 " +
  "Scheme of Arrangement mechanism, Subdiv 124-M scrip-for-scrip rollover " +
  "eligibility (ITAA 1997), FIRB pre-lodgment under the Foreign " +
  "Acquisitions and Takeovers Act 1975 (Cth), and US-side CFC (IRC §957) / " +
  "PFIC (IRC §1297) / GILTI (IRC §951A) exposure. Engage a specialist " +
  "cross-border tax + corporate lawyer (Corrs / HSF / DLA / Cooley) before " +
  "signing any redomicile mandate. BlockID.au does NOT auto-draft the " +
  "scheme booklet, Delaware certificate, Subdiv 124-M private ruling, or " +
  "FIRB Form 202 (s911A + s923B Corps Act 2001 (Cth) financial-services / " +
  "legal-services boundary guard).";

function normalisePct(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (raw < 0) return null;
  const asFraction = raw > 1 ? raw / 100 : raw;
  return asFraction > 1 ? 1 : asFraction;
}

function normaliseAud(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (raw < 0) return null;
  return raw;
}

export function assessRedomicile(input: RedomicileInput): RedomicileDecision {
  const pfic = normalisePct(input.us_resident_cap_table_pct);
  const burn = normaliseAud(input.annual_burn_aud);

  const triggers: RedomicileTrigger[] = [];
  if (input.has_delaware_acquirer_signal) triggers.push("delaware_acquirer");
  if (input.plans_us_listing && input.wants_dual_class_founder_control) {
    triggers.push("us_listing_dual_class");
  }
  if (pfic !== null && pfic >= PFIC_CAP_TABLE_THRESHOLD_PCT) {
    triggers.push("pfic_exposure");
  }
  if (input.ip_already_in_delaware) triggers.push("ip_already_in_delaware");
  if (input.has_scrip_only_offer) triggers.push("scrip_only_offer");

  const pficFlagged = triggers.includes("pfic_exposure");
  const scripOnly = triggers.includes("scrip_only_offer");
  const canFund = burn !== null && burn >= REDOMICILE_FLOOR_BURN_AUD;

  // Recommendation branches — deliberately conservative. Two+ strong triggers
  // AND funded → proceed; two+ triggers but unfunded → reconsider; one trigger
  // → prepare; zero triggers or pre-Series-A → hold.
  let recommendation: RedomicileRecommendation;
  if (input.is_pre_series_a) {
    recommendation = "hold";
  } else if (triggers.length === 0) {
    recommendation = "hold";
  } else if (triggers.length >= 2 && canFund) {
    recommendation = "proceed";
  } else if (triggers.length >= 2 && !canFund) {
    recommendation = "reconsider";
  } else {
    recommendation = "prepare";
  }

  // Mechanism — the Delaware acquirer offering scrip typically walks the
  // s411 Scheme of Arrangement (75% class-by-value / 50% by-number, Federal
  // Court sanction). Takeover-bid restructures fit hostile / partial-cash
  // offers. Direct asset transfer is the "wrong answer" for an operating
  // company but shows up when the operating business has essentially no
  // AU-side operations left.
  let mechanism: RedomicileMechanism = null;
  if (recommendation === "proceed" || recommendation === "prepare") {
    if (triggers.includes("delaware_acquirer") || scripOnly) {
      mechanism = "scheme_of_arrangement_s411";
    } else if (triggers.includes("us_listing_dual_class")) {
      mechanism = "scheme_of_arrangement_s411";
    } else if (triggers.includes("pfic_exposure")) {
      mechanism = "takeover_bid";
    } else {
      mechanism = "scheme_of_arrangement_s411";
    }
  }

  const warnings: string[] = [];
  if (input.is_pre_series_a && triggers.length > 0) {
    warnings.push(
      "Pre-Series-A + redomicile triggers detected — hold. The scheme absorbs 4-9 months of legal + tax + FIRB attention that a pre-Series-A team cannot spare from product-market fit. Revisit after the Series A closes.",
    );
  }
  if (pficFlagged) {
    const pct = Math.round((pfic ?? 0) * 100);
    warnings.push(
      `~${pct}% of your cap table (by voting rights) is US-resident — the AU op-co may already be a PFIC under IRC §1297 for those investors, forcing punitive mark-to-market or QEF elections. A redomicile removes the PFIC issue but re-creates CFC (IRC §957) + GILTI (IRC §951A) exposure on the surviving US parent's AU op-co.`,
    );
  }
  if (
    triggers.includes("delaware_acquirer") &&
    scripOnly === false &&
    input.has_scrip_only_offer !== undefined
  ) {
    warnings.push(
      "Delaware acquirer with a cash + shares (not scrip-only) offer — Subdiv 124-M scrip-for-scrip rollover only applies to the share consideration; the cash tranche triggers CGT event A1 (ITAA 1997 s104-10) on contract date. Plan the seller tax funding gap.",
    );
  }
  if (triggers.length >= 2 && !canFund) {
    const shortfall = REDOMICILE_FLOOR_BURN_AUD;
    warnings.push(
      `Runway looks tight to fund the A$${REDOMICILE_MIN_BUDGET_AUD.toLocaleString("en-AU")}-A$${REDOMICILE_MAX_BUDGET_AUD.toLocaleString("en-AU")} scheme cost end-to-end (rule of thumb: annual burn ≥ A$${shortfall.toLocaleString("en-AU")}). Either raise a bridge earmarked for the redomicile or negotiate the buyer to cover legal costs at signing.`,
    );
  }
  if (
    triggers.includes("us_listing_dual_class") &&
    !triggers.includes("delaware_acquirer")
  ) {
    warnings.push(
      "US listing + dual-class founder control — ASX Listing Rule 6.9 blocks dual-class on the AU exchange, so a US listing via a Delaware C-corp is the standard path. A UK Plc intermediary + Scheme of Arrangement (Atlassian 2014-15) is the alternative if the US IRS + SEC exposure of a direct Delaware structure is unpalatable.",
    );
  }

  const nextSteps: string[] = [];
  if (recommendation === "hold") {
    nextSteps.push(
      "Do nothing. Redomicile is not the right project for you today — most AU startups never need to. Re-run this wizard after a Delaware acquirer approaches you, or after your US cap-table concentration crosses 50%.",
    );
  }
  if (recommendation === "prepare") {
    nextSteps.push(
      "Book a 30-minute preliminary call with a cross-border tax specialist (Corrs / HSF / DLA / Cooley). Objective: pin the Subdiv 124-M scrip-for-scrip rollover eligibility question and the FIRB Form 202 timeline so you can quote them to your board before spending the six-figure legal budget.",
    );
  }
  if (recommendation === "proceed") {
    nextSteps.push(
      "Engage the M&A lead partner at a cross-border firm (Corrs / HSF / DLA / Cooley) and budget A$300k-A$800k for the scheme + tax + FIRB work over the next 4-9 months. Add A$150k-A$300k for a concurrent US S-4 registration if you are dual-class listing at the same time.",
    );
    nextSteps.push(
      "Instruct your board to appoint an Independent Expert (typical Grant Thornton / KPMG / Deloitte scope) — the s411 Scheme of Arrangement booklet requires the fairness + reasonableness opinion, and ASIC will not sign off without it.",
    );
    nextSteps.push(
      "Model the founder + employee ESS tax hit under Subdiv 83A-C — if the AU op-co ESS grants roll into the Delaware C-corp, the deferred taxation continues; if they crystallise on the scheme date, the ATO liability lands with a cliff and needs a cash withholding plan.",
    );
  }
  if (recommendation === "reconsider") {
    nextSteps.push(
      "Do NOT sign a redomicile mandate today — you have the triggers but not the runway. Priority: raise a bridge round earmarked for the scheme cost, negotiate the acquirer to fund legals, or defer until an event (larger acquirer offer, US listing window) makes the funding gap easier to close.",
    );
  }
  nextSteps.push(
    "File the two data-room folders that always get requested in redomicile diligence: Corporate & Legal (Folder 1) and Cap Table & Equity (Folder 2). Every share issue since incorporation must be evidenced with the ASIC Form 484 change-of-member lodgement + supporting resolution.",
  );

  return {
    recommendation,
    triggers,
    mechanism,
    pfic_exposure_flagged: pficFlagged,
    subdiv_124m_rollover_available: scripOnly,
    can_fund_redomicile: canFund,
    warnings,
    next_steps: nextSteps,
    disclaimer: REDOMICILE_DISCLAIMER,
  };
}
