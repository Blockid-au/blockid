"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, TrendingUp, Clock, Target, Trash2 } from "lucide-react";
import type { ExitScenario } from "@/types/exit-strategy";

function formatAUD(value: number): string {
  if (value >= 1_000_000_000) return `A$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `A$${(value / 1_000_000).toFixed(1)}M`;
  return `A$${Math.round(value).toLocaleString()}`;
}

export function ExitStrategyListClient() {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<ExitScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/exit-strategy/scenarios")
      .then((r) => r.json())
      .then((body) => {
        if (body.ok) setScenarios(body.scenarios ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Delete this exit scenario?")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/exit-strategy/scenarios/${id}`, { method: "DELETE" });
      if (res.ok) setScenarios((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  const exitTypeLabel = (type: string) =>
    ({ acquisition: "Acquisition", ipo: "IPO", other: "Other" })[type] ?? type;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Exit Strategy</h1>
          <p className="text-gray-600 mt-1">Model funding paths, dilution, and founder payouts.</p>
        </div>
        <Button onClick={() => router.push("/workspace/exit-strategy/new")}>
          <Plus className="h-4 w-4 mr-2" />
          New Scenario
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : scenarios.length === 0 ? (
        <Card className="p-12 text-center">
          <TrendingUp className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-700 mb-2">No exit scenarios yet</h2>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Create your first exit scenario to model Series A/B funding, dilution waterfalls,
            founder payouts, and AU acquirer benchmarks.
          </p>
          <Button onClick={() => router.push("/workspace/exit-strategy/new")}>
            <Plus className="h-4 w-4 mr-2" />
            Create Exit Scenario
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {scenarios.map((scenario) => (
            <Card
              key={scenario.id}
              className="p-5 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => router.push(`/workspace/exit-strategy/${scenario.id}`)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{scenario.scenario_name}</h3>
                    {scenario.is_primary && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                        Primary
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Target className="h-3.5 w-3.5" />
                      {formatAUD(scenario.target_exit_valuation_aud)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {scenario.exit_timeline_years}yr timeline
                    </span>
                    <span className="capitalize">{exitTypeLabel(scenario.exit_type)}</span>
                  </div>
                  {(scenario.series_a_planned || scenario.series_b_planned) && (
                    <div className="flex gap-2 mt-2">
                      {scenario.series_a_planned && (
                        <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-md">
                          Series A planned
                        </span>
                      )}
                      {scenario.series_b_planned && (
                        <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-md">
                          Series B planned
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(scenario.id);
                  }}
                  disabled={deleting === scenario.id}
                  className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 disabled:opacity-50"
                  aria-label="Delete scenario"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
