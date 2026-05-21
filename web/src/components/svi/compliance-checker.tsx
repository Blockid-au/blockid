"use client";

import Link from "next/link";
import { CheckCircle2, AlertTriangle, XCircle, HelpCircle, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { checkCompliance, complianceScore, type ComplianceItem } from "@/lib/compliance-checker";
import type { SVIAnalysis } from "@/lib/svi-analysis";

const STATUS_ICONS = {
  pass: CheckCircle2,
  warning: AlertTriangle,
  fail: XCircle,
  unknown: HelpCircle,
};

const STATUS_COLORS = {
  pass: "text-emerald-600",
  warning: "text-amber-600",
  fail: "text-red-600",
  unknown: "text-ink-400",
};

const CATEGORY_LABELS: Record<string, string> = {
  corporate: "Corporate & Structure",
  tax: "Tax & Incentives",
  investor: "Investor Readiness",
  employment: "Team & Employment",
  ip: "IP & Legal",
};

export function ComplianceChecker({ analysis, className }: { analysis: SVIAnalysis; className?: string }) {
  const items = checkCompliance(analysis);
  const score = complianceScore(items);
  const categories = [...new Set(items.map(i => i.category))];

  return (
    <div className={cn("rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden", className)}>
      <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-ink-900">Compliance Checker</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("text-lg font-bold", score >= 70 ? "text-emerald-600" : score >= 40 ? "text-amber-600" : "text-red-600")}>
            {score}%
          </span>
          <span className="text-xs text-ink-500">compliant</span>
        </div>
      </div>

      <div className="divide-y divide-surface-100">
        {categories.map(cat => (
          <div key={cat} className="px-5 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-400 mb-2">{CATEGORY_LABELS[cat] ?? cat}</p>
            <div className="space-y-2">
              {items.filter(i => i.category === cat).map(item => {
                const Icon = STATUS_ICONS[item.status];
                return (
                  <div key={item.id} className="flex items-start gap-2.5">
                    <Icon strokeWidth={1.75} className={cn("h-4 w-4 mt-0.5 shrink-0", STATUS_COLORS[item.status])} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-ink-800">{item.title}</span>
                        {item.regulation && <span className="text-[9px] text-ink-400">{item.regulation}</span>}
                      </div>
                      {item.action && (
                        <p className="text-xs text-ink-500 mt-0.5">{item.action}</p>
                      )}
                      {item.link && item.status !== "pass" && (
                        <Link href={item.link} className="text-[11px] text-brand-600 hover:text-brand-700 font-medium mt-0.5 inline-block">
                          Fix this →
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
