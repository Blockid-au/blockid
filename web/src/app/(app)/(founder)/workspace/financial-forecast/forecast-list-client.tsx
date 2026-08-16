"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Plus } from "lucide-react";

export interface ForecastListItem {
  id: string;
  name: string;
  scenario: "bear" | "base" | "bull";
  arrProjected12m: number;
  breakEvenMonth: number | null;
  runwayMonths: number | null;
  createdAt: string;
}

export function ForecastListClient() {
  const router = useRouter();
  const [forecasts, setForecasts] = useState<ForecastListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchForecasts = async () => {
      try {
        const res = await fetch("/api/financial/forecast");
        if (!res.ok) throw new Error("Failed to fetch forecasts");
        const data = await res.json();
        setForecasts(data.forecasts || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchForecasts();
  }, []);

  if (loading) return <div className="text-center py-12">Loading forecasts...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Financial Forecast</h1>
          <p className="text-gray-600 mt-1">Model your 3-year revenue growth with tax incentives</p>
        </div>
        <Button
          onClick={() => router.push("/workspace/financial-forecast/wizard")}
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

      {forecasts.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-gray-600 mb-4">No forecasts yet. Create your first one to get started.</p>
          <Button
            onClick={() => router.push("/workspace/financial-forecast/wizard")}
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
              onClick={() => router.push(`/workspace/financial-forecast/${forecast.id}`)}
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
