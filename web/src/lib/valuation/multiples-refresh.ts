// Quarterly sector-multiple proposal loop (S27-C, 2026-09-13) — behind
// POST /api/cron/sector-multiples-refresh (1st of Jan/Apr/Jul/Oct 03:00 UTC).
//
// For every entry in the fixed allow-list (./multiples-sources.ts):
//   1. fetch the page through `fetchText` (browser UA, retries, 2 MB cap,
//      DNS-pinned socket, SSRF guard on every hop);
//   2. `htmlToText` → clip to MAX_TEXT_CHARS;
//   3. ask the AI client (same `callAI` the CFO agent uses) for
//      `[{ sector, arr_low, arr_mid, arr_high, excerpt }]` — JSON only;
//   4. keep a candidate ONLY when `validateCandidate` passes:
//        * sector is a static-table key AND listed for that source,
//        * 0 < low <= mid <= high <= 200, finite,
//        * excerpt 20–500 chars and a VERBATIM substring of the text we sent
//          (`text.includes(excerpt)` — a paraphrase is rejected),
//        * the excerpt itself contains at least one of the three numbers,
//          so a number cannot be invented next to a real sentence;
//   5. insert as `status='proposed'`, `proposed_by='cron'`. The partial
//      unique index (sector, source_url, band) WHERE status='proposed' makes
//      a re-run idempotent — duplicates are counted, not errors.
//
// Nothing is ever approved here. A fetch / AI / parse failure is logged per
// source and the loop continues; the function never throws on one bad
// source. `dryRun` performs no DB writes and returns the proposals it would
// have inserted. Every side effect is injectable for tests
// (multiples-refresh.test.ts).

import { fetchText, htmlToText, type FetchTextResult } from "@/lib/funding/fetch-source";
import { isSectorKey, SECTOR_KEYS } from "./sector-multiples-static";
import { MULTIPLES_SOURCES, type MultiplesSource } from "./multiples-sources";
import { OVERRIDES_TABLE, isoDate } from "./sector-multiples";

/** Characters of page text handed to the model (≈ 3.5k tokens). */
export const MAX_TEXT_CHARS = 14_000;
/** Below this the page is a shell (JS-rendered / error page) — logged as `empty_text`, not sent to the model. */
export const MIN_TEXT_CHARS = 120;
export const MIN_EXCERPT_CHARS = 20;
export const MAX_EXCERPT_CHARS = 500;
export const MAX_MULTIPLE = 200;
/** Candidates kept per source per run — a page rarely states more sectors than this. */
export const MAX_CANDIDATES_PER_SOURCE = 8;

export interface ProposalCandidate {
  sector: string;
  arr_low: number;
  arr_mid: number;
  arr_high: number;
  excerpt: string;
  /** Optional ISO date the model read off the page ("as of June 2026" → 2026-06-01). */
  published_at?: string | null;
}

export type RejectReason =
  | "not_object"
  | "bad_sector"
  | "sector_not_expected"
  | "bad_numbers"
  | "excerpt_too_short"
  | "excerpt_too_long"
  | "excerpt_not_in_text"
  | "excerpt_lacks_number";

export interface ValidatedProposal {
  sector: string;
  arr_low: number;
  arr_mid: number;
  arr_high: number;
  effective_from: string;
  source_url: string;
  source_title: string;
  source_published_at: string | null;
  source_excerpt: string;
  status: "proposed";
  proposed_by: "cron";
}

export type SourceStatus =
  | "proposed"
  | "no_candidates"
  | "fetch_failed"
  | "blocked"
  | "empty_text"
  | "ai_failed"
  | "ai_unparseable"
  | "insert_failed";

export interface SourceOutcome {
  id: string;
  url: string;
  status: SourceStatus;
  httpStatus?: number;
  error?: string;
  textChars: number;
  candidates: number;
  accepted: number;
  duplicates: number;
  rejected: Array<{ reason: RejectReason; sector?: string }>;
}

export interface RefreshSummary {
  ok: boolean;
  dryRun: boolean;
  ranAt: string;
  sources: SourceOutcome[];
  proposed: number;
  duplicates: number;
  /** The proposals inserted (or, on a dry run, that would have been). */
  entries: ValidatedProposal[];
  error?: string;
}

export interface RefreshDeps {
  dryRun?: boolean;
  now?: Date;
  sources?: readonly MultiplesSource[];
  /** Page fetcher — defaults to `fetchText` (pinned + guarded). */
  fetch?: (url: string) => Promise<FetchTextResult>;
  /** Model call — defaults to `callAI` from lib/ai-client. Returns the raw text. */
  ai?: (opts: { system: string; user: string }) => Promise<{ text: string }>;
  /** Supabase admin client — defaults to `getSupabaseAdmin()`. `null` → 503-style `supabase_unavailable` on a live run. */
  supabase?: SupabaseLike | null;
}

