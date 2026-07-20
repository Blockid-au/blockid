"use client";

// src/app/tools/financial-projections/projections-tool.tsx
//
// Client component for /tools/financial-projections. Renders the input form,
// posts to /api/financial-projections, and displays the 36-month monthly
// projection + 3-year YoY summary + investor-readiness note.
//
// Uses the deterministic engine on the server. This UI never runs the
// projection locally — a single source of truth (the API) keeps the CSV
// export and the on-page table byte-identical.

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatAud } from "@/lib/utils";
import type {
  Projection,
  ProjectionInput,
  ProjectionScenario,
} from "@/lib/financial-projections";

const SECTOR_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "saas", label: "SaaS" },
  { value: "fintech", label: "Fintech" },
  { value: "ai", label: "AI / ML" },
  { value: "healthtech", label: "Healthtech" },
  { value: "deeptech", label: "Deeptech" },
  { value: "marketplace", label: "Marketplace" },
  { value: "ecommerce", label: "E-commerce" },
  { value: "default", label: "Other / not listed" },
];

const SCENARIO_OPTIONS: Array<{ value: ProjectionScenario; label: string; hint: string }> = [
  { value: "aggressive", label: "Aggressive", hint: "1.4× baseline growth, faster hires" },
  { value: "moderate", label: "Moderate", hint: "Sector baseline, steady ramp" },
  { value: "conservative", label: "Conservative", hint: "0.7× baseline, lean spend" },
];

const DEFAULT_INPUT: ProjectionInput = {
  sector: "saas",
  startingMrrAud: 20_000,
  startingBurnAud: 40_000,
  founderCount: 2,
  startDate: "2026-01-01",
  scenario: "moderate",
  includeTaxIncentives: true,
};

interface ApiOk {
  ok: true;
  projection: Projection;
  creditsCharged: number;
  creditsRemaining: number | null;
  disclaimer: string;
}
interface ApiErr {
  ok: false;
  error: string;
  disclaimer: string;
  balance?: number;
  creditsRequired?: number;
  retryInSeconds?: number;
}
type ApiResp = ApiOk | ApiErr;

