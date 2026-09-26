// G33 T15 — one GET /api/stripe/trial-status per page load.
//
// The workspace layout mounts <TrialBanner>, <TrialDayWatcher> and
// <TrialCountdownBanner> in the same commit and each fetched the same
// endpoint (nginx: 3 identical calls in the same second on most workspace
// page loads). Callers now share the request that is already on the wire.
// Nothing is cached after it settles, so freshness is exactly as before:
// the next mount (next navigation) fetches again.

export const TRIAL_STATUS_URL = "/api/stripe/trial-status";

export type TrialStatusResult = { ok: boolean; body: unknown };

let inflight: Promise<TrialStatusResult> | null = null;

async function load(): Promise<TrialStatusResult> {
  const res = await fetch(TRIAL_STATUS_URL, {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) return { ok: false, body: null };
  return { ok: true, body: (await res.json()) as unknown };
}

/** Shared in-flight trial-status read; rejects (for every caller) on a network / JSON error. */
export function fetchTrialStatusShared(): Promise<TrialStatusResult> {
  if (inflight) return inflight;
  const request = load();
  inflight = request;
  request.then(
    () => {
      if (inflight === request) inflight = null;
    },
    () => {
      if (inflight === request) inflight = null;
    },
  );
  return request;
}
