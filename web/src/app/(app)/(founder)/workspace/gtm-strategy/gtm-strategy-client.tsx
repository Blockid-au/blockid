"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { GtmStrategy } from "@/lib/founder-features";

interface Props {
  initial: GtmStrategy | null;
  disabled: boolean;
  placeholders: { segment: string; valueProp: string };
}

interface FormState {
  target_segment: string;
  problem_statement: string;
  value_prop: string;
  positioning: string;
  primary_channel: string;
  secondary_channels: string; // comma-separated in the UI
  sales_motion: string;
  price_anchor: string;
  launch_plan: string;
  north_star_metric: string;
  north_star_target: string;
}

function toForm(s: GtmStrategy | null): FormState {
  return {
    target_segment: s?.target_segment ?? "",
    problem_statement: s?.problem_statement ?? "",
    value_prop: s?.value_prop ?? "",
    positioning: s?.positioning ?? "",
    primary_channel: s?.primary_channel ?? "",
    secondary_channels: (s?.secondary_channels ?? []).join(", "),
    sales_motion: s?.sales_motion ?? "",
    price_anchor: s?.price_anchor ?? "",
    launch_plan: s?.launch_plan ?? "",
    north_star_metric: s?.north_star_metric ?? "",
    north_star_target: s?.north_star_target == null ? "" : String(s.north_star_target),
  };
}

const SALES_MOTIONS = [
  { value: "", label: "— pick one —" },
  { value: "self-serve", label: "Self-serve (PLG)" },
  { value: "sales-assisted", label: "Sales-assisted" },
  { value: "enterprise", label: "Enterprise (top-down)" },
];

const CHANNELS = [
  { value: "", label: "— pick one —" },
  { value: "founder-led-outbound", label: "Founder-led outbound" },
  { value: "seo-content", label: "SEO / content" },
  { value: "paid-ads", label: "Paid ads" },
  { value: "partnerships", label: "Partnerships / channel" },
  { value: "communities", label: "Communities / word-of-mouth" },
  { value: "events", label: "Events / conferences" },
  { value: "product-led", label: "Product-led (viral / self-serve)" },
];

