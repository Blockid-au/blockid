// gather — the un-stubbed GATHER stage of the report pipeline (S-R3, spec
// 12-product-ai-tbr-v2.md §C.3). Runs every source in parallel, each behind
// a hard 20 s timeout (`Promise.race`) and a 24 h cache keyed by URL for the
// audits, and turns EVERY result into an `EvidenceRow` with `source` +
// `observedAt` so chapter citations and the appendix register are real ids.
//
//   market research   researchMarket (ADK, 2 metered LLM calls) → competitiveResearch
//   tech audit        deepTechAudit(url)  — website link; cached in `tech_audits`
//   repo audit        auditGitHubRepo()   — github link + the owner's GitHub
//                     connection token (never a live OAuth dance; no token → skipped)
//   connector pulls   svi_signals rows from the LAST sync (stripe / ga4 / github)
//                     + connected revenue (stripe / xero snapshots) — read-only
//   cap-table read    shareholders + esop_pool register summary
//   grants / programs grant-advisor matchGrants / matchPrograms on the saved
//                     project_grant_profiles row (no profile → skipped with a note)
//   external signals  S40: external_signals rows for the project's verified
//                     ABN (ABR entity / GrantConnect awards / R&DTI register)
//                     → LCO / IRI / TRE rows, origin "connector" (S36 cap →
//                     connected_source). No ABN → skipped with a note.
//   valuation         buildVcValuationReport() on the inputs above (MRR from
//                     the connector bridge, sector, stage, RDTI estimate, growth)
//                     + vcBenchmark() for the dated sector multiples (§C.5)
//
// Every source is fail-safe: a timeout / error / missing table becomes a
// diagnostics entry and (where useful) a `missing` evidence row that tells
// the founder what to connect — never a failed report. Heavy modules are
// imported lazily so a unit test (and the free-tier report with no links)
// never loads scrapers or GitHub clients. All I/O is injectable via `deps`.

import type { CriterionKey } from "@/lib/evaluation-criteria";
import { CRITERION_KEYS } from "@/lib/evaluation-criteria";
import type { EvidenceRow, EvidenceStatus } from "@/lib/report-v2/schema";
import { loadProjectAbn, signalsForAbn, type ExternalEvidenceRow } from "@/lib/signals/external-signals";
import type { EvidenceSource, DimKey } from "./dimension-owners";
import { evidenceIdFor } from "./evidence-ids";
import type { GatherResults, ReportContext } from "./types";
import type { ValuationAskInput, VcValuationLike } from "./valuation-chapter";

// ── Types ───────────────────────────────────────────────────────────────────

type AICaller = (systemPrompt: string, userPrompt: string, maxTokens: number, taskClass?: "classify" | "report" | "synthesis") => Promise<string>;

type Row = Record<string, unknown>;

/** Minimal supabase query surface GATHER needs (a thenable builder; tests pass a stub). */
export interface GatherQuery {
  eq(col: string, v: unknown): GatherQuery;
  is(col: string, v: unknown): GatherQuery;
  order(col: string, opts?: { ascending?: boolean }): GatherQuery;
  limit(n: number): GatherQuery;
  maybeSingle(): Promise<{ data: Row | null; error: { message: string } | null }>;
  then<T = { data: Row[] | null; error: { message: string } | null }>(
    onfulfilled?: (v: { data: Row[] | null; error: { message: string } | null }) => T | PromiseLike<T>,
    onrejected?: (reason: unknown) => T | PromiseLike<T>,
  ): Promise<T>;
}

export interface GatherDb {
  from(table: string): {
    select(cols: string): GatherQuery;
    upsert(row: Row, opts?: { onConflict?: string }): Promise<{ error: { message: string } | null }>;
  };
}

export interface ConnectorSignalRow {
  provider: string;
  signal_key: string;
  signal_value_num: number | null;
  signal_value_text: string | null;
  captured_at: string | null;
}

export interface ConnectedRevenueLike {
  provider: "stripe" | "xero";
  mrrAud: number;
  capturedAt: string;
  priorMrrAud?: number | null;
  priorCapturedAt?: string | null;
  churnRate90dPct?: number | null;
  /** S-R5: Xero P&L gross margin (0–100) / opex for the window (unit economics, CGH / IRI). */
  grossMarginPct?: number | null;
  operatingExpensesAud?: number | null;
}

/** Parsed founder signals as the report needs them (connectors/linkedin-upload.ts FounderSignals). */
export interface FounderSignalsLike {
  source: string;
  profileUrl: string | null;
  founderName: string | null;
  headline: string | null;
  currentRole: string | null;
  yearsExperience: number | null;
  yearsInDomain: number | null;
  priorCompanies: string[];
  exits: number;
  teamSizeOnPage: number | null;
  confidence: number;
  parsedAt: string;
}

/** G14-S37: the founder execution rubric as the report needs it (founder/execution.ts founderExecutionSignals). */
export interface FounderExecutionLike {
  executionScore: number;
  rawScore: number;
  capped: boolean;
  capReason?: string;
  capLiftedBy?: "references_checked" | "linkedin_parser";
  structured: boolean;
  breakdown: Array<{ key: string; label: string; points: number; max: number; evidence: string; source: string }>;
  sources: string[];
  rubricVersion: string;
  /** founder_profiles.updated_at / execution_computed_at when known. */
  observedAt?: string | null;
}

/** Latest GA4 snapshot as the report needs it (oauth-ga4-signals.ts Ga4RichSignals + takenAt). */
export interface Ga4SnapshotLike {
  windowDays: number;
  sessions: number;
  newUsers: number;
  returningUsers: number;
  returningShare: number;
  conversions: number;
  conversionRate: number;
  engagedSessions: number;
  engagementRate: number;
  avgSessionDurationSec: number;
  topChannels: Array<{ channel: string; sessions: number; share: number }>;
  funnel: { acquisition: number; activation: number; retention: number; revenue: number; referral: number | null };
  takenAt: string | null;
}

export interface CapTableSummary {
  holders: number;
  issuedShares: number;
  poolShares: number;
  fullyDilutedShares: number;
  founderPct: number | null;
  esopPct: number | null;
  investorPct: number | null;
  vestingFlag: boolean;
}

