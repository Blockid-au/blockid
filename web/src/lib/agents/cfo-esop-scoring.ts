// CFO ESOP Scoring Module (T0102)
//
// Integrates ESOP + governance health into startup scoring.
// Knowledge base: .claude/knowledge-base/esop/esop-expertise.md
// Injected into CFO agent for CGH dimension scoring and valuation adjustment.

export interface EsopStatus {
  poolCreated: boolean;
  poolPct: number;               // % of total shares (12% standard AU)
  grantsIssued: boolean;
  grantCount: number;
  founderVestingInPlace: boolean;
  legalDeedSigned: boolean;
  strikePrice: number;           // cents per share (10 = A$0.10 FMV)
  vestingMonths: number;         // standard 48
  cliffMonths: number;           // standard 12
}

export interface GovernanceHealth {
  esop: EsopStatus | null;
  hasShareholdersAgreement: boolean;
  hasFounderVesting: boolean;
  boardMeetingsPerYear: number;
  hasDataRoom: boolean;
  dataRoomPct: number;
  hasInvestorNDA: boolean;
  hasIpAssignment: boolean;
}

export interface EsopScoringResult {
  /** CGH sub-score 0-100 */
  score: number;
  /** SVI delta from this dimension */
  sviContribution: number;
  /** Valuation adjustment factor (e.g. 1.05 = +5%) */
  valuationMultiplier: number;
  issues: EsopIssue[];
  actions: EsopAction[];
}

export interface EsopIssue {
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  impact: string;
  sviPenalty: number;
}

export interface EsopAction {
  priority: 1 | 2 | 3;
  action: string;
  sviBenefit: number;
  effort: "low" | "medium" | "high";
  cost: string;
  deadline?: string;
}

// AU ESOP Best Practice Benchmarks
const ESOP_BENCHMARKS = {
  poolPct: { min: 10, standard: 12, max: 20 },
  vestingMonths: 48,
  cliffMonths: 12,
  strikePriceCents: 10, // A$0.10 FMV
};

