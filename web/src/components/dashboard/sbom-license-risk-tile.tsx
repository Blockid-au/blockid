"use client";

// P7-sbom-license-risk-tile — client tile that renders the /api/dataroom/sbom
// JSON `license_risk` block. Founder-facing surface for §2 data-room folder
// 7.9 (Open-Source License Inventory) and folder 4.9 (Third-Party Dependency
// Inventory) — investors doing pre-signature diligence want to see the
// strong-copyleft / weak-copyleft / unknown exposure at a glance without
// exporting the CSV.
//
// Mounted 2026-07-25 at web/src/app/dashboard/data-room/page.tsx (top of
// the page, above the investor-access-log table). Playwright round-trip
// at web/tests/e2e/founder/sbom-license-risk-tile.spec.ts covers the
// loading / error / slate / red / amber / emerald branches.
//
// The API route is public (see route.ts — the lock file already ships in the
// repo) so this tile does not need auth; it can render on any workspace page.

import { useCallback, useEffect, useState } from "react";
import type { LicenseRiskEntry } from "@/lib/dataroom/sbom-license-risk";
import {
  countHiddenRisky,
  pickSbomTileView,
  RISK_BAND_COLOUR,
  RISK_BAND_LABEL,
  RISK_BAND_ORDER,
  type SbomTileBand,
  type SbomTilePayload,
} from "./sbom-license-risk-tile.helpers";

const BAND_STYLES: Record<
  SbomTileBand,
  { border: string; bg: string; text: string; chip: string }
> = {
  red: {
    border: "border-rose-300",
    bg: "bg-rose-50/70",
    text: "text-rose-800",
    chip: "bg-rose-100 text-rose-800",
  },
  amber: {
    border: "border-amber-300",
    bg: "bg-amber-50/70",
    text: "text-amber-800",
    chip: "bg-amber-100 text-amber-800",
  },
  emerald: {
    border: "border-emerald-300",
    bg: "bg-emerald-50/70",
    text: "text-emerald-800",
    chip: "bg-emerald-100 text-emerald-800",
  },
  slate: {
    border: "border-slate-200",
    bg: "bg-slate-50",
    text: "text-slate-700",
    chip: "bg-slate-200 text-slate-700",
  },
};

const DEFAULT_ROW_CAP = 5;

interface SbomLicenseRiskTileProps {
  /** Optional row cap for runtime_risky[] — defaults to 5. */
  rowCap?: number;
}

