"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import type { WizardFormData } from "../forecast-wizard-client";
import type { ProjectionOutput } from "@/types/financial";

interface Step4Props {
  data: WizardFormData;
  preview: ProjectionOutput | null;
  loading: boolean;
}

export function Step4Review({ data, preview, loading }: Step4Props) {
  const formatCurrency = (value: number) => {
    return `A$${Math.round(value).toLocaleString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Review & Save</h2>
        <p className="text-gray-600">Confirm your forecast details and save</p>
      </div>

      <div className="bg-gray-50 p-4 rounded-lg space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Forecast Name:</span>
          <span className="font-medium">{data.forecastName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Current ARR:</span>
          <span className="font-medium">{formatCurrency(data.currentArrAud || 0)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Monthly Growth:</span>
          <span className="font-medium">{data.monthlyGrowthPct}% MoM</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Churn Rate:</span>
          <span className="font-medium">{data.churnPct}% MoM</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Scenario:</span>
          <span className="font-medium capitalize">{data.scenario}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">RDTI Eligible:</span>
          <span className="font-medium">{data.includeTaxIncentives ? "Yes" : "No"}</span>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : preview ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">12M Projected ARR</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">
                {formatCurrency(preview.summary.revenueYear1 || 0)}
              </p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Breakeven Month</p>
              <p className="text-2xl font-bold text-green-600 mt-1">
                {preview.summary.monthBreakeven ? `Month ${preview.summary.monthBreakeven}` : "Not reached"}
              </p>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Runway (Months)</p>
              <p className="text-2xl font-bold text-orange-600 mt-1">
                {preview.summary.runwayMonths || "—"}
              </p>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left">Month</th>
                  <th className="px-4 py-2 text-right">Revenue</th>
                  <th className="px-4 py-2 text-right">EBITDA</th>
                  <th className="px-4 py-2 text-right">Cumulative Cash</th>
                </tr>
              </thead>
              <tbody>
                {preview.months.slice(0, 12).map((month, idx) => (
                  <tr key={idx} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2">{month.month}</td>
                    <td className="px-4 py-2 text-right font-medium">
                      {formatCurrency(month.revenueAud)}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {formatCurrency(month.ebitdaAud)}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {formatCurrency(month.cumCashAud)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-500">
            Showing first 12 months. Full 36-month projection saved with forecast.
          </p>
        </div>
      ) : (
        <p className="text-gray-600">Click "Next" to generate a preview of your 36-month projection.</p>
      )}
    </div>
  );
}
