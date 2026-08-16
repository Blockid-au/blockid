"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, ArrowLeft, Bookmark, BookmarkCheck } from "lucide-react";
import type { ProjectionOutput } from "@/types/financial";

interface ForecastData {
  id: string;
  name: string;
  scenario: "bear" | "base" | "bull";
  projectionData: ProjectionOutput;
  createdAt: string;
  projectId?: string;
  useForInvestorPack?: boolean;
}

interface ForecastResultsClientProps {
  modelId: string;
}

export function ForecastResultsClient({ modelId }: ForecastResultsClientProps) {
  const router = useRouter();
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [pinMessage, setPinMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchForecast = async () => {
      try {
        const res = await fetch(`/api/financial/forecast/${modelId}/fetch`);
        if (!res.ok) throw new Error("Failed to fetch forecast");
        const data = await res.json();
        // Compat: server returns `{ ok, model }`; older client expected `forecast`.
        const src = data.forecast ?? data.model;
        if (src) {
          setForecast({
            id: src.id,
            name: src.name,
            scenario: src.scenario,
            projectionData: src.projectionData ?? src.projection_data,
            createdAt: src.createdAt ?? src.created_at,
            projectId: src.projectId ?? src.project_id,
            useForInvestorPack:
              src.useForInvestorPack ?? src.use_for_investor_pack ?? false,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchForecast();
  }, [modelId]);

  // v3.7.1 — Pin / unpin this forecast for the investor pack.
  const handleTogglePack = async () => {
    if (!forecast?.projectId) {
      setPinMessage("Missing project context — reload the page.");
      return;
    }
    try {
      setPinning(true);
      setPinMessage(null);
      const next = !forecast.useForInvestorPack;
      const res = await fetch(`/api/financial/forecast/${forecast.projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: forecast.id,
          useForInvestorPack: next,
        }),
      });
      if (!res.ok) throw new Error("Failed to update investor pack pin");
      setForecast((prev) => (prev ? { ...prev, useForInvestorPack: next } : prev));
      setPinMessage(next ? "Added to investor pack" : "Removed from investor pack");
    } catch (err) {
      setPinMessage(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setPinning(false);
      setTimeout(() => setPinMessage(null), 3500);
    }
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const res = await fetch(`/api/financial/forecast/${modelId}/export`);
      if (!res.ok) throw new Error("Export failed");

      // Trigger CSV download
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${forecast?.name || "forecast"}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const formatCurrency = (value: number) => `A$${Math.round(value).toLocaleString()}`;

  if (loading) return <div className="text-center py-12">Loading forecast...</div>;
  if (error) return <div className="text-red-600 p-4 bg-red-50 rounded">{error}</div>;
  if (!forecast) return <div className="text-center py-12">Forecast not found</div>;

  const { projectionData } = forecast;
  const summary = projectionData.summary;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{forecast.name}</h1>
              <p className="text-gray-600 mt-1">
                Scenario: <span className="font-medium capitalize">{forecast.scenario}</span> | Created:{" "}
                {new Date(forecast.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={forecast.useForInvestorPack ? "default" : "outline"}
            onClick={handleTogglePack}
            disabled={pinning}
            className="gap-2"
          >
            {forecast.useForInvestorPack ? (
              <BookmarkCheck className="w-4 h-4" />
            ) : (
              <Bookmark className="w-4 h-4" />
            )}
            {pinning
              ? "Saving..."
              : forecast.useForInvestorPack
                ? "Remove from Investor Pack"
                : "Add to Investor Pack"}
          </Button>
          <Button onClick={handleExport} disabled={exporting} className="gap-2">
            <Download className="w-4 h-4" />
            {exporting ? "Exporting..." : "Export CSV"}
          </Button>
        </div>
      </div>
      {pinMessage && (
        <div
          role="status"
          className="rounded-md bg-blue-50 text-blue-800 text-sm px-3 py-2 border border-blue-100"
        >
          {pinMessage}
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-gray-600">Year 1 Revenue</p>
          <p className="text-2xl font-bold text-blue-600 mt-2">
            {formatCurrency(summary.revenueYear1 || 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-600">Year 3 Revenue</p>
          <p className="text-2xl font-bold text-blue-600 mt-2">
            {formatCurrency(summary.revenueYear3 || 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-600">Breakeven Month</p>
          <p className="text-2xl font-bold text-green-600 mt-2">
            {summary.monthBreakeven ? `Month ${summary.monthBreakeven}` : "Not reached"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-gray-600">Runway (Months)</p>
          <p className="text-2xl font-bold text-orange-600 mt-2">
            {summary.runwayMonths || "—"}
          </p>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="projection" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="projection">36-Month Projection</TabsTrigger>
          <TabsTrigger value="yearly">Yearly Summary</TabsTrigger>
          <TabsTrigger value="scenarios">Metrics</TabsTrigger>
        </TabsList>

        <TabsContent value="projection" className="space-y-4">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Month</th>
                    <th className="px-4 py-3 text-right font-semibold">Revenue</th>
                    <th className="px-4 py-3 text-right font-semibold">COGS</th>
                    <th className="px-4 py-3 text-right font-semibold">Gross Margin</th>
                    <th className="px-4 py-3 text-right font-semibold">OpEx</th>
                    <th className="px-4 py-3 text-right font-semibold">EBITDA</th>
                    <th className="px-4 py-3 text-right font-semibold">Cumulative Cash</th>
                  </tr>
                </thead>
                <tbody>
                  {projectionData.months.map((month, idx) => (
                    <tr key={idx} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{month.month}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(month.revenueAud)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(month.cogsAud)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(month.grossMarginAud)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(month.opexAud)}</td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${
                          month.ebitdaAud >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {formatCurrency(month.ebitdaAud)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${
                          month.cumCashAud >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {formatCurrency(month.cumCashAud)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="yearly" className="space-y-4">
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Year</th>
                  <th className="px-4 py-3 text-right font-semibold">Total Revenue</th>
                  <th className="px-4 py-3 text-right font-semibold">Avg Month Revenue</th>
                  <th className="px-4 py-3 text-right font-semibold">Total EBITDA</th>
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3].map((year) => {
                  const yearStart = (year - 1) * 12;
                  const yearEnd = year * 12;
                  const yearMonths = projectionData.months.slice(yearStart, yearEnd);
                  const totalRev = yearMonths.reduce((sum, m) => sum + m.revenueAud, 0);
                  const totalEbitda = yearMonths.reduce((sum, m) => sum + m.ebitdaAud, 0);
                  const avgRev = totalRev / 12;

                  return (
                    <tr key={year} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">Year {year}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(totalRev)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(avgRev)}</td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${
                          totalEbitda >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {formatCurrency(totalEbitda)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="scenarios" className="space-y-4">
          <Card className="p-6">
            <h3 className="font-semibold text-lg mb-4">Key Assumptions</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Starting ARR:</span>
                <p className="font-medium">{formatCurrency(projectionData.input.currentArrAud)}</p>
              </div>
              <div>
                <span className="text-gray-600">Monthly Growth:</span>
                <p className="font-medium">{projectionData.input.monthlyGrowthPct}% MoM</p>
              </div>
              <div>
                <span className="text-gray-600">Monthly Churn:</span>
                <p className="font-medium">{projectionData.input.churnPct}% MoM</p>
              </div>
              <div>
                <span className="text-gray-600">COGS %:</span>
                <p className="font-medium">{projectionData.input.cogsPercent}%</p>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg text-sm text-blue-800">
        <p>
          <strong>Disclaimer:</strong> This forecast is based on your inputs and assumptions. Actual results may
          differ materially. Consult with financial advisors before making business decisions.
        </p>
      </div>
    </div>
  );
}
