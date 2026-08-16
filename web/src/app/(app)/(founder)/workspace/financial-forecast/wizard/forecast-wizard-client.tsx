"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Step1BasicInputs } from "./steps/step-1-basic-inputs";
import { Step2CostStructure } from "./steps/step-2-cost-structure";
import { Step3Scenarios } from "./steps/step-3-scenarios";
import { Step4Review } from "./steps/step-4-review";
import type { ForecastBuilderInput, ProjectionOutput } from "@/types/financial";

const TOTAL_STEPS = 4;

export interface WizardFormData extends Partial<ForecastBuilderInput> {
  forecastName?: string;
}

export function ForecastWizardClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<WizardFormData>({
    forecastName: "My Forecast",
    currentArrAud: 0,
    monthlyGrowthPct: 8,
    churnPct: 2,
    cogsPercent: 30,
    opexMonthlyAud: 50000,
    includeTaxIncentives: false,
    scenario: "base",
    modelType: "saas",
    sector: "saas",
  });
  const [preview, setPreview] = useState<ProjectionOutput | null>(null);

  // Load from URL params on mount
  useEffect(() => {
    const stepParam = searchParams.get("step");
    if (stepParam) {
      setStep(Math.min(Math.max(parseInt(stepParam), 1), TOTAL_STEPS));
    }
  }, [searchParams]);

  // Update URL when step changes
  useEffect(() => {
    window.history.replaceState(null, "", `?step=${step}`);
  }, [step]);

  const generatePreview = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/financial/forecast/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        throw new Error("Failed to generate preview");
      }

      const data = await res.json();
      setPreview(data.projection);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
    if (step === TOTAL_STEPS) {
      // On final step, save forecast
      await saveForecast();
    } else if (step === 3) {
      // Generate preview before moving to review
      await generatePreview();
      setStep(step + 1);
    } else {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const saveForecast = async () => {
    try {
      setSaving(true);
      setError(null);

      const res = await fetch("/api/financial/forecast/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          projectionData: preview,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save forecast");
      }

      const data = await res.json();
      router.push(`/workspace/financial-forecast/${data.modelId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const stepComponents = [
    <Step1BasicInputs key="1" data={formData} onChange={setFormData} />,
    <Step2CostStructure key="2" data={formData} onChange={setFormData} />,
    <Step3Scenarios key="3" data={formData} onChange={setFormData} />,
    <Step4Review key="4" data={formData} preview={preview} loading={loading} />,
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Revenue Forecast</h1>
        <p className="text-gray-600 mt-1">Step {step} of {TOTAL_STEPS}</p>
        <div className="mt-4 w-full bg-gray-200 h-2 rounded-full overflow-hidden">
          <div
            className="bg-blue-600 h-full transition-all"
            style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg">
          {error}
        </div>
      )}

      <Card className="p-8">
        {stepComponents[step - 1]}
      </Card>

      <div className="flex justify-between">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={step === 1 || loading || saving}
        >
          Back
        </Button>

        <div className="flex gap-3">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            disabled={loading || saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleNext}
            disabled={loading || saving}
            className="gap-2"
          >
            {saving ? "Saving..." : step === TOTAL_STEPS ? "Save Forecast" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
