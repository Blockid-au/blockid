"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MetricsInput } from "@/components/workspace/metrics-input";
import {
  MetricsDashboard,
  type MetricRow,
} from "@/components/workspace/metrics-dashboard";

export type { MetricRow };

interface MetricsClientProps {
  metrics: MetricRow[];
  stage: string;
}

export function MetricsClient({ metrics, stage }: MetricsClientProps) {
  const router = useRouter();

  return (
    <div className="space-y-8">
      {/* Manual metric entry form */}
      <MetricsInput onSubmitted={() => router.refresh()} />

      {/* Dashboard with cards, chart, and source status */}
      <MetricsDashboard metrics={metrics} stage={stage} />
    </div>
  );
}
