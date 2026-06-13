import Link from "next/link";
import { ArrowRight, Check, Lock } from "lucide-react";

export default function ReportUpgradePage({
  searchParams,
}: {
  searchParams: { section?: string };
}) {
  const section = searchParams.section ?? "full analysis";

  const standardFeatures = [
    "Position Analysis — Index rank + stage",
    "Value Assessment — Valuation drivers",
    "Direction Plan — Top 3 next actions",
    "Capital Readiness — Funding score",
    "Risk Assessment",
    "All SCN report sections",
  ];

  const premiumFeatures = [
    ...standardFeatures,
    "Competitive Intelligence",
    "Board Summary",
    "AU Market Analysis",
    "Unlimited reports",
    "Priority generation queue",
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-800 px-4 py-2 rounded-full text-sm font-medium mb-4">
            <Lock className="w-4 h-4" />
            Unlock {section}
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            Unlock Your Full Startup Analysis
          </h1>
          <p className="text-gray-600 max-w-xl mx-auto">
            Your free preview shows the Hook + Validation layers. Upgrade to see
            Position, Value, Direction, and Capital — the insights that matter for funding.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Standard */}
          <div className="bg-white rounded-2xl border-2 border-amber-400 p-6 shadow-sm">
            <div className="text-amber-500 font-semibold text-sm uppercase tracking-wide mb-1">Most Popular</div>
            <h2 className="text-xl font-bold mb-1">Standard Report</h2>
            <div className="text-3xl font-bold text-gray-900 mb-1">
              5 <span className="text-lg font-normal text-gray-500">credits</span>
            </div>
            <p className="text-sm text-gray-500 mb-4">or $29 AUD one-time</p>
            <ul className="space-y-2 mb-6">
              {standardFeatures.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                  <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/workspace/billing"
              className="block w-full text-center py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-semibold transition-colors"
            >
              Unlock Standard <ArrowRight className="inline w-4 h-4 ml-1" />
            </Link>
          </div>

          {/* Premium */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
            <div className="text-purple-500 font-semibold text-sm uppercase tracking-wide mb-1">Full Access</div>
            <h2 className="text-xl font-bold mb-1">Premium</h2>
            <div className="text-3xl font-bold text-gray-900 mb-1">
              10 <span className="text-lg font-normal text-gray-500">credits</span>
            </div>
            <p className="text-sm text-gray-500 mb-4">or $79 AUD/month unlimited</p>
            <ul className="space-y-2 mb-6">
              {premiumFeatures.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                  <Check className="w-4 h-4 text-purple-500 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/pricing"
              className="block w-full text-center py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition-colors"
            >
              Go Premium <ArrowRight className="inline w-4 h-4 ml-1" />
            </Link>
          </div>
        </div>

        <div className="text-center mt-8">
          <Link href="/workspace/reports" className="text-sm text-gray-500 hover:text-gray-700">
            ← Back to reports
          </Link>
        </div>
      </div>
    </div>
  );
}
