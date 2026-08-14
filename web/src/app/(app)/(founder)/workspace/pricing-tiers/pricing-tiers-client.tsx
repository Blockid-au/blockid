"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PricingTier } from "@/lib/founder-features";

interface Props {
  initial: PricingTier[];
  disabled: boolean;
}

interface Draft {
  name: string;
  model: PricingTier["model"];
  price_monthly_aud: string;
  price_annual_aud: string;
  billing_note: string;
  features: string; // newline-separated in the UI
  target_segment: string;
  cta_label: string;
  sort_order: string;
}

const EMPTY_DRAFT: Draft = {
  name: "",
  model: "flat",
  price_monthly_aud: "",
  price_annual_aud: "",
  billing_note: "",
  features: "",
  target_segment: "",
  cta_label: "Start free trial",
  sort_order: "0",
};

const MODEL_LABEL: Record<PricingTier["model"], string> = {
  freemium: "Freemium",
  flat: "Flat",
  per_seat: "Per seat",
  usage: "Usage-based",
  tiered: "Tiered",
  enterprise: "Enterprise",
};

function fmt(n: number | null): string {
  if (n == null) return "—";
  return `A$${Number(n).toLocaleString()}`;
}

export function PricingTiersClient({ initial, disabled }: Props) {
  const [tiers, setTiers] = useState<PricingTier[]>(initial);
  const [draft, setDraft] = useState<Draft>({ ...EMPTY_DRAFT });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  const input =
    "w-full rounded-xl border border-surface-300 bg-white px-3 py-2 text-sm text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50";
  const label = "text-xs font-semibold text-ink-700 uppercase tracking-wider";

  async function add() {
    if (!draft.name.trim()) {
      setError("Tier name required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        ...draft,
        price_monthly_aud:
          draft.price_monthly_aud === "" ? null : Number(draft.price_monthly_aud),
        price_annual_aud:
          draft.price_annual_aud === "" ? null : Number(draft.price_annual_aud),
        sort_order: Number(draft.sort_order) || 0,
        features: draft.features
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      const res = await fetch("/api/founder/pricing-tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Add failed");
      setTiers((xs) => [...xs, json.item as PricingTier]);
      setDraft({ ...EMPTY_DRAFT });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Add failed");
    } finally {
      setBusy(false);
    }
  }

  async function aiSuggest() {
    setAiBusy(true);
    setError(null);
    setAiNote(null);
    try {
      const res = await fetch("/api/founder/pricing-tiers/ai-fill", { method: "POST" });
      const json = await res.json() as {
        ok: boolean;
        error?: string;
        suggestions?: Array<{
          name: string;
          model: Draft["model"];
          price_monthly_aud: number | null;
          price_annual_aud: number | null;
          billing_note: string;
          features: string[];
          target_segment: string;
          cta_label: string;
          sort_order: number;
        }>;
        meta?: { benchmark?: { sources?: string[] } };
      };
      if (!json.ok) throw new Error(json.error ?? "AI suggest failed");
      const suggestions = json.suggestions ?? [];
      if (suggestions.length > 0) {
        // Pre-fill the draft form with the first non-free suggestion
        const s = suggestions.find((t) => (t.price_monthly_aud ?? 0) > 0) ?? suggestions[0];
        setDraft({
          name: s.name,
          model: s.model,
          price_monthly_aud: s.price_monthly_aud != null ? String(s.price_monthly_aud) : "",
          price_annual_aud: s.price_annual_aud != null ? String(s.price_annual_aud) : "",
          billing_note: s.billing_note,
          features: s.features.join("\n"),
          target_segment: s.target_segment,
          cta_label: s.cta_label,
          sort_order: String(s.sort_order),
        });
        const sources = json.meta?.benchmark?.sources?.slice(0, 2).join(", ");
        setAiNote(sources ? `Pricing benchmarks from: ${sources}` : "Pre-filled from AU market benchmarks.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI suggest failed");
    } finally {
      setAiBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this tier?")) return;
    const res = await fetch(`/api/founder/pricing-tiers/${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) setTiers((xs) => xs.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-6">
      {/* ── Preview ────────────────────────────────────────────────────────── */}
      {tiers.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-ink-700 uppercase tracking-wider mb-3">
            Preview
          </h2>
          <div className={`grid gap-4 ${tiers.length >= 4 ? "md:grid-cols-4" : `md:grid-cols-${Math.max(1, tiers.length)}`}`}>
            {tiers.map((t, idx) => {
              const isMiddle = tiers.length >= 3 && idx === Math.floor(tiers.length / 2);
              return (
                <div
                  key={t.id}
                  className={`rounded-2xl border p-5 relative ${isMiddle ? "border-brand-500 bg-brand-50/40 shadow-md" : "border-surface-200 bg-white"}`}
                >
                  {isMiddle && (
                    <span className="absolute -top-2 right-4 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
                      Most popular
                    </span>
                  )}
                  <h3 className="text-lg font-bold text-ink-800">{t.name}</h3>
                  <p className="text-xs text-ink-500 uppercase tracking-wide">
                    {MODEL_LABEL[t.model]}
                  </p>
                  <div className="mt-4">
                    <span className="text-2xl font-bold text-ink-800 tabular-nums">
                      {fmt(t.price_monthly_aud)}
                    </span>
                    {t.price_monthly_aud != null && <span className="text-sm text-ink-500">/mo</span>}
                  </div>
                  {t.price_annual_aud != null && (
                    <p className="text-xs text-ink-500 mt-0.5">
                      or {fmt(t.price_annual_aud)}/yr
                    </p>
                  )}
                  {t.billing_note && (
                    <p className="text-[11px] text-ink-400 mt-1">{t.billing_note}</p>
                  )}
                  {t.target_segment && (
                    <p className="text-xs text-ink-600 mt-3 italic">{t.target_segment}</p>
                  )}
                  <ul className="mt-4 space-y-1.5 text-sm text-ink-700">
                    {t.features.map((f, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-emerald-600">✓</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className={`mt-5 w-full rounded-xl px-3 py-2 text-sm font-semibold ${isMiddle ? "bg-brand-600 text-white" : "border border-surface-300 text-ink-700 bg-white"}`}
                  >
                    {t.cta_label ?? "Get started"}
                  </button>
                  <div className="mt-3 flex justify-end">
                    <Button size="xs" variant="ghost" onClick={() => remove(t.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Add form ────────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-surface-200 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-800">Add a tier</h2>
          <Button
            size="xs"
            variant="ghost"
            onClick={aiSuggest}
            disabled={aiBusy || disabled}
            className="gap-1.5 text-brand-600 hover:text-brand-700"
          >
            {aiBusy ? (
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
            ) : (
              <span aria-hidden>✨</span>
            )}
            {aiBusy ? "Generating…" : "AI Suggest"}
          </Button>
        </div>
        {aiNote && (
          <p className="rounded-lg bg-brand-50 border border-brand-200 px-3 py-2 text-xs text-brand-700">
            {aiNote}
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className={label}>Tier name *</label>
            <input
              className={input}
              value={draft.name}
              placeholder="e.g. Starter, Growth, Enterprise"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Model</label>
            <select
              className={input}
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value as Draft["model"] })}
              disabled={disabled}
            >
              {(Object.keys(MODEL_LABEL) as (keyof typeof MODEL_LABEL)[]).map((m) => (
                <option key={m} value={m}>{MODEL_LABEL[m]}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={label}>Sort order</label>
            <input
              type="number"
              className={input}
              value={draft.sort_order}
              onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Monthly price (AUD)</label>
            <input
              type="number"
              className={input}
              value={draft.price_monthly_aud}
              placeholder="Leave blank for 'Contact us'"
              onChange={(e) => setDraft({ ...draft, price_monthly_aud: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Annual price (AUD)</label>
            <input
              type="number"
              className={input}
              value={draft.price_annual_aud}
              onChange={(e) => setDraft({ ...draft, price_annual_aud: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Billing note</label>
            <input
              className={input}
              value={draft.billing_note}
              placeholder="billed annually / per user / …"
              onChange={(e) => setDraft({ ...draft, billing_note: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className={label}>Target segment</label>
            <input
              className={input}
              value={draft.target_segment}
              placeholder="e.g. Solo founders, 5–20 seat teams"
              onChange={(e) => setDraft({ ...draft, target_segment: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <label className={label}>CTA label</label>
            <input
              className={input}
              value={draft.cta_label}
              onChange={(e) => setDraft({ ...draft, cta_label: e.target.value })}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5 md:col-span-3">
            <label className={label}>Features (one per line)</label>
            <textarea
              className={input}
              rows={4}
              value={draft.features}
              placeholder={"Unlimited projects\nEmail support\n5 seats included"}
              onChange={(e) => setDraft({ ...draft, features: e.target.value })}
              disabled={disabled}
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          {error && <span className="text-xs text-red-600">{error}</span>}
          <Button onClick={add} disabled={busy || disabled} className="ml-auto">
            {busy ? "Adding…" : "Add tier"}
          </Button>
        </div>
      </section>
    </div>
  );
}
