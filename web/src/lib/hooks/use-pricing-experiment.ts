"use client";

/**
 * usePricingExperiment — thin client-side consumer of the T0206 pricing /
 * conversion experiment harness.
 *
 * Design notes:
 *   * Session bucketing is stable per browser via `localStorage` — the
 *     bucket key is generated in a `useState` initializer so both the
 *     assign fetch and any subsequent conversion see the same id, and
 *     StrictMode double-render does not resample.
 *   * We only run ONE `useEffect` (the fetch). No cascading setState-in-
 *     effect: the effect resolves the fetch and writes state exactly once.
 *   * 404 is treated as "experiment not running" and returned as
 *     `{ variantKey: null, payload: null }` so callers can render their
 *     hard-coded control gracefully — a broken experiment must never take
 *     the surface down.
 *   * The impression event fires exactly once per (experiment, session)
 *     pair after the assign succeeds. The `keepalive` fetch option keeps
 *     the request alive across navigation so a click-through still records.
 *   * `recordConversion(valueAud?)` is a stable closure returned from the
 *     hook; callers wire it into their existing submit / CTA handlers.
 */

import { useEffect, useState } from "react";

const SESSION_KEY = "blockid_exp_sid";

function makeSessionId(): string {
  if (typeof window === "undefined") {
    // SSR path — the effect that consumes this only runs on the client, so
    // this branch is defensive. Returning a stable-ish placeholder here
    // keeps types happy without leaking anything sensitive.
    return "ssr-placeholder";
  }
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const cryptoRef = globalThis.crypto;
    const fresh =
      cryptoRef && typeof cryptoRef.randomUUID === "function"
        ? cryptoRef.randomUUID()
        : `sid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    // Private-mode / disabled storage — fall back to an in-memory id.
    // The user will resample per pageload, which is acceptable and
    // strictly better than crashing the hook.
    return `sid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export interface UsePricingExperiment<T> {
  variantKey: string | null;
  payload: T | null;
  loading: boolean;
  recordConversion: (valueAud?: number) => void;
}

interface AssignResponse {
  ok?: boolean;
  variantKey?: unknown;
  payload?: unknown;
}

export function usePricingExperiment<T = Record<string, unknown>>(
  name: string,
): UsePricingExperiment<T> {
  const [sessionId] = useState<string>(() => makeSessionId());
  const [variantKey, setVariantKey] = useState<string | null>(null);
  const [payload, setPayload] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    const abort =
      typeof AbortController !== "undefined" ? new AbortController() : null;

    (async () => {
      try {
        const url = `/api/pricing-test/assign?experiment=${encodeURIComponent(name)}&bucket=${encodeURIComponent(sessionId)}`;
        const res = await fetch(url, {
          cache: "no-store",
          signal: abort?.signal,
        });
        if (cancelled) return;
        if (!res.ok) {
          // 404 = not running. Silent fallback to control.
          setLoading(false);
          return;
        }
        const data = (await res.json()) as AssignResponse;
        if (cancelled) return;
        const assignedKey =
          typeof data.variantKey === "string" ? data.variantKey : null;
        if (data.ok && assignedKey) {
          setVariantKey(assignedKey);
          setPayload((data.payload as T) ?? null);
          // Fire-and-forget impression. `keepalive` so it survives a
          // near-immediate navigation triggered by the very CTA under test.
          void fetch("/api/pricing-test/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              experiment: name,
              variantKey: assignedKey,
              type: "impression",
              sessionId,
            }),
            keepalive: true,
          }).catch(() => {
            /* public hot path — never throw */
          });
        }
        setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      abort?.abort();
    };
  }, [name, sessionId]);

  const recordConversion = (valueAud?: number): void => {
    if (!variantKey) return;
    void fetch("/api/pricing-test/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        experiment: name,
        variantKey,
        type: "conversion",
        sessionId,
        valueAud,
      }),
      keepalive: true,
    }).catch(() => {
      /* public hot path — never throw */
    });
  };

  return { variantKey, payload, loading, recordConversion };
}
