// Server-only read helpers for the AU funding catalogue (migration
// 0311_au_funding.sql). Used by /admin/funding, the /funding directory pages
// (T0241) and the grant-advisor agent (T0240).
//
// Contract (mirrors accelerator-portal.ts):
//   * admin client null / missing tables (42P01) / any DB error → [] or null,
//     never throws to the page.
//   * `capitalForCity` is re-exported from seed-map.ts so pages and the seed
//     script agree on the city → capital grouping (G11-5).
//
// Caching (S8-D, 2026-09-11 perf audit):
//   * Every route under the root layout renders per request (the layout
//     reads `headers()` for the CSP nonce), so `export const revalidate` on
//     the directory pages never produced a cached page and each request ran
//     one `select *` over au_grants (56 rows) / au_programs (199 rows); the
//     /funding landing and POST /api/funding/preview ran both. The reads now
//     go through `unstable_cache` (data cache, 1 h, tag `AU_FUNDING_CACHE_TAG`)
//     so the DB is hit once per hour per distinct query, and through
//     `React.cache` so generateMetadata + page body share one in-flight read
//     per request. Degraded results (no client, DB error) are never cached —
//     the reader throws `CatalogueUnavailable` inside the cache scope and the
//     wrapper turns that into the old [] / null.
//   * Writers call `revalidateFundingCatalogue()` (admin PATCH, the
//     refresh-funding-sources cron, the seed script via
//     /api/cron/revalidate-funding) so an edit is visible on the next request.
//   * Outside the Next runtime (vitest, scripts) `unstable_cache` throws its
//     "incrementalCache missing" invariant before calling the reader; the
//     wrapper falls back to a direct read so behaviour there is unchanged.
//
// Colocated tests: data.test.ts.

import "server-only";
import { cache } from "react";
import { revalidateTag, unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { AuGrantRow, AuProgramRow, Capital, FundingStatus } from "./seed-map";

export { capitalForCity, CAPITALS, AU_STATES, FUNDING_STATUSES, STATUS_CONFIDENCES } from "./seed-map";
export type { AuGrantRow, AuProgramRow, Capital, AuState, FundingStatus, StatusConfidence, VerifiedBy } from "./seed-map";

/** Data-cache tag every catalogue read carries; writers revalidate it. */
export const AU_FUNDING_CACHE_TAG = "au-funding";
/** Matches the `revalidate = 3600` the directory pages declare. */
export const AU_FUNDING_CACHE_SECONDS = 3600;

export interface AuGrant extends AuGrantRow {
  created_at: string;
  updated_at: string;
}

export interface AuProgram extends AuProgramRow {
  created_at: string;
  updated_at: string;
}

export interface ListGrantsOptions {
  state?: string | null;
  status?: FundingStatus | null;
  /** Drop rows flagged exclude_from_matching (registry / council-only rows). Default true. */
  excludeNonMatching?: boolean;
  limit?: number;
}

export interface ListProgramsOptions {
  capital?: Capital | string | null;
  status?: FundingStatus | null;
  limit?: number;
}

const DEFAULT_LIMIT = 500;

function warn(scope: string, err: { code?: string; message?: string } | null | undefined) {
  if (!err) return;
  // 42P01 = relation does not exist → migration 0311 not applied yet. Degrade quietly.
  if (err.code === "42P01") return;
  console.warn(`[funding/data] ${scope}: ${err.message ?? "unknown error"}`);
}

/**
 * Thrown by a raw reader (inside the cache scope) for any degraded outcome
 * so `unstable_cache` never stores [] / null for a transient failure. The
 * public wrappers catch it and return the documented fallback; the warning
 * has already been logged by then.
 */
class CatalogueUnavailable extends Error {
  constructor(scope: string) {
    super(`catalogue unavailable: ${scope}`);
    this.name = "CatalogueUnavailable";
  }
}

/** `unstable_cache` outside a Next request / build (vitest, node scripts). */
function isOutsideNextRuntime(err: unknown): boolean {
  return err instanceof Error && /incrementalCache missing/.test(err.message);
}

function errorOf(err: unknown): { message: string } {
  return { message: err instanceof Error ? err.message : String(err) };
}

/**
 * Data-cache + per-request memo around a keyed reader. The key is a plain
 * string (serialised options / row id) so both `unstable_cache` and
 * `React.cache` dedupe on value rather than object identity.
 */
function cachedRead<T>(scope: string, reader: (key: string) => Promise<T>, fallback: () => T): (key: string) => Promise<T> {
  const viaDataCache = unstable_cache(reader, [`au-funding:${scope}`], {
    tags: [AU_FUNDING_CACHE_TAG],
    revalidate: AU_FUNDING_CACHE_SECONDS,
  });
  return cache(async (key: string): Promise<T> => {
    try {
      return await viaDataCache(key);
    } catch (err) {
      if (err instanceof CatalogueUnavailable) return fallback();
      if (isOutsideNextRuntime(err)) {
        try {
          return await reader(key);
        } catch (inner) {
          if (inner instanceof CatalogueUnavailable) return fallback();
          warn(scope, errorOf(inner));
          return fallback();
        }
      }
      warn(scope, errorOf(err));
      return fallback();
    }
  });
}

type GrantsKey = { state: string | null; status: FundingStatus | null; excludeNonMatching: boolean; limit: number };
type ProgramsKey = { capital: string | null; status: FundingStatus | null; limit: number };

function grantsKey(opts: ListGrantsOptions): string {
  const k: GrantsKey = {
    state: opts.state ?? null,
    status: opts.status ?? null,
    excludeNonMatching: opts.excludeNonMatching ?? true,
    limit: opts.limit ?? DEFAULT_LIMIT,
  };
  return JSON.stringify(k);
}

function programsKey(opts: ListProgramsOptions): string {
  const k: ProgramsKey = { capital: opts.capital ?? null, status: opts.status ?? null, limit: opts.limit ?? DEFAULT_LIMIT };
  return JSON.stringify(k);
}

async function readGrants(key: string): Promise<AuGrant[]> {
  const opts = JSON.parse(key) as GrantsKey;
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new CatalogueUnavailable("listGrants");
  try {
    let q = supabase.from("au_grants").select("*");
    if (opts.state && opts.state !== "national") q = q.in("state", ["national", opts.state]);
    if (opts.state === "national") q = q.eq("state", "national");
    if (opts.status) q = q.eq("status", opts.status);
    if (opts.excludeNonMatching) q = q.eq("exclude_from_matching", false);
    const { data, error } = await q.order("name", { ascending: true }).limit(opts.limit);
    if (error) {
      warn("listGrants", error);
      throw new CatalogueUnavailable("listGrants");
    }
    return (data ?? []) as AuGrant[];
  } catch (err) {
    if (err instanceof CatalogueUnavailable) throw err;
    warn("listGrants", errorOf(err));
    throw new CatalogueUnavailable("listGrants");
  }
}

async function readPrograms(key: string): Promise<AuProgram[]> {
  const opts = JSON.parse(key) as ProgramsKey;
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new CatalogueUnavailable("listPrograms");
  try {
    let q = supabase.from("au_programs").select("*");
    if (opts.capital) q = q.eq("capital", opts.capital);
    if (opts.status) q = q.eq("status", opts.status);
    const { data, error } = await q
      .order("capital", { ascending: true })
      .order("name", { ascending: true })
      .limit(opts.limit);
    if (error) {
      warn("listPrograms", error);
      throw new CatalogueUnavailable("listPrograms");
    }
    return (data ?? []) as AuProgram[];
  } catch (err) {
    if (err instanceof CatalogueUnavailable) throw err;
    warn("listPrograms", errorOf(err));
    throw new CatalogueUnavailable("listPrograms");
  }
}

async function readGrant(id: string): Promise<AuGrant | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new CatalogueUnavailable("getGrant");
  try {
    const { data, error } = await supabase.from("au_grants").select("*").eq("id", id).maybeSingle();
    if (error) {
      warn("getGrant", error);
      throw new CatalogueUnavailable("getGrant");
    }
    return (data as AuGrant | null) ?? null;
  } catch (err) {
    if (err instanceof CatalogueUnavailable) throw err;
    warn("getGrant", errorOf(err));
    throw new CatalogueUnavailable("getGrant");
  }
}

