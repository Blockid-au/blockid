// GET /api/svi/report-estimate
//
// Cost preview endpoint — shows credit cost BEFORE the user commits to generating.
// Supports individual section estimates and bundle (unlock-all) estimates.
//
// Usage:
//   GET /api/svi/report-estimate?sections=market,product,traction
//   GET /api/svi/report-estimate?bundle=all
//   GET /api/svi/report-estimate?bundle=all&unlocked=executive,founder_team
//
// Returns: { sections, totalCredits, totalWords, bundleDiscount? }

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  REPORT_SECTIONS,
  getSection,
  getUnlockAllCost,
  estimateSections,
  getSectionsByTier,
} from "@/lib/report-sections";
import {
  agentsPlannedFor,
  selectAgentsForContext,
} from "@/lib/report-pipeline/agent-selector";
import { FEATURE_COSTS } from "@/lib/credits";
import type { IntakeContext } from "@/lib/intake/detect-context";
import type { AgentRole } from "@/lib/report-pipeline/types";
import { getProjectScope, creditChargeNote, type ProjectRole } from "@/lib/projects";

export const dynamic = "force-dynamic";

// S17-A — transparent pricing on shared projects: every estimate carries
// `creditNote` ("Charged to your own credits — not the project owner's."
// for a member) and the caller's `role`, so the UI can show who pays
// BEFORE the report runs. Credits are per user; the wallet queried is
// always the caller's.
async function callerProjectContext(): Promise<{ creditNote: string; role: ProjectRole }> {
  try {
    const scope = await getProjectScope();
    return { creditNote: creditChargeNote(scope), role: scope?.role ?? "owner" };
  } catch {
    return { creditNote: creditChargeNote(null), role: "owner" };
  }
}

// Per-agent cost estimate — maps each agent to its representative FEATURE_COSTS
// entry. Keeps a floor of 0.5 so no agent ever contributes 0 to the total.
const AGENT_COST_KEY: Record<AgentRole, string> = {
  ceo: "report_section_executive",
  cto: "report_section_product",
  cfo: "report_section_financial",
  cpo: "report_section_product",
  cmo: "report_section_market",
  cro: "report_section_gtm",
  clo: "report_section_legal",
  chro: "report_section_founder_team",
  ciso: "report_section_risk",
  cdo: "report_section_cap_table",
  coo: "report_section_gtm",
};

function costForAgent(agent: AgentRole): number {
  const key = AGENT_COST_KEY[agent];
  const cost = key ? FEATURE_COSTS[key] : undefined;
  return typeof cost === "number" && cost > 0 ? cost : 0.5;
}

/**
 * Cost of the "full teardown" — every agent running against every criterion.
 * Used to compute savings vs the phase-tuned selection.
 */
function fullTeardownCost(): number {
  const allAgents: AgentRole[] = ["ceo", "cto", "cfo", "cpo", "cmo", "cro", "clo", "chro", "ciso", "cdo", "coo"];
  return allAgents.reduce((sum, a) => sum + costForAgent(a) * 2, 0);
}