export function GtmStrategyClient({ initial, disabled, placeholders }: Props) {
  const [form, setForm] = useState<FormState>(toForm(initial));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  function upd<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(null);
  }

  async function aiSuggest() {
    setAiBusy(true);
    setError(null);
    setAiNote(null);
    try {
      const res = await fetch("/api/founder/gtm/ai-fill", { method: "POST" });
      const json = await res.json() as {
        ok: boolean;
        error?: string;
        suggestion?: Partial<FormState> & { secondary_channels?: string[] };
        meta?: { note?: string };
      };
      if (!json.ok) throw new Error(json.error ?? "AI suggest failed");
      const s = json.suggestion;
      if (s) {
        setForm((f) => ({
          ...f,
          target_segment: s.target_segment ?? f.target_segment,
          problem_statement: s.problem_statement ?? f.problem_statement,
          value_prop: s.value_prop ?? f.value_prop,
          positioning: s.positioning ?? f.positioning,
          primary_channel: s.primary_channel ?? f.primary_channel,
          secondary_channels: Array.isArray(s.secondary_channels)
            ? s.secondary_channels.join(", ")
            : f.secondary_channels,
          sales_motion: s.sales_motion ?? f.sales_motion,
          price_anchor: s.price_anchor ?? f.price_anchor,
          launch_plan: s.launch_plan ?? f.launch_plan,
          north_star_metric: s.north_star_metric ?? f.north_star_metric,
          north_star_target: s.north_star_target != null ? String(s.north_star_target) : f.north_star_target,
        }));
        setAiNote(json.meta?.note ?? null);
        setSaved(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI suggest failed");
    } finally {
      setAiBusy(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        secondary_channels: form.secondary_channels
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        north_star_target:
          form.north_star_target.trim() === "" ? null : Number(form.north_star_target),
      };
      const res = await fetch("/api/founder/gtm", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Save failed");
      setSaved(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const fieldWrap = "space-y-1.5";
  const label = "text-xs font-semibold text-ink-700 uppercase tracking-wider";
  const input =
    "w-full rounded-xl border border-surface-300 bg-white px-3 py-2 text-sm text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50";

  return (
    <fieldset disabled={disabled} className="space-y-8">
      {/* ── AI Suggest bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between rounded-2xl border border-surface-200 bg-white px-5 py-3">
        <p className="text-xs text-ink-500">
          {aiNote ?? "Use AI to pre-fill your GTM strategy based on your startup profile."}
        </p>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={aiSuggest}
          disabled={aiBusy || disabled}
          className="gap-1.5 text-brand-600 hover:text-brand-700 ml-3 shrink-0"
        >
          {aiBusy ? (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
          ) : (
            <span aria-hidden>✨</span>
          )}
          {aiBusy ? "Generating…" : "AI Suggest"}
        </Button>
      </div>

      {/* ── Who + what ──────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-surface-200 bg-white p-6 space-y-5">
        <h2 className="text-sm font-semibold text-ink-800">1 · Segment & problem</h2>
        <div className={fieldWrap}>
          <label className={label}>Target segment / ICP</label>
          <input
            className={input}
            value={form.target_segment}
            placeholder={placeholders.segment}
            onChange={(e) => upd("target_segment", e.target.value)}
          />
        </div>
        <div className={fieldWrap}>
          <label className={label}>Problem statement</label>
          <textarea
            className={input}
            rows={3}
            value={form.problem_statement}
            placeholder="What pain do they feel today? How do they solve it now?"
            onChange={(e) => upd("problem_statement", e.target.value)}
          />
        </div>
      </section>

      {/* ── Value prop + positioning ────────────────────────────────────────── */}
      <section className="rounded-2xl border border-surface-200 bg-white p-6 space-y-5">
        <h2 className="text-sm font-semibold text-ink-800">2 · Value proposition</h2>
        <div className={fieldWrap}>
          <label className={label}>Value prop (one sentence)</label>
          <input
            className={input}
            value={form.value_prop}
            placeholder={placeholders.valueProp}
            onChange={(e) => upd("value_prop", e.target.value)}
          />
        </div>
        <div className={fieldWrap}>
          <label className={label}>Positioning vs alternatives</label>
          <textarea
            className={input}
            rows={3}
            value={form.positioning}
            placeholder="Where do you win vs the top 2 alternatives?"
            onChange={(e) => upd("positioning", e.target.value)}
          />
        </div>
      </section>

      {/* ── Channels + motion ───────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-surface-200 bg-white p-6 space-y-5">
        <h2 className="text-sm font-semibold text-ink-800">3 · Channels & sales motion</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className={fieldWrap}>
            <label className={label}>Primary channel</label>
            <select
              className={input}
              value={form.primary_channel}
              onChange={(e) => upd("primary_channel", e.target.value)}
            >
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className={fieldWrap}>
            <label className={label}>Sales motion</label>
            <select
              className={input}
              value={form.sales_motion}
              onChange={(e) => upd("sales_motion", e.target.value)}
            >
              {SALES_MOTIONS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className={fieldWrap}>
          <label className={label}>Secondary channels (comma-separated)</label>
          <input
            className={input}
            value={form.secondary_channels}
            placeholder="e.g. LinkedIn, podcasts, partner referrals"
            onChange={(e) => upd("secondary_channels", e.target.value)}
          />
        </div>
      </section>

      {/* ── Pricing anchor + north-star ─────────────────────────────────────── */}
      <section className="rounded-2xl border border-surface-200 bg-white p-6 space-y-5">
        <h2 className="text-sm font-semibold text-ink-800">4 · Pricing & north-star</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className={fieldWrap}>
            <label className={label}>Price anchor</label>
            <input
              className={input}
              value={form.price_anchor}
              placeholder="e.g. A$99/mo per company"
              onChange={(e) => upd("price_anchor", e.target.value)}
            />
          </div>
          <div className={fieldWrap}>
            <label className={label}>North-star metric</label>
            <input
              className={input}
              value={form.north_star_metric}
              placeholder="e.g. activated startups / week"
              onChange={(e) => upd("north_star_metric", e.target.value)}
            />
          </div>
          <div className={fieldWrap}>
            <label className={label}>North-star target (12 mo)</label>
            <input
              type="number"
              className={input}
              value={form.north_star_target}
              placeholder="e.g. 100"
              onChange={(e) => upd("north_star_target", e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* ── Launch plan ────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-surface-200 bg-white p-6 space-y-5">
        <h2 className="text-sm font-semibold text-ink-800">5 · Launch plan</h2>
        <div className={fieldWrap}>
          <label className={label}>Next 30/60/90 days</label>
          <textarea
            className={input}
            rows={6}
            value={form.launch_plan}
            placeholder="30 days: ...&#10;60 days: ...&#10;90 days: ..."
            onChange={(e) => upd("launch_plan", e.target.value)}
          />
        </div>
      </section>

      {/* ── Save bar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-surface-200 bg-surface-50 px-5 py-4">
        <div className="text-xs text-ink-500">
          {error && <span className="text-red-600">{error}</span>}
          {!error && saved && <span className="text-emerald-700">Saved at {saved}</span>}
          {!error && !saved && <span>Changes are saved manually.</span>}
        </div>
        <Button onClick={save} disabled={saving || disabled}>
          {saving ? "Saving…" : "Save GTM strategy"}
        </Button>
      </div>
    </fieldset>
  );
}
