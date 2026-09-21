// Outcome proposals from existing signals (G21 P3-A).
//
//   deriveProposals(ctx)                 PURE — turns what BlockID already
//                                        holds about a project into
//                                        `proposed` outcomes, each with its
//                                        source and confidence:
//     grant_award external signal     → grant_success        (external_signal, 90)
//     funding_round external signal   → funding_raised       (external_signal, 90 — no
//                                        register feeds it today; the mapping is ready)
//     connector MRR ≥ +25 % vs the    → revenue_growth       (connector, 85)
//       snapshot ≥ 90 d earlier
//     stage rose between consecutive  → next_stage           (founder, 50 — the
//       svi_snapshots                    founder's own declaration, so the
//                                        owner confirms it)
//     a cohort assessment decided     → accelerator_selection (evaluator, 70)
//       "proceed"
//     a GitHub tag                    → product_release      (connector, 85)
//   Never auto-confirms. Anything already on the ledger for the same
//   (kind, source, day) — proposed, confirmed OR rejected — is skipped, so a
//   rejected proposal is not re-proposed on the next run.
//
//   proposeOutcomesFromSignals(projectId) loads the inputs (register signals
//   by ABN, connector_snapshots, svi_snapshots, cohort decisions, optional
//   GitHub tags through an injected fetcher) and inserts with
//   ignoreDuplicates on the 0427 unique key.
//
//   runOutcomeSignals()                  the cron body: every project with a
//                                        snapshot in the last 180 d, capped
//                                        500 / run, audit row per insert.

import { pickPriorSnapshot, snapshotMrrAud, type ConnectorSnapshotRow } from "@/lib/connectors/snapshots";
import { DEFAULT_CONFIDENCE, type OutcomeKind, type OutcomeRow, type OutcomeSource } from "./types";

export const REVENUE_GROWTH_MIN_PCT = 25;
export const SIGNAL_LOOKBACK_DAYS = 180;
export const OUTCOME_SIGNALS_RUN_CAP = 500;
/** GitHub tag lookups per cron run (unauthenticated GitHub allows 60 req/h). */
export const GITHUB_TAG_LOOKUPS_PER_RUN = 30;

export interface ExternalSignalLike {
  signal_type: string;
  as_of: string;
  value: Record<string, unknown>;
  source_url?: string | null;
}

export interface SnapshotStageLike {
  snapshot_date: string;
  stage: number | null;
}

export interface ProceedDecisionLike {
  evaluation_id: string;
  decided_at: string;
  program: string | null;
}

export interface GithubTagLike {
  name: string;
  /** Commit / tag date when known. */
  date: string | null;
  repo: string;
  url?: string | null;
}

export interface ProposalContext {
  projectId: string;
  now: Date;
  externalSignals: readonly ExternalSignalLike[];
  connectorHistory: readonly Pick<ConnectorSnapshotRow, "provider" | "taken_at" | "metrics">[];
  snapshots: readonly SnapshotStageLike[];
  proceedDecisions: readonly ProceedDecisionLike[];
  githubTags: readonly GithubTagLike[];
  existing: readonly Pick<OutcomeRow, "kind" | "observed_at" | "source">[];
}

export interface ProposedOutcome {
  project_id: string;
  kind: OutcomeKind;
  observed_at: string;
  value: Record<string, unknown>;
  source: OutcomeSource;
  confidence: number;
  note: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : iso.slice(0, 10);
}

function isoAt(v: string): string | null {
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null;
}

