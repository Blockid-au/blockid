"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { WizardFormData } from "../forecast-wizard-client";

interface Step2Props {
  data: WizardFormData;
  onChange: (data: WizardFormData) => void;
}

export function Step2CostStructure({ data, onChange }: Step2Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Cost Structure</h2>
        <p className="text-gray-600">Tell us about your margins and operating expenses</p>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="cogs">Cost of Goods Sold (% of Revenue)</Label>
          <div className="relative mt-1">
            <Input
              id="cogs"
              type="number"
              placeholder="30"
              min="0"
              max="100"
              step="1"
              value={data.cogsPercent || 0}
              onChange={(e) => onChange({ ...data, cogsPercent: parseFloat(e.target.value) })}
            />
            <span className="absolute right-3 top-2.5 text-gray-500">%</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">Typical SaaS: 20–40%</p>
        </div>

        <div>
          <Label htmlFor="fixedCosts">Monthly Operating Expenses (Fixed)</Label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-2.5 text-gray-500">A$</span>
            <Input
              id="fixedCosts"
              type="number"
              placeholder="50000"
              min="0"
              step="5000"
              value={data.opexMonthlyAud || 0}
              onChange={(e) => onChange({ ...data, opexMonthlyAud: parseFloat(e.target.value) })}
              className="pl-8"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">Salaries, rent, tools, etc.</p>
        </div>

        <div className="border-t pt-4">
          <div className="flex items-start gap-3">
            <Checkbox
              id="rdti"
              checked={data.includeTaxIncentives || false}
              onCheckedChange={(checked: boolean) => onChange({ ...data, includeTaxIncentives: checked as boolean })}
              className="mt-1"
            />
            <div className="flex-1">
              <Label htmlFor="rdti" className="font-medium cursor-pointer">
                R&D Tax Incentive Eligible
              </Label>
              <p className="text-xs text-gray-600 mt-1">
                Are you eligible for the AU R&D Tax Incentive (43.5% refund)? Check the{" "}
                <a href="https://www.business.gov.au/support-and-grants/research-and-development-tax-incentive"
                   target="_blank"
                   rel="noopener noreferrer"
                   className="text-blue-600 hover:underline">
                  ATO website
                </a>{" "}
                to confirm.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
