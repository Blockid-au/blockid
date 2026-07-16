"use client";

// useEntitlement — client-side reader for the entitlement snapshot published
// by GET /api/entitlement/me. Caches per-tab for 60s to match the server-side
// plans-db TTL, and refreshes on window focus so plan upgrades reflect
// without a hard reload.

import * as React from "react";

import type { Feature } from "@/lib/entitlements";
import type { TrialSummary } from "@/lib/trial";

export interface EntitlementUser {
  id: string;
  plan: string;
  segment: string;
  jurisdiction?: string | null;
  legal_review_passed?: boolean;
}

export interface EntitlementSnapshot {
  user: EntitlementUser | null;
  entitlements: string[];
  trial: TrialSummary | null;
}

interface CacheEntry {
  data: EntitlementSnapshot;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60_000;
let memCache: CacheEntry | null = null;
const listeners = new Set<(snap: EntitlementSnapshot) => void>();

async function fetchSnapshot(): Promise<EntitlementSnapshot> {
  const res = await fetch("/api/entitlement/me", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    return { user: null, entitlements: [], trial: null };
  }
  const json = (await res.json()) as Partial<EntitlementSnapshot> & {
    user_id?: string;
    plan?: string;
    segment?: string;
    jurisdiction?: string | null;
  };

  // Accept either the flat shape returned by /api/entitlement/me
  // ({ user_id, plan, segment, jurisdiction, entitlements, trial })
  // or the nested { user, entitlements, trial } shape.
  const user: EntitlementUser | null = json.user
    ? json.user
    : json.user_id
      ? {
          id: json.user_id,
          plan: json.plan ?? "free",
          segment: json.segment ?? "founder",
          jurisdiction: json.jurisdiction ?? null,
        }
      : null;

  return {
    user,
    entitlements: json.entitlements ?? [],
    trial: json.trial ?? null,
  };
}

function broadcast(snap: EntitlementSnapshot): void {
  memCache = { data: snap, fetchedAt: Date.now() };
  for (const cb of listeners) cb(snap);
}

async function refresh(force = false): Promise<EntitlementSnapshot> {
  if (
    !force &&
    memCache &&
    Date.now() - memCache.fetchedAt < CACHE_TTL_MS
  ) {
    return memCache.data;
  }
  const snap = await fetchSnapshot();
  broadcast(snap);
  return snap;
}

export interface UseEntitlementResult extends EntitlementSnapshot {
  isLoading: boolean;
  can: (feature: Feature | string) => boolean;
  refresh: () => Promise<EntitlementSnapshot>;
}

export function useEntitlement(): UseEntitlementResult {
  const [snapshot, setSnapshot] = React.useState<EntitlementSnapshot | null>(
    () => memCache?.data ?? null,
  );
  const [isLoading, setIsLoading] = React.useState<boolean>(!memCache);

  React.useEffect(() => {
    let cancelled = false;

    const listener = (snap: EntitlementSnapshot) => {
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

    const onFocus = () => {
      void refresh(false);
    };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      listeners.delete(listener);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const can = React.useCallback(
    (feature: Feature | string): boolean => {
      if (!snapshot) return false;
      return snapshot.entitlements.includes(feature);
    },
    [snapshot],
  );

  return {
    user: snapshot?.user ?? null,
    entitlements: snapshot?.entitlements ?? [],
    trial: snapshot?.trial ?? null,
    isLoading,
    can,
    refresh: () => refresh(true),
  };
}
