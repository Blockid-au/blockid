"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Target, Clock, TrendingUp, Users, AlertTriangle, CheckCircle2, Bookmark, BookmarkCheck } from "lucide-react";
import type { FetchExitScenarioResponse } from "@/types/exit-strategy";

function formatAUD(value: number): string {
  if (value >= 1_000_000_000) return `A$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `A$${(value / 1_000_000).toFixed(1)}M`;
  return `A$${Math.round(value).toLocaleString()}`;
}

function ReadinessBadge({ band }: { band: string }) {
  const config = {
    exceptional: { label: "Exceptional", cls: "bg-green-100 text-green-800 border-green-200" },
    ready: { label: "Exit Ready", cls: "bg-blue-100 text-blue-800 border-blue-200" },
    developing: { label: "Developing", cls: "bg-yellow-100 text-yellow-800 border-yellow-200" },
    not_ready: { label: "Not Ready", cls: "bg-red-100 text-red-800 border-red-200" },
  }[band] ?? { label: band, cls: "bg-gray-100 text-gray-800 border-gray-200" };

  return (
    <span className={`text-sm font-medium px-3 py-1 rounded-full border ${config.cls}`}>
      {config.label}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 75 ? "bg-green-500" : score >= 55 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-medium w-8 text-right">{score}</span>
    </div>
  );
}

export function ExitStrategyResultsClient({ scenarioId }: { scenarioId: string }) {
  const router = useRouter();
  const [data, setData] = useState<FetchExitScenarioResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pinning, setPinning] = useState(false);
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    fetch(`/api/exit-strategy/scenarios/${scenarioId}`)
      .then((r) => r.json())
      .then((body: FetchExitScenarioResponse) => {
        if (body.ok) {
          setData(body);
          setPinned(!!body.scenario?.use_for_investor_pack);
        } else setError(body.error ?? "Failed to load scenario");
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, [scenarioId]);

  // v3.7.1 — Pin / unpin this exit scenario for the investor pack.
  const handleTogglePack = async () => {
    try {
      setPinning(true);
      setPinMessage(null);
      const next = !pinned;
      const res = await fetch(`/api/exit-strategy/scenarios/${scenarioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ use_for_investor_pack: next }),
      });
      if (!res.ok) throw new Error("Failed to update investor pack pin");
      setPinned(next);
      setPinMessage(next ? "Added to investor pack" : "Removed from investor pack");
    } catch (err) {
      setPinMessage(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setPinning(false);
      setTimeout(() => setPinMessage(null), 3500);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (error || !data?.scenario) {
    return (
      <div className="text-center py-16">
        <p className="text-red-600 mb-4">{error ?? "Scenario not found"}</p>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>
    );
  }

  const { scenario, acquirers, readiness } = data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => router.push("/workspace/exit-strategy")}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3"
          >
            <ArrowLeft className="h-4 w-4" />
            All Scenarios
          </button>
          <h1 className="text-2xl font-bold">{scenario.scenario_name}</h1>
          <div className="flex items-center gap-4 mt-2 text-gray-600">
            <span className="flex items-center gap-1 text-sm">
              <Target className="h-4 w-4" />
              {formatAUD(scenario.target_exit_valuation_aud)}
            </span>
            <span className="flex items-center gap-1 text-sm">
              <Clock className="h-4 w-4" />
              {scenario.exit_timeline_years}-year timeline
            </span>
            <span className="capitalize text-sm font-medium">{scenario.exit_type}</span>
          </div>
        </div>
        {readiness && <ReadinessBadge band={readiness.readiness_band} />}
      </div>

      {/* Exit Readiness */}
      {readiness && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              Exit Readiness Score
            </h2>
            <div className="text-3xl font-bold text-blue-600">{readiness.overall_readiness_score}</div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Product Maturity", score: readiness.product_maturity_score },
              { label: "Revenue Scale", score: readiness.revenue_scale_score },
              { label: "Team Stability", score: readiness.team_stability_score },
              { label: "Market Fit", score: readiness.market_fit_score },
            ].map(({ label, score }) => (
              <div key={label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{label}</span>
                </div>
                <ScoreBar score={score} />
              </div>
            ))}
          </div>

          {readiness.critical_gaps.length > 0 && (
            <div className="mt-5 pt-5 border-t">
              <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                Critical Gaps to Address
              </p>
              <ul className="space-y-1">
                {readiness.critical_gaps.map((gap, i) => (
                  <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                    <span className="mt-0.5 text-red-400">•</span>
                    {gap}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* Funding Path */}
      {(scenario.series_a_planned || scenario.series_b_planned) && (
        <Card className="p-6">
          <h2 className="font-semibold text-lg mb-5 flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-500" />
            Funding Path
          </h2>
          <div className="flex items-stretch gap-0">
            {/* Seed */}
            <div className="flex-1 p-4 bg-gray-50 rounded-l-lg border border-gray-200">
              <div className="text-xs text-gray-500 font-medium mb-1">SEED</div>
              <div className="text-sm font-semibold">Current</div>
              <div className="text-xs text-gray-500 mt-1">Year 0</div>
            </div>
            {/* Series A */}
            {scenario.series_a_planned && (
              <>
                <div className="flex items-center px-2 text-gray-300">→</div>
                <div className="flex-1 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-xs text-blue-600 font-medium mb-1">SERIES A</div>
                  <div className="text-sm font-semibold">
                    {scenario.series_a_target_raise_aud
                      ? formatAUD(scenario.series_a_target_raise_aud)
                      : "–"}
                  </div>
                  {scenario.series_a_target_valuation_aud && (
                    <div className="text-xs text-blue-500 mt-1">
                      {formatAUD(scenario.series_a_target_valuation_aud)} pre-money
                    </div>
                  )}
                  <div className="text-xs text-gray-500">
                    Year {scenario.series_a_year_relative ?? "?"}
                  </div>
                </div>
              </>
            )}
            {/* Series B */}
            {scenario.series_b_planned && (
              <>
                <div className="flex items-center px-2 text-gray-300">→</div>
                <div className="flex-1 p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="text-xs text-purple-600 font-medium mb-1">SERIES B</div>
                  <div className="text-sm font-semibold">
                    {scenario.series_b_target_raise_aud
                      ? formatAUD(scenario.series_b_target_raise_aud)
                      : "–"}
                  </div>
                  {scenario.series_b_target_valuation_aud && (
                    <div className="text-xs text-purple-500 mt-1">
                      {formatAUD(scenario.series_b_target_valuation_aud)} pre-money
                    </div>
                  )}
                  <div className="text-xs text-gray-500">
                    Year {scenario.series_b_year_relative ?? "?"}
                  </div>
                </div>
              </>
            )}
            {/* Exit */}
            <div className="flex items-center px-2 text-gray-300">→</div>
            <div className="flex-1 p-4 bg-green-50 rounded-r-lg border border-green-200">
              <div className="text-xs text-green-600 font-medium mb-1">EXIT</div>
              <div className="text-sm font-semibold text-green-700">
                {formatAUD(scenario.target_exit_valuation_aud)}
              </div>
              <div className="text-xs text-gray-500">Year {scenario.exit_timeline_years}</div>
            </div>
          </div>
        </Card>
      )}

      {/* Acquirer Landscape */}
      {acquirers && acquirers.length > 0 && (
        <Card className="p-6">
          <h2 className="font-semibold text-lg mb-5 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            AU Acquirer Landscape
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Anonymized AU benchmark transactions. Not financial advice.
          </p>
          <div className="space-y-4">
            {acquirers.map((a) => (
              <div key={a.label} className="p-4 border rounded-lg bg-gray-50">
                <div className="flex items-start justify-between mb-2">
                  <span className="font-medium text-sm">{a.label}</span>
                  <span className="text-xs text-gray-500">{a.exit_count} transactions</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500 text-xs">Exit range</span>
                    <p className="font-medium">
                      {formatAUD(a.exit_value_range_aud.low)} – {formatAUD(a.exit_value_range_aud.high)}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Revenue multiple</span>
                    <p className="font-medium">
                      {a.typical_multiple.low}x – {a.typical_multiple.high}x
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Source: AU M&A benchmark dataset. All acquirer names anonymized. Past transactions
            are indicative only and do not guarantee future outcomes.
          </p>
        </Card>
      )}

      {/* Narrative */}
      {scenario.narrative && (
        <Card className="p-6">
          <h2 className="font-semibold mb-3">Exit Thesis</h2>
          <p className="text-gray-700 text-sm leading-relaxed">{scenario.narrative}</p>
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.push("/workspace/exit-strategy")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            All Scenarios
          </Button>
          <Button
            variant={pinned ? "default" : "outline"}
            onClick={handleTogglePack}
            disabled={pinning}
          >
            {pinned ? (
              <BookmarkCheck className="h-4 w-4 mr-2" />
            ) : (
              <Bookmark className="h-4 w-4 mr-2" />
            )}
            {pinning
              ? "Saving..."
              : pinned
                ? "Remove from Investor Pack"
                : "Add to Investor Pack"}
          </Button>
          <Button variant="ghost" onClick={() => router.push("/workspace/investor-pack")}>
            View Investor Pack
          </Button>
        </div>
        {pinMessage && (
          <div
            role="status"
            className="rounded-md bg-blue-50 text-blue-800 text-sm px-3 py-2 border border-blue-100"
          >
            {pinMessage}
          </div>
        )}
      </div>
    </div>
  );
}