export async function GET(request: Request) {
  // ── 1. Authenticate ──────────────────────────────────────────────────
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  const { creditNote, role } = await callerProjectContext();
  const url = new URL(request.url);
  const bundle = url.searchParams.get("bundle");
  const sectionsParam = url.searchParams.get("sections");
  const unlockedParam = url.searchParams.get("unlocked");

  // ── 2. Bundle estimate ───────────────────────────────────────────────
  if (bundle === "all") {
    const alreadyUnlocked = unlockedParam
      ? unlockedParam.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const bundleCost = getUnlockAllCost(alreadyUnlocked);

    // Also include the full section list for display
    const allSections = REPORT_SECTIONS.map((s) => ({
      id: s.id,
      title: s.title,
      subtitle: s.subtitle,
      tier: s.tier,
      creditCost: s.creditCost,
      estWords: s.fullWords,
      icon: s.icon,
      isUnlocked: alreadyUnlocked.includes(s.id) || s.creditCost === 0,
    }));

    const { getBalance } = await import("@/lib/credits");
    const balance = await getBalance(user.id);

    return NextResponse.json({
      ok: true,
      bundle: true,
      sections: bundleCost.sections,
      allSections,
      totalCredits: bundleCost.total,
      discounted: bundleCost.discounted,
      savings: bundleCost.savings,
      savingsPercent: 30,
      canAfford: balance >= bundleCost.discounted,
      balance,
      creditNote,
      role,
    });
  }

  // ── 3. Individual section estimate ───────────────────────────────────
  if (sectionsParam) {
    const sectionIds = sectionsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // Validate all section IDs
    const invalid = sectionIds.filter((id) => !getSection(id));
    if (invalid.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: `Unknown section(s): ${invalid.join(", ")}. Valid: ${REPORT_SECTIONS.map((s) => s.id).join(", ")}`,
        },
        { status: 400 },
      );
    }

    const estimate = estimateSections(sectionIds);

    const { getBalance } = await import("@/lib/credits");
    const balance = await getBalance(user.id);

    return NextResponse.json({
      ok: true,
      bundle: false,
      sections: estimate.sections,
      totalCredits: estimate.totalCredits,
      totalWords: estimate.totalWords,
      canAfford: balance >= estimate.totalCredits,
      balance,
      creditNote,
      role,
    });
  }

  // ── 4. No params — return full catalog ───────────────────────────────
  const byTier = getSectionsByTier();
  const catalog = REPORT_SECTIONS.map((s) => ({
    id: s.id,
    title: s.title,
    subtitle: s.subtitle,
    tier: s.tier,
    creditCost: s.creditCost,
    summaryWords: s.summaryWords,
    fullWords: s.fullWords,
    icon: s.icon,
  }));

  const totalCostAllPaid = REPORT_SECTIONS
    .filter((s) => s.creditCost > 0)
    .reduce((sum, s) => sum + s.creditCost, 0);

  const { getBalance } = await import("@/lib/credits");
  const balance = await getBalance(user.id);

  return NextResponse.json({
    ok: true,
    catalog,
    tiers: {
      free: byTier.free.length,
      included: byTier.included.length,
      paid: byTier.paid.length,
      premium: byTier.premium.length,
    },
    totalSections: REPORT_SECTIONS.length,
    totalCostAllPaid,
    bundleDiscounted: Math.round(totalCostAllPaid * 0.70 * 100) / 100,
    balance,
    creditNote,
    role,
  });
}

// ── Context-aware POST estimate ─────────────────────────────────────────────
//
// POST /api/svi/report-estimate
// Body: { context: IntakeContext }
// Returns: { agentsPlanned, waves, totalCredits, fullTeardownCost,
//            savingsVsFullTeardown, canAfford, balance }

interface PostBody {
  context?: IntakeContext;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { creditNote, role } = await callerProjectContext();
  const ctx = body.context;
  if (!ctx || typeof ctx !== "object") {
    return NextResponse.json({ ok: false, error: "context is required" }, { status: 400 });
  }

  const waves = selectAgentsForContext(ctx);
  const agentsPlanned = agentsPlannedFor(ctx);
  const totalCredits = Math.round(
    agentsPlanned.reduce((sum, a) => sum + costForAgent(a), 0) * 100,
  ) / 100;

  const fullCost = Math.round(fullTeardownCost() * 100) / 100;
  const savings = Math.max(0, Math.round((fullCost - totalCredits) * 100) / 100);

  const { getBalance } = await import("@/lib/credits");
  const balance = await getBalance(user.id);

  return NextResponse.json({
    ok: true,
    context: ctx,
    waves: waves.map((wave, i) => ({
      wave: i + 1,
      tasks: wave.map(t => ({ agentRole: t.agentRole, criterion: t.criterion, cost: costForAgent(t.agentRole) })),
      taskCount: wave.length,
    })),
    agentsPlanned,
    totalCredits,
    fullTeardownCost: fullCost,
    savingsVsFullTeardown: savings,
    canAfford: balance >= totalCredits,
    balance,
    creditNote,
    role,
  });
}