export function SbomLicenseRiskTile({ rowCap = DEFAULT_ROW_CAP }: SbomLicenseRiskTileProps) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; error: string }
    | { kind: "ready"; payload: SbomTilePayload }
  >({ kind: "loading" });

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/dataroom/sbom", {
        cache: "no-store",
      });
      if (!res.ok) {
        setState({ kind: "error", error: `HTTP ${res.status}` });
        return;
      }
      const body = (await res.json()) as SbomTilePayload | Record<string, unknown>;
      // Reject older responses that predate the license_risk wire-in.
      if (!body || typeof body !== "object" || !("license_risk" in body)) {
        setState({ kind: "error", error: "missing_license_risk" });
        return;
      }
      setState({ kind: "ready", payload: body as SbomTilePayload });
    } catch (err) {
      setState({
        kind: "error",
        error: err instanceof Error ? err.message : "fetch_failed",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.kind === "loading") {
    const view = pickSbomTileView(null, rowCap);
    const styles = BAND_STYLES[view.colour];
    return (
      <section
        data-testid="sbom-license-risk-tile"
        data-state="loading"
        data-band={view.colour}
        className={`rounded-xl border ${styles.border} ${styles.bg} p-4 shadow-sm`}
      >
        <div className="mb-2 h-4 w-32 animate-pulse rounded bg-slate-200" />
        <div className="mb-3 h-5 w-3/4 animate-pulse rounded bg-slate-200" />
        <div className="h-16 w-full animate-pulse rounded bg-slate-100" />
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section
        data-testid="sbom-license-risk-tile"
        data-state="error"
        data-band="red"
        className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm"
      >
        <p className="mb-2 font-medium text-rose-800">
          SBOM license-risk unavailable
        </p>
        <p className="mb-3 text-rose-700" data-testid="sbom-license-risk-error">
          {state.error}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          data-testid="sbom-license-risk-retry"
          className="rounded border border-rose-300 bg-white px-3 py-1 text-xs font-medium text-rose-800 hover:bg-rose-100"
        >
          Retry
        </button>
      </section>
    );
  }

  const view = pickSbomTileView(state.payload, rowCap);
  const styles = BAND_STYLES[view.colour];
  const runtimeCounts = state.payload.license_risk.counts_runtime;
  const hidden = countHiddenRisky(state.payload.license_risk, rowCap);

  return (
    <section
      data-testid="sbom-license-risk-tile"
      data-state="ready"
      data-band={view.colour}
      data-runtime-total={view.runtimeTotal}
      data-dev-total={view.devTotal}
      className={`flex flex-col gap-3 rounded-xl border ${styles.border} ${styles.bg} p-4 shadow-sm`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className={`text-base font-semibold ${styles.text}`}>
            {view.headline}
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            SBOM · {state.payload.root_name}@{state.payload.root_version} ·{" "}
            <a
              href="/api/dataroom/sbom"
              className="underline underline-offset-2 hover:text-indigo-700"
              data-testid="sbom-license-risk-json-link"
            >
              open JSON ↗
            </a>{" "}
            ·{" "}
            <a
              href="/api/dataroom/sbom?format=csv"
              className="underline underline-offset-2 hover:text-indigo-700"
              data-testid="sbom-license-risk-csv-link"
            >
              CSV ↗
            </a>
          </p>
        </div>
        <span
          data-testid="sbom-license-risk-chip"
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles.chip}`}
        >
          {view.chipLabel}
        </span>
      </header>

      <p className="text-sm text-slate-700">{view.body}</p>

      {/* Counts row — always render, even when 0, so the founder sees the shape. */}
      <ul
        data-testid="sbom-license-risk-counts"
        className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6"
      >
        {RISK_BAND_ORDER.map((band) => {
          const bandStyles = BAND_STYLES[RISK_BAND_COLOUR[band]];
          return (
            <li
              key={band}
              data-band={band}
              data-count={runtimeCounts[band]}
              className={`rounded-md border ${bandStyles.border} bg-white px-2 py-1.5`}
            >
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {RISK_BAND_LABEL[band]}
              </p>
              <p className={`text-base font-semibold ${bandStyles.text}`}>
                {runtimeCounts[band]}
              </p>
            </li>
          );
        })}
      </ul>

      {view.rows.length > 0 && (
        <div className="border-t border-slate-200 pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Runtime packages needing review
          </p>
          <ul data-testid="sbom-license-risk-rows" className="space-y-1.5">
            {view.rows.map((row) => (
              <SbomRiskRow key={`${row.name}@${row.version}`} row={row} />
            ))}
          </ul>
          {hidden > 0 && (
            <p
              data-testid="sbom-license-risk-more"
              className="mt-2 text-xs text-slate-500"
            >
              +{hidden} more — open the JSON above for the full list.
            </p>
          )}
        </div>
      )}

      <p className="text-[10px] leading-relaxed text-slate-500">
        {view.disclaimer}
      </p>
    </section>
  );
}

function SbomRiskRow({ row }: { row: LicenseRiskEntry }) {
  const bandStyles = BAND_STYLES[RISK_BAND_COLOUR[row.band]];
  return (
    <li
      data-testid="sbom-license-risk-row"
      data-band={row.band}
      data-license={row.license || "UNKNOWN"}
      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm"
    >
      <span className="min-w-0 flex-1 truncate font-mono text-slate-800">
        {row.name}
        <span className="text-slate-400">@{row.version}</span>
      </span>
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${bandStyles.chip}`}
      >
        {RISK_BAND_LABEL[row.band]} · {row.license || "UNKNOWN"}
      </span>
    </li>
  );
}

export default SbomLicenseRiskTile;