export interface GrantsMatch {
  grants: Array<{ id: string; name: string; amountAud: number | null; deadline?: string; fit: number; url?: string }>;
  programs: Array<{ id: string; name: string; amountAud: number | null; deadline?: string; fit: number; url?: string }>;
  profileState: string | null;
  rdSpendAud: number | null;
}

export interface GatherDeps {
  researchMarket?: (input: { startupName: string; description: string; sector?: string }, callAI: AICaller) => Promise<unknown>;
  deepTechAudit?: (url: string) => Promise<Row>;
  auditGitHubRepo?: (repoFullName: string, accessToken: string) => Promise<Row>;
  /** Owner's GitHub connection token (last OAuth grant) — null → repo audit skipped. */
  githubToken?: (ownerUserId: string, projectId: string | null) => Promise<string | null>;
  /** `undefined` → getSupabaseAdmin(); `null` → no DB (cache + connectors skipped). */
  db?: GatherDb | null;
  loadConnectorSignals?: (db: GatherDb, ownerUserId: string, projectId: string | null) => Promise<ConnectorSignalRow[]>;
  loadConnectedRevenue?: (db: GatherDb, args: { userId: string; projectId: string | null; accountId: string | null }) => Promise<ConnectedRevenueLike[]>;
  loadCapTable?: (db: GatherDb, ownerUserId: string, projectId: string) => Promise<CapTableSummary | null>;
  /** S-R5: latest founder_signals row for the project (LinkedIn upload / URL) — FTV. */
  loadFounderSignals?: (db: GatherDb, projectId: string) => Promise<FounderSignalsLike | null>;
  /** G14-S37: the owner's founder_profiles row scored by the execution rubric (null = no profile) — FTV. */
  loadFounderExecution?: (db: GatherDb, ownerUserId: string, projectId: string | null) => Promise<FounderExecutionLike | null>;
  /** S-R5: latest ga4_signal_snapshots row for (owner, project) — TRE / MPC funnel + channel mix. */
  loadGa4Snapshot?: (db: GatherDb, ownerUserId: string, projectId: string | null) => Promise<Ga4SnapshotLike | null>;
  loadGrants?: (db: GatherDb, projectId: string, stage: number, industry: string | null) => Promise<GrantsMatch | null>;
  /** S40: register-derived evidence for the project's verified ABN (null ABN → []). */
  loadExternalSignals?: (db: GatherDb, projectId: string) => Promise<{ abn: string | null; rows: ExternalEvidenceRow[] }>;
  buildValuation?: (input: Row) => VcValuationLike;
  now?: () => number;
  /** Per-source hard timeout (default 20 s). */
  timeoutMs?: number;
  /** Remaining report deadline in ms — caps the research budget. */
  deadlineRemainingMs?: () => number;
  /** Audit cache TTL (default 24 h). */
  cacheTtlMs?: number;
}

export interface GatherOptions {
  /** app_users.id of the project OWNER (svi_signals / shareholders key). Defaults to the report's userId. */
  ownerUserId?: string | null;
  projectId?: string | null;
  /** True when a per-dimension re-run reuses stored criteria — the LLM market research is skipped. */
  skipResearch?: boolean;
  /** Wall-clock deadline (orchestrator) — sources are skipped once expired. */
  deadline?: { expired(): boolean };
  deps?: GatherDeps;
}

export interface GatherOutput {
  results: GatherResults;
  evidenceRows: EvidenceRow[];
  /** Inputs the valuation chapter builder needs (ask + revenue evidence ids). */
  valuation: { vc: VcValuationLike | null; ask: ValuationAskInput | null; revenueEvidenceIds: string[] };
}

export const GATHER_TIMEOUT_MS = 20_000;
export const GATHER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** LLM calls the market-research agent makes (trends + positioning) — counted in `estimatedCalls`. */
export const GATHER_RESEARCH_CALLS = 2;
/** Research = 2 sequential metered LLM calls; own budget (see run()). */
export const GATHER_RESEARCH_TIMEOUT_MS = 60_000;

// ── Helpers ─────────────────────────────────────────────────────────────────

export class GatherTimeoutError extends Error {
  constructor(readonly source: string, readonly ms: number) {
    super(`gather:${source} timed out after ${ms} ms`);
    this.name = "GatherTimeoutError";
  }
}

/** Race a source against the hard timeout; the loser keeps running but its result is dropped. */
export function withTimeout<T>(source: string, promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new GatherTimeoutError(source, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** Deterministic evidence id for a GATHER row (same minting as the W1–W3 catalogue). */
export function gatherEvidenceId(kind: string, key: string): string {
  return evidenceIdFor(`gather|${kind}|${key}`);
}

function row(kind: string, key: string, source: EvidenceSource, label: string, status: EvidenceStatus, dims: DimKey[], observedAt: string, value?: string): EvidenceRow {
  return { evidence_id: gatherEvidenceId(kind, key), source, label, status, observedAt, value, dims: [...dims] };
}

/** owner/repo from a GitHub URL or a bare "owner/repo". */
export function parseGitHubRepo(url: string): string | null {
  const t = url.trim();
  const m = t.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/?#].*)?$/i);
  if (m) return `${m[1]}/${m[2]}`;
  if (/^[\w.-]+\/[\w.-]+$/.test(t) && !t.includes("http")) return t;
  return null;
}

function firstLink(context: ReportContext, key: CriterionKey, predicate?: (url: string) => boolean): string | null {
  const links = context.criteriaData[key]?.links ?? [];
  const hit = links.find((l) => typeof l.url === "string" && l.url.trim() && (!predicate || predicate(l.url)));
  return hit?.url?.trim() ?? null;
}

function numbersOf(obj: Row | null | undefined, keys: string[]): Row {
  const out: Row = {};
  if (!obj) return out;
  keys.forEach((k) => {
    const v = k.split(".").reduce<unknown>((acc, part) => (acc && typeof acc === "object" ? (acc as Row)[part] : undefined), obj);
    if (typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length <= 60)) out[k.replace(/\./g, "_")] = v;
  });
  return out;
}

const STAGE_TO_CFO: Record<number, string> = { 0: "pre-seed", 1: "pre-seed", 2: "pre-seed", 3: "seed", 4: "seed", 5: "series-a", 6: "series-b", 7: "series-b" };

async function defaultLoadExternalSignals(db: GatherDb, projectId: string): Promise<{ abn: string | null; rows: ExternalEvidenceRow[] }> {
  const abn = await loadProjectAbn(db, projectId);
  if (!abn) return { abn: null, rows: [] };
  return { abn, rows: await signalsForAbn(abn, db) };
}

// ── In-memory audit cache (fallback when `tech_audits` is absent) ───────────

const memoryCache = new Map<string, { at: number; result: Row }>();

/** Test seam. */
export function resetGatherCache(): void {
  memoryCache.clear();
}

async function readAuditCache(db: GatherDb | null, kind: "tech" | "repo", url: string, ttlMs: number, now: number): Promise<Row | null> {
  const mem = memoryCache.get(`${kind}|${url}`);
  if (mem && now - mem.at < ttlMs) return mem.result;
  if (!db) return null;
  try {
    const { data } = await db.from("tech_audits").select("result, created_at").eq("url", url).eq("kind", kind).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!data) return null;
    const at = new Date(String(data.created_at ?? 0)).getTime();
    if (!Number.isFinite(at) || now - at >= ttlMs) return null;
    const result = data.result;
    return result && typeof result === "object" ? (result as Row) : null;
  } catch {
    return null; // table missing (migration pending) → memory cache only
  }
}

