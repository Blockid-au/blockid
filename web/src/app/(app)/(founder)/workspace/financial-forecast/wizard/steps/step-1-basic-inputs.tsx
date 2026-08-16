"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WizardFormData } from "../forecast-wizard-client";

interface Step1Props {
  data: WizardFormData;
  onChange: (data: WizardFormData) => void;
}

export function Step1BasicInputs({ data, onChange }: Step1Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Basic Information</h2>
        <p className="text-gray-600">Let's start with your current revenue and growth</p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="forecastName">Forecast Name</Label>
          <Input
            id="forecastName"
            placeholder="e.g., Conservative Growth"
            value={data.forecastName || ""}
            onChange={(e) => onChange({ ...data, forecastName: e.target.value })}
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="currentArr">Current Annual Recurring Revenue (ARR)</Label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-2.5 text-gray-500">A$</span>
            <Input
              id="currentArr"
              type="number"
              placeholder="0"
              min="0"
              step="1000"
              value={data.currentArrAud || 0}
              onChange={(e) => onChange({ ...data, currentArrAud: parseFloat(e.target.value) })}
              className="pl-8"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">If pre-revenue, enter 0</p>
        </div>

        <div>
          <Label htmlFor="monthlyGrowth">Monthly Growth Rate (%)</Label>
          <div className="relative mt-1">
            <Input
              id="monthlyGrowth"
              type="number"
              placeholder="8"
              min="0"
              max="100"
              step="0.5"
              value={data.monthlyGrowthPct || 0}
              onChange={(e) => onChange({ ...data, monthlyGrowthPct: parseFloat(e.target.value) })}
            />
            <span className="absolute right-3 top-2.5 text-gray-500">%</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">Typical SaaS: 5–15% MoM</p>
        </div>

        <div>
          <Label htmlFor="churnRate">Monthly Churn Rate (%)</Label>
          <div className="relative mt-1">
            <Input
              id="churnRate"
              type="number"
              placeholder="2"
              min="0"
              max="100"
              step="0.5"
              value={data.churnPct || 0}
              onChange={(e) => onChange({ ...data, churnPct: parseFloat(e.target.value) })}
            />
            <span className="absolute right-3 top-2.5 text-gray-500">%</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">Typical SaaS: 1–5% MoM</p>
        </div>
      </div>
    </div>
  );
}
