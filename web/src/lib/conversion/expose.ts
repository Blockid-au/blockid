// Client-side experiment exposure helper (T-0413 wiring).
//
// Any client component that wants to see an experiment variant calls
// `useExposeExperiment(id)` on mount — this hits the existing
// `/api/experiments/expose` route, which is a deterministic bucketer +
// persistence layer. The server returns the same variant for the same
// user across sessions.
//
// The plain `exposeExperiment(id)` function is exported for callers
// that need it outside a React render (e.g. one-off analytics fires).

"use client";

import * as React from "react";

export interface ExposeResponse {
  ok?: boolean;
  experiment_id?: string;
  variant?: string;
  active?: boolean;
}

/**
 * POST the given experiment_id to the exposure endpoint and return the
 * variant string (or `null` on any failure).
 *
 * Failures — network error, non-2xx, malformed JSON, missing variant —
 * all resolve to `null` so callers can render a safe default.
 */
export async function exposeExperiment(experimentId: string): Promise<string | null> {
  try {
    const res = await fetch("/api/experiments/expose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experiment_id: experimentId }),
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ExposeResponse;
    if (!body || typeof body.variant !== "string" || body.variant.length === 0) {
      return null;
    }
    return body.variant;
  } catch {
    // Analytics-only path: swallow everything so the caller can render.
    return null;
  }
}

export interface UseExposeExperimentResult {
  variant: string | null;
  isLoading: boolean;
}

/**
 * React hook — fires `exposeExperiment(id)` once on mount and returns
 * `{ variant, isLoading }`. Safe to call from a client component; the
 * fetch never runs during SSR because the effect only runs client-side.
 */
export function useExposeExperiment(id: string): UseExposeExperimentResult {
  const [variant, setVariant] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    void exposeExperiment(id).then((v) => {
      if (cancelled) return;
      setVariant(v);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { variant, isLoading };
}