/** The slice of the Supabase client the loop uses (keeps tests free of the SDK). */
export interface SupabaseLike {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => PromiseLike<{ error: { code?: string; message: string } | null }>;
  };
}

// ─── Extraction prompt ───────────────────────────────────────────────────────

export function extractionSystemPrompt(source: MultiplesSource): string {
  return [
    "You extract revenue-multiple benchmarks from a web page for an Australian startup valuation tool.",
    `Page: "${source.title}" (${source.publisher}). Expected content: ${source.expects}`,
    `Allowed sector keys for this page: ${source.sectors.join(", ")}. (Full key list: ${SECTOR_KEYS.join(", ")}.)`,
    "Return ONLY a JSON array (no prose, no code fence). Each element:",
    '{ "sector": <key>, "arr_low": <number>, "arr_mid": <number>, "arr_high": <number>, "excerpt": <string>, "published_at": <"YYYY-MM-DD" or null> }',
    "Rules:",
    "- arr_* are EV-to-revenue (or EV-to-ARR) multiples as plain numbers (7.5 not \"7.5x\"). If the page states one figure, use it as arr_mid and set arr_low/arr_high to the range the page gives, or to the same figure when it gives none.",
    "- excerpt MUST be copied character-for-character from the page text below (20–500 characters) and MUST contain the number(s) you used. Do not paraphrase, do not fix typos, do not merge sentences.",
    "- Skip anything the page does not literally state. If the page states no usable multiple, return [].",
    "- Never invent a sector the page does not cover.",
  ].join("\n");
}

/** Strip a ```json fence and parse; returns null when not a JSON array. */
export function parseCandidates(raw: string): ProposalCandidate[] | null {
  if (!raw) return null;
  let s = raw.trim();
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) s = fence[1].trim();
  // Tolerate a leading sentence before the array.
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(s.slice(start, end + 1));
    return Array.isArray(parsed) ? (parsed as ProposalCandidate[]) : null;
  } catch {
    return null;
  }
}

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/[x×,\s]/gi, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** "8", "8.0", "8.00" all count as the excerpt mentioning 8. */
export function excerptMentionsNumber(excerpt: string, n: number): boolean {
  // Only spellings that are exactly n (7.4 → "7.4", "7.40"; never "7").
  const fixed = [0, 1, 2].map((d) => n.toFixed(d)).filter((f) => Number(f) === n);
  const forms = Array.from(new Set([String(n), ...fixed]));
  return forms.some((f) => new RegExp(`(?<![\\d.])${f.replace(".", "\\.")}(?!\\d|\\.\\d)`).test(excerpt));
}

function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && isoDate(d) === `${m[1]}-${m[2]}-${m[3]}` ? isoDate(d) : null;
}

/**
 * The gate every candidate passes before it can become a `proposed` row.
 * `text` MUST be the exact string the model was shown.
 */
