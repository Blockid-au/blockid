"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Target,
  TrendingUp,
  CheckCircle2,
  XCircle,
  HelpCircle,
  RefreshCw,
} from "lucide-react";
import type {
  CompetitivePositioningContext,
  PositioningStatement,
  ExtractedFeature,
} from "@/lib/competitive-positioning";

interface MatrixData {
  ok: boolean;
  context: CompetitivePositioningContext;
  mpcBoost: number;
  svmBoost: number;
  totalSviLift: number;
}

interface PositioningData {
  ok: boolean;
  statement: PositioningStatement | null;
}

export function CompetitivePositioningClient() {
  const [matrixData, setMatrixData] = useState<MatrixData | null>(null);
  const [positioningData, setPositioningData] = useState<PositioningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [matrixRes, posRes] = await Promise.all([
        fetch("/api/competitive-positioning/matrix"),
        fetch("/api/competitive-positioning/positioning"),
      ]);
      const [matrix, pos] = await Promise.all([
        matrixRes.json() as Promise<MatrixData>,
        posRes.json() as Promise<PositioningData>,
      ]);
      setMatrixData(matrix);
      setPositioningData(pos);
    } catch {
      setError("Failed to load competitive positioning data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/competitive-positioning/positioning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as PositioningData;
      if (data.ok) {
        setPositioningData(data);
      } else {
        setError("Failed to generate positioning statement.");
      }
    } catch {
      setError("Failed to generate positioning statement.");
    } finally {
      setGenerating(false);
    }
  };

  const context = matrixData?.context;
  const statement = positioningData?.statement;
  const hasCompetitors =
    context != null && context.competitors_analyzed > 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="bg-gradient-to-r from-[#00D4FF] to-[#0066FF] bg-clip-text text-transparent font-bold text-xl flex items-center gap-2">
            <Target className="h-5 w-5 text-[#00D4FF]" />
            Competitive Positioning
          </h1>
          <p className="text-sm text-[#94A3B8] mt-1">
            Build your competitive matrix and generate an AI-powered positioning statement.
          </p>
        </div>

        {/* SVI impact badge */}
        {matrixData?.ok && (
          <div className="flex items-center gap-2">
            <Badge className="bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              MPC +{matrixData.mpcBoost} pts
            </Badge>
            <Badge className="bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              SVM +{matrixData.svmBoost} pts
            </Badge>
          </div>
        )}
      </header>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Positioning Statement Card */}
      <Card className="bg-[#0F1629] border border-[#1E2D4A]">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-[#00D4FF]" />
            Positioning Statement
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full bg-[#1E2D4A]" />
              <Skeleton className="h-4 w-3/4 bg-[#1E2D4A]" />
            </div>
          ) : statement ? (
            <div className="space-y-4">
              <p className="text-lg text-white font-medium leading-relaxed">
                {statement.statement}
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-[#94A3B8]">
                {statement.category && (
                  <Badge className="bg-[#1E2D4A] text-[#94A3B8] border border-[#2E3D5A]">
                    {statement.category}
                  </Badge>
                )}
                {statement.target_segment && (
                  <Badge className="bg-[#1E2D4A] text-[#94A3B8] border border-[#2E3D5A]">
                    {statement.target_segment}
                  </Badge>
                )}
                <Badge className="bg-green-500/20 text-green-300 border border-green-500/30">
                  {Math.round((statement.confidence_score ?? 0.82) * 100)}% confidence
                </Badge>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleGenerate()}
                disabled={generating}
                className="border-[#1E2D4A] text-[#94A3B8] hover:text-white"
              >
                <RefreshCw className={`h-3 w-3 mr-2 ${generating ? "animate-spin" : ""}`} />
                {generating ? "Regenerating…" : "Regenerate"}
              </Button>
            </div>
          ) : (
            <div className="text-center py-6 space-y-4">
              <p className="text-[#94A3B8] text-sm">
                No positioning statement yet. Generate one based on your competitive analysis.
              </p>
              {hasCompetitors ? (
                <Button
                  onClick={() => void handleGenerate()}
                  disabled={generating}
                  className="bg-gradient-to-r from-[#00D4FF] to-[#0066FF] text-white"
                >
                  {generating ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Target className="h-4 w-4 mr-2" />
                      Generate Positioning Statement
                    </>
                  )}
                </Button>
              ) : (
                <p className="text-xs text-[#94A3B8]/70">
                  Add competitors first to generate a positioning statement.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Competitive Matrix */}
      <Card className="bg-[#0F1629] border border-[#1E2D4A]">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#00D4FF]" />
            Competitive Matrix
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full bg-[#1E2D4A]" />
              ))}
            </div>
          ) : !hasCompetitors ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-[#94A3B8] text-sm">
                No competitors added yet. Add competitors first to build your matrix.
              </p>
              <a
                href="/workspace/competitors"
                className="inline-flex items-center gap-1 text-sm text-[#00D4FF] hover:underline"
              >
                Go to Competitor Review →
              </a>
            </div>
          ) : (
            <CompetitorMatrix projectId={null} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Competitor Matrix Sub-component ─────────────────────────────────────── */

interface CompetitorEntry {
  id: string;
  name: string;
}

interface FeatureRow {
  feature: ExtractedFeature;
  competitorName: string;
}

function CompetitorMatrix({ projectId: _projectId }: { projectId: string | null }) {
  const [competitors, setCompetitors] = useState<CompetitorEntry[]>([]);
  const [featureRows, setFeatureRows] = useState<FeatureRow[]>([]);
  const [loadingFeatures, setLoadingFeatures] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoadingFeatures(true);
      try {
        // Fetch competitors from the existing competitors API
        const res = await fetch("/api/founder/competitors");
        if (!res.ok) return;
        const data = (await res.json()) as { ok: boolean; items: Array<{ id: string; name: string }> };
        if (!data.ok || !data.items?.length) return;

        setCompetitors(data.items);

        // Fetch features for each competitor
        const rows: FeatureRow[] = [];
        await Promise.all(
          data.items.map(async (comp) => {
            const fRes = await fetch(
              `/api/competitive-positioning/features?competitorId=${comp.id}`,
            );
            const fData = (await fRes.json()) as { ok: boolean; features: ExtractedFeature[] };
            if (fData.ok && fData.features) {
              for (const f of fData.features) {
                rows.push({ feature: f, competitorName: comp.name });
              }
            }
          }),
        );

        setFeatureRows(rows);
      } finally {
        setLoadingFeatures(false);
      }
    };

    void run();
  }, []);

  const handleToggle = async (
    competitorId: string,
    featureId: string,
    current: boolean | null,
  ) => {
    const next = current === true ? false : current === false ? null : true;
    setUpdatingId(featureId);
    try {
      await fetch("/api/competitive-positioning/features", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competitorId,
          featureId,
          hasFounderFeature: next,
        }),
      });
      setFeatureRows((prev) =>
        prev.map((row) =>
          row.feature.id === featureId
            ? { ...row, feature: { ...row.feature, has_founder_feature: next } }
            : row,
        ),
      );
    } finally {
      setUpdatingId(null);
    }
  };

  if (loadingFeatures) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full bg-[#1E2D4A]" />
        ))}
      </div>
    );
  }

  if (!featureRows.length) {
    return (
      <div className="text-center py-6 space-y-2">
        <p className="text-[#94A3B8] text-sm">
          No features extracted yet. Use the Competitor Review page to extract features.
        </p>
        <a
          href="/workspace/competitors"
          className="inline-flex items-center gap-1 text-sm text-[#00D4FF] hover:underline"
        >
          Go to Competitor Review →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 text-xs text-[#94A3B8] items-center">
        <span>{competitors.length} competitors</span>
        <span>·</span>
        <span>{featureRows.length} features</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#1E2D4A]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#1E2D4A] bg-[#0A0F1E]">
              <th className="text-left px-3 py-2 text-[#94A3B8] font-medium">Feature</th>
              <th className="text-left px-3 py-2 text-[#94A3B8] font-medium">Competitor</th>
              <th className="text-left px-3 py-2 text-[#94A3B8] font-medium">Category</th>
              <th className="text-center px-3 py-2 text-[#94A3B8] font-medium">You Have It?</th>
            </tr>
          </thead>
          <tbody>
            {featureRows.map((row) => (
              <tr
                key={row.feature.id}
                className="border-b border-[#1E2D4A]/50 hover:bg-[#1E2D4A]/20"
              >
                <td className="px-3 py-2 text-white">{row.feature.feature_name}</td>
                <td className="px-3 py-2 text-[#94A3B8] text-xs">{row.competitorName}</td>
                <td className="px-3 py-2">
                  <Badge className="bg-[#1E2D4A] text-[#94A3B8] border border-[#2E3D5A] text-xs">
                    {row.feature.feature_category}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() =>
                      void handleToggle(
                        row.feature.competitor_id,
                        row.feature.id,
                        row.feature.has_founder_feature,
                      )
                    }
                    disabled={updatingId === row.feature.id}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-full transition-colors hover:bg-[#1E2D4A]"
                    title="Click to toggle: ✓ → ✗ → ?"
                  >
                    {updatingId === row.feature.id ? (
                      <RefreshCw className="h-4 w-4 animate-spin text-[#94A3B8]" />
                    ) : row.feature.has_founder_feature === true ? (
                      <CheckCircle2 className="h-5 w-5 text-green-400" />
                    ) : row.feature.has_founder_feature === false ? (
                      <XCircle className="h-5 w-5 text-red-400" />
                    ) : (
                      <HelpCircle className="h-5 w-5 text-[#94A3B8]" />
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
