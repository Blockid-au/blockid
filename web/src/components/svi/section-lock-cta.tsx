"use client";
import Link from "next/link";

interface SectionLockCTAProps {
  sectionName: string;
  tier: "standard" | "premium";
  creditCost?: number;
}

export function SectionLockCTA({ sectionName, tier, creditCost = 5 }: SectionLockCTAProps) {
  const isStandard = tier === "standard";
  return (
    <div className="relative overflow-hidden rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-6 text-center my-4">
      <div className="text-3xl mb-2">{isStandard ? "🔑" : "⭐"}</div>
      <h3 className="font-semibold text-gray-900 mb-1">
        {isStandard ? `Unlock ${sectionName}` : `Premium: ${sectionName}`}
      </h3>
      <p className="text-sm text-gray-600 mb-4">
        {isStandard
          ? `This section is available on Standard plan. Costs ${creditCost} credits.`
          : "This advanced analysis is exclusive to Premium members."}
      </p>
      <div className="flex gap-2 justify-center">
        <Link
          href="/workspace/billing"
          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {isStandard ? `Unlock (${creditCost} credits)` : "Upgrade to Premium"}
        </Link>
        <Link
          href="/pricing"
          className="px-4 py-2 border border-amber-300 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-100 transition-colors"
        >
          View Plans
        </Link>
      </div>
    </div>
  );
}