async function writeAuditCache(db: GatherDb | null, kind: "tech" | "repo", url: string, result: Row, now: number): Promise<void> {
  memoryCache.set(`${kind}|${url}`, { at: now, result });
  if (!db) return;
  try {
    await db.from("tech_audits").upsert({ url, kind, result, created_at: new Date(now).toISOString() }, { onConflict: "url,kind" });
  } catch {
    // Best effort — the in-memory cache still dedupes within the process.
  }
}

// ── Default I/O (lazy imports) ──────────────────────────────────────────────

async function defaultDb(): Promise<GatherDb | null> {
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  return getSupabaseAdmin() as unknown as GatherDb | null;
}

async function defaultGithubToken(ownerUserId: string, projectId: string | null): Promise<string | null> {
  try {
    const { getConnection } = await import("@/lib/oauth-connectors");
    const conn = (await getConnection(ownerUserId, "github", projectId)) ?? (projectId ? await getConnection(ownerUserId, "github", null) : null);
    if (conn?.accessToken) return conn.accessToken;
  } catch {
    // fall through
  }
  return process.env.GITHUB_TOKEN?.trim() || null;
}

async function defaultLoadConnectorSignals(db: GatherDb, ownerUserId: string, projectId: string | null): Promise<ConnectorSignalRow[]> {
  const q = db.from("svi_signals").select("provider, signal_key, signal_value_num, signal_value_text, captured_at").eq("user_id", ownerUserId);
  const scoped = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);
  const { data } = await scoped.order("captured_at", { ascending: false }).limit(60);
  return ((data ?? []) as Row[]).map((r) => ({
    provider: String(r.provider ?? ""),
    signal_key: String(r.signal_key ?? ""),
    signal_value_num: typeof r.signal_value_num === "number" ? r.signal_value_num : null,
    signal_value_text: typeof r.signal_value_text === "string" ? r.signal_value_text : null,
    captured_at: typeof r.captured_at === "string" ? r.captured_at : null,
  }));
}

async function defaultLoadConnectedRevenue(db: GatherDb, args: { userId: string; projectId: string | null; accountId: string | null }): Promise<ConnectedRevenueLike[]> {
  const { loadConnectedRevenueSignals } = await import("@/lib/connected-revenue");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return loadConnectedRevenueSignals(db as any, args);
}

async function defaultLoadFounderSignals(db: GatherDb, projectId: string): Promise<FounderSignalsLike | null> {
  const { loadLatestFounderSignals } = await import("@/lib/connectors/linkedin-upload");
  return loadLatestFounderSignals(db as unknown as Parameters<typeof loadLatestFounderSignals>[0], projectId);
}

async function defaultLoadFounderExecution(_db: GatherDb, ownerUserId: string, projectId: string | null): Promise<FounderExecutionLike | null> {
  const [{ loadFounderExecutionContext }, { founderExecutionSignals }] = await Promise.all([import("@/lib/founder/execution-load"), import("@/lib/founder/execution")]);
  const ctx = await loadFounderExecutionContext({ accountId: ownerUserId, projectId });
  if (!ctx.profile) return null;
  const exec = founderExecutionSignals(ctx.profile, { evaluatorFlags: ctx.evaluatorFlags, linkedin: ctx.linkedin, github: ctx.github });
  const p = ctx.profile as unknown as Row;
  return {
    executionScore: exec.executionScore,
    rawScore: exec.rawScore,
    capped: exec.capped,
    ...(exec.capReason ? { capReason: exec.capReason } : {}),
    ...(exec.capLiftedBy ? { capLiftedBy: exec.capLiftedBy } : {}),
    structured: exec.structured,
    breakdown: exec.breakdown,
    sources: exec.sources,
    rubricVersion: exec.rubricVersion,
    observedAt: typeof p.execution_computed_at === "string" ? p.execution_computed_at : typeof p.updated_at === "string" ? p.updated_at : null,
  };
}

async function defaultLoadGa4Snapshot(db: GatherDb, ownerUserId: string, projectId: string | null): Promise<Ga4SnapshotLike | null> {
  const { loadLatestGa4Snapshot } = await import("@/lib/oauth-ga4-signals");
  return loadLatestGa4Snapshot(db as unknown as Parameters<typeof loadLatestGa4Snapshot>[0], ownerUserId, projectId);
}

