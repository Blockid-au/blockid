"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Loader2 } from "lucide-react";

type ExitType = "acquisition" | "ipo" | "other";

interface FormState {
  scenario_name: string;
  exit_type: ExitType;
  exit_timeline_years: number;
  target_exit_valuation_aud: number;
  series_a_planned: boolean;
  series_a_target_raise_aud: number;
  series_a_target_valuation_aud: number;
  series_a_year_relative: number;
  series_b_planned: boolean;
  series_b_target_raise_aud: number;
  series_b_target_valuation_aud: number;
  series_b_year_relative: number;
  narrative: string;
}

const EXIT_TYPES: { value: ExitType; label: string; description: string }[] = [
  { value: "acquisition", label: "Acquisition", description: "Strategic or financial buyer (5–15x revenue)" },
  { value: "ipo", label: "IPO", description: "ASX / NASDAQ public listing (15–30x revenue)" },
  { value: "other", label: "Other", description: "MBO, secondary sale, or merger" },
];

export function CreateScenarioClient() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>({
    scenario_name: "My Exit Scenario",
    exit_type: "acquisition",
    exit_timeline_years: 5,
    target_exit_valuation_aud: 10_000_000,
    series_a_planned: false,
    series_a_target_raise_aud: 3_000_000,
    series_a_target_valuation_aud: 12_000_000,
    series_a_year_relative: 2,
    series_b_planned: false,
    series_b_target_raise_aud: 10_000_000,
    series_b_target_valuation_aud: 50_000_000,
    series_b_year_relative: 4,
    narrative: "",
  });

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      scenario_name: form.scenario_name,
      exit_type: form.exit_type,
      exit_timeline_years: form.exit_timeline_years,
      target_exit_valuation_aud: form.target_exit_valuation_aud,
      series_a_planned: form.series_a_planned,
      ...(form.series_a_planned && {
        series_a_target_raise_aud: form.series_a_target_raise_aud,
        series_a_target_valuation_aud: form.series_a_target_valuation_aud,
        series_a_year_relative: form.series_a_year_relative,
      }),
      series_b_planned: form.series_b_planned,
      ...(form.series_b_planned && {
        series_b_target_raise_aud: form.series_b_target_raise_aud,
        series_b_target_valuation_aud: form.series_b_target_valuation_aud,
        series_b_year_relative: form.series_b_year_relative,
      }),
      narrative: form.narrative || undefined,
    };

    try {
      const res = await fetch("/api/exit-strategy/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await res.json();
      if (!body.ok) {
        setError(body.error ?? "Failed to create scenario");
        return;
      }

      router.push(`/workspace/exit-strategy/${body.scenario.id}`);
    } catch {
      setError("Network error — please try again");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Header */}
      <div>
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <h1 className="text-2xl font-bold">New Exit Scenario</h1>
        <p className="text-gray-600 mt-1">
          Model your funding path, dilution, and founder payout at exit.
        </p>
      </div>

      {/* Scenario basics */}
      <Card className="p-6 space-y-5">
        <h2 className="font-semibold text-lg">Scenario Details</h2>

        <div>
          <Label htmlFor="scenario_name">Scenario Name</Label>
          <Input
            id="scenario_name"
            value={form.scenario_name}
            onChange={(e) => update("scenario_name", e.target.value)}
            placeholder="e.g. Acquisition by Year 5"
            className="mt-1"
            required
          />
        </div>

        <div>
          <Label>Exit Type</Label>
          <div className="grid grid-cols-3 gap-3 mt-2">
            {EXIT_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => update("exit_type", t.value)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  form.exit_type === t.value
                    ? "border-blue-400 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="font-medium text-sm">{t.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{t.description}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="timeline">Exit Timeline (Years)</Label>
            <Input
              id="timeline"
              type="number"
              min={1}
              max={20}
              value={form.exit_timeline_years}
              onChange={(e) => update("exit_timeline_years", parseInt(e.target.value))}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="target_val">Target Exit Valuation (A$)</Label>
            <div className="relative mt-1">
              <span className="absolute left-3 top-2.5 text-gray-500 text-sm">A$</span>
              <Input
                id="target_val"
                type="number"
                min={1}
                step={500000}
                value={form.target_exit_valuation_aud}
                onChange={(e) => update("target_exit_valuation_aud", parseInt(e.target.value))}
                className="pl-9"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {form.target_exit_valuation_aud >= 1_000_000_000
                ? `A$${(form.target_exit_valuation_aud / 1_000_000_000).toFixed(1)}B`
                : `A$${(form.target_exit_valuation_aud / 1_000_000).toFixed(1)}M`}
            </p>
          </div>
        </div>
      </Card>

      {/* Series A */}
      <Card className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <Checkbox
            id="series_a_planned"
            checked={form.series_a_planned}
            onCheckedChange={(checked) => update("series_a_planned", checked as boolean)}
          />
          <Label htmlFor="series_a_planned" className="font-semibold text-base cursor-pointer">
            Plan a Series A Round
          </Label>
        </div>

        {form.series_a_planned && (
          <div className="grid grid-cols-3 gap-4 ml-7">
            <div>
              <Label htmlFor="a_raise">Raise Amount (A$)</Label>
              <Input
                id="a_raise"
                type="number"
                min={0}
                step={500000}
                value={form.series_a_target_raise_aud}
                onChange={(e) => update("series_a_target_raise_aud", parseInt(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="a_val">Pre-Money Valuation (A$)</Label>
              <Input
                id="a_val"
                type="number"
                min={0}
                step={1000000}
                value={form.series_a_target_valuation_aud}
                onChange={(e) => update("series_a_target_valuation_aud", parseInt(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="a_year">Year (relative)</Label>
              <Input
                id="a_year"
                type="number"
                min={1}
                max={20}
                value={form.series_a_year_relative}
                onChange={(e) => update("series_a_year_relative", parseInt(e.target.value))}
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">e.g. 2 = Year 2</p>
            </div>
          </div>
        )}
      </Card>

      {/* Series B */}
      <Card className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <Checkbox
            id="series_b_planned"
            checked={form.series_b_planned}
            onCheckedChange={(checked) => update("series_b_planned", checked as boolean)}
          />
          <Label htmlFor="series_b_planned" className="font-semibold text-base cursor-pointer">
            Plan a Series B Round
          </Label>
        </div>

        {form.series_b_planned && (
          <div className="grid grid-cols-3 gap-4 ml-7">
            <div>
              <Label htmlFor="b_raise">Raise Amount (A$)</Label>
              <Input
                id="b_raise"
                type="number"
                min={0}
                step={1000000}
                value={form.series_b_target_raise_aud}
                onChange={(e) => update("series_b_target_raise_aud", parseInt(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="b_val">Pre-Money Valuation (A$)</Label>
              <Input
                id="b_val"
                type="number"
                min={0}
                step={5000000}
                value={form.series_b_target_valuation_aud}
                onChange={(e) => update("series_b_target_valuation_aud", parseInt(e.target.value))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="b_year">Year (relative)</Label>
              <Input
                id="b_year"
                type="number"
                min={1}
                max={20}
                value={form.series_b_year_relative}
                onChange={(e) => update("series_b_year_relative", parseInt(e.target.value))}
                className="mt-1"
              />
            </div>
          </div>
        )}
      </Card>

      {/* Narrative */}
      <Card className="p-6 space-y-3">
        <h2 className="font-semibold">Narrative (Optional)</h2>
        <textarea
          value={form.narrative}
          onChange={(e) => update("narrative", e.target.value)}
          placeholder="Describe your exit thesis — why this exit type, who your ideal acquirer is, what milestone unlocks the exit..."
          rows={4}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
        />
      </Card>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {saving ? "Creating..." : "Create Scenario"}
        </Button>
      </div>
    </form>
  );
}