export function validateCandidate(
  cand: unknown,
  text: string,
  source: MultiplesSource,
  now: Date,
): { ok: true; proposal: ValidatedProposal } | { ok: false; reason: RejectReason; sector?: string } {
  if (!cand || typeof cand !== "object") return { ok: false, reason: "not_object" };
  const c = cand as Record<string, unknown>;
  const sector = typeof c.sector === "string" ? c.sector.trim().toLowerCase() : "";
  if (!sector || !isSectorKey(sector)) return { ok: false, reason: "bad_sector", sector };
  if (!source.sectors.includes(sector)) return { ok: false, reason: "sector_not_expected", sector };

  const low = num(c.arr_low);
  const mid = num(c.arr_mid);
  const high = num(c.arr_high);
  if (low === null || mid === null || high === null) return { ok: false, reason: "bad_numbers", sector };
  if (!(low > 0 && low <= mid && mid <= high && high <= MAX_MULTIPLE)) return { ok: false, reason: "bad_numbers", sector };

  const excerpt = typeof c.excerpt === "string" ? c.excerpt : "";
  if (excerpt.length < MIN_EXCERPT_CHARS) return { ok: false, reason: "excerpt_too_short", sector };
  if (excerpt.length > MAX_EXCERPT_CHARS) return { ok: false, reason: "excerpt_too_long", sector };
  // The one rule that makes a proposal citable: verbatim, or it does not exist.
  if (!text.includes(excerpt)) return { ok: false, reason: "excerpt_not_in_text", sector };
  if (![low, mid, high].some((n) => excerptMentionsNumber(excerpt, n))) return { ok: false, reason: "excerpt_lacks_number", sector };

  return {
    ok: true,
    proposal: {
      sector,
      arr_low: round2(low),
      arr_mid: round2(mid),
      arr_high: round2(high),
      effective_from: isoDate(now),
      source_url: source.url,
      source_title: source.title,
      source_published_at: isoOrNull(c.published_at),
      source_excerpt: excerpt,
      status: "proposed",
      proposed_by: "cron",
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Loop ────────────────────────────────────────────────────────────────────

async function defaultAi(opts: { system: string; user: string }): Promise<{ text: string }> {
  const { callAI } = await import("@/lib/ai-client");
  const r = await callAI({ system: opts.system, user: opts.user, maxTokens: 1500, temperature: 0, timeoutMs: 90_000, agentId: "cfo" });
  return { text: r.text };
}

async function defaultSupabase(): Promise<SupabaseLike | null> {
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  return getSupabaseAdmin() as unknown as SupabaseLike | null;
}

export async function refreshSectorMultiples(deps: RefreshDeps = {}): Promise<RefreshSummary> {
  const dryRun = deps.dryRun === true;
  const now = deps.now ?? new Date();
  const sources = deps.sources ?? MULTIPLES_SOURCES;
  const doFetch = deps.fetch ?? ((url: string) => fetchText(url, { timeoutMs: 15_000, retries: 2 }));
  const ai = deps.ai ?? defaultAi;
  const supabase = dryRun ? null : deps.supabase !== undefined ? deps.supabase : await defaultSupabase();

  const summary: RefreshSummary = { ok: true, dryRun, ranAt: now.toISOString(), sources: [], proposed: 0, duplicates: 0, entries: [] };

  if (!dryRun && !supabase) {
    return { ...summary, ok: false, error: "supabase_unavailable" };
  }

  for (const source of sources) {
    const out: SourceOutcome = { id: source.id, url: source.url, status: "no_candidates", textChars: 0, candidates: 0, accepted: 0, duplicates: 0, rejected: [] };
    summary.sources.push(out);
    try {
      const res = await doFetch(source.url);
      out.httpStatus = res.status;
      if (!res.ok) {
        out.status = res.blocked ? "blocked" : "fetch_failed";
        out.error = res.error ?? `HTTP ${res.status}`;
        continue;
      }
      const text = htmlToText(res.text).slice(0, MAX_TEXT_CHARS);
      out.textChars = text.length;
      if (text.length < MIN_TEXT_CHARS) {
        out.status = "empty_text";
        continue;
      }

      let raw: string;
      try {
        raw = (await ai({ system: extractionSystemPrompt(source), user: `PAGE TEXT (${source.url}):\n\n${text}` })).text;
      } catch (err) {
        out.status = "ai_failed";
        out.error = err instanceof Error ? err.message : String(err);
        continue;
      }
      const cands = parseCandidates(raw);
      if (!cands) {
        out.status = "ai_unparseable";
        out.error = raw.slice(0, 200);
        continue;
      }
      out.candidates = cands.length;

      const seen = new Set<string>();
      for (const cand of cands.slice(0, MAX_CANDIDATES_PER_SOURCE)) {
        const v = validateCandidate(cand, text, source, now);
        if (!v.ok) {
          out.rejected.push({ reason: v.reason, sector: v.sector });
          continue;
        }
        const key = `${v.proposal.sector}|${v.proposal.arr_low}|${v.proposal.arr_mid}|${v.proposal.arr_high}`;
        if (seen.has(key)) {
          out.duplicates++;
          continue;
        }
        seen.add(key);

        if (dryRun || !supabase) {
          out.accepted++;
          summary.entries.push(v.proposal);
          continue;
        }
        const { error } = await supabase.from(OVERRIDES_TABLE).insert(v.proposal);
        if (error) {
          if (error.code === "23505") {
            out.duplicates++;
            continue;
          }
          out.status = "insert_failed";
          out.error = error.message;
          continue;
        }
        out.accepted++;
        summary.entries.push(v.proposal);
      }
      if (out.accepted > 0 && out.status !== "insert_failed") out.status = "proposed";
    } catch (err) {
      // One bad source never stops the run.
      out.status = "fetch_failed";
      out.error = err instanceof Error ? err.message : String(err);
    } finally {
      summary.proposed += out.accepted;
      summary.duplicates += out.duplicates;
    }
  }

  return summary;
}
