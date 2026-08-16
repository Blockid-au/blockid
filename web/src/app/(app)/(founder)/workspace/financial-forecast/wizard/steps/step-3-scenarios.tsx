"use client";

import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { WizardFormData } from "../forecast-wizard-client";

interface Step3Props {
  data: WizardFormData;
  onChange: (data: WizardFormData) => void;
}

const SCENARIOS = [
  {
    id: "bear",
    label: "Bear Case (Conservative)",
    description:
      "Growth slows 25%, churn rises, aggressive cost controls. Plan for worst-case market conditions.",
    multiplier: 0.7,
  },
  {
    id: "base",
    label: "Base Case (Plan)",
    description: "Execute on plan. Growth, churn, and expenses as forecasted. Most realistic scenario.",
    multiplier: 1.0,
  },
  {
    id: "bull",
    label: "Bull Case (Upside)",
    description:
      "Growth accelerates 25%, churn drops, product-market fit captured. Strong execution & market tailwinds.",
    multiplier: 1.4,
  },
];

export function Step3Scenarios({ data, onChange }: Step3Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Growth Scenario</h2>
        <p className="text-gray-600">Select a scenario that reflects your confidence in your plan</p>
      </div>

      <RadioGroup value={data.scenario || "base"} onValueChange={(scenario: string) => onChange({ ...data, scenario: scenario as "bear" | "base" | "bull" })}>
        <div className="space-y-4">
          {SCENARIOS.map((scenario) => (
            <div
              key={scenario.id}
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                data.scenario === scenario.id ? "bg-blue-50 border-blue-400" : "hover:bg-gray-50"
              }`}
            >
              <div className="flex gap-3">
                <RadioGroupItem value={scenario.id} id={scenario.id} className="mt-1" />
                <div className="flex-1">
                  <Label htmlFor={scenario.id} className="font-semibold cursor-pointer">
                    {scenario.label}
                  </Label>
                  <p className="text-sm text-gray-600 mt-1">{scenario.description}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    Growth multiplier: <span className="font-medium">{scenario.multiplier}x</span>
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </RadioGroup>
    </div>
  );
}
