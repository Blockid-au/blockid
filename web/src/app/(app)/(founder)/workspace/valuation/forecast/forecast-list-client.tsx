"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { userErrorMessage } from "@/lib/ui/user-error";
import type { ListForecastsResponse } from "@/types/financial";

export interface ForecastListItem {
  id: string;
  name: string;
  scenario: "bear" | "base" | "bull";
  arrProjected12m: number;
  breakEvenMonth: number | null;
  runwayMonths: number | null;
  createdAt: string;
}

/** `financial_models` row (the list route's `models[]`) → the card shape. Exported for the test. */
export function toForecastListItems(models: ListForecastsResponse["models"]): ForecastListItem[] {
  return (models ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    scenario: m.scenario,
    arrProjected12m: m.arr_month_12_aud ?? 0,
    breakEvenMonth: m.month_breakeven ?? null,
    runwayMonths: m.runway_months ?? null,
    createdAt: m.created_at,
  }));
}

export function ForecastListClient({ projectId }: { projectId: string | null }) {
  const router = useRouter();
  const [forecasts, setForecasts] = useState<ForecastListItem[]>([]);
  // No project → nothing to fetch: first paint is the empty state (G20-sweep).
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    const fetchForecasts = async () => {
      try {
        // The list route is GET /api/financial/forecast/[projectId] (the
        // bare /api/financial/forecast never existed — G20-sweep 404).
        const res = await fetch(`/api/financial/forecast/${encodeURIComponent(projectId)}`, { credentials: "same-origin" });
        if (!res.ok) throw new Error("Failed to fetch forecasts");
        const data = (await res.json()) as ListForecastsResponse;
        if (!cancelled) setForecasts(toForecastListItems(data.models));
      } catch (err) {
        if (!cancelled) setError(userErrorMessage(err, "Something went wrong. Please try again."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchForecasts();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // The header (the page's h1) renders on the first paint; only the list
  // body waits for the fetch.

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Financial Forecast</h1>
          <p className="text-gray-600 mt-1">Model your 3-year revenue growth with tax incentives</p>
        </div>
        <Button
          onClick={() => router.push("/workspace/valuation/forecast/wizard")}
          size="lg"
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          New Forecast
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">
          Error: {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12" role="status" aria-live="polite">Loading forecasts...</div>
      ) : forecasts.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-gray-600 mb-4">No forecasts yet. Create your first one to get started.</p>
          <Button
            onClick={() => router.push("/workspace/valuation/forecast/wizard")}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Forecast
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {forecasts.map((forecast) => (
            <Card
              key={forecast.id}
              className="p-4 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => router.push(`/workspace/valuation/forecast/${forecast.id}`)}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{forecast.name}</h3>
                  <p className="text-sm text-gray-600">
                    Scenario: <span className="font-medium capitalize">{forecast.scenario}</span>
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-blue-600">
                    A${forecast.arrProjected12m?.toLocaleString() || "—"}
                  </div>
                  <p className="text-xs text-gray-500">12M projected ARR</p>
                </div>
              </div>
              <div className="mt-4 flex gap-6 text-sm">
                {forecast.breakEvenMonth && (
                  <div>
                    <span className="text-gray-600">Breakeven: </span>
                    <span className="font-medium">Month {forecast.breakEvenMonth}</span>
                  </div>
                )}
                {forecast.runwayMonths && (
                  <div>
                    <span className="text-gray-600">Runway: </span>
                    <span className="font-medium">{forecast.runwayMonths} months</span>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
