"use client";

// useResellerAttribution — client-side reader for the current user's
// attributed reseller. Backs the topbar co-branding pill and any other
// customer-facing surface that must switch on reseller identity.
//
// Cache: per-tab, 60s TTL matching useEntitlement. Fetches once on mount
// and reuses across consumers via a module-level cache + listener set.
//
// Anonymous / non-attributed users return `{ reseller: null }`; the pill
// component renders nothing in that case.

import * as React from "react";

export interface AttributedReseller {
  code: string;
  display_name: string;
  logo_url: string | null;
  primary_color: string | null;
  billing_model: "retail" | "wholesale";
}

interface Snapshot {
  reseller: AttributedReseller | null;
}

interface CacheEntry {
  data: Snapshot;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60_000;
let memCache: CacheEntry | null = null;
const listeners = new Set<(snap: Snapshot) => void>();

async function fetchSnapshot(): Promise<Snapshot> {
  try {
    const res = await fetch("/api/reseller/me", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return { reseller: null };
    const json = (await res.json()) as { ok?: boolean; reseller?: AttributedReseller | null };
    if (!json.ok) return { reseller: null };
    return { reseller: json.reseller ?? null };
  } catch {
    return { reseller: null };
  }
}

function broadcast(snap: Snapshot): void {
  memCache = { data: snap, fetchedAt: Date.now() };
  for (const cb of listeners) cb(snap);
}

async function refresh(force = false): Promise<Snapshot> {
  if (!force && memCache && Date.now() - memCache.fetchedAt < CACHE_TTL_MS) {
    return memCache.data;
  }
  const snap = await fetchSnapshot();
  broadcast(snap);
  return snap;
}

export interface UseResellerAttributionResult {
  reseller: AttributedReseller | null;
  isLoading: boolean;
  refresh: () => Promise<Snapshot>;
}

export function useResellerAttribution(): UseResellerAttributionResult {
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(
    () => memCache?.data ?? null,
  );
  const [isLoading, setIsLoading] = React.useState<boolean>(!memCache);

  React.useEffect(() => {
    let cancelled = false;
    const listener = (snap: Snapshot) => {
      if (cancelled) return;
      setSnapshot(snap);
      setIsLoading(false);
    };
    listeners.add(listener);

    (async () => {
      try {
        const snap = await refresh();
        if (!cancelled) {
          setSnapshot(snap);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      listeners.delete(listener);
    };
  }, []);

  return {
    reseller: snapshot?.reseller ?? null,
    isLoading,
    refresh: () => refresh(true),
  };
}