export function scoreEsop(governance: GovernanceHealth): EsopScoringResult {
  const issues: EsopIssue[] = [];
  const actions: EsopAction[] = [];
  let score = 0;
  let valuationAdj = 0;

  const { esop } = governance;

  // ── ESOP Pool ────────────────────────────────────────────────
  if (!esop || !esop.poolCreated) {
    score += 0;
    valuationAdj -= 0.05;
    issues.push({
      severity: "critical",
      description: "No ESOP pool exists",
      impact: "Major investor red flag at pre-seed/seed. Blocks ability to hire with equity.",
      sviPenalty: -12,
    });
    actions.push({
      priority: 1,
      action: "Create 12% ESOP pool (12,000 shares of 100,000 total)",
      sviBenefit: 8,
      effort: "medium",
      cost: "A$2-5K (legal review + ASIC update)",
      deadline: "Before Antler pitch",
    });
  } else {
    score += 20;
    valuationAdj += 0.04;

    if (esop.poolPct < ESOP_BENCHMARKS.poolPct.min) {
      issues.push({
        severity: "medium",
        description: `ESOP pool ${esop.poolPct}% below 10% minimum`,
        impact: "Insufficient equity for key hires at Series A.",
        sviPenalty: -3,
      });
    } else if (esop.poolPct > ESOP_BENCHMARKS.poolPct.max) {
      issues.push({
        severity: "medium",
        description: `ESOP pool ${esop.poolPct}% above 20% threshold`,
        impact: "Excessive dilution — investor concern.",
        sviPenalty: -4,
      });
    } else {
      score += 10;
    }

    if (esop.grantsIssued) {
      score += 10;
      valuationAdj += 0.03;
    } else {
      actions.push({
        priority: 2,
        action: "Issue first ESOP grants to advisors/key hires",
        sviBenefit: 4,
        effort: "low",
        cost: "No monetary cost; requires legal template",
      });
    }

    if (!esop.legalDeedSigned) {
      issues.push({
        severity: "high",
        description: "ESOP Plan Deed not signed",
        impact: "Grants without deed are legally unenforceable. ATO compliance risk.",
        sviPenalty: -5,
      });
      actions.push({
        priority: 1,
        action: "Sign ESOP Plan Deed (use provided legal template)",
        sviBenefit: 5,
        effort: "medium",
        cost: "A$2-5K lawyer review",
        deadline: "Before any grants issued",
      });
    } else {
      score += 10;
    }

    if (esop.vestingMonths !== ESOP_BENCHMARKS.vestingMonths || esop.cliffMonths !== ESOP_BENCHMARKS.cliffMonths) {
      issues.push({
        severity: "low",
        description: `Non-standard vesting: ${esop.cliffMonths}mo cliff / ${esop.vestingMonths}mo total`,
        impact: "Investors prefer 4yr/1yr cliff standard.",
        sviPenalty: -2,
      });
    }
  }

  // ── Founder Vesting ──────────────────────────────────────────
  if (!governance.hasFounderVesting) {
    issues.push({
      severity: "high",
      description: "No founder vesting in place",
      impact: "Single-founder departure risk. Accelerators (Antler, Blackbird) require this.",
      sviPenalty: -6,
    });
    actions.push({
      priority: 1,
      action: "Sign Founder Vesting Confirmation Deed (retroactive from founding date)",
      sviBenefit: 4,
      effort: "low",
      cost: "A$500-1K legal",
      deadline: "Before Antler pitch",
    });
  } else {
    score += 15;
    valuationAdj += 0.02;
  }

  // ── Shareholders Agreement ───────────────────────────────────
  if (!governance.hasShareholdersAgreement) {
    issues.push({
      severity: "high",
      description: "No Shareholders Agreement",
      impact: "Required for any seed raise. Drag-along, tag-along, pre-emptive rights missing.",
      sviPenalty: -5,
    });
    actions.push({
      priority: 2,
      action: "Draft Shareholders Agreement (use SAFE or standard SHA template)",
      sviBenefit: 4,
      effort: "high",
      cost: "A$3-8K legal",
    });
  } else {
    score += 15;
    valuationAdj += 0.02;
  }

  // ── Data Room ────────────────────────────────────────────────
  if (!governance.hasDataRoom) {
    actions.push({
      priority: 2,
      action: "Create data room (13-section structure) in VirginDocs or Notion",
      sviBenefit: 3,
      effort: "medium",
      cost: "A$50-200/mo for platform",
    });
  } else {
    score += 10;
    if (governance.dataRoomPct >= 70) {
      score += 10;
      valuationAdj += 0.02;
    } else {
      issues.push({
        severity: "medium",
        description: `Data room only ${governance.dataRoomPct}% complete`,
        impact: "Investor due diligence will stall. Target 70% before pitch.",
        sviPenalty: -2,
      });
      actions.push({
        priority: 2,
        action: `Complete data room to 70% (currently ${governance.dataRoomPct}%)`,
        sviBenefit: 3,
        effort: "medium",
        cost: "Founder time only",
        deadline: "Before Antler pitch",
      });
    }
  }

  // ── IP Assignment ────────────────────────────────────────────
  if (!governance.hasIpAssignment) {
    issues.push({
      severity: "medium",
      description: "No IP assignment deed for employees/contractors",
      impact: "IP ownership unclear. Investor red flag at due diligence.",
      sviPenalty: -3,
    });
  } else {
    score += 10;
  }

  const clampedScore = Math.min(Math.max(score, 0), 100);
  const sviContribution = Math.round(clampedScore * 0.12); // CGH = 12% weight
  const valuationMultiplier = 1 + Math.max(-0.15, Math.min(0.12, valuationAdj));

  return {
    score: clampedScore,
    sviContribution,
    valuationMultiplier,
    issues: issues.sort((a, b) => {
      const sev = { critical: 0, high: 1, medium: 2, low: 3 };
      return sev[a.severity] - sev[b.severity];
    }),
    actions: actions.sort((a, b) => a.priority - b.priority),
  };
}

export function esopStatusFromCapTable(data: {
  totalPoolShares?: number;
  totalShares?: number;
  grantsCount?: number;
  hasLegalDeed?: boolean;
  vestingMonths?: number;
  cliffMonths?: number;
}): EsopStatus | null {
  if (!data.totalPoolShares) return null;
  const totalShares = data.totalShares ?? 100_000;
  return {
    poolCreated: true,
    poolPct: Math.round((data.totalPoolShares / totalShares) * 100),
    grantsIssued: (data.grantsCount ?? 0) > 0,
    grantCount: data.grantsCount ?? 0,
    founderVestingInPlace: true,
    legalDeedSigned: data.hasLegalDeed ?? false,
    strikePrice: 10,
    vestingMonths: data.vestingMonths ?? 48,
    cliffMonths: data.cliffMonths ?? 12,
  };
}
