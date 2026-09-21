// G21 P3-C — connector freshness ("stale connector" trust metric).
//
// One definition of how old a connected source's last successful read is,
// shared by the connector cards (badge), the Assessment Card ("stale
// connector" hint), the corrections data-ethics panel ("last refreshed") and
// the /admin/funnel Trust section (fleet-wide stale count):
//
//   fresh   ≤ FRESH_MAX_DAYS (30 d)   the weekly resync ran recently
//   ageing  31 – 90 d                 past the resync cadence, before the proof expires
//   stale   > STALE_AFTER_DAYS        = DEFAULT_TTL_DAYS.connector: the EvidenceRecords
//                                     this source minted have expired (api/cron/evidence-expiry)
//   never   connected, no read yet
//
// `computeConnectorFreshness` is pure (the data-ethics builder and the tests
// use it); `connectorFreshness(projectId)` is the one DB read
// (`oauth_connections_v2.last_sync_at` / `.updated_at` + the latest
// `connector_snapshots.taken_at` per provider, both project-scoped);
// `countStaleConnectors` folds a fleet-wide connection list for the funnel.

import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_TTL_DAYS } from "./claims";

export const FRESH_MAX_DAYS = 30;
/** A connector past this is stale — its proof has expired (= DEFAULT_TTL_DAYS.connector). */
export const STALE_AFTER_DAYS = DEFAULT_TTL_DAYS.connector;

export type FreshnessState = "fresh" | "ageing" | "stale" | "never";

export interface ConnectorFreshness {
  provider: string;
  label: string;
  /** ISO of the last successful read (newest of last_sync_at / updated_at / snapshot taken_at); null when never. */
  lastSyncAt: string | null;
  /** Whole days since lastSyncAt; null when never. */
  ageDays: number | null;
  state: FreshnessState;
  /** The connection's last sync error / unreadable token, when the card should say "reconnect". */
  error: string | null;
}

export interface FreshnessConnectionInput {
  provider: string;
  status: string;
  lastSyncAt: string | null;
  /** Row updated_at — a link / token reseal counts as a read when no sync stamp exists. */
  updatedAt?: string | null;
  lastSyncError?: string | null;
  tokenUnreadable?: boolean;
}

export interface FreshnessSnapshotInput {
  provider: string;
  taken_at: string;
}

export interface ConnectorFreshnessInput {
  connections: readonly FreshnessConnectionInput[];
  snapshots: readonly FreshnessSnapshotInput[];
}

export const CONNECTOR_LABEL: Record<string, string> = {
  github: "GitHub",
  stripe: "Stripe",
  ga4: "Google Analytics",
  xero: "Xero",
  abr: "Australian Business Register",
  linkedin: "LinkedIn",
};

