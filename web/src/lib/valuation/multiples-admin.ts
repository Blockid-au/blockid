// Admin-side helpers for the sector-multiple review queue (S27-C).
//
// Pure: validation of the manual "Propose override" form, the review-queue
// row shape the page renders, and the side-by-side "current" values. The
// routes under /api/admin/sector-multiples/** and the page at
// /dashboard/admin/sector-multiples import from here; no I/O, no
// `server-only`. Colocated tests: multiples-admin.test.ts.

import { isSectorKey, SECTOR_KEYS, staticArrMultiple, type Sector } from "./sector-multiples-static";
import { resolveSectorMultiples, type SectorMultipleOverride } from "./sector-multiples";
import { MAX_EXCERPT_CHARS, MAX_MULTIPLE, MIN_EXCERPT_CHARS } from "./multiples-refresh";

export const MAX_TITLE_CHARS = 200;
export const MAX_NOTE_CHARS = 1000;

export interface ManualProposalInput {
  sector: Sector;
  arr_low: number;
  arr_mid: number;
  arr_high: number;
  effective_from: string;
  source_url: string;
  source_title: string;
  source_published_at: string | null;
  source_excerpt: string;
}

export type ManualProposalError =
  | "invalid_body"
  | "bad_sector"
  | "bad_numbers"
  | "bad_effective_from"
  | "bad_source_url"
  | "bad_source_title"
  | "bad_published_at"
  | "bad_excerpt";

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/[x×,\s]/gi, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isoDateOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s ? s : null;
}

/** http(s) on a named host — the admin form never triggers a fetch, but the URL must be a real public link. */
export function isPublicHttpUrl(v: unknown): v is string {
  if (typeof v !== "string" || v.length > 2048) return false;
  try {
    const u = new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (!u.hostname || u.hostname === "localhost" || /^[\d.]+$/.test(u.hostname) || u.hostname.includes(":")) return false;
    return u.hostname.includes(".");
  } catch {
    return false;
  }
}

/**
 * Validate the manual proposal body. Same band / excerpt rules as the cron
 * (the excerpt cannot be checked against a fetched page here — the admin is
 * attesting it is verbatim, and a separate approve step is still required
 * for the row to take effect — by any admin, including the proposer; a
 * same-admin approval is flagged `same_admin` in the audit row).
 */
export function validateManualProposal(
  body: unknown,
  today: string,
): { ok: true; value: ManualProposalInput } | { ok: false; error: ManualProposalError } {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_body" };
  const b = body as Record<string, unknown>;

  const sector = typeof b.sector === "string" ? b.sector.trim().toLowerCase() : "";
  if (!isSectorKey(sector)) return { ok: false, error: "bad_sector" };

  const low = num(b.arr_low);
  const mid = num(b.arr_mid);
  const high = num(b.arr_high);
  if (low === null || mid === null || high === null) return { ok: false, error: "bad_numbers" };
  if (!(low > 0 && low <= mid && mid <= high && high <= MAX_MULTIPLE)) return { ok: false, error: "bad_numbers" };

  let effective_from = today;
  if (b.effective_from !== undefined && b.effective_from !== null && b.effective_from !== "") {
    const d = isoDateOrNull(b.effective_from);
    if (!d) return { ok: false, error: "bad_effective_from" };
    effective_from = d;
  }

  if (!isPublicHttpUrl(b.source_url)) return { ok: false, error: "bad_source_url" };
  const source_title = typeof b.source_title === "string" ? b.source_title.trim() : "";
  if (!source_title || source_title.length > MAX_TITLE_CHARS) return { ok: false, error: "bad_source_title" };

  let source_published_at: string | null = null;
  if (b.source_published_at !== undefined && b.source_published_at !== null && b.source_published_at !== "") {
    source_published_at = isoDateOrNull(b.source_published_at);
    if (!source_published_at) return { ok: false, error: "bad_published_at" };
  }

  const source_excerpt = typeof b.source_excerpt === "string" ? b.source_excerpt.trim() : "";
  if (source_excerpt.length < MIN_EXCERPT_CHARS || source_excerpt.length > MAX_EXCERPT_CHARS) return { ok: false, error: "bad_excerpt" };

  return {
    ok: true,
    value: {
      sector,
      arr_low: Math.round(low * 100) / 100,
      arr_mid: Math.round(mid * 100) / 100,
      arr_high: Math.round(high * 100) / 100,
      effective_from,
      source_url: b.source_url,
      source_title,
      source_published_at,
      source_excerpt,
    },
  };
}

/** Optional review note on approve / reject. */
export function cleanReviewNote(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.slice(0, MAX_NOTE_CHARS);
}

/** What the reviewer compares a proposal against: the static row and the override in force today. */
export interface CurrentMultiples {
  sector: Sector;
  static: { low: number; mid: number; high: number; citation: string };
  current: { low: number; mid: number; high: number; sourceKind: "static" | "override"; sourceLabel: string; overrideId: string | null };
}

export function currentMultiplesFor(sector: string, approved: readonly SectorMultipleOverride[], today: string): CurrentMultiples {
  const s = staticArrMultiple(sector);
  const r = resolveSectorMultiples(sector, approved, today);
  return {
    sector: s.sector,
    static: { low: s.low, mid: s.mid, high: s.high, citation: s.citation },
    current: { low: r.low, mid: r.mid, high: r.high, sourceKind: r.sourceKind, sourceLabel: r.sourceLabel, overrideId: r.override?.id ?? null },
  };
}

/** The side-by-side table for every sector (page header). */
export function currentMultiplesTable(approved: readonly SectorMultipleOverride[], today: string): CurrentMultiples[] {
  return SECTOR_KEYS.map((k) => currentMultiplesFor(k, approved, today));
}
