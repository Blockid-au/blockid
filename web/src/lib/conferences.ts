/**
 * Conference recommender (Phase 3.1).
 *
 * Loads a curated seed list of AU + APAC + global startup conferences from
 * `web/content/conferences.json` and returns a scored, filtered, date-sorted
 * shortlist for a founder's stage / sector / region / budget.
 *
 * Pure functions — no DB / network. All filters are best-effort: an unknown
 * or empty filter never zeroes out the result set, it just widens the match.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

export type ConferenceCost = "free" | "paid" | "invite";

export interface Conference {
  slug: string;
  name: string;
  /** ISO date (YYYY-MM-DD) of the first day of the event. */
  date: string;
  city: string;
  country: string;
  url: string;
  audience: string[];
  /** Growth phase indices this event is most useful for (0-4). */
  stages: number[];
  sectors: string[];
  cost: ConferenceCost;
  pitchCompetition: boolean;
  notes?: string;
}

export interface RecommendInput {
  /** Founder growth phase index 0..4 (0 = vision, 4 = scale). */
  stage?: number | null;
  /** Free-form sector — matched case-insensitively against Conference.sectors. */
  sector?: string | null;
  /** ISO 3166-1 alpha-2 country code, or the pseudo regions "AU" / "APAC" / "GLOBAL". */
  region?: string | null;
  /** "free" | "paid" | "invite" — filter to matching cost buckets. */
  budget?: ConferenceCost | null;
  /** Cap results (default 5). */
  limit?: number;
  /** Reference "today" for tests (ISO date). Defaults to Date.now(). */
  now?: Date;
  /**
   * Injected list, primarily for tests. When omitted the seed JSON on disk
   * is loaded (once per process, cached).
   */
  source?: Conference[];
}

const APAC_COUNTRIES = new Set(["AU", "NZ", "SG", "HK", "MO", "MY", "ID", "TH", "JP", "KR", "VN", "PH", "IN", "TW", "CN"]);

let cache: Conference[] | null = null;

async function loadSeed(): Promise<Conference[]> {
  if (cache) return cache;
  const candidates = [
    path.join(process.cwd(), "web", "content", "conferences.json"),
    path.join(process.cwd(), "content", "conferences.json"),
  ];
  for (const p of candidates) {
    try {
      const raw = await fs.readFile(p, "utf8");
      const parsed = JSON.parse(raw) as Conference[];
      if (Array.isArray(parsed)) {
        cache = parsed;
        return parsed;
      }
    } catch {
      // try next candidate
    }
  }
  cache = [];
  return cache;
}

/** Test-only: reset the cached seed list. */
export function __resetConferenceCache(): void {
  cache = null;
}

function normaliseRegion(region: string | null | undefined): string | null {
  if (!region) return null;
  return region.trim().toUpperCase() || null;
}

function regionMatch(conf: Conference, region: string | null): boolean {
  if (!region) return true;
  if (region === "GLOBAL") return true;
  if (region === "APAC") return APAC_COUNTRIES.has(conf.country);
  return conf.country === region;
}

function sectorMatch(conf: Conference, sector: string | null | undefined): boolean {
  if (!sector) return true;
  const needle = sector.toLowerCase().trim();
  if (!needle) return true;
  return conf.sectors.some((s) => s.toLowerCase() === needle);
}

function stageMatch(conf: Conference, stage: number | null | undefined): boolean {
  if (stage === null || stage === undefined) return true;
  if (!Number.isFinite(stage)) return true;
  if (!Array.isArray(conf.stages) || conf.stages.length === 0) return true;
  return conf.stages.includes(stage);
}

function budgetMatch(conf: Conference, budget: ConferenceCost | null | undefined): boolean {
  if (!budget) return true;
  return conf.cost === budget;
}

function isUpcoming(conf: Conference, now: Date): boolean {
  const t = Date.parse(conf.date);
  if (Number.isNaN(t)) return false;
  return t >= now.getTime() - 86_400_000; // include events happening today
}

export async function recommendConferences(input: RecommendInput = {}): Promise<Conference[]> {
  const list = input.source ?? (await loadSeed());
  const now = input.now ?? new Date();
  const region = normaliseRegion(input.region);
  const limit = input.limit && input.limit > 0 ? Math.floor(input.limit) : 5;

  const filtered = list.filter(
    (c) =>
      isUpcoming(c, now) &&
      stageMatch(c, input.stage ?? null) &&
      sectorMatch(c, input.sector ?? null) &&
      regionMatch(c, region) &&
      budgetMatch(c, input.budget ?? null),
  );

  filtered.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  return filtered.slice(0, limit);
}