export function connectorLabel(provider: string): string {
  return CONNECTOR_LABEL[provider] ?? provider;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Pure: whole days between `iso` and `now`; null when unparsable. */
export function ageInDays(iso: string | null | undefined, now: Date | number = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const nowMs = typeof now === "number" ? now : now.getTime();
  return Math.max(0, Math.floor((nowMs - t) / DAY_MS));
}

/** Pure: the state for an age; null age = never. */
export function freshnessState(ageDays: number | null): FreshnessState {
  if (ageDays === null) return "never";
  if (ageDays <= FRESH_MAX_DAYS) return "fresh";
  if (ageDays <= STALE_AFTER_DAYS) return "ageing";
  return "stale";
}

/** Human line for a badge / hint ("synced 3 d ago", "stale — 120 d since the last read"). */
export function freshnessLine(f: Pick<ConnectorFreshness, "state" | "ageDays">): string {
  switch (f.state) {
    case "never":
      return "connected, not yet synced";
    case "fresh":
      return f.ageDays === 0 ? "synced today" : `synced ${f.ageDays} d ago`;
    case "ageing":
      return `ageing — ${f.ageDays} d since the last read`;
    case "stale":
      return `stale — ${f.ageDays} d since the last read; its proof has expired`;
  }
}

function newest(...isos: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestT = -Infinity;
  for (const iso of isos) {
    if (!iso) continue;
    const t = Date.parse(iso);
    if (Number.isFinite(t) && t > bestT) {
      bestT = t;
      best = iso;
    }
  }
  return best;
}

/**
 * Pure: one row per provider — every active / errored connection (a revoked
 * one is not a connector) plus any provider that only has snapshots. The
 * read time is the newest of the connection's sync stamp, its updated_at
 * and the latest snapshot.
 */
export function computeConnectorFreshness(input: ConnectorFreshnessInput, now: Date | number = Date.now()): ConnectorFreshness[] {
  const out: ConnectorFreshness[] = [];
  const seen = new Set<string>();
  const latestSnapshot = (provider: string): string | null =>
    input.snapshots.filter((s) => s.provider === provider).reduce<string | null>((acc, s) => newest(acc, s.taken_at), null);

  for (const c of input.connections) {
    if ((c.status !== "active" && c.status !== "error") || seen.has(c.provider)) continue;
    seen.add(c.provider);
    // Review P2 (2026-09-21): a failed sync stamps `last_sync_at` too and a
    // token refresh bumps `updated_at` without any data read — neither is a
    // successful read. Freshness = the last SUCCESSFUL sync (no error) or the
    // newest snapshot; `updated_at` never counts.
    const failing = c.status === "error" || Boolean(c.lastSyncError) || Boolean(c.tokenUnreadable);
    const successfulSync = failing ? null : c.lastSyncAt;
    const snapshotAt = latestSnapshot(c.provider);
    const lastSyncAt = newest(c.lastSyncAt, snapshotAt);
    const ageDays = ageInDays(lastSyncAt, now);
    const readAge = ageInDays(newest(successfulSync, snapshotAt), now);
    out.push({
      provider: c.provider,
      label: connectorLabel(c.provider),
      lastSyncAt,
      ageDays,
      // A connector that cannot read is stale whatever its last stamp says.
      state: failing && (readAge == null || freshnessState(readAge) !== "fresh") ? "stale" : freshnessState(readAge ?? ageDays),
      error: c.tokenUnreadable ? "reconnect needed" : (c.lastSyncError ?? null) || null,
    });
  }
  for (const s of input.snapshots) {
    if (seen.has(s.provider)) continue;
    seen.add(s.provider);
    const lastSyncAt = latestSnapshot(s.provider);
    const ageDays = ageInDays(lastSyncAt, now);
    out.push({ provider: s.provider, label: connectorLabel(s.provider), lastSyncAt, ageDays, state: freshnessState(ageDays), error: null });
  }
  return out;
}

/** Pure: how many connectors are past the proof TTL. */
export function staleConnectorCount(list: ReadonlyArray<Pick<ConnectorFreshness, "state">>): number {
  return list.filter((f) => f.state === "stale").length;
}

// ── DB ──────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

interface ConnectionRow {
  provider: string;
  status: string;
  last_sync_at: string | null;
  last_sync_error: string | null;
  updated_at: string | null;
}

/**
 * Project-scoped freshness for every connected source. Never throws — a
 * missing table or a DB error yields `[]` (the surfaces then show nothing
 * rather than a wrong badge).
 */
export async function connectorFreshness(projectId: string, opts: { db: Db | null; now?: Date | number }): Promise<ConnectorFreshness[]> {
  const db = opts.db;
  if (!db || !projectId) return [];
  try {
    const [conns, snaps] = await Promise.all([
      db.from("oauth_connections_v2").select("provider, status, last_sync_at, last_sync_error, updated_at").eq("project_id", projectId).in("status", ["active", "error"]).limit(50),
      db.from("connector_snapshots").select("provider, taken_at").eq("project_id", projectId).order("taken_at", { ascending: false }).limit(50),
    ]);
    if (conns.error) console.warn("[blockid:freshness] connections read failed", { code: conns.error.code });
    if (snaps.error) console.warn("[blockid:freshness] snapshots read failed", { code: snaps.error.code });
    const connections = ((conns.data ?? []) as ConnectionRow[]).map((r) => ({
      provider: r.provider,
      status: r.status,
      lastSyncAt: r.last_sync_at,
      updatedAt: r.updated_at,
      lastSyncError: r.last_sync_error,
    }));
    const snapshots = ((snaps.data ?? []) as FreshnessSnapshotInput[]).filter((s) => typeof s.taken_at === "string");
    return computeConnectorFreshness({ connections, snapshots }, opts.now ?? Date.now());
  } catch (err) {
    console.warn("[blockid:freshness] lookup failed", err instanceof Error ? err.message : String(err));
    return [];
  }
}

/**
 * Pure: fleet-wide stale count for /admin/funnel — one (project, provider)
 * pair per connection row, stale when its newest stamp is past the TTL.
 */
export function countStaleConnectors(rows: ReadonlyArray<{ project_id: string | null; provider: string; status: string; last_sync_at: string | null; updated_at: string | null }>, now: Date | number = Date.now()): number {
  const seen = new Set<string>();
  let stale = 0;
  for (const r of rows) {
    if (r.status !== "active" && r.status !== "error") continue;
    const key = `${r.project_id ?? "-"}:${r.provider}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (freshnessState(ageInDays(newest(r.last_sync_at, r.updated_at), now)) === "stale") stale += 1;
  }
  return stale;
}
