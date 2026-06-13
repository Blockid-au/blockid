import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface CapTableInput {
  founderPct?: number;
  investorPct?: number;
  employeeOptionsPct?: number;
  hasVestingCliff?: boolean;
  optionPoolPct?: number;
  shareholderCount?: number;
}

interface HealthIssue {
  severity: "red" | "amber" | "green";
  code: string;
  message: string;
  recommendation: string;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CapTableInput;
  try {
    body = (await request.json()) as CapTableInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    founderPct = 0,
    investorPct = 0,
    employeeOptionsPct = 0,
    hasVestingCliff,
    optionPoolPct,
    shareholderCount,
  } = body;

  const issues: HealthIssue[] = [];
  let score = 100;

  // Founder dilution check
  if (founderPct < 40) {
    issues.push({
      severity: "red",
      code: "founder_dilution_high",
      message: `Founder ownership is ${founderPct.toFixed(1)}% — critically diluted`,
      recommendation: "Consider recapitalization or limiting future dilution to preserve founder control.",
    });
    score -= 30;
  } else if (founderPct <= 60) {
    issues.push({
      severity: "amber",
      code: "founder_dilution_moderate",
      message: `Founder ownership is ${founderPct.toFixed(1)}% — watch for further dilution`,
      recommendation: "Maintain founder control above 50% through Series A if possible.",
    });
    score -= 10;
  } else {
    issues.push({
      severity: "green",
      code: "founder_dilution_ok",
      message: `Founder ownership is ${founderPct.toFixed(1)}% — healthy`,
      recommendation: "Good founder control. Plan dilution carefully for future rounds.",
    });
  }

  // Vesting cliff check
  if (hasVestingCliff === false) {
    issues.push({
      severity: "amber",
      code: "no_vesting_cliff",
      message: "No vesting cliff detected",
      recommendation: "Add a 12-month vesting cliff to protect against early founder or employee departure.",
    });
    score -= 15;
  } else if (hasVestingCliff === true) {
    issues.push({
      severity: "green",
      code: "vesting_cliff_ok",
      message: "Vesting cliff in place",
      recommendation: "Ensure all founders and key employees are on cliff-based vesting schedules.",
    });
  }

  // Option pool size check
  const poolPct = optionPoolPct ?? employeeOptionsPct;
  if (poolPct < 10) {
    issues.push({
      severity: "amber",
      code: "option_pool_small",
      message: `Option pool is ${poolPct.toFixed(1)}% — below recommended 10%`,
      recommendation: "Increase ESOP to at least 10% before raising to attract key hires.",
    });
    score -= 15;
  } else {
    issues.push({
      severity: "green",
      code: "option_pool_ok",
      message: `Option pool is ${poolPct.toFixed(1)}% — adequate`,
      recommendation: "Monitor option usage and replenish the pool before it drops below 5%.",
    });
  }

  // ASIC shareholder reporting threshold
  if (shareholderCount != null && shareholderCount > 50) {
    issues.push({
      severity: "red",
      code: "asic_reporting_threshold",
      message: `${shareholderCount} shareholders exceeds the 50-shareholder ASIC reporting threshold`,
      recommendation: "Review ASIC reporting obligations for proprietary companies with >50 non-employee shareholders.",
    });
    score -= 20;
  } else if (shareholderCount != null && shareholderCount > 40) {
    issues.push({
      severity: "amber",
      code: "asic_approaching_threshold",
      message: `${shareholderCount} shareholders — approaching ASIC threshold of 50`,
      recommendation: "Plan your cap table carefully before onboarding additional shareholders.",
    });
    score -= 5;
  }

  // Percentages sum check
  const total = founderPct + investorPct + employeeOptionsPct;
  if (total > 100.5) {
    issues.push({
      severity: "red",
      code: "percentages_exceed_100",
      message: `Cap table sums to ${total.toFixed(1)}% — exceeds 100%`,
      recommendation: "Reconcile your cap table to ensure all ownership percentages sum to exactly 100%.",
    });
    score -= 25;
  }

  const clampedScore = Math.max(0, Math.min(100, score));
  const recommendations = issues
    .filter((i) => i.severity !== "green")
    .map((i) => i.recommendation);

  return NextResponse.json({
    score: clampedScore,
    issues,
    recommendations,
  });
}
