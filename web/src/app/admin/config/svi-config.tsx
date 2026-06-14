"use client";

import * as React from "react";
import { Save, Loader2, CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react";
import type { PlatformConfig, SviWeights } from "@/lib/platform-config";

type SviConfigSlice = Pick<
  PlatformConfig,
  | "svi_weights"
  | "credit_cost_svi_analysis"
  | "credit_cost_term_sheet"
  | "credit_cost_rnd_report"
  | "credit_cost_evidence_analyze"
  | "growth_plan_credits_monthly"
  | "referral_credits"
  | "linkedin_post_enabled"
>;

interface Props {
  initial: SviConfigSlice;
}

const SVI_DIMENSION_LABELS: { key: keyof SviWeights; label: string }[] = [
  { key: "ftv", label: "Founder-Team Viability" },
  { key: "mpc", label: "Market & Problem Clarity" },
  { key: "ptd", label: "Product & Tech Depth" },
  { key: "tre", label: "Traction & Revenue Evidence" },
  { key: "cgh", label: "Capital & Growth Health" },
  { key: "iri", label: "IP, Risk & Industry" },
  { key: "lco", label: "Legal & Compliance" },
  { key: "svm", label: "SVI Momentum" },
];

const CREDIT_COST_FIELDS: { key: keyof SviConfigSlice; label: string; description: string }[] = [
  { key: "credit_cost_svi_analysis",     label: "SVI Analysis",       description: "Standard startup score analysis" },
  { key: "credit_cost_term_sheet",       label: "Term Sheet AI",      description: "AI term sheet analysis" },
  { key: "credit_cost_rnd_report",       label: "R&D Report",         description: "Standard 10-page R&D report" },
  { key: "credit_cost_evidence_analyze", label: "Evidence Analyze",   description: "Extract signals from uploaded evidence" },
];

export function SviConfig({ initial }: Props) {
  const [weights, setWeights] = React.useState<SviWeights>({ ...initial.svi_weights });
  const [costs, setCosts] = React.useState({
    credit_cost_svi_analysis: initial.credit_cost_svi_analysis,
    credit_cost_term_sheet: initial.credit_cost_term_sheet,
    credit_cost_rnd_report: initial.credit_cost_rnd_report,
    credit_cost_evidence_analyze: initial.credit_cost_evidence_analyze,
    growth_plan_credits_monthly: initial.growth_plan_credits_monthly,
    referral_credits: initial.referral_credits,
    linkedin_post_enabled: initial.linkedin_post_enabled,
  });
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState("");

  const weightTotal = Object.values(weights).reduce((s, v) => s + (Number(v) || 0), 0);
  const isWeightsValid = weightTotal === 100;

  const isDirty =
    JSON.stringify(weights) !== JSON.stringify(initial.svi_weights) ||
    JSON.stringify(costs) !== JSON.stringify({
      credit_cost_svi_analysis: initial.credit_cost_svi_analysis,
      credit_cost_term_sheet: initial.credit_cost_term_sheet,
      credit_cost_rnd_report: initial.credit_cost_rnd_report,
      credit_cost_evidence_analyze: initial.credit_cost_evidence_analyze,
      growth_plan_credits_monthly: initial.growth_plan_credits_monthly,
      referral_credits: initial.referral_credits,
      linkedin_post_enabled: initial.linkedin_post_enabled,
    });

  function setWeight(key: keyof SviWeights, val: string) {
    setWeights((prev) => ({ ...prev, [key]: Number(val) || 0 }));
    setSaved(false);
  }

  function setCostField(key: keyof typeof costs, val: string | boolean) {
    const parsed = typeof val === "boolean" ? val : (key === "linkedin_post_enabled" ? val === "true" : Number(val) || 0);
    setCosts((prev) => ({ ...prev, [key]: parsed }));
    setSaved(false);
  }

  async function handleSave() {
    if (!isWeightsValid) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/platform-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ svi_weights: weights, ...costs }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Save failed");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setWeights({ ...initial.svi_weights });
    setCosts({
      credit_cost_svi_analysis: initial.credit_cost_svi_analysis,
      credit_cost_term_sheet: initial.credit_cost_term_sheet,
      credit_cost_rnd_report: initial.credit_cost_rnd_report,
      credit_cost_evidence_analyze: initial.credit_cost_evidence_analyze,
      growth_plan_credits_monthly: initial.growth_plan_credits_monthly,
      referral_credits: initial.referral_credits,
      linkedin_post_enabled: initial.linkedin_post_enabled,
    });
    setSaved(false);
    setError("");
  }

  return (
    <div className="space-y-6">

      {/* SVI Dimension Weights */}
      <section>
        <h3 className="text-sm font-semibold text-ink-700 mb-2 uppercase tracking-wider">SVI Dimension Weights</h3>
        <div className="bg-white border border-surface-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-50 border-b border-surface-200">
                <th className="text-left px-4 py-2.5 font-medium text-ink-600">Key</th>
                <th className="text-left px-4 py-2.5 font-medium text-ink-600">Dimension</th>
                <th className="text-right px-4 py-2.5 font-medium text-ink-600">Weight (%)</th>
              </tr>
            </thead>
            <tbody>
              {SVI_DIMENSION_LABELS.map((d) => (
                <tr key={d.key} className="border-b border-surface-100">
                  <td className="px-4 py-2.5 font-mono text-xs text-ink-500">{d.key}</td>
                  <td className="px-4 py-2.5">{d.label}</td>
                  <td className="px-4 py-2.5 text-right">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={weights[d.key]}
                      onChange={(e) => setWeight(d.key, e.target.value)}
                      className="w-20 text-sm text-right border border-surface-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent font-mono"
                    />
                  </td>
                </tr>
              ))}
              <tr className={`border-t border-surface-200 ${isWeightsValid ? "bg-emerald-50" : "bg-red-50"}`}>
                <td className="px-4 py-2.5" />
                <td className="px-4 py-2.5 font-medium">Total</td>
                <td className={`px-4 py-2.5 text-right font-bold ${isWeightsValid ? "text-emerald-700" : "text-red-600"}`}>
                  {weightTotal}%
                  {!isWeightsValid && (
                    <span className="ml-2 text-xs font-normal">must equal 100%</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Key Credit Costs */}
      <section>
        <h3 className="text-sm font-semibold text-ink-700 mb-2 uppercase tracking-wider">Key Credit Costs</h3>
        <div className="bg-white border border-surface-200 rounded-lg divide-y divide-surface-100">
          {CREDIT_COST_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center gap-4 px-4 py-3">
              <div className="flex-1">
                <p className="text-sm font-medium text-ink-800">{f.label}</p>
                <p className="text-xs text-ink-500">{f.description}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="number"
                  min={0}
                  step={0.05}
                  value={costs[f.key as keyof typeof costs] as number}
                  onChange={(e) => setCostField(f.key as keyof typeof costs, e.target.value)}
                  className="w-24 text-sm text-right border border-surface-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent font-mono"
                />
                <span className="text-xs text-ink-400">cr</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Plan Credits & Referrals */}
      <section>
        <h3 className="text-sm font-semibold text-ink-700 mb-2 uppercase tracking-wider">Plan Credits & Referrals</h3>
        <div className="bg-white border border-surface-200 rounded-lg divide-y divide-surface-100">
          <div className="flex items-center gap-4 px-4 py-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-ink-800">Growth Plan Credits / Month</p>
              <p className="text-xs text-ink-500">Credits granted to Growth plan users each billing cycle</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                type="number"
                min={1}
                value={costs.growth_plan_credits_monthly}
                onChange={(e) => setCostField("growth_plan_credits_monthly", e.target.value)}
                className="w-24 text-sm text-right border border-surface-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent font-mono"
              />
              <span className="text-xs text-ink-400">cr</span>
            </div>
          </div>
          <div className="flex items-center gap-4 px-4 py-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-ink-800">Referral Credits</p>
              <p className="text-xs text-ink-500">Credits granted per successful referral signup</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <input
                type="number"
                min={0}
                value={costs.referral_credits}
                onChange={(e) => setCostField("referral_credits", e.target.value)}
                className="w-24 text-sm text-right border border-surface-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent font-mono"
              />
              <span className="text-xs text-ink-400">cr</span>
            </div>
          </div>
          <div className="flex items-center gap-4 px-4 py-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-ink-800">LinkedIn Auto-Post</p>
              <p className="text-xs text-ink-500">Automatically publish weekly LinkedIn content</p>
            </div>
            <select
              value={String(costs.linkedin_post_enabled)}
              onChange={(e) => setCostField("linkedin_post_enabled", e.target.value)}
              className="text-sm border border-surface-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>
        </div>
      </section>

      {/* Warning if weights invalid */}
      {!isWeightsValid && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex gap-2 text-xs text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
          <span>SVI weights must sum to exactly 100%. Current total: <strong>{weightTotal}%</strong></span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !isDirty || !isWeightsValid}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
          ) : saved ? (
            <><CheckCircle2 className="h-4 w-4" /> Saved</>
          ) : (
            <><Save className="h-4 w-4" /> Save Changes</>
          )}
        </button>
        {isDirty && (
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-2 rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-surface-100 transition-colors cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" /> Reset
          </button>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-emerald-600">Config saved — changes live within 60s.</p>}
      </div>
    </div>
  );
}
