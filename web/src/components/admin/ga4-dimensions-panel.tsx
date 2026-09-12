"use client";

// GA4 custom-dimension panel on /admin/growth (S23-B).
//
// Loads the dry-run diff from GET /api/admin/ga4/register-dimensions on
// mount, shows registered / missing dimensions, and offers a "Register
// missing" button (POST). When the Admin API is disabled in the GCP project
// or the service account is not an Editor on the property, the response
// carries `blocked.steps` — the two operator actions — and the panel renders
// them verbatim instead of the button.

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, Tag } from "lucide-react";
import { GA4_CUSTOM_DIMENSIONS } from "@/lib/analytics/ga4-dimensions";

interface Blocked {
  reason: string;
  steps: string[];
  message: string;
}

export interface PanelResult {
  ok: boolean;
  dryRun: boolean;
  property: string | null;
  serviceAccount: string | null;
  created: string[];
  existing: string[];
  missing: string[];
  unmanaged: string[];
  blocked: Blocked | null;
  error: string | null;
}

const REASON_LABEL: Record<string, string> = {
  api_disabled: "Google Analytics Admin API is disabled in the GCP project",
  permission_denied: "Service account is not an Editor on the GA4 property",
  insufficient_scope: "Service account token lacks the analytics.edit scope",
  unauthenticated: "Service-account credentials were rejected",
  not_configured: "GA4_PROPERTY_ID / service-account env not set",
};

export function Ga4DimensionsPanel() {
  const [result, setResult] = useState<PanelResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The fetch only touches state after the await, so the mount effect never
  // sets state synchronously (react-hooks/set-state-in-effect).
  const fetchDiff = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ga4/register-dimensions", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as PanelResult;
      setResult(body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-only fetch; every setState sits behind an await (same as ga4-traffic-report.tsx)
  useEffect(() => { void fetchDiff(); }, [fetchDiff]);

  function reload() {
    setLoading(true);
    setError(null);
    void fetchDiff();
  }

  async function apply() {
    setApplying(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/ga4/register-dimensions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      });
      const body = (await res.json().catch(() => null)) as PanelResult | { error?: string } | null;
      if (!res.ok) throw new Error((body as { error?: string } | null)?.error ?? `HTTP ${res.status}`);
      setResult(body as PanelResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  return <Ga4DimensionsPanelView result={result} loading={loading} applying={applying} error={error} onReload={reload} onApply={() => void apply()} />;
}

export interface Ga4DimensionsPanelViewProps {
  result: PanelResult | null;
  loading: boolean;
  applying: boolean;
  error: string | null;
  onReload: () => void;
  onApply: () => void;
}

/** Pure presentational half (renderable with renderToStaticMarkup in tests). */
export function Ga4DimensionsPanelView({ result, loading, applying, error, onReload, onApply }: Ga4DimensionsPanelViewProps) {
  const wanted = GA4_CUSTOM_DIMENSIONS;
  const registered = new Set([...(result?.existing ?? []), ...(result?.created ?? [])]);
  const blocked = result?.blocked ?? null;
  const allDone = !!result && !blocked && result.missing.length === 0;

  return (
    <section id="ga4-dimensions" className="scroll-mt-24 rounded-xl border border-surface-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink-800 flex items-center gap-2">
          <Tag strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
          GA4 custom dimensions
        </h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onReload}
            disabled={loading || applying}
            className="text-xs text-ink-600 hover:text-ink-800 inline-flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw strokeWidth={1.75} className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Re-check
          </button>
          {result && !blocked && !allDone && (
            <button
              type="button"
              onClick={onApply}
              disabled={applying || loading}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {applying ? "Registering…" : `Register ${result.missing.length} missing`}
            </button>
          )}
        </div>
      </div>
      <p className="mt-1 text-xs text-ink-600">
        Event-scoped params GA4 must know about before they appear in explorations — the hero one-liner A/B needs{" "}
        <code className="font-mono">arm</code> (“Hero variant”). Source: <code className="font-mono">src/lib/analytics/ga4-dimensions.ts</code>; CLI:{" "}
        <code className="font-mono">node scripts/ga4-register-dimensions.mjs --apply</code>.
        {result?.property && (
          <>
            {" "}
            Property <code className="font-mono">{result.property}</code>.
          </>
        )}
      </p>

      {error && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      )}

      {blocked && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4" role="status" data-testid="ga4-dimensions-blocked">
          <p className="flex items-start gap-2 text-sm font-medium text-amber-800">
            <AlertTriangle strokeWidth={1.75} className="mt-0.5 h-4 w-4 shrink-0" />
            Blocked — {REASON_LABEL[blocked.reason] ?? blocked.reason}
          </p>
          {blocked.message && <p className="mt-1 pl-6 text-xs text-amber-700 break-words">{blocked.message}</p>}
          <p className="mt-3 pl-6 text-xs font-semibold text-amber-800">Operator steps (the service account cannot do these itself):</p>
          <ol className="mt-1 space-y-2 pl-6 text-xs text-amber-900">
            {blocked.steps.map((step) => (
              <li key={step} className="break-words">
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}

      {allDone && (
        <p className="mt-4 flex items-center gap-2 text-sm text-emerald-700" data-testid="ga4-dimensions-ok">
          <CheckCircle2 strokeWidth={1.75} className="h-4 w-4" />
          All {wanted.length} dimensions are registered
          {result.created.length > 0 && ` (${result.created.length} created just now)`}.
        </p>
      )}

      {result?.error && !blocked && <p className="mt-3 text-xs text-red-600">{result.error}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-ink-500">
              <th className="py-1 pr-3 font-medium">Param</th>
              <th className="py-1 pr-3 font-medium">Display name</th>
              <th className="py-1 pr-3 font-medium">Events</th>
              <th className="py-1 font-medium">State</th>
            </tr>
          </thead>
          <tbody>
            {wanted.map((d) => {
              const state = !result || blocked ? "unknown" : registered.has(d.parameterName) ? "registered" : "missing";
              return (
                <tr key={`${d.scope}:${d.parameterName}`} className="border-t border-surface-100">
                  <td className="py-1.5 pr-3 font-mono text-ink-800">{d.parameterName}</td>
                  <td className="py-1.5 pr-3 text-ink-700">{d.displayName}</td>
                  <td className="py-1.5 pr-3 font-mono text-[11px] text-ink-500">{d.events.join(", ")}</td>
                  <td className="py-1.5">
                    <span
                      className={
                        state === "registered"
                          ? "rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700"
                          : state === "missing"
                            ? "rounded bg-amber-50 px-1.5 py-0.5 text-amber-700"
                            : "rounded bg-surface-100 px-1.5 py-0.5 text-ink-500"
                      }
                    >
                      {loading ? "…" : state}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {result && result.unmanaged.length > 0 && (
        <p className="mt-2 text-[11px] text-ink-500">
          Also on the property (not managed here): <code className="font-mono">{result.unmanaged.join(", ")}</code>
        </p>
      )}
    </section>
  );
}

export default Ga4DimensionsPanel;