export function ProjectionsTool() {
  const [input, setInput] = React.useState<ProjectionInput>(DEFAULT_INPUT);
  const [result, setResult] = React.useState<Projection | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function updateField<K extends keyof ProjectionInput>(key: K, value: ProjectionInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/financial-projections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = (await res.json()) as ApiResp;
      if (!json.ok) {
        setError(json.error ?? "Something went wrong.");
      } else {
        setResult(json.projection);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  function downloadCsv() {
    // Build the query URL for CSV. We POST the same body so the API can
    // return CSV via ?format=csv.
    const url = "/api/financial-projections?format=csv";
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`CSV export failed (${res.status})`);
        return res.blob();
      })
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = `financial-projections-${input.sector}-${input.scenario}-${input.startDate}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objectUrl);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "CSV download failed");
      });
  }

  return (
    <div className="space-y-8">
      {/* ── Input form ────────────────────────────────────────────── */}
      <form
        onSubmit={onSubmit}
        className="rounded-2xl border border-surface-200 bg-white p-6 md:p-8 shadow-sm space-y-6"
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label htmlFor="sector">Sector</Label>
            <select
              id="sector"
              value={input.sector}
              onChange={(e) => updateField("sector", e.target.value)}
              className="mt-1 w-full rounded-md border border-surface-200 bg-white px-3 py-2 text-sm"
            >
              {SECTOR_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="mrr">Current MRR (AUD)</Label>
            <Input
              id="mrr"
              type="number"
              min={0}
              step={100}
              value={input.startingMrrAud}
              onChange={(e) =>
                updateField("startingMrrAud", Math.max(0, Number(e.target.value) || 0))
              }
            />
          </div>

          <div>
            <Label htmlFor="burn">Current burn / month (AUD)</Label>
            <Input
              id="burn"
              type="number"
              min={0}
              step={500}
              value={input.startingBurnAud}
              onChange={(e) =>
                updateField("startingBurnAud", Math.max(0, Number(e.target.value) || 0))
              }
            />
          </div>

          <div>
            <Label htmlFor="founders">Founders</Label>
            <Input
              id="founders"
              type="number"
              min={1}
              max={50}
              step={1}
              value={input.founderCount}
              onChange={(e) =>
                updateField("founderCount", Math.max(1, Math.floor(Number(e.target.value) || 1)))
              }
            />
          </div>

          <div>
            <Label htmlFor="startDate">Month 0 date</Label>
            <Input
              id="startDate"
              type="date"
              value={input.startDate}
              onChange={(e) => updateField("startDate", e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="scenario">Scenario</Label>
            <select
              id="scenario"
              value={input.scenario}
              onChange={(e) => updateField("scenario", e.target.value as ProjectionScenario)}
              className="mt-1 w-full rounded-md border border-surface-200 bg-white px-3 py-2 text-sm"
            >
              {SCENARIO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} — {opt.hint}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <input
            id="taxOn"
            type="checkbox"
            checked={input.includeTaxIncentives}
            onChange={(e) => updateField("includeTaxIncentives", e.target.checked)}
            className="h-4 w-4 rounded border-surface-300"
          />
          <Label htmlFor="taxOn" className="text-sm">
            Apply R&D Tax Incentive premium (18.5% refundable, sector-typical R&D intensity)
          </Label>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button type="submit" disabled={loading}>
            {loading ? "Generating…" : "Generate 3-year projection"}
          </Button>
          {result && (
            <Button type="button" variant="outline" onClick={downloadCsv}>
              Download CSV (36 months + YoY)
            </Button>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </form>

      {/* ── Results ──────────────────────────────────────────────── */}
      {result && <ProjectionResults projection={result} />}

      {/* ── AFSL disclaimer ─────────────────────────────────────── */}
      <p className="text-xs text-ink-400 leading-relaxed">
        General information only. Not financial advice. Projections are
        illustrative estimates based on Australian sector benchmarks and may
        differ materially from actual outcomes. Consult a licensed
        professional before relying on any figure for investment,
        fundraising, or tax decisions.
      </p>
    </div>
  );
}

function ProjectionResults({ projection }: { projection: Projection }) {
  const { months, summary, sectorNormsUsed } = projection;
  return (
    <div className="space-y-8">
      {/* Summary tiles */}
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryTile
          label="Year 1 revenue"
          value={formatAud(summary.revenueYear1)}
          hint={`Year 1 cash burn ${formatAud(summary.burnYear1)}`}
        />
        <SummaryTile
          label="Year 3 revenue"
          value={formatAud(summary.revenueYear3)}
          hint={`Year 3 EBITDA ${formatAud(summary.ebitdaYear3)}`}
        />
        <SummaryTile
          label="Cash-positive month"
          value={summary.runwayMonths === null ? "> 36 months" : `Month ${summary.runwayMonths}`}
          hint={`Peak monthly burn ${formatAud(summary.peakBurnAud)}`}
        />
      </div>

      {/* Investor-readiness note */}
      <div className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-ink-800">Investor-readiness note</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">
          {summary.investorReadinessNote}
        </p>
        <p className="mt-3 text-xs text-ink-400">{summary.scenarioNote}</p>
        <p className="mt-1 text-xs text-ink-400">
          Sector norm applied — {sectorNormsUsed.sector} · base growth{" "}
          {sectorNormsUsed.baseMonthlyGrowthPct.toFixed(1)}%/mo · gross margin{" "}
          {sectorNormsUsed.grossMarginPct}% · R&D intensity{" "}
          {sectorNormsUsed.rdIntensityPct}% · year-3 ARR multiple ~
          {sectorNormsUsed.arrMultipleMidYr3}x
        </p>
      </div>

      {/* 36-month table (scrollable) */}
      <div className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-xs md:text-sm">
            <thead className="bg-surface-100 sticky top-0">
              <tr className="text-left text-ink-800">
                <th className="px-3 py-2 font-medium">Month</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium text-right">Revenue</th>
                <th className="px-3 py-2 font-medium text-right">Gross Margin</th>
                <th className="px-3 py-2 font-medium text-right">Opex</th>
                <th className="px-3 py-2 font-medium text-right">EBITDA</th>
                <th className="px-3 py-2 font-medium text-right">Cash Out</th>
                <th className="px-3 py-2 font-medium text-right">Cum Cash</th>
                <th className="px-3 py-2 font-medium text-right">HC</th>
                <th className="px-3 py-2 font-medium text-right">Tax Offset</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month} className="border-t border-surface-100">
                  <td className="px-3 py-1.5">{m.month}</td>
                  <td className="px-3 py-1.5">{m.date}</td>
                  <td className="px-3 py-1.5 text-right">{formatAud(m.revenueAud)}</td>
                  <td className="px-3 py-1.5 text-right">{formatAud(m.grossMarginAud)}</td>
                  <td className="px-3 py-1.5 text-right">{formatAud(m.opexAud)}</td>
                  <td className={`px-3 py-1.5 text-right ${m.ebitdaAud >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                    {formatAud(m.ebitdaAud)}
                  </td>
                  <td className="px-3 py-1.5 text-right">{formatAud(m.cashOutflowAud)}</td>
                  <td className="px-3 py-1.5 text-right">{formatAud(m.cumCashAud)}</td>
                  <td className="px-3 py-1.5 text-right">{m.headcount}</td>
                  <td className="px-3 py-1.5 text-right">{formatAud(m.taxOffsetAud)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
      <p className="text-xs uppercase tracking-[0.16em] text-ink-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink-800">{value}</p>
      <p className="mt-1 text-xs text-ink-400">{hint}</p>
    </div>
  );
}
