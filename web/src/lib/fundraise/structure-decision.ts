// P10-structure-decision — pure helper that runs a founder-supplied listing +
// control scenario through the Chapter 10 dual-class decision section (see
// /guide/10-fundraise dual-class-decision, shipped as P1m). Signal, not
// advice. The section body walks the same rules narratively; this module
// makes them evaluatable so a founder can see a red / amber / green
// recommendation in a Workspace → Fundraise → Structure quiz without
// needing the copy first.
//
// The honest founder-facing answer for most AU startups is
// "single-class default" — the section exists to help founders rule
// dual-class out cleanly rather than sell an offshore-parent project.
// The wizard mirrors that posture: "consider_dual_class_offshore" only
// fires when there is an actual US-listing plan AND appetite for the
// A$300k–A$800k UK-Plc / Delaware-C-corp restructure AND revenue is
// large enough to absorb that legal budget without a bridge round.
//
// Anchors to statute + guidance:
//   - ASX Listing Rule 6.9 (one-vote-per-share on a poll — no waiver track
//     for straight founder-control dual-class on the ASX);
//   - Corporations Act 2001 (Cth) Chapter 2D + replaceable rules
//     (single-class AU default);
//   - UK Companies Act 2006 (Part 26 Scheme of Arrangement path used by
//     Atlassian 2014-15 for the UK-Plc dual-class parent);
//   - DGCL s102(a)(4) (Delaware direct dual-class incorporation path);
//   - ITAA 1997 Subdiv 124-M (scrip-for-scrip rollover election on the
//     restructure, if triggered);
//   - Corps Act s911A + s923B (BlockID.au auto-drafts NONE of the
//     restructure paperwork — this is a signal + warm-intro surface only).

export type StructureDecisionInput = {
  wants_us_listing?: boolean;
  wants_asx_listing?: boolean;
  wants_founder_control_after_dilution?: boolean;
  expects_2plus_venture_rounds?: boolean;
  has_us_offshore_parent_appetite?: boolean;
  has_specialist_counsel_engaged?: boolean;
  annual_revenue_aud?: number | null;
};

export type StructureRecommendation =
  | "insufficient_signal"
  | "single_class_default"
  | "single_class_with_founder_protections"
  | "consider_dual_class_offshore";

export type StructureBlockedPath =
  | "asx_dual_class_listing_rule_6_9"
  | "direct_delaware_without_counsel";

export type StructureTrigger =
  | "us_listing_plan"
  | "founder_control_desired"
  | "high_dilution_risk"
  | "offshore_appetite"
  | "revenue_supports_offshore_budget";

export type StructureDecision = {
  recommendation: StructureRecommendation;
  triggers: StructureTrigger[];
  blocked_paths: StructureBlockedPath[];
  warnings: string[];
  next_steps: string[];
  disclaimer: string;
};

// Kept in lock-step with the Chapter 10 dual-class decision copy at
// web/src/lib/guide/startup-journey.ts. Bumping this threshold requires
// bumping the section body too so the two surfaces cannot drift.
export const OFFSHORE_PARENT_MIN_REVENUE_AUD = 5_000_000;

export const STRUCTURE_DECISION_DISCLAIMER =
  "Signal, not advice — the Chapter 10 dual-class decision section walks " +
  "ASX Listing Rule 6.9 (one-vote-per-share on a poll blocks straight " +
  "founder-control dual-class on the ASX), the UK Companies Act 2006 " +
  "Part 26 Scheme of Arrangement path (Atlassian 2014-15), the Delaware " +
  "DGCL s102(a)(4) direct-incorporation path, and the ITAA 1997 Subdiv " +
  "124-M scrip-for-scrip rollover election. Engage cross-border counsel " +
  "(Corrs / HSF / DLA / Cooley) before signing any restructure mandate. " +
  "BlockID.au does NOT auto-draft the UK Scheme booklet, Delaware " +
  "certificate of incorporation, or FIRB Form 202 (s911A + s923B Corps " +
  "Act 2001 (Cth) financial-services / legal-services boundary guard).";

function normaliseAud(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  if (raw < 0) return null;
  return raw;
}