/** Pure — see the module header. Deterministic order: by observed_at ascending, then kind. */
export function deriveProposals(ctx: ProposalContext): ProposedOutcome[] {
  const seen = new Set(ctx.existing.map((e) => `${e.kind}|${e.source}|${dayKey(e.observed_at)}`));
  const out: ProposedOutcome[] = [];
  const push = (p: Omit<ProposedOutcome, "project_id">) => {
    const key = `${p.kind}|${p.source}|${dayKey(p.observed_at)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ project_id: ctx.projectId, ...p });
  };

  // ── Public registers ────────────────────────────────────────────────────
  for (const s of ctx.externalSignals) {
    const at = isoAt(s.as_of);
    if (!at) continue;
    if (s.signal_type === "grant_award") {
      const value: Record<string, unknown> = {};
      const program = str(s.value.program);
      const agency = str(s.value.agency);
      const amount = num(s.value.amount_aud);
      if (program) value.program = program;
      if (agency) value.agency = agency;
      if (amount !== null) value.amount_aud = amount;
      if (s.source_url) value.source_url = s.source_url;
      if (!value.program) value.program = str(s.value.activity) ?? "Grant";
      push({ kind: "grant_success", observed_at: at, value, source: "external_signal", confidence: DEFAULT_CONFIDENCE.external_signal, note: "Proposed from the GrantConnect register entry matched on ABN." });
    } else if (s.signal_type === "funding_round") {
      const value: Record<string, unknown> = {};
      const amount = num(s.value.amount_aud);
      const round = str(s.value.round);
      if (amount !== null) value.amount_aud = amount;
      if (round) value.round = round;
      if (s.source_url) value.source_url = s.source_url;
      if (amount === null) continue;
      push({ kind: "funding_raised", observed_at: at, value, source: "external_signal", confidence: DEFAULT_CONFIDENCE.external_signal, note: "Proposed from a funding announcement in the external-signals feed." });
    }
  }

  // ── Connector revenue deltas (≥ +25 % vs the snapshot ≥ 90 d earlier) ───
  for (const provider of ["stripe", "xero"] as const) {
    const history = ctx.connectorHistory.filter((r) => r.provider === provider).slice().sort((a, b) => Date.parse(b.taken_at) - Date.parse(a.taken_at));
    const latest = history[0];
    if (!latest) continue;
    const prior = pickPriorSnapshot(latest, history.slice(1));
    if (!prior) continue;
    // Review P2 (2026-09-21): a Xero window change (3 → 12 months) moves the
    // derived MRR without a revenue change — compare like with like only.
    const latestWindow = (latest.metrics ?? {}).windowMonths ?? null;
    const priorWindow = (prior.metrics ?? {}).windowMonths ?? null;
    if (provider === "xero" && latestWindow !== priorWindow) continue;
    // Review P2: one growth event → one proposal. Weekly resyncs re-derive
    // the same growth against the same baseline; skip when any existing
    // revenue_growth row (any status) already sits inside this baseline → latest window.
    const baselineMs = Date.parse(prior.taken_at);
    const latestMs = Date.parse(latest.taken_at);
    const alreadyProposed = ctx.existing.some((e) => {
      if (e.kind !== "revenue_growth") return false;
      const t = Date.parse(e.observed_at);
      return Number.isFinite(t) && t >= baselineMs && t <= latestMs + DAY_MS;
    });
    if (alreadyProposed) continue;
    const to = snapshotMrrAud(latest);
    const from = snapshotMrrAud(prior);
    if (to === null || from === null || from <= 0) continue;
    const growthPct = Math.round(((to - from) / from) * 1000) / 10;
    if (growthPct < REVENUE_GROWTH_MIN_PCT) continue;
    const at = isoAt(latest.taken_at);
    if (!at) continue;
    push({
      kind: "revenue_growth",
      observed_at: at,
      value: { mrr_from_aud: Math.round(from), mrr_to_aud: Math.round(to), growth_pct: growthPct, provider, baseline_at: prior.taken_at },
      source: "connector",
      confidence: DEFAULT_CONFIDENCE.connector,
      note: `Proposed from the ${provider} connector: MRR ${Math.round(from)} → ${Math.round(to)} A$ over ${Math.round((Date.parse(latest.taken_at) - Date.parse(prior.taken_at)) / DAY_MS)} days.`,
    });
  }

  // ── Stage changes between consecutive snapshots ─────────────────────────
  const snaps = ctx.snapshots
    .filter((s) => typeof s.stage === "number" && Number.isFinite(s.stage))
    .slice()
    .sort((a, b) => Date.parse(a.snapshot_date) - Date.parse(b.snapshot_date));
  for (let i = 1; i < snaps.length; i += 1) {
    const prev = snaps[i - 1]!;
    const cur = snaps[i]!;
    if ((cur.stage as number) <= (prev.stage as number)) continue;
    const at = isoAt(cur.snapshot_date);
    if (!at) continue;
    push({
      kind: "next_stage",
      observed_at: at,
      value: { from_stage: prev.stage, to_stage: cur.stage },
      source: "founder",
      confidence: 50,
      note: "Proposed from the stage recorded on the startup's own profile between two snapshots.",
    });
  }

  // ── Cohort decisions: proceed ───────────────────────────────────────────
  for (const d of ctx.proceedDecisions) {
    const at = isoAt(d.decided_at);
    if (!at) continue;
    const value: Record<string, unknown> = { program: d.program ?? "BlockID Cohort", evaluation_id: d.evaluation_id };
    push({ kind: "accelerator_selection", observed_at: at, value, source: "evaluator", confidence: DEFAULT_CONFIDENCE.evaluator, note: "Proposed from a cohort decision of \"proceed\" recorded by the program's reviewer." });
  }

  // ── GitHub tags ─────────────────────────────────────────────────────────
  for (const t of ctx.githubTags) {
    const at = t.date ? isoAt(t.date) : null;
    if (!at) continue;
    const value: Record<string, unknown> = { tag: t.name.slice(0, 100), repo: t.repo.slice(0, 200) };
    if (t.url) value.source_url = t.url;
    push({ kind: "product_release", observed_at: at, value, source: "connector", confidence: DEFAULT_CONFIDENCE.connector, note: "Proposed from a tag on the linked GitHub repository." });
  }

  return out.sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at) || a.kind.localeCompare(b.kind));
}

// ── Loader + writer ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ProposalsDb = { from(table: string): any };

export interface ProposalsDeps {
  now?: () => Date;
  /** Register signals for an ABN (defaults to lib/signals/external-signals). */
  loadSignals?: (db: ProposalsDb, abn: string | null) => Promise<ExternalSignalLike[]>;
  loadAbn?: (db: ProposalsDb, projectId: string) => Promise<string | null>;
  /** Tags for `owner/repo`; absent → no product_release proposals. */
  fetchTags?: (owner: string, repo: string) => Promise<GithubTagLike[]>;
  /** Audit writer for `outcome.proposed` rows (absent → no audit rows, e.g. dry runs). */
  audit?: (params: { user_id: string | null; actor: string; action: string; resource_type: string; resource_id: string | null; detail: Record<string, unknown> }) => Promise<unknown>;
}

export interface ProposeResult {
  projectId: string;
  derived: number;
  inserted: number;
  skipped_existing: number;
  warnings: string[];
}

function parseGithubUrl(input: string | null | undefined): { owner: string; repo: string } | null {
  if (!input) return null;
  const m = input.trim().match(/^https?:\/\/(?:www\.)?github\.com\/([^\s/]+)\/([^\s/?#]+)(?:[/?#].*)?$/i);
  return m ? { owner: m[1]!, repo: m[2]!.replace(/\.git$/, "") } : null;
}

async function defaultLoadSignals(db: ProposalsDb, abn: string | null): Promise<ExternalSignalLike[]> {
  if (!abn) return [];
  const { loadSignalsForAbn } = await import("@/lib/signals/external-signals");
  const rows = await loadSignalsForAbn(db, abn, 200);
  return rows.map((r) => ({ signal_type: String(r.signal_type), as_of: r.as_of, value: r.value ?? {}, source_url: r.source_url ?? null }));
}

async function defaultLoadAbn(db: ProposalsDb, projectId: string): Promise<string | null> {
  const { loadProjectAbn } = await import("@/lib/signals/external-signals");
  return loadProjectAbn(db, projectId);
}

/** Load the context for one project. Every read is fail-soft (a missing table = no signals of that kind). */
export async function loadProposalContext(db: ProposalsDb, projectId: string, deps: ProposalsDeps = {}): Promise<{ ctx: ProposalContext; warnings: string[] }> {
  const now = (deps.now ?? (() => new Date()))();
  const warnings: string[] = [];
  const safe = async <T,>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      warnings.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
      return fallback;
    }
  };

  const project = await safe(
    "projects",
    async () => {
      const { data } = await db.from("projects").select("id, github_url").eq("id", projectId).maybeSingle();
      return (data ?? null) as { id: string; github_url: string | null } | null;
    },
    null,
  );

  const [abn, connectorHistory, snapshots, decisions, existing] = await Promise.all([
    safe("abn", () => (deps.loadAbn ?? defaultLoadAbn)(db, projectId), null),
    safe(
      "connector_snapshots",
      async () => {
        const { data } = await db.from("connector_snapshots").select("provider, taken_at, metrics").eq("project_id", projectId).order("taken_at", { ascending: false }).limit(60);
        return (data ?? []) as Array<Pick<ConnectorSnapshotRow, "provider" | "taken_at" | "metrics">>;
      },
      [],
    ),
    safe(
      "svi_snapshots",
      async () => {
        const { data } = await db.from("svi_snapshots").select("snapshot_date, stage").eq("project_id", projectId).order("snapshot_date", { ascending: true }).limit(400);
        return (data ?? []) as SnapshotStageLike[];
      },
      [],
    ),
    safe(
      "evaluation_assessments",
      async () => {
        const { data } = await db.from("evaluation_assessments").select("evaluation_id, submitted_at, updated_at").eq("project_id", projectId).eq("status", "submitted").eq("decision", "proceed").limit(50);
        const rows = (data ?? []) as Array<{ evaluation_id: string; submitted_at: string | null; updated_at: string }>;
        if (rows.length === 0) return [] as ProceedDecisionLike[];
        const evalIds = rows.map((r) => r.evaluation_id);
        const { data: items } = await db.from("evaluation_batch_items").select("evaluation_id, batch_id").in("evaluation_id", evalIds).limit(100);
        const itemRows = (items ?? []) as Array<{ evaluation_id: string; batch_id: string }>;
        if (itemRows.length === 0) return [] as ProceedDecisionLike[];
        const batchIds = Array.from(new Set(itemRows.map((i) => i.batch_id)));
        const { data: batches } = await db.from("evaluation_batches").select("id, name").in("id", batchIds).limit(100);
        const nameOf = new Map(((batches ?? []) as Array<{ id: string; name: string | null }>).map((b) => [b.id, b.name]));
        const batchOf = new Map(itemRows.map((i) => [i.evaluation_id, i.batch_id]));
        return rows
          .filter((r) => batchOf.has(r.evaluation_id))
          .map((r) => ({ evaluation_id: r.evaluation_id, decided_at: r.submitted_at ?? r.updated_at, program: nameOf.get(batchOf.get(r.evaluation_id)!) ?? null }));
      },
      [],
    ),
    safe(
      "startup_outcomes",
      async () => {
        const { data } = await db.from("startup_outcomes").select("kind, observed_at, source").eq("project_id", projectId).limit(500);
        return (data ?? []) as Array<Pick<OutcomeRow, "kind" | "observed_at" | "source">>;
      },
      [],
    ),
  ]);

  const externalSignals = await safe("external_signals", () => (deps.loadSignals ?? defaultLoadSignals)(db, abn), []);

  let githubTags: GithubTagLike[] = [];
  const gh = parseGithubUrl(project?.github_url);
  if (gh && deps.fetchTags) githubTags = await safe("github_tags", () => deps.fetchTags!(gh.owner, gh.repo), []);

  return { ctx: { projectId, now, externalSignals, connectorHistory, snapshots, proceedDecisions: decisions, githubTags, existing }, warnings };
}

/** Derive + insert (ignoreDuplicates on the 0427 unique key) + audit. Never confirms. */
export async function proposeOutcomesFromSignals(db: ProposalsDb, projectId: string, deps: ProposalsDeps = {}): Promise<ProposeResult> {
  const { ctx, warnings } = await loadProposalContext(db, projectId, deps);
  const proposals = deriveProposals(ctx);
  const result: ProposeResult = { projectId, derived: proposals.length, inserted: 0, skipped_existing: 0, warnings };
  if (proposals.length === 0) return result;

  const rows = proposals.map((p) => ({ ...p, status: "proposed", recorded_by: null }));
  const { data, error } = await db.from("startup_outcomes").upsert(rows, { onConflict: "project_id,kind,observed_at,source", ignoreDuplicates: true }).select("id, kind, source, observed_at");
  if (error) {
    warnings.push(`startup_outcomes upsert: ${(error as { message?: string }).message ?? "failed"}`);
    return result;
  }
  const inserted = (data ?? []) as Array<{ id: string; kind: string; source: string; observed_at: string }>;
  result.inserted = inserted.length;
  result.skipped_existing = proposals.length - inserted.length;
  if (deps.audit) {
    for (const r of inserted) {
      try {
        await deps.audit({ user_id: null, actor: "cron", action: "outcome.proposed", resource_type: "startup_outcome", resource_id: r.id, detail: { project_id: projectId, kind: r.kind, source: r.source, observed_at: r.observed_at } });
      } catch (err) {
        warnings.push(`audit outcome.proposed ${r.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
  return result;
}

export interface RunOutcomeSignalsResult {
  ok: true;
  at: string;
  projects: number;
  derived: number;
  inserted: number;
  capped: boolean;
  warnings: string[];
}

/** Projects with a snapshot in the last `SIGNAL_LOOKBACK_DAYS` days (distinct, capped). */
export async function listRecentlySnapshottedProjects(db: ProposalsDb, now: Date, cap = OUTCOME_SIGNALS_RUN_CAP): Promise<{ ids: string[]; capped: boolean }> {
  const cutoff = new Date(now.getTime() - SIGNAL_LOOKBACK_DAYS * DAY_MS).toISOString().slice(0, 10);
  const { data, error } = await db.from("svi_snapshots").select("project_id").gte("snapshot_date", cutoff).not("project_id", "is", null).order("snapshot_date", { ascending: false }).limit(cap * 8);
  if (error) throw new Error((error as { message?: string }).message ?? "svi_snapshots query failed");
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const r of (data ?? []) as Array<{ project_id: string | null }>) {
    if (!r.project_id || seen.has(r.project_id)) continue;
    seen.add(r.project_id);
    ids.push(r.project_id);
    if (ids.length >= cap) break;
  }
  return { ids, capped: seen.size >= cap && ((data ?? []).length as number) >= cap * 8 };
}

export async function runOutcomeSignals(db: ProposalsDb, deps: ProposalsDeps & { cap?: number } = {}): Promise<RunOutcomeSignalsResult> {
  const now = (deps.now ?? (() => new Date()))();
  const { ids, capped } = await listRecentlySnapshottedProjects(db, now, deps.cap ?? OUTCOME_SIGNALS_RUN_CAP);
  const result: RunOutcomeSignalsResult = { ok: true, at: now.toISOString(), projects: ids.length, derived: 0, inserted: 0, capped, warnings: [] };
  let tagLookups = 0;
  for (const id of ids) {
    const perProject: ProposalsDeps = { ...deps, now: () => now };
    if (deps.fetchTags) {
      // Bound GitHub lookups per run; the fetcher is dropped once the budget is spent.
      perProject.fetchTags = async (owner, repo) => {
        if (tagLookups >= GITHUB_TAG_LOOKUPS_PER_RUN) return [];
        tagLookups += 1;
        return deps.fetchTags!(owner, repo);
      };
    }
    try {
      const r = await proposeOutcomesFromSignals(db, id, perProject);
      result.derived += r.derived;
      result.inserted += r.inserted;
      for (const w of r.warnings) result.warnings.push(`${id}: ${w}`);
    } catch (err) {
      result.warnings.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (result.warnings.length > 50) result.warnings = [...result.warnings.slice(0, 50), `… ${result.warnings.length - 50} more`];
  return result;
}

/** Public GitHub tags for a repository (5 newest, dated through the commit). Used by the cron only when GITHUB_TOKEN is set. */
export async function fetchGithubTags(owner: string, repo: string, token?: string): Promise<GithubTagLike[]> {
  const headers: Record<string, string> = { "User-Agent": "BlockID.au-evidence-bot", Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tags?per_page=5`, { headers, cache: "no-store" });
  if (!res.ok) return [];
  const tags = (await res.json()) as Array<{ name?: string; commit?: { sha?: string; url?: string } }>;
  const out: GithubTagLike[] = [];
  for (const t of tags.slice(0, 5)) {
    if (!t.name) continue;
    let date: string | null = null;
    if (t.commit?.url) {
      try {
        const c = await fetch(t.commit.url, { headers, cache: "no-store" });
        if (c.ok) {
          const j = (await c.json()) as { commit?: { committer?: { date?: string } } };
          date = j.commit?.committer?.date ?? null;
        }
      } catch {
        date = null;
      }
    }
    out.push({ name: t.name, date, repo: `${owner}/${repo}`, url: `https://github.com/${owner}/${repo}/releases/tag/${encodeURIComponent(t.name)}` });
  }
  return out;
}
