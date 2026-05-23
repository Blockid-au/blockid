"use client";

import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";

export function DeepDiveUpsell() {
  return (
    <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-violet-50/40 shadow-sm p-5 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-8 w-8 rounded-lg bg-brand-100 flex items-center justify-center">
          <Sparkles strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
        </div>
        <h3 className="text-sm font-semibold text-ink-900">Deep Dive Report</h3>
      </div>

      <p className="text-xs text-ink-600 leading-relaxed mb-4 flex-1">
        Get a comprehensive 10-page analysis with competitor profiling, financial projections,
        market sizing, and a 90-day action plan tailored to your stage.
      </p>

      <ul className="space-y-1.5 mb-4">
        {[
          "Competitor landscape analysis",
          "Financial projections & unit economics",
          "90-day personalised action plan",
          "Investor-ready executive summary",
        ].map((item) => (
          <li key={item} className="flex items-start gap-2 text-[11px] text-ink-600">
            <span className="text-brand-500 shrink-0 mt-px">&#10003;</span>
            {item}
          </li>
        ))}
      </ul>

      <Link
        href="/"
        className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
      >
        Run Deep Dive
        <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
      </Link>
      <p className="text-center text-[10px] text-ink-400 mt-2">From 1.00 credit</p>
    </div>
  );
}