async function readProgram(id: string): Promise<AuProgram | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new CatalogueUnavailable("getProgram");
  try {
    const { data, error } = await supabase.from("au_programs").select("*").eq("id", id).maybeSingle();
    if (error) {
      warn("getProgram", error);
      throw new CatalogueUnavailable("getProgram");
    }
    return (data as AuProgram | null) ?? null;
  } catch (err) {
    if (err instanceof CatalogueUnavailable) throw err;
    warn("getProgram", errorOf(err));
    throw new CatalogueUnavailable("getProgram");
  }
}

const cachedGrants = cachedRead<AuGrant[]>("listGrants", readGrants, () => []);
const cachedPrograms = cachedRead<AuProgram[]>("listPrograms", readPrograms, () => []);
const cachedGrant = cachedRead<AuGrant | null>("getGrant", readGrant, () => null);
const cachedProgram = cachedRead<AuProgram | null>("getProgram", readProgram, () => null);

/**
 * Grants, optionally narrowed to a state (`national` rows are always included
 * alongside a specific state so federal schemes show on every state page).
 */
export function listGrants(opts: ListGrantsOptions = {}): Promise<AuGrant[]> {
  return cachedGrants(grantsKey(opts));
}

/** Programs, optionally narrowed to one capital page (Sydney, Brisbane, …, Remote). */
export function listPrograms(opts: ListProgramsOptions = {}): Promise<AuProgram[]> {
  return cachedPrograms(programsKey(opts));
}

export async function getGrant(id: string): Promise<AuGrant | null> {
  if (!id) return null;
  return cachedGrant(id);
}

export async function getProgram(id: string): Promise<AuProgram | null> {
  if (!id) return null;
  return cachedProgram(id);
}

/**
 * Expire every cached catalogue read. Call from a Route Handler after a
 * write (admin PATCH, refresh cron, seed script hook). `{ expire: 0 }` so
 * the next request blocks on a fresh read instead of serving the stale row
 * (an admin who just flipped a status expects to see it). Returns false —
 * never throws — when there is no Next store (vitest / scripts), where there
 * is nothing to expire.
 */
export function revalidateFundingCatalogue(): boolean {
  try {
    revalidateTag(AU_FUNDING_CACHE_TAG, { expire: 0 });
    return true;
  } catch (err) {
    warn("revalidateFundingCatalogue", errorOf(err));
    return false;
  }
}