/** Equity register summary — shareholders + esop_pool for (owner, project). Exported for lib/svi/cap-table-input.ts (S-R5). */
export async function loadCapTableSummary(db: GatherDb, ownerUserId: string, projectId: string): Promise<CapTableSummary | null> {
  const [{ data: holders }, { data: pool }] = await Promise.all([
    db.from("shareholders").select("id, name, role, shares_held, vesting_months").eq("account_id", ownerUserId).eq("project_id", projectId),
    db.from("esop_pool").select("total_pool_shares, pool_pct").eq("account_id", ownerUserId).eq("project_id", projectId).maybeSingle(),
  ]);
  const rows = (holders ?? []) as Row[];
  const shares = (r: Row) => Math.max(0, Math.floor(Number(r.shares_held ?? 0)));
  const issued = rows.reduce((s, r) => s + shares(r), 0);
  // A register with no holders / no issued shares (e.g. only an ESOP pool
  // row) is not a cap table — it must not earn the CGH "register on file"
  // credit (W5 review).
  if (!rows.length || issued <= 0) return null;
  const poolShares = Math.max(0, Math.floor(Number((pool as Row | null)?.total_pool_shares ?? 0)));
  const fd = issued + poolShares;
  const isFounder = (r: Row) => /founder|director|ceo|cto|coo/i.test(String(r.role ?? ""));
  const founderShares = rows.filter(isFounder).reduce((s, r) => s + shares(r), 0);
  const investorShares = rows.filter((r) => /investor|angel|vc|fund|safe/i.test(String(r.role ?? ""))).reduce((s, r) => s + shares(r), 0);
  const pct = (n: number) => (fd > 0 ? Math.round((n / fd) * 1000) / 10 : null);
  return {
    holders: rows.length,
    issuedShares: issued,
    poolShares,
    fullyDilutedShares: fd,
    founderPct: pct(founderShares),
    esopPct: pct(poolShares),
    investorPct: pct(investorShares),
    vestingFlag: rows.some((r) => Number(r.vesting_months ?? 0) > 0),
  };
}

async function defaultLoadGrants(db: GatherDb, projectId: string, stage: number, industry: string | null): Promise<GrantsMatch | null> {
  const { data: profile } = await db.from("project_grant_profiles").select("state, city, entity_type, incorporated_at, turnover_aud, rd_spend_aud, headcount, founder_demographics, export_intent, prior_raise_aud").eq("project_id", projectId).maybeSingle();
  if (!profile || typeof profile.state !== "string" || !profile.state) return null;
  const [{ matchGrants, matchPrograms }, { listGrants, listPrograms }, { industryTagsFor, stageFromNumeric }] = await Promise.all([
    import("@/lib/agents/grant-advisor"),
    import("@/lib/funding/data"),
    import("@/lib/funding/workspace"),
  ]);
  const grantProfile = {
    state: profile.state as "NSW",
    city: typeof profile.city === "string" ? profile.city : null,
    entity_type: (profile.entity_type as "pty_ltd" | null) ?? "pty_ltd",
    incorporated_at: typeof profile.incorporated_at === "string" ? profile.incorporated_at : null,
    turnover_aud: typeof profile.turnover_aud === "number" ? profile.turnover_aud : null,
    rd_spend_aud: typeof profile.rd_spend_aud === "number" ? profile.rd_spend_aud : null,
    headcount: typeof profile.headcount === "number" ? profile.headcount : null,
    founder_demographics: Array.isArray(profile.founder_demographics) ? (profile.founder_demographics as string[]) : [],
    export_intent: typeof profile.export_intent === "boolean" ? profile.export_intent : null,
    prior_raise_aud: typeof profile.prior_raise_aud === "number" ? profile.prior_raise_aud : null,
    stage: stageFromNumeric(stage) ?? "mvp",
    industry_tags: industryTagsFor(industry),
  };
  const [grants, programs] = await Promise.all([listGrants({ state: grantProfile.state, excludeNonMatching: true }), listPrograms({})]);
  const g = matchGrants(grantProfile, grants).slice(0, 3);
  const p = matchPrograms(grantProfile, programs).slice(0, 3);
  return {
    grants: g.map((m) => ({ id: m.ref_id, name: m.name, amountAud: m.grant.amount_max_aud ?? null, deadline: m.next_window.closes_at ?? m.grant.closes_at ?? undefined, fit: Math.round(m.score), url: m.grant.official_url })),
    programs: p.map((m) => ({ id: m.ref_id, name: m.name, amountAud: m.program.funding_aud ?? null, deadline: m.next_window.closes_at ?? m.program.applications_close ?? undefined, fit: Math.round(m.score), url: m.program.official_url })),
    profileState: grantProfile.state,
    rdSpendAud: grantProfile.rd_spend_aud,
  };
}

async function defaultBuildValuation(input: Row): Promise<VcValuationLike> {
  const { buildVcValuationReport, vcBenchmark } = await import("@/lib/agents/cfo-valuation");
  const rep = buildVcValuationReport(input as Parameters<typeof buildVcValuationReport>[0]);
  const bm = vcBenchmark(String(input.sector ?? "default"));
  const dateMatch = bm.sourceLabel.match(/\d{4}-\d{2}(?:-\d{2})?/);
  return {
    blended: rep.blended,
    methods: rep.methods,
    scenarios: rep.scenarios,
    unitEconomics: rep.unitEconomics as unknown as Record<string, unknown>,
    sources: rep.sources,
    injection: { raiseAud: rep.injection.raiseAud, preMoneyAud: rep.injection.preMoneyAud },
    sectorMultiples: { sector: rep.sector, low: bm.arrMultiple.low, median: bm.arrMultiple.mid, high: bm.arrMultiple.high, sourceLabel: bm.sourceLabel, sourceDate: dateMatch ? dateMatch[0] : "" },
    inputs: input as VcValuationLike["inputs"],
  };
}

// ── The stage ───────────────────────────────────────────────────────────────

