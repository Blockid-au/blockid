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
  /** S18-B — viewer on a shared project: dashboard only, no entry form. */
  readOnly?: boolean;
}

export function MetricsClient({ metrics, stage, readOnly = false }: MetricsClientProps) {
  const router = useRouter();

  return (
    <div className="space-y-8">
      {/* Manual metric entry form (editor+) */}
      {!readOnly && <MetricsInput onSubmitted={() => router.refresh()} />}

      {/* Dashboard with cards, chart, and source status */}
      <MetricsDashboard metrics={metrics} stage={stage} />
    </div>
  );
}
