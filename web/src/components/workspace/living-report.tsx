"use client";

import * as React from "react";
import { RefreshCw, TrendingUp, FileText } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";

interface LivingReportProps {
  email: string;
}

export function LivingReport({ email }: LivingReportProps) {
  const [report, setReport] = React.useState<{
    slug: string;
    totalSvi: number;
    inputType: string;
    createdAt: string;
    tier: string;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch(`/api/svi/latest?email=${encodeURIComponent(email)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.analysis) setReport(d.analysis);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [email]);

  if (loading) return <div className="animate-pulse h-32 bg-surface-100 rounded-2xl" />;
  if (!report) return null;

  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100">
          <FileText className="h-5 w-5 text-brand-600" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-ink-800">Your Living Report</h3>
          <p className="text-xs text-ink-500">Auto-updates as you add evidence and complete actions</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="rounded-xl bg-surface-50 p-3 text-center">
          <span className="block text-2xl font-bold text-brand-600">{report.totalSvi}</span>
          <span className="text-xs text-ink-500">SVI Score</span>
        </div>
        <div className="rounded-xl bg-surface-50 p-3 text-center">
          <span className="block text-2xl font-bold text-ink-800">
            {report.tier === "deep_dive" ? "Deep" : "Standard"}
          </span>
          <span className="text-xs text-ink-500">Report Tier</span>
        </div>
        <div className="rounded-xl bg-surface-50 p-3 text-center">
          <span className="block text-2xl font-bold text-ink-800">
            {new Date(report.createdAt).toLocaleDateString("en-AU", {
              day: "numeric",
              month: "short",
            })}
          </span>
          <span className="text-xs text-ink-500">Last Updated</span>
        </div>
      </div>

      <div className="flex gap-3">
        <Link href={`/s/${report.slug}`} className="flex-1">
          <Button variant="secondary" size="sm" className="w-full">
            <FileText className="h-4 w-4 mr-1" /> View Report
          </Button>
        </Link>
        <Button
          variant="primary"
          size="sm"
          className="flex-1"
          onClick={() => {
            trackEvent("rnd_reanalyze", { slug: report.slug });
            window.location.href = `/?reanalyze=${report.slug}`;
          }}
        >
          <RefreshCw className="h-4 w-4 mr-1" /> Re-analyze
        </Button>
      </div>

      <p className="mt-3 text-xs text-ink-400 flex items-center gap-1">
        <TrendingUp className="h-3 w-3" />
        Add evidence to improve your score and unlock deeper insights
      </p>
    </div>
  );
}