export async function gatherData(context: ReportContext, callAI: AICaller, opts: GatherOptions = {}): Promise<GatherOutput> {
  const deps = opts.deps ?? {};
  const now = deps.now ?? Date.now;
  const timeoutMs = deps.timeoutMs ?? GATHER_TIMEOUT_MS;
  const ttlMs = deps.cacheTtlMs ?? GATHER_CACHE_TTL_MS;
  const ownerUserId = opts.ownerUserId ?? context.userId;
  const projectId = opts.projectId ?? context.projectId ?? null;
  const results: GatherResults = { diagnostics: {} };
  const rows: EvidenceRow[] = [];
  const observed = new Date(now()).toISOString();
  const db = deps.db === undefined ? await defaultDb().catch(() => null) : deps.db;
  const expired = () => opts.deadline?.expired() === true;

  const diag = (source: string, status: NonNullable<GatherResults["diagnostics"]>[string]["status"], t0: number, note?: string) => {
    results.diagnostics![source] = { ms: now() - t0, status, ...(note ? { note } : {}) };
  };

  const run = async (source: string, fn: () => Promise<void>, budgetMs: number = timeoutMs): Promise<void> => {
    const t0 = now();
    if (expired()) {
      diag(source, "skipped", t0, "deadline");
      return;
    }
    try {
      await withTimeout(source, fn(), budgetMs);
    } catch (err) {
      const timeout = err instanceof GatherTimeoutError;
      diag(source, timeout ? "timeout" : "error", t0, err instanceof Error ? err.message : String(err));
    }
  };

  // ── 1. Market & competitive research (LLM, metered) ───────────────────
  const research = opts.skipResearch
    ? Promise.resolve(void diag("research", "skipped", now(), "partial re-run"))
    // Two sequential LLM calls (trends → positioning) routinely exceed the
    // 20 s connector budget; give research its own (W3 review), bounded by
    // whatever the report deadline has left.
    : run("research", async () => {
        const t0 = now();
        const rm = deps.researchMarket ?? (await import("@/lib/adk/agents")).researchMarket;
        const out = await rm({ startupName: context.startupName, description: context.rawText, sector: context.criteriaData.market?.textInput || undefined }, callAI);
        if (out) {
          results.competitiveResearch = out as Record<string, unknown>;
          rows.push(row("research", "market", "connector_other", "Market & competitive research (AI agent, this run)", "partial", ["mpc", "svm"], observed));
        }
        diag("research", "ok", t0);
      }, Math.max(timeoutMs, Math.min(GATHER_RESEARCH_TIMEOUT_MS, deps.deadlineRemainingMs?.() ?? GATHER_RESEARCH_TIMEOUT_MS)));

  // ── 2. Tech audit (website link, cached 24 h by URL) ──────────────────
  const websiteUrl = firstLink(context, "website");
  const tech = websiteUrl
    ? run("techAudit", async () => {
        const t0 = now();
        const cached = await readAuditCache(db, "tech", websiteUrl, ttlMs, now());
        let audit = cached;
        if (!audit) {
          const fn = deps.deepTechAudit ?? (await import("@/lib/rnd-input")).deepTechAudit;
          audit = (await fn(websiteUrl)) as unknown as Row;
          await writeAuditCache(db, "tech", websiteUrl, audit, now());
        }
        const auditedAt = typeof audit.auditedAt === "string" ? audit.auditedAt : observed;
        results.techAudit = {
          url: websiteUrl,
          status: "audited",
          cached: Boolean(cached),
          ...numbersOf(audit, ["overallGrade", "security.grade", "security.headerCount", "security.ssl.valid", "performance.grade", "performance.ttfbMs", "performance.compressed", "productMaturity.hasAuth", "productMaturity.hasPricing", "signalBoosts.ptdBoost", "signalBoosts.svmBoost", "signalBoosts.treBoost", "signalBoosts.lcoBoost"]),
        };
        const labels = Array.isArray(audit.evidenceLabels) ? (audit.evidenceLabels as string[]).slice(0, 3).join("; ") : "";
        rows.push(row("tech_audit", websiteUrl, "url", `Technical audit: ${websiteUrl}`, "evidenced", ["ptd", "svm", "lco"], auditedAt, `grade ${String(audit.overallGrade ?? "?")}; TTFB ${String((audit.performance as Row | undefined)?.ttfbMs ?? "?")} ms; security ${String((audit.security as Row | undefined)?.grade ?? "?")}${labels ? `; ${labels}` : ""}`));
        diag("techAudit", cached ? "cached" : "ok", t0);
      })
    : Promise.resolve(void diag("techAudit", "skipped", now(), "no website link"));

  // ── 3. Repo audit (github link + owner's connection token) ────────────
  const repoUrl = firstLink(context, "code_git", (u) => parseGitHubRepo(u) !== null);
  const repoFullName = repoUrl ? parseGitHubRepo(repoUrl) : null;
  const repo = repoFullName
    ? run("repoAudit", async () => {
        const t0 = now();
        const cached = await readAuditCache(db, "repo", repoFullName, ttlMs, now());
        let audit = cached;
        if (!audit) {
          const token = await (deps.githubToken ?? defaultGithubToken)(ownerUserId, projectId);
          if (!token) {
            rows.push(row("repo_audit", repoFullName, "github", `GitHub repository ${repoFullName}`, "missing", ["ptd", "ftv"], observed, "Connect GitHub (Settings → Connectors) to audit the repository — link only, not audited"));
            diag("repoAudit", "skipped", t0, "no GitHub token");
            return;
          }
          const fn = deps.auditGitHubRepo ?? (await import("@/lib/github-repo-audit")).auditGitHubRepo;
          audit = (await fn(repoFullName, token)) as unknown as Row;
          await writeAuditCache(db, "repo", repoFullName, audit, now());
        }
        const auditedAt = typeof audit.auditedAt === "string" ? audit.auditedAt : observed;
        results.repoAudit = {
          url: repoUrl,
          repoFullName,
          status: "audited",
          cached: Boolean(cached),
          ...numbersOf(audit, ["overallGrade", "activity.totalCommits", "activity.recentWeeklyAvg", "activity.contributors", "activity.isActivelyMaintained", "testing.hasTests", "testing.estimatedTestMaturity", "cicd.hasCI", "cicd.hasCD", "documentation.hasReadme", "signalBoosts.ptdBoost", "signalBoosts.ftvBoost", "signalBoosts.treBoost", "signalBoosts.svmBoost"]),
        };
        const act = (audit.activity as Row | undefined) ?? {};
        rows.push(row("repo_audit", repoFullName, "github", `GitHub repository audit: ${repoFullName}`, "evidenced", ["ptd", "ftv", "svm"], auditedAt, `grade ${String(audit.overallGrade ?? "?")}; ${String(act.totalCommits ?? "?")} commits; ${String(act.contributors ?? "?")} contributors; tests ${String((audit.testing as Row | undefined)?.hasTests ?? "?")}; CI ${String((audit.cicd as Row | undefined)?.hasCI ?? "?")}`));
        diag("repoAudit", cached ? "cached" : "ok", t0);
      })
    : Promise.resolve(void diag("repoAudit", "skipped", now(), repoUrl ? "not a GitHub URL" : "no repo link"));

  // ── 4. Connector pulls (last sync only) ───────────────────────────────
  let connectedRevenue: ConnectedRevenueLike[] = [];
  const connectors = db
    ? run("connectors", async () => {
        const t0 = now();
        const [signals, revenue] = await Promise.all([
          (deps.loadConnectorSignals ?? defaultLoadConnectorSignals)(db, ownerUserId, projectId).catch(() => [] as ConnectorSignalRow[]),
          (deps.loadConnectedRevenue ?? defaultLoadConnectedRevenue)(db, { userId: ownerUserId, projectId, accountId: context.accountId }).catch(() => [] as ConnectedRevenueLike[]),
        ]);
        connectedRevenue = revenue;
        const byProvider: Record<string, Row> = {};
        signals.forEach((s) => {
          if (!s.provider || !s.signal_key) return;
          const prov = (byProvider[s.provider] ??= {});
          prov[s.signal_key] = s.signal_value_num ?? s.signal_value_text ?? null;
          if (s.captured_at && (!prov.captured_at || String(prov.captured_at) < s.captured_at)) prov.captured_at = s.captured_at;
        });
        const dimsFor: Record<string, DimKey[]> = { stripe: ["tre", "iri"], ga4: ["tre", "mpc"], github: ["ptd", "ftv"], xero: ["tre", "cgh", "iri"] };
        Object.entries(byProvider).forEach(([prov, vals]) => {
          const capturedAt = typeof vals.captured_at === "string" ? vals.captured_at : observed;
          const src: EvidenceSource = prov === "stripe" || prov === "ga4" || prov === "github" || prov === "xero" ? prov : "connector_other";
          const value = Object.entries(vals)
            .filter(([k]) => k !== "captured_at")
            .map(([k, v]) => `${k} = ${String(v)}`)
            .join("; ");
          rows.push(row("connector", prov, src, `${prov.toUpperCase()} signals (last sync)`, "evidenced", dimsFor[prov] ?? ["tre"], capturedAt, value));
        });
        revenue.forEach((r) => {
          rows.push(row("connected_revenue", r.provider, r.provider, `${r.provider === "stripe" ? "Stripe" : "Xero"} revenue (last sync)`, "evidenced", ["tre", "iri", "cgh"], r.capturedAt, `mrr_aud = ${Math.round(r.mrrAud)}${typeof r.priorMrrAud === "number" ? `; prior_mrr_aud = ${Math.round(r.priorMrrAud)}` : ""}${typeof r.churnRate90dPct === "number" ? `; churn_90d_pct = ${r.churnRate90dPct}` : ""}${typeof r.grossMarginPct === "number" ? `; gross_margin_pct = ${r.grossMarginPct}` : ""}${typeof r.operatingExpensesAud === "number" ? `; opex_aud = ${Math.round(r.operatingExpensesAud)}` : ""}`));
        });
        results.connectorSignals = { providers: Object.keys(byProvider), signals: byProvider, revenue: revenue.map((r) => ({ provider: r.provider, mrrAud: Math.round(r.mrrAud), capturedAt: r.capturedAt, priorMrrAud: r.priorMrrAud ?? null, churnRate90dPct: r.churnRate90dPct ?? null, grossMarginPct: r.grossMarginPct ?? null, operatingExpensesAud: r.operatingExpensesAud ?? null })) };
        diag("connectors", "ok", t0);
      })
    : Promise.resolve(void diag("connectors", "skipped", now(), "no db"));

  // ── 5. Cap-table register ─────────────────────────────────────────────
  const capTable =
    db && projectId
      ? run("capTable", async () => {
          const t0 = now();
          const summary = await (deps.loadCapTable ?? loadCapTableSummary)(db, ownerUserId, projectId);
          if (summary) {
            results.capTable = { ...summary };
            rows.push(row("cap_table", projectId, "upload", "Cap-table register (shareholders + ESOP pool)", "evidenced", ["cgh", "iri", "lco"], observed, `holders = ${summary.holders}; founders_pct = ${summary.founderPct ?? "?"}; esop_pct = ${summary.esopPct ?? "?"}; investors_pct = ${summary.investorPct ?? "?"}; vesting = ${summary.vestingFlag}`));
          } else {
            rows.push(row("cap_table", projectId, "upload", "Cap-table register", "missing", ["cgh"], observed, "No register yet — add shareholders in /workspace/equity to evidence CGH"));
          }
          diag("capTable", "ok", t0);
        })
      : Promise.resolve(void diag("capTable", "skipped", now(), "no db / project"));

  // ── 5b. Founder signals (LinkedIn upload / URL → founder_signals) — S-R5
  const founder =
    db && projectId
      ? run("founderSignals", async () => {
          const t0 = now();
          const fs = await (deps.loadFounderSignals ?? defaultLoadFounderSignals)(db, projectId);
          if (fs) {
            results.founderSignals = {
              source: fs.source,
              profileUrl: fs.profileUrl,
              founderName: fs.founderName,
              headline: fs.headline,
              currentRole: fs.currentRole,
              yearsExperience: fs.yearsExperience,
              yearsInDomain: fs.yearsInDomain,
              priorCompanies: fs.priorCompanies.length,
              priorCompanyNames: fs.priorCompanies.slice(0, 6),
              exits: fs.exits,
              teamSizeOnPage: fs.teamSizeOnPage,
              confidence: fs.confidence,
              parsedAt: fs.parsedAt,
            };
            const urlOnly = fs.source === "linkedin_url";
            const label = urlOnly ? "LinkedIn profile URL (founder-supplied, not fetched)" : `LinkedIn ${fs.source === "linkedin_pdf" ? "PDF export" : "profile text"} — parsed founder signals`;
            const value = urlOnly
              ? `profile_url = ${fs.profileUrl ?? "?"}`
              : `years_experience = ${fs.yearsExperience ?? "?"}; years_in_domain = ${fs.yearsInDomain ?? "?"}; prior_companies = ${fs.priorCompanies.length}; exits = ${fs.exits}; team_size_on_page = ${fs.teamSizeOnPage ?? "?"}`;
            rows.push(row("founder_signals", projectId, "linkedin", label, urlOnly ? "partial" : "evidenced", ["ftv", "cgh"], fs.parsedAt, value));
          } else {
            rows.push(row("founder_signals", projectId, "linkedin", "Founder profile (LinkedIn export / URL)", "missing", ["ftv"], observed, "No founder profile yet — upload the LinkedIn PDF export or paste the profile URL in /workspace/evidence/founder"));
          }
          diag("founderSignals", "ok", t0);
        })
      : Promise.resolve(void diag("founderSignals", "skipped", now(), "no db / project"));

  // ── 5b′. Founder execution profile (founder_profiles → rubric) — G14-S37
  const founderExecution = db
    ? run("founderExecution", async () => {
        const t0 = now();
        const fe = await (deps.loadFounderExecution ?? defaultLoadFounderExecution)(db, ownerUserId, projectId);
        if (fe) {
          results.founderExecution = {
            executionScore: fe.executionScore,
            rawScore: fe.rawScore,
            capped: fe.capped,
            capReason: fe.capReason ?? null,
            capLiftedBy: fe.capLiftedBy ?? null,
            structured: fe.structured,
            breakdown: fe.breakdown.map((b) => ({ key: b.key, label: b.label, points: b.points, max: b.max, evidence: b.evidence, source: b.source })),
            sources: fe.sources,
            rubricVersion: fe.rubricVersion,
          };
          // Confidence: self_declared while every input is the founder's own
          // word; document_uploaded once an evaluator checked references or
          // the LinkedIn export confirmed it (the cap lifted).
          const confirmed = Boolean(fe.capLiftedBy);
          const label = `Founder execution profile — rubric v${fe.rubricVersion} (${confirmed ? fe.capLiftedBy === "references_checked" ? "references checked by an evaluator" : "confirmed by the LinkedIn export" : "self-declared"})`;
          const value = `execution_score = ${fe.executionScore}; raw = ${fe.rawScore}; capped = ${fe.capped}; confidence = ${confirmed ? "document_uploaded" : "self_declared"}; ${fe.breakdown.map((b) => `${b.key} = ${b.points}/${b.max}`).join("; ")}`;
          rows.push(row("founder_profile", projectId ?? ownerUserId, "founder_profile", label, fe.structured ? (confirmed ? "evidenced" : "partial") : "partial", ["ftv"], fe.observedAt ?? observed, value));
        } else {
          rows.push(row("founder_profile", projectId ?? ownerUserId, "founder_profile", "Founder execution profile", "missing", ["ftv"], observed, "No founder profile yet — fill the Execution tab in /workspace/settings/founder (exits, raises, roles, full-time %, GitHub)"));
        }
        diag("founderExecution", "ok", t0);
      })
    : Promise.resolve(void diag("founderExecution", "skipped", now(), "no db"));

  // ── 5c. GA4 90-day snapshot (AARRR funnel + channel mix) — S-R5 ──────
  const ga4 = db
    ? run("ga4", async () => {
        const t0 = now();
        const snap = await (deps.loadGa4Snapshot ?? defaultLoadGa4Snapshot)(db, ownerUserId, projectId);
        if (snap) {
          results.ga4 = {
            windowDays: snap.windowDays,
            sessions: snap.sessions,
            newUsers: snap.newUsers,
            returningUsers: snap.returningUsers,
            returningShare: snap.returningShare,
            conversions: snap.conversions,
            conversionRate: snap.conversionRate,
            engagedSessions: snap.engagedSessions,
            engagementRate: snap.engagementRate,
            avgSessionDurationSec: snap.avgSessionDurationSec,
            topChannels: snap.topChannels,
            funnel: snap.funnel,
            takenAt: snap.takenAt,
          };
          const channels = snap.topChannels.map((c) => `${c.channel} ${Math.round(c.share * 100)} %`).join(", ");
          rows.push(row("ga4_snapshot", projectId ?? ownerUserId, "ga4", `GA4 ${snap.windowDays}-day snapshot (AARRR funnel + channel mix)`, "evidenced", ["tre", "mpc"], snap.takenAt ?? observed, `sessions = ${snap.sessions}; engaged_sessions = ${snap.engagedSessions}; returning_users = ${snap.returningUsers}; conversions = ${snap.conversions}; returning_share = ${snap.returningShare}; engagement_rate = ${snap.engagementRate}${channels ? `; channels = ${channels}` : ""}`));
        }
        diag("ga4", snap ? "ok" : "skipped", t0, snap ? undefined : "no snapshot");
      })
    : Promise.resolve(void diag("ga4", "skipped", now(), "no db"));

  // ── 6. Grants / programs match ────────────────────────────────────────
  let grantsMatch: GrantsMatch | null = null;
  const grants =
    db && projectId
      ? run("grants", async () => {
          const t0 = now();
          grantsMatch = await (deps.loadGrants ?? defaultLoadGrants)(db, projectId, context.stage, context.sviAnalysis.sectorLabel ?? context.sviAnalysis.sector ?? null);
          if (grantsMatch) {
            results.grants = { state: grantsMatch.profileState, grants: grantsMatch.grants, programs: grantsMatch.programs, matched: grantsMatch.grants.length + grantsMatch.programs.length };
            const top = [...grantsMatch.grants, ...grantsMatch.programs].slice(0, 3).map((g) => `${g.name} (fit ${g.fit})`).join("; ");
            rows.push(row("grants", projectId, "connector_other", "Grants & programs match (grant-advisor)", "partial", ["iri", "cgh"], observed, top || "no open matches"));
          } else {
            rows.push(row("grants", projectId, "self_declared", "Grant profile", "missing", ["iri"], observed, "No grant profile — complete the /workspace/funding intake to match grants and programs"));
          }
          diag("grants", "ok", t0);
        })
      : Promise.resolve(void diag("grants", "skipped", now(), "no db / project"));

  // ── 6b. Open AU register signals for the verified ABN — S40 ───────────
  const external =
    db && projectId
      ? run("externalSignals", async () => {
          const t0 = now();
          const { abn, rows: ext } = await (deps.loadExternalSignals ?? defaultLoadExternalSignals)(db, projectId);
          if (!abn) {
            diag("externalSignals", "skipped", t0, "no verified ABN");
            return;
          }
          const byType: Record<string, number> = {};
          for (const r of ext) {
            byType[r.signal_type] = (byType[r.signal_type] ?? 0) + 1;
            // Only the schema fields travel into evidenceRows; provenance stays in results.externalSignals.
            rows.push({ evidence_id: r.evidence_id, source: r.source, label: r.label, status: r.status, observedAt: r.observedAt, value: r.value, dims: [...r.dims] });
          }
          results.externalSignals = {
            abn,
            count: ext.length,
            byType,
            origin: ext[0]?.origin ?? "connector",
            confidence: ext[0]?.confidence ?? "connected_source",
            rows: ext.map((r) => ({ evidence_id: r.evidence_id, signal_type: r.signal_type, source_id: r.source_id, source_url: r.source_url, as_of: r.as_of, match_confidence: r.match_confidence, dims: r.dims })),
          };
          diag("externalSignals", "ok", t0, ext.length ? undefined : "no register rows for ABN");
        })
      : Promise.resolve(void diag("externalSignals", "skipped", now(), "no db / project"));

  // ── 7. Evidence quality (deterministic) ───────────────────────────────
  const totalEvidence = Object.values(context.criteriaData).reduce((sum, d) => sum + d.files.length + d.links.length + (d.textInput ? 1 : 0), 0);
  results.evidenceQuality = {
    totalItems: totalEvidence,
    completedCriteria: Object.values(context.criteriaData).filter((d) => d.textInput.length > 0 || d.files.length > 0 || d.links.length > 0).length,
    totalCriteria: CRITERION_KEYS.length,
  };

  await Promise.allSettled([research, tech, repo, connectors, capTable, founder, founderExecution, ga4, grants, external]);

  // ── 8. Valuation inputs + CFO 5-method model (deterministic, after connectors)
  const signals = (context.sviAnalysis.signals ?? {}) as Partial<{ mrrAud: number; arrAud: number; raiseAskAud: number; statedCapAud: number; statedCapKind: ValuationAskInput["statedCapKind"]; hasVesting: boolean; hasShareholdersAgreement: boolean; esopAllocated: boolean; hasDataRoom: boolean; customerCount: number }>;
  const fresh = connectedRevenue
    .filter((r) => Number.isFinite(r.mrrAud) && r.mrrAud > 0 && now() - new Date(r.capturedAt).getTime() < 90 * 24 * 3600 * 1000)
    .sort((a, b) => (a.provider === "stripe" ? -1 : 1) - (b.provider === "stripe" ? -1 : 1));
  const revenueEvidenceIds: string[] = [];
  let mrrAud = 0;
  let revenueSource: string | null = null;
  let growthPct: number | undefined;
  if (fresh.length) {
    mrrAud = fresh[0].mrrAud;
    revenueSource = `${fresh[0].provider} (last sync ${fresh[0].capturedAt.slice(0, 10)})`;
    fresh.forEach((r) => revenueEvidenceIds.push(gatherEvidenceId("connected_revenue", r.provider)));
    const prior = fresh[0].priorMrrAud;
    if (typeof prior === "number" && prior > 0 && fresh[0].priorCapturedAt) {
      const months = Math.max(1, (new Date(fresh[0].capturedAt).getTime() - new Date(fresh[0].priorCapturedAt).getTime()) / (30 * 24 * 3600 * 1000));
      growthPct = Math.round((Math.pow(mrrAud / prior, 1 / months) - 1) * 1000) / 10;
    }
  } else if (typeof signals.mrrAud === "number" && signals.mrrAud > 0) {
    mrrAud = signals.mrrAud;
    revenueSource = "founder-stated";
  } else if (typeof signals.arrAud === "number" && signals.arrAud > 0) {
    mrrAud = signals.arrAud / 12;
    revenueSource = "founder-stated (ARR)";
  }
  const gm = grantsMatch as GrantsMatch | null;
  const rdti = gm?.rdSpendAud && gm.rdSpendAud > 0 ? Math.round(gm.rdSpendAud * 0.435) : 0;
  const cap = results.capTable as Partial<CapTableSummary> | undefined;
  const valuationInput: Row = {
    sector: context.sviAnalysis.sector ?? "default",
    stage: STAGE_TO_CFO[Math.max(0, Math.min(7, context.stage))] ?? "pre-seed",
    mrrAud: Math.round(mrrAud),
    arrAud: Math.round(mrrAud * 12),
    ...(typeof growthPct === "number" && Number.isFinite(growthPct) ? { monthlyGrowthRatePct: growthPct } : {}),
    ...(typeof signals.raiseAskAud === "number" ? { raiseAud: signals.raiseAskAud } : {}),
    ...(typeof signals.customerCount === "number" ? { customers: signals.customerCount } : {}),
    esicQualifies: false,
    estimatedRdtiRefundAud: rdti,
    hasFounderVesting: Boolean(cap?.vestingFlag ?? signals.hasVesting),
    hasShareholdersAgreement: Boolean(signals.hasShareholdersAgreement),
    hasEsopPool: Boolean((cap?.poolShares ?? 0) > 0 || signals.esopAllocated),
    hasDataRoom: Boolean(signals.hasDataRoom),
    revenueSource,
  };
  let vc: VcValuationLike | null = null;
  try {
    vc = deps.buildValuation ? deps.buildValuation(valuationInput) : await defaultBuildValuation(valuationInput);
    results.valuation = { inputs: valuationInput, blended: vc.blended, scenarios: vc.scenarios, sectorMultiples: vc.sectorMultiples ?? null };
    rows.push(row("valuation", "cfo", "connector_other", "CFO 5-method valuation (buildVcValuationReport)", mrrAud > 0 && revenueEvidenceIds.length ? "evidenced" : "partial", ["iri", "cgh", "tre"], observed, `consensus_mid_aud = ${Math.round(vc.blended.midAud)}; low = ${Math.round(vc.blended.lowAud)}; high = ${Math.round(vc.blended.highAud)}; mrr_aud = ${Math.round(mrrAud)}`));
    diag("valuation", "ok", now());
  } catch (err) {
    diag("valuation", "error", now(), err instanceof Error ? err.message : String(err));
  }
  const ask: ValuationAskInput | null =
    typeof signals.statedCapAud === "number" || typeof signals.raiseAskAud === "number"
      ? { statedCapAud: signals.statedCapAud ?? null, statedCapKind: signals.statedCapKind ?? null, raiseAud: signals.raiseAskAud ?? null }
      : null;

  return { results, evidenceRows: rows, valuation: { vc, ask, revenueEvidenceIds } };
}
