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

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // ── 1. Authenticate ──────────────────────────────────────────────────
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

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
  });
}
