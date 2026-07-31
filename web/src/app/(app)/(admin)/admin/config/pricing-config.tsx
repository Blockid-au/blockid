"use client";

import * as React from "react";
import { Save, Loader2, CheckCircle2, RefreshCw, AlertTriangle } from "lucide-react";
import type { PlatformConfig } from "@/lib/platform-config";

interface Props {
  initial: PlatformConfig;
  defaults: PlatformConfig;
}

type Field = {
  key: keyof PlatformConfig;
  label: string;
  description: string;
  type: "number" | "text" | "boolean" | "date";
  unit?: string;
  group: "founding" | "free" | "growth" | "promo" | "flags";
};

const FIELDS: Field[] = [
  // Founding plan
  { key: "founding_plan_name",    label: "Founding Plan Name",      description: 'Display name, e.g. "Founding 100"',    type: "text",    group: "founding" },
  { key: "founding_spots_total",  label: "Total Spots",             description: "Max number of founding members",        type: "number",  group: "founding" },
  { key: "founding_price_cents",  label: "Price (cents AUD)",       description: "100 = A$1.00, 4900 = A$49.00",         type: "number",  unit: "¢", group: "founding" },
  { key: "founding_credits",      label: "Credits Included",        description: "Credits given on signup",               type: "number",  group: "founding" },
  // Free plan
  { key: "free_credits_on_signup",label: "Free Credits on Signup",  description: "Credits for new free-tier users",       type: "number",  group: "free" },
  // Growth plan
  { key: "growth_price_monthly_cents", label: "Growth Monthly (cents)", description: "9900 = A$99/mo",                   type: "number", unit: "¢", group: "growth" },
  { key: "growth_price_yearly_cents",  label: "Growth Yearly (cents)",  description: "95000 = A$950/yr",                 type: "number", unit: "¢", group: "growth" },
  // Promo
  { key: "promo_code",            label: "Promo Code",              description: 'Displayed on pricing page (e.g. "LAUNCH100")', type: "text", group: "promo" },
  { key: "promo_label",           label: "Promo Description",       description: "Short CTA text next to promo code",    type: "text",    group: "promo" },
  { key: "early_bird_deadline",   label: "Early Bird Deadline",     description: "ISO date — early-bird pricing ends",   type: "date",    group: "promo" },
  // Flags
  { key: "founding_plan_active",  label: "Founding Plan Active",    description: "Show founding plan on pricing + CTAs", type: "boolean", group: "flags" },
  { key: "waitlist_mode",         label: "Waitlist Mode",           description: "Replace checkout with waitlist form",  type: "boolean", group: "flags" },
];

const GROUP_LABELS: Record<Field["group"], string> = {
  founding: "Founding Plan",
  free: "Free Plan",
  growth: "Growth Plan",
  promo: "Promo & Early Bird",
  flags: "Feature Flags",
};

export function PricingConfig({ initial, defaults }: Props) {
  const [values, setValues] = React.useState<PlatformConfig>({ ...initial });
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState("");

  const isDirty = JSON.stringify(values) !== JSON.stringify(initial);

  function setValue(key: keyof PlatformConfig, raw: string) {
    const defaultVal = defaults[key];
    let coerced: string | number | boolean = raw;
    if (typeof defaultVal === "number") coerced = Number(raw) || 0;
    else if (typeof defaultVal === "boolean") coerced = raw === "true";
    setValues((prev) => ({ ...prev, [key]: coerced }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/admin/platform-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
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
    setValues({ ...initial });
    setSaved(false);
    setError("");
  }

  const groups = (["founding", "free", "growth", "promo", "flags"] as const);

  return (
    <div className="space-y-6">
      {/* DB setup notice */}
      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2 text-xs text-amber-800">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
        <span>
          Requires a <code className="font-mono bg-amber-100 px-1 rounded">platform_config</code> table in Supabase.
          Run: <code className="font-mono bg-amber-100 px-1 rounded">CREATE TABLE platform_config (key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMPTZ DEFAULT NOW(), updated_by TEXT);</code>
        </span>
      </div>

      {groups.map((group) => {
        const groupFields = FIELDS.filter((f) => f.group === group);
        return (
          <section key={group}>
            <h3 className="text-sm font-semibold text-ink-700 mb-2 uppercase tracking-wider">{GROUP_LABELS[group]}</h3>
            <div className="bg-white border border-surface-200 rounded-lg divide-y divide-surface-100">
              {groupFields.map((field) => {
                const val = values[field.key];
                const defaultVal = defaults[field.key];
                const isModified = val !== defaultVal;

                return (
                  <div key={field.key} className="flex items-center gap-4 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-ink-800">{field.label}</p>
                        {isModified && (
                          <span className="rounded-full bg-brand-50 border border-brand-200 px-1.5 py-0.5 text-[10px] font-medium text-brand-600">
                            modified
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ink-500 mt-0.5">{field.description}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {field.type === "boolean" ? (
                        <select
                          value={String(val)}
                          onChange={(e) => setValue(field.key, e.target.value)}
                          className="text-sm border border-surface-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                        >
                          <option value="true">Enabled</option>
                          <option value="false">Disabled</option>
                        </select>
                      ) : (
                        <div className="flex items-center gap-1">
                          <input
                            type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
                            value={field.type === "date" ? String(val).slice(0, 10) : String(val)}
                            onChange={(e) => setValue(field.key, e.target.value)}
                            className="w-40 text-sm border border-surface-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent font-mono"
                          />
                          {field.unit && <span className="text-xs text-ink-400">{field.unit}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Live preview */}
      <section>
        <h3 className="text-sm font-semibold text-ink-700 mb-2 uppercase tracking-wider">Live Preview</h3>
        <div className="bg-surface-50 border border-surface-200 rounded-lg p-4 font-mono text-xs text-ink-600 space-y-1">
          <div>Founding plan: <span className="text-ink-900 font-semibold">{values.founding_plan_name}</span> @ <span className="text-brand-600 font-semibold">A${(values.founding_price_cents / 100).toFixed(values.founding_price_cents % 100 === 0 ? 0 : 2)}</span> · <span className="text-emerald-600">{values.founding_spots_total} spots</span> · <span className="text-amber-600">{values.founding_credits} credits</span></div>
          <div>Growth: <span className="text-ink-900">A${(values.growth_price_monthly_cents / 100).toFixed(0)}/mo</span> or <span className="text-ink-900">A${(values.growth_price_yearly_cents / 100).toFixed(0)}/yr</span></div>
          <div>Promo: <span className="text-ink-900 font-semibold">{values.promo_code}</span> — {values.promo_label}</div>
          <div>Early bird until: <span className="text-ink-900">{values.early_bird_deadline}</span></div>
          <div>Flags: founding_active=<span className={values.founding_plan_active ? "text-emerald-600" : "text-red-500"}>{String(values.founding_plan_active)}</span> · waitlist=<span className={values.waitlist_mode ? "text-amber-600" : "text-ink-500"}>{String(values.waitlist_mode)}</span></div>
        </div>
      </section>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !isDirty}
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