export function assessStructureDecision(
  input: StructureDecisionInput,
): StructureDecision {
  const revenue = normaliseAud(input.annual_revenue_aud);

  const triggers: StructureTrigger[] = [];
  if (input.wants_us_listing) triggers.push("us_listing_plan");
  if (input.wants_founder_control_after_dilution) {
    triggers.push("founder_control_desired");
  }
  if (input.expects_2plus_venture_rounds) triggers.push("high_dilution_risk");
  if (input.has_us_offshore_parent_appetite) triggers.push("offshore_appetite");
  if (revenue !== null && revenue >= OFFSHORE_PARENT_MIN_REVENUE_AUD) {
    triggers.push("revenue_supports_offshore_budget");
  }

  const blocked: StructureBlockedPath[] = [];
  const warnings: string[] = [];
  const nextSteps: string[] = [];

  if (input.wants_asx_listing && input.wants_founder_control_after_dilution) {
    blocked.push("asx_dual_class_listing_rule_6_9");
    warnings.push(
      "ASX Listing Rule 6.9 requires one-vote-per-share on a poll — there is no waiver track for straight founder-control dual-class on the ASX. Pursuing dual-class rules out an ASX listing.",
    );
  }

  const wantsControl = !!input.wants_founder_control_after_dilution;
  const wantsUsListing = !!input.wants_us_listing;
  const offshoreAppetite = !!input.has_us_offshore_parent_appetite;
  const revenueSupports =
    revenue !== null && revenue >= OFFSHORE_PARENT_MIN_REVENUE_AUD;

  // Zero-signal input — do not push a recommendation. The Chapter 10 quiz
  // needs at least one answered question to give a defensible read.
  if (
    !wantsControl &&
    !wantsUsListing &&
    !input.wants_asx_listing &&
    !input.expects_2plus_venture_rounds &&
    !offshoreAppetite &&
    revenue === null
  ) {
    return {
      recommendation: "insufficient_signal",
      triggers,
      blocked_paths: blocked,
      warnings: [
        "No structure signals answered — answer at least one Chapter 10 question so the wizard can return a defensible recommendation.",
      ],
      next_steps: [
        "Open the Chapter 10 dual-class decision section (/guide/10-fundraise#dual-class-decision) and answer the four founder-control + listing questions before re-running the quiz.",
      ],
      disclaimer: STRUCTURE_DECISION_DISCLAIMER,
    };
  }

  let recommendation: StructureRecommendation;
  if (wantsUsListing && wantsControl && offshoreAppetite && revenueSupports) {
    recommendation = "consider_dual_class_offshore";
    if (!input.has_specialist_counsel_engaged) {
      blocked.push("direct_delaware_without_counsel");
      warnings.push(
        "Do not attempt a direct Delaware incorporation or UK-Plc Scheme of Arrangement without cross-border counsel — the DGCL s102(a)(4) charter + PFIC (IRC §1297) / GILTI (IRC §951A) / CFC (IRC §957) analysis is not something to self-serve.",
      );
    }
    nextSteps.push(
      "Book a 30-minute preliminary call with a cross-border corporate + tax specialist (Corrs / HSF / DLA / Cooley). Objective: pin the UK-Plc Scheme (Atlassian 2014-15 path) vs direct Delaware C-corp trade-off and quote a budget + timeline before spending the six-figure legal retainer.",
    );
    nextSteps.push(
      `Model the ITAA 1997 Subdiv 124-M scrip-for-scrip rollover election path so the restructure does not crystallise CGT event A1 (ITAA 1997 s104-10) on every founder + venture cap-table row on the scheme date.`,
    );
    nextSteps.push(
      "File the two data-room folders that always get requested in offshore-parent diligence: Corporate & Legal (Folder 1) and Cap Table & Equity (Folder 2). Every share issue since incorporation must be evidenced with the ASIC Form 484 change-of-member lodgement + supporting resolution.",
    );
  } else if (wantsControl) {
    recommendation = "single_class_with_founder_protections";
    nextSteps.push(
      "Stay single-class under Corps Act 2001 (Cth) Chapter 2D and negotiate founder-control protections inside a standard Blackbird / AirTree shareholders' agreement instead: (a) double-trigger vesting acceleration on change of control, (b) founder-veto on named board reserved matters (budget / capital raise / M&A / ESOP amendment), (c) ROFR on transfer to a competitor, (d) founder-nominee director seat surviving dilution. These deliver ~70% of the control benefit at ~5% of the structural cost.",
    );
    if (wantsUsListing && !offshoreAppetite) {
      nextSteps.push(
        "You want a US listing but have not signalled appetite for the A$300k-A$800k UK-Plc / Delaware-C-corp restructure — either accept a single-class US listing (Canva-style plan-B) or budget the offshore parent restructure ~18 months before the listing window.",
      );
    }
    if (wantsUsListing && !revenueSupports) {
      warnings.push(
        `Annual revenue below A$${OFFSHORE_PARENT_MIN_REVENUE_AUD.toLocaleString("en-AU")} — even with offshore-parent appetite, most cross-border firms will steer you to single-class-with-protections until revenue supports the ongoing dual-parent compliance burden.`,
      );
    }
  } else {
    recommendation = "single_class_default";
    nextSteps.push(
      "Default single-class ordinary shares under Corporations Act 2001 (Cth) Chapter 2D + ASIC Form 201 registration — this is what >95% of AU startups do and what every AU-focused term sheet (Blackbird / AirTree / Square Peg) is calibrated to.",
    );
    if (input.expects_2plus_venture_rounds) {
      nextSteps.push(
        "Revisit the founder-control question at each Series round — if dilution across 2+ rounds erodes founder voting below 30%, the single-class-with-founder-protections path (double-trigger vesting + reserved-matters veto + ROFR + board seat) is the standard AU pattern to keep operating control without touching share classes.",
      );
    }
  }

  nextSteps.push(
    "Log the Chapter 10 answer set into your data-room Folder 9 (Strategy & Roadmap) so the next investor to ask 'why single-class?' or 'why not ASX?' gets a documented, source-cited answer instead of a shrug.",
  );

  return {
    recommendation,
    triggers,
    blocked_paths: blocked,
    warnings,
    next_steps: nextSteps,
    disclaimer: STRUCTURE_DECISION_DISCLAIMER,
  };
}
